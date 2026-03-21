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

  // Carte — prend tout l'espace
  const mapEl=document.createElement('div');
  mapEl.id='act-map';
  mapEl.style.cssText='flex:1;min-height:0;background:var(--surface2)';
  container.appendChild(mapEl);

  // Barre actions compacte en bas
  const bar=document.createElement('div');
  bar.style.cssText='flex-shrink:0;padding:8px 12px;border-top:1px solid var(--border);display:flex;gap:6px;align-items:center;background:var(--surface)';
  bar.innerHTML=
    '<div id="act-mode-info" style="flex:1;font-size:11px;color:var(--text3)">Click map to place zone or message</div>'+
    '<button id="act-mode-zone" class="ym-btn ym-btn-accent" style="font-size:11px;padding:5px 10px">+ Zone</button>'+
    '<button id="act-mode-msg" class="ym-btn ym-btn-ghost" style="font-size:11px;padding:5px 10px">💬 Drop</button>'+
    '<button id="act-locate" class="ym-btn ym-btn-ghost" style="padding:5px 8px;font-size:15px" title="My location">◎</button>';
  container.appendChild(bar);

  let _mode = null; // 'zone' | 'msg' | null

  function setMode(m){
    _mode=m;
    bar.querySelector('#act-mode-zone').style.background=m==='zone'?'var(--accent)':'';
    bar.querySelector('#act-mode-msg').style.background=m==='msg'?'rgba(232,160,32,.2)':'';
    bar.querySelector('#act-mode-info').textContent=
      m==='zone'?'Click on the map to place a zone (100m radius)':
      m==='msg'?'Click on the map to drop a message':'Click map to place zone or message';
    if(_map)_map.getContainer().style.cursor=m?'crosshair':'';
  }

  bar.querySelector('#act-mode-zone').addEventListener('click',()=>setMode(_mode==='zone'?null:'zone'));
  bar.querySelector('#act-mode-msg').addEventListener('click',()=>setMode(_mode==='msg'?null:'msg'));

  function setupMap(){
    if(document.getElementById('act-map')!==mapEl)return;
    if(_map){try{_map.remove();}catch(e){}_map=null;}
    const L=window.L;
    _map=L.map('act-map',{zoomControl:true,attributionControl:false});
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:19}).addTo(_map);

    function redrawAll(){
      // Efface tout sauf tiles
      _map.eachLayer(l=>{if(!(l instanceof L.TileLayer))_map.removeLayer(l);});
      loadCircles().forEach(c=>{
        const circle=L.circle([c.lat,c.lng],{
          radius:100,color:'#e8a020',fillColor:'#e8a020',fillOpacity:0.18,weight:2,interactive:true
        }).addTo(_map);
        const popup=L.popup({className:'act-popup'}).setContent(
          '<div style="font-weight:600;margin-bottom:4px">'+(c.name||'Zone')+'</div>'+
          '<button class="pop-del" style="background:#e84040;color:#fff;border:none;border-radius:4px;padding:3px 10px;cursor:pointer;font-size:11px">Delete</button>'
        );
        circle.bindPopup(popup);
        circle.on('popupopen',()=>{
          document.querySelector('.pop-del')?.addEventListener('click',()=>{
            const arr=loadCircles().filter(x=>!(x.lat===c.lat&&x.lng===c.lng));
            saveCircles(arr);redrawAll();circle.closePopup();
          });
        });
      });
      loadDrops().forEach(d=>{
        const icon=L.divIcon({className:'',
          html:'<div style="background:#e8a020;color:#000;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:16px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.5)">💬</div>',
          iconSize:[28,28],iconAnchor:[14,14]});
        const marker=L.marker([d.lat,d.lng],{icon}).addTo(_map);
        const popup=L.popup().setContent(
          '<div style="max-width:180px;font-size:12px;margin-bottom:6px">'+d.text+'</div>'+
          '<div style="font-size:10px;color:#999;margin-bottom:6px">'+new Date(d.ts).toLocaleString()+'</div>'+
          '<button class="pop-ddel" style="background:#e84040;color:#fff;border:none;border-radius:4px;padding:3px 10px;cursor:pointer;font-size:11px">Delete</button>'
        );
        marker.bindPopup(popup);
        marker.on('popupopen',()=>{
          document.querySelector('.pop-ddel')?.addEventListener('click',()=>{
            const arr=loadDrops().filter(x=>!(x.lat===d.lat&&x.lng===d.lng&&x.ts===d.ts));
            saveDrops(arr);redrawAll();marker.closePopup();
          });
        });
      });
    }

    // Clic sur carte → place selon le mode
    _map.on('click',e=>{
      if(!_mode)return;
      const{lat,lng}=e.latlng;
      if(_mode==='zone'){
        const name=prompt('Zone name (optional):','');
        if(name===null){setMode(null);return;}
        const circles=loadCircles();
        circles.push({lat,lng,name:name.trim()||'Zone',radius:100,ts:Date.now()});
        saveCircles(circles);
        redrawAll();
        setMode(null);
      }else if(_mode==='msg'){
        const text=prompt('Message:','');
        if(!text||!text.trim()){setMode(null);return;}
        const drops=loadDrops();
        drops.push({lat,lng,text:text.trim(),ts:Date.now()});
        saveDrops(drops);
        redrawAll();
        setMode(null);
      }
    });

    redrawAll();

    // Vue initiale : cercle le plus proche de ma position, sinon monde
    navigator.geolocation?.getCurrentPosition(pos=>{
      const myLat=pos.coords.latitude,myLng=pos.coords.longitude;
      const circles=loadCircles();
      if(circles.length){
        // Trouve le plus proche
        let nearest=circles[0],minDist=Infinity;
        circles.forEach(c=>{
          const d=Math.hypot(c.lat-myLat,c.lng-myLng);
          if(d<minDist){minDist=d;nearest=c;}
        });
        _map.setView([nearest.lat,nearest.lng],16);
      }else{
        _map.setView([myLat,myLng],14);
      }
    },()=>{
      // Pas de géoloc : monde entier ou premier cercle
      const circles=loadCircles();
      if(circles.length)_map.setView([circles[0].lat,circles[0].lng],14);
      else _map.setView([20,0],2);
    },{timeout:4000});
  }

  bar.querySelector('#act-locate').addEventListener('click',()=>{
    navigator.geolocation?.getCurrentPosition(pos=>{
      if(_map)_map.setView([pos.coords.latitude,pos.coords.longitude],15);
    },()=>window.YM_toast?.('Geolocation unavailable','warn'));
  });

  if(window.L){setTimeout(setupMap,50);}
  else{
    if(!document.getElementById('leaflet-css')){
      const link=document.createElement('link');link.id='leaflet-css';link.rel='stylesheet';
      link.href='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
      document.head.appendChild(link);
    }
    if(!document.getElementById('leaflet-js')){
      const s=document.createElement('script');s.id='leaflet-js';
      s.src='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
      s.onload=()=>setTimeout(setupMap,50);document.head.appendChild(s);
    }else{
      // Script en cours de chargement — attends
      const check=setInterval(()=>{if(window.L){clearInterval(check);setTimeout(setupMap,50);}},100);
    }
  }
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
