/* Validación de nombres de carpeta en Windows. No depende de nada: la usa el asistente mientras se
   escribe y la volverá a usar el proceso principal antes de crear una carpeta (Fase 3), por eso se
   exporta también como módulo de Node. */
(function (root) {
  'use strict';

  const RESERVADOS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
  const MAX = 64;

  // Devuelve '' si el nombre vale, o el motivo por el que no. existentes: carpetas que ya hay en la raíz.
  // max: longitud máxima (64 para la carpeta de un proyecto; los archivos del explorador admiten más).
  function validar(nombre, existentes, max) {
    const n = String(nombre == null ? '' : nombre);
    max = max || MAX;
    if (!n.trim()) return 'Escribe un nombre.';
    if (n !== n.trim()) return 'No puede empezar ni terminar con un espacio.';
    if (n.length > max) return 'Máximo ' + max + ' caracteres.';
    if (/[<>:"/\\|?*]/.test(n)) return 'No puede contener < > : " / \\ | ? *';
    if (/[\u0000-\u001f]/.test(n)) return 'No puede contener caracteres de control.';
    if (n.indexOf('..') >= 0) return 'No puede contener "..".';
    if (/\.$/.test(n)) return 'No puede terminar en punto.';
    if (RESERVADOS.test(n)) return '"' + n + '" es un nombre reservado de Windows.';
    if ((existentes || []).some(e => e.toLowerCase() === n.toLowerCase())) return 'Ya existe una carpeta con ese nombre.';
    return '';
  }

  const api = { validar: validar, MAX: MAX };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.RA = root.RA || {}).carpeta = api;
})(typeof window !== 'undefined' ? window : globalThis);
