/* cameras.sphere.js — Public live cameras for YourMine
   Uses free public MJPEG streams — no API key needed
*/
(function(){
'use strict';
window.YM_S = window.YM_S || {};

const SPHERE_ID = 'cameras.sphere.js';
let _ctx = null;
let _selected = null;
let _favorites = [];

const DEFAULT_CAMERAS = [
  {id:'buffalo',    name:'Buffalo Trace Distillery',  location:'Kentucky, USA',    icon:'🥃', url:'http://camera.buffalotrace.com/mjpg/video.mjpg'},
  {id:'pendulum',   name:'Physics Pendulum Cam',       location:'Heidelberg, DE',   icon:'⚗️', url:'http://pendelcam.kip.uni-heidelberg.de/mjpg/video.mjpg'},
  {id:'purdue',     name:'Purdue Engineering Mall',    location:'Indiana, USA',      icon:'🎓', url:'http://webcam01.ecn.purdue.edu/mjpg/video.mjpg'},
  {id:'tokyo',      name:'House Stream',               location:'Tokyo, Japan',      icon:'🗼', url:'http://61.211.241.239/nphMotionJpeg?Resolution=320x240&Quality=Standard'},
  {id:'tsumago',    name:'Hills of Tsumago',           location:'Japan',             icon:'⛩️', url:'http://honjin1.miemasu.net/nphMotionJpeg?Resolution=640x480&Quality=Standard'},
  {id:'norway',     name:'Kaiskuru Skistadion',        location:'Norway',            icon:'🎿', url:'http://77.222.181.11:8080/mjpg/video.mjpg'},
  {id:'sweden',     name:'Soltorget Square',           location:'Pajala, Sweden',    icon:'🇸🇪', url:'http://195.196.36.242/mjpg/video.mjpg'},
  {id:'warrenton',  name:'Hills & Beach',              location:'Warrenton, OR, USA',icon:'🏖️', url:'http://47.51.131.147/-wvhttp-01-/GetOneShot?image_size=1280x720&frame_count=1000000000'},
  {id:'piano',      name:'Piano Factory',              location:'Japan',             icon:'🎹', url:'http://takemotopiano.aa1.netvolante.jp:8190/nphMotionJpeg?Resolution=640x480&Quality=Standard&Framerate=30'},
  {id:'hacklab',    name:'Tampere HackLab',            location:'Finland',           icon:'🔧', url:'http://tamperehacklab.tunk.org:38001/nphMotionJpeg?Resolution=640x480&Quality=Clarity'},
];

function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function loadFavorites(){try{return JSON.parse(localStorage.getItem('cameras_favorites')||'[]');}catch{return[];}}
function saveFavorites(){localStorage.setItem('cameras_favorites',JSON.stringify(_favorites));}
function loadCustom(){try{return JSON.parse(localStorage.getItem('cameras_custom')||'[]');}catch{return[];}}
function saveCustom(arr){localStorage.setItem('cameras_custom',JSON.stringify(arr));}

function allCameras(){return [...DEFAULT_CAMERAS,...loadCustom()];}

function renderPanel(container){
  container.innerHTML='';
  container.style.cssText='flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0';
  _favorites=loadFavorites();

  if(_selected){
    renderViewer(container);
    return;
  }
  renderGrid(container);
}

function renderGrid(container){
  // Header
  const header=document.createElement('div');
  header.style.cssText='padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0;display:flex;align-items:center;gap:8px';
  header.innerHTML=
    '<div style="font-family:var(--font-d,inherit);font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(240,168,48,.55);flex:1">Live cameras</div>'+
    '<button id="cam-add-btn" style="background:rgba(240,168,48,.1);border:1px solid rgba(240,168,48,.3);border-radius:6px;color:var(--gold,#f0a830);font-size:11px;padding:4px 10px;cursor:pointer">+ Add</button>';
  container.appendChild(header);

  // Add custom URL form (hidden by default)
  const addForm=document.createElement('div');
  addForm.id='cam-add-form';
  addForm.style.cssText='display:none;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0;gap:6px;flex-direction:column';
  addForm.innerHTML=
    '<input id="cam-url-name" class="ym-input" placeholder="Camera name" style="font-size:11px">'+
    '<input id="cam-url-loc" class="ym-input" placeholder="Location (optional)" style="font-size:11px">'+
    '<input id="cam-url-input" class="ym-input" placeholder="MJPEG URL (http://…)" style="font-size:11px">'+
    '<div style="display:flex;gap:6px">'+
      '<button id="cam-url-save" class="ym-btn ym-btn-accent" style="flex:1;font-size:11px">Add camera</button>'+
      '<button id="cam-url-cancel" class="ym-btn ym-btn-ghost" style="font-size:11px">Cancel</button>'+
    '</div>';
  container.appendChild(addForm);

  header.querySelector('#cam-add-btn').addEventListener('click',()=>{
    addForm.style.display=addForm.style.display==='none'?'flex':'none';
  });
  addForm.querySelector('#cam-url-cancel').addEventListener('click',()=>{addForm.style.display='none';});
  addForm.querySelector('#cam-url-save').addEventListener('click',()=>{
    const name=addForm.querySelector('#cam-url-name').value.trim();
    const loc=addForm.querySelector('#cam-url-loc').value.trim();
    const url=addForm.querySelector('#cam-url-input').value.trim();
    if(!url){if(_ctx)_ctx.toast('Enter a URL','warn');return;}
    const custom=loadCustom();
    const id='custom_'+Date.now();
    custom.push({id,name:name||'Custom Camera',location:loc||'Unknown',icon:'📹',url});
    saveCustom(custom);
    addForm.style.display='none';
    renderPanel(container);
  });

  // Grid
  const scroll=document.createElement('div');
  scroll.style.cssText='flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:10px 10px 0';
  container.appendChild(scroll);

  const grid=document.createElement('div');
  grid.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:8px;padding-bottom:10px';
  scroll.appendChild(grid);

  allCameras().forEach(cam=>{
    const isFav=_favorites.indexOf(cam.id)!==-1;
    const isCustom=cam.id.startsWith('custom_');

    const card=document.createElement('div');
    card.style.cssText='border-radius:10px;overflow:hidden;border:1px solid rgba(255,255,255,.07);cursor:pointer;position:relative;background:rgba(255,255,255,.03);transition:border-color .15s';
    card.innerHTML=
      // Thumbnail — load MJPEG as img
      '<div style="position:relative;padding-top:56.25%;background:#000;overflow:hidden">'+
        '<img src="'+esc(cam.url)+'" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" loading="lazy" onerror="this.style.display=\'none\'">'+
        '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:28px;z-index:1">'+cam.icon+'</div>'+
        '<div style="position:absolute;top:6px;right:6px;z-index:2;display:flex;gap:4px">'+
          '<div id="fav-'+esc(cam.id)+'" style="width:22px;height:22px;border-radius:50%;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;font-size:12px;cursor:pointer">'+(isFav?'⭐':'☆')+'</div>'+
          (isCustom?'<div id="del-'+esc(cam.id)+'" style="width:22px;height:22px;border-radius:50%;background:rgba(255,69,96,.4);display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;cursor:pointer">✕</div>':'')+
        '</div>'+
        '<div style="position:absolute;bottom:0;left:0;right:0;height:24px;background:linear-gradient(transparent,rgba(0,0,0,.7));z-index:1;display:flex;align-items:flex-end;padding:0 6px 4px">'+
          '<div style="width:6px;height:6px;border-radius:50%;background:#ff4560;box-shadow:0 0 4px #ff4560;margin-right:4px;flex-shrink:0"></div>'+
          '<div style="font-size:8px;color:rgba(255,255,255,.8);font-family:var(--font-m,monospace);letter-spacing:.5px">LIVE</div>'+
        '</div>'+
      '</div>'+
      '<div style="padding:7px 8px">'+
        '<div style="font-size:11px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(cam.name)+'</div>'+
        '<div style="font-size:9px;color:var(--text3);margin-top:2px">'+esc(cam.location)+'</div>'+
      '</div>';

    // Favorite toggle
    card.querySelector('#fav-'+cam.id).addEventListener('click',e=>{
      e.stopPropagation();
      const idx=_favorites.indexOf(cam.id);
      if(idx===-1)_favorites.push(cam.id);
      else _favorites.splice(idx,1);
      saveFavorites();
      renderPanel(container);
    });

    // Delete custom
    if(isCustom){
      card.querySelector('#del-'+cam.id).addEventListener('click',e=>{
        e.stopPropagation();
        const custom=loadCustom().filter(c=>c.id!==cam.id);
        saveCustom(custom);
        renderPanel(container);
      });
    }

    // Open viewer
    card.addEventListener('click',()=>{
      _selected=cam;
      renderPanel(container);
    });

    grid.appendChild(card);
  });
}

function renderViewer(container){
  const cam=_selected;

  // Header with back
  const header=document.createElement('div');
  header.style.cssText='padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0;display:flex;align-items:center;gap:10px';
  header.innerHTML=
    '<button id="cam-back" style="background:none;border:none;color:var(--text2);font-size:20px;cursor:pointer;padding:2px 6px">←</button>'+
    '<div style="font-size:13px;font-weight:600;color:var(--text);flex:1">'+esc(cam.icon)+' '+esc(cam.name)+'</div>'+
    '<div style="font-size:9px;color:var(--text3);font-family:var(--font-m,monospace)">'+esc(cam.location)+'</div>'+
    '<div style="width:8px;height:8px;border-radius:50%;background:#ff4560;box-shadow:0 0 6px #ff4560;flex-shrink:0"></div>';
  container.appendChild(header);

  header.querySelector('#cam-back').addEventListener('click',()=>{
    _selected=null;renderPanel(container);
  });

  // Stream
  const streamWrap=document.createElement('div');
  streamWrap.style.cssText='flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#000;overflow:hidden;position:relative';
  container.appendChild(streamWrap);

  // MJPEG as img tag — browser handles the stream natively
  const img=document.createElement('img');
  img.src=cam.url;
  img.alt=cam.name;
  img.style.cssText='max-width:100%;max-height:100%;object-fit:contain';
  img.onerror=()=>{
    streamWrap.innerHTML=''+
      '<div style="text-align:center;padding:32px;font-size:11px;color:rgba(255,255,255,.4);font-family:var(--font-m,monospace);line-height:1.8">'+
        '<div style="font-size:40px;margin-bottom:12px">📷</div>'+
        'Stream unavailable<br>'+
        '<span style="font-size:9px;word-break:break-all;opacity:.5">'+esc(cam.url)+'</span>'+
      '</div>';
  };
  streamWrap.appendChild(img);

  // Timestamp overlay
  const ts=document.createElement('div');
  ts.style.cssText='position:absolute;bottom:8px;right:10px;font-family:var(--font-m,monospace);font-size:9px;color:rgba(255,255,255,.5);letter-spacing:.5px;pointer-events:none';
  streamWrap.appendChild(ts);
  function updateTs(){ts.textContent=new Date().toLocaleTimeString();}
  updateTs();
  const tsTimer=setInterval(updateTs,1000);

  // Copy URL button
  const footer=document.createElement('div');
  footer.style.cssText='padding:8px 14px;border-top:1px solid rgba(255,255,255,.06);flex-shrink:0;display:flex;gap:8px;align-items:center';
  footer.innerHTML=
    '<div style="flex:1;font-size:9px;color:var(--text3);font-family:var(--font-m,monospace);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(cam.url)+'</div>'+
    '<button id="cam-copy-url" class="ym-btn ym-btn-ghost" style="font-size:10px;padding:4px 10px;flex-shrink:0">⎘ Copy URL</button>';
  container.appendChild(footer);

  footer.querySelector('#cam-copy-url').addEventListener('click',()=>{
    navigator.clipboard?.writeText(cam.url).then(()=>{if(_ctx)_ctx.toast('URL copied','success');});
  });

  // Cleanup on deactivate
  const origDeactivate=window.YM_S[SPHERE_ID].deactivate;
  window.YM_S[SPHERE_ID]._viewerCleanup=()=>clearInterval(tsTimer);
}

function broadcastData(){
  if(!_selected)return{};
  return{watching:_selected.name,location:_selected.location};
}

window.YM_S[SPHERE_ID]={
  name:'Cameras',
  icon:'📷',
  category:'Media',
  description:'Live public cameras worldwide — MJPEG streams, no API key needed.',

  activate(ctx){
    _ctx=ctx;
    _favorites=loadFavorites();
  },

  deactivate(){
    if(this._viewerCleanup){this._viewerCleanup();this._viewerCleanup=null;}
    _selected=null;
    _ctx=null;
  },

  renderPanel,
  broadcastData,

  peerSection(container,peerCtx){
    const bd=peerCtx&&peerCtx.profile&&peerCtx.profile.broadcastData;
    const cam=bd&&bd['cameras.sphere.js'];
    if(!cam||!cam.watching){container.innerHTML='<div style="font-size:10px;color:var(--text3)">Not watching</div>';return;}
    container.innerHTML='<div style="font-size:11px;color:var(--text2)">📷 '+esc(cam.watching)+(cam.location?' <span style="color:var(--text3);font-size:9px">'+esc(cam.location)+'</span>':'')+'</div>';
  },
};
})();
