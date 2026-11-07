/* Respuesta de Chat: el estado de cada respuesta (enviando, respondiendo, listo, error, cancelado), lo que
   llega del proceso principal y la caja que la enseña bajo el campo de prompts. chat.js decide cuándo se
   envía; este módulo solo guarda y pinta lo que vuelve. */
(function (RA) {
  'use strict';

  const ui = RA.ui, el = ui.el, $ = ui.$, D = RA.datos;
  const TOPE = 20000;         // el TOPE_TEXTO del proceso principal (src/main/services/claude/chat.js)
  const NOMBRE = { enviando: 'Enviando', respondiendo: 'Respondiendo', listo: 'Listo', error: 'Error', cancelado: 'Cancelado' };
  const estados = {};          // sesión -> { est, texto, herramienta, error, t0, t1, modelo, permiso }
  const enMarcha = id => { const c = estados[id]; return !!c && (c.est === 'enviando' || c.est === 'respondiendo'); };
  // Quien pinta el resto de Chat (chat.js) se engancha aquí: repintar, el fin de un turno y reenviar o editar un prompt.
  const ganchos = { pintar: null, terminado: null, reenviar: null, editar: null };

  /* El prompt de cada respuesta, para "Reenviar" y "Editar y reenviar". Solo se sabe el de lo enviado desde este
     campo: al enviar queda "pendiente" y se une a la primera ejecución nueva que llega del proceso principal (otro
     t0). Lo que sale de la cola no lo trae (el contrato con el proceso principal no cambia): ahí no hay botones. */
  const prompts = {}, pendientes = {};       // sesión -> { t0, texto } · sesión -> texto
  function unirPrompt(c) {
    const p = prompts[c.sesion];
    if (p && p.t0 === c.t0) return;
    if (pendientes[c.sesion] != null) { prompts[c.sesion] = { t0: c.t0, texto: pendientes[c.sesion] }; delete pendientes[c.sesion]; }
    else delete prompts[c.sesion];
  }

  /* La caja de la respuesta. Se monta una vez y luego solo se actualiza lo que cambia: el texto que llega se añade
     al mismo nodo de texto (appendData), sin rehacer la caja, para no perder la selección ni el foco. */
  let v = null;
  function montar(caja) {
    if (v && v.caja === caja && caja.contains(v.cab)) return v;
    const accion = (id, texto, fn) => el('button', { type: 'button', class: 'btn btn-small', id: id, hidden: '', onclick: e => fn(e.currentTarget) }, texto);
    v = { caja: caja, sesion: null, firmaIns: '', firmaErr: '', firmaMd: '', mdPendiente: false };
    v.badges = el('div', { class: 'badges' });
    v.dur = el('span', { class: 'chip resp-dur' });
    v.cab = el('div', { class: 'row between resp-cab' }, [v.badges, v.dur]);
    v.nodo = document.createTextNode('');
    // Mientras llega: texto plano en prosa (D3), con el cursor fijo al final (D4, en CSS: .llegando::after).
    v.pre = el('pre', { class: 'resp-prosa masc-texto', tabindex: '0', role: 'group', hidden: '' });
    v.pre.appendChild(v.nodo);
    // Al terminar: el mismo texto en markdown (D2), pintado como nodos, nunca como HTML.
    v.md = el('div', { class: 'resp-prosa masc-md', tabindex: '0', role: 'group', hidden: '' });
    v.espera = el('p', { class: 'label resp-espera', hidden: '' });
    // Las notas solo llevan texto mientras se ven: así nada oculto se lee como si estuviera (textContent, búsquedas).
    v.recortada = el('p', { class: 'note resp-recortada', hidden: '' });
    v.error = el('div', { class: 'resp-error', hidden: '' });
    v.cancelada = el('p', { class: 'note resp-cancelada', hidden: '' });
    v.copiar = accion('resp-copiar', 'Copiar respuesta', b => { const c = estados[v.sesion]; if (c && c.texto) ui.copiar(c.texto, 'Respuesta', b); });
    v.reenviar = accion('resp-reenviar', 'Reenviar', () => { const p = prompts[v.sesion]; if (p && ganchos.reenviar) ganchos.reenviar(p.texto); });
    v.editar = accion('resp-editar', 'Editar y reenviar', () => { const p = prompts[v.sesion]; if (p && ganchos.editar) ganchos.editar(p.texto); });
    v.acciones = el('div', { class: 'row resp-acciones', hidden: '' }, [v.copiar, v.reenviar, v.editar]);
    ui.pintar(caja, [v.cab, v.pre, v.md, v.espera, v.recortada, v.error, v.cancelada, v.acciones]);
    return v;
  }

  // El prompt más reciente de la sesión según su transcript.
  const ultimoPromptDe = s => (s.prompts || []).reduce((m, p) => !m || p.t > m.t ? p : m, null);
  // La respuesta guardada ya no es la de ahora: después hubo un turno desde otro sitio (la terminal, otra ventana).
  function obsoleta(s, c) { const p = ultimoPromptDe(s); return !!(c && c.t1 && p && p.t > c.t1 + 2000); }
  // La caja enseña la respuesta del último prompt de la conversación (para que el hilo no la repita).
  function vigente(s) {
    const c = s && estados[s.id];
    if (!c || obsoleta(s, c)) return false;
    const p = ultimoPromptDe(s);
    return !!p && p.t >= c.t0 - 2000;
  }
  // ¿Hay texto seleccionado dentro de la respuesta? Entonces el markdown espera, para no quitarte la selección.
  const seleccionEn = n => { const x = getSelection(); return !!(x && x.rangeCount && !x.isCollapsed && n.contains(x.anchorNode)); };
  document.addEventListener('selectionchange', () => { if (v && v.mdPendiente && !seleccionEn(v.pre)) { const s = RA.vistas && RA.vistas.actual(); if (s && v.sesion === s.id) pintarCaja(s, v.caja); } });

  // Pinta la respuesta de la sesión s. false si no hay nada que enseñar.
  function pintarCaja(s, caja) {
    let c = estados[s.id];
    if (obsoleta(s, c)) c = null;
    const ocupado = enMarcha(s.id);
    caja.hidden = !c;
    if (!c) return false;
    const w = montar(caja), otra = w.sesion !== s.id;
    w.sesion = s.id;
    // Insignias: solo si cambian (estado, modelo o herramienta).
    const firmaIns = [c.est, c.modelo, ocupado ? c.herramienta : ''].join('|');
    if (firmaIns !== w.firmaIns) {
      w.firmaIns = firmaIns;
      ui.pintar(w.badges, [ui.insignia(NOMBRE[c.est] || c.est, c.est === 'error' ? 'alerta' : ''), c.modelo ? ui.insignia(ui.modelo(c.modelo)) : null, c.herramienta && ocupado ? el('span', { class: 'chip' }, 'Herramienta: ' + c.herramienta) : null]);
    }
    const dur = ui.dur((c.t1 || D.ahora()) - c.t0);
    if (w.dur.textContent !== dur) w.dur.textContent = dur;
    // Texto: lo nuevo se añade al final del mismo nodo; si cambió lo de antes (un secreto enmascarado), se sustituye.
    // La respuesta sigue al final mientras llega, salvo que la persona haya subido para leer.
    const t = c.texto || '', pre = w.pre, pegado = otra || pre.hidden || pre.scrollHeight - pre.scrollTop - pre.clientHeight < 24;
    if (w.nodo.data !== t) {
      if (!otra && w.nodo.data && t.indexOf(w.nodo.data) === 0) w.nodo.appendData(t.slice(w.nodo.data.length));
      else w.nodo.data = t;
    }
    const etiqueta = 'Respuesta de ' + s.nombre;
    if (pre.getAttribute('aria-label') !== etiqueta) { pre.setAttribute('aria-label', etiqueta); w.md.setAttribute('aria-label', etiqueta); }
    pre.classList.toggle('llegando', ocupado && !!t);
    // Terminada: markdown, salvo que tengas texto seleccionado en ella (espera a que lo sueltes).
    const firmaMd = !ocupado && t ? s.id + '|' + c.t0 + '|' + t.length + '|' + t.slice(-40) : '';
    if (!firmaMd) { w.firmaMd = ''; w.mdPendiente = false; w.md.hidden = true; pre.hidden = !t; }
    else if (firmaMd !== w.firmaMd) {
      if (seleccionEn(pre)) { w.mdPendiente = true; pre.hidden = false; w.md.hidden = true; }
      else {
        const foco = document.activeElement === pre;
        w.firmaMd = firmaMd; w.mdPendiente = false;
        ui.pintar(w.md, RA.markdown ? RA.markdown.pintar(t) : t);
        w.md.hidden = false; pre.hidden = true;
        if (foco) w.md.focus();
      }
    }
    if (t && pegado && !pre.hidden) pre.scrollTop = pre.scrollHeight;
    w.espera.hidden = !!t || !ocupado;
    if (!w.espera.hidden) w.espera.textContent = c.est === 'enviando' ? 'Arrancando la sesión' : 'Esperando la respuesta';
    if (w.recortada.hidden === !!c.recortado) ui.pintar(w.recortada, c.recortado ? [el('span', { class: 'resp-aviso' }, 'Respuesta recortada'), ': aquí se ven los primeros ' + ui.num(TOPE) + ' caracteres. La respuesta entera queda en la conversación de la sesión.'] : null);
    w.recortada.hidden = !c.recortado;
    // Error: se rehace solo si cambia; "Ver detalles" sigue abierto si lo estaba.
    const firmaErr = c.error ? c.error + '|' + (c.codigo || '') : '';
    if (firmaErr !== w.firmaErr) {
      const abierto = !!w.error.querySelector('details[open]');
      w.firmaErr = firmaErr;
      ui.pintar(w.error, c.error ? cajaError(c, abierto && !otra) : null);
    }
    w.error.hidden = !c.error;
    w.cancelada.hidden = c.est !== 'cancelado';
    w.cancelada.textContent = w.cancelada.hidden ? '' : 'Cancelado: el turno quedó cerrado en la sesión.';
    // Acciones: copiar si hay texto; reenviar y editar cuando terminó y se sabe el prompt.
    const p = prompts[s.id];
    w.copiar.hidden = !t;
    w.reenviar.hidden = w.editar.hidden = ocupado || !p;
    w.acciones.hidden = w.copiar.hidden && w.reenviar.hidden;
    return true;
  }

  /* Error: primero qué pasó y qué puedes hacer; el texto técnico, plegado en "Ver detalles". */
  function cajaError(c, abierto) {
    const x = RA.logica.explicarError(c.error, c.codigo);
    return [
      el('p', {}, el('span', { class: 'mal' }, x.que)),
      x.hacer ? el('p', {}, x.hacer) : null,
      x.detalle ? el('details', { open: abierto ? '' : null }, [el('summary', {}, 'Ver detalles'), el('pre', { class: 'dato' }, x.detalle)]) : null
    ];
  }

  /* Lo que Claude Code informa al terminar o al empezar un turno y sirve después: la ventana de contexto de cada
     modelo (se recuerda entre sesiones) y el estado de los conectores (MCP) de la sesión. */
  const mcps = {};
  let ventanas = {};
  try { ventanas = JSON.parse(localStorage.getItem('rastro:ventanas')) || {}; } catch (e) { ventanas = {}; }
  function aprender(c) {
    if (Array.isArray(c.mcp)) mcps[c.sesion] = c.mcp;
    if (c.ventana > 0 && c.modelo && ventanas[c.modelo] !== c.ventana) {
      ventanas[c.modelo] = c.ventana;
      try { localStorage.setItem('rastro:ventanas', JSON.stringify(ventanas)); } catch (e) { /* sin almacenamiento */ }
    }
  }

  // Estado que llega del proceso principal (agrupado cada 100 ms).
  function recibir(c) {
    const antes = estados[c.sesion];
    estados[c.sesion] = c;
    unirPrompt(c);
    aprender(c);
    const s = RA.vistas && RA.vistas.actual();
    if (RA.chat3) RA.chat3.pintarLista();          // el estado en palabras de la lista Sesiones
    if (s && s.id === c.sesion) { if (ganchos.pintar) ganchos.pintar(s); if (RA.vistas.mascota && (RA.app ? RA.app.sel : {}).vista === 'chat') RA.vistas.mascota(s); }
    if (antes && (antes.est === 'enviando' || antes.est === 'respondiendo') && !enMarcha(c.sesion)) {
      const x = D.estado.sesiones.filter(y => y.id === c.sesion)[0], n = x ? x.nombre : 'la sesión';
      if (c.est === 'listo' && s && s.id === c.sesion && ganchos.terminado) ganchos.terminado(s);
      // Pop-up del final del turno (js/turn-popup.js): resumen, archivos tocados y tiempo.
      if (RA.turno) RA.turno.alTerminar({ sesion: c.sesion, est: c.est, t0: c.t0 || antes.t0, t1: c.t1 || D.ahora() });
      if (c.est === 'error') { const x = RA.logica.explicarError(c.error, c.codigo); ui.decir('Falló el prompt en ' + n + '. ' + x.que + (x.hacer ? ' ' + x.hacer : ''), { tipo: 'error', detalle: x.detalle || null, sesion: c.sesion }); }
      else ui.decir(c.est === 'listo' ? 'Respuesta de ' + n + ' lista.' : 'Prompt cancelado en ' + n + '.');
    }
  }

  RA.respuesta = {
    NOMBRE: NOMBRE, ganchos: ganchos, enMarcha: enMarcha, pintarCaja: pintarCaja, recibir: recibir,
    de: id => estados[id] || null,
    // c.prompt: lo que se envió. Mientras arranca queda pendiente de unirse a la ejecución que llegue.
    poner(id, c) {
      estados[id] = c;
      if (c.prompt == null) return;
      prompts[id] = { t0: c.t0, texto: c.prompt };
      if (c.est === 'enviando') pendientes[id] = c.prompt; else delete pendientes[id];
    },
    quitar(id) { delete estados[id]; delete pendientes[id]; delete prompts[id]; },
    prompt: id => prompts[id] ? prompts[id].texto : null,
    vigente: vigente,
    ventana: s => (s && (ventanas[s.modelo] || (estados[s.id] && estados[s.id].ventana))) || 0,
    mcp: id => mcps[id] || null
  };
})(window.RA = window.RA || {});
