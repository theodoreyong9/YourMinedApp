/* jshint esversion:11, -W033 */
// liste.js — YourMine Sphere List Manager
(function(){
'use strict';

const REPO_OWNER  = 'theodoreyong9';
const REPO_NAME   = 'YourMinedApp';
const REPO_BRANCH = 'main';
const RAW_BASE    = 'https://raw.githubusercontent.com/'+REPO_OWNER+'/'+REPO_NAME+'/'+REPO_BRANCH+'/';
const FILES_JSON_URL = (window.YM_REGISTRY_OVERRIDE && window.YM_REGISTRY_OVERRIDE.url) || RAW_BASE+'files.json';

const CACHE_KEY = 'ym_liste_cache_v4';
const CACHE_TTL = 30 * 60 * 1000;

let _sphereList = [];
const PAGE_SIZE = 20;
let _listPage = 0;
let _loaded     = false;
let _filterText   = '';
let _filterCat    = '';
let _filterActive = false, _filterInactive = false;
let _filterSocial = null;

function _readCache(allowStale=false){
  try{const raw=localStorage.getItem(CACHE_KEY);if(!raw)return null;const c=JSON.parse(raw);if(!allowStale&&Date.now()-c.ts>CACHE_TTL)return null;return c;}catch{return null;}
}
function _writeCache(list,etag){
  try{localStorage.setItem(CACHE_KEY,JSON.stringify({list,ts:Date.now(),etag:etag||null}));}catch{}
}

let _fetchPromise=null;
async function fetchSphereList(){
  if(_fetchPromise)return _fetchPromise;
  _fetchPromise=_doFetch().catch(e=>{_fetchPromise=null;throw e;}).finally(()=>{_fetchPromise=null;});
  return _fetchPromise;
}

async function _doFetch(){
  let entries=[];
  let etag=null;
  try{
    // Fetch files.json with ETag for cache invalidation
    const res=await fetch(FILES_JSON_URL+'?t='+Date.now(),{cache:'no-store'});
    if(!res.ok)throw new Error('HTTP '+res.status);
    etag=res.headers.get('etag')||res.headers.get('last-modified')||null;
    const data=await res.json();
    entries=Array.isArray(data)?data:[];
  }catch(e){
    console.warn('[Liste] files.json fetch failed:',e.message);
    const cached=_readCache();
    if(cached){_sphereList=cached.list;_loaded=true;return _sphereList;}
    _sphereList=[];_loaded=true;return _sphereList;
  }
  // Invalidate cache if files.json changed (etag mismatch)
  const cached=_readCache(true);
  const cacheValid=cached&&etag&&cached.etag===etag&&(Date.now()-cached.ts<CACHE_TTL);
  if(cacheValid){_sphereList=cached.list;_loaded=true;return _sphereList;}
  if(!entries.length){_sphereList=[];_loaded=true;_writeCache(_sphereList);return _sphereList;}
  const cachedMap={};
  if(cached)cached.list.forEach(s=>{cachedMap[s.fileName]=s;});
  const _isOverride=!!(window.YM_REGISTRY_OVERRIDE&&window.YM_REGISTRY_OVERRIDE.url);
  const _fetchedList=await Promise.all(entries.map(async entry=>{
    const fileName=entry.filename;
    const ghAuthor=entry.ghAuthor||entry.last_committer||'';
    const codeUrl=(entry.codeUrl||( ghAuthor?'https://raw.githubusercontent.com/'+ghAuthor+'/'+REPO_NAME+'/'+REPO_BRANCH+'/'+fileName:null))?.replace('https://github.com/','https://raw.githubusercontent.com/').replace('/blob/','/');
    // When override is active, use codeUrl as primary source
    const url=_isOverride?(codeUrl||RAW_BASE+fileName):RAW_BASE+fileName;
    // Use metadata from files.json directly if available — no need to fetch sphere code
    const entryMeta={
      name:entry.name||null,
      icon:entry.icon||null,
      category:entry.category||null,
      description:entry.description||null,
    };
    const hasEntryMeta=entryMeta.name&&entryMeta.icon;
    if(cachedMap[fileName]){
      const cached={...cachedMap[fileName],ghAuthor,author:entry.author||'',score:entry.score||0,laps:entry.laps||0,merged_at:entry.merged_at||0,codeUrl:codeUrl||cachedMap[fileName].codeUrl||null};
      // Override with files.json metadata if available
      if(hasEntryMeta)Object.assign(cached,entryMeta);
      return cached;
    }
    // If files.json has metadata, use it directly without fetching sphere code
    if(hasEntryMeta){
      return{...entryMeta,url,codeUrl,fileName,ghAuthor,author:entry.author||'',score:entry.score||0,laps:entry.laps||0,merged_at:entry.merged_at||0};
    }
    const meta=await fetchSphereMeta(url,fileName,codeUrl);
    return{...meta,url,codeUrl,fileName,ghAuthor,author:entry.author||'',score:entry.score||0,laps:entry.laps||0,merged_at:entry.merged_at||0};
  }));
  _fetchedList.sort(function(a,b){return (b.score||0)-(a.score||0);});
  _sphereList=_fetchedList;
  _writeCache(_sphereList,etag);
  _loaded=true;
  return _sphereList;
}

async function fetchSphereMeta(url,fileName,codeUrl){
  const stale=_readCache(true);
  const staleEntry=stale&&stale.list&&stale.list.find(s=>s.fileName===fileName);
  // Try GitHub Contents API first — bypasses SW cache
  const apiUrl='https://api.github.com/repos/'+REPO_OWNER+'/'+REPO_NAME+'/contents/'+fileName+'?ref='+REPO_BRANCH;
  try{
    const res=await fetch(apiUrl,{headers:{'Accept':'application/vnd.github.v3.raw'},signal:AbortSignal.timeout(8000)});
    if(!res.ok)throw new Error('HTTP '+res.status);
    const code=await res.text();
    return{
      name:extractField(code,'name')||fileName.replace('.sphere.js',''),
      icon:extractField(code,'icon')||'⬡',
      category:extractField(code,'category')||'Other',
      description:extractField(code,'description')||'',
      fileName
    };
  }catch{
    // Fallback to direct fetch
    try{
      const fetchUrl=codeUrl||url;
      const res2=await fetch(fetchUrl+'?t='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(8000)});
      if(!res2.ok)throw new Error();
      const code=await res2.text();
      return{
        name:extractField(code,'name')||fileName.replace('.sphere.js',''),
        icon:extractField(code,'icon')||'⬡',
        category:extractField(code,'category')||'Other',
        description:extractField(code,'description')||'',
        fileName
      };
    }catch{
      if(staleEntry)return staleEntry;
      return{name:fileName.replace('.sphere.js',''),icon:'⬡',category:'Other',description:'',fileName};
    }
  }
}

function extractField(code,field){
  const defMatch=code.match(/window\.YM_S\s*\[.*?\]\s*=\s*\{([\s\S]{0,1200})/);
  const searchIn=defMatch?defMatch[1]:code.slice(0,3000);
  const r1=new RegExp("['\"]?"+field+"['\"]?\\s*:\\s*'([^'\\n\\$\\{\\}]{1,120})'");
  const r2=new RegExp('[\'"]?'+field+'[\'"]?\\s*:\\s*"([^"\\n\\x24\\x7B\\x7D]{1,120})"');
  const m1=searchIn.match(r1);if(m1)return m1[1].trim();
  const m2=searchIn.match(r2);if(m2)return m2[1].trim();
  return null;
}

const MANDATORY_SPHERES=['social.sphere.js'];
const _isTestTheme = (localStorage.getItem('ym_theme_url')||'').includes('test');
const _getActiveKey = () => _isTestTheme
  ? (localStorage.getItem('ym_profile_key')||'ym_profile_test_v1').replace('profile','active_spheres')
  : 'ym_active_spheres';
function getActiveSpheres(){return JSON.parse(localStorage.getItem(_getActiveKey())||'[]');}
function setActiveSpheres(arr){localStorage.setItem(_getActiveKey(),JSON.stringify(arr));}
function isSphereActive(fileName){return getActiveSpheres().includes(fileName);}

async function activateSphere(sphere){
  if(window.YM_sphereRegistry?.has(sphere.fileName))return;
  const active=getActiveSpheres();
  if(!active.includes(sphere.fileName)){active.push(sphere.fileName);setActiveSpheres(active);}
  // Store codeUrl for cross-registry fallback
  if(sphere.codeUrl){
    try{var _urls=JSON.parse(localStorage.getItem('ym_sphere_codeurls')||'{}');_urls[sphere.fileName]=sphere.codeUrl;localStorage.setItem('ym_sphere_codeurls',JSON.stringify(_urls));}catch(e){}
  }
  try{
    const sphereObj=await loadSphereCode(sphere);
    if(sphereObj)await window.YM?.activateSphere?.(sphere.fileName,sphereObj);
  }catch(e){
    console.warn('[Liste] activation error for',sphere.fileName,':',e.message);
    window.YM_toast?.('Error loading '+sphere.name+': '+e.message,'error');
    setActiveSpheres(getActiveSpheres().filter(s=>s!==sphere.fileName));
  }
}

async function deactivateSphere(sphere){
  if(!isSphereActive(sphere.fileName))return;
  setActiveSpheres(getActiveSpheres().filter(s=>s!==sphere.fileName));
  await window.YM?.deactivateSphere?.(sphere.fileName);
  window.YM_toast?.(sphere.name+' deactivated','info');
}

async function loadSphereCode(sphere){
  const loadUrl=sphere.codeUrl||sphere.url;
  if(!loadUrl||!loadUrl.startsWith('http')){return await loadLocalSphere(loadUrl,sphere.fileName);}
  try{
    const res=await fetch(loadUrl+'?t='+Date.now(),{cache:'no-store'});
    if(!res.ok)throw new Error('HTTP '+res.status+' fetching '+loadUrl);
    const code=await res.text();
    return await execSphereCode(code,sphere.fileName);
  }catch(e){
    console.warn('[Liste] loadSphereCode failed for',sphere.fileName,':',e.message);
    return await loadLocalSphere(loadUrl,sphere.fileName);
  }
}

async function execSphereCode(code,fileName){
  return new Promise(function(resolve){
    const blob=new Blob([code],{type:'text/javascript'});
    const url=URL.createObjectURL(blob);
    const s=document.createElement('script');s.src=url;
    s.onload=function(){URL.revokeObjectURL(url);resolve(window.YM_S&&window.YM_S[fileName]||null);};
    s.onerror=function(){URL.revokeObjectURL(url);resolve(null);};
    document.head.appendChild(s);
  });
}

async function loadLocalSphere(src,fileName){
  return new Promise(resolve=>{
    const s=document.createElement('script');s.src=src;
    s.onload=()=>resolve(window.YM_S?.[fileName]||null);
    s.onerror=()=>resolve(null);
    document.head.appendChild(s);
  });
}

async function activateSphereByName(fileName, codeUrl){
  if(window.YM_sphereRegistry?.has(fileName))return;
  if(!_loaded)await fetchSphereList();
  let sphere=_sphereList.find(s=>s.fileName===fileName);
  // Fallback 1: if override active, try Theodore's registry
  if(!sphere && window.YM_REGISTRY_OVERRIDE){
    try{
      const res=await fetch('https://raw.githubusercontent.com/theodoreyong9/YourMinedApp/main/files.json?t='+Date.now(),{cache:'no-store'});
      if(res.ok){
        const list=await res.json();
        const entry=list.find(function(e){return e.filename===fileName;});
        if(entry){
          const ghAuthor=entry.ghAuthor||'theodoreyong9';
          sphere={fileName:entry.filename,codeUrl:entry.codeUrl||('https://raw.githubusercontent.com/'+ghAuthor+'/YourMinedApp/main/'+entry.filename),score:entry.score||0,laps:entry.laps||0,author:entry.author||'',ghAuthor};
        }
      }
    }catch(e){console.warn('[Liste] fallback Theodore registry failed:',e.message);}
  }
  // Fallback 2: use codeUrl stored at last activation
  if(!sphere){
    try{var _urls=JSON.parse(localStorage.getItem('ym_sphere_codeurls')||'{}');if(_urls[fileName])sphere={fileName,codeUrl:_urls[fileName],score:0,laps:0,author:'',ghAuthor:''};}catch(e){}
  }
  // Fallback 3: if codeUrl passed directly, use it
  if(!sphere && codeUrl){
    sphere={fileName,codeUrl,score:0,laps:0,author:'',ghAuthor:''};
  }
  if(sphere)await activateSphere(sphere);
  else console.warn('[Liste] sphere not found:',fileName);
}

// ── INLINE ACTION BAR ────────────────────────────────────────────────────────
// Shared style for all action buttons in the bar
const BTN_BASE = 'display:inline-flex;align-items:center;gap:4px;padding:6px 11px;border-radius:7px;font-size:11px;font-weight:500;cursor:pointer;border:none;transition:background .15s,color .15s;line-height:1;';
const BTN_GHOST = BTN_BASE+'background:rgba(255,255,255,.05);color:rgba(240,240,248,.55);';
const BTN_ACCENT = BTN_BASE+'background:rgba(240,168,48,.15);color:#f0a830;';
const BTN_DANGER = BTN_BASE+'background:rgba(255,69,96,.1);color:rgba(255,69,96,.8);';
const BTN_CYAN   = BTN_BASE+'background:rgba(34,211,238,.1);color:#22d3ee;';

function _makeActionBar(btns){
  // btns: [{icon, label, style, onClick, id}]
  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;padding:10px 0 2px 0;animation:ymBarIn .15s ease';
  // inject keyframe once
  if(!document.getElementById('ym-bar-style')){
    const st=document.createElement('style');st.id='ym-bar-style';
    st.textContent='@keyframes ymBarIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}';
    document.head.appendChild(st);
  }
  btns.forEach(b=>{
    const btn=document.createElement('button');
    btn.style.cssText=b.style||BTN_GHOST;
    btn.innerHTML=(b.icon?'<span>'+b.icon+'</span> ':'')+b.label;
    if(b.id)btn.dataset.actionId=b.id;
    btn.addEventListener('click',e=>{e.stopPropagation();b.onClick(btn);});
    bar.appendChild(btn);
  });
  return bar;
}

// ── RENDER ───────────────────────────────────────────────────────────────────
let _currentBody=null;
let _listType='spheres';
let _listShowWip=false;

async function render(containerArg){
  const body=containerArg||document.getElementById('panel-spheres-body')||document.getElementById('panel-mine-liste');
  if(!body)return;
  _currentBody=body;
  // Always clear stale content so "Loading" never persists
  body.innerHTML='';
  body.style.cssText='display:flex;flex-direction:column;height:100%;min-height:0;padding:0;overflow:hidden';

  body.innerHTML=
    '<div id="list-content" style="flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0"></div>'+
    '<div id="list-controls" style="padding:8px 12px 8px;border-top:1px solid rgba(232,160,32,.12);display:flex;flex-direction:column;gap:6px;flex-shrink:0;background:inherit">'+
      '<div id="list-type-row" style="display:flex;gap:6px"></div>'+
      '<div id="list-filter-row" style="display:flex;gap:5px;flex-wrap:wrap"></div>'+
      '<div id="list-dropdown-panel" style="display:none;flex-wrap:wrap;gap:4px;padding:6px 0 2px;animation:ymBarIn .15s ease"></div>'+
      '<div id="list-wip-row" style="display:none"></div>'+
      '<div id="list-search-row" style="display:flex;gap:6px;align-items:center">'+
        '<input id="list-search" class="ym-input" placeholder="Search…" style="flex:1;font-size:12px;padding:7px 10px">'+
      '</div>'+
    '</div>';

  const content=body.querySelector('#list-content');
  const typeRow=body.querySelector('#list-type-row');
  const filterRow=body.querySelector('#list-filter-row');
  const dropdownPanel=body.querySelector('#list-dropdown-panel');
  const wipRow=body.querySelector('#list-wip-row');
  const searchInput=body.querySelector('#list-search');
  let _openDropdown=null; // 'type'|'cat'|'status'|null

  searchInput.addEventListener('input',e=>{
    _listPage=0;
    const v=e.target.value.toLowerCase();
    _filterText=v;_themeSearch=v;
    if(_listType==='spheres')renderList(content);
    else if(_listType==='themes'||_listType==='photo'||_listType==='video'){
      const cu=localStorage.getItem('ym_theme_url')||'';
      _renderThemeCards(content,cu,'https://github.com/',_themesList);
    }
  });



  const TYPE_MAIN=[{id:'spheres',label:'⬡ Spheres'},{id:'themes',label:'🎨 Themes'}];
  const TYPE_THEME_EXTRA=[{id:'photo',label:'📷 Photo'},{id:'video',label:'🎥 Video'}];
  const TYPE_OPTS=[{id:'spheres',label:'⬡ Spheres'},{id:'themes',label:'🎨 Themes'},{id:'photo',label:'📷 Photo'},{id:'video',label:'🎥 Video'}];
  const CAT_OPTS=['All','Tools','AI','Games','Finance','Commerce','Social','Media','Search','Agent','Communication','Other'];
  const STATUS_OPTS=[{id:'all',label:'All'},{id:'active',label:'Active'},{id:'inactive',label:'Inactive'},{id:'wip',label:'🚧 Under construction'}];

  function _closeDropdown(){
    _openDropdown=null;
    dropdownPanel.style.display='none';
    dropdownPanel.innerHTML='';
    filterRow.querySelectorAll('.pill').forEach(p=>p.classList.remove('dropdown-open'));
  }

  function _openDrop(key,pills,onSelect){
    if(_openDropdown===key){_closeDropdown();return;}
    _closeDropdown();
    _openDropdown=key;
    dropdownPanel.style.display='flex';
    dropdownPanel.innerHTML='';
    pills.forEach(opt=>{
      const p=document.createElement('span');
      p.className='pill'+(opt.active?' active':'');
      p.style.cssText='cursor:pointer;font-size:10px;flex-shrink:0';
      p.textContent=opt.label;
      p.addEventListener('click',()=>{onSelect(opt);_closeDropdown();});
      dropdownPanel.appendChild(p);
    });
    filterRow.querySelectorAll('[data-drop="'+key+'"]').forEach(p=>p.classList.add('dropdown-open'));
  }

  function renderFilterRow(){
    // ── Ligne 1 : grandes pills Spheres / Themes ─────────────────
    typeRow.innerHTML='';
    const isThemeLike=_listType==='themes'||_listType==='photo'||_listType==='video';
    TYPE_MAIN.forEach(opt=>{
      const active=(opt.id==='spheres'&&!isThemeLike)||(opt.id==='themes'&&isThemeLike);
      const p=document.createElement('span');
      p.style.cssText='flex:1;text-align:center;padding:8px 0;font-size:12px;font-weight:600;border-radius:8px;cursor:pointer;transition:all .15s;letter-spacing:.02em;'+(active?'background:rgba(232,160,32,.15);border:1px solid rgba(232,160,32,.35);color:var(--accent,#f0a830)':'background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:rgba(255,255,255,.35)');
      p.textContent=opt.label;
      p.addEventListener('click',()=>{
        if(_listType===opt.id)return;
        _listType=opt.id;searchInput.value='';_filterText='';_themeSearch='';
        _filterCat='';_filterActive=false;_listShowWip=false;
        renderFilterRow();switchType();
      });
      typeRow.appendChild(p);
    });

    // ── Ligne 2 : pills secondaires ───────────────────────────────
    filterRow.innerHTML='';
    const curCat=_filterCat||'All';
    const curStatus=_listShowWip?'wip':(_filterActive?'active':(_filterInactive?'inactive':'all'));

    // Si themes : Photo + Video pills
    if(isThemeLike){
      TYPE_THEME_EXTRA.forEach(opt=>{
        const p=document.createElement('span');
        p.className='pill'+(_listType===opt.id?' active':'');
        p.style.cssText='cursor:pointer;font-size:10px;flex-shrink:0';
        p.textContent=opt.label;
        p.addEventListener('click',()=>{
          _listType=(_listType===opt.id?'themes':opt.id);
          renderFilterRow();switchType();
        });
        filterRow.appendChild(p);
      });
    }

    // Category pill (spheres only)
    if(_listType==='spheres'){
      // Near/Contacts pills added first when socialFilters
      if(_listCfg.socialFilters){
        [{id:'near',label:'⊙ Near'},{id:'contacts',label:'◈ Contacts'}].forEach(function(opt){
          const isActive=_filterSocial===opt.id;
          const p=document.createElement('span');
          p.className='pill'+(isActive?' active':'');
          p.style.cssText='cursor:pointer;font-size:10px;flex-shrink:0';
          p.textContent=opt.label;
          p.addEventListener('click',function(){
            _filterSocial=isActive?null:opt.id;
            renderFilterRow();renderList(content);
          });
          filterRow.appendChild(p);
        });
      }
      // Category pill always shown for spheres
      const cPill=document.createElement('span');
      cPill.className='pill'+(curCat!=='All'?' active':'');
      cPill.dataset.drop='cat';
      cPill.style.cssText='cursor:pointer;font-size:10px;flex-shrink:0';
      cPill.textContent=(curCat==='All'?'Category':'⬡ '+curCat)+' ▾';
      cPill.addEventListener('click',()=>{
        _openDrop('cat',CAT_OPTS.map(c=>({id:c,label:c,active:c===curCat})),opt=>{
          _filterCat=opt.id==='All'?'':opt.id;
          _listPage=0;renderFilterRow();renderList(content);
        });
      });
      filterRow.appendChild(cPill);
    }

    // Status pill — themes: only Published/WIP; spheres: full STATUS_OPTS
    if(isThemeLike){
      const THEME_STATUS=[{id:'all',label:'All'},{id:'published',label:'Published'},{id:'wip',label:'🚧 Under construction'}];
      const tStatus=_listShowWip?'wip':'all';
      const tPill=document.createElement('span');
      tPill.className='pill'+(tStatus!=='all'?' active':'');
      tPill.dataset.drop='tstatus';
      tPill.style.cssText='cursor:pointer;font-size:10px;flex-shrink:0';
      tPill.textContent=(tStatus==='all'?'Status':THEME_STATUS.find(s=>s.id===tStatus)?.label||'Status')+' ▾';
      tPill.addEventListener('click',()=>{
        _openDrop('tstatus',THEME_STATUS.map(s=>({...s,active:s.id===tStatus})),opt=>{
          _listShowWip=opt.id==='wip';
          _listPage=0;renderFilterRow();
          const cu=localStorage.getItem('ym_theme_url')||'';
          _renderThemeCards(content,cu,'https://github.com/',_themesList);
        });
      });
      filterRow.appendChild(tPill);
      return;
    }
    const statusOpts=STATUS_OPTS;
    const sPill=document.createElement('span');
    sPill.className='pill'+(curStatus!=='all'?' active':'');
    sPill.dataset.drop='status';
    sPill.style.cssText='cursor:pointer;font-size:10px;flex-shrink:0';
    sPill.textContent=(curStatus==='all'?'Status':statusOpts.find(s=>s.id===curStatus)?.label||'Status')+' ▾';
    sPill.addEventListener('click',()=>{
      _openDrop('status',statusOpts.map(s=>({...s,active:s.id===curStatus})),opt=>{
        _filterActive=opt.id==='active';
        _filterInactive=opt.id==='inactive';
        _listShowWip=opt.id==='wip';
        if(opt.id!=='wip'){}
        if(opt.id==='all'){_filterActive=false;_filterInactive=false;_listShowWip=false;}
        _listPage=0;renderFilterRow();
        if(_listType==='spheres')renderList(content);
        else{const cu=localStorage.getItem('ym_theme_url')||'';_renderThemeCards(content,cu,'https://github.com/',_themesList);}
      });
    });
    filterRow.appendChild(sPill);
  }

  function buildWipToggle(){
    // WIP now handled by Status dropdown pill — keep empty for compatibility
    wipRow.style.display='none';
  }

  function switchType(){
    content.innerHTML='';
    _filterCat='';_filterActive=false;_filterInactive=false;_listShowWip=false;
    _closeDropdown();
    buildWipToggle();
    renderFilterRow();
    if(_listType==='spheres')renderSpheresContent(content,null);
    else if(_listType==='themes')renderThemesContent(content,null);
    else if(_listType==='photo')renderPhotoContent(content);
    else if(_listType==='video')renderVideoContent(content);
  }

  // YM_NAV_CONFIG.liste takes precedence over legacy YM_ZONE_CONFIG
  const _listCfg = window.YM_NAV_CONFIG?.liste || window.YM_ZONE_CONFIG || {};
  if(_listCfg.defaultType) _listType = _listCfg.defaultType;
  if(_listCfg.spheresOnly){
    _listType='spheres';
    if(!_listCfg.socialFilters) filterRow.style.display='none';
    dropdownPanel.style.display='none';
    wipRow.style.display='none';
  }

  if(!_loaded)await fetchSphereList();
  switchType();
}

const THEMES_FILES_URL = (window.YM_THEMES_OVERRIDE && window.YM_THEMES_OVERRIDE.url) || 'https://raw.githubusercontent.com/'+REPO_OWNER+'/'+REPO_NAME+'/'+REPO_BRANCH+'/themes-files.json';
let _themesList=null,_themesLoaded=false,_themeSearch='',_themeFilterCat='Theme';

const PLATFORMS=[
  {id:'bolt',       label:'Bolt',         icon:'⚡', hint:'ID ex: sb1-abc123',
   resolve:id=>'https://stackblitz.com/edit/'+id+'?embed=1&view=preview'},
  {id:'replit',     label:'Replit',        icon:'🔁', hint:'@user/repl-name',
   resolve:id=>{const m=id.match(/^@?([\w-]+)\/([\w-]+)$/);return m?'https://'+m[2]+'.'+m[1]+'.repl.co':'https://replit.com/'+id;}},
  {id:'codesandbox',label:'CodeSandbox',   icon:'📦', hint:'ID ex: r3f-game-abc123',
   resolve:id=>'https://codesandbox.io/embed/'+id+'?fontsize=14&hidenavigation=1&theme=dark'},
  {id:'stackblitz', label:'StackBlitz',    icon:'⚡', hint:'ID ex: vitejs-vite-abc123',
   resolve:id=>'https://stackblitz.com/edit/'+id+'?embed=1&view=preview'},
  {id:'ghpages',    label:'GitHub Pages',  icon:'🐙', hint:'user/repo',
   resolve:id=>{const p=id.split('/');return'https://'+p[0]+'.github.io/'+(p.slice(1).join('/')||'')}},
  {id:'url',        label:'URL directe',   icon:'🌐', hint:'https://monapp.com',
   resolve:id=>(/^https?:\/\//i.test(id)?id:'https://'+id)},
];

let _selPlatform=null;

function _resolveExtURL(input){
  input=(input||'').trim();if(!input)return null;
  if(/^https?:\/\//i.test(input)&&!_selPlatform)return input;
  if(_selPlatform){const p=PLATFORMS.find(x=>x.id===_selPlatform);if(p)return p.resolve(input);}
  if(input.includes('stackblitz.com')||input.includes('bolt.new'))return input+'?embed=1&view=preview';
  if(input.includes('replit.com')||input.includes('.repl.co'))return input;
  if(input.includes('codesandbox.io'))return input.replace('/s/','/embed/');
  if(input.includes('github.io'))return input;
  if(/^@?[\w-]+\/[\w-]+$/.test(input)){const p2=input.split('/');return'https://'+p2[0].replace('@','')+'.github.io/'+p2[1];}
  if(/^[\w-]+$/.test(input))return'https://stackblitz.com/edit/'+input+'?embed=1&view=preview';
  return'https://'+input;
}

async function fetchThemesList(force){
  if(_themesList&&!force)return _themesList;
  try{
    const r=await fetch(THEMES_FILES_URL+'?t='+Date.now(),{cache:'no-store'});
    if(!r.ok)throw new Error('HTTP '+r.status+' — '+THEMES_FILES_URL);
    const data=await r.json();
    if(!Array.isArray(data))throw new Error('themes-files.json n\'est pas un tableau');
    _themesList=data;
    _themesLoaded=true;
    return _themesList;
  }catch(e){
    console.error('[YM] fetchThemesList failed:',e.message);
    window.YM_toast?.('Themes: '+e.message,'error');
    _themesList=[];_themesLoaded=true;return _themesList;
  }
}

async function renderThemesContent(container,catRow){
  const GH_BLOB_BASE='https://github.com/';
  const curThemeUrl=localStorage.getItem('ym_theme_url')||'';
  container.style.cssText='display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden';
  container.innerHTML=
    '<div id="theme-list-inner" style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:10px 16px;min-height:0">'+
      '<div style="color:var(--text3);font-size:12px;padding:8px 0">Chargement…</div>'+
    '</div>';
  _themeFilterCat='Theme';
  const themes=await fetchThemesList();
  _renderThemeCards(container,curThemeUrl,GH_BLOB_BASE,themes);
}

async function renderPhotoContent(container){
  const curThemeUrl=localStorage.getItem('ym_theme_url')||'';
  container.style.cssText='display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden';
  container.innerHTML='<div id="theme-list-inner" style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:10px 16px;min-height:0"><div style="color:var(--text3);font-size:12px;padding:8px 0">Chargement…</div></div>';
  _themeFilterCat='Photo';
  const themes=await fetchThemesList();
  _renderThemeCards(container,curThemeUrl,'https://github.com/',themes);
}

async function renderVideoContent(container){
  const curThemeUrl=localStorage.getItem('ym_theme_url')||'';
  container.style.cssText='display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden';
  container.innerHTML='<div id="theme-list-inner" style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:10px 16px;min-height:0"><div style="color:var(--text3);font-size:12px;padding:8px 0">Chargement…</div></div>';
  _themeFilterCat='Video';
  const themes=await fetchThemesList();
  _renderThemeCards(container,curThemeUrl,'https://github.com/',themes);
}

function _addThemeIcon(theme, rawUrl){
  if(!window.YM_Desk || !window.YM_Desk.addIcon) return;
  const id='theme_'+(theme.filename||theme.name||'theme').replace(/[^a-z0-9]/gi,'_');
  const label=theme.name||(theme.filename||'').replace(/\.theme\.html$/,'').replace(/[-_]/g,' ');
  const icon=theme.icon||'🎨';
  const page=window._deskCurPage||0;
  window.YM_Desk.addIcon(id, icon, label, page, {type:'theme', themeUrl:rawUrl});
}

let _themeActivating=false;

function _renderThemeCards(container,curThemeUrl,GH_BLOB_BASE,themes){
  const listEl=container.querySelector('#theme-list-inner');if(!listEl)return;
  const list=themes||_themesList||[];

  let filtered=list;
  // Active theme always first
  filtered = [...filtered].sort((a,b)=>{
    const au=(a.codeUrl||('https://raw.githubusercontent.com/'+REPO_OWNER+'/'+REPO_NAME+'/'+REPO_BRANCH+'/'+a.filename));
    const bu=(b.codeUrl||('https://raw.githubusercontent.com/'+REPO_OWNER+'/'+REPO_NAME+'/'+REPO_BRANCH+'/'+b.filename));
    return (bu===curThemeUrl?1:0)-(au===curThemeUrl?1:0);
  });
  if(_themeSearch)filtered=filtered.filter(t=>
    (t.name||'').toLowerCase().includes(_themeSearch)||
    (t.description||'').toLowerCase().includes(_themeSearch)||
    (t.ghAuthor||'').toLowerCase().includes(_themeSearch)
  );

  if(!filtered.length){
    listEl.innerHTML='<div style="color:var(--text3);font-size:11px;padding:8px 0;line-height:1.8">'+(list.length?'Aucun résultat.':'Aucun thème dans <a href="'+THEMES_FILES_URL+'" target="_blank" rel="noopener" style="color:var(--cyan);font-size:10px">themes-files.json ↗</a>')+'</div>';
    return;
  }

  listEl.innerHTML='';

  if(_themeFilterCat==='Photo'){
    const grid=document.createElement('div');
    grid.style.cssText='display:grid;grid-template-columns:repeat(2,1fr);gap:6px';
    let hasPhotos=false;
    filtered.forEach(t=>{
      const photos=(t.media&&t.media.photos)||[];
      photos.forEach(url=>{
        hasPhotos=true;
        const wrap=document.createElement('div');
        wrap.style.cssText='position:relative;cursor:pointer;border-radius:8px;overflow:hidden;aspect-ratio:16/9;background:#111';
        wrap.innerHTML='<img src="'+esc(url)+'" style="width:100%;height:100%;object-fit:cover;display:block" loading="lazy">'+
          '<div style="position:absolute;bottom:0;left:0;right:0;padding:4px 6px;background:linear-gradient(transparent,rgba(0,0,0,.7));font-size:9px;color:#fff">'+esc(t.name||'')+'</div>';
        wrap.addEventListener('click',()=>{
          localStorage.setItem('ym_wallpaper',url);
          window.YM_toast?.('Thème + photo — rechargement…','success');
          window.YM?.setTheme(t.codeUrl||'');
        });
        grid.appendChild(wrap);
      });
    });
    if(hasPhotos) listEl.appendChild(grid);
    else listEl.innerHTML='<div style="color:var(--text3);font-size:11px;padding:8px 0">Aucune photo dans ces thèmes.</div>';
    return;
  }

  if(_themeFilterCat==='Video'){
    let hasVideos=false;
    filtered.forEach(t=>{
      const videos=(t.media&&t.media.videos)||[];
      if(!videos.length)return;
      hasVideos=true;
      const section=document.createElement('div');
      section.style.cssText='margin-bottom:10px';
      section.innerHTML='<div style="font-size:10px;font-weight:700;color:var(--accent);margin-bottom:6px">'+esc(t.name||'')+'</div>';
      videos.forEach(url=>{
        const a=document.createElement('a');
        a.href=url;a.target='_blank';a.rel='noopener';
        a.style.cssText='display:flex;align-items:center;gap:8px;padding:6px 10px;border:1px solid rgba(8,224,248,.2);border-radius:8px;text-decoration:none;margin-bottom:4px;color:var(--cyan);font-size:11px';
        a.innerHTML='▶ '+esc(url.replace(/^https?:\/\//,'').split('/')[0]);
        section.appendChild(a);
      });
      listEl.appendChild(section);
    });
    if(!hasVideos) listEl.innerHTML='<div style="color:var(--text3);font-size:11px;padding:8px 0">Aucune vidéo dans ces thèmes.</div>';
    return;
  }

  // ── THEME CARDS with inline action bar ──────────────────────────────────
  let _openThemeCard = null; // track which card is expanded

  filtered.forEach(t=>{
    const rawUrl=t.codeUrl||('https://raw.githubusercontent.com/'+t.ghAuthor+'/'+REPO_NAME+'/'+REPO_BRANCH+'/src/themes/'+(t.filename||t.name+'.html'));
    const isCur=curThemeUrl===rawUrl;
    const ghCodeUrl=t.codeUrl?t.codeUrl.replace('https://raw.githubusercontent.com/','https://github.com/').replace('/'+REPO_BRANCH+'/','/blob/'+REPO_BRANCH+'/'):null;
    const siteUrl=t.siteUrl||ghCodeUrl||null;
    const iconIsUrl=t.icon&&(t.icon.startsWith('http')||t.icon.startsWith('/'));
    const iconHtml=iconIsUrl
      ?'<img src="'+esc(t.icon)+'" style="width:40px;height:40px;object-fit:cover;border-radius:8px;flex-shrink:0">'
      :'<div style="width:40px;height:40px;border-radius:8px;background:rgba(255,255,255,.04);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">'+(t.icon||'🎨')+'</div>';

    const card=document.createElement('div');
    card.className='ym-card';
    card.style.cssText='cursor:pointer;transition:border-color .2s'+(isCur?';border-color:var(--accent-dim)':'');

    const infoHtml=
      '<div style="display:flex;align-items:center;gap:12px">'+
        iconHtml+
        '<div style="flex:1;min-width:0">'+
          '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;flex-wrap:wrap">'+
            '<div style="font-weight:600;font-size:14px;color:var(--text)">'+esc(t.name||t.filename||'?')+'</div>'+
            (t.wip?'<span style="font-size:9px;color:#f0a830;padding:1px 5px;border:1px solid rgba(240,168,48,.3);border-radius:4px">🚧 WIP</span>':'')+
            (isCur?'<span style="font-size:9px;color:#22d3ee;padding:1px 5px;border:1px solid rgba(34,211,238,.3);border-radius:4px">✓ actif</span>':'')+
          '</div>'+
          '<div style="font-size:9px;color:var(--text3);margin-bottom:4px">by <b style="color:var(--accent)">@'+esc(t.ghAuthor||'unknown')+'</b></div>'+
          '<div style="font-size:12px;color:var(--text2);line-height:1.4">'+esc(t.description||'—')+'</div>'+
        '</div>'+
        '<div style="font-size:18px;color:var(--text3);flex-shrink:0;transition:transform .2s" data-chevron>›</div>'+
      '</div>';

    card.innerHTML=infoHtml;

    // action bar (hidden initially)
    const bar=_makeActionBar([
      {icon:'↗', label:'Share', style:BTN_GHOST, id:'share', onClick:()=>{
        const slug=(t.filename||t.name||'').replace('.theme.html','.theme').replace('.html','.theme');
        const u=location.origin+'/'+slug;
        if(navigator.share){navigator.share({title:t.name,url:u}).catch(()=>{});}
        else{navigator.clipboard?.writeText(u);window.YM_toast?.('URL copiée','success');}
      }},
      {icon:'</>',label:'Code', style:BTN_CYAN, id:'code', onClick:()=>{
        if(ghCodeUrl)window.open(ghCodeUrl,'_blank','noopener');
        else window.YM_toast?.('Pas de lien code disponible','info');
      }},
      {icon:'▶', label:isCur?'Actif':'Activer', style:isCur?BTN_GHOST:BTN_ACCENT, id:'activate', onClick:async(btn)=>{
        if(isCur){window.YM_toast?.('Déjà actif','info');return;}
        if(_themeActivating)return;
        _themeActivating=true;
        btn.textContent='…';
        window.YM?.setTheme(rawUrl);window.YM_toast?.('Thème — rechargement…','success');
      }},
      {icon:'⊞', label:'Bureau', style:BTN_GHOST, id:'desk', onClick:()=>{
        _addThemeIcon(t,rawUrl);
        window.YM_toast?.('Icône ajoutée au bureau','success');
      }},
    ]);
    bar.style.display='none';
    card.appendChild(bar);

    card.addEventListener('click',e=>{
      if(e.target.closest('a')||e.target.closest('button'))return;
      const isOpen=bar.style.display!=='none';
      // close previously open card
      if(_openThemeCard&&_openThemeCard!==card){
        const prevBar=_openThemeCard.querySelector('[data-action-bar]');
        if(prevBar)prevBar.style.display='none';
        const prevChev=_openThemeCard.querySelector('[data-chevron]');
        if(prevChev){prevChev.style.transform='';prevChev.textContent='›';}
      }
      bar.style.display=isOpen?'none':'flex';
      bar.dataset.actionBar='1';
      const chev=card.querySelector('[data-chevron]');
      if(chev){chev.style.transform=isOpen?'':'rotate(90deg)';chev.textContent=isOpen?'›':'⌃';}
      _openThemeCard=isOpen?null:card;
    });

    listEl.appendChild(card);
  });
}

const STD_CATS=['Communication','Games','AI','Finance','Commerce','Social','Media','Search','Agent'];
function normCat(cat){return STD_CATS.includes(cat)?cat:'Autres';}

function renderLinkContent(container){
  container.style.cssText='display:flex;flex-direction:column;height:100%;overflow:hidden;padding:16px;gap:10px';

  let _mode='url';
  const tabs=document.createElement('div');
  tabs.style.cssText='display:flex;gap:4px';
  ['url','code'].forEach(m=>{
    const t=document.createElement('button');
    t.className='ym-btn '+(_mode===m?'ym-btn-accent':'ym-btn-ghost');
    t.style.cssText='font-size:10px;flex:1';
    t.textContent=m==='url'?'🔗 URL':'</> Code';
    t.onclick=()=>{_mode=m;renderMode();};
    tabs.appendChild(t);
  });
  container.appendChild(tabs);

  const body=document.createElement('div');
  body.style.cssText='display:flex;flex-direction:column;gap:10px;flex:1;min-height:0';
  container.appendChild(body);

  function setTabStyles(){
    tabs.querySelectorAll('button').forEach((t,i)=>{
      t.className='ym-btn '+((i===0&&_mode==='url')||(i===1&&_mode==='code')?'ym-btn-accent':'ym-btn-ghost');
    });
  }

  function detectType(url){
    if(url.endsWith('.js'))return 'sphere';
    if(url.endsWith('.html'))return 'theme';
    return null;
  }

  async function execAndActivate(code){
    const blob=new Blob([code],{type:'text/javascript'});
    const blobUrl=URL.createObjectURL(blob);
    const before=new Set(Object.keys(window.YM_S||{}));
    await new Promise((res,rej)=>{
      const s=document.createElement('script');s.src=blobUrl;
      s.onload=()=>{URL.revokeObjectURL(blobUrl);res();};
      s.onerror=()=>{URL.revokeObjectURL(blobUrl);rej(new Error('Erreur de syntaxe JS — vérifie la console'));};
      document.head.appendChild(s);
    });
    const newKey=Object.keys(window.YM_S||{}).find(k=>!before.has(k));
    if(!newKey)throw new Error('Aucune sphère enregistrée — le code doit faire window.YM_S[\'nom\']={}');
    const obj=window.YM_S[newKey];
    const missing=['name','icon','category','activate'].filter(f=>!obj[f]);
    if(missing.length)throw new Error('Champs manquants: '+missing.join(', '));
    if(!window.YM)throw new Error('Runtime YM non disponible');
    await window.YM.activateSphere(newKey,obj);
    window.YM_toast?.('⬡ '+obj.name+' activée','success');
  }

  function makeTypeToggle(initial,onChange){
    let cur=initial;
    const row=document.createElement('div');
    row.style.cssText='display:flex;gap:4px';
    ['sphere','theme'].forEach(t=>{
      const b=document.createElement('button');
      b.className='ym-btn '+(cur===t?'ym-btn-accent':'ym-btn-ghost');
      b.style.cssText='font-size:10px;flex:1';
      b.textContent=t==='sphere'?'⬡ Sphere':'🎨 Thème';
      b.onclick=()=>{
        cur=t;
        row.querySelectorAll('button').forEach((x,i)=>{
          x.className='ym-btn '+((i===0&&cur==='sphere')||(i===1&&cur==='theme')?'ym-btn-accent':'ym-btn-ghost');
        });
        onChange(cur,row);
      };
      row.appendChild(b);
    });
    row._getCur=()=>cur;
    row._setCur=(t)=>{
      cur=t;
      row.querySelectorAll('button').forEach((x,i)=>{
        x.className='ym-btn '+((i===0&&cur==='sphere')||(i===1&&cur==='theme')?'ym-btn-accent':'ym-btn-ghost');
      });
    };
    return row;
  }

  function renderMode(){
    setTabStyles();
    body.innerHTML='';
    if(_mode==='url'){
      const inp=document.createElement('input');
      inp.className='ym-input';
      inp.placeholder='https://… (.js → sphere, .html → thème)';
      inp.style.cssText='font-size:11px;width:100%;box-sizing:border-box';
      const hint=document.createElement('div');
      hint.style.cssText='font-size:10px;color:var(--text3);min-height:14px';
      const btn=document.createElement('button');
      btn.className='ym-btn ym-btn-accent';
      btn.style.cssText='font-size:12px;padding:8px;font-weight:700';
      btn.textContent='▶ Plug';
      body.appendChild(inp);body.appendChild(hint);body.appendChild(btn);

      inp.addEventListener('input',()=>{
        const v=inp.value.trim();
        const t=detectType(v);
        if(t==='sphere')hint.textContent='⬡ Sphere';
        else if(t==='theme')hint.textContent='🎨 Thème';
        else if(v)hint.textContent='Extension non reconnue — utilise .js ou .html';
        else hint.textContent='';
      });

      const doPlug=async()=>{
        const url=inp.value.trim();if(!url)return;
        if(!/^https?:\/\//i.test(url)){window.YM_toast?.('URL invalide','error');return;}
        const type=detectType(url);
        if(!type){window.YM_toast?.('Extension non reconnue — utilise .js ou .html','error');return;}
        btn.textContent='…';btn.disabled=true;
        try{
          if(type==='theme'){
            window.YM?.setTheme(url);window.YM_toast?.('Thème — rechargement…','success');
          }else{
            const r=await fetch(url+'?t='+Date.now(),{cache:'no-store'});
            if(!r.ok)throw new Error('Fetch échoué: HTTP '+r.status);
            await execAndActivate(await r.text());
            inp.value='';hint.textContent='';
          }
        }catch(e){window.YM_toast?.(e.message,'error');}
        btn.textContent='▶ Plug';btn.disabled=false;
      };
      btn.addEventListener('click',doPlug);
      inp.addEventListener('keydown',e=>{if(e.key==='Enter')doPlug();});

    }else{
      const typeRow=makeTypeToggle('sphere',()=>{});
      const ta=document.createElement('textarea');
      ta.className='ym-input';
      ta.placeholder='Colle ton code ici…';
      ta.style.cssText='font-size:10px;font-family:monospace;flex:1;min-height:120px;resize:none;width:100%;box-sizing:border-box';
      const codeHint=document.createElement('div');
      codeHint.style.cssText='font-size:10px;color:var(--text3);min-height:14px';
      const btn=document.createElement('button');
      btn.className='ym-btn ym-btn-accent';
      btn.style.cssText='font-size:12px;padding:8px;font-weight:700';
      btn.textContent='▶ Plug';
      body.appendChild(typeRow);body.appendChild(ta);body.appendChild(codeHint);body.appendChild(btn);

      function detectCodeType(code){
        const s=code.trimStart();
        if(s.includes('window.YM_S['))return 'sphere';
        if(s.includes('window.YM_THEME_META')||s.startsWith('<'))return 'theme';
        return null;
      }
      ta.addEventListener('input',()=>{
        const t=detectCodeType(ta.value);
        if(t){typeRow._setCur(t);codeHint.textContent=t==='sphere'?'⬡ Sphere détectée':'🎨 Thème détecté';}
        else{codeHint.textContent='';}
      });

      btn.addEventListener('click',async()=>{
        const code=ta.value.trim();if(!code)return;
        btn.textContent='…';btn.disabled=true;
        try{
          if(typeRow._getCur()==='theme'){
            const blob=new Blob([code],{type:'text/html'});
            const blobUrl=URL.createObjectURL(blob);
            window.YM?.setTheme(blobUrl);window.YM_toast?.('Thème — rechargement…','success');
          }else{
            await execAndActivate(code);
            ta.value='';
          }
        }catch(e){window.YM_toast?.(e.message,'error');}
        btn.textContent='▶ Plug';btn.disabled=false;
      });
    }
  }
  renderMode();
}

function renderSpheresContent(container,catRow){
  container.style.cssText='display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden';
  container.innerHTML=
    '<div id="sphere-list-inner" style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:10px 16px;min-height:0">'+
      '<div style="color:var(--text3);font-size:12px;padding:8px 0">Chargement…</div>'+
    '</div>';

  if(catRow){
    const FIXED_CATS=['Communication','Games','AI','Finance','Commerce','Social','Media','Search','Agent','Autres'];
    function renderCatPills(){
      catRow.innerHTML='';
      if(_listCfg.socialFilters){
        [{id:'near',label:'Near'},{id:'contacts',label:'Contacts'}].forEach(opt=>{
          const isActive=_filterSocial===opt.id;
          const p=document.createElement('span');
          p.className='pill'+(isActive?' active':'');
          p.style.cssText='cursor:pointer;font-size:10px;flex-shrink:0';
          p.textContent=opt.label;
          p.addEventListener('click',()=>{
            _filterSocial=isActive?null:opt.id;
            renderCatPills();renderList(container);
          });
          catRow.appendChild(p);
        });
      }else{
        ['Tous','Actifs',...FIXED_CATS].forEach(c=>{
          const isActive=c==='Tous'?(!_filterCat&&!_filterActive):c==='Actifs'?_filterActive:(!_filterActive&&_filterCat===c);
          const p=document.createElement('span');
          p.className='pill'+(isActive?' active':'');
          p.style.cssText='cursor:pointer;font-size:10px;flex-shrink:0';
          p.textContent=c;
          p.addEventListener('click',()=>{
            if(c==='Tous'){_filterCat='';_filterActive=false;}
            else if(c==='Actifs'){_filterActive=!_filterActive;_filterCat='';}
            else{_filterCat=c;_filterActive=false;}
            renderCatPills();renderList(container);
          });
          catRow.appendChild(p);
        });
      }
    }
    renderCatPills();
  }

  renderList(container);
  // Guard against parallel fetches — only one at a time
  if(!window._ymListeFetching){
    window._ymListeFetching=true;
    fetchSphereList().then(()=>{
      window._ymListeFetching=false;
      // Re-render only if container still in DOM
      if(document.body.contains(container))renderList(container);
    }).catch(()=>{window._ymListeFetching=false;});
  }
}

function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

function _updateCardInPlace(card,sphere,active){
  const nameLine=card.querySelector('[data-name-line]');
  if(nameLine){
    const badge=nameLine.querySelector('.pill');
    if(active&&!badge){
      const b=document.createElement('span');b.className='pill active';b.textContent='active';nameLine.appendChild(b);
    }else if(!active&&badge)badge.remove();
  }
  // close bar so it rebuilds fresh on next open
  const openBar=card.querySelector('[data-bar-el]');
  if(openBar){openBar.style.display='none';}
  const chev=card.querySelector('[data-chevron]');
  if(chev){chev.style.transform='';chev.textContent='›';}
}

function _buildSphereActionBar(sphere, isActive, card, getOpen, setOpen){
  const ghAuthorUrl='https://github.com/'+(sphere.ghAuthor||REPO_OWNER)+'/'+REPO_NAME+'/blob/'+REPO_BRANCH+'/'+sphere.fileName;
  const siteUrl=sphere.siteUrl||null;
  const bar=_makeActionBar([
    {icon:'↗',label:'Share',style:BTN_GHOST,id:'share',onClick:()=>{
      const slug=sphere.fileName.replace('.sphere.js','.sphere');
      const u=location.origin+'/'+slug;
      if(navigator.share){navigator.share({title:sphere.name,url:u}).catch(()=>{});}
      else{navigator.clipboard?.writeText(u);window.YM_toast?.('URL copiée','success');}
    }},
    {icon:'</>',label:'Code',style:BTN_CYAN,id:'code',onClick:()=>{window.open(ghAuthorUrl,'_blank','noopener');}},
    ...(isActive && !MANDATORY_SPHERES.includes(sphere.fileName) ? [{icon:'◼',label:'Off',style:BTN_DANGER,id:'activate',onClick:async(btn)=>{
      btn.innerHTML='…';btn.style.pointerEvents='none';
      await deactivateSphere(sphere);
      // app.js handles re-render with scroll preservation
    }}] : !isActive ? [{icon:'▶',label:'Activer',style:BTN_ACCENT,id:'activate',onClick:async(btn)=>{
      btn.innerHTML='…';btn.style.pointerEvents='none';
      card.style.opacity='.6';
      // Validate before activating — check required fields
      try {
        const _scrollElOn=document.getElementById('sphere-list-inner');
        const _scrollOn=_scrollElOn?.scrollTop||0;
        await activateSphere(sphere);
        card.style.opacity='1';
        const _lbOn=document.getElementById('list-content');
        if(_lbOn){
          renderList(_lbOn);
          // Re-fetch metas in background to get fresh icons/descriptions
          if(!window._ymListeFetching){
            window._ymListeFetching=true;
            fetchSphereList().then(()=>{
              window._ymListeFetching=false;
              if(document.body.contains(_lbOn)) renderList(_lbOn);
              requestAnimationFrame(()=>{ if(_scrollElOn) _scrollElOn.scrollTop=_scrollOn; });
            }).catch(()=>{window._ymListeFetching=false;});
          }
          requestAnimationFrame(()=>{ if(_scrollElOn) _scrollElOn.scrollTop=_scrollOn; });
        }
      } catch(e) {
        card.style.opacity='1';
        btn.innerHTML='▶';btn.style.pointerEvents='';
        window.YM_toast?.('Activation error: '+e.message,'error');
      }
    }}] : []),
  ]);
  bar.dataset.barEl='1';
  bar.style.display='none';
  return bar;
}

function renderList(body){
  const listEl=body.querySelector('#sphere-list-inner');if(!listEl)return;
  if(!_sphereList.length){listEl.innerHTML='<div style="color:var(--text3);font-size:12px;padding:8px 0">No spheres published yet.</div>';return;}

  let filtered=_sphereList;
  if(_filterText)filtered=filtered.filter(s=>(s.name||'').toLowerCase().includes(_filterText)||(s.description||'').toLowerCase().includes(_filterText)||(s.ghAuthor||'').toLowerCase().includes(_filterText)||(s.category||'').toLowerCase().includes(_filterText));
  if(_filterCat)filtered=filtered.filter(s=>normCat(s.category||'')===_filterCat||(_filterCat==='Autres'&&!STD_CATS.includes(s.category||'')));
  if(_filterActive)filtered=filtered.filter(s=>isSphereActive(s.fileName));
  if(_filterInactive)filtered=filtered.filter(s=>!isSphereActive(s.fileName));
  if(_listShowWip)filtered=filtered.filter(s=>s.wip);
  if(_filterSocial==='near'){
    const near=window._ymNearSpheres;
    if(!near||!near.size){listEl.innerHTML='<div style="color:var(--text3);font-size:12px;padding:16px 0;text-align:center">No nearby peers detected.</div>';return;}
    filtered=filtered.filter(s=>near.has(s.fileName));
  }
  if(_filterSocial==='contacts'){
    const contactSpheres=new Set();
    try{const p=JSON.parse(localStorage.getItem('ym_profile_v1')||'{}');(p.contacts||[]).forEach(c=>(c.spheres||[]).forEach(s=>contactSpheres.add(s)));}catch{}
    if(!contactSpheres.size){listEl.innerHTML='<div style="color:var(--text3);font-size:12px;padding:16px 0;text-align:center">No contacts with shared spheres.</div>';return;}
    filtered=filtered.filter(s=>contactSpheres.has(s.fileName));
  }
  if(!filtered.length){listEl.innerHTML='<div style="color:var(--text3);font-size:12px;padding:8px 0">No spheres found.</div>';return;}

  // Reset page on fresh render (search/filter change resets page)
  if(listEl.dataset.filtered!==JSON.stringify(filtered.map(s=>s.fileName))){
    _listPage=0;
    listEl.dataset.filtered=JSON.stringify(filtered.map(s=>s.fileName));
  }

  listEl.innerHTML='';

  let _openSphereCard = null; // track expanded card

  function rebuildBar(card, sphere, isActive){
    const oldBar=card.querySelector('[data-bar-el]');
    const wasOpen=oldBar&&oldBar.style.display!=='none';
    const newBar=_buildSphereActionBar(sphere,isActive,card,()=>_openSphereCard,(v)=>{_openSphereCard=v;});
    if(wasOpen){newBar.style.display='flex';_openSphereCard=card;}
    if(oldBar)oldBar.replaceWith(newBar);
    else card.appendChild(newBar);
  }

  function renderPage(page){
    const start=page*PAGE_SIZE;
    const slice=filtered.slice(start,start+PAGE_SIZE);
    slice.forEach(sphere=>{
    const active=isSphereActive(sphere.fileName);
    const ghAuthorUrl='https://github.com/'+(sphere.ghAuthor||REPO_OWNER)+'/'+REPO_NAME+'/blob/'+REPO_BRANCH+'/'+sphere.fileName;
    const siteUrl=sphere.siteUrl||null;
    const iconIsUrl=sphere.icon&&(sphere.icon.startsWith('http')||sphere.icon.startsWith('/'));
    const iconHtml=iconIsUrl?'<img src="'+sphere.icon+'" style="width:34px;height:34px;border-radius:6px;object-fit:contain">':'<span style="font-size:34px;line-height:1">'+sphere.icon+'</span>';
    const wipBadge=sphere.wip?'<span style="font-size:9px;color:#f0a830;padding:1px 5px;border:1px solid rgba(240,168,48,.3);border-radius:4px;line-height:1.6;flex-shrink:0">🚧 WIP</span>':'';

    const card=document.createElement('div');
    card.className='ym-card';
    card.dataset.sphere=sphere.fileName;
    card.style.cssText='cursor:pointer;transition:border-color .2s,opacity .2s'+(active?';border-color:var(--accent-dim)':'');

    card.innerHTML=
      '<div style="display:flex;align-items:center;gap:12px">'+
        '<div class="sphere-icon-el" style="flex-shrink:0;line-height:1">'+iconHtml+'</div>'+
        '<div style="flex:1;min-width:0">'+
          '<div data-name-line style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:3px">'+
            '<div class="sphere-name-el" style="font-weight:600;font-size:14px;color:var(--text)">'+esc(sphere.name)+'</div>'+
            (active?'<span class="pill active">active</span>':'')+
            wipBadge+
          '</div>'+
          '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;flex-wrap:wrap">'+
            '<span style="font-size:10px;color:var(--text3)">'+esc(sphere.category)+'</span>'+
            '<span style="color:var(--text3);font-size:9px">·</span>'+
            '<span style="font-size:9px;color:var(--text3)">by <b style="color:var(--accent)">@'+esc(sphere.ghAuthor||'unknown')+'</b></span>'+
          '</div>'+
          '<div class="sphere-desc-el" style="font-size:12px;color:var(--text2);line-height:1.4">'+esc(sphere.description||'—')+'</div>'+
        '</div>'+
        '<div style="font-size:18px;color:var(--text3);flex-shrink:0;transition:transform .2s" data-chevron>›</div>'+
      '</div>';

    // ── inline action bar ──
    const bar=_buildSphereActionBar(sphere,active,card,()=>_openSphereCard,(v)=>{_openSphereCard=v;});
    card.appendChild(bar);

    // click on card header toggles bar — use querySelector so it works after replaceChild
    card.addEventListener('click',e=>{
      if(e.target.closest('button')||e.target.closest('a'))return;
      const currentBar=card.querySelector('[data-bar-el]')||card.querySelector('[data-barEl="1"]')||card.querySelector('div[dataset]');
      // Find bar dynamically — works even after replaceChild
      const activeBarEl=Array.from(card.children).find(d=>d.dataset&&d.dataset.barEl==='1');
      if(!activeBarEl)return;
      const isOpen=activeBarEl.style.display!=='none';
      // close other open card
      if(_openSphereCard&&_openSphereCard!==card){
        const prevBars=_openSphereCard.querySelectorAll(':scope > div');
        prevBars.forEach(d=>{ if(d.dataset&&d.dataset.barEl) d.style.display='none'; });
        const prevChev=_openSphereCard.querySelector('[data-chevron]');
        if(prevChev){prevChev.style.transform='';prevChev.textContent='›';}
      }
      activeBarEl.style.display=isOpen?'none':'flex';
      const chev=card.querySelector('[data-chevron]');
      if(chev){chev.style.transform=isOpen?'':'rotate(90deg)';chev.textContent=isOpen?'›':'⌃';}
      _openSphereCard=isOpen?null:card;
    });

    listEl.appendChild(card);
    }); // end slice.forEach
  } // end renderPage

  // Render first page
  renderPage(_listPage);

  // Load more indicator
  if(filtered.length > PAGE_SIZE){
    const total=document.createElement('div');
    total.style.cssText='font-size:9px;color:var(--text3);text-align:center;padding:8px 0;font-family:var(--font-m)';
    total.id='crm-page-total';
    total.textContent='Showing '+(Math.min((_listPage+1)*PAGE_SIZE,filtered.length))+' of '+filtered.length;
    listEl.appendChild(total);

    // Sentinel for infinite scroll
    const sentinel=document.createElement('div');
    sentinel.id='list-scroll-sentinel';
    sentinel.style.cssText='height:1px;margin-top:4px';
    listEl.appendChild(sentinel);

    const obs=new IntersectionObserver(function(entries){
      if(!entries[0].isIntersecting)return;
      const nextStart=(_listPage+1)*PAGE_SIZE;
      if(nextStart>=filtered.length){obs.disconnect();return;}
      _listPage++;
      renderPage(_listPage);
      // Update total
      const tot=listEl.querySelector('#crm-page-total');
      if(tot)tot.textContent='Showing '+Math.min((_listPage+1)*PAGE_SIZE,filtered.length)+' of '+filtered.length;
      // Move sentinel to end
      listEl.appendChild(sentinel);
      listEl.appendChild(tot);
    },{root:listEl.closest('[style*="overflow"]')||null,threshold:0.1});
    obs.observe(sentinel);
  }
}

function _setInactive(fileName){setActiveSpheres(getActiveSpheres().filter(s=>s!==fileName));}

window.YM_Liste={render,renderList,fetchSphereList,activateSphereByName,isSphereActive,_setInactive,renderPlugContent:renderLinkContent,
  get _sphereList(){return _sphereList;},
  get _themesList(){return _themesList;},
  _forceRefresh(){_loaded=false;_sphereList=[];_fetchPromise=null;_themesList=null;_themesLoaded=false;},
  _searchAndOpen(term){_filterText=(term||'').toLowerCase();render();}
};

(async()=>{
  await fetchSphereList();
  const p=window.YM?.getProfile?.();
  const active=p?.spheres||[];
  if(active.length){
    for(const fileName of active){
      if(!isSphereActive(fileName)){
        const sphere=_sphereList.find(s=>s.fileName===fileName);
        if(sphere)setActiveSpheres([...getActiveSpheres(),fileName]);
      }
    }
  }
})();

})();
