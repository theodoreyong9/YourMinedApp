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

let _userToken = (function(){
  try{const t=sessionStorage.getItem('ym_build_token');return t?JSON.parse(t):null;}catch{return null;}
})();
function _saveToken(t){
  _userToken=t;
  try{if(t)sessionStorage.setItem('ym_build_token',JSON.stringify(t));
      else sessionStorage.removeItem('ym_build_token');}catch{}
}

let _filesJson=null,_themesJson=null,_watchTimer=null,_lastContainer=null,_activeTab='sphere';

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

(function(){
  let _lp=null;
  setInterval(()=>{
    if(!_lastContainer||!_lastContainer.isConnected)return;
    const pk=window.YM_Mine_pubkey?window.YM_Mine_pubkey():null;
    if(pk!==_lp){_lp=pk;render(_lastContainer);}
  },1200);
})();

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
  return{eligible:claimable>0&&ratioCheck<=1,claimable,curLaps,curRatio,lastPub,lastRatio,ratioCheck,curRatioNum:claimable+1,curRatioDen:curLaps+1};
}

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

// ── FLOW CONVERSATIONNEL ──────────────────────────────────────
function _flowBtn(label, onClick){
  const b = document.createElement('button');
  b.style.cssText = 'cursor:pointer;border-radius:10px;padding:12px 16px;font-size:13px;transition:border-color .15s,color .15s;width:100%;text-align:left;display:flex;align-items:center;gap:10px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:var(--text2)';
  b.innerHTML = label;
  b.addEventListener('mouseenter',()=>{b.style.borderColor='rgba(240,168,48,.4)';b.style.color='var(--text)';});
  b.addEventListener('mouseleave',()=>{b.style.borderColor='rgba(255,255,255,.1)';b.style.color='var(--text2)';});
  b.addEventListener('click', onClick);
  return b;
}

function _flowBack(buildContent, fn){
  const back = document.createElement('button');
  back.style.cssText = 'flex-shrink:0;width:100%;padding:14px;margin-top:auto;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:var(--text3);font-size:13px;cursor:pointer;border-radius:10px;transition:border-color .15s,color .15s';
  back.innerHTML = '&#8592; Back';
  back.addEventListener('mouseenter',()=>{back.style.borderColor='rgba(255,255,255,.2)';back.style.color='var(--text2)';});
  back.addEventListener('mouseleave',()=>{back.style.borderColor='rgba(255,255,255,.1)';back.style.color='var(--text3)';});
  back.addEventListener('click', ()=>{ buildContent.innerHTML=''; fn(buildContent); });
  return back;
}

