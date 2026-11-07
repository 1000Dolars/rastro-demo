/* Tarjeta GitHub del panel de detalles: repositorio y rama de la sesión, su pull request (número y título), el
   estado del CI (pendiente, en curso, correcto o fallo) y los cambios recientes de la sesión. Hereda el PR y el
   CI que enseñaba la tarjeta Cambios.
   - Solo lectura con `gh` en el proceso principal: como mucho una consulta por minuto y sesión (PR_MS).
   - Animación: un pulso cuando cambia el estado del PR o del CI, y una barra de progreso mientras el CI está en
     curso. Con menos movimiento o en modo juego, nada se mueve (la barra queda quieta, a rayas).
   - "Abrir PR" pide confirmación y abre el enlace en el navegador del sistema. Auto-fix y fusión siguen
     desactivados: escriben en GitHub. */
(function (RA) {
  'use strict';

  const ui = RA.ui, el = ui.el, $ = ui.$, D = RA.datos, C = RA.calc;
  const PR_MS = 60000;                   // como mucho una consulta a GitHub por minuto y sesión
  const lim = RA.logica.limitador(PR_MS);
  const prs = {};                        // por sesión: { pidiendo, t, pr, repo, rama, motivo, firma }
  const oyentes = [];                    // quien quiere saber que cambió el PR o el CI (el mapa de agentes)
  const quieto = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('modo-juego');

  // Estado resumido de una sesión: lo que, si cambia, merece un pulso.
  const estadoCi = pr => !pr ? '' : pr.ciDetalle || ({ exito: 'correcto', fallo: 'fallo', pendiente: 'pendiente', sin: 'pendiente' }[pr.ci] || 'pendiente');
  const firmaDe = p => p.pr ? [p.pr.numero, p.pr.estado, estadoCi(p.pr)].join('|') : 'sin';

  function pedir(s, forzar) {
    if (!D.pr || !s.carpeta) return;
    const p = prs[s.id] = prs[s.id] || {};
    if (p.pidiendo) return;
    if (forzar) lim.olvidar(s.id);
    if (!lim.puede(s.id, D.ahora())) return;
    p.pidiendo = true;
    Promise.resolve(D.pr(s.id)).then(r => recibir(s, { pr: r && r.pr || null, repo: r && r.repo || '', rama: r && r.rama || '', motivo: r && (r.error || r.motivo) || '' }),
      () => recibir(s, { pr: null, motivo: 'No se pudo consultar GitHub.' }));
  }
  function recibir(s, r) {
    const p = prs[s.id], antes = p.firma;
    Object.assign(p, r, { pidiendo: false, t: D.ahora() });
    p.firma = firmaDe(p);
    autoArchivar(s, p);
    const cambio = antes != null && antes !== p.firma;
    if (cambio) oyentes.forEach(fn => { try { fn({ sesion: s.id, pr: p.pr, ci: estadoCi(p.pr), antes: antes }); } catch (e) { /* un oyente roto no para la tarjeta */ } });
    pintar(null, cambio && s.id === (RA.vistas && RA.vistas.actual() || {}).id);
  }

  // Ajustes › Claude Code › Auto-archivar: si el PR de la sesión se fusionó o se cerró, la sesión va a Archivadas
  // (una vez; se puede desarchivar desde Ver todas).
  const archivadas = new Set();
  function autoArchivar(s, p) {
    if (!D.ajustes.autoArchivar || !p.pr || archivadas.has(s.id) || !RA.barra || !RA.barra.archivar) return;
    if (p.pr.estado !== 'MERGED' && p.pr.estado !== 'CLOSED') return;
    archivadas.add(s.id);
    RA.barra.archivar(s.id, true);
  }

  // "Abrir PR": confirma y abre el enlace del PR (siempre https://github.com/…) en el navegador del sistema.
  function abrirPr(pr, volver) {
    if (!pr || !pr.url) return ui.decir('Este pull request no trae un enlace de GitHub.', 'atencion');
    const c = RA.capas.capa('Abrir el pull request', () => { c.cerrar(); if (volver) volver.focus(); });
    ui.pintar(c.caja, [
      el('h2', { class: 'chica', id: 'gh-abrir-t' }, 'Abrir el pull request #' + pr.numero),
      el('p', {}, 'Se abrirá en tu navegador. Rastro no cambia nada en GitHub.'),
      el('pre', { class: 'dato ns-orden', id: 'gh-abrir-url', tabindex: '0', role: 'group', 'aria-label': 'Enlace' }, pr.url),
      el('div', { class: 'row between' }, [
        el('button', { type: 'button', class: 'btn btn-primary', id: 'gh-abrir-no', onclick: () => { c.cerrar(); if (volver) volver.focus(); } }, 'Cancelar'),
        el('button', { type: 'button', class: 'btn', id: 'gh-abrir-si', onclick: () => { c.cerrar(); if (D.abrirEnlace) D.abrirEnlace(pr.url); else window.open(pr.url, '_blank', 'noopener'); ui.decir('Pull request #' + pr.numero + ' abierto en el navegador.', 'ok'); if (volver) volver.focus(); } }, 'Abrir en el navegador')
      ])
    ]);
    c.caja.setAttribute('aria-labelledby', 'gh-abrir-t'); c.caja.removeAttribute('aria-label');
    $('#gh-abrir-no').focus();
  }

  // Cambios recientes de la sesión: los últimos archivos que tocó, con sus líneas.
  function recientes(s) {
    const m = new Map();
    (C && C.cambios ? C.cambios() : []).filter(c => c.s === s).forEach(c => {
      const f = m.get(c.archivo) || { archivo: c.archivo, mas: 0, menos: 0, t: 0 };
      f.mas += c.mas; f.menos += c.menos; f.t = Math.max(f.t, c.e.t); m.set(c.archivo, f);
    });
    return [...m.values()].sort((a, b) => b.t - a.t).slice(0, 4);
  }

  function cuerpo(s) {
    const p = prs[s.id], out = [];
    const fila = (k, v, cls) => el('p', { class: 'det-fila' }, [el('span', { class: 'label' }, k), el('span', { class: 'mono det-ruta ' + (cls || ''), title: v }, v)]);
    if (!D.pr) out.push(el('p', { class: 'note det-vacio' }, 'El repositorio y su pull request se consultan con GitHub desde la app de escritorio.'));
    else if (!s.carpeta) out.push(el('p', { class: 'note det-vacio' }, 'Esta sesión no dejó dicho en qué carpeta trabaja.'));
    else if (!p || (p.pidiendo && !p.t)) out.push(el('p', { class: 'label' }, 'Consultando GitHub'));
    else {
      if (p.repo) out.push(fila('Repositorio', p.repo, 'gh-repo'));
      if (p.rama) out.push(fila('Rama', p.rama, 'gh-rama'));
      if (!p.pr) out.push(el('p', { class: 'note det-vacio' }, ['Sin pull request. ', p.motivo || 'Esta rama no tiene ninguno abierto en GitHub.']));
      else {
        const pr = p.pr, ci = estadoCi(pr);
        const menu = el('button', { type: 'button', class: 'icono det-pr-mas', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'Abrir opciones del pull request #' + pr.numero, title: 'Más' }, ui.icono('mas'));
        const motivo = 'Actúa sobre GitHub (escribe en el repositorio): queda desactivado hasta que lo confirmes.';
        menu.addEventListener('click', () => ui.menu(menu, [
          { texto: 'Auto-fix', marcado: false, desactivado: motivo, ayuda: 'Claude corrige los checks que fallan y atiende comentarios de revisión.' },
          { texto: 'Merge when ready', marcado: false, desactivado: motivo, ayuda: 'Activa el auto-merge de GitHub para este pull request.' }
        ]));
        const abrir = el('button', { type: 'button', class: 'btn btn-small', id: 'gh-abrir-pr', onclick: e => abrirPr(pr, e.currentTarget) }, 'Abrir PR');
        out.push(el('div', { class: 'det-pr' }, [
          el('div', { class: 'row between det-pr-cab' }, [el('span', { class: 'crece det-pr-tit', title: pr.titulo }, [el('span', { class: 'mono' }, '#' + pr.numero), ' ', pr.titulo]), menu]),
          el('p', { class: 'det-fila' }, [
            ui.insignia(pr.borrador ? 'Borrador' : pr.estado === 'MERGED' ? 'Fusionado' : pr.estado === 'CLOSED' ? 'Cerrado' : 'Abierto'),
            el('span', { class: 'det-ci', 'data-ci': ci }, [el('i', { class: 'est ' + ({ correcto: 'listo', fallo: 'error', curso: 'curso' }[ci] || 'cola'), 'aria-hidden': 'true' }), RA.logica.NOMBRE_CI[ci]])
          ]),
          // Mientras el CI corre: una barra de progreso (indeterminada: GitHub no dice cuánto falta).
          ci === 'curso' ? el('div', { class: 'gh-progreso' + (quieto() ? ' quieta' : ''), role: 'progressbar', 'aria-label': 'CI en curso', 'aria-valuetext': 'En curso, sin porcentaje' }, el('i')) : null,
          abrir
        ]));
      }
    }
    const rec = recientes(s);
    out.push(el('div', { class: 'det-sep' }));
    out.push(el('p', { class: 'label' }, 'Cambios recientes'));
    out.push(rec.length ? el('ul', { class: 'det-lista gh-recientes', 'aria-label': 'Cambios recientes de la sesión' }, rec.map(f => el('li', { class: 'det-fila' }, [el('span', { class: 'crece det-ruta mono', title: f.archivo }, ui.ruta(f.archivo)), el('span', { class: 'chip mono' }, '+' + f.mas + ' −' + f.menos)])))
      : el('p', { class: 'note det-vacio' }, 'Esta sesión todavía no ha cambiado ningún archivo.'));
    return out;
  }

  function pintar(s, pulso) {
    s = s || (RA.vistas && RA.vistas.actual());
    const caja = $('#det-github');
    if (!caja || !s) return;
    pedir(s);
    if (caja.contains(document.activeElement) && ui.menu.abierto) return;     // no quitarle el menú abierto
    const foco = document.activeElement && caja.contains(document.activeElement) ? document.activeElement.id : null;
    const p = prs[s.id] || {};
    caja.dataset.ci = p.pr ? estadoCi(p.pr) : '';
    ui.pintar(caja, [
      el('div', { class: 'esc det-esc' }, cuerpo(s)),
      el('div', { class: 'card-pie' }, [el('h2', { class: 'label', id: 't-det-gh' }, 'GitHub'), p.t ? el('span', { class: 'mono det-pie-dato', title: 'Se consulta como mucho una vez por minuto' }, 'hace ' + Math.max(0, Math.round((D.ahora() - p.t) / 60000)) + ' min') : null])
    ]);
    if (foco && $('#' + foco)) $('#' + foco).focus();
    // Pulso: el PR o el CI cambiaron. Un anillo que se abre y se apaga (600 ms), sin moverse con menos movimiento.
    if (pulso && !quieto() && caja.animate) caja.animate([{ boxShadow: '0 0 0 0 var(--sel)' }, { boxShadow: '0 0 0 6px transparent' }], { duration: 600, easing: 'ease-out' });
    if (pulso) ui.decir('GitHub: ' + (p.pr ? 'pull request #' + p.pr.numero + ', ' + RA.logica.NOMBRE_CI[estadoCi(p.pr)] : 'sin pull request') + '.', { toast: false });
  }

  RA.github = { pintar: pintar, PR_MS: PR_MS, _prs: prs, _lim: lim, refrescar: s => { pedir(s, true); }, consultar: s => pedir(s), abrirPr: abrirPr, estadoCi: estadoCi,
    alCambiar: fn => oyentes.push(fn), de: id => prs[id] || null };
})(window.RA = window.RA || {});
