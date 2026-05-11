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

const CACHE_KEY = 'ym_liste_cache_v3';
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

const MANDATORY_SPHERES=['social.sphere.js'];
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

// ── RENDER ────────────────────────────────────────────────────────────────────
let _currentBody=null;

async function render(containerArg){
  const body=containerArg||_currentBody||document.getElementById('panel-spheres-body');
  if(!body)return;
  _currentBody=body;
  body.style.cssText='display:flex;flex-direction:column;height:100%;min-height:0;padding:0;overflow:hidden';

  // Sous-onglets Sphères / Thèmes
  let _listTab=body._listTab||'spheres';

  body.innerHTML=
    // Contenu principal
    '<div id="list-content" style="flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0"></div>'+
    // Sous-onglets en bas
    '<div style="display:flex;border-top:1px solid rgba(232,160,32,.12);flex-shrink:0">'+
      '<div class="ym-tab'+(_listTab==='spheres'?' active':'')+'" data-ltab="spheres" style="flex:1;padding:10px 4px;font-size:10px;cursor:pointer">⬡ Spheres</div>'+
      '<div class="ym-tab'+(_listTab==='themes'?' active':'')+'" data-ltab="themes" style="flex:1;padding:10px 4px;font-size:10px;cursor:pointer">🎨 Themes</div>'+
    '</div>';

  const content=body.querySelector('#list-content');

  function switchListTab(tab){
    _listTab=tab;body._listTab=tab;
    body.querySelectorAll('[data-ltab]').forEach(t=>t.classList.toggle('active',t.dataset.ltab===tab));
    content.innerHTML='';
    if(tab==='spheres')renderSpheresContent(content);
    else renderThemesContent(content);
  }

  body.querySelectorAll('[data-ltab]').forEach(t=>{
    t.addEventListener('click',()=>switchListTab(t.dataset.ltab));
  });

  if(!_loaded)await fetchSphereList();

  if(_listTab==='spheres')renderSpheresContent(content);
  else renderThemesContent(content);
}

// Themes registry : themes-files.json sur le repo PRINCIPAL (même logique que files.json pour spheres)
const THEMES_FILES_URL='https://raw.githubusercontent.com/'+REPO_OWNER+'/'+REPO_NAME+'/'+REPO_BRANCH+'/themes-files.json';
let _themesList=null,_themesLoaded=false,_themeSearch='',_themeFilterCat='';

async function fetchThemesList(force){
  if(_themesList&&!force)return _themesList;
  try{
    const r=await fetch(THEMES_FILES_URL+'?t='+Date.now(),{cache:'no-store'});
    if(!r.ok)throw new Error();
    _themesList=await r.json();
    _themesLoaded=true;
    return _themesList;
  }catch{_themesList=[];_themesLoaded=true;return _themesList;}
}

async function renderThemesContent(container){
  const GH_BLOB_BASE='https://github.com/';
  const curThemeUrl=localStorage.getItem('ym_theme_url')||'';

  container.style.cssText='display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden';
  container.innerHTML=
    '<div id="theme-list-inner" style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:10px 16px;min-height:0">'+
      '<div style="color:var(--text3);font-size:12px;padding:8px 0">Chargement…</div>'+
    '</div>'+
    '<div style="padding:8px 16px;border-top:1px solid rgba(232,160,32,.12);display:flex;flex-direction:column;gap:6px;flex-shrink:0;background:inherit">'+
      '<div id="theme-cats" style="display:flex;flex-wrap:wrap;gap:4px"></div>'+
      '<div style="display:flex;gap:6px;align-items:center">'+
        '<input class="ym-input" id="theme-search" placeholder="Search themes…" style="flex:1;font-size:11px">'+
        '<button class="ym-btn ym-btn-ghost" id="theme-url-toggle" style="font-size:11px;padding:6px 8px;flex-shrink:0" title="Appliquer par URL">↗</button>'+
      '</div>'+
      '<div id="theme-url-row" style="display:none;gap:6px;align-items:center">'+
        '<input class="ym-input" id="theme-raw-input" placeholder="GitHub raw URL d\'un thème…" style="flex:1;font-size:11px">'+
        '<button class="ym-btn ym-btn-ghost" id="theme-raw-btn" style="font-size:11px;padding:6px 10px;flex-shrink:0">▶</button>'+
      '</div>'+
    '</div>';

  // Toggle URL row
  const urlToggle=container.querySelector('#theme-url-toggle');
  const urlRow=container.querySelector('#theme-url-row');
  if(urlToggle&&urlRow){
    urlToggle.addEventListener('click',()=>{
      const open=urlRow.style.display!=='none';
      urlRow.style.display=open?'none':'flex';
      urlToggle.style.color=open?'':'var(--cyan)';
    });
  }

  // Apply custom URL
  container.querySelector('#theme-raw-btn')?.addEventListener('click',()=>{
    const inp=container.querySelector('#theme-raw-input');
    let url=(inp?inp.value:'').trim();
    if(!url)return;
    url=url.replace('https://github.com/','https://raw.githubusercontent.com/').replace('/blob/','/');
    localStorage.setItem('ym_theme_url',url);localStorage.removeItem('ym_theme_cache');
    window.YM_toast?.('Thème — rechargement…','success');
    setTimeout(()=>location.reload(),1200);
  });

  // Pills types themes
  const themeCatsEl=container.querySelector('#theme-cats');
  if(themeCatsEl){
    ['All','Theme','Photo','Video'].forEach(c=>{
      const active=c==='All'?!_themeFilterCat:_themeFilterCat===c;
      const p=document.createElement('span');
      p.className='pill'+(active?' active':'');
      p.style.cssText='cursor:pointer;font-size:10px;flex-shrink:0';
      p.textContent=c;
      p.addEventListener('click',()=>{
        _themeFilterCat=c==='All'?'':c;
        themeCatsEl.querySelectorAll('.pill').forEach(x=>x.classList.toggle('active',x.textContent===c));
        _renderThemeCards(container,curThemeUrl,GH_BLOB_BASE);
      });
      themeCatsEl.appendChild(p);
    });
  }

  container.querySelector('#theme-search')?.addEventListener('input',e=>{
    _themeSearch=e.target.value.toLowerCase();
    _renderThemeCards(container,curThemeUrl,GH_BLOB_BASE);
  });

  const themes=await fetchThemesList();
  _renderThemeCards(container,curThemeUrl,GH_BLOB_BASE,themes);
}


