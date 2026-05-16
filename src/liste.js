/* jshint esversion:11, -W033 */
// liste.js — YourMine Sphere List Manager
(function(){
'use strict';

const REPO_OWNER  = 'theodoreyong9';
const REPO_NAME   = 'YourMinedApp';
const REPO_BRANCH = 'main';
const RAW_BASE    = 'https://raw.githubusercontent.com/'+REPO_OWNER+'/'+REPO_NAME+'/'+REPO_BRANCH+'/';
// Les fichiers .sphere.js sont dans le fork de l'auteur, pas dans le repo principal
const FILES_JSON_URL = RAW_BASE+'files.json';

const CACHE_KEY = 'ym_liste_cache_v4';
const CACHE_TTL = 5 * 60 * 1000;

let _sphereList = [];
let _loaded     = false;
let _filterText   = '';
let _filterCat    = '';
let _filterActive = false;

function _readCache(){
  try{const raw=localStorage.getItem(CACHE_KEY);if(!raw)return null;const c=JSON.parse(raw);if(Date.now()-c.ts>CACHE_TTL)return null;return c;}catch{return null;}
}
function _writeCache(list){
  try{localStorage.setItem(CACHE_KEY,JSON.stringify({list,ts:Date.now()}));}catch{}
}

let _fetchPromise=null;
async function fetchSphereList(){
  if(_fetchPromise)return _fetchPromise;
  _fetchPromise=_doFetch().catch(e=>{_fetchPromise=null;throw e;}).finally(()=>{_fetchPromise=null;});
  return _fetchPromise;
}

async function _doFetch(){
  const cached=_readCache();
  let entries=[];
  try{
    const res=await fetch(FILES_JSON_URL+'?t='+Date.now(),{cache:'no-store'});
    if(!res.ok)throw new Error('HTTP '+res.status);
    const data=await res.json();
    entries=Array.isArray(data)?data:[];
  }catch(e){
    console.warn('[Liste] files.json fetch failed:',e.message);
    if(cached){_sphereList=cached.list;_loaded=true;return _sphereList;}
    _sphereList=[];_loaded=true;return _sphereList;
  }
  if(!entries.length){_sphereList=[];_loaded=true;_writeCache(_sphereList);return _sphereList;}
  const cachedMap={};
  if(cached)cached.list.forEach(s=>{cachedMap[s.fileName]=s;});
  _sphereList=await Promise.all(entries.map(async entry=>{
    const fileName=entry.filename;
    const url=RAW_BASE+fileName;
    const ghAuthor=entry.ghAuthor||entry.last_committer||'';
    const codeUrl=entry.codeUrl||(ghAuthor?'https://raw.githubusercontent.com/'+ghAuthor+'/'+REPO_NAME+'/'+REPO_BRANCH+'/'+fileName:null);
    if(cachedMap[fileName]){return{...cachedMap[fileName],ghAuthor,author:entry.author||'',score:entry.score||0,laps:entry.laps||0,merged_at:entry.merged_at||0,codeUrl:codeUrl||cachedMap[fileName].codeUrl||null};}
    const meta=await fetchSphereMeta(url,fileName,codeUrl);
    return{...meta,url,codeUrl,fileName,ghAuthor,author:entry.author||'',score:entry.score||0,laps:entry.laps||0,merged_at:entry.merged_at||0};
  }));
  _sphereList.sort(function(a,b){return (b.score||0)-(a.score||0);});
  _writeCache(_sphereList);
  _loaded=true;
  return _sphereList;
}

async function fetchSphereMeta(url,fileName,codeUrl){
  try{
    const fetchUrl=codeUrl||url;
    const res=await fetch(fetchUrl+'?t='+Date.now(),{cache:'no-store'});
    const code=await res.text();
    return{
      name:extractField(code,'name')||fileName.replace('.sphere.js',''),
      icon:extractField(code,'icon')||'⬡',
      category:extractField(code,'category')||'Other',
      description:extractField(code,'description')||'',
      fileName
    };
  }catch{return{name:fileName.replace('.sphere.js',''),icon:'⬡',category:'Other',description:'',fileName};}
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

const MANDATORY_SPHERES=['social.sphere.js','safety.sphere.js'];
function getActiveSpheres(){return JSON.parse(localStorage.getItem('ym_active_spheres')||'[]');}
function setActiveSpheres(arr){localStorage.setItem('ym_active_spheres',JSON.stringify(arr));}
function isSphereActive(fileName){return getActiveSpheres().includes(fileName);}

async function activateSphere(sphere){
  if(window.YM_sphereRegistry?.has(sphere.fileName))return;
  const active=getActiveSpheres();
  if(!active.includes(sphere.fileName)){active.push(sphere.fileName);setActiveSpheres(active);}
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

async function activateSphereByName(fileName){
  if(window.YM_sphereRegistry?.has(fileName))return;
  if(!_loaded)await fetchSphereList();
  const sphere=_sphereList.find(s=>s.fileName===fileName);
  if(sphere)await activateSphere(sphere);
  else console.warn('[Liste] sphere not found:',fileName);
}

// ── RENDER ───────────────────────────────────────────────────────────────────
let _currentBody=null;
let _listType='spheres';
let _listShowWip=false;

async function render(containerArg){
  const body=containerArg||_currentBody||document.getElementById('panel-spheres-body');
  if(!body)return;
  _currentBody=body;
  body.style.cssText='display:flex;flex-direction:column;height:100%;min-height:0;padding:0;overflow:hidden';

  body.innerHTML=
    '<div id="list-content" style="flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0"></div>'+
    '<div id="list-controls" style="padding:8px 12px 6px;border-top:1px solid rgba(232,160,32,.12);display:flex;flex-direction:column;gap:5px;flex-shrink:0;background:inherit">'+
      '<div id="list-type-pills" style="display:flex;gap:5px;flex-wrap:wrap"></div>'+
      '<input id="list-search" class="ym-input" placeholder="Search…" style="width:100%;font-size:10px;padding:4px 8px;box-sizing:border-box">'+

      '<div id="list-cat-row" style="display:flex;gap:4px;overflow-x:auto;flex-wrap:nowrap;-webkit-overflow-scrolling:touch;scrollbar-width:none;min-height:20px"></div>'+
      '<div id="list-wip-row" style="display:none"></div>'+
    '</div>';

  const content=body.querySelector('#list-content');
  const typePillsEl=body.querySelector('#list-type-pills');
  const catRow=body.querySelector('#list-cat-row');
  const wipRow=body.querySelector('#list-wip-row');
  const searchInput=body.querySelector('#list-search');

  searchInput.addEventListener('input',e=>{
    const v=e.target.value.toLowerCase();
    _filterText=v;_themeSearch=v;
    if(_listType==='spheres')renderList(content);
    else if(_listType==='themes'){const cu=localStorage.getItem('ym_theme_url')||'';_renderThemeCards(content,cu,'https://github.com/',_themesList);}
  });

  function renderTypePills(){
    typePillsEl.innerHTML='';
    [{id:'spheres',label:'⬡ Sphere'},{id:'themes',label:'🎨 Theme'},{id:'photo',label:'📷 Photo'},{id:'video',label:'🎥 Video'}].forEach(opt=>{
      const p=document.createElement('span');
      p.className='pill'+(_listType===opt.id?' active':'');
      p.style.cssText='cursor:pointer;font-size:10px;flex-shrink:0';
      p.textContent=opt.label;
      p.addEventListener('click',()=>{if(_listType===opt.id)return;_listType=opt.id;searchInput.value='';_filterText='';_themeSearch='';renderTypePills();switchType();});
      typePillsEl.appendChild(p);
    });
  }

  function switchType(){
    content.innerHTML='';catRow.innerHTML='';wipRow.innerHTML='';
    wipRow.style.display=_listType==='spheres'?'block':'none';
    if(_listType==='spheres')renderSpheresContent(content,catRow,wipRow);
    else if(_listType==='themes')renderThemesContent(content,catRow);
    else if(_listType==='photo')renderPhotoContent(content);
    else if(_listType==='video')renderVideoContent(content);
  }

  renderTypePills();
  if(!_loaded)await fetchSphereList();
  switchType();
}
// Themes registry : themes-files.json sur le repo PRINCIPAL (même logique que files.json pour spheres)
// themes-files.json est à la RACINE du repo principal (pas dans src/)
const THEMES_FILES_URL = 'https://raw.githubusercontent.com/'+REPO_OWNER+'/'+REPO_NAME+'/'+REPO_BRANCH+'/themes-files.json';
let _themesList=null,_themesLoaded=false,_themeSearch='',_themeFilterCat='Theme';

// Plateformes supportées pour apps externes
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
  // Auto-détection
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
  if(catRow){
    const inp=document.createElement('input');
    inp.className='ym-input';inp.id='theme-search';inp.placeholder='Search themes…';
    inp.style.cssText='flex:1;font-size:10px;padding:4px 8px;min-width:0';
    catRow.appendChild(inp);
    inp.addEventListener('input',e=>{_themeSearch=e.target.value.toLowerCase();_renderThemeCards(container,curThemeUrl,GH_BLOB_BASE,_themesList);});
  }
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
  // addIcon(id, icon, label, page, extraFields)
  window.YM_Desk.addIcon(id, icon, label, page, {type:'theme', themeUrl:rawUrl});
}

let _themeActivating=false;

function _renderThemeCards(container,curThemeUrl,GH_BLOB_BASE,themes){
  const listEl=container.querySelector('#theme-list-inner');if(!listEl)return;
  const list=themes||_themesList||[];

  // Recherche textuelle
  let filtered=list;
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

  // ── Vue PHOTO : grille de photos cliquables ────────────────────
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
          // Clic sur photo → applique le thème avec cette photo comme wallpaper
          localStorage.setItem('ym_theme_url',t.codeUrl||'');
          localStorage.setItem('ym_wallpaper',url);
          localStorage.removeItem('ym_theme_cache');
          window.YM_toast?.('Thème + photo — rechargement…','success');
          setTimeout(()=>location.reload(),1000);
        });
        grid.appendChild(wrap);
      });
    });
    if(hasPhotos) listEl.appendChild(grid);
    else listEl.innerHTML='<div style="color:var(--text3);font-size:11px;padding:8px 0">Aucune photo dans ces thèmes.</div>';
    return;
  }

  // ── Vue VIDEO : liste de liens vidéos ─────────────────────────
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

  // ── Vue THEME (défaut) et ALL : cartes normales ────────────────
  filtered.forEach(t=>{
    const rawUrl=t.codeUrl||('https://raw.githubusercontent.com/'+t.ghAuthor+'/'+REPO_NAME+'/'+REPO_BRANCH+'/src/themes/'+(t.filename||t.name+'.html'));
    const isCur=curThemeUrl===rawUrl;
    const ghCodeUrl=t.codeUrl?t.codeUrl.replace('https://raw.githubusercontent.com/','https://github.com/').replace('/'+REPO_BRANCH+'/','/blob/'+REPO_BRANCH+'/'):null;
    const iconIsUrl=t.icon&&(t.icon.startsWith('http')||t.icon.startsWith('/'));
    const iconHtml=iconIsUrl
      ?'<img src="'+esc(t.icon)+'" style="width:40px;height:40px;object-fit:cover;border-radius:8px;flex-shrink:0">'
      :'<div style="width:40px;height:40px;border-radius:8px;background:rgba(255,255,255,.04);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">'+(t.icon||'🎨')+'</div>';

    const card=document.createElement('div');
    card.className='ym-card';
    card.style.cssText='transition:border-color .2s'+(isCur?';border-color:var(--accent-dim)':'');
    card.innerHTML=
      '<div style="display:flex;align-items:center;gap:12px">'+
        iconHtml+
        '<div style="flex:1;min-width:0">'+
          '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;flex-wrap:wrap">'+
            '<div style="font-weight:600;font-size:14px;color:var(--text)">'+esc(t.name||t.filename||'?')+'</div>'+
            (t.wip?'<span style="font-size:9px;color:#f0a830;padding:1px 5px;border:1px solid rgba(240,168,48,.3);border-radius:4px">🚧 WIP</span>':'')+
          '</div>'+
          '<div style="font-size:9px;color:var(--text3);margin-bottom:3px">'+
            'by <b style="color:var(--accent)">@'+esc(t.ghAuthor||'unknown')+'</b>'+
            (ghCodeUrl?' &nbsp;·&nbsp; <a href="'+esc(ghCodeUrl)+'" target="_blank" rel="noopener" style="color:var(--cyan);text-decoration:none;font-size:9px" onclick="event.stopPropagation()">&lt;/&gt; code</a>':'')+
          '</div>'+
          '<div style="font-size:12px;color:var(--text2);line-height:1.4;margin-bottom:8px">'+esc(t.description||'—')+'</div>'+
          '<div style="display:flex;gap:6px">'+
            '<button class="ym-btn ym-btn-ghost" data-theme-icon-btn style="font-size:10px;padding:4px 9px">＋ Bureau</button>'+
            '<button class="ym-btn '+(isCur?'ym-btn-ghost':'ym-btn-accent')+'" data-theme-act-btn style="font-size:10px;padding:4px 10px">'+(isCur?'✓ Actif':'▶ Activer')+'</button>'+
          '</div>'+
        '</div>'+
      '</div>';

    card.querySelector('[data-theme-icon-btn]').addEventListener('click',e=>{
      e.stopPropagation();
      _addThemeIcon(t,rawUrl);
      window.YM_toast?.('Icône ajoutée au bureau','success');
    });
    card.querySelector('[data-theme-act-btn]').addEventListener('click',e=>{
      e.stopPropagation();
      if(isCur){window.YM_toast?.('Déjà actif','info');return;}
      if(_themeActivating)return;
      _themeActivating=true;
      localStorage.setItem('ym_theme_url',rawUrl);
      localStorage.removeItem('ym_theme_cache');
      window.YM_toast?.('Thème — rechargement…','success');
      setTimeout(()=>{if(window._YM_softReload)window._YM_softReload();else location.reload();},400);
    });
    listEl.appendChild(card);
  });
}

