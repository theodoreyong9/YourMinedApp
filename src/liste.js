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
  _fetchPromise=_doFetch().catch(e=>{_fetchPromise=null;throw e;});
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
  body.style.cssText='display:flex;flex-direction:column;height:100%;padding:0';

  body.innerHTML=
    '<div id="sphere-list-inner" style="flex:1;overflow-y:auto;padding:10px 16px">'+
      '<div style="color:var(--text3);font-size:12px;padding:8px 0">Loading spheres…</div>'+
    '</div>'+
    '<div style="padding:10px 16px;border-top:1px solid rgba(232,160,32,.12);display:flex;flex-direction:column;gap:8px;flex-shrink:0">'+
      '<div id="sphere-cats" style="display:flex;flex-wrap:wrap;gap:4px"></div>'+
      '<input class="ym-input" id="sphere-search" placeholder="Search spheres…" value="">'+
    '</div>';

  body.querySelector('#sphere-search')?.addEventListener('input',e=>{
    _filterText=e.target.value.toLowerCase();
    renderList(body);
  });

  if(!_loaded)await fetchSphereList();
  renderCategories(body);
  renderList(body);
}

function renderCategories(body){
  const cats=[...new Set(_sphereList.map(s=>s.category).filter(Boolean))];
  const catsEl=body.querySelector('#sphere-cats');if(!catsEl)return;
  catsEl.innerHTML=
    '<span class="pill '+(!_filterCat&&!_filterActive?'active':'')+'" style="cursor:pointer" data-cat="" data-active="0">All</span>'+
    cats.map(c=>'<span class="pill '+(_filterCat===c?'active':'')+'" style="cursor:pointer" data-cat="'+c+'" data-active="0">'+c+'</span>').join('')+
    '<span class="pill '+(_filterActive?'active':'')+'" style="cursor:pointer;background:'+(_filterActive?'var(--green)':'')+'!important;border-color:'+(_filterActive?'var(--green)':'rgba(34,217,138,.4)')+'!important;color:'+(_filterActive?'#000':'var(--text3)')+'!important" data-cat="" data-active="1">✓ Active</span>';
  catsEl.querySelectorAll('[data-cat]').forEach(el=>{
    el.addEventListener('click',()=>{
      if(el.dataset.active==='1'){_filterActive=!_filterActive;_filterCat='';}
      else{_filterActive=false;_filterCat=el.dataset.cat;}
      renderCategories(body);renderList(body);
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
  if(_filterCat)filtered=filtered.filter(s=>s.category===_filterCat);
  if(_filterActive)filtered=filtered.filter(s=>isSphereActive(s.fileName));
  if(!filtered.length){listEl.innerHTML='<div style="color:var(--text3);font-size:12px;padding:8px 0">No spheres found.</div>';return;}

  listEl.innerHTML='';
  filtered.forEach(sphere=>{
    const active=isSphereActive(sphere.fileName);
    const iconIsUrl=sphere.icon&&(sphere.icon.startsWith('http')||sphere.icon.startsWith('/'));
    const iconHtml=iconIsUrl?'<img src="'+sphere.icon+'" style="width:34px;height:34px;border-radius:6px;object-fit:contain">':'<span style="font-size:34px;line-height:1">'+sphere.icon+'</span>';

    // URL dans le fork de l'auteur de la sphere (pas le repo principal)
    const ghAuthorUrl='https://github.com/'+(sphere.ghAuthor||REPO_OWNER)+'/'+REPO_NAME+'/blob/'+REPO_BRANCH+'/'+sphere.fileName;

    const card=document.createElement('div');
    card.className='ym-card';
    card.style.cssText='cursor:pointer;transition:border-color .2s,opacity .2s'+(active?';border-color:var(--accent-dim)':'');

    card.innerHTML=
      '<div style="display:flex;align-items:center;gap:12px">'+
        '<div style="flex-shrink:0;line-height:1">'+iconHtml+'</div>'+
        '<div style="flex:1;min-width:0">'+
          '<div data-name-line style="display:flex;align-items:center;gap:8px;margin-bottom:3px">'+
            '<div style="font-weight:600;font-size:14px;color:var(--text)">'+esc(sphere.name)+'</div>'+
            (active?'<span class="pill active">active</span>':'')+
          '</div>'+
          '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;flex-wrap:wrap">'+
            '<span style="font-size:10px;color:var(--text3)">'+esc(sphere.category)+'</span>'+
            '<span style="color:var(--text3);font-size:9px">·</span>'+
            '<span style="font-size:9px;color:var(--text3)">by <b style="color:var(--accent)">@'+esc(sphere.ghAuthor||'unknown')+'</b></span>'+
            '<a data-code-link href="'+ghAuthorUrl+'" target="_blank" rel="noopener" style="font-size:9px;color:var(--cyan);padding:1px 5px;border:1px solid rgba(8,224,248,.3);border-radius:4px;line-height:1.6;flex-shrink:0;text-decoration:none">&lt;/&gt; code</a>'+
          '</div>'+
          '<div style="font-size:12px;color:var(--text2);line-height:1.4">'+esc(sphere.description||'—')+'</div>'+
        '</div>'+
        '<div data-action-cell style="display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0">'+
          (active&&!MANDATORY_SPHERES.includes(sphere.fileName) ? '<button data-deactivate style="background:none;border:1px solid rgba(255,69,96,.3);color:var(--red);border-radius:6px;font-size:10px;padding:3px 7px;cursor:pointer;line-height:1.4">Off</button>' : (active ? '<div style="font-size:14px;color:var(--text3)">✓</div>' : '<div style="font-size:20px;color:var(--text3)">›</div>'))+
        '</div>'+
      '</div>';

    // Bouton code → lien GitHub, stoppe la propagation pour ne pas activer la sphere
    const codeLink=card.querySelector('[data-code-link]');
    if(codeLink){
      codeLink.addEventListener('click',function(e){e.stopPropagation();});
    }

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
