/* jshint esversion:11, browser:true */
// activity.sphere.js — YourMine Activity
(function(){
'use strict';
window.YM_S = window.YM_S || {};

const CIRCLES_KEY  = 'ym_act_circles_v1';
const ANCHORS_KEY  = 'ym_act_anchors_v1';
const SETTINGS_KEY = 'ym_act_settings_v1';

let _ctx=null, _map=null, _myLat=null, _myLng=null;

function loadCircles(){try{return JSON.parse(localStorage.getItem(CIRCLES_KEY)||'[]');}catch(e){return[];}}
function saveCircles(d){localStorage.setItem(CIRCLES_KEY,JSON.stringify(d));}
function loadAnchors(){try{return JSON.parse(localStorage.getItem(ANCHORS_KEY)||'[]');}catch(e){return[];}}
function saveAnchors(d){localStorage.setItem(ANCHORS_KEY,JSON.stringify(d));}
function loadActSettings(){try{return JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}');}catch(e){return{};}}
function saveActSettings(d){localStorage.setItem(SETTINGS_KEY,JSON.stringify(d));}
function getMyProfile(){return _ctx&&_ctx.loadProfile&&_ctx.loadProfile();}

// ── PANEL ──────────────────────────────────────────────────────────────────
function renderPanel(container){
  container.style.cssText='display:flex;flex-direction:column;height:100%';
  container.innerHTML='';

  const TABS=[['zones','📍 Zones'],['extract','🔍 Extract'],['anchors','👤 Anchors'],['settings','⚙']];
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
      else if(id==='extract')renderExtractTab(track);
      else if(id==='anchors')renderAnchorsTab(track);
      else renderActivitySettings(track);
    });
    tabs.appendChild(t);
  });
  container.appendChild(tabs);

  renderZonesTab(track);
}

