/* Pop-up del final de cada mensaje: cuando termina un turno enviado desde Rastro aparece una tarjeta redondeada
   (radio de tarjeta, 20 px) con el resumen que escribe el modelo de cierre, cuántos archivos tocó el turno y
   cuánto tardó. Entra con una animación corta, no se cierra sola y se descarta con Esc o con Cerrar.
   - Sin botón de diff ([DECISIÓN] del encargo).
   - Se quita en Ajustes › Notificaciones ("Resumen al terminar cada mensaje").
   - No suena: el aviso de fin de turno ya tiene su sonido, que respeta "Silenciar todos los sonidos".
   - No quita el foco ni la tecla Enter: si está abierta la vista previa antes de enviar ("Ver un resumen antes
     de enviar"), Esc es para ella y Enter sigue enviando. */
(function (RA) {
  'use strict';

  const ui = RA.ui, el = ui.el, $ = ui.$, D = RA.datos, L = RA.logica;
  let abierto = null;                    // { sesion, t0 }
  const quieto = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('modo-juego');

  // Archivos que tocó el turno: los eventos con archivo de esa sesión entre el envío y el final.
  function archivosDe(s, t0, t1) {
    if (!s || !s.eventos) return [];
    return s.eventos.filter(e => e.archivo && (e.cuenta || /^(Edit|MultiEdit|Write|NotebookEdit)$/.test(e.h)) && e.t >= t0 - 1000 && e.t <= (t1 || D.ahora()) + 5000).map(e => e.archivo);
  }

  function cerrar(volver) {
    const c = $('#turno-pop');
    if (c) c.remove();
    abierto = null;
    if (volver && $('#masc-prompt')) $('#masc-prompt').focus();
  }

  function pintar(datos) {
    let c = $('#turno-pop');
    const nuevo = !c;
    if (!c) { c = el('section', { id: 'turno-pop', class: 'card turno-pop', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'turno-pop-t' }); document.body.appendChild(c); }
    const r = datos.resumen;
    ui.pintar(c, [
      el('div', { class: 'row between turno-cab' }, [
        el('h2', { id: 'turno-pop-t', class: 'turno-tit' }, 'Turno terminado · ' + datos.nombre),
        el('button', { type: 'button', class: 'btn btn-small', id: 'turno-cerrar', onclick: () => cerrar(true) }, 'Cerrar')
      ]),
      el('dl', { class: 'turno-cifras' }, [
        el('div', {}, [el('dt', { class: 'label' }, 'Archivos'), el('dd', { class: 'turno-n', id: 'turno-archivos' }, String(datos.archivos))]),
        el('div', {}, [el('dt', { class: 'label' }, 'Tiempo'), el('dd', { class: 'turno-n', id: 'turno-tiempo' }, ui.dur(datos.ms))])
      ]),
      el('div', { class: 'turno-resumen', id: 'turno-resumen', 'aria-live': 'polite' }, r && r.error ? [el('p', {}, el('span', { class: 'mal' }, 'No se pudo hacer el resumen. ' + r.error))]
        : r && r.objetivo ? [el('p', {}, r.objetivo)].concat(r.hecho && r.hecho.length ? [el('ul', { class: 'turno-hecho' }, r.hecho.map(x => el('li', {}, x)))] : [])
        : [el('p', { class: 'label' }, D.chatEnviar ? 'Escribiendo el resumen con ' + (D.resumenLocal ? 'la IA local (' + D.resumenLocal + ')' : ui.modelo(D.ajustes.modelos.resumen)) : 'Sin resumen: en la maqueta no hay modelo.')]),
      el('p', { class: 'note turno-pie' }, [r && r.modelo ? 'Resumen de ' + ui.modelo(r.modelo) + '. ' : '', 'Esc o Cerrar lo descartan. Se quita en Ajustes › Notificaciones.'])
    ]);
    if (nuevo && !quieto() && c.animate) c.animate([{ opacity: 0, transform: 'translateY(12px) scale(.98)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,.7,.2,1)' });
  }

  /* Un turno terminó (estado del chat del proceso principal). t: { sesion, est, t0, t1 }. */
  function alTerminar(t) {
    const datos = L.popupTurno({ est: t.est, t0: t.t0, t1: t.t1, archivos: [] }, D.ajustes);
    if (!datos) return;
    const s = (D.estado.sesiones || []).find(x => x.id === t.sesion);
    const base = { sesion: t.sesion, nombre: s ? s.nombre : 'la sesión', archivos: L.popupTurno({ est: 'listo', t0: t.t0, t1: t.t1, archivos: archivosDe(s, t.t0, t.t1) }, {}).archivos, ms: datos.ms, resumen: null };
    abierto = { sesion: t.sesion, t0: t.t0 };
    pintar(base);
    ui.decir('Turno terminado en ' + base.nombre + ': ' + base.archivos + (base.archivos === 1 ? ' archivo' : ' archivos') + ' en ' + ui.dur(base.ms) + '.', { toast: false });
    if (!D.resumenTurno) return;
    const yo = abierto;
    Promise.resolve(D.resumenTurno(t.sesion, t.t0)).then(r => {
      if (abierto !== yo) return;                 // se cerró o llegó otro turno
      const s2 = (D.estado.sesiones || []).find(x => x.id === t.sesion);
      // Los archivos se recuentan: el registro de la sesión puede llegar un poco después que el fin del turno.
      const n = r && r.resumen && r.resumen.archivos ? r.resumen.archivos.length : L.popupTurno({ est: 'listo', t0: t.t0, t1: t.t1, archivos: archivosDe(s2, t.t0, t.t1) }, {}).archivos;
      pintar(Object.assign({}, base, { archivos: Math.max(n, base.archivos), resumen: r && r.resumen ? r.resumen : { error: (r && r.error) || 'Sin respuesta.' } }));
    });
  }

  // Esc lo descarta, salvo que la vista previa antes de enviar esté abierta (Esc es para ella).
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !$('#turno-pop')) return;
    const previa = $('#masc-previa');
    if (previa && !previa.hidden) return;
    if (RA.capas && RA.capas.abierta()) return;
    e.preventDefault();
    cerrar(document.activeElement && $('#turno-pop').contains(document.activeElement));
  });

  RA.turno = { alTerminar: alTerminar, cerrar: cerrar, abierto: () => abierto };
})(window.RA = window.RA || {});
