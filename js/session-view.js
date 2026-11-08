/* Detalles de la sesión (2026-11-07): sustituye al desplegable "Más detalles" de Chat. Se abre con el enlace del pie
   del panel Contexto y ocupa el sitio de la conversación; "Volver a la conversación" o Escape la cierran y el foco
   vuelve al enlace. Dentro: GitHub, Conectores, Modelos en uso, Últimas acciones, Línea de tiempo con su árbol de
   agentes y Herramientas de la sesión. Lo que ya tiene pestaña propia solo se enlaza (botones [data-ir]). */
(function (RA) {
  'use strict';

  const ui = RA.ui, $ = ui.$;
  const SUB_USO = ['consumo', 'estadisticas', 'orquestacion'];
  let abierta = false;

  function nombre() {
    const s = RA.vistas && RA.vistas.actual();
    const n = $('#det-sesion');
    if (n) n.textContent = s ? '· ' + s.nombre : '';
  }
  function abrir() {
    if (abierta) return;
    abierta = true;
    // En ancho estrecho el panel Contexto es superpuesto: se cierra para ver los detalles.
    if (RA.chat3 && RA.chat3.abierto()) RA.chat3.cerrarLado();
    $('#chat-cuerpo').classList.add('ver-detalles');
    $('#chat-detalles').hidden = false;
    $('#lado-ver-detalles').setAttribute('aria-expanded', 'true');
    nombre();
    // La línea de tiempo se pintó oculta: al verse, empieza en el borde vivo (lo más reciente).
    const tl = $('#tiempo');
    if (tl) tl.scrollTop = tl.scrollHeight;
    if (RA.app) RA.app.pintar();
    if (RA.modelosUso) RA.modelosUso.pintar();
    $('#h-detalles').focus();
  }
  function cerrar(sinFoco) {
    if (!abierta) return;
    abierta = false;
    $('#chat-cuerpo').classList.remove('ver-detalles');
    $('#chat-detalles').hidden = true;
    const b = $('#lado-ver-detalles');
    b.setAttribute('aria-expanded', 'false');
    if (!sinFoco && b.offsetParent !== null) b.focus();
  }

  function montar() {
    const b = $('#lado-ver-detalles');
    if (!b) return;
    b.setAttribute('aria-expanded', 'false');
    b.addEventListener('click', () => (abierta ? cerrar() : abrir()));
    $('#det-volver').addEventListener('click', () => cerrar());
    $('#chat-detalles').addEventListener('keydown', e => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); cerrar(); } });
    // Enlaces a otras pestañas: Estadísticas, Cambios, Agentes (mapa), Consumo y Reparto automático.
    ui.$$('#chat-detalles .det-otras [data-ir]').forEach(x => x.addEventListener('click', () => {
      if (x.dataset.mapa) RA.app.sel.sesVista = 'mapa';
      cerrar(true);
      RA.app.ir(x.dataset.ir);
    }));
    // Como el desplegable de antes, los detalles siguen abiertos al ir a otra vista y volver (con la sesión elegida).
    document.addEventListener('rastro:vista', e => { if (e.detail === 'chat') nombre(); });
    if (RA.datos && RA.datos.alCambiar) RA.datos.alCambiar(nombre);
  }

  RA.detallesVista = { abrir: abrir, cerrar: cerrar, abierta: () => abierta, SUB_USO: SUB_USO };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar); else montar();
})(window.RA = window.RA || {});