// ── ONGLET ZONES ────────────────────────────────────────────────────────────
let _watchId=null;
function renderZonesTab(container){
  container.innerHTML='';

  const mapEl=document.createElement('div');
  mapEl.id='act-map';
  mapEl.style.cssText='flex:1;min-height:0;background:var(--surface2)';
  container.appendChild(mapEl);

  // Barre de recherche adresse + locate
  const searchBar=document.createElement('div');
  searchBar.style.cssText='flex-shrink:0;display:flex;gap:6px;padding:6px 10px;border-top:1px solid var(--border);background:var(--surface)';
  searchBar.innerHTML=
    '<input id="act-addr" class="ym-input" placeholder="Search address…" style="flex:1;font-size:11px">'+
    '<button id="act-addr-go" class="ym-btn ym-btn-ghost" style="padding:4px 8px;font-size:12px">→</button>'+
    '<button id="act-locate" class="ym-btn ym-btn-ghost" style="padding:4px 8px;font-size:15px">◎</button>';
  container.appendChild(searchBar);

  // Liste zones + peer anchors
  const listEl=document.createElement('div');
  listEl.style.cssText='flex-shrink:0;max-height:150px;overflow-y:auto;border-top:1px solid var(--border)';
  container.appendChild(listEl);

  // Peer anchors = anchors des utilisateurs nearby dont la position est dans une zone
  function getPeerAnchors(){
    var circles=loadCircles();
    var near=window.YM_Social&&window.YM_Social._nearUsers;
    var result=[];
    if(!near)return result;
    near.forEach(function(u){
      var prof=u.profile||{};
      if(!prof.anchor||!prof.anchor.lat)return;
      var inZone=circles.some(function(z){return _dist(prof.anchor.lat,prof.anchor.lng,z.lat,z.lng)<=150;});
      if(inZone){result.push({name:prof.name||'Unknown',avatar:prof.avatar,text:prof.anchor.text,lat:prof.anchor.lat,lng:prof.anchor.lng,ts:prof.anchor.ts,uuid:prof.uuid,profile:prof});}
    });
    result.sort(function(a,b){return (b.ts||0)-(a.ts||0);});
    return result;
  }

  function renderList(){
    listEl.innerHTML='';
    var circles=loadCircles();
    var myAnchor=loadAnchors()[0];
    var peerAnchors=getPeerAnchors();

    if(!circles.length&&!myAnchor&&!peerAnchors.length){
      listEl.innerHTML='<div style="color:var(--text3);font-size:11px;padding:6px 12px">Tap map to add a zone. Set your anchor in your Profile.</div>';
      return;
    }

    // Zones
    circles.forEach(function(c,i){
      var row=document.createElement('div');
      row.style.cssText='display:flex;align-items:center;gap:8px;padding:5px 12px;border-bottom:1px solid rgba(255,255,255,.04);cursor:pointer';
      row.innerHTML=
        '<span>📍</span>'+
        '<span style="flex:1;font-size:12px">'+(c.name||'Zone '+(i+1))+'</span>'+
        '<span style="font-size:10px;color:var(--text3)">'+c.lat.toFixed(4)+','+c.lng.toFixed(4)+'</span>'+
        '<button data-del="'+i+'" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:14px;padding:0 2px">×</button>';
      row.addEventListener('click',function(e){if(e.target.dataset.del!==undefined)return;if(_map)_map.setView([c.lat,c.lng],17);});
      row.querySelector('[data-del]').addEventListener('click',function(e){
        e.stopPropagation();var arr=loadCircles();arr.splice(i,1);saveCircles(arr);renderList();redrawMap();
      });
      listEl.appendChild(row);
    });

    // Mon anchor
    if(myAnchor){
      var myRow=document.createElement('div');
      myRow.style.cssText='display:flex;align-items:center;gap:8px;padding:5px 12px;border-bottom:1px solid rgba(255,255,255,.04);cursor:pointer;background:rgba(232,160,32,.04)';
      myRow.innerHTML=
        '<span>👤</span>'+
        '<span style="flex:1;font-size:12px;color:var(--accent)">Me: '+myAnchor.text.slice(0,40)+'</span>'+
        '<span style="font-size:10px;color:var(--text3)">↗ Profile</span>';
      myRow.addEventListener('click',function(){window.YM&&window.YM.openPanel&&window.YM.openPanel('panel-profile');});
      listEl.appendChild(myRow);
    }

    // Peer anchors in zones
    if(peerAnchors.length){
      var hdr=document.createElement('div');
      hdr.style.cssText='font-size:9px;color:var(--text3);padding:4px 12px;text-transform:uppercase;letter-spacing:1px';
      hdr.textContent='Nearby anchors in zones';
      listEl.appendChild(hdr);
      peerAnchors.forEach(function(a){
        var row=document.createElement('div');
        row.style.cssText='display:flex;align-items:center;gap:8px;padding:5px 12px;border-bottom:1px solid rgba(255,255,255,.04);cursor:pointer';
        var av=a.avatar?'<img src="'+a.avatar+'" style="width:22px;height:22px;border-radius:50%;object-fit:cover">':'<div style="width:22px;height:22px;border-radius:50%;background:var(--surface3);display:flex;align-items:center;justify-content:center;font-size:11px">'+(a.name.charAt(0)||'?')+'</div>';
        row.innerHTML=
          av+
          '<div style="flex:1;min-width:0">'+
            '<div style="font-size:11px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+a.name+'</div>'+
            '<div style="font-size:10px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+a.text+'</div>'+
          '</div>'+
          '<div style="font-size:9px;color:var(--text3)">'+_ago(a.ts)+'</div>';
        row.addEventListener('click',function(){
          if(_map)_map.setView([a.lat,a.lng],17);
          if(a.profile)window.YM&&window.YM.openProfilePanel&&window.YM.openProfilePanel(a.profile);
        });
        listEl.appendChild(row);
      });
    }
  }

  // ── Carte ────────────────────────────────────────────────────────────────
  function redrawMap(){
    if(!_map)return;
    var L=window.L;
    _map.eachLayer(function(l){if(!(l instanceof L.TileLayer))_map.removeLayer(l);});

    // Zones
    loadCircles().forEach(function(c){
      var circle=L.circle([c.lat,c.lng],{radius:100,color:'#e8a020',fillColor:'#e8a020',fillOpacity:0.18,weight:2}).addTo(_map);
      circle.bindPopup(
        '<b style="font-size:13px">'+(c.name||'Zone')+'</b>'+
        '<br><small>'+c.lat.toFixed(5)+', '+c.lng.toFixed(5)+'</small>'+
        '<br><button class="pop-del" style="margin-top:6px;background:#e84040;color:#fff;border:none;border-radius:4px;padding:2px 10px;cursor:pointer;font-size:11px">Delete</button>'
      );
      circle.on('popupopen',function(){
        document.querySelector('.pop-del')&&document.querySelector('.pop-del').addEventListener('click',function(){
          saveCircles(loadCircles().filter(function(x){return !(x.lat===c.lat&&x.lng===c.lng);}));
          renderList();redrawMap();circle.closePopup();
        });
      });
    });

    // Mon anchor
    var prof=getMyProfile()||{};
    loadAnchors().forEach(function(a){
      var ava=prof.avatar?
        '<img src="'+prof.avatar+'" style="width:30px;height:30px;border-radius:50%;object-fit:cover;border:2px solid var(--accent)">':
        '<div style="width:30px;height:30px;border-radius:50%;background:var(--accent);color:#000;display:flex;align-items:center;justify-content:center;font-size:14px">'+(prof.name&&prof.name.charAt(0)||'👤')+'</div>';
      var icon=L.divIcon({className:'',
        html:'<div style="position:relative;filter:drop-shadow(0 2px 6px rgba(0,0,0,.6))">'+ava+
          '<div style="position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);background:rgba(8,8,15,.9);color:var(--accent);font-size:9px;white-space:nowrap;padding:1px 5px;border-radius:3px;border:1px solid var(--accent)">'+
          a.text.slice(0,20)+(a.text.length>20?'…':'')+'</div></div>',
        iconSize:[30,50],iconAnchor:[15,30]});
      L.marker([a.lat,a.lng],{icon}).addTo(_map)
        .bindPopup('<div style="max-width:200px"><b>'+(prof.name||'Me')+'</b><br><small>'+a.text+'</small></div>');
    });

    // Peer anchors
    getPeerAnchors().forEach(function(a){
      var ava=a.avatar?
        '<img src="'+a.avatar+'" style="width:26px;height:26px;border-radius:50%;object-fit:cover;border:2px solid rgba(48,232,128,.7)">':
        '<div style="width:26px;height:26px;border-radius:50%;background:#30e880;color:#000;display:flex;align-items:center;justify-content:center;font-size:12px">'+(a.name.charAt(0)||'?')+'</div>';
      var icon=L.divIcon({className:'',
        html:'<div style="position:relative;filter:drop-shadow(0 2px 6px rgba(0,0,0,.6))">'+ava+
          '<div style="position:absolute;bottom:-16px;left:50%;transform:translateX(-50%);background:rgba(8,8,15,.9);color:#30e880;font-size:9px;white-space:nowrap;padding:1px 4px;border-radius:3px">'+
          a.text.slice(0,18)+(a.text.length>18?'…':'')+'</div></div>',
        iconSize:[26,44],iconAnchor:[13,26]});
      L.marker([a.lat,a.lng],{icon}).addTo(_map)
        .bindPopup('<div style="max-width:200px"><b>'+a.name+'</b><br><small>'+a.text+'</small></div>');
    });
  }

  function setupMap(){
    if(document.getElementById('act-map')!==mapEl)return;
    if(_map){try{_map.remove();}catch(e){}_map=null;}
    var L=window.L;
    _map=L.map('act-map',{zoomControl:true,attributionControl:false});
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:19}).addTo(_map);
    window._actMapCenter=_map.getCenter();
    _map.on('moveend',function(){window._actMapCenter=_map.getCenter();});
    redrawMap();

    _map.on('click',function(e){
      var lat=e.latlng.lat,lng=e.latlng.lng;
      var name=prompt('Zone name (Enter to skip):');
      if(name===null)return;
      var circles=loadCircles();
      circles.push({lat,lng,name:name.trim()||('Zone '+(circles.length+1)),radius:100,ts:Date.now()});
      saveCircles(circles);renderList();redrawMap();
    });

    // Vue initiale
    if(_myLat!==null){
      _map.setView([_myLat,_myLng],15);redrawMap();
    }else{
      navigator.geolocation&&navigator.geolocation.getCurrentPosition(function(pos){
        _myLat=pos.coords.latitude;_myLng=pos.coords.longitude;
        _map.setView([_myLat,_myLng],15);redrawMap();
      },function(){
        var circles=loadCircles();
        if(circles.length)_map.setView([circles[0].lat,circles[0].lng],15);
        else _map.setView([20,0],2);
      },{timeout:5000,enableHighAccuracy:true});
    }
  }

  function loadLeaflet(cb){
    if(window.L){cb();return;}
    if(!document.getElementById('leaflet-css')){
      var l=document.createElement('link');l.id='leaflet-css';l.rel='stylesheet';
      l.href='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';document.head.appendChild(l);
    }
    if(window.L){cb();return;}
    if(!document.getElementById('leaflet-js')){
      var s=document.createElement('script');s.id='leaflet-js';
      s.src='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
      s.onload=cb;document.head.appendChild(s);
    }else{var t=setInterval(function(){if(window.L){clearInterval(t);cb();}},100);}
  }

  // Recherche adresse via Nominatim
  function searchAddress(q){
    if(!q.trim()||!_map)return;
    fetch('https://nominatim.openstreetmap.org/search?q='+encodeURIComponent(q)+'&format=json&limit=1',{headers:{'User-Agent':'YourMine/1.0'}})
      .then(function(r){return r.json();})
      .then(function(d){
        if(!d.length){window.YM_toast&&window.YM_toast('Address not found','warn');return;}
        var lat=parseFloat(d[0].lat),lng=parseFloat(d[0].lon);
        _map.setView([lat,lng],16);
      }).catch(function(){window.YM_toast&&window.YM_toast('Search failed','error');});
  }

  searchBar.querySelector('#act-addr-go').addEventListener('click',function(){
    searchAddress(searchBar.querySelector('#act-addr').value);
  });
  searchBar.querySelector('#act-addr').addEventListener('keydown',function(e){
    if(e.key==='Enter')searchAddress(e.target.value);
  });
  searchBar.querySelector('#act-locate').addEventListener('click',function(){
    navigator.geolocation&&navigator.geolocation.getCurrentPosition(function(pos){
      _myLat=pos.coords.latitude;_myLng=pos.coords.longitude;
      if(_map)_map.setView([_myLat,_myLng],15);
    },null,{enableHighAccuracy:true});
  });

  renderList();
  loadLeaflet(function(){setTimeout(setupMap,50);});
}

