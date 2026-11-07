/* Interfaz de los asistentes (Fase 3, G9 y G8): la página Asistentes de Ajustes, la vista Orquestación
   de Uso, los parches pendientes de Cambios (con la segunda opinión) y lo que llega en vivo (tareas
   baratas, descargas, autoevaluación). Las claves se escriben aquí pero no vuelven nunca: la interfaz
   solo sabe si están puestas. Fuera de la app (maqueta) todo esto dice que hace falta la app. */
(function (RA) {
  'use strict';
  const enCambios = () => RA.paneles ? RA.paneles.visible('cambios') : (RA.app ? RA.app.sel : {}).vista === 'cambios';

  const ui = RA.ui, el = ui.el, $ = ui.$, D = RA.datos;
  const P = window.rastro;
  let estado = null, sub = 'general', descarga = null, parches = [], tareas = {};
  const pide = (f, ...a) => P && P[f] ? P[f](...a).catch(() => ({ error: 'La orden no se pudo ejecutar.' })) : Promise.resolve({ error: 'Solo en la app de escritorio.' });
  const MB = n => n == null ? '?' : n >= 1e9 ? (n / 1073741824).toFixed(1).replace('.', ',') + ' GB' : Math.round(n / 1048576) + ' MB';
  const sw = (valor, nombre, cambio) => ui.interruptor(valor, cambio, nombre);
  const fila = (nombre, ayuda, control) => el('li', {}, [el('div', { class: 'crece' }, [el('div', {}, nombre), ayuda ? el('div', { class: 'note' }, ayuda) : null]), control]);
  const msg = (r, bien) => ui.decir(r && r.error ? r.error : bien);
  async function guardar(c, bien) { const r = await pide('asistentesGuardar', c); msg(r, bien || 'Guardado.'); await recargar(); return r; }
  async function recargar(hw) { estado = await pide('asistentesEstado', !!hw); if (sub === 'asistentes' && (RA.app ? RA.app.sel : {}).vista === 'ajustes') pintarAjustes(); return estado; }

  // =====================================================================================
  // Ajustes > Asistentes
  // =====================================================================================
  // Ajustes › IA económicas (js/settings.js): al entrar se pinta y se recarga con el hardware; al salir, se deja.
  function mostrar(si) {
    sub = si ? 'asistentes' : 'general';
    if (!si) return;
    pintarAjustes();
    recargar(true);
  }

  function pintarAjustes() {
    const caja = $('#aj-asistentes');
    if (!P) return ui.pintar(caja, ui.tarjeta('Asistentes', el('p', { class: 'note' }, 'Los asistentes solo funcionan en la app de escritorio.')));
    if (!estado) return ui.pintar(caja, el('p', { class: 'label' }, 'Cargando'));
    if (estado.error) return ui.pintar(caja, el('p', {}, el('span', { class: 'mal' }, estado.error)));
    const E = estado, C = E.config, foco = document.activeElement && document.activeElement.id;
    ui.pintar(caja, [orquestador(E, C), local(E, C)].concat(RA.fase4 ? RA.fase4.tarjetas() : [], [nube(E, C), openrouter(E, C), optimizador(C), proyectos(E), auxiliares(E, C)]));
    if (foco && $('#' + foco)) $('#' + foco).focus();
  }

  function orquestador(E, C) {
    const tipos = el('div', { class: 'badges', role: 'group', 'aria-label': 'Tareas elegibles para modelos baratos' }, E.elegiblesTodos.map(t => el('button', { type: 'button', class: 'btn btn-small', 'aria-pressed': String(C.elegibles.indexOf(t.id) >= 0), onclick: () => { const l = C.elegibles.indexOf(t.id) >= 0 ? C.elegibles.filter(x => x !== t.id) : C.elegibles.concat(t.id); guardar({ elegibles: l }); } }, t.nombre)));
    const umbral = el('input', { id: 'as-umbral', class: 'input', type: 'number', min: '0', max: '1', step: '0.05', value: String(C.umbral), 'aria-label': 'Confianza mínima', onchange: e => guardar({ umbral: +e.target.value }) });
    return ui.tarjeta('Orquestador', el('ul', { class: 'lista' }, [
      fila('Orquestador', 'Apagado, todo va a Claude Code como siempre. Encendido, cada prompt del panel pasa por las reglas y el clasificador local: las tareas pequeñas van a un modelo barato, en una copia aislada y con tu aprobación.', sw(C.orquestador, 'Orquestador', v => guardar({ orquestador: v }, v ? 'Orquestador encendido.' : 'Orquestador apagado: todo va a Claude.'))),
      fila('Confianza mínima del clasificador', 'Por debajo, gana Claude.', umbral),
      el('li', { class: 'col' }, [el('div', {}, 'Tareas elegibles para modelos baratos'), tipos, el('p', { class: 'note' }, 'Los límites gratuitos no admiten contextos grandes: Rastro envía como mucho unos 48 000 caracteres por tarea.')]),
      fila('Destino barato en la nube', 'Si no hay modelo local, o en modo juego: solo con proyectos permitidos en nube.', select('as-nube', [['', 'Ninguno']].concat(E.nube.filter(p => C.proveedores[p] && C.proveedores[p].activo).map(p => [p, E.nombres[p]])), C.nube.prov, v => guardar({ nubeDestino: { prov: v } })))
    ]), { id: 't-as-orq' });
  }
  function select(id, opciones, valor, cambio) {
    const s = el('select', { id: id, class: 'select', onchange: e => cambio(e.target.value) }, opciones.map(o => el('option', { value: o[0] }, o[1])));
    s.value = valor || ''; return s;
  }

  function local(E, C) {
    const O = E.ollama, H = E.hardware, inst = O.modelos;
    const hw = H ? el('p', { class: 'mono' }, [(H.gpu ? H.gpu.nombre + ' · ' + MB(H.gpu.totalMB * 1048576) + ' de VRAM (' + MB(H.gpu.usadaMB * 1048576) + ' en uso)' : 'Sin GPU NVIDIA detectada') + ' · ' + H.cpu + ' · ' + H.hilos + ' hilos · ' + String(H.ramGB).replace('.', ',') + ' GB de RAM']) : null;
    const modelo = select('as-local', [['', 'Ninguno']].concat(inst.map(m => [m.nombre, m.nombre + ' · ' + MB(m.tam) + (m.capacidades.indexOf('thinking') >= 0 ? ' · razona' : '')])), C.local.modelo, v => guardar({ local: { modelo: v } }));
    const rec = el('div', { id: 'as-rec', class: 'col' }, el('button', { type: 'button', class: 'btn btn-small', id: 'as-recomendar', onclick: recomendar }, 'Recomendar modelos para este equipo'));
    return ui.tarjeta('Modelo local (Ollama)', [
      el('div', { class: 'badges' }, [ui.insignia(O.enMarcha ? 'En marcha · ' + O.version : O.instalado ? 'Instalado, sin abrir' : 'No instalado', O.enMarcha ? '' : 'alerta'), ui.insignia('Local: nada sale del equipo')]),
      hw,
      el('ul', { class: 'lista' }, [
        fila('Modelo local activo', 'Para clasificar, optimizar, resumir y las tareas de código baratas.', modelo),
        fila('Cargados ahora', null, el('span', { class: 'mono' }, O.cargados.length ? O.cargados.map(m => m.nombre + ' (' + MB(m.vram) + ' en VRAM)').join(', ') : 'ninguno')),
        fila('Probar conexión', null, el('button', { type: 'button', class: 'btn btn-small', onclick: () => pide('asistentesProbar', 'ollama').then(r => msg(r, r.texto)) }, 'Probar'))
      ]),
      rec,
      descarga ? el('p', { class: 'mono', role: 'status' }, 'Descargando ' + descarga.nombre + ': ' + (descarga.total ? Math.round(100 * descarga.hecho / descarga.total) + ' % de ' + MB(descarga.total) : descarga.estado || '…')) : null
    ], { id: 't-as-local' });
  }
  async function recomendar() {
    const caja = $('#as-rec');
    ui.pintar(caja, el('p', { class: 'label' }, 'Calculando'));
    const r = await pide('asistentesRecomendar');
    if (r.error) return ui.pintar(caja, el('p', {}, el('span', { class: 'mal' }, r.error)));
    ui.pintar(caja, [
      el('p', { class: 'note' }, 'Tope de VRAM: ' + MB(r.tope * 1048576) + '. Las huellas son estimaciones (pesos + caché de contexto).'),
      el('ul', { class: 'lista' }, r.lista.map(m => el('li', {}, [
        el('div', { class: 'crece col' }, [el('span', { class: 'mono' }, m.nombre + ' · ' + MB(m.tam) + (m.instalado ? ' · instalado' : '')), el('span', { class: 'note' }, m.porque), el('span', { class: 'note' }, m.cabe ? 'Cabe con ' + Math.round(m.contexto / 1024) + 'K de contexto (huella ' + MB(m.huella) + '; hasta ' + Math.round(m.contextoMax / 1024) + 'K)' : 'No cabe en el tope de VRAM con un contexto útil.')]),
        m.cabe ? ui.insignia('Recomendado') : ui.insignia('No cabe', 'alerta'),
        !m.instalado && m.cabe ? ui.armar(el('button', { type: 'button', class: 'btn btn-small', 'data-descargar': m.nombre }, 'Descargar ' + MB(m.tam)), '¿Descargar ' + MB(m.tam) + '?', () => { descarga = { nombre: m.nombre }; pide('asistentesDescargar', m.nombre).then(x => msg(x, m.nombre + ' descargado.')); pintarAjustes(); }) : null
      ])))
    ]);
  }

  function nube(E, C) {
    return ui.tarjeta('Proveedores en la nube (gratuitos)', [
      el('p', { class: 'note' }, 'Todos apagados por defecto: solo funcionan con tu clave, que se guarda cifrada con el almacenamiento seguro ' + (D.so.win() ? 'de Windows' : 'del sistema (KWallet o GNOME Keyring)') + ' y no vuelve a la interfaz. Cerebras no está: ya no tiene un nivel gratuito utilizable (solo un crédito único que caduca a los 30 días).'),
      el('ul', { class: 'lista' }, E.nube.map(p => {
        const activo = C.proveedores[p] && C.proveedores[p].activo, q = E.cuotas[p] || {}, clave = el('input', { id: 'as-clave-' + p, class: 'input', type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: E.claves[p] ? 'Clave puesta (no se enseña)' : 'Pega aquí tu clave', 'aria-label': 'Clave de ' + E.nombres[p] });
        const lim = (C.limites || {})[p] || {};
        return el('li', { class: 'col prov' }, [
          el('div', { class: 'row between' }, [el('span', {}, E.nombres[p]), el('div', { class: 'badges' }, [ui.insignia(activo ? 'Activo' : 'Apagado'), E.claves[p] ? ui.insignia('Clave puesta') : null, C.proveedores[p] && C.proveedores[p].motivo ? ui.insignia('Desactivado por la app', 'alerta') : null])]),
          el('p', { class: 'note' }, 'Privacidad: ' + E.etiquetas[p].etiqueta),
          C.proveedores[p] && C.proveedores[p].motivo ? el('p', {}, el('span', { class: 'mal' }, C.proveedores[p].motivo)) : null,
          el('div', { class: 'ruta-campo' }, [clave,
            el('button', { type: 'button', class: 'btn btn-small', onclick: () => { const k = clave.value; clave.value = ''; pide('asistentesClave', p, k).then(r => { msg(r, 'Clave guardada.'); recargar(); }); } }, 'Guardar clave'),
            E.claves[p] ? ui.armar(el('button', { type: 'button', class: 'btn btn-small' }, 'Quitar clave'), '¿Quitar?', () => pide('asistentesQuitarClave', p).then(r => { msg(r, 'Clave quitada.'); recargar(); })) : null]),
          el('div', { class: 'row' }, [
            ui.interruptor(activo, v => guardar({ activar: { prov: p, activo: v } }, v ? E.nombres[p] + ' activado.' : E.nombres[p] + ' apagado.'), 'Activar ' + E.nombres[p]),
            el('input', { class: 'input modelo', type: 'text', value: C.modelos[p] || '', 'aria-label': 'Modelo de ' + E.nombres[p], placeholder: 'modelo', spellcheck: 'false', onchange: e => guardar({ modelo: { prov: p, modelo: e.target.value } }) }),
            el('button', { type: 'button', class: 'btn btn-small', onclick: () => pide('asistentesProbar', p).then(r => { msg(r, r.texto); recargar(); }) }, 'Probar conexión'),
            p === 'opencodezen' ? el('button', { type: 'button', class: 'btn btn-small', onclick: () => pide('asistentesZen').then(r => ui.decir(r.error || ('Free sin saldo: ' + (r.funcionaSinSaldo ? 'sí' : 'no') + '. ' + r.detalle + (r.modelosFree.length ? ' Modelos Free: ' + r.modelosFree.join(', ') : '')))) }, '¿Free sin saldo?') : null
          ]),
          el('p', { class: 'mono' }, 'Cuota de hoy: ' + q.usados + ' usadas' + (q.limite ? ' de ' + q.limite : '') + (q.restante != null ? ' · quedan ' + q.restante : ' · límite desconocido') + (q.reservados ? ' · ' + q.reservados + ' reservadas' : '') + (q.hasta ? ' · en espera hasta ' + ui.hora(q.hasta) : '') + ' (estimado)'),
          p !== 'openrouter' && p !== 'groq' ? el('div', { class: 'row' }, [el('span', { class: 'note' }, 'Límites de tu cuenta (su API no los informa):'),
            el('input', { class: 'input num', type: 'number', min: '0', value: lim.rpd || '', placeholder: 'por día', 'aria-label': 'Peticiones por día de ' + E.nombres[p], onchange: e => guardar({ limite: { prov: p, rpd: e.target.value, rpm: lim.rpm } }) }),
            el('input', { class: 'input num', type: 'number', min: '0', value: lim.rpm || '', placeholder: 'por minuto', 'aria-label': 'Peticiones por minuto de ' + E.nombres[p], onchange: e => guardar({ limite: { prov: p, rpd: lim.rpd, rpm: e.target.value } }) })]) : null
        ]);
      }))
    ], { id: 't-as-nube' });
  }

  function openrouter(E, C) {
    const K = E.catalogo, rank = {};
    E.ranking.forEach(m => { rank[m.prov + '|' + m.modelo] = m; });
    return ui.tarjeta('Catálogo gratuito de OpenRouter', [
      el('p', { class: 'note' }, 'Solo modelos ":free" (y el router "openrouter/free" como último recurso, para tareas no críticas). Antes de cada petición, una única función comprueba que el modelo sigue siendo gratuito; si una respuesta indica cobro o falta de crédito, OpenRouter se desactiva al momento. Al crear tu clave en OpenRouter, si el formulario permite un límite de crédito, ponlo en 0.'),
      el('div', { class: 'row' }, [
        el('button', { type: 'button', class: 'btn btn-small', id: 'as-catalogo', onclick: () => pide('asistentesCatalogo').then(r => { msg(r, 'Catálogo actualizado: ' + (r.modelos || []).length + ' modelos gratuitos aptos.'); recargar(); }) }, 'Actualizar catálogo'),
        el('button', { type: 'button', class: 'btn btn-small', id: 'as-reevaluar', disabled: E.autoevalEnCurso, onclick: () => { ui.decir('Autoevaluación en marcha.'); pide('asistentesAutoeval').then(r => { ui.decir(r.error || ('Autoevaluación: ' + (r.hechas || 0) + ' pruebas.' + (r.pospuestos && r.pospuestos.length ? ' Pospuesto: ' + r.pospuestos[0].motivo : ''))); recargar(); }); } }, E.autoevalEnCurso ? 'Evaluando' : 'Reevaluar'),
        el('span', { class: 'note' }, K.t ? 'Descargado a las ' + ui.hora(K.t) : 'Aún no descargado')
      ]),
      K.descartados && K.descartados.length ? el('p', { class: 'note' }, 'Descartados de la lista semilla: ' + K.descartados.map(d => d.id + ' (' + d.motivo + ')').join('; ') + '.') : null,
      el('div', { class: 'table-wrap' }, ui.tabla(['Modelo', ['Contexto', 'num'], 'Ranking', ['Latencia', 'num'], 'Privacidad'], K.modelos.map(m => {
        const r = rank['openrouter|' + m.id];
        return [el('span', { class: 'mono' }, m.id), Math.round(m.contexto / 1000) + 'K', r ? (r.estable ? 'Estable' : 'Inestable') + ' · ' + r.ok + '/' + r.pruebas : 'Sin evaluar', r && r.pruebas ? ui.dur(r.ms / r.pruebas) : '—', el('span', { class: 'note' }, m.id === 'openrouter/free' ? 'Aleatorio: sin garantía de privacidad documentada' : m.etiqueta)];
      }))),
      el('ul', { class: 'lista' }, [
        fila('Contexto mínimo', 'Tokens; los modelos con menos no se usan.', el('input', { class: 'input num', type: 'number', min: '1000', step: '1000', value: String(C.contextoMin), 'aria-label': 'Contexto mínimo', onchange: e => guardar({ contextoMin: +e.target.value }) })),
        fila('Autoevaluación: porcentaje de la cuota diaria restante', 'Nunca gasta más; se hace por tandas y se pospone si la cuota es baja.', el('input', { class: 'input num', type: 'number', min: '0', max: '100', value: String(C.autoeval.pct), 'aria-label': 'Porcentaje de cuota para la autoevaluación', onchange: e => guardar({ autoeval: { pct: +e.target.value, minimo: C.autoeval.minimo } }) })),
        fila('Cuota mínima que la autoevaluación manual no puede tocar', null, el('input', { class: 'input num', type: 'number', min: '0', value: String(C.autoeval.minimo), 'aria-label': 'Cuota mínima', onchange: e => guardar({ autoeval: { pct: C.autoeval.pct, minimo: +e.target.value } }) })),
        fila('Router "openrouter/free" como último recurso', 'Elige un modelo gratuito al azar; Rastro registra cuál respondió.', sw(C.routerUltimoRecurso, 'Router como último recurso', v => guardar({ routerUltimoRecurso: v })))
      ]),
      E.intentos.length ? el('details', {}, [el('summary', { class: 'label' }, 'Envíos bloqueados (' + E.intentos.length + ')'), el('ul', { class: 'lista' }, E.intentos.slice().reverse().map(x => el('li', {}, [el('span', { class: 'n' }, ui.hora(x.t)), el('span', { class: 'mono' }, x.prov + ' · ' + x.modelo), el('span', { class: 'note crece' }, x.motivo)])))]) : null
    ], { id: 't-as-or' });
  }

  function optimizador(C) {
    const O = C.optimizador, modo = el('div', { id: 'as-opt-modo' });
    ui.segmentado(modo, [['apagado', 'Apagado'], ['sugerir', 'Sugerir'], ['automatico', 'Automático']], O.modo, v => guardar({ optimizador: Object.assign({}, O, { modo: v }) }), 'Modo del optimizador');
    return ui.tarjeta('Optimizador de prompts', el('ul', { class: 'lista' }, [
      fila('Modo', 'Sugerir enseña original y refinada lado a lado; automático usa la refinada. Nunca añade ni quita requisitos, y si altera una ruta, código o un texto entre comillas se usa la original.', modo),
      fila('Traducir al inglés', 'Aparte del refinado; apagado por defecto.', sw(O.traducir, 'Traducir al inglés', v => guardar({ optimizador: Object.assign({}, O, { traducir: v }) }))),
      fila('Tiempo límite', 'Milisegundos; si se pasa, se envía la original.', el('input', { class: 'input num', type: 'number', min: '1000', step: '500', value: String(O.ms), 'aria-label': 'Tiempo límite del optimizador', onchange: e => guardar({ optimizador: Object.assign({}, O, { ms: +e.target.value }) }) }))
    ]), { id: 't-as-opt' });
  }

  function proyectos(E) {
    return ui.tarjeta('Proyectos permitidos en nube', [
      el('p', { class: 'note' }, 'Sin este permiso, ningún contenido de archivos ni código de un proyecto sale del equipo: solo modelos locales. "Proveedores que entrenan" deja enviar código a modelos que no declaran retención cero (Gemini gratis, Mistral Experiment, algunos de OpenCode Zen, el router aleatorio).'),
      E.proyectos.length ? el('ul', { class: 'lista' }, E.proyectos.map(p => el('li', {}, [
        el('span', { class: 'crece mono' }, ui.ruta(p.ruta)),
        ui.interruptor(p.nube, v => guardar({ proyecto: { ruta: p.ruta, nube: v, entrenan: v && p.entrenan } }), 'Permitido en nube: ' + p.ruta),
        ui.interruptor(p.entrenan, v => guardar({ proyecto: { ruta: p.ruta, nube: p.nube, entrenan: v } }), 'Proveedores que entrenan: ' + p.ruta)
      ]))) : el('p', { class: 'note' }, 'Sin proyectos todavía.')
    ], { id: 't-as-proy' });
  }

  function auxiliares(E, C) {
    const opts = [['ollama', 'Ollama (local)']].concat(E.nube.filter(p => C.proveedores[p] && C.proveedores[p].activo).map(p => [p, E.nombres[p]]));
    return ui.tarjeta('Tareas auxiliares', el('ul', { class: 'lista' }, [
      fila('Asistente para tareas auxiliares', 'Títulos, resúmenes, etiquetas, textos de notificación y segunda opinión de diffs.', el('div', { class: 'row' }, [
        select('as-aux-prov', opts, C.auxiliar.prov, v => guardar({ auxiliar: { prov: v, modelo: v === 'ollama' ? C.local.modelo : C.modelos[v] || '' } })),
        el('input', { class: 'input modelo', type: 'text', value: C.auxiliar.modelo || C.local.modelo || '', 'aria-label': 'Modelo auxiliar', spellcheck: 'false', onchange: e => guardar({ auxiliar: { prov: C.auxiliar.prov, modelo: e.target.value } }) })
      ])),
      fila('Resumen de cierre con la IA local', 'Lo hace el modelo de Ollama (el auxiliar si es local; si no, el modelo local), sin gastar cuota de Claude ni salir del equipo. Sin modelo local, se usa Haiku por el CLI.', sw(C.resumenLocal, 'Resumen de cierre con la IA local', v => guardar({ resumenLocal: v }))),
      fila('Textos de notificación con el asistente', 'Si no responde en 3 s, el texto de siempre.', sw(C.notifAsistente, 'Textos de notificación con el asistente', v => guardar({ notifAsistente: v })))
    ]), { id: 't-as-aux' });
  }

  // =====================================================================================
  // Uso > Orquestación
  // =====================================================================================
  async function pintarOrquestacion() {
    const caja = $('#uso-orquestacion');
    if (!P) return ui.pintar(caja, ui.tarjeta('Orquestación', el('p', { class: 'note' }, 'Solo en la app de escritorio.')));
    const [R, E] = await Promise.all([pide('orquestacion'), pide('asistentesEstado', false)]);
    if (R.error) return ui.pintar(caja, el('p', {}, el('span', { class: 'mal' }, R.error)));
    const pct = (a, b) => b ? Math.round(100 * a / b) + ' %' : '—';
    const q = E && E.cuotas ? E.cuotas : {};
    ui.pintar(caja, [
      el('div', { class: 'cifras' }, [['Decisiones', R.decisiones], ['A Claude', R.porDestino.claude || 0], ['A modelos baratos', (R.porDestino.local || 0) + (R.porDestino.nube || 0)], ['Uso de Claude ahorrado', R.ahorradas]].map(c => el('div', { class: 'card' }, [el('div', { class: 'esc centro' }, el('b', { class: 'media' }, ui.cifra(c[1]))), el('div', { class: 'card-pie' }, el('span', { class: 'label' }, c[0]))]))),
      el('p', { class: 'note' }, '"Uso de Claude ahorrado" es una estimación: tareas resueltas por un modelo barato, aprobadas y sin escalar. Escalamientos: ' + R.escaladas + ' · Reintentos: ' + R.reintentos + '.'),
      ui.tarjeta('Modelos baratos', el('div', { class: 'table-wrap' }, ui.tabla(['Modelo', ['Tareas', 'num'], ['Éxito', 'num'], ['Escaladas', 'num'], ['Latencia', 'num'], 'Valoración', 'Lo que suele resolver'], R.modelos.map(m => [el('span', { class: 'mono' }, m.modelo), m.tareas, pct(m.ok, m.tareas), m.escaladas, ui.dur(m.ms / Math.max(1, m.tareas)), '▲ ' + m.arriba + ' · ▼ ' + m.abajo, Object.keys(m.porTipo).filter(t => m.porTipo[t].ok).join(', ') || '—'])))),
      ui.tarjeta('Por nivel de esfuerzo', el('div', { class: 'table-wrap' }, ui.tabla(['Modelo', 'Nivel', ['Tareas', 'num'], ['Éxito', 'num'], ['Latencia', 'num'], ['VRAM', 'num']], [].concat.apply([], R.modelos.map(m => Object.keys(m.porNivel).map(n => [m.modelo, n, m.porNivel[n].tareas, pct(m.porNivel[n].ok, m.porNivel[n].tareas), ui.dur(m.porNivel[n].ms / Math.max(1, m.porNivel[n].tareas)), m.porNivel[n].vram ? MB(m.porNivel[n].vram) : '—'])))))),
      RA.fase4 ? RA.fase4.medicion() : null,
      ui.tarjeta('Prompts refinados frente a originales', el('p', {}, 'Refinados: ' + R.refinados.refinado.n + ' tareas, ' + pct(R.refinados.refinado.ok, R.refinados.refinado.n) + ' de éxito · Originales: ' + R.refinados.original.n + ', ' + pct(R.refinados.original.ok, R.refinados.original.n) + '.')),
      ui.tarjeta('Cuota de los proveedores (estimada)', el('div', { class: 'table-wrap' }, ui.tabla(['Proveedor', ['Usadas hoy', 'num'], ['Límite', 'num'], ['Quedan', 'num'], ['Reservadas', 'num']], Object.keys(q).filter(p => p !== 'ollama').map(p => [E.nombres[p], q[p].usados, q[p].limite || '—', q[p].restante == null ? '—' : q[p].restante, q[p].reservados || 0])))),
      ui.tarjeta('Últimas decisiones', el('ul', { class: 'lista' }, R.ultimas.length ? R.ultimas.map(d => el('li', {}, [
        el('span', { class: 'n' }, ui.hora(d.t)), ui.insignia({ claude: 'Claude', local: 'Local', nube: 'Nube', pendiente: 'Pendiente', espera: 'En espera' }[d.destino] || d.destino), el('span', { class: 'crece' }, [el('span', { class: 'mono' }, d.prompt.slice(0, 80)), el('br'), el('span', { class: 'note' }, d.motivo)]),
        d.destino !== 'claude' ? el('button', { type: 'button', class: 'btn btn-small', 'aria-label': 'Valorar bien', onclick: () => pide('orquestacionValorar', d.id, 'arriba').then(() => ui.decir('Valorado.')) }, '▲') : null,
        d.destino !== 'claude' ? el('button', { type: 'button', class: 'btn btn-small', 'aria-label': 'Valorar mal', onclick: () => pide('orquestacionValorar', d.id, 'abajo').then(() => ui.decir('Valorado.')) }, '▼') : null
      ])) : el('li', { class: 'note' }, 'Aún no hay decisiones: enciende el orquestador en Ajustes > Asistentes.')))
    ]);
  }

  // =====================================================================================
  // Cambios: parches de los asistentes
  // =====================================================================================
  function lineasDiff(texto) {
    return el('div', { class: 'diff', tabindex: '0', role: 'group', 'aria-label': 'Parche' }, String(texto).split('\n').slice(0, 400).map(l => {
      const c = l[0] === '+' && !/^\+\+\+/.test(l) ? 'mas-l' : l[0] === '-' && !/^---/.test(l) ? 'menos-l' : '';
      return el('div', { class: 'dl uno ' + c }, [el('span', { class: 'n' }), el('span', { class: 'm', 'aria-hidden': 'true' }, c === 'mas-l' ? '+' : c === 'menos-l' ? '−' : ''), el('span', { class: 't' }, [c ? el('span', { class: 'sr' }, c === 'mas-l' ? 'Añadida: ' : 'Eliminada: ') : null, c ? l.slice(1) : l])]);
    }));
  }
  function pintarParches() {
    const caja = $('#cam-parches');
    const pend = parches.filter(p => p.estado === 'pendiente');
    caja.hidden = !pend.length;
    if (!pend.length) return ui.pintar(caja, null);
    ui.pintar(caja, pend.map(p => {
      const git = el('input', { type: 'checkbox', id: 'git-' + p.id });
      return ui.tarjeta('Parche de ' + p.prov + ' · ' + p.modelo, [
        el('div', { class: 'badges' }, [ui.insignia('Espera tu aprobación', 'alerta'), ui.insignia('Hecho por ' + p.modelo), p.aleatorio ? ui.insignia('Elección aleatoria · sin garantía de privacidad') : null, ui.insignia(p.intentos === 1 ? '1 intento' : p.intentos + ' intentos')]),
        el('p', { class: 'mono' }, p.prompt),
        el('ul', { class: 'lista' }, p.checks.length ? p.checks.map(c => el('li', {}, [ui.estado(c.ok ? 'listo' : 'error'), el('span', {}, c.nombre), el('span', { class: 'note' }, c.ok ? 'pasó' : 'falló')])) : el('li', { class: 'note' }, 'El proyecto no tiene verificaciones automáticas: revisa el diff.')),
        lineasDiff(p.diff),
        el('div', { class: 'row' }, [
          el('label', { class: 'row', for: 'git-' + p.id }, [git, el('span', { class: 'note' }, 'Si es un repositorio, confirmarlo con un mensaje que nombra el modelo')]),
          el('button', { type: 'button', class: 'btn btn-small', onclick: () => pide('parcheRechazar', p.id).then(r => { msg(r, 'Parche rechazado.'); cargarParches(); }) }, 'Rechazar'),
          ui.armar(el('button', { type: 'button', class: 'btn btn-small', 'data-aplicar': p.id }, 'Aplicar'), '¿Aplicar a la carpeta real?', () => pide('parcheAplicar', p.id, git.checked).then(r => { msg(r, 'Parche aplicado' + (r.commit ? ' y confirmado (' + r.commit + ').' : '.')); cargarParches(); }))
        ]),
        el('p', { class: 'note' }, 'Lo hizo un modelo barato en una copia aislada: tu carpeta no se tocó. Solo se aplica si lo apruebas y si los archivos no cambiaron entretanto.')
      ], { id: 't-parche-' + p.id, clase: 'puerta' });
    }));
  }
  function cargarParches() { pide('parches').then(l => { parches = Array.isArray(l) ? l : []; if (enCambios()) pintarParches(); }); }

  // Segunda opinión y resumen del diff que se está viendo en Cambios: de un asistente, no de Claude.
  function botonesDiff() {
    if (!P || $('#cam-opinion')) return;
    const fila2 = $('#cam-copiar').parentNode;
    const salida = el('div', { id: 'cam-opinion-sal', class: 'col' });
    const pedir = q => {
      const t = RA.vistas.diffActual ? RA.vistas.diffActual() : '';
      if (!t) return ui.decir('No hay ningún diff a la vista.');
      ui.pintar(salida, el('p', { class: 'label' }, 'Pensando'));
      pide('asistentesOpinion', t.slice(0, 40000), q).then(r => ui.pintar(salida, r.error ? el('p', {}, el('span', { class: 'mal' }, r.error)) : el('div', { class: 'sub' }, [ui.insignia('Opinión de asistente (' + r.modelo + '), no de Claude'), el('pre', { class: 'dato', tabindex: '0', role: 'group', 'aria-label': q === 'opinion' ? 'Segunda opinión' : 'Resumen del diff' }, r.texto)])));
    };
    fila2.appendChild(el('button', { type: 'button', class: 'btn btn-small', id: 'cam-opinion', onclick: () => pedir('opinion') }, 'Segunda opinión'));
    fila2.appendChild(el('button', { type: 'button', class: 'btn btn-small', id: 'cam-resumir', onclick: () => pedir('resumen') }, 'Resumir'));
    $('#cam-diff').parentNode.appendChild(salida);
  }

  // ---- Lo que llega del proceso principal ----
  function recibir(d) {
    if (d.descarga) { descarga = d.descarga.fin ? null : d.descarga; if (d.descarga.fin) recargar(); else if (sub === 'asistentes' && (RA.app ? RA.app.sel : {}).vista === 'ajustes') pintarAjustes(); }
    if (d.parches) { parches = d.parches; if (enCambios()) pintarParches(); }
    if (d.tareaBarata) { tareas[d.tareaBarata.sesion] = d.tareaBarata; if (RA.chat) RA.chat.tarea(d.tareaBarata); if (d.tareaBarata.estado === 'parche') cargarParches(); }
    if (typeof d.pensando === 'boolean') { D.pensando = d.pensando; }
    if (d.autoeval && sub === 'asistentes') recargar();
  }

  document.addEventListener('rastro:vista', e => {
    if (e.detail === 'cambios') { botonesDiff(); cargarParches(); }
    if (e.detail === 'uso' && (RA.app ? RA.app.sel : {}).usoVista === 'orquestacion') pintarOrquestacion();
  });
  // Cambios abierto como panel junto a la conversación (js/panes.js).
  document.addEventListener('rastro:panel', e => { if (e.detail === 'cambios') { botonesDiff(); cargarParches(); } });

  RA.asistentes = { mostrar: mostrar, orquestador: () => !!(estado && estado.config && estado.config.orquestador), repintar: () => { if (sub === 'asistentes' && (RA.app ? RA.app.sel : {}).vista === 'ajustes') pintarAjustes(); }, recibir: recibir, pintarOrquestacion: pintarOrquestacion, recargar: recargar, parches: () => parches, tareas: () => tareas,
    // Estado de los asistentes (modelo local, proveedores, cuotas, auxiliar): lo lee la tarjeta Modelos en uso.
    estado: () => estado };
  // Una lectura al arrancar para la tarjeta Modelos en uso; es una petición local al proceso principal.
  if (P) recargar().then(() => D.emitir());
})(window.RA = window.RA || {});
