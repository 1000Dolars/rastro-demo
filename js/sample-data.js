/* Datos de muestra para la maqueta. Nada de esto es real: son sesiones inventadas con la misma forma
   que tendrán las reales (ver js/datos.js). La interfaz lo rotula siempre con [ DATOS DE MUESTRA ].
   Solo se monta si no existe el puente de la app de escritorio (window.rastro).
   El reloj de la muestra está fijo, para que las capturas y las pruebas salgan siempre iguales. */
(function (RA) {
  'use strict';
  if (window.rastro) return;

  const D = RA.datos, calc = RA.calc;
  const T = new Date(2026, 9, 12, 17, 2, 0).getTime();   // inicio de la sesión en vivo de la muestra
  let AHORA = T + 38 * 60000 + 12000;
  const MIN = 60000, HORA = 3600000, DIA = 86400000;

  // Generador con semilla: los datos "aleatorios" son los mismos en cada carga.
  let semilla = 7;
  const azar = () => (semilla = (semilla * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const uno = lista => lista[Math.floor(azar() * lista.length)];

  let n = 0;
  // Evento: agente, segundos desde el inicio de su sesión, herramienta, resumen, duración (null = en curso).
  const ev = (base, ag, seg, h, res, dur, x) => Object.assign({ id: 'e' + (++n), ag: ag, t: base + seg * 1000, h: h, res: res, dur: dur, est: dur == null ? 'curso' : 'listo', ent: res, sal: '' }, x);
  const ag = (id, cod, tipo, est, t0, t1, padre) => ({ id: id, cod: cod, tipo: tipo, est: est, t0: t0, t1: t1 || null, padre: padre || null });

  const ARCHIVOS = ['css/styles.css', 'js/ui.js', 'js/glifos.js', 'js/vistas.js', 'js/datos.js', 'index.html', 'DESIGN.md', 'README.md', 'tests/contraste.js', 'tests/visual.test.js', 'js/asistente.js', 'js/sonido.js'];
  // Relleno: lecturas y búsquedas de un agente repartidas en un tramo de tiempo.
  function relleno(base, agente, desde, hasta, cuantos) {
    const out = [];
    for (let i = 0; i < cuantos; i++) {
      const h = uno(['Read', 'Read', 'Read', 'Grep', 'Glob', 'Bash']), f = uno(ARCHIVOS), seg = Math.round(desde + azar() * (hasta - desde));
      if (h === 'Read') out.push(ev(base, agente, seg, h, f, 30 + Math.round(azar() * 120), { archivo: f, ent: '{ "file_path": "' + f + '" }', sal: '(' + (40 + Math.round(azar() * 400)) + ' líneas)' }));
      else if (h === 'Grep') out.push(ev(base, agente, seg, h, '"role=\\"tree\\"" en js/', 60 + Math.round(azar() * 300), { ent: '{ "pattern": "role=\\"tree\\"", "path": "js/" }', sal: 'js/vistas.js:118\njs/ui.js:92' }));
      else if (h === 'Glob') out.push(ev(base, agente, seg, h, 'tests/**/*.js', 20 + Math.round(azar() * 60), { ent: '{ "pattern": "tests/**/*.js" }', sal: 'tests/contraste.js\ntests/run.js\ntests/visual.test.js' }));
      else out.push(ev(base, agente, seg, h, 'node tests/contraste.js', 900 + Math.round(azar() * 2600), { ent: 'node tests/contraste.js', sal: 'Tema claro\n  ok  21,00:1  Texto principal sobre tarjeta\nTodos los pares cumplen su mínimo' }));
    }
    return out;
  }

  // ---- Sesión 1: en vivo, externa (solo lectura), principal y siete subagentes ----
  function sesionViva() {
    const agentes = [
      ag('p', 'P', 'principal', 'curso', T),
      ag('agent-a81f3c', 'A1', 'Explore', 'curso', T + 310000, null, 'p'),
      ag('agent-b27d90', 'A2', 'Explore', 'curso', T + 312000, null, 'p'),
      ag('agent-c5e611', 'A3', 'general-purpose', 'curso', T + 315000, null, 'p'),
      ag('agent-d09a47', 'A4', 'Plan', 'curso', T + 318000, null, 'p'),
      ag('agent-e73b28', 'A5', 'code-reviewer', 'curso', T + 321000, null, 'p'),
      ag('agent-f1c5d2', 'A6', 'claude-code-guide', 'listo', T + 640000, T + 825000, 'agent-c5e611'),
      ag('agent-07be94', 'A7', 'test-runner', 'cola', null, null, 'p')
    ];
    const P = 'p', A = agentes.map(a => a.id);
    let e = [
      ev(T, P, 4, 'Read', 'DESIGN.md', 62, { archivo: 'DESIGN.md', ent: '{ "file_path": "DESIGN.md" }', sal: '# Rastro — Guía de diseño\n> Instrumento de lectura y control…', mas: 31218 }),
      ev(T, P, 9, 'Glob', 'referencia/**/*', 41, { ent: '{ "pattern": "referencia/**/*" }', sal: 'referencia/typenothing/DESIGN.md\nreferencia/typenothing/css/styles.css\nreferencia/typenothing/js/ui.js' })
    ];
    [1, 2, 3, 4, 5].forEach((k, i) => e.push(ev(T, P, 300 + i * 3, 'Agent', agentes[k].tipo + ': ' + ['mapa de componentes', 'estados y accesibilidad', 'formato de los transcripts', 'plan de las vistas', 'revisión de la hoja de estilos'][i], null, { hijo: A[k], ent: '{ "subagent_type": "' + agentes[k].tipo + '", "description": "…" }' })));
    e = e.concat(relleno(T, P, 20, 2090, 22), relleno(T, A[1], 320, 2260, 16), relleno(T, A[2], 330, 2270, 13), relleno(T, A[3], 340, 2200, 12), relleno(T, A[4], 350, 2240, 9), relleno(T, A[5], 360, 2250, 18), relleno(T, A[6], 645, 820, 6));
    e.push(
      ev(T, A[3], 636, 'Agent', 'claude-code-guide: eventos de hook disponibles', 189000, { hijo: A[6], ent: '{ "subagent_type": "claude-code-guide", "description": "eventos de hook" }', sal: 'Hay 33 eventos de hook; SubagentStart y SubagentStop existen.' }),
      ev(T, A[4], 1410, 'Read', 'js/panel.js', 18, { est: 'error', archivo: 'js/panel.js', ent: '{ "file_path": "js/panel.js" }', err: 'File does not exist. Did you mean js/vistas.js?' }),
      ev(T, A[3], 2206, 'WebFetch', 'electronjs.org/docs/latest/tutorial/security', 2800, {
        ent: '{ "url": "https://www.electronjs.org/docs/latest/tutorial/security", "prompt": "lista de seguridad" }',
        // Contenido no confiable: se pinta tal cual, como texto. Nada de esto se ejecuta ni se interpreta.
        sal: 'Checklist: Security recommendations\n1. Only load secure content\n<script>alert("no confiable")</script>\n<img src=x onerror="alert(1)">\n[enlace](javascript:alert(1))\nAuthorization: Bearer [ ENMASCARADO ]', mas: 4213
      }),
      ev(T, P, 2105, 'Edit', 'css/styles.css', 62, {
        archivo: 'css/styles.css', ent: '{ "file_path": "css/styles.css", "old_string": ".zone { … }", "new_string": ".k-ti { … }" }', sal: 'The file css/styles.css has been updated.',
        parche: [
          { viejo: 152, nuevo: 152, lineas: [' .card { padding:24px; background-color:var(--surface); border:1px solid var(--line); }', '-.zone { background-image:var(--dots); background-size:20px 20px; }', '+.k-ti { background-image:var(--dots); background-size:20px 20px; }', '+.riel { position:relative; padding-left:28px; }', '+.riel::before { content:""; position:absolute; left:5.5px; width:1px; background:var(--line); }', ' .zone-head { display:flex; align-items:center; justify-content:space-between; }'] },
          { viejo: 186, nuevo: 188, lineas: [' @keyframes blink { 50% { opacity:0; } }', '-.ch.cur::before { background:var(--red); animation:blink 1s steps(1) infinite; }', '+.vivo::before { background:var(--red); }', '+.vivo.quieto::before { animation:blink 1s steps(1) infinite; }', ''] }
        ]
      }),
      ev(T, P, 2118, 'Write', 'js/glifos.js', 48, {
        archivo: 'js/glifos.js', ent: '{ "file_path": "js/glifos.js", "content": "…" }', sal: 'File created successfully at: js/glifos.js', nuevo: true,
        parche: [{ viejo: 0, nuevo: 1, lineas: ['+/* Glifos de puntos 5×5: la identidad de agentes y herramientas. */', '+(function (RA) {', "+  'use strict';", "+  const P = { Principal: '.###.#...##.#.##...#.###.' };", '+  RA.glifos = { P: P };', '+})(window.RA = window.RA || {});'] }]
      }),
      ev(T, P, 2131, 'Bash', 'node tests/contraste.js', 1200, { ent: 'node tests/contraste.js', sal: 'Tema claro\n  ok     21,00:1  (mín. 4,5)  Texto principal sobre tarjeta\n  ok      5,74:1  (mín. 4,5)  Etiqueta en tarjeta (--ink-3)\nTema oscuro\n  ok     19,80:1  (mín. 4,5)  Texto principal sobre tarjeta\n\nTodos los pares cumplen su mínimo' }),
      ev(T, P, 2150, 'Edit', 'js/ui.js', 9, { est: 'error', archivo: 'js/ui.js', ent: '{ "file_path": "js/ui.js", "old_string": "badge(textOrKids) {", "new_string": "insignia(kids, clase) {" }', err: 'String to replace not found in file.' }),
      ev(T, P, 2162, 'Edit', 'js/ui.js', 55, {
        archivo: 'js/ui.js', ent: '{ "file_path": "js/ui.js", "old_string": "badge(textOrKids) { … }", "new_string": "insignia(kids, clase) { … }" }', sal: 'The file js/ui.js has been updated.',
        parche: [{ viejo: 87, nuevo: 87, lineas: ['     // Corchetes de las insignias. Son adorno: se ven, pero no se leen.', "-    badge(textOrKids) { return ui.el('span', { class: 'badge' }, ui.bracket(textOrKids)); },", "+    insignia(kids, clase) { return ui.el('span', { class: 'badge' + (clase ? ' ' + clase : '') }, ui.corchetes(kids)); },", ''] }]
      }),
      ev(T, P, 2176, 'Bash', 'npx prettier --write css/', 2100, { archivo: 'css/styles.css', sinDiff: true, ent: 'npx prettier --write css/', sal: 'css/styles.css 41ms' }),
      ev(T, P, 2190, 'mcp__context7__query-docs', 'electron: titleBarOverlay', 3400, { ent: '{ "libraryId": "/electron/electron", "query": "titleBarOverlay" }', sal: 'titleBarOverlay: { color, symbolColor, height }' }),
      ev(T, P, 2221, 'Agent', 'test-runner: pruebas de la maqueta', null, { hijo: A[7], ent: '{ "subagent_type": "test-runner", "description": "pruebas de la maqueta", "run_in_background": true }' }),
      ev(T, P, 2240, 'Bash', 'npx serve . --listen 4173', null, { fondo: true, ent: 'npx serve . --listen 4173', sal: 'Serving!  http://localhost:4173' }),
      ev(T, P, 2262, 'Edit', 'index.html', null, { archivo: 'index.html', ent: '{ "file_path": "index.html", "old_string": "…", "new_string": "…" }' })
    );
    return { id: 's1', nombre: 'rastro-fase-1', carpeta: 'C:\\Proyectos\\rastro', origen: 'externa', est: 'curso', fase: null, modelo: 'claude-opus-5-5', ctx: 84000, t0: T, t1: null, agentes: agentes, eventos: e,
      prompts: [{ t: T - 1000, texto: 'Rehaz la maqueta del panel con el bento de 12 columnas y pasa las pruebas de contraste.' }],
      respuestas: [{ t: T + 500, texto: 'Empiezo por **la rejilla**: primero el bento de 12 columnas y luego las pruebas de contraste.' }] };
  }

  // Sesión corta de un solo agente, para las demás filas de la lista.
  function sesionCorta(o, pasos) {
    const s = Object.assign({ fase: null, t1: null, agentes: [ag('p', 'P', 'principal', o.est === 'espera' ? 'listo' : o.est, o.t0, o.t1)], eventos: [] }, o);
    pasos.forEach(p => s.eventos.push(ev(o.t0, 'p', p[0], p[1], p[2], p[3], p[4])));
    return s;
  }
  const parche1 = (texto) => ({ archivo: texto, nuevo: true, parche: [{ viejo: 0, nuevo: 1, lineas: ['+<!DOCTYPE html>', '+<html lang="es">', '+<title>' + texto + '</title>'] }] });

  function sesiones() {
    const modelos = { diseno: 'claude-sonnet-5-5', codigo: 'claude-opus-5-5', resumen: 'claude-haiku-5-5' };
    return [
      sesionViva(),
      sesionCorta({ id: 's2', nombre: 'tienda-inventario', carpeta: 'C:\\Proyectos\\tienda-inventario', origen: 'app', est: 'espera', fase: 'aprobacion', modelo: 'claude-sonnet-5-5', t0: T - 12 * MIN, t1: T + 16 * MIN, prompts: [{ t: T - 12 * MIN, texto: 'Diseña una tienda para llevar el inventario de una ferretería pequeña.' }], modelos: modelos, entregables: ['DESIGN.md', 'maqueta\\index.html'] }, [
        [5, 'Read', 'referencia/boceto.png', 140, { archivo: 'referencia/boceto.png' }],
        [62, 'Write', 'DESIGN.md', 51, { archivo: 'DESIGN.md', nuevo: true, parche: [{ viejo: 0, nuevo: 1, lineas: ['+# Tienda — Guía de diseño', '+> Inventario de una tienda pequeña, claro y sin adornos.', '+', '+## Colores'] }] }],
        [540, 'Write', 'maqueta/index.html', 44, parche1('maqueta/index.html')],
        [980, 'Write', 'maqueta/estilos.css', 39, { archivo: 'maqueta/estilos.css', nuevo: true, parche: [{ viejo: 0, nuevo: 1, lineas: ['+:root { --fondo:#fff; --tinta:#111; }', '+body { margin:0; font:16px/1.5 system-ui; }'] }] }]
      ]),
      (function () {
        const s = sesionCorta({ id: 's3', nombre: 'blog-estatico', carpeta: 'C:\\Proyectos\\blog-estatico', origen: 'app', est: 'curso', fase: 'codigo', modelo: 'claude-opus-5-5', t0: T + 9 * MIN, modelos: modelos, entregables: ['DESIGN.md', 'maqueta\\index.html'] }, [
          [3, 'Read', 'DESIGN.md', 58, { archivo: 'DESIGN.md' }],
          [40, 'Write', 'src/generar.js', 61, { archivo: 'src/generar.js', nuevo: true, parche: [{ viejo: 0, nuevo: 1, lineas: ["+'use strict';", "+const fs = require('fs');", '+// Convierte cada entrada de contenido/ en una página de salida/.', '+function generar(dir) { return fs.readdirSync(dir).map(pagina); }'] }] }],
          [410, 'Bash', 'node src/generar.js contenido', 1900, { sal: '12 páginas generadas en salida/' }],
          [1290, 'Edit', 'src/generar.js', 47, { archivo: 'src/generar.js', parche: [{ viejo: 3, nuevo: 3, lineas: [' // Convierte cada entrada de contenido/ en una página de salida/.', '-function generar(dir) { return fs.readdirSync(dir).map(pagina); }', "+function generar(dir) { return fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(pagina); }", ''] }] }],
          [1700, 'Bash', 'node --test', null, {}]
        ]);
        s.agentes.push(ag('agent-91c0aa', 'A1', 'Explore', 'listo', s.t0 + 20000, s.t0 + 95000, 'p'));
        s.eventos.push(ev(s.t0, 'p', 18, 'Agent', 'Explore: estructura de contenido/', 77000, { hijo: 'agent-91c0aa' }), ev(s.t0, 'agent-91c0aa', 24, 'Glob', 'contenido/**/*.md', 33, { sal: '12 archivos' }));
        return s;
      })(),
      sesionCorta({
        id: 's4', nombre: 'api-facturas', carpeta: 'C:\\Proyectos\\api-facturas', origen: 'externa', est: 'listo', modelo: 'claude-opus-5-5', t0: T - 3 * HORA, t1: T - 3 * HORA + 47 * MIN,
        prompts: [{ t: T - 3 * HORA, texto: 'Añade la exportación de facturas a CSV con filtro por fechas.' }],
        respuestas: [{ t: T - 3 * HORA + 46 * MIN, texto: '## Exportación a CSV lista\n\n- Nuevo módulo `src/exportar.js`, con escape de comas y comillas.\n- Ruta `GET /facturas.csv` con filtro `desde` y `hasta`.\n- Seis pruebas nuevas; **todas pasan**.\n\n```js\nexportar(facturas, { desde: \'2026-10-01\' });\n```' }],
        resumen: {
          est: 'listo', modelo: 'claude-haiku-5-5',
          objetivo: 'Añadir la exportación de facturas a CSV y cubrirla con pruebas.',
          hecho: ['Nuevo módulo src/exportar.js con escape de comas y comillas.', 'Ruta GET /facturas.csv con filtro por fechas.', 'Seis pruebas nuevas; todas pasan.'],
          archivos: [{ ruta: 'src/exportar.js', mas: 84, menos: 0 }, { ruta: 'src/rutas.js', mas: 19, menos: 3 }, { ruta: 'tests/exportar.test.js', mas: 112, menos: 0 }],
          errores: ['Una prueba falló por el separador decimal; se resolvió fijando la configuración regional de la salida.'],
          pendientes: ['Paginar la exportación cuando haya más de 10 000 facturas.'],
          registro: ['14:02:10  Read   src/rutas.js  41 ms', '14:09:55  Write  src/exportar.js  52 ms', '14:31:20  Bash   node --test  3,1 s  [ERROR] 1 prueba falló', '14:44:02  Edit   src/exportar.js  38 ms', '14:48:47  Bash   node --test  2,9 s']
        }
      }, [
        [8, 'Read', 'src/rutas.js', 41, { archivo: 'src/rutas.js' }],
        [465, 'Write', 'src/exportar.js', 52, { archivo: 'src/exportar.js', nuevo: true, parche: [{ viejo: 0, nuevo: 1, lineas: ["+'use strict';", '+// Una fila de CSV: las comillas se doblan y los campos con coma van entre comillas.', "+const fila = campos => campos.map(c => /[\",\\n]/.test(c) ? '\"' + c.replace(/\"/g, '\"\"') + '\"' : c).join(',');"] }] }],
        [1750, 'Bash', 'node --test', 3100, { est: 'error', err: 'not ok 4 - importe con decimales\n  expected "1234,50" to equal "1234.50"' }],
        [2512, 'Edit', 'src/exportar.js', 38, { archivo: 'src/exportar.js', parche: [{ viejo: 7, nuevo: 7, lineas: ['-const importe = n => n.toLocaleString();', "+const importe = n => n.toFixed(2);"] }] }],
        [2797, 'Bash', 'node --test', 2900, { sal: '# pass 6\n# fail 0' }]
      ]),
      sesionCorta({
        id: 's5', nombre: 'migracion-db', carpeta: 'C:\\Proyectos\\migracion-db', origen: 'externa', est: 'error', modelo: 'claude-sonnet-5-5', t0: T - 26 * HORA, t1: T - 26 * HORA + 9 * MIN,
        resumen: { est: 'fallo', modelo: 'claude-haiku-5-5', error: 'El proceso del resumen terminó sin respuesta.', registro: ['15:02:31  Read  esquema.sql  37 ms', '15:04:12  Bash  psql -f migrar.sql  8,4 s  [ERROR] relation "clientes" does not exist', '15:11:40  [ERROR] Se alcanzó el límite de uso de 5 horas'] }
      }, [
        [11, 'Read', 'esquema.sql', 37, { archivo: 'esquema.sql' }],
        [112, 'Bash', 'psql -f migrar.sql', 8400, { est: 'error', err: 'ERROR:  relation "clientes" does not exist' }]
      ]),
      sesionCorta({ id: 's6', nombre: 'landing-cafe', carpeta: 'C:\\Proyectos\\landing-cafe', origen: 'app', est: 'detenido', fase: 'diseno', modelo: 'claude-sonnet-5-5', t0: T - 50 * HORA, t1: T - 50 * HORA + 4 * MIN, modelos: modelos, resumen: { est: 'generando', modelo: 'claude-haiku-5-5', registro: [] } }, [
        [6, 'Read', 'referencia/menu.pdf', 220, { archivo: 'referencia/menu.pdf' }],
        [140, 'Write', 'DESIGN.md', 49, { archivo: 'DESIGN.md', nuevo: true, parche: [{ viejo: 0, nuevo: 1, lineas: ['+# Café — Guía de diseño'] }] }]
      ]),
      { id: 's7', nombre: 'sin-titulo', carpeta: 'C:\\Proyectos\\notas', origen: 'externa', est: 'nodatos', fase: null, modelo: '', t0: T + 37 * MIN, t1: null, agentes: [ag('p', 'P', 'principal', 'nodatos', null)], eventos: [] }
    ];
  }

  // Actividad: 52 semanas por día (la última es la semana en curso) y una semana tipo por hora.
  function actividad() {
    const hoy = new Date(T); hoy.setHours(0, 0, 0, 0);
    const fin = hoy.getTime() + (6 - (hoy.getDay() + 6) % 7) * DIA, dias = [];   // la última columna es la semana en curso
    for (let i = 52 * 7 - 1; i >= 0; i--) {
      const t = fin - i * DIA, d = new Date(t).getDay(), futuro = t > hoy.getTime();
      const base = d === 0 || d === 6 ? 0.25 : 1, x = azar();
      const llamadas = futuro || x < 0.22 ? 0 : Math.round(base * (x < 0.6 ? 40 : x < 0.85 ? 140 : x < 0.96 ? 320 : 560) * (0.6 + azar()));
      dias.push({ t: t, n: llamadas, e: llamadas > 100 && azar() < 0.12 ? 1 + Math.floor(azar() * 3) : 0, futuro: futuro });
    }
    const horas = [0, 1, 2, 3, 4, 5, 6].map(d => {
      const fila = [];
      for (let h = 0; h < 24; h++) fila.push(h >= 15 && h <= 21 ? Math.round((d > 4 ? 30 : 110) * (0.3 + azar())) : h >= 9 && h < 15 ? Math.round(18 * azar()) : 0);
      return fila;
    });
    return { dias: dias, horas: horas };
  }

  const USO = {
    // Vista previa del diseño con porcentajes. En la app solo se usará si hay una fuente oficial real.
    oficial: {
      fuente: 'oficial',
      bloques: [{ id: 'five_hour', nombre: 'Sesión actual · 5 h', pct: 62, reinicia: AHORA + 2 * HORA + 14 * MIN }, { id: 'seven_day', nombre: 'Semana · todos los modelos', pct: 91, reinicia: AHORA + 3 * DIA + 4 * HORA }]
    },
    // Sin fuente oficial no hay porcentaje: solo los tokens contados en los transcripts.
    estimado: {
      fuente: 'estimado',
      bloques: [{ id: 'five_hour', nombre: 'Sesión actual · 5 h', pct: null, tokens: 1840000, reinicia: AHORA + 2 * HORA + 14 * MIN }, { id: 'seven_day', nombre: 'Semana · todos los modelos', pct: null, tokens: 5520000, reinicia: null }]
    }
  };
  const MODELOS_USO = [{ id: 'claude-opus-5-5', tokens: 4210000 }, { id: 'claude-sonnet-5-5', tokens: 1120000 }, { id: 'claude-haiku-5-5', tokens: 190000 }];

  function cargar(escenario) {
    const vacio = escenario === 'vacio' || escenario === 'cargando';
    const lista = vacio ? [] : sesiones();
    lista.forEach(s => { s.tokens = s.eventos.length * 14200; });                     // tokens inventados, solo para el cuadro de uso
    anadido3(lista);
    if (lista.length) lista[0].eventos.filter(e => e.parche && e.archivo === 'js/ui.js')[0].reciente = true;   // el cambio "recién llegado"
    D.estado = {
      conexion: escenario === 'perdida' ? 'perdida' : 'viva', cargando: escenario === 'cargando',
      sesiones: lista, actividad: vacio ? { dias: [], horas: [] } : actividad(),
      // Por defecto, estimado: el uso oficial solo existe con una fuente real verificada.
      uso: Object.assign({ modelos: vacio ? [] : MODELOS_USO }, vacio ? { fuente: 'estimado', bloques: [] } : USO.estimado),
      modos: {}
    };
  }

  /* Añadido 3 (muestra): modelo, esfuerzo y tarea de cada agente, modo de uso y plan de tareas, con la forma
     que da el lector de transcripts. La sesión 5 y la 6 no tienen plan: el mapa dice "sin plan". El agente en
     cola (A7) aún no ha respondido: su modelo no está informado. */
  function anadido3(lista) {
    const SUB = { A1: ['claude-haiku-4-5-20251001', 'Mapa de componentes'], A2: ['claude-haiku-4-5-20251001', 'Estados y accesibilidad'], A3: ['claude-opus-5-5', 'Formato de los transcripts'],
      A4: ['claude-sonnet-5-5', 'Plan de las vistas'], A5: ['claude-opus-5-5', 'Revisión de la hoja de estilos'], A6: ['claude-haiku-5-5', 'Consultar la guía de Claude Code'], A7: ['', 'Correr las pruebas'] };
    const tareas = (n, h, actual) => ({ total: n, hechas: h, actual: actual || '', tareas: Array.from({ length: n }, (x, i) => ({ asunto: 'Tarea ' + (i + 1), est: i < h ? 'completed' : i === h && actual ? 'in_progress' : 'pending' })) });
    const DATOS = {
      s1: { modo: 'default', esfuerzo: 'xhigh', plan: tareas(7, 3, 'Escribiendo el reconstructor de tareas') },
      s2: { modo: 'plan', esfuerzo: 'high', plan: null },
      s3: { modo: 'acceptEdits', esfuerzo: 'high', plan: tareas(6, 5, 'Probando el despliegue') },
      s4: { modo: 'auto', esfuerzo: 'medium', plan: tareas(4, 4) },
      s5: { modo: 'default', esfuerzo: 'high', plan: null },
      s6: { modo: 'default', esfuerzo: '', plan: null },
      s7: { modo: '', esfuerzo: '', plan: null }
    };
    lista.forEach(x => {
      Object.assign(x, DATOS[x.id] || {});
      x.agentes.forEach(a => {
        if (a.id === 'p') { a.modelo = x.modelo; a.esfuerzo = x.esfuerzo; a.tarea = ''; return; }
        const d = SUB[a.cod] || ['', ''];
        if (a.modelo === undefined) a.modelo = d[0];
        if (a.tarea === undefined) a.tarea = d[1];
      });
    });
  }
  // Modo de uso en la muestra: se guarda en el estado, como haría el proceso principal.
  D.chatModo = (id, modo) => { D.estado.modos = Object.assign({}, D.estado.modos, { [id]: modo }); return Promise.resolve({ ok: true, enCaliente: false }); };

  D.muestra = true;
  D.auth = { ok: true };   // en la app lo decide la comprobación real de autenticación (Fase 3)
  D.ahora = () => AHORA;
  semilla = 7; n = 0; cargar('normal');

  // ---- Carpetas de mentira: en un navegador no hay disco ni diálogo del sistema ----
  const hecho = x => Promise.resolve(x);
  const existentes = () => ['C:\\Proyectos', 'C:\\Proyectos\\notas', 'C:\\Proyectos\\pruebas'].concat(D.estado.sesiones.map(s => s.carpeta));
  D.infoCarpeta = texto => {
    const r = String(texto).trim().replace(/[\\/]+$/, '');
    if (!/^[A-Za-z]:[\\/]/.test(r + '\\')) return hecho({ error: 'Tiene que ser una ruta completa, como C:\\Proyectos\\mi-app.' });
    if (/(^|[\\/])\.\.([\\/]|$)/.test(r)) return hecho({ error: 'La ruta no puede contener "..".' });
    const i = r.lastIndexOf('\\'), existe = existentes().some(x => x.toLowerCase() === r.toLowerCase());
    return hecho({ ruta: r, existe: existe, carpeta: existe, padre: r.slice(0, i), nombre: r.slice(i + 1), bloqueo: '', entregables: [], sesiones: D.estado.sesiones.filter(s => s.carpeta.toLowerCase() === r.toLowerCase()).map(s => s.id) });
  };
  D.elegirCarpeta = () => hecho({ ruta: 'C:\\Proyectos\\notas' });     // lo que "elige" el diálogo en la maqueta
  // Conectores (MCP) de muestra: uno conectado y uno que pide autenticarse (el estado lo da Claude Code al enviar).
  D.conectores = () => hecho({ lista: [{ nombre: 'github', tipo: 'http', origen: 'usuario', estado: 'needs-auth' }, { nombre: 'playwright', tipo: 'stdio', origen: 'proyecto', estado: 'connected' }] });

  // Árbol de archivos de muestra, el mismo para todas las sesiones: un objeto es una carpeta y un 0, un archivo.
  const DISCO = { '.git': { HEAD: 0 }, node_modules: { playwright: { 'index.js': 0 } }, css: { 'styles.css': 0 }, js: { 'app.js': 0, 'ui.js': 0, 'vistas.js': 0 }, tests: { 'run.js': 0, 'visual.test.js': 0 }, 'DESIGN.md': 0, 'README.md': 0, 'index.html': 0, 'logo.svg': 0, 'package.json': 0 };
  const en = rel => String(rel).split('/').filter(Boolean).reduce((d, p) => d && typeof d[p] === 'object' ? d[p] : null, DISCO);
  const partir = rel => { const p = String(rel).split('/').filter(Boolean); return [en(p.slice(0, -1).join('/')), p[p.length - 1], p.slice(0, -1)]; };
  const nuevo = (dir, nombre) => !dir ? 'Ya no existe: puede que se haya movido o borrado.' : RA.carpeta.validar(nombre, Object.keys(dir), 255).replace('una carpeta', 'algo');
  D.fs = {
    sucio: false,
    abrir: id => { const s = calc.sesion(id); return hecho(s ? { base: s.carpeta, nombre: s.carpeta.split('\\').pop() } : { error: 'No hay ninguna sesión elegida.' }); },
    cambiar: () => hecho({ base: 'C:\\Proyectos\\notas', nombre: 'notas' }),
    cerrar: () => hecho(true),
    listar: (rel, ocultas) => {
      const d = en(rel), pesa = k => typeof d[k] === 'object' && (k === 'node_modules' || k === '.git');
      if (!d) return hecho({ error: 'Ya no existe: puede que se haya movido o borrado.' });
      const items = Object.keys(d).filter(k => ocultas || !pesa(k)).map(k => ({ n: k, d: typeof d[k] === 'object' })).sort((a, b) => (b.d - a.d) || a.n.localeCompare(b.n));
      return hecho({ items: items, mas: 0, ignoradas: Object.keys(d).filter(pesa).length });
    },
    crear: (rel, nombre, esCarpeta) => { const d = en(rel), e = nuevo(d, nombre); if (e) return hecho({ error: e }); d[nombre] = esCarpeta ? {} : 0; return hecho({ rel: (rel ? rel + '/' : '') + nombre }); },
    renombrar: (rel, nombre) => { const [d, viejo, p] = partir(rel), e = nuevo(d, nombre); if (e) return hecho({ error: e }); d[nombre] = d[viejo]; delete d[viejo]; return hecho({ rel: p.concat(nombre).join('/') }); },
    papelera: rel => { const [d, viejo] = partir(rel); if (d) delete d[viejo]; return hecho({ ok: true }); },
    abrirArchivo: () => hecho({ ok: true }),
    mostrar: () => hecho({ ok: true }),
    // Editor: el contenido de muestra vive en memoria; la "fecha" es un contador.
    leer: rel => { const [d, n] = partir(rel); if (!d || !(n in d) || typeof d[n] === 'object') return hecho({ error: 'Ya no existe: puede que se haya movido o borrado.' }); const t = textos[rel]; return hecho(t || (textos[rel] = { texto: '// ' + n + ' (contenido de muestra)\n', mtime: 1 })); },
    escribir: (rel, texto, mtime, forzar) => { const t = textos[rel] || { texto: '', mtime: 1 }; if (!forzar && t.mtime !== mtime) return hecho({ conflicto: true, mtime: t.mtime, disco: t.texto }); textos[rel] = { texto: texto, mtime: t.mtime + 1 }; return hecho({ ok: true, mtime: t.mtime + 1 }); }
  };
  const textos = {};

  const fin = s => { s.est = 'listo'; s.t1 = AHORA; s.agentes.forEach(a => { if (a.est === 'curso') { a.est = 'listo'; a.t1 = AHORA; } }); s.eventos.forEach(e => { if (e.est === 'curso') { e.est = 'listo'; e.dur = Math.max(1, AHORA - e.t); } }); };

  // ---- Acciones: en la maqueta solo cambian el estado en memoria ----
  // En la maqueta no se consulta GitHub: la tarjeta Cambios enseña su estado vacío.
  D.pr = () => hecho({ pr: null, motivo: 'En la maqueta no se consulta GitHub.' });
  D.diagnostico = () => hecho({ lista: [
    { id: 'cli', nombre: 'Claude Code (CLI)', estado: 'ok', detalle: 'Versión 2.1.280 (muestra).', accion: '' },
    { id: 'auth', nombre: 'Sesión iniciada', estado: 'ok', detalle: 'Con tu suscripción de claude.ai.', accion: '' },
    { id: 'ollama', nombre: 'IA local (Ollama)', estado: 'aviso', detalle: 'No está en marcha.', accion: 'Es opcional: sin Ollama todo va a Claude.' },
    { id: 'datos', nombre: 'Carpeta de datos', estado: 'ok', detalle: '%USERPROFILE%\\AppData\\Roaming\\Rastro\\datos (se puede leer y escribir).', accion: '' }
  ], informe: 'Estado de Rastro (muestra)' });
  D.detener = id => {
    const s = calc.sesion(id);
    if (!s || s.origen !== 'app') return;          // el resto es de solo lectura
    s.est = 'deteniendo'; D.emitir();
    setTimeout(() => { s.est = 'detenido'; s.t1 = AHORA; s.agentes.forEach(a => { if (a.est === 'curso') { a.est = 'detenido'; a.t1 = AHORA; } }); D.emitir(); }, 400);
  };
  D.aprobar = id => { const s = calc.sesion(id); s.fase = 'codigo'; s.est = 'curso'; s.t1 = null; s.modelo = s.modelos.codigo; s.agentes[0].est = 'curso'; D.emitir(); };
  D.pedirCambios = id => { const s = calc.sesion(id); s.fase = 'diseno'; s.est = 'curso'; s.t1 = null; s.modelo = s.modelos.diseno; s.agentes[0].est = 'curso'; D.emitir(); };
  // Reanudar una fase interrumpida: en la maqueta, la misma sesión vuelve a estar en curso.
  D.reanudar = id => { const s = calc.sesion(id); s.est = 'curso'; s.t1 = null; s.agentes[0].est = 'curso'; D.emitir(); return hecho({ id: id }); };
  D.regenerar = id => {
    const r = calc.sesion(id).resumen;
    r.est = 'generando'; D.emitir();
    setTimeout(() => { r.est = r.objetivo ? 'listo' : 'fallo'; D.emitir(); }, 400);
  };
  D.crear = cfg => {
    const s = sesionCorta({ id: 's' + (D.estado.sesiones.length + 1), nombre: cfg.titulo || cfg.nombre, carpeta: cfg.raiz + '\\' + cfg.nombre, origen: 'app', est: 'curso', fase: 'diseno', modelo: cfg.modelos.diseno, t0: AHORA, modelos: cfg.modelos, aprobar: cfg.aprobar, permisos: cfg.permisos, entregables: ['DESIGN.md', 'maqueta\\index.html'] }, []);
    D.estado.sesiones.unshift(s); D.emitir();
    return s.id;
  };
  D.exportar = () => JSON.stringify({ rastro: 1, sesiones: D.estado.sesiones }, null, 1);
  let importadas = null;
  D.importar = texto => { const j = JSON.parse(texto); if (j.rastro !== 1 || !Array.isArray(j.sesiones)) throw new Error('No es un respaldo de Rastro.'); importadas = j.sesiones; return { n: importadas.length, actual: D.estado.sesiones.length, que: 'sesiones' }; };
  D.reemplazar = () => { if (importadas) D.estado.sesiones = importadas; importadas = null; D.emitir(); };
  D.borrar = () => { D.estado.sesiones = []; D.estado.actividad = { dias: [], horas: [] }; D.emitir(); };

  // ---- Simulación: solo existe con datos de muestra ----
  D.sim = {
    escenario(e) { semilla = 7; n = 0; cargar(e); D.emitir(); D.avisar({ tipo: 'conexion', texto: e === 'perdida' ? 'Se perdió la conexión.' : '' }); },
    fuenteUso(f) { Object.assign(D.estado.uso, USO[f]); D.emitir(); },
    // Vista previa oficial con un porcentaje concreto de la sesión (capturas y pruebas). No toca la de 62 %.
    pctUso(v) { Object.assign(D.estado.uso, USO.oficial, { bloques: [Object.assign({}, USO.oficial.bloques[0], { pct: v }), USO.oficial.bloques[1]] }); D.emitir(); },
    // Llega un evento nuevo al agente indicado de la sesión en vivo.
    evento(sesion, agente, error) {
      const s = calc.sesion(sesion); if (!s || s.est !== 'curso') return;
      AHORA += 4000;
      const f = uno(ARCHIVOS);
      s.eventos.push(ev(AHORA, agente, 0, error ? 'Bash' : 'Read', error ? 'node --test' : f, error ? 640 : 44, error ? { est: 'error', err: 'not ok 2 - el medidor pasa a rojo desde el 90 %' } : { archivo: f, sal: '(' + (60 + n) + ' líneas)' }));
      D.emitir(); if (error) D.avisar({ tipo: 'error', sesion: s.id });
    },
    // Terminan a la vez todas las sesiones en curso: el sonido debe oírse una sola vez.
    terminar() {
      AHORA += 2000;
      const vivas = D.estado.sesiones.filter(s => s.est === 'curso');
      vivas.forEach(fin); D.emitir();
      vivas.forEach(s => D.avisar({ tipo: 'fin', sesion: s.id, texto: 'La sesión ' + s.nombre + ' terminó.' }));
    }
  };
})(window.RA = window.RA || {});