// ── ONGLET ANCHORS ──────────────────────────────────────────────────────────
function renderAnchorsTab(container){
  container.innerHTML='';
  container.style.cssText='display:flex;flex-direction:column;height:100%;overflow:hidden';

  var anchors=loadAnchors();
  var circles=loadCircles();

  const hdr=document.createElement('div');
  hdr.style.cssText='flex-shrink:0;padding:10px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between';
  hdr.innerHTML=
    '<div style="font-size:11px;color:var(--text3)">Your anchor message — attached to your profile at a location</div>'+
    '<button id="anch-edit" class="ym-btn ym-btn-ghost" style="font-size:11px;padding:4px 10px">'+(anchors.length?'✏ Edit':'+ Add')+'</button>';
  container.appendChild(hdr);

  const body=document.createElement('div');
  body.style.cssText='flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:10px';
  container.appendChild(body);

  function refresh(){
    body.innerHTML='';
    anchors=loadAnchors();
    if(!anchors.length){
      body.innerHTML='<div style="color:var(--text3);font-size:12px;padding:16px;text-align:center">No anchor yet.<br>Click + Add to attach a message to your location.</div>';
      return;
    }
    anchors.forEach(function(a,i){
      var inZone=circles.some(function(z){return _dist(a.lat,a.lng,z.lat,z.lng)<=150;});
      var card=document.createElement('div');
      card.className='ym-card';
      card.innerHTML=
        '<div style="display:flex;align-items:flex-start;gap:10px">'+
          '<span style="font-size:24px;flex-shrink:0">👤</span>'+
          '<div style="flex:1;min-width:0">'+
            '<div style="font-size:13px;color:var(--text);line-height:1.5;margin-bottom:6px">'+_esc(a.text)+'</div>'+
            '<div style="font-size:10px;color:var(--text3)">'+a.lat.toFixed(5)+', '+a.lng.toFixed(5)+
              (inZone?' · <span style="color:#30e880">in a zone</span>':' · <span style="color:#e84040">outside zones</span>')+
            '</div>'+
            '<div style="font-size:10px;color:var(--text3)">'+new Date(a.ts||0).toLocaleString()+'</div>'+
          '</div>'+
          '<div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">'+
            '<button data-view="'+i+'" class="ym-btn ym-btn-ghost" style="font-size:11px;padding:3px 8px">🗺</button>'+
            '<button data-del="'+i+'" class="ym-btn ym-btn-ghost" style="font-size:11px;padding:3px 8px;color:#e84040">×</button>'+
          '</div>'+
        '</div>';
      card.querySelector('[data-view]').addEventListener('click',function(){
        // Ouvre l'onglet Zones et navigue sur l'anchor
        // On stocke les coords à centrer pour que renderZonesTab les utilise
        window._actJumpTo={lat:a.lat,lng:a.lng};
        var zonesTab=container.closest('[id]')&&document.querySelector('.ym-tab[data-tab="zones"]');
        zonesTab&&zonesTab.click();
      });
      card.querySelector('[data-del]').addEventListener('click',function(e){
        var arr=loadAnchors();arr.splice(parseInt(e.target.dataset.del),1);saveAnchors(arr);refresh();
      });
      body.appendChild(card);
    });
  }
  refresh();

  hdr.querySelector('#anch-edit').addEventListener('click',function(){
    // Overlay d'édition
    var overlay=document.createElement('div');
    overlay.style.cssText='position:fixed;inset:0;z-index:9990;background:rgba(0,0,0,.7);display:flex;align-items:flex-end;justify-content:center';
    var box=document.createElement('div');
    box.style.cssText='background:var(--surface2);border-radius:var(--r-lg) var(--r-lg) 0 0;padding:20px;width:100%;max-width:500px;max-height:80vh;overflow-y:auto';
    var existing=anchors.length?anchors[0]:{text:'',lat:_myLat||0,lng:_myLng||0};
    box.innerHTML=
      '<div style="font-size:13px;font-weight:600;margin-bottom:12px">My Anchor</div>'+
      '<textarea id="anch-text" class="ym-input" style="width:100%;height:80px;resize:none;font-size:13px;margin-bottom:10px" placeholder="Message attached to your profile at your current location…">'+_esc(existing.text)+'</textarea>'+
      '<div style="display:flex;gap:8px">'+
        '<button id="anch-use-pos" class="ym-btn ym-btn-ghost" style="flex:1;font-size:12px">📍 Use my position</button>'+
        '<button id="anch-use-map" class="ym-btn ym-btn-ghost" style="flex:1;font-size:12px">🗺 Use map center</button>'+
      '</div>'+
      '<div id="anch-coords" style="font-size:10px;color:var(--text3);margin:6px 0">'+existing.lat.toFixed(5)+', '+existing.lng.toFixed(5)+'</div>'+
      '<div style="display:flex;gap:8px;margin-top:8px">'+
        '<button id="anch-cancel" class="ym-btn ym-btn-ghost" style="flex:1">Cancel</button>'+
        '<button id="anch-save" class="ym-btn ym-btn-accent" style="flex:1">Save Anchor</button>'+
      '</div>';
    overlay.appendChild(box);document.body.appendChild(overlay);

    var lat=existing.lat,lng=existing.lng;
    box.querySelector('#anch-coords').textContent=lat.toFixed(5)+', '+lng.toFixed(5);

    box.querySelector('#anch-use-pos').addEventListener('click',function(){
      navigator.geolocation&&navigator.geolocation.getCurrentPosition(function(pos){
        lat=pos.coords.latitude;lng=pos.coords.longitude;
        box.querySelector('#anch-coords').textContent=lat.toFixed(5)+', '+lng.toFixed(5);
      });
    });
    box.querySelector('#anch-use-map').addEventListener('click',function(){
      if(window._actMapCenter){lat=window._actMapCenter.lat;lng=window._actMapCenter.lng;}
      box.querySelector('#anch-coords').textContent=lat.toFixed(5)+', '+lng.toFixed(5);
    });
    box.querySelector('#anch-cancel').addEventListener('click',function(){overlay.remove();});
    overlay.addEventListener('click',function(e){if(e.target===overlay)overlay.remove();});
    box.querySelector('#anch-save').addEventListener('click',function(){
      var text=box.querySelector('#anch-text').value.trim();
      if(!text){window.YM_toast&&window.YM_toast('Enter a message','warn');return;}
      // Un seul anchor par profil
      saveAnchors([{lat:lat,lng:lng,text:text,ts:Date.now()}]);
      overlay.remove();
      hdr.querySelector('#anch-edit').textContent='✏ Edit';
      refresh();
      window.YM_toast&&window.YM_toast('Anchor saved','success');
    });
  });
}

