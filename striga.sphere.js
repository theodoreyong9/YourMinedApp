/* jshint esversion:11, browser:true */
// striga.sphere.js — Striga Banking API
// KYC onboarding, wallet, carte virtuelle Mastercard
(function(){
'use strict';
window.YM_S=window.YM_S||{};

const CFG_KEY   ='ym_striga_cfg_v1';
const USER_KEY  ='ym_striga_user_v1';
const DEFAULT_WORKER='https://striga-proxy.yourmine.workers.dev';

function loadCfg(){try{return JSON.parse(localStorage.getItem(CFG_KEY)||'{}');}catch(e){return{};}}
function saveCfg(d){localStorage.setItem(CFG_KEY,JSON.stringify(d));}
function loadUser(){try{return JSON.parse(localStorage.getItem(USER_KEY)||'null');}catch(e){return null;}}
function saveUser(d){localStorage.setItem(USER_KEY,JSON.stringify(d));}

// ── HMAC AUTH ─────────────────────────────────────────────────────────────────
async function calcHMAC(method,endpoint,body,secret){
  const time=Date.now().toString();
  const bodyStr=JSON.stringify(body);
  const md5hex=_md5(bodyStr);
  const message=time+method+endpoint+md5hex;
  const keyBuf=new TextEncoder().encode(secret);
  const sigBuf=new TextEncoder().encode(message);
  const cryptoKey=await crypto.subtle.importKey('raw',keyBuf,{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const sig=await crypto.subtle.sign('HMAC',cryptoKey,sigBuf);
  const hex=Array.from(new Uint8Array(sig)).map(b=>b.toString(16).padStart(2,'0')).join('');
  return `HMAC ${time}:${hex}`;
}

async function strigaFetch(method,endpoint,body={}){
  const cfg=loadCfg();
  const workerUrl=cfg.workerUrl||DEFAULT_WORKER;

  if(workerUrl){
    const r=await fetch(workerUrl.replace(/\/$/,'')+'/proxy',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({method,endpoint,body})
    });
    const data=await r.json();
    if(!r.ok)throw new Error(data.error||data.errorDetails||data.message||'API error '+r.status);
    return data;
  }

  if(!cfg.apiKey||!cfg.apiSecret)throw new Error('Not configured');
  const auth=await calcHMAC(method,endpoint,body,cfg.apiSecret);
  const base=cfg.live?'https://api.striga.com/api/v1':'https://www.sandbox.striga.com/api/v1';
  const opts={method,headers:{'Content-Type':'application/json','api-key':cfg.apiKey,'Authorization':auth}};
  if(method!=='GET')opts.body=JSON.stringify(body);
  const r=await fetch(base+endpoint,opts);
  const data=await r.json();
  if(!r.ok)throw new Error(data.errorDetails||data.message||'API error '+r.status);
  return data;
}

// ── MD5 ───────────────────────────────────────────────────────────────────────
function _md5(str){
  function safeAdd(x,y){const lsw=(x&0xffff)+(y&0xffff);const msw=(x>>16)+(y>>16)+(lsw>>16);return(msw<<16)|(lsw&0xffff);}
  function bitRotateLeft(num,cnt){return(num<<cnt)|(num>>>(32-cnt));}
  function md5cmn(q,a,b,x,s,t){return safeAdd(bitRotateLeft(safeAdd(safeAdd(a,q),safeAdd(x,t)),s),b);}
  function md5ff(a,b,c,d,x,s,t){return md5cmn((b&c)|((~b)&d),a,b,x,s,t);}
  function md5gg(a,b,c,d,x,s,t){return md5cmn((b&d)|(c&(~d)),a,b,x,s,t);}
  function md5hh(a,b,c,d,x,s,t){return md5cmn(b^c^d,a,b,x,s,t);}
  function md5ii(a,b,c,d,x,s,t){return md5cmn(c^(b|(~d)),a,b,x,s,t);}
  function utf8Encode(s){return unescape(encodeURIComponent(s));}
  str=utf8Encode(str);
  const x=Array(Math.ceil((str.length+8)/64)*16).fill(0);
  for(let i=0;i<str.length;i++){x[i>>2]|=str.charCodeAt(i)<<((i%4)*8);}
  x[str.length>>2]|=0x80<<((str.length%4)*8);x[x.length-2]=str.length*8;
  let a=1732584193,b=-271733879,c=-1732584194,d=271733878;
  for(let i=0;i<x.length;i+=16){
    const[A,B,C,D]=[a,b,c,d];
    a=md5ff(a,b,c,d,x[i],7,-680876936);d=md5ff(d,a,b,c,x[i+1],12,-389564586);c=md5ff(c,d,a,b,x[i+2],17,606105819);b=md5ff(b,c,d,a,x[i+3],22,-1044525330);
    a=md5ff(a,b,c,d,x[i+4],7,-176418897);d=md5ff(d,a,b,c,x[i+5],12,1200080426);c=md5ff(c,d,a,b,x[i+6],17,-1473231341);b=md5ff(b,c,d,a,x[i+7],22,-45705983);
    a=md5ff(a,b,c,d,x[i+8],7,1770035416);d=md5ff(d,a,b,c,x[i+9],12,-1958414417);c=md5ff(c,d,a,b,x[i+10],17,-42063);b=md5ff(b,c,d,a,x[i+11],22,-1990404162);
    a=md5ff(a,b,c,d,x[i+12],7,1804603682);d=md5ff(d,a,b,c,x[i+13],12,-40341101);c=md5ff(c,d,a,b,x[i+14],17,-1502002290);b=md5ff(b,c,d,a,x[i+15],22,1236535329);
    a=md5gg(a,b,c,d,x[i+1],5,-165796510);d=md5gg(d,a,b,c,x[i+6],9,-1069501632);c=md5gg(c,d,a,b,x[i+11],14,643717713);b=md5gg(b,c,d,a,x[i],20,-373897302);
    a=md5gg(a,b,c,d,x[i+5],5,-701558691);d=md5gg(d,a,b,c,x[i+10],9,38016083);c=md5gg(c,d,a,b,x[i+15],14,-660478335);b=md5gg(b,c,d,a,x[i+4],20,-405537848);
    a=md5gg(a,b,c,d,x[i+9],5,568446438);d=md5gg(d,a,b,c,x[i+14],9,-1019803690);c=md5gg(c,d,a,b,x[i+3],14,-187363961);b=md5gg(b,c,d,a,x[i+8],20,1163531501);
    a=md5gg(a,b,c,d,x[i+13],5,-1444681467);d=md5gg(d,a,b,c,x[i+2],9,-51403784);c=md5gg(c,d,a,b,x[i+7],14,1735328473);b=md5gg(b,c,d,a,x[i+12],20,-1926607734);
    a=md5hh(a,b,c,d,x[i+5],4,-378558);d=md5hh(d,a,b,c,x[i+8],11,-2022574463);c=md5hh(c,d,a,b,x[i+11],16,1839030562);b=md5hh(b,c,d,a,x[i+14],23,-35309556);
    a=md5hh(a,b,c,d,x[i+1],4,-1530992060);d=md5hh(d,a,b,c,x[i+4],11,1272893353);c=md5hh(c,d,a,b,x[i+7],16,-155497632);b=md5hh(b,c,d,a,x[i+10],23,-1094730640);
    a=md5hh(a,b,c,d,x[i+13],4,681279174);d=md5hh(d,a,b,c,x[i],11,-358537222);c=md5hh(c,d,a,b,x[i+3],16,-722521979);b=md5hh(b,c,d,a,x[i+6],23,76029189);
    a=md5hh(a,b,c,d,x[i+9],4,-640364487);d=md5hh(d,a,b,c,x[i+12],11,-421815835);c=md5hh(c,d,a,b,x[i+15],16,530742520);b=md5hh(b,c,d,a,x[i+2],23,-995338651);
    a=md5ii(a,b,c,d,x[i],6,-198630844);d=md5ii(d,a,b,c,x[i+7],10,1126891415);c=md5ii(c,d,a,b,x[i+14],15,-1416354905);b=md5ii(b,c,d,a,x[i+5],21,-57434055);
    a=md5ii(a,b,c,d,x[i+12],6,1700485571);d=md5ii(d,a,b,c,x[i+3],10,-1894986606);c=md5ii(c,d,a,b,x[i+10],15,-1051523);b=md5ii(b,c,d,a,x[i+1],21,-2054922799);
    a=md5ii(a,b,c,d,x[i+8],6,1873313359);d=md5ii(d,a,b,c,x[i+15],10,-30611744);c=md5ii(c,d,a,b,x[i+6],15,-1560198380);b=md5ii(b,c,d,a,x[i+13],21,1309151649);
    a=md5ii(a,b,c,d,x[i+4],6,-145523070);d=md5ii(d,a,b,c,x[i+11],10,-1120210379);c=md5ii(c,d,a,b,x[i+2],15,718787259);b=md5ii(b,c,d,a,x[i+9],21,-343485551);
    a=safeAdd(a,A);b=safeAdd(b,B);c=safeAdd(c,C);d=safeAdd(d,D);
  }
  return[a,b,c,d].map(n=>Array.from({length:4},(_,i)=>((n>>>(i*8))&0xff).toString(16).padStart(2,'0')).join('')).join('');
}

// ── DESIGN TOKENS ─────────────────────────────────────────────────────────────
// Palette violet + noir — identité Striga
const T={
  bg:'#080810',
  surface:'rgba(255,255,255,.03)',
  surface2:'rgba(255,255,255,.06)',
  border:'rgba(255,255,255,.07)',
  borderFocus:'rgba(138,92,255,.5)',
  accent:'#8A5CFF',
  accentDark:'#6B3FE0',
  accentGlow:'rgba(138,92,255,.2)',
  accentSoft:'rgba(138,92,255,.1)',
  text:'rgba(255,255,255,.92)',
  text2:'rgba(255,255,255,.55)',
  text3:'rgba(255,255,255,.28)',
  green:'#34D399',
  greenSoft:'rgba(52,211,153,.1)',
  red:'#F87171',
  redSoft:'rgba(248,113,113,.1)',
  amber:'#FBBF24',
};

// ── CSS INJECTION (once) ──────────────────────────────────────────────────────
function injectCSS(){
  if(document.getElementById('striga-v2-css'))return;
  const s=document.createElement('style');s.id='striga-v2-css';
  s.textContent=`
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
    .sg-root *{box-sizing:border-box;-webkit-font-smoothing:antialiased}
    .sg-root{font-family:'DM Sans',system-ui,sans-serif;color:${T.text};background:${T.bg};height:100%;display:flex;flex-direction:column;overflow:hidden}
    .sg-input{width:100%;background:${T.surface2};border:1px solid ${T.border};border-radius:14px;padding:13px 16px;color:${T.text};font-family:'DM Sans',sans-serif;font-size:14px;outline:none;transition:border-color .2s,box-shadow .2s;-webkit-appearance:none}
    .sg-input:focus{border-color:${T.borderFocus};box-shadow:0 0 0 3px ${T.accentGlow}}
    .sg-input::placeholder{color:${T.text3}}
    .sg-btn{width:100%;padding:14px;border-radius:14px;font-family:'DM Sans',sans-serif;font-size:15px;font-weight:600;cursor:pointer;transition:all .18s;border:none;letter-spacing:-.1px}
    .sg-btn-primary{background:linear-gradient(135deg,${T.accent},${T.accentDark});color:#fff;box-shadow:0 4px 20px ${T.accentGlow}}
    .sg-btn-primary:hover{transform:translateY(-1px);box-shadow:0 8px 28px ${T.accentGlow}}
    .sg-btn-primary:active{transform:scale(.98)}
    .sg-btn-ghost{background:${T.surface2};color:${T.text2};border:1px solid ${T.border}}
    .sg-btn-ghost:hover{border-color:${T.accent};color:${T.accent}}
    .sg-btn:disabled{opacity:.4;cursor:not-allowed;transform:none!important}
    .sg-card{background:${T.surface};border:1px solid ${T.border};border-radius:20px;padding:18px}
    .sg-tab-bar{display:flex;border-bottom:1px solid ${T.border};background:${T.bg};flex-shrink:0}
    .sg-tab{flex:1;background:none;border:none;color:${T.text3};font-size:20px;padding:12px 0 10px;cursor:pointer;border-bottom:2px solid transparent;transition:all .18s;-webkit-tap-highlight-color:transparent}
    .sg-tab.active{color:${T.accent};border-bottom-color:${T.accent}}
    .sg-label{font-size:11px;color:${T.text3};text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px;display:block;font-family:'DM Mono',monospace}
    .sg-value{font-size:14px;color:${T.text};font-weight:500}
    .sg-row{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid ${T.border}}
    .sg-row:last-child{border-bottom:none}
    .sg-badge{display:inline-flex;align-items:center;padding:4px 12px;border-radius:999px;font-size:11px;font-weight:600;font-family:'DM Mono',monospace}
    .sg-badge.ok{background:${T.greenSoft};color:${T.green}}
    .sg-badge.warn{background:${T.accentSoft};color:${T.accent}}
    .sg-badge.err{background:${T.redSoft};color:${T.red}}
    .sg-notice{padding:12px 14px;border-radius:12px;font-size:12px;line-height:1.6;margin-bottom:10px}
    .sg-notice.info{background:${T.accentSoft};border:1px solid ${T.borderFocus};color:${T.accent}}
    .sg-notice.success{background:${T.greenSoft};border:1px solid rgba(52,211,153,.3);color:${T.green}}
    .sg-notice.error{background:${T.redSoft};border:1px solid rgba(248,113,113,.3);color:${T.red}}
    .sg-spinner{width:20px;height:20px;border:2px solid ${T.border};border-top-color:${T.accent};border-radius:50%;animation:sg-spin .6s linear infinite;margin:0 auto}
    @keyframes sg-spin{to{transform:rotate(360deg)}}
    @keyframes sg-up{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
    .sg-anim{animation:sg-up .3s ease forwards}
    .sg-scroll{flex:1;overflow-y:auto;padding:16px;-webkit-overflow-scrolling:touch}
    .sg-scroll::-webkit-scrollbar{width:2px}
    .sg-scroll::-webkit-scrollbar-thumb{background:rgba(138,92,255,.25);border-radius:2px}
    .sg-field{margin-bottom:14px}
    .sg-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .sg-section-title{font-size:11px;font-weight:500;color:${T.text3};text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px;font-family:'DM Mono',monospace}
    .sg-dev-link{font-size:10px;color:${T.text3};text-align:center;cursor:pointer;padding:8px;text-decoration:underline;opacity:.5;transition:opacity .2s}
    .sg-dev-link:hover{opacity:1;color:${T.accent}}
  `;
  document.head.appendChild(s);
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

function notice(msg,type='info'){
  const d=document.createElement('div');
  d.className=`sg-notice ${type} sg-anim`;d.textContent=msg;return d;
}

function spinner(){const d=document.createElement('div');d.style.cssText='padding:32px;text-align:center';d.innerHTML='<div class="sg-spinner"></div>';return d;}

function field(label,id,placeholder,type='text',value=''){
  const w=document.createElement('div');w.className='sg-field';
  const lbl=document.createElement('label');lbl.className='sg-label';lbl.htmlFor=id;lbl.textContent=label;
  const inp=document.createElement('input');
  inp.className='sg-input';inp.id=id;inp.type=type;inp.placeholder=placeholder;if(value)inp.value=value;
  w.appendChild(lbl);w.appendChild(inp);return w;
}

// ── TABS ──────────────────────────────────────────────────────────────────────
let _tab='home';
const TABS=[['home','🏠'],['wallet','💳'],['kyc','👤'],['card','🃏'],['settings','⚙']];

function renderPanel(container){
  injectCSS();
  container.innerHTML='';
  container.className='sg-root';

  // Nav
  const nav=document.createElement('div');nav.className='sg-tab-bar';
  TABS.forEach(([id,icon])=>{
    const b=document.createElement('button');b.className='sg-tab'+(id===_tab?' active':'');
    b.textContent=icon;b.title=id;
    b.addEventListener('click',()=>{_tab=id;renderPanel(container);});
    nav.appendChild(b);
  });
  container.appendChild(nav);

  const body=document.createElement('div');body.className='sg-scroll';container.appendChild(body);
  if(_tab==='home')renderHome(body,container);
  else if(_tab==='wallet')renderWallet(body);
  else if(_tab==='kyc')renderKYC(body,container);
  else if(_tab==='card')renderCard(body,container);
  else if(_tab==='settings')renderSettings(body,container);
}

// ── HOME ─────────────────────────────────────────────────────────────────────
function renderHome(body,root){
  const user=loadUser();

  // Hero card avec gradient
  const hero=document.createElement('div');
  hero.style.cssText=`background:linear-gradient(135deg,#1A0A3D,#2D1275,${T.accentDark});border-radius:24px;padding:24px;margin-bottom:16px;position:relative;overflow:hidden`;
  hero.innerHTML=`
    <div style="position:absolute;top:-30px;right:-30px;width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,.04)"></div>
    <div style="position:absolute;bottom:-20px;left:60px;width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,.03)"></div>
    <div style="font-family:'DM Mono',monospace;font-size:10px;color:rgba(255,255,255,.4);letter-spacing:2px;margin-bottom:12px">STRIGA · BANKING</div>
    <div style="font-size:22px;font-weight:600;color:#fff;margin-bottom:4px">${user?esc(user.firstName+' '+user.lastName):'Bienvenue'}</div>
    <div style="font-size:13px;color:rgba(255,255,255,.5)">${user?'ID · '+esc((user.id||user.userId||'').slice(0,16)+'…'):'Créez un compte pour commencer'}</div>
    ${user?`<div style="margin-top:12px"><span class="sg-badge ${user.kycStatus==='APPROVED'?'ok':'warn'}">${esc(user.kycStatus||'PENDING')}</span></div>`:''}
  `;
  body.appendChild(hero);
  body.classList.add('sg-anim');

  // Quick actions
  const grid=document.createElement('div');grid.className='sg-grid-2';grid.style.marginBottom='16px';
  [['💳','Wallet','wallet'],['👤','Vérification','kyc'],['🃏','Ma carte','card'],['⚙','Paramètres','settings']].forEach(([icon,label,tab])=>{
    const c=document.createElement('div');
    c.className='sg-card';c.style.cursor='pointer';c.style.textAlign='center';c.style.transition='border-color .18s';
    c.innerHTML=`<div style="font-size:26px;margin-bottom:8px">${icon}</div><div style="font-size:12px;font-weight:500;color:${T.text2}">${label}</div>`;
    c.addEventListener('mouseenter',()=>c.style.borderColor=T.accent);
    c.addEventListener('mouseleave',()=>c.style.borderColor=T.border);
    c.addEventListener('click',()=>{_tab=tab;renderPanel(root);});
    grid.appendChild(c);
  });
  body.appendChild(grid);

  if(!user){
    const cta=document.createElement('button');cta.className='sg-btn sg-btn-primary';cta.textContent='Créer mon compte →';
    cta.addEventListener('click',()=>{_tab='kyc';renderPanel(root);});
    body.appendChild(cta);
  }
}

// ── KYC ──────────────────────────────────────────────────────────────────────
function renderKYC(body,root){
  const user=loadUser();
  body.classList.add('sg-anim');

  if(user){renderKYCStatus(body,user,root);return;}

  // Titre
  const h=document.createElement('div');
  h.style.cssText='margin-bottom:24px';
  h.innerHTML=`<div style="font-size:22px;font-weight:600;color:${T.text};margin-bottom:6px">Créer un compte</div>
    <div style="font-size:13px;color:${T.text2};line-height:1.6">Vérification d'identité requise pour activer votre wallet et votre carte Mastercard virtuelle.</div>`;
  body.appendChild(h);

  const status=document.createElement('div');body.appendChild(status);

  // Formulaire en sections
  function section(title){
    const d=document.createElement('div');d.style.cssText='margin-bottom:20px';
    const t=document.createElement('div');t.className='sg-section-title';t.textContent=title;
    d.appendChild(t);return d;
  }

  const s1=section('Identité');
  const nameRow=document.createElement('div');nameRow.className='sg-grid-2';
  const f1=field('Prénom','k-first','Jean');f1.style.marginBottom='0';
  const f2=field('Nom','k-last','Dupont');f2.style.marginBottom='0';
  nameRow.appendChild(f1);nameRow.appendChild(f2);
  s1.appendChild(nameRow);s1.style.marginTop='8px';
  s1.appendChild(field('Date de naissance','k-dob','1990-01-15'));
  s1.appendChild(field('Nationalité (FR, DE…)','k-country','FR'));
  body.appendChild(s1);

  const s2=section('Contact');
  s2.appendChild(field('Email','k-email','jean@example.com','email'));
  s2.appendChild(field('Téléphone (ex: +33612345678)','k-phone','+33612345678','tel'));
  body.appendChild(s2);

  const s3=section('Adresse');
  s3.appendChild(field('Adresse','k-addr1','12 rue de la Paix'));
  const cityRow=document.createElement('div');cityRow.className='sg-grid-2';
  const fc=field('Ville','k-city','Paris');fc.style.marginBottom='0';
  const fp=field('Code postal','k-postal','75001');fp.style.marginBottom='0';
  cityRow.appendChild(fc);cityRow.appendChild(fp);
  s3.appendChild(cityRow);
  s3.style.marginTop='8px';
  s3.appendChild(field('Pays de résidence','k-country2','FR'));
  body.appendChild(s3);

  const createBtn=document.createElement('button');createBtn.className='sg-btn sg-btn-primary';createBtn.style.marginBottom='8px';
  createBtn.textContent='Créer mon compte';
  createBtn.addEventListener('click',async()=>{
    createBtn.textContent='';createBtn.disabled=true;
    const sp=document.createElement('div');sp.className='sg-spinner';sp.style.margin='0 auto';createBtn.appendChild(sp);
    const body2={
      firstName:document.getElementById('k-first')?.value.trim()||'',
      lastName:document.getElementById('k-last')?.value.trim()||'',
      dateOfBirth:{
        year:parseInt((document.getElementById('k-dob')?.value||'').split('-')[0])||1990,
        month:parseInt((document.getElementById('k-dob')?.value||'').split('-')[1])||1,
        day:parseInt((document.getElementById('k-dob')?.value||'').split('-')[2])||1
      },
      email:document.getElementById('k-email')?.value.trim()||'',
      mobile:{phoneNumber:(document.getElementById('k-phone')?.value.trim()||'').replace(/\s/g,'').replace(/^\+/,'')},
      nationality:(document.getElementById('k-country')?.value.trim()||'FR').toUpperCase(),
      address:{
        addressLine1:document.getElementById('k-addr1')?.value.trim()||'',
        city:document.getElementById('k-city')?.value.trim()||'',
        postalCode:document.getElementById('k-postal')?.value.trim()||'',
        state:'',
        country:(document.getElementById('k-country2')?.value.trim()||'FR').toUpperCase()
      }
    };
    try{
      const r=await strigaFetch('POST','/user/create',body2);
      saveUser({...r,kycStatus:'NOT_STARTED'});
      window.YM_toast?.('Compte créé avec succès !','success');
      renderKYC(body,root);
    }catch(e){
      status.innerHTML='';status.appendChild(notice('Erreur : '+e.message,'error'));
      createBtn.innerHTML='Créer mon compte';createBtn.disabled=false;
    }
  });
  body.appendChild(createBtn);
}

function renderKYCStatus(body,user,root){
  // Statut card
  const statusCard=document.createElement('div');statusCard.className='sg-card';statusCard.style.marginBottom='16px';
  statusCard.innerHTML=`
    <div class="sg-row" style="padding-top:0">
      <div style="width:48px;height:48px;border-radius:16px;background:${T.accentSoft};display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">👤</div>
      <div style="flex:1">
        <div style="font-size:16px;font-weight:600;color:${T.text}">${esc(user.firstName||'')} ${esc(user.lastName||'')}</div>
        <div style="font-size:12px;color:${T.text3};font-family:'DM Mono',monospace;margin-top:2px">${esc((user.id||user.userId||'').slice(0,20)+'…')}</div>
      </div>
    </div>
    <div class="sg-row">
      <span class="sg-label" style="margin:0;flex:1">Statut KYC</span>
      <span class="sg-badge ${user.kycStatus==='APPROVED'?'ok':user.kycStatus==='REJECTED'?'err':'warn'}">${esc(user.kycStatus||'PENDING')}</span>
    </div>
    <div class="sg-row" style="padding-bottom:0">
      <span class="sg-label" style="margin:0;flex:1">Email</span>
      <span style="font-size:13px;color:${T.text2}">${esc(user.email||'—')}</span>
    </div>`;
  body.appendChild(statusCard);
  body.classList.add('sg-anim');

  const feedback=document.createElement('div');body.appendChild(feedback);

  if(user.kycStatus!=='APPROVED'){
    const kycBtn=document.createElement('button');kycBtn.className='sg-btn sg-btn-primary';kycBtn.style.marginBottom='10px';
    kycBtn.textContent='🪪 Vérifier mon identité';
    kycBtn.addEventListener('click',async()=>{
      kycBtn.disabled=true;kycBtn.textContent='Chargement…';
      try{
        const r=await strigaFetch('POST',`/user/${user.id||user.userId}/kyc/start`,{});
        if(r.verificationLink)window.open(r.verificationLink,'_blank');
        feedback.innerHTML='';feedback.appendChild(notice('Lien KYC ouvert dans le navigateur. Revenez ici une fois complété.','info'));
        kycBtn.textContent='🪪 Vérifier mon identité';kycBtn.disabled=false;
      }catch(e){feedback.innerHTML='';feedback.appendChild(notice('Erreur : '+e.message,'error'));kycBtn.textContent='🪪 Vérifier mon identité';kycBtn.disabled=false;}
    });
    body.appendChild(kycBtn);

    const refreshBtn=document.createElement('button');refreshBtn.className='sg-btn sg-btn-ghost';
    refreshBtn.textContent='↻  Actualiser le statut';
    refreshBtn.addEventListener('click',async()=>{
      refreshBtn.disabled=true;refreshBtn.textContent='Vérification…';
      try{
        const r=await strigaFetch('GET',`/user/${user.id||user.userId}`,{});
        saveUser({...user,...r});
        window.YM_toast?.(r.kycStatus==='APPROVED'?'KYC approuvé ! 🎉':'Statut : '+r.kycStatus,'info');
        renderKYC(body,root);
      }catch(e){feedback.innerHTML='';feedback.appendChild(notice('Erreur : '+e.message,'error'));refreshBtn.textContent='↻  Actualiser';refreshBtn.disabled=false;}
    });
    body.appendChild(refreshBtn);
  }else{
    body.appendChild(notice('Votre identité est vérifiée. Wallet et carte disponibles.','success'));
  }
}

// ── WALLET ───────────────────────────────────────────────────────────────────
function renderWallet(body){
  const user=loadUser();
  body.classList.add('sg-anim');

  if(!user){
    const card=document.createElement('div');card.className='sg-card';
    card.innerHTML=`<div style="text-align:center;padding:16px;color:${T.text3};font-size:13px">Créez un compte d'abord (onglet 👤)</div>`;
    body.appendChild(card);return;
  }

  const h=document.createElement('div');
  h.style.cssText='font-size:18px;font-weight:600;margin-bottom:18px';h.textContent='Mon Wallet';
  body.appendChild(h);

  const feedback=document.createElement('div');body.appendChild(feedback);
  const sp=spinner();body.appendChild(sp);

  strigaFetch('POST',`/user/${user.id||user.userId}/wallets`,{startDate:0,endDate:Date.now(),page:0}).then(r=>{
    sp.remove();
    const wallets=r.wallets||[];
    if(!wallets.length){
      feedback.appendChild(notice('Aucun wallet trouvé. Complétez votre KYC pour activer votre wallet.','info'));return;
    }
    wallets.forEach(w=>{
      const wCard=document.createElement('div');wCard.className='sg-card';wCard.style.marginBottom='12px';
      const wHeader=document.createElement('div');
      wHeader.style.cssText=`font-family:'DM Mono',monospace;font-size:10px;color:${T.text3};margin-bottom:14px`;
      wHeader.textContent='WALLET · '+(w.walletId||w.id||'').slice(0,20)+'…';
      wCard.appendChild(wHeader);
      const accounts=w.accounts||{};
      Object.entries(accounts).forEach(([currency,acc])=>{
        const icons={EUR:'€',BTC:'₿',ETH:'Ξ',USDC:'$',SOL:'◎'};
        const row=document.createElement('div');row.className='sg-row';
        row.innerHTML=`
          <div style="width:40px;height:40px;border-radius:14px;background:${T.accentSoft};display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">${icons[currency]||'💰'}</div>
          <div style="flex:1">
            <div style="font-size:14px;font-weight:600;color:${T.text}">${esc(currency)}</div>
            <div style="font-size:11px;color:${T.text3}">${esc(acc.status||'')}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:18px;font-weight:600;color:${T.text}">${acc.availableBalance?((parseInt(acc.availableBalance)/100).toFixed(2)):'—'}</div>
            <div style="font-size:11px;color:${T.text3}">Disponible</div>
          </div>`;
        wCard.appendChild(row);
      });
      body.appendChild(wCard);
    });
  }).catch(e=>{sp.remove();feedback.appendChild(notice('Erreur : '+e.message,'error'));});
}

// ── CARD ─────────────────────────────────────────────────────────────────────
function renderCard(body,root){
  const user=loadUser();
  body.classList.add('sg-anim');

  if(!user||user.kycStatus!=='APPROVED'){
    const c=document.createElement('div');c.className='sg-card';
    c.innerHTML=`<div style="text-align:center;padding:16px;color:${T.text3};font-size:13px">Le KYC doit être approuvé pour obtenir une carte.</div>`;
    body.appendChild(c);return;
  }

  const h=document.createElement('div');h.style.cssText='font-size:18px;font-weight:600;margin-bottom:18px';h.textContent='Ma Carte';
  body.appendChild(h);

  // Visual card
  const vizCard=document.createElement('div');
  vizCard.style.cssText=`
    background:linear-gradient(135deg,#0D0020,#1A0050,${T.accentDark});
    border-radius:24px;padding:24px;margin-bottom:20px;
    position:relative;overflow:hidden;aspect-ratio:1.586/1;
    box-shadow:0 20px 60px ${T.accentGlow}`;
  vizCard.innerHTML=`
    <div style="position:absolute;top:-40px;right:-40px;width:160px;height:160px;border-radius:50%;background:rgba(138,92,255,.12)"></div>
    <div style="position:absolute;bottom:-20px;left:40px;width:100px;height:100px;border-radius:50%;background:rgba(255,255,255,.04)"></div>
    <div style="font-family:'DM Mono',monospace;font-size:11px;color:rgba(255,255,255,.4);letter-spacing:3px;margin-bottom:24px">STRIGA</div>
    <div style="font-family:'DM Mono',monospace;font-size:17px;color:rgba(255,255,255,.8);letter-spacing:4px;margin-bottom:24px">•••• •••• •••• ••••</div>
    <div style="display:flex;justify-content:space-between;align-items:flex-end">
      <div>
        <div style="font-size:10px;color:rgba(255,255,255,.4);margin-bottom:3px;letter-spacing:1px">TITULAIRE</div>
        <div style="font-size:14px;font-weight:500;color:#fff;letter-spacing:.5px">${esc((user.firstName||'').toUpperCase()+' '+(user.lastName||'').toUpperCase())}</div>
      </div>
      <div style="font-size:11px;color:rgba(255,255,255,.35);letter-spacing:2px;font-family:'DM Mono',monospace">MASTERCARD</div>
    </div>`;
  body.appendChild(vizCard);

  const feedback=document.createElement('div');body.appendChild(feedback);
  const cardsEl=document.createElement('div');body.appendChild(cardsEl);

  const grid=document.createElement('div');grid.className='sg-grid-2';grid.style.marginBottom='12px';

  const viewBtn=document.createElement('button');viewBtn.className='sg-btn sg-btn-primary';viewBtn.textContent='📋 Mes cartes';
  viewBtn.addEventListener('click',async()=>{
    viewBtn.disabled=true;viewBtn.textContent='…';cardsEl.innerHTML='';
    try{
      const r=await strigaFetch('GET',`/card/all?userId=${user.id||user.userId}`,{});
      const cards=(r.cards||r.data||[]);
      if(!cards.length){feedback.appendChild(notice('Aucune carte. Émettez-en une ci-dessous.','info'));}
      else cards.forEach(c=>{
        const cc=document.createElement('div');cc.className='sg-card';cc.style.marginBottom='10px';
        cc.innerHTML=`
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <div style="font-family:'DM Mono',monospace;font-size:14px;color:${T.text}">•••• ${esc(c.maskedCardNumber?.slice(-4)||'••••')}</div>
            <span class="sg-badge ${c.status==='ACTIVE'?'ok':'err'}">${esc(c.status||'')}</span>
          </div>
          <div style="font-size:11px;color:${T.text3};font-family:'DM Mono',monospace">${esc(c.cardId||c.id||'')}</div>`;
        cardsEl.appendChild(cc);
      });
      viewBtn.textContent='📋 Mes cartes';viewBtn.disabled=false;
    }catch(e){feedback.innerHTML='';feedback.appendChild(notice('Erreur : '+e.message,'error'));viewBtn.textContent='📋 Mes cartes';viewBtn.disabled=false;}
  });
  grid.appendChild(viewBtn);

  const issueBtn=document.createElement('button');issueBtn.className='sg-btn sg-btn-ghost';issueBtn.textContent='✦ Émettre';
  issueBtn.addEventListener('click',async()=>{
    issueBtn.disabled=true;issueBtn.textContent='…';
    try{
      const wr=await strigaFetch('POST',`/user/${user.id||user.userId}/wallets`,{startDate:0,endDate:Date.now(),page:0});
      const wallet=(wr.wallets||[])[0];
      if(!wallet){feedback.appendChild(notice('Aucun wallet. Complétez le KYC.','error'));issueBtn.textContent='✦ Émettre';issueBtn.disabled=false;return;}
      const eurAcc=Object.entries(wallet.accounts||{}).find(([cur])=>cur==='EUR');
      if(!eurAcc){feedback.appendChild(notice('Aucun compte EUR trouvé.','error'));issueBtn.textContent='✦ Émettre';issueBtn.disabled=false;return;}
      await strigaFetch('POST','/card/issue',{userId:user.id||user.userId,accountId:eurAcc[1].accountId||eurAcc[1].id,cardType:'VIRTUAL'});
      window.YM_toast?.('Carte émise ! 🎉','success');
      issueBtn.textContent='✦ Émettre';issueBtn.disabled=false;
      renderCard(body,root);
    }catch(e){feedback.innerHTML='';feedback.appendChild(notice('Erreur : '+e.message,'error'));issueBtn.textContent='✦ Émettre';issueBtn.disabled=false;}
  });
  grid.appendChild(issueBtn);
  body.insertBefore(grid,feedback);
}

// ── SETTINGS ─────────────────────────────────────────────────────────────────
function renderSettings(body,root){
  const cfg=loadCfg();const user=loadUser();
  body.classList.add('sg-anim');

  const h=document.createElement('div');h.style.cssText='font-size:18px;font-weight:600;margin-bottom:18px';h.textContent='Paramètres';
  body.appendChild(h);

  const feedback=document.createElement('div');body.appendChild(feedback);

  // Info compte
  if(user){
    const c=document.createElement('div');c.className='sg-card';c.style.marginBottom='12px';
    c.innerHTML=`<div class="sg-label">Compte</div>
      <div style="font-size:15px;font-weight:500;margin-bottom:4px">${esc(user.firstName||'')} ${esc(user.lastName||'')}</div>
      <div style="font-size:11px;color:${T.text3};font-family:'DM Mono',monospace">${esc(user.id||user.userId||'')}</div>`;
    body.appendChild(c);
  }

  const pingBtn=document.createElement('button');pingBtn.className='sg-btn sg-btn-ghost';pingBtn.style.marginBottom='10px';
  pingBtn.textContent='↻  Tester la connexion';
  pingBtn.addEventListener('click',async()=>{
    pingBtn.disabled=true;pingBtn.textContent='Test…';
    try{await strigaFetch('POST','/ping',{});feedback.appendChild(notice('Connexion API OK ✓','success'));}
    catch(e){feedback.innerHTML='';feedback.appendChild(notice('Échec : '+e.message,'error'));}
    pingBtn.textContent='↻  Tester la connexion';pingBtn.disabled=false;
  });
  body.appendChild(pingBtn);

  if(user){
    const resetBtn=document.createElement('button');resetBtn.className='sg-btn sg-btn-ghost';resetBtn.style.marginBottom='10px';
    resetBtn.style.cssText+=`color:${T.red};border-color:rgba(248,113,113,.3)`;
    resetBtn.textContent='Supprimer les données locales';
    resetBtn.addEventListener('click',()=>{
      if(confirm('Supprimer le compte sauvegardé localement ?')){saveUser(null);window.YM_toast?.('Données supprimées','info');renderPanel(body.parentElement||root);}
    });
    body.appendChild(resetBtn);
  }

  // Lien developer discret tout en bas
  const devLink=document.createElement('div');devLink.className='sg-dev-link';devLink.textContent='Configuration avancée (développeurs)';
  devLink.addEventListener('click',()=>{renderDevConfig(body,root,devLink);});
  body.appendChild(devLink);
}

// ── DEV CONFIG (caché) ────────────────────────────────────────────────────────
function renderDevConfig(body,root,triggerEl){
  triggerEl?.remove();
  const devCard=document.createElement('div');devCard.className='sg-card sg-anim';devCard.style.marginTop='10px';
  const cfg=loadCfg();
  devCard.innerHTML=`
    <div class="sg-label" style="color:${T.amber}">⚠ Mode développeur</div>
    <div style="font-size:11px;color:${T.text3};margin-bottom:12px;line-height:1.5">Ces paramètres sont destinés aux développeurs qui déploient leur propre worker Cloudflare. Les utilisateurs normaux n'ont pas besoin de les modifier.</div>`;
  const wf=field('Worker URL','sg-dev-worker',DEFAULT_WORKER,'text',cfg.workerUrl||'');
  devCard.appendChild(wf);

  const feedback=document.createElement('div');devCard.appendChild(feedback);

  const saveBtn=document.createElement('button');saveBtn.className='sg-btn sg-btn-ghost';saveBtn.textContent='Sauvegarder';
  saveBtn.addEventListener('click',async()=>{
    const url=document.getElementById('sg-dev-worker')?.value.trim()||'';
    saveCfg({...cfg,workerUrl:url});
    if(url){
      saveBtn.disabled=true;saveBtn.textContent='Test…';
      try{await strigaFetch('POST','/ping',{});feedback.appendChild(notice('Worker connecté ✓','success'));}
      catch(e){feedback.appendChild(notice('Erreur : '+e.message,'error'));}
      saveBtn.textContent='Sauvegarder';saveBtn.disabled=false;
    }else{
      feedback.appendChild(notice('Sauvegardé (URL vide = worker par défaut)','info'));
    }
  });
  devCard.appendChild(saveBtn);
  body.appendChild(devCard);
}

// ── SPHERE EXPORT ─────────────────────────────────────────────────────────────
window.YM_S['striga.sphere.js']={
  name:'Striga',icon:'🟣',category:'Finance',
  description:'Banking API — KYC, wallet EUR/crypto, carte virtuelle Mastercard',
  emit:[],receive:[],
  activate:function(){injectCSS();},
  deactivate:function(){},
  renderPanel,
  profileSection:function(container){
    const user=loadUser();
    if(!user)return;
    injectCSS();
    const el=document.createElement('div');
    el.style.cssText='font-family:"DM Sans",sans-serif';
    el.innerHTML=`
      <div style="display:flex;align-items:center;gap:12px;background:linear-gradient(135deg,#1A0A3D,${T.accentDark});border-radius:16px;padding:14px">
        <div style="width:40px;height:40px;border-radius:14px;background:${T.accentSoft};display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">🟣</div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600;color:#fff">${esc(user.firstName||'')} ${esc(user.lastName||'')}</div>
          <div style="font-size:11px;color:rgba(255,255,255,.5)">KYC : ${esc(user.kycStatus||'—')}</div>
        </div>
        <span style="font-size:10px;padding:3px 10px;border-radius:999px;background:${user.kycStatus==='APPROVED'?T.greenSoft:T.accentSoft};color:${user.kycStatus==='APPROVED'?T.green:T.accent};font-family:'DM Mono',monospace">${user.kycStatus==='APPROVED'?'Actif':'En attente'}</span>
      </div>`;
    container.appendChild(el);
  }
};
})();
