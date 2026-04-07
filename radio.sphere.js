/* jshint esversion:11, browser:true */
// radio.sphere.js — YourMine Radio
(function(){
'use strict';
window.YM_S = window.YM_S || {};

const WIDGET_ID  = 'radio';
const STATE_KEY  = 'ym_radio_state_v1';
const CUSTOM_KEY = 'ym_radio_custom_v1';
const POS_KEY    = 'ym_radio_pos_v1';

const BUILTIN = [
  {name:'FIP',             url:'https://icecast.radiofrance.fr/fip-midfi.mp3',           genre:'Eclectic',       country:'🇫🇷'},
  {name:'FIP Rock',        url:'https://icecast.radiofrance.fr/fiprock-midfi.mp3',       genre:'Rock',           country:'🇫🇷'},
  {name:'FIP Jazz',        url:'https://icecast.radiofrance.fr/fipjazz-midfi.mp3',       genre:'Jazz',           country:'🇫🇷'},
  {name:'FIP Groove',      url:'https://icecast.radiofrance.fr/fipgroove-midfi.mp3',     genre:'Groove',         country:'🇫🇷'},
  {name:'FIP Monde',       url:'https://icecast.radiofrance.fr/fipworld-midfi.mp3',      genre:'World',          country:'🇫🇷'},
  {name:'FIP Nouveautés',  url:'https://icecast.radiofrance.fr/fipnouveautes-midfi.mp3', genre:'New Music',      country:'🇫🇷'},
  {name:'FIP Electro',     url:'https://icecast.radiofrance.fr/fipelectro-midfi.mp3',    genre:'Electro',        country:'🇫🇷'},
  {name:'France Inter',    url:'https://icecast.radiofrance.fr/franceinter-midfi.mp3',   genre:'Talk/Music',     country:'🇫🇷'},
  {name:'France Info',     url:'https://icecast.radiofrance.fr/franceinfo-midfi.mp3',    genre:'News',           country:'🇫🇷'},
  {name:'France Culture',  url:'https://icecast.radiofrance.fr/franceculture-midfi.mp3', genre:'Culture',        country:'🇫🇷'},
  {name:'France Musique',  url:'https://icecast.radiofrance.fr/francemusique-midfi.mp3', genre:'Classical',      country:'🇫🇷'},
  {name:"Mouv'",           url:'https://icecast.radiofrance.fr/mouv-midfi.mp3',          genre:'Hip-Hop',        country:'🇫🇷'},
  {name:'Nova',            url:'https://novazz.ice.infomaniak.ch/novazz-128.mp3',        genre:'Jazz/Soul',      country:'🇫🇷'},
  {name:'TSF Jazz',        url:'https://tsfjazz.ice.infomaniak.ch/tsfjazz-high.mp3',     genre:'Jazz',           country:'🇫🇷'},
  {name:'NRJ',             url:'https://scdn.nrjaudio.fm/adwstream/fr/00001/mp3_128.mp3',genre:'Pop/Dance',      country:'🇫🇷'},
  {name:'Skyrock',         url:'https://icecast.skyrock.net/s/natio_mp3_128k',           genre:'Hip-Hop',        country:'🇫🇷'},
  {name:'BBC Radio 1',     url:'https://stream.live.vc.bbcmedia.co.uk/bbc_radio_one',    genre:'Pop/Chart',      country:'🇬🇧'},
  {name:'BBC Radio 2',     url:'https://stream.live.vc.bbcmedia.co.uk/bbc_radio_two',    genre:'Easy Listening', country:'🇬🇧'},
  {name:'BBC Radio 3',     url:'https://stream.live.vc.bbcmedia.co.uk/bbc_radio_three',  genre:'Classical',      country:'🇬🇧'},
  {name:'BBC Radio 4',     url:'https://stream.live.vc.bbcmedia.co.uk/bbc_radio_four_fm',genre:'Talk',           country:'🇬🇧'},
  {name:'BBC 6 Music',     url:'https://stream.live.vc.bbcmedia.co.uk/bbc_6music',       genre:'Alternative',    country:'🇬🇧'},
  {name:'BBC World',       url:'https://stream.live.vc.bbcmedia.co.uk/bbc_world_service',genre:'News',           country:'🇬🇧'},
  {name:'NPR News',        url:'https://npr-ice.streamguys1.com/live.mp3',               genre:'News/Talk',      country:'🇺🇸'},
  {name:'KCRW',            url:'https://kcrw.streamguys1.com/kcrw_192k_mp3_on_air',      genre:'Indie/World',    country:'🇺🇸'},
  {name:'KEXP',            url:'https://kexp-mp3-128.streamguys1.com/kexp128.mp3',       genre:'Indie/Alt',      country:'🇺🇸'},
  {name:'WBGO Jazz',       url:'https://wbgo.streamguys1.com/wbgo128.mp3',               genre:'Jazz',           country:'🇺🇸'},
  {name:'Deutschlandfunk', url:'https://st01.sslstream.dlf.de/dlf/01/128/mp3/stream.mp3',genre:'Culture/Talk',   country:'🇩🇪'},
  {name:'SWR3',            url:'https://liveradio.swr.de/sw282p3/swr3/play.mp3',         genre:'Pop/Rock',       country:'🇩🇪'},
  {name:'Antena 1',        url:'https://streaming.rtp.pt/live/a1/a1.aac',                genre:'Talk/Music',     country:'🇵🇹'},
  {name:'Antena 3',        url:'https://streaming.rtp.pt/live/a3/a3.aac',                genre:'Rock/Alt',       country:'🇵🇹'},
  {name:'NPO Radio 1',     url:'https://icecast.omroep.nl/radio1-bb-mp3',                genre:'News/Talk',      country:'🇳🇱'},
  {name:'SR P3',           url:'https://sverigesradio.se/topsy/direkt/164-hi.mp3',       genre:'Pop/Alt',        country:'🇸🇪'},
  {name:'Groove Salad',    url:'https://ice6.somafm.com/groovesalad-128-mp3',            genre:'Ambient',        country:'🌐'},
  {name:'Drone Zone',      url:'https://ice6.somafm.com/dronezone-128-mp3',              genre:'Drone',          country:'🌐'},
  {name:'Lush',            url:'https://ice6.somafm.com/lush-128-mp3',                   genre:'Indie Pop',      country:'🌐'},
  {name:'Nightwave Plaza', url:'https://radio.plaza.one/mp3',                            genre:'Vaporwave',      country:'🌐'},
  {name:'Radio Paradise',  url:'https://stream.radioparadise.com/aac-320',               genre:'Eclectic',       country:'🌐'},
  {name:'Lofi Hip-Hop',    url:'https://streams.ilovemusic.de/iloveradio17.mp3',         genre:'Lofi',           country:'🌐'},
  {name:'Chillhop',        url:'https://streams.ilovemusic.de/iloveradio18.mp3',         genre:'Chillhop',       country:'🌐'},
  {name:'Di.fm Chillout',  url:'https://prem2.di.fm/chillout?listen_key=public3',        genre:'Chillout',       country:'🌐'},
  {name:'Di.fm Trance',    url:'https://prem2.di.fm/trance?listen_key=public3',          genre:'Trance',         country:'🌐'},
  {name:'Di.fm House',     url:'https://prem2.di.fm/house?listen_key=public3',           genre:'House',          country:'🌐'},
];

let _ctx=null, _audio=null, _playing=false, _curStation=null, _widget=null, _vol=0.8;

function loadState(){try{return JSON.parse(localStorage.getItem(STATE_KEY)||'{}');}catch(e){return{};}}
function saveState(d){localStorage.setItem(STATE_KEY,JSON.stringify(d));}
function loadCustom(){try{return JSON.parse(localStorage.getItem(CUSTOM_KEY)||'[]');}catch(e){return[];}}
function saveCustom(d){localStorage.setItem(CUSTOM_KEY,JSON.stringify(d));}
function loadPos(){try{return JSON.parse(localStorage.getItem(POS_KEY)||'{"right":12,"bottom":90,"page":0}');}catch(e){return{right:12,bottom:90,page:0};}}
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
  const a=getAudio();a.src=station.url;a.volume=_vol;
  a.play().catch(e=>{if(window.YM_toast)window.YM_toast('Stream error: '+e.message,'error');});
  _playing=true;saveState({station,vol:_vol,playing:true});
  _updateMediaSession();_refreshWidget();_refreshPanel();
}
function stop(){
  const a=getAudio();a.pause();a.src='';
  _playing=false;saveState(Object.assign({},loadState(),{playing:false}));
  _updateMediaSession();_refreshWidget();_refreshPanel();
}
function toggle(){if(_playing)stop();else if(_curStation)play(_curStation);}
function nextStation(){const all=allStations();const idx=_curStation?all.findIndex(s=>s.url===_curStation.url):-1;play(all[(idx+1)%all.length]);}
function prevStation(){const all=allStations();const idx=_curStation?all.findIndex(s=>s.url===_curStation.url):-1;play(all[(idx-1+all.length)%all.length]);}
function _updateMediaSession(){
  if(!('mediaSession' in navigator))return;
  navigator.mediaSession.metadata=new MediaMetadata({title:_curStation&&_curStation.name||'Radio',artist:_curStation&&_curStation.genre||'',album:'YourMine Radio'});
  navigator.mediaSession.playbackState=_playing?'playing':'paused';
  navigator.mediaSession.setActionHandler('play',()=>{if(!_playing&&_curStation)play(_curStation);});
  navigator.mediaSession.setActionHandler('pause',()=>{if(_playing)stop();});
  navigator.mediaSession.setActionHandler('nexttrack',nextStation);
  navigator.mediaSession.setActionHandler('previoustrack',prevStation);
}

// ── WIDGET ─────────────────────────────────────────────────────────────────
let _panelRefresh=null;
function _refreshPanel(){if(_panelRefresh)_panelRefresh();}

// Enregistre la page du widget dans desk.js pour que autoCleanPages ne la supprime pas
function _registerPage(page){
  if(window.YM_Desk&&window.YM_Desk.registerWidgetPage)window.YM_Desk.registerWidgetPage(WIDGET_ID,page);
}
function _unregisterPage(){
  if(window.YM_Desk&&window.YM_Desk.unregisterWidget)window.YM_Desk.unregisterWidget(WIDGET_ID);
}

function createWidget(){
  if(_widget&&document.body.contains(_widget)){_refreshWidget();_syncWidgetPage();return;}
  const pos=loadPos();
  _widget=document.createElement('div');
  _widget.id='ym-radio-widget';
  _widget.style.cssText=
    'position:fixed;z-index:250;'+
    'background:rgba(8,8,15,.92);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);'+
    'border:1px solid rgba(232,160,32,.35);border-radius:14px;overflow:hidden;'+
    'box-shadow:0 4px 24px rgba(0,0,0,.7);'+
    'touch-action:none;user-select:none;-webkit-user-select:none;'+
    'right:'+pos.right+'px;bottom:'+pos.bottom+'px;width:200px';
  _refreshWidget();
  document.body.appendChild(_widget);

  // Enregistre la page initiale
  _registerPage(pos.page||0);
  _syncWidgetPage();

  window.addEventListener('ym:page-change',_onPageChange);

  let dragging=false,ox=0,oy=0,wx=0,wy=0,_edgeT=null;

  const onMove=(cx,cy)=>{
    if(!dragging)return;
    wx=Math.max(0,Math.min(window.innerWidth-_widget.offsetWidth,wx+(cx-ox)));
    wy=Math.max(0,Math.min(window.innerHeight-_widget.offsetHeight,wy+(cy-oy)));
    ox=cx;oy=cy;
    _widget.style.left=wx+'px';_widget.style.top=wy+'px';
    _widget.style.right='';_widget.style.bottom='';
    _widget.style.display='block';
    const vw=window.innerWidth,ew=vw*0.15;
    const curPage=window._deskCurPage||0;
    if(cx<ew&&curPage>0){
      if(!_edgeT)_edgeT=setTimeout(()=>{
        _edgeT=null;
        const tp=curPage-1;
        if(window.YM_Desk)window.YM_Desk.goPage(tp);
        // Met à jour l'enregistrement de page
        _registerPage(tp);
        const p=loadPos();savePos(Object.assign({},p,{page:tp}));
      },500);
    }else if(cx>vw-ew){
      if(!_edgeT)_edgeT=setTimeout(()=>{
        _edgeT=null;
        const tp=(window._deskCurPage||0)+1;
        if(window.YM_Desk)window.YM_Desk.goPageOrCreate(tp);
        _registerPage(tp);
        const p=loadPos();savePos(Object.assign({},p,{page:tp}));
      },500);
    }else{clearTimeout(_edgeT);_edgeT=null;}
  };

  const onEnd=()=>{
    if(!dragging)return;dragging=false;_widget._dragging=false;
    clearTimeout(_edgeT);_edgeT=null;
    const r=Math.max(0,window.innerWidth-wx-_widget.offsetWidth);
    const b=Math.max(0,window.innerHeight-wy-_widget.offsetHeight);
    const curPage=window._deskCurPage||0;
    // FIX: enregistre la page finale avant autoCleanPages
    _registerPage(curPage);
    savePos({right:r,bottom:b,page:curPage});
    _syncWidgetPage();
    // FIX: autoCleanPages APRES avoir enregistré la page du widget
    // (desk.js saura ne pas supprimer la page du widget)
    setTimeout(()=>{if(window.YM_Desk)window.YM_Desk.autoCleanPages();},100);
  };

  _widget.addEventListener('pointerdown',e=>{
    if(e.target.closest('button'))return;
    dragging=true;_widget._dragging=true;
    const rect=_widget.getBoundingClientRect();
    wx=rect.left;wy=rect.top;
    _widget.style.left=wx+'px';_widget.style.top=wy+'px';
    _widget.style.right='';_widget.style.bottom='';
    ox=e.clientX;oy=e.clientY;
    try{_widget.setPointerCapture(e.pointerId);}catch(ex){}
  },{passive:true});
  _widget.addEventListener('pointermove',e=>{if(dragging)onMove(e.clientX,e.clientY);},{passive:true});
  _widget.addEventListener('pointerup',onEnd,{passive:true});
  _widget.addEventListener('pointercancel',onEnd,{passive:true});
}

const _onPageChange=()=>{
  // Seulement sync visibilité — PAS autoCleanPages (widget est enregistré)
  _syncWidgetPage();
};

function _refreshWidget(){
  if(!_widget)return;
  const name=(_curStation&&_curStation.name)||'No station';
  const genre=(_curStation&&_curStation.genre)||'';
  _widget.innerHTML=
    '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;cursor:grab">'+
      '<span style="font-size:16px">📻</span>'+
      '<div style="flex:1;min-width:0">'+
        '<div style="font-size:11px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+name+'</div>'+
        '<div style="font-size:9px;color:'+(_playing?'var(--gold)':'var(--text3)')+'">'+(_playing?'▶ ON AIR — '+genre:'⏹ stopped')+'</div>'+
      '</div>'+
    '</div>'+
    '<div style="display:flex;align-items:center;justify-content:space-around;padding:4px 8px 8px;gap:4px">'+
      '<button id="rw-prev" style="background:none;border:none;color:var(--text3);font-size:16px;cursor:pointer;padding:4px;line-height:1">⏮</button>'+
      '<button id="rw-pp" style="background:var(--gold);border:none;color:#000;width:32px;height:32px;border-radius:50%;font-size:16px;cursor:pointer;line-height:1;display:flex;align-items:center;justify-content:center">'+(_playing?'⏸':'▶')+'</button>'+
      '<button id="rw-next" style="background:none;border:none;color:var(--text3);font-size:16px;cursor:pointer;padding:4px;line-height:1">⏭</button>'+
      '<button id="rw-open" style="background:none;border:none;color:rgba(232,160,32,.5);font-size:12px;cursor:pointer;padding:4px;line-height:1">⬡</button>'+
    '</div>';
  _widget.querySelector('#rw-prev').addEventListener('click',e=>{e.stopPropagation();prevStation();});
  _widget.querySelector('#rw-pp').addEventListener('click',e=>{e.stopPropagation();toggle();});
  _widget.querySelector('#rw-next').addEventListener('click',e=>{e.stopPropagation();nextStation();});
  _widget.querySelector('#rw-open').addEventListener('click',e=>{e.stopPropagation();if(window.YM)window.YM.openSpherePanel('radio.sphere.js');});
}

function _syncWidgetPage(){
  if(!_widget)return;
  if(!document.body.contains(_widget)){_widget=null;createWidget();return;}
  if(_widget._dragging)return;
  const pos=loadPos();
  const widgetPage=pos.page||0;
  const curPage=window._deskCurPage;
  if(curPage===undefined||curPage===null){_widget.style.opacity='1';_widget.style.pointerEvents='all';return;}
  const visible=curPage===widgetPage;
  _widget.style.transition='opacity .25s ease';
  _widget.style.opacity=visible?'1':'0';
  _widget.style.pointerEvents=visible?'all':'none';
}

function removeWidget(){
  if(_widget){
    window.removeEventListener('ym:page-change',_onPageChange);
    _widget.remove();_widget=null;
  }
  _unregisterPage();
}

// ── PANEL ──────────────────────────────────────────────────────────────────
function renderPanel(container){
  container.style.cssText='display:flex;flex-direction:column;height:100%';
  container.innerHTML='';
  _panelRefresh=()=>renderPanel(container);

  const nowEl=document.createElement('div');
  nowEl.style.cssText='flex-shrink:0;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.06);text-align:center';
  container.appendChild(nowEl);

  const volEl=document.createElement('div');
  volEl.style.cssText='flex-shrink:0;display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.06)';
  volEl.innerHTML=
    '<span style="font-size:13px">🔊</span>'+
    '<input type="range" id="rad-vol" min="0" max="1" step="0.05" value="'+_vol+'" style="flex:1;accent-color:var(--gold)">'+
    '<span id="rad-vol-lbl" style="font-size:11px;color:var(--text3);min-width:28px">'+Math.round(_vol*100)+'%</span>';
  container.appendChild(volEl);
  volEl.querySelector('#rad-vol').addEventListener('input',e=>{
    _vol=parseFloat(e.target.value);
    volEl.querySelector('#rad-vol-lbl').textContent=Math.round(_vol*100)+'%';
    if(_audio)_audio.volume=_vol;
    saveState(Object.assign({},loadState(),{vol:_vol}));
  });

  const list=document.createElement('div');list.style.cssText='flex:1;overflow-y:auto';
  container.appendChild(list);

  const addEl=document.createElement('div');
  addEl.style.cssText='flex-shrink:0;padding:10px 16px;border-top:1px solid rgba(255,255,255,.06);display:flex;flex-direction:column;gap:6px';
  addEl.innerHTML=
    '<div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px">Custom station</div>'+
    '<div style="display:flex;gap:6px">'+
      '<input id="rad-cname" class="ym-input" placeholder="Name" style="flex:1;font-size:11px">'+
      '<input id="rad-curl" class="ym-input" placeholder="Stream URL" style="flex:2;font-size:11px">'+
      '<button id="rad-cadd" class="ym-btn ym-btn-ghost" style="font-size:11px">Add</button>'+
    '</div>';
  container.appendChild(addEl);
  addEl.querySelector('#rad-cadd').addEventListener('click',()=>{
    const n=addEl.querySelector('#rad-cname').value.trim();
    const u=addEl.querySelector('#rad-curl').value.trim();
    if(!n||!u){if(window.YM_toast)window.YM_toast('Name and URL required','warn');return;}
    const c=loadCustom();c.push({name:n,url:u,genre:'Custom',country:'🌐'});saveCustom(c);
    addEl.querySelector('#rad-cname').value='';addEl.querySelector('#rad-curl').value='';
    renderStations();
  });

  function renderNow(){
    const n=(_curStation&&_curStation.name)||'—';
    const g=(_curStation&&_curStation.genre)||'';
    nowEl.innerHTML=
      '<div style="font-size:10px;color:var(--text3);margin-bottom:4px">'+(_playing?'▶ NOW PLAYING':'STOPPED')+'</div>'+
      '<div style="font-size:15px;font-weight:600;color:var(--text);margin-bottom:2px">'+n+'</div>'+
      (g?'<div style="font-size:11px;color:var(--text3);margin-bottom:8px">'+g+'</div>':'<div style="height:8px"></div>')+
      '<div style="display:flex;justify-content:center;gap:12px">'+
        '<button id="pnl-prev" style="background:none;border:none;color:var(--text3);font-size:20px;cursor:pointer">⏮</button>'+
        '<button id="pnl-pp" class="ym-btn '+(_playing?'ym-btn-ghost':'ym-btn-accent')+'" style="font-size:14px;padding:6px 18px">'+(_playing?'⏸ Pause':'▶ Play')+'</button>'+
        '<button id="pnl-next" style="background:none;border:none;color:var(--text3);font-size:20px;cursor:pointer">⏭</button>'+
      '</div>';
    nowEl.querySelector('#pnl-prev').addEventListener('click',()=>{prevStation();renderNow();});
    nowEl.querySelector('#pnl-pp').addEventListener('click',()=>{toggle();renderNow();});
    nowEl.querySelector('#pnl-next').addEventListener('click',()=>{nextStation();renderNow();});
  }

  function renderStations(){
    list.innerHTML='';
    const countries=[...new Set(allStations().map(s=>s.country||'🌐'))];
    const activeCo=list._activeCo||'All';
    const coBar=document.createElement('div');
    coBar.style.cssText='display:flex;gap:4px;flex-wrap:wrap;padding:6px 12px;border-bottom:1px solid rgba(255,255,255,.06)';
    ['All',...countries].forEach(co=>{
      const b=document.createElement('button');
      b.className='ym-btn ym-btn-ghost';
      b.style.cssText='font-size:11px;padding:2px 8px'+(co===activeCo?';background:var(--gold);color:#000':'');
      b.textContent=co;
      b.addEventListener('click',()=>{list._activeCo=co;renderStations();});
      coBar.appendChild(b);
    });
    list.appendChild(coBar);
    const stations=allStations().filter(s=>activeCo==='All'||(s.country||'🌐')===activeCo);
    stations.forEach((s,i)=>{
      const isActive=_curStation&&_curStation.url===s.url;
      const row=document.createElement('div');
      row.style.cssText='display:flex;align-items:center;gap:10px;padding:10px 16px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.04)'+(isActive?';background:rgba(232,160,32,.07)':'');
      row.innerHTML=
        '<div style="width:8px;height:8px;border-radius:50%;flex-shrink:0;background:'+(isActive&&_playing?'var(--gold)':'rgba(255,255,255,.15)')+'"></div>'+
        '<span style="font-size:14px;flex-shrink:0">'+(s.country||'🌐')+'</span>'+
        '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:'+(isActive?600:400)+';overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+s.name+'</div>'+(s.genre?'<div style="font-size:10px;color:var(--text3)">'+s.genre+'</div>':'')+
        '</div>'+(i>=BUILTIN.length?'<button data-del="'+(i-BUILTIN.length)+'" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:15px;padding:2px 6px">×</button>':'');
      row.addEventListener('click',e=>{
        if(e.target.dataset.del!==undefined)return;
        const scrollY=list.scrollTop;
        if(isActive)toggle();else play(s);
        renderNow();renderStations();
        requestAnimationFrame(()=>{list.scrollTop=scrollY;});
      });
      const delBtn=row.querySelector('[data-del]');
      if(delBtn){
        delBtn.addEventListener('click',e=>{
          e.stopPropagation();
          const c=loadCustom();c.splice(parseInt(e.target.dataset.del),1);saveCustom(c);renderStations();
        });
      }
      list.appendChild(row);
    });
  }

  renderNow();renderStations();
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
    document._ymRadioVisHandler=()=>{
      if(document.visibilityState==='visible'){
        if(_widget&&!document.body.contains(_widget))_widget=null;
        if(!_widget)createWidget();
        else{_refreshWidget();_syncWidgetPage();}
      }
    };
    document.addEventListener('visibilitychange',document._ymRadioVisHandler);
  },

  deactivate(){
    stop();removeWidget();_panelRefresh=null;
    const audioEl=document.getElementById('ym-radio-audio');if(audioEl)audioEl.remove();
    _audio=null;_ctx=null;
    if(document._ymRadioVisHandler){
      document.removeEventListener('visibilitychange',document._ymRadioVisHandler);
      document._ymRadioVisHandler=null;
    }
  },

  renderPanel,

  profileSection(container){
    const n=(_curStation&&_curStation.name)||'—';
    const el=document.createElement('div');
    el.style.cssText='display:flex;align-items:center;gap:10px';
    el.innerHTML=
      '<span style="font-size:16px">📻</span>'+
      '<div style="flex:1;font-size:12px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(_playing?'▶ '+n:'⏹ '+n)+'</div>'+
      '<button id="ps-rad-pp" class="ym-btn ym-btn-ghost" style="font-size:11px">'+(_playing?'Stop':'Play')+'</button>'+
      '<button id="ps-rad-nx" class="ym-btn ym-btn-ghost" style="font-size:11px">⏭</button>';
    el.querySelector('#ps-rad-pp').addEventListener('click',()=>{
      if(!_curStation){if(window.YM)window.YM.openSpherePanel('radio.sphere.js');return;}
      toggle();
      el.querySelector('#ps-rad-pp').textContent=_playing?'Stop':'Play';
    });
    el.querySelector('#ps-rad-nx').addEventListener('click',nextStation);
    container.appendChild(el);
  },

  peerSection(container){
    const info=document.createElement('div');
    info.style.cssText='font-size:11px;color:var(--text3)';
    info.textContent='📻 Has Radio sphere active';
    container.appendChild(info);
  }
};
})();
