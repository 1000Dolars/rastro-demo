/* Programadas (como "Scheduled" de Claude Code Desktop; antes "Routines"): tareas locales que empiezan una sesión nueva
   de Claude con un prompt, a la hora elegida, mientras la app está abierta. El horario y las ejecuciones los lleva el
   proceso principal (src/main/services/scheduled.js); aquí se listan, se crean, se editan, se pausan, se ejecutan a
   mano y se borran (dos pulsaciones). Cada ejecución abre su sesión desde el historial.
   En la maqueta no hay proceso principal: la vista lo dice y no deja crear nada. */
(function (RA) {
  'use strict';

  const ui = RA.ui, el = ui.el, $ = ui.$, D = RA.datos;
  const HORARIOS = [['dia', 'Cada día'], ['laborables', 'Días laborables'], ['semana', 'Cada semana'], ['hora', 'Cada hora'], ['manual', 'Manual'], ['cron', 'Personalizado (cron)']];
  // Sin "Omitir permisos": cuando se ejecuta, nadie está mirando.
  const MODOS = [['default', 'Manual'], ['acceptEdits', 'Aceptar ediciones'], ['plan', 'Plan'], ['auto', 'Auto']];
  const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const ESF = [['', 'Por defecto'], ['low', 'Bajo'], ['medium', 'Medio'], ['high', 'Alto'], ['xhigh', 'Muy alto'], ['max', 'Máximo']];
  const EST = { lanzada: 'En marcha', listo: 'Terminada', error: 'Falló', cancelado: 'Cancelada' };
  const P = { lista: null, cargando: false, form: null, error: '' };
  const fecha = t => t ? new Date(t).toLocaleString('es', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

  function cargar() {
    if (!D.programadas || P.cargando) return;
    P.cargando = true;
    Promise.resolve(D.programadas.lista()).then(l => { P.cargando = false; P.lista = Array.isArray(l) ? l : []; pintar(); }, () => { P.cargando = false; });
  }
  function recibir(l) { P.lista = Array.isArray(l) ? l : P.lista; if (RA.app && RA.app.sel.vista === 'programadas' && !P.form) pintar(); }

  function nuevaForm(t) {
    const A = D.ajustes;
    P.form = t ? { id: t.id, nombre: t.nombre, carpeta: t.carpeta, prompt: t.prompt, modo: t.modo, modelo: t.modelo || A.modelos.codigo, esfuerzo: t.esfuerzo || '', tipo: t.horario.tipo, hora: t.horario.hora || '09:00', dia: t.horario.dia != null ? t.horario.dia : 1, cron: t.horario.cron || '0 9 * * 1-5' }
      : { id: null, nombre: '', carpeta: (A.recientes || [])[0] || '', prompt: '', modo: 'default', modelo: A.modelos.codigo, esfuerzo: '', tipo: 'dia', hora: '09:00', dia: 1, cron: '0 9 * * 1-5' };
    P.error = '';
    pintar();
    const n = $('#prog-nombre'); if (n) n.focus();
  }

  function guardar(ev) {
    ev.preventDefault();
    const f = P.form, horario = { tipo: f.tipo };
    if (f.tipo === 'dia' || f.tipo === 'laborables' || f.tipo === 'semana') horario.hora = f.hora;
    if (f.tipo === 'semana') horario.dia = Number(f.dia);
    if (f.tipo === 'cron') horario.cron = f.cron;
    const boton = $('#prog-guardar');
    ui.ocupado(boton, () => Promise.resolve(D.programadas.guardar(f.id, { nombre: f.nombre, carpeta: f.carpeta, prompt: f.prompt, modo: f.modo, modelo: f.modelo, esfuerzo: f.esfuerzo || null, horario: horario })).then(r => {
      if (!r || r.error) { P.error = (r && r.error) || 'No se pudo guardar.'; ui.pintar($('#prog-error'), el('span', { class: 'mal' }, P.error)); ui.decir(P.error, 'error'); return { error: P.error }; }
      ui.decir((f.id ? 'Tarea guardada: ' : 'Tarea creada: ') + f.nombre + '.', 'ok');
      P.form = null; cargar();
      return r;
    }), { cargando: 'Guardando…', hecho: 'Guardada' });
  }

  function formulario() {
    const f = P.form;
    const campo = (id, nombre, control, ayuda) => el('div', { class: 'campo' }, [el('label', { class: 'label', for: id }, nombre), control, ayuda ? el('p', { class: 'note' }, ayuda) : null]);
    const texto = (id, clave, extra) => { const i = el('input', Object.assign({ id: id, class: 'input', type: 'text', value: f[clave] == null ? '' : String(f[clave]), autocomplete: 'off', spellcheck: 'false' }, extra || {})); i.addEventListener('input', () => { f[clave] = i.value; }); return i; };
    const lista = (id, clave, ops, alCambiar) => { const s = el('select', { id: id, class: 'select' }, ops.map(o => el('option', { value: String(o[0]) }, o[1]))); s.value = String(f[clave]); s.addEventListener('change', () => { f[clave] = s.value; if (alCambiar) alCambiar(); }); return s; };
    const area = el('textarea', { id: 'prog-prompt', class: 'input', rows: '5', maxlength: '20000', spellcheck: 'false' }, f.prompt);
    area.addEventListener('input', () => { f.prompt = area.value; });
    const elegir = el('button', { type: 'button', class: 'btn', id: 'prog-elegir', onclick: () => {
      if (!D.elegirCarpeta) return;
      Promise.resolve(D.elegirCarpeta(f.carpeta)).then(r => { if (!r || r.cancelado) return; if (r.error) return ui.decir(r.error, 'error'); f.carpeta = r.ruta; $('#prog-carpeta').value = r.ruta; });
    } }, 'Elegir carpeta…');
    const cuando = [campo('prog-tipo', 'Cuándo', lista('prog-tipo', 'tipo', HORARIOS, () => pintar()))];
    if (f.tipo === 'dia' || f.tipo === 'laborables' || f.tipo === 'semana') cuando.push(campo('prog-hora', 'Hora', texto('prog-hora', 'hora', { type: 'time', step: '60' }), 'Hora de este equipo.'));
    if (f.tipo === 'semana') cuando.push(campo('prog-dia', 'Día', lista('prog-dia', 'dia', DIAS.map((d, i) => [i, d]))));
    if (f.tipo === 'cron') cuando.push(campo('prog-cron', 'Expresión cron', texto('prog-cron', 'cron', { class: 'input mono' }), 'Minuto, hora, día del mes, mes y día de la semana (0 = domingo). Como mucho una vez por hora: el minuto es un solo número. Ejemplo: 0 9 * * 1-5.'));
    if (f.tipo === 'manual') cuando.push(el('p', { class: 'note' }, 'Sin horario: solo se ejecuta con "Ejecutar ahora".'));
    if (f.tipo === 'hora') cuando.push(el('p', { class: 'note' }, 'Al empezar cada hora.'));
    return el('form', { id: 'prog-form', class: 'card', novalidate: true, onsubmit: guardar, 'aria-labelledby': 'prog-form-t' }, [
      el('div', { class: 'esc' }, [
        campo('prog-nombre', 'Nombre', texto('prog-nombre', 'nombre', { maxlength: '80' })),
        campo('prog-carpeta', 'Carpeta del proyecto', el('div', { class: 'ruta-campo' }, [texto('prog-carpeta', 'carpeta', { maxlength: '1000' }), elegir]), 'Una carpeta de este equipo. Cada ejecución es una sesión nueva allí.'),
        campo('prog-prompt', 'Prompt', area, 'Lo que hará Claude cada vez. Si la hora importa, dilo en el prompt: una ejecución de recuperación puede salir más tarde.'),
        el('div', { class: 'prog-fila' }, cuando),
        el('div', { class: 'prog-fila' }, [
          campo('prog-modo', 'Permisos', lista('prog-modo', 'modo', MODOS), 'Sin "Omitir permisos": cuando se ejecuta nadie está mirando. Lo que pida permiso espera en su sesión.'),
          campo('prog-modelo', 'Modelo', lista('prog-modelo', 'modelo', D.MODELOS)),
          campo('prog-esfuerzo', 'Esfuerzo', lista('prog-esfuerzo', 'esfuerzo', ESF))
        ]),
        el('p', { id: 'prog-error', role: 'alert' }, P.error ? el('span', { class: 'mal' }, P.error) : null),
        el('div', { class: 'row' }, [
          el('button', { type: 'submit', class: 'btn', id: 'prog-guardar' }, f.id ? 'Guardar cambios' : 'Crear tarea'),
          el('button', { type: 'button', class: 'btn', id: 'prog-cancelar', onclick: () => { P.form = null; pintar(); const b = $('#prog-nueva'); if (b) b.focus(); } }, 'Cancelar')
        ])
      ]),
      el('div', { class: 'card-pie' }, el('h2', { class: 'label', id: 'prog-form-t' }, f.id ? 'Editar la tarea' : 'Tarea nueva'))
    ]);
  }

  function abrirSesion(id) {
    if (!(D.estado.sesiones || []).some(s => s.id === id)) return ui.decir('Esa sesión todavía no aparece: Claude Code la escribe al empezar a responder. Vuelve a probar en unos segundos.', 'atencion');
    if (RA.chat3 && RA.chat3.elegir) RA.chat3.elegir(id); else { RA.app.sel.sesion = id; RA.app.ir('chat'); }
  }

  function tarjeta(t) {
    const ult = (t.historial || [])[0];
    const boton = (id, texto, fn, extra) => el('button', Object.assign({ type: 'button', class: 'btn btn-small', id: id + '-' + t.id, onclick: fn }, extra || {}), texto);
    const ejecutar = boton('prog-ejecutar', t.enMarcha ? 'Ejecutándose…' : 'Ejecutar ahora', e => ui.ocupado(e.currentTarget, () => Promise.resolve(D.programadas.ejecutar(t.id)).then(r => { if (r && r.error) ui.decir(r.error, 'error'); else ui.decir('«' + t.nombre + '» en marcha: se abrió una sesión nueva.', 'ok'); return r; }), { cargando: 'Lanzando…', hecho: 'Lanzada' }), { disabled: t.enMarcha || null });
    const pausa = boton('prog-activar', t.activa ? 'Pausar' : 'Reanudar', () => Promise.resolve(D.programadas.activar(t.id, !t.activa)).then(r => { if (r && r.error) return ui.decir(r.error, 'error'); ui.decir(t.activa ? '«' + t.nombre + '» en pausa: no se ejecutará hasta que la reanudes.' : '«' + t.nombre + '» reanudada.', 'ok'); cargar(); }));
    const borrar = ui.armar(boton('prog-borrar', 'Eliminar'), '¿Eliminar la tarea?', () => Promise.resolve(D.programadas.borrar(t.id)).then(r => { if (r && r.error) return ui.decir(r.error, 'error'); ui.decir('Tarea eliminada: ' + t.nombre + '. Sus sesiones siguen en la barra lateral.', 'ok'); cargar(); }));
    return el('li', { class: 'card prog-tarea', 'data-id': t.id }, [
      el('div', { class: 'esc' }, [
        el('div', { class: 'row between' }, [el('h3', { class: 'prog-nombre' }, t.nombre), ui.insignia(t.enMarcha ? 'En marcha' : t.activa ? 'Activa' : 'En pausa')]),
        el('p', { class: 'mono prog-carpeta', title: t.carpeta }, ui.ruta(t.carpeta)),
        el('dl', { class: 'prog-datos' }, [
          el('dt', {}, 'Cuándo'), el('dd', {}, t.cuando),
          el('dt', {}, 'Próxima'), el('dd', {}, !t.activa ? 'En pausa' : t.proxima ? fecha(t.proxima) : 'Solo a mano'),
          el('dt', {}, 'Última'), el('dd', {}, ult ? [fecha(ult.t) + ' · ' + (EST[ult.est] || ult.est) + (ult.recuperacion ? ' (recuperación)' : '') + ' ', ult.sesion ? el('button', { type: 'button', class: 'enlace prog-enlace', id: 'prog-abrir-' + t.id, onclick: () => abrirSesion(ult.sesion) }, 'Abrir la sesión') : null, ult.error ? el('span', { class: 'mal' }, ' ' + ult.error) : null] : 'Todavía no se ha ejecutado')
        ]),
        (t.historial || []).length > 1 ? el('details', { class: 'prog-hist' }, [el('summary', {}, 'Historial (' + t.historial.length + ')'), el('ol', { class: 'lista' }, t.historial.map(h => el('li', {}, [
          fecha(h.t) + ' · ' + (h.manual ? 'a mano' : h.recuperacion ? 'recuperación' : 'a su hora') + ' · ' + (EST[h.est] || h.est) + ' ',
          h.sesion ? el('button', { type: 'button', class: 'enlace prog-enlace', onclick: () => abrirSesion(h.sesion) }, 'Abrir la sesión') : null
        ])))]) : null,
        el('div', { class: 'row' }, [ejecutar, boton('prog-editar', 'Editar', () => nuevaForm(t)), pausa, borrar])
      ]),
      el('div', { class: 'card-pie' }, el('span', { class: 'label' }, ui.modelo ? ui.modelo(t.modelo || '') : t.modelo || ''))
    ]);
  }

  function pintar() {
    const caja = $('#prog');
    if (!caja) return;
    if (!D.programadas) return ui.pintar(caja, el('div', { class: 'card' }, [el('div', { class: 'esc' }, [
      el('p', {}, 'Las tareas programadas funcionan en la app de escritorio: allí se guardan y se ejecutan a su hora.'),
      el('p', { class: 'note' }, 'Aquí, con datos de muestra, no hay nada que programar.')
    ]), el('div', { class: 'card-pie' }, el('h2', { class: 'label' }, 'Programadas'))]));
    if (P.lista == null) { cargar(); return ui.pintar(caja, el('p', { class: 'label' }, 'Cargando')); }
    const cab = el('div', { class: 'row between prog-cab' }, [
      el('p', { class: 'note' }, 'Solo con la app abierta y el equipo despierto. Si se pierde una ejecución, al volver se hace una sola de recuperación (la más reciente de los últimos 7 días) y se avisa.'),
      P.form ? null : el('button', { type: 'button', class: 'btn', id: 'prog-nueva', onclick: () => nuevaForm(null) }, 'Nueva tarea')
    ]);
    ui.pintar(caja, [
      cab,
      P.form ? formulario() : null,
      P.lista.length ? el('ol', { class: 'prog-lista', 'aria-label': 'Tareas programadas' }, P.lista.map(tarjeta))
        : P.form ? null : el('p', { class: 'note prog-vacio' }, 'Todavía no hay tareas. Pulsa «Nueva tarea» para que Claude haga algo cada día, cada semana o cuando tú digas.')
    ]);
  }

  RA.vistas = RA.vistas || {};
  RA.vistas.programadas = pintar;
  RA.programadas = { recibir: recibir, cargar: cargar, estado: P };
})(window.RA = window.RA || {});
