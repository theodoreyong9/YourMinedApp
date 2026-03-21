/* jshint esversion:11, browser:true */
// radio.sphere.js — YourMine Radio
// Widget draggable sur le bureau, lecture background PWA
(function(){
'use strict';
window.YM_S = window.YM_S || {};

const STATE_KEY  = 'ym_radio_state_v1';
const CUSTOM_KEY = 'ym_radio_custom_v1';
const POS_KEY    = 'ym_radio_pos_v1';

const BUILTIN = [
  {name:'FIP',         url:'https://icecast.radiofrance.fr/fip-midfi.mp3',         genre:'Eclectic'},
  {name:'Nova Jazz',   url:'https://novazz.ice.infomaniak.ch/novazz-128.mp3',      genre:'Jazz/Soul'},
  {name:'Groove Salad',url:'https://ice6.somafm.com/groovesalad-128-mp3',          genre:'Ambient'},
  {name:'Drone Zone',  url:'https://ice6.somafm.com/dronezone-128-mp3',            genre:'Drone'},
  {name:'Lush',        url:'https://ice6.somafm.com/lush-128-mp3',                 genre:'Indie Pop'},
  {name:'Lofi Hip-Hop',url:'https://streams.ilovemusic.de/iloveradio17.mp3',       genre:'Lofi'},
  {name:'Chillhop',   url:'https://streams.ilovemusic.de/iloveradio18.mp3',        genre:'Chillhop'},
  {name:'Jazz FM',     url:'https://streaming.radio.co/s6f1f4e490/listen',         genre:'Jazz'},
  {name:'Classical',   url:'https://streaming.radio.co/s5e0e21e58/listen',         genre:'Classical'},
  {name:'BBC World',   url:'https://stream.live.vc.bbcmedia.co.uk/bbc_world_service',genre:'News'},
];

let _ctx=null, _audio=null, _playing=false, _curStation=null, _widget=null, _vol=0.8;

function loadState(){try{return JSON.parse(localStorage.getItem(STATE_KEY)||'{}');}catch(e){return{};}}
function saveState(d){localStorage.setItem(STATE_KEY,JSON.stringify(d));}
function loadCustom(){try{return JSON.parse(localStorage.getItem(CUSTOM_KEY)||'[]');}catch(e){return[];}}
function saveCustom(d){localStorage.setItem(CUSTOM_KEY,JSON.stringify(d));}
function loadPos(){try{return JSON.parse(localStorage.getItem(POS_KEY)||'{"right":12,"bottom":80}');}catch(e){return{right:12,bottom:80};}}
function savePos(p){localStorage.setItem(POS_KEY,JSON.stringify(p));}
function allStations(){return [...BUILTIN,...loadCustom()];}

// ── AUDIO ──────────────────────────────────────────────────────────────────
function getAudio(){
  if(!_audio){
    _audio=document.getElementById('ym-radio-audio');
    if(!_audio){_audio=document.createElement('audio');_audio.id='ym-radio-audio';_audio.style.display='none';document.body.appendChild(_audio);}
  }
  return _audio;
}

function play(station){
  _curStation=station;
  const a=getAudio();
  a.src=station.url;a.volume=_vol;
  a.play().catch(e=>{window.YM_toast?.('Stream error: '+e.message,'error');});
  _playing=true;
  saveState({station,vol:_vol,playing:true});
  _updateMediaSession();
  _refreshWidget();
  _refreshPanel();
}

function stop(){
  const a=getAudio();a.pause();a.src='';
  _playing=false;
  saveState({...(loadState()),playing:false});
  _updateMediaSession();
  _refreshWidget();
  _refreshPanel();
}

function toggle(){if(_playing)stop();else if(_curStation)play(_curStation);}

function nextStation(){
  const all=allStations();
  const idx=_curStation?all.findIndex(s=>s.url===_curStation.url):-1;
  play(all[(idx+1)%all.length]);
}

function prevStation(){
  const all=allStations();
  const idx=_curStation?all.findIndex(s=>s.url===_curStation.url):-1;
  play(all[(idx-1+all.length)%all.length]);
}

// Media Session API — contrôles lock screen / notification PWA
function _updateMediaSession(){
  if(!('mediaSession' in navigator))return;
  navigator.mediaSession.metadata=new MediaMetadata({
    title:_curStation?.name||'Radio',
    artist:_curStation?.genre||'',
    album:'YourMine Radio',
  });
  navigator.mediaSession.playbackState=_playing?'playing':'paused';
  navigator.mediaSession.setActionHandler('play',()=>{if(!_playing&&_curStation)play(_curStation);});
  navigator.mediaSession.setActionHandler('pause',()=>{if(_playing)stop();});
  navigator.mediaSession.setActionHandler('nexttrack',nextStation);
  navigator.mediaSession.setActionHandler('previoustrack',prevStation);
}

// ── WIDGET DRAGGABLE ───────────────────────────────────────────────────────
let _panelRefresh=null; // callback pour rafraîchir le panel si ouvert

function _refreshPanel(){if(_panelRefresh)_panelRefresh();}

function createWidget(){
  if(_widget&&document.body.contains(_widget)){_refreshWidget();return;}
  const pos=loadPos();
  _widget=document.createElement('div');
  _widget.id='ym-radio-widget';
  _widget.style.cssText=
    'position:fixed;z-index:250;'+
    'background:rgba(8,8,15,.92);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);'+
    'border:1px solid rgba(232,160,32,.35);border-radius:14px;'+
    'padding:0;overflow:hidden;'+
    'box-shadow:0 4px 24px rgba(0,0,0,.7);'+
    'touch-action:none;user-select:none;-webkit-user-select:none;'+
    'right:'+pos.right+'px;bottom:'+pos.bottom+'px;width:200px';

  _refreshWidget();
  document.body.appendChild(_widget);

  // Drag
  let dragging=false,ox=0,oy=0,wx=0,wy=0;

  function onMove(cx,cy){
    if(!dragging)return;
    const dx=cx-ox,dy=cy-oy;
    const rect=_widget.getBoundingClientRect();
    const maxX=window.innerWidth-rect.width,maxY=window.innerHeight-rect.height;
    wx=Math.max(0,Math.min(maxX,wx+dx));wy=Math.max(0,Math.min(maxY,wy+dy));
    ox=cx;oy=cy;
    _widget.style.left=wx+'px';_widget.style.top=wy+'px';
    _widget.style.right='';_widget.style.bottom='';
  }

  function onEnd(){
    if(!dragging)return;dragging=false;
    // Sauvegarde position en right/bottom relatifs
    const r=window.innerWidth-wx-_widget.offsetWidth;
    const b=window.innerHeight-wy-_widget.offsetHeight;
    savePos({right:Math.max(0,r),bottom:Math.max(0,b)});
  }

  const dragHandle=_widget.querySelector('#rw-drag')||_widget;
  _widget.addEventListener('pointerdown',e=>{
    if(e.target.closest('button'))return;
    dragging=true;
    const rect=_widget.getBoundingClientRect();
    wx=rect.left;wy=rect.top;
    _widget.style.left=wx+'px';_widget.style.top=wy+'px';
    _widget.style.right='';_widget.style.bottom='';
    ox=e.clientX;oy=e.clientY;
    _widget.setPointerCapture(e.pointerId);
  },{passive:true});
  _widget.addEventListener('pointermove',e=>{if(dragging)onMove(e.clientX,e.clientY);},{passive:true});
  _widget.addEventListener('pointerup',onEnd,{passive:true});
  _widget.addEventListener('pointercancel',onEnd,{passive:true});
}

function _refreshWidget(){
  if(!_widget)return;
  const name=_curStation?.name||'No station';
  const genre=_curStation?.genre||'';
  _widget.innerHTML=
    '<div id="rw-drag" style="display:flex;align-items:center;gap:8px;padding:8px 10px;cursor:grab">'+
      '<span style="font-size:16px">📻</span>'+
      '<div style="flex:1;min-width:0">'+
        '<div style="font-size:11px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+name+'</div>'+
        '<div style="font-size:9px;color:'+(_playing?'var(--accent)':'var(--text3)')+'">'+(_playing?'▶ ON AIR — '+genre:'⏹ stopped')+'</div>'+
      '</div>'+
    '</div>'+
    '<div style="display:flex;align-items:center;justify-content:space-around;padding:4px 8px 8px;gap:4px">'+
      '<button id="rw-prev" style="background:none;border:none;color:var(--text3);font-size:16px;cursor:pointer;padding:4px;line-height:1">⏮</button>'+
      '<button id="rw-pp" style="background:var(--accent);border:none;color:#000;width:32px;height:32px;border-radius:50%;font-size:16px;cursor:pointer;line-height:1;display:flex;align-items:center;justify-content:center">'+(_playing?'⏸':'▶')+'</button>'+
      '<button id="rw-next" style="background:none;border:none;color:var(--text3);font-size:16px;cursor:pointer;padding:4px;line-height:1">⏭</button>'+
      '<button id="rw-open" style="background:none;border:none;color:rgba(232,160,32,.5);font-size:12px;cursor:pointer;padding:4px;line-height:1" title="Open">⬡</button>'+
    '</div>';

  _widget.querySelector('#rw-prev').addEventListener('click',e=>{e.stopPropagation();prevStation();});
  _widget.querySelector('#rw-pp').addEventListener('click',e=>{e.stopPropagation();toggle();});
  _widget.querySelector('#rw-next').addEventListener('click',e=>{e.stopPropagation();nextStation();});
  _widget.querySelector('#rw-open').addEventListener('click',e=>{e.stopPropagation();window.YM?.openSpherePanel?.('radio.sphere.js');});

  // Ré-attache le drag après innerHTML
  _widget.addEventListener('pointerdown',e=>{
    if(e.target.closest('button'))return;
  },{passive:true,once:false});
}

function removeWidget(){if(_widget){_widget.remove();_widget=null;}}

// ── PANEL ──────────────────────────────────────────────────────────────────
function renderPanel(container){
  container.style.cssText='display:flex;flex-direction:column;height:100%';
  container.innerHTML='';

  function refresh(){renderPanel(container);}
  _panelRefresh=refresh;

  // Now playing
  const nowEl=document.createElement('div');
  nowEl.style.cssText='flex-shrink:0;padding:14px 16px;border-bottom:1px solid var(--border);text-align:center';
  container.appendChild(nowEl);

  // Volume
  const volEl=document.createElement('div');
  volEl.style.cssText='flex-shrink:0;display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--border)';
  volEl.innerHTML=
    '<span style="font-size:13px">🔊</span>'+
    '<input type="range" id="rad-vol" min="0" max="1" step="0.05" value="'+_vol+'" style="flex:1;accent-color:var(--accent)">'+
    '<span id="rad-vol-lbl" style="font-size:11px;color:var(--text3);min-width:28px">'+Math.round(_vol*100)+'%</span>';
  container.appendChild(volEl);
  volEl.querySelector('#rad-vol').addEventListener('input',e=>{
    _vol=parseFloat(e.target.value);
    volEl.querySelector('#rad-vol-lbl').textContent=Math.round(_vol*100)+'%';
    if(_audio)_audio.volume=_vol;
    saveState({...(loadState()),vol:_vol});
  });

  // Liste stations
  const list=document.createElement('div');
  list.style.cssText='flex:1;overflow-y:auto';
  container.appendChild(list);

  // Add custom
  const addEl=document.createElement('div');
  addEl.style.cssText='flex-shrink:0;padding:10px 16px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:6px';
  addEl.innerHTML=
    '<div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px">Custom station</div>'+
    '<div style="display:flex;gap:6px">'+
      '<input id="rad-cname" class="ym-input" placeholder="Name" style="flex:1;font-size:11px">'+
      '<input id="rad-curl" class="ym-input" placeholder="Stream URL (.mp3/.aac)" style="flex:2;font-size:11px">'+
      '<button id="rad-cadd" class="ym-btn ym-btn-ghost" style="font-size:11px">Add</button>'+
    '</div>';
  container.appendChild(addEl);
  addEl.querySelector('#rad-cadd').addEventListener('click',()=>{
    const n=addEl.querySelector('#rad-cname').value.trim();
    const u=addEl.querySelector('#rad-curl').value.trim();
    if(!n||!u){window.YM_toast?.('Name and URL required','warn');return;}
    const c=loadCustom();c.push({name:n,url:u,genre:'Custom'});saveCustom(c);
    addEl.querySelector('#rad-cname').value='';addEl.querySelector('#rad-curl').value='';
    renderStations();
  });

  function renderNow(){
    const n=_curStation?.name||'—';
    const g=_curStation?.genre||'';
    nowEl.innerHTML=
      '<div style="font-size:10px;color:var(--text3);margin-bottom:4px">'+(_playing?'▶ NOW PLAYING':'STOPPED')+'</div>'+
      '<div style="font-size:15px;font-weight:600;color:var(--text);margin-bottom:2px">'+n+'</div>'+
      (g?'<div style="font-size:11px;color:var(--text3);margin-bottom:8px">'+g+'</div>':'<div style="height:8px"></div>')+
      '<div style="display:flex;justify-content:center;gap:12px">'+
        '<button id="pnl-prev" style="background:none;border:none;color:var(--text3);font-size:20px;cursor:pointer">⏮</button>'+
        '<button id="pnl-pp" class="ym-btn '+(_playing?'ym-btn-ghost':'ym-btn-accent')+'" style="font-size:14px;padding:6px 18px">'+(_playing?'⏸ Pause':'▶ Play')+'</button>'+
        '<button id="pnl-next" style="background:none;border:none;color:var(--text3);font-size:20px;cursor:pointer">⏭</button>'+
      '</div>';
    nowEl.querySelector('#pnl-prev').addEventListener('click',()=>{prevStation();});
    nowEl.querySelector('#pnl-pp').addEventListener('click',()=>{toggle();});
    nowEl.querySelector('#pnl-next').addEventListener('click',()=>{nextStation();});
  }

  function renderStations(){
    list.innerHTML='';
    allStations().forEach((s,i)=>{
      const isActive=_curStation?.url===s.url;
      const row=document.createElement('div');
      row.style.cssText='display:flex;align-items:center;gap:10px;padding:10px 16px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.04)'+
        (isActive?';background:rgba(232,160,32,.07)':'');
      row.innerHTML=
        '<div style="width:8px;height:8px;border-radius:50%;flex-shrink:0;background:'+(isActive&&_playing?'var(--accent)':'var(--surface3)')+'"></div>'+
        '<div style="flex:1;min-width:0">'+
          '<div style="font-size:13px;font-weight:'+(isActive?600:400)+';overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+s.name+'</div>'+
          (s.genre?'<div style="font-size:10px;color:var(--text3)">'+s.genre+'</div>':'')+
        '</div>'+
        (i>=BUILTIN.length?'<button data-del="'+(i-BUILTIN.length)+'" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:15px;padding:2px 6px">×</button>':'');
      row.addEventListener('click',e=>{
        if(e.target.dataset.del!==undefined)return;
        if(isActive)toggle();else play(s);
        renderNow();renderStations();
      });
      row.querySelector('[data-del]')?.addEventListener('click',e=>{
        e.stopPropagation();
        const c=loadCustom();c.splice(parseInt(e.target.dataset.del),1);saveCustom(c);
        renderStations();
      });
      list.appendChild(row);
    });
  }

  renderNow();
  renderStations();
}

// ── SPHERE ─────────────────────────────────────────────────────────────────
window.YM_S['radio.sphere.js']={
  name:'Radio',icon:'📻',category:'Media',
  description:'Internet radio — background playback, draggable desktop widget',
  emit:[],receive:[],

  activate(ctx){
    _ctx=ctx;
    if(!document.getElementById('ym-radio-css')){
      const s=document.createElement('style');s.id='ym-radio-css';
      s.textContent='@keyframes ym-pulse{0%,100%{opacity:1}50%{opacity:.4}}';
      document.head.appendChild(s);
    }
    const st=loadState();
    _vol=st.vol||0.8;
    if(st.station){_curStation=st.station;if(st.playing)play(st.station);}
    createWidget();
  },

  deactivate(){
    stop();removeWidget();_panelRefresh=null;
    document.getElementById('ym-radio-audio')?.remove();
    _audio=null;_ctx=null;
  },

  renderPanel,

  profileSection(container){
    const n=_curStation?.name||'—';
    const el=document.createElement('div');
    el.style.cssText='display:flex;align-items:center;gap:10px';
    el.innerHTML=
      '<span style="font-size:16px">📻</span>'+
      '<div style="flex:1;font-size:12px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(_playing?'▶ '+n:'⏹ '+n)+'</div>'+
      '<button id="ps-rad-pp" class="ym-btn ym-btn-ghost" style="font-size:11px">'+(_playing?'Stop':'Play')+'</button>'+
      '<button id="ps-rad-nx" class="ym-btn ym-btn-ghost" style="font-size:11px">⏭</button>';
    el.querySelector('#ps-rad-pp').addEventListener('click',()=>{
      if(!_curStation){window.YM?.openSpherePanel?.('radio.sphere.js');return;}
      toggle();
      el.querySelector('#ps-rad-pp').textContent=_playing?'Stop':'Play';
      el.querySelector('div').textContent=_playing?'▶ '+_curStation.name:'⏹ '+(_curStation?.name||'—');
    });
    el.querySelector('#ps-rad-nx').addEventListener('click',()=>{nextStation();});
    container.appendChild(el);
  }
};
})();