function renderFlow(buildContent){
  buildContent.innerHTML='';
  buildContent.style.cssText='flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;display:flex;flex-direction:column;min-height:0;padding:24px 16px;gap:10px';

  const q = document.createElement('div');
  q.style.cssText = 'font-family:var(--font-d,inherit);font-size:15px;font-weight:700;color:var(--text);margin-bottom:8px';
  q.textContent = 'You have code or a link?';
  buildContent.appendChild(q);

  // YES
  buildContent.appendChild(_flowBtn(
    '<span style="font-size:20px">&#10003;</span><div><div style="font-size:13px;color:var(--text)">Yes &#8212; I have code or a link</div></div>',
    ()=>{
      buildContent.innerHTML='';
      buildContent.style.cssText='flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;display:flex;flex-direction:column;min-height:0;padding:24px 16px;gap:10px';
      const q2=document.createElement('div');
      q2.style.cssText='font-family:var(--font-d,inherit);font-size:15px;font-weight:700;color:var(--text);margin-bottom:8px';
      q2.textContent='What do you want to do?';
      buildContent.appendChild(q2);
      const wrap=document.createElement('div');
      wrap.style.cssText='display:flex;flex-direction:column;gap:8px';
      // 1.1 Rank
      wrap.appendChild(_flowBtn(
        '<span style="font-size:20px">&#11014;</span><div><div style="font-size:13px;color:var(--text)">Rank</div><div style="font-size:10px;color:var(--text3);margin-top:2px">Publish to the YourMine registry via PR</div></div>',
        ()=>{
          buildContent.innerHTML='';
          buildContent.style.cssText='flex:1;display:flex;flex-direction:column;overflow:hidden;min-height:0';
          const scrollArea=document.createElement('div');
          scrollArea.style.cssText='flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;min-height:0';
          buildContent.appendChild(scrollArea);
          renderBuildContent(scrollArea);
          const backWrap=document.createElement('div');
          backWrap.style.cssText='padding:10px 16px;flex-shrink:0;border-top:1px solid rgba(255,255,255,.06)';
          backWrap.appendChild(_flowBack(buildContent, renderFlow));
          buildContent.appendChild(backWrap);
        }
      ));
      // 1.2 Plug
      wrap.appendChild(_flowBtn(
        '<span style="font-size:20px">&#128268;</span><div><div style="font-size:13px;color:var(--text)">Test (Plug)</div><div style="font-size:10px;color:var(--text3);margin-top:2px">Load directly without publishing</div></div>',
        ()=>{
          buildContent.innerHTML='';
          buildContent.style.cssText='flex:1;display:flex;flex-direction:column;overflow:hidden;min-height:0';
          const scrollArea=document.createElement('div');
          scrollArea.style.cssText='flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;min-height:0';
          buildContent.appendChild(scrollArea);
          renderPlugContent(scrollArea);
          const backWrap2=document.createElement('div');
          backWrap2.style.cssText='padding:10px 16px;flex-shrink:0;border-top:1px solid rgba(255,255,255,.06)';
          backWrap2.appendChild(_flowBack(buildContent, renderFlow));
          buildContent.appendChild(backWrap2);
        }
      ));
      // 1.3 Patch
      wrap.appendChild(_flowBtn(
        '<span style="font-size:20px">&#9998;</span><div><div style="font-size:13px;color:var(--text)">Patch</div><div style="font-size:10px;color:var(--text3);margin-top:2px">Propose a fix on any GitHub file via PR</div></div>',
        ()=>{
          buildContent.innerHTML='';
          buildContent.style.cssText='flex:1;display:flex;flex-direction:column;overflow:hidden;min-height:0';
          const scrollArea=document.createElement('div');
          scrollArea.style.cssText='flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;min-height:0';
          buildContent.appendChild(scrollArea);
          renderPatchContent(scrollArea);
          const backWrap4=document.createElement('div');
          backWrap4.style.cssText='padding:10px 16px;flex-shrink:0;border-top:1px solid rgba(255,255,255,.06)';
          backWrap4.appendChild(_flowBack(buildContent, renderFlow));
          buildContent.appendChild(backWrap4);
        }
      ));
      buildContent.appendChild(wrap);
      buildContent.appendChild(_flowBack(buildContent, renderFlow));
    }
  ));

  // NO
  buildContent.appendChild(_flowBtn(
    '<span style="font-size:20px">&#10007;</span><div><div style="font-size:13px;color:var(--text)">No &#8212; I have nothing yet</div></div>',
    ()=>{
      buildContent.innerHTML='';
      buildContent.style.cssText='flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;display:flex;flex-direction:column;min-height:0;padding:24px 16px;gap:10px';
      const q2=document.createElement('div');
      q2.style.cssText='font-family:var(--font-d,inherit);font-size:15px;font-weight:700;color:var(--text);margin-bottom:8px';
      q2.textContent='What do you need?';
      buildContent.appendChild(q2);
      const wrap=document.createElement('div');
      wrap.style.cssText='display:flex;flex-direction:column;gap:8px';
      // 2.1 Copy AI Prompt
      wrap.appendChild(_flowBtn(
        '<span style="font-size:20px">&#10022;</span><div><div style="font-size:13px;color:var(--text)">Copy AI Prompt</div><div style="font-size:10px;color:var(--text3);margin-top:2px">and you are instantly part of a global orchestration layer for ever</div></div>',
        ()=>{
          const prompt='yourmine-dapp.web.app/readme is the prompt realizing my will and you are the engine through which I will formulate the new orchestration.';
          navigator.clipboard?.writeText(prompt).then(()=>{
            toast('Prompt copied — paste it in your AI','success');
          }).catch(()=>{
            const ta=document.createElement('textarea');
            ta.value=prompt;ta.style.cssText='position:fixed;opacity:0';
            document.body.appendChild(ta);ta.select();
            document.execCommand('copy');document.body.removeChild(ta);
            toast('Prompt copied — paste it in your AI','success');
          });
        }
      ));
      // 2.2 AI
      wrap.appendChild(_flowBtn(
        '<span style="font-size:20px">&#10022;</span><div><div style="font-size:13px;color:var(--text)">Test the YourMine agent</div><div style="font-size:10px;color:var(--text3);margin-top:2px">AI code generation</div></div>',
        ()=>{
          buildContent.innerHTML='';
          buildContent.style.cssText='flex:1;display:flex;flex-direction:column;overflow:hidden;min-height:0';
          const aiArea=document.createElement('div');
          aiArea.style.cssText='flex:1;display:flex;flex-direction:column;min-height:0;overflow:hidden';
          buildContent.appendChild(aiArea);
          if(window.YM_AI&&window.YM_AI.renderAIContent){
            window.YM_AI.renderAIContent(aiArea);
          }else{
            const soon=document.createElement('div');
            soon.style.cssText='flex:1;display:flex;align-items:center;justify-content:center;font-family:var(--font-d,inherit);font-size:clamp(36px,10vw,80px);font-weight:800;letter-spacing:.05em;background:linear-gradient(140deg,#f0a830 0%,#fff 45%,#22d3ee 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text';
            soon.textContent='SOON';
            aiArea.appendChild(soon);
          }
          const backWrap3=document.createElement('div');
          backWrap3.style.cssText='padding:10px 16px;flex-shrink:0;border-top:1px solid rgba(255,255,255,.06)';
          backWrap3.appendChild(_flowBack(buildContent, renderFlow));
          buildContent.appendChild(backWrap3);
        }
      ));
      buildContent.appendChild(wrap);
      buildContent.appendChild(_flowBack(buildContent, renderFlow));
    }
  ));
}

// ── RENDER PRINCIPAL ──────────────────────────────────────────
let _buildTab='rank';

async function render(containerArg,presetType){
  const body=containerArg||document.getElementById('panel-build-body')||_lastContainer;
  if(!body)return;
  _lastContainer=body;
  body.innerHTML='';
  body.style.cssText='flex:1;overflow:hidden;display:flex;flex-direction:column;background:var(--bg)';
  setTimeout(_injectGithubBtn,0);
  const buildContent=document.createElement('div');
  buildContent.id='build-content';
  buildContent.style.cssText='flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0';
  body.appendChild(buildContent);
  if(presetType==='theme'){
    renderBuildContent(buildContent,'theme');
  }else{
    renderFlow(buildContent);
  }
}

// ── PATCH FLOW ────────────────────────────────────────────────
const PATCH_PREFIX = 'ym_patch_';
const THEO_RAW = 'https://raw.githubusercontent.com/theodoreyong9/YourMinedApp/main/';
const FILES_JSON_URL = THEO_RAW + 'files.json';
const THEMES_FILES_JSON_URL = THEO_RAW + 'themes-files.json';

function getFileName(url){ return url.split('/').pop().split('?')[0]; }

