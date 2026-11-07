/* Capa de datos. La interfaz solo habla con RA.datos: lee `estado`, se suscribe a los cambios y
   pide acciones. En la maqueta la rellena src/renderer/js/sample-data.js con datos de muestra; en la app de
   escritorio la rellenará el puente del preload (window.rastro) con datos reales, sin tocar las vistas.

   Forma de `estado` (la misma en los dos casos):
     conexion: 'viva' | 'perdida'      cargando: boolean
     sesiones: [{ id, nombre, carpeta, origen: 'app' | 'externa', est, fase, modelo, t0, t1,
                  agentes:  [{ id, cod, tipo, padre, est, t0, t1 }],
                  eventos:  [{ id, ag, t, h, res, est, dur, ent, sal, err, mas, archivo, parche, sinDiff, hijo, fondo }],
                  entregables, modelos, resumen }]
     actividad: { dias: [{ t, n, e }], horas: [[24 cifras] × 7] }
     uso: { fuente: 'oficial' | 'estimado', medido, bloques: [{ id, nombre, pct, reinicia, tokens }], modelos: [{ id, tokens }] }
   Un parche es [{ viejo, nuevo, lineas: [' contexto', '-quitada', '+añadida'] }], como el
   structuredPatch que Claude Code guarda en el transcript.
   En la app lo pesado de un evento (ent, sal, err entero y parche) no viaja con la sesión: se pide
   con RA.datos.detalle(sesion, evento) al desplegarlo. Mientras, el evento trae `cuenta`
   ({ mas, menos }) y la primera línea de su salida. */
