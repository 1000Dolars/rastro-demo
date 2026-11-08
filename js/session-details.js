/* Panel Contexto de Chat (barra derecha) y detalles de la sesión. Desde el 2026-11-07 la barra va, de arriba abajo:
   Tareas (js/chat-columns.js), Contexto (como /context de Claude Code), Entorno, Cambios (js/chat-columns.js) y
   Tareas en segundo plano. GitHub (js/github-card.js) y Conectores se pintan en "Detalles de la sesión"
   (js/session-view.js). No se calcula ni se inventa nada: lo que no se sabe dice "no disponible". */
(function (RA) {
  'use strict';

  const ui = RA.ui, el = ui.el, $ = ui.$, D = RA.datos, L = RA.logica;

  /* Contexto, en dos fuentes reales:
     1. En vivo, del transcript: el modelo del último mensaje y los tokens que entraron en el último turno del agente
        principal (usage: input + caché leída + caché creada). La ventana la informa Claude Code al terminar un
        turno lanzado desde Rastro (modelUsage.contextWindow) o la lectura de abajo; sin ninguna, "no disponible".
     2. El desglose por categoría, de Claude Code (get_context_usage, el dato de /context), solo al pulsar
        "Actualizar": abre la sesión sin mandarle ningún mensaje, así que no gasta tokens
        (src/main/services/claude/context-usage.js). */
  const lecturas = {};                    // por sesión: { pidiendo, r, error }
  function ventanaDe(s) {
    const v = RA.chat && RA.chat.ventana ? RA.chat.ventana(s) : 0, l = lecturas[s.id];
    return v || (l && l.r && l.r.max) || 0;
  }
  function leerContexto(s) {
    if (!D.contextoSesion) return;
    const l = lecturas[s.id] = lecturas[s.id] || {};
    if (l.pidiendo) return;
    l.pidiendo = true; l.error = '';
    pintar();
    Promise.resolve(D.contextoSesion(s.id)).then(r => {
      l.pidiendo = false;
      if (r && r.ok) l.r = r; else l.error = (r && r.error) || 'No disponible.';
      pintar();
      ui.decir(r && r.ok ? 'Contexto leído: ' + r.pct + ' % de la ventana.' : l.error, r && r.ok ? 'ok' : 'atencion');
    }, () => { l.pidiendo = false; l.error = 'No disponible: la lectura falló.'; pintar(); });
  }
  function contexto(s) {
    const l = lecturas[s.id] || {}, n = s.ctx || 0, v = ventanaDe(s), pct = n && v ? Math.round(n * 1000 / v) / 10 : null;
    const modelo = s.modelo || (l.r && l.r.modelo) || '';
    const texto = pct == null ? 'no disponible' : String(pct).replace('.', ',') + ' %';
    const filas = L.filasContexto(l.r), max = l.r && l.r.max;
    const fila = f => el('li', { class: 'ctx-cat' + (f.id === 'free_space' ? ' libre' : '') }, [
      el('span', { class: 'ctx-cat-n' }, f.nombre),
      el('span', { class: 'mono ctx-cat-v' }, ui.tokens(f.tokens) + (f.pct == null ? '' : ' · ' + String(f.pct).replace('.', ',') + ' %')),
      max ? el('span', { class: 'ctx-cat-barra', 'aria-hidden': 'true' }, el('i', { css: { width: Math.min(100, Math.max(f.tokens ? 1 : 0, f.tokens * 100 / max)).toFixed(1) + '%' } })) : null
    ]);
    const boton = el('button', { type: 'button', class: 'btn btn-small', id: 'ctx-actualizar', 'aria-busy': l.pidiendo ? 'true' : null, 'aria-disabled': !D.contextoSesion || s.entorno === 'ssh' ? 'true' : null,
      title: 'Lee el desglose de Claude Code (/context) sin enviar ningún mensaje: no gasta tokens',
      onclick: () => {
        if (!D.contextoSesion) return ui.decir('El desglose se lee en la app de escritorio.', 'atencion');
        if (s.entorno === 'ssh') return ui.decir('No disponible en sesiones SSH todavía.', 'atencion');
        leerContexto(s);
      } }, l.pidiendo ? 'Leyendo…' : 'Actualizar');
    const estado = l.error ? el('p', { class: 'note ctx-estado', role: 'status' }, l.error)
      : l.r ? el('p', { class: 'note mono ctx-estado' }, 'Desglose de Claude Code · ' + L.relativo(l.r.t, D.ahora ? D.ahora() : Date.now()) + ' · ' + ui.tokens(l.r.total) + ' de ' + ui.tokens(l.r.max))
      : el('p', { class: 'note ctx-estado' }, 'Pulsa Actualizar para ver el reparto por categoría, como /context. No gasta tokens.');
    ui.pintar($('#det-contexto'), [
      el('div', { class: 'esc det-esc' }, [
        el('p', { class: 'det-fila' }, [el('span', { class: 'label' }, 'Modelo'), el('span', { class: 'mono det-donde', title: modelo }, modelo ? ui.modelo(modelo) : 'no disponible')]),
        el('div', { class: 'ctx-uso' }, [
          el('div', { class: 'ctx-cifras' }, [
            el('span', { class: pct == null ? 'mono ctx-sin' : 'ctx-pct' + (pct >= 90 ? ' alto' : '') }, texto),
            el('span', { class: 'mono ctx-tok' }, (n ? ui.tokens(n) : 'no disponible') + ' / ' + (v ? ui.tokens(v) : 'no disponible'))
          ]),
          ui.medidor(pct, 'Ventana de contexto usada', pct == null ? 'no disponible' : texto + ', ' + ui.tokens(n) + ' de ' + ui.tokens(v) + ' tokens', true)
        ]),
        filas.dentro.length ? el('ul', { class: 'ctx-cats', 'aria-label': 'Contexto por categoría' }, filas.dentro.map(fila)) : null,
        filas.fuera.length ? el('details', { class: 'ctx-fuera' }, [el('summary', { class: 'note' }, 'Fuera de la ventana (diferidas)'), el('ul', { class: 'ctx-cats' }, filas.fuera.map(fila))]) : null,
        el('div', { class: 'row between ctx-pie' }, [estado, boton])
      ]),
      el('div', { class: 'card-pie' }, [el('h2', { class: 'label', id: 't-det-contexto' }, 'Contexto'), pct == null ? null : el('span', { class: 'mono det-pie-dato' }, texto)])
    ]);
  }

  /* Conectores (servidores MCP) de la sesión: los configurados (~/.claude.json y .mcp.json del proyecto; solo
     nombre y tipo, nunca claves) y su estado en el último mensaje enviado desde Rastro (system/init). Los que
     piden autenticarse llevan "Autenticar": abre /mcp de Claude Code en la Terminal de la sesión (no gasta
     tokens: /mcp no habla con el modelo). */
  const conectores = {};                // por sesión: { pidiendo, t, lista, motivo }
  const CON_MS = 60000;
  function pedirConectores(s) {
    if (!D.conectores) return;
    const c = conectores[s.id] = conectores[s.id] || {};
    if (c.pidiendo || (c.t && D.ahora() - c.t < CON_MS)) return;
    c.pidiendo = true;
    Promise.resolve(D.conectores(s.id)).then(r => { Object.assign(c, { pidiendo: false, t: D.ahora(), lista: (r && r.lista) || [], motivo: (r && r.error) || '' }); pintar(); },
      () => { Object.assign(c, { pidiendo: false, t: D.ahora(), lista: [], motivo: 'No se pudieron leer los conectores.' }); pintar(); });
  }
  const EST_CON = { connected: ['ok', 'conectado'], failed: ['error', 'falló'], 'needs-auth': ['atencion', 'pide autenticarse'], pending: ['neutro', 'conectando'] };
  function autenticar(s, nombre) {
    const motivo = !RA.consola || !RA.consola.ejecutar || !D.consola ? 'Autenticar abre /mcp de Claude Code en la Terminal, que solo funciona en la app de escritorio.' : !s.carpeta ? 'Esta sesión no dejó dicho en qué carpeta trabaja.' : '';
    if (motivo) return ui.decir(motivo, 'atencion');
    RA.consola.ejecutar('claude /mcp');
    ui.decir('Se abrió /mcp en la Terminal: elige ' + nombre + ' y sigue los pasos para autenticarte.', 'ok');
  }
  function pintarConectores(s) {
    pedirConectores(s);
    const c = conectores[s.id] || {}, vivos = (RA.chat && RA.chat.mcp ? RA.chat.mcp(s.id) : null) || [];
    const nombres = new Map();
    (c.lista || []).forEach(x => nombres.set(x.nombre, { nombre: x.nombre, tipo: x.tipo || '', origen: x.origen || '', estado: x.estado || '' }));
    vivos.forEach(x => nombres.set(x.nombre, Object.assign(nombres.get(x.nombre) || { nombre: x.nombre, tipo: '', origen: '' }, { estado: x.estado })));
    const lista = Array.from(nombres.values()).sort((a, b) => (b.estado === 'needs-auth') - (a.estado === 'needs-auth') || a.nombre.localeCompare(b.nombre));
    const cuerpo = !D.conectores ? el('p', { class: 'note det-vacio' }, 'Los conectores se leen en la app de escritorio.')
      : !c.t && c.pidiendo ? el('p', { class: 'label' }, 'Leyendo los conectores')
      : !lista.length ? el('p', { class: 'note det-vacio' }, c.motivo || 'Esta sesión no tiene conectores (servidores MCP) configurados.')
      : el('ul', { class: 'det-lista det-con', 'aria-label': 'Conectores de la sesión' }, lista.slice(0, 8).map(x => {
        const e = EST_CON[x.estado] || ['neutro', 'sin comprobar'];
        return el('li', { class: 'det-con-fila' }, [
          el('i', { class: 'est-pt ' + e[0], 'aria-hidden': 'true' }),
          el('span', { class: 'crece det-con-n' }, [el('span', {}, x.nombre), el('span', { class: 'mono note' }, e[1]), x.tipo || x.origen ? el('span', { class: 'mono note' }, [x.tipo, x.origen].filter(Boolean).join(' · ')) : null]),
          x.estado === 'needs-auth' || x.estado === 'failed' ? el('button', { type: 'button', class: 'btn btn-small', 'aria-label': 'Autenticar ' + x.nombre, onclick: () => autenticar(s, x.nombre) }, 'Autenticar') : null
        ]);
      }));
    ui.pintar($('#det-conectores'), [
      el('div', { class: 'esc det-esc' }, [cuerpo, lista.length > 8 ? el('p', { class: 'note' }, '+' + (lista.length - 8) + ' más. Todos están en /mcp de Claude Code.') : null,
        lista.length && !vivos.length ? el('p', { class: 'note' }, 'El estado se sabe al enviar un mensaje desde Rastro.') : null]),
      el('div', { class: 'card-pie' }, el('h2', { class: 'label', id: 't-det-con' }, 'Conectores'))
    ]);
  }

  /* Tareas en segundo plano: solo órdenes y monitores que siguen tras devolver su resultado (L.tareasFondo). Los
     subagentes están en "Agentes trabajando", nunca aquí. Código B1, B2…, tipo, estado y tiempo. */
  const NOMBRE_EST = { curso: 'en marcha', listo: 'terminada', error: 'falló', detenido: 'detenida', nodatos: 'sin aviso de fin' };
  const PUNTO_EST = { curso: 'curso', listo: 'ok', error: 'error', detenido: 'neutro', nodatos: 'neutro' };
  function pintarTareas(s) {
    const todas = L.tareasFondo(s, D.ahora ? D.ahora() : Date.now()), curso = todas.filter(t => t.est === 'curso');
    ui.pintar($('#det-tareas'), [
      el('div', { class: 'esc det-esc' }, [
        todas.length ? el('ul', { class: 'det-lista fondo-lista', 'aria-label': 'Tareas en segundo plano' }, todas.slice(-8).reverse().map(t => el('li', { class: 'fondo-fila' }, [
          ui.insignia(t.cod),
          el('span', { class: 'crece fondo-txt' }, [
            el('span', { class: 'fondo-l1' }, [el('span', { class: 'label' }, t.tipo), el('span', { class: 'mono note' }, t.ms == null ? '' : ui.dur(t.ms))]),
            el('span', { class: 'mono fondo-n', title: t.nombre }, t.nombre),
            el('span', { class: 'fondo-est' }, [el('i', { class: 'est-pt ' + PUNTO_EST[t.est], 'aria-hidden': 'true' }), el('span', { class: 'mono note' }, NOMBRE_EST[t.est] || t.est)])
          ])
        ]))) : el('p', { class: 'note det-vacio' }, 'Nada en segundo plano.'),
        todas.length > 8 ? el('p', { class: 'note' }, '+' + (todas.length - 8) + ' anteriores en la salida de las tareas.') : null,
        todas.length ? el('button', { type: 'button', class: 'btn btn-small', id: 'det-tar-ver', onclick: () => RA.paneles && RA.paneles.abrir('tareas') }, 'Ver la salida de las tareas') : null
      ]),
      el('div', { class: 'card-pie' }, [el('h2', { class: 'label', id: 't-det-tar' }, 'Tareas en segundo plano'), curso.length ? el('span', { class: 'mono det-pie-dato', title: 'En marcha' }, String(curso.length)) : null])
    ]);
  }

  /* Entorno: dónde corre la sesión y el interruptor de Remote Control (como en Claude Code Desktop).
     Encenderlo abre la sesión en la Terminal con --remote-control. Apagarlo cierra esa terminal, solo si la
     abrió Rastro; si se activó en otro sitio, el interruptor dice dónde apagarlo. */
  /* Sesión SSH: al elegirla, y cada 20 s mientras está a la vista, se trae lo nuevo de su transcript en el equipo remoto
     (una llamada corta de ssh; el proceso principal no la repite si ya hay una en marcha). */
  const ultimaSync = {};
  function sincronizar(id) {
    if (!D.ssh || !D.ssh.sincronizar || Date.now() - (ultimaSync[id] || 0) < 20000) return;
    ultimaSync[id] = Date.now();
    Promise.resolve(D.ssh.sincronizar(id)).catch(() => {});
  }
  function entorno(s) {
    const rc = !!s.rc, R = RA.chat && RA.chat.remote, mia = rc && RA.consola && RA.consola.abiertas && RA.consola.abiertas().some(t => t.viva && t.lanzada.indexOf('--resume ' + s.id) >= 0);
    const motivo = rc ? (mia ? '' : 'Se activó fuera de Rastro: desactívalo en esa terminal con /remote-control.') : (R ? R.motivo(s) : 'No disponible.');
    const sw = el('button', { type: 'button', id: 'det-rc', class: 'btn btn-small sw', role: 'switch', 'aria-checked': String(rc), 'aria-disabled': motivo ? 'true' : null, title: motivo || (rc ? 'Apagar: cierra la terminal donde corre con Remote Control' : 'Encender: abre la sesión en la Terminal con Remote Control'), 'aria-describedby': 'det-rc-nota' },
      [el('span', { class: 'sr' }, 'Remote Control: '), el('i', { class: 'est-pt ' + (rc ? 'ok' : 'neutro'), 'aria-hidden': 'true' }), rc ? 'Activo' : 'Inactivo']);
    sw.addEventListener('click', () => {
      if (motivo) return ui.decir(motivo, 'atencion');
      if (!rc) return R.abrir();
    });
    if (rc && !motivo) ui.armar(sw, '¿Apagar Remote Control? Cierra su terminal', () => { const n = RA.consola.cerrarDe('--resume ' + s.id); ui.decir(n ? 'Remote Control apagado: se cerró su terminal.' : 'No se encontró la terminal de Remote Control.', n ? 'ok' : 'atencion'); });
    const donde = s.carpeta ? (s.carpeta.replace(/^\/(var\/)?home\/[^/]+/, '~')) : 'carpeta desconocida';
    // Sesión SSH (fase 1): dice en qué equipo corre y qué no se puede hacer todavía. Remote Control es de este equipo: no aplica.
    if (s.entorno === 'ssh') {
      sincronizar(s.id);
      ui.pintar($('#det-entorno'), [
        el('div', { class: 'esc det-esc' }, [
          el('p', { class: 'det-fila' }, [el('span', { class: 'label' }, 'Dónde'), el('span', { class: 'mono det-donde', title: s.host + ':' + s.rutaRemota }, 'SSH · ' + s.host + ':' + s.rutaRemota)]),
          el('p', { class: 'note', id: 'det-ssh-nota' }, 'Se ve su transcript de ese equipo (también lo hecho desde otra terminal y los subagentes). Archivos en solo lectura, Terminal y vista previa en ese equipo. GitHub, conectores y Remote Control de esta sesión, todavía no.')
        ]),
        el('div', { class: 'card-pie' }, el('h2', { class: 'label', id: 't-det-ent' }, 'Entorno'))
      ]);
      return;
    }
    ui.pintar($('#det-entorno'), [
      el('div', { class: 'esc det-esc' }, [
        el('p', { class: 'det-fila det-fila-donde' }, [el('span', { class: 'label' }, 'Dónde'), el('span', { class: 'mono det-donde', title: s.carpeta || '' }, 'Este equipo · ' + donde)]),
        el('p', { class: 'det-fila' }, [el('span', { class: 'label' }, 'Proceso'), el('span', { class: 'ent-est' }, [el('i', { class: 'est-pt ' + (s.vivo ? 'ok' : 'neutro'), 'aria-hidden': 'true' }), el('span', { class: 'mono' }, s.vivo ? 'en marcha' : 'cerrado')])]),
        el('div', { class: 'det-fila' }, [el('span', { class: 'label', id: 'det-rc-l' }, 'Remote Control'), sw]),
        motivo ? el('p', { class: 'note', id: 'det-rc-nota' }, motivo) : el('p', { class: 'sr', id: 'det-rc-nota' }, rc ? 'Activo: se puede seguir desde claude.ai/code o la app del móvil.' : 'Inactivo. Enciéndelo para seguir esta sesión desde claude.ai/code o la app del móvil.')
      ]),
      el('div', { class: 'card-pie' }, el('h2', { class: 'label', id: 't-det-ent' }, 'Entorno'))
    ]);
  }

  function pintar() {
    if (!$('#det-contexto')) return;
    const s = RA.vistas && RA.vistas.actual();
    ['#det-contexto', '#det-entorno', '#det-github', '#det-conectores', '#det-tareas'].forEach(id => { $(id).hidden = !s; });
    if (!s) return;
    // El repintado no le quita el foco al botón Actualizar.
    const conFoco = document.activeElement && document.activeElement.id === 'ctx-actualizar';
    contexto(s);
    if (conFoco && $('#ctx-actualizar')) $('#ctx-actualizar').focus();
    // Sin repintar el interruptor mientras está armado (segunda pulsación pendiente).
    if (!$('#det-rc.armed')) entorno(s);
    if (RA.github) RA.github.pintar(s);
    if (!$('#det-conectores').contains(document.activeElement)) pintarConectores(s);
    pintarTareas(s);
  }

  RA.detalles = { pintar: pintar, leerContexto: leerContexto, lecturas: lecturas };
  function montar() { D.alCambiar(pintar); document.addEventListener('rastro:vista', pintar); pintar(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar); else montar();
})(window.RA = window.RA || {});
