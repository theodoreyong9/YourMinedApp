/* jshint esversion:11, browser:true */
// striga.sphere.js — Striga Banking Sphere
// Auth HMAC directe ou via Worker — l'utilisateur ne voit jamais de technicité
(function(){
'use strict';
window.YM_S = window.YM_S || {};

const CFG_KEY  = 'ym_striga_cfg_v2';
const USER_KEY = 'ym_striga_user_v2';
const SANDBOX  = 'https://www.sandbox.striga.com/api/v1';

function loadCfg(){ try{ return JSON.parse(localStorage.getItem(CFG_KEY)||'{}'); }catch{ return {}; } }
function saveCfg(d){ localStorage.setItem(CFG_KEY, JSON.stringify(d)); }
function loadUser(){ try{ return JSON.parse(localStorage.getItem(USER_KEY)||'null'); }catch{ return null; } }
function saveUser(d){ if(d===null){ localStorage.removeItem(USER_KEY); } else { localStorage.setItem(USER_KEY, JSON.stringify(d)); } }

// ── HMAC-SHA256 ───────────────────────────────────────────────────────────────
async function hmacSign(method, endpoint, body, secret){
  const time = Date.now().toString();
  const sig = await crypto.subtle.sign('HMAC',
    await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
      {name:'HMAC',hash:'SHA-256'}, false, ['sign']),
    new TextEncoder().encode(time + method + endpoint + _md5(JSON.stringify(body))));
  return `HMAC ${time}:${Array.from(new Uint8Array(sig)).map(b=>b.toString(16).padStart(2,'0')).join('')}`;
}

// ── API ───────────────────────────────────────────────────────────────────────
async function api(method, endpoint, body={}){
  const cfg = loadCfg();

  // 1. Worker configuré (prod)
  if(cfg.workerUrl){
    const r = await fetch(cfg.workerUrl.replace(/\/$/,'')+'/proxy', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({method, endpoint, body})
    });
    const d = await r.json();
    if(!r.ok) throw new Error(d.error||d.errorDetails||d.message||'API '+r.status);
    return d;
  }

  // 2. Clés directes configurées (sandbox/prod direct)
  if(cfg.apiKey && cfg.apiSecret){
    const base = cfg.live ? 'https://api.striga.com/api/v1' : SANDBOX;
    const auth = await hmacSign(method, endpoint, body, cfg.apiSecret);
    const opts = { method, headers:{'Content-Type':'application/json','api-key':cfg.apiKey,'Authorization':auth} };
    if(method !== 'GET') opts.body = JSON.stringify(body);
    const r = await fetch(base + endpoint, opts);
    const d = await r.json();
    if(!r.ok) throw new Error(d.errorDetails||d.message||'API '+r.status);
    return d;
  }

  // 3. Mode démo (pas encore configuré)
  return _demo(endpoint, body);
}

function _demo(endpoint, body){
  if(endpoint.includes('/ping')) return {ok:true};
  if(endpoint.includes('/user/create')){
    const id='demo_'+Math.random().toString(36).slice(2,10);
    return {...body, id, userId:id, kycStatus:'NOT_STARTED', _demo:true};
  }
  if(endpoint.includes('/kyc/start')) return {verificationLink:'https://striga.com/kyc-sandbox'};
  if(endpoint.match(/\/user\/[^/]+$/)) return {kycStatus:'PENDING'};
  if(endpoint.includes('/wallets')) return {wallets:[{walletId:'demo_wallet',accounts:{EUR:{accountId:'demo_eur',availableBalance:'0',status:'ACTIVE'},BTC:{accountId:'demo_btc',availableBalance:'0',status:'ACTIVE'}}}]};
  if(endpoint.includes('/card')) return {cards:[], cardId:'demo_card_'+Date.now()};
  return {};
}

