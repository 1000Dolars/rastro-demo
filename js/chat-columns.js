/* Chat en tres columnas (Fase 2): a la izquierda, la lista "Sesiones" en la barra lateral; en el centro, la
   conversación; a la derecha, el panel "Contexto" con Tareas (Plan y agentes en curso) y Cambios.
   - Desde 1280 px el panel derecho es una columna que se puede ocultar con el botón "Contexto".
   - Por debajo de 1280 px, "Contexto" lo abre como panel superpuesto; por debajo de 1024 px la barra lateral
     también es un panel superpuesto, que abre el botón "Sesiones" (js/sidebar.js).
   - Se guardan en ajustes.json (proceso principal) si el panel derecho está abierto y el filtro de la lista.
   La sesión elegida es una sola (RA.app.sel.sesion): la lista, la cabecera y Chat la comparten. Ningún cambio
   de estado se anuncia: la lista se repinta sin región viva. */
(function (RA) {
  'use strict';

  const ui = RA.ui, el = ui.el, $ = ui.$, D = RA.datos, L = RA.logica, G = RA.glifos, C = RA.calc;
  const ANCHO = matchMedia('(min-width: 1280px)');
  const TOPE = 50;                         // filas de "Todas"; el resto sigue en las carpetas de la barra
  const est = () => L.estadoChat3(D.ajustes.chat3);
  const guardar = parcial => D.guardar({ chat3: Object.assign(est(), parcial) });
  const actual = () => RA.vistas && RA.vistas.actual();
  const claseEst = f => ({ deteniendo: 'detenido', espera: 'cola' }[f] || f);
  const diaCorto = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
  const horaMin = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  function horaDe(t) {
    if (!t) return '';
    const d = new Date(t), hoy = new Date();
    return d.toDateString() === hoy.toDateString() ? horaMin.format(d) : diaCorto.format(d).replace('.', '');
  }

  // ---------- Lista "Sesiones" (barra lateral) ----------
  const nodos = new Map();
  function montarLista() {
    const caja = $('#barra-desliza');
    if (!caja || $('#sb-sesiones')) return !!caja;
    caja.insertBefore(el('section', { id: 'sb-sesiones', class: 'sb-sesiones', 'aria-labelledby': 'sb-ses-t' }, [
      el('div', { class: 'sb-ses-cab' }, [
        el('h2', { id: 'sb-ses-t', class: 'label sb-sub' }, 'Sesiones'),
        el('div', { class: 'sb-ses-filtro', role: 'group', 'aria-label': 'Qué sesiones ver' }, [['activas', 'Activas'], ['todas', 'Todas']].map(([v, t]) =>
          el('button', { type: 'button', 'data-f': v, 'aria-pressed': 'false', title: v === 'activas' ? 'Las que trabajan o esperan tu respuesta' : 'Todas, de la más reciente a la más antigua', onclick: () => filtrar(v) }, t)))
      ]),
      el('ol', { id: 'sb-ses-lista', class: 'sb-ses-lista', 'aria-labelledby': 'sb-ses-t' }),
      el('p', { id: 'sb-ses-vacio', class: 'note sb-ses-vacio', hidden: '' })
    ]), caja.firstChild);
    return true;
  }
  // Sesiones que enseña la lista, con su filtro (todas las que pasan; se pintan las TOPE primeras).
  function enLista() {
    if (!RA.vistas) return [];
    return L.filtrarSesiones(D.estado.sesiones || [], est().filtro, s => RA.vistas.tarjeta(s).clave);
  }
  // D7: ids que la lista tiene a la vista. La barra (js/sidebar.js) no las repite en sus carpetas.
  function idsLista() { return new Set(enLista().slice(0, TOPE).map(s => s.id)); }
  function fila(s, elegida) {
    const t = RA.vistas.tarjeta(s), p = L.ultimoPrompt(s), tu = L.ultimaActividad(s), hora = horaDe(tu);
    const firma = [s.nombre, t.clave, hora, p, elegida].join('|');
    let n = nodos.get(s.id);
    if (!n) {
      // Elegir una sesión es navegar: un enlace, como las filas de las carpetas de la barra.
      const b = el('a', { href: '#', class: 'sb-ses-b', onclick: e => { e.preventDefault(); elegir(s.id); } });
      n = { li: el('li', { class: 'sb-ses', 'data-id': s.id }, b), b: b, firma: '' };
      nodos.set(s.id, n);
    }
    if (n.firma !== firma) {
      n.firma = firma;
      ui.pintar(n.b, [
        el('span', { class: 'sb-ses-l1' }, [el('span', { class: 'sb-ses-n' }, s.nombre), hora ? el('time', { class: 'sb-ses-h mono', datetime: new Date(tu).toISOString() }, hora) : null]),
        el('span', { class: 'sb-ses-l2' }, [el('span', { class: 'est ' + claseEst(t.forma), 'aria-hidden': 'true' }), el('span', { class: 'sb-ses-e' + (t.clave === 'esperando' || t.clave === 'error' ? ' alerta' : '') }, t.nombre)]),
        p ? el('span', { class: 'sb-ses-p' }, [el('span', { class: 'sr' }, 'Último prompt: '), p]) : null
      ]);
      n.b.title = s.nombre + ' · ' + t.nombre + (p ? '\n' + p.slice(0, 200) : '');
      if (elegida) n.b.setAttribute('aria-current', 'true'); else n.b.removeAttribute('aria-current');
      n.li.classList.toggle('sel', elegida);
    }
    return n.li;
  }
  function pintarLista() {
    if (!RA.app || !RA.vistas || !montarLista()) return;
    const f = est().filtro, todas = (D.estado.sesiones || []);
    ui.$$('#sb-sesiones .sb-ses-filtro button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.f === f)));
    const lista = enLista(), vista = lista.slice(0, TOPE), sel = RA.app.sel.sesion;
    const ol = $('#sb-ses-lista');
    const lis = vista.map(s => fila(s, s.id === sel));
    lis.forEach((li, i) => { if (ol.children[i] !== li) ol.insertBefore(li, ol.children[i] || null); });
    while (ol.children.length > lis.length) ol.lastChild.remove();
    const vacio = $('#sb-ses-vacio');
    vacio.hidden = lista.length > 0 && lista.length <= TOPE;
    vacio.textContent = !lista.length ? (f === 'activas' ? (todas.length ? 'Ninguna sesión trabaja ni espera tu respuesta. Pulsa «Todas» para ver el resto.' : 'Todavía no hay sesiones.') : 'Todavía no hay sesiones.')
      : 'Se ven las ' + TOPE + ' más recientes; las demás están en sus carpetas, más abajo.';
  }
  function filtrar(v) {
    if (est().filtro === v) return;
    guardar({ filtro: v });
    pintarLista();
    if (RA.barra) RA.barra.pintar();   // D7: lo que sale de la lista vuelve a su carpeta, y al revés
  }
  // Elegir una sesión: la misma que usan la cabecera y Chat (RA.barra.abrir cambia RA.app.sel.sesion y va a Chat).
  function elegir(id) {
    if (RA.barra && RA.barra.abrir) RA.barra.abrir(id);
    else { RA.app.sel.sesion = id; RA.app.ir('chat'); }
    pintarLista();
  }

  // ---------- Panel derecho: Tareas y Cambios ----------
  function pintarPanel() {
    const s = actual(), tar = $('#lado-tareas'), cam = $('#lado-cambios');
    if (!tar || !cam) return;
    tar.hidden = cam.hidden = !s;
    if (!s) return;
    // Tareas: el Plan (la lista de js/tasks-pane.js) y los agentes que trabajan ahora (con sus subagentes).
    const plan = RA.tareasPanel && RA.tareasPanel.planLista ? RA.tareasPanel.planLista(s) : null, p = s.plan;
    const vivos = (s.agentes || []).filter(a => a.est === 'curso');
    ui.pintar(tar, [
      el('div', { class: 'esc det-esc' }, [
        el('div', { class: 'row between lado-sub' }, [el('h3', { class: 'label' }, 'Tareas'), plan ? el('span', {}, [el('span', { class: 'plan-cuenta', 'aria-hidden': 'true' }, p.hechas + ' de ' + p.total), el('span', { class: 'sr' }, p.hechas + ' de ' + p.total + ' tareas hechas')]) : null]),
        plan || el('p', { class: 'note det-vacio' }, 'Esta sesión no tiene lista de tareas ahora mismo.'),
        el('div', { class: 'det-sep' }),
        el('div', { class: 'row between lado-sub' }, [el('h3', { class: 'label', id: 't-lado-ag', title: 'P: agente principal de la sesión · A1, A2…: subagentes, en el orden en que empezaron' }, 'Agentes trabajando'), el('span', {}, [el('span', { class: 'plan-cuenta', 'aria-hidden': 'true' }, String(vivos.length)), el('span', { class: 'sr' }, vivos.length + (vivos.length === 1 ? ' agente trabajando' : ' agentes trabajando'))])]),
        vivos.length ? el('ul', { class: 'lado-agentes', 'aria-labelledby': 't-lado-ag' }, vivos.slice(0, 12).map(a => el('li', {}, [
          G.deAgente(a, null, 4), ui.insignia(a.cod), el('span', { class: 'lado-ag-tipo' }, (a.padre ? 'Subagente · ' : '') + (a.tipo || 'agente'))
        ])).concat(vivos.length > 12 ? [el('li', { class: 'note' }, '+' + (vivos.length - 12) + ' más')] : [])) : el('p', { class: 'note det-vacio' }, 'Ningún agente trabaja ahora.'),
        (s.agentes || []).length ? el('button', { type: 'button', class: 'btn btn-small', id: 'lado-mapa', onclick: () => { RA.app.sel.sesVista = 'mapa'; cerrarLado(); RA.app.ir('sesiones'); } }, 'Ver el mapa de agentes') : null
      ]),
      el('div', { class: 'card-pie' }, el('h2', { class: 'label', id: 't-lado-tareas' }, 'Tareas'))
    ]);
    // Cambios: cuántos archivos tocó la sesión y "Ver diff", que lleva a Cambios con esa sesión.
    const suyos = C.cambios().filter(c => c.s === s), archivos = Array.from(new Set(suyos.map(c => c.archivo)));
    ui.pintar(cam, [
      el('div', { class: 'esc det-esc' }, [
        el('p', { class: 'lado-cifra' }, [el('span', { class: 'plan-cuenta' }, String(archivos.length)), ' ', archivos.length === 1 ? 'archivo tocado' : 'archivos tocados']),
        archivos.length ? el('button', { type: 'button', class: 'btn btn-small', id: 'lado-diff', onclick: () => verDiff(s, suyos[0]) }, 'Ver diff') : el('p', { class: 'note det-vacio' }, 'Esta sesión todavía no ha cambiado ningún archivo.')
      ]),
      el('div', { class: 'card-pie' }, el('h2', { class: 'label', id: 't-lado-cambios' }, 'Cambios'))
    ]);
  }
  function verDiff(s, ultimo) {
    const S = RA.app.sel;
    S.grupo = 'sesion';
    S.archivo = s.id + '|' + ultimo.archivo;
    cerrarLado();
    RA.app.ir('cambios');
  }

  // ---------- Paneles: columna (≥ 1280 px) o superpuesto ----------
  let flot = null;
  const boton = () => $('#panel-btn');
  function aplicar() {
    const e = est(), ancho = ANCHO.matches, b = boton();
    if (ancho && flot) cerrarLado();
    document.body.classList.toggle('panel-plegado', ancho && !e.lado);
    if (b) {
      b.setAttribute('aria-expanded', String(ancho ? e.lado : !!flot));
      b.title = (ancho ? (e.lado ? 'Ocultar' : 'Mostrar') : 'Abrir') + ' el panel Contexto: tareas, contexto, entorno, cambios y segundo plano de la sesión';
    }
    pintarLista();
  }
  function abrirLado() {
    const lado = $('#chat-lado'), b = boton();
    if (!lado || flot) return;
    lado.classList.add('abierto');
    $('#lado-fondo').hidden = false;
    flot = { soltar: ui.atrapar(lado, cerrarLado) };
    b.setAttribute('aria-expanded', 'true');
    $('#chat-lado-t').focus();
  }
  // Al cerrar, el foco vuelve al botón "Contexto".
  function cerrarLado() {
    if (!flot) return;
    const f = flot; flot = null;
    f.soltar();
    $('#chat-lado').classList.remove('abierto');
    $('#lado-fondo').hidden = true;
    const b = boton(), mas = $('#pan-mas');
    b.setAttribute('aria-expanded', 'false');
    if (b.offsetParent !== null) b.focus(); else if (mas && mas.offsetParent !== null) mas.focus();
  }
  function alternar() {
    if (!ANCHO.matches) return flot ? cerrarLado() : abrirLado();
    guardar({ lado: !est().lado });
    aplicar();
    if (RA.app) RA.app.pintar();
  }

  function montar() {
    const b = boton();
    if (!b) return;
    // En columna, pulsar "Contexto" con el ratón no le quita el foco al campo de prompts.
    b.addEventListener('mousedown', e => { if (ANCHO.matches && document.activeElement && document.activeElement.id === 'masc-prompt') e.preventDefault(); });
    b.addEventListener('click', alternar);
    $('#lado-cerrar').addEventListener('click', cerrarLado);
    $('#lado-fondo').addEventListener('click', cerrarLado);
    ANCHO.addEventListener('change', aplicar);
    // Fuera de Chat el panel no existe: un panel superpuesto abierto se cierra al cambiar de vista.
    document.addEventListener('rastro:vista', () => { if (RA.app && RA.app.sel.vista !== 'chat') cerrarLado(); });
    if (D.alCambiar) D.alCambiar(() => { pintarLista(); pintarPanel(); });
    aplicar();
    pintarPanel();
    // Las horas de la lista y los estados que dependen del reloj.
    setInterval(pintarLista, 30000);
  }

  RA.chat3 = { idsLista: idsLista, aplicar: aplicar, pintarLista: pintarLista, pintarPanel: pintarPanel, abrirLado: abrirLado, cerrarLado: cerrarLado, filtrar: filtrar, elegir: elegir, abierto: () => !!flot };
  if (document.readyState === 'complete') montar(); else addEventListener('DOMContentLoaded', montar);
})(window.RA = window.RA || {});
