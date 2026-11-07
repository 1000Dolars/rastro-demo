/* Atajos de teclado (Ctrl+/) y menú de la cuenta del pie de la barra lateral.
   La lista sigue a la de Claude Code Desktop (code.claude.com/docs/en/desktop, 2026-11-04). En macOS se
   enseña ⌘ y en Windows y Linux, Ctrl. Buscar con Ctrl+K es propio de Rastro: Claude no lo documenta. */
(function (RA) {
  'use strict';

  const ui = RA.ui, el = ui.el, $ = ui.$, D = RA.datos;
  const MAC = /Mac/i.test(navigator.platform || '');
  const MOD = MAC ? '⌘' : 'Ctrl';
  const MAYUS = MAC ? '⇧' : 'Mayús';

  // [grupo, qué hace, teclas]. 'Mod' se cambia por ⌘ o Ctrl; 'Ctrl' se queda (Claude lo usa también en macOS).
  const ATAJOS = [
    ['General', 'Nueva sesión', ['Mod', 'N']],
    ['General', 'Buscar', ['Mod', 'K']],
    ['General', 'Ver los atajos de teclado', ['Mod', '/']],
    ['Paneles', 'Abrir o cerrar la terminal', ['Ctrl', '`']],
    ['Paneles', 'Abrir o cerrar el navegador', ['Mod', 'Mayús', 'B']],
    ['Paneles', 'Abrir el chat lateral', ['Mod', ';']],
    ['Paneles', 'Cerrar el panel enfocado', ['Mod', '\\']],
    ['Sesión', 'Cambiar la vista de la transcripción (Normal, Pensamiento, Detallado)', ['Ctrl', 'O']],
    ['Sesión', 'Enviar el mensaje', ['Enter']],
    ['Sesión', 'Salto de línea en el mensaje', ['Mayús', 'Enter']],
    ['Sesión', 'Cerrar un menú o una capa', ['Esc']]
  ];
  const tecla = k => k === 'Mod' ? MOD : k === 'Mayús' ? MAYUS : k;
  // Texto legible para el lector de pantalla y los títulos: "Ctrl+Mayús+B".
  const texto = ks => ks.map(tecla).join('+');

  function atajos() {
    if (RA.capas.abierta()) return;
    const volver = document.activeElement;
    const c = RA.capas.capa('Atajos de teclado', () => cerrar());
    const cerrar = () => { c.cerrar(); if (volver && volver.focus) volver.focus(); };
    const grupos = [...new Set(ATAJOS.map(a => a[0]))];
    c.caja.classList.add('atajos');
    ui.pintar(c.caja, [
      el('div', { class: 'row between' }, [el('h2', { class: 'chica', id: 'atajos-t' }, 'Atajos de teclado'), el('button', { type: 'button', class: 'btn btn-small', id: 'atajos-cerrar', onclick: cerrar }, 'Cerrar')]),
      MAC ? null : el('p', { class: 'note' }, 'En macOS, Ctrl se lee ⌘.'),
      el('div', { class: 'atajos-cuerpo' }, grupos.map(g => el('section', { 'aria-labelledby': 'atajos-' + g }, [
        el('h3', { class: 'label', id: 'atajos-' + g }, g),
        el('dl', { class: 'atajos-lista' }, [].concat.apply([], ATAJOS.filter(a => a[0] === g).map(a => [
          el('dt', {}, a[1]),
          el('dd', { 'aria-label': texto(a[2]) }, a[2].map(k => el('kbd', { 'aria-hidden': 'true' }, tecla(k))))
        ])))
      ])))
    ]);
    c.caja.setAttribute('aria-labelledby', 'atajos-t');
    c.caja.removeAttribute('aria-label');
    $('#atajos-cerrar').focus();
  }

  // ---- Menú de la cuenta (pie de la barra lateral) ----
  function menuCuenta(boton) {
    if (ui.menu.abierto && ui.menu.abierto.boton === boton) return ui.cerrarMenu();
    const a = D.auth;
    ui.menu(boton, [
      { texto: a ? (a.ok ? 'Cuenta: suscripción de Claude' : 'Cuenta bloqueada: ' + (a.motivo || 'revísala')) : 'Cuenta: sin comprobar', titulo: true },
      { texto: 'Ajustes', id: 'cuenta-ajustes', fn: () => RA.app.ir('ajustes') },
      { texto: 'Atajos de teclado', id: 'cuenta-atajos', atajo: MOD + '+/', fn: atajos },
      { texto: 'Comprobar el estado del equipo', id: 'cuenta-diag', fn: () => RA.vistas.diagnostico && RA.vistas.diagnostico() },
      { texto: 'Ver la guía rápida', id: 'cuenta-guia', fn: () => RA.app.guia() }
    ]);
  }

  // En macOS los atajos con Ctrl de la interfaz se leen ⌘.
  if (MAC) ui.$$('.t-mod').forEach(k => { if (k.dataset.k) k.dataset.k = '⌘'; else k.textContent = '⌘'; });
  const avatar = $('.sb-avatar');
  if (avatar && RA.glifos) ui.pintar(avatar, RA.glifos.svg(RA.glifos.P.Principal, null, 3));
  const cuenta = $('#cuenta-btn');
  if (cuenta) cuenta.addEventListener('click', e => menuCuenta(e.currentTarget));
  // Ctrl+/ (⌘/ en macOS) abre la lista. Con un campo de texto enfocado también: "/" con Ctrl no escribe nada.
  document.addEventListener('keydown', e => {
    const mod = MAC ? e.metaKey : e.ctrlKey;
    if (!mod || e.altKey || e.shiftKey || !(e.key === '/' || e.code === 'Slash')) return;
    e.preventDefault();
    atajos();
  });

  RA.atajos = { abrir: atajos, lista: () => ATAJOS.map(a => ({ grupo: a[0], que: a[1], teclas: texto(a[2]) })), mac: MAC };
})(window.RA = window.RA || {});