// ── MD5 ───────────────────────────────────────────────────────────────────────
function _md5(str){
  function s(x,y){const l=(x&0xffff)+(y&0xffff);return((x>>16)+(y>>16)+(l>>16)<<16)|(l&0xffff);}
  function r(n,c){return(n<<c)|(n>>>(32-c));}
  function c(q,a,b,x,S,t){return s(r(s(s(a,q),s(x,t)),S),b);}
  function ff(a,b,c,d,x,S,t){return c((b&c)|((~b)&d),a,b,x,S,t);}
  function gg(a,b,c,d,x,S,t){return c((b&d)|(c&(~d)),a,b,x,S,t);}
  function hh(a,b,c,d,x,S,t){return c(b^c^d,a,b,x,S,t);}
  function ii(a,b,c,d,x,S,t){return c(c^(b|(~d)),a,b,x,S,t);}
  str=unescape(encodeURIComponent(str));
  const x=Array(Math.ceil((str.length+8)/64)*16).fill(0);
  for(let i=0;i<str.length;i++)x[i>>2]|=str.charCodeAt(i)<<((i%4)*8);
  x[str.length>>2]|=0x80<<((str.length%4)*8);x[x.length-2]=str.length*8;
  let a=1732584193,b=-271733879,C=-1732584194,d=271733878;
  for(let i=0;i<x.length;i+=16){
    const[A,B,CC,D]=[a,b,C,d];
    a=ff(a,b,C,d,x[i],7,-680876936);d=ff(d,a,b,C,x[i+1],12,-389564586);C=ff(C,d,a,b,x[i+2],17,606105819);b=ff(b,C,d,a,x[i+3],22,-1044525330);
    a=ff(a,b,C,d,x[i+4],7,-176418897);d=ff(d,a,b,C,x[i+5],12,1200080426);C=ff(C,d,a,b,x[i+6],17,-1473231341);b=ff(b,C,d,a,x[i+7],22,-45705983);
    a=ff(a,b,C,d,x[i+8],7,1770035416);d=ff(d,a,b,C,x[i+9],12,-1958414417);C=ff(C,d,a,b,x[i+10],17,-42063);b=ff(b,C,d,a,x[i+11],22,-1990404162);
    a=ff(a,b,C,d,x[i+12],7,1804603682);d=ff(d,a,b,C,x[i+13],12,-40341101);C=ff(C,d,a,b,x[i+14],17,-1502002290);b=ff(b,C,d,a,x[i+15],22,1236535329);
    a=gg(a,b,C,d,x[i+1],5,-165796510);d=gg(d,a,b,C,x[i+6],9,-1069501632);C=gg(C,d,a,b,x[i+11],14,643717713);b=gg(b,C,d,a,x[i],20,-373897302);
    a=gg(a,b,C,d,x[i+5],5,-701558691);d=gg(d,a,b,C,x[i+10],9,38016083);C=gg(C,d,a,b,x[i+15],14,-660478335);b=gg(b,C,d,a,x[i+4],20,-405537848);
    a=gg(a,b,C,d,x[i+9],5,568446438);d=gg(d,a,b,C,x[i+14],9,-1019803690);C=gg(C,d,a,b,x[i+3],14,-187363961);b=gg(b,C,d,a,x[i+8],20,1163531501);
    a=gg(a,b,C,d,x[i+13],5,-1444681467);d=gg(d,a,b,C,x[i+2],9,-51403784);C=gg(C,d,a,b,x[i+7],14,1735328473);b=gg(b,C,d,a,x[i+12],20,-1926607734);
    a=hh(a,b,C,d,x[i+5],4,-378558);d=hh(d,a,b,C,x[i+8],11,-2022574463);C=hh(C,d,a,b,x[i+11],16,1839030562);b=hh(b,C,d,a,x[i+14],23,-35309556);
    a=hh(a,b,C,d,x[i+1],4,-1530992060);d=hh(d,a,b,C,x[i+4],11,1272893353);C=hh(C,d,a,b,x[i+7],16,-155497632);b=hh(b,C,d,a,x[i+10],23,-1094730640);
    a=hh(a,b,C,d,x[i+13],4,681279174);d=hh(d,a,b,C,x[i],11,-358537222);C=hh(C,d,a,b,x[i+3],16,-722521979);b=hh(b,C,d,a,x[i+6],23,76029189);
    a=hh(a,b,C,d,x[i+9],4,-640364487);d=hh(d,a,b,C,x[i+12],11,-421815835);C=hh(C,d,a,b,x[i+15],16,530742520);b=hh(b,C,d,a,x[i+2],23,-995338651);
    a=ii(a,b,C,d,x[i],6,-198630844);d=ii(d,a,b,C,x[i+7],10,1126891415);C=ii(C,d,a,b,x[i+14],15,-1416354905);b=ii(b,C,d,a,x[i+5],21,-57434055);
    a=ii(a,b,C,d,x[i+12],6,1700485571);d=ii(d,a,b,C,x[i+3],10,-1894986606);C=ii(C,d,a,b,x[i+10],15,-1051523);b=ii(b,C,d,a,x[i+1],21,-2054922799);
    a=ii(a,b,C,d,x[i+8],6,1873313359);d=ii(d,a,b,C,x[i+15],10,-30611744);C=ii(C,d,a,b,x[i+6],15,-1560198380);b=ii(b,C,d,a,x[i+13],21,1309151649);
    a=ii(a,b,C,d,x[i+4],6,-145523070);d=ii(d,a,b,C,x[i+11],10,-1120210379);C=ii(C,d,a,b,x[i+2],15,718787259);b=ii(b,C,d,a,x[i+9],21,-343485551);
    a=s(a,A);b=s(b,B);C=s(C,CC);d=s(d,D);
  }
  return[a,b,C,d].map(n=>[0,1,2,3].map(i=>((n>>>(i*8))&0xff).toString(16).padStart(2,'0')).join('')).join('');
}

