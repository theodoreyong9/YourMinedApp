/* jshint esversion:11, browser:true */
// activity.sphere.js — YourMine Activity
// Onglet 1: Cercles géographiques + messages géolocalisés
// Onglet 2: Extraction contenu social par lieu et période
(function(){
'use strict';
window.YM_S = window.YM_S || {};

const CIRCLES_KEY = 'ym_act_circles_v1';
const DROPS_KEY   = 'ym_act_drops_v1';

let _ctx = null;
let _map = null;
let _mapInitialized = false;

function loadCircles(){try{return JSON.parse(localStorage.getItem(CIRCLES_KEY)||'[]');}catch(e){return[];}}
function saveCircles(d){localStorage.setItem(CIRCLES_KEY,JSON.stringify(d));}
function loadDrops(){try{return JSON.parse(localStorage.getItem(DROPS_KEY)||'[]');}catch(e){return[];}}
function saveDrops(d){localStorage.setItem(DROPS_KEY,JSON.stringify(d));}

// ── PANEL ──────────────────────────────────────────────────────────────────
function renderPanel(container){
  container.style.cssText='display:flex;flex-direction:column;height:100%';
  container.innerHTML='';

  const TABS=[['circles','📍 Zones'],['extract','🔍 Extract']];
  let curTab='circles';

  const track=document.createElement('div');
  track.style.cssText='flex:1;overflow:hidden;min-height:0';
  container.appendChild(track);

  const tabs=document.createElement('div');
  tabs.className='ym-tabs';
  tabs.style.cssText='border-top:1px solid rgba(232,160,32,.12);border-bottom:none;margin:0;flex-shrink:0';
  TABS.forEach(([id,label])=>{
    const t=document.createElement('div');
    t.className='ym-tab'+(id==='circles'?' active':'');
    t.dataset.tab=id;t.textContent=label;
    t.addEventListener('click',()=>{
      curTab=id;
      tabs.querySelectorAll('.ym-tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===id));
      track.innerHTML='';
      if(id==='circles')renderCirclesTab(track);
      else renderExtractTab(track);
    });
    tabs.appendChild(t);
  });
  container.appendChild(tabs);

  renderCirclesTab(track);
}

// ── ONGLET 1 : ZONES ────────────────────────────────────────────────────────
function renderCirclesTab(container){
  container.style.cssText='display:flex;flex-direction:column;height:100%';
  container.innerHTML='';

  // Carte Leaflet
  const mapEl=document.createElement('div');
  mapEl.id='act-map';
  mapEl.style.cssText='flex:1;min-height:0;background:var(--surface2)';
  container.appendChild(mapEl);

  // Barre actions en bas
  const bar=document.createElement('div');
  bar.style.cssText='flex-shrink:0;padding:10px 14px;border-top:1px solid var(--border);display:flex;gap:8px;align-items:center;background:var(--surface)';
  bar.innerHTML=
    '<button id="act-add-circle" class="ym-btn ym-btn-accent" style="font-size:12px;flex:1">+ Zone ici</button>'+
    '<button id="act-drop-msg" class="ym-btn ym-btn-ghost" style="font-size:12px;flex:1">💬 Drop message</button>'+
    '<button id="act-locate" class="ym-btn ym-btn-ghost" style="padding:6px 10px;font-size:16px">◎</button>';
  container.appendChild(bar);

  // Panneau liste zones
  const listEl=document.createElement('div');
  listEl.style.cssText='flex-shrink:0;max-height:140px;overflow-y:auto;padding:6px 14px;border-top:1px solid var(--border)';
  container.appendChild(listEl);

  function renderList(){
    listEl.innerHTML='';
    const circles=loadCircles();
    const drops=loadDrops();
    if(!circles.length&&!drops.length){
      listEl.innerHTML='<div style="color:var(--text3);font-size:11px;padding:4px 0">No zones or messages yet. Navigate the map and add one.</div>';
      return;
    }
    circles.forEach((c,i)=>{
      const row=document.createElement('div');
      row.style.cssText='display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.04)';
      row.innerHTML=
        '<span style="font-size:13px">📍</span>'+
        '<span style="flex:1;font-size:12px">'+(c.name||'Zone '+(i+1))+'</span>'+
        '<span style="font-size:10px;color:var(--text3)">'+c.lat.toFixed(3)+','+c.lng.toFixed(3)+'</span>'+
        '<button data-del="'+i+'" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:14px">×</button>';
      row.querySelector('[data-del]').addEventListener('click',e=>{
        e.stopPropagation();
        const arr=loadCircles();arr.splice(i,1);saveCircles(arr);
        renderList();initMap();
      });
      listEl.appendChild(row);
    });
    drops.forEach((d,i)=>{
      const row=document.createElement('div');
      row.style.cssText='display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.04)';
      row.innerHTML=
        '<span style="font-size:13px">💬</span>'+
        '<span style="flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+d.text+'</span>'+
        '<span style="font-size:10px;color:var(--text3)">'+new Date(d.ts).toLocaleDateString()+'</span>'+
        '<button data-ddel="'+i+'" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:14px">×</button>';
      row.querySelector('[data-ddel]').addEventListener('click',e=>{
        e.stopPropagation();
        const arr=loadDrops();arr.splice(i,1);saveDrops(arr);
        renderList();initMap();
      });
      listEl.appendChild(row);
    });
  }

  function initMap(){
    // Charge Leaflet si pas encore fait
    function setupMap(){
      if(document.getElementById('act-map')!==mapEl)return;
      if(_map){try{_map.remove();}catch(e){} _map=null;}
      const L=window.L;
      _map=L.map('act-map',{zoomControl:true,attributionControl:false}).setView([48.85,2.35],3);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:19}).addTo(_map);

      // Dessine les cercles existants
      loadCircles().forEach(c=>{
        L.circle([c.lat,c.lng],{radius:100,color:'#e8a020',fillColor:'#e8a020',fillOpacity:0.15,weight:2}).addTo(_map)
          .bindPopup('<b>'+(c.name||'Zone')+'</b>');
      });
      // Dessine les drops
      loadDrops().forEach(d=>{
        const icon=L.divIcon({className:'',html:'<div style="background:#e8a020;color:#000;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:13px">💬</div>',iconSize:[24,24]});
        L.marker([d.lat,d.lng],{icon}).addTo(_map).bindPopup('<div style="max-width:180px">'+d.text+'</div>');
      });
    }

    if(window.L){setupMap();}
    else{
      const link=document.createElement('link');link.rel='stylesheet';link.href='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';document.head.appendChild(link);
      const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
      s.onload=setupMap;document.head.appendChild(s);
    }
  }

  bar.querySelector('#act-locate').addEventListener('click',()=>{
    navigator.geolocation?.getCurrentPosition(pos=>{
      if(_map)_map.setView([pos.coords.latitude,pos.coords.longitude],14);
    },()=>window.YM_toast?.('Geolocation unavailable','warn'));
  });

  bar.querySelector('#act-add-circle').addEventListener('click',()=>{
    if(!_map){window.YM_toast?.('Map not ready','warn');return;}
    const center=_map.getCenter();
    const name=prompt('Zone name:','My Zone');
    if(name===null)return;
    const circles=loadCircles();
    circles.push({lat:center.lat,lng:center.lng,name:name.trim()||'Zone',radius:100,ts:Date.now()});
    saveCircles(circles);
    renderList();initMap();
  });

  bar.querySelector('#act-drop-msg').addEventListener('click',()=>{
    if(!_map){window.YM_toast?.('Map not ready','warn');return;}
    const center=_map.getCenter();
    const text=prompt('Message to drop here:');
    if(!text||!text.trim())return;
    const drops=loadDrops();
    drops.push({lat:center.lat,lng:center.lng,text:text.trim(),ts:Date.now()});
    saveDrops(drops);
    renderList();initMap();
  });

  renderList();
  setTimeout(initMap,50);
}

// ── ONGLET 2 : EXTRACT ───────────────────────────────────────────────────────
function renderExtractTab(container){
  container.style.cssText='display:flex;flex-direction:column;height:100%;overflow:hidden';
  container.innerHTML='';

  const hdr=document.createElement('div');
  hdr.style.cssText='padding:12px 14px;flex-shrink:0';
  hdr.innerHTML=
    '<div style="font-size:11px;color:var(--text3);margin-bottom:8px">Extract public social content around a location</div>'+
    '<div style="display:flex;gap:6px;margin-bottom:8px">'+
      '<input id="ext-loc" class="ym-input" placeholder="Location (city, coords…)" style="flex:1;font-size:12px">'+
      '<button id="ext-here" class="ym-btn ym-btn-ghost" style="padding:6px 10px;font-size:14px" title="Use my location">◎</button>'+
    '</div>'+
    '<div style="display:flex;gap:6px;margin-bottom:8px">'+
      '<select id="ext-period" class="ym-input" style="flex:1;font-size:12px">'+
        '<option value="1h">Last hour</option>'+
        '<option value="24h" selected>Last 24h</option>'+
        '<option value="yesterday">Yesterday</option>'+
      '</select>'+
      '<button id="ext-run" class="ym-btn ym-btn-accent" style="font-size:12px;flex:1">🔍 Extract</button>'+
    '</div>'+
    '<div id="ext-status" style="font-size:11px;color:var(--text3)"></div>';
  container.appendChild(hdr);

  const results=document.createElement('div');
  results.style.cssText='flex:1;overflow-y:auto;padding:0 14px 14px';
  container.appendChild(results);

  hdr.querySelector('#ext-here').addEventListener('click',()=>{
    navigator.geolocation?.getCurrentPosition(pos=>{
      hdr.querySelector('#ext-loc').value=pos.coords.latitude.toFixed(4)+','+pos.coords.longitude.toFixed(4);
    },()=>window.YM_toast?.('Geolocation unavailable','warn'));
  });

  hdr.querySelector('#ext-run').addEventListener('click',async()=>{
    const loc=hdr.querySelector('#ext-loc').value.trim();
    const period=hdr.querySelector('#ext-period').value;
    if(!loc){window.YM_toast?.('Enter a location','warn');return;}

    const status=hdr.querySelector('#ext-status');
    status.textContent='Searching…';
    results.innerHTML='';

    // Utilise l'API Claude pour faire une recherche web contextualisée
    try{
      const periodLabel={'1h':'in the last hour','24h':'in the last 24 hours','yesterday':'yesterday'}[period];
      const prompt=`Search for recent public social media posts, news, and events happening in or around "${loc}" ${periodLabel}. Include tweets, Instagram posts, local news, and any notable activity. Format each result as: [SOURCE] Title/text — URL if available. Focus on what people are actually posting and experiencing there right now.`;

      const resp=await fetch('https://api.anthropic.com/v1/messages',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          model:'claude-sonnet-4-20250514',
          max_tokens:1000,
          tools:[{type:'web_search_20250305',name:'web_search'}],
          messages:[{role:'user',content:prompt}]
        })
      });
      const data=await resp.json();
      const text=data.content?.filter(b=>b.type==='text').map(b=>b.text).join('\n')||'No results found.';
      status.textContent='';
      text.split('\n').filter(l=>l.trim()).forEach(line=>{
        const el=document.createElement('div');
        el.style.cssText='padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05);font-size:12px;color:var(--text2);line-height:1.5';
        el.textContent=line;
        results.appendChild(el);
      });
    }catch(e){
      status.textContent='Error: '+e.message;
    }
  });
}

// ── SPHERE ─────────────────────────────────────────────────────────────────
window.YM_S['activity.sphere.js']={
  name:'Activity',
  icon:'📍',
  category:'Social',
  description:'Geographic zones, message drops, and local social extraction',
  author:'yourmine',
  emit:[],receive:[],

  activate(ctx){_ctx=ctx;},
  deactivate(){_ctx=null;if(_map){try{_map.remove();}catch(e){}_map=null;}},
  renderPanel
};
})();
