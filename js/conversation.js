/* Conversación de Chat (diseño 1a) y tarjeta Plan del panel derecho. Todo sale de la sesión real:
   - cada mensaje tuyo (s.prompts) va en su burbuja y, debajo, las acciones que hizo el agente principal
     hasta el mensaje siguiente, en una tarjeta con una fila por acción (glifo, verbo, objetivo, duración
     o cambio de líneas, y punto de estado);
   - el Plan es la lista de tareas de la sesión (TodoWrite, TaskCreate/TaskUpdate o el plan de la app):
     hechas tachadas, la de ahora en rojo con su acción, las pendientes en anillo. Sin lista, se dice.
   La respuesta en vivo de un mensaje enviado desde aquí la pinta js/chat.js debajo, junto a la mascota. */
(function (RA) {
  'use strict';

  const ui = RA.ui, el = ui.el, $ = ui.$, G = RA.glifos;
  const VERBO = { Read: 'Leer', Edit: 'Editar', MultiEdit: 'Editar', NotebookEdit: 'Editar', Write: 'Escribir', Bash: 'Ejecutar', PowerShell: 'Ejecutar', BashOutput: 'Ejecutar',
    Grep: 'Buscar', Glob: 'Buscar', WebFetch: 'Web', WebSearch: 'Web', Agent: 'Delegar', Task: 'Delegar', TodoWrite: 'Planear', TaskCreate: 'Planear', TaskUpdate: 'Planear' };
  const MAX_TURNOS = 6, MAX_FILAS = 8;
  const ARCHIVOS = { Read: 1, Edit: 1, MultiEdit: 1, Write: 1 };
  const PREVISUALIZABLE = /\.(html?|pdf|mp4|webm|ogv|mov|m4v)$/i;      // lo que el Navegador enseña (services/local-preview.js)
  let firmaConv = '', firmaPlan = '';

  /* Vista de la transcripción, como en Claude Code Desktop (Ctrl+O la alterna): Normal (las últimas acciones de
     cada turno), Pensamiento (además, el pensamiento visible de Claude; solo si la sesión lo tiene) y Detallado
     (todas las acciones, con su salida o su error, y el pensamiento: "Verbose" lo incluye, code.claude.com/docs/en/desktop). La vista por defecto se elige en Ajustes › Claude Code. */
  const VISTAS = [['normal', 'Normal'], ['pensamiento', 'Pensamiento'], ['detallado', 'Detallado']];
  const CLAVE = 'rastro:vista-trans';
  let vista = null;
  const conPens = s => !!(s && s.pensamientos && s.pensamientos.length);
  function vistaActual(s) {
    if (!vista) { try { vista = localStorage.getItem(CLAVE); } catch (e) { /* sin almacenamiento */ } }
    const v = VISTAS.some(x => x[0] === vista) ? vista : (RA.datos.ajustes.vistaTrans || 'normal');
    return v === 'pensamiento' && !conPens(s) ? 'normal' : v;
  }
  function ponerVista(v, s) {
    vista = v; firmaConv = '';
    try { localStorage.setItem(CLAVE, v); } catch (e) { /* sin almacenamiento */ }
    pintar(s); pintarBoton(s);
    ui.decir('Vista de la transcripción: ' + VISTAS.find(x => x[0] === v)[1] + '.', { toast: false });
  }
  // Ctrl+O: Normal → Pensamiento (si hay) → Detallado → Normal.
  function alternar() {
    const s = RA.vistas && RA.vistas.actual();
    const orden = VISTAS.map(x => x[0]).filter(v => v !== 'pensamiento' || conPens(s)), i = orden.indexOf(vistaActual(s));
    ponerVista(orden[(i + 1) % orden.length], s);
  }
  function pintarBoton(s) {
    const b = $('#vista-trans');
    if (!b) return;
    const v = vistaActual(s), nombre = VISTAS.find(x => x[0] === v)[1];
    b.hidden = !s;
    b.textContent = nombre;
    b.setAttribute('aria-label', 'Cambiar la vista de la transcripción: ' + nombre);
    b.title = 'Vista de la transcripción: ' + nombre + ' (Ctrl+O)';
  }
  function menuVista(b) {
    if (ui.menu.abierto && ui.menu.abierto.boton === b) return ui.cerrarMenu();
    const s = RA.vistas && RA.vistas.actual(), v = vistaActual(s);
    ui.menu(b, [{ texto: 'Vista de la transcripción · Ctrl+O alterna', titulo: true }].concat(VISTAS.map(([id, nombre]) => ({
      texto: nombre, radio: true, marcado: id === v, id: 'vt-' + id,
      desactivado: id === 'pensamiento' && !conPens(s) ? 'Esta sesión no tiene pensamiento visible de Claude.' : null,
      fn: () => { ponerVista(id, s); b.focus(); }
    }))));
  }
  document.addEventListener('keydown', e => {
    if (!e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || e.key.toLowerCase() !== 'o') return;
    e.preventDefault();
    alternar();
  });
  document.addEventListener('DOMContentLoaded', () => { const b = $('#vista-trans'); if (b) b.addEventListener('click', e => menuVista(e.currentTarget)); });

  const verbo = h => VERBO[h] || (h.indexOf('mcp__') === 0 ? h.split('__').pop() : h);
  const dur = ms => ms == null ? '' : ms < 1000 ? '0,' + Math.max(1, Math.round(ms / 100)) + ' s' : ms < 60000 ? (Math.round(ms / 100) / 10).toLocaleString('es') + ' s' : ui.dur(ms);

  function fila(e, detallado) {
    const curso = e.est === 'curso', error = e.est === 'error', salida = detallado ? (e.err || e.sal || '') : '';
    // Rutas HTML, PDF o de vídeo: se abren en el Navegador (code.claude.com/docs/en/desktop, "Preview your app").
    const ruta = ARCHIVOS[e.h] && PREVISUALIZABLE.test(e.res || '');
    const lado = e.cuenta ? '+' + e.cuenta.mas + ' −' + e.cuenta.menos : curso ? 'trabajando' : error ? 'falló' : dur(e.dur);
    return el('li', { class: 'conv-fila' + (curso ? ' curso' : '') }, [
      G.svg(G.deHerramienta(e.h), null, 3.2),
      el('span', { class: 'conv-verbo' }, verbo(e.h)),
      ruta ? el('button', { type: 'button', class: 'conv-obj mono conv-ruta', title: 'Ver ' + e.res + ' en el Navegador', 'aria-label': 'Ver ' + e.res + ' en el Navegador', onclick: () => RA.navegador && RA.navegador.abrirArchivo(e.res) }, e.res)
        : el('span', { class: 'conv-obj mono', title: e.res || '' }, e.res || ''),
      el('span', { class: 'conv-dur mono' + (curso ? ' curso' : error ? ' rojo' : e.cuenta ? ' claro' : '') }, lado),
      el('span', { class: 'conv-pt ' + (curso ? 'curso' : error ? 'error' : 'ok'), role: 'img', 'aria-label': curso ? 'Trabajando' : error ? 'Falló' : 'Hecho' }),
      salida ? el('pre', { class: 'conv-sal mono' + (e.err ? ' mal' : '') }, String(salida).slice(0, 600) + (String(salida).length > 600 ? ' … +' + (String(salida).length - 600) + ' caracteres' : '')) : null
    ]);
  }

  /* Hilo de turnos (D1): el texto de Claude de cada turno, en markdown y prosa, bajo sus acciones. Hasta 2 000
     caracteres a la vista y "Ver entero" para el resto de lo guardado. El del último turno no se repite si la
     respuesta en vivo (js/respuesta.js) ya lo enseña debajo. */
  const VISIBLE = 2000, enteros = new Set();
  function respuestaDe(s, t, clave) {
    const texto = t.resp.map(x => x.texto).join('\n\n'), largo = texto.length > VISIBLE, abierto = enteros.has(clave);
    const corte = largo && !abierto ? texto.slice(0, VISIBLE).replace(/\s+\S*$/, '') + ' …' : texto;
    const id = 'conv-resp-' + clave.replace(/[^\w-]/g, '');
    return el('div', { class: 'conv-resp resp-prosa', id: id }, [
      RA.markdown ? RA.markdown.pintar(corte) : el('p', {}, corte),
      largo ? el('button', { type: 'button', class: 'btn btn-small conv-entero', 'aria-expanded': String(abierto), 'aria-controls': id,
        onclick: () => { if (abierto) enteros.delete(clave); else enteros.add(clave); firmaConv = ''; pintar(s); const b = document.querySelector('#' + id + ' .conv-entero'); if (b) b.focus(); } }, abierto ? 'Ver menos' : 'Ver entero') : null,
      t.resp.some(x => x.recortado) ? el('p', { class: 'note' }, 'Recortada: la respuesta entera queda en el transcript de la sesión.') : null
    ]);
  }

  function pintar(s) {
    const caja = $('#conv');
    if (!caja) return;
    if (!s) { firmaConv = ''; ui.pintar(caja, el('p', { class: 'note conv-vacio' }, 'Elige una sesión en la barra lateral para ver su conversación.')); return; }
    const evs = s.eventos.filter(e => e.ag === 'p').sort((a, b) => a.t - b.t), ps = (s.prompts || []).slice().sort((a, b) => a.t - b.t);
    const ult = evs[evs.length - 1], v = vistaActual(s), det = v === 'detallado', pens = v === 'pensamiento' || det ? (s.pensamientos || []) : [];
    const rs = (s.respuestas || []).slice().sort((a, b) => a.t - b.t), uR = rs[rs.length - 1];
    // El último turno lo enseña la respuesta en vivo si es la de ese prompt.
    const enVivo = RA.respuesta && RA.respuesta.vigente ? RA.respuesta.vigente(s) : false;
    const firma = [s.id, v, evs.length, ps.length, pens.length, ult ? ult.id + ult.est + (ult.dur || '') : '', rs.length, uR ? uR.t + ':' + uR.texto.length : '', enVivo].join('|');
    pintarBoton(s);
    if (firma === firmaConv) return;
    firmaConv = firma;
    caja.dataset.vista = v;
    // Turnos: cada mensaje con lo que vino después. Lo anterior al primer mensaje va en un turno sin burbuja.
    const turnos = [];
    let k = 0;
    if (!ps.length || (evs[0] && evs[0].t < ps[0].t) || (rs[0] && rs[0].t < ps[0].t)) turnos.push({ p: null, evs: [], pens: [], resp: [] });
    ps.forEach(p => turnos.push({ p: p, evs: [], pens: [], resp: [] }));
    const turnoDe = t0 => { let j = 0; while (j < ps.length && ps[j].t <= t0) j++; return turnos[turnos.length - ps.length + j - 1] || turnos[0]; };
    evs.forEach(e => {
      while (k < ps.length && ps[k].t <= e.t) k++;
      const t = turnos[turnos.length - ps.length + k - 1] || turnos[0];
      t.evs.push(e);
    });
    pens.forEach(x => turnoDe(x.t).pens.push(x));
    rs.forEach(x => turnoDe(x.t).resp.push(x));
    if (enVivo && turnos.length) turnos[turnos.length - 1].resp = [];
    const vis = turnos.filter(t => t.p || t.evs.length || t.resp.length).slice(-(det ? MAX_TURNOS * 2 : MAX_TURNOS)), ocultos = turnos.filter(t => t.p || t.evs.length || t.resp.length).length - vis.length;
    const abajo = caja.scrollHeight - caja.scrollTop - caja.clientHeight < 40;
    ui.pintar(caja, [
      ocultos > 0 ? el('p', { class: 'note conv-antes' }, ocultos + (ocultos === 1 ? ' turno anterior' : ' turnos anteriores') + ' en la línea de tiempo (Detalles de la sesión, al pie del panel Contexto).') : null,
      vis.length ? null : el('p', { class: 'note conv-vacio' }, 'Esta sesión aún no tiene mensajes ni acciones.')
    ].concat(vis.map(t => {
      const tope = det ? 200 : MAX_FILAS, sobra = t.evs.length - tope, filas = t.evs.slice(-tope);
      return el('div', { class: 'conv-turno' }, [
        t.p ? el('div', { class: 'conv-tu', title: ui.hora ? ui.hora(t.p.t) : '' }, t.p.texto) : null,
        filas.length || t.pens.length || t.resp.length ? el('div', { class: 'conv-claude' }, [
          el('span', { class: 'conv-avatar', 'aria-hidden': 'true' }, G.mascota('reposo')),
          el('div', { class: 'conv-acciones' }, [
            sobra > 0 ? el('p', { class: 'note conv-mas' }, '+' + sobra + (sobra === 1 ? ' acción antes' : ' acciones antes')) : null,
            t.pens.length ? el('div', { class: 'conv-pens' }, t.pens.slice(-6).map(x => el('p', {}, [el('span', { class: 'label' }, 'Pensamiento'), ' ', x.texto]))) : null,
            filas.length ? el('ol', { class: 'conv-tarjeta' + (det ? ' detallado' : ''), 'aria-label': 'Acciones de Claude' }, filas.map(e => fila(e, det))) : null,
            t.resp.length ? respuestaDe(s, t, s.id + '-' + (t.p ? t.p.t : 0)) : null
          ])
        ]) : null
      ]);
    })));
    if (abajo) caja.scrollTop = caja.scrollHeight;
  }

  function plan(s) {
    const caja = $('#plan-mini'), cuenta = $('#plan-cuenta');
    if (!caja) return;
    const p = s && s.plan && s.plan.total ? s.plan : null;
    const firma = s ? s.id + JSON.stringify(p) : '';
    if (firma === firmaPlan) return;
    firmaPlan = firma;
    cuenta.textContent = p ? p.hechas + '/' + p.total : '';
    cuenta.setAttribute('aria-label', p ? p.hechas + ' de ' + p.total + ' tareas hechas' : '');
    if (!p) { ui.pintar(caja, el('p', { class: 'note' }, s ? 'Esta sesión no tiene lista de tareas: no hay progreso que mostrar.' : 'Sin sesión elegida.')); return; }
    ui.pintar(caja, el('ol', { class: 'plan-lista', 'aria-label': 'Tareas del plan' }, (p.tareas || []).map(x => {
      const ahora = x.est === 'in_progress';
      return el('li', { class: 'plan-t ' + (x.est === 'completed' ? 'hecha' : ahora ? 'ahora' : 'pend') }, [
        el('span', { class: 'plan-pt', role: 'img', 'aria-label': x.est === 'completed' ? 'Hecha' : ahora ? 'En curso' : 'Pendiente' }),
        el('span', {}, [x.asunto, ahora && p.actual && p.actual !== x.asunto ? el('span', { class: 'plan-sub' }, p.actual) : null])
      ]);
    })));
  }

  RA.conversacion = { VISTAS: VISTAS, conPens: conPens, pintar: pintar, plan: plan, vista: () => vistaActual(RA.vistas && RA.vistas.actual()), alternar: alternar, poner: v => ponerVista(v, RA.vistas && RA.vistas.actual()) };
})(window.RA = window.RA || {});
