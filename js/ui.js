/* Piezas de interfaz reutilizables. Todo el texto entra por textContent: lo que viene de eventos
   (entradas, salidas, rutas, mensajes) es no confiable y nunca se interpreta como HTML. */
(function (RA) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  // Cifras y horas según la configuración regional del sistema (ver README, "Decisiones tomadas").
  const nf = new Intl.NumberFormat();
  const nf1 = new Intl.NumberFormat(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const hf = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const df = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const ESTADOS = { cola: 'En cola', curso: 'En curso', listo: 'Listo', error: 'Error', detenido: 'Detenido', deteniendo: 'Deteniendo', nodatos: 'Sin datos', espera: 'Esperando aprobación' };
  const TRAZOS = ['', '6 4', '1 4', '8 3 1 3', '12 4'];   // continuo, discontinuo, punteado, raya y punto, raya larga
  let serie = 0;   // para ids únicos

  const ui = {
    ESTADOS: ESTADOS,
    $(sel, root) { return (root || document).querySelector(sel); },
    $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); },

    // Crea un elemento. attrs: class, text, css (propiedades), on<evento> y atributos normales.
    el(tag, attrs, kids) {
      const n = document.createElement(tag);
      Object.keys(attrs || {}).forEach(k => {
        const v = attrs[k];
        if (k === 'class') n.className = v;
        else if (k === 'text') n.textContent = v;
        else if (k === 'css') Object.keys(v).forEach(p => n.style.setProperty(p, v[p]));
        else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
        else if (v === true) n.setAttribute(k, '');
        else if (v !== false && v != null) n.setAttribute(k, v);
      });
      [].concat(kids == null ? [] : kids).forEach(c => { if (c != null) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
      return n;
    },
    svg(tag, attrs, kids) {
      const n = document.createElementNS(NS, tag);
      Object.keys(attrs || {}).forEach(k => { if (k === 'text') n.textContent = attrs[k]; else if (attrs[k] != null) n.setAttribute(k, attrs[k]); });
      [].concat(kids == null ? [] : kids).forEach(c => { if (c) n.appendChild(c); });
      return n;
    },
    // Sustituye el contenido de un nodo.
    pintar(node, kids) {
      node.textContent = '';
      [].concat(kids == null ? [] : kids).forEach(k => { if (k != null) node.append(k); });
      return node;
    },

    // Dice una frase por la región de estado (#status). Cada frase es un nodo nuevo: así se anuncia
    // aunque repita la anterior y dos seguidas no se pisan.
    // o: tipo ('neutro' | 'ok' | 'atencion' | 'error') o { tipo, accion: { texto, fn }, detalle, ms, toast: false, sesion }.
    // Además de anunciarlo, lo enseña en un toast (salvo toast: false) y lo apunta en el centro de avisos.
    decir(text, o) {
      o = typeof o === 'string' ? { tipo: o } : (o || {});
      const n = ui.$('#status');
      while (n.childNodes.length > 2) n.firstChild.remove();
      n.appendChild(ui.el('div', {}, text));
      if (o.toast !== false) ui.toast(text, o);
    },
    // Tipo de un mensaje por su forma, cuando quien lo dice no lo indica.
    tipoDe(text) {
      const t = String(text);
      if (/^(No se|No hay|Falló|Error|No pudo|Ese archivo no)|no se pudo|falló/i.test(t)) return 'error';
      if (/necesita|atención|cerca del límite|no cabe|no está disponible|Pendientes/i.test(t)) return 'atencion';
      if (/(copiad[oa]|guardad[oa]|enviad[oa]|lista?\.|aprobado|importado|exportado|activad[oa]|encendido|cambiad[oa]|en la cola)/i.test(t)) return 'ok';
      return 'neutro';
    },

    /* ---- Toasts ---- Dentro de la ventana, abajo a la derecha; ~4 s (8 s si ofrecen Deshacer), se
       pausan con el cursor o el foco; tres como mucho. No son región viva: lo anuncia #status. */
    toast(text, o) {
      o = o || {};
      let caja = ui.$('#toasts');
      if (!caja) { caja = ui.el('div', { id: 'toasts', class: 'toasts' }); document.body.appendChild(caja); }
      const tipo = o.tipo || ui.tipoDe(text), ICONO = { ok: '✓', atencion: '!', error: '✕', neutro: 'i' }, NOMBRE = { ok: 'Hecho', atencion: 'Atención', error: 'Error', neutro: 'Aviso' };
      let t = null, resta = o.ms || (o.accion ? 8000 : 4000), desde = 0;
      const cerrar = () => { clearTimeout(t); if (n.isConnected) n.remove(); };
      const correr = () => { desde = Date.now(); t = setTimeout(cerrar, resta); };
      const parar = () => { clearTimeout(t); resta = Math.max(1500, resta - (Date.now() - desde)); };
      const n = ui.el('div', { class: 'toast ' + tipo, 'data-tipo': tipo }, [
        ui.el('span', { class: 't-ico', 'aria-hidden': 'true' }, ICONO[tipo]),
        ui.el('div', { class: 't-txt' }, [ui.el('span', { class: 'sr' }, NOMBRE[tipo] + ': '), text]),
        ui.el('button', { type: 'button', class: 't-cerrar', title: 'Cerrar aviso', onclick: cerrar }, [ui.el('span', { 'aria-hidden': 'true' }, '×'), ui.el('span', { class: 'sr' }, 'Cerrar aviso')]),
        o.accion ? ui.el('div', { class: 't-acc' }, ui.el('button', { type: 'button', class: 'btn btn-small', onclick: () => { cerrar(); o.accion.fn(); } }, o.accion.texto)) : null,
        o.detalle ? ui.el('details', {}, [ui.el('summary', {}, 'Ver detalles'), ui.el('pre', {}, String(o.detalle).slice(0, 2000))]) : null
      ]);
      ['mouseenter', 'focusin'].forEach(e => n.addEventListener(e, parar));
      ['mouseleave', 'focusout'].forEach(e => n.addEventListener(e, ev => { if (!n.contains(ev.relatedTarget)) correr(); }));
      caja.appendChild(n);
      while (caja.children.length > 3) caja.firstChild.remove();
      correr();
      if (ui.alAviso && o.registrar !== false) ui.alAviso({ tipo: tipo, texto: String(text).slice(0, 240), sesion: o.sesion || null });
      return { cerrar: cerrar, nodo: n };
    },

    /* Botón con proceso: mientras corre, aria-busy, deshabilitado y "Enviando…"; si sale bien, "✓ Hecho"
       en verde ~1,2 s. hacer devuelve una promesa; un resultado con { error } cuenta como fallo. */
    ocupado(btn, hacer, o) {
      o = o || {};
      if (!btn) return Promise.resolve().then(hacer);
      if (btn.getAttribute('aria-busy') === 'true') return Promise.resolve(null);
      const antes = Array.from(btn.childNodes).map(c => c.cloneNode(true)), estabaOff = btn.disabled;
      const volver = () => { btn.classList.remove('hecho'); btn.removeAttribute('aria-busy'); btn.disabled = estabaOff; ui.pintar(btn, antes.map(c => c.cloneNode(true))); };
      btn.setAttribute('aria-busy', 'true'); btn.disabled = true; btn.textContent = o.cargando || 'Enviando…';
      return Promise.resolve().then(hacer).then(r => {
        if (!btn.isConnected) return r;
        if (r && r.error) { volver(); return r; }
        btn.removeAttribute('aria-busy'); btn.classList.add('hecho'); btn.textContent = '✓ ' + (o.hecho || 'Hecho');
        setTimeout(() => { if (btn.isConnected) volver(); }, 1200);
        return r;
      }, e => { volver(); throw e; });
    },

    // ---- Formatos ----
    num(n) { return nf.format(n); },
    /* Entero para las cifras grandes en Doto: los miles se separan con un espacio fino, no con el
       signo de la configuración regional. En es-PE ese signo es una coma, que en matriz de puntos y a
       56 px se lee como coma decimal ("13,964"); un espacio no se puede confundir. */
    cifra(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); },
    hora(t) { return hf.format(t); },
    fecha(t) { return df.format(t); },
    // 820 ms · 1,2 s · 3 min 05 s · 1 h 12 min
    dur(ms) {
      if (ms == null) return '—';
      if (ms < 1000) return Math.round(ms) + ' ms';
      if (ms < 60000) return nf1.format(ms / 1000) + ' s';
      const s = Math.round(ms / 1000);
      if (s < 3600) return Math.floor(s / 60) + ' min ' + String(s % 60).padStart(2, '0') + ' s';
      return Math.floor(s / 3600) + ' h ' + String(Math.floor(s % 3600 / 60)).padStart(2, '0') + ' min';
    },
    falta(ms) {
      const m = Math.max(0, Math.round(ms / 60000));
      if (m >= 1440) return Math.floor(m / 1440) + ' d ' + Math.floor(m % 1440 / 60) + ' h';
      return m >= 60 ? Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') + ' min' : m + ' min';
    },
    // Tokens como [cifra, unidad]: ['1,8', 'M'] · ['56,8', 'k'] · ['940', '']
    tokensPartes(n) { return n >= 1e6 ? [nf1.format(n / 1e6), 'M'] : n >= 1e3 ? [nf1.format(n / 1e3), 'k'] : [String(n), '']; },
    tokens(n) { return ui.tokensPartes(n).join(' ').trim(); },
    // 'claude-opus-5-5' -> 'opus 5.5'. Sale del identificador real del transcript, no de una lista fija.
    modelo(id) {
      const p = String(id || '').replace(/^claude-/, '').replace(/-\d{8}$/, '').split('-');
      return p.length > 1 ? p[0] + ' ' + p.slice(1).join('.') : (p[0] || 'modelo');
    },

    // ---- Insignias, estados y puntos ----
    // Los corchetes son adorno: se ven, pero un lector de pantalla no los lee.
    corchetes(kids) {
      const b = t => ui.el('span', { 'aria-hidden': 'true' }, t);
      return [b('[ ')].concat(kids, [b(' ]')]);
    },
    insignia(kids, clase) { return ui.el('span', { class: 'badge' + (clase ? ' ' + clase : '') }, ui.corchetes(kids)); },
    // Punto de estado: la forma distingue cada estado; el nombre va para lectores de pantalla.
    estado(e, grande) {
      const forma = { deteniendo: 'detenido', espera: 'cola' }[e] || e;
      return ui.el('span', { class: 'est ' + forma + (grande ? ' g' : ''), role: 'img', 'aria-label': ESTADOS[e] || e });
    },
    insigniaEstado(e) { return ui.insignia(ESTADOS[e] || e, e === 'error' ? 'alerta' : ''); },
    // Fila de puntos (fases de una sesión, pasos del asistente): llenos hasta `hasta`.
    puntos(total, hasta, nombre) {
      const d = ui.el('span', { class: 'dots', role: 'img', 'aria-label': nombre });
      for (let i = 1; i <= total; i++) d.appendChild(ui.el('i', { class: i <= hasta ? 'on' : '' }));
      return d;
    },
    // Flecha ↗ del pie de tarjeta: SVG propio, porque el carácter no está en las fuentes.
    flecha() {
      return ui.svg('svg', { viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': 'true' }, ui.svg('path', { d: 'M5 11 11 5M6 5h5v5' }));
    },
    // Galón de una subtarjeta desplegable.
    galon() {
      return ui.svg('svg', { class: 'chev', viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': 'true' }, ui.svg('path', { d: 'M4 6l4 4 4-4' }));
    },
    // Icono del tema: disco lleno (oscuro), anillo (claro) o medio disco (automático).
    iconoTema(t) {
      const s = ui.svg('svg', { viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': 'true' }, ui.svg('circle', { class: t === 'dark' ? '' : 'hueco-i', cx: 8, cy: 8, r: 5.5 }));
      if (t === 'auto') s.appendChild(ui.svg('path', { d: 'M8 2.5a5.5 5.5 0 0 0 0 11z' }));
      return s;
    },
    // Icono de Ajustes: tres reguladores (líneas con su perilla), en el mismo trazo que el del tema.
    // Tuerca de Ajustes: un engranaje de 8 dientes con su agujero, dibujado como trazo (sin librerías de iconos).
    iconoAjustes() {
      const d = [], N = 8, R1 = 7, R2 = 5.3, A = Math.PI / N;
      for (let i = 0; i < N; i++) {
        const a0 = i * 2 * A - A * 0.45, a1 = i * 2 * A + A * 0.45, a2 = (i * 2 + 1) * A - A * 0.55, a3 = (i * 2 + 1) * A + A * 0.55;
        const p = (r, a) => (8 + r * Math.cos(a)).toFixed(2) + ' ' + (8 + r * Math.sin(a)).toFixed(2);
        d.push((i ? 'L' : 'M') + p(R2, a0 - A * 0.2), 'L' + p(R1, a0), 'L' + p(R1, a1), 'L' + p(R2, a1 + A * 0.2), 'L' + p(R2, a2), 'L' + p(R2, a3));
      }
      return ui.svg('svg', { viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': 'true', class: 'tuerca-ico' }, [
        ui.svg('path', { class: 'hueco-i', d: d.join(' ') + 'Z' }),
        ui.svg('circle', { class: 'hueco-i', cx: 8, cy: 8, r: 2.2 })
      ]);
    },
    /* Tarjeta con su anatomía: escenario (el recuadro interior, donde va el contenido) y tira de pie
       con el título y, si la tarjeta lleva a una vista ampliada, la flecha que la abre.
       o: { id, clase, esc (clases del escenario), ir (función), irNombre, pie (nodo a la derecha) } */
    tarjeta(titulo, contenido, o) {
      o = o || {};
      const id = o.id || 't' + (++serie);
      return ui.el('section', { class: 'card' + (o.clase ? ' ' + o.clase : ''), 'aria-labelledby': id }, [
        ui.el('div', { class: 'esc' + (o.esc ? ' ' + o.esc : '') }, contenido),
        ui.el('div', { class: 'card-pie' }, [
          ui.el('h2', { id: id, class: 'label' }, titulo),
          o.ir ? ui.el('button', { type: 'button', class: 'mas', 'aria-label': o.irNombre, onclick: o.ir }, ui.flecha()) : (o.pie || null)
        ])
      ]);
    },
    // Ruta con elipsis en el centro: la carpeta se recorta y el nombre del archivo se conserva.
    ruta(texto) {
      const s = String(texto), i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
      return ui.el('span', { class: 'ruta', title: s }, [i >= 0 ? ui.el('span', { class: 'a' }, s.slice(0, i + 1)) : null, ui.el('span', { class: 'b' }, s.slice(i + 1))]);
    },

    /* Selector segmentado accesible (grupo de radios). opciones: [[valor, etiqueta], ...]. El grupo
       es una sola parada de tabulador; flechas, Inicio y Fin mueven la selección. Elegir suele
       repintar, así que después el foco vuelve al segmento marcado, que se busca por el id de la caja. */
    segmentado(box, opciones, valor, alCambiar, etiqueta) {
      box.textContent = '';
      box.classList.add('seg');
      box.setAttribute('role', 'radiogroup');
      if (etiqueta) box.setAttribute('aria-label', etiqueta);
      const elegir = v => {
        alCambiar(v);
        const on = box.id && ui.$('#' + box.id + ' [aria-checked="true"]');
        if (on) on.focus();
      };
      const paso = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }, n = opciones.length;
      opciones.forEach((c, i) => box.appendChild(ui.el('button', {
        type: 'button', role: 'radio', 'data-v': String(c[0]),
        'aria-checked': String(c[0] === valor), tabindex: c[0] === valor ? '0' : '-1',
        onclick: () => elegir(c[0]),
        onkeydown: e => {
          const a = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : paso[e.key] ? (i + paso[e.key] + n) % n : -1;
          if (a < 0 || e.ctrlKey || e.altKey || e.metaKey) return;
          e.preventDefault();
          elegir(opciones[a][0]);
        }
      }, c[1])));
      if (!box.querySelector('[tabindex="0"]') && box.firstChild) box.firstChild.tabIndex = 0;
      return box;
    },

    /* Ayuda contextual: un botón "?" que despliega una frase debajo. Esc o un clic fuera la cierran.
       termino: el nombre que se explica (va en el nombre accesible: "Qué es Agente"). */
    ayuda(termino, texto) {
      const id = 'ay' + (++serie);
      const txt = ui.el('span', { id: id, class: 'ayuda-txt', role: 'note', hidden: true }, texto);
      const b = ui.el('button', { type: 'button', class: 'ayuda', 'aria-expanded': 'false', 'aria-controls': id, title: 'Qué es «' + termino + '»' }, [ui.el('span', { 'aria-hidden': 'true' }, '?'), ui.el('span', { class: 'sr' }, 'Ver qué es ' + termino)]);
      const poner = v => { b.setAttribute('aria-expanded', String(v)); txt.hidden = !v; };
      b.addEventListener('click', e => { e.stopPropagation(); poner(txt.hidden); });
      b.addEventListener('keydown', e => { if (e.key === 'Escape' && !txt.hidden) { e.stopPropagation(); poner(false); } });
      document.addEventListener('click', e => { if (!txt.hidden && !txt.contains(e.target)) poner(false); });
      return ui.el('span', { class: 'ayuda-caja' }, [b, txt]);
    },

    // Interruptor: el estado se lee en el texto (Sí / No), no solo en el relleno. Su nombre accesible
    // sale del contenido: el nombre, solo para lector de pantalla, y el valor a la vista.
    interruptor(valor, alCambiar, nombre) {
      const b = ui.el('button', { type: 'button', class: 'btn btn-small sw', role: 'switch', 'aria-checked': String(!!valor), 'data-nombre': nombre }, [ui.el('span', { class: 'sr' }, nombre + ': '), valor ? 'Sí' : 'No']);
      b.addEventListener('click', () => {
        const v = b.getAttribute('aria-checked') !== 'true';
        b.setAttribute('aria-checked', String(v)); b.lastChild.textContent = v ? 'Sí' : 'No';
        alCambiar(v);
      });
      return b;
    },

    /* Botón de dos pasos para detener o borrar, sin diálogo nativo: el primer clic lo arma ("¿Seguro? Pulsa
       otra vez", con cuenta atrás) y lo anuncia; el segundo actúa. Se desarma solo a los 4 s, al perder el
       foco o con Esc. */
    armar(btn, pregunta, hacer) {
      const texto = btn.textContent;
      let t = null;
      const desarmar = () => { clearInterval(t); btn.classList.remove('armed'); btn.textContent = texto; };
      btn.addEventListener('click', () => {
        if (btn.classList.contains('armed')) { desarmar(); hacer(); return; }
        btn.classList.add('armed');
        let s = 4;
        const pinta = () => { btn.textContent = pregunta + ' Pulsa otra vez · ' + s; };
        pinta();
        t = setInterval(() => { if (--s <= 0) desarmar(); else pinta(); }, 1000);
        btn.focus();
        ui.decir(pregunta + ' Pulsa de nuevo para confirmar.', { toast: false });
      });
      btn.addEventListener('blur', desarmar);
      btn.addEventListener('keydown', e => { if (e.key === 'Escape' && btn.classList.contains('armed')) { e.stopPropagation(); desarmar(); } });
      return btn;
    },

    /* Lista con una sola parada de tabulador: las flechas, Inicio y Fin mueven el foco entre los
       elementos que cumplen `sel`. Son botones: Enter y Espacio los activan sin ayuda. */
    flechas(caja, sel) {
      caja.addEventListener('keydown', e => {
        const todos = ui.$$(sel, caja), i = todos.indexOf(document.activeElement);
        if (i < 0) return;
        const a = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? todos.length - 1 : -2;
        if (a > -2) { e.preventDefault(); if (todos[a]) todos[a].focus(); }
      });
    },

    // Mantiene el foco dentro de una capa (asistente, paleta) y lo devuelve al cerrar.
    atrapar(caja, alEsc) {
      const antes = document.activeElement;
      const tecla = e => {
        if (e.key === 'Escape') { e.preventDefault(); alEsc(); return; }
        if (e.key !== 'Tab') return;
        const f = ui.$$('button,input,select,textarea,[tabindex="0"]', caja).filter(n => !n.disabled && n.offsetParent !== null);
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      };
      caja.addEventListener('keydown', tecla);
      return () => { caja.removeEventListener('keydown', tecla); if (antes && document.contains(antes)) antes.focus(); };
    },

    // ---- Medidor de uso: 20 puntos, 5 % cada uno; en rojo solo desde el 90 % ----
    // Sin porcentaje (pct null) el medidor se dibuja apagado y lo dice: no hay dato que mostrar.
    medidor(pct, nombre, texto, chico) {
      if (pct == null) {
        const v = ui.el('div', { class: 'medidor', role: 'img', 'aria-label': nombre + ': ' + texto });
        for (let i = 0; i < 20; i++) v.appendChild(ui.el('i'));
        return v;
      }
      const m = ui.el('div', {
        class: 'medidor' + (chico ? ' p' : '') + (pct >= 90 ? ' alto' : ''), role: 'meter', 'aria-label': nombre,
        'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(pct)), 'aria-valuetext': texto
      });
      for (let i = 1; i <= 20; i++) m.appendChild(ui.el('i', { class: pct >= i * 5 ? 'on' : '' }));
      return m;
    },

    /* ---- Heatmap ---- celdas en orden por columnas, 7 por columna: { n: nivel 0-4, e: hubo error,
       t: texto que se anuncia }. La rejilla es una sola parada de tabulador; las flechas mueven la
       celda activa (aria-activedescendant) y o.alVer recibe el texto de la celda activa o señalada. */
    calor(celdas, o) {
      const id = 'cal' + (++serie), cols = Math.ceil(celdas.length / 7);
      const caja = ui.el('div', { class: 'calor' + (o.amplia ? ' amplia' : ''), role: 'grid', tabindex: '0', 'aria-label': o.nombre, 'aria-rowcount': '7', 'aria-colcount': String(cols) });
      const filas = [0, 1, 2, 3, 4, 5, 6].map(() => caja.appendChild(ui.el('div', { role: 'row' })));
      const nodos = celdas.map((c, i) => {
        const n = ui.el('i', { id: id + '-' + i, role: 'gridcell', class: 'n' + c.n + (c.e ? ' e' : ''), 'aria-label': c.t, css: { 'grid-row': String(i % 7 + 1), 'grid-column': String(Math.floor(i / 7) + 1) } });
        n.addEventListener('mouseenter', () => o.alVer && o.alVer(c.t));
        return filas[i % 7].appendChild(n);
      });
      let act = o.inicial >= 0 ? o.inicial : celdas.length - 1;
      const ir = i => {
        nodos[act].classList.remove('act');
        act = Math.max(0, Math.min(celdas.length - 1, i));
        nodos[act].classList.add('act');
        caja.setAttribute('aria-activedescendant', nodos[act].id);
        if (o.alVer) o.alVer(celdas[act].t);
      };
      caja.addEventListener('keydown', e => {
        const r = act % 7;
        const a = e.key === 'ArrowUp' ? (r ? act - 1 : act) : e.key === 'ArrowDown' ? (r < 6 ? act + 1 : act) : e.key === 'ArrowLeft' ? act - 7 : e.key === 'ArrowRight' ? act + 7
          : e.key === 'Home' ? r : e.key === 'End' ? celdas.length - 7 + r : null;
        if (a === null) return;
        e.preventDefault();
        if (a >= 0 && a < celdas.length) ir(a);
      });
      if (celdas.length) ir(act);
      return caja;
    },

    /* ---- Gráfico de ritmo ---- series: [{ cod, nombre, v: [..] }], cinco como mucho. Cada serie se
       distingue por su trazo y por la etiqueta directa al final de la línea, no por color. Solo
       recibe números y códigos ya formados; aun así todo entra como atributo o como texto. */
    grafico(series, o) {
      const W = 960, H = 220, L = 30, R = 40, T = 12, B = 24, rej = 'rej' + (++serie);
      const max = Math.max(1, Math.max.apply(null, [].concat.apply([], series.map(s => s.v))));
      const n = Math.max(2, Math.max.apply(null, series.map(s => s.v.length)));
      const x = i => L + (W - L - R) * i / (n - 1), y = v => H - B - (H - T - B) * v / max;
      const svg = ui.svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'group', 'aria-label': o.titulo });
      svg.appendChild(ui.svg('defs', {}, ui.svg('pattern', { id: rej, width: 20, height: 20, patternUnits: 'userSpaceOnUse' }, ui.svg('rect', { class: 'g-punto', width: 1.5, height: 1.5 }))));
      svg.appendChild(ui.svg('rect', { x: L, y: T, width: W - L - R, height: H - T - B, fill: 'url(#' + rej + ')' }));
      [[L - 6, T + 4, 'end', ui.num(max)], [L - 6, H - B + 4, 'end', '0'], [L, H - 6, 'start', o.desde], [W - R, H - 6, 'end', o.hasta]]
        .forEach(t => svg.appendChild(ui.svg('text', { class: 'g-eje', x: t[0], y: t[1], 'text-anchor': t[2], 'aria-hidden': 'true', text: t[3] })));
      // Etiquetas directas: se separan para que no se pisen cuando dos series terminan a la misma altura.
      const fin = series.map((s, k) => ({ k: k, y: y(s.v[s.v.length - 1]) })).sort((a, b) => a.y - b.y);
      fin.forEach((f, i) => { if (i && f.y - fin[i - 1].y < 13) f.y = fin[i - 1].y + 13; });
      series.forEach((s, k) => {
        const ult = s.v.length - 1;
        const g = ui.svg('g', {
          class: 'g-serie', tabindex: 0, role: 'img',
          'aria-label': s.cod + ' ' + s.nombre + ': mínimo ' + Math.min.apply(null, s.v) + ', máximo ' + Math.max.apply(null, s.v) + ', último ' + s.v[ult] + ' ' + o.unidad
        });
        g.appendChild(ui.svg('polyline', { class: 'g-linea', 'stroke-dasharray': TRAZOS[k] || null, 'stroke-linecap': k === 2 ? 'round' : null, points: s.v.map((v, i) => x(i).toFixed(1) + ',' + y(v).toFixed(1)).join(' ') }));
        g.appendChild(ui.svg('circle', { class: k ? 'g-fin' : 'g-ultimo', cx: x(ult), cy: y(s.v[ult]), r: k ? 3 : 4 }));
        g.appendChild(ui.svg('text', { class: 'g-texto', x: W - R + 10, y: fin.filter(f => f.k === k)[0].y + 4, text: s.cod }));
        s.v.forEach((v, i) => g.appendChild(ui.svg('circle', { class: 'g-toque', cx: x(i), cy: y(v), r: 7 }, ui.svg('title', { text: s.cod + ' · ' + v + ' ' + o.unidad }))));
        svg.appendChild(g);
      });
      return ui.el('div', { class: 'grafico' }, svg);
    },

    // Tabla. cab: 'Texto' o ['Texto', 'num']. Cada fila es una lista de celdas (texto, número a la
    // derecha o nodo) o un <tr> ya hecho. Sin filas no hay tabla: solo una nota.
    tabla(cab, filas) {
      if (!filas.length) return ui.el('p', { class: 'note vacia' }, 'Todavía no hay datos: aparecerán cuando una sesión trabaje.');
      const cls = cab.map(h => Array.isArray(h) ? h[1] : '');
      const celda = (c, i) => {
        const td = ui.el('td', { class: typeof c === 'number' ? 'num' : cls[i] });
        if (c instanceof Node) td.appendChild(c); else td.textContent = typeof c === 'number' ? ui.num(c) : String(c);
        return td;
      };
      return ui.el('table', { class: 'table' }, [
        ui.el('thead', {}, ui.el('tr', {}, cab.map((h, i) => ui.el('th', { scope: 'col', class: cls[i] }, Array.isArray(h) ? h[0] : h)))),
        ui.el('tbody', {}, filas.map(r => r instanceof Node ? r : ui.el('tr', {}, r.map(celda))))
      ]);
    },

    // En la app el portapapeles y el guardado de archivos pasan por el proceso principal.
    // El botón que lo pidió (o el que tiene el foco) muestra "cargando" y "hecho".
    copiar(texto, que, boton) {
      const b = boton || ui.botonActivo();
      const no = () => { ui.decir('No se pudo copiar. Vuelve a intentarlo o selecciona el texto y usa Ctrl+C.', 'error'); return { error: 'copiar' }; };
      return ui.ocupado(b, () => {
        try { return (RA.datos.copiar ? RA.datos.copiar(texto) : navigator.clipboard.writeText(texto)).then(() => { ui.decir(que + ' copiado.', 'ok'); }, no); } catch (e) { return no(); }
      }, { cargando: 'Copiando…', hecho: 'Copiado' });
    },
    // Iconos de trazo para botones de icono (⋮, sacar, cerrar, asa): SVG sin texto, decorativos.
    icono(n) {
      const P = { mas: 'M8 3.2v.1M8 8v.1M8 12.8v.1', sacar: 'M6 3H3v10h10v-3M9 3h4v4M13 3 7.5 8.5', cerrar: 'M4 4l8 8M12 4l-8 8', asa: 'M6 4v.1M10 4v.1M6 8v.1M10 8v.1M6 12v.1M10 12v.1', atras: 'M10 3 5 8l5 5', 'mas-signo': 'M8 3.5v9M3.5 8h9', adelante: 'M6 3l5 5-5 5', recargar: 'M13 8a5 5 0 1 1-1.5-3.6M13 2.5v3h-3' };
      return ui.svg('svg', { viewBox: '0 0 16 16', width: '16', height: '16', 'aria-hidden': 'true', class: 'ico ico-' + n, fill: 'none', stroke: 'currentColor', 'stroke-width': n === 'mas' || n === 'asa' ? '2.4' : '1.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [ui.svg('path', { d: P[n] })]);
    },
    botonActivo() { const a = document.activeElement; return a && a.tagName === 'BUTTON' ? a : null; },

    /* Menú flotante (los ⋮ de la barra de la sesión y de los paneles). opciones: lista de
       { texto, fn, desactivado: 'motivo', marcado: bool (casilla), id }, { texto, titulo: true } para el
       encabezado de un grupo, o '-' para un separador.
       Flechas, Inicio y Fin para moverse; Esc o Tab lo cierran y devuelven el foco al botón. */
    menu(boton, opciones) {
      ui.cerrarMenu();
      const items = [];
      const m = ui.el('ul', { class: 'card barra-menu ui-menu', role: 'menu', 'aria-label': boton.getAttribute('aria-label') || '' }, opciones.filter(Boolean).map(o => {
        if (o === '-') return ui.el('li', { role: 'separator', class: 'ui-menu-sep' });
        // Encabezado de un grupo de opciones (Agrupar por, Ordenar por…): no es una opción.
        if (o.titulo) return ui.el('li', { role: 'presentation', class: 'ui-menu-tit label' }, o.texto);
        const caja = typeof o.marcado === 'boolean';
        const b = ui.el('button', { type: 'button', role: caja ? (o.radio ? 'menuitemradio' : 'menuitemcheckbox') : 'menuitem', tabindex: '-1', id: o.id || null, 'data-panel': o.panel || null,
          'aria-checked': caja ? String(o.marcado) : null, 'aria-disabled': o.desactivado ? 'true' : null, title: o.desactivado || o.ayuda || null,
          onclick: () => { if (o.desactivado) return ui.decir(o.desactivado, 'atencion'); ui.cerrarMenu(); o.fn(); } },
          [caja ? ui.el('span', { class: 'ui-menu-caja', 'aria-hidden': 'true' }, o.marcado ? '✓' : '') : null, ui.el('span', {}, o.texto),
            o.atajo ? ui.el('span', { class: 'ui-menu-atajo mono', 'aria-hidden': 'true' }, o.atajo) : null,
            o.desactivado ? ui.el('span', { class: 'sr' }, '. No disponible: ' + o.desactivado) : null]);
        items.push(b);
        return ui.el('li', { role: 'none' }, b);
      }));
      boton.setAttribute('aria-expanded', 'true');
      boton.after(m);
      m.addEventListener('keydown', e => {
        const i = items.indexOf(document.activeElement);
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus(); }
        else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); items[e.key === 'Home' ? 0 : items.length - 1].focus(); }
        else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); ui.cerrarMenu(); boton.focus(); }
      });
      if (items[0]) items[0].focus();
      ui.menu.abierto = { m: m, boton: boton };
      return m;
    },
    cerrarMenu() { const a = ui.menu.abierto; if (a) { a.m.remove(); a.boton.setAttribute('aria-expanded', 'false'); ui.menu.abierto = null; } },
    // Descarga un texto como archivo, sin servidor.
    descargar(nombre, contenido, tipo, boton) {
      const b = boton || ui.botonActivo();
      if (RA.datos.guardarArchivo) { ui.ocupado(b, () => RA.datos.guardarArchivo(nombre, contenido).then(ok => { if (ok) ui.decir('Archivo guardado.', 'ok'); else return { error: 'cancelado' }; }, () => { ui.decir('No se pudo guardar el archivo. Elige otra carpeta o vuelve a intentarlo.', 'error'); return { error: 'guardar' }; }), { cargando: 'Guardando…', hecho: 'Guardado' }); return; }
      const url = URL.createObjectURL(new Blob([contenido], { type: tipo || 'application/json' }));
      const a = ui.el('a', { href: url, download: nombre });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    aplicarTema(t) {
      const root = document.documentElement;
      if (t === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', t);
    }
  };

  // Pulso: un clic con ratón deja un anillo breve en el botón (el teclado ya tiene :focus-visible).
  document.addEventListener('pointerdown', e => {
    const b = e.pointerType === 'mouse' && e.target.closest && e.target.closest('button, .btn, [role="treeitem"]');
    if (!b) return;
    b.classList.remove('pulso'); void b.offsetWidth; b.classList.add('pulso');
    setTimeout(() => b.classList.remove('pulso'), 340);
  });

  // Un clic fuera del menú flotante lo cierra.
  document.addEventListener('pointerdown', e => { const a = ui.menu.abierto; if (a && !a.m.contains(e.target) && !a.boton.contains(e.target)) ui.cerrarMenu(); });

  RA.ui = ui;
})(window.RA = window.RA || {});