function _addThemeIcon(theme, rawUrl){
  if(!window.YM_Desk || !window.YM_Desk.addIcon) return;
  const id='theme_'+(theme.filename||theme.name||'theme').replace(/[^a-z0-9]/gi,'_');
  // Vérifie si l'icône existe déjà (via le profil)
  const p=window.YM&&window.YM.getProfile?window.YM.getProfile():{};
  const existingIcons=p.customIcons||[];
  if(existingIcons.find(i=>i.id===id))return;
  const iconEntry={
    id,
    label:theme.name||(theme.filename||'').replace(/\.theme\.html$/,''),
    icon:theme.icon||'🎨',
    type:'theme',
    themeUrl:rawUrl,
    page:window._deskCurPage||0,
  };
  // desk.js addIcon(ic) attend un objet icône complet
  window.YM_Desk.addIcon(iconEntry);
  // Persiste dans le profil
  if(window.YM&&window.YM.saveProfile){
    existingIcons.push(iconEntry);
    window.YM.saveProfile({customIcons:existingIcons});
  }
}

function _renderThemeCards(container,curThemeUrl,GH_BLOB_BASE,themes){
  const listEl=container.querySelector('#theme-list-inner');if(!listEl)return;
  const list=themes||_themesList||[];

  let filtered=list;
  if(_themeSearch)filtered=filtered.filter(t=>
    (t.name||'').toLowerCase().includes(_themeSearch)||
    (t.description||'').toLowerCase().includes(_themeSearch)||
    (t.ghAuthor||'').toLowerCase().includes(_themeSearch)
  );
  if(_themeFilterCat){
    if(_themeFilterCat==='Photo')filtered=filtered.filter(t=>t.media&&t.media.includes('photo'));
    else if(_themeFilterCat==='Video')filtered=filtered.filter(t=>t.media&&t.media.includes('video'));
    else filtered=filtered.filter(t=>!t.media||t.media.length===0);
  }

  if(!filtered.length){
    listEl.innerHTML='<div style="color:var(--text3);font-size:12px;padding:8px 0">'+(list.length?'Aucun résultat.':'Aucun thème publié.')+'</div>';
    return;
  }

  listEl.innerHTML='';
  filtered.forEach(t=>{
    const rawUrl=t.codeUrl||('https://raw.githubusercontent.com/'+t.ghAuthor+'/'+REPO_NAME+'/'+REPO_BRANCH+'/src/themes/'+(t.filename||t.name+'.html'));
    const isCur=curThemeUrl===rawUrl;
    const ghCodeUrl=t.codeUrl?t.codeUrl.replace('https://raw.githubusercontent.com/','https://github.com/').replace('/'+REPO_BRANCH+'/','/blob/'+REPO_BRANCH+'/'):null;

    // Icon : emoji ou image preview
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
            (isCur?'<span class="pill active">actif</span>':'')+
            (t.wip?'<span style="font-size:9px;color:#f0a830;padding:1px 5px;border:1px solid rgba(240,168,48,.3);border-radius:4px">🚧 WIP</span>':'')+
          '</div>'+
          '<div style="font-size:9px;color:var(--text3);margin-bottom:3px">'+
            'by <b style="color:var(--accent)">@'+esc(t.ghAuthor||'unknown')+'</b>'+
            (ghCodeUrl?' &nbsp;·&nbsp; <a href="'+esc(ghCodeUrl)+'" target="_blank" rel="noopener" style="color:var(--cyan);text-decoration:none;font-size:9px" onclick="event.stopPropagation()">&lt;/&gt; code</a>':'')+
          '</div>'+
          '<div style="font-size:12px;color:var(--text2);line-height:1.4;margin-bottom:8px">'+esc(t.description||'—')+'</div>'+
          '<div style="display:flex;gap:6px">'+
            '<button class="ym-btn ym-btn-ghost" data-theme-icon-btn style="font-size:10px;padding:4px 9px" title="Ajouter au bureau">＋ Bureau</button>'+
            '<button class="ym-btn '+(isCur?'ym-btn-ghost':'ym-btn-accent')+'" data-theme-act-btn style="font-size:10px;padding:4px 10px">'+(isCur?'✓ Actif':'▶ Activer')+'</button>'+
          '</div>'+
        '</div>'+
      '</div>';

    // Bouton "＋ Bureau" : ajoute icône sur le bureau seulement
    card.querySelector('[data-theme-icon-btn]').addEventListener('click',e=>{
      e.stopPropagation();
      _addThemeIcon(t,rawUrl);
      window.YM_toast?.('Icône ajoutée au bureau','success');
    });

    // Bouton "▶ Activer" : applique le thème + ajoute icône
    card.querySelector('[data-theme-act-btn]').addEventListener('click',e=>{
      e.stopPropagation();
      if(isCur){window.YM_toast?.('Déjà actif','info');return;}
      _addThemeIcon(t,rawUrl);
      localStorage.setItem('ym_theme_url',rawUrl);
      localStorage.removeItem('ym_theme_cache');
      window.YM_toast?.('Thème — rechargement…','success');
      setTimeout(()=>location.reload(),1200);
    });
    listEl.appendChild(card);
  });
}