// ── ONGLET EXTRACT ──────────────────────────────────────────────────────────
function renderExtractTab(container){
  container.innerHTML='';
  container.style.cssText='display:flex;flex-direction:column;height:100%;overflow:hidden';

  var circles=loadCircles();

  if(!circles.length){
    container.innerHTML='<div style="color:var(--text3);font-size:12px;padding:24px;text-align:center">No zones yet.<br>Create zones in the Zones tab first.</div>';
    return;
  }

  var ctrl=document.createElement('div');
  ctrl.style.cssText='flex-shrink:0;padding:8px 12px;border-bottom:1px solid var(--border)';
  ctrl.innerHTML=
    '<div style="display:flex;gap:6px;margin-bottom:6px;align-items:center;flex-wrap:wrap">'+
      '<select id="ext-zone" class="ym-input" style="flex:2;min-width:100px;font-size:11px">'+
        '<option value="all">All zones</option>'+
        circles.map(function(c,i){return '<option value="'+i+'">'+(c.name||'Zone '+(i+1))+'</option>';}).join('')+
      '</select>'+
      '<select id="ext-period" class="ym-input" style="flex:1;min-width:80px;font-size:11px">'+
        '<option value="1h">Last hour</option>'+
        '<option value="24h" selected>Last 24h</option>'+
        '<option value="7d">Last week</option>'+
      '</select>'+
    '</div>'+
    '<div style="display:flex;gap:6px;flex-wrap:wrap;font-size:11px">'+
      _mkFilter('wikipedia','📖 Wiki',true)+
      _mkFilter('flickr','📷 Flickr',true)+
      _mkFilter('nitter','🐦 Twitter',true)+
      _mkFilter('youtube','📹 YouTube',true)+
      _mkFilter('reddit','💬 Reddit',true)+
      _mkFilter('mastodon','🐘 Mastodon',true)+
      _mkFilter('pixelfed','🖼 Pixelfed',true)+
      _mkFilter('osmnotes','📝 OSM Notes',true)+
      _mkFilter('yelp','⭐ Yelp/FSQ',true)+
    '</div>'+
    '<div id="ext-status" style="font-size:10px;color:var(--text3);margin-top:4px;min-height:14px"></div>';
  container.appendChild(ctrl);

  var results=document.createElement('div');
  results.style.cssText='flex:1;overflow-y:auto;padding:0';
  container.appendChild(results);

  runExtract();
  ctrl.querySelectorAll('select,input[type=checkbox]').forEach(function(el){
    el.addEventListener('change',runExtract);
  });

  async function runExtract(){
    var zoneIdx=ctrl.querySelector('#ext-zone').value;
    var period=ctrl.querySelector('#ext-period').value;
    var status=ctrl.querySelector('#ext-status');
    var zones=zoneIdx==='all'?circles:[circles[parseInt(zoneIdx)]].filter(Boolean);
    var filters={};
    ctrl.querySelectorAll('input[type=checkbox]').forEach(function(cb){filters[cb.dataset.src]=cb.checked;});

    results.innerHTML='<div style="color:var(--text3);font-size:11px;padding:12px;text-align:center">Loading…</div>';
    status.textContent='Fetching…';

    var allItems=[];
    var promises=zones.map(function(zone){return _fetchAllSources(zone,period,filters);});
    var zoneResults=await Promise.allSettled(promises);
    zoneResults.forEach(function(r){if(r.status==='fulfilled'&&r.value)allItems=allItems.concat(r.value);});
    allItems.sort(function(a,b){return (b.ts||0)-(a.ts||0);});

    status.textContent=allItems.length+' results';
    results.innerHTML='';
    if(!allItems.length){
      results.innerHTML='<div style="color:var(--text3);font-size:12px;padding:16px;text-align:center">No results for these zones and filters.</div>';
      return;
    }
    allItems.forEach(function(item){_renderItem(results,item);});
  }
}

