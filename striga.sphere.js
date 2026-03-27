/* striga.sphere.js — YourMine Banking Sphere
 * ⚠️  REMPLACE L'URL CI-DESSOUS par la tienne :
 *     dash.cloudflare.com → Workers & Pages → striga-proxy → URL
 */
(function(){
'use strict';
window.YM_S = window.YM_S || {};

const WORKER_URL = 'https://striga-proxy.yourmine.workers.dev';
const USER_KEY   = 'ym_striga_user_v2';

function loadUser(){ try{ return JSON.parse(localStorage.getItem(USER_KEY)||'null'); }catch{ return null; } }
function saveUser(d){ d===null ? localStorage.removeItem(USER_KEY) : localStorage.setItem(USER_KEY,JSON.stringify(d)); }

async function api(method, endpoint, body={}){
  const r = await fetch(WORKER_URL+'/proxy', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({method, endpoint, body})
  });
  const d = await r.json();
  if(!r.ok) throw new Error(d.error||d.errorDetails||d.message||'Erreur '+r.status);
  return d;
}

function injectCSS(){
  if(document.getElementById('sg-css')) return;
  const s=document.createElement('style'); s.id='sg-css';
  s.textContent=`
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&family=DM+Mono:wght@400;500&display=swap');
.sg{font-family:'DM Sans',system-ui,sans-serif;display:flex;flex-direction:column;height:100%;overflow:hidden;background:#07070e;-webkit-font-smoothing:antialiased;color:#fff}
.sg *{box-sizing:border-box}
.sg-nav{display:flex;border-bottom:1px solid rgba(255,255,255,.06);background:#07070e;flex-shrink:0}
.sg-tab{flex:1;background:none;border:none;padding:14px 0 12px;font-size:11px;font-weight:500;color:rgba(255,255,255,.3);cursor:pointer;border-bottom:2px solid transparent;transition:all .2s;-webkit-tap-highlight-color:transparent;position:relative;font-family:'DM Sans',sans-serif}
.sg-tab.on{color:#fff;border-bottom-color:#7c3aed}
.sg-tab.on::after{content:'';position:absolute;bottom:-1px;left:25%;right:25%;height:2px;border-radius:1px;background:#7c3aed;box-shadow:0 0 14px rgba(124,58,237,.7)}
.sg-body{flex:1;overflow-y:auto;padding:20px 18px 32px;-webkit-overflow-scrolling:touch}
.sg-body::-webkit-scrollbar{width:2px}
.sg-body::-webkit-scrollbar-thumb{background:rgba(124,58,237,.3);border-radius:1px}
.sg-h1{font-size:22px;font-weight:600;letter-spacing:-.5px;color:#fff;margin-bottom:6px}
.sg-sub{font-size:13px;color:rgba(255,255,255,.4);line-height:1.6;margin-bottom:24px}
.sg-sec{font-family:'DM Mono',monospace;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,.22);margin:20px 0 10px}
.sg-label{display:block;font-size:10px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:rgba(255,255,255,.28);margin-bottom:7px;font-family:'DM Mono',monospace}
.sg-inp{width:100%;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:14px 16px;color:#fff;font-family:'DM Sans',sans-serif;font-size:15px;outline:none;-webkit-appearance:none;transition:border-color .2s,background .2s;margin-bottom:14px}
.sg-inp:focus{border-color:rgba(124,58,237,.6);background:rgba(255,255,255,.055);box-shadow:0 0 0 3px rgba(124,58,237,.1)}
.sg-inp::placeholder{color:rgba(255,255,255,.18)}
.sg-row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.sg-cta{width:100%;padding:15px;border:none;border-radius:14px;font-family:'DM Sans',sans-serif;font-size:15px;font-weight:600;cursor:pointer;transition:all .2s;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;box-shadow:0 8px 24px rgba(124,58,237,.28);margin-bottom:10px;display:flex;align-items:center;justify-content:center;gap:8px}
.sg-cta:hover{transform:translateY(-1px);box-shadow:0 12px 32px rgba(124,58,237,.4)}
.sg-cta:active{transform:scale(.98)}
.sg-cta:disabled{opacity:.4;cursor:not-allowed;transform:none}
.sg-btn{width:100%;padding:13px;border-radius:14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);color:rgba(255,255,255,.65);font-family:'DM Sans',sans-serif;font-size:14px;font-weight:500;cursor:pointer;transition:all .2s;margin-bottom:10px;display:flex;align-items:center;justify-content:center;gap:8px}
.sg-btn:hover{border-color:rgba(124,58,237,.4);color:#fff;background:rgba(124,58,237,.07)}
.sg-btn.red{border-color:rgba(239,68,68,.3);color:rgba(239,68,68,.75)}
.sg-btn.red:hover{background:rgba(239,68,68,.08);color:#f87171}
.sg-card{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:20px;padding:20px;margin-bottom:14px}
.sg-hero{border-radius:22px;padding:22px;margin-bottom:20px;background:linear-gradient(135deg,#0f0527 0%,#1a0845 50%,#2a1060 100%);position:relative;overflow:hidden}
.sg-hero::before{content:'';position:absolute;top:-40px;right:-40px;width:200px;height:200px;border-radius:50%;background:radial-gradient(circle,rgba(124,58,237,.35),transparent 70%);pointer-events:none}
.sg-badge{display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:999px;font-size:11px;font-weight:600;font-family:'DM Mono',monospace}
.sg-badge.ok{background:rgba(52,211,153,.1);color:#34d399;border:1px solid rgba(52,211,153,.2)}
.sg-badge.pend{background:rgba(124,58,237,.12);color:#a78bfa;border:1px solid rgba(124,58,237,.25)}
.sg-badge.err{background:rgba(239,68,68,.1);color:#f87171;border:1px solid rgba(239,68,68,.2)}
.sg-notice{padding:12px 16px;border-radius:12px;font-size:12px;line-height:1.6;margin-bottom:14px;display:flex;gap:10px;align-items:flex-start}
.sg-notice.ok{background:rgba(52,211,153,.07);border:1px solid rgba(52,211,153,.18);color:#34d399}
.sg-notice.info{background:rgba(124,58,237,.07);border:1px solid rgba(124,58,237,.2);color:#a78bfa}
.sg-notice.err{background:rgba(239,68,68,.07);border:1px solid rgba(239,68,68,.18);color:#f87171}
.sg-spin{width:18px;height:18px;border:2px solid rgba(255,255,255,.1);border-top-color:#7c3aed;border-radius:50%;animation:sg-r .6s linear infinite;display:inline-block;flex-shrink:0}
@keyframes sg-r{to{transform:rotate(360deg)}}
.sg-row{display:flex;align-items:center;justify-content:space-between;padding:13px 0;border-bottom:1px solid rgba(255,255,255,.04)}
.sg-row:last-child{border-bottom:none}
.sg-vcard{border-radius:24px;padding:24px;margin-bottom:20px;background:linear-gradient(135deg,#0a0020,#18004a,#2a1270);box-shadow:0 24px 64px rgba(124,58,237,.22);position:relative;overflow:hidden;aspect-ratio:1.586;display:flex;flex-direction:column;justify-content:space-between}
.sg-vcard::before{content:'';position:absolute;top:-50px;right:-50px;width:220px;height:220px;border-radius:50%;background:rgba(124,58,237,.14);pointer-events:none}
.sg-g2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}
@keyframes sg-up{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
.sg-in{animation:sg-up .28s ease forwards}
`;
  document.head.appendChild(s);
}

function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function mkField(label,id,ph,type='text',val=''){
  const w=document.createElement('div');
  w.innerHTML=`<label class="sg-label">${esc(label)}</label><input class="sg-inp" id="${id}" type="${type}" placeholder="${esc(ph)}" value="${esc(val)}">`;
  return w;
}
function mkNotice(msg,type='info'){
  const d=document.createElement('div'); d.className=`sg-notice ${type} sg-in`;
  d.innerHTML=`<span>${type==='ok'?'✓':type==='err'?'✕':'ℹ'}</span><span>${esc(msg)}</span>`;
  return d;
}
function mkSpin(){ const d=document.createElement('span');d.className='sg-spin';return d; }
function v(id){ return document.getElementById(id)?.value?.trim()||''; }

let _tab='home';

function renderPanel(container){
  injectCSS();
  container.innerHTML='';
  container.className='sg';
  const nav=document.createElement('div'); nav.className='sg-nav';
  [['home','🏠'],['wallet','💳'],['kyc','👤'],['card','🃏']].forEach(([id,icon])=>{
    const b=document.createElement('button');
    b.className='sg-tab'+(_tab===id?' on':'');
    b.textContent=icon+' '+(id==='kyc'?'KYC':id.charAt(0).toUpperCase()+id.slice(1));
    b.addEventListener('click',()=>{ _tab=id; renderPanel(container); });
    nav.appendChild(b);
  });
  container.appendChild(nav);
  const body=document.createElement('div'); body.className='sg-body';
  container.appendChild(body);
  if(_tab==='home')       tabHome(body,container);
  else if(_tab==='wallet') tabWallet(body);
  else if(_tab==='kyc')    tabKYC(body,container);
  else                     tabCard(body,container);
}

function tabHome(body,root){
  body.classList.add('sg-in');
  const user=loadUser();
  const hero=document.createElement('div'); hero.className='sg-hero';
  hero.innerHTML=`<div style="position:relative;z-index:1">
    <div style="font-family:'DM Mono',monospace;font-size:9px;color:rgba(255,255,255,.35);letter-spacing:2px;margin-bottom:14px">STRIGA · BANKING</div>
    <div style="font-size:26px;font-weight:600;color:#fff;margin-bottom:4px">${user?esc(user.firstName+' '+user.lastName):'Bienvenue'}</div>
    <div style="font-size:13px;color:rgba(255,255,255,.4);margin-bottom:${user?14:0}px">${user?esc((user.id||user.userId||'').slice(0,22)+'…'):'Créez votre compte pour commencer'}</div>
    ${user?`<span class="sg-badge ${user.kycStatus==='APPROVED'?'ok':'pend'}">${user.kycStatus==='APPROVED'?'✓ KYC vérifié':'⏳ KYC en attente'}</span>`:''}
  </div>`;
  body.appendChild(hero);
  if(!user){
    const cta=document.createElement('button'); cta.className='sg-cta';
    cta.textContent='👤 Créer mon compte';
    cta.addEventListener('click',()=>{ _tab='kyc'; renderPanel(root); });
    body.appendChild(cta); return;
  }
  const balEl=document.createElement('div'); balEl.className='sg-card';
  balEl.innerHTML=`<div style="font-size:11px;color:rgba(255,255,255,.3);margin-bottom:8px;font-family:'DM Mono',monospace">WALLET</div><div style="display:flex;align-items:center;gap:8px"><span class="sg-spin" style="width:14px;height:14px;border-width:1.5px"></span><span style="font-size:13px;color:rgba(255,255,255,.3)">Chargement…</span></div>`;
  body.appendChild(balEl);
  api('POST',`/user/${user.id||user.userId}/wallets`,{startDate:0,endDate:Date.now(),page:0}).then(r=>{
    const accounts=(r.wallets||[])[0]?.accounts||{};
    const icons={EUR:'€',BTC:'₿',ETH:'Ξ',USDC:'$',SOL:'◎'};
    const lines=Object.entries(accounts).map(([cur,acc])=>{
      const bal=acc.availableBalance?(parseInt(acc.availableBalance)/100).toFixed(2):'0.00';
      return `<div class="sg-row"><div style="display:flex;align-items:center;gap:10px"><div style="width:36px;height:36px;border-radius:12px;background:rgba(124,58,237,.15);display:flex;align-items:center;justify-content:center;font-size:16px">${icons[cur]||'💰'}</div><span style="font-weight:500">${esc(cur)}</span></div><span style="font-size:18px;font-weight:600">${esc(bal)}</span></div>`;
    }).join('');
    balEl.innerHTML=`<div style="font-size:11px;color:rgba(255,255,255,.3);margin-bottom:8px;font-family:'DM Mono',monospace">WALLET</div>${lines||'<span style="font-size:13px;color:rgba(255,255,255,.3)">Aucun solde</span>'}`;
  }).catch(()=>{ balEl.innerHTML='<div style="font-size:12px;color:rgba(255,255,255,.3)">Wallet non disponible</div>'; });
  const g=document.createElement('div'); g.className='sg-g2';
  [['💳 Wallet','wallet'],['🃏 Carte','card']].forEach(([label,tab])=>{
    const b=document.createElement('button'); b.className='sg-btn'; b.style.margin='0';
    b.textContent=label;
    b.addEventListener('click',()=>{ _tab=tab; renderPanel(root); });
    g.appendChild(b);
  });
  body.appendChild(g);
}

function tabKYC(body,root){
  body.classList.add('sg-in');
  const user=loadUser();
  if(user){ kycStatus(body,user,root); return; }
  body.innerHTML='<div class="sg-h1">Créer un compte</div><div class="sg-sub">Vérification d\'identité pour activer votre wallet et votre carte Mastercard virtuelle.</div>';
  const fb=document.createElement('div'); body.appendChild(fb);
  const s1=document.createElement('div'); s1.innerHTML='<div class="sg-sec">Identité</div>';
  const nr=document.createElement('div'); nr.className='sg-row2';
  [mkField('Prénom','sg-fn','Jean'),mkField('Nom','sg-ln','Dupont')].forEach(f=>{ f.querySelector('.sg-inp').style.marginBottom='0'; nr.appendChild(f); });
  s1.appendChild(nr); s1.style.marginTop='14px';
  s1.appendChild(mkField('Date de naissance','sg-dob','1990-01-15'));
  s1.appendChild(mkField('Nationalité (FR, DE…)','sg-nat','FR'));
  body.appendChild(s1);
  const s2=document.createElement('div'); s2.innerHTML='<div class="sg-sec">Contact</div>';
  s2.appendChild(mkField('Email','sg-email','jean@example.com','email'));
  s2.appendChild(mkField('Téléphone (+33…)','sg-tel','+33612345678','tel'));
  body.appendChild(s2);
  const s3=document.createElement('div'); s3.innerHTML='<div class="sg-sec">Adresse</div>';
  s3.appendChild(mkField('Adresse','sg-addr','12 rue de la Paix'));
  const cr=document.createElement('div'); cr.className='sg-row2';
  [mkField('Ville','sg-city','Paris'),mkField('Code postal','sg-postal','75001')].forEach(f=>{ f.querySelector('.sg-inp').style.marginBottom='0'; cr.appendChild(f); });
  s3.appendChild(cr); s3.style.marginTop='14px';
  s3.appendChild(mkField('Pays de résidence','sg-country','FR'));
  body.appendChild(s3);
  const cta=document.createElement('button'); cta.className='sg-cta'; cta.textContent='✓ Créer mon compte';
  cta.addEventListener('click',async()=>{
    cta.disabled=true; cta.innerHTML=''; cta.appendChild(mkSpin()); cta.append(' Création en cours…');
    const dob=v('sg-dob').split('-');
    const payload={firstName:v('sg-fn'),lastName:v('sg-ln'),dateOfBirth:{year:+dob[0]||1990,month:+dob[1]||1,day:+dob[2]||1},email:v('sg-email'),mobile:{phoneNumber:v('sg-tel').replace(/\s/g,'').replace(/^\+/,'')},nationality:v('sg-nat').toUpperCase(),address:{addressLine1:v('sg-addr'),city:v('sg-city'),postalCode:v('sg-postal'),state:'',country:v('sg-country').toUpperCase()}};
    try{
      const r=await api('POST','/user/create',payload);
      saveUser({...r,kycStatus:'NOT_STARTED'});
      window.YM_toast?.('Compte créé avec succès !','success');
      tabKYC(body,root);
    }catch(e){ fb.innerHTML=''; fb.appendChild(mkNotice('Erreur : '+e.message,'err')); cta.disabled=false; cta.textContent='✓ Créer mon compte'; }
  });
  body.appendChild(cta);
}

function kycStatus(body,user,root){
  body.innerHTML=''; body.classList.add('sg-in');
  const c=document.createElement('div'); c.className='sg-card';
  c.innerHTML=`<div class="sg-row" style="padding-top:0"><div style="display:flex;align-items:center;gap:14px"><div style="width:52px;height:52px;border-radius:18px;background:rgba(124,58,237,.15);display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0">👤</div><div><div style="font-size:18px;font-weight:600">${esc(user.firstName||'')} ${esc(user.lastName||'')}</div><div style="font-size:11px;color:rgba(255,255,255,.3);font-family:'DM Mono',monospace;margin-top:3px">${esc((user.id||user.userId||'').slice(0,26)+'…')}</div></div></div><span class="sg-badge ${user.kycStatus==='APPROVED'?'ok':user.kycStatus==='REJECTED'?'err':'pend'}">${esc(user.kycStatus||'PENDING')}</span></div>${user.email?`<div class="sg-row"><span style="font-size:12px;color:rgba(255,255,255,.4)">Email</span><span style="font-size:13px;color:rgba(255,255,255,.7)">${esc(user.email)}</span></div>`:''}`;
  body.appendChild(c);
  const fb=document.createElement('div'); body.appendChild(fb);
  if(user.kycStatus==='APPROVED'){
    body.appendChild(mkNotice('Identité vérifiée. Wallet et carte disponibles.','ok'));
    const b=document.createElement('button'); b.className='sg-cta'; b.textContent='🃏 Voir ma carte';
    b.addEventListener('click',()=>{ _tab='card'; renderPanel(root); });
    body.appendChild(b); return;
  }
  const kBtn=document.createElement('button'); kBtn.className='sg-cta'; kBtn.textContent='🪪 Lancer la vérification d\'identité';
  kBtn.addEventListener('click',async()=>{
    kBtn.disabled=true; kBtn.innerHTML=''; kBtn.appendChild(mkSpin()); kBtn.append(' Chargement…');
    try{
      const r=await api('POST',`/user/${user.id||user.userId}/kyc/start`,{});
      if(r.verificationLink) window.open(r.verificationLink,'_blank');
      fb.innerHTML=''; fb.appendChild(mkNotice('Lien de vérification ouvert. Revenez ici une fois terminé.','info'));
      kBtn.disabled=false; kBtn.textContent='🪪 Lancer la vérification d\'identité';
    }catch(e){ fb.innerHTML=''; fb.appendChild(mkNotice('Erreur : '+e.message,'err')); kBtn.disabled=false; kBtn.textContent='🪪 Lancer la vérification d\'identité'; }
  });
  body.appendChild(kBtn);
  const rBtn=document.createElement('button'); rBtn.className='sg-btn'; rBtn.textContent='↻  Actualiser mon statut KYC';
  rBtn.addEventListener('click',async()=>{
    rBtn.disabled=true; rBtn.innerHTML=''; rBtn.appendChild(mkSpin()); rBtn.append(' Vérification…');
    try{
      const r=await api('GET',`/user/${user.id||user.userId}`,{});
      saveUser({...user,...r});
      window.YM_toast?.(r.kycStatus==='APPROVED'?'KYC approuvé ! 🎉':'Statut : '+r.kycStatus,'info');
      tabKYC(body,root);
    }catch(e){ fb.innerHTML=''; fb.appendChild(mkNotice('Erreur : '+e.message,'err')); rBtn.disabled=false; rBtn.textContent='↻  Actualiser mon statut KYC'; }
  });
  body.appendChild(rBtn);
  const delBtn=document.createElement('button'); delBtn.className='sg-btn red'; delBtn.textContent='Supprimer mon compte local';
  delBtn.addEventListener('click',()=>{ if(confirm('Supprimer les données locales ?')){ saveUser(null); window.YM_toast?.('Supprimé','info'); tabKYC(body,root); } });
  body.appendChild(delBtn);
}

function tabWallet(body){
  body.classList.add('sg-in');
  const user=loadUser();
  body.innerHTML='<div class="sg-h1" style="margin-bottom:20px">Mon Wallet</div>';
  if(!user){ body.appendChild(mkNotice('Créez un compte (onglet KYC)','info')); return; }
  const fb=document.createElement('div'); body.appendChild(fb);
  const wrap=document.createElement('div'); wrap.style.cssText='padding:40px;display:flex;justify-content:center'; wrap.appendChild(mkSpin()); body.appendChild(wrap);
  api('POST',`/user/${user.id||user.userId}/wallets`,{startDate:0,endDate:Date.now(),page:0}).then(r=>{
    wrap.remove();
    const wallets=r.wallets||[];
    if(!wallets.length){ fb.appendChild(mkNotice('Aucun wallet. Complétez votre KYC.','info')); return; }
    const icons={EUR:'€',BTC:'₿',ETH:'Ξ',USDC:'$',SOL:'◎'};
    wallets.forEach(w=>{
      const wc=document.createElement('div'); wc.className='sg-card';
      const wh=document.createElement('div'); wh.style.cssText="font-family:'DM Mono',monospace;font-size:9px;color:rgba(255,255,255,.22);letter-spacing:1px;margin-bottom:16px";
      wh.textContent='WALLET · '+(w.walletId||w.id||'').slice(0,20)+'…'; wc.appendChild(wh);
      Object.entries(w.accounts||{}).forEach(([cur,acc])=>{
        const row=document.createElement('div'); row.className='sg-row';
        const bal=acc.availableBalance?(parseInt(acc.availableBalance)/100).toFixed(2):'0.00';
        row.innerHTML=`<div style="display:flex;align-items:center;gap:12px"><div style="width:42px;height:42px;border-radius:14px;background:rgba(124,58,237,.12);display:flex;align-items:center;justify-content:center;font-size:20px">${icons[cur]||'💰'}</div><div><div style="font-size:15px;font-weight:500">${esc(cur)}</div><div style="font-size:11px;color:rgba(255,255,255,.3)">${esc(acc.status||'')}</div></div></div><div style="text-align:right"><div style="font-size:22px;font-weight:600">${esc(bal)}</div><div style="font-size:10px;color:rgba(255,255,255,.28)">disponible</div></div>`;
        wc.appendChild(row);
      });
      body.appendChild(wc);
    });
  }).catch(e=>{ wrap.remove(); fb.appendChild(mkNotice('Erreur : '+e.message,'err')); });
}

function tabCard(body,root){
  body.classList.add('sg-in');
  const user=loadUser();
  body.innerHTML='<div class="sg-h1" style="margin-bottom:20px">Ma Carte</div>';
  if(!user){ body.appendChild(mkNotice('Créez un compte (onglet KYC)','info')); const b=document.createElement('button');b.className='sg-cta';b.textContent='👤 Créer un compte';b.addEventListener('click',()=>{ _tab='kyc'; renderPanel(root); });body.appendChild(b); return; }
  if(user.kycStatus!=='APPROVED'){ body.appendChild(mkNotice('Votre KYC doit être approuvé pour émettre une carte.','info')); const b=document.createElement('button');b.className='sg-cta';b.textContent='👤 Compléter le KYC';b.addEventListener('click',()=>{ _tab='kyc'; renderPanel(root); });body.appendChild(b); return; }
  const vc=document.createElement('div'); vc.className='sg-vcard';
  vc.innerHTML=`<div style="position:relative;z-index:1;font-family:'DM Mono',monospace;font-size:10px;color:rgba(255,255,255,.38);letter-spacing:2.5px">STRIGA</div><div style="position:relative;z-index:1"><div style="font-family:'DM Mono',monospace;font-size:17px;color:rgba(255,255,255,.65);letter-spacing:4px;margin-bottom:20px">•••• •••• •••• ••••</div><div style="display:flex;justify-content:space-between;align-items:flex-end"><div><div style="font-size:9px;color:rgba(255,255,255,.3);letter-spacing:1px;margin-bottom:4px">TITULAIRE</div><div style="font-size:15px;font-weight:600;color:#fff">${esc((user.firstName||'').toUpperCase()+' '+(user.lastName||'').toUpperCase())}</div></div><div style="font-family:'DM Mono',monospace;font-size:12px;color:rgba(255,255,255,.3);letter-spacing:2px">MASTERCARD</div></div></div>`;
  body.appendChild(vc);
  const fb=document.createElement('div'); body.appendChild(fb);
  const cardsEl=document.createElement('div'); body.appendChild(cardsEl);
  const g=document.createElement('div'); g.className='sg-g2';
  const vBtn=document.createElement('button'); vBtn.className='sg-cta'; vBtn.style.margin='0'; vBtn.textContent='📋 Mes cartes';
  vBtn.addEventListener('click',async()=>{
    vBtn.disabled=true; vBtn.innerHTML=''; vBtn.appendChild(mkSpin()); vBtn.append(' …');
    cardsEl.innerHTML=''; fb.innerHTML='';
    try{
      const r=await api('GET',`/card/all?userId=${user.id||user.userId}`,{});
      const cards=r.cards||r.data||[];
      if(!cards.length){ fb.appendChild(mkNotice('Aucune carte. Émettez-en une →','info')); }
      else cards.forEach(card=>{
        const cc=document.createElement('div'); cc.className='sg-card'; cc.style.marginBottom='10px';
        cc.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div style="font-family:'DM Mono',monospace;font-size:16px;color:#fff">•••• ${esc(card.maskedCardNumber?.slice(-4)||'••••')}</div><span class="sg-badge ${card.status==='ACTIVE'?'ok':'err'}">${esc(card.status||'')}</span></div><div style="font-size:10px;color:rgba(255,255,255,.28);font-family:'DM Mono',monospace">ID: ${esc(card.cardId||card.id||'')}</div>`;
        cardsEl.appendChild(cc);
      });
      vBtn.disabled=false; vBtn.textContent='📋 Mes cartes';
    }catch(e){ fb.appendChild(mkNotice('Erreur : '+e.message,'err')); vBtn.disabled=false; vBtn.textContent='📋 Mes cartes'; }
  });
  g.appendChild(vBtn);
  const iBtn=document.createElement('button'); iBtn.className='sg-btn'; iBtn.style.margin='0'; iBtn.textContent='✦ Émettre';
  iBtn.addEventListener('click',async()=>{
    iBtn.disabled=true; iBtn.innerHTML=''; iBtn.appendChild(mkSpin()); iBtn.append(' …');
    fb.innerHTML='';
    try{
      const wr=await api('POST',`/user/${user.id||user.userId}/wallets`,{startDate:0,endDate:Date.now(),page:0});
      const wallet=(wr.wallets||[])[0]; if(!wallet) throw new Error('Aucun wallet.');
      const eurAcc=Object.entries(wallet.accounts||{}).find(([c])=>c==='EUR'); if(!eurAcc) throw new Error('Aucun compte EUR.');
      await api('POST','/card/issue',{userId:user.id||user.userId,accountId:eurAcc[1].accountId||eurAcc[1].id,cardType:'VIRTUAL'});
      window.YM_toast?.('Carte émise ! 🎉','success');
      fb.appendChild(mkNotice('Carte virtuelle Mastercard émise. Cliquez "Mes cartes" pour la voir.','ok'));
      iBtn.disabled=false; iBtn.textContent='✦ Émettre';
    }catch(e){ fb.appendChild(mkNotice('Erreur : '+e.message,'err')); iBtn.disabled=false; iBtn.textContent='✦ Émettre'; }
  });
  g.appendChild(iBtn);
  body.insertBefore(g,fb);
}

window.YM_S['striga.sphere.js']={
  name:'Striga', icon:'🟣', category:'Finance',
  description:'Banking — KYC, wallet EUR/crypto, carte virtuelle Mastercard',
  emit:[], receive:[],
  activate: function(){ injectCSS(); },
  deactivate: function(){},
  renderPanel,
  profileSection: function(container){
    const user=loadUser(); if(!user) return;
    injectCSS();
    const el=document.createElement('div'); el.style.fontFamily="'DM Sans',system-ui,sans-serif";
    el.innerHTML=`<div style="display:flex;align-items:center;gap:12px;background:linear-gradient(135deg,#0f0527,#1a0845);border-radius:16px;padding:14px 16px"><div style="width:44px;height:44px;border-radius:14px;background:rgba(124,58,237,.2);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">🟣</div><div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:600;color:#fff">${esc(user.firstName||'')} ${esc(user.lastName||'')}</div><div style="font-size:11px;color:rgba(255,255,255,.38);margin-top:2px">${esc(user.email||'')}</div></div><span class="sg-badge ${user.kycStatus==='APPROVED'?'ok':'pend'}" style="flex-shrink:0">${user.kycStatus==='APPROVED'?'Actif':'En attente'}</span></div>`;
    container.appendChild(el);
  }
};
})();
