/* Glifos de puntos 5×5: la identidad de agentes y herramientas (nunca va por color). Cada patrón es
   una cadena de 25 caracteres, fila a fila: '#' es un punto. También dibuja la marca. */
(function (RA) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const g = filas => filas.join('');
  const P = {
    Principal: g(['.###.', '#...#', '#.#.#', '#...#', '.###.']),
    Read:      g(['#####', '.....', '#####', '.....', '###..']),
    Edit:      g(['...##', '..#.#', '.#.#.', '#.#..', '##...']),
    Write:     g(['####.', '#..##', '#...#', '#...#', '#####']),
    Bash:      g(['#....', '.#...', '#....', '.....', '..###']),
    Grep:      g(['.##..', '#..#.', '#..#.', '.###.', '....#']),
    Glob:      g(['..#..', '#.#.#', '.###.', '#.#.#', '..#..']),
    Web:       g(['.###.', '#.#.#', '#####', '#.#.#', '.###.']),
    Agente:    g(['..#..', '..#..', '.#.#.', '#...#', '#...#']),
    Otra:      g(['.....', '.....', '#.#.#', '.....', '.....']),
    // Árbol de archivos: la carpeta cerrada va llena y la abierta, hueca.
    Carpeta:   g(['###..', '#####', '#####', '#####', '#####']),
    Abierta:   g(['###..', '#####', '#...#', '#...#', '#####']),
    Archivo:   g(['###..', '#.##.', '#...#', '#...#', '#####']),
    Codigo:    g(['.....', '.#.#.', '#...#', '.#.#.', '.....']),
    Datos:     g(['#.#.#', '.....', '#.#.#', '.....', '#.#.#']),
    Imagen:    g(['#####', '#...#', '#.#.#', '##.##', '#####']),
    // GitHub: dos ramas que se unen (un pull request), sin logotipos de terceros.
    GitHub:    g(['#...#', '#...#', '#..#.', '#.#..', '##...'])
  };
  // Extensión -> glifo. Lo que no está aquí lleva el de archivo genérico.
  const EXT = {};
  [['Codigo', 'js mjs cjs ts tsx jsx py rb go rs java kt c h cpp cs php sh ps1 bat cmd css scss less vue svelte sql'], ['Read', 'md txt rst log'],
    ['Datos', 'json yml yaml toml xml csv ini env lock'], ['Imagen', 'png jpg jpeg gif svg webp ico bmp'], ['Web', 'html htm']].forEach(t => t[1].split(' ').forEach(e => { EXT[e] = t[0]; }));
  // Nombre de herramienta del transcript -> glifo. Las de servidores MCP y las desconocidas, "Otra".
  const DE = {
    Read: 'Read', Edit: 'Edit', MultiEdit: 'Edit', NotebookEdit: 'Edit', Write: 'Write',
    Bash: 'Bash', PowerShell: 'Bash', BashOutput: 'Bash', Grep: 'Grep', Glob: 'Glob',
    WebFetch: 'Web', WebSearch: 'Web', Agent: 'Agente', Task: 'Agente'
  };
  const RESERVADOS = Object.keys(P).map(k => P[k]);
  // Caras de la mascota: el interior (7×5) de su cabeza de 9×9. Se distinguen por la forma, sin color.
  const CARAS = {
    reposo:     ['.......', '.......', '.##.##.', '.......', '..###..'],   // ojos cerrados
    escuchando: ['.#...#.', '.#...#.', '.......', '...#...', '.......'],   // ojos abiertos, boca en "o"
    trabajando: ['.......', '..#..#.', '..#..#.', '.......', '...##..'],   // mira hacia la burbuja
    termino:    ['.#...#.', '#.#.#.#', '.......', '.#...#.', '..###..'],   // ojos en "^" y sonrisa
    error:      ['#.#.#.#', '.#...#.', '#.#.#.#', '.......', '.#.#.#.'],   // ojos en "x"
    esperando:  ['.#...#.', '.#...#.', '.......', '..###..', '.......'],   // ojos abiertos, boca recta: espera tu respuesta
    pensando:   ['.......', '.##.##.', '.......', '.....#.', '....#..'],   // ojos entornados, boca torcida: un asistente auxiliar trabaja
    juego:      ['.......', '.......', '.#####.', '.......', '...#...'],   // ojos en una sola línea: en pausa por el modo juego
    continuidad:['.#...#.', '.......', '.......', '.#.#.#.', '.......']    // ojos pequeños, boca punteada: Claude no está disponible
  };

  function hash(s, sal) {
    let h = 2166136261 ^ sal;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  const glifos = {
    P: P,
    deHerramienta(nombre) { return P[DE[nombre] || 'Otra']; },
    // Glifo de una entrada del árbol de archivos, por su tipo.
    deArchivo(nombre, carpeta, abierta) {
      if (carpeta) return P[abierta ? 'Abierta' : 'Carpeta'];
      const n = String(nombre).toLowerCase(), i = n.lastIndexOf('.');
      return P[EXT[i > 0 ? n.slice(i + 1) : n.replace(/^\./, '')] || 'Archivo'];
    },

    /* Identicón de un subagente: las columnas 1 a 3 salen de un hash de su identificador y las 4 y 5
       son el espejo de la 2 y la 1. Mismo identificador, mismo glifo. Se descartan los patrones que
       coinciden con uno reservado y los casi vacíos o casi llenos, que no se distinguen a 20 px. */
    identicon(id) {
      for (let sal = 0; ; sal++) {
        const h = hash(String(id), sal);
        let p = '';
        for (let r = 0; r < 5; r++) {
          const b = (h >>> (r * 3)) & 7, c = [b & 1, b >> 1 & 1, b >> 2 & 1];
          p += [c[0], c[1], c[2], c[1], c[0]].map(x => x ? '#' : '.').join('');
        }
        const n = p.split('#').length - 1;
        if (n >= 8 && n <= 17 && RESERVADOS.indexOf(p) < 0) return p;
      }
    },

    // SVG del glifo. paso: 4 px en listas (20 px), 6 en tarjetas. Sin nombre es decorativo.
    svg(patron, nombre, paso) {
      const lado = 5 * (paso || 4);
      const s = document.createElementNS(NS, 'svg');
      s.setAttribute('class', 'glifo'); s.setAttribute('viewBox', '0 0 20 20');
      s.setAttribute('width', lado); s.setAttribute('height', lado);
      if (nombre) { s.setAttribute('role', 'img'); s.setAttribute('aria-label', nombre); } else s.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < 25; i++) {
        if (patron[i] !== '#') continue;
        const c = document.createElementNS(NS, 'circle');
        c.setAttribute('cx', 2 + 4 * (i % 5)); c.setAttribute('cy', 2 + 4 * Math.floor(i / 5)); c.setAttribute('r', 1.5);
        s.appendChild(c);
      }
      return s;
    },

    // Glifo de un agente: el principal lleva el suyo, fijo; cada subagente, su identicón.
    deAgente(ag, nombre, paso) { return glifos.svg(ag.padre ? glifos.identicon(ag.id) : P.Principal, nombre, paso); },

    /* Mascota: cabeza redonda de 9×9 puntos bajo una antena de dos. La cara cambia con el estado y la
       punta de la antena repite la forma del estado de la sesión: llena en rojo si trabaja, anillo rojo
       si falló, llena en tinta si terminó y hueca en reposo o escuchando. */
    mascota(estado, nombre) {
      const filas = ['....#....', '....#....', '..#####..', '.#.....#.'].concat(CARAS[estado].map(f => '#' + f + '#'), ['.#.....#.', '..#####..']);
      const s = document.createElementNS(NS, 'svg');
      s.setAttribute('class', 'mascota'); s.setAttribute('viewBox', '0 0 36 44');
      if (nombre) { s.setAttribute('role', 'img'); s.setAttribute('aria-label', nombre); } else s.setAttribute('aria-hidden', 'true');
      // La cara va en su propio grupo: así puede mirar hacia el cursor sin mover la cabeza.
      const cara = document.createElementNS(NS, 'g');
      cara.setAttribute('class', 'cara');
      filas.forEach((f, r) => f.split('').forEach((ch, x) => {
        if (ch !== '#') return;
        const c = document.createElementNS(NS, 'circle');
        c.setAttribute('cx', 2 + 4 * x); c.setAttribute('cy', 2 + 4 * r); c.setAttribute('r', r ? 1.5 : 1.7);
        if (!r) c.setAttribute('class', 'punta ' + estado);
        (r >= 4 && r <= 8 && x >= 1 && x <= 7 ? cara : s).appendChild(c);
      }));
      s.appendChild(cara);
      return s;
    },

    /* Marca: "RASTRO" en matriz de puntos 5×7 y, al final, un único punto rojo: el borde vivo. Cada
       punto es un trazo de longitud cero con extremo redondo, como en la marca de TypeNothing. */
    marca() {
      const L = {
        R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
        A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
        S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
        T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
        O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.']
      };
      let d = '';
      'RASTRO'.split('').forEach((ch, k) => L[ch].forEach((fila, r) => fila.split('').forEach((c, x) => {
        if (c === '#') d += 'M' + (2 + 4 * (k * 6 + x)) + ' ' + (2 + 4 * r) + 'h0';
      })));
      const s = document.createElementNS(NS, 'svg');
      s.setAttribute('viewBox', '0 0 152 28'); s.setAttribute('width', 114); s.setAttribute('height', 21);
      s.setAttribute('role', 'img'); s.setAttribute('aria-label', 'Rastro');
      [[d, ''], ['M150 26h0', 'head']].forEach(p => {
        const n = document.createElementNS(NS, 'path');
        n.setAttribute('d', p[0]); if (p[1]) n.setAttribute('class', p[1]);
        s.appendChild(n);
      });
      return s;
    }
  };

  RA.glifos = glifos;
})(window.RA = window.RA || {});
