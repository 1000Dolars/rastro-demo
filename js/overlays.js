/* Capas modales (la paleta de búsqueda y las confirmaciones) y los permisos de una sesión nueva. Las capas
   atrapan el foco, se cierran con Esc y lo devuelven a donde estaba. */
(function (RA) {
  'use strict';

  const ui = RA.ui, el = ui.el, $ = ui.$, D = RA.datos, C = RA.calc, G = RA.glifos;
  // Permisos mínimos por fase. Se ven y se pueden editar en el paso Revisión; solo el modo "Sin permisos" los omite.
  // En Windows, Claude Code ejecuta órdenes con PowerShell o con Bash según lo que haya: van las dos. En Linux solo hay Bash.
  const WIN = D.so.win();
  const ORDENES = ' Bash(node *) Bash(npm *) Bash(npx *)' + (WIN ? ' PowerShell(node *) PowerShell(npm *) PowerShell(npx *)' : '');
  const GIT = ' Bash(git *)' + (WIN ? ' PowerShell(git *)' : '');
  const PERMISOS = {
    estricto: { nombre: 'Estricto', modo: 'dontAsk', diseno: 'Read Glob Grep Edit Write', codigo: 'Read Glob Grep Edit Write' + ORDENES },
    ediciones: { nombre: 'Aceptar ediciones', modo: 'acceptEdits', diseno: 'Read Glob Grep Edit Write', codigo: 'Read Glob Grep Edit Write' + ORDENES + GIT },
    // Auto: un clasificador decide qué órdenes son seguras; mismas herramientas que Aceptar ediciones.
    auto: { nombre: 'Auto', modo: 'auto', diseno: 'Read Glob Grep Edit Write', codigo: 'Read Glob Grep Edit Write' + ORDENES + GIT },
    // Sin permisos: no pregunta ni deniega nada y las reglas de ruta (./**) dejan de confinar; solo limita qué herramientas existen.
    sinpermisos: { nombre: 'Sin permisos', modo: 'bypassPermissions', diseno: 'Read Glob Grep Edit Write', codigo: 'Read Glob Grep Edit Write' + ORDENES + GIT },
    // Plan: el agente investiga y propone, sin editar nada (Claude Code bloquea las ediciones en este modo).
    plan: { nombre: 'Plan', modo: 'plan', diseno: 'Read Glob Grep', codigo: 'Read Glob Grep' }
  };
  const abierta = () => !!$('#capa .velo');

  function capa(nombre, alEsc) {
    const caja = el('div', { class: 'card modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': nombre });
    const velo = el('div', { class: 'velo' }, caja);
    $('#capa').appendChild(velo);
    const soltar = ui.atrapar(velo, alEsc);
    return { caja: caja, cerrar() { soltar(); velo.remove(); } };
  }

  // La sesión nueva es una pantalla única (js/new-session.js); el asistente de cuatro pasos (PASOS) se retiró el
  // 2026-11-04. asistente() se conserva como entrada para quien la abre (Ctrl+N, el "+" de una carpeta…).
  const asistente = op => RA.nuevaSesion ? RA.nuevaSesion.abrir(op) : null;

  // =====================================================================================
  // Paleta de búsqueda (Ctrl+K): sesiones, archivos tocados, prompts anteriores, agentes y herramientas
  // =====================================================================================
  // Sin mayúsculas ni tildes, para que "sesion" encuentre "Sesión".
  const plano = t => String(t).toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  const GRUPOS = ['Vistas', 'Sesiones', 'Prompts', 'Archivos', 'Agentes', 'Herramientas'];
  function paleta() {
    if (abierta()) return;
    const app = RA.app, c = capa('Buscar', () => c.cerrar());
    const s = C.sesion(app.sel.sesion) || D.estado.sesiones[0];
    const elegirSesion = (x, vista) => { app.sel.sesion = x.id; app.sel.agente = null; app.sel.evento = null; app.ir(vista || 'chat'); };
    // Índice: [grupo, texto que se busca, nodos que se pintan, qué hace al elegirlo]
    const indice = [];
    [['chat', 'Chat'], ['sesiones', 'Sesiones'], ['cambios', 'Cambios'], ['archivos', 'Archivos'], ['consola', 'Consola'], ['consumo', 'Uso · Consumo'], ['estadisticas', 'Uso · Estadísticas'], ['ajustes', 'Ajustes']]
      .forEach(v => indice.push(['Vistas', v[1], [el('span', {}, v[1])], () => app.ir(v[0])]));
    D.estado.sesiones.forEach(x => {
      indice.push(['Sesiones', x.nombre + ' ' + (x.carpeta || ''), [ui.estado(x.est), el('span', { class: 'crece' }, x.nombre), el('span', { class: 'note' }, ui.fecha(x.tUlt || x.t0 || D.ahora()))], () => elegirSesion(x)]);
      // Prompts anteriores: los del transcript de cada sesión. Elegir uno lo deja en el campo de Chat, sin enviarlo.
      (x.prompts || []).slice(-30).reverse().forEach(p => indice.push(['Prompts', p.texto, [el('span', { class: 'crece paleta-prompt' }, p.texto), el('span', { class: 'note' }, x.nombre)], () => { elegirSesion(x); if (RA.chat) RA.chat.poner(p.texto); }]));
      // Archivos tocados: los cambiados abren su diff en Cambios; los solo leídos, su sesión.
      C.archivos(x).forEach(f => {
        const cambiado = f.escrituras > 0, k = x.id + '|' + f.archivo;
        indice.push(['Archivos', f.archivo, [el('span', { class: 'crece mono' }, ui.ruta(f.archivo)), el('span', { class: 'note' }, (cambiado ? 'cambiado · ' : 'leído · ') + x.nombre)], () => { if (cambiado && C.cambios().some(y => y.s.id + '|' + y.archivo === k)) { app.sel.sesion = x.id; app.sel.archivo = k; app.ir('cambios'); } else elegirSesion(x); }]);
      });
    });
    // Los prompts enviados desde Rastro que aún no estén en un transcript.
    if (RA.chat) RA.chat.historial().forEach(t => { if (!indice.some(x => x[0] === 'Prompts' && x[1] === t)) indice.push(['Prompts', t, [el('span', { class: 'crece paleta-prompt' }, t), el('span', { class: 'note' }, 'enviado desde Rastro')], () => { app.ir('chat'); RA.chat.poner(t); }]); });
    if (s) {
      s.agentes.forEach(a => indice.push(['Agentes', a.cod + ' ' + a.tipo, [G.deAgente(a, null), ui.insignia(a.cod), el('span', {}, a.tipo)], () => { app.sel.sesion = s.id; app.sel.agente = a.id; app.sel.evento = null; app.ir('chat'); }]));
      C.herramientas([s]).forEach(h => indice.push(['Herramientas', h.h, [G.svg(G.deHerramienta(h.h), null), el('span', { class: 'mono' }, h.h)], () => app.ir('estadisticas')]));
    }
    indice.forEach(x => { x[4] = plano(x[1]); });

    const lista = el('div', { id: 'paleta-res', class: 'paleta-res', role: 'listbox', 'aria-label': 'Resultados' });
    const nada = el('p', { class: 'note', hidden: true }, 'Sin resultados.');
    const input = el('input', { id: 'paleta-q', class: 'input', type: 'text', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'paleta-res', 'aria-autocomplete': 'list', 'aria-label': 'Buscar sesiones, prompts anteriores, archivos tocados, agentes y herramientas', autocomplete: 'off', spellcheck: 'false', placeholder: 'Buscar…' });
    let res = [], act = 0;
    const marcar = () => {
      ui.$$('[role="option"]', lista).forEach((n, i) => { n.classList.toggle('act', i === act); n.setAttribute('aria-selected', String(i === act)); if (i === act) { input.setAttribute('aria-activedescendant', n.id); n.scrollIntoView({ block: 'nearest' }); } });
      if (!res.length) input.removeAttribute('aria-activedescendant');
    };
    const elegir = i => { if (res[i]) { c.cerrar(); res[i][3](); } };
    const pintar = () => {
      // Cada palabra escrita tiene que aparecer, en cualquier orden.
      const q = plano(input.value.trim()), palabras = q.split(/\s+/).filter(Boolean);
      res = []; act = 0;
      const grupos = GRUPOS.map(g => {
        if (!q && g !== 'Sesiones' && g !== 'Vistas') return null;
        const mios = indice.filter(x => x[0] === g && palabras.every(w => x[4].indexOf(w) >= 0)).slice(0, q ? 8 : 4);
        if (!mios.length) return null;
        return el('div', { role: 'group', 'aria-label': g }, [el('div', { class: 'label', 'aria-hidden': 'true' }, g)].concat(mios.map(x => {
          const i = res.push(x) - 1;
          return el('div', { id: 'pr-' + i, role: 'option', 'aria-selected': 'false', onclick: () => elegir(i) }, x[2].map(n => n.cloneNode(true)));
        })));
      });
      // Sin resultados no queda una lista vacía: se oculta y se dice con una frase.
      ui.pintar(lista, grupos);
      lista.hidden = !res.length; nada.hidden = !!res.length;
      input.setAttribute('aria-expanded', String(!!res.length));
      marcar();
    };
    input.addEventListener('input', pintar);
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (res.length) { act = (act + (e.key === 'ArrowDown' ? 1 : -1) + res.length) % res.length; marcar(); } }
      else if (e.key === 'Enter') { e.preventDefault(); elegir(act); }
    });
    ui.pintar(c.caja, [input, lista, nada, el('p', { class: 'note' }, ['Flechas para moverse, ', el('kbd', {}, 'Enter'), ' abre y ', el('kbd', {}, 'Esc'), ' cierra.'])]);
    pintar();
    input.focus();
  }

  RA.capas = { asistente: asistente, paleta: paleta, capa: capa, abierta: abierta, PERMISOS: PERMISOS };
})(window.RA = window.RA || {});
