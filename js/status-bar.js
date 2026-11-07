/* Barra de estado inferior fija (Fase B4): sesión elegida, modelo en uso, memoria de la GPU de la IA
   local frente a su tope, uso del plan, conexión y modo juego. Cada dato es un botón que lleva a su
   pestaña. Lo que no se sabe dice "sin dato", nunca 0. El estado va en color y también en texto. */
(function (RA) {
  'use strict';

  const ui = RA.ui, el = ui.el, $ = ui.$, D = RA.datos;
  const GB = mb => (mb / 1024).toFixed(1).replace('.', ',') + ' GB';
  let firma = '';

  function datos() {
    const s = RA.vistas && RA.vistas.actual(), R = RA.fase4 && RA.fase4.estado ? RA.fase4.estado().recursos : null;
    const out = [];
    // Sesión y modelo
    const est = s ? { curso: ['curso', 'trabajando'], deteniendo: ['curso', 'deteniéndose'], listo: ['ok', 'lista'], error: ['error', 'con error'], detenido: ['neutro', 'detenida'] }[s.est] || ['neutro', ''] : null;
    // Sesión: identificador corto y estado ("4f2a91c0 · trabajando"); el nombre va en el título.
    out.push({ id: 'be-sesion', nombre: 'Sesión', valor: s ? String(s.id).slice(0, 8) + (est[1] ? ' · ' + est[1] : '') : 'sin dato', estado: s ? est[0] : 'neutro', ir: 'sesiones', titulo: s ? s.nombre : '' });
    // Modelo y modo de uso (Añadido 3): "Opus 5.5 · Modo Plan". Sin permisos, además, su insignia propia.
    const m = D.modoDe(s), mod = s && s.modelo ? ui.modelo(s.modelo).replace(/^\w/, c => c.toUpperCase()) : 'sin dato';
    out.push({ id: 'be-modelo', nombre: 'Modelo', valor: mod + (m ? ' · Modo ' + m.nombre : ''), estado: 'neutro', ir: 'chat' });
    if (m && m.id === 'bypassPermissions') out.push({ id: 'be-sinperm', nombre: '', valor: '[ SIN PERMISOS ]', estado: 'error', ir: 'chat', clase: 'sinperm' });
    // IA local: sin cargar, cargada (con la memoria de la GPU que ocupa) o no responde, frente a su tope
    // (80 % de la VRAM por defecto: 6,4 GB en una GPU de 8 GB).
    let ia = { valor: 'sin dato', estado: 'neutro' };
    if (R && R.juego && R.juego.activo) ia = { valor: 'descargada (modo juego)', estado: 'neutro' };
    else if (R && R.ollama === false) ia = { valor: 'no responde' + (R.topeVramMB ? ' · tope ' + GB(R.topeVramMB) : ''), estado: 'error' };
    else if (R && !R.sinGpu && R.topeVramMB) {
      const usa = R.vramOllamaMB || 0, pct = usa / R.topeVramMB;
      ia = { valor: usa ? 'cargada · ' + GB(usa) + ' de ' + GB(R.topeVramMB) : 'sin cargar · tope ' + GB(R.topeVramMB), estado: !usa ? 'neutro' : pct > 1 ? 'error' : pct >= 0.9 ? 'atencion' : 'ok' };
    }
    out.push({ id: 'be-ia', nombre: 'IA local', valor: ia.valor, estado: ia.estado, ir: 'recursos' });
    // Uso del plan
    const b = D.estado.uso.bloques[0];
    out.push({ id: 'be-plan', nombre: 'Uso del plan', valor: !b ? 'sin dato' : b.pct != null ? Math.round(b.pct) + ' % usado' : b.tokens ? '≈' + ui.tokens(b.tokens) + ' tokens (estimado)' : 'sin dato (estimado)', estado: b && b.pct != null ? (b.pct >= 90 ? 'error' : b.pct >= 75 ? 'atencion' : 'ok') : 'neutro', ir: 'consumo' });
    // Conexión
    const viva = D.estado.conexion === 'viva', activa = D.estado.sesiones.some(x => x.est === 'curso' || x.est === 'deteniendo');
    out.push({ id: 'be-conexion', nombre: 'Conexión', valor: !viva ? 'sin conexión' : activa ? 'trabajando' : 'en reposo', estado: !viva ? 'error' : 'ok', ir: 'sesiones' });
    // Modo juego
    out.push({ id: 'be-juego', nombre: 'Modo juego', valor: R && R.juego ? (R.juego.activo ? 'activo' : 'apagado') : 'sin dato', estado: R && R.juego && R.juego.activo ? 'atencion' : 'neutro', ir: 'recursos' });
    return out;
  }

  const NOMBRE = { ok: 'bien', atencion: 'atención', error: 'problema', curso: 'en curso', neutro: '' };
  function pintar() {
    const caja = $('#barra-estado');
    if (!caja) return;
    const d = datos(), f = JSON.stringify(d);
    if (f === firma) return;            // nada cambió: no se repinta (no se pierde el foco)
    firma = f;
    const foco = document.activeElement && caja.contains(document.activeElement) ? document.activeElement.id : null;
    ui.pintar(caja, d.map(x => el('button', { type: 'button', id: x.id, class: 'be ' + x.estado + (x.clase ? ' ' + x.clase : ''), 'data-estado': x.estado, title: (x.titulo ? x.titulo + ' · ' : '') + 'Ir a ' + ({ sesiones: 'Sesiones', recursos: 'GPU y memoria', consumo: 'Consumo', chat: 'Chat' })[x.ir],
      onclick: () => RA.app.ir(x.ir) }, [
      el('i', { class: 'be-pt', 'aria-hidden': 'true' }),
      x.nombre ? el('span', { class: 'be-n' }, x.nombre + ': ') : null, x.valor,
      NOMBRE[x.estado] ? el('span', { class: 'sr' }, ' (' + NOMBRE[x.estado] + ')') : null
    ])));
    if (foco && $('#' + foco)) $('#' + foco).focus();
  }

  D.alCambiar(pintar);
  document.addEventListener('rastro:estado', pintar);
  document.addEventListener('rastro:vista', pintar);
  setInterval(pintar, 2000);
  pintar();
  RA.barraEstado = { pintar: pintar };
})(window.RA = window.RA || {});
