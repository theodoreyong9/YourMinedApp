// build.js — YourMine Build / Publish Panel
/* jshint esversion:11 */
(function(){
'use strict';

const GH_OWNER   = 'theodoreyong9';
const GH_REPO    = 'YourMinedApp';
const GH_REPO_URL = 'https://github.com/'+GH_OWNER+'/'+GH_REPO;
const RAW_BASE   = 'https://raw.githubusercontent.com/'+GH_OWNER+'/'+GH_REPO+'/main/';
const FILES_URL  = RAW_BASE+'files.json';
const THEMES_URL = RAW_BASE+'src/themes/index.json';

// Token persisté en sessionStorage — jamais en localStorage
let _userToken = (function(){
  try{const t=sessionStorage.getItem('ym_build_token');return t?JSON.parse(t):null;}catch{return null;}
})();
function _saveToken(t){
  _userToken=t;
  try{if(t)sessionStorage.setItem('ym_build_token',JSON.stringify(t));
      else sessionStorage.removeItem('ym_build_token');}catch{}
}

let _filesJson   = null;
let _themesJson  = null;
let _watchTimer  = null;
let _lastContainer = null;
let _activeTab   = 'sphere'; // 'sphere' | 'theme'

function toast(m,t){if(window.YM_toast)window.YM_toast(m,t);}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

async function sha256(text){
  const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text.replace(/\r\n/g,'\n')));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
function uuid(){return([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16));}
function fmtRatio(v){if(!v||isNaN(v))return'0';if(Math.abs(v)<0.0001)return v.toExponential(2);return v.toPrecision(4);}

async function fetchFilesJson(force){
  if(_filesJson&&!force)return _filesJson;
  try{const r=await fetch(FILES_URL+'?t='+Date.now(),{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);_filesJson=await r.json();return _filesJson;}
  catch{return [];}
}
async function fetchThemesJson(force){
  if(_themesJson&&!force)return _themesJson;
  try{const r=await fetch(THEMES_URL+'?t='+Date.now(),{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);_themesJson=await r.json();return _themesJson;}
  catch{return ['default.html'];}
}

function startWalletWatch(container){
  clearInterval(_watchTimer);
  _watchTimer=setInterval(()=>{
    if(window.YM_Mine_pubkey&&window.YM_Mine_pubkey()){
      clearInterval(_watchTimer);_watchTimer=null;
      const t=container&&container.isConnected?container:_lastContainer;
      if(t)render(t);
    }
  },800);
}

// Re-render quand wallet change
(function(){
  let _lp=null;
  setInterval(()=>{
    if(!_lastContainer||!_lastContainer.isConnected)return;
    const pk=window.YM_Mine_pubkey?window.YM_Mine_pubkey():null;
    if(pk!==_lp){_lp=pk;render(_lastContainer);}
  },1200);
})();

// ── CALCUL ÉLIGIBILITÉ ────────────────────────────────────────
async function computeEligibility(){
  const pubkey=window.YM_Mine_pubkey?window.YM_Mine_pubkey():null;if(!pubkey)return null;
  const state=window._mineState||{};
  const claimable=window.YM_calcClaimable?window.YM_calcClaimable():0;
  const curLaps=Math.max(1,(state.currentSlot||0)-(state.lastActionSlot||0));
  const files=await fetchFilesJson();
  const myFiles=files.filter(f=>f.author===pubkey).sort((a,b)=>(b.merged_at||0)-(a.merged_at||0));
  const lastPub=myFiles[0]||null;
  if(!lastPub)return{eligible:claimable>0,claimable,curLaps,lastPub:null};
  const lastLaps=Math.max(1,lastPub.laps||1);
  const lastRatio=(lastPub.score+1)/(lastLaps+1);
  const curRatio=(claimable+1)/(curLaps+1);
  const ratioCheck=lastRatio/curRatio;
  return{eligible:claimable>0&&ratioCheck<=1,claimable,curLaps,curRatio,lastPub,lastRatio,ratioCheck,
    curRatioNum:claimable+1,curRatioDen:curLaps+1};
}

// ── BOUTON GITHUB DANS PANEL-HEAD ─────────────────────────────
function _injectGithubBtn(){
  ['#panel-mine .panel-head','#panel-build .panel-head'].forEach(sel=>{
    const h=document.querySelector(sel);if(!h)return;
    if(h.querySelector('.build-gh-btn'))return;
    const a=document.createElement('a');
    a.className='ym-btn ym-btn-ghost build-gh-btn';
    a.href=GH_REPO_URL;a.target='_blank';a.rel='noopener';
    a.style.cssText='font-size:10px;padding:4px 10px;text-decoration:none;flex-shrink:0;margin-left:auto';
    a.textContent='⌥ GitHub';
    a.addEventListener('click',e=>e.stopPropagation());
    h.style.cssText=(h.style.cssText||'')+'display:flex;align-items:center;';
    const existing=h.querySelector('[href="'+GH_REPO_URL+'"]');
    if(existing)existing.remove();
    h.appendChild(a);
  });
}

// ── RENDER PRINCIPAL ──────────────────────────────────────────
async function render(containerArg){
  const body=containerArg||document.getElementById('panel-build-body')||_lastContainer;
  if(!body)return;
  _lastContainer=body;
  body.innerHTML='';
  body.style.cssText='flex:1;overflow:hidden;display:flex;flex-direction:column;background:var(--bg)';
  setTimeout(_injectGithubBtn,0);

  // Contenu + onglets en bas
  const content=document.createElement('div');
  content.style.cssText='flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0';
  body.appendChild(content);

  // Sous-onglets Sphere / Theme en bas
  const tabBar=document.createElement('div');
  tabBar.style.cssText='display:flex;flex-shrink:0;border-top:1px solid rgba(255,255,255,.06)';
  ['sphere','theme'].forEach(t=>{
    const tab=document.createElement('div');
    tab.className='ym-tab'+(_activeTab===t?' active':'');
    tab.dataset.tab=t;
    tab.style.cssText='flex:1;padding:12px 4px;text-align:center;font-size:10px;cursor:pointer';
    tab.textContent=t==='sphere'?'⬡ Sphere':'🎨 Theme';
    tab.addEventListener('click',()=>{
      _activeTab=t;
      tabBar.querySelectorAll('.ym-tab').forEach(el=>el.classList.toggle('active',el.dataset.tab===t));
      content.innerHTML='';
      if(t==='sphere')renderSphereTab(content);
      else renderThemeTab(content);
    });
    tabBar.appendChild(tab);
  });
  body.appendChild(tabBar);

  if(_activeTab==='sphere')renderSphereTab(content);
  else renderThemeTab(content);
}

// ── ONGLET SPHERE ─────────────────────────────────────────────
function renderSphereTab(body){
  const pubkey=window.YM_Mine_pubkey?window.YM_Mine_pubkey():null;
  body.style.cssText='flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;display:flex;flex-direction:column;min-height:0';

  // ÉTAPE GitHub
  _step(body,'GitHub',_userToken?'✓ @'+_userToken.username:null,card=>{
    if(_userToken){
      card.innerHTML+='<div class="ym-notice success" style="font-size:11px;margin-bottom:6px">@<b>'+esc(_userToken.username)+'</b> connecté</div>'+
        '<button id="bld-disc" class="ym-btn ym-btn-ghost" style="font-size:11px;width:100%">Déconnecter</button>';
      card.querySelector('#bld-disc').addEventListener('click',()=>{_saveToken(null);render(_lastContainer);});
    }else{
      card.innerHTML+='<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">'+
        '<input id="bld-tok" class="ym-input" type="password" placeholder="ghp_… (scope: repo)" style="flex:1;font-size:11px">'+
        '<button id="bld-tok-ok" class="ym-btn ym-btn-accent" style="padding:8px 14px">→</button>'+
        '</div><a href="https://github.com/settings/tokens/new?scopes=repo" target="_blank" rel="noopener" style="font-size:10px;color:var(--cyan)">↗ Créer token</a>';
      card.querySelector('#bld-tok-ok').addEventListener('click',async()=>{
        const tok=card.querySelector('#bld-tok').value.trim();if(!tok)return;
        try{const r=await fetch('https://api.github.com/user',{headers:{'Authorization':'token '+tok}});
          if(!r.ok)throw new Error('Token invalide ('+r.status+')');
          const u=await r.json();_saveToken({value:tok,username:u.login});
          toast('Connecté @'+u.login,'success');render(_lastContainer);}
        catch(e){toast(e.message,'error');}
      });
      card.querySelector('#bld-tok').addEventListener('keydown',e=>{if(e.key==='Enter')card.querySelector('#bld-tok-ok').click();});
    }
  });

  // ÉTAPE Sphere name
  _step(body,'Sphere','',card=>{
    card.innerHTML+=
      '<div style="display:flex;gap:6px;margin-bottom:6px">'+
        '<input id="pub-name" class="ym-input" type="text" placeholder="mon-app" style="flex:1;font-size:12px">'+
        '<span style="font-size:11px;color:var(--text3);flex-shrink:0;align-self:center">.sphere.js</span>'+
      '</div>'+
      '<div id="sphere-status" style="font-size:10px;color:var(--text3);min-height:14px"></div>';
    card.querySelector('#pub-name').addEventListener('input',async function(){
      const v=this.value.trim();const st=card.querySelector('#sphere-status');if(!v){st.textContent='';return;}
      const fn=v.replace(/\.sphere\.js$/,'')+'.sphere.js';
      const files=await fetchFilesJson();const ex=files.find(f=>f.filename===fn);
      if(ex)st.innerHTML='<span style="color:var(--gold)">⬆ Upgrade</span> · @'+esc(ex.ghAuthor||'?')+
        ' · <a href="https://github.com/'+GH_OWNER+'/'+GH_REPO+'/blob/main/'+esc(fn)+'" target="_blank" style="color:var(--cyan);font-size:10px">&lt;/&gt;</a>';
      else st.innerHTML='<span style="color:var(--green)">✦ Nouveau</span>';
      // Affiche/cache wallet selon nouveau ou pas
      const walletStep=body.querySelector('#code-wallet-step');
      if(walletStep)walletStep.style.display=ex?'none':'block';
    });
  });

  // ÉTAPE Wallet (visible seulement si nouveau fichier)
  const walletWrap=document.createElement('div');
  walletWrap.id='code-wallet-step';walletWrap.style.display='none';
  _step(walletWrap,'Wallet','',card=>{
    if(pubkey){
      card.innerHTML+='<div class="ym-notice success" style="font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0">🔓 '+esc(pubkey.slice(0,8)+'…'+pubkey.slice(-8))+'</div>';
    }else{
      card.innerHTML+='<div class="ym-notice warn" style="font-size:11px">🔒 Wallet requis pour nouveau fichier</div>'+
        '<button class="ym-btn ym-btn-ghost" id="open-wallet-btn2" style="width:100%;font-size:11px;margin-top:6px">→ Ouvrir Wallet</button>';
      card.querySelector('#open-wallet-btn2')?.addEventListener('click',()=>{
        window.dispatchEvent(new CustomEvent('ym:switch-mine-tab',{detail:{tab:'wallet'}}));
      });
      startWalletWatch(walletWrap);
    }
  });
  body.appendChild(walletWrap);

  // ÉTAPE Code avec toggle Quick / Code brut — code brut par défaut
  let _mode='code'; // défaut : code brut
  const codeStep=document.createElement('div');
  codeStep.style.cssText='border-bottom:1px solid rgba(255,255,255,.06);padding:10px 14px';

  const codeStepHead=document.createElement('div');
  codeStepHead.style.cssText='display:flex;align-items:center;gap:8px;margin-bottom:10px';
  codeStepHead.innerHTML=
    '<div style="font-family:var(--font-d);font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text2);flex:1">Code</div>'+
    '<div style="display:flex;gap:4px">'+
      '<button id="mode-code" class="ym-btn ym-btn-ghost" style="font-size:9px;padding:3px 8px;background:rgba(240,168,48,.08);border-color:rgba(240,168,48,.3);color:var(--gold)">&lt;/&gt; Code brut</button>'+
      '<button id="mode-quick" class="ym-btn ym-btn-ghost" style="font-size:9px;padding:3px 8px">⚡ Quick</button>'+
    '</div>';
  codeStep.appendChild(codeStepHead);

  const codeArea=document.createElement('div');
  codeStep.appendChild(codeArea);
  body.appendChild(codeStep);

  function renderCodeArea(){
    codeArea.innerHTML='';
    // Update button styles
    codeStepHead.querySelector('#mode-code').style.cssText='font-size:9px;padding:3px 8px;'+(_mode==='code'?'background:rgba(240,168,48,.08);border-color:rgba(240,168,48,.3);color:var(--gold)':'');
    codeStepHead.querySelector('#mode-quick').style.cssText='font-size:9px;padding:3px 8px;'+(_mode==='quick'?'background:rgba(240,168,48,.08);border-color:rgba(240,168,48,.3);color:var(--gold)':'');

    if(_mode==='code'){
      codeArea.innerHTML=
        '<textarea id="pub-code" class="ym-input" rows="7" style="font-family:var(--font-m);font-size:11px;line-height:1.5;width:100%;box-sizing:border-box" placeholder="/* window.YM_S[\'mysphere.sphere.js\'] = { ... } */"></textarea>'+
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:4px">'+
          '<label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text3);cursor:pointer"><input type="checkbox" id="pub-wip" checked> 🚧 Under construction</label>'+
          '<div id="pub-size" style="font-size:10px;color:var(--text3)">0 KB</div>'+
        '</div>';
      codeArea.querySelector('#pub-code').addEventListener('input',function(){
        const kb=new TextEncoder().encode(this.value).length/1024;
        const el=codeArea.querySelector('#pub-size');el.textContent=kb.toFixed(1)+' KB';
        el.style.color=kb>500?'var(--red)':'var(--text3)';
      });
    }else{
      // Mode quick : champs minimaux
      codeArea.innerHTML=
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px">'+
          '<input id="min-icon" class="ym-input" placeholder="Icon (emoji ou URL)" style="font-size:12px">'+
          '<input id="min-cat" class="ym-input" placeholder="Catégorie" style="font-size:12px">'+
        '</div>'+
        '<textarea id="min-desc" class="ym-input" rows="2" placeholder="Description (< 140 chars)" style="font-size:11px;margin-bottom:6px"></textarea>'+
        '<input id="min-url" class="ym-input" placeholder="Raw URL du vrai code (optionnel)" style="font-size:11px;margin-bottom:6px">'+
        '<label style="display:flex;align-items:center;gap:8px;font-size:11px;color:var(--text3);cursor:pointer">'+
          '<input type="checkbox" id="min-wip" checked> 🚧 Under construction (badge)</label>';
    }
  }

  codeStepHead.querySelector('#mode-code').addEventListener('click',()=>{_mode='code';renderCodeArea();});
  codeStepHead.querySelector('#mode-quick').addEventListener('click',()=>{_mode='quick';renderCodeArea();});
  renderCodeArea();

  // Submit
  const submitWrap=document.createElement('div');
  submitWrap.style.cssText='padding:10px 14px;border-top:1px solid rgba(255,255,255,.06);flex-shrink:0';
  submitWrap.innerHTML='<div id="pub-status" style="margin-bottom:8px"></div>'+
    '<button id="pub-submit" class="ym-btn ym-btn-accent" style="width:100%;font-size:13px;padding:12px">⬆ Sign & Submit</button>';
  body.appendChild(submitWrap);

  submitWrap.querySelector('#pub-submit').addEventListener('click',()=>{
    if(_mode==='code')submitCodeForm(body);
    else submitMinimalFromArea(body,codeArea);
  });
}

// ── MODE MINIMAL ──────────────────────────────────────────────
function renderMinimalForm(area,body){
  area.innerHTML='';
  const pubkey=window.YM_Mine_pubkey?window.YM_Mine_pubkey():null;

  // ÉTAPE 1 : GitHub
  _step(area,'GitHub',_userToken?'✓ @'+_userToken.username:null,card=>{
    if(_userToken){
      card.innerHTML+='<div class="ym-notice success" style="font-size:11px;margin-bottom:6px">@<b>'+esc(_userToken.username)+'</b> connecté</div>'+
        '<button id="bld-disc" class="ym-btn ym-btn-ghost" style="font-size:11px;width:100%">Déconnecter</button>';
      card.querySelector('#bld-disc').addEventListener('click',()=>{_saveToken(null);render(_lastContainer);});
    }else{
      card.innerHTML+='<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">'+
        '<input id="bld-tok" class="ym-input" type="password" placeholder="ghp_… (scope: repo)" style="flex:1;font-size:11px">'+
        '<button id="bld-tok-ok" class="ym-btn ym-btn-accent" style="padding:8px 14px">→</button>'+
        '</div><a href="https://github.com/settings/tokens/new?scopes=repo" target="_blank" rel="noopener" style="font-size:10px;color:var(--cyan)">↗ Créer un token</a>';
      card.querySelector('#bld-tok-ok').addEventListener('click',async()=>{
        const tok=card.querySelector('#bld-tok').value.trim();if(!tok)return;
        try{const r=await fetch('https://api.github.com/user',{headers:{'Authorization':'token '+tok}});
          if(!r.ok)throw new Error('Token invalide ('+r.status+')');
          const u=await r.json();_saveToken({value:tok,username:u.login});
          toast('Connecté @'+u.login,'success');render(_lastContainer);}
        catch(e){toast(e.message,'error');}
      });
      card.querySelector('#bld-tok').addEventListener('keydown',e=>{if(e.key==='Enter')card.querySelector('#bld-tok-ok').click();});
    }
  });

  // ÉTAPE 2 : Informations sphere
  _step(area,'Infos Sphere','',card=>{
    card.innerHTML+=
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px">'+
        '<input id="min-name" class="ym-input" placeholder="Nom" style="font-size:12px">'+
        '<div style="display:flex;align-items:center;gap:4px">'+
          '<input id="min-slug" class="ym-input" placeholder="slug" style="font-size:12px;flex:1">'+
          '<span style="font-size:10px;color:var(--text3);flex-shrink:0">.sphere.js</span>'+
        '</div>'+
        '<input id="min-icon" class="ym-input" placeholder="Icon (emoji ou URL)" style="font-size:12px">'+
        '<input id="min-cat" class="ym-input" placeholder="Catégorie" style="font-size:12px">'+
      '</div>'+
      '<textarea id="min-desc" class="ym-input" rows="2" placeholder="Description (< 140 chars)" style="font-size:11px;margin-bottom:8px"></textarea>'+
      '<input id="min-url" class="ym-input" placeholder="GitHub raw URL du code (optionnel — active par lien)" style="font-size:11px;margin-bottom:6px">'+
      '<div id="min-slug-st" style="font-size:10px;color:var(--text3);min-height:14px"></div>'+
      '<div style="margin-top:8px">'+
        '<label style="display:flex;align-items:center;gap:8px;font-size:11px;color:var(--text3);cursor:pointer">'+
          '<input type="checkbox" id="min-wip"> 🚧 Under construction (badge dans les listes)'+
        '</label>'+
      '</div>';

    card.querySelector('#min-slug').addEventListener('input',async function(){
      const v=this.value.trim();const st=card.querySelector('#min-slug-st');if(!v){st.textContent='';return;}
      const fn=v.replace(/\.sphere\.js$/,'')+'.sphere.js';
      const files=await fetchFilesJson();const ex=files.find(f=>f.filename===fn);
      if(ex)st.innerHTML='<span style="color:var(--gold)">⬆ Upgrade</span> · @'+esc(ex.ghAuthor||'?');
      else st.innerHTML='<span style="color:var(--green)">✦ Nouveau</span>';
    });
  });

  // ÉTAPE 3 : Wallet (seulement si nouveau fichier)
  const walletStep=document.createElement('div');
  walletStep.id='min-wallet-step';
  walletStep.style.display='none';
  _step(walletStep,'Wallet (nouveau fichier uniquement)','',card=>{
    if(pubkey){
      card.innerHTML+='<div class="ym-notice success" style="font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">🔓 '+esc(pubkey.slice(0,8)+'…'+pubkey.slice(-8))+'</div>';
    }else{
      card.innerHTML+='<div class="ym-notice warn" style="font-size:11px">🔒 Wallet requis pour un nouveau fichier</div>'+
        '<button class="ym-btn ym-btn-ghost" id="min-open-wallet" style="width:100%;font-size:11px;margin-top:6px">→ Ouvrir l\'onglet Wallet</button>';
      card.querySelector('#min-open-wallet')?.addEventListener('click',()=>{
        // Bascule sur l'onglet wallet dans panel-mine
        const bar=document.getElementById('mine-tabs-bar');
        if(bar){
          bar.querySelectorAll('.ym-tab').forEach(t=>t.classList.remove('active'));
          const wt=bar.querySelector('[data-mine-tab="wallet"]');if(wt)wt.classList.add('active');
        }
        if(window.app_switchMineTab)window.app_switchMineTab('wallet');
        else{
          const evt=new CustomEvent('ym:switch-mine-tab',{detail:{tab:'wallet'}});
          window.dispatchEvent(evt);
        }
      });
      startWalletWatch(walletStep);
    }
  });
  area.appendChild(walletStep);

  // Affiche/cache étape wallet selon slug
  async function _checkWalletStep(){
    const slugEl=area.querySelector('#min-slug');
    if(!slugEl)return;
    const fn=(slugEl.value.trim().replace(/\.sphere\.js$/,'')||'x')+'.sphere.js';
    const files=await fetchFilesJson();
    const isNew=!files.find(f=>f.filename===fn);
    walletStep.style.display=isNew?'block':'none';
  }
  area.querySelector('#min-slug')?.addEventListener('input',_checkWalletStep);

  // SUBMIT
  const submitWrap=document.createElement('div');
  submitWrap.style.cssText='padding:10px 14px;border-top:1px solid rgba(255,255,255,.06);flex-shrink:0';
  submitWrap.innerHTML='<div id="min-status" style="margin-bottom:8px;min-height:0"></div>'+
    '<button id="min-submit" class="ym-btn ym-btn-accent" style="width:100%;font-size:13px;padding:12px">⬆ Soumettre</button>';
  area.appendChild(submitWrap);

  submitWrap.querySelector('#min-submit').addEventListener('click',()=>submitMinimal(area));
}

async function submitMinimal(area){
  const btn=area.querySelector('#min-submit')||area.parentElement?.querySelector('#min-submit');
  const statusEl=area.querySelector('#min-status')||area.parentElement?.querySelector('#min-status');
  function st(msg,type){if(statusEl)statusEl.innerHTML='<div class="ym-notice '+(type||'info')+'" style="font-size:11px">'+msg+'</div>';}

  const name=(area.querySelector('#min-name')?.value||'').trim();
  const slug=(area.querySelector('#min-slug')?.value||'').trim().replace(/\.sphere\.js$/,'');
  const icon=(area.querySelector('#min-icon')?.value||'').trim()||'⬡';
  const cat=(area.querySelector('#min-cat')?.value||'').trim()||'Other';
  const desc=(area.querySelector('#min-desc')?.value||'').trim().slice(0,140);
  const rawUrl=(area.querySelector('#min-url')?.value||'').trim();
  const wip=area.querySelector('#min-wip')?.checked||false;
  if(!name||!slug)return st('Nom et slug requis','error');
  if(!_userToken)return st('Token GitHub requis','error');

  const filename=slug+'.sphere.js';
  const username=_userToken.username,token=_userToken.value;
  const pubkey=window.YM_Mine_pubkey?window.YM_Mine_pubkey():null;

  if(btn){btn.disabled=true;btn.textContent='Processing…';}
  try{
    st('Vérification…');
    const files=await fetchFilesJson(true);
    const existing=files.find(f=>f.filename===filename);
    if(!existing&&!pubkey)throw new Error('Wallet requis pour un nouveau fichier');
    if(existing){
      const ok=existing.ghAuthor===username||(pubkey&&existing.author===pubkey);
      if(!ok)throw new Error('"'+filename+'" appartient à @'+(existing.ghAuthor||'?'));
    }

    // Génère le code minimal de la sphere
    const codeUrl=rawUrl||(existing&&existing.codeUrl)||
      'https://raw.githubusercontent.com/'+username+'/'+GH_REPO+'/main/'+filename;

    let sphereCode;
    if(rawUrl){
      // Mode lien : sphere activable minimale qui charge depuis rawUrl
      sphereCode=`/* jshint esversion:11 */
// ${filename} — minimal link sphere
(function(){
'use strict';
window.YM_S = window.YM_S || {};

const _CODE_URL = '${rawUrl}';
let _loaded = false;

window.YM_S['${filename}'] = {
  name:        '${name.replace(/'/g,"\\'")}',
  icon:        '${icon.replace(/'/g,"\\'")}',
  category:    '${cat.replace(/'/g,"\\'")}',
  description: '${desc.replace(/'/g,"\\'")}',${wip?"\n  wip: true,":""}
  codeUrl:     _CODE_URL,

  async activate(ctx) {
    // Charge et exécute le vrai code depuis codeUrl
    if(_loaded) return;
    _loaded = true;
    try {
      const r = await fetch(_CODE_URL + '?t=' + Date.now(), { cache: 'no-store' });
      if(!r.ok) throw new Error('HTTP ' + r.status);
      const code = await r.text();
      const blob = new Blob([code], { type: 'text/javascript' });
      const url = URL.createObjectURL(blob);
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = url; s.onload = () => { URL.revokeObjectURL(url); res(); };
        s.onerror = () => { URL.revokeObjectURL(url); rej(new Error('load failed')); };
        document.head.appendChild(s);
      });
      // Transfère le contrôle au vrai module si disponible
      const real = window.YM_S && window.YM_S['${filename}'];
      if(real && real !== this && typeof real.activate === 'function') {
        await real.activate(ctx);
      }
    } catch(e) {
      ctx.toast('Load error: ' + e.message, 'error');
    }
  },

  deactivate() { _loaded = false; },
  renderPanel(container) {
    container.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text3);font-size:12px">Loading ${esc(name)}…</div>';
  },
};
})();`;
    } else {
      // Mode stub sans rawUrl
      sphereCode=`/* jshint esversion:11 */
// ${filename}
(function(){
'use strict';
window.YM_S = window.YM_S || {};
window.YM_S['${filename}'] = {
  name:        '${name.replace(/'/g,"\\'")}',
  icon:        '${icon.replace(/'/g,"\\'")}',
  category:    '${cat.replace(/'/g,"\\'")}',
  description: '${desc.replace(/'/g,"\\'")}',${wip?"\n  wip: true,":""}
  activate(ctx) { ctx.toast('${name.replace(/'/g,"\\'")} activated', 'success'); },
  deactivate() {},
  renderPanel(container) {
    container.innerHTML = '<div style="padding:24px;font-size:13px;color:var(--text2)">${esc(desc)||esc(name)}</div>';
  },
};
})();`;
    }

    st('Fork / sync…');
    await ensureFork(token,username);
    st('Push code…');
    await ghPush(token,username,filename,sphereCode,'sphere: '+filename);

    // Event
    const nonce=uuid(),timestamp=Math.floor(Date.now()/1000);
    const state=window._mineState||{};
    const claimable=window.YM_calcClaimable?window.YM_calcClaimable():0;
    const curLaps=Math.max(1,(state.currentSlot||0)-(state.lastActionSlot||0));
    let sigB64='';
    if(pubkey&&window.YM_Mine_sign){
      const msg=JSON.stringify({action:'create',filename,nonce,timestamp,score:claimable,laps:curLaps,codeUrl,wip});
      const sig=await window.YM_Mine_sign(msg);
      sigB64=btoa(String.fromCharCode(...Array.from(sig)));
    }
    const ev={action:'create',filename,wallet:pubkey||username,signature:sigB64,nonce,timestamp,
              score:claimable,laps:curLaps,codeUrl,wip};
    await ghPush(token,username,'events/'+nonce+'.json',JSON.stringify(ev,null,2),'event: '+nonce);

    await new Promise(r=>setTimeout(r,2000));
    st('Opening PR…');
    const pr=await openPR(token,username);

    // Lien direct vers le fichier créé
    const fileUrl='https://github.com/'+username+'/'+GH_REPO+'/blob/main/'+filename;
    st('⏳ En attente du bot…<br>'+
      '<a href="'+pr.html_url+'" target="_blank" style="color:var(--cyan)">↗ PR #'+pr.number+'</a> · '+
      '<a href="'+fileUrl+'" target="_blank" style="color:var(--green)">↗ Fichier créé</a>','info');
    pollPR(token,pr.number,pr.html_url,statusEl,filename,fileUrl);
    _filesJson=null;
  }catch(e){
    st('✗ '+esc(e.message),'error');toast(e.message,'error');
  }finally{
    if(btn){btn.disabled=false;btn.textContent='⬆ Soumettre';}
  }
}

// ── MODE CODE BRUT ────────────────────────────────────────────
function renderCodeForm(area,body,pubkey){
  area.innerHTML='';

  // ÉTAPE 1 GitHub
  _step(area,'GitHub',_userToken?'✓ @'+_userToken.username:null,card=>{
    if(_userToken){
      card.innerHTML+='<div class="ym-notice success" style="font-size:11px;margin-bottom:6px">@<b>'+esc(_userToken.username)+'</b></div>'+
        '<button id="bld-disc2" class="ym-btn ym-btn-ghost" style="font-size:11px;width:100%">Déconnecter</button>';
      card.querySelector('#bld-disc2').addEventListener('click',()=>{_saveToken(null);render(_lastContainer);});
    }else{
      card.innerHTML+='<div style="display:flex;gap:6px;margin-bottom:6px">'+
        '<input id="bld-tok2" class="ym-input" type="password" placeholder="ghp_…" style="flex:1;font-size:11px">'+
        '<button id="bld-tok-ok2" class="ym-btn ym-btn-accent" style="padding:8px 14px">→</button></div>'+
        '<a href="https://github.com/settings/tokens/new?scopes=repo" target="_blank" rel="noopener" style="font-size:10px;color:var(--cyan)">↗ Créer token</a>';
      card.querySelector('#bld-tok-ok2').addEventListener('click',async()=>{
        const tok=card.querySelector('#bld-tok2').value.trim();if(!tok)return;
        try{const r=await fetch('https://api.github.com/user',{headers:{'Authorization':'token '+tok}});
          if(!r.ok)throw new Error('Token invalide');
          const u=await r.json();_saveToken({value:tok,username:u.login});
          toast('Connecté @'+u.login,'success');render(_lastContainer);}
        catch(e){toast(e.message,'error');}
      });
      card.querySelector('#bld-tok2').addEventListener('keydown',e=>{if(e.key==='Enter')card.querySelector('#bld-tok-ok2').click();});
    }
  });

  // ÉTAPE 2 Nom
  _step(area,'Sphere','',card=>{
    card.innerHTML+=
      '<div style="display:flex;gap:6px;margin-bottom:6px">'+
        '<input id="pub-name" class="ym-input" type="text" placeholder="mon-app" style="flex:1;font-size:12px">'+
        '<span style="font-size:11px;color:var(--text3);flex-shrink:0;align-self:center">.sphere.js</span>'+
      '</div>'+
      '<div style="margin-bottom:6px">'+
        '<label style="display:flex;align-items:center;gap:8px;font-size:11px;color:var(--text3);cursor:pointer">'+
          '<input type="checkbox" id="pub-wip" checked> 🚧 Under construction (badge)</label>'+
      '</div>'+
      '<div id="sphere-status" style="font-size:10px;color:var(--text3)"></div>';
    card.querySelector('#pub-name').addEventListener('input',async function(){
      const v=this.value.trim();const st=card.querySelector('#sphere-status');if(!v){st.textContent='';return;}
      const fn=v.replace(/\.sphere\.js$/,'')+'.sphere.js';
      const files=await fetchFilesJson();const ex=files.find(f=>f.filename===fn);
      if(ex)st.innerHTML='<span style="color:var(--gold)">⬆ Upgrade</span> · @'+esc(ex.ghAuthor||'?')+
        ' · <a href="https://github.com/'+GH_OWNER+'/'+GH_REPO+'/blob/main/'+esc(fn)+'" target="_blank" style="color:var(--cyan);font-size:10px">&lt;/&gt; code</a>';
      else st.innerHTML='<span style="color:var(--green)">✦ Nouveau</span> · Score on-chain requis';
    });
  });

  // ÉTAPE 3 Wallet conditionnel
  const walletStep=document.createElement('div');
  walletStep.id='code-wallet-step';walletStep.style.display='none';
  _step(walletStep,'Wallet','',card=>{
    if(pubkey){
      card.innerHTML+='<div style="display:flex;align-items:center;gap:8px">'+
        '<div class="ym-notice success" style="font-size:10px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0">🔓 '+esc(pubkey.slice(0,8)+'…'+pubkey.slice(-8))+'</div>'+
        '<button id="open-sim-btn" class="ym-btn ym-btn-ghost" style="font-size:11px;flex-shrink:0">📊 Sim</button></div>'+
        '<div id="elig-ph" style="font-size:11px;color:var(--text3);margin-top:6px">Calcul…</div>';
      let _elig=null;
      card.querySelector('#open-sim-btn').addEventListener('click',async function(){
        if(_elig){_showSimulatorOverlay(_elig);return;}
        this.textContent='⏳';this.disabled=true;
        computeEligibility().then(e=>{this.textContent='📊 Sim';this.disabled=false;if(e){_elig=e;_showSimulatorOverlay(e);}});
      });
      computeEligibility().then(elig=>{
        _elig=elig;const ph=card.querySelector('#elig-ph');if(!ph)return;
        if(!elig){ph.textContent='—';return;}
        const cls=elig.eligible?'success':'warn';
        const msg=elig.eligible?'✓ Eligible':'✗ Score insuffisant — upgrade ok';
        ph.outerHTML='<div class="ym-notice '+cls+'" style="font-size:11px;margin-top:6px">'+msg+'</div>';
      });
    }else{
      card.innerHTML+='<div class="ym-notice warn" style="font-size:11px">🔒 Wallet requis</div>'+
        '<button class="ym-btn ym-btn-ghost" id="open-wallet-btn" style="width:100%;font-size:11px;margin-top:6px">→ Ouvrir Wallet</button>';
      card.querySelector('#open-wallet-btn')?.addEventListener('click',()=>{
        window.dispatchEvent(new CustomEvent('ym:switch-mine-tab',{detail:{tab:'wallet'}}));
      });
      startWalletWatch(walletStep);
    }
  });
  area.appendChild(walletStep);

  area.querySelector('#pub-name')?.addEventListener('input',async function(){
    const fn=(this.value.trim().replace(/\.sphere\.js$/,'')||'x')+'.sphere.js';
    const files=await fetchFilesJson();
    walletStep.style.display=files.find(f=>f.filename===fn)?'none':'block';
  });

  // ÉTAPE 4 Code
  _step(area,'Code','',card=>{
    card.innerHTML+=
      '<textarea id="pub-code" class="ym-input" rows="7" style="font-family:var(--font-m);font-size:11px;line-height:1.5;width:100%;box-sizing:border-box" placeholder="/* window.YM_S[\'mysphere.sphere.js\'] = { ... } */"></textarea>'+
      '<div id="pub-size" style="font-size:10px;color:var(--text3);text-align:right;margin-top:2px">0 KB</div>';
    card.querySelector('#pub-code').addEventListener('input',function(){
      const kb=new TextEncoder().encode(this.value).length/1024;
      const el=card.querySelector('#pub-size');el.textContent=kb.toFixed(1)+' KB';
      el.style.color=kb>500?'var(--red)':'var(--text3)';
    });
  });

  const submitWrap=document.createElement('div');
  submitWrap.style.cssText='padding:10px 14px;border-top:1px solid rgba(255,255,255,.06);flex-shrink:0';
  submitWrap.innerHTML='<div id="pub-status" style="margin-bottom:8px"></div>'+
    '<button id="pub-submit" class="ym-btn ym-btn-accent" style="width:100%;font-size:13px;padding:12px">⬆ Sign & Submit</button>';
  area.appendChild(submitWrap);
  submitWrap.querySelector('#pub-submit').addEventListener('click',()=>submitCodeForm(area));
}

async function submitCodeForm(body){
  const btn=body.querySelector('#pub-submit');
  const statusEl=body.querySelector('#pub-status');
  const nameRaw=((body.querySelector('#pub-name')||{}).value||'').trim();
  const code=((body.querySelector('#pub-code')||{}).value||'').trim();
  const wip=body.querySelector('#pub-wip')?.checked||false;
  function st(msg,type){if(statusEl)statusEl.innerHTML='<div class="ym-notice '+(type||'info')+'" style="font-size:11px">'+msg+'</div>';}
  if(!nameRaw)return st('Nom requis','error');
  if(!code)return st('Code requis','error');
  if(!_userToken)return st('Token GitHub requis','error');
  const filename=nameRaw.replace(/\.sphere\.js$/,'')+'.sphere.js';
  const token=_userToken.value,username=_userToken.username;
  if(btn){btn.disabled=true;btn.textContent='Processing…';}
  try{
    const pubkey=window.YM_Mine_pubkey?window.YM_Mine_pubkey():null;
    st('Vérification…');
    const files=await fetchFilesJson(true);
    const existing=files.find(f=>f.filename===filename);
    if(!existing&&!pubkey)throw new Error('Wallet requis pour nouveau fichier');
    if(existing){const ok=existing.ghAuthor===username||(pubkey&&existing.author===pubkey);if(!ok)throw new Error('"'+filename+'" appartient à @'+(existing.ghAuthor||'?'));}
    if(!existing){const elig=await computeEligibility();if(elig&&!elig.eligible)throw new Error('Score insuffisant');}
    const nonce=uuid(),timestamp=Math.floor(Date.now()/1000);
    const state=window._mineState||{};
    const curLaps=Math.max(1,(state.currentSlot||0)-(state.lastActionSlot||0));
    const claimable=window.YM_calcClaimable?window.YM_calcClaimable():0;
    const codeUrl='https://raw.githubusercontent.com/'+username+'/'+GH_REPO+'/main/'+filename;
    const message=JSON.stringify({action:'create',filename,nonce,timestamp,score:claimable,laps:curLaps,codeUrl,wip});
    let sigB64='';
    if(pubkey&&window.YM_Mine_sign){
      st('Signature…');const sig=await window.YM_Mine_sign(message);
      sigB64=btoa(String.fromCharCode(...Array.from(sig)));
    }else if(!existing)throw new Error('Wallet requis');
    st('Fork…');await ensureFork(token,username);
    st('Push code…');await ghPush(token,username,filename,code,'sphere: '+filename);
    st('Push event…');
    const ev={action:'create',filename,wallet:pubkey||username,signature:sigB64,nonce,timestamp,score:claimable,laps:curLaps,codeUrl,wip};
    await ghPush(token,username,'events/'+nonce+'.json',JSON.stringify(ev,null,2),'event: '+nonce);
    await new Promise(r=>setTimeout(r,2000));
    st('PR…');const pr=await openPR(token,username);
    const fileUrl='https://github.com/'+username+'/'+GH_REPO+'/blob/main/'+filename;
    st('⏳<br><a href="'+pr.html_url+'" target="_blank" style="color:var(--cyan)">↗ PR #'+pr.number+'</a> · <a href="'+fileUrl+'" target="_blank" style="color:var(--green)">↗ Fichier</a>','info');
    pollPR(token,pr.number,pr.html_url,statusEl,filename,fileUrl);_filesJson=null;
  }catch(e){st('✗ '+esc(e.message),'error');toast(e.message,'error');}
  finally{if(btn){btn.disabled=false;btn.textContent='⬆ Sign & Submit';}}
}

// ── ONGLET THEME ──────────────────────────────────────────────
async function renderThemeTab(body){
  body.style.cssText='flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;display:flex;flex-direction:column;min-height:0';

  let _themeMode='code'; // code brut par défaut

  // ÉTAPE GitHub
  _step(body,'GitHub',_userToken?'✓ @'+_userToken.username:null,card=>{
    if(_userToken){
      card.innerHTML+='<div class="ym-notice success" style="font-size:11px;margin-bottom:6px">@<b>'+esc(_userToken.username)+'</b></div>'+
        '<button id="th-disc" class="ym-btn ym-btn-ghost" style="font-size:11px;width:100%">Déconnecter</button>';
      card.querySelector('#th-disc').addEventListener('click',()=>{_saveToken(null);render(_lastContainer);});
    }else{
      card.innerHTML+='<div style="display:flex;gap:6px;margin-bottom:6px">'+
        '<input id="th-tok" class="ym-input" type="password" placeholder="ghp_…" style="flex:1;font-size:11px">'+
        '<button id="th-tok-ok" class="ym-btn ym-btn-accent" style="padding:8px 14px">→</button></div>'+
        '<a href="https://github.com/settings/tokens/new?scopes=repo" target="_blank" rel="noopener" style="font-size:10px;color:var(--cyan)">↗ Token</a>';
      card.querySelector('#th-tok-ok').addEventListener('click',async()=>{
        const tok=card.querySelector('#th-tok').value.trim();if(!tok)return;
        try{const r=await fetch('https://api.github.com/user',{headers:{'Authorization':'token '+tok}});
          if(!r.ok)throw new Error('Token invalide');
          const u=await r.json();_saveToken({value:tok,username:u.login});
          toast('@'+u.login,'success');render(_lastContainer);}
        catch(e){toast(e.message,'error');}
      });
    }
  });

  // ÉTAPE Nom + Code avec toggle
  const codeStep=document.createElement('div');
  codeStep.style.cssText='border-bottom:1px solid rgba(255,255,255,.06);padding:10px 14px';

  const head=document.createElement('div');
  head.style.cssText='display:flex;align-items:center;gap:8px;margin-bottom:10px';
  head.innerHTML=
    '<div style="font-family:var(--font-d);font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text2);flex:1">Thème</div>'+
    '<div style="display:flex;gap:4px">'+
      '<button id="th-mode-code" class="ym-btn ym-btn-ghost" style="font-size:9px;padding:3px 8px;background:rgba(240,168,48,.08);border-color:rgba(240,168,48,.3);color:var(--gold)">&lt;/&gt; Code brut</button>'+
      '<button id="th-mode-quick" class="ym-btn ym-btn-ghost" style="font-size:9px;padding:3px 8px">⚡ Quick</button>'+
    '</div>';
  codeStep.appendChild(head);

  const nameRow=document.createElement('div');
  nameRow.style.cssText='display:flex;gap:6px;margin-bottom:8px';
  nameRow.innerHTML=
    '<input id="th-name" class="ym-input" placeholder="nom-du-theme" style="flex:1;font-size:12px">'+
    '<span style="font-size:11px;color:var(--text3);align-self:center;flex-shrink:0">.html</span>';
  codeStep.appendChild(nameRow);

  const codeArea=document.createElement('div');
  codeStep.appendChild(codeArea);
  body.appendChild(codeStep);

  function renderThemeCodeArea(){
    codeArea.innerHTML='';
    head.querySelector('#th-mode-code').style.cssText='font-size:9px;padding:3px 8px;'+(_themeMode==='code'?'background:rgba(240,168,48,.08);border-color:rgba(240,168,48,.3);color:var(--gold)':'');
    head.querySelector('#th-mode-quick').style.cssText='font-size:9px;padding:3px 8px;'+(_themeMode==='quick'?'background:rgba(240,168,48,.08);border-color:rgba(240,168,48,.3);color:var(--gold)':'');

    if(_themeMode==='code'){
      codeArea.innerHTML=
        '<textarea id="th-code" class="ym-input" rows="7" style="font-family:var(--font-m);font-size:11px;line-height:1.5;width:100%;box-sizing:border-box;margin-bottom:6px" placeholder="<!-- Thème HTML complet avec tout le DOM requis... -->"></textarea>'+
        '<div style="display:flex;align-items:center;justify-content:space-between">'+
          '<label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text3);cursor:pointer"><input type="checkbox" id="th-wip" checked> 🚧 Under construction</label>'+
          '<div id="th-size" style="font-size:10px;color:var(--text3)">0 KB</div>'+
        '</div>';
      codeArea.querySelector('#th-code').addEventListener('input',function(){
        const kb=new TextEncoder().encode(this.value).length/1024;
        const el=codeArea.querySelector('#th-size');el.textContent=kb.toFixed(1)+' KB';
        el.style.color=kb>200?'var(--red)':'var(--text3)';
      });
    }else{
      // Quick : champs métadonnées + lien vers le fichier HTML
      codeArea.innerHTML=
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px">'+
          '<input id="th-icon" class="ym-input" placeholder="Icon (emoji ou URL image)" style="font-size:12px">'+
          '<input id="th-author-display" class="ym-input" placeholder="Votre nom/pseudo" style="font-size:12px">'+
        '</div>'+
        '<textarea id="th-desc" class="ym-input" rows="2" placeholder="Description du thème (< 140 chars)" style="font-size:11px;margin-bottom:6px"></textarea>'+
        '<input id="th-raw-url" class="ym-input" placeholder="Raw URL du fichier HTML du thème (requis)" style="font-size:11px;margin-bottom:6px">'+
        '<label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text3);cursor:pointer"><input type="checkbox" id="th-wip" checked> 🚧 Under construction</label>';
    }
  }

  head.querySelector('#th-mode-code').addEventListener('click',()=>{_themeMode='code';renderThemeCodeArea();});
  head.querySelector('#th-mode-quick').addEventListener('click',()=>{_themeMode='quick';renderThemeCodeArea();});
  renderThemeCodeArea();

  // Submit
  const submitWrap=document.createElement('div');
  submitWrap.style.cssText='padding:10px 14px;border-top:1px solid rgba(255,255,255,.06);flex-shrink:0';
  submitWrap.innerHTML='<div id="th-status" style="margin-bottom:8px"></div>'+
    '<button id="th-submit" class="ym-btn ym-btn-accent" style="width:100%;font-size:13px;padding:12px">⬆ Publier le thème</button>';
  body.appendChild(submitWrap);

  submitWrap.querySelector('#th-submit').addEventListener('click',async()=>{
    const btn=submitWrap.querySelector('#th-submit');
    const statusEl=submitWrap.querySelector('#th-status');
    function st(msg,type){statusEl.innerHTML='<div class="ym-notice '+(type||'info')+'" style="font-size:11px">'+msg+'</div>';}
    const nameRaw=body.querySelector('#th-name')?.value.trim().replace(/\.html$/,'');
    if(!nameRaw)return st('Nom requis','error');
    if(!_userToken)return st('Token GitHub requis','error');
    const token=_userToken.value,username=_userToken.username;
    const wip=codeArea.querySelector('#th-wip')?.checked!==false;
    btn.disabled=true;btn.textContent='Processing…';
    try{
      let themeCode='',rawFileUrl='';
      if(_themeMode==='code'){
        themeCode=codeArea.querySelector('#th-code')?.value.trim()||'';
        if(!themeCode)throw new Error('Code requis');
      }else{
        rawFileUrl=codeArea.querySelector('#th-raw-url')?.value.trim()||'';
        if(!rawFileUrl)throw new Error('Raw URL requis');
        // Charge le code depuis l'URL
        const r=await fetch(rawFileUrl+'?t='+Date.now(),{cache:'no-store'});
        if(!r.ok)throw new Error('HTTP '+r.status+' — impossible de charger le thème');
        themeCode=await r.text();
      }
      const icon=codeArea.querySelector('#th-icon')?.value.trim()||'🎨';
      const desc=(codeArea.querySelector('#th-desc')?.value.trim()||'').slice(0,140);
      const filename='src/themes/'+nameRaw+'.html';
      st('Fork…');await ensureFork(token,username);
      st('Push thème…');await ghPush(token,username,filename,themeCode,'theme: '+nameRaw);

      // Met à jour themes/index.json et themes-files.json côté fork
      let idx=['default.html'];
      try{const r=await fetch('https://raw.githubusercontent.com/'+username+'/'+GH_REPO+'/main/src/themes/index.json?t='+Date.now());if(r.ok)idx=await r.json();}catch{}
      if(!idx.includes(nameRaw+'.html'))idx.push(nameRaw+'.html');
      await ghPush(token,username,'src/themes/index.json',JSON.stringify(idx,null,2),'theme index: '+nameRaw);

      // themes-files.json — registry utilisateur
      const codeUrl='https://raw.githubusercontent.com/'+username+'/'+GH_REPO+'/main/src/themes/'+nameRaw+'.html';
      let themeFiles=[];
      try{const r=await fetch('https://raw.githubusercontent.com/'+username+'/'+GH_REPO+'/main/themes-files.json?t='+Date.now());if(r.ok)themeFiles=await r.json();}catch{}
      const entry={filename:nameRaw+'.html',name:nameRaw.replace(/[-_]/g,' ').replace(/\b\w/g,c=>c.toUpperCase()),icon,description:desc,ghAuthor:username,codeUrl,wip,timestamp:Math.floor(Date.now()/1000)};
      const ei=themeFiles.findIndex(t=>t.filename===nameRaw+'.html');
      if(ei>=0)themeFiles[ei]=Object.assign({},themeFiles[ei],entry);else themeFiles.push(entry);
      await ghPush(token,username,'themes-files.json',JSON.stringify(themeFiles,null,2),'themes-files: '+nameRaw);

      // Event
      const nonce=uuid(),timestamp2=Math.floor(Date.now()/1000);
      const ev={action:'create-theme',filename:nameRaw+'.html',wallet:'',ghAuthor:username,codeUrl,icon,description:desc,wip,nonce,timestamp:timestamp2};
      await ghPush(token,username,'events/'+nonce+'.json',JSON.stringify(ev,null,2),'event theme: '+nonce);

      st('PR…');const pr=await openPR(token,username);
      const fileUrl='https://github.com/'+username+'/'+GH_REPO+'/blob/main/src/themes/'+nameRaw+'.html';
      st('✅ <a href="'+pr.html_url+'" target="_blank" style="color:var(--cyan)">↗ PR</a> · <a href="'+fileUrl+'" target="_blank" style="color:var(--green)">↗ Fichier</a>','success');
    }catch(e){st('✗ '+esc(e.message),'error');}
    finally{btn.disabled=false;btn.textContent='⬆ Publier le thème';}
  });
}

// ── SIMULATEUR ────────────────────────────────────────────────
function slotsToHuman(slots){if(!isFinite(slots)||slots>5e7)return'∞';const s=Math.round(slots*.4);if(s<60)return s+'s';if(s<3600)return Math.round(s/60)+'min';if(s<86400)return(s/3600).toFixed(1)+'h';return(s/86400).toFixed(1)+'d';}
function fmtR(v){if(!v||isNaN(v))return'0';if(Math.abs(v)<.0001)return v.toExponential(2);return v.toPrecision(4);}
function _showSimulatorOverlay(elig){
  const ex=document.getElementById('build-sim-overlay');if(ex){ex.remove();return;}
  const ov=document.createElement('div');ov.id='build-sim-overlay';
  ov.style.cssText='position:fixed;inset:0;z-index:9997;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px)';
  const box=document.createElement('div');
  box.style.cssText='background:var(--glass-heavy);border:1px solid rgba(255,255,255,.14);border-radius:18px;padding:20px;width:min(340px,92vw);max-height:90vh;overflow-y:auto';
  box.innerHTML='<div style="font-family:var(--font-d);font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--gold);margin-bottom:14px">Simulateur</div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px">'+
    '<div style="background:rgba(255,255,255,.04);border-radius:8px;padding:8px"><div style="font-size:9px;color:var(--text3);text-transform:uppercase;margin-bottom:2px">Claimable YRM</div><div style="font-size:18px;font-weight:700;color:var(--gold)">'+elig.claimable.toFixed(4)+'</div></div>'+
    '<div style="background:rgba(255,255,255,.04);border-radius:8px;padding:8px"><div style="font-size:9px;color:var(--text3);text-transform:uppercase;margin-bottom:2px">Ratio actuel</div><div style="font-size:14px;font-weight:700;color:var(--cyan)">'+fmtR(elig.curRatioNum)+'/'+fmtR(elig.curRatioDen)+'</div></div>'+
    '</div>'+
    (elig.lastPub?'<div style="font-size:10px;color:var(--text3);margin-bottom:8px">Dernier pub : <span style="color:var(--text2)">'+fmtR((elig.lastPub.score||0)+1)+'/'+fmtR(Math.max(1,elig.lastPub.laps||1)+1)+'</span> — check : <span style="color:'+(elig.ratioCheck<=1?'var(--green)':'var(--red)')+'">'+fmtR(elig.ratioCheck)+'</span> (≤1)</div>':'')+
    '<div style="border-top:1px solid rgba(255,255,255,.08);margin:10px 0 12px"></div>'+
    '<div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Burn additionnel</div>'+
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px"><input id="simov-burn" type="range" min="0" max="2" step="0.01" value="0" style="flex:1;accent-color:var(--gold)"><span id="simov-burn-val" style="font-size:11px;color:var(--gold);min-width:52px;text-align:right;font-family:var(--font-m)">0 SOL</span></div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">'+
    '<div style="background:rgba(255,255,255,.04);border-radius:8px;padding:10px;text-align:center"><div style="font-size:9px;color:var(--text3);margin-bottom:4px">Temps attente</div><div id="simov-wait" style="font-size:20px;font-weight:700;color:var(--cyan)">—</div></div>'+
    '<div style="background:rgba(255,255,255,.04);border-radius:8px;padding:10px;text-align:center"><div style="font-size:9px;color:var(--text3);margin-bottom:4px">Slots</div><div id="simov-slots" style="font-size:20px;font-weight:700;color:var(--text2)">—</div></div>'+
    '</div>'+
    '<button id="simov-close" class="ym-btn ym-btn-ghost" style="width:100%;font-size:12px">Fermer</button>';
  ov.appendChild(box);document.body.appendChild(ov);
  function upd(){
    const extra=parseFloat(box.querySelector('#simov-burn').value)||0;
    box.querySelector('#simov-burn-val').textContent=extra.toFixed(2)+' SOL';
    if(!elig.lastPub){box.querySelector('#simov-wait').textContent='Libre';box.querySelector('#simov-slots').textContent='0';return;}
    const state=window._mineState||{};
    const S=((state.lastBurnAmount||0)+(extra*1e9))/1e9;
    if(S<=0){box.querySelector('#simov-wait').textContent='∞';return;}
    const tau=Math.min(state.taxRate||20,40)/100,A=Math.max(1,state.currentSlot||111111112);
    const dGen=Math.max(1,A-111111111),inner=Math.pow(dGen,2.2*(1-tau))+Math.pow(33,3);
    const den=inner>1?Math.pow(Math.log(inner),3):1;
    const needed=elig.lastRatio;
    let t=elig.curLaps;
    for(let i=0;i<2000;i++){if((S*Math.pow(t,1.1)/den+1)/(t+1)>=needed)break;t+=500;}
    const slots=Math.max(0,t-elig.curLaps);
    const wEl=box.querySelector('#simov-wait');
    wEl.textContent=slotsToHuman(slots);
    box.querySelector('#simov-slots').textContent=isFinite(slots)?Math.round(slots).toLocaleString():'∞';
    wEl.style.color=slots===0?'var(--green)':(isFinite(slots)?'var(--cyan)':'var(--red)');
  }
  box.querySelector('#simov-burn').addEventListener('input',upd);upd();
  box.querySelector('#simov-close').addEventListener('click',()=>ov.remove());
  ov.addEventListener('click',e=>{if(e.target===ov)ov.remove();});
}

// ── HELPERS ──────────────────────────────────────────────────

// submitMinimalFromArea — soumet depuis les champs quick
async function submitMinimalFromArea(body,codeArea){
  const btn=body.querySelector('#pub-submit');
  const statusEl=body.querySelector('#pub-status');
  function st(msg,type){if(statusEl)statusEl.innerHTML='<div class="ym-notice '+(type||'info')+'" style="font-size:11px">'+msg+'</div>';}
  const nameRaw=((body.querySelector('#pub-name')||{}).value||'').trim();
  if(!nameRaw)return st('Nom requis','error');
  if(!_userToken)return st('Token GitHub requis','error');
  const icon=(codeArea.querySelector('#min-icon')?.value||'').trim()||'⬡';
  const cat=(codeArea.querySelector('#min-cat')?.value||'').trim()||'Other';
  const desc=(codeArea.querySelector('#min-desc')?.value||'').trim().slice(0,140);
  const rawUrl=(codeArea.querySelector('#min-url')?.value||'').trim();
  const wip=codeArea.querySelector('#min-wip')?.checked||false;
  const filename=nameRaw.replace(/\.sphere\.js$/,'')+'.sphere.js';
  const token=_userToken.value,username=_userToken.username;
  const pubkey=window.YM_Mine_pubkey?window.YM_Mine_pubkey():null;
  if(btn){btn.disabled=true;btn.textContent='Processing…';}
  try{
    st('Vérification…');
    const files=await fetchFilesJson(true);
    const existing=files.find(f=>f.filename===filename);
    if(!existing&&!pubkey)throw new Error('Wallet requis pour nouveau fichier');
    if(existing){const ok=existing.ghAuthor===username||(pubkey&&existing.author===pubkey);if(!ok)throw new Error('"'+filename+'" appartient à @'+(existing.ghAuthor||'?'));}
    const codeUrl=rawUrl||('https://raw.githubusercontent.com/'+username+'/'+GH_REPO+'/main/'+filename);
    const sphereCode=rawUrl
      ? `/* jshint esversion:11 */\n(function(){\n'use strict';\nwindow.YM_S=window.YM_S||{};\nconst _U='${rawUrl.replace(/'/g,"\\'")}';\nlet _ok=false;\nwindow.YM_S['${filename.replace(/'/g,"\\'")}']={name:'${nameRaw.replace(/'/g,"\\'")}',icon:'${icon.replace(/'/g,"\\'")}',category:'${cat.replace(/'/g,"\\'")}',description:'${desc.replace(/'/g,"\\'")}',${wip?'wip:true,':''}codeUrl:_U,\nasync activate(ctx){if(_ok)return;_ok=true;try{const r=await fetch(_U+'?t='+Date.now(),{cache:'no-store'});const code=await r.text();const b=new Blob([code],{type:'text/javascript'});const u=URL.createObjectURL(b);await new Promise((res,rej)=>{const s=document.createElement('script');s.src=u;s.onload=()=>{URL.revokeObjectURL(u);res();};s.onerror=()=>{URL.revokeObjectURL(u);rej();};document.head.appendChild(s);});const real=window.YM_S&&window.YM_S['${filename.replace(/'/g,"\\'")}'];if(real&&real!==this&&real.activate)await real.activate(ctx);}catch(e){ctx.toast('Load error: '+e.message,'error');}},\ndeactivate(){_ok=false;},\nrenderPanel(c){c.innerHTML='<div style=\"padding:24px;text-align:center;color:var(--text3)\">Loading…</div>';},\n};\n})();`
      : `/* jshint esversion:11 */\n(function(){\n'use strict';\nwindow.YM_S=window.YM_S||{};\nwindow.YM_S['${filename.replace(/'/g,"\\'")}']={name:'${nameRaw.replace(/'/g,"\\'")}',icon:'${icon.replace(/'/g,"\\'")}',category:'${cat.replace(/'/g,"\\'")}',description:'${desc.replace(/'/g,"\\'")}',${wip?'wip:true,':''}\nactivate(ctx){ctx.toast('${nameRaw.replace(/'/g,"\\'")} activated','success');},\ndeactivate(){},\nrenderPanel(c){c.innerHTML='<div style=\"padding:24px\">${desc.replace(/'/g,"\\'")}</div>';},\n};\n})();`;
    const nonce=uuid(),timestamp=Math.floor(Date.now()/1000);
    const state=window._mineState||{};
    const curLaps=Math.max(1,(state.currentSlot||0)-(state.lastActionSlot||0));
    const claimable=window.YM_calcClaimable?window.YM_calcClaimable():0;
    let sigB64='';
    if(pubkey&&window.YM_Mine_sign&&!existing){
      const msg=JSON.stringify({action:'create',filename,nonce,timestamp,score:claimable,laps:curLaps,codeUrl,wip});
      st('Signature…');const sig=await window.YM_Mine_sign(msg);
      sigB64=btoa(String.fromCharCode(...Array.from(sig)));
    }
    st('Fork…');await ensureFork(token,username);
    st('Push…');await ghPush(token,username,filename,sphereCode,'sphere: '+filename);
    const ev={action:'create',filename,wallet:pubkey||username,signature:sigB64,nonce,timestamp,score:claimable,laps:curLaps,codeUrl,wip};
    await ghPush(token,username,'events/'+nonce+'.json',JSON.stringify(ev,null,2),'event: '+nonce);
    await new Promise(r=>setTimeout(r,2000));
    st('PR…');const pr=await openPR(token,username);
    const fileUrl='https://github.com/'+username+'/'+GH_REPO+'/blob/main/'+filename;
    st('⏳ <a href="'+pr.html_url+'" target="_blank" style="color:var(--cyan)">↗ PR #'+pr.number+'</a> · <a href="'+fileUrl+'" target="_blank" style="color:var(--green)">↗ Fichier</a>','info');
    pollPR(token,pr.number,pr.html_url,statusEl,filename,fileUrl);_filesJson=null;
  }catch(e){st('✗ '+esc(e.message),'error');toast(e.message,'error');}
  finally{if(btn){btn.disabled=false;btn.textContent='⬆ Sign & Submit';}}
}

function _step(body,title,badge,fn){
  const card=document.createElement('div');
  card.style.cssText='border-bottom:1px solid rgba(255,255,255,.06);padding:10px 14px';
  card.innerHTML='<div style="display:flex;align-items:center;gap:8px;margin-bottom:7px">'+
    '<div style="font-family:var(--font-d);font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text2);flex:1">'+esc(title)+'</div>'+
    (badge?'<span style="font-size:10px;color:var(--green)">'+esc(badge)+'</span>':'')+
    '</div>';
  fn(card);body.appendChild(card);
}

async function pollPR(token,prNumber,prUrl,statusEl,filename,fileUrl){
  function st(msg,type){if(statusEl&&statusEl.isConnected)statusEl.innerHTML='<div class="ym-notice '+(type||'info')+'" style="font-size:11px">'+msg+'</div>';}
  const lh='<a href="'+prUrl+'" target="_blank" style="color:var(--cyan)">↗ PR #'+prNumber+'</a>'+(fileUrl?' · <a href="'+fileUrl+'" target="_blank" style="color:var(--green)">↗ Fichier</a>':'');
  await new Promise(r=>setTimeout(r,5000));
  let n=0,max=30;
  const iv=setInterval(async()=>{
    n++;
    try{
      if(n%3===0&&filename){const ff=await fetchFilesJson(true);if(ff.find(f=>f.filename===filename)){clearInterval(iv);st('✅ Publié! '+lh,'success');toast('Sphere publiée!','success');return;}}
      const r=await fetch('https://api.github.com/repos/'+GH_OWNER+'/'+GH_REPO+'/pulls/'+prNumber,{headers:{'Authorization':'token '+token,'Accept':'application/vnd.github.v3+json'}});
      if(!r.ok)throw new Error('HTTP '+r.status);
      const pr=await r.json();
      if(pr.state==='closed'){
        clearInterval(iv);
        let lc='';try{const cr=await fetch('https://api.github.com/repos/'+GH_OWNER+'/'+GH_REPO+'/issues/'+prNumber+'/comments',{headers:{'Authorization':'token '+token,'Accept':'application/vnd.github.v3+json'}});const c=await cr.json();if(c&&c.length)lc=c[c.length-1].body||'';}catch{}
        if(pr.merged||pr.merged_at||lc.includes('✅')){st('✅ Publié! '+lh,'success');toast('Publié!','success');}
        else{st('✗ '+(lc||'PR refusée')+' '+lh,'error');}return;
      }
      if(n>=max){clearInterval(iv);st('⏳ Toujours en cours… '+lh,'warn');}
      else st('⏳ Bot… ('+n+'/'+max+') '+lh,'info');
    }catch(e){if(n>=max)clearInterval(iv);}
  },6000);
}

async function ghAPI(token,path,method,body){
  const r=await fetch('https://api.github.com'+path,{method:method||'GET',headers:{'Authorization':'token '+token,'Content-Type':'application/json','Accept':'application/vnd.github.v3+json'},body:body?JSON.stringify(body):undefined});
  if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.message||'GitHub API HTTP '+r.status);}
  return r.status===204?null:r.json();
}
async function ensureFork(token,username){
  try{await ghAPI(token,'/repos/'+username+'/'+GH_REPO);return;}catch{}
  await ghAPI(token,'/repos/'+GH_OWNER+'/'+GH_REPO+'/forks','POST',{});
  for(let i=0;i<12;i++){await new Promise(r=>setTimeout(r,3000));try{await ghAPI(token,'/repos/'+username+'/'+GH_REPO);return;}catch{}}
  throw new Error('Fork timeout');
}
async function ghPush(token,username,path,content,msg){
  let sha=null;
  if(!path.startsWith('events/')){try{const ex=await ghAPI(token,'/repos/'+username+'/'+GH_REPO+'/contents/'+path+'?ref=main');if(ex&&ex.sha)sha=ex.sha;}catch{}}
  const body={message:msg,content:btoa(unescape(encodeURIComponent(content))),branch:'main'};
  if(sha)body.sha=sha;
  await ghAPI(token,'/repos/'+username+'/'+GH_REPO+'/contents/'+path,'PUT',body);
}
async function openPR(token,username){
  const ex=await ghAPI(token,'/repos/'+GH_OWNER+'/'+GH_REPO+'/pulls?state=open&head='+username+':main');
  if(ex&&ex.length>0)return ex[0];
  return ghAPI(token,'/repos/'+GH_OWNER+'/'+GH_REPO+'/pulls','POST',{title:'Submission from @'+username,body:'Automated submission.',head:username+':main',base:'main'});
}

// Expose switchMineTab pour le bouton "Ouvrir Wallet"
window.addEventListener('ym:switch-mine-tab',e=>{
  const bar=document.getElementById('mine-tabs-bar');
  if(!bar)return;
  const tab=e.detail&&e.detail.tab;if(!tab)return;
  bar.querySelectorAll('.ym-tab').forEach(t=>t.classList.toggle('active',t.dataset.mineTab===tab));
  if(window.app_switchMineTab)window.app_switchMineTab(tab);
});

window.YM_Build={render};
})();
