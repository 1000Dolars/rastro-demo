/* Aplica el tema guardado antes del primer pintado, para evitar un destello. Va en un archivo
   aparte (y no en línea) porque la política de contenido de la app no admite scripts en línea. */
(function () {
  var t = 'dark';
  try { t = JSON.parse(localStorage.getItem('rastro:v1')).tema || t; } catch (e) { /* sin ajustes guardados */ }
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : 'dark');
})();
