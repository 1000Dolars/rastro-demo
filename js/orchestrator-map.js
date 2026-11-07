/* Agentes (diseño "Rastro Sesiones"): mapa hub and spoke con datos reales.
   - Centro: el modelo líder con la mascota. "Sesión elegida": el agente principal de esa sesión de Claude
     Code; sus ramas son sus subagentes (con sub-ramas si delegan a su vez) y las tareas que Rastro mandó a
     la IA local, a la nube (OpenRouter…), a OpenCode o a Hermes. "Todas las sesiones": Rastro coordina; las
     ramas son las carpetas (plegables) y dentro, el agente principal de cada sesión reciente.
   - Tarjeta de agente (Nodo Agente): modelo, tipo, esfuerzo, actividad actual y uno de seis estados
     (trabajando, en espera, pide permiso, terminado, falló, uso agotado). El trazo de la rama dice el tipo y
     su color, el estado.
   - Panel de actividad (Panel Actividad) al elegir un agente: actividad en vivo, Aprobar/Rechazar el permiso
     real, medidor de uso (el oficial del plan, o la VRAM con su tope en el local), modo juego y Detener.
   - Aviso rojo si se agota el uso de la nube o del plan: "Ver nodo" y "Pasar a local" (modo continuidad).
   - Arrastre del fondo, zoom con la rueda y los botones, "Encajar" y filtro por tipo.
   Nada es de ejemplo: lo que no llega de Claude Code o de Rastro se dice ("no informado"). */
