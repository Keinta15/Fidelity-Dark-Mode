/* Registered by the service worker only while the theme is off: puts the gate
   class down before the first paint (every theme rule needs html:not(.fdm-off)). */
document.documentElement.classList.add('fdm-off');
