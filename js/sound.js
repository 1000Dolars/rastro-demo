/* Sonidos de la app, sintetizados con Web Audio (sin archivos de audio): breves, secos y distintos por
   evento, cada uno con su interruptor y su volumen en Ajustes.
     fin       terminó: dos notas ascendentes (el acorde de siempre)
     error     falló: dos notas descendentes, más graves
     atencion  necesita atención (un permiso, una pregunta, una aprobación): tres toques cortos iguales
   Nunca son la única señal: quien los dispara pinta además la insignia y dice una frase por la región
   de estado. Suena uno solo a la vez: si llegan varios eventos juntos, el primero. */
(function (RA) {
  'use strict';
  const SOLO_PANEL = !!new URLSearchParams(location.search).get('panel');

  const D = RA.datos;
  const MOTIVOS = {
    fin: [[659.25, 0], [987.77, 0.14]],
    error: [[523.25, 0], [349.23, 0.16]],
    atencion: [[880, 0], [880, 0.12], [880, 0.24]]
  };
  let ctx = null, ultima = -Infinity;

  // Ajustes de un evento, con los valores por defecto si aún no se han guardado.
  const conf = tipo => Object.assign({ sonido: true, notif: true, vol: D.ajustes.volumen }, (D.ajustes.eventos || {})[tipo] || {});

  const sonido = {
    veces: 0,          // cuántas veces ha sonado desde que se abrió la página
    bloqueado: false,  // el sistema exige un gesto antes de dejar sonar: se ofrece "Activar sonido"
    alCambiar: null,

    // tipo: 'fin' (por defecto), 'error' o 'atencion'. forzar: el botón "Probar".
    tocar(forzar, tipo) {
      if (typeof forzar === 'string') { tipo = forzar; forzar = false; }
      if (SOLO_PANEL) return false;              // la ventana propia de un panel no repite los sonidos de la principal
      tipo = MOTIVOS[tipo] ? tipo : 'fin';
      const c = conf(tipo), ahora = performance.now();
      if (!forzar && (D.ajustes.silencio || !c.sonido || ahora - ultima < 1500)) return false;
      ultima = ahora;
      sonido.veces++;
      try {
        ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
        const t = ctx.currentTime, vol = Math.max(0, Math.min(1, c.vol)) * 0.25;
        MOTIVOS[tipo].forEach(n => {
          const o = ctx.createOscillator(), g = ctx.createGain(), largo = tipo === 'atencion' ? 0.09 : 0.34;
          o.type = tipo === 'error' ? 'square' : 'triangle';
          o.frequency.value = n[0];
          g.gain.setValueAtTime(0.0001, t + n[1]);
          g.gain.linearRampToValueAtTime(Math.max(0.0001, tipo === 'error' ? vol * 0.5 : vol), t + n[1] + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, t + n[1] + largo);
          o.connect(g); g.connect(ctx.destination);
          o.start(t + n[1]); o.stop(t + n[1] + largo + 0.02);
        });
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        // Si pasado un momento el contexto sigue suspendido, es que hace falta un gesto de la persona.
        setTimeout(() => sonido.marcar(ctx.state !== 'running'), 250);
      } catch (e) { sonido.marcar(true); }
      return true;
    },
    marcar(b) { if (b !== sonido.bloqueado) { sonido.bloqueado = b; if (sonido.alCambiar) sonido.alCambiar(b); } },
    // Respuesta al botón "Activar sonido": el clic es el gesto que faltaba.
    activar() {
      if (ctx) ctx.resume().then(() => sonido.marcar(false), () => {});
      sonido.tocar(true);
    },
    conf: conf
  };

  RA.sonido = sonido;
})(window.RA = window.RA || {});
