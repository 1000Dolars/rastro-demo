/* Tarjeta "Modelos en uso" de Chat (Añadido 3): una fila por IA que trabaja para la sesión elegida.
   - Claude de la sesión y sus subagentes: modelo y esfuerzo del transcript (message.model, effort; cada
     subagente, del suyo) o de la respuesta en curso (system/init). Lo que no existe dice "No informado por
     Claude Code": nunca se supone un modelo.
   - IA local, nube gratuita y auxiliar de resúmenes: los datos de los asistentes (RA.asistentes.estado()
     y sus tareas), sin repetir su lógica.
   La marca "► Ejecuta este mensaje" va en la IA que tiene ahora el último mensaje enviado desde Chat. */
(function (RA) {
  'use strict';

  const ui = RA.ui, el = ui.el, $ = ui.$, D = RA.datos;
  const ESFUERZO = { low: 'Bajo', medium: 'Medio', high: 'Alto', xhigh: 'Muy alto', max: 'Máximo' };
  // Rol en palabras sencillas, según el tipo de subagente. Lo que no está aquí "Ayuda".
  const ROL_SUB = { Explore: 'Explora', Plan: 'Planea', 'code-reviewer': 'Revisa', 'claude-code-guide': 'Consulta la guía', 'statusline-setup': 'Configura' };
  const NO = 'No informado por Claude Code';
  // Estado en palabra y forma (los puntos de siempre: .est de ui.estado).
  const ESTADO = { trabajando: ['Trabajando', 'curso'], esperando: ['Esperándote', 'espera'], libre: ['Libre', 'listo'], error: ['Error', 'error'], sincuota: ['Sin cuota', 'detenido'], apagada: ['Apagada', 'nodatos'] };
  let firma = '';

  const esfuerzo = e => e ? (ESFUERZO[e] || e) + ' (' + e + ')' : null;
  const nombreModelo = id => id ? ui.modelo(id).replace(/^\w/, c => c.toUpperCase()) : null;

  function filas(s) {
    const out = [], ch = RA.chat, enChat = ch && /enviando|respondiendo/.test(ch.estado(s.id) || '');
    const tareas = RA.asistentes && RA.asistentes.tareas ? RA.asistentes.tareas() : {}, t = tareas[s.id];
    const barata = t && t.estado === 'trabajando' && t.decision && (t.decision.destino === 'local' || t.decision.destino === 'nube') ? t.decision : null;
    const V = RA.vistas, tj = V && V.tarjeta ? V.tarjeta(s) : { clave: s.est === 'curso' ? 'trabajando' : 'libre' };
    const p = s.agentes[0] || {}, m = D.modoDe(s);
    const est = D.continuidad ? 'sincuota' : tj.clave === 'trabajando' ? 'trabajando' : tj.clave === 'esperando' ? 'esperando' : tj.clave === 'error' ? 'error' : 'libre';
    const enCurso = ch && ch.modelo ? ch.modelo(s.id) : '';
    out.push({ id: 'claude', rol: s.fase === 'diseno' ? 'Diseña' : m && m.id === 'plan' ? 'Planea' : 'Programa', quien: 'Claude de la sesión', modo: m,
      modelo: nombreModelo(enCurso || p.modelo || s.modelo), esfuerzo: esfuerzo(s.esfuerzo || p.esfuerzo), est: est, ahora: !barata && (enChat || est === 'trabajando') });
    // Subagentes: los que trabajan y, si no hay, los tres últimos que terminaron.
    const subs = s.agentes.filter(a => a.id !== 'p'), vivos = subs.filter(a => a.est === 'curso');
    (vivos.length ? vivos : subs.slice(-3)).forEach(a => out.push({ id: a.id, rol: ROL_SUB[a.tipo] || 'Ayuda', quien: 'Subagente ' + a.cod + ' · ' + a.tipo, tarea: a.tarea,
      modelo: nombreModelo(a.modelo), nota: a.modelo ? '' : a.est === 'curso' ? 'aún no ha respondido' : '', esfuerzo: esfuerzo(a.esfuerzo), est: a.est === 'curso' ? 'trabajando' : a.est === 'error' ? 'error' : 'libre', ahora: false }));
    // Asistentes de Rastro (solo con la app: en la maqueta no hay estado de asistentes).
    const A = RA.asistentes && RA.asistentes.estado ? RA.asistentes.estado() : null;
    if (A && A.config) {
      const C = A.config, O = A.ollama || {};
      if (C.local && C.local.modelo) out.push({ id: 'local', rol: C.orquestador ? 'Clasifica' : 'Ayuda en tareas pequeñas', quien: 'Modelo local (Ollama)', modelo: C.local.modelo,
        esfuerzo: RA.fase4 && RA.fase4.nivel ? RA.fase4.nivel() : null, est: !O.enMarcha ? 'apagada' : barata && barata.destino === 'local' ? 'trabajando' : 'libre', ahora: !!(barata && barata.destino === 'local') });
      (A.nube || []).filter(pv => C.proveedores && C.proveedores[pv] && C.proveedores[pv].activo).forEach(pv => {
        const q = (A.cuotas || {})[pv] || {}, sinCuota = q.hasta > D.ahora() || q.restante === 0, aqui = !!(barata && barata.destino === 'nube' && (barata.prov === pv || !barata.prov));
        out.push({ id: 'nube-' + pv, rol: 'Programa tareas pequeñas', quien: 'Nube gratuita (' + ((A.nombres || {})[pv] || pv) + ')', modelo: (aqui && barata.modelo) || (C.modelos || {})[pv] || null,
          esfuerzo: null, est: sinCuota ? 'sincuota' : aqui ? 'trabajando' : 'libre', ahora: aqui });
      });
    }
    const generando = D.estado.sesiones.some(x => x.resumen && x.resumen.est === 'generando');
    const aux = A && A.config && A.config.resumenLocal ? (A.config.auxiliar && A.config.auxiliar.modelo) || (A.config.local && A.config.local.modelo) : nombreModelo(D.ajustes.modelos.resumen);
    out.push({ id: 'resumen', rol: 'Resume', quien: 'Auxiliar de resúmenes', modelo: aux || null, esfuerzo: null, est: generando ? 'trabajando' : 'libre', ahora: false });
    return out;
  }

  // Punto de estado decorativo: la palabra de al lado ya lo dice (sin leerlo dos veces).
  const punto = e => { const p = ui.estado(e); p.removeAttribute('role'); p.removeAttribute('aria-label'); p.setAttribute('aria-hidden', 'true'); return p; };
  const estadoIA = e => el('span', { class: 'e3' }, [punto(ESTADO[e][1]), el('span', {}, ESTADO[e][0])]);
  const sinDato = (txt, nota) => el('span', { class: 'noinf' }, txt + (nota ? ' (' + nota + ')' : ''));

  function pintar() {
    const caja = $('#modelos-uso');
    if (!caja) return;
    const s = RA.vistas && RA.vistas.actual();
    const f = s ? filas(s) : [], clave = JSON.stringify(f.map(x => [x.id, x.modelo, x.esfuerzo, x.est, x.ahora, x.modo && x.modo.id, x.tarea]));
    if (clave === firma) return;            // nada cambió: no se repinta
    firma = clave;
    if (!s) { ui.pintar(caja, el('p', { class: 'note' }, 'Elige una sesión en la franja de arriba para ver qué IA trabajan en ella.')); $('#modelos-cuenta').textContent = ''; return; }
    ui.pintar(caja, el('div', { class: 'table-wrap', tabindex: '0', role: 'group', 'aria-label': 'Tabla de modelos en uso' }, el('table', { class: 'table modelos' }, [
      el('caption', { class: 'sr' }, 'Cada IA que trabaja ahora para ' + s.nombre + ': su rol, su modelo, su esfuerzo y su estado'),
      el('thead', {}, el('tr', {}, ['Rol', 'Quién', 'Modelo', 'Esfuerzo', 'Estado', ''].map((h, i) => el('th', { scope: 'col' }, i === 5 ? el('span', { class: 'sr' }, 'Ejecuta este mensaje') : h)))),
      el('tbody', {}, f.map(x => el('tr', { class: x.ahora ? 'sel' : null, 'data-ia': x.id }, [
        el('td', {}, el('span', { class: 'rol' }, x.rol)),
        el('td', {}, [x.quien,
          x.tarea ? el('div', { class: 'note' }, 'Tarea: ' + x.tarea) : null,
          x.modo ? el('div', { class: 'note' }, ['Modo ' + x.modo.nombre].concat(x.modo.id === 'bypassPermissions' ? [' ', ui.insignia('Sin permisos', 'alerta sinperm')] : [])) : null]),
        el('td', { 'data-c': 'Modelo' }, x.modelo || sinDato(NO, x.nota)),
        el('td', { 'data-c': 'Esfuerzo' }, x.esfuerzo || sinDato('No informado')),
        el('td', {}, estadoIA(x.est)),
        el('td', {}, x.ahora ? el('span', { class: 'ahora' }, [el('span', { 'aria-hidden': 'true' }, '► '), 'Ejecuta este mensaje']) : '')
      ])))
    ])));
    const trab = f.filter(x => x.est === 'trabajando').length;
    $('#modelos-cuenta').textContent = f.length + (f.length === 1 ? ' IA' : ' IA') + ' · ' + trab + ' trabajando';
  }

  D.alCambiar(pintar);
  document.addEventListener('rastro:vista', pintar);
  setInterval(pintar, 2000);
  RA.modelosUso = { pintar: pintar, filas: filas, estadoIA: estadoIA, punto: punto };
})(window.RA = window.RA || {});