// Catégories standardisées — tout ce qui ne correspond pas → "Autres"
const STD_CATS=['Communication','Games','AI','Finance','Commerce','Social','Media','Search','Agent'];
function normCat(cat){return STD_CATS.includes(cat)?cat:'Autres';}

function renderSpheresContent(container){
  container.style.cssText='display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden';
  container.innerHTML=
    '<div id="sphere-list-inner" style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:10px 16px;min-height:0">'+
      '<div style="color:var(--text3);font-size:12px;padding:8px 0">Chargement…</div>'+
    '</div>'+
    '<div style="padding:8px 16px;border-top:1px solid rgba(232,160,32,.12);display:flex;flex-direction:column;gap:6px;flex-shrink:0;background:inherit">'+
      '<div id="sphere-cats" style="display:flex;flex-wrap:wrap;gap:4px"></div>'+
      '<div style="display:flex;gap:6px;align-items:center">'+
        '<input class="ym-input" id="sphere-search" placeholder="Search…" style="flex:1;font-size:11px">'+
        '<button class="ym-btn ym-btn-ghost" id="sphere-raw-toggle" style="font-size:11px;padding:6px 8px;flex-shrink:0" title="Activer par URL">↗</button>'+
      '</div>'+
      '<div id="sphere-raw-row" style="display:none;gap:6px;align-items:center">'+
        '<input class="ym-input" id="sphere-raw-url" placeholder="GitHub raw URL de la sphere…" style="flex:1;font-size:11px">'+
        '<button class="ym-btn ym-btn-ghost" id="sphere-raw-btn" style="font-size:11px;padding:6px 10px;flex-shrink:0">▶ Activer</button>'+
      '</div>'+
    '</div>';

  container.querySelector('#sphere-search')?.addEventListener('input',e=>{
    _filterText=e.target.value.toLowerCase();
    renderList(container);
  });

  // Pills catégories prédéterminées
  const catsEl=container.querySelector('#sphere-cats');
  if(catsEl){
    const FIXED_CATS=['Communication','Games','AI','Finance','Commerce','Social','Media','Search','Agent','Autres'];
    const renderPills=()=>{
      // "Actifs" = filtre spécial
      const allPills=['All','Actifs',...FIXED_CATS];
      catsEl.innerHTML=allPills.map(c=>{
        const isActive=c==='All'?(!_filterCat&&!_filterActive)
          :c==='Actifs'?_filterActive
          :(!_filterActive&&_filterCat===c);
        return'<span class="pill'+(isActive?' active':'')+'" style="cursor:pointer;font-size:10px;flex-shrink:0" data-cat="'+c+'">'+c+'</span>';
      }).join('');
      catsEl.querySelectorAll('.pill').forEach(p=>{
        p.addEventListener('click',()=>{
          const cat=p.dataset.cat;
          if(cat==='All'){_filterCat='';_filterActive=false;}
          else if(cat==='Actifs'){_filterActive=!_filterActive;_filterCat='';}
          else{_filterCat=cat;_filterActive=false;}
          renderPills();
          renderList(container);
        });
      });
    };
    renderPills();
  }

  // Toggle raw URL row
  const rawToggleBtn=container.querySelector('#sphere-raw-toggle');
  const rawRow=container.querySelector('#sphere-raw-row');
  if(rawToggleBtn&&rawRow){
    rawToggleBtn.addEventListener('click',()=>{
      const open=rawRow.style.display!=='none';
      rawRow.style.display=open?'none':'flex';
      rawToggleBtn.style.color=open?'':'var(--cyan)';
    });
  }

  // Activation par raw URL global
  const rawBtn=container.querySelector('#sphere-raw-btn');
  const rawInput=container.querySelector('#sphere-raw-url');
  if(rawBtn&&rawInput){
    rawBtn.addEventListener('click',async()=>{
      const url=rawInput.value.trim();if(!url)return;
      rawBtn.textContent='…';rawBtn.disabled=true;
      try{
        // Charge le code depuis l'URL et tente de l'exécuter
        const r=await fetch(url+'?t='+Date.now(),{cache:'no-store'});
        if(!r.ok)throw new Error('HTTP '+r.status);
        const code=await r.text();
        // Détecte le nom du fichier depuis l'URL ou depuis window.YM_S
        const fname=url.split('/').pop().replace(/\?.*$/,'');
        const blob=new Blob([code],{type:'text/javascript'});
        const blobUrl=URL.createObjectURL(blob);
        await new Promise((res,rej)=>{
          const s=document.createElement('script');s.src=blobUrl;
          s.onload=()=>{URL.revokeObjectURL(blobUrl);res();};
          s.onerror=()=>{URL.revokeObjectURL(blobUrl);rej(new Error('exec failed'));};
          document.head.appendChild(s);
        });
        // Active la sphere trouvée dans YM_S
        const sphereObj=window.YM_S&&window.YM_S[fname];
        if(sphereObj&&window.YM){
          await window.YM.activateSphere(fname,sphereObj);
          rawInput.value='';
          window.YM_toast?.('Sphere activée depuis raw URL','success');
          renderSpheresContent(container);
        }else{
          // Cherche n'importe quelle clé nouvellement ajoutée dans YM_S
          const newKey=window.YM_S&&Object.keys(window.YM_S).find(k=>!window.YM_sphereRegistry?.has(k));
          if(newKey&&window.YM){
            await window.YM.activateSphere(newKey,window.YM_S[newKey]);
            rawInput.value='';
            window.YM_toast?.('Sphere activée','success');
            renderSpheresContent(container);
          }else throw new Error('Aucune sphere trouvée dans le code');
        }
      }catch(e){window.YM_toast?.('Erreur: '+e.message,'error');}
      rawBtn.textContent='▶';rawBtn.disabled=false;
    });
  }

  renderList(container);
}

