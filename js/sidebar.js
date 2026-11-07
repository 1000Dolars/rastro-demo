/* Barra lateral (Rastro Sidebar del diseño): marca, nueva sesión, buscar y secciones van en index.html;
   aquí se pintan las CARPETAS plegables (= carpeta de trabajo de las sesiones reales de ~/.claude/projects,
   importadas solas) con sus sesiones dentro, y las fijadas encima. Orden manual con arrastre (puntero, táctil con el asa) o
   teclado, y alternativa sin arrastre en el menú de cada ítem. El orden se guarda en el proceso principal
   (barra.json: solo identificadores) y al cargar se reconcilia: lo nuevo arriba, lo que ya no existe fuera.
   Los ítems se crean una vez y se reutilizan: reordenar mueve nodos, no repinta la lista. */
(function (RA) {
  'use strict';

  const ui = RA.ui, el = ui.el, $ = ui.$, D = RA.datos, P = window.rastro;
  const pide = (f, ...a) => P && P[f] ? P[f](...a).catch(() => null) : Promise.resolve(null);
  const SIN = '(sin proyecto)';
  // `quitadas` son las sesiones archivadas (el nombre se conserva por compatibilidad con barra.json).
  let b = { proyectos: [], sesiones: {}, fijadas: [], colapsados: [], ocultos: [], quitadas: [], nombres: {}, modo: 'reciente', agrupar: 'carpeta', filtro: 'todas', entorno: 'todos', plegada: false };
  let cargada = false, q = '', levantado = null, cajon = null, arrastrando = false;
  // Como en Claude Code Desktop: cada carpeta enseña sus 5 sesiones más recientes y "Mostrar más" el resto.
  const TOPE = 5, extendidas = new Set();
  const nodos = new Map(), grupos = new Map();

  // ---- Datos ----
  const proyDe = s => s.carpeta ? s.carpeta.replace(/[\\/]+$/, '') : SIN;
  const nombreProy = k => b.nombres[k] || (k === SIN ? 'Sin proyecto' : k.split(/[\\/]/).pop() || k);
  const sesiones = () => (D.estado.sesiones || []).filter(s => b.quitadas.indexOf(s.id) < 0);
  const porId = id => sesiones().find(s => s.id === id);
  // Al guardar se descarta lo que ya no existe, pero solo con la carga terminada: si no, se perdería
  // el orden de proyectos que aún no han llegado.
  const guardar = () => {
    if (!D.estado.cargando) {
      const ss = sesiones(), proys = new Set(ss.map(proyDe)), ids = new Set(ss.map(s => s.id));
      b.proyectos = b.proyectos.filter(k => proys.has(k));
      Object.keys(b.sesiones).forEach(k => { if (!proys.has(k)) delete b.sesiones[k]; else b.sesiones[k] = b.sesiones[k].filter(id => ids.has(id)); });
      b.fijadas = b.fijadas.filter(id => ids.has(id));
    }
    if (!P) { try { localStorage.setItem('rastro:barra', JSON.stringify(b)); } catch (e) { /* sin almacenamiento */ } }
    return pide('barraGuardar', b);
  };
  function relativo(t) {
    if (!t) return '';
    const s = Math.max(0, (Date.now() - t) / 1000);
    return s < 60 ? 'ahora' : s < 3600 ? Math.floor(s / 60) + 'm' : s < 86400 ? Math.floor(s / 3600) + 'h' : s < 2592000 ? Math.floor(s / 86400) + 'd' : Math.floor(s / 2592000) + 'mes';
  }
  /* Estado de una sesión con los puntos del diseño: trabajando (rojo lleno), pide permiso (ámbar), espera tu
     respuesta (anillo ámbar: terminó su turno con el proceso abierto, o espera la aprobación del diseño),
     terminada (lleno claro), falló (anillo rojo) y en espera (anillo gris). La palabra va para el lector de pantalla. */
  function estado(s) {
    const c = RA.chat && RA.chat.estado ? RA.chat.estado(s.id) : null;
    if (RA.chat && RA.chat.permiso && RA.chat.permiso(s.id)) return ['permiso', 'Pide permiso'];
    if (c === 'enviando' || c === 'respondiendo' || s.est === 'curso' || s.est === 'deteniendo') return ['trabajando', 'Trabajando'];
    if (s.est === 'error' || s.bloqueo) return ['fallido', 'Falló'];
    if (s.est === 'espera' || (s.vivo && (s.est === 'listo' || c === 'listo'))) return ['esperando', 'Esperando tu respuesta'];
    if (s.est === 'listo' && !s.vivo) return ['terminado', 'Terminada'];
    return ['espera', 'En espera'];
  }
  // Filtro por estado del menú Agrupar y ordenar.
  const FILTROS = { todas: 'Todas', trabajando: 'Trabajando', esperando: 'Esperan tu respuesta', terminadas: 'Terminadas' };
  const pasaFiltro = s => {
    const e = estado(s)[0];
    return b.filtro === 'trabajando' ? e === 'trabajando' : b.filtro === 'esperando' ? (e === 'esperando' || e === 'permiso') : b.filtro === 'terminadas' ? (e === 'terminado' || e === 'fallido') : true;
  };
  /* Filtro por entorno (como en Claude Code Desktop: "filter by status, project, or environment"): este equipo o SSH.
     Solo se ofrece si hay alguna sesión SSH: con un único entorno sería un control que no hace nada. */
  const ENTORNOS = { todos: 'Todos', equipo: 'Este equipo', ssh: 'SSH' };
  const pasaEntorno = s => b.entorno === 'equipo' ? s.entorno !== 'ssh' : b.entorno === 'ssh' ? s.entorno === 'ssh' : true;
  const hayRemotas = () => (RA.datos.estado.sesiones || []).some(s => s.entorno === 'ssh');
  // Lo que filtra ahora, en palabras ("Trabajando · SSH").
  const textoFiltro = () => [b.filtro !== 'todas' ? FILTROS[b.filtro] : '', b.entorno !== 'todos' ? ENTORNOS[b.entorno] : ''].filter(Boolean).join(' · ');
  // Ruta para leer: la carpeta personal como ~.
  const casa = () => String(D.ruta || '').replace(/[\\/]\.claude[\\/]projects[\\/]?$/, '');
  const corta = k => { const h = casa(); return k === SIN ? 'sin carpeta conocida' : h && k.indexOf(h) === 0 ? '~' + k.slice(h.length) : k; };
  // Reconciliación: proyectos y sesiones nuevos arriba, los que ya no existen se descartan.
  function reconciliar() {
    const ss = sesiones(), proys = new Map();
    ss.forEach(s => { const k = proyDe(s); if (!proys.has(k)) proys.set(k, []); proys.get(k).push(s); });
    const nuevos = Array.from(proys.keys()).filter(k => b.proyectos.indexOf(k) < 0);
    nuevos.sort((x, y) => Math.max(...proys.get(y).map(s => s.tUlt || 0)) - Math.max(...proys.get(x).map(s => s.tUlt || 0)));
    b.proyectos = nuevos.concat(b.proyectos);
    proys.forEach((lista, k) => {
      const antes = b.sesiones[k] || [];
      b.sesiones[k] = lista.filter(s => antes.indexOf(s.id) < 0).sort((x, y) => (y.tUlt || 0) - (x.tUlt || 0)).map(s => s.id).concat(antes);
    });
    existentes = proys;
  }
  let existentes = new Map();

  const icono = d => ui.svg('svg', { viewBox: '0 0 16 16', width: '16', height: '16', 'aria-hidden': 'true', class: 'barra-ico gordo' }, [ui.svg('path', { d: d })]);

  // ---- Ítems (se crean una vez y se actualizan) ----
  function asa(nombre, lista, id) {
    const h = el('button', { type: 'button', class: 'barra-asa', 'aria-roledescription': 'elemento ordenable', 'aria-label': 'Cambiar posición de ' + nombre + '. Espacio para levantar, flechas para mover, Espacio para soltar, Esc para cancelar' }, icono('M6 3h1M9 3h1M6 8h1M9 8h1M6 13h1M9 13h1'));
    h.addEventListener('keydown', e => teclaAsa(e, lista, id, h));
    h.addEventListener('pointerdown', e => arrastrar(e, lista, id));
    return h;
  }
  function itemSesion(s, lista) {
    let n = nodos.get(s.id + '|' + lista);
    if (!n) {
      const ir = el('a', { href: '#', class: 'barra-ses', onclick: e => { e.preventDefault(); if (e.shiftKey) return fijar(s.id); abrir(s.id); } }, [el('span', { class: 'sb-dot', 'aria-hidden': 'true' }), el('span', { class: 'sr barra-est-txt' }), el('span', { class: 'barra-tit' }), el('span', { class: 'barra-t', 'aria-hidden': 'true' })]);
      const li = el('li', { class: 'barra-item', 'data-id': s.id }, [asa(s.nombre, lista, s.id), ir, menuBoton(s.nombre, () => menuSesion(s.id, lista))]);
      n = { li: li, ir: ir, firma: '' };
      nodos.set(s.id + '|' + lista, n);
    }
    const e = estado(s), firma = [s.nombre, e[0], relativo(s.tUlt), RA.app.sel.sesion === s.id].join('|');
    if (firma !== n.firma) {
      n.firma = firma;
      const [pt, txt, tit, hace] = n.ir.children;
      pt.className = 'sb-dot ' + e[0]; txt.textContent = e[1] + ': ';
      tit.textContent = s.nombre; hace.textContent = relativo(s.tUlt); n.ir.title = s.nombre + ' · ' + e[1] + (s.tUlt ? ' · hace ' + relativo(s.tUlt) : '');
      if (RA.app.sel.sesion === s.id) n.ir.setAttribute('aria-current', 'true'); else n.ir.removeAttribute('aria-current');
      n.li.firstChild.setAttribute('aria-label', 'Cambiar posición de ' + s.nombre + '. Espacio para levantar, flechas para mover, Espacio para soltar, Esc para cancelar');
    }
    return n.li;
  }
  function grupo(k) {
    let g = grupos.get(k);
    if (!g) {
      const id = 'bp-' + (grupos.size + 1);
      const exp = el('button', { type: 'button', class: 'barra-exp', 'aria-controls': id + '-l', onclick: () => { const i = b.colapsados.indexOf(k); if (i >= 0) b.colapsados.splice(i, 1); else b.colapsados.push(k); guardar(); pintar(); } },
        [el('span', { class: 'barra-flecha', 'aria-hidden': 'true' }), el('span', { class: 'sb-fcol' }, [el('span', { class: 'barra-pnom' }), el('span', { class: 'sb-fruta mono' })]), el('span', { class: 'sb-viva', 'aria-hidden': 'true' }), el('span', { class: 'barra-cuenta' })]);
      const ul = el('ul', { id: id + '-l', class: 'barra-lista' });
      const h = el('h3', { class: 'barra-ph' }, exp);
      // "+": sesión nueva ya en esta carpeta (el asistente salta al encargo).
      const mas = k === SIN ? null : el('button', { type: 'button', class: 'barra-mas-b', 'aria-label': 'Crear sesión nueva en ' + nombreProy(k), title: 'Nueva sesión en esta carpeta', onclick: () => nuevaEn(k) }, icono('M8 3v10M3 8h10'));
      const ver = el('button', { type: 'button', class: 'barra-ver', 'aria-controls': id + '-l', onclick: () => { if (extendidas.has(k)) extendidas.delete(k); else extendidas.add(k); pintar(); } });
      const li = el('li', { class: 'barra-proy', 'data-id': k }, [el('div', { class: 'barra-pcab' }, [asa(nombreProy(k), 'proyectos', k), h, mas, menuBoton(nombreProy(k), () => menuProyecto(k))]), ul, ver]);
      g = { li: li, exp: exp, ul: ul, ver: ver, mas: mas, firma: '' };
      grupos.set(k, g);
    }
    return g;
  }

  // ---- Pintado ----
  function pintar() {
    if (!cargada || !$('#barra') || arrastrando || !RA.app) return;
    reconciliar();
    if (!FILTROS[b.filtro]) b.filtro = 'todas';
    if (!ENTORNOS[b.entorno]) b.entorno = 'todos';
    const plano = b.agrupar === 'ninguno', filtrado = b.filtro !== 'todas' || b.entorno !== 'todos', manual = b.modo === 'manual' && !q && !plano && !filtrado, txt = q.toLowerCase();
    $('#barra').classList.toggle('sin-asas', !manual);
    const pasa = s => pasaFiltro(s) && pasaEntorno(s) && (!txt || (s.nombre + ' ' + nombreProy(proyDe(s))).toLowerCase().indexOf(txt) >= 0);
    // Orden de las sesiones: actividad reciente, fecha de creación o manual.
    const porOrden = (x, y) => b.modo === 'creada' ? (y.t0 || 0) - (x.t0 || 0) : (y.tUlt || 0) - (x.tUlt || 0);
    // Fijadas
    const fij = b.fijadas.map(porId).filter(Boolean).filter(pasa);
    colocar($('#barra-fijadas'), fij.map(s => itemSesion(s, 'fijadas')));
    $('#barra-fijadas-vacio').hidden = fij.length > 0;
    // Proyectos
    let orden = b.proyectos.filter(k => existentes.has(k) && b.ocultos.indexOf(k) < 0);
    const ses = k => (b.sesiones[k] || []).filter(id => b.fijadas.indexOf(id) < 0).map(porId).filter(Boolean);
    if (!manual) {
      const ult = k => Math.max(0, ...ses(k).map(s => s.tUlt || 0));
      orden = orden.slice().sort((x, y) => ult(y) - ult(x));
    }
    const lis = [];
    // Sin agrupar: todas las sesiones en una lista, de la más reciente a la más antigua.
    if (plano) {
      const todas = sesiones().filter(s => b.fijadas.indexOf(s.id) < 0 && b.ocultos.indexOf(proyDe(s)) < 0).filter(pasa).sort(porOrden);
      todas.forEach(s => lis.push(itemSesion(s, 'todas')));
      orden = [];
    }
    orden.forEach(k => {
      let lista = ses(k).filter(pasa);
      if (!manual) lista = lista.slice().sort(porOrden);
      if ((txt || filtrado) && !lista.length && (filtrado || nombreProy(k).toLowerCase().indexOf(txt) < 0)) return;
      const g = grupo(k), abierto = !!txt || filtrado || b.colapsados.indexOf(k) < 0, total = ses(k).length;
      // Cerrada, avisa con el punto rojo si alguna de sus sesiones trabaja.
      const viva = !abierto && ses(k).some(s => estado(s)[0] === 'trabajando');
      const largo = !txt && lista.length > TOPE, todas = extendidas.has(k);
      const firma = [nombreProy(k), abierto, total, viva, casa(), largo, todas, lista.length].join('|');
      if (firma !== g.firma) {
        g.firma = firma;
        g.exp.setAttribute('aria-expanded', String(abierto));
        ui.pintar(g.exp.children[0], RA.glifos.svg(RA.glifos.P[abierto ? 'Abierta' : 'Carpeta'], null, 3));
        g.exp.children[1].children[0].textContent = nombreProy(k);
        g.exp.children[1].children[1].textContent = corta(k);
        g.exp.children[2].hidden = !viva;
        // El número solo con la carpeta cerrada; la ruta completa va en el tooltip.
        g.exp.children[3].textContent = abierto ? '' : total;
        g.exp.children[3].setAttribute('aria-label', total + ' sesiones' + (viva ? ', alguna trabajando' : ''));
        g.exp.title = k === SIN ? 'Sesiones sin carpeta conocida' : corta(k);
        g.li.classList.toggle('abierta', abierto);
        g.ver.hidden = !abierto || !largo;
        g.ver.textContent = todas ? 'Mostrar menos' : 'Mostrar ' + (lista.length - TOPE) + ' más';
        g.ver.setAttribute('aria-expanded', String(todas));
        if (g.mas) g.mas.setAttribute('aria-label', 'Crear sesión nueva en ' + nombreProy(k));
      }
      g.ul.hidden = !abierto;
      if (abierto) colocar(g.ul, (largo && !todas ? lista.slice(0, TOPE) : lista).map(s => itemSesion(s, k)));
      lis.push(g.li);
    });
    colocar($('#barra-proyectos'), lis);
    $('#barra-proyectos-vacio').hidden = lis.length > 0;
    $('#barra-proyectos-vacio').textContent = txt ? 'Ninguna sesión coincide con "' + q + '".' : filtrado ? 'Ninguna sesión en «' + textoFiltro() + '». Cambia el filtro en Agrupar y ordenar.' : 'Todavía no hay sesiones. Pulsa «Nueva sesión» para trabajar en una carpeta.';
    $('#barra-orden').title = 'Agrupar y ordenar: ' + (plano ? 'sin agrupar' : 'por proyecto') + ', ' + ({ manual: 'orden manual', creada: 'fecha de creación' }[plano && b.modo === 'manual' ? '' : b.modo] || 'actividad reciente') + (filtrado ? ', solo ' + textoFiltro().toLowerCase() : '');
    // Filtro activo a la vista, con un botón para quitarlo.
    const fx = $('#barra-filtro');
    fx.hidden = !filtrado;
    if (filtrado && fx.dataset.f !== textoFiltro()) { fx.dataset.f = textoFiltro(); ui.pintar(fx, [el('span', { class: 'crece' }, 'Filtro: ' + textoFiltro()), el('button', { type: 'button', class: 'sb-mini', 'aria-label': 'Quitar el filtro ' + textoFiltro(), onclick: () => { b.filtro = 'todas'; b.entorno = 'todos'; fx.dataset.f = ''; guardar(); pintar(); decir('Filtro quitado: se ven todas las sesiones.'); $('#barra-orden').focus(); } }, '✕')]); }
    if (!filtrado) fx.dataset.f = '';
    $('#barra-proyectos').classList.toggle('plana', plano);
    // La lista "Sesiones" (js/chat-columns.js) va encima: esta es la de las carpetas, o el historial sin agrupar.
    $('#barra-t').textContent = plano ? 'Historial' : 'Proyectos';
    const nArch = (D.estado.sesiones || []).filter(s => b.quitadas.indexOf(s.id) >= 0).length;
    $('#barra-todas').textContent = nArch ? 'Ver todas · ' + nArch + ' archivada' + (nArch === 1 ? '' : 's') : 'Ver todas';
    $('#barra-fij-sec').hidden = !fij.length;
    pintarNav();
  }
  /* Secciones: el punto rojo marca la actual; Cambios dice cuántos parches esperan tu aprobación. */
  function pintarNav() {
    const parches = RA.asistentes && RA.asistentes.parches ? (RA.asistentes.parches() || []).filter(p => p.estado === 'pendiente').length : 0;
    ui.$$('.sb-nav button').forEach(x => {
      const n = x.querySelector('.sb-n'); if (!n) return;
      const v = x.dataset.vista === 'cambios' && parches && x.getAttribute('aria-current') !== 'page' ? String(parches) : '';
      if (n.textContent !== v) n.textContent = v;
      n.setAttribute('aria-label', v ? v + ' parches esperan tu aprobación' : '');
    });
  }
  // Coloca los nodos en orden moviendo solo los que no están en su sitio.
  function colocar(ul, lis) {
    lis.forEach((li, i) => { if (ul.children[i] !== li) ul.insertBefore(li, ul.children[i] || null); });
    while (ul.children.length > lis.length) ul.lastChild.remove();
  }

  // ---- Acciones ----
  function abrir(id) {
    RA.app.sel.sesion = id; RA.app.sel.agente = null; RA.app.sel.evento = null; RA.app.sel.tope = 0;
    const sel = $('#ses-elegida'); if (sel) sel.value = id;
    cerrarCajon();
    RA.app.ir('chat');
    pintar();
  }
  // Sesión nueva en una carpeta de la barra: el asistente llega con la carpeta ya puesta.
  function nuevaEn(k) {
    if (k === SIN) return;
    cerrarCajon();
    if (RA.capas) RA.capas.asistente({ carpeta: k });
  }
  function fijar(id) {
    const i = b.fijadas.indexOf(id), s = porId(id);
    if (i >= 0) b.fijadas.splice(i, 1); else b.fijadas.unshift(id);
    guardar(); pintar();
    decir((i >= 0 ? 'Sesión desfijada: ' : 'Sesión fijada: ') + (s ? s.nombre : id));
  }
  function listaDe(lista) { return lista === 'proyectos' ? b.proyectos : lista === 'fijadas' ? b.fijadas : (b.sesiones[lista] = b.sesiones[lista] || []); }
  // Orden visible de una lista (sin ocultos ni fijadas), que es el que se mueve.
  function visibles(lista) {
    if (lista === 'proyectos') return b.proyectos.filter(k => existentes.has(k) && b.ocultos.indexOf(k) < 0);
    if (lista === 'fijadas') return b.fijadas.filter(id => porId(id));
    return listaDe(lista).filter(id => b.fijadas.indexOf(id) < 0 && porId(id));
  }
  function mover(lista, id, delta, anunciar) {
    const vis = visibles(lista), i = vis.indexOf(id), j = Math.max(0, Math.min(vis.length - 1, i + delta));
    if (i < 0 || i === j) return false;
    vis.splice(i, 1); vis.splice(j, 0, id);
    aplicarOrden(lista, vis);
    pintar();
    if (anunciar !== false) anunciarPos(lista, id);
    return true;
  }
  // Reescribe el arreglo guardado respetando lo que no se ve (ocultos, fijadas) en su sitio relativo.
  function aplicarOrden(lista, vis) {
    const arr = listaDe(lista), fuera = arr.filter(x => vis.indexOf(x) < 0);
    arr.length = 0; vis.concat(fuera).forEach(x => arr.push(x));
  }
  function anunciarPos(lista, id, pre) {
    pre = pre || '';
    const vis = visibles(lista), pos = vis.indexOf(id) + 1;
    if (lista === 'proyectos') decir(pre + 'Proyecto ' + nombreProy(id) + ' movido a la posición ' + pos + ' de ' + vis.length + '.');
    else { const s = porId(id); decir(pre + 'Sesión ' + (s ? s.nombre : id) + ' movida a la posición ' + pos + ' de ' + vis.length + (lista === 'fijadas' ? ' en fijadas.' : ' en el proyecto ' + nombreProy(lista) + '.')); }
  }
  // Por la región de estado común (#status), sin toast: la app tiene una sola región viva.
  const decir = t => { ui.decir(t, { toast: false }); ultimo = t; };
  let ultimo = '';

  // ---- Teclado en el asa: Espacio levanta y suelta, flechas mueven, Esc cancela ----
  function teclaAsa(e, lista, id, h) {
    if (b.modo !== 'manual' || q) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (levantado && levantado.id === id) { const l = levantado; levantado = null; h.closest('li').classList.remove('levantado'); guardar(); anunciarPos(lista, id, 'Soltado. '); return; }
      levantado = { lista: lista, id: id, antes: visibles(lista) };
      h.closest('li').classList.add('levantado');
      decir('Levantado. Usa las flechas para moverlo, Espacio para soltar, Esc para cancelar.');
    } else if (levantado && levantado.id === id && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      mover(lista, id, e.key === 'ArrowUp' ? -1 : 1);
      h.focus();
    } else if (levantado && levantado.id === id && e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      aplicarOrden(lista, levantado.antes); levantado = null; h.closest('li').classList.remove('levantado'); pintar(); h.focus();
      decir('Movimiento cancelado.');
    }
  }

  // ---- Arrastre con puntero (ratón o táctil desde el asa), con auto-desplazamiento ----
  function arrastrar(e, lista, id) {
    if (b.modo !== 'manual' || q || e.button > 0) return;
    e.preventDefault();
    const li = e.currentTarget.closest('li'), ul = li.parentElement, caja = $('#barra-desliza');
    const antes = visibles(lista);
    li.classList.add('levantado'); arrastrando = true;
    let y = e.clientY, rodar = null;
    const recolocar = () => {
      const hermanos = Array.from(ul.children).filter(x => x !== li);
      const destino = hermanos.find(x => { const r = x.getBoundingClientRect(); return y < r.top + r.height / 2; });
      if (destino ? li.nextSibling !== destino : ul.lastChild !== li) ul.insertBefore(li, destino || null);
    };
    const mov = ev => {
      y = ev.clientY; recolocar();
      const r = caja.getBoundingClientRect(), v = y < r.top + 40 ? -8 : y > r.bottom - 40 ? 8 : 0;
      clearInterval(rodar); rodar = v ? setInterval(() => { caja.scrollTop += v; recolocar(); }, 16) : null;
    };
    const fin = ev => {
      clearInterval(rodar);
      removeEventListener('pointermove', mov); removeEventListener('pointerup', fin); removeEventListener('pointercancel', fin);
      li.classList.remove('levantado'); arrastrando = false;
      if (ev.type === 'pointercancel') { aplicarOrden(lista, antes); pintar(); return; }
      aplicarOrden(lista, Array.from(ul.children).map(x => x.dataset.id).filter(x => antes.indexOf(x) >= 0));
      guardar(); pintar();
      if (visibles(lista).indexOf(id) !== antes.indexOf(id)) anunciarPos(lista, id);
    };
    // En window: mover el nodo en el DOM quitaría la captura del puntero al asa.
    addEventListener('pointermove', mov); addEventListener('pointerup', fin); addEventListener('pointercancel', fin);
  }

  // ---- Menús de ítem (alternativa sin arrastre) ----
  function menuBoton(nombre, abrirMenu) {
    return el('button', { type: 'button', class: 'barra-menu-b', 'aria-haspopup': 'menu', 'aria-label': 'Abrir opciones de ' + nombre, onclick: e => abrirMenu(e.currentTarget) }, icono('M3 8h1M8 8h1M13 8h1'));
  }
  function menu(boton, opciones) {
    cerrarMenu();
    const m = el('ul', { class: 'card barra-menu', role: 'menu' }, opciones.filter(Boolean).map(o => el('li', { role: 'none' }, el('button', { type: 'button', role: 'menuitem', tabindex: '-1', onclick: () => { cerrarMenu(); o[1](); } }, o[0]))));
    boton.setAttribute('aria-expanded', 'true');
    boton.after(m);
    const items = ui.$$('[role=menuitem]', m);
    m.addEventListener('keydown', e => {
      const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus(); }
      else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); cerrarMenu(); boton.focus(); }
    });
    items[0].focus();
    menu.abierto = { m: m, boton: boton };
  }
  function cerrarMenu() { const a = menu.abierto; if (a) { a.m.remove(); a.boton.setAttribute('aria-expanded', 'false'); menu.abierto = null; } }
  document.addEventListener('pointerdown', e => { const a = menu.abierto; if (a && !a.m.contains(e.target) && e.target !== a.boton) cerrarMenu(); });
  function menuSesion(id, lista) {
    const fijada = b.fijadas.indexOf(id) >= 0, manual = b.modo === 'manual' && !q;
    const boton = (nodos.get(id + '|' + lista) || {}).li.querySelector('.barra-menu-b');
    menu(boton, [
      [fijada ? 'Desfijar' : 'Fijar', () => fijar(id)],
      manual ? ['Mover arriba', () => { if (mover(lista, id, -1)) guardar(); boton.focus(); }] : null,
      manual ? ['Mover abajo', () => { if (mover(lista, id, 1)) guardar(); boton.focus(); }] : null,
      ['Abrir carpeta', () => pide('barraAbrirCarpeta', id).then(r => { if (r && r.error) ui.decir(r.error); })],
      ['Archivar', () => archivar(id, true)]
    ]);
  }
  function menuProyecto(k) {
    const g = grupos.get(k), boton = g.li.querySelector('.barra-menu-b'), manual = b.modo === 'manual' && !q;
    const una = (b.sesiones[k] || []).map(porId).filter(Boolean)[0];
    menu(boton, [
      k !== SIN ? ['Crear sesión aquí', () => nuevaEn(k)] : null,
      ['Renombrar', () => renombrar(k, boton)],
      manual ? ['Mover arriba', () => { if (mover('proyectos', k, -1)) guardar(); boton.focus(); }] : null,
      manual ? ['Mover abajo', () => { if (mover('proyectos', k, 1)) guardar(); boton.focus(); }] : null,
      una && k !== SIN ? ['Abrir carpeta', () => pide('barraAbrirCarpeta', una.id)] : null,
      ['Quitar de la barra', () => { b.ocultos.push(k); guardar(); pintar(); ui.decir('Carpeta quitada de la barra. Sus sesiones siguen en Agentes.', 'ok'); $('#barra-abrir').focus(); }]
    ]);
  }
  function renombrar(k, boton) {
    const g = grupos.get(k), cab = g.exp.parentElement;
    const inp = el('input', { class: 'input barra-ren', value: nombreProy(k), 'aria-label': 'Nuevo nombre visible para ' + nombreProy(k), maxlength: '80' });
    const fin = ok => { if (ok) { const v = inp.value.trim(); if (v) b.nombres[k] = v; else delete b.nombres[k]; guardar(); } inp.replaceWith(g.exp); g.firma = ''; pintar(); boton.focus(); };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') fin(true); else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fin(false); } });
    inp.addEventListener('blur', () => { if (inp.isConnected) fin(true); });
    g.exp.replaceWith(inp); inp.select(); inp.focus();
    void cab;
  }

  // Alto de la cabecera fija y de la barra de estado del pie: la barra lateral cabe entre las dos.
  function medir() {
    const cab = $('.cabeza'), pie = $('#barra-estado'), r = document.documentElement.style;
    if (cab) r.setProperty('--cab', cab.offsetHeight + 'px');
    if (pie) r.setProperty('--pie', pie.offsetHeight + 'px');
  }

  // ---- Plegar (≥ 1024 px) o panel superpuesto (< 1024 px; chat en tres columnas) ----
  const ESTRECHO = '(max-width: 1023px)';
  const estrecho = () => matchMedia(ESTRECHO).matches;
  // Plegar no mueve el foco: si estaba en el campo de prompts, ahí sigue.
  function alternar() {
    if (estrecho()) return cajon ? cerrarCajon() : abrirCajon();
    b.plegada = !b.plegada; guardar(); aplicarPliegue();
  }
  function aplicarPliegue() {
    medir();
    const plegada = !estrecho() && b.plegada;
    const antes = document.body.classList.contains('barra-plegada');
    document.body.classList.toggle('barra-plegada', plegada);
    // Las vistas que dependen del ancho (heatmap, bento) se recalculan con resize.
    if (antes !== plegada) dispatchEvent(new Event('resize'));
    $('#barra-btn').setAttribute('aria-expanded', String(estrecho() ? !!cajon : !plegada));
    $('#barra-btn').setAttribute('aria-label', estrecho() ? 'Abrir barra lateral' : plegada ? 'Mostrar barra lateral' : 'Cerrar barra lateral');
  }
  function abrirCajon() {
    const a = $('#barra'), fondo = $('#barra-fondo');
    a.classList.add('abierta'); fondo.hidden = false;
    cajon = { soltar: ui.atrapar(a, cerrarCajon), desde: document.activeElement };
    $('#barra-btn').setAttribute('aria-expanded', 'true');
    $('#menu').setAttribute('aria-expanded', 'true');
    const f = $('#nav button[aria-current="page"]') || $('#nueva'); if (f) f.focus();
  }
  function cerrarCajon() {
    if (!cajon) return;
    const desde = cajon.desde;
    cajon.soltar(); cajon = null;
    $('#barra').classList.remove('abierta'); $('#barra-fondo').hidden = true;
    $('#barra-btn').setAttribute('aria-expanded', 'false');
    $('#menu').setAttribute('aria-expanded', 'false');
    // El foco vuelve al botón que lo abrió ("Sesiones" en estrecho), si se ve.
    const m = $('#menu');
    if ((desde === m || (desde && desde.id === 'barra-btn')) && desde.offsetParent !== null) desde.focus();
  }

  // ---- Montaje ----
  // ---- Agrupar y ordenar (como el icono del encabezado de Claude Code Desktop) ----
  const iconoOrden = () => ui.svg('svg', { viewBox: '0 0 16 16', width: '16', height: '16', 'aria-hidden': 'true', class: 'ico', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5', 'stroke-linecap': 'round' }, [ui.svg('path', { d: 'M2.5 4h11M4.5 8h7M6.5 12h3' })]);
  function menuOrden(boton) {
    if (ui.menu.abierto && ui.menu.abierto.boton === boton) return ui.cerrarMenu();
    const plano = b.agrupar === 'ninguno', fija = (clave, valor, aviso) => () => { b[clave] = valor; guardar(); pintar(); decir(aviso); boton.focus(); };
    ui.menu(boton, [
      { texto: 'Agrupar por', titulo: true },
      { texto: 'Proyecto', radio: true, marcado: !plano, fn: fija('agrupar', 'carpeta', 'Sesiones agrupadas por proyecto.') },
      { texto: 'Sin agrupar', radio: true, marcado: plano, fn: fija('agrupar', 'ninguno', 'Sesiones sin agrupar.') },
      '-',
      { texto: 'Ordenar por', titulo: true },
      { texto: 'Actividad reciente', radio: true, marcado: b.modo !== 'manual' && b.modo !== 'creada', fn: fija('modo', 'reciente', 'Orden por actividad reciente.') },
      { texto: 'Fecha de creación', radio: true, marcado: b.modo === 'creada', fn: fija('modo', 'creada', 'Orden por fecha de creación, de la más nueva a la más antigua.') },
      { texto: 'Manual (arrastrable)', radio: true, marcado: b.modo === 'manual', desactivado: plano ? 'Sin agrupar, las sesiones no se ordenan a mano.' : null, fn: fija('modo', 'manual', 'Orden manual: se puede arrastrar.') },
      '-',
      { texto: 'Estado', titulo: true }
    ].concat(Object.keys(FILTROS).map(f => ({ texto: FILTROS[f], radio: true, marcado: b.filtro === f, fn: fija('filtro', f, f === 'todas' ? 'Se ven todas las sesiones.' : 'Solo las sesiones en «' + FILTROS[f] + '».') })),
      hayRemotas() || b.entorno !== 'todos' ? ['-', { texto: 'Entorno', titulo: true }].concat(Object.keys(ENTORNOS).map(k => ({ texto: ENTORNOS[k], radio: true, marcado: b.entorno === k, id: 'barra-ent-' + k,
        fn: fija('entorno', k, k === 'todos' ? 'Sesiones de todos los entornos.' : 'Solo las sesiones de «' + ENTORNOS[k] + '».') }))) : []));
  }

  // ---- Archivar: la sesión sale de la lista; su registro de Claude Code no se toca ----
  function archivar(id, si) {
    const s = (D.estado.sesiones || []).find(x => x.id === id), nombre = s ? s.nombre : 'La sesión';
    b.quitadas = b.quitadas.filter(x => x !== id);
    if (si) { b.quitadas.push(id); b.fijadas = b.fijadas.filter(x => x !== id); }
    guardar(); pintar();
    ui.decir(si ? nombre + ' archivada. Está en Ver todas › Archivadas; su registro de Claude Code no se borra.' : nombre + ' vuelve a la lista.', si ? { tipo: 'ok', accion: { texto: 'Deshacer', fn: () => archivar(id, false) } } : 'ok');
  }

  /* Ver todas: capa con dos pestañas, Activas y Archivadas. Desde Activas se abre o se archiva una
     sesión; desde Archivadas se desarchiva. Foco atrapado; Esc cierra y devuelve el foco. */
  function verTodas(pestana) {
    const capa = $('#capa'), volver = $('#barra-todas');
    const fila = (s, arch) => el('li', { class: 'todas-fila' }, [
      el('span', { class: 'sb-dot ' + estado(s)[0], 'aria-hidden': 'true' }),
      el('span', { class: 'crece todas-n' }, [el('span', { class: 'todas-tit' }, s.nombre), el('span', { class: 'mono todas-ruta' }, corta(proyDe(s)) + (s.tUlt ? ' · ' + relativo(s.tUlt) : ''))]),
      arch ? el('button', { type: 'button', class: 'btn btn-small', onclick: () => { archivar(s.id, false); pintarCapa('archivadas'); $('#todas-tab-archivadas').focus(); } }, 'Desarchivar')
        : el('span', { class: 'row' }, [
          el('button', { type: 'button', class: 'btn btn-small', onclick: () => { cerrarCapa(); abrir(s.id); } }, 'Abrir'),
          el('button', { type: 'button', class: 'btn btn-small', onclick: () => { archivar(s.id, true); pintarCapa('activas'); $('#todas-tab-activas').focus(); } }, 'Archivar')
        ])
    ]);
    function pintarCapa(p) {
      const todas = (D.estado.sesiones || []).slice().sort((x, y) => (y.tUlt || 0) - (x.tUlt || 0));
      const arch = todas.filter(s => b.quitadas.indexOf(s.id) >= 0), act = todas.filter(s => b.quitadas.indexOf(s.id) < 0);
      const lista = p === 'archivadas' ? arch : act;
      const tab = (v, txt, n) => el('button', { type: 'button', role: 'tab', id: 'todas-tab-' + v, 'data-v': v, 'aria-selected': String(p === v), 'aria-controls': 'todas-lista', tabindex: p === v ? '0' : '-1', onclick: () => { pintarCapa(v); $('#todas-tab-' + v).focus(); } }, txt + ' · ' + n);
      const tabs = el('div', { id: 'todas-tabs', class: 'seg todas-tabs', role: 'tablist', 'aria-label': 'Sesiones' }, [tab('activas', 'Activas', act.length), tab('archivadas', 'Archivadas', arch.length)]);
      tabs.addEventListener('keydown', e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); const v = p === 'activas' ? 'archivadas' : 'activas'; pintarCapa(v); $('#todas-tab-' + v).focus(); } });
      ui.pintar($('#todas'), [
        el('div', { class: 'row between' }, [el('h2', { id: 'todas-t', class: 'todas-h' }, 'Todas las sesiones'), el('button', { type: 'button', class: 'btn btn-small', onclick: cerrarCapa }, 'Cerrar')]),
        tabs,
        el('div', { id: 'todas-lista', role: 'tabpanel', 'aria-labelledby': 'todas-tab-' + p },
          lista.length ? el('ul', { class: 'todas-ul' }, lista.map(s => fila(s, p === 'archivadas')))
            : el('p', { class: 'note' }, p === 'archivadas' ? 'No hay sesiones archivadas. Archiva una desde su menú en la barra lateral (pasa el cursor por ella).' : 'Todavía no hay sesiones.'))
      ]);
    }
    const esc = e => { if (e.key === 'Escape' && $('#todas')) { e.preventDefault(); cerrarCapa(); } };
    function cerrarCapa() { removeEventListener('keydown', esc); ui.pintar(capa, null); capa.classList.remove('abierta'); if (volver) volver.focus(); }
    addEventListener('keydown', esc);
    ui.pintar(capa, el('div', { class: 'velo todas-velo', onclick: e => { if (e.target === e.currentTarget) cerrarCapa(); } },
      el('section', { id: 'todas', class: 'card capa-card todas', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'todas-t' })));
    capa.classList.add('abierta');
    pintarCapa(pestana || 'activas');
    ui.atrapar($('#todas'), () => {});
    $('#todas-tab-' + (pestana || 'activas')).focus();
  }

  function montar() {
    const a = $('#barra');
    if (!a) return;
    // Glifo 5×5, punto de la sección actual y contador en cada sección (el texto se queda como está).
    ui.$$('.sb-nav button[data-glifo]').forEach(x => {
      if (x.querySelector('.glifo')) return;
      const txt = x.textContent;
      ui.pintar(x, [RA.glifos.svg(RA.glifos.P[x.dataset.glifo], null, 3), el('span', { class: 'sb-lab' }, txt), el('span', { class: 'sb-pt', 'aria-hidden': 'true' }), el('span', { class: 'sb-n mono' })]);
    });
    ui.pintar($('#barra-desliza'), [
      el('div', { class: 'sb-ctit' }, [
        el('h2', { class: 'label', id: 'barra-t' }, 'Sesiones'),
        el('span', { class: 'pan-mas-caja sb-orden-caja' }, el('button', { type: 'button', id: 'barra-orden', class: 'sb-mini sb-orden', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'Agrupar y ordenar las sesiones', onclick: e => menuOrden(e.currentTarget) }, iconoOrden())),
        el('button', { type: 'button', id: 'barra-abrir', class: 'sb-mini', 'aria-label': 'Abrir una carpeta', title: 'Abrir una carpeta y empezar una sesión en ella', onclick: () => { cerrarCajon(); $('#nueva').click(); } }, '+ Abrir')
      ]),
      el('div', { id: 'barra-filtro', class: 'sb-filtro', hidden: '' }),
      el('section', { id: 'barra-fij-sec', 'aria-labelledby': 'barra-fij-t', hidden: '' }, [el('h3', { class: 'label sb-sub', id: 'barra-fij-t' }, 'Fijadas'), el('ul', { id: 'barra-fijadas', class: 'barra-lista' }), el('p', { id: 'barra-fijadas-vacio', class: 'note', hidden: '' }, 'Mayús+clic en una sesión para fijarla')]),
      el('ul', { id: 'barra-proyectos', class: 'barra-lista barra-proyectos', 'aria-labelledby': 'barra-t' }),
      el('p', { id: 'barra-proyectos-vacio', class: 'note' }),
      // Como "View all" de Claude Code Desktop: todas las sesiones, con la pestaña Archivadas.
      el('button', { type: 'button', id: 'barra-todas', class: 'sb-mini barra-todas', 'aria-haspopup': 'dialog', onclick: () => verTodas('activas') }, 'Ver todas')
    ]);
    $('#barra-btn').addEventListener('click', alternar);
    // Nueva sesión abre su asistente: el cajón (en estrecho) se recoge para no quedar encima.
    $('#nueva').addEventListener('click', cerrarCajon);
    $('#barra-fondo').addEventListener('click', cerrarCajon);
    matchMedia(ESTRECHO).addEventListener('change', () => { cerrarCajon(); aplicarPliegue(); });
    addEventListener('resize', () => { medir(); });
    document.addEventListener('keydown', e => {
      if (e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey && e.key.toLowerCase() === 'n') { e.preventDefault(); $('#nueva').click(); }
    });
    // Sección actual marcada también en la barra.
    document.addEventListener('rastro:vista', () => setTimeout(pintarNav));
    if (D.alCambiar) D.alCambiar(pintar);
    const sel = $('#ses-elegida'); if (sel) sel.addEventListener('change', () => setTimeout(pintar));
    setInterval(pintar, 60000);          // tiempos relativos
    pide('barraLeer').then(r => { if (r && typeof r === 'object') Object.keys(b).forEach(k => { if (r[k] !== undefined) b[k] = r[k]; }); cargada = true; aplicarPliegue(); pintar(); });
    // Maqueta en el navegador (sin app): el estado vive en localStorage.
    if (!P) { cargada = true; aplicarPliegue(); pintar(); }
  }
  // Maqueta en el navegador (sin app): el estado vive en localStorage y se aplica ya, antes del primer
  // pintado de las vistas que dependen del ancho.
  if (!P) {
    try { const r = JSON.parse(localStorage.getItem('rastro:barra') || '{}'); Object.keys(b).forEach(k => { if (r[k] !== undefined) b[k] = r[k]; }); } catch (e) { /* sin almacenamiento */ }
    if (b.plegada && !matchMedia('(max-width: 1023px)').matches) document.body.classList.add('barra-plegada');
  }
  // Tras los demás scripts (app.js define RA.app y se carga después).
  if (document.readyState === 'complete') montar(); else addEventListener('DOMContentLoaded', montar);

  RA.barra = { verTodas: verTodas, archivar: archivar, pintar: pintar, abrir: abrir, menu: menu, cerrarMenu: cerrarMenu, relativo: relativo, nuevaEn: nuevaEn, cerrar: () => cerrarCajon(), ultimo: () => ultimo, plegar: v => { b.plegada = !!v; guardar(); aplicarPliegue(); } };
})(window.RA = window.RA || {});