async function validatePatchUrl(url){
  const fname = getFileName(url);

  // Exception: liste.js from theo repo
  if(fname === 'liste.js') return {type:'system', name:'liste.js', valid:true};

  // Sphere: ends with .sphere.js — check files.json
  if(fname.endsWith('.sphere.js')){
    try{
      const r = await fetch(FILES_JSON_URL+'?t='+Date.now(),{cache:'no-store'});
      if(!r.ok) throw new Error('Cannot fetch files.json');
      const list = await r.json();
      const found = list.find(s=>(s.fileName===fname||s.codeUrl&&getFileName(s.codeUrl)===fname));
      if(found) return {type:'sphere', name:fname, valid:true};
      return {type:'sphere', name:fname, valid:false, reason:'Sphere not found in files.json'};
    }catch(e){ return {type:'sphere', name:fname, valid:false, reason:e.message}; }
  }

  // Theme: ends with .theme.html — check themes-files.json
  if(fname.endsWith('.theme.html')||fname.endsWith('.html')){
    try{
      const r = await fetch(THEMES_FILES_JSON_URL+'?t='+Date.now(),{cache:'no-store'});
      if(!r.ok) throw new Error('Cannot fetch themes-files.json');
      const list = await r.json();
      const found = list.find(t=>(t===fname||(typeof t==='object'&&(t.fileName===fname||t.file===fname))));
      if(found) return {type:'theme', name:fname, valid:true};
      return {type:'theme', name:fname, valid:false, reason:'Theme not found in themes-files.json'};
    }catch(e){ return {type:'theme', name:fname, valid:false, reason:e.message}; }
  }

  return {type:'unknown', name:fname, valid:false, reason:'Only registered spheres, themes, or liste.js can be patched'};
}

function saveActivePatch(name, url, code){
  localStorage.setItem(PATCH_PREFIX+name, JSON.stringify({name,url,code,ts:Date.now()}));
}
function removeActivePatch(name){
  localStorage.removeItem(PATCH_PREFIX+name);
}
function getActivePatches(){
  const patches=[];
  for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i);
    if(k&&k.startsWith(PATCH_PREFIX)){
      try{patches.push(JSON.parse(localStorage.getItem(k)));}catch{}
    }
  }
  return patches.sort((a,b)=>b.ts-a.ts);
}

