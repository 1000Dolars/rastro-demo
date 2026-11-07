/* Nueva sesión en una sola pantalla (sustituye al asistente de cuatro pasos), como la de Claude Code Desktop:
   - Centro: "Elegir entorno": Este equipo (carpeta existente o nueva dentro de la raíz), Clonar repo de GitHub y
     Crear repo nuevo en GitHub. Debajo, la caja del encargo y Enviar.
   - Barra inferior de la caja: carpeta, Worktree, permisos (con "Sin permisos") y modelo con su esfuerzo.
   Clonar y Crear usan `gh` en el proceso principal, siempre tras una confirmación que enseña el destino y la orden
   en texto plano. Crear es privado por defecto; público pide una segunda confirmación. Nunca se hace push. */
(function (RA) {
  'use strict';

  const ui = RA.ui, el = ui.el, $ = ui.$, D = RA.datos, C = RA.calc, L = RA.logica;
  const ENTORNOS = [
    ['equipo', 'Este equipo', 'Una carpeta existente o una nueva dentro de tu carpeta de proyectos.'],
    ['clonar', 'Clonar repo de GitHub', 'Elige uno de tus repositorios y se clona en tu carpeta de proyectos.'],
    ['crear', 'Crear repo nuevo en GitHub', 'Privado por defecto. Se puede clonar en tu equipo para trabajar en él.'],
    // Sesiones SSH, fase 1 (docs/REDISENO-ABRIL.md, punto 4): Claude Code en otra máquina con tu ssh.
    ['ssh', 'Equipo remoto (SSH)', 'Claude Code en otra máquina, con tu ssh: conversación, archivos (solo lectura) y terminal allí.']
  ];
  // Del selector de permisos a --permission-mode (los cinco de Claude Code).
  const MODO_DE = { estricto: 'default', ediciones: 'acceptEdits', plan: 'plan', auto: 'auto', sinpermisos: 'bypassPermissions' };
  // Las mismas reglas que valida el proceso principal (services/ssh.js), para decirlo mientras se escribe.
  const PARTE = '[A-Za-z0-9_][A-Za-z0-9._-]*', HOST = new RegExp('^(' + PARTE + '@)?' + PARTE + '$');
  const malHost = h => !h.trim() ? 'Escribe el equipo: usuario@equipo o un nombre de tu ~/.ssh/config.' : !HOST.test(h.trim()) ? 'Equipo no válido: usuario@equipo o un nombre de tu ~/.ssh/config, sin espacios ni guion al principio.' : '';
  const malCarpeta = c => !c.trim() ? 'Escribe la carpeta del proyecto en el equipo remoto.' : !/^(~|~\/.*|\/.*)$/.test(c.trim()) || /[\0-\x1f]/.test(c) ? 'La carpeta empieza por / o por ~/ (la carpeta personal del equipo remoto).' : '';
  const PERM = [['estricto', 'Manual'], ['ediciones', 'Aceptar ediciones'], ['plan', 'Plan'], ['auto', 'Auto'], ['sinpermisos', 'Sin permisos']];
  const DESDE_AJUSTES = { default: 'estricto', acceptEdits: 'ediciones', plan: 'plan', auto: 'auto', bypassPermissions: 'sinpermisos' };
  const ESF = [['', 'Por defecto'], ['low', 'Bajo'], ['medium', 'Medio'], ['high', 'Alto'], ['xhigh', 'Muy alto'], ['max', 'Máximo']];
  let w = null, turno = 0, tComprobar = null;

  const unir = (a, b) => D.so.une(String(a || '').trim(), b);
  const slug = t => String(t || '').normalize('NFD').replace(/\p{M}/gu, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'sesion';

  function nuevo(op) {
    const A = D.ajustes;
    return {
      entorno: 'equipo', modo: 'existente', ruta: op.carpeta || '', padre: A.raiz, nombre: '', info: null, comprobando: false,
      gh: null, repos: null, filtro: '', repo: '', repoNombre: '', repoDesc: '', privado: true, clonarLocal: true,
      encargo: op.encargo || '', refs: [], fichas: [], worktree: false, permisos: DESDE_AJUSTES[A.permisosDefecto] || 'estricto',
      modelo: A.modelos.codigo, esfuerzo: '', error: '', lanzando: false,
      host: '', carpetaRemota: '', prueba: null, probando: false
    };
  }

  // ---- Carpeta (Este equipo): comprobación en el proceso principal mientras se escribe ----
  const objetivo = () => w.modo === 'nueva' ? unir(w.padre, w.nombre) : w.ruta.trim();
  function estadoCarpeta() {
    const i = w.info;
    if (w.modo === 'existente' && !w.ruta.trim()) return { error: 'Elige una carpeta o pega su ruta.', espera: true };
    if (w.modo === 'nueva' && !w.nombre) return { error: 'Escribe el nombre de la carpeta nueva.', espera: true };
    if (w.modo === 'nueva') { const e = RA.carpeta.validar(w.nombre, []); if (e) return { error: e }; }
    if (w.comprobando || !i) return { error: 'Comprobando la carpeta…', espera: true };
    if (i.error) return { error: i.error };
    if (w.modo === 'existente' && !i.existe) return { error: 'No existe esa carpeta.' };
    if (w.modo === 'nueva' && i.existe) return { error: 'Ya existe una carpeta con ese nombre. No se pisa: elige otro nombre o ábrela como carpeta existente.' };
    return { error: i.bloqueo || '' };
  }
  function comprobar(ya) {
    const t = ++turno;
    clearTimeout(tComprobar);
    w.comprobando = true; w.info = null;
    revisar();
    tComprobar = setTimeout(() => {
      const r = objetivo();
      Promise.resolve(r && D.infoCarpeta ? D.infoCarpeta(r) : null).then(i => { if (t !== turno || !w) return; w.info = i; w.comprobando = false; revisar(); });
    }, ya ? 0 : 200);
  }

  // Carpeta que usará la sesión, para el chip de la barra inferior.
  function carpetaPrevista() {
    if (w.entorno === 'ssh') return w.host.trim() && w.carpetaRemota.trim() ? w.host.trim() + ':' + (w.prueba && w.prueba.ok ? w.prueba.ruta : w.carpetaRemota.trim()) : '';
    if (w.entorno === 'clonar') return w.repo ? unir(D.ajustes.raiz, w.repo.split('/').pop()) : '';
    if (w.entorno === 'crear') return w.clonarLocal && w.repoNombre && !L.nombreRepo(w.repoNombre) ? unir(D.ajustes.raiz, w.repoNombre) : '';
    return w.info && w.info.ruta ? w.info.ruta : objetivo();
  }
  // Qué falta para poder enviar ('' si nada).
  function falta() {
    if (w.entorno === 'equipo') { const e = estadoCarpeta(); if (e.error) return e.error; }
    if (w.entorno === 'ssh') { if (!D.ssh) return 'Las sesiones SSH se crean desde la app de escritorio.'; const e = malHost(w.host) || malCarpeta(w.carpetaRemota); if (e) return e; if (w.probando) return 'Comprobando el equipo remoto…'; }
    if (w.entorno === 'clonar' && !w.repo) return 'Elige el repositorio que quieres clonar.';
    if (w.entorno === 'crear') { const e = L.nombreRepo(w.repoNombre); if (e) return e; }
    if (w.entorno !== 'crear' || w.clonarLocal) { if (!w.encargo.trim()) return 'Escribe el encargo: qué quieres que haga Claude.'; }
    if ((w.entorno === 'clonar' || w.entorno === 'crear') && !D.gh) return 'Clonar y crear repositorios se hace con GitHub desde la app de escritorio.';
    if ((w.entorno === 'clonar' || w.entorno === 'crear') && w.gh && w.gh.motivo) return w.gh.motivo;
    return '';
  }

  // ---- GitHub: estado de gh y lista de repositorios ----
  function cargarGh() {
    if (!D.gh || w.gh) return;
    w.gh = { cargando: true };
    Promise.resolve(D.gh.estado()).then(e => {
      if (!w) return;
      w.gh = e || { motivo: 'No se pudo comprobar GitHub.' };
      if (e && !e.sesion && !e.motivo) w.gh.motivo = 'La CLI de GitHub no tiene la sesión iniciada. Abre una terminal y ejecuta: gh auth login';
      const aj = $('#aj-gh'); if (aj) aj.textContent = e && e.sesion ? 'iniciada' + (e.usuario ? ' como ' + e.usuario : '') : (w.gh.motivo || 'sin sesión');
      if (e && e.sesion && w.entorno === 'clonar') cargarRepos(); else pintarEntorno();
    });
  }
  function cargarRepos() {
    if (!D.gh || w.repos) return pintarEntorno();
    w.repos = { cargando: true };
    pintarEntorno();
    Promise.resolve(D.gh.repos()).then(r => { if (!w) return; w.repos = r && r.repos ? { lista: r.repos } : { error: (r && r.error) || 'No se pudo listar tus repositorios.' }; pintarEntorno(); });
  }

  // ---- Pintado ----
  const campo = (id, nombre, control, ayuda) => el('div', { class: 'campo' }, [el('label', { class: 'label', for: id }, nombre), control, ayuda ? el('p', { class: 'note' }, ayuda) : null]);
  function pintarEntorno() {
    const caja = $('#ns-detalle');
    if (!caja || !w) return;
    const foco = document.activeElement && caja.contains(document.activeElement) ? document.activeElement.id : null;
    let hijos = [];
    if (w.entorno === 'equipo') {
      const modo = el('div', { id: 'ns-modo' });
      ui.segmentado(modo, [['existente', 'Carpeta existente'], ['nueva', 'Carpeta nueva']], w.modo, v => { if (v === w.modo) return; w.modo = v; pintarEntorno(); comprobar(true); }, 'Qué carpeta usar');
      const texto = (id, valor, clave, extra) => { const i = el('input', Object.assign({ id: id, class: 'input', type: 'text', value: valor, autocomplete: 'off', spellcheck: 'false', 'aria-describedby': 'ns-msg ns-destino' }, extra || {})); i.addEventListener('input', () => { w[clave] = i.value; comprobar(); pintarBarra(); }); return i; };
      const elegir = el('button', { type: 'button', class: 'btn', id: 'ns-elegir', onclick: elegirCarpeta }, 'Elegir carpeta…');
      hijos = [modo].concat(w.modo === 'existente' ? [
        campo('ns-ruta', 'Carpeta del proyecto', el('div', { class: 'ruta-campo' }, [texto('ns-ruta', w.ruta, 'ruta'), elegir])),
        D.ajustes.recientes.length ? el('div', { class: 'campo' }, [el('span', { class: 'label', id: 'ns-rec-t' }, 'Carpetas recientes'), el('ul', { class: 'lista recientes', 'aria-labelledby': 'ns-rec-t' }, D.ajustes.recientes.slice(0, 5).map(r => el('li', {}, el('button', { type: 'button', class: 'enlace', 'data-reciente': r, onclick: () => { w.ruta = r; pintarEntorno(); comprobar(true); } }, ui.ruta(r)))))]) : null
      ] : [
        campo('ns-nombre', 'Nombre de la carpeta nueva', texto('ns-nombre', w.nombre, 'nombre', { maxlength: String(RA.carpeta.MAX) }), 'Se crea dentro de ' + w.padre + ' (se cambia en Ajustes › Claude Code).')
      ], [el('p', { id: 'ns-msg', class: 'note', 'aria-live': 'polite' }), el('p', { id: 'ns-destino', class: 'mono ns-destino' }), el('div', { id: 'ns-previas' })]);
    } else if (w.entorno === 'ssh') {
      const texto = (id, valor, clave, extra) => { const i = el('input', Object.assign({ id: id, class: 'input', type: 'text', value: valor, autocomplete: 'off', spellcheck: 'false', 'aria-describedby': 'ns-ssh-msg' }, extra || {})); i.addEventListener('input', () => { w[clave] = i.value; w.prueba = null; pintarPrueba(); pintarBarra(); }); return i; };
      const probar = el('button', { type: 'button', class: 'btn', id: 'ns-probar', onclick: e => probarSsh(e.currentTarget) }, 'Probar conexión');
      hijos = [
        campo('ns-host', 'Equipo', texto('ns-host', w.host, 'host', { placeholder: 'usuario@equipo', maxlength: '255' }), 'usuario@equipo o un nombre de tu ~/.ssh/config. Rastro entra con tu agente SSH o tu ~/.ssh/config: no guarda contraseñas ni claves.'),
        campo('ns-rcarpeta', 'Carpeta del proyecto en el equipo remoto', el('div', { class: 'ruta-campo' }, [texto('ns-rcarpeta', w.carpetaRemota, 'carpetaRemota', { placeholder: '~/proyectos/mi-app', maxlength: '1000' }), probar])),
        el('p', { id: 'ns-ssh-msg', class: 'note', 'aria-live': 'polite' }),
        el('p', { class: 'note ns-ssh-fase' }, 'La sesión empieza directamente con tu encargo (sin la fase de diseño). Ves su conversación y lo que hace Claude, Archivos en solo lectura, Terminal y vista previa en ese equipo; GitHub y Remote Control de esa sesión, todavía no. Claude Code tiene que estar instalado en ese equipo, con su sesión iniciada.')
      ];
    } else if (w.entorno === 'clonar') {
      cargarGh();
      const g = w.gh || {}, r = w.repos;
      const q = el('input', { id: 'ns-repos-q', class: 'input', type: 'search', value: w.filtro, placeholder: 'Filtrar por nombre', autocomplete: 'off', spellcheck: 'false' });
      q.addEventListener('input', () => { w.filtro = q.value; pintarLista(); });
      hijos = [
        !D.gh ? el('p', { class: 'note', id: 'ns-gh-msg' }, 'Clonar repositorios se hace con GitHub desde la app de escritorio.')
          : g.cargando ? el('p', { class: 'label', id: 'ns-gh-msg' }, 'Comprobando GitHub')
          : g.motivo ? el('p', { id: 'ns-gh-msg', role: 'alert' }, el('span', { class: 'mal' }, g.motivo))
          : !r || r.cargando ? el('p', { class: 'label', id: 'ns-gh-msg' }, 'Leyendo tus repositorios')
          : r.error ? el('p', { id: 'ns-gh-msg', role: 'alert' }, el('span', { class: 'mal' }, r.error))
          : campo('ns-repos-q', 'Tus repositorios (' + r.lista.length + ')', q),
        el('div', { id: 'ns-repos', class: 'ns-repos', role: 'radiogroup', 'aria-label': 'Repositorio para clonar' }),
        w.repo ? el('p', { class: 'mono ns-destino', id: 'ns-destino' }, 'Se clonará en ' + carpetaPrevista()) : null
      ];
    } else {
      cargarGh();
      const g = w.gh || {};
      const nombre = el('input', { id: 'ns-repo-nombre', class: 'input', type: 'text', value: w.repoNombre, maxlength: '100', autocomplete: 'off', spellcheck: 'false', 'aria-describedby': 'ns-repo-msg' });
      nombre.addEventListener('input', () => { w.repoNombre = nombre.value; const e = w.repoNombre ? L.nombreRepo(w.repoNombre) : ''; ui.pintar($('#ns-repo-msg'), e ? el('span', { class: 'mal' }, e) : 'Letras sin tilde, números, punto, guion y guion bajo.'); if (e) nombre.setAttribute('aria-invalid', 'true'); else nombre.removeAttribute('aria-invalid'); pintarBarra(); });
      const desc = el('input', { id: 'ns-repo-desc', class: 'input', type: 'text', value: w.repoDesc, maxlength: '350', autocomplete: 'off' });
      desc.addEventListener('input', () => { w.repoDesc = desc.value; });
      const vis = el('div', { id: 'ns-vis' });
      ui.segmentado(vis, [['privado', 'Privado'], ['publico', 'Público']], w.privado ? 'privado' : 'publico', v => { w.privado = v === 'privado'; pintarEntorno(); }, 'Visibilidad');
      const cl = el('input', { id: 'ns-clonar', type: 'checkbox', checked: w.clonarLocal ? '' : null });
      cl.addEventListener('change', () => { w.clonarLocal = cl.checked; pintarEntorno(); pintarBarra(); });
      hijos = [
        !D.gh ? el('p', { class: 'note', id: 'ns-gh-msg' }, 'Crear repositorios se hace con GitHub desde la app de escritorio.') : g.motivo ? el('p', { id: 'ns-gh-msg', role: 'alert' }, el('span', { class: 'mal' }, g.motivo)) : null,
        campo('ns-repo-nombre', 'Nombre del repositorio', nombre), el('p', { id: 'ns-repo-msg', class: 'note' }, 'Letras sin tilde, números, punto, guion y guion bajo.'),
        campo('ns-repo-desc', 'Descripción (opcional)', desc),
        el('div', { class: 'campo' }, [el('span', { class: 'label' }, 'Visibilidad'), vis, w.privado ? null : el('p', { class: 'aviso-largo' }, '! Público: cualquiera podrá verlo. Se pedirá una segunda confirmación.')]),
        el('label', { class: 'ns-check', for: 'ns-clonar' }, [cl, ' Clonar en mi equipo y empezar la sesión en él']),
        w.clonarLocal && w.repoNombre && !L.nombreRepo(w.repoNombre) ? el('p', { class: 'mono ns-destino', id: 'ns-destino' }, 'Se clonará en ' + carpetaPrevista()) : null
      ];
    }
    ui.pintar(caja, hijos.filter(Boolean));
    if (w.entorno === 'ssh') pintarPrueba();
    if (w.entorno === 'clonar') pintarLista();
    if (w.entorno === 'equipo') revisar();
    if (foco && $('#' + foco)) $('#' + foco).focus();
    pintarBarra();
  }
  function pintarLista() {
    const caja = $('#ns-repos');
    if (!caja) return;
    const r = w.repos && w.repos.lista ? w.repos.lista : [], f = w.filtro.trim().toLowerCase();
    const vis = r.filter(x => !f || x.nombre.toLowerCase().indexOf(f) >= 0).slice(0, 100);
    ui.pintar(caja, vis.length ? vis.map((x, i) => el('button', { type: 'button', role: 'radio', class: 'ns-repo', 'data-repo': x.nombre, 'aria-checked': String(w.repo === x.nombre), tabindex: (w.repo ? w.repo === x.nombre : i === 0) ? '0' : '-1',
      onclick: () => { w.repo = x.nombre; pintarEntorno(); const b = $('#ns-repos [data-repo="' + CSS.escape(x.nombre) + '"]'); if (b) b.focus(); } }, [
      el('span', { class: 'crece' }, [el('span', { class: 'mono' }, x.nombre), x.descripcion ? el('span', { class: 'note' }, x.descripcion) : null]),
      ui.insignia(x.privado ? 'Privado' : 'Público')
    ])) : r.length ? el('p', { class: 'note' }, 'Ningún repositorio coincide.') : null);
  }
  function revisar() {
    const msg = $('#ns-msg');
    if (!msg || w.entorno !== 'equipo') return;
    const e = estadoCarpeta(), i = w.info;
    ui.pintar(msg, e.error && !e.espera ? el('span', { class: 'mal' }, e.error) : e.error);
    $('#ns-destino').textContent = !e.error && i ? (w.modo === 'nueva' ? 'Se creará ' : 'Se usará ') + i.ruta : '';
    const campoMal = $(w.modo === 'nueva' ? '#ns-nombre' : '#ns-ruta');
    if (campoMal) { if (e.error && !e.espera) campoMal.setAttribute('aria-invalid', 'true'); else campoMal.removeAttribute('aria-invalid'); }
    const ses = !e.error && i && i.sesiones && i.sesiones.length ? i.sesiones.map(id => C.sesion(id)).filter(Boolean).slice(0, 3) : [];
    ui.pintar($('#ns-previas'), ses.length ? el('div', { class: 'sub' }, [el('p', {}, 'Esta carpeta ya tiene ' + (ses.length === 1 ? 'una sesión' : ses.length + ' sesiones') + '. Puedes retomarla en vez de empezar otra:'),
      el('ul', { class: 'lista' }, ses.map(s => el('li', {}, [ui.estado(s.est), el('span', { class: 'crece' }, s.nombre), el('button', { type: 'button', class: 'btn btn-small', 'data-previa': s.id, onclick: () => { cerrar(); RA.barra.abrir(s.id); } }, 'Abrir')])))]) : null);
    pintarBarra();
  }
  // ---- Equipo remoto (SSH): comprobar que se conecta, que la carpeta existe y que Claude Code está instalado ----
  function pintarPrueba() {
    const m = $('#ns-ssh-msg');
    if (!m || !w) return;
    const p = w.prueba;
    ui.pintar(m, w.probando ? el('span', { class: 'label' }, 'Comprobando ' + w.host.trim())
      : !p ? (malHost(w.host) && w.host ? el('span', { class: 'mal' }, malHost(w.host)) : malCarpeta(w.carpetaRemota) && w.carpetaRemota ? el('span', { class: 'mal' }, malCarpeta(w.carpetaRemota)) : 'Pulsa Probar conexión, o envía: se comprueba igual.')
      : p.ok ? ['✓ Conectado. Carpeta ', el('span', { class: 'mono' }, p.ruta), ' · Claude Code en ', el('span', { class: 'mono' }, p.claude)]
      : el('span', { class: 'mal' }, p.error));
  }
  function probarSsh(boton) {
    const e = malHost(w.host) || malCarpeta(w.carpetaRemota);
    if (e) { w.prueba = { error: e }; pintarPrueba(); return Promise.resolve(w.prueba); }
    if (!D.ssh) { w.prueba = { error: 'Las sesiones SSH se crean desde la app de escritorio.' }; pintarPrueba(); return Promise.resolve(w.prueba); }
    w.probando = true; pintarPrueba(); pintarBarra();
    const hecho = Promise.resolve(D.ssh.probar(w.host.trim(), w.carpetaRemota.trim())).then(r => {
      w.probando = false; w.prueba = r && (r.ok || r.error) ? r : { error: 'No se pudo comprobar el equipo.' };
      pintarPrueba(); pintarBarra();
      ui.decir(w.prueba.ok ? 'Equipo remoto comprobado: ' + w.prueba.ruta + '.' : w.prueba.error, { toast: false });
      return w.prueba.ok ? w.prueba : { error: w.prueba.error };
    });
    return boton ? ui.ocupado(boton, () => hecho, { cargando: 'Comprobando…', hecho: 'Conectado' }) : hecho;
  }

  function pintarBarra() {
    if (!w || !$('#ns-carpeta')) return;
    const c = carpetaPrevista();
    $('#ns-carpeta-t').textContent = c ? ui.ruta(c).textContent || c : 'Sin carpeta';
    $('#ns-carpeta').title = c ? 'Carpeta: ' + c : 'Elige una carpeta';
    const f = falta(), enviar = $('#ns-enviar');
    enviar.disabled = !!f || w.lanzando;
    enviar.textContent = w.lanzando ? 'Enviando…' : w.entorno === 'crear' && !w.clonarLocal ? 'Crear repositorio' : 'Enviar';
    // Archivos de referencia y worktree son de una carpeta de este equipo: en SSH no se ofrecen.
    ['#ns-refs', '#ns-wt'].forEach(x => { if ($(x)) $(x).hidden = w.entorno === 'ssh'; });
    enviar.title = f || '';
    // Lo que ya dice la caja de la carpeta no se repite debajo.
    ui.pintar($('#ns-falta'), f && !/^Comprobando/.test(f) && !(w.entorno === 'equipo' && f === estadoCarpeta().error) && !(w.entorno === 'ssh' && (f === malHost(w.host) || f === malCarpeta(w.carpetaRemota))) ? f : '');
    $('#ns-sinperm').hidden = w.permisos !== 'sinpermisos';
  }

  function anadirRefs() {
    if (!D.elegirReferencias) return ui.decir('Los archivos de referencia se eligen con el diálogo del sistema, en la app de escritorio.', 'atencion');
    D.elegirReferencias().then(l => {
      (l || []).forEach(x => { if (w.refs.length < 20) { w.refs.push(x.nombre); w.fichas.push(x.ficha); } });
      const b = $('#ns-refs'); if (b) { b.textContent = w.refs.length ? '+ ' + w.refs.length + (w.refs.length === 1 ? ' archivo' : ' archivos') : '+ Archivos'; b.title = w.refs.join(', ') || 'Se copian a la carpeta referencia del proyecto'; b.focus(); }
    });
  }
  function elegirCarpeta() {
    if (w.entorno === 'ssh') return $('#ns-rcarpeta') && $('#ns-rcarpeta').focus();
    if (w.entorno !== 'equipo') { w.entorno = 'equipo'; pintar(); }
    if (w.modo !== 'existente') { w.modo = 'existente'; pintarEntorno(); }
    if (!D.elegirCarpeta) return;
    Promise.resolve(D.elegirCarpeta(w.ruta.trim())).then(r => {
      if (!r || r.cancelado) return;
      if (r.error) return ui.decir(r.error, 'error');
      w.ruta = r.ruta; pintarEntorno(); comprobar(true);
    });
  }

  // ---- Confirmación (clonar y crear) ----
  function confirmar(titulo, filas, orden, aviso, siPublico) {
    return new Promise(res => {
      const c = RA.capas.capa(titulo, () => { c.cerrar(); res(false); });
      let segunda = false;
      const pintarC = () => ui.pintar(c.caja, [
        el('h2', { class: 'chica', id: 'ns-conf-t' }, titulo),
        el('dl', { class: 'ns-resumen' }, [].concat.apply([], filas.map(f => [el('dt', {}, f[0]), el('dd', { class: f[2] ? 'mono' : '' }, f[1])]))),
        el('p', { class: 'label' }, 'Orden que se ejecutará'),
        el('pre', { class: 'dato ns-orden', id: 'ns-orden', tabindex: '0', role: 'group', 'aria-label': 'Orden que se ejecutará' }, orden),
        aviso ? el('p', { class: 'note' }, aviso) : null,
        segunda ? el('p', { role: 'alert', class: 'aviso-largo' }, '! Segunda confirmación: el repositorio será público y cualquiera podrá verlo.') : null,
        el('div', { class: 'row between' }, [
          el('button', { type: 'button', class: 'btn btn-primary', id: 'ns-conf-no', onclick: () => { c.cerrar(); res(false); } }, 'Cancelar'),
          el('button', { type: 'button', class: 'btn', id: 'ns-conf-si', onclick: () => { if (siPublico && !segunda) { segunda = true; pintarC(); $('#ns-conf-si').focus(); return; } c.cerrar(); res(true); } }, siPublico && !segunda ? 'Seguir: crear público' : siPublico ? 'Sí, crear el repositorio público' : 'Confirmar')
        ])
      ]);
      c.caja.setAttribute('aria-labelledby', 'ns-conf-t'); c.caja.removeAttribute('aria-label');
      pintarC();
      $('#ns-conf-no').focus();
    });
  }

  // ---- Enviar ----
  const mal = t => { w.error = t; w.lanzando = false; ui.pintar($('#ns-error'), t ? el('span', { class: 'mal' }, t) : null); pintarBarra(); ui.decir(t, 'error'); return { error: t }; };
  async function enviar(ev) {
    if (ev) ev.preventDefault();
    const f = falta();
    if (f) return ui.decir(f, 'atencion');
    if (w.lanzando) return;
    if (w.entorno === 'ssh') return enviarSsh();
    let ruta = null;
    if (w.entorno === 'equipo') ruta = w.info.ruta;
    else if (w.entorno === 'clonar') {
      const destino = carpetaPrevista();
      if (!await confirmar('Clonar ' + w.repo, [['Repositorio', w.repo, true], ['Destino', destino, true], ['Después', 'Empieza la sesión en esa carpeta con tu encargo.']], 'gh repo clone ' + w.repo + ' ' + (/\s/.test(destino) ? '"' + destino + '"' : destino), 'No se hace push ni se cambia nada en GitHub.')) return;
      w.lanzando = true; pintarBarra(); ui.pintar($('#ns-error'), null);
      const r = await D.gh.clonar(w.repo, D.ajustes.raiz);
      if (!r || r.error) return mal((r && r.error) || 'No se pudo clonar.');
      ruta = r.ruta;
      ui.decir('Repositorio clonado en ' + r.ruta + '.', 'ok');
    } else {
      const destino = carpetaPrevista(), args = ['repo', 'create', w.repoNombre, w.privado ? '--private' : '--public'].concat(w.repoDesc.trim() ? ['--description', w.repoDesc.trim()] : [], w.clonarLocal ? ['--clone'] : []);
      const ord = 'gh ' + args.map(a => /^[\w@%+=:,./-]+$/.test(a) ? a : '"' + a.replace(/(["\\$`])/g, '\\$1') + '"').join(' ');
      if (!await confirmar('Crear el repositorio ' + w.repoNombre, [['Nombre', w.repoNombre, true], ['Descripción', w.repoDesc.trim() || '(sin descripción)'], ['Visibilidad', w.privado ? 'Privado' : 'Público'], ['Clonar en tu equipo', w.clonarLocal ? 'Sí, en ' + destino : 'No'], ['Push', 'No: el repositorio se crea vacío']], ord, 'Se crea en tu cuenta de GitHub con la sesión de gh que ya tienes iniciada.', !w.privado)) return;
      w.lanzando = true; pintarBarra(); ui.pintar($('#ns-error'), null);
      const r = await D.gh.crear({ nombre: w.repoNombre, descripcion: w.repoDesc.trim() || undefined, privado: w.privado, clonar: w.clonarLocal, raiz: D.ajustes.raiz });
      if (!r || r.error) return mal((r && r.error) || 'No se pudo crear el repositorio.');
      ui.decir('Repositorio ' + w.repoNombre + ' creado' + (w.privado ? ' (privado)' : ' (público)') + '.', 'ok');
      if (!w.clonarLocal) { w.lanzando = false; cerrar(); return; }
      ruta = r.ruta;
    }
    w.lanzando = true; pintarBarra();
    // Worktree: la sesión trabaja en una rama propia dentro de .claude/worktrees del repositorio.
    if (w.worktree) {
      if (!D.worktree) return mal('Worktree solo funciona en la app de escritorio.');
      const r = await D.worktree(ruta, slug(w.encargo.split('\n')[0]).toLowerCase(), D.ajustes.prefijoRama == null ? 'rastro/' : D.ajustes.prefijoRama);
      if (!r || r.error) return mal((r && r.error) || 'No se pudo crear el worktree.');
      ruta = r.ruta;
      ui.decir('Worktree en la rama ' + r.rama + '.', 'ok');
    }
    const i = await Promise.resolve(D.infoCarpeta(ruta));
    if (!i || i.error) return mal((i && i.error) || 'No se pudo comprobar la carpeta.');
    const nueva = w.entorno === 'equipo' && w.modo === 'nueva', P = RA.capas.PERMISOS[w.permisos];
    const r = await Promise.resolve(D.crear({
      nombre: i.nombre, raiz: i.padre, existente: !nueva, titulo: (w.encargo.trim().split('\n')[0] || i.nombre).slice(0, 80), encargo: w.encargo, refs: w.fichas.slice(0, 20),
      modelos: { diseno: w.modelo, codigo: w.modelo, resumen: D.ajustes.modelos.resumen }, aprobar: true, esfuerzo: w.esfuerzo || undefined,
      permisos: { modo: P.modo, diseno: P.diseno, codigo: P.codigo }
    }));
    const id = typeof r === 'string' ? r : r && r.id;
    if (!id) return mal((r && r.error) || 'No se pudo crear la sesión.');
    D.recordar(i.ruta);
    const modeloUsado = w.modelo;
    w.lanzando = false;
    cerrar(true);
    RA.app.sel.detalle = id; RA.app.pendiente = id; RA.app.sel.filtroSes = 'todas'; RA.app.sel.sesVista = 'tarjetas'; RA.app.ir('sesiones');
    ui.decir('Sesión creada en ' + i.ruta + ': empieza con ' + ui.modelo(modeloUsado) + '.', 'ok');
    return { ok: true };
  }

  /* SSH: se comprueba el equipo, se enseña lo que se va a ejecutar y, al confirmar, el proceso principal crea la sesión
     en ese equipo con el encargo como primer mensaje. La sesión se abre en Chat. */
  async function enviarSsh() {
    w.lanzando = true; pintarBarra(); ui.pintar($('#ns-error'), null);
    const p = w.prueba && w.prueba.ok ? w.prueba : await probarSsh();
    w.lanzando = false; pintarBarra();
    if (!p || !p.ok) return mal((p && p.error) || 'No se pudo comprobar el equipo remoto.');
    const host = w.host.trim(), modo = MODO_DE[w.permisos] || 'default';
    const orden = 'ssh -T -o BatchMode=yes -o ConnectTimeout=15 -- ' + host + " \\\n  'cd " + p.ruta + ' && exec claude -p --session-id <nueva> --permission-mode ' + modo + ' --model ' + w.modelo + (w.esfuerzo ? ' --effort ' + w.esfuerzo : '') + " …'";
    if (!await confirmar('Empezar una sesión en ' + host, [['Equipo', host, true], ['Carpeta', p.ruta, true], ['Claude Code', p.claude, true], ['Permisos', (PERM.find(x => x[0] === w.permisos) || PERM[0])[1]], ['Qué se puede', 'Conversación, Archivos (solo lectura), Terminal y vista previa en ese equipo. GitHub y Remote Control, todavía no.']],
      orden, 'Se usa tu ssh, con tu ~/.ssh/config y tu agente: Rastro no guarda contraseñas ni claves. Claude Code corre en ese equipo con la cuenta que tenga iniciada allí.')) return;
    w.lanzando = true; pintarBarra();
    const r = await Promise.resolve(D.ssh.crear({ host: host, carpeta: w.carpetaRemota.trim(), encargo: w.encargo, modo: modo, modelo: w.modelo, esfuerzo: w.esfuerzo || undefined }));
    if (!r || r.error) return mal((r && r.error) || 'No se pudo crear la sesión en el equipo remoto.');
    w.lanzando = false;
    cerrar(true);
    // La sesión llega a la interfaz con la siguiente lectura del lector: se elige en cuanto está (hasta 10 s).
    const elegir = () => { if (!D.estado.sesiones.some(x => x.id === r.id)) return false; if (RA.chat3 && RA.chat3.elegir) RA.chat3.elegir(r.id); else { RA.app.sel.sesion = r.id; RA.app.ir('chat'); } return true; };
    RA.app.ir('chat');
    if (!elegir()) { let n = 0; const t = setInterval(() => { if (elegir() || ++n > 40) clearInterval(t); }, 250); }
    if (r.envio && r.envio.error) ui.decir('La sesión se creó en ' + host + ', pero el primer mensaje no salió: ' + r.envio.error, 'atencion');
    else ui.decir('Sesión SSH creada en ' + host + ':' + r.ruta + '. Claude ya está con tu encargo.', 'ok');
    return { ok: true };
  }

  function pintar() {
    const v = $('#v-nueva');
    if (!v || !w) return;
    const radios = el('div', { id: 'ns-entornos', class: 'ns-entornos', role: 'radiogroup', 'aria-labelledby': 'ns-ent-t' }, ENTORNOS.map(([id, nombre, linea]) => el('button', {
      type: 'button', role: 'radio', class: 'ns-entorno', 'data-entorno': id, 'aria-checked': String(w.entorno === id), tabindex: w.entorno === id ? '0' : '-1',
      onclick: () => { if (w.entorno === id) return; w.entorno = id; w.error = ''; pintar(); if (id === 'clonar' && w.gh && w.gh.sesion) cargarRepos(); const b = $('#ns-entornos [data-entorno="' + id + '"]'); if (b) b.focus(); }
    }, [el('span', { class: 'ns-entorno-n' }, nombre), el('span', { class: 'note' }, linea)])));
    radios.addEventListener('keydown', e => {
      const i = ENTORNOS.findIndex(x => x[0] === w.entorno), paso = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!paso) return;
      e.preventDefault();
      const id = ENTORNOS[(i + paso + ENTORNOS.length) % ENTORNOS.length][0];
      $('#ns-entornos [data-entorno="' + id + '"]').click();
    });
    const area = el('textarea', { id: 'ns-encargo', class: 'comp-texto ns-encargo', rows: '5', placeholder: 'Describe lo que quieres que haga Claude…', maxlength: '20000', spellcheck: 'false', 'aria-label': 'Encargo para la sesión nueva' }, w.encargo);
    area.addEventListener('input', () => { w.encargo = area.value; pintarBarra(); });
    area.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); enviar(); } });
    const permisos = el('select', { id: 'ns-permisos', class: 'select ns-sel', 'aria-label': 'Permisos de la sesión' }, PERM.map(p => el('option', { value: p[0] }, p[1])));
    permisos.value = w.permisos; permisos.addEventListener('change', () => { w.permisos = permisos.value; pintarBarra(); });
    const modelo = el('select', { id: 'ns-modelo', class: 'select ns-sel', 'aria-label': 'Modelo' }, D.MODELOS.map(m => el('option', { value: m[0] }, m[1])));
    modelo.value = w.modelo; modelo.addEventListener('change', () => { w.modelo = modelo.value; });
    const esf = el('select', { id: 'ns-esfuerzo', class: 'select ns-sel', 'aria-label': 'Esfuerzo del modelo' }, ESF.map(x => el('option', { value: x[0] }, x[1])));
    esf.value = w.esfuerzo; esf.addEventListener('change', () => { w.esfuerzo = esf.value; });
    ui.pintar(v, [
      el('h1', { id: 'h-nueva', class: 'sr', tabindex: '-1' }, 'Nueva sesión'),
      el('div', { class: 'ns' }, [
        el('div', { class: 'row between ns-cab' }, [el('h2', { id: 'ns-ent-t', class: 'ns-tit' }, 'Elegir entorno'), el('button', { type: 'button', class: 'btn btn-small', id: 'ns-cancelar', onclick: () => cerrar() }, 'Cancelar')]),
        radios,
        el('div', { id: 'ns-detalle', class: 'col ns-detalle' }),
        el('form', { id: 'ns-form', class: 'comp-caja ns-caja', novalidate: true, onsubmit: enviar }, [
          area,
          el('div', { class: 'comp-fila ns-barra' }, [
            el('button', { type: 'button', id: 'ns-carpeta', class: 'comp-pildora ns-carpeta', onclick: elegirCarpeta }, [el('span', { class: 'sr' }, 'Elegir carpeta: '), el('span', { id: 'ns-carpeta-t', class: 'mono' })]),
            // Archivos de referencia: se copian a referencia/ de la carpeta (los elige el diálogo del sistema).
            el('button', { type: 'button', id: 'ns-refs', class: 'comp-pildora', 'aria-label': 'Añadir archivos de referencia', title: 'Se copian a la carpeta referencia del proyecto', onclick: anadirRefs }, w.refs.length ? '+ ' + w.refs.length + (w.refs.length === 1 ? ' archivo' : ' archivos') : '+ Archivos'),
            el('span', { class: 'ns-wt', id: 'ns-wt' }, [el('span', { class: 'note' }, 'Worktree'), ui.interruptor(w.worktree, x => { w.worktree = x; }, 'Worktree')]),
            permisos,
            el('span', { class: 'hueco' }),
            modelo, esf,
            el('button', { type: 'submit', id: 'ns-enviar', class: 'comp-enviar' }, 'Enviar')
          ])
        ]),
        el('p', { id: 'ns-sinperm', class: 'aviso-largo', hidden: true }, '! Sin permisos: Claude ejecuta lo que decida sin preguntar y puede salir de la carpeta del proyecto. Úsalo solo en carpetas que puedas perder.'),
        el('p', { id: 'ns-falta', class: 'note', 'aria-live': 'polite' }),
        el('p', { id: 'ns-error', role: 'alert' }),
        el('p', { class: 'note' }, 'La sesión se lanza con el CLI oficial de Claude Code y tu suscripción, nunca con una clave de API. Primero diseña (DESIGN.md y una maqueta) y espera tu aprobación antes de programar.')
      ])
    ]);
    pintarEntorno();
  }

  // Abre la pantalla. op: el texto del encargo, o { carpeta, encargo } (el "+" de una carpeta de la barra).
  function abrir(op) {
    op = op && typeof op === 'object' && !(op instanceof Event) ? op : { encargo: typeof op === 'string' ? op : '' };
    w = nuevo(op);
    RA.app.ir('nueva');
    pintar();
    if (w.ruta) comprobar(true);
    const f = $('#ns-encargo'); if (f && w.ruta) f.focus();
    return { ok: true };
  }
  function cerrar(hecho) {
    clearTimeout(tComprobar);
    w = null;
    if (!hecho) RA.app.ir('chat');
  }
  // Esc en la pantalla (sin capa abierta) vuelve a la sesión.
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && w && RA.app.sel.vista === 'nueva' && !RA.capas.abierta() && !ui.menu.abierto) { e.preventDefault(); cerrar(); } });
  document.addEventListener('rastro:vista', e => { if (e.detail !== 'nueva' && w && !w.lanzando) w = null; });

  RA.nuevaSesion = { abrir: abrir, cerrar: cerrar, estado: () => w, enviar: enviar, slug: slug };
})(window.RA = window.RA || {});
