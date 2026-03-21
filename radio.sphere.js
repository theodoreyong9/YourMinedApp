/* jshint esversion:11, browser:true */
// radio.sphere.js — YourMine Radio
// Widget sur le bureau, lecture en arrière-plan PWA
(function(){
'use strict';
window.YM_S = window.YM_S || {};

const STATE_KEY = 'ym_radio_state_v1';
const CUSTOM_KEY = 'ym_radio_custom_v1';

const BUILTIN_STATIONS = [
  {name:'FIP',       url:'https://icecast.radiofrance.fr/fip-midfi.mp3',      genre:'Eclectic'},
  {name:'Nova',      url:'https://novazz.ice.infomaniak.ch/novazz-128.mp3',   genre:'Jazz/Soul'},
  {name:'Jazz FM',   url:'https://streaming.radio.co/s6f1f4e490/listen',      genre:'Jazz'},
  {name:'Groove Salad',url:'https://ice6.somafm.com/groovesalad-128-mp3',     genre:'Ambient'},
  {name:'Drone Zone',url:'https://ice6.somafm.com/dronezone-128-mp3',         genre:'Drone'},
  {name:'Lush',      url:'https://ice6.somafm.com/lush-128-mp3',              genre:'Indie'},
  {name:'Lofi Hip-Hop',url:'https://streams.ilovemusic.de/iloveradio17.mp3',  genre:'Lofi'},
  {name:'Chillhop',  url:'https://streams.ilovemusic.de/iloveradio18.mp3',    genre:'Chillhop'},
  {name:'Klasik',    url:'https://streaming.radio.co/s5e0e21e58/listen',      genre:'Classical'},
  {name:'BBC World', url:'https://stream.live.vc.bbcmedia.co.uk/bbc_world_service',genre:'News'},
];

let _ctx = null;
let _audio = null;
let _playing = false;
let _curStation = null;
let _widget = null;
let _vol = 0.8;

function loadState(){try{return JSON.parse(localStorage.getItem(STATE_KEY)||'{}');}catch(e){return{};}}
function saveState(d){localStorage.setItem(STATE_KEY,JSON.stringify(d));}
function loadCustom(){try{return JSON.parse(localStorage.getItem(CUSTOM_KEY)||'[]');}catch(e){return[];}}
function saveCustom(d){localStorage.setItem(CUSTOM_KEY,JSON.stringify(d));}
function allStations(){return [...BUILTIN_STATIONS,...loadCustom()];}

function getOrCreateAudio(){
  if(!_audio){
    _audio=document.getElementById('ym-radio-audio');
    if(!_audio){
      _audio=document.createElement('audio');
      _audio.id='ym-radio-audio';
      _audio.style.display='none';
      _audio.volume=_vol;
      document.body.appendChild(_audio);
    }
  }
  return _audio;
}

function play(station){
  _curStation=station;
  const a=getOrCreateAudio();
  a.src=station.url;
  a.volume=_vol;
  a.play().catch(e=>window.YM_toast?.('Stream error: '+e.message,'error'));
  _playing=true;
  saveState({station:station,vol:_vol,playing:true});
  updateWidget();
}

function stop(){
  const a=getOrCreateAudio();
  a.pause();a.src='';
  _playing=false;
  saveState({...(loadState()),playing:false});
  updateWidget();
}

function toggle(){if(_playing)stop();else if(_curStation)play(_curStation);}

// ── WIDGET BUREAU ──────────────────────────────────────────────────────────
function createWidget(){
  if(_widget&&document.body.contains(_widget))return;
  _widget=document.createElement('div');
  _widget.id='ym-radio-widget';
  _widget.style.cssText=
    'position:fixed;bottom:calc(var(--dock-h,60px) + var(--safe-b,0px) + 40px);right:12px;'+
    'z-index:250;background:rgba(8,8,15,.88);backdrop-filter:blur(16px);'+
    'border:1px solid rgba(232,160,32,.3);border-radius:12px;'+
    'padding:8px 12px;display:flex;align-items:center;gap:10px;'+
    'box-shadow:0 4px 20px rgba(0,0,0,.6);min-width:180px;max-width:240px;'+
    'cursor:default;user-select:none;-webkit-user-select:none';
  document.body.appendChild(_widget);
  updateWidget();
}

function updateWidget(){
  if(!_widget)return;
  const name=_curStation?.name||'Radio';
  const genre=_curStation?.genre||'';
  _widget.innerHTML=
    '<div style="flex:1;min-width:0">'+
      '<div style="font-size:11px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+name+'</div>'+
      (_playing?'<div style="font-size:9px;color:var(--accent);animation:ym-pulse 1.5s infinite">▶ ON AIR</div>':'<div style="font-size:9px;color:var(--text3)">Stopped</div>')+
    '</div>'+
    '<button id="ym-radio-playpause" style="background:none;border:none;color:var(--accent);font-size:20px;cursor:pointer;padding:0;line-height:1">'+(_playing?'⏸':'▶')+'</button>'+
    '<button id="ym-radio-open" style="background:none;border:none;color:var(--text3);font-size:14px;cursor:pointer;padding:0;line-height:1" title="Open Radio">⬡</button>';
  _widget.querySelector('#ym-radio-playpause').addEventListener('click',toggle);
  _widget.querySelector('#ym-radio-open').addEventListener('click',()=>{
    window.YM?.openSpherePanel?.('radio.sphere.js');
  });
}

function removeWidget(){
  if(_widget){_widget.remove();_widget=null;}
}

// ── PANEL ──────────────────────────────────────────────────────────────────
function renderPanel(container){
  container.style.cssText='display:flex;flex-direction:column;height:100%';
  container.innerHTML='';

  // Now playing header
  const nowPlaying=document.createElement('div');
  nowPlaying.id='radio-now';
  nowPlaying.style.cssText='padding:16px;border-bottom:1px solid var(--border);flex-shrink:0;text-align:center';
  container.appendChild(nowPlaying);

  // Volume
  const volRow=document.createElement('div');
  volRow.style.cssText='display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--border);flex-shrink:0';
  volRow.innerHTML=
    '<span style="font-size:13px">🔊</span>'+
    '<input type="range" id="radio-vol" min="0" max="1" step="0.05" value="'+_vol+'" style="flex:1;accent-color:var(--accent)">'+
    '<span id="radio-vol-label" style="font-size:11px;color:var(--text3);min-width:28px">'+Math.round(_vol*100)+'%</span>';
  container.appendChild(volRow);
  volRow.querySelector('#radio-vol').addEventListener('input',e=>{
    _vol=parseFloat(e.target.value);
    volRow.querySelector('#radio-vol-label').textContent=Math.round(_vol*100)+'%';
    if(_audio)_audio.volume=_vol;
    saveState({...(loadState()),vol:_vol});
  });

  // Liste stations
  const list=document.createElement('div');
  list.style.cssText='flex:1;overflow-y:auto;padding:8px 0';
  container.appendChild(list);

  // Add custom station
  const addRow=document.createElement('div');
  addRow.style.cssText='padding:10px 16px;border-top:1px solid var(--border);flex-shrink:0;display:flex;flex-direction:column;gap:6px';
  addRow.innerHTML=
    '<div style="font-size:11px;color:var(--text3)">Add custom station</div>'+
    '<div style="display:flex;gap:6px">'+
      '<input id="rad-name" class="ym-input" placeholder="Name" style="flex:1;font-size:11px">'+
      '<input id="rad-url" class="ym-input" placeholder="Stream URL" style="flex:2;font-size:11px">'+
      '<button id="rad-add" class="ym-btn ym-btn-ghost" style="font-size:11px">Add</button>'+
    '</div>';
  container.appendChild(addRow);

  function renderNow(){
    const name=_curStation?.name||'—';
    const genre=_curStation?.genre||'';
    nowPlaying.innerHTML=
      '<div style="font-size:11px;color:var(--text3);margin-bottom:4px">'+(_playing?'▶ NOW PLAYING':'STOPPED')+'</div>'+
      '<div style="font-size:16px;font-weight:600;color:var(--text);margin-bottom:2px">'+name+'</div>'+
      (genre?'<div style="font-size:11px;color:var(--text3)">'+genre+'</div>':'')+
      '<button id="radio-main-toggle" class="ym-btn '+ (_playing?'ym-btn-ghost':'ym-btn-accent')+'" style="margin-top:10px;font-size:13px">'+
        (_playing?'⏹ Stop':'▶ Play')+
      '</button>';
    nowPlaying.querySelector('#radio-main-toggle').addEventListener('click',()=>{
      toggle();renderNow();renderList();
    });
  }

  function renderList(){
    list.innerHTML='';
    allStations().forEach((s,i)=>{
      const isActive=_curStation?.name===s.name&&_curStation?.url===s.url;
      const row=document.createElement('div');
      row.style.cssText='display:flex;align-items:center;gap:10px;padding:10px 16px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.04)'+
        (isActive?';background:rgba(232,160,32,.08)':'');
      row.innerHTML=
        '<div style="width:8px;height:8px;border-radius:50%;background:'+(isActive&&_playing?'var(--accent)':'var(--surface3)')+';flex-shrink:0"></div>'+
        '<div style="flex:1;min-width:0">'+
          '<div style="font-size:13px;font-weight:'+(isActive?'600':'400')+';color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+s.name+'</div>'+
          (s.genre?'<div style="font-size:10px;color:var(--text3)">'+s.genre+'</div>':'')+
        '</div>'+
        (i>=BUILTIN_STATIONS.length?'<button data-del="'+(i-BUILTIN_STATIONS.length)+'" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:14px">×</button>':'');
      row.addEventListener('click',e=>{
        if(e.target.dataset.del!==undefined)return;
        if(isActive){toggle();}else{play(s);}
        renderNow();renderList();
      });
      const delBtn=row.querySelector('[data-del]');
      if(delBtn)delBtn.addEventListener('click',e=>{
        e.stopPropagation();
        const custom=loadCustom();custom.splice(parseInt(e.target.dataset.del),1);saveCustom(custom);
        renderList();
      });
      list.appendChild(row);
    });
  }

  addRow.querySelector('#rad-add').addEventListener('click',()=>{
    const name=addRow.querySelector('#rad-name').value.trim();
    const url=addRow.querySelector('#rad-url').value.trim();
    if(!name||!url){window.YM_toast?.('Name and URL required','warn');return;}
    const custom=loadCustom();custom.push({name,url,genre:'Custom'});saveCustom(custom);
    addRow.querySelector('#rad-name').value='';addRow.querySelector('#rad-url').value='';
    renderList();
  });

  renderNow();renderList();
}

// ── SPHERE ─────────────────────────────────────────────────────────────────
window.YM_S['radio.sphere.js']={
  name:'Radio',
  icon:'📻',
  category:'Media',
  description:'Internet radio — plays in background when PWA is minimized',
  author:'yourmine',
  emit:[],receive:[],

  activate(ctx){
    _ctx=ctx;
    // Restaure l'état précédent
    const s=loadState();
    _vol=s.vol||0.8;
    if(s.station){
      _curStation=s.station;
      if(s.playing)play(s.station);
    }
    // Ajoute le CSS d'animation pulse si pas encore là
    if(!document.getElementById('ym-radio-css')){
      const style=document.createElement('style');
      style.id='ym-radio-css';
      style.textContent='@keyframes ym-pulse{0%,100%{opacity:1}50%{opacity:.4}}';
      document.head.appendChild(style);
    }
    createWidget();
  },

  deactivate(){
    stop();removeWidget();
    const a=document.getElementById('ym-radio-audio');
    if(a)a.remove();
    _audio=null;_ctx=null;
  },

  renderPanel,

  // Bouton dans le dépliant profile : statut + raccourci play/stop
  profileSection(container){
    const name=_curStation?.name||'—';
    const el=document.createElement('div');
    el.style.cssText='display:flex;align-items:center;gap:10px';
    el.innerHTML=
      '<div style="flex:1;font-size:12px;color:var(--text2)">'+(name==='—'?'No station selected':(_playing?'▶ '+name:'⏹ '+name))+'</div>'+
      '<button id="ps-radio-toggle" class="ym-btn ym-btn-ghost" style="font-size:11px">'+(_playing?'Stop':'Play')+'</button>';
    el.querySelector('#ps-radio-toggle').addEventListener('click',()=>{
      if(!_curStation){window.YM?.openSpherePanel?.('radio.sphere.js');return;}
      toggle();
      el.querySelector('#ps-radio-toggle').textContent=_playing?'Stop':'Play';
    });
    container.appendChild(el);
  }
};
})();