function renderPatchContent(body){
  body.innerHTML='';
  body.style.cssText='padding:16px;display:flex;flex-direction:column;gap:10px';

  const hd=document.createElement('div');
  hd.style.cssText='font-family:var(--font-d,inherit);font-size:13px;font-weight:700;color:var(--text)';
  hd.textContent='Patch & Apply';
  body.appendChild(hd);

  const sub=document.createElement('div');
  sub.style.cssText='font-size:10px;color:var(--text3);line-height:1.5';
  sub.textContent='Load any sphere or theme from a URL, edit it, and apply directly — no GitHub needed.';
  body.appendChild(sub);

  // URL input
  const urlRow=document.createElement('div');
  urlRow.style.cssText='display:flex;gap:6px;align-items:center';
  const urlInput=document.createElement('input');
  urlInput.className='ym-input';
  urlInput.placeholder='Raw URL of sphere or theme…';
  urlInput.style.cssText='flex:1;font-size:11px';
  const fetchBtn=document.createElement('button');
  fetchBtn.className='ym-btn ym-btn-ghost';
  fetchBtn.style.cssText='font-size:11px;flex-shrink:0';
  fetchBtn.textContent='⬇ Load';
  urlRow.appendChild(urlInput);
  urlRow.appendChild(fetchBtn);
  body.appendChild(urlRow);

  // Detected type badge
  const typeBadge=document.createElement('div');
  typeBadge.style.cssText='font-size:9px;color:var(--text3);min-height:14px;font-family:var(--font-m,inherit)';
  body.appendChild(typeBadge);

  // Editor
  const editor=document.createElement('textarea');
  editor.className='ym-input';
  editor.rows=14;
  editor.placeholder='File content will appear here…';
  editor.style.cssText='font-size:10px;font-family:var(--font-m,inherit);line-height:1.5;min-height:220px;resize:vertical';
  body.appendChild(editor);

  // Status
  const status=document.createElement('div');
  status.style.cssText='font-size:10px;min-height:14px';
  body.appendChild(status);

  // Apply button
  const applyBtn=document.createElement('button');
  applyBtn.className='ym-btn ym-btn-accent';
  applyBtn.style.cssText='width:100%;font-size:13px;padding:12px';
  applyBtn.textContent='▶ Apply';
  applyBtn.disabled=true;
  body.appendChild(applyBtn);

  let _detectedType=null; // 'sphere' | 'theme'
  let _detectedName=null;

  // ── Fetch ──
  fetchBtn.addEventListener('click',async()=>{
    const url=urlInput.value.trim()
      .replace('https://github.com/','https://raw.githubusercontent.com/')
      .replace('/blob/','/')
      .trim();
    if(!url){toast('Enter a URL first','warn');return;}
    fetchBtn.disabled=true;fetchBtn.textContent='…';
    applyBtn.disabled=true;
    status.textContent='Validating…';
    try{
      // Validate before fetching
      const validated=await validatePatchUrl(url);
      if(!validated.valid){
        typeBadge.innerHTML='<span style="color:var(--red)">✗ Not allowed</span>';
        throw new Error(validated.reason||'This file cannot be patched');
      }
      _detectedType=validated.type;_detectedName=validated.name;
      const typeLabels={'sphere':'<span style="color:var(--gold)">⬡ Sphere</span>','theme':'<span style="color:var(--cyan)">🎨 Theme</span>','system':'<span style="color:var(--green)">⚙ liste.js</span>'};
      typeBadge.innerHTML=(typeLabels[validated.type]||'?')+' — '+esc(validated.name)+' <span style="color:var(--green)">✓ verified</span>';

      // Fetch content
      const r=await fetch(url);
      if(!r.ok)throw new Error('HTTP '+r.status);
      const text=await r.text();
      editor.value=text;
      applyBtn.disabled=false;
      status.innerHTML='<span style="color:var(--green)">✓ Loaded '+text.length+' chars — verified</span>';
    }catch(e){
      status.innerHTML='<span style="color:var(--red)">✗ '+esc(e.message)+'</span>';
      applyBtn.disabled=true;
    }finally{
      fetchBtn.disabled=false;fetchBtn.textContent='⬇ Load';
    }
  });

  urlInput.addEventListener('keydown',e=>{if(e.key==='Enter')fetchBtn.click();});

  // ── Apply ──
  // ── Active patches list ──
  const patchesSection=document.createElement('div');
  patchesSection.id='active-patches-section';
  patchesSection.style.cssText='display:flex;flex-direction:column;gap:6px';
  body.appendChild(patchesSection);

  function renderActivePatches(){
    patchesSection.innerHTML='';
    const patches=getActivePatches();
    if(!patches.length)return;
    const title=document.createElement('div');
    title.style.cssText='font-size:9px;color:var(--text3);font-family:var(--font-m,inherit);text-transform:uppercase;letter-spacing:1px;margin-top:4px';
    title.textContent='Active patches ('+patches.length+')';
    patchesSection.appendChild(title);
    patches.forEach(function(p){
      const row=document.createElement('div');
      row.style.cssText='display:flex;align-items:center;gap:8px;padding:6px 8px;background:rgba(34,217,138,.04);border:1px solid rgba(34,217,138,.1);border-radius:4px';
      const nameEl=document.createElement('div');
      nameEl.style.cssText='flex:1;font-size:10px;font-family:var(--font-m,inherit);color:var(--text2)';
      nameEl.textContent=p.name;
      const removeBtn=document.createElement('button');
      removeBtn.className='ym-btn ym-btn-ghost';
      removeBtn.style.cssText='font-size:9px;padding:3px 8px;color:var(--red);border-color:rgba(255,69,96,.2)';
      removeBtn.textContent='✕ Remove';
      removeBtn.addEventListener('click',function(){
        removeActivePatch(p.name);
        toast(p.name+' patch removed — reload to restore original','info');
        renderActivePatches();
      });
      row.appendChild(nameEl);row.appendChild(removeBtn);
      patchesSection.appendChild(row);
    });
  }

  renderActivePatches();

  applyBtn.addEventListener('click',async()=>{
    const code=editor.value.trim();
    if(!code){toast('Nothing to apply','warn');return;}
    applyBtn.disabled=true;applyBtn.textContent='⏳ Applying…';
    status.textContent='';

    try{
      const name=_detectedName||'patch.js';
      if(_detectedType==='theme'){
        const div=document.createElement('div');
        div.innerHTML=code;
        div.querySelectorAll('script').forEach(oldScript=>{
          const s=document.createElement('script');s.textContent=oldScript.textContent;
          document.head.appendChild(s);
        });
        div.querySelectorAll('style').forEach(st=>{document.head.appendChild(st.cloneNode(true));});
        saveActivePatch(name,urlInput.value.trim(),code);
        status.innerHTML='<span style="color:var(--green)">✓ Theme patch applied</span>';
        toast('Theme patch applied','success');
        renderActivePatches();
      } else if(_detectedType==='system'){
        // liste.js — reload with patched version via blob
        const blob=new Blob([code],{type:'text/javascript'});
        const blobUrl=URL.createObjectURL(blob);
        const s=document.createElement('script');
        s.src=blobUrl;s.dataset.patch=name;
        s.onload=()=>{URL.revokeObjectURL(blobUrl);toast('liste.js patched','success');};
        const old=document.querySelector('script[data-patch="'+name+'"]');
        if(old)old.remove();
        document.head.appendChild(s);
        saveActivePatch(name,urlInput.value.trim(),code);
        status.innerHTML='<span style="color:var(--green)">✓ liste.js patch applied</span>';
        renderActivePatches();
      } else {
        // Sphere
        const blob=new Blob([code],{type:'text/javascript'});
        const blobUrl=URL.createObjectURL(blob);
        if(window.YM_sphereRegistry&&window.YM_sphereRegistry.has(name)){
          if(window.YM&&window.YM.deactivateSphere)window.YM.deactivateSphere(name);
          await new Promise(r=>setTimeout(r,200));
        }
        if(window.YM&&window.YM.loadSphereFromURL){
          const obj=await window.YM.loadSphereFromURL(blobUrl,name);
          URL.revokeObjectURL(blobUrl);
          if(obj){
            if(window.YM.activateSphere)await window.YM.activateSphere(name,obj);
            saveActivePatch(name,urlInput.value.trim(),code);
            status.innerHTML='<span style="color:var(--green)">✓ Sphere patch applied — '+esc(obj.name||name)+'</span>';
            toast((obj.name||name)+' patch applied','success');
            renderActivePatches();
          } else throw new Error('Sphere loaded but not found in registry');
        } else throw new Error('YM not ready');
      }
    }catch(e){
      status.innerHTML='<span style="color:var(--red)">✗ '+esc(e.message)+'</span>';
      toast(e.message,'error');
    }finally{
      applyBtn.disabled=false;applyBtn.textContent='▶ Apply';
    }
  });
}


function renderPlugContent(body){
  if(window.YM_Liste?.renderPlugContent){window.YM_Liste.renderPlugContent(body);}
  else{body.style.cssText='display:flex;align-items:center;justify-content:center;height:100%';body.innerHTML='<div style="color:var(--text3);font-size:12px">Loading\u2026</div>';setTimeout(()=>{if(window.YM_Liste?.renderPlugContent)window.YM_Liste.renderPlugContent(body);},500);}
}