function _renderItem(results,item){
  var el=document.createElement('div');
  el.style.cssText='padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.05);cursor:'+(item.url?'pointer':'default');

  var hdr='<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">'+
    '<span style="font-size:10px;color:var(--accent);font-weight:700;text-transform:uppercase;letter-spacing:.5px">'+_esc(item.src)+'</span>'+
    (item.author?'<span style="font-size:10px;color:var(--text3)">@'+_esc(item.author)+'</span>':'')+
    (item.ts?'<span style="font-size:10px;color:var(--text3);margin-left:auto">'+_ago(item.ts)+'</span>':'')+
  '</div>';

  var title=item.title?'<div style="font-size:13px;color:var(--text);font-weight:600;margin-bottom:4px;line-height:1.4">'+_esc(item.title)+'</div>':'';
  var body=item.text?'<div style="font-size:12px;color:var(--text2);line-height:1.6;margin-bottom:6px;white-space:pre-wrap">'+_esc(item.text)+'</div>':'';

  var media='';
  if(item.media&&item.media.length){
    var cols=Math.min(item.media.length,3);
    if(item.media.length===1){
      var m=item.media[0];
      media=m.type==='video'
        ?'<video src="'+m.url+'" poster="'+(m.thumb||'')+'" controls style="width:100%;border-radius:8px;max-height:220px;background:#000;margin-bottom:4px"></video>'
        :'<img src="'+m.url+'" style="width:100%;border-radius:8px;max-height:260px;object-fit:cover;display:block;margin-bottom:4px" loading="lazy" onerror="this.style.display=\'none\'">';
    }else{
      media='<div style="display:grid;grid-template-columns:repeat('+cols+',1fr);gap:2px;border-radius:8px;overflow:hidden;margin-bottom:6px">';
      item.media.forEach(function(m){
        media+=m.type==='video'
          ?'<video src="'+m.url+'" poster="'+(m.thumb||'')+'" controls style="width:100%;height:110px;object-fit:cover;background:#000"></video>'
          :'<img src="'+m.url+'" style="width:100%;height:110px;object-fit:cover" loading="lazy" onerror="this.style.display=\'none\'">';
      });
      media+='</div>';
    }
  }else if(item.thumb){
    media='<img src="'+item.thumb+'" style="width:100%;border-radius:8px;max-height:200px;object-fit:cover;display:block;margin-bottom:4px" loading="lazy" onerror="this.style.display=\'none\'">';
  }

  var link=item.url?'<a href="'+item.url+'" target="_blank" style="font-size:10px;color:var(--accent);word-break:break-all;display:block;margin-top:4px">'+item.url.slice(0,72)+(item.url.length>72?'…':'')+'</a>':'';

  el.innerHTML=hdr+title+body+media+link;
  if(item.url){el.addEventListener('click',function(e){if(!e.target.closest('a,video'))window.open(item.url,'_blank');});}
  results.appendChild(el);
}