// Catégories standardisées — tout ce qui ne correspond pas → "Autres"
const STD_CATS=['Communication','Games','AI','Finance','Commerce','Social','Media','Search','Agent'];
function normCat(cat){return STD_CATS.includes(cat)?cat:'Autres';}

function renderLinkContent(container){
  container.style.cssText='display:flex;flex-direction:column;height:100%;overflow:hidden;padding:16px;gap:12px';

  // Section type
  let _linkType='sphere'; // 'sphere' | 'theme'
  const typeRow=document.createElement('div');
  typeRow.style.cssText='display:flex;gap:6px';
  ['sphere','theme'].forEach(t=>{
    const btn=document.createElement('button');
    btn.className='ym-btn '+(_linkType===t?'ym-btn-accent':'ym-btn-ghost');
    btn.style.cssText='font-size:10px;flex:1';
    btn.textContent=t==='sphere'?'⬡ Sphere':'🎨 Theme';
    btn.onclick=()=>{
      _linkType=t;
      typeRow.querySelectorAll('button').forEach((b,i)=>{
        b.className='ym-btn '+(i===(t==='sphere'?0:1)?'ym-btn-accent':'ym-btn-ghost');
      });
      updateHint();
    };
    typeRow.appendChild(btn);
  });
  container.appendChild(typeRow);

  // Platform pills
  const pillsWrap=document.createElement('div');
  pillsWrap.style.cssText='display:flex;gap:5px;flex-wrap:wrap';
  // GitHub Raw pill spécifique pour les .sphere.js et .theme.html
  const allPills=[
    {id:'ghraw', label:'GitHub Raw', icon:'🐙', hint:'user/repo/branch/file.sphere.js',
     resolve:id=>'https://raw.githubusercontent.com/'+id},
    ...PLATFORMS
  ];
  allPills.forEach(p=>{
    const pill=document.createElement('span');
    pill.className='pill'+(_selPlatform===p.id?' active':'');
    pill.style.cssText='cursor:pointer;font-size:10px';
    pill.textContent=p.icon+' '+p.label;
    pill.onclick=()=>{
      const was=pill.classList.contains('active');
      pillsWrap.querySelectorAll('.pill').forEach(x=>x.classList.remove('active'));
      _selPlatform=was?null:p.id;
      if(!was){pill.classList.add('active');inp.placeholder=p.hint;}
      else inp.placeholder='URL, raw GitHub, ID…';
      updateHint();inp.focus();
    };
    pillsWrap.appendChild(pill);
  });
  container.appendChild(pillsWrap);

  // Input + bouton
  const row=document.createElement('div');
  row.style.cssText='display:flex;gap:6px;align-items:center';
  const inp=document.createElement('input');
  inp.className='ym-input';
  inp.placeholder='URL, raw GitHub, ID…';
  inp.style.cssText='flex:1;font-size:11px';
  const btn=document.createElement('button');
  btn.className='ym-btn ym-btn-accent';
  btn.style.cssText='font-size:11px;padding:6px 14px;flex-shrink:0;font-weight:700';
  btn.textContent='▶';
  row.appendChild(inp);row.appendChild(btn);
  container.appendChild(row);

  const hint=document.createElement('div');
  hint.style.cssText='font-size:10px;color:var(--text3);min-height:14px';
  container.appendChild(hint);

  function resolveURL(input){
    input=(input||'').trim();if(!input)return null;
    if(_selPlatform){
      const p=allPills.find(x=>x.id===_selPlatform);
      if(p)return p.resolve(input);
    }
    if(/^https?:\/\//i.test(input))return input;
    // Détection auto
    if(input.includes('raw.githubusercontent.com'))return input;
    if(/^[\w-]+\/[\w-]+\/[\w-]+\/.+$/.test(input))return'https://raw.githubusercontent.com/'+input;
    if(input.includes('stackblitz.com')||input.includes('bolt.new'))return input+'?embed=1&view=preview';
    if(input.includes('replit.com')||input.includes('.repl.co'))return input;
    if(input.includes('codesandbox.io'))return input.replace('/s/','/embed/');
    if(/^@?[\w-]+\/[\w-]+$/.test(input)){const p2=input.split('/');return'https://'+p2[0].replace('@','')+'.github.io/'+p2[1];}
    if(/^[\w-]+$/.test(input))return'https://stackblitz.com/edit/'+input+'?embed=1&view=preview';
    return'https://'+input;
  }

  function updateHint(){
    const v=inp.value.trim();
    const resolved=v?resolveURL(v):null;
    hint.textContent=(resolved&&resolved!==v)?'→ '+resolved:'';
  }
  inp.addEventListener('input',updateHint);

  const doActivate=async()=>{
    const input=inp.value.trim();if(!input)return;
    const url=resolveURL(input);
    if(!url){window.YM_toast?.('URL invalide','error');return;}
    btn.textContent='…';btn.disabled=true;
    try{
      if(_linkType==='theme'){
        // Applique le thème
        let themeUrl=url.replace('https://github.com/','https://raw.githubusercontent.com/').replace('/blob/','/');
        localStorage.setItem('ym_theme_url',themeUrl);
        localStorage.removeItem('ym_theme_cache');
        window.YM_toast?.('Thème — rechargement…','success');
        setTimeout(()=>location.reload(),400);
      }else{
        // Charge comme sphère
        const isSphereJS=url.includes('.sphere.js')||url.includes('raw.githubusercontent.com');
        if(!isSphereJS){
          // App externe → iframe sphere
          const selP=_selPlatform?allPills.find(x=>x.id===_selPlatform):null;
          const sphereName=(selP?selP.label+' — ':'')+input.replace(/^https?:\/\//,'').split('/').slice(0,2).join('/');
          const sphereObj=await window.YM.loadSphereFromURL(url,sphereName);
          if(sphereObj&&window.YM){
            // Dispatch pour Safety
            window.dispatchEvent(new CustomEvent('ym:external-app-load',{detail:{url,name:sphereName}}));
            await window.YM.activateSphere(sphereName,sphereObj);
            inp.value='';hint.textContent='';
            window.YM_toast?.('App ajoutée : '+sphereName,'success');
          }else throw new Error('Impossible de charger');
        }else{
          // Sphère .sphere.js → exécution JS
          const r=await fetch(url+'?t='+Date.now(),{cache:'no-store'});
          if(!r.ok)throw new Error('HTTP '+r.status);
          const code=await r.text();
          const fname=url.split('/').pop().replace(/\?.*$/,'');
          const blob=new Blob([code],{type:'text/javascript'});
          const blobUrl=URL.createObjectURL(blob);
          // Garde le code source pour Safety
          if(sphereObj) sphereObj._sourceCode = code.slice(0, 500);
          await new Promise((res,rej)=>{
            const s=document.createElement('script');s.src=blobUrl;
            s.onload=()=>{URL.revokeObjectURL(blobUrl);res();};
            s.onerror=()=>{URL.revokeObjectURL(blobUrl);rej(new Error('exec failed'));};
            document.head.appendChild(s);
          });
          // Cherche dans YM_S
          let sphereObj=window.YM_S&&window.YM_S[fname];
          if(!sphereObj){
            const newKey=window.YM_S&&Object.keys(window.YM_S).find(k=>!window.YM_sphereRegistry?.has(k));
            if(newKey)sphereObj=window.YM_S[newKey];
          }
          if(sphereObj&&window.YM){
            const key=Object.keys(window.YM_S).find(k=>window.YM_S[k]===sphereObj)||fname;
            await window.YM.activateSphere(key,sphereObj);
            inp.value='';
            window.YM_toast?.('Sphere activée','success');
          }else throw new Error('Sphere non trouvée dans le code');
        }
      }
    }catch(e){window.YM_toast?.('Erreur: '+e.message,'error');}
    btn.textContent='▶';btn.disabled=false;
  };
  btn.addEventListener('click',doActivate);
  inp.addEventListener('keydown',e=>{if(e.key==='Enter')doActivate();});
}
function renderSpheresContent(container,catRow,wipRow){
  container.style.cssText='display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden';
  container.innerHTML=
    '<div id="sphere-list-inner" style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:10px 16px;min-height:0">'+
      '<div style="color:var(--text3);font-size:12px;padding:8px 0">Chargement…</div>'+
    '</div>';

  if(catRow){
    const FIXED_CATS=['Communication','Games','AI','Finance','Commerce','Social','Media','Search','Agent','Autres'];
    function renderCatPills(){
      catRow.innerHTML='';
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
    renderCatPills();
  }

  if(wipRow){
    const wipBtn=document.createElement('span');
    wipBtn.className='pill'+(_listShowWip?' active':'');
    wipBtn.style.cssText='cursor:pointer;font-size:10px';
    wipBtn.textContent='🚧 Under construction';
    wipBtn.addEventListener('click',()=>{_listShowWip=!_listShowWip;wipBtn.classList.toggle('active',_listShowWip);renderList(container);});
    wipRow.appendChild(wipBtn);
  }

  renderList(container);
  fetchSphereList().then(()=>renderList(container));
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
  const actionCell=card.querySelector('[data-action-cell]');
  if(actionCell){
    if(active&&!MANDATORY_SPHERES.includes(sphere.fileName)){
      actionCell.innerHTML='<button data-deactivate style="background:none;border:1px solid rgba(255,69,96,.3);color:var(--red);border-radius:6px;font-size:10px;padding:3px 7px;cursor:pointer;line-height:1.4">Off</button>';
      actionCell.querySelector('[data-deactivate]').addEventListener('click',async function(e){
        e.stopPropagation();this.textContent='…';this.style.pointerEvents='none';
        await deactivateSphere(sphere);
        _updateCardInPlace(card,sphere,false);
        card.style.borderColor='';
        window.dispatchEvent(new CustomEvent('ym:sphere-deactivated',{detail:{name:sphere.fileName}}));
      });
    }else if(!active){
      actionCell.innerHTML='<div style="font-size:20px;color:var(--text3)">›</div>';
    }
  }
  card.style.borderColor=active?'var(--accent-dim)':'';
}

function renderList(body){
  const listEl=body.querySelector('#sphere-list-inner');if(!listEl)return;
  if(!_sphereList.length){listEl.innerHTML='<div style="color:var(--text3);font-size:12px;padding:8px 0">No spheres published yet.</div>';return;}

  let filtered=_sphereList;
  if(_filterText)filtered=filtered.filter(s=>(s.name||'').toLowerCase().includes(_filterText)||(s.description||'').toLowerCase().includes(_filterText)||(s.ghAuthor||'').toLowerCase().includes(_filterText)||(s.category||'').toLowerCase().includes(_filterText));
  if(_filterCat)filtered=filtered.filter(s=>normCat(s.category||'')===_filterCat||(_filterCat==='Autres'&&!STD_CATS.includes(s.category||'')));
  if(_filterActive)filtered=filtered.filter(s=>isSphereActive(s.fileName));
  if(_listShowWip)filtered=filtered.filter(s=>s.wip);
  if(!filtered.length){listEl.innerHTML='<div style="color:var(--text3);font-size:12px;padding:8px 0">No spheres found.</div>';return;}

  listEl.innerHTML='';
  filtered.forEach(sphere=>{
    const active=isSphereActive(sphere.fileName);
    const iconIsUrl=sphere.icon&&(sphere.icon.startsWith('http')||sphere.icon.startsWith('/'));
    const iconHtml=iconIsUrl?'<img src="'+sphere.icon+'" style="width:34px;height:34px;border-radius:6px;object-fit:contain">':'<span style="font-size:34px;line-height:1">'+sphere.icon+'</span>';

    // URL dans le fork de l'auteur de la sphere (pas le repo principal)
    const ghAuthorUrl='https://github.com/'+(sphere.ghAuthor||REPO_OWNER)+'/'+REPO_NAME+'/blob/'+REPO_BRANCH+'/'+sphere.fileName;
    // Badge WIP
    const wipBadge=sphere.wip?'<span style="font-size:9px;color:#f0a830;padding:1px 5px;border:1px solid rgba(240,168,48,.3);border-radius:4px;line-height:1.6;flex-shrink:0">🚧 WIP</span>':'';

    const card=document.createElement('div');
    card.className='ym-card';
    card.style.cssText='cursor:pointer;transition:border-color .2s,opacity .2s'+(active?';border-color:var(--accent-dim)':'');

    card.innerHTML=
      '<div style="display:flex;align-items:center;gap:12px">'+
        '<div style="flex-shrink:0;line-height:1">'+iconHtml+'</div>'+
        '<div style="flex:1;min-width:0">'+
          '<div data-name-line style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:3px">'+
            '<div style="font-weight:600;font-size:14px;color:var(--text)">'+esc(sphere.name)+'</div>'+
            (active?'<span class="pill active">active</span>':'')+
            wipBadge+
          '</div>'+
          '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;flex-wrap:wrap">'+
            '<span style="font-size:10px;color:var(--text3)">'+esc(sphere.category)+'</span>'+
            '<span style="color:var(--text3);font-size:9px">·</span>'+
            '<span style="font-size:9px;color:var(--text3)">by <b style="color:var(--accent)">@'+esc(sphere.ghAuthor||'unknown')+'</b></span>'+
            '<a data-code-link href="'+ghAuthorUrl+'" target="_blank" rel="noopener" style="font-size:9px;color:var(--cyan);padding:1px 5px;border:1px solid rgba(8,224,248,.3);border-radius:4px;line-height:1.6;flex-shrink:0;text-decoration:none">&lt;/&gt; code</a>'+
          '</div>'+
          '<div style="font-size:12px;color:var(--text2);line-height:1.4;margin-bottom:6px">'+esc(sphere.description||'—')+'</div>'+

        '</div>'+
        '<div data-action-cell style="display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0">'+
          (active&&!MANDATORY_SPHERES.includes(sphere.fileName) ? '<button data-deactivate style="background:none;border:1px solid rgba(255,69,96,.3);color:var(--red);border-radius:6px;font-size:10px;padding:3px 7px;cursor:pointer;line-height:1.4">Off</button>' : (active ? '<div style="font-size:14px;color:var(--text3)">✓</div>' : '<div style="font-size:20px;color:var(--text3)">›</div>'))+
        '</div>'+
      '</div>';

    // Bouton code → lien GitHub, stoppe la propagation
    const codeLink=card.querySelector('[data-code-link]');
    if(codeLink)codeLink.addEventListener('click',e=>e.stopPropagation());



    // Bouton désactivation — met à jour la carte IN-PLACE
    const deactivateBtn=card.querySelector('[data-deactivate]');
    if(deactivateBtn){
      deactivateBtn.addEventListener('click',async function(e){
        e.stopPropagation();
        this.textContent='…';this.style.pointerEvents='none';
        await deactivateSphere(sphere);
        _updateCardInPlace(card,sphere,false);
        window.dispatchEvent(new CustomEvent('ym:sphere-deactivated',{detail:{name:sphere.fileName}}));
      });
    }

    // Click sur carte : active ou ouvre — mise à jour IN-PLACE
    card.addEventListener('click',async()=>{
      if(isSphereActive(sphere.fileName)){
        window.YM?.openSpherePanel?.(sphere.fileName);
      }else{
        card.style.opacity='.5';card.style.pointerEvents='none';
        await activateSphere(sphere);
        card.style.opacity='1';card.style.pointerEvents='';
        const nowActive=isSphereActive(sphere.fileName);
        _updateCardInPlace(card,sphere,nowActive);
        window.dispatchEvent(new CustomEvent('ym:sphere-activated',{detail:{name:sphere.fileName}}));
      }
    });

    listEl.appendChild(card);
  });
}

function _setInactive(fileName){setActiveSpheres(getActiveSpheres().filter(s=>s!==fileName));}

window.YM_Liste={render,fetchSphereList,activateSphereByName,isSphereActive,_setInactive,renderPlugContent:renderLinkContent,
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
