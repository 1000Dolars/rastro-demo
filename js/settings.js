/* Ajustes, como en Claude: los apartados a la izquierda y el elegido a la derecha (docs/AJUSTES-GAP.md).
   Cada ajuste que ya existía va a su apartado; lo que todavía no tiene una función real se ve desactivado con
   "Próximamente" (no se inventa nada). La tuerca de la cabecera se "desenrosca" al abrir: gira una vuelta y se
   desplaza, en 400 ms; con menos movimiento (o en modo juego) la vista solo aparece con un fundido. */
(function (RA) {
  'use strict';

  const ui = RA.ui, el = ui.el, $ = ui.$, D = RA.datos;
  const APARTADOS = [
    ['general', 'General'], ['cuenta', 'Cuenta'], ['uso', 'Uso'], ['privacidad', 'Privacidad'], ['capacidades', 'Capacidades'],
    ['conectores', 'Conectores'], ['skills', 'Skills'], ['plugins', 'Plugins'], ['claude-code', 'Claude Code'],
    ['economicas', 'IA económicas'], ['notificaciones', 'Notificaciones'], ['accesibilidad', 'Accesibilidad']
  ];
  const TEMAS = [['dark', 'Oscuro'], ['light', 'Claro'], ['auto', 'Automático']];
  let actual = 'general';
  try { const g = localStorage.getItem('rastro:ajustes-ap'); if (APARTADOS.some(a => a[0] === g)) actual = g; } catch (e) { /* sin almacenamiento */ }

  const fila = (nombre, ayuda, control) => el('li', {}, [el('div', { class: 'crece' }, [el('div', {}, nombre), ayuda ? el('div', { class: 'note' }, ayuda) : null]), control]);
  // Sin función real todavía: desactivado y con el motivo.
  const pronto = (nombre, ayuda) => el('li', { class: 'aj-pronto' }, [
    el('div', { class: 'crece' }, [el('div', {}, nombre), ayuda ? el('div', { class: 'note' }, ayuda) : null]),
    el('button', { type: 'button', class: 'btn btn-small', disabled: true, 'aria-label': nombre + ': próximamente', title: 'Todavía no hace nada en Rastro' }, 'Próximamente')
  ]);
  let n = 0;
  const grupo = (titulo, filas, nota) => { const id = 'aj-g-' + (++n); return el('section', { class: 'card aj-grupo', 'aria-labelledby': id }, [el('div', { class: 'esc' }, [el('ul', { class: 'lista' }, filas.filter(Boolean)), nota ? el('p', { class: 'note' }, nota) : null]), el('div', { class: 'card-pie' }, el('h3', { class: 'label', id: id }, titulo))]); };
  const sw = (clave, nombre, despues) => ui.interruptor(D.ajustes[clave], v => { D.guardar({ [clave]: v }); if (despues) despues(v); }, nombre);
  const seg = (id, opciones, valor, cambio, etiqueta) => { const c = el('div', { id: id }); const p = v => ui.segmentado(c, opciones, v, x => { cambio(x); p(x); }, etiqueta); p(valor); return c; };
  const boton = (id, texto, fn, o) => el('button', Object.assign({ type: 'button', class: 'btn btn-small', id: id, onclick: fn }, o || {}), texto);

  // ---------- Apartados ----------
  const PINTAR = {
    // Bloque A: lo que vivía en la cabecera (Leer métricas) y en la franja del pie (teclas propias).
    accesibilidad() {
      const tecla = (id, clave, que) => { const b = el('button', { type: 'button', id: id, class: 'key' }); RA.app.teclaCambiable(b, clave, que); return b; };
      return [grupo('Lectura y teclas', [
        fila('Leer métricas', 'Dice por la región de estado los agentes activos, las llamadas, los errores y el uso de la sesión elegida. También con la tecla de abajo.', boton('leer', 'Leer métricas', () => RA.app.leerMetricas())),
        fila('Tecla de las métricas', 'Pulsa el botón y luego la tecla nueva; Escape cancela.', tecla('tecla-leer', 'leer', 'dice las métricas')),
        fila('Tecla de la búsqueda (con Control)', 'Pulsa el botón y luego la letra nueva; Escape cancela.', tecla('tecla-buscar', 'buscar', 'abre la búsqueda con Control'))
      ])];
    },
    general() {
      const A = D.ajustes;
      return [
        grupo('Perfil', [
          pronto('Perfil', 'Tu nombre y tu foto. Claude Code los toma de tu cuenta de claude.ai; Rastro aún no los enseña.'),
          pronto('Instrucciones personalizadas', 'Indicaciones que irían en cada sesión. Mientras tanto, usa CLAUDE.md en tu proyecto.')
        ]),
        grupo('Apariencia', [
          pronto('Apariencia', 'Tamaño de letra y densidad. La estética de Rastro (negro, puntos y un rojo) no cambia.'),
          fila('Modo de color', 'Oscuro, claro o el del sistema. También con el botón del tema, abajo en la barra lateral.', seg('aj-tema', TEMAS, A.tema, v => RA.app.tema(v), 'Modo de color'))
        ]),
        grupo('Aplicación', [
          fila('Arrancar con ' + D.so.nombre(), 'Desactivado por defecto. Solo en la app instalada: se abre en la bandeja.', sw('inicioWindows', 'Arrancar con ' + D.so.nombre())),
          fila('Cerrar la ventana la oculta en la bandeja', 'La app sigue observando.', sw('cerrarABandeja', 'Cerrar la ventana la oculta en la bandeja')),
          fila('Estado del equipo', 'Comprueba Claude Code, tu sesión, la IA local, la carpeta de datos y los permisos, y dice qué hacer si algo falla.', boton('aj-diagnostico', 'Comprobar el estado del equipo', () => RA.vistas.diagnostico())),
          fila('Guía rápida', 'Cinco pasos para empezar: qué es Rastro, dónde están las sesiones, cómo enviar un mensaje y qué es el Consumo.', boton('aj-guia', 'Ver la guía de nuevo', () => RA.app.guia())),
          fila('Atajos de teclado', 'La lista completa, también con Ctrl+/.', boton('aj-atajos', 'Ver los atajos de teclado', () => RA.atajos && RA.atajos.abrir()))
        ]),
        fija('t-glos')
      ];
    },
    cuenta() {
      const a = D.auth;
      return [grupo('Cuenta de Claude', [
        fila('Suscripción', a ? (a.ok ? 'Rastro usa el CLI oficial de Claude Code con tu suscripción de claude.ai, nunca una clave de API.' : 'Bloqueada: ' + (a.motivo || 'revisa tu cuenta.')) : 'Todavía sin comprobar.', el('span', { class: 'badge' + (a && !a.ok ? ' alerta' : '') }, ui.corchetes(!a ? 'Sin comprobar' : a.ok ? 'Suscripción' : 'Bloqueada'))),
        fila('Comprobar la cuenta y el equipo', 'Claude Code, la sesión iniciada y la carpeta de datos.', boton('aj-cuenta-diag', 'Comprobar el estado del equipo', () => RA.vistas.diagnostico())),
        pronto('Cerrar sesión', 'La sesión de Claude Code se cierra con "claude auth logout" en una terminal; Rastro no guarda credenciales.')
      ]), grupo('GitHub', [
        fila('Sesión de gh', 'Rastro usa la sesión de la CLI de GitHub (gh) que ya tengas iniciada; no guarda tokens.', el('span', { id: 'aj-gh', class: 'mono note' }, 'se comprueba al clonar o crear un repositorio'))
      ])];
    },
    uso() {
      return [grupo('Uso de tu plan', [
        fila('Consumo y estadísticas', 'Cuánto llevas usado de tu plan (estimado salvo que lo midas), por modelo y por sesión.', boton('aj-ver-consumo', 'Ver el consumo', () => RA.app.ir('consumo'))),
        fila('Estadísticas', 'Actividad, ritmo, herramientas y archivos de todas las sesiones.', boton('aj-ver-est', 'Ver las estadísticas', () => RA.app.ir('estadisticas')))
      ])];
    },
    privacidad() {
      return [grupo('Lo que guarda Rastro', [
        fila('Claves y tokens', 'Rastro no guarda tokens de Claude ni de GitHub: usa la sesión del CLI de Claude Code y la de gh. Las claves de las IA económicas se cifran con el sistema y no vuelven a la interfaz.', el('span', { class: 'badge' }, ui.corchetes('Sin tokens'))),
        fila('Registros de Claude Code', 'Rastro los lee; no los cambia ni los borra.', el('span', { class: 'badge' }, ui.corchetes('Solo lectura')))
      ]), fija('t-datos')];
    },
    capacidades() {
      return [grupo('Capacidades', [
        pronto('Uso del ordenador', 'Que Claude maneje el ratón y el teclado. Claude Code lo ofrece en macOS y Windows; Rastro aún no lo conecta.'),
        pronto('Herramientas del navegador', 'Que Claude verifique sus cambios en el panel Navegador. Hoy el panel solo enseña localhost.')
      ])];
    },
    conectores() {
      const s = RA.vistas && RA.vistas.actual();
      return [grupo('Conectores (MCP)', [
        fila('Dónde se configuran', 'En Claude Code: ~/.claude.json y el .mcp.json de cada proyecto. Rastro los lee (solo el nombre y el tipo) y enseña su estado en el panel de la sesión.', boton('aj-mcp', 'Abrir /mcp en la Terminal', () => {
          if (!RA.consola || !RA.consola.ejecutar || !D.consola) return ui.decir('/mcp se abre en la Terminal, que solo funciona en la app de escritorio.', 'atencion');
          RA.consola.ejecutar('claude /mcp');
        })),
        fila('Sesión elegida', s ? s.nombre + ': sus conectores están en la tarjeta Conectores del panel de la sesión.' : 'Elige una sesión para ver sus conectores.', s ? boton('aj-ver-con', 'Ver los conectores de la sesión', () => { RA.app.ir('chat'); const c = $('#det-conectores'); if (c) c.scrollIntoView({ block: 'center' }); }) : null)
      ])];
    },
    skills() {
      return [grupo('Skills', [
        fila('Usar primero tus skills', 'Las skills son instrucciones guardadas para tareas concretas. Las sesiones que lanza o reanuda Rastro reciben un aviso en su prompt de sistema para cargar antes las skills que encajen con lo pedido. No afecta a tus sesiones fuera de la app.', sw('skillsPrimero', 'Buscar skills primero')),
        fila('Skills instaladas', 'Están instaladas a nivel de usuario; la lista revisada y sus licencias están en docs/SKILLS.md. Rastro no las instala ni las cambia.', el('span', { class: 'badge' }, ui.corchetes('Usuario')))
      ])];
    },
    plugins() {
      return [grupo('Plugins', [pronto('Plugins de Claude Code', 'Instalar y activar plugins desde Rastro. Hoy se gestionan con "claude plugin" en una terminal.')])];
    },
    'claude-code'() {
      const A = D.ajustes, L = RA.logica;
      const mShell = D.shells && D.shells.length ? D.shells.map(x => [x.id, x.nombre]) : (D.so.win() ? [['powershell', 'Windows PowerShell'], ['pwsh', 'PowerShell 7'], ['cmd', 'Símbolo del sistema']] : [['sistema', 'Mi intérprete'], ['bash', 'Bash']]);
      const prefijo = el('input', { id: 'aj-prefijo', class: 'input', type: 'text', value: A.prefijoRama || 'rastro/', maxlength: '40', spellcheck: 'false', 'aria-label': 'Prefijo de rama',
        onchange: e => { const v = e.target.value.trim(); if (!/^[A-Za-z0-9._/-]{0,40}$/.test(v) || /\.\.|\/\/|^\//.test(v)) { ui.decir('El prefijo solo admite letras sin tilde, números, punto, guion, guion bajo y barra.', 'atencion'); e.target.value = A.prefijoRama || 'rastro/'; return; } D.guardar({ prefijoRama: v }); ui.decir('Prefijo de rama: ' + (v || 'ninguno') + '.', 'ok'); } });
      const raiz = el('input', { id: 'raiz', class: 'input', type: 'text', value: A.raiz, 'aria-label': 'Ubicación de los proyectos nuevos', spellcheck: 'false', onchange: ev => D.guardar({ raiz: ev.target.value.trim() || A.raiz }) });
      const cave = seg('aj-caveman', [['', 'No'], ['caveman', 'caveman'], ['ultracave', 'ultracave'], ['megacave', 'megacave']], (A.caveman && A.caveman.global) || '', v => { D.guardar({ caveman: Object.assign({}, A.caveman, { global: v || null }) }); if (RA.chat && RA.chat.caveman) RA.chat.caveman(); }, 'Nivel de caveman');
      return [
        grupo('Sesiones', [
          fila('Permisos por defecto', 'El modo con el que empieza una sesión nueva. Se puede cambiar en cada sesión con el selector de modo.', seg('aj-permisos', L.MODOS.map(m => [m.id, m.nombre]), A.permisosDefecto || 'default', v => D.guardar({ permisosDefecto: v }), 'Permisos por defecto')),
          fila('Auto-archivar tras fusionar o cerrar el PR', 'Cuando la tarjeta GitHub ve que el pull request de la sesión se fusionó o se cerró, la sesión pasa a Archivadas (se puede desarchivar).', sw('autoArchivar', 'Auto-archivar tras fusionar o cerrar el PR')),
          pronto('Sugerencias de prompt', 'Proponer el siguiente mensaje al terminar un turno.'),
          fila('Vista de transcripción', 'La vista con la que se abre la conversación. Ctrl+O la cambia en cada momento.', seg('aj-vista', [['normal', 'Normal'], ['pensamiento', 'Pensamiento'], ['detallado', 'Detallado']], A.vistaTrans || 'normal', v => { D.guardar({ vistaTrans: v }); if (RA.conversacion) RA.conversacion.poner(v); }, 'Vista de transcripción')),
          fila('Prefijo de rama', 'Para las ramas de las sesiones con Worktree (por ejemplo rastro/mi-tarea).', prefijo),
          fila('Ubicación de los proyectos nuevos', 'Carpeta raíz de "Carpeta nueva" en la sesión nueva.', raiz)
        ]),
        grupo('Mensajes', [
          fila('Ver un resumen antes de enviar', 'Antes de mandar un mensaje enseña a dónde irá, con qué modelo, su tamaño y el coste aproximado. Se confirma con Enter.', sw('previa', 'Ver un resumen antes de enviar')),
          fila('Modo caveman', 'Respuestas breves y telegráficas en las sesiones que lanza Rastro, con cualquier modelo. Va en el prompt de sistema: tu mensaje no cambia, y el código, las rutas, los errores y los avisos de seguridad no se comprimen.', cave),
          fila('Modelo del resumen de cierre', 'El que escribe el resumen de cada mensaje y de cada sesión. Los de diseño y de código se eligen al crear una sesión.', seg('aj-modelo-resumen', D.MODELOS, A.modelos.resumen, v => D.guardar({ modelos: Object.assign({}, D.ajustes.modelos, { resumen: v }) }), 'Modelo del resumen de cierre'))
        ]),
        grupo('Desarrollador', [
          fila('Mostrar opciones avanzadas', 'Enseña los controles técnicos: modos de permiso del asistente, cuotas, parámetros de la IA local y el reparto automático.', ui.interruptor(A.avanzado, v => RA.app.avanzado(v), 'Mostrar opciones avanzadas')),
          fila('Intérprete de la consola', 'Para las terminales nuevas.', seg('aj-shell', mShell, A.shell, v => D.guardar({ shell: v }), 'Intérprete de la consola'))
        ])
      ];
    },
    economicas() {
      return [grupo('Proveedores', [
        fila('En tu equipo', 'Ollama, LM Studio, llama.cpp y vLLM: modelos que corren en tu GPU, sin coste y sin enviar nada fuera.', el('span', { class: 'badge' }, ui.corchetes('Local'))),
        fila('En la nube', 'OpenRouter (modelos :free) y los demás gratuitos que tengas configurados. Solo con proyectos permitidos en nube.', el('span', { class: 'badge' }, ui.corchetes('Gratis')))
      ]), RA.ollamaPrueba ? RA.ollamaPrueba.tarjeta() : null, $('#aj-asistentes')];
    },
    notificaciones() {
      const A = D.ajustes;
      return [grupo('Sonido y avisos', [
        fila('Silenciar todos los sonidos', 'Cada sonido va siempre con su insignia y una frase para el lector de pantalla.', sw('silencio', 'Silenciar el sonido')),
        fila('Resumen al terminar cada mensaje', 'Una tarjeta con lo que hizo Claude, los archivos que tocó y el tiempo. Se cierra con Esc o con Cerrar.', ui.interruptor(A.popupResumen !== false, v => D.guardar({ popupResumen: v }), 'Resumen al terminar cada mensaje')),
        el('li', { class: 'eventos' }, [
          el('div', { class: 'crece' }, [el('div', {}, 'Sonido y notificación por evento'), el('div', { class: 'note' }, 'Las notificaciones las genera Rastro, sin sonido del sistema.')]),
          el('table', { class: 'table densa', id: 'aj-eventos' }, [
            el('thead', {}, el('tr', {}, ['Evento', 'Sonido', 'Notificación', 'Volumen', ''].map(t => el('th', { scope: 'col' }, t)))),
            el('tbody', {}, [['fin', 'Terminó'], ['error', 'Falló'], ['atencion', 'Necesita atención']].map(ev => {
              const e = RA.sonido.conf(ev[0]), guarda = (k, v) => { const todos = Object.assign({}, D.ajustes.eventos); todos[ev[0]] = Object.assign({}, RA.sonido.conf(ev[0]), { [k]: v }); D.guardar({ eventos: todos }); };
              return el('tr', {}, [
                el('th', { scope: 'row' }, ev[1]),
                el('td', {}, ui.interruptor(e.sonido, v => guarda('sonido', v), 'Sonido al ' + ev[1].toLowerCase())),
                el('td', {}, ui.interruptor(e.notif, v => guarda('notif', v), 'Notificación al ' + ev[1].toLowerCase())),
                el('td', {}, el('input', { type: 'range', min: '0', max: '1', step: '0.1', value: String(e.vol), id: 'vol-' + ev[0], 'aria-label': 'Volumen de ' + ev[1].toLowerCase(), onchange: x => guarda('vol', +x.target.value) })),
                el('td', {}, el('button', { type: 'button', class: 'btn btn-small', id: 'probar-' + ev[0], onclick: () => RA.sonido.tocar(true, ev[0]) }, 'Probar'))
              ]);
            }))
          ])
        ])
      ])];
    }
  };
  // Tarjetas fijas del HTML (Datos y respaldo, Glosario): se mueven a su apartado, con sus botones ya cableados.
  const fija = idTitulo => { const t = document.getElementById(idTitulo); return t ? t.closest('section') : null; };

  function pintarNav() {
    ui.pintar($('#aj-nav'), el('ul', { class: 'aj-nav-l' }, APARTADOS.map(([id, nombre]) => el('li', {}, el('button', { type: 'button', 'data-ap': id, 'aria-current': id === actual ? 'page' : null, onclick: () => ir(id, true) }, nombre)))));
  }
  function pintar() {
    if (!$('#aj-contenido')) return;
    // Lo fijo vuelve a su caja antes de repintar, para no perderlo.
    const fijas = $('#aj-fijas');
    ['t-datos', 't-glos'].forEach(t => { const c = fija(t); if (c && !fijas.contains(c)) fijas.appendChild(c); });
    const as = $('#aj-asistentes'); if (as && as.parentElement !== $('#ajustes')) $('#ajustes').appendChild(as);
    as.hidden = actual !== 'economicas';
    pintarNav();
    $('#aj-titulo').textContent = APARTADOS.find(a => a[0] === actual)[1];
    ui.pintar($('#aj-contenido'), (PINTAR[actual]() || []).filter(Boolean));
    if (RA.asistentes && RA.asistentes.mostrar) RA.asistentes.mostrar(actual === 'economicas');
  }
  function ir(id, foco) {
    if (!APARTADOS.some(a => a[0] === id)) return;
    actual = id;
    try { localStorage.setItem('rastro:ajustes-ap', id); } catch (e) { /* sin almacenamiento */ }
    pintar();
    if (foco) { const b = $('#aj-nav [data-ap="' + id + '"]'); if (b) b.focus(); ui.decir('Ajustes: ' + APARTADOS.find(a => a[0] === id)[1] + '.', { toast: false }); }
  }
  // Flechas arriba y abajo entre apartados (además de Tab).
  document.addEventListener('keydown', e => {
    const b = e.target && e.target.closest && e.target.closest('#aj-nav button');
    if (!b || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
    e.preventDefault();
    const i = APARTADOS.findIndex(a => a[0] === b.dataset.ap), j = (i + (e.key === 'ArrowDown' ? 1 : APARTADOS.length - 1)) % APARTADOS.length;
    ir(APARTADOS[j][0], true);
  });

  // ---------- La tuerca: se desenrosca al abrir Ajustes ----------
  const quieto = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('modo-juego');
  function abrir() {
    const btn = $('#ajustes-btn'), ico = btn && btn.querySelector('svg'), vista = $('#v-ajustes');
    RA.app.ir('ajustes');
    if (quieto()) { if (vista.animate) vista.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'linear' }); return 'fundido'; }
    if (ico && ico.animate) ico.animate([
      { transform: 'translate(0, 0) rotate(0deg)' },
      { transform: 'translate(3px, -3px) rotate(-300deg)', offset: 0.75 },
      { transform: 'translate(0, 0) rotate(-360deg)' }
    ], { duration: 400, easing: 'cubic-bezier(.2,.7,.2,1)' });
    if (vista.animate) vista.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 240, delay: 80, easing: 'ease-out', fill: 'backwards' });
    return 'tuerca';
  }

  document.addEventListener('rastro:vista', e => { if (e.detail === 'ajustes') pintar(); });
  RA.ajustes = { abrir: abrir, ir: ir, actual: () => actual, APARTADOS: APARTADOS, pintar: pintar };
})(window.RA = window.RA || {});
