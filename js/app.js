/* Arranque y cableado: navegación, tema, atajos, anuncios, sonido y los controles fijos de la página.
   Las vistas (src/renderer/js/views.js) pintan; aquí se decide cuándo y se atiende lo que la persona hace. */
(function (RA) {
  'use strict';

  const ui = RA.ui, el = ui.el, $ = ui.$, D = RA.datos, C = RA.calc, V = RA.vistas;
  // Vistas: las seis de la barra y Ajustes (botón circular). Estadísticas vive dentro de Uso.
  // Los identificadores (consola, uso) no cambian; los nombres visibles sí: Terminal y Consumo se entienden solos.
  // Solo hay vista Code (la vista Claude, de conversaciones normales, se retiró el 2026-11-04).
  const VISTAS = { chat: 'Chat', sesiones: 'Agentes', cambios: 'Cambios', archivos: 'Archivos', consola: 'Terminal', uso: 'Consumo', ajustes: 'Ajustes', nueva: 'Nueva sesión', programadas: 'Programadas' };
  const SUB_USO = { consumo: 'Tu plan', estadisticas: 'Estadísticas', orquestacion: 'Reparto automático', recursos: 'GPU y memoria', continuidad: 'Sin Claude' };
  const TEMAS = { dark: 'oscuro', light: 'claro', auto: 'automático' };

  const app = RA.app = {
    // Selección de la persona: qué vista, sesión, agente, paso y filtros tiene a la vista.
    sel: { vista: 'chat', usoVista: 'consumo', sesion: null, agente: null, evento: null, filtro: 'todo', filtroSes: 'todas', sesVista: 'mapa', agAlcance: 'sesion', detalle: null, grupo: 'no', modoDiff: 'linea', archivo: null, calor: 'dias' },
    cerrados: {},    // nodos del árbol plegados
    cambio: {},      // cifras que cambiaron en la última actualización, por sesión
    pausa: false,
    tQuieto: null,
    carrete: '',     // última llamada pintada en el carrete, para saber si llegó una nueva

    apartado: 'code',
    // vista: una de VISTAS, o 'estadisticas' (que es Uso con su segunda vista interna).
    ir(vista, sinFoco) {
      if (SUB_USO[vista]) { app.sel.usoVista = vista; vista = 'uso'; }
      // Terminal, Cambios y Archivos son paneles junto a la conversación cuando hay sitio (js/panes.js).
      const PA = RA.paneles;
      if (PA && PA.esPanel(vista) && PA.usar()) return PA.abrir(vista, sinFoco);
      // Archivos deja de verse (como vista o como panel de Chat): se deja de vigilar la carpeta.
      const veiaArchivos = PA ? PA.visible('archivos') : app.sel.vista === 'archivos';
      if (veiaArchivos && vista !== 'archivos' && !(vista === 'chat' && PA && PA.enPanel('archivos'))) RA.explorador.salir();
      app.sel.vista = vista;
      document.body.classList.toggle('en-chat', vista === 'chat');
      document.body.classList.toggle('en-agentes', vista === 'sesiones');
      Object.keys(VISTAS).forEach(v => { $('#v-' + v).hidden = v !== vista && !(PA && PA.enPanel(v)); });
      ui.$$('#nav button[data-vista]').forEach(b => { if (b.dataset.vista === vista) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
      if (vista === 'ajustes') $('#ajustes-btn').setAttribute('aria-current', 'page'); else $('#ajustes-btn').removeAttribute('aria-current');
      document.title = 'Rastro · ' + VISTAS[vista] + (vista === 'uso' ? ' · ' + SUB_USO[app.sel.usoVista] : '');
      app.pintar();
      document.dispatchEvent(new CustomEvent('rastro:vista', { detail: vista }));
      // No hay título visible: el foco va al h1 oculto de la vista, para que se anuncie.
      if (!sinFoco) { scrollTo(0, 0); $('#h-' + vista).focus(); }
    },

    pintar() {
      const E = D.estado, viva = E.conexion === 'viva';
      /* Indicador de conexión y actividad: CONECTADO (con su punto rojo) mientras alguna sesión trabaja,
         INACTIVO si ninguna lo hace y SIN CONEXIÓN si se perdió el acceso a los transcripts. */
      const activa = E.sesiones.some(s => s.est === 'curso' || s.est === 'deteniendo');
      ui.pintar($('#b-conexion'), !viva ? [el('i', { class: 'pt anillo alerta', 'aria-hidden': 'true' }), ' Sin conexión'] : activa ? [el('i', { class: 'pt', 'aria-hidden': 'true' }), ' Trabajando'] : [el('i', { class: 'pt anillo', 'aria-hidden': 'true' }), ' En reposo']);
      $('#b-conexion').title = !viva ? 'Rastro no puede leer lo que hace Claude Code. Revisa el estado del equipo en Ajustes.' : activa ? 'Rastro ve lo que hace Claude Code; hay sesiones trabajando' : 'Rastro ve lo que hace Claude Code; ninguna sesión trabaja ahora';
      // Remote Control: solo si la sesión elegida lo tiene activo.
      const rc = V.actual(), conRc = !!(rc && rc.rc);
      $('#b-remote').hidden = !conRc;
      if (conRc) { ui.pintar($('#b-remote'), [el('i', { class: 'pt', 'aria-hidden': 'true' }), ' Control remoto activo']); $('#b-remote').title = 'Remote Control: ' + rc.nombre + ' se puede dirigir desde claude.ai o la app del celular.'; }
      $('#sin-conexion').hidden = viva;
      // La insignia de autenticación es permanente: va en la franja, bajo la barra.
      const a = D.auth;
      // En la barra solo se ve si la cuenta está bloqueada; si va bien, lo dice el pie (menú de la cuenta).
      $('#b-auth').hidden = !a || a.ok;
      if (a && !a.ok) { ui.pintar($('#b-auth'), ui.corchetes('Bloqueado: revisa tu cuenta')); $('#b-auth').classList.add('alerta'); $('#b-auth').title = a.motivo; }
      const nc = !a ? 'Tu cuenta' : a.ok ? 'Suscripción de Claude' : 'Cuenta bloqueada';
      $('#cuenta-nombre').textContent = nc; $('#cuenta-btn').setAttribute('aria-label', 'Abrir el menú de la cuenta: ' + nc);
      $('#cuenta-btn').title = !a ? 'Cuenta' : a.ok ? 'Rastro usa tu suscripción de claude.ai, nunca una clave de API.' : a.motivo;
      if (D.ruta) $('#vacio-ruta').textContent = D.ruta;
      V.franja();
      V[app.sel.vista]();
      if (RA.paneles) RA.paneles.pintarVistas();
    }
  };

  // ---- Métricas bajo demanda: la actividad en vivo no se anuncia evento a evento ----
  function leerMetricas() {
    const s = C.sesion(app.sel.sesion);
    if (!s) return ui.decir('No hay ninguna sesión.');
    const c = C.cifras(s);
    ui.decir(s.nombre + ': ' + c.activos + (c.activos === 1 ? ' agente activo, ' : ' agentes activos, ') + c.llamadas + ' llamadas, ' + c.errores + (c.errores === 1 ? ' error' : ' errores') + ', ' + ui.dur(c.ms) + '.');
  }

  /* ---- Anuncios agrupados ---- Solo se dice que una sesión o un subagente terminó, que hubo un
     error o que cambió la conexión; como máximo una frase cada 2 s ("3 errores nuevos"). */
  const cola = { fin: [], error: 0, subagente: 0, conexion: '', atencion: [] };
  let tAviso = null, ultimo = 0;
  function soltar() {
    tAviso = null; ultimo = Date.now();
    const f = [];
    if (cola.conexion) f.push(cola.conexion);
    if (cola.fin.length) f.push(cola.fin.length === 1 ? cola.fin[0] : cola.fin.length + ' sesiones terminaron.');
    if (cola.error) f.push(cola.error === 1 ? '1 error nuevo.' : cola.error + ' errores nuevos.');
    if (cola.atencion.length) f.push(cola.atencion.length === 1 ? cola.atencion[0] : cola.atencion.length + ' sesiones necesitan tu atención.');
    if (cola.subagente) f.push(cola.subagente === 1 ? 'Un subagente terminó.' : cola.subagente + ' subagentes terminaron.');
    cola.fin = []; cola.error = 0; cola.subagente = 0; cola.conexion = ''; cola.atencion = [];
    if (f.length) ui.decir(f.join(' '), { registrar: false });       // el centro de avisos ya los apunta uno a uno
  }
  D.alAvisar(a => {
    // Un sonido distinto por evento; uno solo aunque lleguen varios juntos.
    if (a.tipo === 'fin') { cola.fin.push(a.texto); RA.sonido.tocar('fin'); }
    else if (a.tipo === 'error') { cola.error++; RA.sonido.tocar('error'); }
    else if (a.tipo === 'atencion') { cola.atencion.push(a.texto || 'Una sesión necesita tu atención.'); RA.sonido.tocar('atencion'); }
    else if (a.tipo === 'subagente') cola.subagente++;
    else if (a.tipo === 'conexion') cola.conexion = a.texto;
    if (!tAviso) tAviso = setTimeout(soltar, Math.max(50, 2000 - (Date.now() - ultimo)));
  });

  // ---- Cambios en los datos ----
  let foto = {}, estados = {};
  function comparar() {
    let terminado = null;
    D.estado.sesiones.forEach(s => {
      const c = C.cifras(s), p = foto[s.id];
      app.cambio[s.id] = p ? { activos: c.activos !== p.activos, llamadas: c.llamadas !== p.llamadas, errores: c.errores !== p.errores } : {};
      foto[s.id] = c;
      s.agentes.forEach(a => { const k = s.id + a.id; if (estados[k] === 'curso' && a.est === 'listo' && a.padre) terminado = a; estados[k] = a.est; });
    });
    return terminado;
  }
  // La duración del subagente que acaba de terminar se compone en 400 ms (solo el último, si son varios).
  function componer(a) {
    const n = $('[data-dur="' + a.id + '"]');
    if (!n || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const fin = n.textContent, ms = C.durAgente(a), resto = fin.slice(fin.indexOf(' · ')), t0 = performance.now();
    const paso = ahora => { const k = Math.min(1, (ahora - t0) / 400); n.textContent = k < 1 ? ui.dur(ms * k) + resto : fin; if (k < 1 && n.isConnected) requestAnimationFrame(paso); };
    requestAnimationFrame(paso);
  }
  // El uso de la sesión que cruza el 90 % se dice una sola vez; vuelve a decirse si baja y cruza de nuevo.
  let cercaDicho = false;
  function avisarUso() {
    const b = D.estado.uso.bloques[0], cerca = !!b && b.pct != null && Math.round(b.pct) >= 90;     // como la cifra que se lee
    if (cerca && !cercaDicho) ui.decir('Uso de la sesión al ' + Math.round(b.pct) + ' %: cerca del límite.');
    cercaDicho = cerca;
  }
  D.alCambiar(() => {
    avisarUso();
    const terminado = comparar();
    if (app.pausa) return;                 // en pausa los eventos se siguen guardando, pero la vista no se mueve
    app.pintar();
    if (terminado && app.sel.vista === 'chat') componer(terminado);
  });

  // ---- Árbol de agentes: una sola parada de tabulador; flechas, Inicio, Fin, Enter ----
  function elegirAgente(id) {
    app.sel.agente = id; app.sel.evento = null; app.sel.tope = 0;
    const s = C.sesion(app.sel.sesion);
    ui.pintar($('#tiempo'), null);          // la línea de tiempo del agente nuevo empieza por el final
    V.arbol(s); V.tiempo(s);
    const n = $('#arbol [data-id="' + CSS.escape(id) + '"]');
    if (n) n.focus();
  }
  const arbol = $('#arbol');
  arbol.addEventListener('click', e => { const li = e.target.closest('[role="treeitem"]'); if (li) elegirAgente(li.dataset.id); });
  arbol.addEventListener('keydown', e => {
    const li = e.target.closest('[role="treeitem"]');
    if (!li) return;
    const vis = ui.$$('[role="treeitem"]', arbol), i = vis.indexOf(li), s = C.sesion(app.sel.sesion), abierto = li.getAttribute('aria-expanded');
    const plegar = v => { app.cerrados[s.id + li.dataset.id] = v; V.arbol(s); $('#arbol [data-id="' + CSS.escape(li.dataset.id) + '"]').focus(); };
    let a = null;
    if (e.key === 'ArrowDown') a = vis[i + 1];
    else if (e.key === 'ArrowUp') a = vis[i - 1];
    else if (e.key === 'Home') a = vis[0];
    else if (e.key === 'End') a = vis[vis.length - 1];
    else if (e.key === 'ArrowRight') { if (abierto === 'false') plegar(false); else if (abierto === 'true') a = $('[role="treeitem"]', li); else return; }
    else if (e.key === 'ArrowLeft') { if (abierto === 'true') plegar(true); else a = li.parentNode.closest('[role="treeitem"]'); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); return elegirAgente(li.dataset.id); }
    else return;
    e.preventDefault();
    if (a) a.focus();
  });

  // ---- Línea de tiempo: cada paso tiene una subtarjeta que se despliega (una abierta como mucho) ----
  const tiempo = $('#tiempo');
  tiempo.addEventListener('click', e => {
    const b = e.target.closest('.sub-cab');
    if (!b) return;
    app.sel.evento = app.sel.evento === b.dataset.id ? null : b.dataset.id;
    V.tiempo(C.sesion(app.sel.sesion));
    const n = $('#tiempo .sub-cab[data-id="' + b.dataset.id + '"]');
    if (n) { n.focus(); n.scrollIntoView({ block: 'nearest' }); }
  });
  ui.flechas(tiempo, '.sub-cab');
  // Si la persona sube, la vista deja de seguir al borde vivo y aparece "Ir al final".
  tiempo.addEventListener('scroll', () => { $('#ir-final').hidden = tiempo.scrollHeight - tiempo.scrollTop - tiempo.clientHeight < 48; });
  $('#ir-final').addEventListener('click', () => { tiempo.scrollTop = tiempo.scrollHeight; $('#pausar').focus(); });
  $('#pausar').addEventListener('click', ev => {
    app.pausa = !app.pausa;
    ev.currentTarget.textContent = app.pausa ? 'Reanudar' : 'Pausar';
    ev.currentTarget.setAttribute('aria-pressed', String(app.pausa));
    ui.decir(app.pausa ? 'Vista en pausa. Los eventos se siguen guardando.' : 'Vista reanudada.');
    if (!app.pausa) app.pintar();
  });
  $('#ses-elegida').addEventListener('change', ev => { app.sel.sesion = ev.target.value; app.sel.agente = null; app.sel.evento = null; app.sel.tope = 0; ui.pintar(tiempo, null); app.pintar(); });
  $('#leer').addEventListener('click', leerMetricas);

  // ---- Barra superior: marca, modos, menú en ancho estrecho, tema, ajustes y flechas de las tarjetas ----
  ui.pintar($('#marca'), RA.glifos.marca());
  ui.pintar($('#ajustes-btn'), ui.iconoAjustes());
  // La tuerca: abre Ajustes con su animación de desenroscado (js/settings.js).
  $('#ajustes-btn').addEventListener('click', () => { if (RA.barra && RA.barra.cerrar) RA.barra.cerrar(); if (RA.ajustes) RA.ajustes.abrir(); else app.ir('ajustes'); });
  // "Más detalles" de Chat: se recuerda si quedó abierto.
  const mas = $('#chat-mas');
  try { mas.open = localStorage.getItem('rastro:chatmas') === '1'; } catch (e) { /* sin almacenamiento */ }
  mas.addEventListener('toggle', () => { try { localStorage.setItem('rastro:chatmas', mas.open ? '1' : '0'); } catch (e) { /* sin almacenamiento */ } if (mas.open) app.pintar(); });
  // El panel derecho de Chat (botón "Contexto") lo lleva js/chat-columns.js.
  // En ancho estrecho las secciones están en la barra lateral, que es un cajón: el botón Menú la abre.
  const menu = $('#menu');
  const abrirMenu = on => { if (!on && RA.barra && RA.barra.cerrar) RA.barra.cerrar(); menu.setAttribute('aria-expanded', String(!!on)); };
  menu.addEventListener('click', () => { $('#barra-btn').click(); menu.setAttribute('aria-expanded', $('#barra-btn').getAttribute('aria-expanded')); });
  ui.$$('#nav button[data-vista]').forEach(b => b.addEventListener('click', () => { abrirMenu(false); app.ir(b.dataset.vista); }));
  // La flecha del pie de una tarjeta abre su vista ampliada; la del carrete lleva a la línea de tiempo.
  ui.$$('.mas').forEach(b => {
    b.appendChild(ui.flecha());
    b.addEventListener('click', () => {
      // Agentes trabajando abre Sesiones en el mapa: "qué hace cada agente" de un vistazo (Añadido 3).
      if (b.dataset.mapa) app.sel.sesVista = 'mapa';
      if (b.dataset.ir !== 'tiempo') return app.ir(b.dataset.ir);
      const n = $('#tiempo [tabindex="0"]') || $('#pausar');
      n.focus(); n.scrollIntoView({ block: 'center' });
    });
  });
  // Tema: un botón de icono que pasa de oscuro a claro y a automático.
  const botonTema = $('#tema');
  function pintaTema() {
    const t = D.ajustes.tema, orden = Object.keys(TEMAS), sig = orden[(orden.indexOf(t) + 1) % orden.length];
    ui.pintar(botonTema, ui.iconoTema(t));
    botonTema.dataset.tema = t;
    botonTema.setAttribute('aria-label', 'Tema ' + TEMAS[t] + '. Cambiar a ' + TEMAS[sig] + '.');
    botonTema.title = 'Tema ' + TEMAS[t];
  }
  // Cambia el tema (botón de la barra lateral o Ajustes › General › Modo de color).
  app.tema = t => {
    if (!TEMAS[t]) return;
    D.guardar({ tema: t }); ui.aplicarTema(t); pintaTema();
    ui.decir('Tema ' + TEMAS[t] + '.');
    if (D.alTema) D.alTema();              // en la app, los controles de ventana siguen al tema
  };
  botonTema.addEventListener('click', () => { const orden = Object.keys(TEMAS); app.tema(orden[(orden.indexOf(D.ajustes.tema) + 1) % orden.length]); });
  pintaTema();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (D.alTema) D.alTema(); });
  // Los heatmaps enseñan las semanas que caben: se repintan cuando la ventana cambia de tamaño.
  let tAncho = null;
  addEventListener('resize', () => { clearTimeout(tAncho); tAncho = setTimeout(V.mapas, 120); });

  // ---- Capas y atajos. Las teclas propias se pueden cambiar: se pulsa el botón y luego la tecla. ----
  $('#buscar').addEventListener('click', RA.capas.paleta);
  $('#nueva').addEventListener('click', RA.capas.asistente);
  $('#vacio-nueva').addEventListener('click', RA.capas.asistente);
  const nombreTecla = k => k.length === 1 ? k.toUpperCase() : k;
  function teclaCambiable(btn, clave, que) {
    // El nombre accesible sale del contenido: una frase solo para lector de pantalla y la tecla a la vista.
    const pinta = () => {
      const k = nombreTecla(D.ajustes.teclas[clave]);
      btn.classList.remove('armed');
      ui.pintar(btn, [el('span', { class: 'sr' }, 'Cambiar la tecla que ' + que + '. Ahora es '), k]);
      if (clave === 'buscar') ui.$$('.t-buscar').forEach(n => { if (n.dataset.k) n.dataset.k = k; else n.textContent = k; });
    };
    btn.addEventListener('click', () => { btn.classList.add('armed'); btn.lastChild.textContent = '…'; ui.decir('Pulsa la tecla nueva. Escape cancela.'); });
    btn.addEventListener('keydown', e => {
      if (!btn.classList.contains('armed') || ['Shift', 'Control', 'Alt', 'Meta'].indexOf(e.key) >= 0) return;
      e.preventDefault(); e.stopPropagation();
      if (['Escape', 'Tab', 'Enter', ' '].indexOf(e.key) < 0) {
        const t = D.ajustes.teclas; t[clave] = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        D.guardar({ teclas: t });
        ui.decir('Tecla cambiada a ' + nombreTecla(t[clave]) + '.');
      }
      pinta();
    });
    btn.addEventListener('blur', pinta);
    pinta();
  }
  teclaCambiable($('#tecla-buscar'), 'buscar', 'abre la búsqueda con Control');
  teclaCambiable($('#tecla-leer'), 'leer', 'dice las métricas');
  document.addEventListener('keydown', e => {
    const t = D.ajustes.teclas, k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const escribe = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if (e.ctrlKey && !e.altKey && !e.metaKey && k === t.buscar) { e.preventDefault(); RA.capas.paleta(); }
    else if (!e.ctrlKey && !e.altKey && !e.metaKey && k === t.leer && !(escribe && k.length === 1)) { e.preventDefault(); leerMetricas(); }
  });

  // ---- Sonido: si el sistema exige un gesto, se ofrece el botón "Activar sonido" ----
  RA.sonido.alCambiar = b => { $('#sonido-activar').hidden = !b; };
  $('#sonido-activar').addEventListener('click', () => { RA.sonido.activar(); $('#nueva').focus(); });

  // ---- Estado vacío ----
  $('#vacio-ruta').textContent = D.so.proyectos();
  if ($('#dir-datos')) $('#dir-datos').textContent = D.so.datos();
  $('#vacio-copiar').addEventListener('click', () => ui.copiar($('#vacio-ruta').textContent, 'Ruta'));

  // ---- Datos y respaldo: mismo patrón de confirmación que TypeNothing (el foco va a Cancelar) ----
  const msg = t => { $('#datos-msg').textContent = t; };
  const confirmar = (id, abrir) => { $('#reiniciar-conf').hidden = !(abrir && id === 'reiniciar'); $('#importar-conf').hidden = !(abrir && id === 'importar'); if (abrir) $('#' + id + '-no').focus(); };
  $('#exportar').addEventListener('click', () => Promise.resolve(D.exportar()).then(t => { ui.descargar('rastro-respaldo.json', t); msg('Respaldo exportado.'); }));
  $('#reiniciar').addEventListener('click', () => confirmar('reiniciar', true));
  $('#reiniciar-no').addEventListener('click', () => { confirmar('reiniciar', false); $('#reiniciar').focus(); });
  $('#reiniciar-si').addEventListener('click', () => { confirmar('reiniciar', false); Promise.resolve(D.borrar()).then(() => msg('Historial borrado.')); $('#reiniciar').focus(); });
  $('#importar').addEventListener('click', () => $('#importar-archivo').click());
  $('#importar-archivo').addEventListener('change', ev => {
    const f = ev.target.files[0];
    if (!f) return;
    f.text().then(t => D.importar(t)).then(r => {       // valida el archivo; si no vale, falla
      $('#importar-que').textContent = 'El archivo trae ' + r.n + ' ' + r.que + '. Se van a reemplazar los ' + r.actual + ' que hay ahora.';
      confirmar('importar', true);
    }).catch(() => msg('Ese archivo no es un respaldo válido de Rastro.'));
    ev.target.value = '';
  });
  $('#importar-no').addEventListener('click', () => { confirmar('importar', false); $('#importar').focus(); });
  $('#importar-si').addEventListener('click', () => { confirmar('importar', false); Promise.resolve(D.reemplazar()).then(() => msg('Respaldo importado.')); $('#importar').focus(); });

  // ---- Solo con datos de muestra: insignia permanente, escenarios y simulación ----
  if (D.muestra) {
    $('#b-muestra').hidden = false; $('#muestra').hidden = false;
    let esc = 'normal', fuente = 'estimado';
    const pintaSim = () => {
      ui.segmentado($('#sim-esc'), [['normal', 'Normal'], ['vacio', 'Vacío'], ['cargando', 'Cargando'], ['perdida', 'Sin conexión']], esc, v => { esc = v; fuente = 'estimado'; foto = {}; estados = {}; Object.assign(app.sel, { sesion: null, agente: null, evento: null, detalle: null, archivo: null }); pintaSim(); D.sim.escenario(v); }, 'Escenario de muestra');
      // El uso oficial solo existe con una fuente real verificada: aquí es una vista previa del diseño.
      ui.segmentado($('#sim-uso'), [['estimado', 'Uso estimado'], ['oficial', 'Vista previa: uso oficial']], fuente, v => { fuente = v; pintaSim(); D.sim.fuenteUso(v); }, 'Fuente del uso de muestra');
    };
    pintaSim();
    $('#sim-evento').addEventListener('click', () => D.sim.evento(app.sel.sesion, app.sel.agente));
    $('#sim-error').addEventListener('click', () => D.sim.evento(app.sel.sesion, app.sel.agente, true));
    $('#sim-fin').addEventListener('click', () => D.sim.terminar());
  }

  // ---- Claridad (Fase C): glosario, ayuda "?", modo Simple / Avanzado y guía de primer uso ----
  const GLOSARIO = {
    sesion: ['Sesión', 'Una conversación de trabajo con Claude Code en una carpeta de tu equipo.'],
    mensaje: ['Mensaje (prompt)', 'Lo que le escribes a Claude para que haga algo. En inglés se llama "prompt".'],
    agente: ['Agente', 'Claude puede repartir una tarea entre varios ayudantes que trabajan a la vez; cada uno es un agente.'],
    herramienta: ['Acción (herramienta)', 'Cada cosa que hace Claude: leer un archivo, editarlo, buscar o ejecutar una orden.'],
    uso: ['Uso de tu plan', 'Tu suscripción de Claude tiene un límite cada pocas horas y otro semanal. Aquí ves cuánto llevas y cuándo se reinicia.'],
    tokens: ['Tokens', 'Los trozos de texto que cuenta Claude para medir el uso; unos cuatro caracteres cada uno.'],
    registro: ['Registro (transcript)', 'El archivo donde Claude Code anota todo lo que pasa en una sesión. Rastro lo lee; no lo cambia.'],
    cola: ['Cola', 'Mensajes en espera: salen solos, en orden, cuando la sesión termina lo que está haciendo.'],
    diferencias: ['Diferencias (diff)', 'Lo que cambió en un archivo: las líneas añadidas y las quitadas.'],
    terminal: ['Terminal', 'Una ventana para escribir órdenes del sistema a mano, en la carpeta de la sesión.'],
    reparto: ['Reparto automático (orquestador)', 'Si lo enciendes, Rastro manda las tareas pequeñas a una IA económica y el resto a Claude.'],
    economica: ['IA económica', 'Un modelo más barato o gratuito (en tu equipo o en la nube). Trabaja en una copia aparte y nada se aplica sin tu aprobación.'],
    sinclaude: ['Sin Claude (modo continuidad)', 'Cuando se acaba tu cuota de Claude, Rastro guarda los mensajes en Pendientes y los envía cuando vuelve.'],
    vram: ['VRAM', 'La memoria de la tarjeta gráfica (GPU). Una IA local necesita caber en ella; Rastro no usa más del 80 %.'],
    esfuerzo: ['Nivel de esfuerzo', 'Cuánto piensa la IA local antes de responder: más esfuerzo es más lento y usa más memoria.'],
    juego: ['Modo juego', 'Mientras juegas, Rastro descarga la IA local y se aligera para no quitarle potencia al juego.'],
    remoto: ['Control remoto (Remote Control)', 'Una sesión que también puedes dirigir desde claude.ai o la app del celular.'],
    skills: ['Skills (habilidades)', 'Instrucciones guardadas que Claude puede cargar para tareas concretas.'],
    modelos: ['Modelos en uso', 'Cada IA que trabaja ahora: el Claude de la sesión, sus ayudantes, la IA local, la gratuita en la nube y la de los resúmenes. Lo que Claude Code no informa se dice así, sin suponer.'],
    modouso: ['Modo de uso', 'Qué puede hacer Claude sin preguntarte: solo planear, editar sin preguntar, preguntar antes de cada cosa o hacerlo todo sin preguntar ("Sin permisos").'],
    mapa: ['Mapa del orquestador', 'Tú en el centro y cada sesión alrededor, con lo que hace ahora. El porcentaje solo aparece si la sesión tiene una lista de tareas.']
  };
  app.GLOSARIO = GLOSARIO;
  ui.$$('[data-ayuda]').forEach(n => { const g = GLOSARIO[n.dataset.ayuda]; if (g) n.replaceWith(ui.ayuda(g[0], g[1])); });
  ui.pintar($('#glosario'), Object.keys(GLOSARIO).map(k => [el('dt', {}, GLOSARIO[k][0]), el('dd', {}, GLOSARIO[k][1])]).reduce((a, x) => a.concat(x), []));

  // Simple (por defecto): lo esencial. Avanzado: modos de permiso, esfuerzo, cuotas, parámetros de Ollama.
  function aplicarModo() { document.documentElement.classList.toggle('avanzado', !!D.ajustes.avanzado); }
  app.avanzado = v => {
    D.guardar({ avanzado: !!v }); aplicarModo();
    if (!v && (app.sel.usoVista === 'orquestacion' || app.sel.usoVista === 'recursos')) app.sel.usoVista = 'consumo';
    app.pintar();
    if (app.sel.vista === 'ajustes') { document.dispatchEvent(new CustomEvent('rastro:vista', { detail: 'ajustes' })); const s = $('#ajustes [data-nombre="Mostrar opciones avanzadas"]'); if (s) s.focus(); }
    if (RA.chat && RA.chat.destino) RA.chat.destino();
    ui.decir(v ? 'Opciones avanzadas a la vista.' : 'Modo simple: solo lo esencial.', 'ok');
  };

  // Guía de primer uso: cinco pasos, se puede omitir y volver a abrir desde Ajustes.
  const GUIA = [
    ['Qué es Rastro', 'Rastro te deja ver y dirigir lo que hace Claude Code en tu equipo: qué sesiones hay, qué está haciendo cada una y qué archivos cambia.'],
    ['Dónde ver las sesiones', 'Arriba, en «Sesión elegida», decides con qué sesión trabajas. La pestaña Sesiones las lista todas, con su resumen.'],
    ['Cómo enviar un mensaje', 'Escribe en «Escribe a Claude» y pulsa Enter. Encima del campo ves a dónde irá. Si la sesión está ocupada, usa «Añadir a la cola».'],
    ['Qué es el Consumo', 'Tu plan de Claude tiene un límite de uso cada pocas horas y otro semanal. En Consumo ves cuánto llevas y cuándo se reinicia.'],
    ['Si algo pasa', 'Los avisos salen abajo a la derecha y quedan en Avisos, arriba. Si algo no funciona, Ajustes › Estado del equipo te dice qué revisar.']
  ];
  let paso = 0;
  function guia() {
    const caja = $('#guia');
    caja.hidden = !!D.ajustes.guiaVista;
    if (caja.hidden) return ui.pintar(caja, null);
    const ir = n => { paso = n; guia(); $('#guia-t').focus(); };
    const fin = () => { D.guardar({ guiaVista: true }); guia(); ui.decir('Guía cerrada. Puedes volver a abrirla en Ajustes.', 'neutro'); $('#masc-prompt').focus(); };
    ui.pintar(caja, [
      el('div', { class: 'esc' }, [
        el('p', { class: 'label' }, 'Guía rápida · paso ' + (paso + 1) + ' de ' + GUIA.length),
        el('h2', { id: 'guia-t', class: 'guia-t', tabindex: '-1' }, GUIA[paso][0]),
        el('p', {}, GUIA[paso][1]),
        el('div', { class: 'row' }, [
          paso ? el('button', { type: 'button', class: 'btn btn-small', id: 'guia-ant', onclick: () => ir(paso - 1) }, 'Volver al paso anterior') : null,
          paso < GUIA.length - 1 ? el('button', { type: 'button', class: 'btn btn-small btn-primary', id: 'guia-sig', onclick: () => ir(paso + 1) }, 'Ir al paso siguiente') : el('button', { type: 'button', class: 'btn btn-small btn-primary', id: 'guia-fin', onclick: fin }, 'Terminar la guía'),
          el('button', { type: 'button', class: 'btn btn-small', id: 'guia-omitir', onclick: fin }, 'Omitir la guía')
        ])
      ]),
      el('div', { class: 'card-pie' }, ui.puntos(GUIA.length, paso + 1, 'Paso ' + (paso + 1) + ' de ' + GUIA.length))
    ]);
  }
  app.guia = () => { paso = 0; D.guardar({ guiaVista: false }); app.ir('chat'); guia(); $('#guia-t').focus(); };
  // Para las pruebas y para el respaldo importado: aplica de una vez ajustes de claridad.
  app.preferencias = o => { D.guardar(o); aplicarModo(); guia(); app.pintar(); };
  aplicarModo();
  guia();

  $('#sin-almacen').hidden = D.almacen;
  comparar();
  avisarUso();
  app.ir('chat', true);
  app.lista = true;
})(window.RA = window.RA || {});
