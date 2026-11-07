/* Paneles Plan y Tareas en segundo plano (Claude Code Desktop los lista en el ⋮ de la barra de la sesión
   solo cuando hay algo que enseñar).
   - Plan: la lista de tareas de la sesión elegida (la misma que reconstruye services/claude/plan.js).
   - Tareas en segundo plano: subagentes y órdenes que siguen tras devolver su resultado. Un clic enseña su
     salida. Detener una tarea suelta no se puede desde fuera de Claude Code: el botón lo dice; las sesiones
     que lanzó Rastro se pueden detener enteras. Los flujos dinámicos no llegan a Rastro: se dice. */
(function (RA) {
  'use strict';

  const ui = RA.ui, el = ui.el, $ = ui.$, D = RA.datos, C = RA.calc;
  const abiertas = new Set();        // tareas desplegadas: 'e:<evento>' o 'a:<agente>'
  const sesion = () => RA.vistas && RA.vistas.actual();
  const MOTIVO_PARAR = 'Claude Code no deja detener una tarea suelta desde fuera de la sesión. Puedes detener la sesión entera si la lanzó Rastro, o pedírselo en la conversación.';

  // ---------- Plan ----------
  // La lista del Plan de una sesión (la usan este panel y la sección Tareas del panel derecho de Chat).
  function planLista(s) {
    const p = s && s.plan && s.plan.total ? s.plan : null;
    if (!p) return null;
    const vivo = s.est === 'curso';
    return el('ol', { class: 'plan-lista', 'aria-label': 'Tareas del plan' }, (p.tareas || []).map(x => {
      const ahora = x.est === 'in_progress';
      return el('li', { class: 'plan-t ' + (x.est === 'completed' ? 'hecha' : ahora ? 'ahora' : 'pend') + (ahora && !vivo ? ' quieta' : ''), 'aria-current': ahora && vivo ? 'step' : null }, [
        el('span', { class: 'plan-pt', role: 'img', 'aria-label': x.est === 'completed' ? 'Hecha' : ahora ? 'En curso' : 'Pendiente' }),
        el('span', {}, [x.asunto, ahora && p.actual && p.actual !== x.asunto ? el('span', { class: 'plan-sub' }, p.actual) : null])
      ]);
    }));
  }
  function pintarPlan() {
    const caja = $('#panel-plan');
    if (!caja) return;
    const s = sesion(), lista = planLista(s);
    if (!lista) return ui.pintar(caja, el('p', { class: 'note' }, s ? 'Esta sesión no tiene lista de tareas ahora mismo.' : 'Sin sesión elegida.'));
    const p = s.plan;
    ui.pintar(caja, [
      el('p', { class: 'row between plan-cab' }, [el('span', { class: 'label' }, s.nombre), el('span', { class: 'plan-cuenta', 'aria-label': p.hechas + ' de ' + p.total + ' tareas hechas' }, p.hechas + '/' + p.total)]),
      lista
    ]);
  }

  // ---------- Tareas en segundo plano ----------
  function tareas(s) {
    const subs = (s.agentes || []).filter(a => a.padre).map(a => ({ clave: 'a:' + a.id, tipo: 'Subagente', nombre: a.cod + ' · ' + (a.tipo || 'subagente'), est: a.est, a: a }));
    const fondo = (s.eventos || []).filter(e => e.fondo).map(e => ({ clave: 'e:' + e.id, tipo: 'Orden en segundo plano', nombre: e.h + ' · ' + (e.res || ''), est: e.est, e: e }));
    return subs.concat(fondo).sort((x, y) => (y.est === 'curso') - (x.est === 'curso'));
  }

  function salida(s, t) {
    if (t.e) {
      const e = t.e;
      if (!e.cargado && D.detalle && !e.cargando) {
        e.cargando = true;
        Promise.resolve(D.detalle(s.id, e.id)).then(d => { Object.assign(e, d || {}, { cargado: true, cargando: false }); pintarTareas(); }, () => { e.cargando = false; });
      }
      const txt = e.salida || e.sal || e.err || '';
      return e.cargando && !txt ? el('p', { class: 'label' }, 'Cargando') : el('pre', { class: 'dato tar-salida', tabindex: '0', 'aria-label': 'Salida de ' + t.nombre }, txt ? String(txt).slice(-6000) : 'Todavía no hay salida.');
    }
    // Subagente: sus últimas llamadas.
    const evs = (s.eventos || []).filter(e => e.ag === t.a.id).slice(-8);
    return evs.length ? el('ul', { class: 'tar-pasos' }, evs.map(e => el('li', { class: 'mono' }, [ui.estado(e.est), ' ', e.h + ' · ' + (e.res || '')]))) : el('p', { class: 'note' }, 'Este subagente todavía no ha hecho ninguna llamada.');
  }

  function pintarTareas() {
    const caja = $('#panel-tareas');
    if (!caja) return;
    const s = sesion();
    if (!s) return ui.pintar(caja, el('p', { class: 'note' }, 'Sin sesión elegida.'));
    const lista = tareas(s);
    const puedeSesion = s.origen === 'app' && (s.est === 'curso' || s.vivo);
    ui.pintar(caja, [
      lista.length ? el('ul', { class: 'tar-lista', 'aria-label': 'Tareas en segundo plano de ' + s.nombre }, lista.map(t => {
        const abierta = abiertas.has(t.clave);
        return el('li', { class: 'tar' }, [
          el('div', { class: 'tar-fila' }, [
            el('button', { type: 'button', class: 'tar-b', 'aria-expanded': String(abierta), onclick: () => { if (abierta) abiertas.delete(t.clave); else abiertas.add(t.clave); pintarTareas(); caja.querySelector('[data-clave="' + CSS.escape(t.clave) + '"]').focus(); }, 'data-clave': t.clave }, [
              ui.estado(t.est), el('span', { class: 'crece' }, [el('span', { class: 'label tar-tipo' }, t.tipo), el('span', { class: 'tar-nombre mono' }, t.nombre)]), ui.galon()
            ]),
            el('button', { type: 'button', class: 'btn btn-small', 'aria-disabled': 'true', title: MOTIVO_PARAR, onclick: () => ui.decir(MOTIVO_PARAR, 'atencion') }, 'Detener')
          ]),
          abierta ? el('div', { class: 'tar-detalle' }, salida(s, t)) : null
        ]);
      })) : el('p', { class: 'note' }, 'Esta sesión no tiene trabajo en segundo plano ahora mismo.'),
      el('p', { class: 'note' }, 'Los flujos dinámicos de Claude Code no llegan a Rastro: no aparecen en esta lista.'),
      puedeSesion ? ui.armar(el('button', { type: 'button', class: 'btn btn-small', id: 'tar-detener-sesion' }, 'Detener la sesión'), '¿Detener ' + s.nombre + '?', () => D.detener && D.detener(s.id)) : null
    ]);
  }

  function montarTodo() {
    if (!RA.paneles) return;
    RA.paneles.registrar('plan', { montar: c => { c.appendChild(el('div', { id: 'panel-plan', class: 'panel-plan' })); pintarPlan(); }, pintar: pintarPlan });
    RA.paneles.registrar('tareas', { montar: c => { c.appendChild(el('div', { id: 'panel-tareas', class: 'panel-tareas' })); pintarTareas(); }, pintar: () => { const c = $('#panel-tareas'); if (!c || !c.contains(document.activeElement) || !document.activeElement.classList.contains('tar-salida')) pintarTareas(); } });
  }
  RA.tareasPanel = { tareas: tareas, planLista: planLista };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montarTodo); else montarTodo();
})(window.RA = window.RA || {});