(function (RA) {
  'use strict';

  const ui = RA.ui, el = ui.el, G = RA.glifos, D = RA.datos, P = window.rastro;
  const NS = 'http://www.w3.org/2000/svg';
  const TIPOS = { claude: 'Claude', local: 'Local', nube: 'Nube', opencode: 'OpenCode', hermes: 'Hermes', github: 'GitHub' };
  const MAX_GH = 10;                   // en "Todas las sesiones", cuántas sesiones (las más recientes) consultan su PR
  const EST = {
    trabajando: 'Trabajando', espera: 'En espera', permiso: 'Pide permiso', terminado: '✓ Terminado', fallido: 'Falló', agotado: 'Uso agotado'
  };
  const ESF = ['', 'Bajo', 'Medio', 'Alto'];
  const VERBO = { Read: 'Leer', Edit: 'Editar', MultiEdit: 'Editar', Write: 'Escribir', Bash: 'Ejecutar', Grep: 'Buscar', Glob: 'Buscar', WebFetch: 'Web', WebSearch: 'Web', Agent: 'Delegar', Task: 'Delegar' };
  const MAX_TODAS = 40, DIA = 86400000;

  // Estado de la vista que sobrevive a los repintados.
  const V = { z: 1, px: 0, py: 0, filtro: 'todos', sel: null, colapsados: null, encajar: true, firma: '', caja: null, o: null, drag: null, movido: false, armado: null, alcance: null };

  // ---- Datos reales -> nodos ----
  const esfuerzo = e => ({ low: 1, medium: 2, high: 3, xhigh: 3, max: 3, bajo: 1, medio: 2, alto: 3 })[e] || 0;
  const nombreModelo = m => m ? ui.modelo(m).replace(/^\w/, c => c.toUpperCase()) : 'Modelo no informado';
  const usoPlan = () => { const U = D.estado.uso, b = U && U.bloques && U.bloques[0]; return b ? { pct: b.pct == null ? null : Math.round(b.pct), reinicio: b.reinicia ? new Date(b.reinicia) : null, fuente: U.fuente === 'oficial' ? 'OFICIAL' : 'ESTIMADO' } : null; };
  const recursos = () => (RA.fase4 && RA.fase4.estado().recursos) || null;
  const continuidad = () => (RA.fase4 && RA.fase4.estado().continuidad) || null;
  function gpu() {
    const R = recursos(); if (!R || !R.gpu || !R.gpu.totalMB) return null;
    return { usado: Math.round(R.gpu.usadaMB / 102.4) / 10, total: Math.round(R.gpu.totalMB / 102.4) / 10, tope: (R.config && R.config.topeVram) || R.topeGpu || 80, juego: !!(R.juego && R.juego.activo), nombre: R.gpu.nombre || '' };
  }
  function actividad(s, ag) {
    return RA.calc.eventos(s, ag).slice(-6).map(e => [e.h, e.res || '', e.cuenta ? '+' + e.cuenta.mas + ' −' + e.cuenta.menos : e.est === 'curso' ? 'trabajando' : e.est === 'error' ? 'falló' : e.dur != null ? ui.dur(e.dur) : '', e.est === 'curso' ? 'curso' : e.est === 'error' ? 'error' : 'ok']);
  }
  function estadoSesion(s) {
    const p = RA.chat && RA.chat.permiso && RA.chat.permiso(s.id), u = usoPlan();
    if (p) return 'permiso';
    if (s.bloqueo && /l[ií]mite|cuota|usage/i.test(s.bloqueo)) return 'agotado';
    if (u && u.pct != null && u.pct >= 100 && s.est !== 'listo') return 'agotado';
    const t = RA.vistas.tarjeta(s).clave;
    return { trabajando: 'trabajando', esperando: 'espera', terminada: 'terminado', error: 'fallido', detenida: 'espera' }[t] || 'espera';
  }
  const estadoAgente = a => ({ curso: 'trabajando', listo: 'terminado', error: 'fallido', detenido: 'espera', cola: 'espera', nodatos: 'espera' })[a.est] || 'espera';
  function principal(s, extra) {
    const t = RA.vistas.tarjeta(s), p = RA.chat && RA.chat.permiso && RA.chat.permiso(s.id), est = estadoSesion(s);
    return Object.assign({ sesion: s.id, tipo: 'claude', modelo: nombreModelo(s.modelo), proveedor: 'Claude Code · tu suscripción', esfuerzo: esfuerzo(s.esfuerzo), estado: est,
      ahora: t.ultima, llamadas: RA.calc.eventos(s, 'p').length, actividad: actividad(s, 'p'), uso: usoPlan(), origen: s.origen,
      permiso: p ? { id: p.id, que: (p.herramienta + ' ' + String(p.entrada || '').split('\n')[0]).slice(0, 400), por: p.descripcion || 'Necesita tu aprobación para seguir.' } : null }, extra);
  }
  function tareaNodo(s, t, padre) {
    const d = t.decision || {}, prov = d.prov || '';
    const tipo = prov === 'ollama' ? 'local' : prov === 'opencode' ? 'opencode' : prov === 'hermes' ? 'hermes' : 'nube';
    const lim = /l[ií]mite|429|cuota|rate/i.test(String(t.motivo || t.error || ''));
    const est = t.estado === 'trabajando' ? 'trabajando' : t.estado === 'parche' ? 'permiso' : t.estado === 'pendiente' ? (lim ? 'agotado' : 'espera') : t.estado === 'escalada' ? (lim ? 'agotado' : 'fallido') : t.estado === 'hecho' ? 'terminado' : 'espera';
    const g = tipo === 'local' ? gpu() : null;
    return { id: 'tarea:' + t.id, padre: padre, sesion: s.id, tipo: tipo, modelo: d.modelo || 'Modelo no informado',
      proveedor: tipo === 'local' ? 'Ollama' + (g && g.nombre ? ' · ' + g.nombre : ' · este equipo') : tipo === 'opencode' ? 'OpenCode (gratis)' : tipo === 'hermes' ? 'Hermes Agent' : (prov || 'Nube') + ' (gratis)',
      esfuerzo: 0, estado: est, ahora: est === 'permiso' ? 'Dejó un parche en Cambios: espera tu aprobación' : t.actividad || d.motivo || 'Tarea de Rastro',
      llamadas: null, actividad: [], gpu: g, juego: g ? g.juego : false, uso: lim ? { pct: 100, reinicio: null, fuente: String(prov || 'NUBE').toUpperCase() } : null, tarea: true };
  }
  function datos(o) {
    const tareas = RA.asistentes && RA.asistentes.tareas ? RA.asistentes.tareas() : {};
    if (o.alcance === 'todas') {
      const ahora = D.ahora(), vivas = o.sesiones.filter(s => ['curso', 'espera', 'deteniendo'].indexOf(s.est) >= 0 || (RA.chat && RA.chat.permiso(s.id)) || ahora - (s.tUlt || 0) < DIA)
        .sort((a, b) => (b.tUlt || 0) - (a.tUlt || 0)).slice(0, MAX_TODAS);
      const carpetas = new Map();
      vivas.forEach(s => { const k = s.carpeta || '(sin carpeta)'; if (!carpetas.has(k)) carpetas.set(k, []); carpetas.get(k).push(s); });
      const trabajan = vivas.filter(s => s.est === 'curso').length;
      const out = [{ id: 'lider', lider: true, codigo: 'R', modelo: 'Rastro', tipo: 'rastro', proveedor: 'Coordina tus sesiones', esfuerzo: 0, estado: trabajan ? 'trabajando' : 'espera',
        ahora: vivas.length ? trabajan + (trabajan === 1 ? ' sesión trabaja' : ' sesiones trabajan') + ' en ' + carpetas.size + (carpetas.size === 1 ? ' carpeta' : ' carpetas') : 'Ninguna sesión en las últimas 24 h', llamadas: null, actividad: [], uso: usoPlan(), reparto: carpetas.size + (carpetas.size === 1 ? ' CARPETA' : ' CARPETAS') }];
      carpetas.forEach((lista, k) => {
        const gid = 'g:' + k, nodos = [];
        lista.forEach((s, i) => {
          const n = principal(s, { id: 'ses:' + s.id, padre: gid, codigo: 'A' + (i + 1), modelo: nombreModelo(s.modelo), titulo: s.nombre, hijos: 0 });
          nodos.push(n);
          const t = tareas[s.id];
          if (t && ['trabajando', 'parche', 'pendiente'].indexOf(t.estado) >= 0) nodos.push(Object.assign(tareaNodo(s, t, gid), { codigo: 'A' + (i + 1) + '.T' }));
        });
        out.push({ id: gid, padre: 'lider', tipo: 'grupo', nombre: k.split(/[\\/]/).filter(Boolean).pop() || k, ruta: k, agentes: nodos.length, resumen: nodos.map(n => n.estado) });
        nodos.forEach(n => out.push(n));
      });
      const gh = nodoGithub(vivas.slice(0, MAX_GH), 'ses:');
      if (gh) out.push(gh);
      return out;
    }
    const s = o.sesion;
    if (!s) return [];
    const lider = principal(s, { id: 'lider', lider: true, codigo: 'L', titulo: s.nombre });
    const out = [lider], cod = { p: 'L' };
    const subs = s.agentes.filter(a => a.id !== 'p');
    subs.forEach(a => {
      const padre = a.padre && a.padre !== 'p' && subs.some(x => x.id === a.padre) ? 'ag:' + a.padre : 'lider';
      const hermanos = subs.filter(x => (x.padre && x.padre !== 'p' && subs.some(y => y.id === x.padre) ? 'ag:' + x.padre : 'lider') === padre);
      const c = (padre === 'lider' ? 'A' : cod[a.padre] + '.') + (hermanos.indexOf(a) + 1);
      cod[a.id] = c;
      const evs = RA.calc.eventos(s, a.id), ev = evs[evs.length - 1];
      out.push({ id: 'ag:' + a.id, padre: padre, sesion: s.id, codigo: c, tipo: 'claude', modelo: nombreModelo(a.modelo) + (a.tipo ? ' · ' + a.tipo : ''), proveedor: 'Claude Code · subagente',
        esfuerzo: esfuerzo(a.esfuerzo), estado: estadoAgente(a), ahora: ev ? (VERBO[ev.h] || ev.h) + ' · ' + (ev.res || '') : a.tarea || 'Sin acciones todavía', llamadas: evs.length, actividad: actividad(s, a.id), uso: usoPlan() });
    });
    const t = tareas[s.id];
    if (t && t.estado) out.push(Object.assign(tareaNodo(s, t, 'lider'), { codigo: 'T1' }));
    const gh = nodoGithub([s], 'lider');
    if (gh) out.push(gh);
    out.forEach(n => { n.hijos = out.filter(h => h.padre === n.id).length; });
    const ramas = out.filter(n => n.padre === 'lider' && n.tipo !== 'github').length;
    lider.reparto = ramas + (ramas === 1 ? ' AGENTE' : ' AGENTES');
    return out;
  }

  /* Nodo GitHub (Fase 7): conectado a la sesión elegida o a todas las sesiones. Dice el PR y su CI de cada una
     (lo que ya consultó la tarjeta GitHub; como mucho una consulta por minuto y sesión, el mismo límite). Sus
     aristas van de GitHub a cada sesión: cuando cambia un PR o un CI, el nodo pulsa y la arista de esa sesión se
     anima en ese sentido (de GitHub a la sesión). Sin gh (la maqueta) no hay nodo. */
  function nodoGithub(sesiones, destino) {
    if (!RA.github || !D.pr) return null;
    const candidatas = sesiones.filter(s => s.carpeta);
    candidatas.forEach(s => RA.github.consultar(s));
    // Solo las sesiones que están en un repositorio de GitHub (con repo o con PR): en las demás no aporta nada.
    const con = candidatas.filter(s => { const p = RA.github.de(s.id); return p && (p.pr || p.repo); });
    if (!con.length) return null;
    const prs = con.map(s => ({ s: s, p: RA.github.de(s.id) })).filter(x => x.p && x.p.pr);
    const ci = prs.map(x => RA.github.estadoCi(x.p.pr)), est = ci.indexOf('fallo') >= 0 ? 'fallido' : ci.indexOf('curso') >= 0 || ci.indexOf('pendiente') >= 0 ? 'trabajando' : prs.length ? 'terminado' : 'espera';
    const uno = prs.length === 1 ? prs[0] : null;
    return { id: 'github', tipo: 'github', padre: destino === 'lider' ? 'lider' : null, destinos: destino === 'lider' ? ['lider'] : con.map(s => destino + s.id), codigo: 'GH', modelo: 'GitHub',
      proveedor: 'gh · solo lectura', estado: est, esfuerzo: 0, llamadas: null, actividad: [], uso: null,
      ahora: !prs.length ? (con.length === 1 ? 'Sin pull request' : 'Ninguna de estas sesiones tiene pull request') : uno ? '#' + uno.p.pr.numero + ' · ' + RA.logica.NOMBRE_CI[ci[0]] : prs.length + ' pull requests · ' + ci.filter(c => c === 'fallo').length + ' con fallos',
      prs: prs.map((x, i) => ({ sesion: x.s.id, nombre: x.s.nombre, pr: x.p.pr, ci: ci[i] })) };
  }

  // ---- Disposición radial (como el diseño): ramas alrededor del líder; sub-ramas hacia fuera, en columna ----
  function layout(lista) {
    const pos = { lider: { x: 0, y: 0 } }, hijos = id => lista.filter(n => n.padre === id && n.tipo !== 'github'), l1 = hijos('lider');
    const n = l1.length, R = Math.max(360, n * 70);
    l1.forEach((x, i) => {
      const a = (n === 1 ? 0 : -90 + i * 360 / n) * Math.PI / 180;
      pos[x.id] = { x: Math.round(Math.cos(a) * R * 1.15), y: Math.round(Math.sin(a) * R * 0.92) };
      const hs = hijos(x.id), lado = Math.cos(a) < -0.1 ? -1 : 1;
      hs.forEach((h, j) => {
        pos[h.id] = { x: pos[x.id].x + lado * 290, y: Math.round(pos[x.id].y + (j - (hs.length - 1) / 2) * 66) };
        hijos(h.id).forEach((nieto, k) => { pos[nieto.id] = { x: pos[h.id].x + lado * 250, y: Math.round(pos[h.id].y + (k - (hijos(h.id).length - 1) / 2) * 60) }; });
      });
    });
    // GitHub, abajo a la izquierda de todo lo demás: su arista no cruza las ramas.
    if (lista.some(n => n.tipo === 'github')) { const ks = Object.keys(pos); pos.github = { x: Math.min(-320, ...ks.map(k => pos[k].x)) , y: Math.max(300, ...ks.map(k => pos[k].y + 140)) }; }
    return pos;
  }
  function colapsados(todos) {
    if (V.colapsados && V.alcance === V.o.alcance) return V.colapsados;
    // Con varias carpetas, las que están en calma empiezan plegadas: legible con 1, 5 o 20 agentes.
    const grupos = todos.filter(n => n.tipo === 'grupo');
    V.colapsados = grupos.length > 1 ? grupos.filter(g => !g.resumen.some(e => e === 'trabajando' || e === 'permiso' || e === 'agotado')).map(g => g.id) : [];
    V.alcance = V.o.alcance;
    return V.colapsados;
  }
  function visibles(todos) {
    const col = colapsados(todos), by = {};
    todos.forEach(n => { by[n.id] = n; });
    const oculto = n => { let p = n.padre; while (p && p !== 'lider') { if (col.indexOf(p) >= 0) return true; p = by[p] && by[p].padre; } return false; };
    return todos.filter(n => !oculto(n));
  }

  // ---- Piezas ----
  const glifo = (patron, paso) => G.svg(patron, null, paso || 3);
  const punto = est => el('i', { class: 'ag-pt ' + est, 'aria-hidden': 'true' });
  function nodo(n, o) {
    const sel = V.sel === n.id, dim = V.filtro !== 'todos' && n.tipo !== 'grupo' && n.tipo !== V.filtro;
    if (n.tipo === 'github') {
      return el('button', { type: 'button', class: 'ag-nodo ag-compacto ag-gh ' + n.estado, 'data-ag': 'github', 'aria-label': 'GitHub: ' + n.ahora + '. Abrir el pull request', title: 'Abrir el pull request (pide confirmación)', onclick: () => o.github(n) }, [
        el('span', { class: 'ag-fila' }, [glifo(G.P.GitHub), el('span', { class: 'ag-cod mono' }, 'GH'), el('span', { class: 'ag-mod' }, 'GitHub'), punto(n.estado), el('span', { class: 'sr' }, EST[n.estado])]),
        el('span', { class: 'ag-linea mono' }, n.ahora)
      ]);
    }
    if (n.tipo === 'grupo') {
      const abierto = colapsados([]).indexOf(n.id) < 0, cuenta = {};
      n.resumen.forEach(e => { cuenta[e] = (cuenta[e] || 0) + 1; });
      const partes = [cuenta.trabajando ? cuenta.trabajando + ' trabajando' : '', cuenta.permiso ? cuenta.permiso + ' piden permiso' : '', cuenta.fallido ? cuenta.fallido + ' fallaron' : '', cuenta.agotado ? cuenta.agotado + ' sin uso' : ''].filter(Boolean);
      return el('button', { type: 'button', class: 'ag-nodo ag-grupo', 'aria-expanded': String(abierto), 'data-ag': n.id, title: n.ruta, onclick: () => o.plegar(n.id) }, [
        el('span', { class: 'ag-fila' }, [glifo(G.P[abierto ? 'Abierta' : 'Carpeta']), el('span', { class: 'ag-gcol' }, [el('span', { class: 'ag-gnom' }, n.nombre), el('span', { class: 'ag-gruta mono' }, n.ruta)]), el('span', { class: 'ag-gnum' }, String(n.agentes))]),
        el('span', { class: 'ag-gres', 'aria-hidden': 'true' }, n.resumen.map(punto)),
        el('span', { class: 'ag-gpie mono' }, [el('span', {}, partes.join(' · ') || 'en calma'), el('span', { 'aria-hidden': 'true' }, abierto ? '▾' : '▸')])
      ]);
    }
    const compacto = !!n.compacto;
    const cab = [glifo(G.identicon(n.id), compacto ? 2.4 : 3)];
    const titulo = n.titulo ? n.titulo + ' · ' : '';
    if (compacto) {
      return el('button', { type: 'button', class: 'ag-nodo ag-compacto ' + n.estado + (sel ? ' sel' : '') + (dim ? ' dim' : ''), 'aria-pressed': String(sel), 'data-ag': n.id, title: titulo + n.ahora, onclick: () => o.elegir(n.id) }, [
        el('span', { class: 'ag-fila' }, cab.concat([el('span', { class: 'ag-cod mono' }, n.codigo), el('span', { class: 'ag-mod' }, n.titulo || n.modelo), punto(n.estado), el('span', { class: 'sr' }, EST[n.estado])])),
        el('span', { class: 'ag-linea mono' }, (TIPOS[n.tipo] || n.tipo) + ' · ' + (n.titulo ? n.modelo + ' · ' : '') + n.ahora)
      ]);
    }
    const g = n.gpu;
    return el('div', { class: 'ag-nodo ag-normal ' + n.estado + (sel ? ' sel' : '') + (dim ? ' dim' : ''), 'data-ag': n.id }, [
      el('button', { type: 'button', class: 'ag-tocar', 'aria-pressed': String(sel), 'aria-label': n.codigo + ', ' + n.modelo + ', ' + EST[n.estado] + '. Abrir su actividad', onclick: () => o.elegir(n.id) }),
      el('span', { class: 'ag-fila' }, cab.concat([el('span', { class: 'ag-codp mono' }, n.codigo), el('span', { class: 'hueco' }), punto(n.estado), el('span', { class: 'ag-est ' + n.estado }, EST[n.estado])])),
      el('span', { class: 'ag-mod grande' }, n.modelo),
      el('span', { class: 'ag-fila' }, [el('span', { class: 'ag-tipo mono' }, (TIPOS[n.tipo] || '').toUpperCase()), el('span', { class: 'ag-prov mono' }, n.proveedor),
        el('span', { class: 'ag-esf', title: 'Esfuerzo ' + (ESF[n.esfuerzo] || 'no informado'), 'aria-hidden': 'true' }, [1, 2, 3].map(i => el('i', { class: i <= n.esfuerzo ? 'on' : '' }))), el('span', { class: 'ag-esft mono' }, ESF[n.esfuerzo] || '—')]),
      el('span', { class: 'ag-ahora mono ' + n.estado, title: n.ahora }, n.ahora),
      g ? el('span', { class: 'ag-gpu' }, [
        el('span', { class: 'ag-fila mono' }, [n.juego ? el('span', { class: 'ag-juego' }, 'MODO JUEGO') : null, el('span', { class: 'ag-gput' }, String(g.usado).replace('.', ',') + '/' + g.total + ' GB · tope ' + g.tope + ' %')]),
        el('span', { class: 'ag-dots', 'aria-hidden': 'true' }, Array.from({ length: 16 }, (_, i) => el('i', { class: i < Math.round(g.usado / g.total * 16) ? 'on' : '' })).concat(el('b', { class: 'ag-tope', 'data-tope': Math.round(g.tope / 100 * 16) })))
      ]) : null,
      n.hijos && !n.lider ? el('button', { type: 'button', class: 'ag-hijos', 'aria-expanded': String(colapsados([]).indexOf(n.id) < 0), onclick: e => { e.stopPropagation(); o.plegar(n.id); } },
        [el('span', { class: 'mono' }, colapsados([]).indexOf(n.id) < 0 ? '▾' : '▸'), ' ' + n.hijos + (colapsados([]).indexOf(n.id) < 0 ? ' subagentes' : ' subagentes ocultos')]) : null
    ]);
  }
  // Mascota del líder: la cabeza de 9×11 puntos del diseño, con la punta de la antena en rojo.
  function mascota() {
    const filas = ['....#....', '....#....', '..#####..', '.#.....#.'].concat(['.......', '..#..#.', '..#..#.', '.......', '...##..'].map(f => '#' + f + '#'), ['.#.....#.', '..#####..']);
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('class', 'ag-mascota'); s.setAttribute('viewBox', '0 0 63 77'); s.setAttribute('aria-hidden', 'true');
    filas.forEach((f, r) => f.split('').forEach((ch, x) => { if (ch !== '#') return; const c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', 3.5 + 7 * x); c.setAttribute('cy', 3.5 + 7 * r); c.setAttribute('r', 2.5); if (!r) c.setAttribute('class', 'punta'); s.appendChild(c); }));
    return s;
  }
  function lider(n, o) {
    return el('div', { class: 'ag-lider' + (V.sel === 'lider' ? ' sel' : ''), 'data-ag': 'lider' }, [
      el('button', { type: 'button', class: 'ag-tocar', 'aria-pressed': String(V.sel === 'lider'), 'aria-label': 'Modelo líder: ' + n.modelo + ', ' + EST[n.estado], onclick: () => o.elegir('lider') }),
      mascota(),
      el('div', { class: 'ag-bocadillo' }, [
        el('span', { class: 'ag-fila' }, [el('span', { class: 'ag-mini mono' }, 'LÍDER'), el('span', { class: 'ag-chip mono' }, [punto(n.estado), EST[n.estado].replace('✓ ', '').toUpperCase()])]),
        el('span', { class: 'ag-mod grande' }, n.modelo),
        el('span', { class: 'ag-ahora mono' }, n.titulo ? n.titulo + ' · ' + n.ahora : n.ahora),
        el('span', { class: 'ag-mini mono' }, [n.tipo === 'claude' ? 'CLAUDE · ESFUERZO ' + (ESF[n.esfuerzo] || 'NO INFORMADO').toUpperCase() + ' · ' : '', n.reparto || ''].join(''))
      ])
    ]);
  }
  function arista(svg, a, b, n) {
    const mx = (a.x + b.x) / 2, p = document.createElementNS(NS, 'path');
    p.setAttribute('d', 'M' + a.x + ' ' + a.y + ' C' + mx + ' ' + a.y + ' ' + mx + ' ' + b.y + ' ' + b.x + ' ' + b.y);
    const dim = V.filtro !== 'todos' && n.tipo !== 'grupo' && n.tipo !== V.filtro;
    p.setAttribute('class', 'ag-arista t-' + n.tipo + ' e-' + (n.estado || 'grupo') + (dim ? ' dim' : ''));
    svg.appendChild(p);
  }

  // ---- Panel de actividad ----
  function panel(n, o) {
    if (!n) return null;
    const accion = (texto, clase, fn, extra) => el('button', Object.assign({ type: 'button', class: 'ag-btn ' + (clase || ''), onclick: fn }, extra || {}), texto);
    const local = n.tipo === 'local' && n.gpu, u = n.uso;
    let uso = null;
    if (local) {
      const g = n.gpu, k = Math.round(g.usado / g.total * 20), tope = Math.round(g.tope / 5);
      uso = el('div', { class: 'ag-caja' }, [el('div', { class: 'ag-dentro' }, [
        el('div', { class: 'ag-fila' }, [el('span', { class: 'ag-mini mono' }, 'VRAM'), el('span', { class: 'hueco' }), el('span', { class: 'ag-chip mono aviso' }, 'TOPE ' + g.tope + ' %')]),
        el('div', { class: 'ag-cifra' }, [el('b', {}, String(g.usado).replace('.', ',')), el('small', { class: 'mono' }, '/ ' + g.total + ' GB')]),
        el('div', { class: 'ag-dots grande', role: 'img', 'aria-label': 'VRAM: ' + g.usado + ' de ' + g.total + ' GB; tope ' + g.tope + ' %' }, Array.from({ length: 20 }, (_, i) => el('i', { class: i < k ? 'on' : '' })).concat(el('b', { class: 'ag-tope', 'data-tope20': tope }))),
        el('span', { class: 'ag-nota mono' }, 'No pasará del tope aunque el encargo lo pida.'),
        el('div', { class: 'ag-fila ag-juegof' }, [el('span', { class: 'ag-gcol' }, [el('span', {}, 'Modo juego'), el('span', { class: 'ag-nota' }, n.juego ? 'En pausa mientras juegas; libera la GPU.' : 'Trabaja con la GPU hasta el tope.')]),
          accion(n.juego ? 'Sí' : 'No', 'ag-switch' + (n.juego ? ' on' : ''), () => o.juego(!n.juego), { role: 'switch', 'aria-checked': String(!!n.juego), 'aria-label': 'Modo juego' })])
      ]), el('div', { class: 'ag-pie' }, 'GPU y memoria')]);
    } else if (u) {
      const pct = u.pct, rojo = pct != null && pct >= 90, k = pct == null ? 0 : Math.round(pct / 5);
      uso = el('div', { class: 'ag-caja' }, [el('div', { class: 'ag-dentro' }, [
        el('div', { class: 'ag-fila' }, [el('span', { class: 'ag-mini mono' }, 'SESIÓN'), el('span', { class: 'hueco' }), el('span', { class: 'ag-chip mono' }, u.fuente)]),
        el('div', { class: 'ag-cifra' + (rojo ? ' rojo' : '') }, pct != null ? [el('b', {}, String(pct)), el('small', { class: 'mono' }, '%')] : [el('small', { class: 'mono' }, 'Sin porcentaje: no hay fuente oficial')]),
        el('div', { class: 'ag-dots grande' + (rojo ? ' rojo' : ''), role: 'img', 'aria-label': pct != null ? pct + ' por ciento usado' : 'sin porcentaje' }, Array.from({ length: 20 }, (_, i) => el('i', { class: i < k ? 'on' : '' }))),
        el('span', { class: 'ag-nota mono' }, u.reinicio ? 'Se restablece ' + u.reinicio.toLocaleString('es', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : 'Reinicio no informado')
      ]), el('div', { class: 'ag-pie' }, n.tipo === 'nube' ? 'Cuota de ' + n.proveedor : 'Uso de tu plan')]);
    }
    const s = n.sesion && RA.calc.sesion(n.sesion), puedeDetener = s && s.origen === 'app' && ['curso', 'espera'].indexOf(s.est) >= 0;
    const armado = V.armado === n.id;
    return el('aside', { class: 'ag-panel', 'aria-label': 'Actividad en vivo de ' + n.modelo }, [
      el('div', { class: 'ag-fila' }, [el('span', { class: 'ag-mini mono' }, 'ACTIVIDAD EN VIVO'), el('span', { class: 'hueco' }), el('button', { type: 'button', class: 'icono', 'aria-label': 'Cerrar panel', onclick: o.cerrar }, el('span', { class: 'mono' }, '✕'))]),
      el('div', { class: 'ag-caja' }, [el('div', { class: 'ag-dentro' }, [
        el('div', { class: 'ag-fila' }, [n.lider && n.tipo !== 'rastro' ? glifo(G.P.Principal, 4) : glifo(G.identicon(n.id), 4), el('span', { class: 'ag-gcol' }, [el('span', { class: 'ag-mod grande' }, n.modelo), el('span', { class: 'ag-nota mono' }, n.codigo + ' · ' + n.proveedor)])]),
        el('div', { class: 'ag-fila envolver' }, [el('span', { class: 'ag-chip mono' }, (TIPOS[n.tipo] || 'Rastro').toUpperCase()), el('span', { class: 'ag-chip mono' }, 'ESFUERZO ' + (ESF[n.esfuerzo] || 'NO INFORMADO').toUpperCase()), el('span', { class: 'ag-chip mono ' + n.estado }, [punto(n.estado), EST[n.estado].replace('✓ ', '').toUpperCase()])]),
        el('p', { class: 'ag-ahora mono ' + n.estado }, n.titulo ? n.titulo + ' · ' + n.ahora : n.ahora)
      ]), el('div', { class: 'ag-pie' }, n.lider ? 'Modelo líder' : 'Agente ' + n.codigo)]),
      n.estado === 'permiso' && n.permiso ? el('div', { class: 'ag-aviso ambar', role: 'group', 'aria-label': 'Permiso pendiente' }, [
        el('div', { class: 'ag-fila' }, [el('span', { class: 'ag-excl' }, '!'), el('span', {}, 'Pide permiso para')]),
        el('code', { class: 'ag-code' }, n.permiso.que),
        el('span', { class: 'ag-nota' }, n.permiso.por),
        el('div', { class: 'ag-fila envolver' }, [accion('Rechazar', '', () => o.permiso(n, false), { id: 'ag-rechazar' }), accion('Aprobar', 'primario', () => o.permiso(n, true), { id: 'ag-aprobar' })])
      ]) : n.estado === 'permiso' && n.tarea ? el('div', { class: 'ag-aviso ambar' }, [el('span', {}, 'Dejó un parche que espera tu aprobación.'), el('div', { class: 'ag-fila' }, [accion('Ver en Cambios', 'primario', () => RA.app.ir('cambios'))])]) : null,
      n.estado === 'agotado' ? el('div', { class: 'ag-aviso rojo' }, [
        el('span', {}, 'Se agotó el uso de ' + n.proveedor),
        el('span', { class: 'ag-nota' }, 'Sus tareas esperan' + (u && u.reinicio ? '. Se restablece ' + u.reinicio.toLocaleString('es', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '') + '; mientras tanto puedes pasarlas al modelo local.'),
        el('div', { class: 'ag-fila envolver' }, [accion('Pasar al modelo local', 'primario', o.local), accion('Esperar', '', o.cerrar)])
      ]) : null,
      uso,
      el('div', { class: 'ag-caja' }, [el('div', { class: 'ag-dentro ag-pasos' }, n.actividad && n.actividad.length ? n.actividad.map(([h, txt, dur, est]) => el('div', { class: 'ag-paso ' + est }, [
        glifo(G.deHerramienta(h), 2.6), el('span', { class: 'ag-verbo' }, VERBO[h] || h), el('span', { class: 'ag-ptxt mono', title: txt }, txt), el('span', { class: 'ag-pdur mono' }, dur), punto(est === 'curso' ? 'trabajando' : est === 'error' ? 'fallido' : 'terminado')
      ])).concat(n.estado === 'trabajando' ? [el('span', { class: 'ag-cursor', 'aria-hidden': 'true' })] : []) : [el('span', { class: 'ag-mini mono ag-vacio' }, n.tarea ? 'RASTRO NO RECIBE SUS PASOS UNO A UNO' : 'SIN ACTIVIDAD TODAVÍA')]),
        el('div', { class: 'ag-pie' }, ['Últimas acciones', el('span', { class: 'mono ag-nota' }, n.llamadas != null ? n.llamadas + (n.llamadas === 1 ? ' llamada' : ' llamadas') : '')])]),
      el('div', { class: 'ag-fila ag-acciones' }, [
        puedeDetener ? accion(armado ? '¿Seguro? Pulsa otra vez' : 'Detener', armado ? 'peligro' : '', () => o.detener(n)) : null,
        n.sesion ? accion('Abrir en Chat ↗', '', () => o.abrirChat(n.sesion)) : null
      ])
    ]);
  }

  // ---- Pintado ----
  function pintar(caja, o) {
    V.caja = caja; V.o = o;
    const todos = datos(o), by = {};
    todos.forEach(n => { by[n.id] = n; });
    if (V.sel && !by[V.sel]) V.sel = null;
    const lista = visibles(todos), pos = layout(lista);
    const compacto = n => o.alcance === 'todas' || (n.padre && n.padre !== 'lider');
    lista.forEach(n => { n.compacto = n.tipo !== 'grupo' && !n.lider && compacto(n); });
    const agentes = todos.filter(n => !n.lider && n.tipo !== 'grupo' && n.tipo !== 'github');
    const firma = JSON.stringify([o.alcance, V.filtro, V.sel, V.colapsados, V.armado, todos, continuidad() && continuidad().activo]);
    if (o.contexto) o.contexto.textContent = o.alcance === 'todas' ? 'Todas las sesiones · ' + todos.filter(n => n.tipo === 'grupo').length + ' carpetas · ' + agentes.length + ' agentes' : o.sesion ? o.sesion.nombre + (o.sesion.carpeta ? ' · ' + o.sesion.carpeta : '') : '';
    if (firma === V.firma && caja.firstChild) return;
    V.firma = firma;
    const acciones = {
      elegir: id => { if (V.movido) return; V.sel = id; V.armado = null; repintar(); },
      plegar: id => { if (V.movido) return; const c = colapsados(todos); V.colapsados = c.indexOf(id) >= 0 ? c.filter(x => x !== id) : c.concat(id); repintar(); },
      cerrar: () => { V.sel = null; repintar(); },
      permiso: (n, si) => Promise.resolve(D.chatPermiso(n.sesion, n.permiso.id, si)).then(r => { if (r && r.error) ui.decir(r.error, 'error'); else ui.decir(si ? 'Permiso aprobado.' : 'Permiso rechazado.', 'ok'); D.emitir(); }),
      local: pasarALocal,
      juego: v => P && P.recursosJuego ? P.recursosJuego(v).then(() => ui.decir(v ? 'Modo juego activado: la IA local se pausa.' : 'Modo juego desactivado.', 'ok')) : ui.decir('El modo juego se cambia en la app de escritorio.'),
      detener: n => {
        if (V.armado !== n.id) { V.armado = n.id; repintar(); clearTimeout(V.tArmado); V.tArmado = setTimeout(() => { V.armado = null; repintar(); }, 4000); return; }
        V.armado = null; Promise.resolve(D.detener(n.sesion)).then(r => { ui.decir(r && r.error ? r.error : 'Sesión detenida.', r && r.error ? 'error' : 'ok'); repintar(); });
      },
      abrirChat: id => o.alAbrirChat && o.alAbrirChat(id),
      // Abrir el PR (con la confirmación de la tarjeta GitHub). Varios: el de la sesión elegida o el más reciente.
      github: n => {
        if (V.movido) return;
        if (!n.prs.length) return ui.decir(n.ahora + '. No hay ningún pull request que abrir.', 'atencion');
        const x = n.prs.find(p => p.sesion === RA.app.sel.sesion) || n.prs[0];
        RA.github.abrirPr(x.pr, caja.querySelector('[data-ag="github"]'));
      }
    };
    // Aviso rojo: nube o plan agotados.
    const agot = agentes.concat(by.lider && by.lider.tipo !== 'rastro' ? [by.lider] : []).filter(n => n.estado === 'agotado');
    const cont = continuidad();
    const aviso = agot.length ? el('div', { class: 'ag-alerta', role: 'alert' }, [
      el('span', { class: 'ag-excl rojo' }, '!'),
      el('span', { class: 'ag-gcol' }, [el('span', {}, 'Se agotó el uso de ' + (agot[0].tipo === 'nube' ? 'la nube · ' : '') + agot[0].proveedor + ' (' + agot[0].modelo + ')'),
        el('span', { class: 'ag-nota mono' }, (agot.length > 1 ? agot.length + ' agentes sin cuota' : 'Sus tareas esperan') + (agot[0].uso && agot[0].uso.reinicio ? ' · se restablece ' + agot[0].uso.reinicio.toLocaleString('es', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '') + (cont && cont.activo ? ' · modo local activo' : ''))]),
      el('button', { type: 'button', class: 'ag-btn', onclick: () => { const n = agot[0]; V.colapsados = colapsados(todos).filter(x => x !== n.padre); V.sel = n.id; repintar(); } }, 'Ver nodo'),
      cont && cont.activo ? el('span', { class: 'ag-chip mono' }, 'MODO LOCAL ACTIVO') : el('button', { type: 'button', class: 'ag-btn primario', onclick: pasarALocal }, 'Pasar a local')
    ]) : null;
    // Lienzo
    const mundo = el('div', { class: 'ag-mundo' });
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'ag-aristas'); svg.setAttribute('width', '1'); svg.setAttribute('height', '1'); svg.setAttribute('aria-hidden', 'true');
    lista.filter(n => n.padre && pos[n.padre] && pos[n.id] && n.tipo !== 'github').forEach(n => arista(svg, pos[n.padre], pos[n.id], n));
    // GitHub: una arista hacia cada sesión, en el sentido de los eventos (de GitHub a la sesión).
    const gh = lista.find(n => n.tipo === 'github');
    if (gh && pos.github) gh.destinos.filter(d => pos[d]).forEach(d => { arista(svg, pos.github, pos[d], gh); svg.lastChild.setAttribute('data-gh', d === 'lider' ? gh.prs.map(x => x.sesion)[0] || '' : d.replace(/^ses:/, '')); });
    mundo.appendChild(svg);
    if (by.lider) mundo.appendChild(lider(by.lider, acciones));
    lista.filter(n => !n.lider && pos[n.id]).forEach(n => {
      const w = el('div', { class: 'ag-pos' }, nodo(n, acciones));
      w.style.left = pos[n.id].x + 'px'; w.style.top = pos[n.id].y + 'px';
      mundo.appendChild(w);
    });
    const TIP = [['todos', 'Todos'], ['claude', 'Claude'], ['local', 'Local'], ['nube', 'Nube'], ['opencode', 'OpenCode'], ['hermes', 'Hermes']];
    const filtros = el('div', { class: 'ag-filtros', role: 'radiogroup', 'aria-label': 'Filtrar por tipo' }, TIP.map(([id, label]) => {
      const n = id === 'todos' ? agentes.length : agentes.filter(a => a.tipo === id).length;
      if (!n && id !== 'todos') return null;
      return el('button', { type: 'button', role: 'radio', 'aria-checked': String(V.filtro === id), class: 'ag-filtro', onclick: () => { V.filtro = id; repintar(); } }, [label, el('span', { class: 'mono' }, String(n))]);
    }));
    const leyenda = el('div', { class: 'ag-leyenda' }, [el('span', { class: 'ag-mini mono' }, 'TRAZO = TIPO · COLOR = ESTADO')].concat([['claude', 'Claude'], ['local', 'Local'], ['nube', 'Nube · OpenRouter'], ['opencode', 'OpenCode'], ['hermes', 'Hermes']].concat(gh ? [['github', 'GitHub']] : []).map(([t, l]) => {
      const s = document.createElementNS(NS, 'svg'); s.setAttribute('width', '26'); s.setAttribute('height', '6'); s.setAttribute('aria-hidden', 'true');
      const p = document.createElementNS(NS, 'path'); p.setAttribute('d', 'M2 3H24'); p.setAttribute('class', 'ag-arista t-' + t + ' e-leyenda'); s.appendChild(p);
      return el('span', { class: 'ag-ley' }, [s, l]);
    })));
    const zoom = el('div', { class: 'ag-zoom' }, [
      el('button', { type: 'button', class: 'ag-zb', 'aria-label': 'Alejar', onclick: () => zoomEn(1 / 1.2) }, '−'),
      el('span', { class: 'ag-zt mono', 'aria-live': 'off' }, Math.round(V.z * 100) + ' %'),
      el('button', { type: 'button', class: 'ag-zb', 'aria-label': 'Acercar', onclick: () => zoomEn(1.2) }, '+'),
      el('button', { type: 'button', class: 'ag-btn plano', onclick: encajar }, 'Encajar')
    ]);
    [filtros, leyenda, zoom].forEach(x => x.addEventListener('pointerdown', e => e.stopPropagation()));
    const lienzo = el('div', { class: 'ag-lienzo', title: 'Arrastra el fondo para moverte; usa la rueda para el zoom' }, [mundo, filtros, leyenda, zoom]);
    lienzo.addEventListener('pointerdown', abajo);
    lienzo.addEventListener('wheel', rueda, { passive: false });
    const vacio = !by.lider ? el('p', { class: 'note ag-sin' }, 'Elige una sesión en la barra lateral, o pasa a «Todas las sesiones».') : null;
    ui.pintar(caja, [aviso, el('div', { class: 'ag-cuerpo' }, [vacio || lienzo, V.sel && by[V.sel] ? panel(by[V.sel], acciones) : null])]);
    // Marca del tope en los medidores de puntos (16 puntos de 10 px en la tarjeta; 20 de 12 px en el panel).
    caja.querySelectorAll('.ag-tope').forEach(m => { m.style.left = m.dataset.tope20 != null ? (m.dataset.tope20 * 12 - 3.5) + 'px' : (m.dataset.tope * 10 - 2) + 'px'; });
    V.mundo = mundo; V.lienzo = lienzo; V.lista = lista; V.pos = pos;
    aplicar();
    pulsoGithub();
    if (V.encajar) { V.encajar = false; requestAnimationFrame(encajar); }
  }
  function repintar() { V.firma = ''; if (V.caja && V.o) pintar(V.caja, V.o); }
  // Cuando la tarjeta GitHub ve que cambió un PR o un CI: el nodo pulsa y la arista de esa sesión se anima.
  const quieto = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('modo-juego');
  function pulsoGithub() {
    // js/github-card.js se carga después que este archivo: el oyente se registra en el primer pintado.
    if (!V.oyenteGh && RA.github && RA.github.alCambiar) { V.oyenteGh = true; RA.github.alCambiar(ev => { V.pulso = { sesion: ev.sesion, t: Date.now() }; if (V.caja && V.caja.isConnected) repintar(); }); }
    const p = V.pulso; V.pulso = null;
    if (!p || Date.now() - p.t > 2000 || !V.caja) return;
    const nodoGh = V.caja.querySelector('[data-ag="github"]');
    if (!nodoGh) return;
    nodoGh.classList.add('ag-gh-cambio');
    if (quieto()) return;
    if (nodoGh.animate) nodoGh.animate([{ boxShadow: '0 0 0 0 var(--sel)' }, { boxShadow: '0 0 0 8px transparent' }], { duration: 700, easing: 'ease-out' });
    const a = V.caja.querySelector('.ag-arista[data-gh="' + CSS.escape(p.sesion) + '"]') || V.caja.querySelector('.ag-arista[data-gh]');
    if (a && a.animate && a.getTotalLength) {
      const L = Math.max(1, a.getTotalLength());
      a.style.strokeDasharray = '14 ' + L;
      a.animate([{ strokeDashoffset: 0 }, { strokeDashoffset: -L }], { duration: 900, easing: 'ease-in-out' }).onfinish = () => { a.style.strokeDasharray = ''; };
    }
  }
  function pasarALocal() {
    if (!P || !P.continuidadManual) return ui.decir('El modo local se activa en la app de escritorio.');
    P.continuidadManual(true).then(r => { if (r && r.error) return ui.decir(r.error, 'error'); if (RA.fase4) RA.fase4.recibir({ continuidad: r }); ui.decir('Modo continuidad activo: lo que no necesita a Claude va a los modelos locales y gratuitos; lo demás espera en Pendientes para Claude.', 'ok'); repintar(); });
  }

  // ---- Movimiento: arrastre, rueda, botones y Encajar ----
  function aplicar() {
    if (!V.mundo) return;
    V.mundo.style.transform = 'translate(' + V.px + 'px, ' + V.py + 'px) scale(' + V.z + ')';
    V.lienzo.style.backgroundSize = (20 * V.z) + 'px ' + (20 * V.z) + 'px';
    V.lienzo.style.backgroundPosition = 'calc(50% + ' + V.px + 'px) calc(50% + ' + V.py + 'px)';
    const t = V.lienzo.querySelector('.ag-zt'); if (t) t.textContent = Math.round(V.z * 100) + ' %';
  }
  function zoomEn(f, mx, my) {
    const z2 = Math.max(0.25, Math.min(2, V.z * f)), k = z2 / V.z;
    mx = mx || 0; my = my || 0;
    V.px = mx - (mx - V.px) * k; V.py = my - (my - V.py) * k; V.z = z2;
    aplicar();
  }
  function rueda(e) { e.preventDefault(); const r = V.lienzo.getBoundingClientRect(); zoomEn(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2); }
  function abajo(e) {
    if (e.button !== 0 || e.target.closest('button')) return;
    V.drag = { x: e.clientX, y: e.clientY, px: V.px, py: V.py, movido: false };
    V.lienzo.classList.add('agarrado');
  }
  addEventListener('pointermove', e => {
    const d = V.drag; if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.movido = true;
    if (d.movido) { V.px = d.px + dx; V.py = d.py + dy; aplicar(); }
  });
  addEventListener('pointerup', () => {
    const d = V.drag; V.drag = null;
    if (V.lienzo) V.lienzo.classList.remove('agarrado');
    if (d && d.movido) { V.movido = true; setTimeout(() => { V.movido = false; }, 0); }
  });
  function encajar() {
    const l = V.lienzo; if (!l || !V.lista) return;
    if (l.clientWidth < 200 || l.clientHeight < 200) { if ((V.reintentos = (V.reintentos || 0) + 1) < 30) requestAnimationFrame(encajar); return; }
    V.reintentos = 0;
    let x0 = -260, x1 = 260, y0 = -110, y1 = 110;
    V.lista.forEach(n => { const p = V.pos[n.id]; if (!p || n.lider) return; const w = 125, h = n.tipo === 'grupo' ? 60 : n.compacto ? 32 : 95; x0 = Math.min(x0, p.x - w); x1 = Math.max(x1, p.x + w); y0 = Math.min(y0, p.y - h); y1 = Math.max(y1, p.y + h); });
    const W = l.clientWidth - 80, H = l.clientHeight - 160;
    V.z = Math.max(0.3, Math.min(1.1, W / (x1 - x0), H / (y1 - y0)));
    V.px = -((x0 + x1) / 2) * V.z; V.py = -((y0 + y1) / 2) * V.z + 10;
    aplicar();
  }

  RA.mapaOrq = { pintar: pintar, datos: datos, layout: layout, encajarPronto: () => { V.encajar = true; V.colapsados = null; V.sel = null; }, estado: () => V };
})(window.RA = window.RA || {});
