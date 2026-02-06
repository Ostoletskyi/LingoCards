(function(){
  'use strict';
  // Legacy fallback entry for LingoCard.
  // This file is loaded only if the primary ES-module boot fails.
  try{
    var msg =
      '<div style="padding:12px;font:14px/1.45 system-ui,Segoe UI,Roboto,Arial">' +
      '<b>LingoCard:</b> не удалось загрузить модульную версию приложения.<br>' +
      'Открой DevTools → Console и пришли <i>первую</i> ошибку (самую верхнюю).<br>' +
      '<div style="margin-top:8px;color:#666">Fallback: js/app/app.legacy.js</div>' +
      '</div>';
    document.body.innerHTML = msg;
  }catch(e){
    // last resort
  }
})();