// ── CSS ───────────────────────────────────────────────────────────────────────
function injectCSS(){
  if(document.getElementById('sg3-css')) return;
  const s=document.createElement('style'); s.id='sg3-css';
  s.textContent=`
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&family=DM+Mono:wght@400;500&display=swap');
.sg{font-family:'DM Sans',system-ui,sans-serif;display:flex;flex-direction:column;height:100%;overflow:hidden;background:#07070e;-webkit-font-smoothing:antialiased}
.sg *{box-sizing:border-box}
.sg-tabs{display:flex;padding:0 4px;border-bottom:1px solid rgba(255,255,255,.06);background:#07070e;flex-shrink:0}
.sg-tab{flex:1;background:none;border:none;padding:14px 0 12px;font-family:'DM Sans',sans-serif;font-size:11px;font-weight:500;color:rgba(255,255,255,.3);cursor:pointer;border-bottom:2px solid transparent;transition:all .2s;-webkit-tap-highlight-color:transparent;position:relative}
.sg-tab.on{color:#fff;border-bottom-color:#7c3aed}
.sg-tab.on::after{content:'';position:absolute;bottom:-1px;left:25%;right:25%;height:2px;border-radius:1px;background:#7c3aed;box-shadow:0 0 12px rgba(124,58,237,.6)}
.sg-body{flex:1;overflow-y:auto;padding:20px 18px;-webkit-overflow-scrolling:touch}
.sg-body::-webkit-scrollbar{width:2px}
.sg-body::-webkit-scrollbar-thumb{background:rgba(124,58,237,.3);border-radius:1px}
.sg-h1{font-size:22px;font-weight:600;letter-spacing:-.5px;color:#fff;margin-bottom:4px}
.sg-sub{font-size:13px;color:rgba(255,255,255,.4);line-height:1.5;margin-bottom:24px}
.sg-section{font-family:'DM Mono',monospace;font-size:9px;font-weight:500;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,.25);margin-bottom:12px;margin-top:4px}
.sg-label{display:block;font-size:10px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:rgba(255,255,255,.3);margin-bottom:8px;font-family:'DM Mono',monospace}
.sg-inp{width:100%;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:14px 16px;color:#fff;font-family:'DM Sans',sans-serif;font-size:14px;outline:none;-webkit-appearance:none;transition:border-color .2s,background .2s;margin-bottom:14px}
.sg-inp:focus{border-color:rgba(124,58,237,.6);background:rgba(255,255,255,.06);box-shadow:0 0 0 3px rgba(124,58,237,.1)}
.sg-inp::placeholder{color:rgba(255,255,255,.2)}
.sg-cta{width:100%;padding:15px;border:none;border-radius:14px;font-family:'DM Sans',sans-serif;font-size:15px;font-weight:600;cursor:pointer;transition:all .2s;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;box-shadow:0 8px 24px rgba(124,58,237,.3);margin-bottom:10px}
.sg-cta:hover{transform:translateY(-1px);box-shadow:0 12px 32px rgba(124,58,237,.4)}
.sg-cta:active{transform:scale(.98)}
.sg-cta:disabled{opacity:.4;cursor:not-allowed;transform:none}
.sg-btn{width:100%;padding:13px;border-radius:14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);color:rgba(255,255,255,.7);font-family:'DM Sans',sans-serif;font-size:14px;font-weight:500;cursor:pointer;transition:all .2s;margin-bottom:10px}
.sg-btn:hover{border-color:rgba(124,58,237,.4);color:#fff;background:rgba(124,58,237,.08)}
.sg-btn.danger{border-color:rgba(239,68,68,.3);color:rgba(239,68,68,.8)}
.sg-btn.danger:hover{background:rgba(239,68,68,.08);color:#f87171}
.sg-card{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:20px;padding:20px;margin-bottom:14px}
.sg-badge{display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:999px;font-size:11px;font-weight:600;font-family:'DM Mono',monospace}
.sg-badge.ok{background:rgba(52,211,153,.1);color:#34d399;border:1px solid rgba(52,211,153,.2)}
.sg-badge.pend{background:rgba(124,58,237,.1);color:#a78bfa;border:1px solid rgba(124,58,237,.2)}
.sg-badge.err{background:rgba(239,68,68,.1);color:#f87171;border:1px solid rgba(239,68,68,.2)}
.sg-notice{padding:12px 16px;border-radius:12px;font-size:12px;line-height:1.6;margin-bottom:14px;display:flex;gap:10px;align-items:flex-start}
.sg-notice.ok{background:rgba(52,211,153,.07);border:1px solid rgba(52,211,153,.2);color:#34d399}
.sg-notice.info{background:rgba(124,58,237,.07);border:1px solid rgba(124,58,237,.2);color:#a78bfa}
.sg-notice.err{background:rgba(239,68,68,.07);border:1px solid rgba(239,68,68,.2);color:#f87171}
.sg-spin{width:18px;height:18px;border:2px solid rgba(255,255,255,.1);border-top-color:#7c3aed;border-radius:50%;animation:sg-r .6s linear infinite;display:inline-block;vertical-align:middle}
@keyframes sg-r{to{transform:rotate(360deg)}}
.sg-g2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}
.sg-row{display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.04)}
.sg-row:last-child{border-bottom:none}
@keyframes sg-up{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.sg-in{animation:sg-up .3s ease forwards}
.sg-hero{border-radius:22px;padding:22px;margin-bottom:20px;position:relative;overflow:hidden;background:linear-gradient(135deg,#0f0527,#1e0b4d,#2d1270)}
.sg-hero::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 70% 20%,rgba(124,58,237,.4),transparent 60%);pointer-events:none}
.sg-vcard{border-radius:22px;padding:24px;margin-bottom:20px;aspect-ratio:1.586;display:flex;flex-direction:column;justify-content:space-between;background:linear-gradient(135deg,#0a0020,#1a0050,#2d1270);box-shadow:0 20px 60px rgba(124,58,237,.25);position:relative;overflow:hidden}
.sg-vcard::before{content:'';position:absolute;top:-40px;right:-40px;width:180px;height:180px;border-radius:50%;background:rgba(124,58,237,.15);pointer-events:none}
.sg-group{margin-bottom:20px}
.sg-demo-bar{background:rgba(124,58,237,.12);border-bottom:1px solid rgba(124,58,237,.2);padding:8px 18px;font-size:11px;color:#a78bfa;display:flex;align-items:center;gap:8px;flex-shrink:0;font-family:'DM Mono',monospace}
`;
  document.head.appendChild(s);
}

