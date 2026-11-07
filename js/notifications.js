/* Centro de avisos (Fase B3). Historial de los toasts y de los eventos de las sesiones (terminó, falló,
   necesita atención), con un contador en la barra superior, "Marcar todo como leído" y filtro por tipo
   y por sesión. En la app se guarda en el proceso principal (avisos.json, con tope); en el navegador, en
   localStorage. Nunca se guarda el contenido de un prompt: solo el texto del aviso. */
(function (RA) {
  'use strict';

  const ui = RA.ui, el = ui.el, $ = ui.$, D = RA.datos;
  const CLAVE = 'rastro:avisos', TOPE = 200;
  const TIPO = { fin: 'Terminó', error: 'Falló', atencion: 'Necesita atención', ok: 'Hecho', neutro: 'Aviso' };
  const ICONO = { fin: '✓', error: '✕', atencion: '!', ok: '✓', neutro: 'i' };
  let lista = [], filtroTipo = '', filtroSes = '', tGuardar = null, serie = 0;

  const nombreDe = id => { const s = id && D.estado.sesiones.filter(x => x.id === id)[0]; return s ? s.nombre : ''; };
  function guardar() {
    clearTimeout(tGuardar);
    tGuardar = setTimeout(() => {
      const l = lista.slice(-TOPE);
      if (D.avisosGuardar) D.avisosGuardar(l);
      else try { localStorage.setItem(CLAVE, JSON.stringify(l)); } catch (e) { /* sin almacenamiento: dura lo que la ventana */ }
    }, 400);
  }
  function anotar(a) {
    if (!a || !a.texto) return;
    lista.push({ id: Date.now().toString(36) + (++serie), t: Date.now(), tipo: TIPO[a.tipo] ? a.tipo : 'neutro', texto: String(a.texto).slice(0, 240), sesion: a.sesion || null, nombre: a.nombre || nombreDe(a.sesion), leido: false });
    if (lista.length > TOPE) lista = lista.slice(-TOPE);
    guardar(); contador();
    if (!$('#avisos-panel').hidden) pintar();
  }

  // Los toasts (salvo los que ya resumen eventos) y cada evento de una sesión, con su sesión.
  ui.alAviso = anotar;
  D.alAvisar(a => {
    if (a.tipo === 'fin' || a.tipo === 'error' || a.tipo === 'atencion') anotar({ tipo: a.tipo, texto: a.texto || TIPO[a.tipo], sesion: a.sesion });
    else if (a.tipo === 'conexion' && a.texto) anotar({ tipo: 'neutro', texto: a.texto });
  });

  function contador() {
    const n = lista.filter(a => !a.leido).length, b = $('#avisos-btn');
    ui.pintar($('#avisos-cuenta'), n ? String(n > 99 ? '99+' : n) : null);
    $('#avisos-cuenta').hidden = !n;
    b.setAttribute('aria-label', 'Abrir avisos' + (n ? ': ' + n + (n === 1 ? ' sin leer' : ' sin leer') : ''));
    b.title = n ? n + ' avisos sin leer' : 'Avisos';
  }

  function pintar() {
    const caja = $('#avisos-panel');
    const sesiones = Array.from(new Set(lista.filter(a => a.sesion).map(a => a.sesion)));
    const vistos = lista.filter(a => (!filtroTipo || a.tipo === filtroTipo) && (!filtroSes || a.sesion === filtroSes)).slice().reverse();
    const sel = (id, etiqueta, ops, v, cambio) => el('div', { class: 'campo' }, [
      el('label', { class: 'label', for: id }, etiqueta),
      el('select', { id: id, class: 'select', onchange: e => { cambio(e.target.value); pintar(); $('#' + id).focus(); } }, ops.map(o => el('option', { value: o[0], selected: o[0] === v }, o[1])))
    ]);
    ui.pintar(caja, [
      el('div', { class: 'row between' }, [
        el('h2', { id: 'avisos-t', class: 'avisos-t' }, 'Avisos'),
        el('button', { type: 'button', class: 'btn btn-small', id: 'avisos-leidos', disabled: !lista.some(a => !a.leido), onclick: () => { lista.forEach(a => { a.leido = true; }); guardar(); contador(); pintar(); $('#avisos-t').focus(); ui.decir('Todos los avisos marcados como leídos.', { tipo: 'ok', registrar: false }); } }, 'Marcar todo como leído')
      ]),
      el('div', { class: 'row avisos-filtros' }, [
        sel('avisos-tipo', 'Tipo', [['', 'Todos los tipos']].concat(Object.keys(TIPO).map(k => [k, TIPO[k]])), filtroTipo, v => { filtroTipo = v; }),
        sel('avisos-ses', 'Sesión', [['', 'Todas las sesiones']].concat(sesiones.map(id => [id, nombreDe(id) || (lista.filter(a => a.sesion === id)[0] || {}).nombre || 'Sesión'])), filtroSes, v => { filtroSes = v; })
      ]),
      vistos.length ? el('ul', { class: 'avisos-lista', 'aria-label': 'Historial de avisos' }, vistos.map(a => el('li', { class: 'aviso ' + a.tipo + (a.leido ? '' : ' nuevo') }, [
        el('span', { class: 't-ico', 'aria-hidden': 'true' }, ICONO[a.tipo]),
        el('div', { class: 'crece' }, [
          el('div', {}, [el('span', { class: 'sr' }, TIPO[a.tipo] + (a.leido ? ': ' : ', sin leer: ')), a.texto]),
          el('div', { class: 'note' }, [ui.hora(a.t), a.nombre ? ' · ' + a.nombre : '', a.leido ? '' : ' · sin leer'])
        ])
      ]))) : el('p', { class: 'note' }, lista.length ? 'Ningún aviso con estos filtros. Elige «Todos los tipos» y «Todas las sesiones» para verlos todos.' : 'Todavía no hay avisos. Aquí quedan los que salen abajo a la derecha y los de tus sesiones (terminó, falló, necesita atención).')
    ]);
  }

  function abrir(v) {
    const caja = $('#avisos-panel'), b = $('#avisos-btn');
    caja.hidden = !v; b.setAttribute('aria-expanded', String(v));
    if (v) { pintar(); $('#avisos-t').setAttribute('tabindex', '-1'); $('#avisos-t').focus(); }
  }
  $('#avisos-btn').addEventListener('click', e => { e.stopPropagation(); abrir($('#avisos-panel').hidden); });
  // Esc cierra el panel aunque el foco se haya quedado fuera (un botón que se repintó).
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#avisos-panel').hidden) { e.stopPropagation(); abrir(false); $('#avisos-btn').focus(); } }, true);
  document.addEventListener('click', e => { const c = $('#avisos-panel'); if (!c.hidden && !c.contains(e.target) && e.target.isConnected) abrir(false); });

  // Carga el historial guardado.
  Promise.resolve(D.avisosLeer ? D.avisosLeer() : (() => { try { return JSON.parse(localStorage.getItem(CLAVE)) || []; } catch (e) { return []; } })()).then(l => {
    if (Array.isArray(l)) lista = l.filter(a => a && typeof a.texto === 'string').concat(lista).slice(-TOPE);
    contador();
  });
  contador();

  RA.avisos = { abrir: abrir, lista: () => lista.slice(), anotar: anotar };
})(window.RA = window.RA || {});
