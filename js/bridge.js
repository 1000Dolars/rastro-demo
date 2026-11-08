/* Capa de datos de la app de escritorio. Rellena RA.datos con datos reales que llegan del proceso
   principal por el puente del preload (window.rastro). Es la otra implementación de la capa que en
   la maqueta rellena src/renderer/js/sample-data.js; las vistas no distinguen una de otra.
   Solo se monta dentro de la app: en un navegador no existe window.rastro. */
(function (RA) {
  'use strict';
  const P = window.rastro;
  if (!P) return;

  const D = RA.datos, E = D.estado, porId = {};
  let tPintar = null;

  D.muestra = false;
  try { D.so.id = String(P.sistema() || 'win32'); } catch (e) { /* se queda en Windows */ }
  D.auth = { ok: false, motivo: 'Comprobando la autenticación…' };
  D.ruta = '';
  // Un mensaje que el proceso principal rechaza (argumentos raros) llega como { error }, igual que los demás fallos.
  const pide = canal => (...args) => P[canal].apply(null, args).catch(() => ({ error: 'La orden no se pudo ejecutar.' }));
  // Carpeta de la sesión: la elige la persona en el diálogo del sistema o escribe su ruta. Si existe, si
  // es una carpeta y si se puede usar lo dice el proceso principal, y lo vuelve a comprobar al crear.
  D.infoCarpeta = pide('infoCarpeta');
  D.elegirCarpeta = pide('elegirCarpeta');
  /* Explorador de archivos. La interfaz no toca el disco: pide cada cosa con una ruta relativa a la
     carpeta de trabajo abierta. `sucio` se enciende cuando algo cambió en ella y hay que volver a listar. */
  D.fs = {
    sucio: false,
    abrir: pide('archivosAbrir'), cambiar: pide('archivosCambiar'), cerrar: pide('archivosCerrar'), listar: pide('archivosListar'),
    crear: pide('archivosCrear'), renombrar: pide('archivosRenombrar'), papelera: pide('archivosPapelera'), abrirArchivo: pide('archivosAbrirArchivo'), mostrar: pide('archivosMostrar'),
    leer: pide('archivosLeer'), escribir: (rel, t, m, f) => pide('archivosEscribir')(rel, t, m, !!f)
  };
  // Control: solo sobre las sesiones que lanza la app. Cada orden la valida y la ejecuta el proceso principal.
  const orden = (canal, args, bien) => P[canal].apply(null, args).then(r => {
    if (r && r.error) { RA.ui.decir(r.error); return r; }
    if (bien) RA.ui.decir(bien);
    return r;
  }, () => { RA.ui.decir('La orden no se pudo ejecutar.'); return { error: 'La orden no se pudo ejecutar.' }; });
  D.abrirEnlace = u => P.abrirEnlace(u).catch(() => false);
  D.pr = pide('pr');
  D.conectores = pide('conectores');
  D.contextoSesion = pide('contextoSesion');
  D.gh = { estado: pide('ghEstado'), repos: pide('ghRepos'), clonar: pide('ghClonar'), crear: pide('ghCrear') };
  D.worktree = pide('worktree');
  D.ollama = { conexion: pide('ollamaProbarConexion'), modelo: pide('ollamaProbarModelo') };
  D.lateral = (id, texto, historial, forzar) => pide('lateral')(id, texto, historial || [], forzar || null);
  // Panel Navegador: la vista previa vive en el proceso principal; aquí, órdenes y su estado.
  const oyentesNav = [];
  D.navegador = {
    ir: pide('navegadorIr'), marco: r => P.navegadorMarco(r).catch(() => false), historia: pide('navegadorHistoria'), recargar: d => pide('navegadorRecargar')(!!d),
    cerrar: pide('navegadorCerrar'), borrar: pide('navegadorBorrar'), servidores: id => pide('navegadorServidores')(id || null), alEstado: fn => oyentesNav.push(fn),
    archivo: (id, r) => pide('navegadorArchivo')(id, r), fuera: pide('navegadorFuera')
  };
  D.ventanaPanel = (id, sesion) => pide('ventanaPanel')(id, sesion || null);
  D.acoplarPanel = (id, sesion) => pide('acoplarPanel')(id, sesion || null);
  D.crear = cfg => P.crear(cfg);
  D.aprobar = (id, modelo) => orden('aprobar', [id, modelo]);
  D.pedirCambios = (id, texto) => orden('pedirCambios', [id, texto]);
  D.detener = id => orden('detener', [id]);
  D.reanudar = id => orden('reanudar', [id]);
  // Sesiones SSH (fase 1): comprobar un equipo y crear en él una sesión con su primer mensaje.
  // Programadas: tareas locales con horario (services/scheduled.js). Los cambios llegan también como delta { programadas }.
  D.programadas = { lista: pide('programadasLista'), guardar: (id, t) => pide('programadasGuardar')(id || null, t), activar: pide('programadasActivar'), borrar: pide('programadasBorrar'), ejecutar: pide('programadasEjecutar') };
  D.ssh = { probar: (h, c) => pide('sshProbar')(h, c), crear: pide('sshCrear'), sincronizar: pide('sshSincronizar') };
  D.abrirMaqueta = id => orden('abrirMaqueta', [id], 'Maqueta abierta en el navegador.');
  D.elegirReferencias = () => P.elegirReferencias();
  // Chat: el proceso principal comprueba la sesión, la carpeta, el CLI y la autenticación antes de lanzar.
  D.chatEnviar = (id, texto) => pide('chatEnviar')(id, texto);
  D.chatCancelar = id => pide('chatCancelar')(id);
  D.chatPermiso = (id, peticion, si) => pide('chatPermiso')(id, peticion, si);
  D.chatEncolar = (id, texto) => pide('chatEncolar')(id, texto);
  D.chatCola = (id, orden, item) => pide('chatCola')(id, orden, item);
  // Modo de uso (Añadido 3): el proceso principal lo guarda por sesión y lo aplica en caliente si responde.
  D.chatModo = (id, modo) => pide('chatModo')(id, modo);
  // Fase B: vista previa, centro de avisos (persistente en el proceso principal) y diagnóstico.
  D.asistentesPrevia = (texto, forzar) => pide('asistentesPrevia')(texto, forzar || null);
  D.avisosLeer = pide('avisosLeer');
  D.avisosGuardar = lista => pide('avisosGuardar')(lista);
  D.diagnostico = pide('diagnostico');
  // Asistentes: el prompt pasa por el optimizador y el orquestador (que pueden mandarlo a Claude tal cual).
  D.asistentesEnviar = (id, texto, forzar, refinado, nivel, elegido) => pide('asistentesEnviar')(id, texto, forzar || null, refinado == null ? null : refinado, nivel || null, elegido || null);
  // Consola: la carpeta de una terminal sale de la sesión elegida, en el proceso principal.
  D.consola = {
    abrir: pide('consolaAbrir'), escribir: (id, t) => P.consolaEscribir(id, t).catch(() => false), tamano: (id, c, r) => P.consolaTamano(id, c, r).catch(() => false),
    cerrar: pide('consolaCerrar'), pegar: pide('pegar'), enlace: u => P.abrirEnlace(u).catch(() => false), alDatos: fn => P.alConsola(fn)
  };

  // Los cambios llegan en ráfagas: se pinta como mucho cuatro veces por segundo.
  function pintar() { if (!tPintar) tPintar = setTimeout(() => { tPintar = null; D.emitir(); }, 250); }

  function aplicar(d) {
    if (!d) return;
    (d.sesiones || []).forEach(n => {
      let s = porId[n.id];
      if (!s) { s = porId[n.id] = { eventos: [], indice: {} }; E.sesiones.push(s); }
      const evs = n.eventos || [];
      // Evento real de una sesión (no la carga inicial ni una relectura entera): el mapa mueve su punto.
      if (evs.length && !n.todo && !E.cargando) document.dispatchEvent(new CustomEvent('rastro:evento', { detail: { sesion: n.id } }));
      if (n.todo) { s.eventos = []; s.indice = {}; }           // la sesión se releyó entera
      delete n.eventos; delete n.todo;
      Object.assign(s, n);
      if (evs.some(e => e.archivo)) D.fs.sucio = true;       // una sesión tocó un archivo: el árbol de Archivos se vuelve a listar
      evs.forEach(e => {
        const v = s.indice[e.id];
        if (v) { Object.assign(v, e); v.cargado = false; }      // llegó su resultado: el detalle se vuelve a pedir
        else { s.indice[e.id] = e; s.eventos.push(e); }
      });
    });
    if (d.sesiones && d.sesiones.length) E.sesiones.sort((a, b) => (b.tUlt || 0) - (a.tUlt || 0));     // la más reciente, primero
    if (d.actividad) E.actividad = d.actividad;
    if (d.uso) E.uso = d.uso;
    if (d.auth) D.auth = d.auth;
    if (typeof d.resumenLocal === 'string') D.resumenLocal = d.resumenLocal;     // modelo local del resumen de cierre ('' = Haiku)
    if (d.chat && RA.chat) RA.chat.recibir(d.chat);
    if (d.archivos) { D.fs.sucio = true; D.fs.cambios = (D.fs.cambios || 0) + 1; }     // el editor mira si tocó su archivo                        // cambió algo en la carpeta abierta en Archivos
    if (typeof d.cargando === 'boolean') E.cargando = d.cargando;
    if (d.ajustes) { Object.assign(D.ajustes, d.ajustes); try { localStorage.setItem('rastro:v1', JSON.stringify(D.ajustes)); } catch (e) { /* sin almacenamiento */ } }
    if (d.orden === 'nueva' && RA.capas) RA.capas.asistente();
    // Clic en una notificación: su sesión, en Chat.
    if (d.orden === 'sesion' && RA.app && porId[d.sesion]) { RA.app.sel.sesion = d.sesion; RA.app.sel.agente = null; RA.app.sel.evento = null; RA.app.ir('chat'); }
    if (d.colas && RA.chat) RA.chat.colas(d.colas);
    // Paneles en su propia ventana: se acopló (vuelve aquí) o se cerró.
    if (d.orden === 'acoplar' && RA.paneles) RA.paneles.acoplado(d.panel, true);
    if (d.panelCerrado && RA.paneles) RA.paneles.acoplado(d.panelCerrado, false);
    if (d.navegador) oyentesNav.forEach(fn => fn(d.navegador));
    if (d.modos) E.modos = d.modos;
    if ((d.recursos || d.continuidad) && RA.fase4) RA.fase4.recibir(d);
    if ((d.descarga || d.parches || d.tareaBarata || typeof d.pensando === 'boolean' || d.autoeval || d.orquestacion || d.ollama) && RA.asistentes) RA.asistentes.recibir(d);
    if (d.programadas && RA.programadas) RA.programadas.recibir(d.programadas);
    (d.avisos || []).forEach(a => D.avisar(a));
    pintar();
  }

  // Lo que el proceso principal necesita saber de los ajustes (bandeja, notificaciones, modelo del resumen).
  const guardarLocal = D.guardar;
  const alPrincipal = () => P.ajustes({ silencio: D.ajustes.silencio, cerrarABandeja: D.ajustes.cerrarABandeja, inicioWindows: D.ajustes.inicioWindows, modeloResumen: D.ajustes.modelos.resumen, skillsPrimero: D.ajustes.skillsPrimero, caveman: D.ajustes.caveman, shell: D.ajustes.shell, eventos: D.ajustes.eventos, chat3: D.ajustes.chat3, paneles: D.ajustes.paneles });
  D.guardar = parcial => { guardarLocal(parcial); alPrincipal(); };

  // Detalle de un evento (entrada, salida, parche): se pide al desplegarlo, no viaja con la sesión.
  D.detalle = (sesion, evento) => P.detalle(sesion, evento).then(d => d || {});
  // Resumen de cierre con el modelo elegido. Si la autenticación no pasa, no se lanza nada.
  D.resumenTurno = (id, desde) => P.resumenTurno(id, desde).catch(() => ({ error: 'No se pudo pedir el resumen.' }));
  D.regenerar = id => P.resumen(id).then(r => { if (r && r.error) { RA.ui.decir(r.error); const s = porId[id]; if (s) { s.bloqueo = r.error; D.emitir(); } } });
  D.medirUso = () => P.medirUso().then(r => { if (r && r.error) RA.ui.decir(r.error); return r; });
  D.copiar = texto => P.copiar(texto);
  D.guardarArchivo = (nombre, contenido) => P.guardar(nombre, contenido);
  D.exportar = () => P.exportar();
  D.importar = texto => P.importar(texto);
  D.reemplazar = () => P.reemplazar();
  D.borrar = () => P.borrar();
  // Los controles de ventana de Windows se pintan con los colores del tema que hay en pantalla.
  const hex = v => { const m = /^#([0-9a-f]{6})$/i.exec(v.trim()); return m ? '#' + m[1] : null; };
  D.alTema = () => {
    const s = getComputedStyle(document.documentElement), color = hex(s.getPropertyValue('--bg')), simbolo = hex(s.getPropertyValue('--ink'));
    if (color && simbolo) P.tema({ color: color, simbolo: simbolo });
  };

  /* Se arranca cuando ya corrieron todos los scripts (son defer): la respuesta del proceso principal puede
     llegar entre uno y otro, y las vistas (RA.app, RA.chat…) tienen que existir antes de recibir datos. */
  const arrancar = () => { P.alCambiar(aplicar); P.inicio().then(alIniciar); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar, { once: true }); else arrancar();
  function alIniciar(d) {
    D.ruta = d.ruta;
    // Raíz de las carpetas nuevas: Documentos\Rastro, salvo que la persona haya elegido otra.
    let elegida = false;
    try { elegida = !!JSON.parse(localStorage.getItem('rastro:v1')).raiz; } catch (e) { /* sin ajustes guardados */ }
    if (!elegida && d.raiz) D.ajustes.raiz = d.raiz;
    // El silencio puede haberse cambiado desde la bandeja con la ventana cerrada: manda el proceso principal.
    if (d.ajustes && typeof d.ajustes.silencio === 'boolean') D.ajustes.silencio = d.ajustes.silencio;
    // El panel derecho y el filtro de Sesiones se guardan en ajustes.json (proceso principal): manda lo de allí.
    if (d.ajustes && d.ajustes.chat3) { D.ajustes.chat3 = RA.logica.estadoChat3(d.ajustes.chat3); if (RA.chat3) RA.chat3.aplicar(); }
    // La disposición de los paneles también se guarda allí: si la copia local se perdió, manda la del proceso principal.
    if (d.ajustes && d.ajustes.paneles && RA.paneles && !RA.paneles.abiertos().length && RA.logica.estadoPaneles(d.ajustes.paneles).columnas.length > 1) { D.ajustes.paneles = d.ajustes.paneles; if (RA.paneles) RA.paneles.aplicarGuardado(d.ajustes.paneles); }
    D.shells = d.shells || [];
    // Un intérprete guardado que aquí no existe (los ajustes vienen de otro sistema): el que use el proceso principal.
    if (D.shells.length && !D.shells.some(x => x.id === D.ajustes.shell)) D.ajustes.shell = (d.ajustes && d.ajustes.shell) || D.shells[0].id;
    aplicar({ sesiones: d.sesiones, actividad: d.actividad, uso: d.uso, auth: d.auth, cargando: d.cargando, resumenLocal: d.resumenLocal });
    (d.chat || []).forEach(c => RA.chat && RA.chat.recibir(c));
    if (d.colas && RA.chat) RA.chat.colas(d.colas);
    if (d.modos) E.modos = d.modos;
    alPrincipal();
    D.alTema();
  }
})(window.RA = window.RA || {});