function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function $id(id){ return document.getElementById(id); }

function mkInp(label, id, ph, type='text', val=''){
  const d=document.createElement('div');
  d.innerHTML=`<label class="sg-label">${esc(label)}</label><input class="sg-inp" id="${id}" type="${type}" placeholder="${esc(ph)}" value="${esc(val)}">`;
  return d;
}
function mkNotice(msg, type='info'){
  const d=document.createElement('div'); d.className=`sg-notice ${type} sg-in`;
  d.innerHTML=`<span>${type==='ok'?'✓':type==='err'?'✕':'ℹ'}</span><span>${esc(msg)}</span>`;
  return d;
}
function mkSpin(){ const d=document.createElement('span'); d.className='sg-spin'; return d; }

// ── TAB STATE ─────────────────────────────────────────────────────────────────
let _tab='home';
function isDemo(){ const c=loadCfg(); return !c.workerUrl && (!c.apiKey || !c.apiSecret); }

// ── RENDER PRINCIPAL ──────────────────────────────────────────────────────────
function renderPanel(container){
  injectCSS();
  container.innerHTML='';
  container.className='sg';

  const tabs=document.createElement('div'); tabs.className='sg-tabs';
  [['home','🏠'],['wallet','💳'],['kyc','👤'],['card','🃏'],['settings','⚙']].forEach(([id,icon])=>{
    const b=document.createElement('button');
    b.className='sg-tab'+(_tab===id?' on':'');
    b.textContent=icon; b.title=id;
    b.addEventListener('click',()=>{ _tab=id; renderPanel(container); });
    tabs.appendChild(b);
  });
  container.appendChild(tabs);

  if(isDemo() && _tab!=='settings'){
    const bar=document.createElement('div'); bar.className='sg-demo-bar';
    bar.innerHTML='<span>◉</span><span>Mode démo — vos vraies clés Striga dans ⚙</span>';
    container.appendChild(bar);
  }

  const body=document.createElement('div'); body.className='sg-body';
  container.appendChild(body);

  if(_tab==='home')       tabHome(body,container);
  else if(_tab==='wallet')tabWallet(body);
  else if(_tab==='kyc')   tabKYC(body,container);
  else if(_tab==='card')  tabCard(body,container);
  else                    tabSettings(body,container);
}

// ── HOME ──────────────────────────────────────────────────────────────────────
function tabHome(body,root){
  body.classList.add('sg-in');
  const user=loadUser();
  const hero=document.createElement('div'); hero.className='sg-hero';
  hero.innerHTML=`<div style="position:relative;z-index:1">
    <div style="font-family:'DM Mono',monospace;font-size:9px;color:rgba(255,255,255,.35);letter-spacing:2px;margin-bottom:14px">STRIGA · BANKING</div>
    <div style="font-size:24px;font-weight:600;color:#fff;letter-spacing:-.5px;margin-bottom:4px">${user?esc(user.firstName+' '+user.lastName):'Mon compte'}</div>
    <div style="font-size:13px;color:rgba(255,255,255,.4)">${user?esc((user.id||user.userId||'').slice(0,22)+'…'):'KYC requis pour activer'}</div>
    ${user?`<div style="margin-top:14px"><span class="sg-badge ${user.kycStatus==='APPROVED'?'ok':'pend'}">${user.kycStatus==='APPROVED'?'✓ Vérifié':'⏳ En attente'}</span></div>`:''}
  </div>`;
  body.appendChild(hero);

  const g=document.createElement('div'); g.className='sg-g2';
  [['💳','Wallet','wallet'],['👤','Vérification','kyc'],['🃏','Carte','card'],['⚙','Réglages','settings']].forEach(([icon,label,tab])=>{
    const c=document.createElement('div');
    c.className='sg-card'; c.style.cssText='cursor:pointer;text-align:center;padding:18px 12px;transition:border-color .2s';
    c.innerHTML=`<div style="font-size:28px;margin-bottom:8px">${icon}</div><div style="font-size:12px;font-weight:500;color:rgba(255,255,255,.6)">${label}</div>`;
    c.addEventListener('mouseenter',()=>c.style.borderColor='rgba(124,58,237,.3)');
    c.addEventListener('mouseleave',()=>c.style.borderColor='');
    c.addEventListener('click',()=>{ _tab=tab; renderPanel(root); });
    g.appendChild(c);
  });
  body.appendChild(g);

  if(!user){
    const cta=document.createElement('button'); cta.className='sg-cta';
    cta.textContent='Créer mon compte →';
    cta.addEventListener('click',()=>{ _tab='kyc'; renderPanel(root); });
    body.appendChild(cta);
  }
}

