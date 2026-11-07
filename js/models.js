/* Selector y gestor de modelos (Parte C). Los modelos salen solo del registro único del proceso principal
   (Parte E: listados vivos de cada proveedor); Claude, de los identificadores que ya usa la app, siempre a
   través de Claude Code. Preferencias (activo, favoritos, ocultos, importados, esfuerzo, avisos vistos) en
   los ajustes de la interfaz; caveman por modelo va al proceso principal con el resto de caveman.
   "Automático" deja el reparto como estaba: sin modelo elegido, el envío es idéntico al de antes. */
(function (RA) {
  'use strict';

  const ui = RA.ui, el = ui.el, $ = ui.$, D = RA.datos, P = window.rastro;
  const pide = (f, ...a) => P && P[f] ? P[f](...a).catch(() => ({ error: 'La orden no se pudo ejecutar.' })) : Promise.resolve({ error: 'Solo en la app de escritorio.' });
  const ESF_CLAUDE = ['low', 'medium', 'high', 'xhigh', 'max'], ESF_OTROS = ['bajo', 'medio', 'alto'];
  const CAVE = [['', 'Como el global'], ['off', 'No'], ['caveman', 'caveman'], ['ultracave', 'ultracave'], ['megacave', 'megacave']];
  let registro = { provs: [] }, abierto = null, filtro = '';

  const pref = () => {
    const p = D.ajustes.modelosUI = Object.assign({ activo: null, favoritos: [], ocultos: [], provOcultos: [], importados: [], soloGratis: true, esfuerzo: {}, avisos: [], manuales: [] }, D.ajustes.modelosUI);
    return p;
  };
  const guardar = cambios => D.guardar({ modelosUI: Object.assign({}, pref(), cambios) });
  const clave = (prov, id) => prov + ':' + id;

  // ---- Datos: grupos por proveedor con lo que se puede mostrar ----
  function grupos() {
    const p = pref();
    const claude = { id: 'claude', nombre: 'Claude (vía Claude Code)', estado: 'tu suscripción', modelos: (D.MODELOS || []).map(m => ({ id: m[0], nombre: m[1], suscripcion: true, gratis: false, politica: { texto: 'Tu suscripción de Claude, a través de Claude Code. Sin claves de API.' } })) };
    const otros = registro.provs.map(g => Object.assign({}, g, { modelos: g.modelos.filter(m => g.local || p.importados.indexOf(clave(g.id, m.id)) >= 0) }));
    return [claude].concat(otros);
  }
  function visibles() {
    const p = pref(), q = filtro.trim().toLowerCase(), out = [];
    grupos().forEach(g => {
      if (p.provOcultos.indexOf(g.id) >= 0) return;
      const ms = g.modelos.filter(m => p.ocultos.indexOf(clave(g.id, m.id)) < 0)
        .filter(m => !p.soloGratis || m.suscripcion || (m.gratis && !m.noDisponible))
        .filter(m => !q || (m.nombre + ' ' + m.id + ' ' + g.nombre).toLowerCase().indexOf(q) >= 0);
      if (ms.length || !q) out.push(Object.assign({}, g, { modelos: ms }));
    });
    return out;
  }
  function buscarModelo(prov, id) { const g = grupos().find(x => x.id === prov); return g && g.modelos.find(m => m.id === id) ? { g: g, m: g.modelos.find(m => m.id === id) } : null; }

  // Lo que viaja con el envío: null en Automático.
  function elegido() {
    const a = pref().activo;
    if (!a || !buscarModelo(a.prov, a.id)) return null;
    return { prov: a.prov, modelo: a.id, esfuerzo: pref().esfuerzo[clave(a.prov, a.id)] || undefined };
  }

  // ---- Insignias ----
  function insignias(g, m) {
    const p = pref(), out = [], e = p.esfuerzo[clave(g.id, m.id)], cav = ((D.ajustes.caveman || {}).porModelo || {})[clave(g.id, m.id)];
    if (m.suscripcion) out.push(el('span', { class: 'chip' }, 'Suscripción'));
    else if (m.noDisponible) out.push(el('span', { class: 'chip alerta' }, 'Ya no disponible'));
    else if (m.gratis) out.push(el('span', { class: 'chip ok', title: m.origen === 'vivo' ? 'Gratis según el listado en vivo del proveedor' : 'Gratis según la capa gratuita que declara el proveedor' }, 'Gratis · ' + (m.origen === 'vivo' ? 'en vivo' : 'declarado')));
    else out.push(el('span', { class: 'chip alerta' }, 'Sin verificar'));
    if (m.soloVia) out.push(el('span', { class: 'chip' }, 'Solo vía OpenCode'));
    const pol = m.politica || {};
    if (pol.soloPrueba) out.push(el('span', { class: 'chip alerta' }, 'Solo prueba'));
    else if (pol.entrena === true) out.push(el('span', { class: 'chip alerta', title: pol.texto }, 'Puede entrenar con tus datos'));
    else if (pol.entrena == null && !m.suscripcion && !g.local) out.push(el('span', { class: 'chip', title: pol.texto }, 'Política según proveedor'));
    if (g.local) out.push(el('span', { class: 'chip' }, 'Local'));
    if (e) out.push(el('span', { class: 'chip', title: 'Esfuerzo' }, 'Esfuerzo ' + e));
    if (cav) out.push(el('span', { class: 'chip', title: 'Caveman para este modelo' }, cav === 'off' ? 'Caveman no' : cav));
    return out;
  }

  // ---- Botón de la barra del compositor: siempre dice el modelo activo ----
  function pintarBoton() {
    const b = $('#masc-modelo');
    if (!b) return;
    const a = pref().activo, x = a && buscarModelo(a.prov, a.id);
    const e = x && pref().esfuerzo[clave(a.prov, a.id)];
    // Prefijo solo para lectores de pantalla: el nombre empieza por un verbo y contiene el texto visible.
    ui.pintar(b, [el('span', { class: 'sr' }, 'Cambiar modelo: '), x ? x.m.nombre + ' · ' + x.g.nombre.replace(/ \(.*\)$/, '') + (e ? ' · ' + e : '') : 'Automático · reparto de Rastro']);
  }

  // ---- Aviso de política la primera vez (E.5) ----
  function confirmarPolitica(g, m) {
    const pol = m.politica || {}, k = clave(g.id, m.id);
    if (m.suscripcion || g.local || pref().avisos.indexOf(k) >= 0 || !(pol.soloPrueba || pol.entrena !== false)) return Promise.resolve(true);
    return new Promise(res => {
      const caja = el('div', { class: 'card modal', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'pol-t', 'aria-describedby': 'pol-d' });
      const velo = el('div', { class: 'velo' }, caja);
      let soltar = null;
      const fin = v => { if (soltar) soltar(); velo.remove(); if (v) guardar({ avisos: pref().avisos.concat(k) }); res(v); };
      ui.pintar(caja, [
        el('h2', { id: 'pol-t', class: 'label' }, 'Antes de usar ' + m.nombre),
        el('p', { id: 'pol-d' }, (pol.soloPrueba ? 'Este modelo es solo de prueba: no envíes datos personales ni confidenciales. ' : 'Según ' + g.nombre + ', lo que envíes puede usarse para entrenar o mejorar sus modelos, o guardarse un tiempo. No envíes nada confidencial. ') + (pol.texto ? '(' + pol.texto + ')' : '')),
        el('div', { class: 'row' }, [el('button', { type: 'button', class: 'btn btn-small', onclick: () => fin(false) }, 'Cancelar'), el('button', { type: 'button', class: 'btn btn-small btn-primary', id: 'pol-ok', onclick: () => fin(true) }, 'Entendido, usarlo')])
      ]);
      $('#capa').appendChild(velo);
      soltar = ui.atrapar(velo, () => fin(false));
      $('#pol-ok').focus();
    });
  }

  async function activar(g, m) {
    if (m && !(await confirmarPolitica(g, m))) return;
    guardar({ activo: m ? { prov: g.id, id: m.id } : null });
    cerrar(); pintarBoton();
    ui.decir(m ? 'Modelo activo: ' + m.nombre + ' (' + g.nombre + ').' : 'Modelo automático: Rastro decide como antes.', 'ok');
  }

  // ---- Menú del selector ----
  function cerrar() { if (abierto) { const b = abierto.boton; abierto.soltar(); abierto.nodo.remove(); abierto = null; if (b) b.focus(); } }
  function abrir() {
    if (abierto) return cerrar();
    const caja = el('div', { class: 'card modal modelos', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Elegir modelo' });
    const velo = el('div', { class: 'velo' }, caja);
    $('#capa').appendChild(velo);
    velo.addEventListener('mousedown', e => { if (e.target === velo) cerrar(); });
    abierto = { nodo: velo, caja: caja, boton: $('#masc-modelo'), soltar: ui.atrapar(velo, () => abierto && abierto.sub ? cerrarSub() : cerrar()) };
    pintarMenu(true);
  }
  function pintarMenu(foco) {
    const caja = abierto.caja, p = pref(), a = p.activo;
    const busca = el('input', { type: 'search', class: 'input', id: 'mod-buscar', placeholder: 'Buscar modelos', 'aria-label': 'Buscar modelos', value: filtro, oninput: e => { filtro = e.target.value; pintarLista(); } });
    const solo = ui.interruptor(p.soloGratis, v => { guardar({ soloGratis: v }); pintarLista(); }, 'Solo gratuitos');
    const lista = el('div', { id: 'mod-lista', class: 'mod-lista' });
    ui.pintar(caja, [
      el('div', { class: 'row between' }, [busca, el('label', { class: 'row note' }, ['Solo gratuitos', solo])]),
      lista,
      el('div', { class: 'row mod-pie' }, [
        el('button', { type: 'button', class: 'btn btn-small', onclick: () => actualizar(true) }, 'Actualizar modelos'),
        el('button', { type: 'button', class: 'btn btn-small', onclick: personalizado }, 'Añadir modelo personalizado…'),
        el('button', { type: 'button', class: 'btn btn-small', onclick: () => { cerrar(); editar(); } }, 'Editar modelos…')
      ])
    ]);
    pintarLista();
    if (foco) busca.focus();
    function pintarLista() {
      const fila = (g, m) => {
        const k = m ? clave(g.id, m.id) : '', activo = m ? a && a.prov === g.id && a.id === m.id : !a, fav = m && p.favoritos.indexOf(k) >= 0;
        return el('li', { class: 'mod-fila' + (activo ? ' activo' : '') }, [
          el('button', { type: 'button', class: 'mod-elegir', 'aria-current': activo ? 'true' : null, 'data-mod': '1', disabled: m && m.noDisponible ? true : null, onclick: () => activar(g, m) }, [
            el('span', { class: 'mod-marca', 'aria-hidden': 'true' }, activo ? '●' : ''),
            el('span', { class: 'crece' }, [el('span', {}, m ? m.nombre : 'Automático'), el('span', { class: 'note' }, m ? ' ' + m.id : ' Rastro reparte como siempre')]),
            el('span', { class: 'badges' }, m ? insignias(g, m) : [])
          ]),
          m ? el('button', { type: 'button', class: 'btn btn-small icono-txt', 'aria-pressed': String(!!fav), 'aria-label': (fav ? 'Quitar de favoritos: ' : 'Añadir a favoritos: ') + m.nombre, onclick: () => { guardar({ favoritos: fav ? p.favoritos.filter(x => x !== k) : p.favoritos.concat(k) }); pintarLista(); } }, fav ? '★' : '☆') : null,
          m ? el('button', { type: 'button', class: 'btn btn-small icono-txt', 'aria-haspopup': 'dialog', 'aria-label': 'Ajustes de ' + m.nombre, onclick: e => submenu(g, m, e.currentTarget) }, '›') : null
        ]);
      };
      const vs = visibles(), favs = [];
      vs.forEach(g => g.modelos.forEach(m => { if (p.favoritos.indexOf(clave(g.id, m.id)) >= 0) favs.push(fila(g, m)); }));
      const hay = vs.some(g => g.modelos.length);
      ui.pintar(lista, [
        el('ul', { class: 'mod-grupo', 'aria-label': 'Automático' }, [fila(null, null)]),
        favs.length ? el('section', {}, [el('h3', { class: 'label', id: 'mg-fav' }, 'Favoritos'), el('ul', { class: 'mod-grupo', 'aria-labelledby': 'mg-fav' }, favs)]) : null
      ].concat(vs.map(g => el('section', {}, [
        el('h3', { class: 'label', id: 'mg-' + g.id }, [g.nombre, el('span', { class: 'note' }, ' · ' + g.estado + (g.caducado && !g.local && g.id !== 'claude' ? ' · lista de más de 24 h' : ''))]),
        g.modelos.length ? el('ul', { class: 'mod-grupo', 'aria-labelledby': 'mg-' + g.id }, g.modelos.map(m => fila(g, m)))
          : el('p', { class: 'note' }, g.error ? [g.error + ' ', el('button', { type: 'button', class: 'btn btn-small', onclick: () => actualizar(true, g.id) }, 'Reintentar')]
            : g.local ? 'No detectado en este equipo.' : g.id === 'claude' ? '' : 'Sin modelos importados. Usa "Editar modelos…" > "Importar modelos gratuitos".')
      ]))).concat(!hay && filtro ? [el('p', { class: 'note' }, 'Ningún modelo coincide con "' + filtro + '".')] : []));
    }
    abierto.repintar = pintarLista;
  }
  // Flechas arriba y abajo entre las filas del menú.
  document.addEventListener('keydown', e => {
    // Esc aunque el foco se haya quedado fuera (p. ej. tras repintar la lista).
    if (abierto && e.key === 'Escape' && !abierto.nodo.contains(document.activeElement)) { e.preventDefault(); if (abierto.sub) cerrarSub(); else cerrar(); return; }
    if (!abierto || abierto.sub || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
    const fs = ui.$$('[data-mod]', abierto.caja).filter(b => !b.disabled), i = fs.indexOf(document.activeElement);
    if (!fs.length) return;
    e.preventDefault();
    fs[i < 0 ? 0 : (i + (e.key === 'ArrowDown' ? 1 : fs.length - 1)) % fs.length].focus();
  });

  // ---- Submenú de un modelo: esfuerzo, caveman por modelo y contexto ----
  function cerrarSub() { if (abierto && abierto.sub) { const s = abierto.sub; abierto.sub = null; s.nodo.remove(); if (abierto.sucio) { abierto.sucio = false; abierto.repintar(); } (s.volver && s.volver.isConnected ? s.volver : $('#mod-buscar')).focus(); } }
  function submenu(g, m, volver) {
    cerrarSub();
    const k = clave(g.id, m.id), p = pref(), cav = Object.assign({ global: null, porModelo: {} }, D.ajustes.caveman);
    const opciones = m.suscripcion ? ESF_CLAUDE : ESF_OTROS;
    const ponerEsf = v => { const x = Object.assign({}, p.esfuerzo); if (v) x[k] = v; else delete x[k]; guardar({ esfuerzo: x }); pintarBoton(); abierto.sucio = true; };
    // Bloque C: los modelos de Claude usan el deslizador de cinco paradas; los demás, sus tres niveles.
    const esf = m.suscripcion ? ui.deslizadorEsfuerzo({ id: 'mod-esfuerzo', valor: p.esfuerzo[k] || '', nombre: 'Esfuerzo de ' + m.nombre, alCambiar: ponerEsf }) : el('select', { class: 'select', 'aria-label': 'Esfuerzo de ' + m.nombre, onchange: e => { const x = Object.assign({}, p.esfuerzo); if (e.target.value) x[k] = e.target.value; else delete x[k]; guardar({ esfuerzo: x }); pintarBoton(); abierto.sucio = true; } },
      [el('option', { value: '' }, 'Por defecto')].concat(opciones.map(o => el('option', { value: o, selected: p.esfuerzo[k] === o ? true : null }, o))));
    const cv = el('select', { class: 'select', 'aria-label': 'Caveman para ' + m.nombre, onchange: e => { const pm = Object.assign({}, cav.porModelo); if (e.target.value) pm[k] = e.target.value; else delete pm[k]; D.guardar({ caveman: { global: cav.global, porModelo: pm } }); abierto.sucio = true; } },
      CAVE.map(c => el('option', { value: c[0], selected: (cav.porModelo[k] || '') === c[0] ? true : null }, c[1])));
    const nodo = el('div', { class: 'card mod-sub', role: 'group', 'aria-label': 'Ajustes de ' + m.nombre }, [
      el('h3', { class: 'label' }, m.nombre),
      m.suscripcion ? el('div', { class: 'col mod-esf' }, [el('span', {}, 'Esfuerzo'), esf]) : el('label', { class: 'row between' }, ['Esfuerzo', esf]),
      m.suscripcion ? el('p', { class: 'note' }, 'Se pasa a Claude Code con --effort.') : g.local ? null : el('p', { class: 'note' }, 'En la nube solo se envía donde el proveedor lo documenta.'),
      el('label', { class: 'row between' }, ['Caveman', cv]),
      g.local ? el('p', { class: 'note' }, 'En modelos locales con poco contexto, caveman suma tokens de entrada en cada turno y puede no compensar.') : null,
      m.contexto ? el('p', { class: 'note' }, 'Contexto máximo informado por el proveedor: ' + Number(m.contexto).toLocaleString() + ' tokens.') : null,
      m.politica && m.politica.texto ? el('p', { class: 'note' }, 'Datos: ' + m.politica.texto) : null,
      el('button', { type: 'button', class: 'btn btn-small', onclick: cerrarSub }, 'Volver')
    ]);
    abierto.caja.appendChild(nodo);
    abierto.sub = { nodo: nodo, volver: volver };
    (m.suscripcion ? esf.querySelector('[role="slider"]:not([aria-disabled="true"])') || esf.querySelector('[role="switch"]') : esf).focus();
  }

  // ---- Actualizar ----
  async function actualizar(avisar, prov) {
    const r = await pide('modelosActualizar', prov);
    if (r && r.provs) registro = r;
    if (avisar) ui.decir(r && r.error ? r.error : 'Lista de modelos actualizada.', r && r.error ? 'error' : 'ok');
    if (abierto && abierto.repintar) abierto.repintar();
    pintarBoton();
    return r;
  }

  // ---- Añadir modelo o proveedor personalizado ----
  function personalizado() {
    cerrar();
    const caja = el('div', { class: 'card modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'mp-t' });
    const velo = el('div', { class: 'velo' }, caja);
    let soltar = null;
    const fin = () => { if (soltar) soltar(); velo.remove(); };
    const campo = (id, txt, attrs) => el('label', { class: 'campo' }, [el('span', { class: 'label' }, txt), el('input', Object.assign({ id: id, class: 'input', autocomplete: 'off', spellcheck: 'false' }, attrs || {}))]);
    const err = el('p', { class: 'note', role: 'alert', id: 'mp-err' });
    const enviar = async ev => {
      ev.preventDefault();
      const nombre = $('#mp-nombre').value.trim(), base = $('#mp-base').value.trim(), id = $('#mp-id').value.trim(), k = $('#mp-clave').value.trim();
      if (!nombre || !base || !id) { err.textContent = 'Rellena nombre, URL base e ID del modelo.'; return; }
      if (!/^[\w.:/@-]{1,200}$/.test(id)) { err.textContent = 'El ID del modelo tiene caracteres no válidos.'; return; }
      const r = await pide('modelosPropio', { nombre: nombre, base: base });
      if (r.error) { err.textContent = r.error; return; }
      if (k) { const c = await pide('asistentesClave', r.id, k); if (c.error) { err.textContent = c.error; return; } }
      await actualizar(false);
      const g = registro.provs.find(x => x.id === r.id);
      const visto = g && g.modelos.some(m => m.id === id);
      guardar({ importados: Array.from(new Set(pref().importados.concat(clave(r.id, id)))) });
      fin();
      ui.decir(visto ? 'Proveedor "' + nombre + '" añadido con el modelo ' + id + '.' : 'Proveedor "' + nombre + '" añadido, pero su listado no incluye "' + id + '" (o no respondió): no se mostrará hasta que aparezca.', visto ? 'ok' : 'atencion');
    };
    ui.pintar(caja, [
      el('h2', { id: 'mp-t', class: 'label' }, 'Añadir modelo personalizado'),
      el('form', { onsubmit: enviar }, [
        campo('mp-nombre', 'Nombre', { maxlength: '60', required: true }),
        campo('mp-base', 'URL base compatible con OpenAI', { maxlength: '300', placeholder: 'https://… o http://127.0.0.1:puerto/v1', required: true }),
        campo('mp-id', 'ID del modelo', { maxlength: '200', required: true }),
        campo('mp-clave', 'Clave (opcional; se guarda cifrada y no vuelve a la interfaz)', { type: 'password', maxlength: '400' }),
        el('p', { class: 'note' }, 'Un proveedor en internet no se puede verificar como gratuito: con "solo gratis" activo, Rastro no lo ejecuta. Uno en este equipo (127.0.0.1) sí.'),
        err,
        el('div', { class: 'row' }, [el('button', { type: 'button', class: 'btn btn-small', onclick: fin }, 'Cancelar'), el('button', { type: 'submit', class: 'btn btn-small btn-primary' }, 'Añadir')])
      ])
    ]);
    $('#capa').appendChild(velo);
    soltar = ui.atrapar(velo, fin);
    $('#mp-nombre').focus();
  }

  // ---- Panel lateral "Editar modelos" (mostrar/ocultar e importar) ----
  function panel(titulo, cuerpo) {
    const caja = el('div', { class: 'card modal lateral', role: 'dialog', 'aria-modal': 'true', 'aria-label': titulo });
    const velo = el('div', { class: 'velo' }, caja);
    let soltar = null;
    const fin = () => { if (soltar) soltar(); velo.remove(); pintarBoton(); };
    velo.addEventListener('mousedown', e => { if (e.target === velo) fin(); });
    $('#capa').appendChild(velo);
    soltar = ui.atrapar(velo, fin);
    cuerpo(caja, fin);
    return fin;
  }
  function editar() {
    let q = '';
    panel('Editar modelos', (caja, fin) => {
      const lista = el('div', { class: 'mod-lista' });
      const pinta = () => {
        const p = pref();
        ui.pintar(lista, grupos().map(g => {
          const ms = g.modelos.filter(m => !q || (m.nombre + ' ' + m.id).toLowerCase().indexOf(q) >= 0), provVisible = p.provOcultos.indexOf(g.id) < 0;
          return el('section', {}, [
            el('div', { class: 'row between' }, [el('h3', { class: 'label', id: 'ed-' + g.id }, g.nombre), ui.interruptor(provVisible, v => { guardar({ provOcultos: v ? p.provOcultos.filter(x => x !== g.id) : p.provOcultos.concat(g.id) }); pinta(); }, 'Mostrar ' + g.nombre)]),
            ms.length ? el('ul', { class: 'mod-grupo', 'aria-labelledby': 'ed-' + g.id }, ms.map(m => { const k = clave(g.id, m.id), vis = p.ocultos.indexOf(k) < 0; return el('li', { class: 'row between mod-fila' }, [el('span', { class: 'crece' }, [m.nombre, el('span', { class: 'badges' }, insignias(g, m))]), ui.interruptor(vis, v => { guardar({ ocultos: v ? p.ocultos.filter(x => x !== k) : p.ocultos.concat(k) }); }, 'Mostrar ' + m.nombre)]); }))
              : el('p', { class: 'note' }, g.error || 'Sin modelos.')
          ]);
        }));
      };
      ui.pintar(caja, [
        el('div', { class: 'row between' }, [el('h2', { class: 'label' }, 'Editar modelos'), el('button', { type: 'button', class: 'btn btn-small', onclick: fin }, 'Cerrar')]),
        el('input', { type: 'search', class: 'input', placeholder: 'Buscar modelos', 'aria-label': 'Buscar modelos', oninput: e => { q = e.target.value.trim().toLowerCase(); pinta(); } }),
        el('button', { type: 'button', class: 'btn btn-small btn-primary', id: 'mod-importar', onclick: () => { fin(); importar(); } }, 'Importar modelos gratuitos'),
        lista
      ]);
      pinta();
      $('#mod-importar').focus();
    });
  }

  // ---- Importar modelos gratuitos (E.8): idempotente, con resumen ----
  async function importar() {
    ui.decir('Buscando modelos gratuitos en los proveedores…');
    await actualizar(false);
    let q = '';
    const marcados = new Set();
    panel('Importar modelos gratuitos', (caja, fin) => {
      const lista = el('div', { class: 'mod-lista' });
      const provs = registro.provs.filter(g => !g.local);
      const pinta = () => ui.pintar(lista, provs.map(g => {
        const ms = g.modelos.filter(m => !q || (m.nombre + ' ' + m.id).toLowerCase().indexOf(q) >= 0);
        return el('fieldset', {}, [el('legend', { class: 'label' }, g.nombre + ' · ' + g.estado),
          ms.length ? el('ul', { class: 'mod-grupo' }, ms.map(m => { const k = clave(g.id, m.id), ya = pref().importados.indexOf(k) >= 0; return el('li', { class: 'mod-fila' }, el('label', { class: 'row' }, [el('input', { type: 'checkbox', checked: marcados.has(k) || ya ? true : null, disabled: ya ? true : null, onchange: e => { if (e.target.checked) marcados.add(k); else marcados.delete(k); } }), el('span', { class: 'crece' }, [m.nombre + (ya ? ' (ya importado)' : ''), el('span', { class: 'badges' }, insignias(g, m))])])); }))
            : el('p', { class: 'note' }, g.error || (g.estado === 'sin clave' ? 'Pon tu clave en Ajustes > IA económicas para listar sus modelos.' : 'Sin modelos gratuitos ahora.'))]);
      }));
      const todo = () => { provs.forEach(g => g.modelos.forEach(m => { if (m.gratis && !m.noDisponible && !m.soloVia) marcados.add(clave(g.id, m.id)); })); pinta(); };
      const hecho = () => {
        const p = pref(), imp = new Set(p.importados), res = { imp: 0, no: 0, omit: [] };
        marcados.forEach(k => {
          const i = k.indexOf(':'), x = buscarEnRegistro(k.slice(0, i), k.slice(i + 1));
          if (!x) { res.no++; return; }
          if (imp.has(k)) { res.omit.push(x.m.nombre + ': ya estaba'); return; }
          if (x.m.noDisponible) { res.no++; return; }
          if (!x.m.gratis) { res.omit.push(x.m.nombre + ': no verificado como gratuito'); return; }
          if (x.m.soloVia) { res.omit.push(x.m.nombre + ': solo vía OpenCode'); return; }
          imp.add(k); res.imp++;
        });
        guardar({ importados: Array.from(imp) });
        fin();
        ui.decir(res.imp + ' importados, ' + res.no + ' no disponibles, ' + res.omit.length + ' omitidos' + (res.omit.length ? ' (' + res.omit.slice(0, 5).join('; ') + ')' : '') + '.', 'ok');
      };
      ui.pintar(caja, [
        el('div', { class: 'row between' }, [el('h2', { class: 'label' }, 'Importar modelos gratuitos'), el('button', { type: 'button', class: 'btn btn-small', onclick: fin }, 'Cerrar')]),
        el('p', { class: 'note' }, 'Solo proveedores activados. Los locales se detectan solos y no hace falta importarlos.'),
        el('input', { type: 'search', class: 'input', placeholder: 'Buscar modelos', 'aria-label': 'Buscar modelos', oninput: e => { q = e.target.value.trim().toLowerCase(); pinta(); } }),
        el('div', { class: 'row' }, [el('button', { type: 'button', class: 'btn btn-small', onclick: todo }, 'Seleccionar todos los gratuitos'), el('button', { type: 'button', class: 'btn btn-small btn-primary', id: 'imp-ok', onclick: hecho }, 'Importar')]),
        lista
      ]);
      pinta();
      $('#imp-ok').focus();
    });
  }
  function buscarEnRegistro(prov, id) { const g = registro.provs.find(x => x.id === prov); const m = g && g.modelos.find(y => y.id === id); return m ? { g: g, m: m } : null; }

  // ---- Arranque ----
  function iniciar() {
    const b = $('#masc-modelo');
    if (!b) return;
    b.addEventListener('click', abrir);
    pintarBoton();
    pide('modelosRegistro').then(r => { if (r && r.provs) { registro = r; pintarBoton(); } });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();

  RA.modelos = { elegido: elegido, abrir: abrir, editar: editar, importar: importar, actualizar: actualizar };
})(window.RA = window.RA || {});
