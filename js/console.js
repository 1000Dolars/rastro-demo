/* Vista Consola: terminales reales (xterm.js en la interfaz, node-pty en el proceso principal), una por
   pestaña, en la carpeta de la sesión elegida. Cursor de bloque fijo (no parpadea: la interfaz tiene una
   sola animación continua), JetBrains Mono, colores del tema, ajuste al tamaño, enlaces que se abren en
   el navegador del sistema, y Ctrl+Mayús+C / Ctrl+Mayús+V para copiar y pegar.
   Se dibuja con el renderizador DOM de xterm, sin WebGL: no pide aceleración de la GPU. */
(function (RA) {
  'use strict';

  const ui = RA.ui, el = ui.el, $ = ui.$, D = RA.datos;
  const tabs = [];             // { id, term, fit, nodo, titulo, cwd, sesion, viva }
  let activa = null, abriendo = false, pendiente = null;   // pendiente: orden que se escribe al abrir la próxima

  /* Colores del tema. La paleta ANSI sigue a DESIGN.md: grises y un solo rojo. Lo que un programa pinte
     en verde, amarillo o azul se lee en un gris distinto, igual que el diff de Cambios no usa verde. */
  function tema() {
    const css = getComputedStyle(document.documentElement), v = k => css.getPropertyValue(k).trim();
    const t = { background: v('--bg'), foreground: v('--ink'), cursor: v('--red'), cursorAccent: v('--bg'), selectionBackground: v('--line-strong'), selectionForeground: v('--ink') };
    const gris = [v('--ink-3'), v('--ink-2'), v('--mark'), v('--ink-2'), v('--ink-3'), v('--ink-2'), v('--ink')];
    ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'].forEach((n, i) => {
      t[n] = n === 'red' ? v('--red-ink') : n === 'black' ? v('--line-strong') : gris[i - 1];
      t['bright' + n[0].toUpperCase() + n.slice(1)] = n === 'red' ? v('--red') : n === 'black' ? v('--edge') : v('--ink');
    });
    return t;
  }

  function nota(t) { $('#con-nota').textContent = t || ''; }

  function abrir() {
    if (!D.consola) return nota('La consola solo funciona en la app de escritorio: en la maqueta no hay terminal.');
    if (abriendo) return;
    abriendo = true;
    const s = RA.vistas.actual(), nodo = el('div', { class: 'con-term', role: 'tabpanel' });
    $('#con-cuerpo').appendChild(nodo);
    const term = new window.Terminal({ cursorStyle: 'block', cursorBlink: false, fontFamily: '"JetBrains Mono", Consolas, monospace', fontSize: 14, lineHeight: 1.2, scrollback: 5000, theme: tema(), allowProposedApi: false });
    const fit = new window.FitAddon.FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new window.WebLinksAddon.WebLinksAddon((ev, uri) => D.consola.enlace(uri)));
    term.open(nodo);
    try { fit.fit(); } catch (e) { /* aún sin tamaño */ }
    D.consola.abrir(s ? s.id : null, Math.max(2, term.cols), Math.max(2, term.rows)).then(r => {
      abriendo = false;
      if (!r || r.error) { term.dispose(); nodo.remove(); nota((r && r.error) || 'No se pudo abrir la terminal.'); return; }
      const t = { id: r.id, term: term, fit: fit, nodo: nodo, titulo: r.titulo, cwd: r.cwd, sesion: s ? s.nombre : 'sin sesión', viva: true };
      nodo.id = 'con-panel-' + r.id;
      nodo.setAttribute('aria-label', r.titulo + ' en ' + r.cwd);
      tabs.push(t);
      term.onData(d => { if (t.viva) D.consola.escribir(t.id, d); });
      term.onResize(z => { if (t.viva) D.consola.tamano(t.id, z.cols, z.rows); });
      // Copiar y pegar con Ctrl+Mayús; Ctrl+K sigue siendo la búsqueda de la app.
      term.attachCustomKeyEventHandler(e => {
        if (e.type !== 'keydown') return true;
        if (e.ctrlKey && e.shiftKey && e.code === 'KeyC') { if (term.hasSelection()) ui.copiar(term.getSelection(), 'Selección'); return false; }
        if (e.ctrlKey && e.shiftKey && e.code === 'KeyV') { D.consola.pegar().then(x => { if (typeof x === 'string' && x) term.paste(x); }); return false; }
        if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === D.ajustes.teclas.buscar) return false;
        return true;
      });
      nota(r.aviso || '');
      elegir(t.id, true);
      if (pendiente) { t.orden = t.lanzada = pendiente; pendiente = null; esperarOrden(t, 5000); }
    });
  }

  function elegir(id, foco) {
    activa = id;
    tabs.forEach(t => { t.nodo.hidden = t.id !== id; });
    pestanas();
    const t = tabs.filter(x => x.id === id)[0];
    if (t) { requestAnimationFrame(() => { try { t.fit.fit(); } catch (e) { /* oculta */ } if (foco) t.term.focus(); }); }
  }

  function cerrar(id) {
    const i = tabs.findIndex(t => t.id === id);
    if (i < 0) return;
    const t = tabs[i];
    if (t.viva && D.consola) D.consola.cerrar(t.id);
    t.term.dispose(); t.nodo.remove(); tabs.splice(i, 1);
    if (activa === id) activa = tabs.length ? tabs[Math.min(i, tabs.length - 1)].id : null;
    if (activa) elegir(activa, true); else { pestanas(); $('#con-nueva').focus(); }
    ui.decir('Terminal cerrada.');
  }

  // Pestañas: una sola parada de tabulador (flechas para moverse); cada una con su botón de cerrar.
  function pestanas() {
    ui.pintar($('#con-pestanas'), tabs.map((t, i) => el('div', { class: 'con-pes' + (t.id === activa ? ' act' : '') }, [
      el('button', { type: 'button', role: 'tab', id: 'con-tab-' + t.id, 'aria-selected': String(t.id === activa), 'aria-controls': 'con-panel-' + t.id, tabindex: t.id === activa ? '0' : '-1', title: t.cwd, onclick: () => elegir(t.id, true),
        onkeydown: e => { const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (d && tabs.length > 1) { e.preventDefault(); const n = tabs[(i + d + tabs.length) % tabs.length]; elegir(n.id); $('#con-tab-' + n.id).focus(); } }
      }, [el('span', {}, (i + 1) + ' · ' + t.titulo), el('span', { class: 'note' }, t.sesion), t.viva ? null : el('span', { class: 'note' }, '(terminada)')]),
      el('button', { type: 'button', class: 'con-x', 'aria-label': 'Cerrar la terminal ' + (i + 1), title: 'Cerrar', onclick: () => cerrar(t.id) }, ui.svg('svg', { viewBox: '0 0 16 16', width: 12, height: 12, 'aria-hidden': 'true' }, ui.svg('path', { d: 'M4 4l8 8M12 4l-8 8' })))
    ])));
    if (!tabs.length) nota(D.consola ? 'Sin terminales abiertas. "Nueva terminal" abre una en la carpeta de la sesión elegida.' : 'La consola solo funciona en la app de escritorio.');
  }

  /* Orden pendiente (Remote Control): se escribe cuando el intérprete deja de pintar su bienvenida (700 ms
     sin salida), o a los 5 s si no pinta nada. Escrita antes, el banner del intérprete se la puede comer. */
  function esperarOrden(t, ms) {
    clearTimeout(t.tOrden);
    t.tOrden = setTimeout(() => { if (t.orden && t.viva) D.consola.escribir(t.id, t.orden + '\r'); t.orden = null; }, ms);
  }
  if (D.consola) D.consola.alDatos(d => {
    const t = tabs.filter(x => x.id === d.id)[0];
    if (!t) return;
    if (d.datos) { t.term.write(d.datos); if (t.orden) esperarOrden(t, 700); }
    if (d.fin) { t.viva = false; t.term.write('\r\n[ proceso terminado' + (d.codigo != null ? ' · código ' + d.codigo : '') + ' ]\r\n'); pestanas(); }
  });
  $('#con-nueva').addEventListener('click', abrir);
  // Ajuste al tamaño del hueco, y colores al cambiar de tema.
  new ResizeObserver(() => { const t = tabs.filter(x => x.id === activa)[0]; if (t && !t.nodo.hidden && t.nodo.offsetParent) { try { t.fit.fit(); } catch (e) { /* oculta */ } } }).observe($('#con-cuerpo'));
  const retemar = () => { const th = tema(); tabs.forEach(t => { t.term.options.theme = th; }); };
  new MutationObserver(retemar).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', retemar);

  // Al entrar en la vista: si no hay ninguna terminal se abre una; si hay, se ajusta la activa. Los
  // repintados por datos nuevos no tocan la consola (no dependen de ellos y le quitarían el foco).
  const alEntrar = e => { if (e.detail !== 'consola') return; if (!tabs.length && D.consola && !abriendo) abrir(); else { pestanas(); if (activa) elegir(activa); } };
  // También al abrirse como panel junto a la conversación (js/panes.js).
  document.addEventListener('rastro:vista', alEntrar);
  document.addEventListener('rastro:panel', alEntrar);

  RA.consola = {
    abiertas: () => tabs.map(t => ({ id: t.id, viva: t.viva, cwd: t.cwd, lanzada: t.lanzada || '' })),
    // Cierra (y termina) las terminales que se abrieron con una orden que contiene `texto` (Remote Control).
    cerrarDe(texto) { const ids = tabs.filter(t => t.lanzada && t.lanzada.indexOf(texto) >= 0).map(t => t.id); ids.forEach(cerrar); return ids.length; },
    // Abre una terminal nueva en la carpeta de la sesión elegida y escribe en ella una orden (Remote Control).
    ejecutar(orden) {
      if (!D.consola) return;
      pendiente = orden;
      const habia = tabs.length;
      RA.app.ir('consola');
      if (habia && !abriendo) abrir();
    }
  };
})(window.RA = window.RA || {});
