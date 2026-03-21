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

  var circles=loadCircles();
  var anchors=loadAnchors();

  if(!circles.length&&!anchors.length){
    container.innerHTML='<div style="color:var(--text3);font-size:12px;padding:24px;text-align:center">No zones yet.<br>Create zones in the Zones tab.</div>';
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
    '<div style="display:flex;gap:8px;flex-wrap:wrap;font-size:11px">'+
      _mkFilter('anchors','👤 Anchors',true)+
      _mkFilter('wikipedia','📖 Wikipedia',true)+
      _mkFilter('osm','🗺 OSM',true)+
      _mkFilter('flickr','📷 Flickr',true)+
      _mkFilter('reddit','💬 Reddit',true)+
      _mkFilter('events','🎉 Events',true)+
      _mkFilter('mastodon','🐘 Mastodon',true)+
      _mkFilter('web','🌐 Web',true)+
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

    results.innerHTML='<div style="color:var(--text3);font-size:11px;padding:12px;text-align:center">Loading...</div>';
    status.textContent='Fetching...';

    var allItems=[];
    if(filters.anchors){
      anchors.forEach(function(a){
        var inZone=zones.some(function(z){return _dist(a.lat,a.lng,z.lat,z.lng)<=150;});
        if(inZone||zoneIdx==='all'){
          allItems.push({src:'anchors',icon:'👤',title:'My anchor',text:a.text,lat:a.lat,lng:a.lng,ts:a.ts||0,url:null});
        }
      });
    }

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
    allItems.forEach(function(item){
      var el=document.createElement('div');
      el.style.cssText='display:flex;gap:10px;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.05);cursor:'+(item.url?'pointer':'default');
      var thumb=item.thumb
        ?'<img src="'+item.thumb+'" style="width:48px;height:48px;object-fit:cover;border-radius:6px;flex-shrink:0">'
        :'<div style="width:36px;height:36px;border-radius:6px;background:var(--surface3);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">'+item.icon+'</div>';
      el.innerHTML=thumb+
        '<div style="flex:1;min-width:0">'+
          '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">'+
            '<span style="font-size:10px;color:var(--accent);font-weight:600;text-transform:uppercase">'+item.src+'</span>'+
            (item.ts?'<span style="font-size:10px;color:var(--text3)">'+_ago(item.ts)+'</span>':'')+
          '</div>'+
          '<div style="font-size:12px;color:var(--text);font-weight:500;margin-bottom:2px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">'+_esc(item.title||'')+'</div>'+
          (item.text?'<div style="font-size:11px;color:var(--text3);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">'+_esc(item.text)+'</div>':'')+
        '</div>';
      if(item.url){el.addEventListener('click',function(){window.open(item.url,'_blank');});}
      results.appendChild(el);
    });
  }
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
  var items=[],lat=zone.lat,lng=zone.lng,rad=500;
  var periodMs={'1h':3600000,'24h':86400000,'7d':604800000}[period]||86400000;
  var promises=[];

  if(filters.wikipedia){
    promises.push(fetch('https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord='+lat+'%7C'+lng+'&gsradius='+rad+'&gslimit=8&format=json&origin=*')
      .then(function(r){return r.json();}).then(function(d){
        ((d.query&&d.query.geosearch)||[]).forEach(function(p){
          items.push({src:'wikipedia',icon:'📖',title:p.title,url:'https://en.wikipedia.org/wiki/'+encodeURIComponent(p.title),ts:Date.now()-Math.random()*periodMs});
        });
      }).catch(function(){}));
  }

  if(filters.osm){
    var q='[out:json][timeout:10];(node(around:'+rad+','+lat+','+lng+')[name];way(around:'+rad+','+lat+','+lng+')[name];);out body 12;';
    promises.push(fetch('https://overpass-api.de/api/interpreter?data='+encodeURIComponent(q))
      .then(function(r){return r.json();}).then(function(d){
        (d.elements||[]).slice(0,10).forEach(function(e){
          var t=e.tags||{};
          items.push({src:'osm',icon:'🗺',title:t.name||'POI',text:(t.amenity||t.shop||t.tourism||''),
            url:'https://www.openstreetmap.org/'+(e.type||'node')+'/'+e.id,ts:Date.now()-Math.random()*periodMs});
        });
      }).catch(function(){}));
  }

  if(filters.reddit){
    var tmap={'1h':'hour','24h':'day','7d':'week'};
    promises.push(fetch('https://www.reddit.com/search.json?q='+encodeURIComponent(lat.toFixed(2)+' '+lng.toFixed(2))+'&sort=new&limit=5&t='+(tmap[period]||'day'),{headers:{'User-Agent':'YourMine/1.0'}})
      .then(function(r){return r.json();}).then(function(d){
        ((d.data&&d.data.children)||[]).forEach(function(p){
          var post=p.data;
          items.push({src:'reddit',icon:'💬',title:post.title,text:'r/'+post.subreddit,url:'https://reddit.com'+post.permalink,ts:(post.created_utc||0)*1000});
        });
      }).catch(function(){}));
  }

  if(filters.mastodon){
    promises.push(fetch('https://mastodon.social/api/v1/timelines/public?limit=5&local=false')
      .then(function(r){return r.json();}).then(function(d){
        (Array.isArray(d)?d:[]).slice(0,5).forEach(function(s){
          if(!s.language||s.language==='en'||s.language==='fr'){
            var text=s.content.replace(/<[^>]+>/g,'').slice(0,100);
            items.push({src:'mastodon',icon:'🐘',title:(s.account&&s.account.display_name)||'User',text:text,url:s.url,ts:new Date(s.created_at).getTime()});
          }
        });
      }).catch(function(){}));
  }

  if(filters.web){
    promises.push(
      fetch('https://nominatim.openstreetmap.org/reverse?lat='+lat+'&lon='+lng+'&format=json',{headers:{'User-Agent':'YourMine/1.0'}})
      .then(function(r){return r.json();})
      .then(async function(geo){
        var place=geo.display_name?geo.display_name.split(',').slice(0,2).join(',').trim():(lat.toFixed(3)+','+lng.toFixed(3));
        var pLabel={'1h':'in the last hour','24h':'in the last 24 hours','7d':'in the last week'}[period];
        var prompt='Find recent posts and news around "'+place+'" '+pLabel+'. Sources: Twitter/X, Instagram, TikTok, Facebook, local news, blogs. Format each as: SOURCE | TITLE | URL';
        var resp=await fetch('https://api.anthropic.com/v1/messages',{
          method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:800,
            tools:[{type:'web_search_20250305',name:'web_search'}],
            messages:[{role:'user',content:prompt}]})
        });
        var data=await resp.json();
        var text=((data.content||[]).filter(function(b){return b.type==='text';}).map(function(b){return b.text;}).join('\n'));
        text.split('\n').filter(function(l){return l.includes('|');}).forEach(function(line){
          var p=line.split('|').map(function(s){return s.trim();});
          items.push({src:(p[0]||'web').toLowerCase().slice(0,12),icon:'🌐',title:p[1]||line,url:(p[2]&&p[2].startsWith('http'))?p[2]:null,ts:Date.now()-Math.random()*periodMs/2});
        });
      }).catch(function(){})
    );
  }

  await Promise.allSettled(promises);
  return items;
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
