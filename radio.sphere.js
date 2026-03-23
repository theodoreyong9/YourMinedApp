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
  // ── France ──────────────────────────────────────────────────────────────
  {name:'FIP',           url:'https://icecast.radiofrance.fr/fip-midfi.mp3',              genre:'Eclectic',     country:'🇫🇷'},
  {name:'France Inter',  url:'https://icecast.radiofrance.fr/franceinter-midfi.mp3',      genre:'Talk/Music',   country:'🇫🇷'},
  {name:'France Info',   url:'https://icecast.radiofrance.fr/franceinfo-midfi.mp3',       genre:'News',         country:'🇫🇷'},
  {name:'France Culture',url:'https://icecast.radiofrance.fr/franceculture-midfi.mp3',    genre:'Culture',      country:'🇫🇷'},
  {name:'France Musique',url:'https://icecast.radiofrance.fr/francemusique-midfi.mp3',    genre:'Classical',    country:'🇫🇷'},
  {name:'Nova',          url:'https://novazz.ice.infomaniak.ch/novazz-128.mp3',           genre:'Jazz/Soul',    country:'🇫🇷'},
  {name:'Mouv\'',        url:'https://icecast.radiofrance.fr/mouv-midfi.mp3',             genre:'Hip-Hop',      country:'🇫🇷'},
  {name:'TSF Jazz',      url:'https://tsfjazz.ice.infomaniak.ch/tsfjazz-high.mp3',        genre:'Jazz',         country:'🇫🇷'},
  // ── UK ──────────────────────────────────────────────────────────────────
  {name:'BBC Radio 1',   url:'https://stream.live.vc.bbcmedia.co.uk/bbc_radio_one',       genre:'Pop/Chart',    country:'🇬🇧'},
  {name:'BBC Radio 2',   url:'https://stream.live.vc.bbcmedia.co.uk/bbc_radio_two',       genre:'Easy Listening',country:'🇬🇧'},
  {name:'BBC Radio 3',   url:'https://stream.live.vc.bbcmedia.co.uk/bbc_radio_three',     genre:'Classical',    country:'🇬🇧'},
  {name:'BBC Radio 4',   url:'https://stream.live.vc.bbcmedia.co.uk/bbc_radio_four_fm',   genre:'Talk',         country:'🇬🇧'},
  {name:'BBC World',     url:'https://stream.live.vc.bbcmedia.co.uk/bbc_world_service',   genre:'News',         country:'🇬🇧'},
  {name:'BBC 6 Music',   url:'https://stream.live.vc.bbcmedia.co.uk/bbc_6music',          genre:'Alternative',  country:'🇬🇧'},
  {name:'Jazz FM UK',    url:'https://streaming.radio.co/s6f1f4e490/listen',              genre:'Jazz',         country:'🇬🇧'},
  // ── USA ─────────────────────────────────────────────────────────────────
  {name:'NPR News',      url:'https://npr-ice.streamguys1.com/live.mp3',                  genre:'News/Talk',    country:'🇺🇸'},
  {name:'KCRW',          url:'https://kcrw.streamguys1.com/kcrw_192k_mp3_on_air',         genre:'Indie/World',  country:'🇺🇸'},
  {name:'WNYC',          url:'https://fm939.wnyc.org/wnycfm-tunein.aac',                  genre:'Public Radio',  country:'🇺🇸'},
  // ── Germany ─────────────────────────────────────────────────────────────
  {name:'Deutschlandfunk',url:'https://st01.sslstream.dlf.de/dlf/01/128/mp3/stream.mp3', genre:'Culture/Talk', country:'🇩🇪'},
  {name:'Bayern 3',      url:'https://br-br3-live.cast.addradio.de/br/br3/live/mp3/128/stream.mp3',genre:'Pop',country:'🇩🇪'},
  // ── Spain ────────────────────────────────────────────────────────────────
  {name:'Radio Nacional',url:'https://rne.rtveradio.cires21.com/rne1.mp3',               genre:'Talk',         country:'🇪🇸'},
  {name:'Cadena SER',    url:'https://playerservices.streamtheworld.com/api/livestream-redirect/SER_SPAIN_SC',genre:'Talk',country:'🇪🇸'},
  // ── Internet / Genre ─────────────────────────────────────────────────────
  {name:'Groove Salad',  url:'https://ice6.somafm.com/groovesalad-128-mp3',               genre:'Ambient',      country:'🌐'},
  {name:'Drone Zone',    url:'https://ice6.somafm.com/dronezone-128-mp3',                 genre:'Drone',        country:'🌐'},
  {name:'Lush',          url:'https://ice6.somafm.com/lush-128-mp3',                      genre:'Indie Pop',    country:'🌐'},
  {name:'Indie Pop Rocks',url:'https://ice6.somafm.com/indiepop-128-mp3',                genre:'Indie',        country:'🌐'},
  {name:'Deep Space One',url:'https://ice6.somafm.com/deepspaceone-128-mp3',              genre:'Ambient',      country:'🌐'},
  {name:'Lofi Hip-Hop',  url:'https://streams.ilovemusic.de/iloveradio17.mp3',            genre:'Lofi',         country:'🌐'},
  {name:'Chillhop',      url:'https://streams.ilovemusic.de/iloveradio18.mp3',            genre:'Chillhop',     country:'🌐'},
  {name:'Smooth Jazz',   url:'https://streams.ilovemusic.de/iloveradio14.mp3',            genre:'Jazz',         country:'🌐'},
  {name:'Classical KDFC',url:'https://playerservices.streamtheworld.com/api/livestream-redirect/KDFCFM_SC',genre:'Classical',country:'🌐'},
  {name:'Nightwave Plaza',url:'https://radio.plaza.one/mp3',                              genre:'City Pop',     country:'🌐'},
  {name:'Poolsuite FM',  url:'https://poolsuite.net/stations/poolsuite-fm.mp3',           genre:'Summer/Disco', country:'🌐'},
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
  if(_widget&&document.body.contains(_widget)){_refreshWidget();_syncWidgetPage();return;}
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
  _syncWidgetPage();

  // Écoute les changements de page bureau
  window.addEventListener('ym:page-change',_syncWidgetPage);

  let dragging=false,ox=0,oy=0,wx=0,wy=0,_edgeT=null;

  function onMove(cx,cy){
    if(!dragging)return;
    wx=Math.max(0,Math.min(window.innerWidth-_widget.offsetWidth,wx+(cx-ox)));
    wy=Math.max(0,Math.min(window.innerHeight-_widget.offsetHeight,wy+(cy-oy)));
    ox=cx;oy=cy;
    _widget.style.left=wx+'px';_widget.style.top=wy+'px';
    _widget.style.right='';_widget.style.bottom='';

    // Edge scroll — emmène le widget sur la page suivante/précédente
    const vw=window.innerWidth,ew=vw*0.15;
    const curPage=window._deskCurPage??0;
    if(cx<ew&&curPage>0){
      if(!_edgeT)_edgeT=setTimeout(()=>{
        _edgeT=null;
        window.YM_Desk?.goPage?.(curPage-1);
        const p=loadPos();savePos({...p,page:curPage-1});
      },500);
    }else if(cx>vw-ew){
      if(!_edgeT)_edgeT=setTimeout(()=>{
        _edgeT=null;
        const next=(window._deskCurPage??0)+1;
        window.YM_Desk?.goPage?.(next);
        const p=loadPos();savePos({...p,page:next});
      },500);
    }else{clearTimeout(_edgeT);_edgeT=null;}
  }

  function onEnd(){
    if(!dragging)return;dragging=false;
    clearTimeout(_edgeT);_edgeT=null;
    const r=Math.max(0,window.innerWidth-wx-_widget.offsetWidth);
    const b=Math.max(0,window.innerHeight-wy-_widget.offsetHeight);
    const curPage=window._deskCurPage??0;
    savePos({right:r,bottom:b,page:curPage});
    _syncWidgetPage();
  }

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

