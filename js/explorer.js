/* Vista Archivos: el árbol de la carpeta de trabajo de la sesión elegida en la franja. La interfaz no
   toca el disco: cada cosa se pide al proceso principal (RA.datos.fs) con una ruta relativa a esa
   carpeta, y allí se valida. A diferencia de las otras vistas guarda estado propio (qué carpetas están
   abiertas, qué elemento está elegido, qué se está editando), porque el árbol se pide a trozos.
   Se refresca solo: el proceso principal vigila la carpeta mientras la vista está abierta, y las
   sesiones que tocan un archivo también lo marcan (RA.datos.fs.sucio). */
(function (RA) {
  'use strict';

  const ui = RA.ui, el = ui.el, $ = ui.$, D = RA.datos, G = RA.glifos;
  /* sesion: de quién es la carpeta abierta (undefined: aún no se abrió). abiertas: carpetas desplegadas.
     hijos: lo listado de cada una ({ items: [{ n, d }], mas, ignoradas }). sel: el elemento elegido, ''
     es la carpeta de trabajo. editar: { modo: 'archivo' | 'carpeta' | 'renombrar', rel, dir, valor }. */
  const F = { sesion: undefined, base: '', nombre: '', error: '', cargando: false, abiertas: new Set(), hijos: {}, sel: '', ocultas: false, editar: null, msg: null, turno: 0 };
  const padre = rel => rel.split('/').slice(0, -1).join('/');
  const nombre = rel => rel.split('/').pop();
  const item = rel => ((F.hijos[padre(rel)] || {}).items || []).filter(x => x.n === nombre(rel))[0];
  const esCarpeta = rel => !rel || !!(item(rel) || {}).d;
  const dentro = (rel, de) => rel === de || rel.indexOf(de + '/') === 0;
  const nodo = rel => $('#arch-arbol [data-rel="' + CSS.escape(rel) + '"]');
  const aviso = (texto, error) => { F.msg = { texto: texto, error: !!error }; const m = $('#arch-msg'); if (m) pintaMsg(m); ui.decir(texto); };
  const pintaMsg = m => ui.pintar(m, F.msg ? (F.msg.error ? el('span', { class: 'mal' }, F.msg.texto) : F.msg.texto) : null);

  // ---- Pedidos al proceso principal ----
  // Abre una carpeta de trabajo (la de la sesión o la elegida en el diálogo) y lista su raíz.
  function abrir(pedido) {
    const t = ++F.turno;
    F.cargando = true; F.error = ''; F.editar = null; F.msg = null;
    dibujar();
    return Promise.resolve(pedido()).then(r => {
      if (t !== F.turno) return;
      F.cargando = false;
      if (r && r.cancelado) return dibujar();
      if (!r || r.error) { F.base = ''; F.nombre = ''; F.error = (r && r.error) || 'No se pudo abrir la carpeta.'; return dibujar(); }
      F.base = r.base; F.nombre = r.nombre; F.abiertas = new Set(); F.hijos = {}; F.sel = ''; F.soloLectura = !!r.soloLectura;
      return recargar();
    });
  }
  // Vuelve a listar la raíz y cada carpeta abierta. Las que ya no existen se pliegan.
  function recargar() {
    const t = F.turno, rels = [''].concat(Array.from(F.abiertas));
    return Promise.all(rels.map(r => Promise.resolve(D.fs.listar(r, F.ocultas)))).then(res => {
      if (t !== F.turno) return;
      F.hijos = {};
      rels.forEach((r, i) => {
        if (res[i] && !res[i].error) F.hijos[r] = res[i];
        else if (r) F.abiertas.delete(r);
        else F.error = (res[i] && res[i].error) || 'No se pudo leer la carpeta.';
      });
      if (F.hijos['']) F.error = '';
      while (F.sel && !item(F.sel)) F.sel = padre(F.sel);      // lo elegido desapareció: queda su carpeta
      dibujar();
    });
  }
  function plegar(rel, cerrar) {
    if (cerrar) {
      F.abiertas.forEach(r => { if (dentro(r, rel)) F.abiertas.delete(r); });
      if (dentro(F.sel, rel)) F.sel = rel;
      return dibujar();
    }
    F.abiertas.add(rel);
    if (F.hijos[rel]) return dibujar();
    Promise.resolve(D.fs.listar(rel, F.ocultas)).then(r => {
      if (r && !r.error) F.hijos[rel] = r;
      else { F.abiertas.delete(rel); aviso((r && r.error) || 'No se pudo abrir esa carpeta.', true); }
      dibujar();
    });
  }
  // Lo que cambió mientras se editaba se aplica al terminar.
  function refrescar() {
    if (D.fs.sucio) { D.fs.sucio = false; return recargar(); }
    dibujar();
    return Promise.resolve();
  }

  // ---- Acciones sobre el elemento elegido ----
  function editar(modo) {
    const sel = F.sel, dir = modo === 'renombrar' ? padre(sel) : esCarpeta(sel) ? sel : padre(sel);
    F.editar = { modo: modo, rel: sel, dir: dir, valor: modo === 'renombrar' ? nombre(sel) : '' };
    F.msg = null;
    const listo = () => {
      const i = $('#arch-nombre');
      if (!i) return;
      i.focus();
      // Al renombrar queda marcado el nombre sin la extensión.
      if (modo === 'renombrar') { const p = i.value.lastIndexOf('.'); i.setSelectionRange(0, p > 0 ? p : i.value.length); }
    };
    if (dir && !F.abiertas.has(dir)) { F.abiertas.add(dir); recargar().then(listo); }        // se ve dónde va a aparecer
    else { dibujar(); listo(); }
  }
  function cancelar() {
    const sel = F.sel;
    F.editar = null;
    refrescar().then(() => { const n = nodo(sel) || $('#arch-nuevo-archivo'); if (n) n.focus(); });
  }
  function guardar(input, msg) {
    const e = F.editar, n = input.value, vecinos = ((F.hijos[e.dir] || {}).items || []).map(x => x.n).filter(x => e.modo !== 'renombrar' || x.toLowerCase() !== nombre(e.rel).toLowerCase());
    const mal = t => { input.setAttribute('aria-invalid', 'true'); ui.pintar(msg, el('span', { class: 'mal' }, t)); ui.decir(t); input.focus(); };
    const v = RA.carpeta.validar(n, vecinos, 255).replace('una carpeta', 'algo');
    if (v) return mal(v);
    if (e.modo === 'renombrar' && n === nombre(e.rel)) return cancelar();
    Promise.resolve(e.modo === 'renombrar' ? D.fs.renombrar(e.rel, n) : D.fs.crear(e.dir, n, e.modo === 'carpeta')).then(r => {
      if (!r || r.error) return mal((r && r.error) || 'No se pudo completar.');
      if (e.modo === 'renombrar') F.abiertas = new Set(Array.from(F.abiertas).map(a => dentro(a, e.rel) ? r.rel + a.slice(e.rel.length) : a));
      F.editar = null; F.sel = r.rel; D.fs.sucio = false;
      aviso(e.modo === 'renombrar' ? nombre(e.rel) + ' ahora se llama ' + n + '.' : (e.modo === 'carpeta' ? 'Carpeta ' : 'Archivo ') + n + ' creado.');
      recargar().then(() => { const x = nodo(r.rel); if (x) x.focus(); });
    });
  }
  function abrirArchivo() {
    const rel = F.sel;
    Promise.resolve(D.fs.abrirArchivo(rel)).then(r => {
      if (!r || r.error) return aviso((r && r.error) || 'No se pudo abrir.', true);
      aviso(r.con ? (D.so.win() ? 'Windows ejecutaría ' + nombre(rel) + ' en vez de enseñarlo: elige con qué programa abrirlo.' : nombre(rel) + ' se ejecutaría en vez de enseñarse: se muestra en ' + D.so.gestor() + ' para que elijas con qué abrirlo.') : nombre(rel) + ' abierto con su programa predeterminado.');
    });
  }
  function mostrar() {
    const rel = F.sel;
    Promise.resolve(D.fs.mostrar(rel)).then(r => { if (!r || r.error) aviso((r && r.error) || 'No se pudo mostrar.', true); else aviso((rel ? nombre(rel) : F.nombre) + ' mostrado en ' + D.so.gestor() + '.'); });
  }
  // Eliminar es enviar a la papelera de reciclaje: se puede recuperar. Lo confirma el segundo clic.
  function borrar() {
    const rel = F.sel;
    Promise.resolve(D.fs.papelera(rel)).then(r => {
      if (!r || r.error) return aviso((r && r.error) || 'No se pudo enviar a la papelera.', true);
      F.abiertas.forEach(a => { if (dentro(a, rel)) F.abiertas.delete(a); });
      F.sel = padre(rel); D.fs.sucio = false;
      aviso(nombre(rel) + ' se envió a la papelera de reciclaje.');
      recargar().then(() => { const n = nodo(F.sel) || $('#arch-arbol [role="treeitem"]'); if (n) n.focus(); });
    });
  }

  // ---- Pintado ----
  const boton = (id, texto, fn, apagado) => el('button', fn ? { type: 'button', class: 'btn btn-small', id: id, disabled: !!apagado, onclick: fn } : { type: 'button', class: 'btn btn-small', id: id, disabled: !!apagado }, texto);
  /* Tarjeta de la derecha: lo elegido y lo que se puede hacer con ello. Se repinta sola al cambiar la
     selección, sin rehacer el árbol. */
  function acciones() {
    const s = F.sel, carpeta = esCarpeta(s), dir = carpeta ? s : padre(s);
    // Sesión SSH: la carpeta del equipo remoto en solo lectura (como en Claude Code Desktop). Solo se ve.
    if (F.soloLectura) return [
      el('div', { class: 'col' }, [el('span', { class: 'label' }, carpeta ? 'Carpeta' : 'Archivo'), el('span', { class: 'mono', id: 'arch-elegido' }, ui.ruta(s || F.nombre))]),
      el('div', { class: 'row' }, [boton('arch-editar', 'Ver', () => RA.editor && RA.editor.abrir(s), carpeta || !s || !D.fs.leer)]),
      pintaMsg(el('p', { id: 'arch-msg', class: 'note', 'aria-live': 'polite' })),
      el('p', { class: 'note', id: 'arch-solo' }, 'Equipo remoto (SSH): solo lectura, como en Claude Code Desktop. Para cambiar algo, pídeselo a Claude.')
    ];
    return [
      el('div', { class: 'col' }, [el('span', { class: 'label' }, carpeta ? 'Carpeta' : 'Archivo'), el('span', { class: 'mono', id: 'arch-elegido' }, ui.ruta(s ? s.replace(/\//g, D.so.sep()) : F.nombre))]),
      el('div', { class: 'row' }, [
        boton('arch-abrir', 'Abrir', abrirArchivo, carpeta),
        boton('arch-editar', 'Editar', () => RA.editor && RA.editor.abrir(s), carpeta || !s || !D.fs.leer),
        boton('arch-renombrar', 'Renombrar', () => editar('renombrar'), !s),
        boton('arch-mostrar', D.so.win() ? 'Mostrar en el Explorador' : 'Mostrar en la carpeta', mostrar),
        ui.armar(boton('arch-borrar', 'Eliminar', null, !s), '¿Enviar a la papelera?', borrar)
      ]),
      el('div', { class: 'row' }, [
        boton('arch-nuevo-archivo', 'Crear archivo', () => editar('archivo')), boton('arch-nueva-carpeta', 'Crear carpeta', () => editar('carpeta')),
        el('span', { class: 'note' }, 'en ' + (dir ? nombre(dir) : F.nombre))
      ]),
      F.editar ? formEditar() : null,
      pintaMsg(el('p', { id: 'arch-msg', class: 'note', 'aria-live': 'polite' })),
      el('p', { class: 'note' }, 'Eliminar envía a la papelera de reciclaje: se puede recuperar. Teclas en el árbol: F2 renombra, Supr elimina, Enter abre.')
    ];
  }
  function formEditar() {
    const e = F.editar, dondeN = e.dir ? nombre(e.dir) : F.nombre;
    const titulo = e.modo === 'renombrar' ? 'Nombre nuevo de ' + nombre(e.rel) : (e.modo === 'carpeta' ? 'Nueva carpeta en ' : 'Nuevo archivo en ') + dondeN;
    const msg = el('p', { id: 'arch-editar-msg', class: 'note', 'aria-live': 'polite' });
    const input = el('input', { id: 'arch-nombre', class: 'input', type: 'text', value: e.valor, maxlength: '255', autocomplete: 'off', spellcheck: 'false', 'aria-describedby': 'arch-editar-msg' });
    input.addEventListener('input', () => { e.valor = input.value; input.removeAttribute('aria-invalid'); msg.textContent = ''; });
    input.addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); cancelar(); } });
    return el('form', { id: 'arch-editar', class: 'campo', novalidate: true, onsubmit: ev => { ev.preventDefault(); guardar(input, msg); } }, [
      el('label', { class: 'label', for: 'arch-nombre' }, titulo),
      el('div', { class: 'ruta-campo' }, [input, el('button', { type: 'submit', class: 'btn btn-small btn-primary' }, e.modo === 'renombrar' ? 'Renombrar' : 'Crear'), el('button', { type: 'button', class: 'btn btn-small', onclick: cancelar }, 'Cancelar')]),
      msg
    ]);
  }
  // Avisos al pie de una carpeta: vacía, carpetas pesadas ocultas o demasiados elementos.
  function notas(h) {
    const out = [];
    if (!h.items.length && !h.ignoradas) out.push('Vacía');
    if (h.ignoradas && !F.ocultas) out.push(h.ignoradas === 1 ? '1 carpeta pesada oculta' : h.ignoradas + ' carpetas pesadas ocultas');
    if (h.mas) out.push('y ' + ui.num(h.mas) + ' más que no se muestran');
    return out;
  }
  function ramas(ul, rel, nivel) {
    F.hijos[rel].items.forEach(x => {
      const r = rel ? rel + '/' + x.n : x.n, abierta = x.d && F.abiertas.has(r) && !!F.hijos[r];
      const li = el('li', { role: 'treeitem', tabindex: '-1', 'data-rel': r, 'aria-level': String(nivel), 'aria-selected': String(r === F.sel), 'aria-expanded': x.d ? String(abierta) : null },
        el('div', { class: 'nodo arch-nodo' }, [G.svg(G.deArchivo(x.n, x.d, abierta), null), el('span', { class: 'tipo' }, x.n)]));
      if (abierta) {
        const g = el('ul', { role: 'group' });
        ramas(g, r, nivel + 1);
        notas(F.hijos[r]).forEach(t => g.appendChild(el('li', { role: 'none', class: 'note arch-nota' }, t)));
        li.appendChild(g);
      }
      ul.appendChild(li);
    });
  }
  function arbol() {
    const h = F.hijos[''];
    if (!h) return el('p', { class: 'note' }, F.error ? null : 'Cargando…');
    const ul = el('ul', { id: 'arch-arbol', class: 'arbol archivos', role: 'tree', 'aria-label': 'Archivos de ' + F.nombre });
    ramas(ul, '', 1);
    // Una sola parada de tabulador: la del elemento elegido, o el primero.
    const act = ul.querySelector('[data-rel="' + CSS.escape(F.sel) + '"]') || ul.querySelector('[role="treeitem"]');
    if (act) act.tabIndex = 0;
    return [h.items.length ? ul : null].concat(notas(h).map(t => el('p', { class: 'note' }, t)));
  }
  // Tarjeta de la izquierda: la carpeta de trabajo y su árbol.
  function contenido() {
    const cab = el('div', { class: 'row between arch-cab' }, [
      el('div', { class: 'col' }, [
        el('span', { class: 'label' }, 'Carpeta de trabajo'),
        F.base ? el('span', { class: 'mono', id: 'arch-base' }, ui.ruta(F.base)) : el('span', { class: 'note' }, F.cargando ? 'Abriendo…' : 'Ninguna')
      ]),
      el('button', { type: 'button', class: 'btn btn-small', id: 'arch-cambiar', disabled: F.cargando, onclick: () => abrir(() => Promise.resolve(D.fs.cambiar()).then(r => { if (r && r.base) D.recordar(r.base); return r; })) }, 'Cambiar carpeta de trabajo')
    ]);
    if (F.error) return [cab, el('p', { role: 'alert' }, el('span', { class: 'mal' }, F.error)), F.base ? null : el('p', { class: 'note' }, 'Elige una sesión en la franja de arriba, o abre cualquier carpeta con "Cambiar carpeta de trabajo".')];
    if (!F.base) return [cab];
    return [
      cab,
      el('div', { class: 'col' }, arbol()),
      el('div', { class: 'row' }, [el('span', { class: 'note crece' }, 'Mostrar carpetas pesadas (node_modules, .git, dist…)'), ui.interruptor(F.ocultas, v => { F.ocultas = v; recargar(); }, 'Mostrar carpetas pesadas')])
    ];
  }
  // Repinta la vista entera sin perder el foco ni el desplazamiento del árbol.
  function dibujar() {
    const vista = $('#v-archivos'), a = document.activeElement, dentroVista = a && vista.contains(a);
    const quien = dentroVista ? (a.dataset.rel !== undefined ? { rel: a.dataset.rel } : a.id ? { id: a.id } : a.getAttribute('data-nombre') ? { sw: a.getAttribute('data-nombre') } : null) : null;
    const viejo = $('#arch-arbol'), y = viejo ? viejo.scrollTop : 0;
    ui.pintar($('#arch'), contenido());
    const lista = !!F.base && !F.error;
    $('#arch-tarjeta').hidden = !lista;
    ui.pintar($('#arch-acciones'), lista ? acciones() : null);
    const nuevo = $('#arch-arbol');
    if (nuevo) nuevo.scrollTop = y;
    $('#t-arch').textContent = 'Archivos' + (F.nombre ? ' · ' + F.nombre : '');
    if (!quien) return;
    const n = quien.rel !== undefined ? nodo(quien.rel) || nodo(F.sel) : quien.id ? $('#' + quien.id) : $('[data-nombre="' + quien.sw + '"]', vista);
    if (n && !n.disabled && n.offsetParent) n.focus(); else if (nodo(F.sel)) nodo(F.sel).focus();
  }
  // Cambia el elemento elegido sin rehacer el árbol: solo la marca, la parada de tabulador y las acciones.
  function marcar(rel) {
    F.sel = rel; F.editar = null;
    ui.$$('#arch-arbol [role="treeitem"]').forEach(n => { const si = n.dataset.rel === rel; n.setAttribute('aria-selected', String(si)); n.tabIndex = si ? 0 : -1; });
    ui.pintar($('#arch-acciones'), acciones());
    const n = nodo(rel);
    if (n) n.focus();
  }

  // ---- Árbol: clic elige (y abre o cierra una carpeta); teclado como en el árbol de agentes ----
  const caja = $('#arch');
  caja.addEventListener('click', ev => {
    const li = ev.target.closest('[role="treeitem"]');
    if (!li) return;
    const rel = li.dataset.rel;
    if (esCarpeta(rel)) { F.sel = rel; F.editar = null; plegar(rel, li.getAttribute('aria-expanded') === 'true'); } else marcar(rel);
  });
  caja.addEventListener('dblclick', ev => { const li = ev.target.closest('[role="treeitem"]'); if (li && !esCarpeta(li.dataset.rel)) abrirArchivo(); });
  caja.addEventListener('keydown', ev => {
    const li = ev.target;
    if (!li.matches || !li.matches('#arch-arbol [role="treeitem"]')) return;
    const vis = ui.$$('#arch-arbol [role="treeitem"]'), i = vis.indexOf(li), rel = li.dataset.rel, abierta = li.getAttribute('aria-expanded');
    let a = null;
    if (ev.key === 'ArrowDown') a = vis[i + 1];
    else if (ev.key === 'ArrowUp') a = vis[i - 1];
    else if (ev.key === 'Home') a = vis[0];
    else if (ev.key === 'End') a = vis[vis.length - 1];
    else if (ev.key === 'ArrowRight') { if (abierta === 'false') { ev.preventDefault(); return plegar(rel, false); } if (abierta === 'true') a = li.querySelector('[role="treeitem"]'); }
    else if (ev.key === 'ArrowLeft') { if (abierta === 'true') { ev.preventDefault(); return plegar(rel, true); } a = li.parentNode.closest('[role="treeitem"]'); }
    else if (ev.key === 'Enter') { ev.preventDefault(); return abierta ? plegar(rel, abierta === 'true') : abrirArchivo(); }
    else if (ev.key === 'F2' && !F.soloLectura) { ev.preventDefault(); return editar('renombrar'); }
    else if (ev.key === 'Delete' && !F.soloLectura) { ev.preventDefault(); return $('#arch-borrar').click(); }
    else return;
    ev.preventDefault();
    if (a) marcar(a.dataset.rel);
  });

  /* Pintado desde app.pintar(), que llega con cada cambio de datos: solo hace algo si cambió la sesión
     elegida o la carpeta (y no mientras se edita un nombre o se confirma un borrado). */
  function pintar() {
    const s = RA.vistas.actual(), id = s ? s.id : null;
    if (F.sesion !== id) { F.sesion = id; abrir(() => D.fs.abrir(id)); return; }
    if (D.fs.sucio && F.base && !F.editar && !F.cargando && !$('#arch-borrar.armed')) { D.fs.sucio = false; recargar(); return; }
    if (!caja.firstChild) dibujar();
  }
  // Al salir de la vista se deja de vigilar la carpeta; al volver se lista de nuevo.
  function salir() {
    if (D.fs.cerrar) D.fs.cerrar();
    D.fs.sucio = true; F.editar = null;
  }

  RA.vistas.archivos = pintar;
  RA.explorador = { salir: salir };
})(window.RA = window.RA || {});