// ── KYC ───────────────────────────────────────────────────────────────────────
function tabKYC(body,root){
  body.classList.add('sg-in');
  const user=loadUser();
  if(user){ kycStatus(body,user,root); return; }

  body.innerHTML='';
  body.innerHTML='<div class="sg-h1">Créer un compte</div><div class="sg-sub">Vérification d\'identité pour activer votre wallet et carte Mastercard.</div>';
  const fb=document.createElement('div'); body.appendChild(fb);

  const s1=document.createElement('div'); s1.className='sg-group';
  s1.innerHTML='<div class="sg-section">Identité</div>';
  const nr=document.createElement('div'); nr.className='sg-g2'; nr.style.marginBottom='0';
  const fF=mkInp('Prénom','sg-fn','Jean'); fF.querySelector('.sg-inp').style.marginBottom='0';
  const fL=mkInp('Nom','sg-ln','Dupont'); fL.querySelector('.sg-inp').style.marginBottom='0';
  nr.appendChild(fF); nr.appendChild(fL); s1.appendChild(nr);
  s1.style.marginTop='14px';
  s1.appendChild(mkInp('Date de naissance','sg-dob','1990-01-15'));
  s1.appendChild(mkInp('Nationalité (FR, DE…)','sg-nat','FR'));
  body.appendChild(s1);

  const s2=document.createElement('div'); s2.className='sg-group';
  s2.innerHTML='<div class="sg-section">Contact</div>';
  s2.appendChild(mkInp('Email','sg-email','jean@example.com','email'));
  s2.appendChild(mkInp('Téléphone (+33…)','sg-tel','+33612345678','tel'));
  body.appendChild(s2);

  const s3=document.createElement('div'); s3.className='sg-group';
  s3.innerHTML='<div class="sg-section">Adresse</div>';
  s3.appendChild(mkInp('Adresse','sg-addr','12 rue de la Paix'));
  const cr=document.createElement('div'); cr.className='sg-g2'; cr.style.marginBottom='0';
  const fC=mkInp('Ville','sg-city','Paris'); fC.querySelector('.sg-inp').style.marginBottom='0';
  const fP=mkInp('Code postal','sg-postal','75001'); fP.querySelector('.sg-inp').style.marginBottom='0';
  cr.appendChild(fC); cr.appendChild(fP); s3.appendChild(cr);
  s3.style.marginTop='14px';
  s3.appendChild(mkInp('Pays de résidence','sg-country','FR'));
  body.appendChild(s3);

  const cta=document.createElement('button'); cta.className='sg-cta';
  cta.textContent='Créer mon compte';
  cta.addEventListener('click',async()=>{
    cta.disabled=true; cta.innerHTML=''; cta.appendChild(mkSpin());
    const dob=($id('sg-dob')?.value||'').split('-');
    const bdy={
      firstName:  $id('sg-fn')?.value.trim()||'',
      lastName:   $id('sg-ln')?.value.trim()||'',
      dateOfBirth:{year:+dob[0]||1990,month:+dob[1]||1,day:+dob[2]||1},
      email:      $id('sg-email')?.value.trim()||'',
      mobile:     {phoneNumber:($id('sg-tel')?.value.trim()||'').replace(/\s/g,'').replace(/^\+/,'')},
      nationality:($id('sg-nat')?.value.trim()||'FR').toUpperCase(),
      address:{
        addressLine1: $id('sg-addr')?.value.trim()||'',
        city:         $id('sg-city')?.value.trim()||'',
        postalCode:   $id('sg-postal')?.value.trim()||'',
        state:'',
        country:      ($id('sg-country')?.value.trim()||'FR').toUpperCase()
      }
    };
    try{
      const r=await api('POST','/user/create',bdy);
      saveUser({...r,kycStatus:'NOT_STARTED'});
      window.YM_toast?.('Compte créé !','success');
      tabKYC(body,root);
    }catch(e){
      fb.innerHTML=''; fb.appendChild(mkNotice('Erreur : '+e.message,'err'));
      cta.disabled=false; cta.textContent='Créer mon compte';
    }
  });
  body.appendChild(cta);
}

