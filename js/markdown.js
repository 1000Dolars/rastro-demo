/* Markdown de las respuestas de Claude, pintado como nodos del DOM: nunca se interpreta como HTML, así que
   nada de lo que llegue en una respuesta puede colar HTML ni scripts. Cubre lo que Claude usa:
   títulos, párrafos, listas (con números y anidadas por sangría), citas, reglas, tablas, bloques de
   código con su lenguaje (y botón Copiar), código en línea, negrita, cursiva, tachado y enlaces
   (http/https: se abren en el navegador del sistema). */
(function (RA) {
  'use strict';

  const el = (t, a, k) => RA.ui.el(t, a, k);

  // ---- En línea ----
  // Trocea el texto en código, enlaces, negrita, cursiva y tachado. Devuelve nodos.
  function enLinea(texto) {
    const out = [];
    let t = String(texto), m;
    const RE = /(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)|\[([^\]\n]{1,300})\]\((https?:\/\/[^\s)]{1,2000})\)|(https?:\/\/[^\s<>()]{2,2000}[^\s<>().,;:!?'"])|\*\*([^*\n][\s\S]*?)\*\*|__([^_\n][\s\S]*?)__|(?:^|(?<=[\s(]))\*([^*\s][^*\n]*?)\*|(?:^|(?<=[\s(]))_([^_\s][^_\n]*?)_(?=[\s.,;:!?)]|$)|~~([^~\n]+)~~/;
    while (t && (m = RE.exec(t))) {
      if (m.index) out.push(document.createTextNode(t.slice(0, m.index)));
      if (m[1]) out.push(el('code', { class: 'md-c' }, m[2].replace(/^ (.*) $/, '$1')));
      else if (m[3]) out.push(enlace(m[4], enLinea(m[3])));
      else if (m[5]) out.push(enlace(m[5], [m[5]]));
      else if (m[6] || m[7]) out.push(el('strong', {}, enLinea(m[6] || m[7])));
      else if (m[8] || m[9]) out.push(el('em', {}, enLinea(m[8] || m[9])));
      else if (m[10]) out.push(el('del', {}, enLinea(m[10])));
      t = t.slice(m.index + m[0].length);
    }
    if (t) out.push(document.createTextNode(t));
    return out;
  }
  function enlace(url, kids) {
    return el('a', { href: url, class: 'md-a', title: url, onclick: e => { e.preventDefault(); if (RA.datos.abrirEnlace) RA.datos.abrirEnlace(url); else window.open(url, '_blank', 'noopener'); } }, kids);
  }

  // ---- Bloques ----
  function bloqueCodigo(codigo, lengua) {
    const btn = el('button', { type: 'button', class: 'btn btn-small md-copiar', onclick: () => RA.ui.copiar(codigo, 'Código', btn) }, 'Copiar');
    return el('div', { class: 'md-pre' }, [
      el('div', { class: 'md-pre-cab' }, [el('span', { class: 'label' }, lengua || 'texto'), btn]),
      el('pre', { tabindex: '0' }, el('code', {}, codigo))
    ]);
  }
  const fila = l => l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));

  // Convierte un texto Markdown en un fragmento. `parcial`: aún está llegando (un bloque de código sin cerrar se pinta igual).
  function pintar(texto) {
    const lineas = String(texto == null ? '' : texto).replace(/\r\n?/g, '\n').split('\n'), raiz = document.createDocumentFragment();
    let i = 0;
    const pila = [];         // listas abiertas: { sangria, nodo, tipo }
    const cerrarListas = sangria => { while (pila.length && pila[pila.length - 1].sangria >= sangria) pila.pop(); };
    const destino = () => pila.length ? pila[pila.length - 1].ultimo || pila[pila.length - 1].nodo : raiz;
    while (i < lineas.length) {
      const l = lineas[i];
      // Código entre ``` (o ~~~)
      const f = /^(\s*)(```+|~~~+)\s*([\w+#.-]*)/.exec(l);
      if (f) {
        const cierre = f[2], cod = [];
        i++;
        while (i < lineas.length && !new RegExp('^\\s*' + cierre.replace(/[~`]/g, '\\$&')).test(lineas[i])) cod.push(lineas[i++]);
        i++;
        (pila.length && f[1].length ? destino() : (cerrarListas(0), raiz)).appendChild(bloqueCodigo(cod.join('\n'), f[3]));
        continue;
      }
      if (!l.trim()) { i++; if (i < lineas.length && !/^\s+([-*+]|\d+[.)])\s/.test(lineas[i])) cerrarListas(0); continue; }
      // Título
      const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l);
      if (h) { cerrarListas(0); raiz.appendChild(el('h' + Math.min(6, h[1].length + 2), { class: 'md-h' }, enLinea(h[2]))); i++; continue; }
      // Regla
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) { cerrarListas(0); raiz.appendChild(el('hr', { class: 'md-hr' })); i++; continue; }
      // Tabla: cabecera | separador
      if (/\|/.test(l) && i + 1 < lineas.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lineas[i + 1])) {
        cerrarListas(0);
        const cab = fila(l), filas = [];
        i += 2;
        while (i < lineas.length && /\|/.test(lineas[i]) && lineas[i].trim()) filas.push(fila(lineas[i++]));
        raiz.appendChild(el('div', { class: 'md-tabla', tabindex: '0', role: 'region', 'aria-label': 'Tabla' }, el('table', {}, [
          el('thead', {}, el('tr', {}, cab.map(c => el('th', { scope: 'col' }, enLinea(c))))),
          el('tbody', {}, filas.map(fl => el('tr', {}, cab.map((_, k) => el('td', {}, enLinea(fl[k] || ''))))))
        ])));
        continue;
      }
      // Cita
      if (/^\s*>/.test(l)) {
        cerrarListas(0);
        const q = [];
        while (i < lineas.length && /^\s*>/.test(lineas[i])) q.push(lineas[i++].replace(/^\s*>\s?/, ''));
        raiz.appendChild(el('blockquote', { class: 'md-q' }, pintar(q.join('\n'))));
        continue;
      }
      // Elemento de lista
      const li = /^(\s*)([-*+]|(\d+)[.)])\s+(.*)$/.exec(l);
      if (li) {
        const sangria = li[1].length, tipo = li[3] ? 'ol' : 'ul';
        while (pila.length && (pila[pila.length - 1].sangria > sangria || (pila[pila.length - 1].sangria === sangria && pila[pila.length - 1].tipo !== tipo))) pila.pop();
        let tope = pila[pila.length - 1];
        if (!tope || tope.sangria < sangria) {
          const lista = el(tipo, { class: 'md-l' });
          if (tipo === 'ol' && li[3] && li[3] !== '1') lista.setAttribute('start', li[3]);
          (tope ? tope.ultimo || tope.nodo : raiz).appendChild(lista);
          tope = { sangria: sangria, nodo: lista, tipo: tipo };
          pila.push(tope);
        }
        const tarea = /^\[([ xX])\]\s+(.*)$/.exec(li[4]);
        const item = el('li', {}, tarea ? [el('span', { 'aria-hidden': 'true' }, tarea[1] === ' ' ? '☐ ' : '☑ '), ...enLinea(tarea[2])] : enLinea(li[4]));
        tope.nodo.appendChild(item);
        tope.ultimo = item;
        i++;
        // Líneas que siguen al elemento con sangría: son de ese elemento.
        while (i < lineas.length && lineas[i].trim() && /^\s{2,}\S/.test(lineas[i]) && !/^\s*([-*+]|\d+[.)])\s/.test(lineas[i]) && !/^\s*(```|~~~)/.test(lineas[i])) item.append(' ', ...enLinea(lineas[i++].trim()));
        continue;
      }
      // Párrafo: hasta una línea vacía o un bloque.
      cerrarListas(0);
      const p = [l];
      i++;
      while (i < lineas.length && lineas[i].trim() && !/^(\s*(```|~~~|>|#{1,6}\s|([-*+]|\d+[.)])\s))/.test(lineas[i]) && !(/\|/.test(lineas[i]) && i + 1 < lineas.length && /^\s*\|?\s*:?-{2,}/.test(lineas[i + 1]))) p.push(lineas[i++]);
      const nodo = el('p', { class: 'md-p' });
      p.forEach((x, k) => { if (k) nodo.appendChild(/ {2}$|\\$/.test(p[k - 1]) ? el('br') : document.createTextNode(' ')); enLinea(x.replace(/\\$/, '').trim()).forEach(n => nodo.appendChild(n)); });
      raiz.appendChild(nodo);
    }
    return raiz;
  }

  RA.markdown = { pintar: pintar, enLinea: enLinea };
})(window.RA = window.RA || {});
