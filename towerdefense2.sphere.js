/* towerdefense2.sphere.js — YourMine loader (auto-generated) */
/* Code hosted at: https://raw.githubusercontent.com/Keanuji/YourMinedApp/main/towerdefense2.sphere.code.js */
(function(){
'use strict';
window.YM_S=window.YM_S||{};
var _u='https://raw.githubusercontent.com/Keanuji/YourMinedApp/main/towerdefense2.sphere.code.js?t=';
fetch(_u+Date.now(),{cache:'no-store'}).then(function(r){
  if(!r.ok)throw new Error('Sphere load failed: '+r.status);
  return r.text();
}).then(function(code){
  var blob=new Blob([code],{type:'text/javascript'});
  var url=URL.createObjectURL(blob);
  var s=document.createElement('script');
  s.src=url;
  s.onload=function(){URL.revokeObjectURL(url);};
  s.onerror=function(){URL.revokeObjectURL(url);
    console.error('[YM] Failed to execute sphere: towerdefense2');};
  document.head.appendChild(s);
}).catch(function(e){
  console.error('[YM] Sphere load error (towerdefense2):', e.message);
});
})();