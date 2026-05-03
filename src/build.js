// build.js — YourMine Build / Publish Panel
/* jshint esversion:11 */
(function(){
'use strict';

const GH_OWNER = 'theodoreyong9';
const GH_REPO  = 'YourMinedApp';
const FILES_URL = 'https://raw.githubusercontent.com/'+GH_OWNER+'/'+GH_REPO+'/main/files.json';

// Architecture : code .sphere.js dans le fork de l'user, codeUrl dans files.json
// La PR ne touche que files.json + events/

let _userToken     = null;
let _filesJson     = null;
let _watchTimer    = null;
let _lastContainer = null;

function toast(msg,type){if(window.YM_toast)window.YM_toast(msg,type);}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

async function sha256(text){
  const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text.replace(/\r\n/g,'\n')));
  return Array.from(new Uint8Array(buf)).map(function(b){return b.toString(16).padStart(2,'0');}).join('');
}
function uuid(){return([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,function(c){return(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16);});}
function fmtRatio(v){if(!v||isNaN(v))return'0';if(Math.abs(v)<0.0001)return v.toExponential(2);return v.toPrecision(4);}

async function fetchFilesJson(force){
  if(_filesJson&&!force)return _filesJson;
  try{const r=await fetch(FILES_URL+'?t='+Date.now(),{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);const d=await r.json();_filesJson=Array.isArray(d)?d:[];return _filesJson;}
  catch(e){return[];}
}

function startWalletWatch(container){
  clearInterval(_watchTimer);
  _watchTimer=setInterval(function(){
    const pk=window.YM_Mine_pubkey?window.YM_Mine_pubkey():null;
    if(pk){clearInterval(_watchTimer);_watchTimer=null;const t=(container&&container.isConnected)?container:_lastContainer;if(t)render(t);}
  },800);
}

// Ré-render quand le wallet change (connexion/déconnexion)
(function(){
  var _lastPk=null;
  setInterval(function(){
    if(!_lastContainer||!_lastContainer.isConnected)return;
    const pk=window.YM_Mine_pubkey?window.YM_Mine_pubkey():null;
    if(pk!==_lastPk){_lastPk=pk;render(_lastContainer);}
  },1200);
})();

// ── CALCUL ÉLIGIBILITÉ ────────────────────────────────────────
// Interface : (score_last+1)/(laps_last+1) < (score_now+1)/(laps_now+1)
// GitHub Actions : checkScoreEligibility() depuis solana-utils → lecture on-chain
// score_now = claimable YRM = S·t^α / [ln(A^β(1−τ) + C)]^γ
// laps_now  = slots écoulés depuis le dernier burn/claim

async function computeEligibility(){
  const pubkey=window.YM_Mine_pubkey?window.YM_Mine_pubkey():null;if(!pubkey)return null;
  const state=window._mineState||{};
  const claimable=window.YM_calcClaimable?window.YM_calcClaimable():0;
  const curLaps=Math.max(1,(state.currentSlot||0)-(state.lastActionSlot||0));
  const curRatio=(claimable+1)/(curLaps+1);
  const files=await fetchFilesJson();
  const myFiles=files.filter(function(f){return f.author===(window.YM_Mine_pubkey?window.YM_Mine_pubkey():null);}).sort(function(a,b){return(b.merged_at||0)-(a.merged_at||0);});
  const lastPub=myFiles[0]||null;
  if(!lastPub)return{eligible:claimable>0,claimable,curLaps,curRatio,lastPub:null,curRatioNum:claimable+1,curRatioDen:curLaps+1};
  const lastLaps=Math.max(1,lastPub.laps||1);
  const lastRatio=(lastPub.score+1)/(lastLaps+1);
  const ratioCheck=lastRatio/curRatio;
  return{eligible:claimable>0&&ratioCheck<=1,claimable,curLaps,curRatio,curRatioNum:claimable+1,curRatioDen:curLaps+1,lastPub,lastRatio,ratioCheck};
}

// Calcule les slots nécessaires pour atteindre l'éligibilité
// On cherche t tel que (claimable(t)+1)/(t+1) > lastRatio
// claimable(t) ≈ S·t^1.1 / [ln(A^(β(1-τ))+C)]^3  (approximation linéaire pour l'UI)
function slotsToEligible(elig,extraBurn){
  if(!elig||!elig.lastPub)return 0;
  const state=window._mineState||{};
  const S=((state.lastBurnAmount||0)+((extraBurn||0)*1e9))/1e9;
  if(S<=0)return Infinity;
  const tau=Math.min(state.taxRate||20,40)/100;
  const A=Math.max(1,state.currentSlot||111111112);
  const dGen=Math.max(1,A-111111111);
  const inner=Math.pow(dGen,2.2*(1-tau))+Math.pow(33,3);
  const den=inner>1?Math.pow(Math.log(inner),3):1;
  const needed=elig.lastRatio; // (score_last+1)/(laps_last+1)
  // On cherche t : (S·t^1.1/den + 1)/(t+1) >= needed
  // Approx numérique par itération
  var t=elig.curLaps;
  for(var i=0;i<2000;i++){
    const num=S*Math.pow(t,1.1)/den+1;
    const ratio=num/(t+1);
    if(ratio>=needed)return Math.max(0,t-elig.curLaps);
    t+=500;
  }
  return Infinity;
}

function slotsToHuman(slots){
  if(!isFinite(slots)||slots>5e7)return '∞';
  const secs=Math.round(slots*0.4);
  if(secs<60)return secs+'s';
  if(secs<3600)return Math.round(secs/60)+'min';
  if(secs<86400)return (secs/3600).toFixed(1)+'h';
  return (secs/86400).toFixed(1)+'d';
}

// ── SOURCE FILES ──────────────────────────────────────────────
// Note: social.sphere.js retiré (obligatoire, pas besoin de le distribuer)
const SRC_FILES=['index.html','desk.js','mine.js','build.js','profile.js','liste.js'];

function dlFile(filename){
  const url=window.location.origin+'/'+filename+'?t='+Date.now();
  fetch(url,{cache:'no-store'}).then(function(r){
    if(!r.ok)throw new Error('HTTP '+r.status);return r.blob();
  }).then(function(blob){
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;a.click();URL.revokeObjectURL(a.href);
  }).catch(function(e){toast('Download failed: '+e.message,'error');});
}

// ── RESOURCES FLOATING BUTTON ─────────────────────────────────
function _renderResourcesBtn(body){
  // Remonte jusqu'au .ym-panel parent
  var panel=body;
  while(panel&&panel!==document.body){
    if(panel.classList&&panel.classList.contains('ym-panel'))break;
    panel=panel.parentElement;
  }
  if(!panel||panel===document.body)return;
  // Ne pas modifier le header de panel-mine (c'est pas le bon contexte)
  if(panel.id==='panel-mine')return;
  var headerEl=panel.querySelector(':scope>.panel-head');
  if(!headerEl)return;
  if(headerEl.querySelector('#build-res-btn'))return;
  var resBtn=document.createElement('button');
  resBtn.id='build-res-btn';
  resBtn.className='ym-btn ym-btn-ghost';
  resBtn.style.cssText='font-size:10px;padding:4px 10px;letter-spacing:.5px;margin-left:auto';
  resBtn.textContent='⬇ Sources';
  resBtn.addEventListener('click',function(e){e.stopPropagation();_showResourcesPanel(resBtn);});
  headerEl.style.display='flex';
  headerEl.style.alignItems='center';
  headerEl.appendChild(resBtn);
}

function _showResourcesPanel(triggerBtn){
  var existing=document.getElementById('build-res-overlay');
  if(existing){existing.remove();return;}
  var overlay=document.createElement('div');
  overlay.id='build-res-overlay';
  // Position fixe — fonctionne quel que soit le contexte (panel-build ou panel-mine)
  overlay.style.cssText='position:fixed;z-index:9996;background:#12121e;border:1px solid rgba(255,255,255,.15);border-radius:14px;padding:12px;width:220px;box-shadow:0 8px 32px rgba(0,0,0,.8)';
  overlay.innerHTML=
    '<div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px;font-family:var(--font-m)">Fichiers sources</div>'+
    '<div style="display:flex;flex-direction:column;gap:4px">'+
      SRC_FILES.map(function(f){
        return '<button class="ym-btn ym-btn-ghost" data-dl="'+f+'" style="font-size:11px;text-align:left;padding:6px 10px;display:flex;align-items:center;gap:8px">'+
          '<span>⬇</span><span>'+esc(f)+'</span></button>';
      }).join('')+
    '</div>';
  document.body.appendChild(overlay);

  // Positionne le dropdown sous le bouton déclencheur
  var btn=typeof triggerBtn==='object'&&triggerBtn.nodeType===1?triggerBtn:null;
  if(btn){
    var r=btn.getBoundingClientRect();
    var left=r.right-220;
    if(left<8)left=8;
    overlay.style.top=(r.bottom+6)+'px';
    overlay.style.left=left+'px';
  }else{
    overlay.style.top='60px';overlay.style.right='12px';overlay.style.left='auto';
  }

  overlay.querySelectorAll('[data-dl]').forEach(function(b){
    b.addEventListener('click',function(){dlFile(b.dataset.dl);overlay.remove();});
  });
  setTimeout(function(){
    document.addEventListener('click',function close(e){
      if(!overlay.contains(e.target)){overlay.remove();document.removeEventListener('click',close);}
    });
  },80);
}

// ── SIMULATEUR FLOTTANT ───────────────────────────────────────
function _showSimulatorOverlay(elig){
  var existing=document.getElementById('build-sim-overlay');
  if(existing){existing.remove();return;}
  var ov=document.createElement('div');
  ov.id='build-sim-overlay';
  ov.style.cssText='position:fixed;inset:0;z-index:9997;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px)';
  var box=document.createElement('div');
  box.style.cssText='background:var(--glass-heavy,var(--surface2));border:1px solid rgba(255,255,255,.14);border-radius:18px;padding:20px;width:min(340px,92vw);max-height:90vh;overflow-y:auto;box-shadow:0 12px 48px rgba(0,0,0,.7)';

  var scoreHtml=
    '<div style="font-family:var(--font-d,monospace);font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--gold,#e8a020);margin-bottom:14px">Simulateur</div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px">'+
      '<div style="background:rgba(255,255,255,.04);border-radius:8px;padding:8px">'+
        '<div style="font-size:9px;color:var(--text3,#888);text-transform:uppercase;margin-bottom:2px">Claimable YRM</div>'+
        '<div style="font-size:18px;font-weight:700;color:var(--gold,#e8a020)">'+elig.claimable.toFixed(4)+'</div>'+
      '</div>'+
      '<div style="background:rgba(255,255,255,.04);border-radius:8px;padding:8px">'+
        '<div style="font-size:9px;color:var(--text3,#888);text-transform:uppercase;margin-bottom:2px">Ratio actuel</div>'+
        '<div style="font-size:14px;font-weight:700;color:var(--cyan,#30c8e8)">'+fmtRatio(elig.curRatioNum)+'/'+fmtRatio(elig.curRatioDen)+'</div>'+
      '</div>'+
    '</div>';

  if(elig.lastPub){
    scoreHtml+=
      '<div style="font-size:10px;color:var(--text3,#888);margin-bottom:8px;line-height:1.8">'+
        'Dernier pub : <span style="color:var(--text2,#aaa)">'+fmtRatio((elig.lastPub.score||0)+1)+'/'+fmtRatio(Math.max(1,(elig.lastPub.laps||1))+1)+'</span>'+
        ' — check : <span style="color:'+(elig.ratioCheck<=1?'var(--green,#30e880)':'var(--red,#e84040)')+'">'+fmtRatio(elig.ratioCheck)+'</span>'+
        ' <span style="color:var(--text3,#888)">(doit être ≤ 1)</span>'+
      '</div>';
  }

  scoreHtml+=
    '<div style="border-top:1px solid rgba(255,255,255,.08);margin:10px 0 12px"></div>'+
    '<div style="font-size:10px;color:var(--text3,#888);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Burn additionnel</div>'+
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">'+
      '<input id="simov-burn" type="range" min="0" max="2" step="0.01" value="0" style="flex:1;accent-color:var(--gold,#e8a020)">'+
      '<span id="simov-burn-val" style="font-size:11px;color:var(--gold,#e8a020);min-width:52px;text-align:right;font-family:var(--font-m,monospace)">0 SOL</span>'+
    '</div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">'+
      '<div style="background:rgba(255,255,255,.04);border-radius:8px;padding:10px;text-align:center">'+
        '<div style="font-size:9px;color:var(--text3,#888);margin-bottom:4px">Temps attente</div>'+
        '<div id="simov-wait" style="font-size:20px;font-weight:700;color:var(--cyan,#30c8e8)">—</div>'+
      '</div>'+
      '<div style="background:rgba(255,255,255,.04);border-radius:8px;padding:10px;text-align:center">'+
        '<div style="font-size:9px;color:var(--text3,#888);margin-bottom:4px">Slots nécessaires</div>'+
        '<div id="simov-slots" style="font-size:20px;font-weight:700;color:var(--text2,#ccc)">—</div>'+
      '</div>'+
    '</div>'+
    '<button id="simov-close" class="ym-btn ym-btn-ghost" style="width:100%;font-size:12px">Fermer</button>';

  box.innerHTML=scoreHtml;
  ov.appendChild(box);document.body.appendChild(ov);

  function updateSim(){
    var extra=parseFloat(box.querySelector('#simov-burn').value)||0;
    box.querySelector('#simov-burn-val').textContent=extra.toFixed(2)+' SOL';
    if(!elig.lastPub){
      box.querySelector('#simov-wait').textContent='Libre';
      box.querySelector('#simov-slots').textContent='0';return;
    }
    var slotsNeeded=slotsToEligible(elig,extra);
    var waitEl=box.querySelector('#simov-wait');
    waitEl.textContent=slotsToHuman(slotsNeeded);
    box.querySelector('#simov-slots').textContent=isFinite(slotsNeeded)?Math.round(slotsNeeded).toLocaleString():'∞';
    waitEl.style.color=slotsNeeded===0?'var(--green,#30e880)':(isFinite(slotsNeeded)?'var(--cyan,#30c8e8)':'var(--red,#e84040)');
  }
  box.querySelector('#simov-burn').addEventListener('input',updateSim);
  updateSim();
  box.querySelector('#simov-close').addEventListener('click',function(){ov.remove();});
  ov.addEventListener('click',function(e){if(e.target===ov)ov.remove();});
}

// ── RENDER PRINCIPAL ──────────────────────────────────────────
async function render(containerArg){
  const body=containerArg||document.getElementById('panel-build-body')||_lastContainer;
  if(!body)return;
  _lastContainer=body;
  body.innerHTML='';
  body.style.cssText='flex:1;overflow-y:auto;padding:0;display:flex;flex-direction:column;gap:0;background:var(--bg)';

  // Bouton Resources dans le header (panel-build standalone uniquement)
  // Si on est dans panel-mine, on ajoute un mini-header inline
  var inMine=!!(body.closest&&body.closest('#panel-mine-build'));
  if(inMine){
    var miniHead=document.createElement('div');
    miniHead.style.cssText='display:flex;align-items:center;padding:6px 14px;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0';
    miniHead.innerHTML='<span style="font-family:var(--font-d);font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--text3);flex:1">Build</span>';
    var srcBtn=document.createElement('button');
    srcBtn.className='ym-btn ym-btn-ghost';
    srcBtn.style.cssText='font-size:10px;padding:3px 8px';
    srcBtn.textContent='⬇ Sources';
    srcBtn.addEventListener('click',function(){_showResourcesPanel(srcBtn);});
    miniHead.appendChild(srcBtn);
    body.appendChild(miniHead);
  }else{
    setTimeout(function(){_renderResourcesBtn(body);},0);
  }

  const pubkey=window.YM_Mine_pubkey?window.YM_Mine_pubkey():null;

  // ÉTAPE 1 : GitHub Token
  _step(body,'1','GitHub',_userToken?'✓ @'+_userToken.username:null,function(card){
    if(_userToken){
      card.innerHTML+=
        '<div class="ym-notice success" style="font-size:11px;margin-bottom:6px">@<b>'+esc(_userToken.username)+'</b> connecté</div>'+
        '<button id="bld-disc" class="ym-btn ym-btn-ghost" style="font-size:11px;width:100%">Déconnecter</button>';
      card.querySelector('#bld-disc').addEventListener('click',function(){_userToken=null;render(body);});
    }else{
      card.innerHTML+=
        '<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">'+
          '<input id="bld-tok" class="ym-input" type="password" placeholder="ghp_… (scope: repo)" style="flex:1;font-size:11px">'+
          '<button id="bld-tok-ok" class="ym-btn ym-btn-accent" style="padding:8px 14px">→</button>'+
        '</div>'+
        '<a href="https://github.com/settings/tokens/new?scopes=repo" target="_blank" rel="noopener" style="font-size:10px;color:var(--cyan)">↗ Créer un token GitHub</a>';
      card.querySelector('#bld-tok-ok').addEventListener('click',async function(){
        const tok=card.querySelector('#bld-tok').value.trim();if(!tok)return;
        try{
          const r=await fetch('https://api.github.com/user',{headers:{'Authorization':'token '+tok}});
          if(!r.ok)throw new Error('Token invalide ('+r.status+')');
          const u=await r.json();_userToken={value:tok,username:u.login};
          toast('Connecté @'+u.login,'success');render(body);
        }catch(e){toast(e.message,'error');}
      });
      card.querySelector('#bld-tok').addEventListener('keydown',function(e){if(e.key==='Enter')card.querySelector('#bld-tok-ok').click();});
    }
  });

  // ÉTAPE 2 : Wallet — statut + bouton simulateur sur la même ligne
  _step(body,'2','Wallet','',function(card){
    if(pubkey){
      card.innerHTML+=
        '<div style="display:flex;align-items:center;gap:8px">'+
          '<div class="ym-notice success" style="font-size:10px;font-family:var(--font-m);flex:1;min-width:0;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">🔓 '+esc(pubkey.slice(0,8)+'…'+pubkey.slice(-8))+'</div>'+
          '<button id="open-sim-btn" class="ym-btn ym-btn-ghost" style="font-size:11px;white-space:nowrap;flex-shrink:0">📊 Simulateur</button>'+
        '</div>'+
        '<div id="elig-ph" style="font-size:11px;color:var(--text3);margin-top:6px">Calcul…</div>';

      var simBtn=card.querySelector('#open-sim-btn');
      var _eligData=null;

      // Un seul listener sur le bouton simulateur
      simBtn.addEventListener('click',function(){
        if(_eligData){_showSimulatorOverlay(_eligData);return;}
        var btn=this;btn.textContent='⏳';btn.disabled=true;
        computeEligibility().then(function(e){
          btn.textContent='📊 Simulateur';btn.disabled=false;
          if(e){_eligData=e;_showSimulatorOverlay(e);}
        });
      });

      computeEligibility().then(function(elig){
        _eligData=elig;
        var ph=card.querySelector('#elig-ph');if(!ph)return;
        if(!elig){ph.textContent='Données non disponibles';return;}
        var cls=elig.eligible?'success':'warn';
        var msg=elig.eligible?'✓ Eligible — nouveau fichier possible':'✗ Score insuffisant — upgrade toujours possible';
        ph.outerHTML='<div class="ym-notice '+cls+'" style="font-size:11px;margin-top:6px">'+msg+'</div>';
      });
    }else{
      card.innerHTML+=
        '<div class="ym-notice warn" style="font-size:11px">'+
          '🔒 Wallet non connecté — ouvre l\'onglet Wallet.<br>'+
          '<span style="color:var(--text3)">Requis pour nouveau fichier.</span>'+
        '</div>';
      startWalletWatch(body);
    }
  });

  // ÉTAPE 3 : Nom de la sphere
  _step(body,'3','Sphere','',function(card){
    card.innerHTML+=
      '<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">'+
        '<input id="pub-name" class="ym-input" type="text" placeholder="mon-app" style="flex:1;font-size:12px">'+
        '<span style="font-size:11px;color:var(--text3);flex-shrink:0">.sphere.js</span>'+
      '</div>'+
      '<div id="sphere-status" style="font-size:10px;color:var(--text3);min-height:14px"></div>';

    card.querySelector('#pub-name').addEventListener('input',async function(){
      const v=this.value.trim();
      const st=card.querySelector('#sphere-status');
      if(!v){st.textContent='';return;}
      const fn=v.replace(/\.sphere\.js$/,'')+'.sphere.js';
      const files=await fetchFilesJson();
      const ex=files.find(function(f){return f.filename===fn;});
      if(ex){
        st.innerHTML='<span style="color:var(--gold)">⬆ Upgrade</span> · @'+esc(ex.ghAuthor||'?')+(ex.author?' · '+esc(ex.author.slice(0,8))+'…':'')+'<br>'+
          '<span style="color:var(--text3)">GitHub OU wallet suffisent — pas de score requis</span>';
      }else{
        st.innerHTML='<span style="color:var(--green)">✦ Nouveau fichier</span> · Score on-chain requis · '+
          '<span style="color:var(--cyan);font-family:var(--font-m)">codeUrl</span> = lien fork';
      }
    });
  });

  // ÉTAPE 4 : Code
  _step(body,'4','Code','',function(card){
    card.innerHTML+=
      '<div style="font-size:10px;color:var(--text3);margin-bottom:6px">'+
        'Code hébergé dans <b style="color:var(--cyan)">ton fork GitHub</b> · '+
        'files.json sur main contient juste le <code style="color:var(--gold)">codeUrl</code>'+
      '</div>'+
      '<textarea id="pub-code" class="ym-input" rows="7" style="font-family:var(--font-m);font-size:11px;line-height:1.5;width:100%;box-sizing:border-box" placeholder="/* Colle ton code .sphere.js ici */\n/* window.YM_S[\'mysphere.sphere.js\'] = { name:\'...\', ... } */"></textarea>'+
      '<div id="pub-size" style="font-size:10px;color:var(--text3);text-align:right;margin-top:2px">0 KB</div>';
    card.querySelector('#pub-code').addEventListener('input',function(){
      const kb=(new TextEncoder().encode(this.value).length/1024);
      const sizeEl=card.querySelector('#pub-size');
      sizeEl.textContent=kb.toFixed(1)+' KB';
      sizeEl.style.color=kb>500?'var(--red)':'var(--text3)';
    });
  });

  // SUBMIT
  const submitWrap=document.createElement('div');
  submitWrap.style.cssText='padding:10px 14px;border-top:1px solid rgba(255,255,255,.06);flex-shrink:0';
  submitWrap.innerHTML=
    '<div id="pub-status" style="margin-bottom:8px;min-height:0"></div>'+
    '<button id="pub-submit" class="ym-btn ym-btn-accent" style="width:100%;font-size:14px;padding:13px">⬆ Sign & Submit</button>';
  body.appendChild(submitWrap);
  submitWrap.querySelector('#pub-submit').addEventListener('click',function(){submitSphere(body);});
}

function _step(body,num,title,badge,fn){
  const card=document.createElement('div');
  card.style.cssText='border-bottom:1px solid rgba(255,255,255,.06);padding:10px 14px';
  card.innerHTML=
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:7px">'+
      '<div style="width:18px;height:18px;border-radius:50%;background:var(--gold);color:#000;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">'+esc(num)+'</div>'+
      '<div style="font-family:var(--font-d);font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text2);flex:1">'+esc(title)+'</div>'+
      (badge?'<span style="font-size:10px;color:var(--green)">'+esc(badge)+'</span>':'')+
    '</div>';
  fn(card);
  body.appendChild(card);
}

// ── SUBMIT ────────────────────────────────────────────────────
async function submitSphere(body){
  const btn=body.querySelector('#pub-submit');
  const statusEl=body.querySelector('#pub-status');
  const nameRaw=((body.querySelector('#pub-name')||{}).value||'').trim();
  const code=((body.querySelector('#pub-code')||{}).value||'').trim();
  if(!nameRaw){toast('Nom requis','error');return;}
  if(!code){toast('Code requis','error');return;}
  if(!_userToken){toast('Token GitHub requis','error');return;}

  const baseName=nameRaw.replace(/\.sphere\.js$/,'');
  const filename=baseName+'.sphere.js';
  const token=_userToken.value,username=_userToken.username;
  if(btn){btn.disabled=true;btn.textContent='Processing…';}

  function st(msg,type){
    if(statusEl)statusEl.innerHTML='<div class="ym-notice '+(type||'info')+'" style="font-size:11px">'+msg+'</div>';
  }

  try{
    const pubkey=window.YM_Mine_pubkey?window.YM_Mine_pubkey():null;

    st('Vérification ownership…');
    const files=await fetchFilesJson(true);
    const existing=files.find(function(f){return f.filename===filename;});
    const isNew=!existing;

    if(existing){
      const ghMatch=existing.ghAuthor===username;
      const walletMatch=pubkey&&existing.author===pubkey;
      if(!ghMatch&&!walletMatch){
        throw new Error('"'+filename+'" appartient à @'+(existing.ghAuthor||'?')+'. Ni GitHub ni wallet ne correspondent.');
      }
    }

    if(isNew&&!pubkey)throw new Error('Wallet requis pour un nouveau fichier.');

    if(isNew){
      const elig=await computeEligibility();
      if(elig&&!elig.eligible)throw new Error('Score insuffisant pour un nouveau fichier.');
    }

    st('Hash du code…');
    const contentHash=await sha256(code.replace(/\r\n/g,'\n'));
    const nonce=uuid(),timestamp=Math.floor(Date.now()/1000);
    const state=window._mineState||{};
    const curLaps=Math.max(1,(state.currentSlot||0)-(state.lastActionSlot||0));
    const claimable=window.YM_calcClaimable?window.YM_calcClaimable():0;

    // codeUrl = lien direct vers le code dans le fork (c'est LA clé de l'architecture)
    const codeUrl='https://raw.githubusercontent.com/'+username+'/'+GH_REPO+'/main/'+filename;

    const message=JSON.stringify({action:'create',filename,content_hash:contentHash,nonce,timestamp,score:claimable,laps:curLaps,codeUrl});

    var sigB64='';
    if(pubkey&&window.YM_Mine_sign){
      st('Signature wallet…');
      const signature=await window.YM_Mine_sign(message);
      if(!signature)throw new Error('Signing failed or wallet locked');
      sigB64=btoa(String.fromCharCode.apply(null,Array.from(signature)));
    }else if(isNew){
      throw new Error('Wallet requis pour signer un nouveau fichier.');
    }

    st('Fork / sync…');
    await ensureFork(token,username);

    // Pousse le CODE dans le fork (accessible via codeUrl)
    st('Pushing code dans ton fork…');
    await ghPush(token,username,filename,code,'sphere: '+filename);

    // Pousse l'event
    st('Pushing event log…');
    const ev={action:'create',filename,wallet:pubkey||username,content_hash:contentHash,signature:sigB64,nonce,timestamp,score:claimable,laps:curLaps,codeUrl};
    await ghPush(token,username,'events/'+nonce+'.json',JSON.stringify(ev,null,2),'event: '+nonce);

    await new Promise(function(r){setTimeout(r,2000);});
    st('Opening PR…');
    const pr=await openPR(token,username);
    st('⏳ En attente du bot…<br><a href="'+pr.html_url+'" target="_blank" style="color:var(--cyan)">↗ PR #'+pr.number+'</a>','info');
    pollPR(token,pr.number,pr.html_url,statusEl,filename);
    _filesJson=null;
  }catch(e){
    st('✗ '+esc(e.message),'error');toast(e.message,'error');
  }finally{
    if(btn){btn.disabled=false;btn.textContent='⬆ Sign & Submit';}
  }
}

async function pollPR(token,prNumber,prUrl,statusEl,filename){
  function st(msg,type){
    if(statusEl&&statusEl.isConnected)statusEl.innerHTML='<div class="ym-notice '+(type||'info')+'" style="font-size:11px">'+msg+'</div>';
  }
  var max=30,n=0;
  var linkHtml='<a href="'+prUrl+'" target="_blank" style="color:var(--cyan)">↗ PR #'+prNumber+'</a>';
  await new Promise(function(r){setTimeout(r,5000);});
  var iv=setInterval(async function(){
    n++;
    try{
      if(n%3===0&&filename){
        try{var ff=await fetchFilesJson(true);if(ff.find(function(f){return f.filename===filename;})){clearInterval(iv);st('✅ Sphere publiée!<br>'+linkHtml,'success');toast('Sphere publiée!','success');return;}}catch(e2){}
      }
      var r=await fetch('https://api.github.com/repos/'+GH_OWNER+'/'+GH_REPO+'/pulls/'+prNumber,{headers:{'Authorization':'token '+token,'Accept':'application/vnd.github.v3+json'}});
      if(!r.ok)throw new Error('HTTP '+r.status);
      var pr=await r.json();
      if(pr.state==='closed'){
        clearInterval(iv);
        var mergedByBot=false,lastComment='';
        try{var cr=await fetch('https://api.github.com/repos/'+GH_OWNER+'/'+GH_REPO+'/issues/'+prNumber+'/comments',{headers:{'Authorization':'token '+token,'Accept':'application/vnd.github.v3+json'}});var c=await cr.json();if(c&&c.length){lastComment=c[c.length-1].body||'';if(lastComment.includes('✅')&&lastComment.includes('YourMine Bot'))mergedByBot=true;}}catch(e3){}
        if(pr.merged||pr.merged_at||mergedByBot){st('✅ Sphere publiée!<br>'+linkHtml,'success');toast('Sphere publiée!','success');}
        else{st('✗ '+(lastComment||'PR refusée')+'<br>'+linkHtml,'error');toast('Publication refusée','error');}
        return;
      }
      if(n>=max){clearInterval(iv);st('⏳ Toujours en cours…<br>'+linkHtml,'warn');}
      else st('⏳ Bot en cours… ('+n+'/'+max+')<br>'+linkHtml,'info');
    }catch(e){if(n>=max)clearInterval(iv);}
  },6000);
}

async function ghAPI(token,path,method,body){
  var r=await fetch('https://api.github.com'+path,{method:method||'GET',headers:{'Authorization':'token '+token,'Content-Type':'application/json','Accept':'application/vnd.github.v3+json'},body:body?JSON.stringify(body):undefined});
  if(!r.ok){var e=await r.json().catch(function(){return{};});throw new Error(e.message||'GitHub API HTTP '+r.status);}
  return r.status===204?null:r.json();
}
async function ensureFork(token,username){
  try{await ghAPI(token,'/repos/'+username+'/'+GH_REPO);return;}catch(e){}
  await ghAPI(token,'/repos/'+GH_OWNER+'/'+GH_REPO+'/forks','POST',{});
  for(var i=0;i<12;i++){await new Promise(function(r){setTimeout(r,3000);});try{await ghAPI(token,'/repos/'+username+'/'+GH_REPO);return;}catch(e){}}
  throw new Error('Fork timeout');
}
async function ghPush(token,username,path,content,msg){
  var sha=null;
  if(!path.startsWith('events/')){
    try{var ex=await ghAPI(token,'/repos/'+username+'/'+GH_REPO+'/contents/'+path+'?ref=main');if(ex&&ex.sha)sha=ex.sha;}catch(e){}
  }
  var body={message:msg,content:btoa(unescape(encodeURIComponent(content))),branch:'main'};
  if(sha)body.sha=sha;
  await ghAPI(token,'/repos/'+username+'/'+GH_REPO+'/contents/'+path,'PUT',body);
}
async function openPR(token,username){
  var existing=await ghAPI(token,'/repos/'+GH_OWNER+'/'+GH_REPO+'/pulls?state=open&head='+username+':main');
  if(existing&&existing.length>0)return existing[0];
  return await ghAPI(token,'/repos/'+GH_OWNER+'/'+GH_REPO+'/pulls','POST',{title:'Sphere from @'+username,body:'Automated sphere submission.',head:username+':main',base:'main'});
}

window.YM_Build={render};
})();