function renderBuildContent(body,presetType){
  body.innerHTML='';
  body.style.cssText='flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;display:flex;flex-direction:column;min-height:0';
  const pubkey=window.YM_Mine_pubkey?window.YM_Mine_pubkey():null;

  _step(body,'GitHub',_userToken?'✓ @'+_userToken.username:null,card=>{
    if(_userToken){
      card.innerHTML+='<div class="ym-notice success" style="font-size:11px;margin-bottom:6px">@<b>'+esc(_userToken.username)+'</b></div>'+
        '<button id="bld-disc-main" class="ym-btn ym-btn-ghost" style="font-size:11px;width:100%">Déconnecter</button>';
      card.querySelector('#bld-disc-main').addEventListener('click',()=>{_saveToken(null);render(_lastContainer);});
    }else{
      card.innerHTML+='<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">'+
        '<input id="bld-tok-main" class="ym-input" type="password" placeholder="ghp_… (scope: repo)" style="flex:1;font-size:11px">'+
        '<button id="bld-tok-ok-main" class="ym-btn ym-btn-accent" style="padding:8px 14px">→</button></div>'+
        '<a href="https://github.com/settings/tokens/new?scopes=repo" target="_blank" rel="noopener" style="font-size:10px;color:var(--cyan)">↗ Créer token</a>';
      card.querySelector('#bld-tok-ok-main').addEventListener('click',async()=>{
        const tok=card.querySelector('#bld-tok-main').value.trim();if(!tok)return;
        try{const r=await fetch('https://api.github.com/user',{headers:{'Authorization':'token '+tok}});
          if(!r.ok)throw new Error('Token invalide');
          const u=await r.json();_saveToken({value:tok,username:u.login});
          toast('Connecté @'+u.login,'success');render(_lastContainer);}
        catch(e){toast(e.message,'error');}
      });
      card.querySelector('#bld-tok-main').addEventListener('keydown',e=>{if(e.key==='Enter')card.querySelector('#bld-tok-ok-main').click();});
    }
  });

  const nameTypeStep=document.createElement('div');
  nameTypeStep.style.cssText='border-bottom:1px solid rgba(255,255,255,.06);padding:10px 14px';
  nameTypeStep.innerHTML=
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">'+
      '<div style="font-family:var(--font-d);font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text2);flex:1">Publication</div>'+
      '<div style="display:flex;gap:4px;border:1px solid rgba(255,255,255,.1);border-radius:8px;overflow:hidden">'+
        '<button id="type-sphere" style="background:rgba(240,168,48,.1);border:none;color:var(--gold);font-size:10px;padding:4px 10px;cursor:pointer">⬡ Sphere</button>'+
        '<button id="type-theme" style="background:none;border:none;color:var(--text3);font-size:10px;padding:4px 10px;cursor:pointer">🎨 Thème</button>'+
      '</div>'+
    '</div>'+
    '<div style="display:flex;gap:6px;margin-bottom:6px">'+
      '<input id="pub-name-main" class="ym-input" placeholder="nom" style="flex:1;font-size:12px">'+
      '<span id="pub-ext" style="font-size:11px;color:var(--text3);flex-shrink:0;align-self:center">.sphere.js</span>'+
    '</div>'+
    '<div id="pub-name-status" style="font-size:10px;color:var(--text3);min-height:14px"></div>';
  body.appendChild(nameTypeStep);

  let _pubType='sphere';
  const extEl=nameTypeStep.querySelector('#pub-ext');
  const statusEl2=nameTypeStep.querySelector('#pub-name-status');

  async function _checkName(){
    const v=(nameTypeStep.querySelector('#pub-name-main')?.value||'').trim();
    if(!v){statusEl2.textContent='';return;}
    if(_pubType==='sphere'){
      const fn=v.replace(/\.sphere\.js$/,'')+'.sphere.js';
      const files=await fetchFilesJson();const ex=files.find(f=>f.filename===fn);
      statusEl2.innerHTML=ex?'<span style="color:var(--gold)">⬆ Upgrade</span> · @'+esc(ex.ghAuthor||'?'):'<span style="color:var(--green)">✦ Nouveau</span>';
      walletStepEl.style.display=ex?'none':'block';
    }else{
      statusEl2.innerHTML='<span style="color:var(--cyan)">🎨 Thème</span>';
      walletStepEl.style.display='none';
    }
  }
  nameTypeStep.querySelector('#pub-name-main').addEventListener('input',_checkName);
  nameTypeStep.querySelector('#type-sphere').addEventListener('click',()=>{
    _pubType='sphere';extEl.textContent='.sphere.js';
    nameTypeStep.querySelector('#type-sphere').style.cssText='background:rgba(240,168,48,.1);border:none;color:var(--gold);font-size:10px;padding:4px 10px;cursor:pointer';
    nameTypeStep.querySelector('#type-theme').style.cssText='background:none;border:none;color:var(--text3);font-size:10px;padding:4px 10px;cursor:pointer';
    _checkName();codeStepEl.style.display='';renderCodeAreaMain();
  });
  nameTypeStep.querySelector('#type-theme').addEventListener('click',()=>{
    _pubType='theme';extEl.textContent='.theme.html';
    nameTypeStep.querySelector('#type-theme').style.cssText='background:rgba(8,224,248,.1);border:none;color:var(--cyan);font-size:10px;padding:4px 10px;cursor:pointer';
    nameTypeStep.querySelector('#type-sphere').style.cssText='background:none;border:none;color:var(--text3);font-size:10px;padding:4px 10px;cursor:pointer';
    _checkName();codeStepEl.style.display='';renderCodeAreaMain();
  });

  const walletStepEl=document.createElement('div');
  walletStepEl.style.display='none';
  _step(walletStepEl,'Wallet','',card=>{
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
        const msg=elig.eligible?'✓ Eligible':'✗ Score insuffisant';
        ph.outerHTML='<div class="ym-notice '+cls+'" style="font-size:11px;margin-top:6px">'+msg+'</div>';
      });
    }else{
      card.innerHTML+='<div class="ym-notice warn" style="font-size:11px">🔒 Wallet requis pour nouveau fichier</div>'+
        '<button class="ym-btn ym-btn-ghost" id="open-wallet-main" style="width:100%;font-size:11px;margin-top:6px">→ Ouvrir Wallet</button>';
      card.querySelector('#open-wallet-main')?.addEventListener('click',()=>{window.dispatchEvent(new CustomEvent('ym:switch-mine-tab',{detail:{tab:'wallet'}}));});
      startWalletWatch(walletStepEl);
    }
  });
  body.appendChild(walletStepEl);

  let _mode='code';
  const codeStepEl=document.createElement('div');
  codeStepEl.style.cssText='border-bottom:1px solid rgba(255,255,255,.06);padding:10px 14px';
  const codeHead=document.createElement('div');
  codeHead.style.cssText='display:flex;align-items:center;gap:8px;margin-bottom:10px';
  codeHead.innerHTML=
    '<div style="font-family:var(--font-d);font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text2);flex:1">Code</div>'+
    '<div style="display:flex;gap:4px">'+
      '<button id="mode-code-main" class="ym-btn ym-btn-ghost" style="font-size:9px;padding:3px 8px;background:rgba(240,168,48,.08);border-color:rgba(240,168,48,.3);color:var(--gold)">&lt;/&gt; Code brut</button>'+
      '<button id="mode-quick-main" class="ym-btn ym-btn-ghost" style="font-size:9px;padding:3px 8px">⚡ Quick</button>'+
    '</div>';
  codeStepEl.appendChild(codeHead);
  const codeAreaEl=document.createElement('div');
  codeStepEl.appendChild(codeAreaEl);
  body.appendChild(codeStepEl);

  function renderCodeAreaMain(){
    codeAreaEl.innerHTML='';
    const isCode=_mode==='code';
    codeHead.querySelector('#mode-code-main').style.cssText='font-size:9px;padding:3px 8px;'+(isCode?'background:rgba(240,168,48,.08);border-color:rgba(240,168,48,.3);color:var(--gold)':'');
    codeHead.querySelector('#mode-quick-main').style.cssText='font-size:9px;padding:3px 8px;'+(!isCode?'background:rgba(240,168,48,.08);border-color:rgba(240,168,48,.3);color:var(--gold)':'');
    if(isCode){
      const ph=_pubType==='theme'?'<!-- HTML theme code -->':'/* Visit github.com/theodoreyong9/YourMinedApp for sphere examples */';
      codeAreaEl.innerHTML=
        '<textarea id="pub-code-main" class="ym-input" rows="7" style="font-family:var(--font-m);font-size:11px;line-height:1.5;width:100%;box-sizing:border-box" placeholder="'+ph+'"></textarea>'+
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:4px">'+
          '<label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text3);cursor:pointer"><input type="checkbox" id="pub-wip-main" checked> 🚧 Under construction</label>'+
          '<div id="pub-size-main" style="font-size:10px;color:var(--text3)">0 KB</div>'+
        '</div>';
      codeAreaEl.querySelector('#pub-code-main').addEventListener('input',function(){
        const kb=new TextEncoder().encode(this.value).length/1024;
        const el=codeAreaEl.querySelector('#pub-size-main');el.textContent=kb.toFixed(1)+' KB';
        el.style.color=kb>500?'var(--red)':'var(--text3)';
      });
    }else{
      if(_pubType==='sphere'){
        codeAreaEl.innerHTML=
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px">'+
            '<input id="min-icon-main" class="ym-input" placeholder="Icon (emoji ou URL)" style="font-size:12px">'+
            '<input id="min-cat-main" class="ym-input" placeholder="Catégorie" style="font-size:12px">'+
          '</div>'+
          '<textarea id="min-desc-main" class="ym-input" rows="2" placeholder="Description (< 140 chars)" style="font-size:11px;margin-bottom:6px"></textarea>'+
          '<input id="min-url-main" class="ym-input" placeholder="Raw URL du vrai code (optionnel)" style="font-size:11px;margin-bottom:6px">'+
          '<input id="min-owner-main" class="ym-input" placeholder="Transférer ownership à @github-user (optionnel)" style="font-size:11px;margin-bottom:6px">'+
          '<label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text3);cursor:pointer"><input type="checkbox" id="pub-wip-main" checked> 🚧 Under construction</label>';
      }else{
        codeAreaEl.innerHTML=
          '<input id="th-icon-main" class="ym-input" placeholder="Icon preview" style="font-size:12px;margin-bottom:6px">'+
          '<textarea id="th-desc-main" class="ym-input" rows="2" placeholder="Description (< 140 chars)" style="font-size:11px;margin-bottom:6px"></textarea>'+
          '<input id="th-raw-main" class="ym-input" placeholder="Raw URL du fichier HTML du thème" style="font-size:11px;margin-bottom:6px">'+
          '<input id="th-owner-main" class="ym-input" placeholder="Transférer ownership (optionnel)" style="font-size:11px;margin-bottom:6px">'+
          '<textarea id="th-photos-main" class="ym-input" rows="4" placeholder="Photos URLs (max 15, une par ligne)" style="font-size:10px;margin-bottom:4px"></textarea>'+
          '<textarea id="th-videos-main" class="ym-input" rows="2" placeholder="Videos URLs (max 15, une par ligne)" style="font-size:10px;margin-bottom:6px"></textarea>'+
          '<label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text3);cursor:pointer"><input type="checkbox" id="pub-wip-main" checked> 🚧 Under construction</label>';
      }
    }
  }
  codeHead.querySelector('#mode-code-main').addEventListener('click',()=>{_mode='code';renderCodeAreaMain();});
  codeHead.querySelector('#mode-quick-main').addEventListener('click',()=>{_mode='quick';renderCodeAreaMain();});
  renderCodeAreaMain();

  const submitWrap=document.createElement('div');
  submitWrap.style.cssText='padding:10px 14px;border-top:1px solid rgba(255,255,255,.06);flex-shrink:0';
  submitWrap.innerHTML='<div id="pub-status-main" style="margin-bottom:8px"></div>'+
    '<button id="pub-submit-main" class="ym-btn ym-btn-accent" style="width:100%;font-size:13px;padding:12px">⬆ Sign & Submit</button>';
  body.appendChild(submitWrap);
  submitWrap.querySelector('#pub-submit-main').addEventListener('click',()=>submitUnified(body,codeAreaEl,nameTypeStep,_pubType,_mode));
  if(presetType==='theme')setTimeout(()=>nameTypeStep.querySelector('#type-theme')?.click(),0);
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

