/* Interfaz de la Fase 4: modo juego y recursos (barra superior, Uso > Recursos, Ajustes > Asistentes),
   esfuerzo del modelo local (Ajustes, selector por envío en Chat, medición en Orquestación) y modo
   continuidad (indicador de la barra y Uso > Continuidad). Fuera de la app no hay nada que mostrar. */
(function (RA) {
  'use strict';

  const ui = RA.ui, el = ui.el, $ = ui.$, D = RA.datos, P = window.rastro;
  const pide = (f, ...a) => P && P[f] ? P[f](...a).catch(() => ({ error: 'La orden no se pudo ejecutar.' })) : Promise.resolve({ error: 'Solo en la app de escritorio.' });
  const NIVEL = { bajo: 'Bajo', medio: 'Medio', alto: 'Alto', personalizado: 'Personalizado' };
  const fila = (nombre, ayuda, control) => el('li', {}, [el('div', { class: 'crece' }, [el('div', {}, nombre), ayuda ? el('div', { class: 'note' }, ayuda) : null]), control]);
  const MB = n => n == null ? '?' : n >= 1024 ? (n / 1024).toFixed(1).replace('.', ',') + ' GB' : Math.round(n) + ' MB';
  let R = null, Cn = null, Ef = null, hist = [], calib = null, tPintar = 0, presupuesto;

  // =====================================================================================
  // Estado y barra superior
  // =====================================================================================
  function aplicarRecursos(r) {
    if (!r) return;
    if (r.historial) hist = r.historial.slice();
    else if (r.gpu && (!hist.length || hist[hist.length - 1][0] !== r.gpu.t)) { hist.push([r.gpu.t, r.gpu.uso, r.gpu.usadaMB]); if (hist.length > 60) hist.shift(); }
    const antes = !!(R && R.juego.activo);
    R = Object.assign({}, R, r, { config: r.config || (R && R.config) });
    // Si cambió lo que cabe en la VRAM, el selector de esfuerzo de Chat se revisa (y baja solo si hace falta).
    if (Ef && Math.abs((R.presupuestoMB || 0) - (presupuesto || 0)) >= 256) { presupuesto = R.presupuestoMB; cargarEsfuerzo(); }
    D.modoJuego = !!R.juego.activo;
    document.dispatchEvent(new CustomEvent('rastro:estado'));
    // Modo juego: la app se aligera (sin animaciones ni transiciones; gráficos y bombeo más espaciados).
    document.documentElement.classList.toggle('modo-juego', D.modoJuego);
    if (antes !== D.modoJuego) { barra(); D.emitir(); }
    // El gráfico se repinta como mucho cada 2 s, o cada 10 s en modo juego.
    const ahora = Date.now();
    if ((RA.app ? RA.app.sel : {}).vista === 'uso' && (RA.app ? RA.app.sel : {}).usoVista === 'recursos' && ahora - tPintar > (D.modoJuego ? 10000 : 2000)) { tPintar = ahora; pintarRecursos(); }
  }
  function aplicarCont(c) {
    if (!c) return;
    const antes = !!(Cn && Cn.activo);
    Cn = c; D.continuidad = !!c.activo;
    if (antes !== D.continuidad) { barra(); D.emitir(); if (RA.chat && RA.chat.destino) RA.chat.destino(); }
    if ((RA.app ? RA.app.sel : {}).vista === 'uso' && (RA.app ? RA.app.sel : {}).usoVista === 'continuidad') pintarContinuidad();
  }
  function barra() {
    const bj = $('#b-juego'), bc = $('#b-cont');
    if (!bj || !P) return;
    bj.hidden = false;
    const on = !!(R && R.juego.activo);
    bj.setAttribute('aria-pressed', String(on));
    ui.pintar(bj, [el('span', { class: 'sr' }, 'Modo juego: '), on ? 'Modo juego' : 'Modo juego: no']);
    bj.title = on ? 'Activo (' + R.juego.por + '): el modelo local está descargado y no se usa. Pulsa para apagarlo.' : 'Pulsa para activarlo a mano. Se activa solo con los juegos de la lista o una aplicación a pantalla completa.';
    bj.classList.toggle('alerta', on);
    bc.hidden = !(Cn && Cn.activo);
    if (Cn && Cn.activo) { ui.pintar(bc, ui.corchetes('Claude no disponible')); bc.title = Cn.motivo + (Cn.vuelta ? ' · vuelve hacia las ' + ui.hora(Cn.vuelta) : '') + '. Pulsa para ver los pendientes.'; }
  }
  async function cargar() {
    if (!P) return;
    const [r, c] = await Promise.all([pide('recursosEstado'), pide('continuidadEstado')]);
    if (!r.error) aplicarRecursos(r);
    if (!c.error) aplicarCont(c);
    barra();
  }

  // =====================================================================================
  // Uso > Recursos
  // =====================================================================================
  function pintarRecursos() {
    const caja = $('#uso-recursos');
    if (!P) return ui.pintar(caja, ui.tarjeta('Recursos', el('p', { class: 'note' }, 'Solo en la app de escritorio.')));
    if (!R) return ui.pintar(caja, el('p', { class: 'label' }, 'Cargando'));
    const g = R.gpu, c = R.config || {};
    if (R.sinGpu || !g) return ui.pintar(caja, ui.tarjeta('Recursos', el('p', { class: 'note' }, R.sinGpu ? 'No hay lecturas de la GPU: nvidia-smi no está disponible. Sin ellas, el tope de VRAM y la regulación por carga no se aplican y el modelo local se usa como en la Fase 3.' : 'Esperando la primera lectura de la GPU.'), { id: 't-rec' }));
    const pctV = Math.round(100 * g.usadaMB / g.totalMB);
    const serie = (cod, nombre, v) => ({ cod: cod, nombre: nombre, v: v });
    const h = hist.length > 1 ? hist : [[0, g.uso, g.usadaMB], [1, g.uso, g.usadaMB]];
    ui.pintar(caja, [
      el('div', { class: 'cifras' }, [['GPU', g.uso + ' %'], ['VRAM en uso, de ' + MB(g.totalMB), MB(g.usadaMB)], ['Modelo local' + (R.vramOllamaMB ? '' : ': descargado'), R.vramOllamaMB ? MB(R.vramOllamaMB) : '0'], ['Cabe un modelo de', R.presupuestoMB == null ? '—' : MB(R.presupuestoMB)]].map(x => el('div', { class: 'card' }, [el('div', { class: 'esc centro' }, el('b', { class: 'media' }, x[1])), el('div', { class: 'card-pie' }, el('span', { class: 'label' }, x[0]))]))),
      el('div', { class: 'badges' }, [
        R.juego.activo ? ui.insignia('Modo juego · ' + R.juego.por, 'alerta') : ui.insignia('Modo juego: no'),
        R.pausa.activa ? ui.insignia('Pausado: ' + R.pausa.motivo, 'alerta') : ui.insignia('Sin pausa'),
        R.perfil ? ui.insignia('Perfil de ' + R.perfil.juego) : null,
        R.calibrando ? ui.insignia('Calibrando', 'alerta') : null
      ]),
      ui.tarjeta('GPU y VRAM (últimos 2 minutos)', [
        ui.grafico([serie('GPU', 'uso de la GPU', h.map(x => x[1])), serie('VRAM', 'VRAM en uso', h.map(x => Math.round(100 * x[2] / g.totalMB))), serie('TOPE', 'tope de VRAM', h.map(() => R.config ? R.config.topeVram : 80)), serie('UMBR', 'umbral de GPU', h.map(() => R.umbralGpu))], { titulo: 'Uso de la GPU y de la VRAM, en porcentaje', unidad: '%', desde: 'hace ' + Math.round((h[h.length - 1][0] - h[0][0]) / 1000 || 0) + ' s', hasta: 'ahora' }),
        el('p', { class: 'note' }, 'VRAM al ' + pctV + ' %. Tope de VRAM para el modelo local: ' + MB(R.topeVramMB) + ' (' + (c.topeVram || 80) + ' %). Tope de GPU: ' + R.topeGpu + ' %, de mejor esfuerzo: Ollama no permite limitar el cómputo, así que Rastro vigila y, si el uso total pasa el ' + R.umbralGpu + ' % durante ' + (c.sostenidoS || 6) + ' s sin que el modelo local esté trabajando (o la VRAM pasa el ' + (c.umbralVram || 95) + ' %), pausa, cancela y descarga el modelo; reanuda tras ' + (c.histeresisS || 30) + ' s por debajo.' + (D.modoJuego ? ' En modo juego este gráfico se actualiza cada 10 s.' : ''))
      ], { id: 't-rec-graf' })
    ]);
  }

  // =====================================================================================
  // Uso > Continuidad
  // =====================================================================================
  async function pintarContinuidad() {
    const caja = $('#uso-continuidad');
    if (!P) return ui.pintar(caja, ui.tarjeta('Continuidad', el('p', { class: 'note' }, 'Solo en la app de escritorio.')));
    if (!Cn) return ui.pintar(caja, el('p', { class: 'label' }, 'Cargando'));
    const nombre = id => { const s = RA.calc && RA.calc.sesion(id); return s ? s.nombre : id.slice(0, 8); };
    const O = await pide('orquestacion'), C = Cn;
    const editados = {};
    ui.pintar(caja, [
      ui.tarjeta('Estado', [
        el('div', { class: 'badges' }, [C.activo ? ui.insignia('Claude no disponible', 'alerta') : ui.insignia('Claude disponible'), C.activo && C.por === 'manual' ? ui.insignia('Marcado a mano') : null]),
        el('p', {}, C.activo ? 'Desde las ' + ui.hora(C.desde) + ': ' + C.motivo + '. ' + (C.vuelta ? 'Vuelta estimada: ' + ui.hora(C.vuelta) + '. ' : 'Sin hora de reinicio conocida. ') + (C.proximo ? 'Próxima comprobación: ' + ui.hora(C.proximo) + (C.intentos ? ' (' + C.intentos + ' reintentos)' : '') + '.' : '') : 'Los prompts van a Claude como siempre. Si se agota la cuota, el modo se activa solo (o actívalo aquí).'),
        el('ul', { class: 'lista' }, [
          fila('Claude no disponible', 'A mano. Apagarlo descarta también una detección errónea: esa señal ya no lo vuelve a encender.', ui.interruptor(C.activo, v => pide('continuidadManual', v).then(aplicarCont), 'Claude no disponible')),
          fila('Pedir confirmación antes de enviar los pendientes', 'Si no, se envían solos cuando Claude vuelve.', ui.interruptor(C.confirmarEnvio, v => pide('continuidadOpciones', { confirmarEnvio: v }).then(aplicarCont), 'Confirmar el envío de pendientes')),
          fila('Enseñar el resumen antes de enviarlo', 'El primer prompt de cada sesión lleva un resumen de lo hecho mientras tanto; así lo revisas y editas.', ui.interruptor(C.mostrarResumen, v => pide('continuidadOpciones', { mostrarResumen: v }).then(aplicarCont), 'Enseñar el resumen'))
        ])
      ], { id: 't-cont-est' }),
      ui.tarjeta('Pendientes para Claude (' + C.pendientes.length + ')', [
        C.pendientes.length ? el('ol', { class: 'lista' }, C.pendientes.map((p, i) => el('li', { class: 'col' }, [
          el('div', { class: 'row between' }, [el('span', { class: 'note' }, ui.hora(p.t) + ' · ' + nombre(p.sesion)), el('div', { class: 'row' }, [
            el('button', { type: 'button', class: 'btn btn-small', disabled: i === 0, 'aria-label': 'Subir', onclick: () => pide('continuidadOrden', p.id, 'subir').then(() => cargar()) }, '↑'),
            el('button', { type: 'button', class: 'btn btn-small', disabled: i === C.pendientes.length - 1, 'aria-label': 'Bajar', onclick: () => pide('continuidadOrden', p.id, 'bajar').then(() => cargar()) }, '↓'),
            ui.armar(el('button', { type: 'button', class: 'btn btn-small' }, 'Forzar local'), 'Un modelo local puede hacerlo peor que Claude: ¿intentarlo?', () => pide('continuidadOrden', p.id, 'local').then(r => { ui.decir(r.error || (r.decision ? r.decision.motivo : 'Enviado a un modelo local.')); cargar(); })),
            ui.armar(el('button', { type: 'button', class: 'btn btn-small' }, 'Quitar'), '¿Quitar?', () => pide('continuidadOrden', p.id, 'quitar').then(() => cargar()))
          ])]),
          el('p', { class: 'mono' }, p.prompt), el('p', { class: 'note' }, p.motivo)
        ]))) : el('p', { class: 'note' }, 'Nada en espera.'),
        C.pendientes.length && !C.activo ? el('button', { type: 'button', class: 'btn btn-small btn-primary', id: 'cont-enviar', onclick: () => pide('continuidadEnviar', Object.keys(editados).length ? editados : null).then(r => { ui.decir(r.error || (r.ok ? 'Pendientes enviados a la cola de cada sesión.' : 'Algunos no se pudieron enviar.')); cargar(); }) }, 'Enviar pendientes a Claude') : null
      ], { id: 't-cont-pend' }),
      ui.tarjeta('Hecho sin Claude', C.registro.length ? C.registro.map(r => el('div', { class: 'col' }, [
        el('span', { class: 'label' }, nombre(r.sesion)),
        el('ul', { class: 'lista' }, r.items.map(x => el('li', {}, [el('span', { class: 'n' }, ui.hora(x.t)), el('span', { class: 'crece' }, x.texto), x.modelo ? ui.insignia(x.modelo) : null]))),
        C.mostrarResumen && r.resumen ? el('textarea', { class: 'input', rows: '5', 'aria-label': 'Resumen para ' + nombre(r.sesion), oninput: e => { editados[r.sesion] = e.target.value; } }, r.resumen) : r.resumen ? el('pre', { class: 'dato' }, r.resumen) : null
      ])) : el('p', { class: 'note' }, 'Nada todavía.'), { id: 't-cont-hecho' }),
      ui.tarjeta('Éxito de cada modelo por tipo de tarea', el('div', { class: 'table-wrap' }, ui.tabla(['Modelo', 'Tipo de tarea', ['Tareas', 'num'], ['Éxito', 'num']], O.error ? [] : [].concat.apply([], O.modelos.map(m => Object.keys(m.porTipo).map(t => [el('span', { class: 'mono' }, m.modelo), t, m.porTipo[t].tareas, Math.round(100 * m.porTipo[t].ok / Math.max(1, m.porTipo[t].tareas)) + ' %']))))), { id: 't-cont-mod' })
    ]);
  }

  // =====================================================================================
  // Ajustes > Asistentes: Recursos y modo juego, y Esfuerzo
  // =====================================================================================
  function num(id, valor, min, max, nombre, cambio) {
    return el('input', { id: id, class: 'input num', type: 'number', min: String(min), max: String(max), value: String(valor), 'aria-label': nombre, onchange: e => { const v = +e.target.value; if (v >= min && v <= max) cambio(v); else ui.decir(nombre + ': entre ' + min + ' y ' + max + '.'); } });
  }
  const guardarRec = o => pide('recursosGuardar', o).then(r => { if (r.error) ui.decir(r.error); else { aplicarRecursos(r); ui.decir('Guardado.'); repintar(); } });
  function repintar() { if (RA.asistentes && RA.asistentes.repintar) RA.asistentes.repintar(); }

  function tarjetaRecursos() {
    if (!R || !R.config) return ui.tarjeta('Recursos y modo juego', el('p', { class: 'label' }, 'Cargando'), { id: 't-as-rec' });
    const c = R.config, hilos = (navigator.hardwareConcurrency || 16);
    const juegos = el('textarea', { id: 'as-juegos', class: 'input', rows: '4', spellcheck: 'false', 'aria-label': 'Procesos que activan el modo juego, uno por línea', onchange: e => guardarRec({ juegos: e.target.value.split('\n').map(x => x.trim()).filter(Boolean) }) }, c.juegos.join('\n'));
    const cj = el('input', { id: 'as-cal-juego', class: 'input', type: 'text', value: (R.juego.por.match(/proceso (.+)/) || [])[1] || '', placeholder: 'RobloxPlayerBeta.exe', 'aria-label': 'Juego que vas a calibrar', spellcheck: 'false' });
    const cs = el('select', { id: 'as-cal-min', class: 'select', 'aria-label': 'Duración de la calibración' }, [['120', '2 min'], ['180', '3 min'], ['300', '5 min']].map(o => el('option', { value: o[0] }, o[1])));
    cs.value = '180';
    const perfiles = Object.keys(c.perfiles || {});
    return ui.tarjeta('Recursos y modo juego', [
      el('p', { class: 'note' }, 'Ollama permite, por petición: capas en GPU, contexto, hilos de CPU, tokens de respuesta y tiempo de carga (keep_alive). No permite limitar el uso de cómputo de la GPU ni fijar un tope duro de VRAM, y el paralelismo es una variable del servidor que Rastro no toca. Por eso: una petición local a la vez; el modelo y su contexto se eligen para caber en el tope de VRAM con margen (si no cabe, no se carga); y el tope de GPU es de mejor esfuerzo, por vigilancia y pausas.'),
      el('ul', { class: 'lista' }, [
        fila('Tope de GPU (mejor esfuerzo)', 'Porcentaje de referencia; no es un límite duro.', num('as-tope-gpu', c.topeGpu, 10, 100, 'Tope de GPU', v => guardarRec({ topeGpu: v }))),
        fila('Tope de VRAM para el modelo local', 'Porcentaje del total (' + (R.gpu ? MB(R.gpu.totalMB) : '?') + '): ' + MB(R.topeVramMB) + '.', num('as-tope-vram', c.topeVram, 10, 95, 'Tope de VRAM', v => guardarRec({ topeVram: v }))),
        fila('Hilos de CPU', 'Para la parte que Ollama haga en la CPU (de ' + hilos + ').', num('as-hilos', c.hilos, 1, hilos, 'Hilos de CPU', v => guardarRec({ hilos: v }))),
        fila('Peticiones locales a la vez', 'Fijo en 1: lo impone la pasarela.', el('span', { class: 'mono' }, '1')),
        fila('Pausar si la GPU pasa de', 'Porcentaje de uso total, sin que el modelo local esté trabajando.', num('as-umbral-gpu', c.umbralGpu, 30, 100, 'Umbral de GPU', v => guardarRec({ umbralGpu: v }))),
        fila('Pausar si la VRAM pasa de', 'Porcentaje de VRAM total.', num('as-umbral-vram', c.umbralVram, 50, 100, 'Umbral de VRAM', v => guardarRec({ umbralVram: v }))),
        fila('Durante (segundos)', 'Picos más cortos no pausan.', num('as-sostenido', c.sostenidoS, 2, 120, 'Segundos sostenidos', v => guardarRec({ sostenidoS: v }))),
        fila('Reanudar tras (segundos por debajo)', 'Histéresis: evita pausar y reanudar sin parar.', num('as-histeresis', c.histeresisS, 5, 600, 'Histéresis', v => guardarRec({ histeresisS: v }))),
        fila('Descargar el modelo tras (segundos sin uso)', 'keep_alive de cada petición.', num('as-inactividad', c.inactividadS, 10, 3600, 'Inactividad', v => guardarRec({ inactividadS: v }))),
        D.so.win() ? fila('Modo juego con una aplicación a pantalla completa', 'Lo pregunta a Windows (SHQueryUserNotificationState) cada 5 s, junto con el proceso en primer plano; los de la lista de abajo no cuentan.', ui.interruptor(c.pantallaCompleta, v => guardarRec({ pantallaCompleta: v }), 'Modo juego con pantalla completa'))
          : fila('Modo juego con una aplicación a pantalla completa', 'No disponible en Linux: el escritorio (Wayland) no deja que una app sepa qué ventana está delante. Usa la lista de procesos o el interruptor de la barra.', el('span', { class: 'note' }, 'No disponible')),
        el('li', { class: 'col' }, [el('label', { for: 'as-juegos' }, 'Procesos que activan el modo juego'), juegos, el('span', { class: 'note' }, D.so.win() ? 'Uno por línea; "Persona*" vale para cualquier nombre que empiece así. Minecraft Java es javaw.exe.' : 'Uno por línea; "Persona*" vale para cualquier nombre que empiece así. Los juegos de Steam con Proton se ven por su .exe (P5R.exe); Minecraft Java es java.')]),
        el('li', { class: 'col' }, [el('label', { for: 'as-nojuegos' }, 'A pantalla completa pero no son juegos'), el('textarea', { id: 'as-nojuegos', class: 'input', rows: '3', spellcheck: 'false', onchange: e => guardarRec({ noJuegos: e.target.value.split('\n').map(x => x.trim()).filter(Boolean) }) }, (c.noJuegos || []).join('\n')), el('span', { class: 'note' }, 'Navegadores y reproductores: un vídeo o una página a pantalla completa no descargan el modelo local.')])
      ]),
      el('div', { class: 'col' }, [
        el('span', { class: 'label' }, 'Calibrar con mi juego'),
        el('p', { class: 'note' }, 'Abre el juego y juega con normalidad: Rastro descarga su modelo, mide la VRAM y la GPU unos minutos y te sugiere un tope y un umbral. Solo se guarda como perfil de ese juego si lo confirmas; con "permitir el modelo local", ese juego deja de activar el modo juego y se usan sus topes.'),
        el('div', { class: 'row' }, [cj, cs, el('button', { type: 'button', class: 'btn btn-small', id: 'as-calibrar', disabled: R.calibrando, onclick: () => {
          ui.decir('Calibrando: sigue jugando.'); calib = { midiendo: true }; repintar();
          pide('recursosCalibrar', +cs.value, cj.value.trim()).then(r => { calib = r; repintar(); ui.decir(r.error || 'Calibración lista: revisa la sugerencia.'); });
        } }, R.calibrando ? 'Calibrando' : 'Calibrar con mi juego')]),
        calib && calib.sugerencia ? el('div', { class: 'sub col', id: 'as-cal-res' }, [
          el('p', {}, calib.nota + ' Pico de VRAM: ' + MB(calib.picoVramMB) + '; GPU p95 ' + calib.p95Gpu + ' %.'),
          el('p', { class: 'mono' }, 'Sugerencia: tope de VRAM ' + calib.sugerencia.topeVram + ' % · pausar si la GPU pasa del ' + calib.sugerencia.umbralGpu + ' %'),
          el('label', { class: 'row', for: 'as-cal-local' }, [el('input', { type: 'checkbox', id: 'as-cal-local' }), el('span', { class: 'note' }, 'Permitir el modelo local mientras juego a esto (con estos topes)')]),
          ui.armar(el('button', { type: 'button', class: 'btn btn-small' }, 'Guardar perfil'), '¿Guardar el perfil de ' + (calib.juego || 'este juego') + '?', () => pide('recursosPerfil', calib.juego || cj.value.trim() || 'juego', { topeVram: calib.sugerencia.topeVram, umbralGpu: calib.sugerencia.umbralGpu, permitirLocal: $('#as-cal-local').checked }).then(r => { ui.decir(r.error || 'Perfil guardado.'); calib = null; cargar().then(repintar); }))
        ]) : calib && calib.error ? el('p', {}, el('span', { class: 'mal' }, calib.error)) : null,
        perfiles.length ? el('p', { class: 'note' }, 'Perfiles: ' + perfiles.map(k => k + ' (VRAM ' + c.perfiles[k].topeVram + ' %, GPU ' + c.perfiles[k].umbralGpu + ' %' + (c.perfiles[k].permitirLocal ? ', con modelo local' : '') + ')').join('; ') + '.') : null
      ])
    ], { id: 't-as-rec' });
  }

  function tarjetaEsfuerzo() {
    if (!Ef) return ui.tarjeta('Esfuerzo del modelo local', el('p', { class: 'label' }, 'Cargando'), { id: 't-as-esf' });
    const E = Ef, cfg = E.config || {}, est = E.estimacion, cabe = n => !est || (est.niveles.find(x => x.nivel === n) || {}).cabe !== false;
    const selNivel = (id, valor, nombre, conGlobal, cambio) => {
      const s = el('select', { id: id, class: 'select', 'aria-label': nombre, onchange: e => cambio(e.target.value) }, (conGlobal ? [el('option', { value: '' }, 'Como el global')] : []).concat(E.niveles.map(n => el('option', { value: n, disabled: !cabe(n) }, NIVEL[n] + (cabe(n) ? '' : ' · no cabe en la VRAM')))));
      s.value = valor || ''; return s;
    };
    const guardarEf = o => pide('esfuerzoGuardar', o).then(r => { ui.decir(r.error || 'Guardado.'); cargarEsfuerzo(); });
    const p = Object.assign({}, E.valores.niveles.personalizado);
    const campo = (k, nombre, min, max, paso) => el('input', { class: 'input num', type: 'number', min: String(min), max: String(max), step: paso || '1', value: String(p[k]), 'aria-label': nombre, onchange: e => { p[k] = e.target.value; guardarEf({ personalizado: p }); } });
    const razon = el('select', { class: 'select', 'aria-label': 'Razonamiento (personalizado)', onchange: e => { p.razonamiento = e.target.value; guardarEf({ personalizado: p }); } }, [['no', 'No'], ['bajo', 'Bajo'], ['alto', 'Alto']].map(o => el('option', { value: o[0] }, o[1])));
    razon.value = p.razonamiento || 'no';
    return ui.tarjeta('Esfuerzo del modelo local', [
      el('p', { class: 'note' }, 'Cada nivel ajusta los controles que Ollama admite por petición: razonamiento, contexto, tokens de respuesta, muestreo y tiempo límite. El esfuerzo nunca se salta los topes de VRAM, la regulación ni el modo juego; al vencer el tiempo límite se cancela y se sigue la cadena de respaldo (Claude, o la versión original del prompt). Valores editables en ' + E.ruta + '.'),
      E.modelo ? null : el('p', {}, el('span', { class: 'mal' }, 'Elige antes un modelo local para ver las estimaciones.')),
      est ? el('div', { class: 'table-wrap' }, ui.tabla(['Nivel', ['Contexto', 'num'], ['VRAM estimada', 'num'], ['Tiempo estimado', 'num'], 'Cabe'], est.niveles.map(x => [NIVEL[x.nivel], Math.round(x.contexto / 1024) + 'K', MB(x.vramMB), '~' + x.segundos + ' s' + (x.medido ? ' (medido)' : ''), x.cabe ? 'Sí' : 'No: tope ' + MB(E.topeMB)]))) : null,
      est && est.mayorQueCabe && !cabe(cfg.global) ? el('p', {}, el('span', { class: 'mal' }, 'El nivel global no cabe en la VRAM: el mayor que cabe es ' + NIVEL[est.mayorQueCabe] + '.')) : null,
      E.controles ? el('ul', { class: 'lista' }, [].concat.apply([], E.controles.map(k => k.desactivados.map(d => el('li', { class: 'note' }, NIVEL[k.nivel] + ': ' + d.control + ' desactivado. ' + d.motivo))))) : null,
      el('ul', { class: 'lista' }, [
        fila('Nivel global', 'Para las tareas sin nivel propio.', selNivel('as-esf-global', cfg.global, 'Nivel global', false, v => guardarEf({ global: v }))),
        ...Object.keys(E.tareas).map(t => fila(E.tareas[t], null, selNivel('as-esf-' + t, (cfg.tareas || {})[t], 'Nivel para ' + E.tareas[t], true, v => guardarEf({ tarea: t, nivel: v })))),
        el('li', { class: 'col' }, [el('span', {}, 'Personalizado'), el('div', { class: 'row' }, [el('span', { class: 'note' }, 'Razonamiento'), razon, el('span', { class: 'note' }, 'Contexto'), campo('num_ctx', 'Contexto (personalizado)', 512, 131072, '512'), el('span', { class: 'note' }, 'Tokens'), campo('num_predict', 'Tokens de respuesta (personalizado)', 16, 32768), el('span', { class: 'note' }, 'Tiempo límite (s)'), campo('timeoutS', 'Tiempo límite (personalizado)', 5, 1800), el('span', { class: 'note' }, 'Temperatura'), campo('temperature', 'Temperatura (personalizado)', 0, 2, '0.05'), el('span', { class: 'note' }, 'top_p'), campo('top_p', 'top_p (personalizado)', 0, 1, '0.05')])]),
        fila('Equivalente en la nube', 'Apagado por defecto. Solo donde está documentado: OpenRouter (reasoning.effort), Gemini y Groq con gpt-oss o qwen (reasoning_effort). Mistral y OpenCode Zen no lo documentan: no se envía.', ui.interruptor(E.nube, v => guardarEf({ nube: v }), 'Esfuerzo en la nube'))
      ])
    ], { id: 't-as-esf' });
  }
  async function cargarEsfuerzo() {
    const r = await pide('esfuerzoEstado');
    if (r.error) return;
    Ef = r; repintar(); selectorChat();
  }
  /* Selector de esfuerzo por envío, en el compositor: una píldora con el anillo del nivel ("Medio ◯": lleno a un
     tercio, dos tercios o entero; discontinuo si es Personalizado; vacío si va según la tarea) y un menú con los
     niveles de esfuerzo.json. Los que no caben en la VRAM no se pueden elegir y dicen por qué ("Alto · no cabe
     en la VRAM: máximo disponible Medio"); el elegido lleva ✓. Si el nivel elegido deja de caber (otra app
     ocupó la GPU), baja solo al mayor que cabe y se avisa. Sin la app (maqueta) se ven los niveles sin estimar. */
  function anillo(v) {
    const a = RA.logica.anilloEsfuerzo(v), r = 5.5, L = 2 * Math.PI * r;
    return ui.svg('svg', { class: 'esf-anillo', viewBox: '0 0 14 14', width: '14', height: '14', 'aria-hidden': 'true' }, [
      ui.svg('circle', { cx: '7', cy: '7', r: String(r), class: 'esf-fondo' }),
      a.fraccion ? ui.svg('circle', { cx: '7', cy: '7', r: String(r), class: 'esf-arco' + (a.discontinuo ? ' disc' : ''), 'stroke-dasharray': a.discontinuo ? '2 2' : (L * a.fraccion).toFixed(2) + ' ' + L.toFixed(2), transform: 'rotate(-90 7 7)' }) : null
    ]);
  }
  function selectorChat() {
    const b = $('#masc-esfuerzo');
    if (!b) return;
    const est = Ef && Ef.estimacion, mayor = est && est.mayorQueCabe;
    const cabe = n => { const x = est && est.niveles.find(y => y.nivel === n); return !(x && !x.cabe); };
    let v = b.dataset.v || '';
    if (v && !cabe(v)) {
      const antes = v; v = mayor || '';
      ui.decir('El esfuerzo ' + NIVEL[antes].toLowerCase() + ' ya no cabe en la memoria de la GPU: se usará ' + (v ? NIVEL[v].toLowerCase() : 'el de cada tarea') + '.', 'atencion');
    }
    b.dataset.v = v;
    // Sin nivel elegido va "según la tarea": el anillo enseña el nivel global (Medio por defecto).
    const global = (Ef && Ef.config && Ef.config.global) || 'medio', a = RA.logica.anilloEsfuerzo(v || global);
    ui.pintar(b, [anillo(v || global), el('span', {}, a.nombre)]);
    b.setAttribute('aria-label', 'Cambiar esfuerzo: ' + a.nombre);
    b.title = 'Esfuerzo de la IA local y económica: ' + a.nombre.toLowerCase() + (v ? '' : ' (el global; cada tarea puede tener el suyo)') + (mayor && mayor !== 'personalizado' && !cabe('alto') ? '. Los niveles bloqueados no caben en la memoria de la GPU (VRAM) con el tope actual.' : '');
  }
  function menuEsfuerzo(b) {
    if (ui.menu.abierto && ui.menu.abierto.boton === b) return ui.cerrarMenu();
    const est = Ef && Ef.estimacion, mayor = est && est.mayorQueCabe, v = b.dataset.v || '';
    const elegir = n => () => { b.dataset.v = n; selectorChat(); ui.decir('Esfuerzo: ' + RA.logica.anilloEsfuerzo(n).nombre.toLowerCase() + '.', 'ok'); b.focus(); };
    ui.menu(b, [{ texto: 'Esfuerzo', titulo: true }, { texto: 'Según la tarea (' + RA.logica.anilloEsfuerzo((Ef && Ef.config && Ef.config.global) || 'medio').nombre.toLowerCase() + ' por defecto)', radio: true, marcado: !v, id: 'esf-', fn: elegir('') }].concat(RA.logica.ESFUERZOS.map(([n, nombre]) => {
      const x = est && est.niveles.find(y => y.nivel === n), ok = !(x && !x.cabe);
      return { texto: nombre + (!x ? '' : ok ? ' · ~' + x.segundos + ' s' : ''), radio: true, marcado: v === n, id: 'esf-' + n,
        desactivado: ok ? null : 'No cabe en la VRAM: máximo disponible ' + (mayor ? NIVEL[mayor] : 'ninguno') + '.', fn: elegir(n) };
    })));
  }
  if ($('#masc-esfuerzo')) { $('#masc-esfuerzo').addEventListener('click', e => menuEsfuerzo(e.currentTarget)); selectorChat(); }

  // Medición por tarea y nivel (I4), para Uso > Orquestación: sugiere, y solo cambia si lo confirmas.
  function medicion() {
    const caja = el('div', { id: 'orq-esfuerzo' });
    pide('esfuerzoEstado').then(E => {
      if (E.error) return;
      Ef = E;
      ui.pintar(caja, ui.tarjeta('Esfuerzo por tipo de tarea', el('div', { class: 'table-wrap' }, ui.tabla(['Tarea', 'Nivel', ['Tareas', 'num'], ['Éxito', 'num'], ['Latencia', 'num'], ['VRAM', 'num'], 'Valoración', 'Sugerencia'], [].concat.apply([], E.medicion.map(t => Object.keys(t.niveles).map(n => {
        const x = t.niveles[n], sug = t.recomendado === n && t.actual !== n;
        return [t.nombre, NIVEL[n] + (t.actual === n ? ' (actual)' : ''), x.tareas, Math.round(100 * x.ok / x.tareas) + ' %', ui.dur(x.ms / x.tareas), x.vram ? MB(x.vram) : '—', '▲ ' + x.arriba + ' · ▼ ' + x.abajo,
          sug ? ui.armar(el('button', { type: 'button', class: 'btn btn-small' }, 'Usar ' + NIVEL[n]), '¿Usar ' + NIVEL[n] + ' para ' + t.nombre + '?', () => pide('esfuerzoGuardar', { tarea: t.tarea, nivel: n }).then(r => { ui.decir(r.error || 'Nivel cambiado.'); RA.asistentes.pintarOrquestacion(); })) : t.recomendado === n ? 'Recomendado' : ''];
      }))))), { id: 't-orq-esf' }));
    });
    return caja;
  }

  // =====================================================================================
  // Cableado
  // =====================================================================================
  if (P) {
    $('#b-juego').addEventListener('click', () => pide('recursosJuego', !(R && R.juego.activo)).then(r => { if (!r.error) { aplicarRecursos(r); barra(); ui.decir(r.juego.activo ? 'Modo juego activado.' : 'Modo juego apagado.'); } }));
    $('#b-cont').addEventListener('click', () => RA.app.ir('continuidad'));
    cargar();
  }
  document.addEventListener('rastro:vista', e => {
    if (e.detail === 'ajustes') { cargar().then(repintar); cargarEsfuerzo(); }
    if (e.detail === 'uso' && (RA.app ? RA.app.sel : {}).usoVista === 'recursos') pintarRecursos();
    if (e.detail === 'uso' && (RA.app ? RA.app.sel : {}).usoVista === 'continuidad') cargar().then(pintarContinuidad);
    if (e.detail === 'chat' && !Ef) cargarEsfuerzo();
  });
  function recibir(d) { if (d.recursos) aplicarRecursos(d.recursos); if (d.continuidad) aplicarCont(d.continuidad); }

  RA.fase4 = { estado: () => ({ recursos: R, continuidad: Cn }), recibir: recibir, tarjetas: () => [tarjetaRecursos(), tarjetaEsfuerzo()], medicion: medicion, pintarRecursos: pintarRecursos, pintarContinuidad: () => cargar().then(pintarContinuidad), nivel: () => { const s = $('#masc-esfuerzo'); return s && s.dataset.v ? s.dataset.v : null; } };
})(window.RA = window.RA || {});