function kycStatus(body,user,root){
  body.innerHTML='';
  const c=document.createElement('div'); c.className='sg-card';
  c.innerHTML=`
    <div class="sg-row" style="padding-top:0">
      <div style="display:flex;align-items:center;gap:14px">
        <div style="width:48px;height:48px;border-radius:16px;background:rgba(124,58,237,.15);display:flex;align-items:center;justify-content:center;font-size:22px">👤</div>
        <div>
          <div style="font-size:16px;font-weight:600;color:#fff">${esc(user.firstName||'')} ${esc(user.lastName||'')}</div>
          <div style="font-size:11px;color:rgba(255,255,255,.3);font-family:'DM Mono',monospace;margin-top:2px">${esc((user.id||user.userId||'').slice(0,24)+'…')}</div>
        </div>
      </div>
      <span class="sg-badge ${user.kycStatus==='APPROVED'?'ok':'pend'}">${esc(user.kycStatus||'PENDING')}</span>
    </div>
    <div class="sg-row">
      <span style="font-size:12px;color:rgba(255,255,255,.4)">Email</span>
      <span style="font-size:13px;color:rgba(255,255,255,.7)">${esc(user.email||'—')}</span>
    </div>
    ${user._demo?'<div class="sg-row" style="padding-bottom:0"><span style="font-size:11px;color:#a78bfa;font-family:\'DM Mono\',monospace">◉ Mode démo</span></div>':''}`;
  body.appendChild(c);
  const fb=document.createElement('div'); body.appendChild(fb);

  if(user.kycStatus!=='APPROVED'){
    const kBtn=document.createElement('button'); kBtn.className='sg-cta';
    kBtn.textContent='🪪 Vérifier mon identité';
    kBtn.addEventListener('click',async()=>{
      kBtn.disabled=true; kBtn.innerHTML=''; kBtn.appendChild(mkSpin()); kBtn.appendChild(document.createTextNode(' Chargement…'));
      try{
        const r=await api('POST',`/user/${user.id||user.userId}/kyc/start`,{});
        if(r.verificationLink) window.open(r.verificationLink,'_blank');
        fb.innerHTML=''; fb.appendChild(mkNotice('Lien de vérification ouvert. Revenez ici une fois terminé.','info'));
        kBtn.disabled=false; kBtn.textContent='🪪 Vérifier mon identité';
      }catch(e){fb.innerHTML='';fb.appendChild(mkNotice('Erreur : '+e.message,'err'));kBtn.disabled=false;kBtn.textContent='🪪 Vérifier mon identité';}
    });
    body.appendChild(kBtn);
    const rBtn=document.createElement('button'); rBtn.className='sg-btn'; rBtn.textContent='↻  Actualiser le statut';
    rBtn.addEventListener('click',async()=>{
      rBtn.disabled=true; rBtn.textContent='Vérification…';
      try{
        const r=await api('GET',`/user/${user.id||user.userId}`,{});
        saveUser({...user,...r});
        window.YM_toast?.(r.kycStatus==='APPROVED'?'KYC approuvé ! 🎉':'Statut : '+r.kycStatus,'info');
        tabKYC(body,root);
      }catch(e){fb.innerHTML='';fb.appendChild(mkNotice('Erreur : '+e.message,'err'));rBtn.disabled=false;rBtn.textContent='↻  Actualiser';}
    });
    body.appendChild(rBtn);
  }else{
    body.appendChild(mkNotice('Identité vérifiée. Wallet et carte disponibles.','ok'));
  }
}

// ── WALLET ────────────────────────────────────────────────────────────────────
function tabWallet(body){
  body.classList.add('sg-in');
  const user=loadUser();
  if(!user){ body.appendChild(mkNotice('Créez un compte (onglet 👤)','info')); return; }
  const h=document.createElement('div'); h.className='sg-h1'; h.style.marginBottom='20px'; h.textContent='Mon Wallet'; body.appendChild(h);
  const fb=document.createElement('div'); body.appendChild(fb);
  const wrap=document.createElement('div'); wrap.style.cssText='padding:40px;display:flex;justify-content:center'; wrap.appendChild(mkSpin()); body.appendChild(wrap);
  api('POST',`/user/${user.id||user.userId}/wallets`,{startDate:0,endDate:Date.now(),page:0}).then(r=>{
    wrap.remove();
    const wallets=r.wallets||[];
    if(!wallets.length){ fb.appendChild(mkNotice('Aucun wallet. Complétez le KYC.','info')); return; }
    wallets.forEach(w=>{
      const wc=document.createElement('div'); wc.className='sg-card';
      const wh=document.createElement('div');
      wh.style.cssText="font-family:'DM Mono',monospace;font-size:9px;color:rgba(255,255,255,.25);letter-spacing:1px;margin-bottom:16px";
      wh.textContent='WALLET · '+(w.walletId||w.id||'').slice(0,16)+'…'; wc.appendChild(wh);
      Object.entries(w.accounts||{}).forEach(([cur,acc])=>{
        const icons={EUR:'€',BTC:'₿',ETH:'Ξ',USDC:'$',SOL:'◎'};
        const row=document.createElement('div'); row.className='sg-row';
        const bal=acc.availableBalance?((parseInt(acc.availableBalance)/100).toFixed(2)):'0.00';
        row.innerHTML=`<div style="display:flex;align-items:center;gap:12px">
          <div style="width:40px;height:40px;border-radius:14px;background:rgba(124,58,237,.12);display:flex;align-items:center;justify-content:center;font-size:18px">${icons[cur]||'💰'}</div>
          <div><div style="font-size:15px;font-weight:500;color:#fff">${esc(cur)}</div><div style="font-size:11px;color:rgba(255,255,255,.3)">${esc(acc.status||'')}</div></div>
        </div>
        <div style="text-align:right">
          <div style="font-size:20px;font-weight:600;color:#fff">${esc(bal)}</div>
          <div style="font-size:10px;color:rgba(255,255,255,.3)">disponible</div>
        </div>`;
        wc.appendChild(row);
      });
      body.appendChild(wc);
    });
  }).catch(e=>{ wrap.remove(); fb.appendChild(mkNotice('Erreur : '+e.message,'err')); });
}

