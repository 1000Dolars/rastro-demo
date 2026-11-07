/* Comentarios en el diff (panel Cambios), como en Claude Code Desktop: pasa el cursor por una línea y
   pulsa "+" para comentarla; el comentario se envía a la sesión con Ctrl+Enter, por el mismo camino que el
   compositor (el reparto de Rastro). Con el teclado, cada bloque tiene "Comentar" (primera línea del bloque,
   que se puede cambiar). El borrador sobrevive a los repintados del diff con datos nuevos. */
(function (RA) {
  'use strict';

  const ui = RA.ui, el = ui.el, $ = ui.$;
  // Borrador abierto: { archivo, linea, cita, texto }
  let B = null, mas = null, fila = null;

  const archivoDe = d => { const a = d && d.getAttribute('aria-label'); const m = a && /^Cambio en (.+) por /.exec(a); return m ? m[1] : ''; };
  const numDe = l => { const ns = l.querySelectorAll('.n'); for (let i = ns.length - 1; i >= 0; i--) if (ns[i].dataset.n) return +ns[i].dataset.n; return 0; };
  const textoDe = l => { const t = l.querySelector('.t'); return t ? t.textContent.replace(/^(Añadida|Eliminada): /, '') : ''; };

  function abrir(diff, linea, num) {
    B = { archivo: archivoDe(diff), linea: num, cita: linea ? textoDe(linea) : '', texto: B && B.texto && B.archivo === archivoDe(diff) ? B.texto : '' };
    colocar(true);
  }
  function cerrar() { B = null; const f = $('#cmt-form'); if (f) f.remove(); }

  function mensaje() {
    return 'Comentario de revisión sobre ' + B.archivo + (B.linea ? ', línea ' + B.linea : '') + ':\n' + (B.cita ? '> ' + B.cita.slice(0, 300) + '\n' : '') + B.texto.trim();
  }
  function enviar() {
    if (!B || !B.texto.trim()) return ui.decir('Escribe primero el comentario.', 'atencion');
    if (!RA.chat || !RA.chat.enviarTexto) return ui.decir('No se pudo enviar el comentario.', 'error');
    const r = RA.chat.enviarTexto(mensaje());
    // Si salió (o quedó en marcha), el borrador se cierra; si no, se queda para reintentar.
    Promise.resolve(r).then(() => { if (RA.chat.ultimoEnvioOk && RA.chat.ultimoEnvioOk()) { cerrar(); ui.decir('Comentario enviado a la sesión.', 'ok'); } });
  }

  // Pone el formulario bajo su línea (o al principio del bloque). Tras un repintado se vuelve a poner.
  function colocar(foco) {
    if (!B) return;
    const caja = $('#cam-diff');
    if (!caja) return;
    const diff = [...caja.querySelectorAll('.diff')].find(d => archivoDe(d) === B.archivo);
    if (!diff) return;
    const lineas = [...diff.querySelectorAll('.dl')], linea = lineas.find(l => numDe(l) === B.linea) || null;
    let f = $('#cmt-form');
    if (!f) {
      const area = el('textarea', { id: 'cmt-texto', class: 'input cmt-texto', rows: '3', placeholder: 'Qué quieres que cambie aquí…', 'aria-describedby': 'cmt-ayuda' });
      area.addEventListener('input', () => { if (B) B.texto = area.value; });
      area.addEventListener('keydown', e => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); enviar(); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); const d = diff; cerrar(); d.focus(); }
      });
      const num = el('input', { id: 'cmt-linea', class: 'input cmt-linea', type: 'number', min: '1', inputmode: 'numeric' });
      num.addEventListener('change', () => { if (B) B.linea = Math.max(1, +num.value || 1); const l = lineas.find(x => numDe(x) === B.linea); B.cita = l ? textoDe(l) : ''; });
      f = el('form', { id: 'cmt-form', class: 'cmt-form', onsubmit: e => { e.preventDefault(); enviar(); } }, [
        el('div', { class: 'row' }, [el('label', { class: 'label', for: 'cmt-linea' }, 'Línea'), num, el('span', { class: 'note' }, 'de ' + B.archivo)]),
        el('label', { class: 'sr', for: 'cmt-texto' }, 'Comentario sobre ' + B.archivo), area,
        el('div', { class: 'row between' }, [
          el('p', { id: 'cmt-ayuda', class: 'note' }, 'Ctrl+Enter lo envía a la sesión · Esc cancela'),
          el('div', { class: 'row' }, [el('button', { type: 'button', class: 'btn btn-small', onclick: () => cerrar() }, 'Cancelar'), el('button', { type: 'submit', class: 'btn btn-small' }, 'Enviar comentario')])
        ])
      ]);
    }
    f.querySelector('#cmt-linea').value = B.linea || '';
    f.querySelector('#cmt-texto').value = B.texto;
    const ancla = linea || diff.querySelector('.diff-cab');
    if (ancla && ancla.nextSibling !== f) ancla.after(f);
    if (foco) f.querySelector('#cmt-texto').focus();
  }

  // Botón "+" flotante: uno solo, que sigue a la línea bajo el cursor.
  function montar() {
    const caja = $('#cam-diff');
    if (!caja) return;
    mas = el('button', { type: 'button', class: 'cmt-mas', tabindex: '-1', 'aria-label': 'Comentar esta línea', title: 'Comentar esta línea', hidden: true }, ui.icono('mas-signo'));
    mas.addEventListener('click', () => { if (fila) abrir(fila.closest('.diff'), fila, numDe(fila)); });
    caja.addEventListener('pointerover', e => {
      const l = e.target.closest && e.target.closest('.dl');
      if (!l || !caja.contains(l) || !numDe(l)) return;
      fila = l; mas.hidden = false;
      if (mas.parentNode !== l) l.prepend(mas);
    });
    caja.addEventListener('pointerleave', () => { mas.hidden = true; });
    // Cada repintado del diff: botón "Comentar" en cada bloque (camino de teclado) y el borrador en su sitio.
    new MutationObserver(() => {
      [...caja.querySelectorAll('.diff')].forEach(d => {
        const cab = d.querySelector('.diff-cab .row');
        if (cab && !cab.querySelector('.cmt-bloque') && d.querySelector('.dl')) cab.prepend(el('button', { type: 'button', class: 'btn btn-small cmt-bloque', 'aria-label': 'Comentar el cambio en ' + archivoDe(d), onclick: () => { const l = d.querySelector('.dl.mas-l') || d.querySelector('.dl'); abrir(d, l, numDe(l)); } }, 'Comentar'));
      });
      if (B && !caja.querySelector('#cmt-form')) colocar(false);
    }).observe(caja, { childList: true });
  }

  RA.comentarios = { borrador: () => B, cerrar: cerrar };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar); else montar();
})(window.RA = window.RA || {});
