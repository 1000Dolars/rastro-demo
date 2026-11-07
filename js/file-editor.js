/* Editor del panel Archivos, como en Claude Code Desktop: ver y editar un archivo de texto de la carpeta de
   trabajo. El ⋮ del panel tiene "Guardado automático"; apagado (por defecto), aparecen Guardar y Cancelar.
   Si el archivo cambia en el disco mientras se edita: sin cambios propios se recarga solo; con cambios,
   aviso con Sobrescribir (guarda lo tuyo encima) y Descartar (te quedas con lo del disco).
   Texto plano en mono, sin resaltado (DESIGN.md: el contenido no lleva color). */
(function (RA) {
  'use strict';

  const ui = RA.ui, el = ui.el, $ = ui.$, D = RA.datos;
  const CLAVE = 'rastro:autoguardado', ESPERA = 900;
  // E: { rel, base (texto leído), mtime, sucio, guardando, error, conflicto: { disco, mtime } | null }
  let E = null, auto = false, tAuto = null, visto = 0;
  try { auto = localStorage.getItem(CLAVE) === '1'; } catch (e) { /* sin almacenamiento */ }

  const nombre = rel => String(rel).split('/').pop();
  const campo = () => $('#ed-texto');

  function abrir(rel) {
    if (!D.fs.leer) return ui.decir('El editor necesita la app de escritorio.', 'atencion');
    if (E && E.sucio && E.rel !== rel) return ui.decir('Guarda o cancela los cambios de ' + nombre(E.rel) + ' antes de abrir otro archivo.', 'atencion');
    Promise.resolve(D.fs.leer(rel)).then(r => {
      if (!r || r.error) return ui.decir((r && r.error) || 'No se pudo leer el archivo.', 'error');
      // soloLectura: un archivo de una sesión SSH (se ve, no se guarda; como en Claude Code Desktop).
      E = { rel: rel, base: r.texto, mtime: r.mtime, sucio: false, guardando: false, error: '', conflicto: null, soloLectura: !!r.soloLectura };
      pintar(true);
      const c = campo(); if (c) { c.value = r.texto; c.focus(); c.setSelectionRange(0, 0); c.scrollTop = 0; }
    });
  }

  function cerrar() { clearTimeout(tAuto); E = null; pintar(); const b = $('#arch-editar'); if (b) b.focus(); }

  function guardar(forzar) {
    const c = campo();
    if (!E || !c || E.guardando) return;
    const texto = c.value;
    E.guardando = true; estado();
    Promise.resolve(D.fs.escribir(E.rel, texto, E.mtime, !!forzar)).then(r => {
      E.guardando = false;
      if (!r || r.error) { E.error = (r && r.error) || 'No se pudo guardar.'; return pintar(); }
      if (r.conflicto) { E.conflicto = { disco: r.disco, mtime: r.mtime }; return pintar(); }
      E.base = texto; E.mtime = r.mtime; E.sucio = c.value !== texto; E.error = ''; E.conflicto = null;
      pintar();
      ui.decir(nombre(E.rel) + ' guardado.', { tipo: 'ok', toast: !auto });
    }, () => { E.guardando = false; E.error = 'No se pudo guardar.'; pintar(); });
  }

  // Cancelar: vuelve al texto guardado. Descartar (conflicto): se queda con lo que hay en el disco.
  function cancelar() { const c = campo(); if (!E || !c) return; c.value = E.base; E.sucio = false; E.error = ''; pintar(); c.focus(); }
  function descartar() {
    const c = campo(), k = E && E.conflicto;
    if (!k || !c) return;
    if (k.disco == null) return abrir(E.rel);
    E.base = k.disco; E.mtime = k.mtime; E.sucio = false; E.conflicto = null; c.value = k.disco;
    pintar(); ui.decir('Te quedas con lo que hay en el disco.', 'neutro');
  }

  // El archivo cambió en el disco (vigilancia de la carpeta): se comprueba si es este y qué hacer.
  function revisarDisco() {
    if (!E || E.guardando || E.conflicto || !D.fs.leer) return;
    Promise.resolve(D.fs.leer(E.rel)).then(r => {
      if (!E || !r || r.error || r.mtime === E.mtime) return;
      if (!E.sucio) {
        E.base = r.texto; E.mtime = r.mtime;
        const c = campo(); if (c) c.value = r.texto;
        pintar(); ui.decir(nombre(E.rel) + ' cambió en el disco: se muestra la versión nueva.', { toast: false });
      } else { E.conflicto = { disco: r.texto, mtime: r.mtime }; pintar(); }
    });
  }

  function alEscribir() {
    if (!E) return;
    const c = campo(), antes = E.sucio;
    E.sucio = c.value !== E.base;
    if (antes !== E.sucio) estado();
    if (auto && E.sucio) { clearTimeout(tAuto); tAuto = setTimeout(() => guardar(false), ESPERA); }
  }

  function textoEstado() {
    if (!E) return '';
    if (E.soloLectura) return 'Solo lectura · equipo remoto';
    if (E.guardando) return 'Guardando…';
    if (E.conflicto) return 'Conflicto con el disco';
    if (E.sucio) return auto ? 'Cambios sin guardar · se guardan solos' : 'Cambios sin guardar';
    return 'Guardado';
  }
  function estado() {
    const n = $('#ed-estado'); if (n) n.textContent = textoEstado();
    const g = $('#ed-guardar'), x = $('#ed-cancelar');
    if (g) g.disabled = !E || !E.sucio || E.guardando || !!E.conflicto;
    if (x) x.disabled = !E || !E.sucio || E.guardando;
  }

  function pintar(nuevo) {
    const caja = $('#arch-editor');
    if (!caja) return;
    caja.hidden = !E;
    if (!E) return ui.pintar(caja, null);
    const enPanel = RA.paneles && RA.paneles.enPanel('archivos');
    let c = campo();
    const valor = c && !nuevo ? c.value : null, foco = c && document.activeElement === c, sel = c ? [c.selectionStart, c.selectionEnd, c.scrollTop] : null;
    c = el('textarea', { id: 'ed-texto', class: 'input ed-texto', spellcheck: 'false', autocomplete: 'off', wrap: 'off', 'aria-label': 'Contenido de ' + E.rel, 'aria-describedby': 'ed-estado', readonly: E.soloLectura ? '' : null });
    c.addEventListener('input', alEscribir);
    c.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (!E.soloLectura) guardar(false); } });
    ui.pintar(caja, [
      el('div', { class: 'esc ed-esc' }, [
        el('div', { class: 'row between ed-cab' }, [
          el('span', { class: 'mono ed-ruta' }, ui.ruta(E.rel)),
          el('span', { id: 'ed-estado', class: 'label ed-estado', role: 'status' }, textoEstado())
        ]),
        E.conflicto ? el('div', { class: 'ed-conflicto', role: 'alert' }, [
          el('p', {}, nombre(E.rel) + ' cambió en el disco mientras lo editabas.'),
          el('div', { class: 'row' }, [
            el('button', { type: 'button', id: 'ed-sobrescribir', class: 'btn btn-small', onclick: () => guardar(true) }, 'Sobrescribir'),
            el('button', { type: 'button', id: 'ed-descartar', class: 'btn btn-small', onclick: descartar }, 'Descartar mis cambios')
          ]),
          el('p', { class: 'note' }, 'Sobrescribir guarda tu versión encima de la del disco. Descartar se queda con la del disco.')
        ]) : null,
        E.error ? el('p', { class: 'mal', role: 'alert' }, E.error) : null,
        c,
        el('div', { class: 'row between' }, [
          E.soloLectura ? el('span', { class: 'note' }, 'Solo lectura: pídele a Claude los cambios.') : auto ? el('span', { class: 'note' }, 'Guardado automático activado') : el('div', { class: 'row' }, [
            el('button', { type: 'button', id: 'ed-guardar', class: 'btn btn-small', onclick: () => guardar(false) }, 'Guardar'),
            el('button', { type: 'button', id: 'ed-cancelar', class: 'btn btn-small', onclick: cancelar }, 'Cancelar')
          ]),
          // Sin el ⋮ del panel (vista completa en estrecho), el interruptor va aquí.
          enPanel || E.soloLectura ? null : el('span', { class: 'row' }, [el('span', { class: 'label' }, 'Guardado automático'), ui.interruptor(auto, v => ponerAuto(v), 'Guardado automático')]),
          E.sucio && !auto ? ui.armar(el('button', { type: 'button', id: 'ed-cerrar', class: 'btn btn-small' }, 'Cerrar el editor'), '¿Cerrar sin guardar?', cerrar)
            : el('button', { type: 'button', id: 'ed-cerrar', class: 'btn btn-small', onclick: cerrar }, 'Cerrar el editor')
        ]),
        el('p', { class: 'note' }, E.soloLectura ? 'Archivo del equipo remoto. Solo texto de hasta 1 MB.' : 'Ctrl+S guarda. Solo texto de hasta 1 MB.')
      ]),
      el('div', { class: 'card-pie' }, el('h2', { class: 'label', id: 't-arch-ed' }, 'Editor · ' + nombre(E.rel)))
    ]);
    c.value = valor != null ? valor : E.base;
    if (sel) { c.selectionStart = sel[0]; c.selectionEnd = sel[1]; c.scrollTop = sel[2]; }
    if (foco) c.focus();
    estado();
  }

  function ponerAuto(v) {
    auto = !!v;
    try { localStorage.setItem(CLAVE, auto ? '1' : '0'); } catch (e) { /* sin almacenamiento */ }
    ui.decir('Guardado automático ' + (auto ? 'activado' : 'desactivado') + '.', { toast: false });
    if (auto && E && E.sucio) guardar(false);
    pintar();
  }

  function montar() {
    if (RA.paneles) RA.paneles.registrar('archivos', { menu: () => [{ texto: 'Guardado automático', marcado: auto, id: 'ed-auto', fn: () => ponerAuto(!auto) }] });
    // Cambios en la carpeta (vigilancia del proceso principal): se mira si tocaron el archivo abierto.
    D.alCambiar(() => { const n = D.fs.cambios || 0; if (n !== visto) { visto = n; revisarDisco(); } });
  }

  RA.editor = { abrir: abrir, cerrar: cerrar, abierto: () => E && E.rel, auto: () => auto, revisarDisco: revisarDisco };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar); else montar();
})(window.RA = window.RA || {});
