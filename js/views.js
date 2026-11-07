/* Las cinco vistas. Cada función repinta su vista entera a partir de RA.datos.estado y de la
   selección (RA.app.sel); no guarda estado propio. No sabe de dónde vienen los datos.
   Toda tarjeta tiene la misma anatomía: escenario (el recuadro interior) y tira de pie. */
(function (RA) {
  'use strict';

  const ui = RA.ui, el = ui.el, $ = ui.$, D = RA.datos, C = RA.calc, G = RA.glifos;
  const sel = () => (RA.app && RA.app.sel) || {};          // antes de que arranque app.js, sin selección
  const FASES = { diseno: [1, 'Diseño'], aprobacion: [2, 'Aprobación'], codigo: [3, 'Código'] };
  const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  const mesCorto = new Intl.DateTimeFormat(undefined, { month: 'short' });
  const diaCorto = new Intl.DateTimeFormat(undefined, { weekday: 'short' }), diaLargo = new Intl.DateTimeFormat(undefined, { weekday: 'long' });
  const horaMin = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

  // ---- Piezas compartidas ----
  // 'mcp__context7__query-docs' -> 'query-docs': de las herramientas MCP se enseña la última parte.
  const herr = h => h.indexOf('mcp__') === 0 ? h.split('__').pop() : h;
  const agMini = a => el('span', { class: 'ag' }, [G.deAgente(a, null), ui.insignia(a.cod)]);
  const plural = (n, uno, varios) => ui.num(n) + ' ' + (n === 1 ? uno : varios);

  // Sesión y agente a la vista. Si la elegida ya no existe, la primera.
  function actual() {
    const S = sel(), E = D.estado;
    if (!E.sesiones.length) return null;
    let s = C.sesion(S.sesion);
    if (!s) { s = E.sesiones[0]; S.sesion = s.id; }
    if (!C.agente(s, S.agente)) { S.agente = s.agentes[0].id; S.evento = null; }
    return s;
  }

  // sinModelo: en la cabecera el modelo no va; se elige y se ve en el compositor.
  function insigniasSesion(s, sinModelo) {
    const out = [ui.insigniaEstado(s.est)];
    if (s.fase) {
      out.push(ui.puntos(3, FASES[s.fase][0], 'Fase ' + FASES[s.fase][0] + ' de 3: ' + FASES[s.fase][1].toLowerCase()));
      if (s.fase !== 'aprobacion') out.push(ui.insignia(FASES[s.fase][1]));
    }
    if (s.modelo && !sinModelo) out.push(ui.insignia(ui.modelo(s.modelo)));
    if (s.origen !== 'app') out.push(ui.insignia('Solo lectura'));
    return out;
  }

  // Tiempo como cifra y unidad: 42 s · 38 min · 1,2 h
  function tiempoCifra(ms) {
    const s = ms / 1000;
    return s < 60 ? [Math.round(s), 's'] : s < 3600 ? [Math.floor(s / 60), 'min'] : [(Math.round(s / 360) / 10).toLocaleString(), 'h'];
  }
  // Tarjeta de una cifra: el número en el escenario y su nombre en el pie.
  function cifra(valor, unidad, nombre) {
    return el('div', { class: 'card' }, [
      el('div', { class: 'esc centro' }, el('b', { class: 'media' }, [String(valor), unidad ? el('small', {}, unidad) : null])),
      el('div', { class: 'card-pie' }, el('span', { class: 'label' }, nombre))
    ]);
  }
  function chipCambio(c) {
    if (c.e.est === 'error') return ui.insignia('Error', 'alerta');
    if (c.e.sinDiff) return ui.insignia('Sin diferencias');
    return el('span', { class: 'chip' }, [el('span', { class: 'sr' }, plural(c.mas, 'línea añadida', 'líneas añadidas') + ', ' + plural(c.menos, 'eliminada', 'eliminadas')), el('span', { 'aria-hidden': 'true' }, '+' + c.mas + ' −' + c.menos)]);
  }
  const nivel = (n, max) => n <= 0 ? 0 : Math.min(4, 1 + Math.floor(4 * (n - 1) / max));

  /* En la app lo pesado de un evento (entrada, salida y parche) no viaja con la sesión: se pide al
     desplegarlo. Devuelve true si todavía no está, y entonces lo pide y avisa con `luego` al llegar.
     En la maqueta todo está ya en el evento y devuelve siempre false. */
  function pedir(s, e, luego) {
    if (!D.detalle || e.cargado) return false;
    if (!e.cargando) {
      e.cargando = true;
      const fin = d => { Object.assign(e, d || {}); e.cargado = true; e.cargando = false; luego(); };
      D.detalle(s.id, e.id).then(fin, () => fin({ err: 'No se pudo leer el detalle.' }));
    }
    return true;
  }
  // Repinta sin perder el foco: lo devuelve al elemento que lo tenía, buscado por un atributo suyo.
  function repintar(pinta, atributo) {
    const a = document.activeElement, v = a && a.getAttribute && a.getAttribute(atributo), clase = a && a.className;
    pinta();
    if (v) { const n = ui.$$('[' + atributo + ']').filter(x => x.getAttribute(atributo) === v && x.className === clase)[0]; if (n) n.focus(); }
  }

  // Franja bajo la barra: la sesión elegida y sus insignias. Vale para todas las vistas.
  // La pestaña Sesiones avisa, desde cualquier vista, de las sesiones que fallaron o esperan a la persona.
  function avisoPestana() {
    const b = $('#nav button[data-vista="sesiones"]');
    if (!b) return;
    const c = D.estado.sesiones.map(s => tarjeta(s).clave), err = c.filter(x => x === 'error').length, esp = c.filter(x => x === 'esperando').length;
    // Hermano de la pestaña, no hijo: su nombre sigue siendo «Sesiones» y el aviso se lee como descripción.
    let n = $('#nav-aviso');
    const partes = [err ? err + ' con error' : '', esp ? esp + ' esperando tu respuesta' : ''].filter(Boolean);
    if (!partes.length) { if (n) n.remove(); b.removeAttribute('aria-describedby'); return; }
    if (!n) { n = el('span', { id: 'nav-aviso', class: 'nav-aviso' }); b.after(n); }
    n.textContent = '';
    n.appendChild(el('span', { 'aria-hidden': 'true' }, (err ? '✕' + err : '') + (err && esp ? ' ' : '') + (esp ? '!' + esp : '')));
    n.appendChild(el('span', { class: 'sr' }, 'Sesiones: ' + partes.join(', ')));
    n.title = 'Sesiones: ' + partes.join(', ');
    n.classList.toggle('error', !!err);
    b.setAttribute('aria-describedby', 'nav-aviso');
  }
  /* Cabecera de la pantalla (diseño: título y ruta a la izquierda; estado y modelo a la derecha). En Chat,
     la sesión elegida; en las demás secciones, su nombre y la sesión sobre la que trabajan. */
  const TITULOS = { sesiones: 'Agentes', cambios: 'Cambios', archivos: 'Archivos', consola: 'Terminal', uso: 'Consumo', ajustes: 'Ajustes' };
  function franja() {
    const E = D.estado, s = actual(), v = sel().vista;
    $('#ses-barra').hidden = !s && !TITULOS[v];
    $('#cab-nombre').textContent = v === 'chat' || !TITULOS[v] ? (s ? s.nombre : '') : TITULOS[v];
    $('#cab-ruta').textContent = s ? (v === 'chat' || !TITULOS[v] ? s.carpeta || '' : s.nombre + (s.carpeta ? ' · ' + s.carpeta : '')) : '';
    $('#cab-ruta').title = s && s.carpeta ? s.carpeta : '';
    if (!s) { ui.pintar($('#ses-insignias'), null); return; }
    const so = $('#ses-elegida');
    ui.pintar(so, E.sesiones.map(x => el('option', { value: x.id }, x.nombre + ' · ' + tarjeta(x).nombre)));
    avisoPestana();
    so.value = s.id;
    ui.pintar($('#ses-insignias'), insigniasSesion(s, true));
  }

  /* ---- Heatmap ---- Pinta en `caja` el encabezado (recuadro de glifo, nombre y periodo, cifra a
     la derecha), la rejilla con sus meses y días, y el pie con la lectura de la celda activa y la
     leyenda. Por día enseña 52 semanas si caben; si no, las que quepan, con un mínimo de 24. */
  function mapa(caja, modo) {
    const A = D.estado.actividad, ancho = caja.clientWidth - 34 - 30;     // menos el relleno y la columna de días
    const caben = (c, g) => Math.floor((ancho + g) / (c + g));
    let celda = 8, hueco = 4, cs = [], arriba = [], total = 0, inicial = -1, periodo, nombre;
    if (modo === 'horas') {
      if (caben(12, 4) >= 24) celda = 12; else if (caben(8, 4) < 24) hueco = 2;
      const max = Math.max.apply(null, [1].concat([].concat.apply([], A.horas)));
      for (let h = 0; h < 24 && A.horas.length; h++) {
        if (h % 6 === 0) arriba.push([h, h + ' h']);
        for (let d = 0; d < 7; d++) { cs.push({ n: nivel(A.horas[d][h], max), e: false, t: DIAS[d] + ', ' + h + ' h, ' + plural(A.horas[d][h], 'llamada', 'llamadas') }); total += A.horas[d][h]; }
      }
      periodo = 'Semana tipo, por hora'; nombre = 'Actividad por hora y día de la semana';
    } else {
      let semanas;
      if (caben(12, 4) >= 52) { celda = 12; semanas = 52; }
      else if (caben(8, 4) >= 24) semanas = Math.min(52, caben(8, 4));
      else { hueco = 2; semanas = Math.max(24, Math.min(52, caben(8, 2))); }
      semanas = Math.min(semanas, Math.floor(A.dias.length / 7));
      const dias = A.dias.slice(A.dias.length - semanas * 7), max = Math.max.apply(null, [1].concat(dias.map(d => d.n)));
      dias.forEach((d, i) => {
        cs.push({ n: nivel(d.n, max), e: d.e > 0, t: ui.fecha(d.t) + (d.futuro ? ', aún no ha llegado' : ', ' + plural(d.n, 'llamada', 'llamadas') + ', ' + plural(d.e, 'error', 'errores')) });
        total += d.n;
        if (!d.futuro) inicial = i;                  // se empieza en hoy, no en los días que aún no llegan
        // Mes sobre la columna en la que empieza, si no pisa la etiqueta anterior.
        if (i % 7 === 0 && (i === 0 || new Date(d.t).getMonth() !== new Date(dias[i - 7].t).getMonth()) && (!arriba.length || i / 7 - arriba[arriba.length - 1][0] >= 3)) arriba.push([i / 7, mesCorto.format(d.t).replace('.', '')]);
      });
      periodo = semanas === 52 ? 'Últimas 52 semanas' : 'Últimas ' + semanas + ' semanas'; nombre = 'Actividad por día, ' + periodo.toLowerCase();
    }
    if (!cs.length) return ui.pintar(caja, el('p', { class: 'note' }, 'Todavía no hay actividad. Aparecerá cuando una sesión trabaje: escribe un mensaje en Chat o pulsa Crear sesión.'));
    const lee = el('span', { class: 'label' }), paso = celda + hueco;
    const todo = el('div', { class: 'col mapa-todo' + (celda === 12 ? ' amplia' : ''), css: { '--c': celda + 'px', '--g': hueco + 'px' } }, [
      el('div', { class: 'mapa-cab' }, [
        el('div', { class: 'mapa-quien' }, [
          el('div', { class: 'recuadro' }, G.svg(G.P.Principal, null, 6)),
          el('div', { class: 'col' }, [el('span', { class: 'mono' }, 'Todas las sesiones'), el('span', { class: 'label' }, periodo)])
        ]),
        el('div', { class: 'col derecha' }, [el('b', { class: 'media' }, ui.cifra(total)), el('span', { class: 'label' }, 'Llamadas')])
      ]),
      el('div', { class: 'mapa' }, [
        el('div', { class: 'mapa-meses', 'aria-hidden': 'true' }, arriba.map(m => el('span', { css: { left: m[0] * paso + 'px' } }, m[1]))),
        el('div', { class: 'mapa-dias', 'aria-hidden': 'true' }, ['lun', '', 'mié', '', 'vie', '', ''].map(d => el('span', {}, d))),
        ui.calor(cs, { nombre: nombre, inicial: inicial, alVer: x => { lee.textContent = x; } })
      ]),
      el('div', { class: 'mapa-pie' }, [
        lee,
        el('div', { class: 'leyenda', role: 'img', 'aria-label': 'Leyenda: de menos a más llamadas, el punto crece y se aclara' }, ['Menos'].concat([0, 1, 2, 3, 4].map(n => el('i', { class: 'n' + n })), 'Más'))
      ])
    ]);
    ui.pintar(caja, todo);
  }

  // =====================================================================================
  // Chat: la mascota con el campo de prompts y, debajo, la sesión elegida en vivo
  // =====================================================================================
  function chat() {
    const E = D.estado, vacio = !E.sesiones.length;
    $('#cargando').hidden = !E.cargando;
    $('#vacio').hidden = E.cargando || !vacio;
    $('#chat-cuerpo').hidden = vacio;
    const s = actual();
    if (!s) return;
    mascota(s); if (RA.chat) RA.chat.pintar(s); if (RA.conversacion) RA.conversacion.pintar(s); carrete(s); tiempo(s); mapa($('#actividad'), 'dias'); arbol(s);
    if (RA.chat3) { RA.chat3.pintarPanel(); RA.chat3.pintarLista(); }
    const rec = C.cambios().slice(0, 5);
    ui.pintar($('#cambios-mini'), rec.length ? rec.map(x => el('li', {}, [
      el('button', { type: 'button', class: 'enlace crece', onclick: () => { sel().archivo = x.s.id + '|' + x.archivo; RA.app.ir('cambios'); } }, ui.ruta(x.archivo)),
      chipCambio(x), agMini(x.a), el('span', { class: 'n' }, ui.hora(x.e.t))
    ])) : el('li', { class: 'note' }, 'Todavía no hay cambios. Cuando una sesión edite archivos los verás aquí.'));
    ui.pintar($('#herr-mini'), C.herramientas([s]).slice(0, 7).map(h => el('li', {}, [
      G.svg(G.deHerramienta(h.h), null), el('span', { class: 'crece mono' }, herr(h.h)),
      el('span', { class: 'n' }, ui.num(h.n) + (h.err ? ' · ' + plural(h.err, 'error', 'errores') : ''))
    ])));
  }

  /* Fila 0: la mascota. Su cara y la burbuja dicen qué hace la sesión elegida; debajo de la burbuja va
     el uso de la sesión, con el mismo bloque y el mismo dato que la tarjeta "Uso de la sesión". Escucha
     mientras el campo del encargo tiene el foco. El campo no se repinta: solo la figura, la burbuja y el uso. */
  const NOMBRE_MASC = { reposo: 'Reposo', escuchando: 'Escuchando', trabajando: 'Trabajando', termino: 'Terminó', error: 'Error', esperando: 'Esperando tu respuesta', pensando: 'Pensando', juego: 'Modo juego', continuidad: 'Continuidad' };
  function frase(s, est) {
    const evs = s.eventos.slice().sort((a, b) => a.t - b.t), ult = evs[evs.length - 1], c = C.cifras(s);
    if (est === 'escuchando') return 'Te escucho. Con Enter, el prompt va a ' + s.nombre + '.';
    if (est === 'esperando') { const p = RA.chat && RA.chat.permiso(s.id); return p ? s.nombre + ' necesita permiso para usar ' + p.herramienta + '.' : s.est === 'espera' ? s.nombre + ' espera que apruebes el diseño.' : s.nombre + ' terminó su turno y espera tu respuesta.'; }
    if (est === 'juego') return 'Modo juego: el modelo local está en pausa. Claude Code sigue disponible.';
    if (est === 'continuidad') return 'Claude no está disponible ahora: las tareas pequeñas siguen con otros modelos y el resto espera.';
    if (est === 'pensando') return 'Un asistente auxiliar está trabajando.';
    if (est === 'trabajando') return ult ? C.agente(s, ult.ag).cod + ' · ' + herr(ult.h) + ' ' + ult.res : 'Empezando ' + s.nombre + '.';
    if (est === 'termino') return s.nombre + ' terminó: ' + plural(c.llamadas, 'llamada', 'llamadas') + ' y ' + plural(c.errores, 'error', 'errores') + ' en ' + ui.dur(c.ms) + '.';
    if (est === 'error') { const e = evs.filter(x => x.est === 'error').pop(); return el('span', { class: 'mal' }, e ? herr(e.h) + ': ' + String(e.err).split('\n')[0] : s.nombre + ' terminó con un error.'); }
    return s.est === 'espera' ? s.nombre + ' espera que apruebes el diseño.' : s.est === 'detenido' ? s.nombre + ' se detuvo.' : 'Nada en marcha en ' + s.nombre + '.';
  }
  /* Estado de la mascota para la sesión elegida. Un prompt enviado desde el campo manda sobre el del
     transcript mientras dura (el transcript tarda un par de segundos en reflejarlo). */
  function estadoMascota(s) {
    const a = document.activeElement, c = RA.chat && RA.chat.estado(s.id);
    if (D.modoJuego) return 'juego';
    if (D.continuidad) return 'continuidad';
    if (RA.chat && RA.chat.permiso(s.id)) return 'esperando';
    if (c === 'enviando' || c === 'respondiendo') return 'trabajando';
    if (a && a.id === 'masc-prompt') return 'escuchando';
    if (s.est === 'espera' || (s.est === 'listo' && s.vivo)) return 'esperando';
    return { curso: 'trabajando', deteniendo: 'trabajando', listo: 'termino', error: 'error' }[s.est] || 'reposo';
  }
  function mascota(s) {
    const U = D.estado.uso, est = estadoMascota(s);
    ui.pintar($('#masc-figura'), G.mascota(est, 'Mascota: ' + NOMBRE_MASC[est].toLowerCase()));
    ui.pintar($('#masc-burbuja'), [ui.insignia(NOMBRE_MASC[est], est === 'error' ? 'alerta' : ''), el('p', {}, frase(s, est))]);
    ui.pintar($('#masc-uso'), U.bloques.length ? [el('span', { class: 'label' }, 'Sesión')].concat(bloqueUso(U.bloques[0], U.fuente, 'chica')) : el('p', { class: 'note' }, 'Sin dato de uso todavía: aparecerá con la primera respuesta de Claude.'));
  }


  /* Cuerpo de un bloque de uso. Sin fuente oficial no hay porcentaje: solo los tokens contados y el
     medidor apagado. clase: tamaño de la cifra. Es el único sitio que pinta un bloque de uso: lo usan
     la vista Uso y la mascota, así que nunca enseñan cifras distintas.
     El porcentaje se redondea una sola vez: el rojo sigue a la cifra que se lee (89,6 se lee 90 y ya es rojo). */
  const QUIEN = { five_hour: 'la sesión', seven_day: 'la semana' };
  function bloqueUso(b, fuente, clase) {
    const pct = b.pct == null ? null : Math.round(b.pct), cerca = pct != null && pct >= 90, tk = ui.tokensPartes(b.tokens || 0), r = b.reinicia ? new Date(b.reinicia) : null;
    const reinicio = r ? 'Se restablece el ' + diaCorto.format(r).replace('.', '') + ', ' + horaMin.format(r) : 'Reinicio desconocido';
    const dicho = pct + ' por ciento de ' + (QUIEN[b.id] || b.nombre) + (r ? ', se restablece el ' + diaLargo.format(r) + ' a las ' + horaMin.format(r) : ', reinicio desconocido') + '.';
    return [
      el('div', { class: 'badges' }, [cerca ? ui.insignia('Cerca del límite', 'alerta') : null, ui.insignia(fuente === 'oficial' ? 'Oficial' : 'Estimado')]),
      el('b', { class: clase + (cerca ? ' alto' : '') }, pct != null ? [ui.cifra(pct), el('small', {}, '%')] : [tk[0], el('small', {}, (tk[1] + ' tokens').trim())]),
      pct != null ? ui.medidor(pct, b.nombre, dicho) : ui.medidor(null, b.nombre, 'sin porcentaje, no hay una fuente oficial que lo dé'),
      el('span', { class: 'mono' }, pct != null ? reinicio : 'Sin porcentaje: no hay fuente oficial')
    ];
  }

  /* Fila 1 (c): carrete con las últimas llamadas de todos los agentes. La más reciente va abajo, junto
     al cursor rojo; las anteriores se desvanecen por opacidad. Cuando llega una nueva, la columna
     sube una línea (salvo con "menos movimiento"). Es un adorno de la línea de tiempo: no se anuncia. */
  function carrete(s) {
    const app = RA.app, ult = s.eventos.slice().sort((a, b) => a.t - b.t).slice(-6);
    const ultimo = ult.length ? s.id + ult[ult.length - 1].id : '';
    const sube = app.carrete && app.carrete !== ultimo && app.carrete.indexOf(s.id) === 0;
    app.carrete = ultimo;
    ui.pintar($('#carrete'), [
      el('ul', { class: 'carrete' + (sube ? ' sube' : ''), 'aria-label': 'Últimas llamadas de herramienta' }, ult.map(e => el('li', {}, [
        G.svg(G.deHerramienta(e.h), null), el('span', {}, C.agente(s, e.ag).cod), el('span', { class: 't' }, herr(e.h) + ' ' + e.res)
      ]))),
      el('div', { class: 'carrete-pie' }, s.est === 'curso' ? el('i', { role: 'img', 'aria-label': 'En curso' }) : el('i', { class: 'fin', role: 'img', 'aria-label': 'Sesión terminada' }))
    ]);
  }

  function arbol(s) {
    const S = sel();
    const nodo = (a, niv) => {
      const hijos = s.agentes.filter(h => h.padre === a.id), n = C.eventos(s, a.id).length, ms = C.durAgente(a);
      const abierto = !RA.app.cerrados[s.id + a.id];
      return el('li', {
        role: 'treeitem', 'data-id': a.id, 'aria-level': String(niv), 'aria-selected': String(a.id === S.agente),
        tabindex: a.id === S.agente ? '0' : '-1', 'aria-expanded': hijos.length ? String(abierto) : null
      }, [
        el('div', { class: 'nodo' }, [
          G.deAgente(a, null), ui.insignia(a.cod), el('span', { class: 'tipo' }, a.tipo), ui.estado(a.est),
          el('span', { class: 'meta', 'data-dur': a.id }, (ms == null ? 'sin empezar' : ui.dur(ms)) + ' · ' + plural(n, 'llamada', 'llamadas'))
        ]),
        hijos.length && abierto ? el('ul', { role: 'group' }, hijos.map(h => nodo(h, niv + 1))) : null
      ]);
    };
    ui.pintar($('#arbol'), s.agentes.filter(a => !a.padre).map(a => nodo(a, 1)));
  }

  // Resultado de un paso en una línea, para la cabecera de su subtarjeta.
  function vistaPrevia(e) {
    if (e.est === 'error') return el('span', { class: 'mal' }, herr(e.h) + ': ' + String(e.err).split('\n')[0]);
    if (e.parche || e.cuenta) { const c = e.cuenta || C.cuenta(e.parche); return '+' + c.mas + ' −' + c.menos + (e.nuevo ? ' · archivo nuevo' : ''); }
    if (e.sinDiff) return 'cambio sin diferencias';
    if (e.est === 'curso') return e.fondo ? 'en segundo plano' : 'en curso';
    return String(e.sal || 'sin salida').split('\n')[0];
  }

  /* Línea de tiempo vertical del agente elegido: un nodo por paso sobre el riel, el título con la
     duración como chip y, debajo, una subtarjeta con quién lo hizo y su resultado. La subtarjeta se
     despliega para ver el detalle (entrada, salida o un fragmento del diff). Las cabeceras de las
     subtarjetas son una sola parada de tabulador: las flechas se mueven entre ellas. */
  function tiempo(s) {
    const S = sel(), a = C.agente(s, S.agente), caja = $('#tiempo'), y = caja.scrollTop;
    const pegado = !caja.firstChild || caja.scrollHeight - y - caja.clientHeight < 48;
    ui.segmentado($('#tl-filtro'), [['todo', 'Todo'], ['errores', 'Errores'], ['cambios', 'Cambios']], S.filtro, v => { S.filtro = v; tiempo(s); }, 'Filtrar pasos');
    let evs = C.eventos(s, a.id);
    if (S.filtro === 'errores') evs = evs.filter(e => e.est === 'error');
    else if (S.filtro === 'cambios') evs = evs.filter(e => e.parche || e.cuenta || e.sinDiff);
    // Una sesión larga tiene miles de pasos: se pintan los últimos y los anteriores se piden con un botón.
    const total = evs.length, tope = S.tope || 150;
    if (total > tope) evs = evs.slice(total - tope);
    const foco = evs.some(e => e.id === S.evento) ? S.evento : evs.length ? evs[evs.length - 1].id : null;
    const pasos = evs.map(e => {
      const hijo = e.hijo && C.agente(s, e.hijo), abierto = e.id === S.evento;
      return el('li', { class: 'paso', 'data-id': e.id }, [
        ui.estado(e.est, true),
        el('div', { class: 'paso-cab' }, [
          G.svg(G.deHerramienta(e.h), null), el('span', { class: 'nom', title: e.h }, herr(e.h)),
          el('span', { class: 'res' }, e.res + (hijo ? ' → ' + hijo.cod : '')),
          e.fondo ? ui.insignia('Segundo plano') : el('span', { class: 'chip' }, e.dur == null ? 'en curso' : ui.dur(e.dur))
        ]),
        el('button', { type: 'button', class: 'sub-cab', 'data-id': e.id, 'aria-expanded': String(abierto), 'aria-controls': abierto ? 'det-' + e.id : null, tabindex: e.id === foco ? '0' : '-1' }, [
          agMini(a), el('span', { class: 'sr' }, herr(e.h) + ' ' + e.res + ': '), el('span', { class: 'vista' }, vistaPrevia(e)), ui.galon()
        ]),
        abierto ? detalle(s, e) : null
      ]);
    });
    // Final del riel: borde vivo si el agente sigue en curso; círculo relleno si ya terminó.
    const enCurso = a.est === 'curso' && s.est === 'curso';
    const cola = enCurso ? el('div', { class: 'vivo', role: 'img', 'aria-label': 'En curso' }) : a.t0 ? el('div', { class: 'fin', role: 'img', 'aria-label': 'Fin de la actividad' }) : null;
    ui.pintar(caja, [
      total > tope ? el('button', { type: 'button', class: 'btn btn-small', id: 'ver-antes', onclick: () => { S.tope = tope + 300; tiempo(s); } }, 'Ver ' + Math.min(300, total - tope) + ' pasos anteriores') : null,
      el('div', { class: 'riel' }, [
        evs.length ? el('ol', { id: 'pasos', class: 'pasos', 'aria-label': 'Pasos de ' + a.cod + ', ' + a.tipo }, pasos)
          : el('p', { class: 'note' }, S.filtro === 'todo' ? 'Este agente aún no tiene pasos.' : 'Ningún paso con este filtro.'),
        cola
      ])
    ]);
    $('#tl-nota').textContent = a.cod + ' · ' + plural(total, 'paso', 'pasos');
    // El borde vivo se queda fijo mientras llegan eventos y parpadea tras 600 ms sin ninguno.
    clearTimeout(RA.app.tQuieto);
    if (enCurso) RA.app.tQuieto = setTimeout(() => cola.classList.add('quieto'), 600);
    caja.scrollTop = pegado ? caja.scrollHeight : y;   // sigue al borde vivo, salvo que la persona haya subido
    $('#ir-final').hidden = caja.scrollHeight - caja.scrollTop - caja.clientHeight < 48;
  }

  // Entrada o salida de un evento: texto tal cual, con desplazamiento propio.
  function bloqueDato(titulo, texto, error) {
    if (!texto) return null;
    const largo = texto.length > 700 || texto.split('\n').length > 13;
    const pre = el('pre', { class: 'dato' + (error ? ' err' : ''), tabindex: '0', role: 'group', 'aria-label': titulo }, texto);
    return el('div', { class: 'col' }, [
      el('div', { class: 'row between' }, [el('h3', { class: 'label' }, titulo), el('div', { class: 'row' }, [
        largo ? el('button', {
          type: 'button', class: 'btn btn-small', 'aria-pressed': 'false',
          onclick: ev => { const on = pre.classList.toggle('todo'); ev.currentTarget.setAttribute('aria-pressed', String(on)); }
        }, 'Mostrar todo') : null,
        el('button', { type: 'button', class: 'btn btn-small', onclick: () => ui.copiar(texto, titulo) }, 'Copiar')
      ])]),
      pre
    ]);
  }

  // Detalle de un paso, dentro de su subtarjeta: estado y hora; un fragmento del diff si el paso
  // cambió un archivo, o su entrada y su salida si no.
  function detalle(s, e) {
    const cab = el('div', { class: 'row between' }, [
      el('div', { class: 'badges' }, [ui.insigniaEstado(e.est), e.fondo ? ui.insignia('Segundo plano') : null]),
      el('span', { class: 'chip' }, ui.hora(e.t) + (e.dur == null ? '' : ' · ' + ui.dur(e.dur)))
    ]);
    let cuerpo;
    if (pedir(s, e, () => { if (sel().evento === e.id && sel().vista === 'chat') repintar(() => tiempo(s), 'data-id'); })) cuerpo = [el('p', { class: 'label' }, 'Cargando')];
    else if (e.parche && e.parche.length && e.est !== 'error') {
      const h = e.parche[0], frag = el('div', { class: 'diff' });
      let v = h.viejo, n = h.nuevo;
      h.lineas.slice(0, 8).forEach(l => {
        if (l[0] === '+') frag.appendChild(lineaDiff('mas-l', '', n++, '+', l.slice(1), 'Añadida', true));
        else if (l[0] === '-') frag.appendChild(lineaDiff('menos-l', v++, '', '−', l.slice(1), 'Eliminada', true));
        else { frag.appendChild(lineaDiff('', '', n++, '', l.slice(1), '', true)); v++; }
      });
      const resto = e.parche.reduce((x, p) => x + p.lineas.length, 0) - Math.min(8, h.lineas.length);
      cuerpo = [
        el('div', { class: 'mono' }, ui.ruta(e.archivo)), frag,
        el('div', { class: 'row between' }, [
          el('span', { class: 'note' }, resto > 0 ? '+' + resto + (resto === 1 ? ' línea más' : ' líneas más') + ' en Cambios' : ''),
          el('button', { type: 'button', class: 'btn btn-small', onclick: () => { sel().archivo = s.id + '|' + e.archivo; RA.app.ir('cambios'); } }, 'Ver en Cambios')
        ])
      ];
    } else cuerpo = [
      bloqueDato('Entrada', e.ent),
      // El error va precedido de su origen: la señal no es solo el color.
      e.err ? bloqueDato('Salida', herr(e.h) + ': ' + e.err, true) : bloqueDato('Salida', e.sal),
      e.mas ? el('p', { class: 'note' }, '+' + ui.num(e.mas) + ' caracteres que no se muestran (tope de 20 KB por entrada o salida).') : null
    ];
    return el('div', { id: 'det-' + e.id, class: 'sub-cuerpo' }, [cab].concat(cuerpo));
  }

  // =====================================================================================
  // Sesiones
  // =====================================================================================
  function sesiones() {
    const E = D.estado, S = sel();
    ui.segmentado($('#ses-filtro'), [['todas', 'Todas'], ['curso', 'En curso'], ['espera', 'Por aprobar'], ['fin', 'Terminadas']], S.filtroSes, v => { S.filtroSes = v; sesiones(); }, 'Filtrar sesiones');
    const pasa = { todas: () => true, curso: s => s.est === 'curso' || s.est === 'deteniendo', espera: s => s.est === 'espera', fin: s => ['listo', 'error', 'detenido'].indexOf(s.est) >= 0 }[S.filtroSes];
    // Lo que necesita a la persona (error o esperando) va primero; el resto conserva su orden (más reciente arriba).
    const prio = s => { const c = tarjeta(s).clave; return c === 'error' || c === 'esperando' ? 0 : 1; };
    const lista = E.sesiones.filter(pasa).map((s, i) => [s, i]).sort((a, b) => prio(a[0]) - prio(b[0]) || a[1] - b[1]).map(x => x[0]);
    // Una sesión recién creada tarda un instante en llegar: en cuanto llega, es la elegida.
    if (RA.app.pendiente && C.sesion(RA.app.pendiente)) { S.detalle = RA.app.pendiente; RA.app.pendiente = null; }
    if (lista.indexOf(C.sesion(S.detalle)) < 0) S.detalle = lista.length ? lista[0].id : null;
    ui.segmentado($('#ses-modo'), [['mapa', 'Mapa'], ['tarjetas', 'Lista']], S.sesVista, v => { S.sesVista = v; sesiones(); }, 'Ver agentes como');
    const mapa = S.sesVista === 'mapa' && RA.mapaOrq;
    $('#ag').hidden = !mapa; $('#ses-dos').hidden = !!mapa; $('#ag-alcance').hidden = !mapa;
    $('#v-sesiones').classList.toggle('con-mapa', !!mapa);
    if (mapa) {
      ui.segmentado($('#ag-alcance'), [['sesion', 'Sesión elegida'], ['todas', 'Todas las sesiones']], S.agAlcance, v => { S.agAlcance = v; RA.mapaOrq.encajarPronto(); sesiones(); }, 'Qué agentes ver');
      RA.mapaOrq.pintar($('#ag'), { alcance: S.agAlcance, sesion: actual(), sesiones: E.sesiones, contexto: $('#ag-contexto'),
        alAbrirChat: id => { if (!C.sesion(id)) return; S.sesion = id; S.agente = null; S.evento = null; RA.app.ir('chat'); } });
      return;
    }
    ui.pintar($('#ses-lista'), lista.length ? lista.map(filaSesion) : el('li', { class: 'note' }, E.sesiones.length ? 'Ninguna sesión con este filtro. Elige «Todas» para verlas.' : 'Todavía no hay sesiones. Pulsa Crear sesión para empezar.'));
    detalleSesion(C.sesion(S.detalle));
  }

  const verEnVivo = s => { const S = sel(); S.sesion = s.id; S.agente = null; S.evento = null; RA.app.ir('chat'); };

  /* Estado de la tarjeta de una sesión, en las palabras de la persona: trabajando, esperando tu respuesta
     (un permiso pendiente, una aprobación, o el turno cerrado con la sesión aún abierta), terminada,
     error o detenida; con la forma de punto de siempre y la última acción. */
  const TARJETA = { trabajando: 'Trabajando', esperando: 'Esperando tu respuesta', terminada: 'Terminada', error: 'Error', detenida: 'Detenida' };
  function tarjeta(s) {
    const ch = RA.chat, p = ch && ch.permiso(s.id), enChat = ch && /enviando|respondiendo/.test(ch.estado(s.id) || '');
    const clave = p || s.est === 'espera' || (s.est === 'listo' && s.vivo) ? 'esperando' : s.est === 'curso' || s.est === 'deteniendo' || enChat ? 'trabajando' : s.est === 'error' ? 'error' : s.est === 'listo' ? 'terminada' : 'detenida';
    const ev = s.eventos.reduce((m, e) => !m || e.t > m.t ? e : m, null);
    const ultima = p ? 'Pide permiso: ' + p.herramienta + ' ' + p.entrada.split('\n')[0].slice(0, 80) : ev ? herr(ev.h) + ' ' + ev.res : 'Sin acciones todavía';
    return { clave: clave, nombre: TARJETA[clave], ultima: ultima, forma: { trabajando: 'curso', esperando: 'espera', terminada: 'listo', error: 'error', detenida: 'detenido' }[clave] };
  }
  // El tiempo de las tarjetas avanza solo, sin repintar la lista (que quitaría el foco).
  setInterval(() => { if (sel().vista !== 'sesiones') return; ui.$$('#ses-lista [data-t0]').forEach(n => { const t0 = +n.dataset.t0, t1 = +n.dataset.t1; if (t0 && !t1) n.textContent = ui.dur(D.ahora() - t0); }); }, 1000);

  function filaSesion(s) {
    const S = sel(), viva = ['curso', 'espera'].indexOf(s.est) >= 0;
    const botones = [
      el('button', { type: 'button', class: 'btn btn-small', 'aria-pressed': String(s.id === S.detalle), 'data-detalle': s.id, onclick: () => { S.detalle = s.id; sesiones(); ui.$('[data-detalle="' + s.id + '"]').focus(); } }, 'Ver detalle'),
      el('button', { type: 'button', class: 'btn btn-small', onclick: () => verEnVivo(s) }, 'Abrir en Chat')
    ];
    // Control solo sobre lo que lanzó la app; el resto es de solo lectura y no enseña botones.
    if (s.origen === 'app' && viva) botones.push(ui.armar(el('button', { type: 'button', class: 'btn btn-small', 'data-detener': s.id }, 'Detener'), '¿Detener?', () => { const trabajaba = s.est === 'curso'; Promise.resolve(D.detener(s.id)).then(r => { if (r && r.error) return; ui.decir('Sesión ' + s.nombre + ' detenida.', trabajaba ? { tipo: 'ok', sesion: s.id, accion: { texto: 'Deshacer', fn: () => deshacerDetener(s) } } : { tipo: 'ok', sesion: s.id }); }); }));
    const t = tarjeta(s);
    return el('li', { class: 'ses' + (s.id === S.detalle ? ' sel' : '') + (t.clave === 'esperando' ? ' atencion' : '') }, [
      el('div', { class: 'row between' }, [
        el('div', { class: 'ses-nom' }, [ui.estado(t.forma), el('span', {}, s.nombre)]),
        el('div', { class: 'row' }, [ui.insignia(t.nombre, t.clave === 'error' || t.clave === 'esperando' ? 'alerta' : ''), el('span', { class: 'chip', 'data-t0': s.t0 || '', 'data-t1': s.t1 || '' }, ui.dur((s.t1 || D.ahora()) - s.t0))])
      ]),
      el('div', { class: 'ses-ult' }, [el('span', { class: 'label' }, 'Última acción'), el('span', { class: 'mono' }, t.ultima)]),
      el('div', { class: 'mono' }, ui.ruta(s.carpeta)),
      el('div', { class: 'badges' }, insigniasSesion(s)),
      el('div', { class: 'row' }, botones)
    ]);
  }

  function detalleSesion(s) {
    const caja = $('#ses-detalle');
    if (!s) return ui.pintar(caja, null);
    const c = C.cifras(s), par = (k, v) => [el('dt', { class: 'label' }, k), el('dd', {}, v)];
    ui.pintar(caja, [
      ui.tarjeta('Sesión', [
        el('div', { class: 'row between' }, [el('span', { class: 'chica' }, s.nombre), el('div', { class: 'badges' }, insigniasSesion(s))]),
        el('dl', { class: 'resumen' }, [].concat(
          par('Carpeta', el('span', { class: 'mono' }, ui.ruta(s.carpeta))),
          par('Inicio y duración', ui.fecha(s.t0) + ', ' + ui.hora(s.t0) + ' · ' + ui.dur(c.ms)),
          par('Actividad', plural(s.agentes.length, 'agente', 'agentes') + ' · ' + plural(c.llamadas, 'llamada', 'llamadas') + ' · ' + plural(c.errores, 'error', 'errores')),
          // Solo en sesiones que lanzó la app: por qué falló y cuántas veces se le denegó un permiso.
          s.fallo ? par('Fallo', el('span', { class: 'mal' }, s.fallo)) : [],
          s.denegados ? par('Permisos denegados', plural(s.denegados, 'vez', 'veces') + ': lo que no estaba en la lista se denegó sin preguntar.') : [],
          // Añadido 3: qué hace ahora, con qué modelo y modo, y su avance (solo si tiene lista de tareas).
          queHace(s, par)
        )),
        trabajoReciente(s),
        !s.resumen && s.est === 'curso' ? el('p', { class: 'note' }, 'El resumen se genera al terminar la sesión.') : null,
        el('div', { class: 'row' }, [el('button', { type: 'button', class: 'btn btn-small', id: 'reproducir', onclick: () => RA.repro && RA.repro.abrir(s.id) }, 'Reproducir sesión'),
          window.rastro && s.encargo ? el('button', { type: 'button', class: 'btn btn-small', id: 'sugerir-titulo', title: 'Un asistente propone un título; se guarda en Rastro, no en Claude Code', onclick: () => window.rastro.asistentesTitulo(s.id).then(r => ui.decir(r && r.titulo ? 'Título: ' + r.titulo : (r && r.error) || 'No se pudo.'), () => ui.decir('No se pudo.')) }, 'Sugerir título') : null])
      ], { ir: () => verEnVivo(s), irNombre: 'Abrir ' + s.nombre + ' en Chat' }),
      s.est === 'espera' ? puerta(s) : null,
      s.resumen ? resumen(s) : D.detalle && ['listo', 'error', 'detenido'].indexOf(s.est) >= 0 ? sinResumen(s) : null
    ]);
  }

  /* "Qué hace cada agente" en detalle (Añadido 3): acción actual, modelo, modo y tareas. El avance sale solo
     de la lista de tareas de la sesión; sin ella se dice, sin inventar un número. */
  function queHace(s, par) {
    const t = tarjeta(s), m = D.modoDe(s), p = s.plan && s.plan.total ? s.plan : null;
    const ev = s.eventos.reduce((x, e) => !x || e.t > x.t ? e : x, null);
    return [].concat(
      par('Ahora', el('span', { class: 'mono' }, /^Pide permiso/.test(t.ultima) || !ev ? t.ultima : ev.h + ' · ' + ev.res)),
      par('Modelo', s.modelo ? ui.modelo(s.modelo).replace(/^\w/, c => c.toUpperCase()) + (s.esfuerzo ? ' · esfuerzo ' + s.esfuerzo : '') : 'No informado por Claude Code'),
      par('Modo de uso', m ? (m.id === 'bypassPermissions' ? ui.insignia('Sin permisos', 'alerta sinperm') : m.nombre) : 'No informado por Claude Code'),
      par('Tareas', p ? p.hechas + ' de ' + p.total + ' (' + Math.round(100 * p.hechas / p.total) + ' %)' + (p.actual ? ' · en curso: ' + p.actual : '') : 'Esta sesión no tiene lista de tareas: no hay porcentaje.')
    );
  }
  // Últimas acciones, archivos tocados y subagentes (con su modelo y su tarea) de la sesión.
  function trabajoReciente(s) {
    const evs = s.eventos.slice().sort((a, b) => b.t - a.t), arch = {};
    evs.forEach(e => { if (e.archivo && e.cuenta) { const a = arch[e.archivo] = arch[e.archivo] || { mas: 0, menos: 0 }; a.mas += e.cuenta.mas; a.menos += e.cuenta.menos; } });
    const subs = s.agentes.filter(a => a.id !== 'p');
    return el('div', { class: 'col det-trabajo' }, [
      el('h3', { class: 'label' }, 'Últimas acciones'),
      evs.length ? el('ol', { class: 'det-acc mono' }, evs.slice(0, 5).map(e => el('li', {}, [el('span', { class: 'note' }, ui.hora(e.t) + ' '), C.agente(s, e.ag).cod + ' · ' + e.h + ' · ' + e.res]))) : el('p', { class: 'note' }, 'Sin acciones todavía.'),
      el('h3', { class: 'label' }, 'Archivos tocados'),
      Object.keys(arch).length ? el('ul', { class: 'det-arch mono' }, Object.keys(arch).slice(0, 8).map(k => el('li', {}, ui.ruta(k) + ' · +' + arch[k].mas + ' −' + arch[k].menos))) : el('p', { class: 'note' }, 'Ningún archivo cambiado.'),
      subs.length ? el('h3', { class: 'label' }, 'Subagentes') : null,
      subs.length ? el('ul', { class: 'det-sub' }, subs.slice(0, 12).map(a => el('li', {}, [el('span', { class: 'mono' }, a.cod + ' · ' + a.tipo), a.tarea ? ' — ' + a.tarea : '',
        el('div', { class: 'note' }, (a.modelo ? ui.modelo(a.modelo).replace(/^\w/, c => c.toUpperCase()) : 'Modelo no informado por Claude Code') + ' · ' + (ESTADOS_AG[a.est] || a.est))]))) : null
    ]);
  }
  const ESTADOS_AG = { curso: 'trabajando', listo: 'terminado', error: 'con error', detenido: 'detenido', cola: 'en cola', nodatos: 'sin datos' };

  /* En la app, el resumen de una sesión que Rastro no lanzó se genera a petición. Con la IA local
     (por defecto) no hace falta la cuenta de Claude; con Haiku, cada resumen gasta la suscripción. */
  function sinResumen(s) {
    const local = D.resumenLocal, a = local ? { ok: true } : D.auth || { ok: false, motivo: 'No se pudo comprobar la autenticación.' }, motivo = a.ok ? s.bloqueo : a.motivo;
    return ui.tarjeta('Resumen de cierre', [
      el('p', { class: 'note' }, 'Aún no hay resumen de esta sesión. Se genera con ' + (local ? 'la IA local (' + local + ')' : ui.modelo(D.ajustes.modelos.resumen)) + ' a partir de un registro condensado y enmascarado (herramientas, rutas, duraciones y errores), nunca del contenido.'),
      motivo ? el('p', {}, [ui.insignia(local ? 'No se pudo generar' : 'Bloqueado: revisa tu cuenta', 'alerta'), ' ' + motivo]) : null,
      el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn btn-small', id: 'regenerar', disabled: !a.ok, onclick: () => D.regenerar(s.id) }, 'Generar resumen'))
    ], { id: 't-resumen' });
  }

  // Puerta de aprobación: ninguna fase de código arranca sin pasar por aquí.
  function puerta(s) {
    // Cada fase es una sesión nueva: al lanzarla, el detalle la sigue.
    const seguir = (r, frase) => { if (r && r.error) return; if (r && r.id) { RA.app.pendiente = r.id; sel().sesVista = 'tarjetas'; sesiones(); } ui.decir(frase); };
    const pedir = el('div', { class: 'col', hidden: true }, [
      el('label', { class: 'label', for: 'puerta-cambios' }, 'Qué hay que cambiar'),
      el('textarea', { id: 'puerta-cambios', class: 'input', rows: '3' }),
      el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn btn-small', id: 'puerta-enviar', onclick: () => Promise.resolve(D.pedirCambios(s.id, $('#puerta-cambios').value)).then(r => seguir(r, 'Cambios enviados: el diseño vuelve a empezar.')) }, 'Enviar cambios'))
    ]);
    const modelo = el('div', { id: 'puerta-modelo' });
    const pintaModelo = () => ui.segmentado(modelo, D.MODELOS, s.modelos.codigo, v => { s.modelos.codigo = v; pintaModelo(); }, 'Modelo de la fase de código');
    pintaModelo();
    return ui.tarjeta('Puerta de aprobación del diseño', [
      el('p', {}, 'El diseño está listo. La fase de código no arranca hasta que lo apruebes.'),
      el('ul', { class: 'lista' }, (s.entregables || []).map(f => el('li', {}, el('span', { class: 'crece mono' }, ui.ruta(f))))),
      el('div', { class: 'campo' }, [el('span', { class: 'label' }, 'Modelo de la fase de código'), modelo]),
      el('div', { class: 'row' }, [
        el('button', { type: 'button', class: 'btn', id: 'puerta-maqueta', onclick: () => { if (D.abrirMaqueta) D.abrirMaqueta(s.id); else ui.decir('En la app de escritorio, esto abre la maqueta en el navegador.'); } }, 'Abrir maqueta'),
        el('button', { type: 'button', class: 'btn', 'aria-expanded': 'false', onclick: ev => { pedir.hidden = !pedir.hidden; ev.currentTarget.setAttribute('aria-expanded', String(!pedir.hidden)); if (!pedir.hidden) $('#puerta-cambios').focus(); } }, 'Pedir cambios'),
        el('button', { type: 'button', class: 'btn btn-primary', id: 'aprobar', onclick: () => { const m = s.modelos.codigo; Promise.resolve(D.aprobar(s.id, m)).then(r => seguir(r, 'Diseño aprobado: empieza la fase de código con ' + ui.modelo(m) + '.')); } }, 'Aprobar y programar')
      ]),
      pedir
    ], { id: 't-puerta', clase: 'puerta' });
  }

  function resumenTexto(s) {
    const r = s.resumen, l = x => (x || []).map(i => '- ' + i).join('\n');
    return '# ' + s.nombre + '\n\n## Objetivo\n' + (r.objetivo || '') + '\n\n## Lo que se hizo\n' + l(r.hecho) + '\n\n## Archivos cambiados\n' +
      (r.archivos || []).map(a => '- ' + a.ruta + ' (+' + a.mas + ' −' + a.menos + ')').join('\n') + '\n\n## Errores\n' + l(r.errores) + '\n\n## Pendientes\n' + l(r.pendientes) +
      '\n\n_Generado por ' + ui.modelo(r.modelo) + ' a partir de un registro condensado._\n';
  }

  function resumen(s) {
    const r = s.resumen, lista = x => el('ul', {}, (x || []).map(i => el('li', {}, i)));
    let cuerpo;
    if (r.est === 'generando') cuerpo = [el('p', { class: 'label' }, 'Generando')];
    else if (r.est === 'fallo') cuerpo = [
      el('p', {}, [el('span', { class: 'mal' }, 'No se pudo generar el resumen.'), ' ' + (r.error || '') + ' La sesión no se pierde: este es su registro condensado.']),
      el('pre', { class: 'dato', tabindex: '0', role: 'group', 'aria-label': 'Registro condensado' }, r.registro.join('\n'))
    ];
    else cuerpo = [el('dl', { class: 'resumen' }, [
      el('dt', { class: 'label' }, 'Objetivo'), el('dd', {}, r.objetivo),
      el('dt', { class: 'label' }, 'Lo que se hizo'), el('dd', {}, lista(r.hecho)),
      el('dt', { class: 'label' }, 'Archivos cambiados'), el('dd', {}, el('ul', { class: 'lista' }, r.archivos.map(a => el('li', {}, [el('span', { class: 'crece mono' }, ui.ruta(a.ruta)), chipCambio({ e: {}, mas: a.mas, menos: a.menos })])))),
      el('dt', { class: 'label' }, 'Errores y cómo se resolvieron'), el('dd', {}, r.errores.length ? lista(r.errores) : 'Ninguno.'),
      el('dt', { class: 'label' }, 'Pendientes'), el('dd', {}, r.pendientes.length ? lista(r.pendientes) : 'Ninguno.')
    ])];
    return ui.tarjeta('Resumen de cierre', cuerpo.concat(el('div', { class: 'row' }, [
      el('button', { type: 'button', class: 'btn btn-small', id: 'regenerar', disabled: r.est === 'generando', onclick: () => D.regenerar(s.id) }, r.est === 'fallo' ? 'Reintentar' : 'Regenerar'),
      r.est === 'listo' ? el('button', { type: 'button', class: 'btn btn-small', onclick: () => ui.copiar(resumenTexto(s), 'Resumen') }, 'Copiar') : null,
      r.est === 'listo' ? el('button', { type: 'button', class: 'btn btn-small', onclick: () => ui.descargar(s.nombre + '-resumen.md', resumenTexto(s), 'text/markdown') }, 'Exportar .md') : null
    ])), { id: 't-resumen', pie: r.est === 'listo' ? ui.insignia('Generado por ' + ui.modelo(r.modelo)) : null });
  }

  // =====================================================================================
  // Cambios
  // =====================================================================================
  function cambios() {
    const S = sel(), todos = C.cambios();
    ui.segmentado($('#cam-grupo'), [['no', 'Sin agrupar'], ['sesion', 'Por sesión'], ['agente', 'Por agente']], S.grupo, v => { S.grupo = v; cambios(); }, 'Agrupar archivos');
    ui.segmentado($('#cam-modo'), [['linea', 'En línea'], ['partido', 'Dividida']], S.modoDiff, v => { S.modoDiff = v; cambios(); }, 'Vista del diff');
    $('#cam-copiar').hidden = !todos.length;
    if (!todos.length) { ui.pintar($('#cam-lista'), el('p', { class: 'note' }, 'Todavía no hay cambios. Cuando una sesión edite archivos aparecerán aquí; elige otra sesión arriba si esperabas verlos.')); ui.pintar($('#cam-diff'), null); $('#cam-nota').textContent = ''; return; }

    // Un archivo por fila (por sesión): cuántas veces se leyó y se escribió, quién lo tocó el último y cuándo.
    const filas = [];
    D.estado.sesiones.forEach(s => C.archivos(s).forEach(f => { if (todos.some(c => c.s === s && c.archivo === f.archivo)) filas.push(Object.assign({ s: s, id: s.id + '|' + f.archivo }, f)); }));
    filas.sort((a, b) => b.t - a.t);
    if (!filas.some(f => f.id === S.archivo)) S.archivo = filas[0].id;
    const clave = { no: () => '', sesion: f => f.s.nombre, agente: f => f.a.cod + ' · ' + f.a.tipo + ' · ' + f.s.nombre }[S.grupo];
    let grupo = null;
    const trs = [];
    (S.grupo === 'no' ? filas : filas.slice().sort((a, b) => clave(a) < clave(b) ? -1 : clave(a) > clave(b) ? 1 : b.t - a.t)).forEach(f => {
      if (clave(f) !== grupo && S.grupo !== 'no') { grupo = clave(f); trs.push(el('tr', {}, el('td', { colspan: '5', class: 'grupo label' }, grupo))); }
      const boton = el('button', { type: 'button', class: 'enlace', 'data-archivo': f.id, 'aria-current': f.id === S.archivo ? 'true' : null, onclick: () => { S.archivo = f.id; cambios(); ui.$('[data-archivo="' + CSS.escape(f.id) + '"]').focus(); } }, ui.ruta(f.archivo));
      trs.push(el('tr', { class: f.id === S.archivo ? 'sel' : '' }, [
        el('td', { class: 'ancha' }, boton), el('td', {}, agMini(f.a)), el('td', { class: 'num' }, ui.num(f.lecturas)), el('td', { class: 'num' }, ui.num(f.escrituras)), el('td', {}, ui.hora(f.t))
      ]));
    });
    // Aquí la tabla de archivos va en una columna estrecha: cabeceras abreviadas, con su nombre entero.
    const tabla = ui.tabla(['Archivo', 'Agente', ['Lect.', 'num'], ['Escr.', 'num'], 'Hora'], trs);
    tabla.classList.add('densa');
    [[2, 'Lecturas'], [3, 'Escrituras'], [4, 'Última vez']].forEach(c => { const th = tabla.tHead.rows[0].cells[c[0]]; th.title = c[1]; th.setAttribute('aria-label', c[1]); });
    ui.pintar($('#cam-lista'), el('div', { class: 'table-wrap' }, tabla));

    let mios = todos.filter(c => c.s.id + '|' + c.archivo === S.archivo).reverse();   // en orden cronológico
    const partido = S.modoDiff === 'partido' && matchMedia('(min-width:1280px)').matches, cuantos = mios.length;
    $('#cam-nota').textContent = mios[0].s.nombre + ' · ' + plural(cuantos, 'cambio', 'cambios');
    // Un archivo muy editado puede tener cientos de cambios: se enseñan los 20 últimos.
    if (cuantos > 20) mios = mios.slice(cuantos - 20);
    $('#cam-copiar').onclick = () => ui.copiar(mios.map(textoDiff).join('\n'), 'Diff');
    diffVisto = () => mios.map(textoDiff).join('\n');
    ui.pintar($('#cam-diff'), [cuantos > 20 ? el('p', { class: 'note' }, 'Se muestran los 20 cambios más recientes de ' + ui.num(cuantos) + '.') : null].concat(mios.map(c => bloqueDiff(c, partido))));
  }

  let diffVisto = () => '';
  function textoDiff(c) {
    if (!c.e.parche) return '# ' + c.archivo + ': ' + (c.e.err || 'sin diff (' + c.e.res + ')');
    return '--- a/' + c.archivo + '\n+++ b/' + c.archivo + '\n' + c.e.parche.map(h => '@@ -' + h.viejo + ' +' + h.nuevo + ' @@\n' + h.lineas.map(l => l || ' ').join('\n')).join('\n');
  }

  // Una línea del diff. La marca y la palabra para lector de pantalla llevan la señal; no el color.
  // unLado: una sola columna de números (vista dividida y fragmento de la línea de tiempo).
  function lineaDiff(clase, v, n, marca, texto, palabra, unLado) {
    return el('div', { class: 'dl ' + clase + (unLado ? ' uno' : '') }, [
      unLado ? null : el('span', { class: 'n viejo', 'data-n': v }), el('span', { class: 'n', 'data-n': unLado ? (v || n) : n }),
      el('span', { class: 'm', 'aria-hidden': 'true' }, marca), el('span', { class: 't' }, [palabra ? el('span', { class: 'sr' }, palabra + ': ') : null, texto])
    ]);
  }

  function bloqueDiff(c, partido) {
    const e = c.e;
    const caja = el('div', { class: 'diff' + (partido ? ' partido' : ''), tabindex: '0', role: 'group', 'aria-label': 'Cambio en ' + c.archivo + ' por ' + c.a.cod + ', ' + ui.hora(e.t) });
    caja.appendChild(el('div', { class: 'diff-cab row between' }, [
      el('div', { class: 'crece' }, ui.ruta(c.archivo)),
      el('div', { class: 'row' }, [e.nuevo ? ui.insignia('Archivo nuevo') : null, chipCambio(c), agMini(c.a), el('span', { class: 'chip' }, ui.hora(e.t))])
    ]));
    if (e.est === 'error') { caja.appendChild(el('p', { class: 'diff-cab' }, el('span', { class: 'mal' }, herr(e.h) + ': ' + e.err))); return caja; }
    if (e.sinDiff) { caja.appendChild(el('p', { class: 'diff-cab note' }, 'Cambio hecho con una orden de la terminal (' + e.res + '). El registro de Claude Code no guarda sus diferencias.')); return caja; }
    if (pedir(c.s, e, () => { if (RA.paneles ? RA.paneles.visible('cambios') : sel().vista === 'cambios') repintar(cambios, 'data-archivo'); })) { caja.appendChild(el('p', { class: 'diff-cab label' }, 'Cargando')); return caja; }
    if (e.parcheMas) caja.appendChild(el('p', { class: 'diff-cab note' }, '+' + ui.num(e.parcheMas) + ' líneas que no se muestran (se enseñan hasta 20 KB por cambio).'));
    (e.parche || []).forEach(h => {
      const nuevas = h.lineas.filter(l => l[0] !== '-').length;
      caja.appendChild(el('div', { class: 'diff-cab' }, ui.insignia('Líneas ' + h.nuevo + '–' + (h.nuevo + Math.max(0, nuevas - 1)))));
      let v = h.viejo, n = h.nuevo;
      if (!partido) {
        h.lineas.forEach(l => {
          const t = l.slice(1);
          if (l[0] === '+') caja.appendChild(lineaDiff('mas-l' + (e.reciente ? ' nueva' : ''), '', n++, '+', t, 'Añadida'));
          else if (l[0] === '-') caja.appendChild(lineaDiff('menos-l', v++, '', '−', t, 'Eliminada'));
          else caja.appendChild(lineaDiff('', v++, n++, '', t));
        });
        return;
      }
      // Vista dividida: lo eliminado a la izquierda y lo añadido a la derecha, emparejados fila a fila.
      const izq = el('div', { class: 'lado' }), der = el('div', { class: 'lado' });
      let menos = [], mas = [];
      const vaciar = () => {
        for (let i = 0; i < Math.max(menos.length, mas.length); i++) {
          izq.appendChild(i < menos.length ? lineaDiff('menos-l', v++, '', '−', menos[i], 'Eliminada', true) : lineaDiff('', '', '', '', '', '', true));
          der.appendChild(i < mas.length ? lineaDiff('mas-l', '', n++, '+', mas[i], 'Añadida', true) : lineaDiff('', '', '', '', '', '', true));
        }
        menos = []; mas = [];
      };
      h.lineas.forEach(l => {
        if (l[0] === '-') menos.push(l.slice(1));
        else if (l[0] === '+') mas.push(l.slice(1));
        else { vaciar(); izq.appendChild(lineaDiff('', v++, '', '', l.slice(1), '', true)); der.appendChild(lineaDiff('', '', n++, '', l.slice(1), '', true)); }
      });
      vaciar();
      caja.appendChild(el('div', { class: 'lados' }, [izq, der]));
    });
    // El punto rojo de "recién llegado" se quita cuando la persona enfoca el bloque.
    if (e.reciente) caja.addEventListener('focusin', () => { e.reciente = false; ui.$$('.nueva', caja).forEach(x => x.classList.remove('nueva')); }, { once: true });
    return caja;
  }

  // =====================================================================================
  // Uso
  // =====================================================================================
  // Uso tiene dos vistas internas: Consumo (el cuadro de uso) y Estadísticas.
  function uso() {
    const S = sel();
    ui.segmentado($('#uso-sub'), [['consumo', 'Tu plan'], ['estadisticas', 'Estadísticas']].concat([['orquestacion', 'Reparto automático'], ['recursos', 'GPU y memoria']].filter(x => D.ajustes.avanzado || S.usoVista === x[0]), [['continuidad', 'Sin Claude']]), S.usoVista, v => { RA.app.ir(v, true); if (v === 'orquestacion' && RA.asistentes) RA.asistentes.pintarOrquestacion(); }, 'Vista de Uso');
    $('#uso-consumo').hidden = S.usoVista !== 'consumo';
    $('#uso-estadisticas').hidden = S.usoVista !== 'estadisticas';
    $('#uso-orquestacion').hidden = S.usoVista !== 'orquestacion';
    $('#uso-recursos').hidden = S.usoVista !== 'recursos';
    $('#uso-continuidad').hidden = S.usoVista !== 'continuidad';
    if (S.usoVista === 'estadisticas') return estadisticas();
    if (S.usoVista === 'orquestacion' || S.usoVista === 'recursos' || S.usoVista === 'continuidad') return;
    const U = D.estado.uso, oficial = U.fuente === 'oficial';
    $('#uso-nota').textContent = oficial
      ? 'Oficial: los porcentajes los dio el propio Claude Code' + (U.medido ? ' a las ' + ui.hora(U.medido) : '') + '. El desglose por modelo y por sesión es un cálculo de Rastro con los tokens de los registros de Claude Code.'
      : 'Estimado: Rastro cuenta los tokens (trozos de texto, unos 4 caracteres cada uno) en los registros de Claude Code. Sin una medida oficial no se enseña el porcentaje del plan: pulsa «Medir ahora» para obtenerlo.';
    // En la app, "Medir ahora" hace una llamada mínima al CLI, que devuelve el porcentaje oficial.
    const medir = $('#medir-uso');
    medir.hidden = !D.medirUso;
    medir.title = 'Hace una llamada mínima a ' + ui.modelo(D.ajustes.modelos.resumen) + ' con tu suscripción';
    medir.onclick = () => { medir.disabled = true; medir.textContent = 'Midiendo'; D.medirUso().then(() => { medir.disabled = false; medir.textContent = 'Medir ahora'; }); };
    // Plan: la fecha de renovación se escribe a mano; avisa cuando faltan 15 días o menos.
    const dias = D.ajustes.renueva ? Math.ceil((new Date(D.ajustes.renueva + 'T00:00:00').getTime() - D.ahora()) / 86400000) : null;
    const plan = ui.tarjeta('Plan', [
      el('div', { class: 'campo' }, [
        el('label', { class: 'label', for: 'renueva' }, 'Fecha de renovación'),
        el('input', { id: 'renueva', class: 'input', type: 'date', value: D.ajustes.renueva, onchange: ev => { D.guardar({ renueva: ev.target.value }); uso(); $('#renueva').focus(); } })
      ]),
      el('p', { class: 'note' }, 'Rastro no conoce tu fecha de renovación: escríbela tú.')
    ], { pie: dias != null && dias >= 0 && dias <= 15 ? ui.insignia(dias === 0 ? 'Renueva hoy' : 'Renueva en ' + plural(dias, 'día', 'días')) : null });
    ui.pintar($('#uso-bloques'), U.bloques.map(b => ui.tarjeta(b.nombre, bloqueUso(b, U.fuente, 'media'), { esc: 'centro' })).concat(plan));

    const total = U.modelos.reduce((a, m) => a + m.tokens, 0) || 1;
    ui.pintar($('#uso-modelos'), ui.tabla(['Modelo', 'Parte del total', ['Tokens', 'num']], U.modelos.map(m => {
      const p = Math.round(100 * m.tokens / total);
      return [ui.insignia(ui.modelo(m.id)), el('div', { class: 'row' }, [ui.medidor(p, 'Parte de ' + ui.modelo(m.id), p + ' % de los tokens contados', true), el('span', {}, p + ' %')]), ui.tokens(m.tokens)];
    })));
    ui.pintar($('#uso-sesiones'), ui.tabla(['Sesión', 'Modelo', ['Llamadas', 'num'], ['Tokens', 'num']],
      D.estado.sesiones.map(s => [s.nombre, s.modelo ? ui.insignia(ui.modelo(s.modelo)) : '—', s.eventos.length, ui.tokens(s.tokens || 0)])));
  }

  // =====================================================================================
  // Estadísticas
  // =====================================================================================
  function estadisticas() {
    const E = D.estado, S = sel(), ses = E.sesiones;
    const tot = ses.reduce((a, s) => { const c = C.cifras(s); a.n += c.llamadas; a.e += c.errores; a.ms += c.ms; return a; }, { n: 0, e: 0, ms: 0 });
    const t = tiempoCifra(tot.ms);
    ui.pintar($('#est-cifras'), [cifra(ui.cifra(ses.length), '', 'Sesiones'), cifra(ui.cifra(tot.n), '', 'Llamadas'), cifra(ui.cifra(tot.e), '', 'Errores'), cifra(t[0], t[1], 'Tiempo')]);

    ui.segmentado($('#cal-modo'), [['dias', 'Por día'], ['horas', 'Por hora']], S.calor, v => { S.calor = v; estadisticas(); }, 'Vista de la actividad');
    const horas = S.calor === 'horas';
    mapa($('#cal-caja'), S.calor);
    // Tabla equivalente: por semana (suma de sus días) o por hora (suma de los siete días).
    let filas;
    if (horas) filas = E.actividad.horas.length ? Array.from({ length: 24 }, (_, h) => [h + ' h', E.actividad.horas.reduce((a, d) => a + d[h], 0)]) : [];
    else filas = Array.from({ length: Math.floor(E.actividad.dias.length / 7) }, (_, k) => { const w = E.actividad.dias.slice(k * 7, k * 7 + 7); return ['Semana del ' + ui.fecha(w[0].t), w.reduce((a, d) => a + d.n, 0), w.reduce((a, d) => a + d.e, 0)]; }).reverse();
    ui.pintar($('#cal-tabla'), ui.tabla(horas ? ['Hora', ['Llamadas', 'num']] : ['Semana', ['Llamadas', 'num'], ['Errores', 'num']], filas));

    const s = actual();
    if (s && s.eventos.length) {
      const r = C.ritmo(s);
      ui.pintar($('#ritmo'), [
        el('p', { class: 'label' }, s.nombre + ' · llamadas por tramo de ' + ui.dur(r.paso)),
        ui.grafico(r.series, { titulo: 'Ritmo de ' + s.nombre + ': llamadas por tramo, una línea por agente', unidad: 'llamadas', desde: ui.hora(r.desde), hasta: ui.hora(r.hasta) }),
        el('ul', { class: 'badges', 'aria-label': 'Series' }, r.series.map((x, k) => el('li', { class: 'row' }, [
          ui.svg('svg', { viewBox: '0 0 40 8', width: 40, height: 8, 'aria-hidden': 'true' }, ui.svg('line', { class: 'g-linea', x1: 1, y1: 4, x2: 39, y2: 4, 'stroke-dasharray': ['', '6 4', '1 4', '8 3 1 3', '12 4'][k] || null, 'stroke-linecap': k === 2 ? 'round' : null })),
          ui.insignia(x.cod), el('span', { class: 'note' }, x.nombre)
        ])).concat(r.resto ? el('li', { class: 'row' }, [ui.insignia('+' + r.resto), el('span', { class: 'note' }, r.resto === 1 ? 'agente más, sin dibujar' : 'agentes más, sin dibujar')]) : []))
      ]);
    } else ui.pintar($('#ritmo'), el('p', { class: 'note' }, 'Todavía no hay acciones que dibujar: aparecerán cuando una sesión trabaje.'));

    ui.pintar($('#est-herr'), ui.tabla(['Herramienta', ['Llamadas', 'num'], ['Errores', 'num'], ['Mediana', 'num']],
      C.herramientas(ses).map(h => [el('span', { class: 'ag' }, [G.svg(G.deHerramienta(h.h), null), el('span', { title: h.h }, herr(h.h))]), h.n, h.err, ui.dur(h.med)])));
    $('#t-est-arch').textContent = 'Archivos' + (s ? ' · ' + s.nombre : '');
    ui.pintar($('#est-arch'), ui.tabla(['Archivo', 'Agente', ['Lecturas', 'num'], ['Escrituras', 'num'], 'Última vez'], (s ? C.archivos(s).slice(0, 12) : []).map(f => el('tr', {}, [
      el('td', { class: 'ancha' }, ui.ruta(f.archivo)), el('td', {}, agMini(f.a)), el('td', { class: 'num' }, ui.num(f.lecturas)), el('td', { class: 'num' }, ui.num(f.escrituras)), el('td', {}, ui.hora(f.t))
    ]))));
  }

  // Deshacer un Detener es reanudar la sesión donde se quedó. Detener tarda un momento en cerrar el
  // proceso: mientras no esté parada del todo se reintenta, sin avisar de cada intento.
  function deshacerDetener(s, n) {
    n = n || 0;
    const P = window.rastro, pedir = P ? P.reanudar(s.id).catch(() => ({ error: 'La orden no se pudo ejecutar.' })) : Promise.resolve(D.reanudar(s.id));
    return pedir.then(r => {
      if (r && r.error && /no está interrumpida/.test(r.error) && n < 8) return new Promise(ok => setTimeout(ok, 750)).then(() => deshacerDetener(s, n + 1));
      if (r && r.error) return ui.decir('No se pudo deshacer: ' + r.error, 'error');
      ui.decir('Deshecho: ' + s.nombre + ' sigue donde se detuvo.', { tipo: 'ok', sesion: s.id });
    });
  }

  // Estado del equipo (B9): cada comprobación con ✓ / ! / ✕ y qué hacer si falla; el informe se copia
  // sin claves, rutas personales ni prompts (lo arma el proceso principal).
  function diagnostico() {
    const c = RA.capas.capa('Estado del equipo', () => c.cerrar());
    const ICO = { ok: '✓', aviso: '!', error: '✕' }, NOM = { ok: 'Bien', aviso: 'Atención', error: 'Falla' };
    const pinta = r => ui.pintar(c.caja, [
      el('h2', { class: 'chica' }, 'Estado del equipo'),
      el('p', { class: 'help' }, 'Lo que Rastro necesita para funcionar, y qué hacer si algo falla.'),
      !r ? el('p', { class: 'note', 'aria-busy': 'true' }, 'Comprobando…') : r.error ? el('p', {}, el('span', { class: 'mal' }, 'No se pudo comprobar el estado. Vuelve a intentarlo.')) :
        el('ul', { class: 'diag', id: 'diag-lista' }, r.lista.map(x => el('li', { class: x.estado, 'data-id': x.id }, [
          el('span', { class: 'd-ico', 'aria-hidden': 'true' }, ICO[x.estado]),
          el('div', { class: 'crece' }, [el('div', {}, [el('span', { class: 'sr' }, NOM[x.estado] + ': '), el('b', {}, x.nombre), ' · ', x.detalle]), x.estado !== 'ok' && x.accion ? el('div', { class: 'note' }, 'Qué hacer: ' + x.accion) : null])
        ]))),
      el('div', { class: 'row between' }, [
        el('button', { type: 'button', class: 'btn', id: 'diag-cerrar', onclick: () => c.cerrar() }, 'Cerrar'),
        el('div', { class: 'row' }, [
          el('button', { type: 'button', class: 'btn', id: 'diag-repetir', onclick: e => ui.ocupado(e.currentTarget, cargar, { cargando: 'Comprobando…', hecho: 'Comprobado' }) }, 'Volver a comprobar'),
          el('button', { type: 'button', class: 'btn btn-primary', id: 'diag-copiar', disabled: !r || !!r.error, onclick: e => ui.copiar(r.informe, 'Informe', e.currentTarget) }, 'Copiar informe')
        ])
      ])
    ]);
    const cargar = () => { pinta(null); return Promise.resolve(D.diagnostico ? D.diagnostico() : { error: 'sin app' }).then(r => { pinta(r); const b = $('#diag-copiar'); if (b && !b.disabled) b.focus(); return r; }); };
    cargar();
  }

  // Los heatmaps dependen del ancho: se repintan solos cuando la ventana cambia de tamaño.
  function mapas() {
    if (sel().vista === 'sesiones' && sel().sesVista === 'mapa') sesiones();
    if (!D.estado.sesiones.length) return;
    if (sel().vista === 'chat') mapa($('#actividad'), 'dias');
    else if (sel().vista === 'uso' && sel().usoVista === 'estadisticas') mapa($('#cal-caja'), sel().calor);
  }

  RA.vistas = { diagnostico: diagnostico, diffActual: () => diffVisto(), tarjeta: tarjeta, estadoMascota: estadoMascota, chat: chat, sesiones: sesiones, cambios: cambios, uso: uso, ajustes: () => {}, nueva: () => {}, consola: () => {}, franja: franja, tiempo: tiempo, arbol: arbol, mapas: mapas, actual: actual, mascota: mascota };
})(window.RA = window.RA || {});