function _mkFilter(src,label,checked){
  return '<label style="display:flex;align-items:center;gap:3px;cursor:pointer;color:var(--text2);white-space:nowrap">'+
    '<input type="checkbox" data-src="'+src+'"'+(checked?' checked':'')+'>'+label+'</label>';
}
function _esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function _dist(lat1,lng1,lat2,lng2){
  var R=6371000,dLat=(lat2-lat1)*Math.PI/180,dLng=(lng2-lng1)*Math.PI/180;
  var a=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function _ago(ts){
  var d=Date.now()-ts;
  if(d<3600000)return Math.floor(d/60000)+'m';
  if(d<86400000)return Math.floor(d/3600000)+'h';
  return Math.floor(d/86400000)+'d';
}

async function _fetchAllSources(zone,period,filters){
  var items=[],lat=zone.lat,lng=zone.lng,rad=1000;
  var periodMs={'1h':3600000,'24h':86400000,'7d':604800000}[period]||86400000;
  var pLabel={'1h':'in the last hour','24h':'in the last 24 hours','7d':'in the last week'}[period];
  var promises=[];

  // ── Wikipedia geosearch — vraiment géolocalisé ────────────────────────────
  if(filters.wikipedia){
    promises.push(
      fetch('https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord='+lat+'%7C'+lng+'&gsradius='+rad+'&gslimit=10&format=json&origin=*')
      .then(function(r){return r.json();}).then(function(d){
        ((d.query&&d.query.geosearch)||[]).forEach(function(p){
          items.push({src:'wikipedia',icon:'📖',title:p.title,
            url:'https://en.wikipedia.org/wiki/'+encodeURIComponent(p.title),
            ts:Date.now()-Math.random()*periodMs});
        });
      }).catch(function(){})
    );
  }

  // ── Flickr geo feed — photos géolocalisées publiques ─────────────────────
  if(filters.flickr){
    promises.push(
      fetch('https://api.flickr.com/services/feeds/geo/?lat='+lat+'&lon='+lng+'&radius=1&format=json&nojsoncallback=1')
      .then(function(r){return r.json();}).then(function(d){
        (d.items||[]).slice(0,10).forEach(function(e){
          var imgUrl=e.media&&e.media.m?e.media.m.replace('_m.','_b.'):null;
          items.push({src:'flickr',icon:'📷',
            title:e.title||'Photo',
            author:e.author?e.author.replace(/.*\(|\).*/g,''):'',
            text:e.description?e.description.replace(/<[^>]+>/g,'').slice(0,120):'',
            url:e.link,
            media:imgUrl?[{type:'image',url:imgUrl,thumb:e.media&&e.media.m}]:[],
            thumb:e.media&&e.media.m||null,
            ts:e.date_taken?new Date(e.date_taken).getTime():Date.now()-Math.random()*periodMs});
        });
      }).catch(function(){})
    );
  }

  // ── Yelp Fusion — businesses/reviews locaux ──────────────────────────────
  if(filters.yelp){
    var yelpKey=loadActSettings().yelpKey||'';
    if(yelpKey){
      promises.push(
        fetch('https://api.yelp.com/v3/businesses/search?latitude='+lat+'&longitude='+lng+'&radius=500&sort_by=rating&limit=8',
          {headers:{'Authorization':'Bearer '+yelpKey,'Accept':'application/json'}})
        .then(function(r){return r.json();}).then(function(d){
          (d.businesses||[]).forEach(function(b){
            items.push({src:'yelp',icon:'⭐',title:b.name,
              text:(b.categories||[]).map(function(c){return c.title;}).join(', ')+(b.rating?' · ★'+b.rating:''),
              thumb:b.image_url||null,url:b.url,ts:Date.now()-Math.random()*periodMs});
          });
        }).catch(function(){})
      );
    }else{
      var fsqKey=loadActSettings().foursquareKey||'';
      if(fsqKey){
        promises.push(
          fetch('https://api.foursquare.com/v3/places/search?ll='+lat+','+lng+'&radius=500&limit=8&sort=RELEVANCE',
            {headers:{'Accept':'application/json','Authorization':fsqKey}})
          .then(function(r){return r.json();}).then(function(d){
            (d.results||[]).forEach(function(p){
              items.push({src:'foursquare',icon:'📍',title:p.name,
                text:(p.categories||[]).map(function(c){return c.name;}).join(', '),
                url:p.link?'https://foursquare.com'+p.link:null,ts:Date.now()-Math.random()*periodMs});
            });
          }).catch(function(){})
        );
      }
    }
  }

  // ── Nitter — Twitter via instance publique + RSS ──────────────────────────
  if(filters.nitter){
    var nitterBase=loadActSettings().nitterInstance||'';
    if(nitterBase){
      // Recherche par hashtag lieu via Nitter RSS
      promises.push(
        fetch('https://nominatim.openstreetmap.org/reverse?lat='+lat+'&lon='+lng+'&format=json&zoom=14',{headers:{'User-Agent':'YourMine/1.0'}})
        .then(function(r){return r.json();}).then(async function(geo){
          var city=(geo.address&&(geo.address.city||geo.address.town||geo.address.village||geo.address.suburb))||'';
          if(!city)return;
          var tag=city.toLowerCase().replace(/[^a-z0-9]/g,'');
          var rss=nitterBase.replace(/\/$/,'')+'/search/rss?f=tweets&q=%23'+encodeURIComponent(tag)+'&since_id=&max_position=&lang=';
          var txt=await fetch(rss).then(function(r){return r.text();});
          var parser=new DOMParser();
          var doc=parser.parseFromString(txt,'application/xml');
          Array.from(doc.querySelectorAll('item')).slice(0,8).forEach(function(it){
            var title=it.querySelector('title')&&it.querySelector('title').textContent||'';
            var link=it.querySelector('link')&&it.querySelector('link').textContent||'';
            var desc=it.querySelector('description')&&it.querySelector('description').textContent.replace(/<[^>]+>/g,'').slice(0,160)||'';
            var pubDate=it.querySelector('pubDate')&&it.querySelector('pubDate').textContent||'';
            var imgMatch=it.querySelector('description')&&it.querySelector('description').textContent.match(/src="([^"]+)"/);
            var media=imgMatch?[{type:'image',url:imgMatch[1]}]:[];
            items.push({src:'twitter',icon:'🐦',title:title,text:desc,url:link,media:media,ts:pubDate?new Date(pubDate).getTime():Date.now()-Math.random()*periodMs});
          });
        }).catch(function(){})
      );
    }
  }

  // ── Piped/Invidious — YouTube vidéos géolocalisées ────────────────────────
  if(filters.youtube){
    var pipedBase=loadActSettings().pipedInstance||'https://pipedapi.kavin.rocks';
    promises.push(
      fetch('https://nominatim.openstreetmap.org/reverse?lat='+lat+'&lon='+lng+'&format=json&zoom=12',{headers:{'User-Agent':'YourMine/1.0'}})
      .then(function(r){return r.json();}).then(async function(geo){
        var city=(geo.address&&(geo.address.city||geo.address.town||geo.address.village))||'';
        if(!city)return;
        var d=await fetch(pipedBase.replace(/\/$/,'')+'/search?q='+encodeURIComponent(city)+'&filter=videos').then(function(r){return r.json();});
        (d.items||[]).slice(0,6).forEach(function(v){
          if(!v.url)return;
          items.push({src:'youtube',icon:'📹',title:v.title||'',
            author:v.uploaderName||'',
            thumb:v.thumbnail||null,
            media:v.thumbnail?[{type:'image',url:v.thumbnail}]:[],
            url:'https://www.youtube.com'+v.url,
            ts:v.uploadedDate?Date.now()-parseInt(v.uploadedDate)*86400000:Date.now()-Math.random()*periodMs});
        });
      }).catch(function(){})
    );
  }

  // ── Teddit/Libreddit — Reddit via instance alternative ────────────────────
  if(filters.reddit){
    var tedditBase=loadActSettings().tedditInstance||'';
    promises.push(
      fetch('https://nominatim.openstreetmap.org/reverse?lat='+lat+'&lon='+lng+'&format=json&zoom=14',{headers:{'User-Agent':'YourMine/1.0'}})
      .then(function(r){return r.json();}).then(async function(geo){
        var city=(geo.address&&(geo.address.city||geo.address.town||geo.address.village||geo.address.suburb))||'';
        if(!city)return;
        var tmap={'1h':'hour','24h':'day','7d':'week'};
        var searchUrl=tedditBase
          ? tedditBase.replace(/\/$/,'')+'/search.json?q='+encodeURIComponent(city)+'&sort=new&t='+(tmap[period]||'day')
          : 'https://www.reddit.com/search.json?q='+encodeURIComponent(city)+'&sort=new&limit=8&t='+(tmap[period]||'day');
        var d=await fetch(searchUrl,{headers:{'User-Agent':'YourMine/1.0'}}).then(function(r){return r.json();});
        ((d.data&&d.data.children)||[]).forEach(function(p){
          var post=p.data;
          var media=[];
          if(post.preview&&post.preview.images&&post.preview.images[0]){
            var img=post.preview.images[0].source;
            if(img&&img.url)media.push({type:'image',url:img.url.replace(/&amp;/g,'&')});
          }
          var baseUrl=tedditBase?tedditBase.replace(/\/$/,''):'https://reddit.com';
          items.push({src:'reddit',icon:'💬',title:post.title,
            text:'r/'+post.subreddit+' · '+post.score+' pts'+(post.selftext?'\n'+post.selftext.slice(0,200):''),
            url:baseUrl+post.permalink,media:media,ts:(post.created_utc||0)*1000});
        });
      }).catch(function(){})
    );
  }

  // ── Mastodon — recherche par ville géocodée ───────────────────────────────
  if(filters.mastodon){
    var mastodonBase=loadActSettings().mastodonInstance||'https://mastodon.social';
    promises.push(
      fetch('https://nominatim.openstreetmap.org/reverse?lat='+lat+'&lon='+lng+'&format=json&zoom=12',{headers:{'User-Agent':'YourMine/1.0'}})
      .then(function(r){return r.json();}).then(async function(geo){
        var city=(geo.address&&(geo.address.city||geo.address.town||geo.address.village))||'';
        if(!city)return;
        var d=await fetch(mastodonBase.replace(/\/$/,'')+'/api/v2/search?q='+encodeURIComponent(city)+'&type=statuses&limit=8').then(function(r){return r.json();});
        (d.statuses||[]).forEach(function(s){
          var text=s.content.replace(/<[^>]+>/g,'').slice(0,160);
          var media=(s.media_attachments||[]).map(function(m){return{type:m.type==='video'||m.type==='gifv'?'video':'image',url:m.url,thumb:m.preview_url};});
          items.push({src:'mastodon',icon:'🐘',title:(s.account&&s.account.display_name)||'',
            author:(s.account&&s.account.acct)||'',text:text,url:s.url,media:media,
            thumb:s.account&&s.account.avatar||null,ts:new Date(s.created_at).getTime()});
        });
      }).catch(function(){})
    );
  }

  // ── Pixelfed — réseau social photo décentralisé ───────────────────────────
  if(filters.pixelfed){
    var pixelfedBase=loadActSettings().pixelfedInstance||'https://pixelfed.social';
    promises.push(
      fetch(pixelfedBase.replace(/\/$/,'')+'/api/v1/timelines/public?limit=8',{headers:{'Accept':'application/json'}})
      .then(function(r){return r.json();}).then(function(d){
        (Array.isArray(d)?d:[]).slice(0,8).forEach(function(s){
          var media=(s.media_attachments||[]).map(function(m){return{type:'image',url:m.url,thumb:m.preview_url||m.url};});
          if(!media.length)return;
          items.push({src:'pixelfed',icon:'🖼',title:(s.account&&s.account.display_name)||'',
            author:(s.account&&s.account.acct)||'',
            text:(s.content||'').replace(/<[^>]+>/g,'').slice(0,120),
            url:s.url,media:media,ts:new Date(s.created_at||0).getTime()});
        });
      }).catch(function(){})
    );
  }

  // ── OSM Notes — notes géolocalisées publiques ─────────────────────────────
  if(filters.osmnotes){
    var bbox=(lat-0.01)+','+(lng-0.01)+','+(lat+0.01)+','+(lng+0.01);
    promises.push(
      fetch('https://api.openstreetmap.org/api/0.6/notes.json?bbox='+bbox+'&limit=10&closed=0')
      .then(function(r){return r.json();}).then(function(d){
        ((d.features)||[]).forEach(function(f){
          var comment=f.properties&&f.properties.comments&&f.properties.comments[0];
          items.push({src:'osm notes',icon:'📝',
            title:comment&&comment.text?comment.text.slice(0,80):'OSM Note',
            text:comment&&comment.text||'',
            url:'https://www.openstreetmap.org/note/'+f.properties.id,
            ts:f.properties.date_created?new Date(f.properties.date_created).getTime():Date.now()-Math.random()*periodMs});
        });
      }).catch(function(){})
    );
  }

  await Promise.allSettled(promises);

  // Déduplication par URL
  var seen=new Set();
  return items.filter(function(item){
    var key=item.url||item.title;
    if(!key||seen.has(key))return false;
    seen.add(key);return true;
  });
}

