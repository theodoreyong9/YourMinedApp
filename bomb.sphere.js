/* jshint esversion:11, -W033, -W020 */
// bomb.sphere.js — Interface chaos test
// Teste ce qui est isolé et ce qui ne l'est pas
(function(){
'use strict';

const LOG=[];
function log(cat,msg,ok){
  LOG.push({cat,msg,ok,t:Date.now()});
  const el=document.getElementById('bomb-log');
  if(el) _renderLog(el);
}

// ── ATTAQUES ─────────────────────────────────────────────────────────────────

function attackGlobals(){
  // Tente d'écraser les globaux critiques
  try{window.YM=null;log('globals','window.YM = null',!window.YM);}catch(e){log('globals','window.YM write → '+e.message,true);}
  try{window.YM_Desk=null;log('globals','window.YM_Desk = null',!window.YM_Desk);}catch(e){log('globals','YM_Desk write → '+e.message,true);}
  try{window.YM_sphereRegistry=null;log('globals','YM_sphereRegistry = null',!window.YM_sphereRegistry);}catch(e){log('globals','registry write → '+e.message,true);}
  try{window.YM_P2P=null;log('globals','window.YM_P2P = null',!window.YM_P2P);}catch(e){log('globals','YM_P2P write → '+e.message,true);}
  try{
    const orig=window.fetch;
    window.fetch=()=>Promise.reject(new Error('fetch hijacked'));
    log('globals','window.fetch hijack',window.fetch===orig);
  }catch(e){log('globals','fetch hijack → '+e.message,true);}
}

function attackSocial(){
  // Tente de vider les near users de social
  try{
    const s=window.YM_Social;
    if(s&&s._nearUsers){s._nearUsers.clear();log('social','_nearUsers.clear()',true);}
    else{log('social','YM_Social._nearUsers not accessible',true);}
  }catch(e){log('social','nearUsers → '+e.message,true);}

  // Tente de déclencher un faux appel entrant
  try{
    window.dispatchEvent(new CustomEvent('ym:peer-join',{detail:{peerId:'FAKE-PEER'}}));
    log('social','ym:peer-join fake event dispatched',false);
  }catch(e){log('social','peer-join event → '+e.message,true);}

  // Tente d'ouvrir un faux profil
  try{
    window.YM_Social&&window.YM_Social.openProfile&&window.YM_Social.openProfile('00000000-0000-0000-0000-000000000000');
    log('social','openProfile(fake uuid) called',false);
  }catch(e){log('social','openProfile → '+e.message,true);}
}

function attackMine(){
  // Tente de lire les clés du wallet
  try{
    const kp=window.YM_Mine&&window.YM_Mine._wallet&&window.YM_Mine._wallet.keypair;
    if(kp&&kp.secretKey){log('mine','secretKey accessible!!! '+Array.from(kp.secretKey.slice(0,4)),false);}
    else{log('mine','_wallet.keypair not accessible',true);}
  }catch(e){log('mine','keypair read → '+e.message,true);}

  // Tente de modifier la balance affichée
  try{
    const el=document.getElementById('mine-sol');
    if(el){el.textContent='999999';log('mine','mine-sol DOM spoofed to 999999',false);}
    else{log('mine','mine-sol not in DOM',true);}
  }catch(e){log('mine','DOM spoof → '+e.message,true);}

  // Tente d'appeler signMessage sans unlock
  try{
    window.YM_Mine_sign&&window.YM_Mine_sign('EVIL_MESSAGE').then(()=>log('mine','signMessage succeeded without unlock!!',false)).catch(e=>log('mine','signMessage blocked: '+e.message,true));
  }catch(e){log('mine','signMessage → '+e.message,true);}
}

function attackStorage(){
  // Tente de lire le wallet chiffré
  try{
    const raw=localStorage.getItem('ym_wallet_v1');
    if(raw){log('storage','ym_wallet_v1 readable ('+raw.slice(0,30)+'…)',false);}
    else{log('storage','ym_wallet_v1 not found',true);}
  }catch(e){log('storage','wallet read → '+e.message,true);}

  // Tente d'effacer tout le localStorage
  try{
    const keys=Object.keys(localStorage);
    // On ne le fait PAS vraiment — juste on log ce qu'on pourrait faire
    log('storage','localStorage keys visible: '+keys.filter(k=>k.startsWith('ym')).join(', '),false);
  }catch(e){log('storage','localStorage → '+e.message,true);}

  // Tente d'écrire dans le storage namespaced d'une autre sphère
  try{
    localStorage.setItem('ym_s|social.sphere.js|hacked','1');
    const got=localStorage.getItem('ym_s|social.sphere.js|hacked');
    log('storage','cross-sphere storage write: '+(got?'SUCCESS':'blocked'),!got);
    localStorage.removeItem('ym_s|social.sphere.js|hacked');
  }catch(e){log('storage','cross-sphere storage → '+e.message,true);}
}

function attackDOM(){
  // Tente d'injecter du HTML dans le panel principal
  try{
    const panel=document.getElementById('panel-social-body')||document.getElementById('panel-mine-body');
    if(panel){
      const evil=document.createElement('div');
      evil.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(255,0,0,.5);display:flex;align-items:center;justify-content:center;font-size:48px;pointer-events:none';
      evil.textContent='💣 BOMBED';
      document.body.appendChild(evil);
      setTimeout(()=>evil.remove(),2000);
      log('DOM','injected overlay into body',false);
    }else{log('DOM','target panels not found',true);}
  }catch(e){log('DOM','overlay inject → '+e.message,true);}

  // Tente de modifier le titre du panel
  try{
    const titles=document.querySelectorAll('.panel-title,.ym-panel-title');
    if(titles.length){titles.forEach(t=>t.textContent='💣 HACKED');log('DOM','panel titles overwritten',false);}
    else{log('DOM','no panel titles found',true);}
  }catch(e){log('DOM','title overwrite → '+e.message,true);}
}

function attackNetwork(){
  // Tente un fetch vers un domaine bloqué
  try{
    fetch('https://api.github.com/').then(r=>log('network','fetch api.github.com → HTTP '+r.status,false)).catch(e=>log('network','fetch api.github.com blocked: '+e.message,true));
  }catch(e){log('network','fetch → '+e.message,true);}

  // Tente un fetch Solana/web3 (bloqué par le patch)
  try{
    fetch('https://solana.com/').then(r=>log('network','fetch solana.com → HTTP '+r.status,false)).catch(e=>log('network','fetch solana.com blocked: '+e.message,true));
  }catch(e){log('network','fetch → '+e.message,true);}

  // Tente WebSocket vers un relay Nostr
  try{
    const ws=new WebSocket('wss://relay.primal.net');
    ws.onopen=()=>{log('network','WebSocket relay.primal.net OPEN',false);ws.close();};
    ws.onerror=()=>log('network','WebSocket blocked',true);
    setTimeout(()=>{try{ws.close();}catch{}},3000);
  }catch(e){log('network','WebSocket → '+e.message,true);}
}

function attackNavigation(){
  // Tente de pousser un état de navigation malveillant
  try{
    history.pushState({evil:true},'','?hacked=1');
    log('nav','history.pushState hacked URL',false);
    history.back();
  }catch(e){log('nav','history.pushState → '+e.message,true);}

  // Tente de rediriger
  try{
    // On NE fait PAS le redirect, juste on log
    log('nav','window.location.href writable (not executed)',false);
  }catch(e){log('nav','location → '+e.message,true);}
}

// ── RENDER ────────────────────────────────────────────────────────────────────
function _renderLog(el){
  el.innerHTML='';
  const cats={};
  LOG.forEach(e=>{if(!cats[e.cat])cats[e.cat]=[];cats[e.cat].push(e);});
  Object.entries(cats).forEach(([cat,entries])=>{
    const sec=document.createElement('div');
    sec.style.cssText='margin-bottom:10px';
    sec.innerHTML='<div style="font-family:var(--font-d);font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text3);margin-bottom:4px">'+cat+'</div>';
    entries.forEach(e=>{
      const row=document.createElement('div');
      row.style.cssText='display:flex;align-items:flex-start;gap:6px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:11px;line-height:1.4';
      const icon=e.ok?'✅':'❌';
      const color=e.ok?'var(--text2)':'#f87171';
      row.innerHTML='<span style="flex-shrink:0">'+icon+'</span><span style="color:'+color+'">'+e.msg+'</span>';
      sec.appendChild(row);
    });
    el.appendChild(sec);
  });
}

function renderPanel(container){
  container.innerHTML='';
  container.style.cssText='display:flex;flex-direction:column;height:100%';

  const scroll=document.createElement('div');
  scroll.style.cssText='flex:1;overflow-y:auto;padding:14px';

  // Header
  const hdr=document.createElement('div');
  hdr.style.cssText='display:flex;align-items:center;gap:10px;margin-bottom:16px';
  hdr.innerHTML=
    '<div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#ef4444,#f97316);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">💣</div>'+
    '<div>'+
      '<div style="font-family:var(--font-d);font-size:13px;font-weight:700;letter-spacing:1px;color:#f87171;text-transform:uppercase">Bomb Test</div>'+
      '<div style="font-size:10px;color:var(--text3)">Sandbox security audit</div>'+
    '</div>';
  scroll.appendChild(hdr);

  // Notice
  const notice=document.createElement('div');
  notice.style.cssText='background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:var(--r-sm);padding:10px 12px;font-size:11px;color:var(--text2);margin-bottom:14px;line-height:1.5';
  notice.textContent='✅ = bloqué/isolé (bon) · ❌ = passé (faille potentielle). Cache à vider pour remettre à zéro.';
  scroll.appendChild(notice);

  // Boutons d'attaque
  const attacks=[
    ['💀 Globals','attackGlobals',attackGlobals],
    ['👻 Social','attackSocial',attackSocial],
    ['💰 Mine','attackMine',attackMine],
    ['🗄 Storage','attackStorage',attackStorage],
    ['🎨 DOM','attackDOM',attackDOM],
    ['🌐 Network','attackNetwork',attackNetwork],
    ['🧭 Navigation','attackNavigation',attackNavigation],
  ];

  const grid=document.createElement('div');
  grid.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:14px';
  attacks.forEach(([label,,fn])=>{
    const btn=document.createElement('button');
    btn.className='ym-btn ym-btn-ghost';
    btn.style.cssText='font-size:11px;border-color:rgba(239,68,68,.3);color:#f87171';
    btn.textContent=label;
    btn.addEventListener('click',()=>{fn();btn.style.opacity='.5';btn.disabled=true;});
    grid.appendChild(btn);
  });

  // Bouton ALL
  const allBtn=document.createElement('button');
  allBtn.className='ym-btn';
  allBtn.style.cssText='width:100%;background:linear-gradient(135deg,rgba(239,68,68,.15),rgba(249,115,22,.15));border:1px solid rgba(239,68,68,.4);color:#f87171;font-size:12px;margin-bottom:14px';
  allBtn.textContent='💣 LAUNCH ALL ATTACKS';
  allBtn.addEventListener('click',()=>{
    allBtn.disabled=true;allBtn.textContent='💥 Detonating…';
    attacks.forEach(([,,fn],i)=>setTimeout(fn,i*300));
    setTimeout(()=>{allBtn.textContent='💥 Done';},attacks.length*300+500);
  });

  scroll.appendChild(grid);
  scroll.appendChild(allBtn);

  // Log
  const logTitle=document.createElement('div');
  logTitle.style.cssText='font-family:var(--font-d);font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text3);margin-bottom:8px';
  logTitle.textContent='Results';
  scroll.appendChild(logTitle);

  const logEl=document.createElement('div');
  logEl.id='bomb-log';
  scroll.appendChild(logEl);

  container.appendChild(scroll);
}

window.YM_S['bomb.sphere.js']={
  name:'Bomb',
  icon:'💣',
  category:'Dev',
  description:'Security & sandbox audit — tests what is truly isolated',
  author:'yourmine-dev',
  emit:[],
  receive:[],

  activate(ctx){
    ctx.storage.set('alive','1');
  },

  deactivate(){},

  renderPanel
};

})();
