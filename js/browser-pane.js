/* Panel Navegador: vista previa de la app en ejecución, como en Claude Code Desktop, limitada en esta fase a
   direcciones de este equipo (localhost, 127.0.0.1, [::1]). La página se pinta en una vista nativa del
   proceso principal (WebContentsView, sin cookies guardadas ni permisos) que se coloca encima del hueco de
   este panel; aquí van la barra (atrás, adelante, recargar, dirección y servidores de desarrollo) y el ⋮.
   En la maqueta no hay proceso principal: el panel dice por qué no puede enseñar nada.
   Archivos (opción A, docs/REDISENO-ABRIL.md): un clic en una ruta HTML, PDF o de vídeo de la conversación la abre aquí,
   solo si está en la carpeta de la sesión; el HTML sin JavaScript ni red. "Abrir con la app del sistema" en el ⋮. */
(function (RA) {
  'use strict';

  const ui = RA.ui, el = ui.el, $ = ui.$, D = RA.datos;
  const N = { url: '', titulo: '', cargando: false, error: '', atras: false, adelante: false, archivo: null };
  const NOTA = { html: 'HTML de la carpeta de la sesión, sin JavaScript ni red. Para verlo entero, ábrelo con la app del sistema (⋮).',
    pdf: 'PDF de la carpeta de la sesión, sin red.', video: 'Vídeo de la carpeta de la sesión, sin red.' };
  let hueco = null, visible = false, ultimo = '';

  const MOTIVO_COOKIES = 'Las cookies se borran al cerrar la vista previa. Guardarlas necesita tu confirmación.';
  const MOTIVO_VERIFICAR = 'Haría que Claude abra y revise la página tras cada cambio: necesita tu confirmación.';
  const esLocal = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(x.hostname); } catch (e) { return false; } };
  // Lo que se escribe sin protocolo ("localhost:5173") se entiende como http.
  const normal = t => { t = String(t || '').trim(); if (/^\d{2,5}$/.test(t)) t = 'localhost:' + t; return /^[a-z]+:\/\//i.test(t) ? t : 'http://' + t; };

  function ir(texto) {
    const u = normal(texto);
    if (!esLocal(u)) return ui.decir('En esta fase el Navegador solo abre direcciones de este equipo (localhost). Los sitios externos esperan tu confirmación.', 'atencion');
    if (!D.navegador) return;
    N.error = ''; N.url = u; pintar();
    Promise.resolve(D.navegador.ir(u)).then(r => { if (r && r.error) { N.error = r.error; pintar(); } });
  }

  // Abre en el panel un archivo de la carpeta de la sesión (ruta relativa a ella, como la escribe la conversación).
  function abrirArchivo(ruta) {
    const s = RA.vistas && RA.vistas.actual();
    if (!s) return;
    RA.paneles.abrir('navegador', true);
    if (!D.navegador || !D.navegador.archivo) return ui.decir('La vista previa de archivos solo funciona en la app de escritorio.', 'atencion');
    Promise.resolve(D.navegador.archivo(s.id, ruta)).then(r => {
      if (r && r.error) { N.error = r.error; pintar(); return ui.decir(r.error, 'atencion'); }
      ui.decir('Vista previa de ' + (r && r.rel ? r.rel : ruta) + ' en el Navegador.', { toast: false });
    });
  }

  // Coloca la vista nativa sobre el hueco, o la esconde si el hueco no se ve o algo flota encima.
  function encajar() {
    if (!D.navegador || !hueco) return;
    const r = hueco.getBoundingClientRect(), tapado = !!(ui.menu.abierto || ($('#capa') && $('#capa').childElementCount) || document.querySelector('.barra-menu:not(.ui-menu)'));
    const ver = !!N.url && !N.error && hueco.isConnected && hueco.offsetParent !== null && r.width > 20 && r.height > 20 && !tapado;
    const clave = [ver, Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)].join(',');
    if (clave === ultimo) return;
    ultimo = clave; visible = ver;
    D.navegador.marco(ver ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null);
  }
  let pendiente = false;
  const encajarLuego = () => { if (pendiente) return; pendiente = true; requestAnimationFrame(() => { pendiente = false; encajar(); }); };

  function servidores(boton) {
    if (!D.navegador) return;
    const s = RA.vistas.actual();
    Promise.resolve(D.navegador.servidores(s ? s.id : null)).then(r => {
      const l = (r && r.lista) || [];
      const de = l.filter(x => x.deLaSesion), otros = l.filter(x => !x.deLaSesion);
      const ops = [];
      if (!l.length) ops.push({ texto: (r && r.motivo) || 'No hay ningún servidor escuchando en este equipo.', desactivado: 'Arranca el servidor de desarrollo y vuelve a mirar.' });
      de.forEach(x => ops.push({ texto: 'localhost:' + x.puerto + (x.proceso ? ' · ' + x.proceso : ''), ayuda: 'De la carpeta de esta sesión', fn: () => ir(x.url) }));
      if (de.length && otros.length) ops.push('-');
      otros.forEach(x => ops.push({ texto: 'localhost:' + x.puerto + (x.proceso ? ' · ' + x.proceso : ''), ayuda: 'Otro programa de este equipo', fn: () => ir(x.url) }));
      ui.menu(boton, ops);
      encajar();
    });
  }

  function barra() {
    const sin = !D.navegador;
    const b = (id, ico, nombre, fn, off) => el('button', { type: 'button', id: id, class: 'icono panel-b', 'aria-label': nombre, title: nombre, 'aria-disabled': off ? 'true' : null, onclick: () => off ? null : fn() }, ui.icono(ico));
    const campo = el('input', { id: 'nav-url', class: 'input nav-url', type: 'text', inputmode: 'url', spellcheck: 'false', autocomplete: 'off', placeholder: 'localhost:5173', 'aria-label': 'Dirección (solo localhost)', disabled: sin });
    const form = el('form', { class: 'nav-form', onsubmit: e => { e.preventDefault(); ir(campo.value); } }, campo);
    const srv = el('button', { type: 'button', id: 'nav-servidores', class: 'btn btn-small', 'aria-haspopup': 'menu', 'aria-expanded': 'false', disabled: sin, onclick: e => servidores(e.currentTarget) }, 'Elegir servidor');
    return el('div', { class: 'nav-barra' }, [
      b('nav-atras', 'atras', 'Ir atrás', () => D.navegador.historia(-1), sin || !N.atras),
      b('nav-adelante', 'adelante', 'Ir adelante', () => D.navegador.historia(1), sin || !N.adelante),
      b('nav-recargar', N.cargando ? 'cerrar' : 'recargar', N.cargando ? 'Detener la carga' : 'Recargar la página', () => D.navegador.recargar(N.cargando), sin || !N.url),
      form, N.archivo ? ui.insignia('Archivo local', 'nav-local') : null, el('span', { class: 'pan-mas-caja' }, srv)
    ]);
  }

  function cuerpo() {
    if (!D.navegador) return el('div', { class: 'nav-vacio' }, [el('p', {}, 'La vista previa solo funciona en la app de escritorio.'), el('p', { class: 'note' }, 'Aquí, con datos de muestra, no hay ningún servidor que enseñar.')]);
    if (N.error) return el('div', { class: 'nav-vacio', role: 'alert' }, [el('p', { class: 'mal' }, N.error), el('p', { class: 'note' }, 'Comprueba que el servidor de desarrollo esté arrancado y vuelve a intentarlo.'), el('button', { type: 'button', class: 'btn btn-small', onclick: () => ir(N.url) }, 'Reintentar')]);
    if (!N.url) return el('div', { class: 'nav-vacio' }, [el('p', {}, 'Elige un servidor de desarrollo o escribe una dirección de localhost.'), el('p', { class: 'note' }, 'En esta fase solo se abren direcciones de este equipo; los sitios externos esperan tu confirmación.')]);
    return null;
  }

  function pintar() {
    const caja = $('#navegador');
    if (!caja) return;
    const enfocado = document.activeElement && document.activeElement.id === 'nav-url' ? $('#nav-url').value : null;
    const v = cuerpo();
    hueco = el('div', { id: 'nav-hueco', class: 'nav-hueco', 'aria-label': N.titulo ? 'Vista previa: ' + N.titulo : 'Vista previa', role: 'region', hidden: !!v });
    ui.pintar(caja, [barra(), N.archivo && !v ? el('p', { class: 'note nav-nota', id: 'nav-nota' }, NOTA[N.archivo.tipo] || NOTA.html) : null, v, hueco,
      el('p', { class: 'sr', 'aria-live': 'polite' }, N.cargando ? 'Cargando ' + (N.archivo ? N.archivo.rel : N.url) : '')]);
    const campo = $('#nav-url');
    if (enfocado != null) { campo.value = enfocado; campo.focus(); } else campo.value = N.archivo ? N.archivo.rel : N.url ? N.url.replace(/^http:\/\//, '') : '';
    ultimo = '';
    encajarLuego();
  }

  function montar(c) {
    c.appendChild(el('div', { id: 'navegador', class: 'navegador' }));
    pintar();
    new ResizeObserver(encajarLuego).observe(c);
  }

  function menu() {
    return [
      { texto: 'Verificar cambios automáticamente', marcado: false, desactivado: MOTIVO_VERIFICAR },
      { texto: 'Mantener cookies', marcado: false, desactivado: MOTIVO_COOKIES },
      '-',
      { texto: 'Abrir con la app del sistema', id: 'nav-fuera', desactivado: !D.navegador ? 'Solo en la app de escritorio.' : !N.archivo ? 'Solo con un archivo de la sesión a la vista.' : null,
        fn: () => Promise.resolve(D.navegador.fuera()).then(r => r && r.error ? ui.decir(r.error, 'atencion') : ui.decir('Abierto con la app del sistema: ' + (r && r.rel) + '.', 'ok')) },
      { texto: 'Borrar datos de navegación', desactivado: D.navegador ? null : 'Solo en la app de escritorio.', fn: () => Promise.resolve(D.navegador.borrar()).then(() => ui.decir('Datos de navegación borrados.', 'ok')) }
    ];
  }

  // Estado que manda el proceso principal (dirección, título, carga, error, archivo a la vista).
  function recibir(d) { Object.assign(N, d); pintar(); }

  function montarTodo() {
    if (!RA.paneles) return;
    RA.paneles.registrar('navegador', { montar: montar, pintar: () => {}, menu: menu, alCerrar: () => { if (D.navegador) D.navegador.cerrar(); N.url = ''; N.error = ''; N.archivo = null; hueco = null; ultimo = ''; } });
    // Cualquier cambio de disposición mueve el hueco: se vuelve a colocar la vista.
    ['resize', 'scroll'].forEach(ev => addEventListener(ev, encajarLuego, true));
    new MutationObserver(encajarLuego).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class', 'style'] });
    if (D.navegador) D.navegador.alEstado(recibir);
  }

  RA.navegador = { estado: N, ir: ir, abrirArchivo: abrirArchivo, recibir: recibir, visible: () => visible };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montarTodo); else montarTodo();
})(window.RA = window.RA || {});
