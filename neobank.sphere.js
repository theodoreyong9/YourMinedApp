/* jshint esversion:11, browser:true */
// striga.sphere.js — Striga Banking API
// KYC onboarding, wallet, carte virtuelle Mastercard
// Couleurs Striga : #0A0A0A fond, #7B2FFF accent violet
(function(){
'use strict';
window.YM_S=window.YM_S||{};

// ── CONFIG ────────────────────────────────────────────────────────────────────
const CFG_KEY   ='ym_striga_cfg_v1';
const USER_KEY  ='ym_striga_user_v1';
const BASE_URL  ='https://www.sandbox.striga.com/api/v1';

function loadCfg(){try{return JSON.parse(localStorage.getItem(CFG_KEY)||'{}');}catch(e){return{};}}
function saveCfg(d){localStorage.setItem(CFG_KEY,JSON.stringify(d));}
function loadUser(){try{return JSON.parse(localStorage.getItem(USER_KEY)||'null');}catch(e){return null;}}
function saveUser(d){localStorage.setItem(USER_KEY,JSON.stringify(d));}

// ── HMAC AUTH (browser SubtleCrypto) ─────────────────────────────────────────
async function calcHMAC(method,endpoint,body,secret){
  const time=Date.now().toString();
  // MD5 du body en hex
  const bodyStr=JSON.stringify(body);
  const msgBuf=new TextEncoder().encode(bodyStr);
  // MD5 via SubtleCrypto n'existe pas nativement — on utilise une implémentation JS légère
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
  if(!cfg.apiKey||!cfg.apiSecret)throw new Error('API keys not configured');
  const auth=await calcHMAC(method,endpoint,body,cfg.apiSecret);
  const url=BASE_URL+endpoint;
  const opts={
    method,
    headers:{'Content-Type':'application/json','api-key':cfg.apiKey,'Authorization':auth},
  };
  if(method!=='GET')opts.body=JSON.stringify(body);
  const r=await fetch(url,opts);
  const data=await r.json();
  if(!r.ok)throw new Error(data.errorDetails||data.message||'API error '+r.status);
  return data;
}

// ── MD5 (implémentation JS minimaliste pour le hash du body) ──────────────────
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
  x[str.length>>2]|=0x80<<((str.length%4)*8);
  x[x.length-2]=str.length*8;
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

// ── UI HELPERS ────────────────────────────────────────────────────────────────
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function S(styles){return Object.entries(styles).map(([k,v])=>k.replace(/([A-Z])/g,'-$1').toLowerCase()+':'+v).join(';');}
const C={bg:'#0A0A0A',surface:'#141414',surface2:'#1E1E1E',border:'rgba(255,255,255,.08)',accent:'#7B2FFF',accentLight:'rgba(123,47,255,.15)',text:'#FFFFFF',text2:'rgba(255,255,255,.7)',text3:'rgba(255,255,255,.35)',green:'#22C55E',red:'#EF4444'};

function btn(label,accent,handler){
  const b=document.createElement('button');
  b.textContent=label;
  b.style.cssText=S({background:accent?C.accent:'transparent',color:accent?'#fff':C.text2,border:'1px solid '+(accent?C.accent:C.border),borderRadius:'10px',padding:'10px 20px',fontSize:'13px',fontWeight:'600',cursor:'pointer',transition:'opacity .15s',width:'100%'});
  b.addEventListener('mouseenter',()=>b.style.opacity='.8');
  b.addEventListener('mouseleave',()=>b.style.opacity='1');
  b.addEventListener('click',handler);
  return b;
}

function field(label,id,placeholder,type='text',value=''){
  const wrap=document.createElement('div');wrap.style.cssText=S({marginBottom:'12px'});
  wrap.innerHTML=`<label style="font-size:11px;color:${C.text3};display:block;margin-bottom:5px;text-transform:uppercase;letter-spacing:.8px">${esc(label)}</label>`+
    `<input id="${id}" type="${type}" placeholder="${esc(placeholder)}" value="${esc(value)}" style="width:100%;background:${C.surface2};border:1px solid ${C.border};border-radius:10px;padding:11px 14px;color:${C.text};font-size:13px;outline:none;box-sizing:border-box;-webkit-appearance:none">`;
  return wrap;
}

function card(content='',style=''){
  const d=document.createElement('div');
  d.style.cssText=S({background:C.surface,border:'1px solid '+C.border,borderRadius:'16px',padding:'18px',marginBottom:'12px'})+';'+style;
  d.innerHTML=content;
  return d;
}

function toast(container,msg,type='info'){
  const t=document.createElement('div');
  t.style.cssText=S({padding:'10px 16px',borderRadius:'10px',fontSize:'12px',marginBottom:'8px',
    background:type==='error'?'rgba(239,68,68,.15)':type==='success'?'rgba(34,197,94,.15)':C.accentLight,
    border:`1px solid ${type==='error'?C.red:type==='success'?C.green:C.accent}`,
    color:type==='error'?C.red:type==='success'?C.green:C.accent});
  t.textContent=msg;container.prepend(t);
  setTimeout(()=>t.remove(),4000);
}

function loader(container,label='Loading…'){
  const d=document.createElement('div');
  d.style.cssText=S({textAlign:'center',padding:'24px',color:C.text3,fontSize:'13px'});
  d.innerHTML=`<div style="width:28px;height:28px;border:2px solid ${C.border};border-top-color:${C.accent};border-radius:50%;animation:striga-spin .7s linear infinite;margin:0 auto 10px"></div>${esc(label)}`;
  container.appendChild(d);
  if(!document.getElementById('striga-css')){
    const s=document.createElement('style');s.id='striga-css';
    s.textContent=`@keyframes striga-spin{to{transform:rotate(360deg)}}@keyframes striga-fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`;
    document.head.appendChild(s);
  }
  return d;
}

// ── PANEL ─────────────────────────────────────────────────────────────────────
let _tab='home';
function renderPanel(container){
  container.style.cssText=S({display:'flex',flexDirection:'column',height:'100%',overflow:'hidden',background:C.bg,fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'});
  container.innerHTML='';

  const cfg=loadCfg();
  if(!cfg.apiKey||!cfg.apiSecret){
    renderSetup(container);
    return;
  }

  // Nav tabs
  const nav=document.createElement('div');
  nav.style.cssText=S({display:'flex',borderBottom:'1px solid '+C.border,flexShrink:'0',background:C.bg,paddingTop:'4px'});
  const TABS=[['home','🏠'],['wallet','💳'],['kyc','👤'],['card','🃏'],['settings','⚙']];
  TABS.forEach(([id,icon])=>{
    const t=document.createElement('button');
    const active=_tab===id;
    t.style.cssText=S({flex:'1',background:'transparent',border:'none',color:active?C.accent:C.text3,fontSize:'18px',padding:'10px 0 8px',cursor:'pointer',borderBottom:`2px solid ${active?C.accent:'transparent'}`,transition:'color .15s'});
    t.textContent=icon;
    t.title=id.charAt(0).toUpperCase()+id.slice(1);
    t.addEventListener('click',()=>{_tab=id;renderPanel(container);});
    nav.appendChild(t);
  });
  container.appendChild(nav);

  const body=document.createElement('div');
  body.style.cssText=S({flex:'1',overflowY:'auto',padding:'16px'});
  container.appendChild(body);

  if(_tab==='home')renderHome(body);
  else if(_tab==='wallet')renderWallet(body);
  else if(_tab==='kyc')renderKYC(body);
  else if(_tab==='card')renderCard(body);
  else if(_tab==='settings')renderSettings(body);
}

// ── SETUP ─────────────────────────────────────────────────────────────────────
function renderSetup(container){
  container.style.cssText=S({display:'flex',flexDirection:'column',height:'100%',background:C.bg,fontFamily:'-apple-system,BlinkMacSystemFont,sans-serif',overflowY:'auto',padding:'24px'});
  // Logo Striga-style
  container.innerHTML=`
    <div style="text-align:center;margin-bottom:28px;animation:striga-fade .4s ease">
      <div style="font-size:36px;margin-bottom:8px">🟣</div>
      <div style="font-size:22px;font-weight:700;color:${C.text};letter-spacing:-0.5px">Striga</div>
      <div style="font-size:12px;color:${C.text3};margin-top:4px">Banking API for YourMine</div>
    </div>`;
  if(!document.getElementById('striga-css')){const s=document.createElement('style');s.id='striga-css';s.textContent='@keyframes striga-spin{to{transform:rotate(360deg)}}@keyframes striga-fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}';document.head.appendChild(s);}

  const form=document.createElement('div');
  const cfg=loadCfg();
  form.appendChild(field('API Key','s-apikey','znxN-…','password',cfg.apiKey||''));
  form.appendChild(field('API Secret','s-apisecret','Ir4Ra…','password',cfg.apiSecret||''));
  form.appendChild(field('Application ID','s-appid','665ac529-…','text',cfg.appId||''));
  const isLive=document.createElement('div');
  isLive.style.cssText=S({display:'flex',alignItems:'center',gap:'10px',marginBottom:'16px'});
  isLive.innerHTML=`<input type="checkbox" id="s-live" style="width:16px;height:16px;accent-color:${C.accent}" ${cfg.live?'checked':''}>
    <label for="s-live" style="font-size:13px;color:${C.text2}">Production (uncheck = Sandbox)</label>`;
  form.appendChild(isLive);

  const saveBtn=btn('Connect to Striga',true,async()=>{
    const key=document.getElementById('s-apikey').value.trim();
    const secret=document.getElementById('s-apisecret').value.trim();
    const appId=document.getElementById('s-appid').value.trim();
    const live=document.getElementById('s-live').checked;
    if(!key||!secret){toast(form,'API Key and Secret required','error');return;}
    saveCfg({apiKey:key,apiSecret:secret,appId,live});
    saveBtn.textContent='Testing…';saveBtn.disabled=true;
    try{
      await strigaFetch('POST','/ping',{ping:'pong'});
      window.YM_toast?.('Connected to Striga ✓','success');
      _tab='home';renderPanel(container.parentElement||container);
    }catch(e){
      toast(form,'Connection failed: '+e.message,'error');
      saveBtn.textContent='Connect to Striga';saveBtn.disabled=false;
    }
  });
  form.appendChild(saveBtn);
  container.appendChild(form);
}

// ── HOME ──────────────────────────────────────────────────────────────────────
function renderHome(container){
  const user=loadUser();
  // Header avec gradient violet
  const hero=document.createElement('div');
  hero.style.cssText=S({background:`linear-gradient(135deg,${C.accent},#4F46E5)`,borderRadius:'20px',padding:'20px',marginBottom:'16px',animation:'striga-fade .3s ease'});
  hero.innerHTML=`
    <div style="font-size:11px;color:rgba(255,255,255,.6);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">YourMine × Striga</div>
    <div style="font-size:20px;font-weight:700;color:#fff;margin-bottom:2px">${user?esc(user.firstName+' '+user.lastName):'Your Wallet'}</div>
    <div style="font-size:12px;color:rgba(255,255,255,.6)">${user?('ID: '+esc(user.id.slice(0,12)+'…')):'Complete KYC to activate'}</div>`;
  container.appendChild(hero);

  // Actions rapides
  const grid=document.createElement('div');
  grid.style.cssText=S({display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'16px'});
  [['💳','Wallet','wallet'],['👤','KYC','kyc'],['🃏','My Card','card'],['⚙','Settings','settings']].forEach(([icon,label,tab])=>{
    const c=document.createElement('div');
    c.style.cssText=S({background:C.surface,border:'1px solid '+C.border,borderRadius:'14px',padding:'16px',cursor:'pointer',textAlign:'center',transition:'border-color .15s'});
    c.innerHTML=`<div style="font-size:24px;margin-bottom:6px">${icon}</div><div style="font-size:12px;font-weight:600;color:${C.text2}">${label}</div>`;
    c.addEventListener('mouseenter',()=>c.style.borderColor=C.accent);
    c.addEventListener('mouseleave',()=>c.style.borderColor=C.border);
    c.addEventListener('click',()=>{_tab=tab;renderPanel(container.closest('[id]')||container.parentElement.parentElement);});
    grid.appendChild(c);
  });
  container.appendChild(grid);

  // Statut KYC
  if(user){
    const kycCard=card(`<div style="display:flex;align-items:center;gap:10px">
      <div style="width:36px;height:36px;border-radius:50%;background:${user.kycStatus==='APPROVED'?'rgba(34,197,94,.2)':'rgba(123,47,255,.2)'};display:flex;align-items:center;justify-content:center;font-size:18px">${user.kycStatus==='APPROVED'?'✅':'⏳'}</div>
      <div><div style="font-size:13px;font-weight:600;color:${C.text}">KYC Status</div>
      <div style="font-size:11px;color:${user.kycStatus==='APPROVED'?C.green:C.accent}">${esc(user.kycStatus||'PENDING')}</div></div></div>`);
    container.appendChild(kycCard);
  }else{
    const onboard=btn('🚀 Create Account & Start KYC',true,()=>{_tab='kyc';renderPanel(container.closest('[id]')||container.parentElement.parentElement);});
    container.appendChild(onboard);
  }
}

// ── KYC ───────────────────────────────────────────────────────────────────────
function renderKYC(container){
  const user=loadUser();
  const title=document.createElement('div');
  title.style.cssText=S({fontSize:'18px',fontWeight:'700',color:C.text,marginBottom:'16px',animation:'striga-fade .3s ease'});
  title.textContent=user?'KYC Status':'Create Account';
  container.appendChild(title);

  if(user){
    renderKYCStatus(container,user);
    return;
  }

  // Formulaire de création de compte
  const status=document.createElement('div');container.appendChild(status);
  const form=document.createElement('div');

  const row1=document.createElement('div');row1.style.cssText=S({display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'});
  const f1=field('First Name','k-first','John');f1.style.marginBottom='0';
  const f2=field('Last Name','k-last','Doe');f2.style.marginBottom='0';
  row1.appendChild(f1);row1.appendChild(f2);
  form.appendChild(row1);
  form.style.marginTop='10px';
  form.appendChild(field('Date of Birth (YYYY-MM-DD)','k-dob','1990-01-15'));
  form.appendChild(field('Email','k-email','john@example.com','email'));
  form.appendChild(field('Mobile (E.164 format)','k-phone','+33612345678','tel'));
  form.appendChild(field('Nationality (ISO 3166-1 alpha-2)','k-country','FR'));
  form.appendChild(field('Address Line 1','k-addr1','123 Main Street'));
  form.appendChild(field('City','k-city','Paris'));
  form.appendChild(field('Postal Code','k-postal','75001'));
  form.appendChild(field('Country of Residence','k-country2','FR'));

  const createBtn=btn('Create Account',true,async()=>{
    createBtn.textContent='Creating…';createBtn.disabled=true;
    const cfg=loadCfg();
    const body={
      firstName:document.getElementById('k-first').value.trim(),
      lastName:document.getElementById('k-last').value.trim(),
      dateOfBirth:{year:parseInt((document.getElementById('k-dob').value||'').split('-')[0]),month:parseInt((document.getElementById('k-dob').value||'').split('-')[1]),day:parseInt((document.getElementById('k-dob').value||'').split('-')[2])},
      email:document.getElementById('k-email').value.trim(),
      mobile:{phoneNumber:document.getElementById('k-phone').value.trim().replace(/\s/g,'').replace(/^\+/,'')},
      nationality:document.getElementById('k-country').value.trim().toUpperCase(),
      address:{addressLine1:document.getElementById('k-addr1').value.trim(),city:document.getElementById('k-city').value.trim(),postalCode:document.getElementById('k-postal').value.trim(),state:'',country:document.getElementById('k-country2').value.trim().toUpperCase()},
    };
    try{
      const r=await strigaFetch('POST','/user/create',body);
      saveUser({...r,kycStatus:'NOT_STARTED'});
      window.YM_toast?.('Account created!','success');
      renderKYC(container.parentElement||container);
    }catch(e){
      toast(status,'Error: '+e.message,'error');
      createBtn.textContent='Create Account';createBtn.disabled=false;
    }
  });
  form.appendChild(createBtn);
  container.appendChild(form);
}

function renderKYCStatus(container,user){
  container.appendChild(card(`
    <div style="margin-bottom:12px">
      <div style="font-size:11px;color:${C.text3};margin-bottom:3px">USER ID</div>
      <div style="font-size:12px;color:${C.text2};font-family:monospace">${esc(user.id||user.userId||'—')}</div>
    </div>
    <div style="margin-bottom:12px">
      <div style="font-size:11px;color:${C.text3};margin-bottom:3px">NAME</div>
      <div style="font-size:14px;font-weight:600;color:${C.text}">${esc((user.firstName||'')+' '+(user.lastName||''))}</div>
    </div>
    <div>
      <div style="font-size:11px;color:${C.text3};margin-bottom:3px">KYC STATUS</div>
      <div style="font-size:13px;font-weight:700;color:${user.kycStatus==='APPROVED'?C.green:user.kycStatus==='REJECTED'?C.red:C.accent}">${esc(user.kycStatus||'PENDING')}</div>
    </div>`));

  if(user.kycStatus!=='APPROVED'){
    const status=document.createElement('div');container.appendChild(status);
    const kycBtn=btn('🪪 Start KYC (Get SDK Link)',true,async()=>{
      kycBtn.textContent='Loading…';kycBtn.disabled=true;
      try{
        const userId=user.id||user.userId;
        const r=await strigaFetch('POST',`/user/${userId}/kyc/start`,{});
        if(r.verificationLink){
          window.open(r.verificationLink,'_blank');
          toast(status,'KYC link opened in browser. Complete verification there.','info');
        }
        kycBtn.textContent='🪪 Start KYC';kycBtn.disabled=false;
      }catch(e){toast(status,'Error: '+e.message,'error');kycBtn.textContent='🪪 Start KYC';kycBtn.disabled=false;}
    });
    container.appendChild(kycBtn);
    // Vérifier le statut
    const checkBtn=btn('🔄 Refresh KYC Status',false,async()=>{
      checkBtn.textContent='Checking…';checkBtn.disabled=true;
      try{
        const userId=user.id||user.userId;
        const r=await strigaFetch('GET',`/user/${userId}`,{});
        saveUser({...user,...r,kycStatus:r.kycStatus||user.kycStatus});
        window.YM_toast?.(r.kycStatus==='APPROVED'?'KYC Approved! 🎉':'Status: '+r.kycStatus,'info');
        renderKYC(container.parentElement||container);
      }catch(e){toast(status,'Error: '+e.message,'error');checkBtn.textContent='🔄 Refresh';checkBtn.disabled=false;}
    });
    container.appendChild(checkBtn);
  }
}

// ── WALLET ────────────────────────────────────────────────────────────────────
function renderWallet(container){
  const user=loadUser();
  const title=document.createElement('div');
  title.style.cssText=S({fontSize:'18px',fontWeight:'700',color:C.text,marginBottom:'16px'});
  title.textContent='My Wallet';
  container.appendChild(title);

  if(!user){
    container.appendChild(card(`<div style="text-align:center;color:${C.text3};font-size:13px;padding:8px">Create an account first (KYC tab)</div>`));
    return;
  }

  const status=document.createElement('div');container.appendChild(status);
  const walletsEl=document.createElement('div');container.appendChild(walletsEl);
  const l=loader(walletsEl,'Loading wallets…');

  strigaFetch('POST',`/user/${user.id||user.userId}/wallets`,{startDate:0,endDate:Date.now(),page:0}).then(r=>{
    l.remove();walletsEl.innerHTML='';
    const wallets=r.wallets||[];
    if(!wallets.length){
      walletsEl.appendChild(card(`<div style="text-align:center;color:${C.text3};font-size:13px">No wallets yet. Complete KYC to get your wallet.</div>`));
      return;
    }
    wallets.forEach(w=>{
      const wCard=card(`<div style="font-size:12px;color:${C.text3};margin-bottom:10px">WALLET · ${esc(w.walletId||w.id||'')}</div>`);
      const accounts=w.accounts||{};
      Object.entries(accounts).forEach(([currency,acc])=>{
        const bal=document.createElement('div');
        bal.style.cssText=S({display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid '+C.border});
        bal.innerHTML=`<div style="display:flex;align-items:center;gap:10px">
          <div style="width:36px;height:36px;border-radius:50%;background:${C.accentLight};display:flex;align-items:center;justify-content:center;font-size:16px">${currency==='EUR'?'€':currency==='BTC'?'₿':currency==='ETH'?'Ξ':'💰'}</div>
          <div><div style="font-size:14px;font-weight:600;color:${C.text}">${esc(currency)}</div>
          <div style="font-size:10px;color:${C.text3}">${esc(acc.status||'')}</div></div></div>
          <div style="text-align:right">
          <div style="font-size:16px;font-weight:700;color:${C.text}">${acc.availableBalance?((parseInt(acc.availableBalance)/100).toFixed(2)):('—')}</div>
          <div style="font-size:10px;color:${C.text3}">Available</div></div>`;
        wCard.appendChild(bal);
      });
      walletsEl.appendChild(wCard);
    });
  }).catch(e=>{l.remove();toast(status,'Error loading wallets: '+e.message,'error');});
}

// ── CARD ──────────────────────────────────────────────────────────────────────
function renderCard(container){
  const user=loadUser();
  const title=document.createElement('div');
  title.style.cssText=S({fontSize:'18px',fontWeight:'700',color:C.text,marginBottom:'16px'});
  title.textContent='My Card';
  container.appendChild(title);

  if(!user||user.kycStatus!=='APPROVED'){
    container.appendChild(card(`<div style="text-align:center;color:${C.text3};font-size:13px;padding:8px">KYC must be approved to get a card</div>`));
    return;
  }

  const status=document.createElement('div');container.appendChild(status);

  // Visual card
  const vizCard=document.createElement('div');
  vizCard.style.cssText=S({background:`linear-gradient(135deg,#1a0533,${C.accent})`,borderRadius:'20px',padding:'22px',marginBottom:'16px',position:'relative',overflow:'hidden',aspectRatio:'1.586/1'});
  vizCard.innerHTML=`
    <div style="position:absolute;top:-20px;right:-20px;width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,.05)"></div>
    <div style="position:absolute;bottom:-30px;right:30px;width:100px;height:100px;border-radius:50%;background:rgba(255,255,255,.04)"></div>
    <div style="font-size:14px;font-weight:700;color:rgba(255,255,255,.5);letter-spacing:2px;margin-bottom:20px">STRIGA</div>
    <div style="font-size:16px;color:#fff;letter-spacing:3px;font-family:monospace;margin-bottom:20px" id="card-num">•••• •••• •••• ••••</div>
    <div style="display:flex;justify-content:space-between;align-items:flex-end">
      <div><div style="font-size:9px;color:rgba(255,255,255,.5);margin-bottom:2px">CARD HOLDER</div>
      <div style="font-size:13px;font-weight:600;color:#fff">${esc((user.firstName||'')+ ' '+(user.lastName||'')).toUpperCase()}</div></div>
      <div style="font-size:22px;opacity:.7">💳</div></div>`;
  container.appendChild(vizCard);

  // Actions carte
  const actGrid=document.createElement('div');
  actGrid.style.cssText=S({display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'});
  const cardsEl=document.createElement('div');

  const fetchCardsBtn=btn('📋 View My Cards',true,async()=>{
    fetchCardsBtn.textContent='Loading…';fetchCardsBtn.disabled=true;
    cardsEl.innerHTML='';
    try{
      const r=await strigaFetch('GET',`/card/all?userId=${user.id||user.userId}`,{});
      const cards=(r.cards||r.data||[]);
      if(!cards.length){
        toast(status,'No cards found. Issue a new card.','info');
      }else{
        cards.forEach(c=>{
          const cCard=card(`
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
              <div style="font-size:13px;font-weight:600;color:${C.text}">••••  ${esc(c.maskedCardNumber?.slice(-4)||'••••')}</div>
              <div style="font-size:11px;padding:3px 10px;border-radius:999px;background:${c.status==='ACTIVE'?'rgba(34,197,94,.15)':'rgba(239,68,68,.15)'};color:${c.status==='ACTIVE'?C.green:C.red}">${esc(c.status||'')}</div>
            </div>
            <div style="font-size:11px;color:${C.text3}">ID: ${esc(c.cardId||c.id||'')}</div>`);
          cardsEl.appendChild(cCard);
        });
      }
      fetchCardsBtn.textContent='📋 View My Cards';fetchCardsBtn.disabled=false;
    }catch(e){toast(status,'Error: '+e.message,'error');fetchCardsBtn.textContent='📋 View My Cards';fetchCardsBtn.disabled=false;}
  });
  actGrid.appendChild(fetchCardsBtn);

  const issueBtn=btn('✨ Issue New Card',false,async()=>{
    issueBtn.textContent='Issuing…';issueBtn.disabled=true;
    try{
      // Récupère les wallets pour trouver l'accountId EUR
      const walletR=await strigaFetch('POST',`/user/${user.id||user.userId}/wallets`,{startDate:0,endDate:Date.now(),page:0});
      const wallet=(walletR.wallets||[])[0];
      if(!wallet){toast(status,'No wallet found. Complete KYC first.','error');issueBtn.textContent='✨ Issue New Card';issueBtn.disabled=false;return;}
      const eurAcc=Object.entries(wallet.accounts||{}).find(([cur])=>cur==='EUR');
      if(!eurAcc){toast(status,'No EUR account found.','error');issueBtn.textContent='✨ Issue New Card';issueBtn.disabled=false;return;}
      const r=await strigaFetch('POST','/card/issue',{userId:user.id||user.userId,accountId:eurAcc[1].accountId||eurAcc[1].id,cardType:'VIRTUAL'});
      window.YM_toast?.('Card issued! 🎉','success');
      issueBtn.textContent='✨ Issue New Card';issueBtn.disabled=false;
      renderCard(container.parentElement||container);
    }catch(e){toast(status,'Error: '+e.message,'error');issueBtn.textContent='✨ Issue New Card';issueBtn.disabled=false;}
  });
  actGrid.appendChild(issueBtn);
  container.appendChild(actGrid);
  container.appendChild(status);
  container.appendChild(cardsEl);
}

// ── SETTINGS ──────────────────────────────────────────────────────────────────
function renderSettings(container){
  const cfg=loadCfg();
  const user=loadUser();

  const title=document.createElement('div');
  title.style.cssText=S({fontSize:'18px',fontWeight:'700',color:C.text,marginBottom:'16px'});
  title.textContent='Settings';
  container.appendChild(title);

  const status=document.createElement('div');container.appendChild(status);

  container.appendChild(card(`
    <div style="font-size:11px;color:${C.text3};margin-bottom:3px">ENVIRONMENT</div>
    <div style="font-size:13px;color:${C.text};font-weight:600">${cfg.live?'🟢 Production':'🟡 Sandbox'}</div>
    <div style="font-size:11px;color:${C.text3};margin-top:6px">API Key: ${cfg.apiKey?cfg.apiKey.slice(0,8)+'…':'—'}</div>`));

  if(user){
    container.appendChild(card(`
      <div style="font-size:11px;color:${C.text3};margin-bottom:3px">ACCOUNT</div>
      <div style="font-size:13px;font-weight:600;color:${C.text}">${esc(user.firstName||'')} ${esc(user.lastName||'')}</div>
      <div style="font-size:11px;color:${C.text3};margin-top:4px;font-family:monospace">${esc(user.id||user.userId||'')}</div>`));
  }

  // Ping test
  const pingBtn=btn('🔔 Test API Connection',false,async()=>{
    pingBtn.textContent='Testing…';pingBtn.disabled=true;
    try{
      await strigaFetch('POST','/ping',{ping:'pong'});
      toast(status,'API connection OK ✓','success');
    }catch(e){toast(status,'Connection failed: '+e.message,'error');}
    pingBtn.textContent='🔔 Test API Connection';pingBtn.disabled=false;
  });
  container.appendChild(pingBtn);

  // Reconfigurer
  const reconfigBtn=btn('🔧 Reconfigure API Keys',false,()=>{
    if(confirm('Reconfigure API keys?')){saveCfg({});renderPanel(container.closest('[id]')||container.parentElement.parentElement);}
  });
  container.appendChild(reconfigBtn);

  // Reset user
  if(user){
    const resetBtn=btn('🗑 Clear Saved Account',false,()=>{
      if(confirm('Remove saved account data?')){saveUser(null);window.YM_toast?.('Account cleared','info');renderPanel(container.closest('[id]')||container.parentElement.parentElement);}
    });
    resetBtn.style.color=C.red;
    container.appendChild(resetBtn);
  }
}

// ── SPHERE ─────────────────────────────────────────────────────────────────────
window.YM_S['striga.sphere.js']={
  name:'Striga',icon:'🟣',category:'Finance',
  description:'Striga Banking API — KYC, wallet EUR/crypto, carte virtuelle Mastercard',
  emit:[],receive:[],
  activate:function(){},
  deactivate:function(){},
  renderPanel,
  profileSection:function(container){
    const user=loadUser();
    if(!user)return;
    const el=document.createElement('div');
    el.style.cssText=S({display:'flex',flexDirection:'column',gap:'6px'});
    el.innerHTML=`
      <div style="display:flex;align-items:center;gap:10px;background:linear-gradient(135deg,#1a0533,${C.accent});border-radius:12px;padding:12px">
        <div style="font-size:24px">🟣</div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:700;color:#fff">${esc((user.firstName||'')+' '+(user.lastName||''))}</div>
          <div style="font-size:11px;color:rgba(255,255,255,.6)">KYC: ${esc(user.kycStatus||'—')}</div>
        </div>
        <div style="font-size:11px;padding:3px 10px;border-radius:999px;background:${user.kycStatus==='APPROVED'?'rgba(34,197,94,.2)':'rgba(123,47,255,.2)'};color:${user.kycStatus==='APPROVED'?C.green:C.accent}">${user.kycStatus==='APPROVED'?'Active':'Pending'}</div>
      </div>`;
    container.appendChild(el);
  }
};
})();