// ── CARD ──────────────────────────────────────────────────────────────────────
function tabCard(body,root){
  body.classList.add('sg-in');
  const user=loadUser();
  if(!user||user.kycStatus!=='APPROVED'){
    body.appendChild(mkNotice(!user?'Créez un compte (onglet 👤)':'KYC requis pour émettre une carte.','info'));
    if(!user){ const b=document.createElement('button');b.className='sg-cta';b.style.marginTop='10px';b.textContent='Créer un compte →';b.addEventListener('click',()=>{_tab='kyc';renderPanel(root);}); body.appendChild(b); }
    return;
  }
  const h=document.createElement('div'); h.className='sg-h1'; h.style.marginBottom='20px'; h.textContent='Ma Carte'; body.appendChild(h);
  const vc=document.createElement('div'); vc.className='sg-vcard';
  vc.innerHTML=`<div style="position:relative;z-index:1;font-family:'DM Mono',monospace;font-size:10px;color:rgba(255,255,255,.4);letter-spacing:2px">STRIGA</div>
    <div style="position:relative;z-index:1">
      <div style="font-family:'DM Mono',monospace;font-size:16px;color:rgba(255,255,255,.7);letter-spacing:3px;margin-bottom:18px">•••• •••• •••• ••••</div>
      <div style="display:flex;justify-content:space-between;align-items:flex-end">
        <div>
          <div style="font-size:9px;color:rgba(255,255,255,.35);letter-spacing:1px;margin-bottom:3px">TITULAIRE</div>
          <div style="font-size:14px;font-weight:500;color:#fff">${esc((user.firstName||'').toUpperCase()+' '+(user.lastName||'').toUpperCase())}</div>
        </div>
        <div style="font-family:'DM Mono',monospace;font-size:11px;color:rgba(255,255,255,.3);letter-spacing:2px">MASTERCARD</div>
      </div>
    </div>`;
  body.appendChild(vc);
  const fb=document.createElement('div'); body.appendChild(fb);
  const cardsEl=document.createElement('div'); body.appendChild(cardsEl);
  const g=document.createElement('div'); g.className='sg-g2';
  const vBtn=document.createElement('button'); vBtn.className='sg-cta'; vBtn.style.margin='0'; vBtn.textContent='Mes cartes';
  vBtn.addEventListener('click',async()=>{
    vBtn.disabled=true; vBtn.textContent='…'; cardsEl.innerHTML='';
    try{
      const r=await api('GET',`/card/all?userId=${user.id||user.userId}`,{});
      const cards=r.cards||r.data||[];
      if(!cards.length) fb.appendChild(mkNotice('Aucune carte. Émettez-en une →','info'));
      cards.forEach(c=>{
        const cc=document.createElement('div'); cc.className='sg-card'; cc.style.marginBottom='10px';
        cc.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center">
          <div style="font-family:'DM Mono',monospace;font-size:15px;color:#fff">•••• ${esc(c.maskedCardNumber?.slice(-4)||'••••')}</div>
          <span class="sg-badge ${c.status==='ACTIVE'?'ok':'err'}">${esc(c.status||'')}</span>
        </div>`;
        cardsEl.appendChild(cc);
      });
      vBtn.disabled=false; vBtn.textContent='Mes cartes';
    }catch(e){fb.innerHTML='';fb.appendChild(mkNotice('Erreur : '+e.message,'err'));vBtn.disabled=false;vBtn.textContent='Mes cartes';}
  });
  g.appendChild(vBtn);
  const iBtn=document.createElement('button'); iBtn.className='sg-btn'; iBtn.style.margin='0'; iBtn.textContent='+ Émettre';
  iBtn.addEventListener('click',async()=>{
    iBtn.disabled=true; iBtn.textContent='…';
    try{
      const wr=await api('POST',`/user/${user.id||user.userId}/wallets`,{startDate:0,endDate:Date.now(),page:0});
      const wallet=(wr.wallets||[])[0];
      const eurAcc=Object.entries(wallet?.accounts||{}).find(([c])=>c==='EUR');
      if(!eurAcc){ fb.appendChild(mkNotice('Aucun compte EUR.','err')); iBtn.disabled=false; iBtn.textContent='+ Émettre'; return; }
      await api('POST','/card/issue',{userId:user.id||user.userId,accountId:eurAcc[1].accountId||eurAcc[1].id,cardType:'VIRTUAL'});
      window.YM_toast?.('Carte émise ! 🎉','success');
      iBtn.disabled=false; iBtn.textContent='+ Émettre';
    }catch(e){fb.innerHTML='';fb.appendChild(mkNotice('Erreur : '+e.message,'err'));iBtn.disabled=false;iBtn.textContent='+ Émettre';}
  });
  g.appendChild(iBtn);
  body.insertBefore(g,fb);
}

// ── SETTINGS ──────────────────────────────────────────────────────────────────
function tabSettings(body,root){
  body.classList.add('sg-in');
  const cfg=loadCfg(); const user=loadUser();
  body.innerHTML='<div class="sg-h1" style="margin-bottom:20px">Réglages</div>';
  const fb=document.createElement('div'); body.appendChild(fb);

  if(user){
    const uc=document.createElement('div'); uc.className='sg-card';
    uc.innerHTML=`<div class="sg-section">Compte actif</div>
      <div style="font-size:16px;font-weight:500;color:#fff;margin-bottom:4px">${esc(user.firstName||'')} ${esc(user.lastName||'')}</div>
      <div style="font-size:11px;color:rgba(255,255,255,.3);font-family:'DM Mono',monospace">${esc(user.id||user.userId||'')}</div>`;
    body.appendChild(uc);
  }

  // Explication simple et honnête
  const explCard=document.createElement('div'); explCard.className='sg-card';
  explCard.innerHTML=`<div class="sg-section">Connexion à Striga</div>
    <div style="font-size:13px;color:rgba(255,255,255,.5);line-height:1.7;margin-bottom:16px">
      Pour utiliser vos vraies clés API Striga (depuis votre dashboard striga.com), renseignez-les ci-dessous.<br>
      Sans clés configurées, l'application fonctionne en <strong style="color:#a78bfa">mode démo</strong>.
    </div>`;
  explCard.appendChild(mkInp('API Key','sg-apikey','sk_live_…','text',cfg.apiKey||''));
  explCard.appendChild(mkInp('API Secret','sg-apisec','…','password',cfg.apiSecret||''));
  const envRow=document.createElement('div');
  envRow.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:4px 0 16px';
  envRow.innerHTML=`<span style="font-size:13px;color:rgba(255,255,255,.5)">Environnement</span>
    <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
      <input type="checkbox" id="sg-live" ${cfg.live?'checked':''} style="width:16px;height:16px;accent-color:#7c3aed">
      <span style="font-size:13px;color:rgba(255,255,255,.5)">Production</span>
    </label>`;
  explCard.appendChild(envRow);

  // Worker (optionnel, pour les devs qui construisent leur propre néobank)
  const devToggle=document.createElement('div');
  devToggle.style.cssText='font-size:11px;color:rgba(124,58,237,.6);cursor:pointer;text-decoration:underline;margin-bottom:12px;font-family:"DM Mono",monospace';
  devToggle.textContent='⚙ Options avancées (développeurs)';
  const devSection=document.createElement('div'); devSection.style.display='none';
  devSection.appendChild(mkInp('Worker URL (optionnel)','sg-worker','https://…workers.dev','url',cfg.workerUrl||''));
  devToggle.addEventListener('click',()=>{ devSection.style.display=devSection.style.display==='none'?'block':'none'; });
  explCard.appendChild(devToggle);
  explCard.appendChild(devSection);

  const saveBtn=document.createElement('button'); saveBtn.className='sg-cta'; saveBtn.textContent='Sauvegarder';
  saveBtn.addEventListener('click',async()=>{
    saveCfg({ apiKey:$id('sg-apikey')?.value.trim()||'', apiSecret:$id('sg-apisec')?.value.trim()||'', workerUrl:$id('sg-worker')?.value.trim()||'', live:$id('sg-live')?.checked||false });
    saveBtn.disabled=true; saveBtn.textContent='Test…';
    try{ await api('POST','/ping',{}); fb.innerHTML=''; fb.appendChild(mkNotice('Connexion OK ✓','ok')); }
    catch(e){ fb.innerHTML=''; fb.appendChild(mkNotice('Erreur : '+e.message,'err')); }
    saveBtn.disabled=false; saveBtn.textContent='Sauvegarder';
    renderPanel(body.parentElement||root);
  });
  explCard.appendChild(saveBtn);
  body.appendChild(explCard);

  if(user){
    const rBtn=document.createElement('button'); rBtn.className='sg-btn danger'; rBtn.textContent='Supprimer les données locales';
    rBtn.addEventListener('click',()=>{ if(confirm('Supprimer le compte sauvegardé ?')){ saveUser(null); window.YM_toast?.('Données supprimées','info'); renderPanel(body.parentElement||root); } });
    body.appendChild(rBtn);
  }
}

// ── EXPORT ────────────────────────────────────────────────────────────────────
window.YM_S['striga.sphere.js']={
  name:'Striga', icon:'🟣', category:'Finance',
  description:'Banking API — KYC, wallet EUR/crypto, carte virtuelle Mastercard',
  emit:[], receive:[],
  activate: function(){ injectCSS(); },
  deactivate: function(){},
  renderPanel,
  profileSection: function(container){
    const user=loadUser(); if(!user) return;
    injectCSS();
    const el=document.createElement('div'); el.style.fontFamily="'DM Sans',system-ui,sans-serif";
    el.innerHTML=`<div style="display:flex;align-items:center;gap:12px;background:linear-gradient(135deg,#0f0527,#1e0b4d);border-radius:16px;padding:14px">
      <div style="width:42px;height:42px;border-radius:14px;background:rgba(124,58,237,.2);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">🟣</div>
      <div style="flex:1">
        <div style="font-size:14px;font-weight:600;color:#fff">${esc(user.firstName||'')} ${esc(user.lastName||'')}</div>
        <div style="font-size:11px;color:rgba(255,255,255,.4);margin-top:2px">KYC: ${esc(user.kycStatus||'—')}</div>
      </div>
      <span style="font-size:10px;padding:4px 10px;border-radius:999px;font-family:'DM Mono',monospace;background:${user.kycStatus==='APPROVED'?'rgba(52,211,153,.1)':'rgba(124,58,237,.1)'};color:${user.kycStatus==='APPROVED'?'#34d399':'#a78bfa'};border:1px solid ${user.kycStatus==='APPROVED'?'rgba(52,211,153,.2)':'rgba(124,58,237,.2)'}">${user.kycStatus==='APPROVED'?'Actif':'En attente'}</span>
    </div>`;
    container.appendChild(el);
  }
};
})();
