/* Barra de la sesión y paneles de la vista Code, con la estructura de Claude Code Desktop
   (docs/SESION-GAP.md). Barra: botones Terminal, Cambios, Navegador y Archivos; menú ⋮ con los paneles que
   no tienen botón (Tareas en segundo plano y Plan, solo cuando hay algo que enseñar), los botones que no caben
   en ancho estrecho y el panel de detalles de la sesión.
   Paneles: cuadrícula junto a la conversación (rediseño de abril, docs/REDISENO-ABRIL.md): hasta dos columnas de
   paneles con uno o dos paneles cada una. Se mueven arrastrando el encabezado a un lado de otro panel (o con su asa:
   ← → columna, ↑ ↓ apilar, Inicio y Fin), cambian de ancho y de alto desde los bordes (ratón o flechas), se cierran
   (✕ o Ctrl+\), se sacan a una ventana propia y la disposición se restablece desde el ⋮ (con Deshacer).
   Terminal, Cambios y Archivos reutilizan sus secciones (#v-consola, #v-cambios, #v-archivos); los demás los
   registra su módulo con RA.paneles.registrar. Por debajo de 1024 px no hay sitio: vuelven a ser vistas. */
(function (RA) {
  'use strict';

  const ui = RA.ui, el = ui.el, $ = ui.$, D = RA.datos, L = RA.logica;
  // Sin botón de Cambios (diff) desde 2026-11-04: el panel sigue con Ctrl+Mayús+D, como en Claude Code Desktop.
  const BOTONES = [
    { id: 'consola', nombre: 'Terminal', glifo: 'Bash', atajo: 'Ctrl+`' },
    { id: 'navegador', nombre: 'Navegador', glifo: 'Web', atajo: 'Ctrl+Mayús+B' },
    { id: 'archivos', nombre: 'Archivos', glifo: 'Carpeta' }
  ];
  const VISTAS = { consola: 'Terminal', cambios: 'Cambios', archivos: 'Archivos' };   // paneles hechos con una vista
  const NOMBRES = { chat: 'Conversación', consola: 'Terminal', cambios: 'Cambios', navegador: 'Navegador', archivos: 'Archivos', plan: 'Tareas', tareas: 'Segundo plano', lateral: 'Chat lateral' };
  const IDS = Object.keys(NOMBRES).filter(x => x !== 'chat');
  const registrados = {};          // id -> { nombre, montar(cuerpo), pintar(), menu(), alCerrar() }
  const ESTRECHO = matchMedia('(max-width:1279px)'), ANCHO = matchMedia('(min-width:1024px)'), RAIL = matchMedia('(min-width:1280px)');
  const MIN = 280, MIN_CHAT = 360, PASO = 24, ANCHO0 = 440, VIEJA = 'rastro:paneles';
  // Ventana propia: esta página es la de un panel sacado de la principal (?panel=…&sesion=…).
  const Q = new URLSearchParams(location.search), SOLO = IDS.includes(Q.get('panel')) ? Q.get('panel') : null;

  /* Disposición en cuadrícula (docs/REDISENO-ABRIL.md, punto 1): columnas de izquierda a derecha y, en cada una, uno
     o dos paneles. La lógica es pura (RA.logica: abrirPanel, moverPanel, tecladoPanel…); aquí se pinta. Se guarda en
     los ajustes (D.guardar: almacén del proceso principal y copia local), no solo en el navegador. */
  function cargar() {
    if (SOLO) return { columnas: [['chat'], [SOLO]], anchos: {}, altos: {} };
    // Formato anterior (una fila en "rastro:paneles"): se convierte una vez y se borra.
    let viejo = null;
    try { viejo = JSON.parse(localStorage.getItem(VIEJA)); if (viejo) localStorage.removeItem(VIEJA); } catch (e) { /* sin ajustes */ }
    if (viejo) { const e = L.estadoPaneles(viejo, IDS); D.guardar({ paneles: e }); return e; }
    return L.estadoPaneles(D.ajustes.paneles, IDS);
  }
  let est = cargar();
  const fuera = new Set();         // paneles que están en su propia ventana
  let foco = null;                 // último panel con el foco (Ctrl+\ lo cierra)
  const guardar = () => { if (!SOLO) D.guardar({ paneles: est }); };
  const abiertos = () => est.columnas.reduce((a, c) => a.concat(c), []).filter(x => x !== 'chat');
  const cuerpo = () => $('#chat-cuerpo');
  const nodo = id => $('.panel[data-panel="' + id + '"]');
  const columnaDe = id => est.columnas.find(c => c.indexOf(id) >= 0);
  const cabeza = id => { const c = columnaDe(id); return c ? c[0] : id; };
  const decir = t => ui.decir(t, { toast: false });

  const P = RA.paneles = {
    BOTONES: BOTONES, NOMBRES: NOMBRES, SOLO: SOLO,
    esPanel: v => !!VISTAS[v],
    // La vista se ve, como vista completa o como panel junto a la conversación.
    visible: v => !!RA.app && (RA.app.sel.vista === v || (RA.app.sel.vista === 'chat' && P.enPanel(v))),
    // Hay paneles cuando hay sitio. En la ventana propia de un panel, siempre.
    usar: () => !!SOLO || ANCHO.matches,
    enPanel: v => P.usar() && abiertos().includes(v) && !!nodo(v),
    abierto: id => P.usar() ? abiertos().includes(id) || fuera.has(id) : !!(VISTAS[id] && RA.app && RA.app.sel.vista === id),
    abiertos: abiertos,
    disposicion: () => JSON.parse(JSON.stringify(est)),
    registrar(id, def) {
      registrados[id] = def;
      const n = nodo(id);
      if (n) { n.replaceChild(cabecera(id), n.querySelector('.panel-cab')); if (!VISTAS[id] && def.montar && !n.querySelector('.panel-cuerpo').childElementCount) def.montar(n.querySelector('.panel-cuerpo')); }
      if (abiertos().includes(id)) colocar();
    },

    abrir(id, sinFoco) {
      if (!NOMBRES[id] || id === 'chat') return;
      if (!VISTAS[id] && !registrados[id]) return ui.decir('El panel ' + NOMBRES[id] + ' todavía no está disponible.', 'atencion');
      if (!P.usar()) {
        // Sin sitio para columnas: los paneles de vista se abren como vista; los demás no caben.
        if (VISTAS[id]) return irVista(id, sinFoco);
        return ui.decir('Ensancha la ventana para abrir el panel ' + NOMBRES[id] + ': necesita al menos 1024 px.', 'atencion');
      }
      if (fuera.has(id) && D.ventanaPanel) return D.ventanaPanel(id, sesionId());     // ya está en su ventana: se enfoca
      if (RA.app.sel.vista !== 'chat') RA.app.ir('chat', true);
      if (!abiertos().includes(id)) {
        // Columna nueva solo si cabe con el ancho mínimo; si no, se apila.
        const c = cuerpo(), n = est.columnas.length;
        const r = L.abrirPanel(est, id, !c || c.clientWidth >= MIN_CHAT + n * MIN);
        if (r.error) return ui.decir(r.error, 'atencion');
        est = r.est; guardar();
      }
      colocar();
      RA.app.pintar();
      document.dispatchEvent(new CustomEvent('rastro:panel', { detail: id }));
      pintar();
      const n = nodo(id);
      // El foco va al título de la vista que contiene (su h1 oculto) o al del panel.
      if (n && !sinFoco) (n.querySelector('.panel-cuerpo h1[tabindex]') || n.querySelector('.panel-tit')).focus();
    },

    cerrar(id, callado) {
      if (id === 'chat' || !abiertos().includes(id)) return;
      const n = nodo(id), tenia = n && n.contains(document.activeElement);
      est = L.cerrarPanel(est, id).est; guardar();
      if (registrados[id] && registrados[id].alCerrar) registrados[id].alCerrar();
      if (id === 'archivos' && RA.explorador) RA.explorador.salir();
      colocar();
      pintar();
      if (SOLO) return window.close();
      if (tenia) { const b = $('#pan-b-' + id); (b && b.offsetParent ? b : $('#h-chat')).focus(); }
      if (!callado) decir('Panel ' + NOMBRES[id] + ' cerrado.');
    },

    // Teclado del asa: flechas, Inicio y Fin (RA.logica.tecladoPanel). Dice dónde quedó o por qué no se movió.
    teclado(id, tecla) {
      const r = L.tecladoPanel(est, id, tecla);
      if (r.error) return decir(r.error);
      if (r.est === est) return;
      est = r.est; guardar(); colocar(); dispararResize();
      decir(L.dondePanel(est, id, NOMBRES[id]));
    },
    // Compatibilidad: mover un sitio a la izquierda (paso < 0) o a la derecha.
    mover(id, paso) { P.teclado(id, paso < 0 ? 'ArrowLeft' : 'ArrowRight'); },
    // Soltar con el ratón: junto a otro panel (o a la conversación), a uno de sus lados.
    soltar(id, junto, lado) {
      const r = L.moverPanel(est, id, junto, lado);
      if (r.error) return ui.decir(r.error, 'atencion');
      est = r.est; guardar(); colocar(); dispararResize();
      decir(L.dondePanel(est, id, NOMBRES[id]));
    },

    // Ancho de la columna de `id` (lo guarda el panel de arriba). Los demás se quedan como se ven ahora.
    ancho(id, px) {
      const cab = cabeza(id), otros = columnasPan().filter(c => c[0] !== cab).reduce((a, c) => a + anchoReal(c[0]), 0);
      const max = Math.max(MIN, cuerpo().clientWidth - MIN_CHAT - otros);
      columnasPan().forEach(c => { if (c[0] !== cab) est.anchos[c[0]] = anchoReal(c[0]); });
      est.anchos[cab] = Math.round(Math.max(MIN, Math.min(max, px)));
      guardar(); colocar();
      dispararResize();
    },
    // Alto del panel de arriba de una columna doble, como fracción (0,2–0,8).
    alto(id, f) {
      const cab = cabeza(id);
      est.altos[cab] = Math.max(L.PAN_ALTO_MIN, Math.min(1 - L.PAN_ALTO_MIN, f));
      guardar(); colocar(); dispararResize();
    },

    /* Restablecer la disposición: la conversación sola, con el panel Contexto. Cierra los paneles (la terminal sigue
       viva: su proceso no depende del panel) y ofrece Deshacer 8 s, como las demás acciones reversibles (DESIGN.md, B5). */
    restablecer() {
      const antes = { est: JSON.parse(JSON.stringify(est)), lado: !!(D.ajustes.chat3 && D.ajustes.chat3.lado) };
      abiertos().slice().forEach(id => P.cerrar(id, true));
      est = L.panInicial(); guardar(); colocar(); pintar();
      ponerLado(true);
      ui.decir('Disposición restablecida: la conversación y el panel Contexto.', { tipo: 'ok', accion: { texto: 'Deshacer', fn: () => {
        est = L.estadoPaneles(antes.est, IDS); guardar(); colocar(); pintar();
        ponerLado(antes.lado);
        if (RA.app) RA.app.pintar();
        ui.decir('Disposición recuperada.', 'ok');
      } } });
      if (RA.app) RA.app.pintar();
    },
    esInicial: () => !abiertos().length && !!(D.ajustes.chat3 && D.ajustes.chat3.lado),

    // Saca el panel a su propia ventana; la principal sigue trabajando. Solo en la app de escritorio.
    sacar(id) {
      if (!D.ventanaPanel) return ui.decir('Sacar un panel a su ventana solo funciona en la app de escritorio.', 'atencion');
      Promise.resolve(D.ventanaPanel(id, sesionId())).then(r => {
        if (r && r.error) return ui.decir(r.error, 'error');
        fuera.add(id);
        est = L.cerrarPanel(est, id).est; guardar();
        if (id === 'archivos' && RA.explorador) RA.explorador.salir();
        colocar(); pintar();
        ui.decir('Panel ' + NOMBRES[id] + ' en su propia ventana.', 'ok');
      });
    },
    // La ventana de un panel se acopla (o se cierra): vuelve a la principal.
    acoplado(id, volver) { fuera.delete(id); if (volver) P.abrir(id, true); pintar(); },

    // Lo guardado cambió en otra parte (el proceso principal al arrancar).
    aplicarGuardado(x) { if (SOLO) return; est = L.estadoPaneles(x, IDS); colocar(); pintar(); },

    pintar: pintar,
    pintarVistas() { if (!P.usar() || RA.app.sel.vista !== 'chat') return; abiertos().forEach(v => { if (VISTAS[v] && RA.vistas[v]) RA.vistas[v](); else if (registrados[v] && registrados[v].pintar) registrados[v].pintar(); }); }
  };

  P.tieneFondo = s => !!(s && RA.logica.tareasFondo(s).length);
  P.tienePlan = s => !!(s && s.plan && s.plan.total);
  const sesionId = () => { const s = RA.vistas && RA.vistas.actual(); return s ? s.id : null; };
  const dispararResize = () => requestAnimationFrame(() => dispatchEvent(new Event('resize')));
  const columnasPan = () => est.columnas.filter(c => c[0] !== 'chat').map(c => c.filter(id => VISTAS[id] || registrados[id])).filter(c => c.length);
  const anchoReal = cab => { const w = nodo(cab) && nodo(cab).parentNode.classList.contains('pan-col') ? Math.round(nodo(cab).parentNode.getBoundingClientRect().width) : 0; return w || est.anchos[cab] || ANCHO0; };

  function ponerLado(v) {
    const e3 = Object.assign({ lado: false, filtro: 'activas' }, D.ajustes.chat3);
    if (e3.lado === v) return;
    D.guardar({ chat3: Object.assign(e3, { lado: v }) });
    if (RA.chat3) RA.chat3.aplicar();
  }

  function irVista(id, sinFoco) {
    // Vista completa (estrecho): la lógica de siempre, sin pasar por los paneles.
    const usar = P.usar; P.usar = () => false;
    try { RA.app.ir(id, sinFoco); } finally { P.usar = usar; }
  }

  // ---------- Columnas ----------
  function cabecera(id) {
    const nombre = NOMBRES[id], def = registrados[id] || {};
    const asa = el('button', { type: 'button', class: 'panel-asa', 'aria-label': 'Mover el panel ' + nombre + ' (flechas: ← → columna, ↑ ↓ apilar; Inicio y Fin)', title: 'Arrastra para mover' }, ui.icono('asa'));
    asa.addEventListener('keydown', e => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key) || e.ctrlKey || e.altKey || e.metaKey) return;
      e.preventDefault(); P.teclado(id, e.key);
      const a = nodo(id) && nodo(id).querySelector('.panel-asa'); if (a) a.focus();
    });
    const botones = [];
    if (def.menu) {
      const m = el('button', { type: 'button', class: 'icono panel-b panel-mas', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'Abrir opciones del panel ' + nombre, title: 'Más' }, ui.icono('mas'));
      m.addEventListener('click', () => { if (ui.menu.abierto && ui.menu.abierto.boton === m) return ui.cerrarMenu(); ui.menu(m, def.menu()); });
      botones.push(el('span', { class: 'pan-mas-caja' }, m));
    }
    if (SOLO) botones.push(el('button', { type: 'button', class: 'btn btn-small panel-acoplar', onclick: () => D.acoplarPanel ? D.acoplarPanel(id, sesionId()) : window.close() }, 'Acoplar'));
    else botones.push(el('button', { type: 'button', class: 'icono panel-b panel-sacar', 'aria-label': 'Sacar el panel ' + nombre + ' a una ventana', title: D.ventanaPanel ? 'Sacar a una ventana' : 'Sacar a una ventana: solo en la app de escritorio',
      'aria-disabled': D.ventanaPanel ? null : 'true', onclick: () => P.sacar(id) }, ui.icono('sacar')));
    botones.push(el('button', { type: 'button', class: 'icono panel-b panel-cerrar', 'aria-label': 'Cerrar el panel ' + nombre + ' (Ctrl+\\)', title: 'Cerrar (Ctrl+\\)', onclick: () => P.cerrar(id) }, ui.icono('cerrar')));
    return el('header', { class: 'panel-cab' }, [asa, el('h2', { class: 'panel-tit', tabindex: '-1', id: 'panel-t-' + id }, nombre), el('span', { class: 'hueco' }), ...botones]);
  }

  // Borde vertical de una columna de paneles: cambia su ancho (ratón o flechas). Mira hacia la conversación.
  function borde(col) {
    const b = el('div', { class: 'panel-borde', role: 'separator', tabindex: '0', 'aria-orientation': 'vertical', 'aria-valuemin': String(MIN), title: 'Arrastra para cambiar el ancho' });
    const id = () => b.parentNode.querySelector('.panel').dataset.panel;
    b.addEventListener('keydown', e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const haciaChat = b.classList.contains('izq') ? e.key === 'ArrowLeft' : e.key === 'ArrowRight';
      P.ancho(id(), col().getBoundingClientRect().width + (haciaChat ? PASO : -PASO));
    });
    b.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.preventDefault(); b.setPointerCapture(e.pointerId);
      const x0 = e.clientX, w0 = col().getBoundingClientRect().width, izq = b.classList.contains('izq'), i = id();
      document.body.classList.add('arrastrando-borde');
      const mov = ev => P.ancho(i, w0 + (izq ? x0 - ev.clientX : ev.clientX - x0));
      const fin = () => { b.removeEventListener('pointermove', mov); document.body.classList.remove('arrastrando-borde'); };
      b.addEventListener('pointermove', mov);
      b.addEventListener('pointerup', fin, { once: true }); b.addEventListener('pointercancel', fin, { once: true });
    });
    return b;
  }

  // Separador horizontal entre dos paneles apilados: cambia el alto del de arriba (ratón o flechas, 5 %).
  function separador(wrap) {
    const s = el('div', { class: 'pan-sep', role: 'separator', tabindex: '0', 'aria-orientation': 'horizontal', 'aria-valuemin': '20', 'aria-valuemax': '80', title: 'Arrastra para cambiar el alto' });
    const arriba = () => wrap.querySelector('.panel').dataset.panel;
    const fraccion = () => { const r = wrap.getBoundingClientRect(), a = wrap.querySelector('.panel').getBoundingClientRect(); return r.height ? a.height / r.height : 0.5; };
    s.addEventListener('keydown', e => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault(); P.alto(arriba(), fraccion() + (e.key === 'ArrowDown' ? 0.05 : -0.05));
    });
    s.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.preventDefault(); s.setPointerCapture(e.pointerId);
      const id = arriba();
      document.body.classList.add('arrastrando-sep');
      const mov = ev => { const r = wrap.getBoundingClientRect(); P.alto(id, (ev.clientY - r.top) / r.height); };
      const fin = () => { s.removeEventListener('pointermove', mov); document.body.classList.remove('arrastrando-sep'); };
      s.addEventListener('pointermove', mov);
      s.addEventListener('pointerup', fin, { once: true }); s.addEventListener('pointercancel', fin, { once: true });
    });
    return s;
  }

  /* Arrastre del encabezado. Sobre otro panel: a su izquierda o derecha (columna propia) si el puntero está en el
     cuarto de ese lado; si no, encima o debajo (apilado). Sobre la conversación: a su izquierda o derecha. El destino
     se ve antes de soltar (recuadro o barra en --sel, con la frase); si no se puede, la frase dice por qué. Esc cancela. */
  function arrastrable(sec, id) {
    const cab = sec.querySelector('.panel-cab');
    cab.addEventListener('pointerdown', e => {
      if (e.button !== 0 || SOLO || (e.target.closest('button') && !e.target.closest('.panel-asa'))) return;
      e.preventDefault();
      const x0 = e.clientX, y0 = e.clientY;
      let destino = null, activo = false, fantasma = null, marca = null;
      const quitar = () => { if (fantasma) fantasma.remove(); if (marca) marca.remove(); sec.classList.remove('moviendo'); document.body.classList.remove('arrastrando-panel'); };
      const calcular = (x, y) => {
        const bajo = document.elementFromPoint(x, y), t = bajo && (bajo.closest('#chat-cuerpo .panel') || bajo.closest('#chat-cuerpo > .chat-col'));
        if (!t || t === sec) return null;
        const r = t.getBoundingClientRect(), junto = t.classList.contains('chat-col') ? 'chat' : t.dataset.panel;
        const rx = (x - r.left) / r.width, ry = (y - r.top) / r.height;
        const lado = junto === 'chat' ? (rx < 0.5 ? 'izq' : 'der') : rx < 0.25 ? 'izq' : rx > 0.75 ? 'der' : ry < 0.5 ? 'arriba' : 'abajo';
        const caja = lado === 'izq' || lado === 'der' ? (t.parentNode.classList.contains('pan-col') ? t.parentNode : t).getBoundingClientRect() : r;
        return { junto: junto, lado: lado, caja: caja, error: L.moverPanel(est, id, junto, lado).error };
      };
      const pintarMarca = d => {
        if (!marca) { marca = el('div', { class: 'pan-destino', 'aria-hidden': 'true' }, el('span', { class: 'pan-destino-txt' })); document.body.appendChild(marca); }
        marca.hidden = !d;
        if (!d) return;
        // Solo la parte visible: sin pasar bajo la cabecera ni bajo la barra de estado.
        const pie = $('#barra-estado'), abajo = Math.min(d.caja.bottom, pie && pie.getBoundingClientRect().height ? pie.getBoundingClientRect().top : innerHeight), arriba = Math.max(d.caja.top, 56);
        const k = { left: d.caja.left, right: d.caja.right, width: d.caja.width, top: arriba, height: Math.max(80, abajo - arriba) }, vert = d.lado === 'izq' || d.lado === 'der';
        marca.className = 'pan-destino ' + (vert ? 'barra' : 'mitad') + (d.lado === 'der' ? ' izq-txt' : '') + (d.error ? ' no' : '');
        // Barra: todo el alto de la columna, en su borde. Recuadro: la mitad de arriba o de abajo del panel, bajo su encabezado.
        const cab = 48, mitad = (k.height - cab) / 2;
        const g = vert ? { left: d.lado === 'izq' ? k.left : k.right - 3, top: k.top, width: 3, height: k.height }
          : { left: k.left + 8, top: k.top + cab + (d.lado === 'abajo' ? mitad : 0) + 8, width: k.width - 16, height: mitad - 16 };
        Object.keys(g).forEach(x => { marca.style[x] = Math.round(g[x]) + 'px'; });
        const nombre = NOMBRES[d.junto];
        marca.firstChild.textContent = d.error ? 'No: ' + d.error : 'Soltar aquí: ' + { izq: 'a la izquierda de ', der: 'a la derecha de ', arriba: 'encima de ', abajo: 'debajo de ' }[d.lado] + (d.junto === 'chat' ? 'la conversación' : nombre);
      };
      const mov = ev => {
        if (!activo) {
          if (Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) < 4) return;
          activo = true; sec.classList.add('moviendo'); document.body.classList.add('arrastrando-panel');
          fantasma = el('div', { class: 'pan-fantasma', 'aria-hidden': 'true' }, [ui.icono('asa'), ' ', NOMBRES[id]]);
          document.body.appendChild(fantasma);
        }
        Object.assign(fantasma.style, { left: (ev.clientX + 12) + 'px', top: (ev.clientY + 12) + 'px' });
        destino = calcular(ev.clientX, ev.clientY);
        pintarMarca(destino);
      };
      const terminar = soltar => {
        removeEventListener('pointermove', mov); removeEventListener('pointerup', alSoltar); removeEventListener('pointercancel', cancelar); removeEventListener('keydown', esc, true);
        quitar();
        if (soltar && activo && destino) P.soltar(id, destino.junto, destino.lado);
        else if (activo && !soltar) decir('Movimiento cancelado: el panel ' + NOMBRES[id] + ' sigue donde estaba.');
      };
      const alSoltar = () => terminar(true), cancelar = () => terminar(false);
      const esc = ev => { if (ev.key === 'Escape' && activo) { ev.preventDefault(); ev.stopPropagation(); terminar(false); } };
      addEventListener('pointermove', mov); addEventListener('pointerup', alSoltar); addEventListener('pointercancel', cancelar); addEventListener('keydown', esc, true);
    });
  }

  function seccion(id) {
    let sec = nodo(id);
    if (sec) return sec;
    sec = el('section', { class: 'panel', 'data-panel': id, 'aria-labelledby': 'panel-t-' + id }, [cabecera(id), el('div', { class: 'panel-cuerpo' })]);
    sec.addEventListener('focusin', () => { foco = id; });
    arrastrable(sec, id);
    const caja = sec.querySelector('.panel-cuerpo');
    cuerpo().appendChild(sec);           // primero en la página: el módulo del panel busca sus nodos al montarse
    if (VISTAS[id]) { const v = $('#v-' + id); v.hidden = false; v.classList.add('en-panel'); caja.appendChild(v); }
    else if (registrados[id] && registrados[id].montar) registrados[id].montar(caja);
    return sec;
  }

  // Devuelve la sección de una vista a su sitio de siempre (dentro de <main>) y la oculta.
  function devolver(id) {
    const sec = nodo(id);
    if (!sec) return;
    if (VISTAS[id]) { const v = $('#v-' + id); v.classList.remove('en-panel'); v.hidden = RA.app.sel.vista !== id; $('#main').appendChild(v); }
    sec.remove();
  }

  // Anchos de las columnas de paneles: los guardados, ajustados para que nada se salga de la ventana.
  function anchos(cols) {
    const c = cuerpo(), quiere = cols.map(col => est.anchos[col[0]] || ANCHO0), suma = quiere.reduce((a, b) => a + b, 0);
    const conRail = RAIL.matches && !document.body.classList.contains('panel-plegado') && c.clientWidth - suma - 320 >= MIN_CHAT + 60;
    const libre = c.clientWidth - MIN_CHAT - (conRail ? 300 : 0) - 16;
    document.body.classList.toggle('rail-sin-sitio', !!SOLO || (cols.length > 0 && !conRail));
    if (SOLO || suma <= libre) return quiere;
    const k = libre / suma, w = quiere.map(x => Math.max(200, Math.floor(x * k)));
    return w.reduce((a, b) => a + b, 0) <= libre ? w : cols.map(() => Math.max(160, Math.floor(libre / cols.length)));
  }

  // Pone cada columna en su orden, su ancho y su alto; quita lo que se cerró. Sin sitio, devuelve las vistas.
  function colocar() {
    const c = cuerpo();
    if (!c) return;
    const usar = P.usar(), cols = usar ? columnasPan() : [], lista = cols.reduce((a, x) => a.concat(x), []);
    const activo = document.activeElement;
    ui.$$('.panel', c).forEach(n => { if (!lista.includes(n.dataset.panel)) devolver(n.dataset.panel); });
    c.classList.toggle('con-paneles', lista.length > 0);
    document.body.classList.toggle('ventana-panel', !!SOLO);
    const orden = est.columnas.filter(col => col[0] === 'chat' || cols.some(x => x[0] === col.filter(id => VISTAS[id] || registrados[id])[0]));
    const iChat = orden.findIndex(col => col[0] === 'chat');
    $('#chat-cuerpo > .chat-col').style.order = String(iChat * 2);
    const ws = anchos(cols), viejos = ui.$$('#chat-cuerpo > .pan-col');
    cols.forEach((col, k) => {
      const wrap = viejos[k] || c.appendChild(el('div', { class: 'pan-col' }));
      const i = orden.findIndex(x => x.indexOf(col[0]) >= 0);
      wrap.style.order = String(i * 2);
      wrap.style.flexBasis = SOLO ? 'auto' : ws[k] + 'px';
      // Los paneles, en su orden. Solo se mueve un nodo si no está ya en su sitio (moverlo le quitaría el foco).
      const quiere = [];
      col.forEach((id, f) => { if (f) quiere.push('sep'); quiere.push(seccion(id)); });
      let sep = wrap.querySelector(':scope > .pan-sep');
      if (col.length > 1 && !sep) sep = separador(wrap);
      const nodos = quiere.map(x => x === 'sep' ? sep : x);
      const b = wrap.querySelector(':scope > .panel-borde');
      nodos.forEach((n, j) => { const ahora = wrap.children[j + (b ? 1 : 0)]; if (ahora !== n) wrap.insertBefore(n, ahora || null); });
      if (col.length < 2 && sep) sep.remove();
      // Alto: el de arriba con su fracción; el de abajo, lo que queda.
      const f = est.altos[col[0]] || 0.5;
      nodos.filter(n => n.classList.contains('panel')).forEach((n, j) => { n.style.flex = col.length > 1 && j === 0 ? '0 0 calc(' + (f * 100).toFixed(1) + '% - 4px)' : '1 1 0'; });
      if (sep) { sep.setAttribute('aria-valuenow', String(Math.round(f * 100))); sep.setAttribute('aria-label', 'Alto de ' + NOMBRES[col[0]] + ' frente a ' + NOMBRES[col[1]] + ' (flechas arriba y abajo)'); }
      // El borde para el ancho va del lado de la conversación. Se reutiliza: así no pierde el foco.
      if (SOLO) { if (b) b.remove(); }
      else {
        const nb = b || wrap.insertBefore(borde(() => wrap), wrap.firstChild), izq = i > iChat;
        nb.classList.toggle('izq', izq); nb.classList.toggle('der', !izq);
        nb.setAttribute('aria-label', 'Ancho de la columna de ' + col.map(x => NOMBRES[x]).join(' y '));
        requestAnimationFrame(() => nb.setAttribute('aria-valuenow', String(Math.round(wrap.getBoundingClientRect().width))));
      }
    });
    viejos.slice(cols.length).forEach(w => w.remove());
    if (activo && activo !== document.activeElement && activo.isConnected && c.contains(activo)) activo.focus({ preventScroll: true });
  }

  // ---------- Barra de la sesión ----------
  function boton(b) {
    const nombre = b.nombre + (b.atajo ? ' (' + b.atajo + ')' : '');
    return el('button', { type: 'button', id: 'pan-b-' + b.id, class: 'icono pan-b', 'data-panel': b.id, 'aria-label': 'Abrir ' + nombre, title: nombre, 'aria-pressed': 'false',
      onclick: () => P.abierto(b.id) && P.usar() && !fuera.has(b.id) ? P.cerrar(b.id) : P.abrir(b.id) }, RA.glifos.svg(RA.glifos.P[b.glifo], null, 3));
  }

  function opcionesMenu() {
    const s = RA.vistas.actual(), plegado = document.body.classList.contains('panel-plegado');
    const ops = [];
    // Bloque J: los paneles van siempre aquí (la cabecera queda en cinco controles).
    BOTONES.forEach(b => ops.push({ texto: b.nombre, atajo: b.atajo, panel: b.id, id: 'pan-menu-' + b.id, fn: () => P.abrir(b.id) })); ops.push('-');
    // Y la vista de la transcripción (Ctrl+O la alterna).
    const CV = RA.conversacion;
    if (CV && s) {
      ops.push({ texto: 'Vista de la transcripción · Ctrl+O', titulo: true });
      CV.VISTAS.forEach(([id, nombre]) => ops.push({ texto: nombre, radio: true, marcado: CV.vista() === id, id: 'vt-' + id,
        desactivado: id === 'pensamiento' && !CV.conPens(s) ? 'Esta sesión no tiene pensamiento visible de Claude.' : null, fn: () => CV.poner(id) }));
      ops.push('-');
    }
    if (P.tieneFondo(s)) ops.push({ texto: 'Segundo plano', panel: 'tareas', fn: () => P.abrir('tareas') });
    if (P.tienePlan(s)) ops.push({ texto: 'Tareas', panel: 'plan', fn: () => P.abrir('plan') });
    if (ops.length && ops[ops.length - 1] !== '-') ops.push('-');
    // El panel Contexto (js/chat-columns.js): columna desde 1280 px; por debajo, superpuesto.
    const ancho = matchMedia('(min-width: 1280px)').matches;
    ops.push({ texto: !ancho ? 'Abrir el panel Contexto' : plegado ? 'Mostrar el panel Contexto' : 'Ocultar el panel Contexto', id: 'pan-menu-rail', fn: () => $('#panel-btn').click() });
    ops.push('-');
    ops.push({ texto: 'Restablecer la disposición', id: 'pan-menu-reset', desactivado: P.esInicial() ? 'Ya está la disposición de partida: la conversación y el panel Contexto.' : null, fn: () => P.restablecer() });
    return ops;
  }

  function pintar() {
    const caja = $('#pan-botones');
    if (!caja) return;
    if (!caja.childElementCount) ui.pintar(caja, BOTONES.map(boton));
    BOTONES.forEach(b => {
      const n = $('#pan-b-' + b.id), on = P.abierto(b.id);
      n.setAttribute('aria-pressed', String(on));
      n.setAttribute('aria-label', (on && P.usar() && !fuera.has(b.id) ? 'Cerrar ' : 'Abrir ') + b.nombre + (b.atajo ? ' (' + b.atajo + ')' : ''));
    });
  }

  function montar() {
    if (SOLO && Q.get('sesion') && RA.app) { RA.app.sel.sesion = Q.get('sesion'); document.title = 'Rastro · ' + NOMBRES[SOLO]; }
    pintar();
    $('#pan-mas').addEventListener('click', e => { if (ui.menu.abierto && ui.menu.abierto.boton === e.currentTarget) return ui.cerrarMenu(); ui.menu(e.currentTarget, opcionesMenu()); });
    document.addEventListener('rastro:vista', () => { colocar(); pintar(); });
    // Al cruzar 1024 px las columnas aparecen o vuelven a ser vistas.
    ANCHO.addEventListener('change', () => { colocar(); if (RA.app) RA.app.pintar(); pintar(); });
    addEventListener('resize', () => colocar());
    // Atajos de Claude Code Desktop. Se atienden en captura: funcionan también con el foco en la terminal.
    addEventListener('keydown', e => {
      if (!e.ctrlKey || e.altKey || e.metaKey || !RA.app) return;
      const k = e.key.toLowerCase();
      let id = null;
      if (!e.shiftKey && (e.code === 'Backquote' || k === '`')) id = 'consola';
      else if (e.shiftKey && k === 'd') id = 'cambios';
      else if (e.shiftKey && k === 'b') id = 'navegador';
      else if (!e.shiftKey && (e.code === 'Backslash' || k === '\\')) {
        const a = document.activeElement && document.activeElement.closest('.panel');
        e.preventDefault(); e.stopPropagation();
        return a ? P.cerrar(a.dataset.panel) : foco && abiertos().includes(foco) ? P.cerrar(foco) : null;
      }
      if (!id) return;
      e.preventDefault(); e.stopPropagation();
      P.abrir(id);
    }, true);
    colocar();
    if (SOLO) { RA.app.ir('chat', true); P.abrir(SOLO, true); }
    else if (abiertos().length && RA.app && RA.app.sel.vista === 'chat') RA.app.pintar();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar); else montar();
})(window.RA = window.RA || {});
