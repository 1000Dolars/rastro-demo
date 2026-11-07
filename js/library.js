/* Biblioteca de prompts guardados: crear, editar, borrar, etiquetar e insertar en el campo de Chat con un
   clic. Se guarda en el almacenamiento local de la app (no sale del equipo). Es una capa modal como la
   búsqueda: atrapa el foco, Esc cierra y lo devuelve. */
(function (RA) {
  'use strict';

  const ui = RA.ui, el = ui.el, $ = ui.$;
  const CLAVE = 'rastro:biblioteca', TOPE = 300;
  const plano = t => String(t).toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

  function leer() {
    try { return (JSON.parse(localStorage.getItem(CLAVE)) || []).filter(p => p && typeof p.texto === 'string' && typeof p.id === 'string').map(p => ({ id: p.id, titulo: String(p.titulo || ''), texto: p.texto, etiquetas: (Array.isArray(p.etiquetas) ? p.etiquetas : []).filter(x => typeof x === 'string'), t: +p.t || 0 })); } catch (e) { return []; }
  }
  function escribir(lista) { try { localStorage.setItem(CLAVE, JSON.stringify(lista.slice(0, TOPE))); return true; } catch (e) { ui.decir('No se pudo guardar la biblioteca.'); return false; } }
  // "revisión, Pruebas ,revisión" -> ['revisión', 'pruebas']
  const etiquetas = t => Array.from(new Set(String(t).split(',').map(x => x.trim().toLowerCase()).filter(Boolean))).slice(0, 8);

  function abrir() {
    if (RA.capas.abierta()) return;
    const c = RA.capas.capa('Biblioteca de prompts', () => c.cerrar());
    c.caja.classList.add('biblio');
    let lista = leer(), q = '', tag = '', editando = null;

    function formulario(p) {
      const titulo = el('input', { id: 'bib-titulo', class: 'input', type: 'text', maxlength: '120', value: p.titulo, autocomplete: 'off' });
      const texto = el('textarea', { id: 'bib-texto', class: 'input', rows: '6', maxlength: '20000' }, p.texto);
      const tags = el('input', { id: 'bib-tags', class: 'input', type: 'text', maxlength: '200', value: p.etiquetas.join(', '), autocomplete: 'off', spellcheck: 'false' });
      const msg = el('p', { class: 'note', 'aria-live': 'polite' });
      const guardar = ev => {
        ev.preventDefault();
        if (!texto.value.trim()) { msg.textContent = 'El prompt está vacío.'; texto.focus(); return; }
        const nuevo = { id: p.id || 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), titulo: titulo.value.trim() || texto.value.trim().split('\n')[0].slice(0, 60), texto: texto.value, etiquetas: etiquetas(tags.value), t: Date.now() };
        lista = [nuevo].concat(lista.filter(x => x.id !== nuevo.id));
        if (escribir(lista)) { ui.decir('Prompt guardado en la biblioteca.'); editando = null; pintar(); }
      };
      return el('form', { class: 'col', novalidate: true, onsubmit: guardar }, [
        el('h3', { class: 'label' }, p.id ? 'Editar prompt' : 'Nuevo prompt'),
        el('div', { class: 'campo' }, [el('label', { class: 'label', for: 'bib-titulo' }, 'Título'), titulo]),
        el('div', { class: 'campo' }, [el('label', { class: 'label', for: 'bib-texto' }, 'Prompt'), texto]),
        el('div', { class: 'campo' }, [el('label', { class: 'label', for: 'bib-tags' }, 'Etiquetas, separadas por comas'), tags,
          window.rastro ? el('button', { type: 'button', class: 'btn btn-small', id: 'bib-sugerir', onclick: () => { msg.textContent = 'Pensando…'; window.rastro.asistentesEtiquetas(texto.value).then(r => { msg.textContent = r && r.etiquetas ? 'Etiquetas sugeridas por ' + r.modelo + '.' : (r && r.error) || ''; if (r && r.etiquetas) tags.value = r.etiquetas.join(', '); }, () => { msg.textContent = 'No se pudo.'; }); } }, 'Sugerir etiquetas') : null]),
        msg,
        el('div', { class: 'row between' }, [
          el('button', { type: 'button', class: 'btn', onclick: () => { editando = null; pintar(); } }, 'Cancelar'),
          el('button', { type: 'submit', class: 'btn btn-primary', id: 'bib-guardar' }, 'Guardar')
        ])
      ]);
    }

    function pintar() {
      if (editando) { ui.pintar(c.caja, formulario(editando)); $('#bib-titulo', c.caja).focus(); return; }
      const todas = Array.from(new Set([].concat.apply([], lista.map(p => p.etiquetas)))).sort();
      const palabras = plano(q).split(/\s+/).filter(Boolean);
      const vistos = lista.filter(p => (!tag || p.etiquetas.indexOf(tag) >= 0) && palabras.every(w => plano(p.titulo + ' ' + p.texto + ' ' + p.etiquetas.join(' ')).indexOf(w) >= 0));
      const buscar = el('input', { id: 'bib-q', class: 'input', type: 'text', value: q, placeholder: 'Buscar en la biblioteca…', 'aria-label': 'Buscar en la biblioteca', autocomplete: 'off', spellcheck: 'false' });
      buscar.addEventListener('input', () => { q = buscar.value; pintarLista(); });
      const filtro = el('div', { id: 'bib-tags-f', class: 'badges', role: 'group', 'aria-label': 'Filtrar por etiqueta' }, todas.map(t => el('button', { type: 'button', class: 'btn btn-small', 'aria-pressed': String(tag === t), onclick: () => { tag = tag === t ? '' : t; pintar(); } }, t)));
      const caja = el('ul', { id: 'bib-lista', class: 'lista' });
      function pintarLista() {
        const pal = plano(q).split(/\s+/).filter(Boolean);
        const v = lista.filter(p => (!tag || p.etiquetas.indexOf(tag) >= 0) && pal.every(w => plano(p.titulo + ' ' + p.texto + ' ' + p.etiquetas.join(' ')).indexOf(w) >= 0));
        ui.pintar(caja, v.length ? v.map(p => el('li', { class: 'bib-item' }, [
          el('div', { class: 'crece col' }, [
            el('span', {}, p.titulo),
            el('span', { class: 'note bib-texto' }, p.texto.slice(0, 200)),
            p.etiquetas.length ? el('div', { class: 'badges' }, p.etiquetas.map(t => ui.insignia(t))) : null
          ]),
          el('div', { class: 'row' }, [
            el('button', { type: 'button', class: 'btn btn-small', 'data-insertar': p.id, onclick: () => { c.cerrar(); RA.app.ir('chat'); RA.chat.insertar(p.texto); ui.decir('Prompt insertado.'); } }, 'Insertar'),
            el('button', { type: 'button', class: 'btn btn-small', onclick: () => { editando = p; pintar(); } }, 'Editar'),
            ui.armar(el('button', { type: 'button', class: 'btn btn-small', 'data-borrar': p.id }, 'Borrar'), '¿Borrar?', () => { lista = lista.filter(x => x.id !== p.id); escribir(lista); ui.decir('Prompt borrado.'); pintar(); })
          ])
        ])) : el('li', { class: 'note' }, lista.length ? 'Ningún prompt coincide.' : 'La biblioteca está vacía. Guarda aquí los prompts que repites.'));
      }
      pintarLista();
      ui.pintar(c.caja, [
        el('div', { class: 'row between' }, [el('h2', { class: 'chica' }, 'Biblioteca'), el('span', { class: 'label' }, vistos.length + ' de ' + lista.length)]),
        buscar, todas.length ? filtro : null, caja,
        el('div', { class: 'row between' }, [
          el('button', { type: 'button', class: 'btn', onclick: () => c.cerrar() }, 'Cerrar'),
          el('div', { class: 'row' }, [
            RA.chat && RA.chat.texto().trim() ? el('button', { type: 'button', class: 'btn', id: 'bib-guardar-campo', onclick: () => { editando = { id: '', titulo: '', texto: RA.chat.texto().trim(), etiquetas: [] }; pintar(); } }, 'Guardar lo escrito') : null,
            el('button', { type: 'button', class: 'btn btn-primary', id: 'bib-nuevo', onclick: () => { editando = { id: '', titulo: '', texto: '', etiquetas: [] }; pintar(); } }, 'Nuevo')
          ])
        ])
      ]);
      buscar.focus();
    }
    pintar();
  }

  RA.biblioteca = { abrir: abrir, leer: leer, escribir: escribir };
})(window.RA = window.RA || {});
