/* Ajustes › IA económicas › Ollama en este equipo: "Probar conexión" (solo /api/tags, no carga nada) y
   "Probar modelo" (el modelo instalado más pequeño responde con num_predict 8 y se descarga enseguida; solo si
   cabe en el tope de VRAM). Si Ollama no responde, se dice "Ollama no responde" con la causa probable. No usa
   Claude ni gasta tu plan. */
(function (RA) {
  'use strict';

  const ui = RA.ui, el = ui.el, $ = ui.$, D = RA.datos;
  let ultimo = null;                     // { tipo, r, t }
  const GB = mb => (mb / 1024).toFixed(1).replace('.', ',') + ' GB';

  function resultado() {
    const caja = $('#ol-resultado');
    if (!caja) return;
    if (!ultimo) return ui.pintar(caja, el('p', { class: 'note' }, 'Sin probar todavía.'));
    const r = ultimo.r, hora = new Date(ultimo.t).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (!r.ok) return ui.pintar(caja, [el('p', { role: 'alert' }, [el('span', { class: 'mal' }, r.error || 'Ollama no responde'), r.causa ? '. ' + r.causa : '']), el('p', { class: 'note mono' }, 'Probado a las ' + hora)]);
    if (ultimo.tipo === 'conexion') {
      return ui.pintar(caja, [
        el('p', {}, ['✓ Ollama responde (' + r.ms + ' ms). ', r.modelos.length ? r.modelos.length + (r.modelos.length === 1 ? ' modelo instalado:' : ' modelos instalados:') : 'No tiene modelos descargados.']),
        r.modelos.length ? el('ul', { class: 'lista ol-modelos' }, r.modelos.map(m => el('li', {}, [el('span', { class: 'crece mono' }, m.nombre), el('span', { class: 'note mono' }, [m.params, m.cuant, m.tam ? GB(m.tam / 1048576) : ''].filter(Boolean).join(' · '))]))) : null,
        el('p', { class: 'note mono' }, 'Probado a las ' + hora + '. No se cargó ningún modelo.')
      ]);
    }
    ui.pintar(caja, [
      el('p', {}, ['✓ ', el('span', { class: 'mono' }, r.modelo), ' respondió en ' + ui.dur(r.ms) + (r.cargaMs ? ' (' + ui.dur(r.cargaMs) + ' cargando)' : '') + ': ', el('span', { class: 'mono' }, '«' + (r.respuesta || '') + '»')]),
      el('p', { class: 'note mono' }, 'Huella estimada ' + GB(r.huellaMB) + (r.topeMB ? ' · tope ' + GB(r.topeMB) : '') + ' · 8 tokens como mucho · se descarga a los 10 s · probado a las ' + hora)
    ]);
  }
  function probar(tipo, boton) {
    if (!D.ollama) return ui.decir('Ollama se prueba desde la app de escritorio.', 'atencion');
    return ui.ocupado(boton, () => Promise.resolve(D.ollama[tipo]()).then(r => {
      ultimo = { tipo: tipo, r: r || { ok: false, error: 'Ollama no responde', causa: 'Sin respuesta del proceso principal.' }, t: Date.now() };
      resultado();
      ui.decir(ultimo.r.ok ? (tipo === 'conexion' ? 'Ollama responde.' : 'El modelo de Ollama respondió.') : (ultimo.r.error || 'Ollama no responde') + '. ' + (ultimo.r.causa || ''), ultimo.r.ok ? 'ok' : 'atencion');
      if (!ultimo.r.ok) return { error: ultimo.r.error };
    }), { cargando: tipo === 'conexion' ? 'Probando…' : 'Cargando el modelo…', hecho: 'Probado' });
  }
  function tarjeta() {
    const c = ui.tarjeta('Ollama en este equipo', el('div', { class: 'col' }, [
      el('p', { class: 'note' }, 'Comprueba la IA local sin usar Claude. "Probar conexión" solo pregunta qué modelos hay; "Probar modelo" carga el más pequeño, le pide una respuesta de 8 tokens y lo descarga enseguida, siempre dentro del tope de memoria de la GPU.'),
      el('div', { class: 'row' }, [
        el('button', { type: 'button', class: 'btn btn-small', id: 'ol-conexion', onclick: e => probar('conexion', e.currentTarget) }, 'Probar conexión'),
        el('button', { type: 'button', class: 'btn btn-small', id: 'ol-modelo', onclick: e => probar('modelo', e.currentTarget) }, 'Probar modelo')
      ]),
      el('div', { id: 'ol-resultado', 'aria-live': 'polite' })
    ]), { id: 't-ol-prueba' });
    setTimeout(resultado);
    return c;
  }

  RA.ollamaPrueba = { tarjeta: tarjeta, ultimo: () => ultimo };
})(window.RA = window.RA || {});