// ── SETTINGS ─────────────────────────────────────────────────────────────────
function renderActivitySettings(container){
  container.innerHTML='';
  container.style.cssText='flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px';
  var s=loadActSettings();

  function mkField(title,key,placeholder,helpUrl,helpLabel,isKey){
    var val=s[key]||'';
    var card=document.createElement('div');card.className='ym-card';
    card.innerHTML=
      '<div class="ym-card-title">'+title+'</div>'+
      (helpUrl?'<div style="font-size:10px;color:var(--text3);margin-bottom:6px">Get at <a href="'+helpUrl+'" target="_blank" style="color:var(--accent)">'+helpLabel+'</a></div>':'')+
      '<div style="display:flex;gap:6px">'+
        '<input class="sf-inp ym-input" type="'+(isKey?'password':'text')+'" placeholder="'+placeholder+'" style="flex:1;font-size:11px;font-family:var(--font-m)" value="'+(val&&isKey?'•'.repeat(14):esc(val))+'">'+
        '<button class="sf-save ym-btn ym-btn-accent" style="font-size:11px;padding:4px 10px">Save</button>'+
        (val?'<button class="sf-clear ym-btn ym-btn-ghost" style="font-size:11px;color:#e84040;padding:4px 8px">×</button>':'')+
      '</div>'+
      '<div class="sf-st" style="font-size:10px;margin-top:4px;color:'+(val?'#30e880':'var(--text3)')+'">'+
        (val?'✓ '+esc(val.slice(0,40)):'Not set — optional')+'</div>';
    var inp=card.querySelector('.sf-inp');
    if(isKey)inp.addEventListener('focus',function(){if(s[key])inp.value='';});
    card.querySelector('.sf-save').addEventListener('click',function(){
      var v=inp.value.trim();if(!v)return;
      var u=loadActSettings();u[key]=v;saveActSettings(u);s=u;
      if(isKey)inp.value='•'.repeat(14);
      card.querySelector('.sf-st').textContent='✓ '+(isKey?'Saved':v.slice(0,40));
      card.querySelector('.sf-st').style.color='#30e880';
    });
    card.querySelector('.sf-clear')?.addEventListener('click',function(){
      var u=loadActSettings();delete u[key];saveActSettings(u);s=u;
      inp.value='';card.querySelector('.sf-st').textContent='Not set — optional';
      card.querySelector('.sf-st').style.color='';
    });
    return card;
  }

  var intro=document.createElement('div');intro.className='ym-notice info';intro.style.cssText='font-size:11px';
  intro.innerHTML='Configure alternative frontends and API keys. Leave blank to use defaults or disable a source. <b>Instances must support CORS.</b>';
  container.appendChild(intro);

  // Groupe : Alternative frontends
  var g1=document.createElement('div');g1.innerHTML='<div style="font-size:10px;color:var(--accent);font-weight:700;letter-spacing:1px;text-transform:uppercase;margin:4px 0">🔄 Alternative Frontends</div>';
  container.appendChild(g1);
  container.appendChild(mkField('🐦 Nitter instance (Twitter)','nitterInstance','https://nitter.net','https://github.com/zedeus/nitter/wiki/Instances','instances list',false));
  container.appendChild(mkField('📹 Piped instance (YouTube)','pipedInstance','https://pipedapi.kavin.rocks','https://github.com/TeamPiped/Piped/wiki/Instances','instances list',false));
  container.appendChild(mkField('💬 Teddit instance (Reddit)','tedditInstance','https://teddit.net','https://codeberg.org/teddit/teddit','codeberg.org/teddit',false));
  container.appendChild(mkField('🐘 Mastodon instance','mastodonInstance','https://mastodon.social','https://instances.social','instances.social',false));
  container.appendChild(mkField('🖼 Pixelfed instance','pixelfedInstance','https://pixelfed.social','https://pixelfed.social/site/about','pixelfed.social',false));

  // Groupe : API keys
  var g2=document.createElement('div');g2.innerHTML='<div style="font-size:10px;color:var(--accent);font-weight:700;letter-spacing:1px;text-transform:uppercase;margin:8px 0 4px">🔑 API Keys (optional)</div>';
  container.appendChild(g2);
  container.appendChild(mkField('⭐ Yelp API Key','yelpKey','Bearer token…','https://www.yelp.com/developers','yelp.com/developers',true));
  container.appendChild(mkField('📍 Foursquare API Key','foursquareKey','fsq3…','https://developer.foursquare.com','developer.foursquare.com',true));
}