(function (RA) {
  'use strict';

  const CLAVE = 'rastro:v1';
  const ESCRITURA = { Edit: 1, Write: 1, MultiEdit: 1, NotebookEdit: 1 };
  const oyentes = { cambio: [], aviso: [] };

  /* Sistema donde corre la interfaz. En la app lo dice el preload; la maqueta (un navegador) enseña
     los datos de muestra de Windows. Todo lo que cambia de un sistema a otro en los textos sale de aquí. */
  const SO = {
    id: 'win32',
    win() { return this.id === 'win32'; },
    sep() { return this.win() ? '\\' : '/'; },
    une(a, b) { return String(a).replace(/[\\/]+$/, '') + this.sep() + b; },
    datos() { return this.win() ? '%APPDATA%\\Rastro' : '~/.config/Rastro'; },
    proyectos() { return this.win() ? '%USERPROFILE%\\.claude\\projects' : '~/.claude/projects'; },
    gestor() { return this.win() ? 'el Explorador de Windows' : 'el gestor de archivos'; },
    nombre() { return this.win() ? 'Windows' : 'Linux'; }
  };

  const D = {
    so: SO,
    muestra: false,
    estado: { conexion: 'viva', cargando: true, sesiones: [], actividad: { dias: [], horas: [] }, uso: { fuente: 'estimado', bloques: [], modelos: [] }, modos: {} },
    // Modelos que se pueden elegir por fase. Son los identificadores que usa el CLI; se editan aquí.
    MODELOS: [['claude-sonnet-5-5', 'Sonnet 5.5'], ['claude-opus-5-5', 'Opus 5.5'], ['claude-haiku-5-5', 'Haiku 5.5']],
    /* Modos de uso del selector de Chat (Añadido 3). id: el valor de --permission-mode (verificado con el CLI
       2.1.280; 'default' es el alias de 'manual' y es lo que graban los transcripts). Lo usan el selector,
       la barra de estado y el mapa: un solo sitio para el nombre y la explicación. */
    MODOS_USO: [
      // Orden y nombres de Claude Code Desktop (code.claude.com/docs/en/desktop, 2026-11-04).
      { id: 'default', nombre: 'Manual', linea: 'Pregunta antes de cada edición u orden. Es el normal.' },
      { id: 'acceptEdits', nombre: 'Aceptar ediciones', linea: 'Edita archivos sin preguntar; pregunta antes de ejecutar órdenes.' },
      { id: 'plan', nombre: 'Plan', linea: 'Solo investiga y propone un plan. No edita nada.' },
      { id: 'auto', nombre: 'Auto', linea: 'Hace casi todo solo; un control automático frena lo arriesgado.' },
      { id: 'bypassPermissions', nombre: 'Omitir permisos', linea: 'Ejecuta todo sin preguntar.' }
    ],
    /* Modo de una sesión: el elegido en el selector (se aplica al siguiente mensaje, o en caliente), si no el
       que informa la respuesta en curso y, si no, el último que grabó su transcript. null: no se sabe. */
    modoDe(s) {
      if (!s) return null;
      const c = RA.chat && RA.chat.modo ? RA.chat.modo(s.id) : '';
      const id = (D.estado.modos || {})[s.id] || c || s.modo || '';
      return D.MODOS_USO.find(m => m.id === (id === 'manual' ? 'default' : id)) || (id ? { id: id, nombre: id, linea: '' } : null);
    },
    ajustes: {
      tema: 'dark', silencio: false, volumen: 0.6, inicioWindows: false, cerrarABandeja: true,
      raiz: 'C:\\Proyectos', recientes: [], renueva: '', teclas: { buscar: 'k', leer: 'F8' },
      modelos: { diseno: 'claude-sonnet-5-5', codigo: 'claude-opus-5-5', resumen: 'claude-haiku-5-5' },
      skillsPrimero: true, shell: 'powershell',
      // Paridad final (2026-11-04): Ajustes › Claude Code y Notificaciones.
      permisosDefecto: 'default', autoArchivar: false, vistaTrans: 'normal', prefijoRama: 'rastro/', popupResumen: true,
      // Caveman (Parte A): global null = apagado; porModelo { 'prov:modelo': nivel | 'off' }.
      caveman: { global: null, porModelo: {} },
      // Claridad (Fase C): modo Simple por defecto, la guía de primer uso y la vista previa antes de enviar.
      avanzado: false, guiaVista: false, previa: true,
      // Chat en tres columnas: panel derecho abierto (desde 1280 px) y filtro de la lista Sesiones.
      chat3: { lado: true, filtro: 'activas' },
      // Disposición de los paneles en cuadrícula (js/panes.js, RA.logica.estadoPaneles).
      paneles: { columnas: [['chat']], anchos: {}, altos: {} },
      // Por evento: sonido, notificación de escritorio y volumen.
      eventos: { fin: { sonido: true, notif: true, vol: 0.6 }, error: { sonido: true, notif: true, vol: 0.6 }, atencion: { sonido: true, notif: true, vol: 0.6 } }
    },
    almacen: true,   // false si el almacenamiento del navegador no está disponible

    ahora() { return Date.now(); },
    alCambiar(fn) { oyentes.cambio.push(fn); },
    // Avisos puntuales: { tipo: 'fin' | 'error' | 'subagente' | 'conexion', sesion, texto }
    alAvisar(fn) { oyentes.aviso.push(fn); },
    emitir() { oyentes.cambio.forEach(fn => fn()); },
    avisar(a) { oyentes.aviso.forEach(fn => fn(a)); },

    guardar(parcial) {
      Object.assign(D.ajustes, parcial);
      try { localStorage.setItem(CLAVE, JSON.stringify(D.ajustes)); } catch (e) { D.almacen = false; }
    },
    // Carpetas recientes: las últimas 8 en las que se abrió una sesión o el explorador, la más nueva primero.
    recordar(ruta) {
      const r = D.ajustes.recientes.filter(x => typeof x === 'string' && x.toLowerCase() !== ruta.toLowerCase());
      D.guardar({ recientes: [ruta].concat(r).slice(0, 8) });
    }
  };
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE)) || {};
    Object.keys(D.ajustes).forEach(k => {
      if (g[k] == null || typeof g[k] !== typeof D.ajustes[k] || Array.isArray(g[k]) !== Array.isArray(D.ajustes[k])) return;
      if (Array.isArray(g[k])) D.ajustes[k] = g[k].filter(x => typeof x === 'string').slice(0, 8);
      else if (typeof g[k] === 'object') Object.assign(D.ajustes[k], g[k]); else D.ajustes[k] = g[k];
    });
  } catch (e) { D.almacen = false; }

  // Cálculos sobre el estado. No guardan nada: se rehacen en cada pintado.
  const calc = {
    sesion(id) { return D.estado.sesiones.filter(s => s.id === id)[0]; },
    agente(s, id) { return s.agentes.filter(a => a.id === id)[0]; },
    eventos(s, ag) { return s.eventos.filter(e => e.ag === ag).sort((a, b) => a.t - b.t); },
    durAgente(a) { return a.t0 ? (a.t1 || D.ahora()) - a.t0 : null; },
    cifras(s) {
      return {
        activos: s.agentes.filter(a => a.est === 'curso').length, llamadas: s.eventos.length,
        errores: s.eventos.filter(e => e.est === 'error').length, ms: (s.t1 || D.ahora()) - s.t0
      };
    },
    // Líneas añadidas y quitadas de un parche.
    cuenta(parche) {
      const c = { mas: 0, menos: 0 };
      (parche || []).forEach(h => h.lineas.forEach(l => { if (l[0] === '+') c.mas++; else if (l[0] === '-') c.menos++; }));
      return c;
    },
    // Cambios de todas las sesiones, del más reciente al más antiguo. Un cambio hecho desde Bash no
    // trae parche (sinDiff) y una edición fallida trae su error.
    cambios() {
      const out = [];
      D.estado.sesiones.forEach(s => s.eventos.forEach(e => {
        if (!e.archivo || !(e.parche || e.cuenta || e.sinDiff || (ESCRITURA[e.h] && e.est === 'error'))) return;
        const c = e.cuenta || calc.cuenta(e.parche);     // en la app el parche se pide aparte; la cuenta viaja con el evento
        out.push({ id: s.id + ':' + e.id, s: s, a: calc.agente(s, e.ag), e: e, archivo: e.archivo, mas: c.mas, menos: c.menos });
      }));
      return out.sort((a, b) => b.e.t - a.e.t);
    },
    // Tabla de archivos de una sesión: lecturas, escrituras, último agente y última vez.
    archivos(s) {
      const m = {};
      s.eventos.forEach(e => {
        if (!e.archivo) return;
        const f = m[e.archivo] = m[e.archivo] || { archivo: e.archivo, lecturas: 0, escrituras: 0, t: 0, a: null };
        if (e.h === 'Read') f.lecturas++; else f.escrituras++;
        if (e.t >= f.t) { f.t = e.t; f.a = calc.agente(s, e.ag); }
      });
      return Object.keys(m).map(k => m[k]).sort((a, b) => b.t - a.t);
    },
    herramientas(sesiones) {
      const m = {};
      sesiones.forEach(s => s.eventos.forEach(e => {
        const h = m[e.h] = m[e.h] || { h: e.h, n: 0, err: 0, d: [] };
        h.n++; if (e.est === 'error') h.err++; if (e.dur != null) h.d.push(e.dur);
      }));
      return Object.keys(m).map(k => { const h = m[k]; h.d.sort((a, b) => a - b); h.med = h.d.length ? h.d[h.d.length >> 1] : null; return h; }).sort((a, b) => b.n - a.n);
    },
    // Llamadas por tramo de tiempo y por agente: los cinco agentes con más llamadas y cuántos quedan fuera.
    ritmo(s) {
      const fin = s.t1 || D.ahora(), tramos = Math.min(24, Math.max(2, Math.ceil((fin - s.t0) / 60000))), paso = (fin - s.t0) / tramos;
      const series = s.agentes.map(a => ({ cod: a.cod, nombre: a.tipo, v: new Array(tramos).fill(0), n: 0 }));
      s.eventos.forEach(e => {
        const k = s.agentes.indexOf(calc.agente(s, e.ag)), i = Math.min(tramos - 1, Math.max(0, Math.floor((e.t - s.t0) / paso)));
        if (k >= 0) { series[k].v[i]++; series[k].n++; }
      });
      const con = series.filter(x => x.n).sort((a, b) => b.n - a.n);
      return { series: con.slice(0, 5), resto: Math.max(0, con.length - 5), desde: s.t0, hasta: fin, paso: paso };
    }
  };

  RA.datos = D;
  RA.calc = calc;
})(window.RA = window.RA || {});
