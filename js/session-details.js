/* Panel de detalles de la sesión (a la derecha de Chat), con el orden de Claude Code Desktop: Contexto, Entorno,
   GitHub (lo pinta js/github-card.js), Conectores y Tareas en segundo plano. Las tarjetas que eran solo de
   RASTRO (Cambios, Agentes trabajando, Uso de tu plan y Plan) salieron del panel el 2026-11-04: Cambios queda
   como panel (Ctrl+Mayús+D no tiene botón), el uso va en la barra inferior y el Plan en el ⋮.
   No se calcula ni se inventa nada: lo que no se sabe dice "sin dato", y lo supuesto se rotula "estimado". */
(function (RA) {
  'use strict';

  const ui = RA.ui, el = ui.el, $ = ui.$, D = RA.datos;
  const abiertas = new Set();            // tarjetas desplegadas (Contexto)
  const VENTANA_SUPUESTA = 200000;       // si Claude Code aún no dijo la ventana de ese modelo

  /* Contexto: anillo con el % de la ventana que ocupa la conversación (tokens que entraron en el último turno del
     agente principal). La ventana la informa Claude Code al terminar un turno lanzado desde Rastro
     (modelUsage.contextWindow) y se recuerda por modelo; hasta entonces se supone de 200 K y se rotula
     "estimado". El reparto por categoría no está en el registro: dice "sin dato". */
  function ventanaDe(s) {
    const v = RA.chat && RA.chat.ventana ? RA.chat.ventana(s) : 0;
    return v ? { n: v, estimada: false } : { n: VENTANA_SUPUESTA, estimada: true };
  }
  function anillo(pct) {
    const r = 15, L = 2 * Math.PI * r, f = Math.max(0, Math.min(1, pct / 100));
    return ui.svg('svg', { class: 'ctx-anillo' + (pct >= 90 ? ' alto' : ''), viewBox: '0 0 36 36', width: '36', height: '36', 'aria-hidden': 'true' }, [
      ui.svg('circle', { cx: '18', cy: '18', r: String(r), class: 'ctx-fondo' }),
      f ? ui.svg('circle', { cx: '18', cy: '18', r: String(r), class: 'ctx-arco', 'stroke-dasharray': (L * f).toFixed(2) + ' ' + L.toFixed(2), transform: 'rotate(-90 18 18)' }) : null
    ]);
  }
  function contexto(s) {
    const n = s.ctx || 0, v = ventanaDe(s), pct = n ? Math.round(n * 100 / v.n) : null, abierta = abiertas.has('det-contexto');
    const boton = el('button', { type: 'button', class: 'btn btn-small det-abrir', 'aria-expanded': String(abierta), 'aria-controls': 'det-contexto-esc',
      onclick: () => { if (abierta) abiertas.delete('det-contexto'); else abiertas.add('det-contexto'); pintar(); $('#det-contexto .det-abrir').focus(); } }, abierta ? 'Ocultar el desglose' : 'Ver el desglose');
    const texto = pct == null ? 'sin dato' : pct + ' %' + (v.estimada ? ' (estimado)' : '');
    ui.pintar($('#det-contexto'), [
      el('div', { class: 'esc det-esc' }, [
        el('div', { class: 'ctx-fila', role: pct == null ? 'img' : 'meter', 'aria-label': 'Contexto usado: ' + texto, 'aria-valuemin': pct == null ? null : '0', 'aria-valuemax': pct == null ? null : '100', 'aria-valuenow': pct == null ? null : String(Math.min(100, pct)), 'aria-valuetext': pct == null ? null : texto }, [
          anillo(pct || 0),
          el('div', { class: 'ctx-txt' }, [
            el('span', { class: pct == null ? 'mono ctx-sin' : 'ctx-pct' + (pct >= 90 ? ' alto' : '') }, pct == null ? 'sin dato' : pct + ' %'),
            el('span', { class: 'mono ctx-tok' }, n ? ui.tokens(n) + ' de ' + ui.tokens(v.n) + ' tokens' + (v.estimada ? ' · estimado' : '') : 'aún no hay un turno con uso')
          ])
        ]),
        boton,
        el('div', { class: 'det-esc', id: 'det-contexto-esc', hidden: !abierta }, [
          el('p', { class: 'det-fila' }, [el('span', { class: 'label' }, 'Último turno'), el('span', { class: 'mono' }, n ? ui.tokens(n) + ' tokens' : 'sin dato')]),
          el('p', { class: 'det-fila' }, [el('span', { class: 'label' }, 'Ventana'), el('span', { class: 'mono' }, ui.tokens(v.n) + (v.estimada ? ' (supuesta)' : ' (Claude Code)'))]),
          el('p', { class: 'det-fila' }, [el('span', { class: 'label' }, 'Por categoría'), el('span', { class: 'mono' }, 'sin dato')]),
          el('p', { class: 'note' }, v.estimada ? 'La ventana del modelo se supone de 200 K hasta que Claude Code la informe al terminar un mensaje enviado desde Rastro. El reparto por categoría no está en el registro de la sesión.' : 'La ventana la informó Claude Code. El reparto por categoría no está en el registro de la sesión.')
        ])
      ]),
      el('div', { class: 'card-pie' }, [el('h2', { class: 'label', id: 't-det-contexto' }, 'Contexto'), el('span', { class: 'mono det-pie-dato' }, pct == null ? '' : pct + ' %')])
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

  /* Tareas en segundo plano: subagentes y órdenes que siguen tras devolver su resultado (las de js/tasks-pane.js).
     La tarjeta enseña las que siguen en curso y lleva al panel con su salida. */
  function pintarTareas(s) {
    const todas = RA.tareasPanel ? RA.tareasPanel.tareas(s) : [], curso = todas.filter(t => t.est === 'curso');
    ui.pintar($('#det-tareas'), [
      el('div', { class: 'esc det-esc' }, [
        curso.length ? el('ul', { class: 'det-lista', 'aria-label': 'Tareas en segundo plano en curso' }, curso.slice(0, 5).map(t => el('li', { class: 'det-tar-fila' }, [
          el('i', { class: 'est-pt curso', 'aria-hidden': 'true' }), el('span', { class: 'crece' }, [el('span', { class: 'sr' }, t.tipo + ': '), el('span', { class: 'mono det-ruta', title: t.nombre }, t.nombre)])
        ]))) : el('p', { class: 'note det-vacio' }, todas.length ? 'Nada en curso. ' + todas.length + (todas.length === 1 ? ' tarea terminada.' : ' tareas terminadas.') : 'Nada en segundo plano.'),
        todas.length ? el('button', { type: 'button', class: 'btn btn-small', id: 'det-tar-ver', onclick: () => RA.paneles && RA.paneles.abrir('tareas') }, 'Ver la salida de las tareas') : null
      ]),
      el('div', { class: 'card-pie' }, [el('h2', { class: 'label', id: 't-det-tar' }, 'Tareas en segundo plano'), curso.length ? el('span', { class: 'mono det-pie-dato' }, String(curso.length)) : null])
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
      [el('span', { class: 'sr' }, 'Remote Control: '), rc ? 'Sí' : 'No']);
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
        el('p', { class: 'det-fila' }, [el('span', { class: 'label' }, 'Dónde'), el('span', { class: 'mono det-donde', title: s.carpeta || '' }, 'Este equipo · ' + donde)]),
        el('p', { class: 'det-fila' }, [el('span', { class: 'label' }, 'Proceso'), el('span', { class: 'mono' }, s.vivo ? 'abierto' : 'cerrado')]),
        el('div', { class: 'det-fila' }, [el('span', { class: 'label', id: 'det-rc-l' }, 'Remote Control'), sw]),
        el('p', { class: 'note', id: 'det-rc-nota' }, motivo ? motivo : rc ? 'Puedes seguir y dirigir esta sesión desde claude.ai/code o la app del móvil.' : 'Enciéndelo para seguir esta sesión desde claude.ai/code o la app del móvil.')
      ]),
      el('div', { class: 'card-pie' }, el('h2', { class: 'label', id: 't-det-ent' }, 'Entorno'))
    ]);
  }

  function pintar() {
    if (!$('#det-contexto')) return;
    const s = RA.vistas && RA.vistas.actual();
    ['#det-contexto', '#det-entorno', '#det-github', '#det-conectores', '#det-tareas'].forEach(id => { $(id).hidden = !s; });
    if (!s) return;
    contexto(s);
    // Sin repintar el interruptor mientras está armado (segunda pulsación pendiente).
    if (!$('#det-rc.armed')) entorno(s);
    if (RA.github) RA.github.pintar(s);
    if (!$('#det-conectores').contains(document.activeElement)) pintarConectores(s);
    pintarTareas(s);
  }

  RA.detalles = { pintar: pintar, VENTANA_SUPUESTA: VENTANA_SUPUESTA };
  function montar() { D.alCambiar(pintar); document.addEventListener('rastro:vista', pintar); pintar(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar); else montar();
})(window.RA = window.RA || {});