function renderCategories(container){
  const cats=[...new Set(_sphereList.map(s=>normCat(s.category)||'Autres').filter(Boolean))];
  const catsEl=container.querySelector('#sphere-cats');if(!catsEl)return;
  catsEl.innerHTML=
    '<span class="pill '+(!_filterCat&&!_filterActive?'active':'')+'" style="cursor:pointer" data-cat="" data-active="0">All</span>'+
    cats.map(c=>'<span class="pill '+(_filterCat===c?'active':'')+'" style="cursor:pointer" data-cat="'+c+'" data-active="0">'+c+'</span>').join('')+
    '<span class="pill '+(_filterActive?'active':'')+'" style="cursor:pointer;background:'+(_filterActive?'var(--green)':'')+'!important;border-color:'+(_filterActive?'var(--green)':'rgba(34,217,138,.4)')+'!important;color:'+(_filterActive?'#000':'var(--text3)')+'!important" data-cat="" data-active="1">✓ Active</span>';
  catsEl.querySelectorAll('[data-cat]').forEach(el=>{
    el.addEventListener('click',()=>{
      if(el.dataset.active==='1'){_filterActive=!_filterActive;_filterCat='';}
      else{_filterActive=false;_filterCat=el.dataset.cat;}
      renderCategories(container);renderList(container);
    });
  });
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

window.YM_Liste={render,fetchSphereList,activateSphereByName,isSphereActive,_setInactive,
  _forceRefresh(){_loaded=false;_sphereList=[];_fetchPromise=null;},
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
