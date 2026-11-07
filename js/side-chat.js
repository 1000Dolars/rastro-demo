/* Chat lateral (Ctrl+;), como en Claude Code Desktop: preguntas sobre la sesión elegida que leen su hilo
   principal pero no escriben en él. El historial vive solo en memoria (no se guarda en disco ni en el
   almacenamiento del navegador): al cerrar la app desaparece. Responde quien decida el reparto de Rastro
   (modelo local, APIs, agentes o Claude), o el destino que se fuerce en el selector. */
(function (RA) {
  'use strict';

  const ui = RA.ui, el = ui.el, $ = ui.$, D = RA.datos;
  const hilos = {};                // sesión -> [{ rol: 'yo' | 'ia' | 'error', texto, quien, motivo }]
  let pensando = false, destino = 'auto';
  const DESTINOS = [['auto', 'Automático · reparto de Rastro'], ['barato', 'Modelo barato'], ['claude', 'Claude']];

  const sesion = () => RA.vistas && RA.vistas.actual();

  /* Ctrl+; (⌘; en macOS). Vale la tecla que escribe ";" aunque pida Mayús, como en los teclados latinoamericano
     y español (Mayús+,), y también la tecla física de ";" en el teclado de EE. UU. (la ñ en esos teclados). */
  const MAC = /Mac/i.test(navigator.platform || '');
  const esAtajo = e => (MAC ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey) && !e.altKey &&
    (e.key === ';' || (e.code === 'Semicolon' && !e.shiftKey));

  function mensajes(s) {
    const h = hilos[s.id] || [];
    if (!h.length) return el('p', { class: 'note lat-vacio' }, 'Pregunta lo que quieras sobre ' + s.nombre + '. El chat lateral lee su conversación, pero no escribe en ella y no se guarda.');
    return el('ol', { class: 'lat-lista', 'aria-label': 'Mensajes del chat lateral' }, h.map(m => el('li', { class: 'lat-msg ' + m.rol }, [
      el('p', { class: 'label' }, m.rol === 'yo' ? 'Tú' : m.rol === 'error' ? 'No se pudo responder' : m.quien || 'Respuesta'),
      el('div', { class: m.rol === 'error' ? 'mal' : 'lat-texto' }, RA.markdown && m.rol === 'ia' ? RA.markdown.pintar(m.texto) : m.texto),
      m.motivo && m.rol !== 'yo' ? el('p', { class: 'note lat-motivo' }, 'Reparto: ' + m.motivo) : null
    ])));
  }

  function enviar(texto) {
    const s = sesion();
    texto = String(texto || '').trim();
    if (!s || !texto || pensando) return;
    if (!D.lateral) return ui.decir('El chat lateral necesita la app de escritorio: en la maqueta no hay ningún modelo al que preguntar.', 'atencion');
    const h = hilos[s.id] = hilos[s.id] || [];
    const historial = h.filter(m => m.rol !== 'error').map(m => ({ rol: m.rol, texto: m.texto }));
    h.push({ rol: 'yo', texto: texto });
    pensando = true; pintar();
    Promise.resolve(D.lateral(s.id, texto, historial, destino === 'auto' ? null : destino)).then(r => {
      pensando = false;
      if (r && r.texto) h.push({ rol: 'ia', texto: r.texto, quien: r.quien, motivo: r.motivo });
      else h.push({ rol: 'error', texto: (r && r.error) || 'No llegó ninguna respuesta.', motivo: r && r.motivo });
      pintar();
      ui.decir('Chat lateral: ' + (r && r.texto ? 'respuesta de ' + r.quien + '.' : 'no se pudo responder.'), { toast: false });
    }, () => { pensando = false; h.push({ rol: 'error', texto: 'No se pudo preguntar.' }); pintar(); });
  }

  function pintar() {
    const caja = $('#lateral');
    if (!caja) return;
    const s = sesion();
    if (!s) return ui.pintar(caja, el('p', { class: 'note' }, 'Elige una sesión para preguntar sobre ella.'));
    const borrador = $('#lat-texto') ? $('#lat-texto').value : '', tenia = document.activeElement && document.activeElement.id === 'lat-texto';
    const campo = el('textarea', { id: 'lat-texto', class: 'input lat-campo', rows: '3', placeholder: 'Pregunta sobre esta sesión…', 'aria-describedby': 'lat-ayuda', disabled: pensando });
    campo.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(campo.value); } });
    const sel = el('select', { id: 'lat-destino', class: 'select lat-destino', 'aria-label': 'Quién responde' }, DESTINOS.map(d => el('option', { value: d[0], selected: d[0] === destino }, d[1])));
    sel.addEventListener('change', () => { destino = sel.value; });
    ui.pintar(caja, [
      el('p', { class: 'note lat-sesion' }, ['Sobre ', el('b', {}, s.nombre), '. No escribe en la conversación principal y no se guarda.']),
      el('div', { class: 'lat-hilo', tabindex: '0', role: 'log', 'aria-label': 'Conversación del chat lateral' }, mensajes(s)),
      pensando ? el('p', { class: 'label' }, 'Pensando') : null,
      el('form', { class: 'lat-form', onsubmit: e => { e.preventDefault(); enviar(campo.value); } }, [
        el('label', { class: 'sr', for: 'lat-texto' }, 'Pregunta para el chat lateral'), campo,
        el('div', { class: 'row between' }, [sel, el('button', { type: 'submit', class: 'btn btn-small', disabled: pensando }, pensando ? 'Respondiendo' : 'Preguntar')]),
        el('p', { id: 'lat-ayuda', class: 'note' }, 'Enter pregunta · Mayús+Enter salto de línea')
      ])
    ]);
    $('#lat-texto').value = pensando ? '' : borrador;
    if (tenia || pensando === false && caja.dataset.recien) { $('#lat-texto').focus(); delete caja.dataset.recien; }
    const hilo = caja.querySelector('.lat-hilo'); hilo.scrollTop = hilo.scrollHeight;
  }

  function montarTodo() {
    if (!RA.paneles) return;
    RA.paneles.registrar('lateral', { montar: c => { c.appendChild(el('div', { id: 'lateral', class: 'lateral', 'data-recien': '1' })); pintar(); }, pintar: () => { if (!$('#lateral') || !$('#lateral').contains(document.activeElement)) pintar(); } });
    // Ctrl+; abre (o cierra) el chat lateral; ⌘; en macOS (code.claude.com/docs/en/desktop, "Keyboard shortcuts").
    addEventListener('keydown', e => {
      if (!esAtajo(e) || !RA.app) return;
      e.preventDefault(); e.stopPropagation();
      if (RA.paneles.abiertos().includes('lateral')) RA.paneles.cerrar('lateral');
      else { RA.paneles.abrir('lateral'); const c = $('#lat-texto'); if (c) c.focus(); }
    }, true);
  }

  RA.lateral = { hilos: hilos, enviar: enviar };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montarTodo); else montarTodo();
})(window.RA = window.RA || {});
