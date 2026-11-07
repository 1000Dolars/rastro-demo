/* Lógica pura de la paridad con Claude Code Desktop (docs/PARIDAD-FINAL.md): sin DOM ni Node, para que la
   use la interfaz y la prueben las pruebas unitarias sin abrir nada. Se exporta como módulo de Node y, en la
   interfaz, como RA.logica. */
(function (root) {
  'use strict';

  /* ---- Selector de modo de permisos ----
     Orden y nombres de la documentación de Claude Code Desktop (2026-11-04): Manual, Aceptar ediciones, Plan,
     Auto y Omitir permisos. `autonomia` es lo que puede hacer sin preguntar (1 = lo mínimo, 5 = todo). */
  const MODOS = [
    { id: 'default', nombre: 'Manual', autonomia: 2 },
    { id: 'acceptEdits', nombre: 'Aceptar ediciones', autonomia: 3 },
    { id: 'plan', nombre: 'Plan', autonomia: 1 },
    { id: 'auto', nombre: 'Auto', autonomia: 4 },
    { id: 'bypassPermissions', nombre: 'Omitir permisos', autonomia: 5 }
  ];
  const PUNTOS = { total: 10, diametro: 4, separacion: 3 };
  /* Puntos del selector: una fila de 10 puntos de 4 px separados 3 px; se llenan dos por nivel de autonomía.
     Un modo desconocido (o "el de sus ajustes") no llena ninguno. */
  function puntosModo(id) {
    const m = MODOS.find(x => x.id === (id === 'manual' ? 'default' : id));
    const llenos = m ? Math.round(m.autonomia * PUNTOS.total / 5) : 0;
    return { total: PUNTOS.total, llenos: llenos, diametro: PUNTOS.diametro, separacion: PUNTOS.separacion, ancho: PUNTOS.total * PUNTOS.diametro + (PUNTOS.total - 1) * PUNTOS.separacion };
  }

  /* ---- Esfuerzo ----
     Niveles de esfuerzo.json. El anillo de "Medio ◯" dice el nivel: fracción del anillo llena. */
  const ESFUERZOS = [['bajo', 'Bajo', 1 / 3], ['medio', 'Medio', 2 / 3], ['alto', 'Alto', 1], ['personalizado', 'Personalizado', 1]];
  function anilloEsfuerzo(nivel) {
    const e = ESFUERZOS.find(x => x[0] === nivel);
    return e ? { nivel: e[0], nombre: e[1], fraccion: e[2], discontinuo: e[0] === 'personalizado' } : { nivel: '', nombre: 'Según la tarea', fraccion: 0, discontinuo: false };
  }

  /* ---- GitHub ----
     Nombre de un repositorio nuevo: lo que acepta GitHub, sin "." ni ".." solos. */
  const NOMBRE_REPO = /^[A-Za-z0-9._-]{1,100}$/;
  function nombreRepo(n) {
    n = String(n == null ? '' : n);
    if (!n) return 'Escribe el nombre del repositorio.';
    if (n === '.' || n === '..') return 'El nombre no puede ser "." ni "..".';
    // Un guion al principio haría que gh lo leyera como una opción (--public, --push…).
    if (n[0] === '-') return 'El nombre no puede empezar por un guion.';
    if (!NOMBRE_REPO.test(n)) return n.length > 100 ? 'Como mucho 100 caracteres.' : 'Solo letras sin tilde, números, punto, guion y guion bajo; sin espacios.';
    return '';
  }

  /* Estado del CI para la tarjeta GitHub: 'pendiente' (aún no hay checks o están en cola), 'curso' (alguno
     corre), 'correcto' o 'fallo'. Entra lo que devuelve `gh pr view --json statusCheckRollup`. */
  const FALLAN = ['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE'];
  const EN_COLA = ['QUEUED', 'PENDING', 'EXPECTED', 'WAITING', 'REQUESTED'];
  function estadoCI(checks) {
    if (!Array.isArray(checks) || !checks.length) return 'pendiente';
    const v = checks.map(x => String((x && (x.conclusion || x.state || x.status)) || '').toUpperCase());
    if (v.some(x => FALLAN.indexOf(x) >= 0)) return 'fallo';
    if (v.some(x => x === 'IN_PROGRESS')) return 'curso';
    if (v.some(x => x === '' || EN_COLA.indexOf(x) >= 0)) return v.every(x => x === '' || EN_COLA.indexOf(x) >= 0) ? 'pendiente' : 'curso';
    return 'correcto';
  }
  const NOMBRE_CI = { pendiente: 'CI pendiente', curso: 'CI en curso', correcto: 'CI correcto', fallo: 'CI con fallos' };

  /* Límite de consultas: como mucho una por clave (sesión) cada `ms`. `puede(clave, ahora)` dice si toca
     consultar ya y, si sí, lo apunta. */
  function limitador(ms) {
    const ult = new Map();
    return {
      ms: ms,
      puede(clave, ahora) { const t = ult.get(clave); if (t != null && ahora - t < ms) return false; ult.set(clave, ahora); return true; },
      falta(clave, ahora) { const t = ult.get(clave); return t == null ? 0 : Math.max(0, ms - (ahora - t)); },
      olvidar(clave) { ult.delete(clave); }
    };
  }

  /* ---- Pop-up de resumen al final de cada turno ----
     Decide si se enseña y con qué: el resumen (o null mientras no llega), cuántos archivos tocó el turno y
     cuánto duró. No se enseña si el turno no terminó bien o si la persona quitó los resúmenes. */
  function popupTurno(t, ajustes) {
    if (!t || t.est !== 'listo') return null;
    if (ajustes && ajustes.popupResumen === false) return null;
    const archivos = Array.from(new Set((t.archivos || []).filter(Boolean))).length;
    const ms = Math.max(0, (t.t1 || 0) - (t.t0 || 0));
    return { resumen: t.resumen || null, archivos: archivos, ms: ms, sonido: !(ajustes && ajustes.silencio) };
  }

  /* ---- Error de una respuesta de Chat: "qué pasó + qué puedes hacer" ----
     El texto crudo del CLI (o del proceso principal) queda como detalle. Los motivos que Rastro ya escribe
     en palabras (llegan con su código: sesión ocupada, sin CLI, sin carpeta…, o 'propio' si los escribió el
     orquestador) se enseñan tal cual. */
  const CODIGOS_CLAROS = ['propio', 'vacio', 'no-encontrada', 'ocupada', 'sin-cli', 'sin-carpeta', 'auth', 'sin-claude'];
  const ERRORES = [
    [/overloaded|\b529\b/i, 'Claude está saturado ahora mismo.', 'Espera un momento y vuelve a enviarlo.'],
    [/usage limit|session limit|weekly limit|hit your .{0,20}limit|rate.?limit|\b429\b|limit reached|quota/i, 'Llegaste al límite de uso de tu plan.', 'Espera a que se renueve (Uso te dice cuándo) o envíalo a una IA económica.'],
    [/no está usando la suscripción|apiKeySource/i, 'Claude Code no está usando tu suscripción, así que no se envió nada.', 'Quita la clave de API del entorno de Claude Code y vuelve a enviarlo.'],
    [/not logged in|login|unauthori[sz]ed|\b401\b|invalid api key|authentication/i, 'Claude Code no tiene la sesión iniciada.', 'Abre la Consola, ejecuta claude auth login y vuelve a enviarlo.'],
    [/prompt is too long|context (window|length)|too many tokens/i, 'La conversación ya no cabe en la memoria del modelo.', 'Escribe /compact para resumirla o empieza una sesión nueva.'],
    [/error_max_turns|max(imum)? turns/i, 'Claude se detuvo al llegar al máximo de pasos de un turno.', 'Envía "sigue" para que continúe donde lo dejó.'],
    [/ECONNRESET|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|network|socket hang up|fetch failed|timed? ?out/i, 'Se cortó la conexión con Claude.', 'Comprueba tu conexión y vuelve a enviarlo.'],
    [/terminó sin resultado|exited|código \d+/i, 'Claude Code se cerró sin responder.', 'Vuelve a enviarlo; si se repite, abre "Ver detalles".']
  ];
  function explicarError(error, codigo) {
    const d = String(error == null ? '' : error).trim();
    if (codigo && CODIGOS_CLAROS.indexOf(codigo) >= 0) return { que: d, hacer: '', detalle: '' };
    for (let i = 0; i < ERRORES.length; i++) if (ERRORES[i][0].test(d)) return { que: ERRORES[i][1], hacer: ERRORES[i][2], detalle: d };
    return { que: 'Claude Code devolvió un error y el mensaje no se completó.', hacer: 'Vuelve a enviarlo; si se repite, abre "Ver detalles".', detalle: d };
  }

  /* ---- Chat en tres columnas ----
     Lista "Sesiones" de la barra lateral: "Activas" son las que trabajan o esperan tu respuesta (las mismas
     palabras que la tarjeta de sesión); "Todas", todas. Siempre de la actividad más reciente a la más vieja.
     claveDe(s) da la clave de la tarjeta: trabajando, esperando, terminada, error o detenida. */
  const ACTIVAS = ['trabajando', 'esperando'];
  // Última actividad: la que dice la sesión (tUlt) o, si no la trae, su último evento, su final o su inicio.
  function ultimaActividad(s) {
    if (!s) return 0;
    if (s.tUlt) return s.tUlt;
    const ev = (s.eventos || []).reduce((m, e) => Math.max(m, (e && e.t) || 0), 0);
    return Math.max(ev, s.t1 || 0, s.t0 || 0);
  }
  function filtrarSesiones(lista, filtro, claveDe) {
    return (lista || []).filter(s => filtro === 'todas' || ACTIVAS.indexOf(claveDe(s)) >= 0)
      .slice().sort((a, b) => ultimaActividad(b) - ultimaActividad(a));
  }
  // El último prompt de la sesión en una línea (o '' si no hay).
  function ultimoPrompt(s) {
    const ps = (s && s.prompts) || [];
    let u = null;
    ps.forEach(p => { if (p && typeof p.texto === 'string' && (!u || (p.t || 0) >= (u.t || 0))) u = p; });
    const t = u ? u.texto : (s && typeof s.encargo === 'string' ? s.encargo : '');
    return t.replace(/\s+/g, ' ').trim();
  }
  /* Lo que se guarda en ajustes.json (Almacen): si el panel derecho está abierto y el filtro de la lista. El
     proceso principal lo valida con esta misma función; lo desconocido vuelve a lo de fábrica. */
  function estadoChat3(x) {
    x = x && typeof x === 'object' ? x : {};
    return { lado: x.lado !== false, filtro: x.filtro === 'todas' ? 'todas' : 'activas' };
  }

  /* ---- Disposición de los paneles en cuadrícula (rediseño de abril, docs/REDISENO-ABRIL.md, punto 1) ----
     `columnas` va de izquierda a derecha; cada columna, de arriba abajo. La conversación ('chat') va siempre sola en
     su columna. Hay como mucho PAN_COLS columnas de paneles con PAN_FILAS paneles cada una. `anchos` (px) va por el
     panel de arriba de cada columna; `altos` (fracción del de arriba, 0,2–0,8) por el de arriba de una columna doble.
     Ninguna función cambia el estado que recibe: devuelven { est } o { est (el mismo), error }. */
  const PAN_COLS = 2, PAN_FILAS = 2, PAN_ALTO_MIN = 0.2;
  const panInicial = () => ({ columnas: [['chat']], anchos: {}, altos: {} });
  const copiaPan = e => ({ columnas: e.columnas.map(c => c.slice()), anchos: Object.assign({}, e.anchos), altos: Object.assign({}, e.altos) });
  const deColumnas = e => e.columnas.filter(c => c[0] !== 'chat');

  // Valida y ordena lo guardado. Acepta el formato anterior ({ orden: [...], anchos }: una sola fila de columnas).
  function estadoPaneles(x, validos) {
    x = x && typeof x === 'object' ? x : {};
    const ok = id => id === 'chat' || !validos || validos.indexOf(id) >= 0, vistos = {};
    let cols = Array.isArray(x.columnas) ? x.columnas : Array.isArray(x.orden) ? x.orden.map(id => [id]) : [['chat']];
    cols = cols.filter(Array.isArray).map(c => c.filter(id => typeof id === 'string' && ok(id) && !vistos[id] && (vistos[id] = true)));
    // La conversación, sola en su columna (y siempre presente).
    const out = [];
    cols.forEach(c => { if (c.indexOf('chat') >= 0) { const r = c.filter(id => id !== 'chat'); out.push(['chat']); if (r.length) out.push(r); } else if (c.length) out.push(c); });
    if (!out.some(c => c[0] === 'chat')) out.unshift(['chat']);
    // Topes: cada columna con PAN_FILAS como mucho; lo que sobra se apila en columnas con sitio o se cierra.
    const sobra = [];
    let res = out.map(c => { if (c[0] === 'chat') return c; sobra.push(...c.slice(PAN_FILAS)); return c.slice(0, PAN_FILAS); });
    while (deColumnas({ columnas: res }).length > PAN_COLS) {
      const i = res.map((c, k) => c[0] !== 'chat' ? k : -1).filter(k => k >= 0).pop();
      sobra.push(...res[i]); res.splice(i, 1);
    }
    sobra.forEach(id => { const c = res.filter(c => c[0] !== 'chat' && c.length < PAN_FILAS).pop(); if (c) c.push(id); });
    const anchos = {}, altos = {}, a = x.anchos && typeof x.anchos === 'object' ? x.anchos : {}, h = x.altos && typeof x.altos === 'object' ? x.altos : {};
    res.forEach(c => {
      if (c[0] === 'chat') return;
      if (Number.isFinite(a[c[0]])) anchos[c[0]] = Math.round(Math.max(200, Math.min(4000, a[c[0]])));
      if (c.length > 1 && Number.isFinite(h[c[0]])) altos[c[0]] = Math.max(PAN_ALTO_MIN, Math.min(1 - PAN_ALTO_MIN, h[c[0]]));
    });
    return { columnas: res, anchos: anchos, altos: altos };
  }

  function posicionPanel(e, id) {
    const col = e.columnas.findIndex(c => c.indexOf(id) >= 0);
    if (col < 0) return null;
    return { col: col, cols: e.columnas.length, fila: e.columnas[col].indexOf(id), filas: e.columnas[col].length };
  }

  // Abre `id`: en una columna nueva a la derecha si hay sitio (y `columnaNueva` no es false), si no, debajo del último.
  function abrirPanel(e, id, columnaNueva) {
    if (posicionPanel(e, id)) return { est: e };
    const n = copiaPan(e), pc = deColumnas(n);
    if (columnaNueva !== false && pc.length < PAN_COLS) { n.columnas.push([id]); return { est: n }; }
    const c = pc.filter(c => c.length < PAN_FILAS).pop();
    if (c) { c.push(id); return { est: n }; }
    if (pc.length < PAN_COLS) { n.columnas.push([id]); return { est: n }; }
    return { est: e, error: 'No caben más paneles: cierra uno o restablece la disposición.' };
  }

  function cerrarPanel(e, id) {
    if (id === 'chat' || !posicionPanel(e, id)) return { est: e };
    const n = copiaPan(e);
    n.columnas = n.columnas.map(c => c.filter(x => x !== id)).filter(c => c.length);
    // Si el de arriba de una columna se va, su ancho pasa al que queda.
    if (n.anchos[id] != null) { const c = e.columnas.find(c => c[0] === id); if (c && c[1]) n.anchos[c[1]] = n.anchos[id]; delete n.anchos[id]; }
    delete n.altos[id];
    return { est: n };
  }

  /* Mueve `id` junto a `junto`: 'izq' o 'der' (columna propia a ese lado de la columna de `junto`) o 'arriba' o
     'abajo' (apilado con `junto`). La conversación solo se mueve de columna. */
  function moverPanel(e, id, junto, lado) {
    if (id === junto || !posicionPanel(e, id) || !posicionPanel(e, junto)) return { est: e };
    if (id === 'chat' && (lado === 'arriba' || lado === 'abajo')) return { est: e, error: 'La conversación va sola en su columna.' };
    const n = copiaPan(e), origen = e.columnas.find(c => c.indexOf(id) >= 0);
    // Ancho: la columna que pierde su panel de arriba lo cede al siguiente; el que se va conserva el suyo.
    if (origen[0] === id && origen[1] && n.anchos[id] != null && n.anchos[origen[1]] == null) n.anchos[origen[1]] = n.anchos[id];
    n.columnas = n.columnas.map(c => c.filter(x => x !== id)).filter(c => c.length);
    const j = n.columnas.findIndex(c => c.indexOf(junto) >= 0);
    if (lado === 'izq' || lado === 'der') {
      n.columnas.splice(lado === 'izq' ? j : j + 1, 0, [id]);
      if (deColumnas(n).length > PAN_COLS) return { est: e, error: 'Ya hay ' + PAN_COLS + ' columnas de paneles: apílalo encima o debajo de otro.' };
    } else {
      if (junto === 'chat') return { est: e, error: 'La conversación va sola en su columna.' };
      const c = n.columnas[j];
      if (c.length >= PAN_FILAS) return { est: e, error: 'Esa columna ya tiene ' + PAN_FILAS + ' paneles.' };
      c.splice(lado === 'arriba' ? c.indexOf(junto) : c.indexOf(junto) + 1, 0, id);
      if (n.anchos[junto] != null && c[0] === id) { n.anchos[id] = n.anchos[junto]; }
    }
    delete n.altos[id];
    return { est: estadoPaneles(n) };
  }

  /* Alternativa con el teclado (asa del panel): ← → cambia de columna (si comparte columna, sale a una propia a ese
     lado; si va solo, su columna se cambia con la de al lado); ↑ ↓ apila (si comparte, sube o baja; si va solo, se
     apila arriba o abajo en la columna de paneles más cercana con sitio); Inicio y Fin llevan su columna al principio
     o al final. */
  function tecladoPanel(e, id, tecla) {
    const p = posicionPanel(e, id);
    if (!p) return { est: e };
    const col = e.columnas[p.col], solo = col.length === 1;
    if (tecla === 'ArrowLeft' || tecla === 'ArrowRight') {
      const izq = tecla === 'ArrowLeft';
      if (!solo) return moverPanel(e, id, col[0] === id ? col[1] : col[0], izq ? 'izq' : 'der');
      const k = p.col + (izq ? -1 : 1);
      if (k < 0 || k >= e.columnas.length) return { est: e, error: 'Ya está en el extremo ' + (izq ? 'izquierdo.' : 'derecho.') };
      const n = copiaPan(e); n.columnas.splice(p.col, 1); n.columnas.splice(k, 0, col.slice());
      return { est: n };
    }
    if (tecla === 'ArrowUp' || tecla === 'ArrowDown') {
      const arriba = tecla === 'ArrowUp';
      if (id === 'chat') return { est: e, error: 'La conversación va sola en su columna.' };
      if (!solo) {
        if ((arriba && p.fila === 0) || (!arriba && p.fila === col.length - 1)) return { est: e, error: 'Ya está ' + (arriba ? 'arriba.' : 'abajo.') };
        return moverPanel(e, id, col[arriba ? p.fila - 1 : p.fila + 1], arriba ? 'arriba' : 'abajo');
      }
      // Solo en su columna: se apila en la columna de paneles más cercana con sitio (primero a la izquierda).
      const cand = e.columnas.map((c, k) => ({ c: c, k: k })).filter(x => x.k !== p.col && x.c[0] !== 'chat' && x.c.length < PAN_FILAS)
        .sort((a, b) => Math.abs(a.k - p.col) - Math.abs(b.k - p.col) || a.k - b.k)[0];
      if (!cand) return { est: e, error: 'No hay otra columna de paneles con sitio para apilarlo.' };
      return moverPanel(e, id, cand.c[0], arriba ? 'arriba' : 'abajo');
    }
    if (tecla === 'Home' || tecla === 'End') {
      const n = copiaPan(e); n.columnas.splice(p.col, 1);
      if (tecla === 'Home') n.columnas.unshift(col.slice()); else n.columnas.push(col.slice());
      return { est: n };
    }
    return { est: e };
  }

  // Frase de dónde quedó un panel: "Terminal: columna 2 de 3, arriba".
  function dondePanel(e, id, nombre) {
    const p = posicionPanel(e, id);
    if (!p) return nombre + ': cerrado.';
    return nombre + ': columna ' + (p.col + 1) + ' de ' + p.cols + (p.filas > 1 ? (p.fila === 0 ? ', arriba' : ', abajo') : '') + '.';
  }

  const api = { PAN_COLS: PAN_COLS, PAN_FILAS: PAN_FILAS, PAN_ALTO_MIN: PAN_ALTO_MIN, panInicial: panInicial, estadoPaneles: estadoPaneles, posicionPanel: posicionPanel, abrirPanel: abrirPanel,
    cerrarPanel: cerrarPanel, moverPanel: moverPanel, tecladoPanel: tecladoPanel, dondePanel: dondePanel,
    MODOS: MODOS, PUNTOS: PUNTOS, puntosModo: puntosModo, ESFUERZOS: ESFUERZOS, anilloEsfuerzo: anilloEsfuerzo,
    NOMBRE_REPO: NOMBRE_REPO, nombreRepo: nombreRepo, estadoCI: estadoCI, NOMBRE_CI: NOMBRE_CI, limitador: limitador, popupTurno: popupTurno, explicarError: explicarError,
    ACTIVAS: ACTIVAS, filtrarSesiones: filtrarSesiones, ultimaActividad: ultimaActividad, ultimoPrompt: ultimoPrompt, estadoChat3: estadoChat3 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.RA = root.RA || {}).logica = api;
})(typeof window !== 'undefined' ? window : globalThis);