function _syncWidgetPage(){
  if(!_widget)return;
  const pos=loadPos();
  const widgetPage=pos.page??0;
  const curPage=window._deskCurPage??0;
  // Visible seulement sur sa page assignée, ou si aucune page assignée (page 0)
  _widget.style.display=(curPage===widgetPage)?'block':'none';
}

function removeWidget(){
  if(_widget){
    window.removeEventListener('ym:page-change',_syncWidgetPage);
    _widget.remove();_widget=null;
  }
}

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
    var countries=[...new Set(allStations().map(s=>s.country||'🌐'))];
    // Filtre pays actif
    var activeCo=list._activeCo||'All';
    // Barre pays
    var coBar=document.createElement('div');
    coBar.style.cssText='display:flex;gap:4px;flex-wrap:wrap;padding:6px 12px;border-bottom:1px solid var(--border)';
    ['All',...countries].forEach(function(co){
      var b=document.createElement('button');
      b.className='ym-btn ym-btn-ghost';
      b.style.cssText='font-size:11px;padding:2px 8px'+(co===activeCo?';background:var(--accent);color:#000':'');
      b.textContent=co;
      b.addEventListener('click',function(){list._activeCo=co;renderStations();});
      coBar.appendChild(b);
    });
    list.appendChild(coBar);
    var stations=allStations().filter(function(s){return activeCo==='All'||(s.country||'🌐')===activeCo;});
    stations.forEach(function(s,i){
      var isActive=_curStation&&_curStation.url===s.url;
      var row=document.createElement('div');
      row.style.cssText='display:flex;align-items:center;gap:10px;padding:10px 16px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.04)'+(isActive?';background:rgba(232,160,32,.07)':'');
      row.innerHTML=
        '<div style="width:8px;height:8px;border-radius:50%;flex-shrink:0;background:'+(isActive&&_playing?'var(--accent)':'var(--surface3)')+'"></div>'+
        '<span style="font-size:14px;flex-shrink:0">'+(s.country||'🌐')+'</span>'+
        '<div style="flex:1;min-width:0">'+
          '<div style="font-size:13px;font-weight:'+(isActive?600:400)+';overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+s.name+'</div>'+
          (s.genre?'<div style="font-size:10px;color:var(--text3)">'+s.genre+'</div>':'')+
        '</div>'+
        (i>=BUILTIN.length?'<button data-del="'+(i-BUILTIN.length)+'" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:15px;padding:2px 6px">×</button>':'');
      row.addEventListener('click',function(e){
        if(e.target.dataset.del!==undefined)return;
        if(isActive)toggle();else play(s);
        renderNow();renderStations();
      });
      var delBtn=row.querySelector('[data-del]');
      if(delBtn){delBtn.addEventListener('click',function(e){
        e.stopPropagation();var c=loadCustom();c.splice(parseInt(e.target.dataset.del),1);saveCustom(c);renderStations();
      });}
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
  },

  peerSection(container, ctx){
    // Un pair a la sphere Radio — on montre juste ce qu'il écoute si broadcasté
    const info=document.createElement('div');
    info.style.cssText='font-size:11px;color:var(--text3)';
    info.textContent='📻 Has Radio sphere active';
    container.appendChild(info);
  }
};
})();
