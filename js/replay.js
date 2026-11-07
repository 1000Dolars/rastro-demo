/* Reproducción de una sesión: una línea de tiempo navegable con sus prompts, las llamadas de
   herramienta de todos sus agentes y los archivos que va tocando. Sale de los transcripts de Claude Code,
   que Rastro lee en solo lectura (formato comprobado en la versión 2.1.280: registros "user" con el texto
   del prompt y "assistant" con bloques "tool_use"). Se mueve con el deslizador (flechas, Inicio, Fin),
   con Anterior y Siguiente, o reproduciendo paso a paso. No modifica nada. */
(function (RA) {
  'use strict';

  const ui = RA.ui, el = ui.el, $ = ui.$, D = RA.datos, C = RA.calc, G = RA.glifos;
  const herr = h => h.indexOf('mcp__') === 0 ? h.split('__').pop() : h;
  let r = null;            // { id, pasos, i, reloj }

  // Pasos en orden: los prompts y las llamadas de herramienta, con su hora.
  function pasos(s) {
    const cod = {};
    s.agentes.forEach(a => { cod[a.id] = a.cod; });
    return (s.prompts || []).map(p => ({ t: p.t, tipo: 'prompt', texto: p.texto }))
      .concat(s.eventos.map(e => ({ t: e.t, tipo: 'herramienta', h: e.h, res: e.res, est: e.est, ag: cod[e.ag] || '?', archivo: e.archivo, cambio: !!(e.cuenta || e.sinDiff || (e.archivo && e.h !== 'Read')) })))
      .filter(x => x.t).sort((a, b) => a.t - b.t);
  }

  function parar() { if (r && r.reloj) { clearInterval(r.reloj); r.reloj = null; } }

  function pintar(foco) {
    const caja = $('#ses-repro');
    if (!r) return ui.pintar(caja, null);
    const s = C.sesion(r.id);
    if (!s) { r = null; return ui.pintar(caja, null); }
    const P = r.pasos, n = P.length, p = P[r.i];
    if (!n) return ui.pintar(caja, ui.tarjeta('Reproducción · ' + s.nombre, [el('p', { class: 'note' }, 'Esta sesión no tiene pasos que reproducir.'), el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn btn-small', onclick: cerrar }, 'Cerrar'))], { id: 't-repro' }));
    // Archivos tocados hasta este paso: lecturas y cambios por archivo.
    const arch = {};
    P.slice(0, r.i + 1).forEach(x => { if (x.archivo) { const a = arch[x.archivo] = arch[x.archivo] || { leido: 0, cambio: 0 }; if (x.cambio) a.cambio++; else a.leido++; } });
    const deslizador = el('input', { id: 'repro-pos', type: 'range', min: '0', max: String(n - 1), step: '1', value: String(r.i), 'aria-label': 'Paso de la reproducción', 'aria-valuetext': 'Paso ' + (r.i + 1) + ' de ' + n + ', ' + ui.hora(p.t), oninput: ev => { parar(); r.i = +ev.target.value; pintar('repro-pos'); } });
    const detalle = p.tipo === 'prompt'
      ? [ui.insignia('Prompt'), el('pre', { class: 'dato', tabindex: '0', role: 'group', 'aria-label': 'Prompt' }, p.texto)]
      : [el('div', { class: 'row' }, [G.svg(G.deHerramienta(p.h), null), ui.insignia(p.ag), el('span', { class: 'mono' }, herr(p.h)), ui.estado(p.est)]), el('p', { class: 'mono repro-res' }, p.res || '—')];
    ui.pintar(caja, ui.tarjeta('Reproducción · ' + s.nombre, [
      el('div', { class: 'row between' }, [el('span', { class: 'label' }, 'Paso ' + (r.i + 1) + ' de ' + n), el('span', { class: 'chip' }, ui.fecha(p.t) + ' · ' + ui.hora(p.t))]),
      deslizador,
      el('div', { class: 'row' }, [
        el('button', { type: 'button', class: 'btn btn-small', id: 'repro-ant', disabled: r.i === 0, onclick: () => { parar(); r.i--; pintar('repro-ant'); } }, 'Anterior'),
        el('button', { type: 'button', class: 'btn btn-small', id: 'repro-play', 'aria-pressed': String(!!r.reloj), onclick: alternar }, r.reloj ? 'Pausar' : 'Reproducir'),
        el('button', { type: 'button', class: 'btn btn-small', id: 'repro-sig', disabled: r.i === n - 1, onclick: () => { parar(); r.i++; pintar('repro-sig'); } }, 'Siguiente'),
        el('button', { type: 'button', class: 'btn btn-small', onclick: cerrar }, 'Cerrar')
      ]),
      el('div', { class: 'sub' }, detalle),
      el('div', { class: 'col' }, [
        el('span', { class: 'label' }, 'Archivos tocados hasta aquí · ' + Object.keys(arch).length),
        Object.keys(arch).length ? el('ul', { class: 'lista' }, Object.keys(arch).map(a => el('li', {}, [el('span', { class: 'crece mono' }, ui.ruta(a)), el('span', { class: 'n' }, (arch[a].cambio ? arch[a].cambio + ' cambio' + (arch[a].cambio > 1 ? 's' : '') : '') + (arch[a].cambio && arch[a].leido ? ' · ' : '') + (arch[a].leido ? arch[a].leido + ' lectura' + (arch[a].leido > 1 ? 's' : '') : ''))]))) : el('p', { class: 'note' }, 'Ninguno todavía.')
      ])
    ], { id: 't-repro', pie: el('span', { class: 'label' }, 'Solo lectura') }));
    const f = foco && $('#' + foco);
    if (f && !f.disabled) f.focus(); else if (foco) $('#repro-pos').focus();
  }

  function alternar() {
    if (r.reloj) { parar(); pintar('repro-play'); return; }
    if (r.i >= r.pasos.length - 1) r.i = 0;
    r.reloj = setInterval(() => { if (r.i >= r.pasos.length - 1) { parar(); pintar('repro-play'); return; } r.i++; pintar('repro-play'); }, 700);
    pintar('repro-play');
  }
  function cerrar() { parar(); r = null; pintar(); const b = $('#reproducir'); if (b) b.focus(); }

  RA.repro = {
    abrir(id) { parar(); const s = C.sesion(id); if (!s) return; r = { id: id, pasos: pasos(s), i: 0, reloj: null }; pintar('repro-pos'); ui.decir('Reproducción de ' + s.nombre + ': ' + r.pasos.length + ' pasos.'); },
    cerrar: cerrar,
    estado: () => r ? { id: r.id, i: r.i, n: r.pasos.length } : null
  };
})(window.RA = window.RA || {});