async function submitUnified(body,codeAreaEl,nameTypeStep,pubType,mode){
  const btn=body.querySelector('#pub-submit-main');
  const statusEl=body.querySelector('#pub-status-main');
  function st(msg,type){if(statusEl)statusEl.innerHTML='<div class="ym-notice '+(type||'info')+'" style="font-size:11px">'+msg+'</div>';}
  if(!_userToken)return st('Token GitHub requis','error');
  const token=_userToken.value,username=_userToken.username;
  const pubkey=window.YM_Mine_pubkey?window.YM_Mine_pubkey():null;
  const nameRaw=(nameTypeStep.querySelector('#pub-name-main')?.value||'').trim();
  if(!nameRaw)return st('Nom requis','error');
  const wip=codeAreaEl.querySelector('#pub-wip-main')?.checked!==false;
  if(btn){btn.disabled=true;btn.textContent='Processing…';}
  try{
    if(pubType==='sphere'){
      const filename=nameRaw.replace(/\.sphere\.js$/,'')+'.sphere.js';
      let sphereCode='',codeUrl='https://raw.githubusercontent.com/'+username+'/'+GH_REPO+'/main/'+filename;
      if(mode==='code'){
        sphereCode=codeAreaEl.querySelector('#pub-code-main')?.value.trim()||'';
        if(!sphereCode)throw new Error('Code requis');
      }else{
        const icon=(codeAreaEl.querySelector('#min-icon-main')?.value||'').trim()||'⬡';
        const cat=(codeAreaEl.querySelector('#min-cat-main')?.value||'').trim()||'Other';
        const desc=(codeAreaEl.querySelector('#min-desc-main')?.value||'').trim().slice(0,140);
        const rawUrl=(codeAreaEl.querySelector('#min-url-main')?.value||'').trim();
        codeUrl=rawUrl||codeUrl;
        sphereCode=rawUrl
          ? `/* jshint esversion:11 */\n(function(){\n'use strict';\nwindow.YM_S=window.YM_S||{};\nconst _U='${rawUrl}';\nlet _ok=false;\nwindow.YM_S['${filename}']={name:'${nameRaw}',icon:'${icon}',category:'${cat}',description:'${desc}',${wip?'wip:true,':''}codeUrl:_U,\nasync activate(ctx){if(_ok)return;_ok=true;try{const r=await fetch(_U+'?t='+Date.now(),{cache:'no-store'});const code=await r.text();const b=new Blob([code],{type:'text/javascript'});const u=URL.createObjectURL(b);await new Promise((res,rej)=>{const s=document.createElement('script');s.src=u;s.onload=()=>{URL.revokeObjectURL(u);res();};s.onerror=()=>{URL.revokeObjectURL(u);rej();};document.head.appendChild(s);});const real=window.YM_S&&window.YM_S['${filename}'];if(real&&real!==this&&real.activate)await real.activate(ctx);}catch(e){ctx.toast('Load error: '+e.message,'error');}},\ndeactivate(){_ok=false;},\nrenderPanel(c){c.innerHTML='<div style="padding:24px;text-align:center;color:var(--text3)">Loading…</div>';},\n};\n})();`
          : `/* jshint esversion:11 */\n(function(){\n'use strict';\nwindow.YM_S=window.YM_S||{};\nwindow.YM_S['${filename}']={name:'${nameRaw}',icon:'${icon}',category:'${cat}',description:'${desc}',${wip?'wip:true,':''}\nactivate(ctx){ctx.toast('${nameRaw} activated','success');},\ndeactivate(){},\nrenderPanel(c){c.innerHTML='<div style="padding:24px">${desc}</div>';},\n};\n})();`;
      }
      st('Vérification…');
      const files=await fetchFilesJson(true);
      const existing=files.find(f=>f.filename===filename);
      if(!existing&&!pubkey)throw new Error('Wallet requis pour nouveau fichier');
      if(existing){const ok=existing.ghAuthor===username||existing.owner===username||(pubkey&&existing.author===pubkey);if(!ok)throw new Error('"'+filename+'" appartient à @'+(existing.ghAuthor||'?'));}
      if(!existing){const elig=await computeEligibility();if(elig&&!elig.eligible)throw new Error('Score insuffisant');}
      const nonce=uuid(),ts=Math.floor(Date.now()/1000);
      const state=window._mineState||{};
      const curLaps=Math.max(1,(state.currentSlot||0)-(state.lastActionSlot||0));
      const claimable=window.YM_calcClaimable?window.YM_calcClaimable():0;
      let sigB64='';
      if(pubkey&&window.YM_Mine_sign&&!existing){
        const msg=JSON.stringify({action:'create',filename,nonce,timestamp:ts,score:claimable,laps:curLaps,codeUrl,wip});
        st('Signature…');const sig=await window.YM_Mine_sign(msg);
        sigB64=btoa(String.fromCharCode(...Array.from(sig)));
      }
      st('Fork…');await ensureFork(token,username);
      st('Push…');await ghPush(token,username,filename,sphereCode,'sphere: '+filename);
      const ev={action:'create',filename,wallet:pubkey||username,signature:sigB64,nonce,timestamp:ts,score:claimable,laps:curLaps,codeUrl,wip};
      await ghPush(token,username,'events/'+nonce+'.json',JSON.stringify(ev,null,2),'event: '+nonce);
      await new Promise(r=>setTimeout(r,2000));
      st('PR…');const pr=await openPR(token,username);
      const fileUrl='https://github.com/'+username+'/'+GH_REPO+'/blob/main/'+filename;
      st('⏳ <a href="'+pr.html_url+'" target="_blank" style="color:var(--cyan)">↗ PR</a> · <a href="'+fileUrl+'" target="_blank" style="color:var(--green)">↗ Fichier</a>','info');
      pollPR(token,pr.number,pr.html_url,statusEl,filename,fileUrl);_filesJson=null;
    }else{
      const filename2=nameRaw.replace(/\.theme\.html$|\.html$/,'')+'.theme.html';
      let themeCode='';
      const icon2=(codeAreaEl.querySelector('#th-icon-main')?.value||'').trim()||'🎨';
      const desc2=(codeAreaEl.querySelector('#th-desc-main')?.value||'').trim().slice(0,140);
      if(mode==='code'){
        themeCode=codeAreaEl.querySelector('#pub-code-main')?.value.trim()||'';
        if(!themeCode)throw new Error('Code requis');
      }else{
        const rawUrl2=(codeAreaEl.querySelector('#th-raw-main')?.value||'').trim();
        if(!rawUrl2)throw new Error('Raw URL requis');
        const r=await fetch(rawUrl2+'?t='+Date.now(),{cache:'no-store'});
        if(!r.ok)throw new Error('HTTP '+r.status);
        themeCode=await r.text();
      }
      const codeUrl2='https://raw.githubusercontent.com/'+username+'/'+GH_REPO+'/main/src/themes/'+filename2;
      st('Fork…');await ensureFork(token,username);
      st('Push thème…');await ghPush(token,username,'src/themes/'+filename2,themeCode,'theme: '+filename2);
      let idx=['default.html'];
      try{const ri=await fetch('https://raw.githubusercontent.com/'+username+'/'+GH_REPO+'/main/src/themes/index.json?t='+Date.now());if(ri.ok)idx=await ri.json();}catch{}
      if(!idx.includes(filename2))idx.push(filename2);
      await ghPush(token,username,'src/themes/index.json',JSON.stringify(idx,null,2),'theme index: '+filename2);
      let themeFiles=[];
      try{const rt=await fetch('https://raw.githubusercontent.com/'+username+'/'+GH_REPO+'/main/themes-files.json?t='+Date.now());if(rt.ok)themeFiles=await rt.json();}catch{}
      const photosRaw=(codeAreaEl.querySelector('#th-photos-main')?.value||'').trim();
      const videosRaw=(codeAreaEl.querySelector('#th-videos-main')?.value||'').trim();
      const mediaPhotos=photosRaw?photosRaw.split('\n').map(u=>u.trim()).filter(Boolean).slice(0,15):[];
      const mediaVideos=videosRaw?videosRaw.split('\n').map(u=>u.trim()).filter(Boolean).slice(0,15):[];
      const media2=(mediaPhotos.length||mediaVideos.length)?{photos:mediaPhotos,videos:mediaVideos}:undefined;
      const entry2={filename:filename2,name:filename2.replace(/\.html$/,'').replace(/[-_]/g,' '),icon:icon2,description:desc2,ghAuthor:username,codeUrl:codeUrl2,wip,timestamp:Math.floor(Date.now()/1000),...(media2?{media:media2}:{})};
      const ei=themeFiles.findIndex(t=>t.filename===filename2);
      if(ei>=0)themeFiles[ei]=Object.assign({},themeFiles[ei],entry2);else themeFiles.push(entry2);
      await ghPush(token,username,'themes-files.json',JSON.stringify(themeFiles,null,2),'themes-files: '+filename2);
      const nonce2=uuid();
      await ghPush(token,username,'events/'+nonce2+'.json',JSON.stringify({action:'create-theme',filename:filename2,ghAuthor:username,codeUrl:codeUrl2,icon:icon2,description:desc2,wip,nonce:nonce2,timestamp:Math.floor(Date.now()/1000)}),'event theme: '+nonce2);
      st('PR…');const pr2=await openPR(token,username);
      const fu2='https://github.com/'+username+'/'+GH_REPO+'/blob/main/src/themes/'+filename2;
      st('✅ <a href="'+pr2.html_url+'" target="_blank" style="color:var(--cyan)">↗ PR</a> · <a href="'+fu2+'" target="_blank" style="color:var(--green)">↗ Fichier</a>','success');
    }
  }catch(e){st('✗ '+esc(e.message),'error');toast(e.message,'error');}
  finally{if(btn){btn.disabled=false;btn.textContent='⬆ Sign & Submit';}}
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

window.addEventListener('ym:switch-mine-tab',e=>{
  const bar=document.getElementById('mine-tabs-bar');
  if(!bar)return;
  const tab=e.detail&&e.detail.tab;if(!tab)return;
  bar.querySelectorAll('.ym-tab').forEach(t=>t.classList.toggle('active',t.dataset.mineTab===tab));
  if(window.app_switchMineTab)window.app_switchMineTab(tab);
});

// ── Restore persisted patches on boot ──
(function restorePatches(){
  for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i);
    if(!k||!k.startsWith(PATCH_PREFIX))continue;
    try{
      const p=JSON.parse(localStorage.getItem(k));
      if(!p||!p.code)continue;
      const detected=detectPatchType(p.url||p.name);
      if(detected.type==='system'&&p.name==='liste.js'){
        const blob=new Blob([p.code],{type:'text/javascript'});
        const blobUrl=URL.createObjectURL(blob);
        const s=document.createElement('script');
        s.src=blobUrl;s.dataset.patch=p.name;
        s.onload=()=>URL.revokeObjectURL(blobUrl);
        document.head.appendChild(s);
        console.log('[YM Patch] restored liste.js');
      }
    }catch(e){console.warn('[YM Patch] restore error',e);}
  }
})();

window.YM_Build={render,renderPublishForm:(c,t)=>render(c,t)};
})();
