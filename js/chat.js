/* Campo de prompts de Chat: envía un prompt a la sesión elegida en la franja y enseña la respuesta
   mientras llega. Enter envía, Mayús+Enter es un salto de línea y las flechas recorren el historial.
   Lo que la sesión hace (herramientas y cambios de archivos) no se pinta aquí: llega por su transcript a
   la línea de tiempo, al carrete y a Cambios, como el de cualquier otra sesión. */
(function (RA) {
  'use strict';

  const ui = RA.ui, el = ui.el, $ = ui.$, D = RA.datos;
  const CLAVE = 'rastro:historial', TOPE = 100;
  const R = RA.respuesta;     // estado y caja de la respuesta (js/respuesta.js)
  let colas = {};              // sesión -> { items: [{ id, texto }], pausada, error }
  let permisoPintado = '', colaPintada = '', modoPintado = '';
  /* Memoria del compositor (D6): el historial ↑/↓ es global, pero recorre primero los prompts de la sesión elegida;
     cada entrada recuerda su sesión ({ t, s }; las de antes, sin sesión). El borrador es de cada sesión: cambiar de
     sesión guarda lo escrito y recupera el suyo, así lo escrito para una no acaba enviado a otra. */
  let historial = [];
  try { historial = (JSON.parse(localStorage.getItem(CLAVE)) || []).map(x => typeof x === 'string' ? { t: x, s: null } : x).filter(x => x && typeof x.t === 'string').slice(-TOPE); } catch (e) { historial = []; }
  let nav = null, pos = 0, borrador = '';
  // Orden al recorrer con ↑: las de otras sesiones primero y las de esta al final (↑ llega antes a ellas).
  function listaHistorial() {
    const s = actual(), id = s ? s.id : null;
    return historial.filter(h => h.s !== id).concat(historial.filter(h => h.s === id)).map(h => h.t);
  }
  const CLAVE_B = 'rastro:borradores', TOPE_B = 50;
  let borradores = {}, sesionCampo = null, tBorrador = null;
  try { const g = JSON.parse(localStorage.getItem(CLAVE_B)) || {}; Object.keys(g).forEach(k => { if (typeof g[k] === 'string') borradores[k] = g[k]; }); } catch (e) { borradores = {}; }
  function guardarBorrador(id, t) {
    if (id == null) return;
    delete borradores[id];                      // al final: el más reciente
    if (t && t.trim()) borradores[id] = t.slice(0, 20000);
    const ks = Object.keys(borradores); if (ks.length > TOPE_B) ks.slice(0, ks.length - TOPE_B).forEach(k => delete borradores[k]);
    try { localStorage.setItem(CLAVE_B, JSON.stringify(borradores)); } catch (e) { /* sin almacenamiento: dura lo que la ventana */ }
  }
  // Al cambiar la sesión elegida, el campo cambia de borrador.
  function cambiarCampo(s) {
    if (!s || s.id === sesionCampo) return;
    if (sesionCampo != null) guardarBorrador(sesionCampo, area.value);
    sesionCampo = s.id;
    area.value = borradores[s.id] || '';
    nav = null;
  }
  // Tras enviar o encolar: se vacía el campo si sigue siendo el de esa sesión; si no, solo su borrador.
  function vaciarCampo(id) { if (sesionCampo === id) area.value = ''; guardarBorrador(id, ''); }

  // Caveman en la barra del compositor: el mismo ajuste global que en Ajustes.
  const selCave = $('#masc-caveman');
  const pintaCave = () => { if (selCave) selCave.value = (D.ajustes.caveman && D.ajustes.caveman.global) || ''; };
  if (selCave) { pintaCave(); selCave.addEventListener('change', () => D.guardar({ caveman: Object.assign({ porModelo: {} }, D.ajustes.caveman, { global: selCave.value || null }) })); }
  // El botón de envío dice "Enviar" y, mientras la sesión responde, "Detener" (chat-cancelar).
  const area = $('#masc-prompt'), btn = $('#masc-enviar'), caja = $('#masc-resp');
  const actual = () => RA.vistas && RA.vistas.actual();
  // Aviso de por qué no se hizo algo: devuelve { error } para que el botón no marque "hecho".
  const no = m => { ui.decir(m, 'atencion'); return { error: m }; };
  const enMarcha = R.enMarcha;

  function guardarHistorial(t, sid) {
    historial = historial.filter(x => x.t !== t).concat({ t: t, s: sid || null }).slice(-TOPE);
    nav = null; borrador = '';
    try { localStorage.setItem(CLAVE, JSON.stringify(historial)); } catch (e) { /* sin almacenamiento: el historial dura lo que la ventana */ }
  }

  /* Envía el prompt. Con la app, pasa por el optimizador y el orquestador (Fase 3), que pueden devolver
     una sugerencia (modo "sugerir"), mandarlo a Claude Code o a un modelo barato. forzar: 'claude' o
     'barato'. elegido: el texto ya escogido en la sugerencia (original o refinado). conservar: no vaciar el
     campo al enviar (Reenviar manda un prompt anterior y deja lo que estés escribiendo). */
  function enviar(forzar, elegido, confirmado, conservar) {
    const s = actual(), t = elegido != null ? String(elegido).trim() : area.value.trim();
    if (!s) return no('No hay ninguna sesión elegida.');
    if (!t) return no('Escribe primero el mensaje.');
    if (enMarcha(s.id)) return no('Esta sesión aún está respondiendo. Espera, pulsa Detener o usa Añadir a la cola.');
    if (!D.chatEnviar) return no('Aquí se ven datos de muestra: para enviar mensajes abre la app de escritorio.');
    if (!confirmado && D.ajustes.previa && D.asistentesPrevia) return mostrarPrevia(s, t, forzar, elegido, conservar);
    cerrarPrevia();
    const original = elegido != null && sugerencia ? sugerencia.original : t;
    sugerencia = null; $('#masc-sugerencia').hidden = true;
    R.poner(s.id, { sesion: s.id, est: 'enviando', texto: '', herramienta: '', error: '', t0: D.ahora(), prompt: t });
    pintar(s);
    const p = D.asistentesEnviar ? D.asistentesEnviar(s.id, original, forzar, elegido != null ? t : null, RA.fase4 ? RA.fase4.nivel() : null, RA.modelos ? RA.modelos.elegido() : null) : D.chatEnviar(s.id, t);
    return Promise.resolve(p).then(r => {
      r = r || {};
      if (r.sugerencia) { R.quitar(s.id); pintar(s); mostrarSugerencia(s, r.sugerencia); return; }
      if (r.decision) pintarDecision(s, r.decision, r.tarea ? { estado: 'trabajando' } : null);
      const err = r.error || (r.claude && r.claude.error);
      // Los errores al enviar los escribe Rastro en palabras: se enseñan tal cual (sin traducir como los del CLI).
      if (err) { R.poner(s.id, { sesion: s.id, est: 'error', texto: '', herramienta: '', error: err, codigo: r.codigo || (r.claude && r.claude.codigo) || 'propio', t0: D.ahora(), t1: D.ahora(), prompt: t }); pintar(s); ui.decir('No se pudo enviar el mensaje. Revisa el motivo y vuelve a intentarlo.', { tipo: 'error', detalle: err, sesion: s.id }); return { error: err }; }
      if (r.tarea || r.pendiente || (r.decision && r.decision.destino === 'espera')) { R.quitar(s.id); pintar(s); }
      guardarHistorial(original, s.id);
      if (!conservar) vaciarCampo(s.id);
      ui.decir(r.pendiente ? 'Claude no está disponible: el prompt queda en Pendientes para Claude (Uso > Continuidad).' : r.decision && r.decision.destino === 'espera' ? r.decision.motivo : r.tarea ? 'Prompt enviado a un modelo barato (' + r.decision.modelo + '): trabajará en una copia aislada.' : 'Prompt enviado a ' + s.nombre + '.');
    });
  }

  // ---- Orquestador: a dónde fue el prompt, y por qué ----
  let sugerencia = null, decisiones = {};
  const DESTINO = { claude: 'Claude Code', local: 'Modelo local', nube: 'Modelo gratuito en la nube', pendiente: 'Pendientes para Claude', espera: 'En espera (modo juego)' };
  function pintarDecision(s, d, tarea) {
    if (d) decisiones[s.id] = { d: d, tarea: tarea || null };
    const x = decisiones[s.id], caja = $('#masc-decision');
    caja.hidden = !x;
    if (!x) return ui.pintar(caja, null);
    const T = x.tarea || {}, est = { trabajando: 'Trabajando en una copia aislada', parche: 'Parche listo: espera tu aprobación en Cambios', escalada: 'Falló dos veces: pasó a Claude Code con el contexto de lo intentado', pendiente: 'No pudo: espera a Claude en Pendientes, con el contexto de lo intentado' }[T.estado];
    ui.pintar(caja, [
      el('div', { class: 'badges' }, [ui.insignia('Destino: ' + DESTINO[x.d.destino] + (x.d.modelo ? ' · ' + x.d.modelo : ''), T.estado === 'escalada' ? 'alerta' : ''), T.estado === 'escalada' ? ui.insignia('Escalado a Claude', 'alerta') : null, x.d.refinado ? ui.insignia('Prompt refinado') : null]),
      el('span', { class: 'note' }, x.d.motivo + (est ? ' · ' + est + '.' : '')),
      T.estado === 'parche' ? el('button', { type: 'button', class: 'btn btn-small', onclick: () => RA.app.ir('cambios') }, 'Ver en Cambios') : null
    ]);
  }
  // Una tarea barata avanza (llega del proceso principal).
  function tarea(t) { const s = actual(); decisiones[t.sesion] = { d: t.decision, tarea: t }; if (s && s.id === t.sesion) pintarDecision(s); if (t.estado === 'escalada') ui.decir('El modelo barato no pudo: la tarea pasó a Claude Code.'); if (t.estado === 'parche') ui.decir('Parche de ' + t.decision.modelo + ' listo para revisar en Cambios.'); }

  /* Modo "sugerir": original y refinada lado a lado, con las diferencias marcadas (palabra a palabra), y
     la persona elige cuál enviar o edita la refinada en el campo. */
  function palabras(a, b) {
    const x = a.split(/(\s+)/), y = b.split(/(\s+)/), n = x.length, m = y.length;
    if (n * m > 160000) return [[a, ''], [b, '']].map(p => [{ t: p[0], c: '' }]);
    const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const A = [], B = [];
    let i = 0, j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && x[i] === y[j]) { A.push({ t: x[i], c: '' }); B.push({ t: y[j], c: '' }); i++; j++; }
      else if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])) { B.push({ t: y[j], c: 'mas' }); j++; }
      else { A.push({ t: x[i], c: 'menos' }); i++; }
    }
    return [A, B];
  }
  function mostrarSugerencia(s, sg) {
    sugerencia = sg;
    const caja = $('#masc-sugerencia'), dif = palabras(sg.original, sg.refinada);
    const lado = (titulo, partes, id) => el('div', { class: 'col' }, [el('span', { class: 'label' }, titulo), el('pre', { class: 'dato sug-texto', id: id, tabindex: '0', role: 'group', 'aria-label': titulo }, partes.map(p => p.c ? el('span', { class: 'sug-' + p.c }, [el('span', { class: 'sr' }, p.c === 'mas' ? '[añadido] ' : '[quitado] '), p.t]) : p.t))]);
    caja.hidden = false;
    ui.pintar(caja, [
      el('div', { class: 'row between' }, [el('h3', { id: 'masc-sug-t', class: 'label' }, 'El optimizador sugiere'), sg.modelo ? ui.insignia('Refinado por ' + sg.modelo) : null]),
      el('div', { class: 'sug-lados' }, [lado('Original', dif[0], 'sug-original'), lado('Refinada', dif[1], 'sug-refinada')]),
      el('p', { class: 'note' }, 'Se comprobó que las rutas, el código y los textos entre comillas siguen idénticos.'),
      el('div', { class: 'row' }, [
        el('button', { type: 'button', class: 'btn btn-small', id: 'sug-enviar-original', onclick: () => enviar(null, sg.original) }, 'Enviar original'),
        el('button', { type: 'button', class: 'btn btn-small', id: 'sug-editar', onclick: () => { area.value = sg.refinada; sugerencia = null; caja.hidden = true; area.focus(); } }, 'Editar la refinada'),
        el('button', { type: 'button', class: 'btn btn-small', id: 'sug-enviar-refinada', onclick: () => enviar(null, sg.refinada) }, 'Enviar refinada')
      ])
    ]);
    $('#sug-enviar-refinada').focus();
    ui.decir('El optimizador propone una versión refinada. Elige cuál enviar.');
  }

  // Chat de la sesión elegida: destino, modo, botones y, debajo, la respuesta (js/respuesta.js).
  function pintar(s) {
    s = s || actual();
    if (!s) return;
    cambiarCampo(s);
    const c = R.de(s.id), ocupado = enMarcha(s.id);
    ui.pintar($('#masc-destino'), ['Mensaje para ', el('span', { class: 'mono' }, s.nombre)]);
    destino(s);
    pintarModo(s);
    pintarExtras(s);
    // Enviar mientras está libre; Detener mientras responde (el estado se lee en la insignia de la respuesta).
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    btn.classList.toggle('detener', ocupado);
    if (!ocupado || (esc && esc.s !== s.id)) desarmarEsc();
    if (!btn.classList.contains('hecho') && !btn.classList.contains('armed')) btn.textContent = ocupado ? 'Detener' : 'Enviar';
    btn.title = ocupado ? 'Detener la respuesta (Esc dos veces)' : 'Enviar (Enter)';
    // Mientras responde se puede escribir el siguiente mensaje para la cola; Enviar queda bloqueado.
    area.readOnly = false;
    area.setAttribute('aria-busy', String(ocupado));
    if (!R.pintarCaja(s, caja)) { pintarPermiso(s); pintarCola(s); return; }
    pintarPermiso(s); pintarCola(s); pintarDecision(s);
  }

  /* Selector Modo (como Claude Code Desktop): botón con una fila de puntos finos (10 puntos de 4 px; se llenan
     según cuánto puede hacer sin preguntar) y el nombre; al abrirlo, los cinco modos con su explicación, en el
     orden de la documentación: Manual, Aceptar ediciones, Plan, Auto y Omitir permisos. Omitir permisos lleva
     la etiqueta ámbar "Riesgo" (solo etiqueta, sin diálogos) y, activo, el botón también va en ámbar. El proceso
     principal lo guarda por sesión y, con una respuesta en curso, lo cambia en caliente (set_permission_mode);
     si no, vale desde el siguiente mensaje. */
  const LINEAS = {
    default: 'Te pregunta antes de editar archivos o ejecutar órdenes.',
    acceptEdits: 'Edita archivos sin preguntar. Sigue pidiendo permiso para la terminal.',
    plan: 'Analiza y te propone un plan. No cambia nada hasta que lo apruebes.',
    auto: 'Trabaja solo y te pide permiso antes de usar la terminal o salir de la carpeta.',
    bypassPermissions: 'Hace todo sin preguntar. Úsalo solo en carpetas que puedas perder.'
  };
  const MODOS_SEL = RA.logica.MODOS.map(m => [m.id, LINEAS[m.id]]);
  const nivel = (id, aviso) => { const p = RA.logica.puntosModo(id); return el('span', { class: 'modo-nivel' + (aviso ? ' aviso' : ''), 'aria-hidden': 'true', 'data-llenos': String(p.llenos) }, Array.from({ length: p.total }, (x, i) => el('i', { class: i < p.llenos ? 'on' : '' }))); };
  let modoAbierto = false;
  function pintarModo(s) {
    const caja = $('#masc-modo');
    if (!caja) return;
    const m = D.modoDe(s), act = m ? m.id : 'default', elegido = !!(D.estado.modos || {})[s.id], ocupado = enMarcha(s.id);
    const clave = s.id + '|' + act + '|' + elegido + '|' + ocupado + '|' + modoAbierto;
    if (clave === modoPintado) return;
    modoPintado = clave;
    const def = MODOS_SEL.find(x => x[0] === act), nombre = id => (D.MODOS_USO.find(x => x.id === id) || { nombre: id }).nombre;
    const sin = act === 'bypassPermissions';
    const ops = el('div', { id: 'masc-modo-ops', class: 'modo-lista', role: 'radiogroup', 'aria-label': 'Modo de permisos', hidden: modoAbierto ? null : '' },
      [el('div', { class: 'modo-tit', 'aria-hidden': 'true' }, 'MODO DE PERMISOS')].concat(MODOS_SEL.map(([id, linea]) => el('button', {
        type: 'button', role: 'radio', 'data-v': id, 'aria-checked': String(id === act), tabindex: id === act || (!def && id === 'default') ? '0' : '-1', class: 'modo-op' + (id === 'bypassPermissions' ? ' peligro' : ''),
        title: id === 'auto' ? 'Auto necesita Opus 4.6 o posterior, Sonnet 4.6 o posterior, Haiku 5.5 o Fable; tu organización puede desactivarlo.' : null,
        onclick: () => { modoAbierto = false; elegirModo(s, id); }
      }, [nivel(id, id === 'bypassPermissions'), el('span', { class: 'modo-txt' }, [el('span', { class: 'modo-n' }, [nombre(id), id === 'bypassPermissions' ? el('span', { class: 'riesgo' }, '! RIESGO') : null]), el('span', { class: 'modo-l' }, linea)]), el('span', { class: 'modo-check', 'aria-hidden': 'true' }, id === act ? '✓' : '')])),
      [el('div', { class: 'modo-pie mono' }, 'Mayús+Tab en el campo cambia de modo')]));
    ops.addEventListener('keydown', e => {
      const bs = ui.$$('[role="radio"]', ops), i = bs.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); bs[(i + (e.key === 'ArrowDown' ? 1 : bs.length - 1)) % bs.length].focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); modoAbierto = false; modoPintado = ''; pintarModo(s); $('#modo-boton').focus(); }
    });
    const nota = ocupado ? 'Si lo cambias ahora, se aplica al momento a la respuesta en curso.'
      : elegido ? 'Se aplica desde el próximo mensaje.'
      : m ? 'Ahora: ' + m.nombre + ' (el último que usó esta sesión). Elige uno para fijarlo.' : 'Sin elegir: la sesión usa el modo de sus ajustes de Claude Code.';
    ui.pintar(caja, [
      el('legend', { class: 'sr' }, ['Modo de permisos: ' + (m ? m.nombre : 'el de sus ajustes'), sin ? ui.insignia('Sin permisos', 'alerta sinperm') : null]),
      el('button', { type: 'button', id: 'modo-boton', class: 'modo-boton' + (sin ? ' sin' : ''), 'aria-label': 'Cambiar modo de permisos: ' + (m ? m.nombre : 'Modo de la sesión'), 'aria-haspopup': 'true', 'aria-expanded': String(modoAbierto), 'aria-controls': modoAbierto ? 'masc-modo-ops' : null, title: nota,
        onclick: () => { modoAbierto = !modoAbierto; modoPintado = ''; pintarModo(s); if (modoAbierto) { const f = $('#masc-modo-ops [tabindex="0"]'); if (f) f.focus(); } } },
        [nivel(def ? act : '', sin), el('span', {}, m ? m.nombre : 'Modo de la sesión'), el('span', { class: 'mono modo-flecha', 'aria-hidden': 'true' })]),
      ops,
      el('p', { class: 'sr', id: 'masc-modo-nota' }, nota)
    ]);
  }
  // Un clic fuera cierra el selector.
  document.addEventListener('pointerdown', e => { if (!modoAbierto || e.target.closest('#masc-modo')) return; modoAbierto = false; modoPintado = ''; const s = actual(); if (s) pintarModo(s); });
  // Mayús+Tab en el campo pasa al siguiente modo (como en Claude Code).
  function siguienteModo() {
    const s = actual(); if (!s) return;
    const m = D.modoDe(s), i = MODOS_SEL.findIndex(x => x[0] === (m && m.id));
    elegirModo(s, MODOS_SEL[(i + 1) % MODOS_SEL.length][0]);
  }
  function elegirModo(s, v) {
    if (!D.chatModo) return no('El modo de uso se cambia en la app de escritorio.');
    const x = D.MODOS_USO.find(m => m.id === v);
    return Promise.resolve(D.chatModo(s.id, v)).then(r => {
      if (r && r.error) return ui.decir('No se pudo cambiar el modo de uso. ' + r.error, 'error');
      D.estado.modos = Object.assign({}, D.estado.modos, { [s.id]: v });
      modoPintado = '';
      pintarModo(s);
      destino(s);
      const f = $('#modo-boton'); if (f && document.activeElement && document.activeElement.closest('#masc-modo')) f.focus();
      ui.decir('Modo de permisos: ' + x.nombre + '. ' + (r && r.enCaliente ? 'Aplicado a la respuesta en curso.' : 'Se aplica desde el próximo mensaje.'), { tipo: v === 'bypassPermissions' ? 'atencion' : 'ok', sesion: s.id });
      D.emitir();
    });
  }

  /* Permiso pendiente: herramienta, qué quiere hacer y los dos botones. Se repinta solo cuando cambia la
     petición, para no quitarle el foco a los botones mientras llega texto. */
  function pintarPermiso(s) {
    const c = R.de(s.id), p = c && c.permiso, caja = $('#masc-permiso'), clave = s.id + '|' + (p ? p.id : '');
    if (clave === permisoPintado) return;
    permisoPintado = clave;
    caja.hidden = !p;
    if (!p) { ui.pintar(caja, null); return; }
    const responder = si => Promise.resolve(D.chatPermiso(s.id, p.id, si)).then(r => { if (r && r.error) ui.decir(r.error); else ui.decir(si ? 'Permiso aprobado.' : 'Permiso rechazado.'); area.focus(); });
    ui.pintar(caja, [
      el('div', { class: 'row between' }, [el('h3', { id: 'masc-permiso-t', class: 'label' }, 'Permiso pendiente · ' + s.nombre), ui.insignia('Necesita atención', 'alerta')]),
      el('p', {}, ['Claude quiere usar ', el('span', { class: 'mono' }, p.herramienta), p.descripcion ? ': ' + p.descripcion : '.']),
      el('pre', { class: 'dato', tabindex: '0', role: 'group', 'aria-label': 'Qué quiere hacer' }, p.entrada),
      el('div', { class: 'row' }, [
        el('button', { type: 'button', class: 'btn btn-small', id: 'permiso-rechazar', onclick: () => responder(false) }, 'Rechazar'),
        el('button', { type: 'button', class: 'btn btn-small', id: 'permiso-aprobar', onclick: () => responder(true) }, 'Aprobar')
      ])
    ]);
    ui.decir(s.nombre + ' necesita permiso para usar ' + p.herramienta + '.');
  }

  // Cola de prompts de la sesión elegida: en orden, con subir, bajar, quitar y pausar o reanudar.
  function pintarCola(s) {
    const c = colas[s.id], caja = $('#masc-cola'), clave = s.id + JSON.stringify(c || null);
    if (clave === colaPintada) return;
    colaPintada = clave;
    caja.hidden = !c || !c.items.length;
    const cn = $('#masc-cola-n'), nc = c && c.items.length ? c.items.length : 0; if (cn) cn.textContent = nc ? ' · ' + nc : '';
    $('#masc-encolar').setAttribute('aria-label', 'Añadir a la cola' + (nc ? ' (ya hay ' + nc + ')' : ''));
    if (caja.hidden) { ui.pintar(caja, null); return; }
    const orden = (o, x) => Promise.resolve(D.chatCola(s.id, o, x)).then(r => { if (r && r.error) ui.decir(r.error); });
    const n = c.items.length;
    ui.pintar(caja, [
      el('div', { class: 'row between' }, [
        el('h3', { id: 'masc-cola-t', class: 'label' }, 'Cola · ' + n + (n === 1 ? ' mensaje' : ' mensajes')),
        el('div', { class: 'row' }, [c.pausada ? ui.insignia('En pausa') : null, el('button', { type: 'button', class: 'btn btn-small', id: 'cola-pausa', onclick: () => orden(c.pausada ? 'reanudar' : 'pausar') }, c.pausada ? 'Reanudar' : 'Pausar')])
      ]),
      c.error ? el('p', {}, el('span', { class: 'mal' }, c.error)) : null,
      el('ol', { 'aria-label': 'Prompts en cola' }, c.items.map((x, i) => el('li', {}, [
        el('span', { class: 't', title: x.texto }, x.texto),
        el('button', { type: 'button', class: 'btn btn-small', disabled: i === 0, 'aria-label': 'Subir ' + (i + 1), onclick: () => orden('subir', x.id) }, '↑'),
        el('button', { type: 'button', class: 'btn btn-small', disabled: i === n - 1, 'aria-label': 'Bajar ' + (i + 1), onclick: () => orden('bajar', x.id) }, '↓'),
        el('button', { type: 'button', class: 'btn btn-small', 'aria-label': 'Quitar ' + (i + 1), onclick: () => orden('quitar', x.id) }, 'Quitar')
      ])))
    ]);
  }

  /* Contexto ocupado y Remote Control de la sesión elegida. El contexto es lo que entró en el último turno
     del agente principal, en tokens. No se da en porcentaje: Rastro no sabe con certeza la ventana de cada
     modelo (200 000 o 1 M), y un porcentaje mal calculado engaña más que la cifra sola. */
  function pintarExtras(s) {
    const cx = $('#masc-ctx'), rc = $('#masc-rc');
    if (cx) {
      const n = s.ctx || 0;
      cx.hidden = !n;
      if (n) {
        ui.pintar(cx, [el('span', {}, 'Contexto'), el('span', { class: 'mono' }, ui.tokens(n) + ' tokens')]);
        cx.title = 'Lo que ocupa la conversación en el último turno de Claude. Cuando se llena la ventana del modelo, Claude Code la compacta.';
      }
    }
    if (rc) {
      rc.hidden = !s.carpeta || !D.consola;
      rc.setAttribute('aria-pressed', String(!!s.rc));
      rc.classList.toggle('activo', !!s.rc);
      rc.textContent = s.rc ? 'Remote Control activo' : 'Remote Control';
      rc.title = s.rc ? 'Esta sesión se puede dirigir desde claude.ai/code o la app del móvil.'
        : 'Abre esta sesión en la Terminal con Remote Control, para seguirla desde claude.ai/code o la app del móvil.';
    }
  }
  // Por qué no se puede activar Remote Control en una sesión ('' si se puede).
  function motivoRemote(s) {
    if (!s) return 'Elige una sesión.';
    if (!/^[\w-]+$/.test(s.id)) return 'Esta sesión no se puede abrir con Remote Control.';
    if (enMarcha(s.id)) return 'Espera a que la sesión termine de responder.';
    if (s.vivo && !s.rc) return 'La sesión está abierta en otro proceso de Claude Code: ciérralo antes de abrirla con Remote Control.';
    if (!RA.consola || !RA.consola.ejecutar || !D.consola) return 'Remote Control se activa en la Terminal, que solo funciona en la app de escritorio.';
    return '';
  }
  function abrirRemote() {
    const s = actual();
    if (s && s.rc) return ui.decir('Remote Control ya está activo en ' + s.nombre + '.', 'neutro');
    const m = motivoRemote(s);
    if (m) return no(m);
    RA.consola.ejecutar('claude --resume ' + s.id + ' --remote-control');
  }

  /* "Se enviará a: <sesión> · <destino>", en vivo. Al apuntar (cursor o foco) a Encolar o a un envío
     forzado enseña ese destino; si no, el que tomará Enviar. */
  let apuntado = null;
  function destino(s) {
    s = s || actual();
    const caja = $('#masc-envio');
    if (!caja) return;
    if (!s) return ui.pintar(caja, 'Elige una sesión en la franja de arriba para poder enviar.');
    const orq = RA.asistentes && RA.asistentes.orquestador && RA.asistentes.orquestador();
    const a = apuntado === 'cola' ? 'la cola (sale cuando termine lo que está en marcha)'
      : apuntado === 'claude' ? 'Claude'
      : apuntado === 'barato' ? (D.continuidad ? 'un modelo local, en una copia aparte' : 'una IA económica, en una copia aparte y con tu aprobación')
      : enMarcha(s.id) ? 'nada todavía: la sesión está respondiendo (usa Encolar)'
      : D.continuidad ? 'Pendientes para Claude (Claude no está disponible ahora)'
      : s.entorno === 'ssh' ? 'Claude en ' + s.host + ', por SSH'
      : orq ? 'Claude o una IA económica, según el reparto automático' : 'Claude';
    const m = D.modoDe(s);
    ui.pintar(caja, ['Se enviará a: ', el('b', {}, s.nombre), ' · ', a].concat(m ? [' · modo ', el('b', {}, m.nombre)] : []));
  }
  /* Vista previa (B6): destino, modelo, tokens aproximados, coste y aviso de mensaje largo para una IA
     económica. Las reglas y el umbral son los del orquestador (en el proceso principal). Enter o "Enviar
     ahora" confirma; Esc o "Seguir editando" vuelve al campo. Se apaga en Ajustes. */
  let previa = null;
  function cerrarPrevia() { previa = null; const c = $('#masc-previa'); if (c) { c.hidden = true; ui.pintar(c, null); } }
  function mostrarPrevia(s, t, forzar, elegido, conservar) {
    return Promise.resolve(D.asistentesPrevia(t, forzar)).then(p => {
      if (!p || p.error) return enviar(forzar, elegido, true);
      previa = { s: s.id, t: t, forzar: forzar, elegido: elegido, conservar: conservar };
      const DEST = { claude: 'Claude', barato: 'Una IA económica', auto: 'Claude o una IA económica (reparto automático)', pendiente: 'Pendientes para Claude' };
      const modelo = p.destino === 'claude' ? (s.modelo ? ui.modelo(s.modelo) : 'el de la sesión') : p.destino === 'barato' ? (p.barato || 'la que tengas configurada') : p.destino === 'auto' ? (s.modelo ? ui.modelo(s.modelo) : 'el de la sesión') + (p.barato ? ' o ' + p.barato : '') : '—';
      const coste = p.destino === 'barato' ? '0 (gratis: IA local o modelo gratuito)' : p.destino === 'pendiente' ? 'Nada todavía: se enviará cuando Claude vuelva' : 'Incluido en tu suscripción (cuenta para tu límite de uso)';
      const caja = $('#masc-previa');
      caja.hidden = false;
      ui.pintar(caja, [
        el('h3', { id: 'masc-previa-t', class: 'label' }, 'Antes de enviar'),
        el('dl', {}, [
          el('dt', {}, 'Destino'), el('dd', {}, s.nombre + ' · ' + DEST[p.destino]),
          el('dt', {}, 'Modelo'), el('dd', {}, modelo),
          el('dt', {}, 'Tamaño'), el('dd', {}, '≈' + ui.num(p.tokens) + ' tokens (' + ui.num(t.length) + ' caracteres)'),
          el('dt', {}, 'Coste aproximado'), el('dd', {}, coste)
        ]),
        p.motivo ? el('p', { class: 'note' }, p.motivo) : null,
        p.largo ? el('p', { class: 'aviso-largo' }, '! Mensaje largo: pasa de ' + ui.num(p.umbral) + ' caracteres y una IA económica no lo acepta; irá a Claude. Si quieres que lo haga la económica, divídelo en partes.') : null,
        el('div', { class: 'row' }, [
          el('button', { type: 'button', class: 'btn btn-small', id: 'previa-editar', onclick: () => { cerrarPrevia(); area.focus(); } }, 'Seguir editando'),
          el('button', { type: 'button', class: 'btn btn-small', id: 'previa-enviar', onclick: e => ui.ocupado(e.currentTarget, () => confirmarPrevia()) }, 'Enviar ahora')
        ]),
        el('p', { class: 'note' }, ['Pulsa ', el('kbd', {}, 'Enter'), ' para enviar o ', el('kbd', {}, 'Esc'), ' para seguir editando. Puedes quitar este paso en Ajustes.'])
      ]);
      ui.decir('Revisa el envío: ' + DEST[p.destino] + '. Pulsa Enter para enviarlo o Esc para seguir editando.', { toast: false });
      return { error: 'previa' };          // aún no se envió: el botón no marca "hecho"
    });
  }
  function confirmarPrevia() { const x = previa; cerrarPrevia(); return x ? enviar(x.forzar, x.elegido, true, x.conservar) : null; }

  [['#masc-encolar', 'cola']].forEach(x => {
    const b = $(x[0]);
    ['mouseenter', 'focus'].forEach(e => b.addEventListener(e, () => { apuntado = x[1]; destino(); }));
    ['mouseleave', 'blur'].forEach(e => b.addEventListener(e, () => { apuntado = null; destino(); }));
  });

  function encolar() {
    const s = actual(), t = area.value.trim();
    if (!s) return no('No hay ninguna sesión elegida.');
    if (!t) return no('Escribe primero el mensaje.');
    if (!D.chatEncolar) return no('Aquí se ven datos de muestra: la cola funciona en la app de escritorio.');
    return Promise.resolve(D.chatEncolar(s.id, t)).then(r => {
      if (r && r.error) { ui.decir('No se pudo añadir a la cola. ' + r.error, 'error'); return r; }
      guardarHistorial(t, s.id); vaciarCampo(s.id);
      if (r && r.id && !r.inmediato) ui.decir('Mensaje añadido a la cola de ' + s.nombre + '.', { tipo: 'ok', sesion: s.id, accion: { texto: 'Deshacer', fn: () => Promise.resolve(D.chatCola(s.id, 'quitar', r.id)).then(x => { if (x && x.error) ui.decir('No se pudo deshacer: el mensaje ya salió hacia Claude.', 'atencion'); else { area.value = area.value || t; ui.decir('Deshecho: el mensaje volvió al campo y salió de la cola.', 'ok'); } }) } });
      else ui.decir('Mensaje enviado a ' + s.nombre + ': la cola estaba vacía, así que salió ya.', { tipo: 'ok', sesion: s.id });
      return r;
    });
  }

  // La respuesta llega por js/respuesta.js; aquí se repinta Chat y el botón marca "✓ Respondido".
  R.ganchos.pintar = pintar;
  R.ganchos.terminado = () => { desarmarEsc(); btn.classList.add('hecho'); btn.textContent = '✓ Respondido'; setTimeout(() => { btn.classList.remove('hecho'); pintar(); }, 1200); };
  // Reenviar: el mismo prompt como turno nuevo, sin tocar lo que estés escribiendo. Editar y reenviar: al campo.
  R.ganchos.reenviar = t => enviar(null, t, false, true);
  R.ganchos.editar = t => { area.value = t; nav = null; area.focus(); area.setSelectionRange(t.length, t.length); ui.decir('El prompt está en el campo: edítalo y pulsa Enter para enviarlo.', { toast: false }); };

  /* Detener la respuesta en curso (chat-cancelar: rechaza el permiso pendiente e interrumpe el turno). */
  function detener() {
    const s = actual();
    desarmarEsc();
    if (!s || !enMarcha(s.id)) return null;
    if (!D.chatCancelar) return no('Aquí se ven datos de muestra: detener una respuesta funciona en la app de escritorio.');
    return Promise.resolve(D.chatCancelar(s.id)).then(r => { if (r && r.error) ui.decir(r.error); else ui.decir('Deteniendo la respuesta…', { toast: false }); return r; });
  }
  /* Esc con una respuesta en curso: el patrón "armado" de DESIGN.md. La primera pulsación arma el botón Detener
     ("¿Detener? Esc · 4") y la segunda, antes de 4 s, detiene. Si pasan los 4 s, se desarma. */
  let esc = null;
  function desarmarEsc() {
    if (!esc) return;
    clearInterval(esc.t); esc = null;
    btn.classList.remove('armed');
    const s = actual();
    btn.textContent = s && enMarcha(s.id) ? 'Detener' : 'Enviar';
  }
  function armarEsc(s) {
    let n = 4;
    const pinta = () => { btn.textContent = '¿Detener? Esc · ' + n; };
    esc = { s: s.id, t: setInterval(() => { if (--n <= 0) desarmarEsc(); else pinta(); }, 1000) };
    btn.classList.add('armed');
    pinta();
    ui.decir('¿Detener la respuesta? Pulsa Esc otra vez para confirmar.', { toast: false });
  }
  function teclaEsc(e) {
    if (e.key !== 'Escape' || e.defaultPrevented || (RA.app ? RA.app.sel : {}).vista !== 'chat') return;
    // Lo que está encima (capas, menús, paneles superpuestos, el pop-up del turno) atiende su propio Esc.
    if ((RA.capas && RA.capas.abierta && RA.capas.abierta()) || (RA.turno && RA.turno.abierto && RA.turno.abierto()) || (RA.chat3 && RA.chat3.abierto()) || $('#barra.abierta') || document.querySelector('.ui-menu:not([hidden]), [role="menu"]:not([hidden])')) return;
    const a = document.activeElement;
    if (a && a !== document.body && !a.closest('#v-chat')) return;
    // 1) La vista previa abierta se cierra.
    if (previa) { e.preventDefault(); cerrarPrevia(); area.focus(); return; }
    // 2) Con una respuesta en curso, Esc pide confirmación; la segunda la detiene.
    const s = actual();
    if (!s || !enMarcha(s.id)) return;
    e.preventDefault();
    if (esc && esc.s === s.id) { detener(); return; }
    armarEsc(s);
  }
  document.addEventListener('keydown', teclaEsc);

  area.addEventListener('keydown', e => {
    if (e.key === 'Tab' && e.shiftKey && !e.altKey && !e.ctrlKey) { e.preventDefault(); siguienteModo(); return; }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (previa && previa.t === area.value.trim()) confirmarPrevia(); else { cerrarPrevia(); enviar(); } return; }
    // Esc (vista previa o respuesta en curso) lo atiende teclaEsc, en el documento.
    // Historial: flecha arriba en la primera línea, flecha abajo en la última.
    const antes = area.value.slice(0, area.selectionStart), despues = area.value.slice(area.selectionEnd);
    if (e.key === 'ArrowUp' && antes.indexOf('\n') < 0 && !area.readOnly && (nav ? pos > 0 : historial.length > 0)) {
      e.preventDefault();
      if (!nav) { nav = listaHistorial(); pos = nav.length; borrador = area.value; }
      area.value = nav[--pos];
      area.setSelectionRange(0, 0);
    } else if (e.key === 'ArrowDown' && despues.indexOf('\n') < 0 && nav && pos < nav.length && !area.readOnly) {
      e.preventDefault();
      area.value = ++pos === nav.length ? borrador : nav[pos];
      if (pos === nav.length) nav = null;
      area.setSelectionRange(area.value.length, area.value.length);
    }
  });
  // Lo escrito se guarda como borrador de la sesión (cada medio segundo como mucho).
  area.addEventListener('input', () => { clearTimeout(tBorrador); const id = sesionCampo; tBorrador = setTimeout(() => { if (id === sesionCampo) guardarBorrador(id, area.value); }, 500); });
  // La mascota escucha mientras el campo tiene el foco.
  ['focus', 'blur'].forEach(t => area.addEventListener(t, () => { const s = actual(); if (s && (RA.app ? RA.app.sel : {}).vista === 'chat') RA.vistas.mascota(s); }));
  // El botón: Enviar, o Detener mientras responde (con Esc armado, el clic también detiene).
  $('#masc-form').addEventListener('submit', ev => { ev.preventDefault(); const s = actual(); if (s && enMarcha(s.id)) detener(); else enviar(); });
  // Los chips "Enviar con Claude" y "Modelo barato" se retiraron (2026-11-04): el destino se elige con el
  // selector de modelo, como en Claude Code Desktop. enviar(forzar) sigue para el selector y las pruebas.
  // Lo escrito también puede empezar una sesión nueva, con el asistente.
  $('#masc-nueva').addEventListener('click', e => ui.ocupado(e.currentTarget, () => RA.capas.asistente(area.value.trim()), { cargando: 'Abriendo…', hecho: 'Abierto' }));
  $('#masc-encolar').addEventListener('click', e => ui.ocupado(e.currentTarget, encolar, { cargando: 'Añadiendo…', hecho: 'En la cola' }));
  $('#masc-biblio').addEventListener('click', () => RA.biblioteca && RA.biblioteca.abrir());
  $('#masc-rc').addEventListener('click', abrirRemote);
  // El compositor queda fijo abajo: su alto se guarda en --comp-alto para que lo que reciba el foco o se
  // desplace a la vista (como Aprobar en un permiso) no quede tapado por él.
  const comp = document.querySelector('.compositor');
  if (comp && window.ResizeObserver) new ResizeObserver(() => document.documentElement.style.setProperty('--comp-alto', comp.offsetHeight + 'px')).observe(comp);
  // El cronómetro de la respuesta avanza solo mientras hay algo en marcha.
  setInterval(() => { const s = actual(); if (s && enMarcha(s.id) && (RA.app ? RA.app.sel : {}).vista === 'chat') pintar(s); }, 1000);

  // Texto ya preparado (comentarios del diff): mismo camino que el compositor, sin pasar por el optimizador.
  let enviado = false;
  function enviarTexto(t) { const r = enviar(null, t); enviado = !!(r && typeof r.then === 'function'); return r; }
  RA.chat = { enviar: f => enviar(f), enviarTexto: enviarTexto, detener: detener, ultimoEnvioOk: () => enviado, remote: { motivo: motivoRemote, abrir: abrirRemote }, caveman: pintaCave,
    pintar: pintar, recibir: R.recibir, tarea: tarea, destino: destino,
    colas(c) { colas = c || {}; const s = actual(); if (s) pintarCola(s); },
    enCola: id => colas[id] ? colas[id].items.length : 0,
    permiso: id => R.de(id) && R.de(id).permiso ? R.de(id).permiso : null,
    // Inserta un texto en el campo, donde está el cursor (la biblioteca).
    insertar(t) { const a = area.selectionStart, b = area.selectionEnd; area.value = area.value.slice(0, a) + t + area.value.slice(b); area.focus(); area.setSelectionRange(a + t.length, a + t.length); },
    texto: () => area.value,
    estado: id => R.de(id) ? R.de(id).est : null,
    // Modo que informa la respuesta en curso (system/init o system/status), si la hay.
    modo: id => enMarcha(id) ? R.de(id).modo || '' : '',
    modelo: id => enMarcha(id) ? R.de(id).modelo || '' : '',
    // Deja un texto en el campo, sin enviarlo (lo usa la búsqueda con un prompt anterior).
    poner(t) { area.value = t; nav = null; area.focus(); area.setSelectionRange(t.length, t.length); },
    historial: () => historial.map(h => h.t).reverse(),
    borrador: id => borradores[id] || '',
    // Ventana de contexto del modelo de la sesión, si Claude Code la informó alguna vez (0 si no).
    ventana: R.ventana,
    mcp: R.mcp
  };
})(window.RA = window.RA || {});