// ── SPHERE ─────────────────────────────────────────────────────────────────
window.YM_S['activity.sphere.js']={
  name:'Activity',icon:'📍',category:'Social',
  description:'Geographic zones, local content extraction, anchored presence',
  emit:['lat','lng'],receive:[],

  activate(ctx){
    _ctx=ctx;
    // Géolocalise dès l'activation et met à jour l'anchor
    function updatePos(pos){
      _myLat=pos.coords.latitude;_myLng=pos.coords.longitude;
      // Met à jour l'anchor existant avec la nouvelle position
      var anchors=loadAnchors();
      if(anchors.length){
        anchors[0].lat=_myLat;anchors[0].lng=_myLng;anchors[0].updated=Date.now();
        saveAnchors(anchors);
      }
    }
    navigator.geolocation?.getCurrentPosition(updatePos,null,{enableHighAccuracy:true,timeout:8000});
    // Suivi continu
    _watchId=navigator.geolocation?.watchPosition(updatePos,null,{enableHighAccuracy:true,maximumAge:30000});
  },

  deactivate(){
    if(_watchId!=null){navigator.geolocation?.clearWatch(_watchId);_watchId=null;}
    _ctx=null;
    if(_map){try{_map.remove();}catch(e){}_map=null;}
  },

  renderPanel,

  // ── Config anchor dans le profil ──────────────────────────────────────────
  profileSection(container){
    var anchor=loadAnchors()[0]||null;
    var wrap=document.createElement('div');
    wrap.style.cssText='display:flex;flex-direction:column;gap:6px';

    var statusRow=document.createElement('div');
    statusRow.style.cssText='display:flex;align-items:center;gap:8px';
    statusRow.innerHTML=
      '<span style="font-size:16px">📍</span>'+
      '<div style="flex:1;min-width:0">'+
        '<div style="font-size:12px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+
          (anchor?anchor.text:'No anchor set')+
        '</div>'+
        '<div style="font-size:10px;color:var(--text3)">'+
          (anchor?'Follows your position · Last: '+new Date(anchor.updated||anchor.ts||0).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'Visible to nearby users in your zones')+
        '</div>'+
      '</div>'+
      '<button id="act-ps-edit" class="ym-btn ym-btn-ghost" style="font-size:11px;padding:4px 8px;flex-shrink:0">'+(anchor?'✏ Edit':'+ Set')+'</button>';
    wrap.appendChild(statusRow);

    if(anchor){
      var clearBtn=document.createElement('button');
      clearBtn.className='ym-btn ym-btn-ghost';
      clearBtn.style.cssText='font-size:10px;color:#e84040;align-self:flex-end';
      clearBtn.textContent='Remove anchor';
      clearBtn.addEventListener('click',function(){
        saveAnchors([]);
        wrap.remove();
        // Rerender
        window.YM_Profile&&window.YM_Profile.render();
      });
      wrap.appendChild(clearBtn);
    }

    wrap.querySelector('#act-ps-edit').addEventListener('click',function(){
      var overlay=document.createElement('div');
      overlay.style.cssText='position:fixed;inset:0;z-index:9990;background:rgba(0,0,0,.75);display:flex;align-items:flex-end;justify-content:center';
      var box=document.createElement('div');
      box.style.cssText='background:var(--surface2);border-radius:var(--r-lg) var(--r-lg) 0 0;padding:20px;width:100%;max-width:500px';
      box.innerHTML=
        '<div style="font-size:13px;font-weight:600;margin-bottom:12px">My Anchor</div>'+
        '<div style="font-size:11px;color:var(--text3);margin-bottom:10px">This message is attached to your current GPS position and visible to nearby users in Activity zones.</div>'+
        '<textarea id="act-anchor-text" class="ym-input" style="width:100%;height:80px;resize:none;font-size:13px;margin-bottom:10px" placeholder="What\'s happening here? Share a message anchored to your location…">'+((anchor&&anchor.text)||'')+'</textarea>'+
        '<div style="display:flex;gap:8px">'+
          '<button id="act-anch-cancel" class="ym-btn ym-btn-ghost" style="flex:1">Cancel</button>'+
          '<button id="act-anch-save" class="ym-btn ym-btn-accent" style="flex:1">Save</button>'+
        '</div>';
      overlay.appendChild(box);document.body.appendChild(overlay);
      overlay.addEventListener('click',function(e){if(e.target===overlay)overlay.remove();});
      box.querySelector('#act-anch-cancel').addEventListener('click',function(){overlay.remove();});
      box.querySelector('#act-anch-save').addEventListener('click',function(){
        var text=box.querySelector('#act-anchor-text').value.trim();
        if(!text){window.YM_toast&&window.YM_toast('Enter a message','warn');return;}
        var lat=_myLat||0,lng=_myLng||0;
        saveAnchors([{lat,lng,text,ts:Date.now(),updated:Date.now()}]);
        overlay.remove();
        window.YM_toast&&window.YM_toast('Anchor saved','success');
        // Rerender profile section
        window.YM_Profile&&window.YM_Profile.render();
      });
    });

    container.appendChild(wrap);
  },

  // Données broadcastées avec le profil social
  broadcastData(){
    var anchors=loadAnchors();
    if(!anchors.length)return{};
    return{anchor:{text:anchors[0].text,lat:anchors[0].lat,lng:anchors[0].lng,ts:anchors[0].updated||anchors[0].ts}};
  }
};
})();
