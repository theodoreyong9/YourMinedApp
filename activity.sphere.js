/* jshint esversion:11, browser:true */
// activity.sphere.js — YourMine Activity
(function(){
'use strict';
window.YM_S = window.YM_S || {};

const CIRCLES_KEY = 'ym_act_circles_v1';
const ANCHORS_KEY = 'ym_act_anchors_v1'; // messages ancrés au profil

let _ctx=null, _map=null, _myLat=null, _myLng=null;

function loadCircles(){try{return JSON.parse(localStorage.getItem(CIRCLES_KEY)||'[]');}catch(e){return[];}}
function saveCircles(d){localStorage.setItem(CIRCLES_KEY,JSON.stringify(d));}
function loadAnchors(){try{return JSON.parse(localStorage.getItem(ANCHORS_KEY)||'[]');}catch(e){return[];}}
function saveAnchors(d){localStorage.setItem(ANCHORS_KEY,JSON.stringify(d));}
function getMyProfile(){return _ctx?.loadProfile?.();}

// ── PANEL ──────────────────────────────────────────────────────────────────
function renderPanel(container){
  container.style.cssText='display:flex;flex-direction:column;height:100%';
  container.innerHTML='';

  const TABS=[['zones','📍 Zones'],['extract','🔍 Extract']];
  let curTab='zones';

  const track=document.createElement('div');
  track.style.cssText='flex:1;overflow:hidden;min-height:0;display:flex;flex-direction:column';
  container.appendChild(track);

  const tabs=document.createElement('div');
  tabs.className='ym-tabs';
  tabs.style.cssText='border-top:1px solid rgba(232,160,32,.12);margin:0;flex-shrink:0';
  TABS.forEach(([id,label])=>{
    const t=document.createElement('div');
    t.className='ym-tab'+(id==='zones'?' active':'');
    t.dataset.tab=id;t.textContent=label;
    t.addEventListener('click',()=>{
      curTab=id;
      tabs.querySelectorAll('.ym-tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===id));
      track.innerHTML='';track.style.cssText='flex:1;overflow:hidden;min-height:0;display:flex;flex-direction:column';
      if(id==='zones')renderZonesTab(track);
      else renderExtractTab(track);
    });
    tabs.appendChild(t);
  });
  container.appendChild(tabs);

  renderZonesTab(track);
}

// ── ONGLET ZONES ────────────────────────────────────────────────────────────
function renderZonesTab(container){
  container.innerHTML='';

  // Carte — prend 60% de la hauteur
  const mapEl=document.createElement('div');
  mapEl.id='act-map';
  mapEl.style.cssText='flex:1;min-height:0;background:var(--surface2)';
  container.appendChild(mapEl);

  // Barre sous la carte
  const bar=document.createElement('div');
  bar.style.cssText='flex-shrink:0;padding:6px 10px;border-top:1px solid var(--border);display:flex;gap:6px;align-items:center;background:var(--surface)';
  bar.innerHTML=
    '<span id="act-hint" style="flex:1;font-size:10px;color:var(--text3)">Tap map to place a 100m zone</span>'+
    '<button id="act-anchor" class="ym-btn ym-btn-ghost" style="font-size:11px;padding:4px 8px">✏ My anchor</button>'+
    '<button id="act-locate" class="ym-btn ym-btn-ghost" style="padding:4px 8px;font-size:15px">◎</button>';
  container.appendChild(bar);

  // Liste zones
  const listEl=document.createElement('div');
  listEl.style.cssText='flex-shrink:0;max-height:130px;overflow-y:auto;border-top:1px solid var(--border)';
  container.appendChild(listEl);

  function renderList(){
    listEl.innerHTML='';
    const circles=loadCircles();
    const anchors=loadAnchors();
    if(!circles.length&&!anchors.length){
      listEl.innerHTML='<div style="color:var(--text3);font-size:11px;padding:6px 12px">No zones yet. Tap the map to add one.</div>';
      return;
    }
    circles.forEach((c,i)=>{
      const row=document.createElement('div');
      row.style.cssText='display:flex;align-items:center;gap:8px;padding:5px 12px;border-bottom:1px solid rgba(255,255,255,.04);cursor:pointer';
      row.innerHTML=
        '<span>📍</span>'+
        '<span style="flex:1;font-size:12px">'+(c.name||'Zone '+(i+1))+'</span>'+
        '<span style="font-size:10px;color:var(--text3)">'+c.lat.toFixed(4)+','+c.lng.toFixed(4)+'</span>'+
        '<button data-del="'+i+'" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:14px;padding:0 2px">×</button>';
      row.addEventListener('click',e=>{
        if(e.target.dataset.del!==undefined)return;
        if(_map)_map.setView([c.lat,c.lng],17);
      });
      row.querySelector('[data-del]').addEventListener('click',e=>{
        e.stopPropagation();
        const arr=loadCircles();arr.splice(i,1);saveCircles(arr);
        renderList();redrawMap();
      });
      listEl.appendChild(row);
    });
    anchors.forEach((a,i)=>{
      const row=document.createElement('div');
      row.style.cssText='display:flex;align-items:center;gap:8px;padding:5px 12px;border-bottom:1px solid rgba(255,255,255,.04);cursor:pointer';
      row.innerHTML=
        '<span>👤</span>'+
        '<span style="flex:1;font-size:12px;color:var(--accent)">'+a.text.slice(0,40)+'</span>'+
        '<span style="font-size:10px;color:var(--text3)">'+a.lat.toFixed(4)+','+a.lng.toFixed(4)+'</span>'+
        '<button data-adel="'+i+'" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:14px;padding:0 2px">×</button>';
      row.addEventListener('click',e=>{
        if(e.target.dataset.adel!==undefined)return;
        if(_map)_map.setView([a.lat,a.lng],17);
      });
      row.querySelector('[data-adel]').addEventListener('click',e=>{
        e.stopPropagation();
        const arr=loadAnchors();arr.splice(i,1);saveAnchors(arr);
        renderList();redrawMap();
      });
      listEl.appendChild(row);
    });
  }

  // ── Carte Leaflet ────────────────────────────────────────
  let _redrawScheduled=false;
  function redrawMap(){
    if(!_map)return;
    const L=window.L;
    _map.eachLayer(l=>{if(!(l instanceof L.TileLayer))_map.removeLayer(l);});
    loadCircles().forEach(c=>{
      const circle=L.circle([c.lat,c.lng],{radius:100,color:'#e8a020',fillColor:'#e8a020',fillOpacity:0.18,weight:2})
        .addTo(_map);
      circle.bindPopup(
        '<b style="font-size:13px">'+(c.name||'Zone')+'</b>'+
        '<br><small>'+c.lat.toFixed(5)+', '+c.lng.toFixed(5)+'</small>'+
        '<br><button class="pop-del" style="margin-top:6px;background:#e84040;color:#fff;border:none;border-radius:4px;padding:2px 10px;cursor:pointer;font-size:11px">Delete</button>'
      );
      circle.on('popupopen',()=>{
        document.querySelector('.pop-del')?.addEventListener('click',()=>{
          saveCircles(loadCircles().filter(x=>!(x.lat===c.lat&&x.lng===c.lng)));
          renderList();redrawMap();circle.closePopup();
        });
      });
    });
    const prof=getMyProfile()||{};
    loadAnchors().forEach(a=>{
      const ava=prof.avatar?
        '<img src="'+prof.avatar+'" style="width:30px;height:30px;border-radius:50%;object-fit:cover;border:2px solid var(--accent)">':
        '<div style="width:30px;height:30px;border-radius:50%;background:var(--accent);color:#000;display:flex;align-items:center;justify-content:center;font-size:14px">'+(prof.name?.charAt(0)||'👤')+'</div>';
      const icon=L.divIcon({className:'',
        html:'<div style="position:relative;filter:drop-shadow(0 2px 6px rgba(0,0,0,.6))">'+ava+
          '<div style="position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);background:rgba(8,8,15,.9);color:var(--accent);font-size:9px;white-space:nowrap;padding:1px 5px;border-radius:3px;border:1px solid var(--accent)">'+
          a.text.slice(0,20)+(a.text.length>20?'…':'')+'</div></div>',
        iconSize:[30,50],iconAnchor:[15,30]});
      L.marker([a.lat,a.lng],{icon}).addTo(_map)
        .bindPopup('<div style="max-width:200px"><b>'+(prof.name||'Me')+'</b><br><small>'+a.text+'</small></div>');
    });
  }

  function setupMap(){
    if(document.getElementById('act-map')!==mapEl)return;
    if(_map){try{_map.remove();}catch(e){}_map=null;}
    const L=window.L;
    _map=L.map('act-map',{zoomControl:true,attributionControl:false});
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:19}).addTo(_map);
    redrawMap();

    // Clic = zone 100m, demande juste un nom optionnel
    _map.on('click',e=>{
      const{lat,lng}=e.latlng;
      const name=prompt('Zone name (optional, Enter to skip):');
      if(name===null)return; // ESC = annule
      const circles=loadCircles();
      circles.push({lat,lng,name:name.trim()||('Zone '+(circles.length+1)),radius:100,ts:Date.now()});
      saveCircles(circles);
      renderList();redrawMap();
    });

    // Vue initiale : ~1km autour de ma position
    function setInitialView(){
      if(_myLat!==null){
        _map.setView([_myLat,_myLng],15); // ~1km à z15
        redrawMap();
      }else{
        navigator.geolocation?.getCurrentPosition(pos=>{
          _myLat=pos.coords.latitude;_myLng=pos.coords.longitude;
          _map.setView([_myLat,_myLng],15);
          redrawMap();
        },()=>{
          const circles=loadCircles();
          if(circles.length)_map.setView([circles[0].lat,circles[0].lng],15);
          else _map.setView([20,0],2);
        },{timeout:5000,enableHighAccuracy:true});
      }
    }
    setInitialView();
  }

  function loadLeaflet(cb){
    if(window.L){cb();return;}
    if(!document.getElementById('leaflet-css')){
      const l=document.createElement('link');l.id='leaflet-css';l.rel='stylesheet';
      l.href='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';document.head.appendChild(l);
    }
    if(window.L){cb();return;}
    if(!document.getElementById('leaflet-js')){
      const s=document.createElement('script');s.id='leaflet-js';
      s.src='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
      s.onload=cb;document.head.appendChild(s);
    }else{const t=setInterval(()=>{if(window.L){clearInterval(t);cb();}},100);}
  }

  // Bouton ancre profil
  bar.querySelector('#act-anchor').addEventListener('click',()=>{
    if(!_map){window.YM_toast?.('Map not ready','warn');return;}
    const center=_map.getCenter();
    const text=prompt('Message anchored to your profile at this location:','');
    if(!text||!text.trim())return;
    const anchors=loadAnchors();
    // Un seul anchor actif par défaut (remplace)
    anchors.push({lat:center.lat,lng:center.lng,text:text.trim(),ts:Date.now()});
    saveAnchors(anchors);
    renderList();redrawMap();
  });

  bar.querySelector('#act-locate').addEventListener('click',()=>{
    navigator.geolocation?.getCurrentPosition(pos=>{
      _myLat=pos.coords.latitude;_myLng=pos.coords.longitude;
      if(_map)_map.setView([_myLat,_myLng],15);
    },()=>window.YM_toast?.('Geolocation unavailable','warn'),{enableHighAccuracy:true});
  });

  renderList();
  loadLeaflet(()=>setTimeout(setupMap,50));
}

// ── ONGLET EXTRACT ──────────────────────────────────────────────────────────
function renderExtractTab(container){
  container.innerHTML='';
  container.style.cssText='display:flex;flex-direction:column;height:100%;overflow:hidden';

  const circles=loadCircles();
  const anchors=loadAnchors();

  // Sélecteur de zone + filtres
  const ctrl=document.createElement('div');
  ctrl.style.cssText='flex-shrink:0;padding:8px 12px;border-bottom:1px solid var(--border)';
  ctrl.innerHTML=
    '<div style="display:flex;gap:6px;margin-bottom:6px;align-items:center">'+
      '<select id="ext-zone" class="ym-input" style="flex:2;font-size:11px">'+
        (circles.length
          ? circles.map(function(c,i){return '<option value="'+i+'">'+(c.name||'Zone '+(i+1))+'</option>';}).join('')
          : '<option value="">No zones yet</option>')+
      '</select>'+
      '<select id="ext-period" class="ym-input" style="flex:1;font-size:11px">'+
        '<option value="1h">Last hour</option>'+
        '<option value="24h" selected>Last 24h</option>'+
        '<option value="yesterday">Yesterday</option>'+
      '</select>'+
      '<button id="ext-run" class="ym-btn ym-btn-accent" style="font-size:11px;padding:5px 10px">🔍</button>'+
    '</div>'+
    '<div style="display:flex;gap:10px;flex-wrap:wrap">'+
      '<label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--text2);cursor:pointer"><input type="checkbox" id="ext-social" checked> Social</label>'+
      '<label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--text2);cursor:pointer"><input type="checkbox" id="ext-news" checked> News</label>'+
      '<label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--text2);cursor:pointer"><input type="checkbox" id="ext-events" checked> Events</label>'+
      '<label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--text2);cursor:pointer"><input type="checkbox" id="ext-anchors" checked> Anchors</label>'+
    '</div>'+
    '<div id="ext-status" style="font-size:10px;color:var(--text3);margin-top:4px"></div>';
  container.appendChild(ctrl);

  const results=document.createElement('div');
  results.style.cssText='flex:1;overflow-y:auto;padding:8px 12px';
  container.appendChild(results);

  // Affiche les anchors par défaut
  renderAnchors();

  if(!circles.length){
    ctrl.querySelector('#ext-run').disabled=true;
  }

  function renderAnchors(){
    results.innerHTML='';
    if(!anchors.length){
      results.innerHTML='<div style="color:var(--text3);font-size:12px;padding:12px;text-align:center">No anchors yet.<br>Add yours in Zones tab with ✏ My anchor.</div>';
      return;
    }
    anchors.forEach(function(a){
      var el=document.createElement('div');
      el.style.cssText='padding:8px;border-bottom:1px solid rgba(255,255,255,.05);display:flex;gap:8px;align-items:flex-start';
      el.innerHTML=
        '<span style="font-size:16px;flex-shrink:0">👤</span>'+
        '<div><div style="font-size:11px;font-weight:600;color:var(--accent)">My anchor</div>'+
        '<div style="font-size:12px;color:var(--text2);margin-top:2px">'+a.text+'</div>'+
        '<div style="font-size:10px;color:var(--text3)">'+a.lat.toFixed(4)+', '+a.lng.toFixed(4)+'</div></div>';
      results.appendChild(el);
    });
  }

  ctrl.querySelector('#ext-run').addEventListener('click',async function(){
    var zIdx=parseInt(ctrl.querySelector('#ext-zone').value);
    var zone=circles[isNaN(zIdx)?0:zIdx];
    if(!zone){window.YM_toast&&window.YM_toast('Create a zone first','warn');return;}
    var period=ctrl.querySelector('#ext-period').value;
    var wantSocial=ctrl.querySelector('#ext-social').checked;
    var wantNews=ctrl.querySelector('#ext-news').checked;
    var wantEvents=ctrl.querySelector('#ext-events').checked;
    var wantAnchors=ctrl.querySelector('#ext-anchors').checked;

    var status=ctrl.querySelector('#ext-status');
    var periodLabel={'1h':'in the last hour','24h':'in the last 24 hours','yesterday':'yesterday'}[period];
    var types=[wantSocial&&'social media posts',wantNews&&'news articles',wantEvents&&'local events'].filter(Boolean).join(', ')||'content';

    status.textContent='Searching…';
    results.innerHTML='<div style="color:var(--text3);font-size:11px;padding:8px;text-align:center">Loading…</div>';

    // Affiche les anchors en haut si demandé
    if(wantAnchors)(anchors.length||nearAnchors.length)&&renderAnchors();

    try{
      var locDesc=(zone.name||'Zone')+' ('+zone.lat.toFixed(4)+','+zone.lng.toFixed(4)+')';
      var prompt='Search for '+types+' happening at or near '+locDesc+' '+periodLabel+'. Return real results with source, headline, brief summary, and URL. Prioritize hyperlocal and recent content.';

      var resp=await fetch('https://api.anthropic.com/v1/messages',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          model:'claude-sonnet-4-20250514',max_tokens:1500,
          tools:[{type:'web_search_20250305',name:'web_search'}],
          messages:[{role:'user',content:prompt}]
        })
      });
      var data=await resp.json();
      var text=(data.content||[]).filter(function(b){return b.type==='text';}).map(function(b){return b.text;}).join('\n')||'No results.';
      status.textContent='';
      if(!wantAnchors)results.innerHTML='';
      text.split('\n').filter(function(l){return l.trim();}).forEach(function(line){
        var el=document.createElement('div');
        el.style.cssText='padding:7px 0;border-bottom:1px solid rgba(255,255,255,.05);font-size:12px;color:var(--text2);line-height:1.5';
        el.innerHTML=line.replace(/(https?:\/\/[^\s]+)/g,'<a href="$1" target="_blank" style="color:var(--accent);word-break:break-all">$1</a>');
        results.appendChild(el);
      });
    }catch(e){
      status.textContent='Error: '+e.message;
    }
  });
}

// ── SPHERE ─────────────────────────────────────────────────────────────────
window.YM_S['activity.sphere.js']={
  name:'Activity',icon:'📍',category:'Social',
  description:'Geographic zones, anchored messages, and local social extraction',
  emit:[],receive:[],

  activate(ctx){
    _ctx=ctx;
    // Géolocalise dès l'activation
    navigator.geolocation?.getCurrentPosition(pos=>{
      _myLat=pos.coords.latitude;_myLng=pos.coords.longitude;
    },null,{enableHighAccuracy:true,timeout:8000});
  },
  deactivate(){
    _ctx=null;
    if(_map){try{_map.remove();}catch(e){}_map=null;}
  },
  renderPanel
};
})();
