/* jshint esversion:11, browser:true */
// video.sphere.js — YourMine WebTV & Free Streaming (HLS only, no YouTube)
(function(){
'use strict';
window.YM_S = window.YM_S || {};

const FAVS_KEY = 'ym_video_favs_v3';
const HIST_KEY = 'ym_video_hist_v3';
const MAX_HIST = 50;

// type:'hls'  → stream HLS/MP3/AAC direct (audio:true = radio)
// type:'web'  → bouton "Ouvrir dans le navigateur"
const CHANNELS = [
  // ── 📰 NEWS TV ──
  {id:'aljazeera',  name:'Al Jazeera',    cat:'📰 News', lang:'🌐', type:'hls',
    url:'https://live-hls-web-aja.getaj.net/AJE/01.m3u8', desc:'Al Jazeera English — live 24h'},
  {id:'dw',         name:'DW News',       cat:'📰 News', lang:'🌐', type:'hls',
    url:'https://dwamdstream102.akamaized.net/hls/live/2015525/dwstream102/index.m3u8', desc:'Deutsche Welle English'},
  {id:'france24en', name:'France 24 EN',  cat:'📰 News', lang:'🌐', type:'hls',
    url:'https://stream.france24.com/hls/live/2037218/F24_EN_HI_HLS/master.m3u8', desc:'France 24 English live'},
  {id:'france24fr', name:'France 24 FR',  cat:'📰 News', lang:'🇫🇷', type:'hls',
    url:'https://stream.france24.com/hls/live/2037218/F24_FR_HI_HLS/master.m3u8', desc:'France 24 Français en direct'},
  {id:'nhkworld',   name:'NHK World',     cat:'📰 News', lang:'🇯🇵', type:'hls',
    url:'https://nhkwlive-ojp.akamaized.net/hls/live/2003459/nhkwlive-ojp-en/index_4M.m3u8', desc:'NHK World Japan English'},
  {id:'trtworld',   name:'TRT World',     cat:'📰 News', lang:'🌐', type:'hls',
    url:'https://tv-trtworld.live.trt.com.tr/master.m3u8', desc:'TRT World — English news'},
  {id:'cnn',        name:'CNN',           cat:'📰 News', lang:'🇺🇸', type:'web',
    url:'https://edition.cnn.com/live-tv', desc:'CNN International live'},
  {id:'bbc',        name:'BBC News',      cat:'📰 News', lang:'🇬🇧', type:'web',
    url:'https://www.bbc.co.uk/news/av/live', desc:'BBC News live'},
  {id:'bloomberg',  name:'Bloomberg TV',  cat:'📰 News', lang:'🇺🇸', type:'web',
    url:'https://www.bloomberg.com/live', desc:'Bloomberg finance & markets'},
  // ── 🎵 RADIO MUSIC ──
  {id:'fip',        name:'FIP',           cat:'🎵 Music', lang:'🇫🇷', type:'hls', audio:true,
    url:'https://icecast.radiofrance.fr/fip-hifi.aac', desc:'FIP — éclectique, sans pub'},
  {id:'fipjazz',   name:'FIP Jazz',       cat:'🎵 Music', lang:'🇫🇷', type:'hls', audio:true,
    url:'https://icecast.radiofrance.fr/fipjazz-hifi.aac', desc:'FIP Jazz'},
  {id:'fiprock',   name:'FIP Rock',       cat:'🎵 Music', lang:'🇫🇷', type:'hls', audio:true,
    url:'https://icecast.radiofrance.fr/fiprock-hifi.aac', desc:'FIP Rock'},
  {id:'fipelectro',name:'FIP Electro',    cat:'🎵 Music', lang:'🇫🇷', type:'hls', audio:true,
    url:'https://icecast.radiofrance.fr/fipelectro-hifi.aac', desc:'FIP Electro'},
  {id:'fipgroove', name:'FIP Groove',     cat:'🎵 Music', lang:'🇫🇷', type:'hls', audio:true,
    url:'https://icecast.radiofrance.fr/fipgroove-hifi.aac', desc:'FIP Groove'},
  {id:'fipworld',  name:'FIP Monde',      cat:'🎵 Music', lang:'🇫🇷', type:'hls', audio:true,
    url:'https://icecast.radiofrance.fr/fipworld-hifi.aac', desc:'FIP World music'},
  {id:'mouv',      name:"Mouv'",          cat:'🎵 Music', lang:'🇫🇷', type:'hls', audio:true,
    url:'https://icecast.radiofrance.fr/mouv-hifi.aac', desc:"Mouv' — Hip-Hop & RnB"},
  {id:'francemusique',name:'France Musique',cat:'🎵 Music',lang:'🇫🇷',type:'hls',audio:true,
    url:'https://icecast.radiofrance.fr/francemusique-hifi.aac', desc:'France Musique — classique'},
  {id:'kcrw',      name:'KCRW',           cat:'🎵 Music', lang:'🇺🇸', type:'hls', audio:true,
    url:'https://kcrw.streamguys1.com/kcrw_192k_mp3_on_air', desc:'KCRW — indie, world, eclectic'},
  {id:'kexp',      name:'KEXP',           cat:'🎵 Music', lang:'🇺🇸', type:'hls', audio:true,
    url:'https://kexp-mp3-128.streamguys1.com/kexp128.mp3', desc:'KEXP — indie & alternative'},
  {id:'bbc6',      name:'BBC 6 Music',    cat:'🎵 Music', lang:'🇬🇧', type:'hls', audio:true,
    url:'https://stream.live.vc.bbcmedia.co.uk/bbc_6music', desc:'BBC 6 Music — alternative'},
  {id:'bbc3',      name:'BBC Radio 3',    cat:'🎵 Music', lang:'🇬🇧', type:'hls', audio:true,
    url:'https://stream.live.vc.bbcmedia.co.uk/bbc_radio_three', desc:'BBC Radio 3 — classical & jazz'},
  {id:'groovesalad',name:'Groove Salad',  cat:'🎵 Music', lang:'🌐', type:'hls', audio:true,
    url:'https://ice6.somafm.com/groovesalad-128-mp3', desc:'SomaFM — ambient chill'},
  {id:'dronezone', name:'Drone Zone',     cat:'🎵 Music', lang:'🌐', type:'hls', audio:true,
    url:'https://ice6.somafm.com/dronezone-128-mp3', desc:'SomaFM — deep space ambient'},
  {id:'lush',      name:'Lush',           cat:'🎵 Music', lang:'🌐', type:'hls', audio:true,
    url:'https://ice6.somafm.com/lush-128-mp3', desc:'SomaFM — indie pop'},
  {id:'nightwave', name:'Nightwave Plaza',cat:'🎵 Music', lang:'🌐', type:'hls', audio:true,
    url:'https://radio.plaza.one/mp3', desc:'Nightwave Plaza — vaporwave/lofi'},
  {id:'radioparadise',name:'Radio Paradise',cat:'🎵 Music',lang:'🌐',type:'hls',audio:true,
    url:'https://stream.radioparadise.com/aac-320', desc:'Radio Paradise — eclectic rock/indie'},
  {id:'nova',      name:'Radio Nova',     cat:'🎵 Music', lang:'🇫🇷', type:'hls', audio:true,
    url:'https://novazz.ice.infomaniak.ch/novazz-128.mp3', desc:'Radio Nova — jazz & soul'},
  {id:'tsfjazz',   name:'TSF Jazz',       cat:'🎵 Music', lang:'🇫🇷', type:'hls', audio:true,
    url:'https://tsfjazz.ice.infomaniak.ch/tsfjazz-high.mp3', desc:'TSF Jazz — jazz 24/7'},
  {id:'difmchill', name:'Di.fm Chillout', cat:'🎵 Music', lang:'🌐', type:'hls', audio:true,
    url:'https://prem2.di.fm/chillout?listen_key=public3', desc:'Di.fm Chillout — ambient'},
  {id:'difmtrance',name:'Di.fm Trance',   cat:'🎵 Music', lang:'🌐', type:'hls', audio:true,
    url:'https://prem2.di.fm/trance?listen_key=public3', desc:'Di.fm Trance'},
  {id:'spacestation',name:'Space Station',cat:'🎵 Music', lang:'🌐', type:'hls', audio:true,
    url:'https://ice6.somafm.com/spacestation-128-mp3', desc:'SomaFM Space Station — sci-fi'},
  // ── 🎥 DOCS & CINEMA ──
  {id:'topdoc',    name:'Top Documentary Films',cat:'🎥 Docs',lang:'🌐',type:'web',
    url:'https://topdocumentaryfilms.com', desc:'Largest free documentary library'},
  {id:'archive_docs',name:'Internet Archive',cat:'🎥 Docs',lang:'🌐',type:'web',
    url:'https://archive.org/search?query=documentary&mediatype=movies&sort=-downloads',
    desc:'Public domain & CC documentaries'},
  {id:'archive_film',name:'Classic Cinema',cat:'🎥 Docs',lang:'🌐',type:'web',
    url:'https://archive.org/search?query=feature+film&mediatype=movies&sort=-downloads',
    desc:'Full public domain classic films'},
  // ── 🎨 CULTURE ──
  {id:'arte',      name:'ARTE',            cat:'🎨 Culture',lang:'🌐',type:'web',
    url:'https://www.arte.tv/en/videos/most-viewed/', desc:'ARTE — European culture & cinema'},
  {id:'arteconcert',name:'ARTE Concert',  cat:'🎨 Culture',lang:'🌐',type:'web',
    url:'https://concert.arte.tv', desc:'Free concerts — classical, jazz, rock'},
  {id:'medici',    name:'Medici.tv',       cat:'🎨 Culture',lang:'🌐',type:'web',
    url:'https://www.medici.tv', desc:'Classical music & opera — free section'},
  // ── 🌍 NATURE ──
  {id:'earthcam',  name:'EarthCam Live',   cat:'🌍 Nature',lang:'🌐',type:'web',
    url:'https://www.earthcam.com', desc:'Live webcams from landmarks worldwide'},
  {id:'skyline',   name:'Skyline Webcams', cat:'🌍 Nature',lang:'🌐',type:'web',
    url:'https://www.skylinewebcams.com', desc:'Stunning live webcams worldwide'},
];

// ── HLS LOADER ─────────────────────────────────────────────────────────────
var _hlsLib=null;
function loadHls(){
  if(_hlsLib)return Promise.resolve(_hlsLib);
  if(window.Hls){_hlsLib=window.Hls;return Promise.resolve(_hlsLib);}
  return new Promise(function(res,rej){
    var s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.7/hls.min.js';
    s.onload=function(){_hlsLib=window.Hls;res(_hlsLib);};
    s.onerror=rej;document.head.appendChild(s);
  });
}

// ── STORAGE ────────────────────────────────────────────────────────────────
function loadFavs(){try{return JSON.parse(localStorage.getItem(FAVS_KEY)||'[]');}catch(e){return[];}}
function saveFavs(a){localStorage.setItem(FAVS_KEY,JSON.stringify(a));}
function toggleFav(id){var f=loadFavs();var i=f.indexOf(id);if(i>=0)f.splice(i,1);else f.push(id);saveFavs(f);}
function isFav(id){return loadFavs().includes(id);}
function loadHist(){try{return JSON.parse(localStorage.getItem(HIST_KEY)||'[]');}catch(e){return[];}}
function addHist(ch){
  var h=loadHist().filter(function(x){return x.id!==ch.id;});
  h.unshift({id:ch.id,name:ch.name,cat:ch.cat,ts:Date.now()});
  localStorage.setItem(HIST_KEY,JSON.stringify(h.slice(0,MAX_HIST)));
}

// ── STATE ──────────────────────────────────────────────────────────────────
var _ctx=null,_panel=null,_curCh=null,_hlsInst=null;
var _filterCat='',_filterText='',_tab='browse';

function _destroyHls(){
  if(_hlsInst){try{_hlsInst.destroy();}catch(e){}}_hlsInst=null;
}

// ── PLAYER ─────────────────────────────────────────────────────────────────
function _buildPlayerZone(){
  if(!_curCh){
    var ph=document.createElement('div');
    ph.style.cssText='flex-shrink:0;height:72px;display:flex;align-items:center;justify-content:center;gap:12px;background:rgba(0,0,0,.25);color:rgba(255,255,255,.18)';
    ph.innerHTML='<span style="font-size:26px">📺</span><span style="font-family:var(--font-m);font-size:10px;letter-spacing:2px">SELECT A CHANNEL</span>';
    return ph;
  }
  var ch=_curCh;
  if(ch.type==='web'){
    var w=document.createElement('div');
    w.style.cssText='flex-shrink:0;padding:12px 16px;background:rgba(240,168,48,.05);border-bottom:1px solid rgba(240,168,48,.12);display:flex;align-items:center;gap:12px';
    w.innerHTML=
      '<div style="font-size:26px;flex-shrink:0">'+ch.cat.split(' ')[0]+'</div>'+
      '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:2px">'+esc(ch.name)+'</div>'+
      '<div style="font-size:10px;color:var(--text3)">'+esc(ch.desc)+'</div></div>'+
      '<a href="'+ch.url+'" target="_blank" rel="noopener" style="flex-shrink:0;padding:8px 14px;background:var(--gold);color:#000;border-radius:9px;font-size:12px;font-weight:700;text-decoration:none">Open ↗</a>';
    return w;
  }
  // HLS
  var isAudio=!!(ch.audio);
  var wrap=document.createElement('div');
  if(isAudio){
    wrap.style.cssText='flex-shrink:0;height:100px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:linear-gradient(135deg,rgba(240,168,48,.09),rgba(8,224,248,.05));position:relative';
    var dot=document.createElement('div');
    dot.style.cssText='position:absolute;top:10px;left:14px;width:7px;height:7px;border-radius:50%;background:var(--red);animation:vpPulse 1.2s ease-in-out infinite';
    wrap.appendChild(dot);
    wrap.innerHTML+=
      '<div style="font-size:32px;line-height:1">'+ch.cat.split(' ')[0]+'</div>'+
      '<div style="font-size:12px;font-weight:600;color:var(--text)">'+esc(ch.name)+'</div>'+
      '<div style="font-size:10px;color:var(--text3)">'+esc(ch.desc)+'</div>';
    var audio=document.createElement('audio');
    audio.style.cssText='position:absolute;bottom:0;left:0;right:0;opacity:.01;height:1px;pointer-events:none';
    audio.controls=false;
    wrap.appendChild(audio);
    _attachHls(audio,ch,wrap);
    // Tap to play/pause
    wrap.style.cursor='pointer';
    wrap.addEventListener('click',function(){
      if(audio.paused)audio.play().catch(function(){});else audio.pause();
    });
  }else{
    wrap.style.cssText='flex-shrink:0;background:#000;aspect-ratio:16/9;max-height:35%;overflow:hidden;position:relative';
    var video=document.createElement('video');
    video.style.cssText='width:100%;height:100%;object-fit:contain;display:block';
    video.controls=true;
    video.setAttribute('playsinline','');
    wrap.appendChild(video);
    _attachHls(video,ch,wrap);
  }
  return wrap;
}

function _attachHls(media,ch,wrap){
  loadHls().then(function(Hls){
    if(Hls&&Hls.isSupported()){
      _hlsInst=new Hls({enableWorker:false,lowLatencyMode:true,maxBufferLength:20,maxMaxBufferLength:40});
      _hlsInst.loadSource(ch.url);
      _hlsInst.attachMedia(media);
      _hlsInst.on(Hls.Events.MANIFEST_PARSED,function(){media.play().catch(function(){});});
      _hlsInst.on(Hls.Events.ERROR,function(ev,data){
        if(data.fatal){_showErr(wrap,'Stream unavailable — try another channel');}
      });
    }else if(media.canPlayType('application/vnd.apple.mpegurl')){
      media.src=ch.url;media.play().catch(function(){});
    }else{
      media.src=ch.url;
    }
  }).catch(function(){media.src=ch.url;});
}

function _showErr(wrap,msg){
  var err=document.createElement('div');
  err.style.cssText='position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;background:rgba(0,0,0,.85)';
  err.innerHTML='<span style="font-size:22px">⚠️</span><span style="font-size:11px;color:var(--text3)">'+esc(msg)+'</span>';
  wrap.appendChild(err);
}

// ── RENDER ─────────────────────────────────────────────────────────────────
function renderPanel(container){
  _panel=container;_destroyHls();
  container.innerHTML='';
  container.style.cssText='display:flex;flex-direction:column;height:100%;overflow:hidden;background:var(--bg)';
  if(!document.getElementById('vp-css')){
    var st=document.createElement('style');st.id='vp-css';
    st.textContent='@keyframes vpPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.7)}}.vp-card{cursor:pointer;transition:border-color .15s,background .15s}.vp-card:active{opacity:.75}@media(hover:hover) and (pointer:fine){.vp-card:hover{border-color:rgba(240,168,48,.3)!important;background:rgba(240,168,48,.04)!important}}';
    document.head.appendChild(st);
  }

  container.appendChild(_buildPlayerZone());

  // Now-playing bar
  if(_curCh&&_curCh.type==='hls'){
    var nb=document.createElement('div');
    nb.style.cssText='flex-shrink:0;display:flex;align-items:center;gap:8px;padding:5px 14px;background:rgba(0,0,0,.45);border-bottom:1px solid rgba(240,168,48,.1)';
    nb.innerHTML=
      '<div style="width:6px;height:6px;border-radius:50%;background:var(--red);flex-shrink:0;animation:vpPulse 1.2s ease-in-out infinite"></div>'+
      '<div style="flex:1;min-width:0;font-size:10px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(_curCh.name)+'</div>'+
      '<span id="vp-fav" style="font-size:16px;cursor:pointer;flex-shrink:0">'+(isFav(_curCh.id)?'★':'☆')+'</span>'+
      '<button id="vp-stop" style="background:none;border:1px solid rgba(255,255,255,.1);color:var(--text3);font-size:9px;cursor:pointer;padding:2px 7px;border-radius:5px;flex-shrink:0">■</button>';
    nb.querySelector('#vp-fav').addEventListener('click',function(){toggleFav(_curCh.id);renderPanel(container);});
    nb.querySelector('#vp-stop').addEventListener('click',function(){_curCh=null;renderPanel(container);});
    container.appendChild(nb);
  }

  // Tabs
  var tabs=document.createElement('div');
  tabs.style.cssText='flex-shrink:0;display:flex;background:rgba(0,0,0,.2);border-bottom:1px solid rgba(255,255,255,.05)';
  [['browse','📺 Channels'],['favs','★ Favs'],['history','🕓 History']].forEach(function(t){
    var b=document.createElement('button');
    b.style.cssText='flex:1;padding:9px 4px;background:none;border:none;border-top:2px solid '+(_tab===t[0]?'var(--gold)':'transparent')+';color:'+(_tab===t[0]?'var(--gold)':'rgba(255,255,255,.28)')+';font-size:11px;font-family:var(--font-d);cursor:pointer';
    b.textContent=t[1];
    b.addEventListener('click',function(){_tab=t[0];renderPanel(container);});
    tabs.appendChild(b);
  });
  container.appendChild(tabs);

  var content=document.createElement('div');
  content.style.cssText='flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch';
  container.appendChild(content);

  if(_tab==='browse')_renderBrowse(content,container);
  else if(_tab==='favs')_renderFavs(content,container);
  else _renderHistory(content,container);
}

function _renderBrowse(content,container){
  var ctrl=document.createElement('div');
  ctrl.style.cssText='padding:10px 14px;display:flex;flex-direction:column;gap:7px;background:rgba(0,0,0,.12);border-bottom:1px solid rgba(255,255,255,.04);position:sticky;top:0;z-index:2';
  var sb=document.createElement('input');
  sb.className='ym-input';sb.placeholder='🔍 Search…';sb.value=_filterText;
  sb.style.cssText='font-size:12px;padding:7px 12px';
  sb.addEventListener('input',function(){_filterText=sb.value.toLowerCase();_renderList(list,container);});
  ctrl.appendChild(sb);
  var cats=[...new Set(CHANNELS.map(function(c){return c.cat;}))];
  var cr=document.createElement('div');cr.style.cssText='display:flex;flex-wrap:wrap;gap:4px';
  ['All',...cats].forEach(function(cat){
    var p=document.createElement('span');
    var active=(!_filterCat&&cat==='All')||_filterCat===cat;
    p.style.cssText='padding:3px 10px;border-radius:12px;font-size:10px;cursor:pointer;border:1px solid;'+
      (active?'background:var(--gold);color:#000;border-color:var(--gold)':'background:rgba(255,255,255,.03);color:var(--text3);border-color:rgba(255,255,255,.07)');
    p.textContent=cat;
    p.addEventListener('click',function(){_filterCat=cat==='All'?'':cat;renderPanel(container);});
    cr.appendChild(p);
  });
  ctrl.appendChild(cr);content.appendChild(ctrl);
  var list=document.createElement('div');
  list.style.cssText='padding:10px 14px;display:flex;flex-direction:column;gap:5px';
  content.appendChild(list);_renderList(list,container);
}

function _renderList(list,container){
  list.innerHTML='';
  var filtered=CHANNELS.filter(function(ch){
    var mc=!_filterCat||ch.cat===_filterCat;
    var mt=!_filterText||ch.name.toLowerCase().includes(_filterText)||ch.desc.toLowerCase().includes(_filterText);
    return mc&&mt;
  });
  if(!filtered.length){list.innerHTML='<div style="color:var(--text3);font-size:12px;padding:24px;text-align:center">No channels found</div>';return;}
  filtered.forEach(function(ch){list.appendChild(_makeCard(ch,container));});
}

function _makeCard(ch,container){
  var playing=_curCh&&_curCh.id===ch.id;
  var fav=isFav(ch.id);
  var card=document.createElement('div');
  card.className='vp-card';
  card.style.cssText='display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:11px;border:1px solid '+(playing?'rgba(240,168,48,.35)':'rgba(255,255,255,.06)')+';background:'+(playing?'rgba(240,168,48,.05)':'rgba(255,255,255,.01)');
  card.innerHTML=
    '<div style="width:36px;height:36px;border-radius:8px;background:rgba(255,255,255,.04);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;border:1px solid rgba(255,255,255,.06)">'+ch.cat.split(' ')[0]+'</div>'+
    '<div style="flex:1;min-width:0">'+
      '<div style="display:flex;align-items:center;gap:5px;margin-bottom:1px;flex-wrap:wrap">'+
        '<span style="font-size:12px;font-weight:600;color:var(--text)">'+esc(ch.name)+'</span>'+
        '<span style="font-size:11px">'+ch.lang+'</span>'+
        (playing?'<span style="font-size:8px;background:var(--red);color:#fff;padding:1px 4px;border-radius:3px">'+(!!(ch.audio)?'▶ ON AIR':'▶ LIVE')+'</span>':'')+
        (ch.type==='web'?'<span style="font-size:8px;background:rgba(8,224,248,.12);color:var(--cyan);padding:1px 4px;border-radius:3px">WEB</span>':'')+
      '</div>'+
      '<div style="font-size:10px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(ch.desc)+'</div>'+
    '</div>'+
    '<div style="display:flex;gap:5px;align-items:center;flex-shrink:0">'+
      '<span data-fav="1" style="font-size:15px;cursor:pointer;line-height:1">'+(fav?'★':'☆')+'</span>'+
      '<span style="font-size:14px;color:'+(playing?'var(--gold)':'rgba(255,255,255,.15)')+'">▶</span>'+
    '</div>';
  card.querySelector('[data-fav]').addEventListener('click',function(e){e.stopPropagation();toggleFav(ch.id);renderPanel(_panel);});
  card.addEventListener('click',function(){_curCh=ch;addHist(ch);renderPanel(container);});
  return card;
}

function _renderFavs(content,container){
  var favIds=loadFavs();
  var favChs=favIds.map(function(id){return CHANNELS.find(function(c){return c.id===id;});}).filter(Boolean);
  if(!favChs.length){content.innerHTML='<div style="color:var(--text3);font-size:12px;padding:32px;text-align:center">No favourites yet.<br>Tap ☆ on any channel.</div>';return;}
  var list=document.createElement('div');list.style.cssText='padding:10px 14px;display:flex;flex-direction:column;gap:5px';
  favChs.forEach(function(ch){list.appendChild(_makeCard(ch,container));});
  content.appendChild(list);
}

function _renderHistory(content,container){
  var hist=loadHist();
  if(!hist.length){content.innerHTML='<div style="color:var(--text3);font-size:12px;padding:32px;text-align:center">No history yet.</div>';return;}
  var list=document.createElement('div');list.style.cssText='padding:10px 14px;display:flex;flex-direction:column;gap:5px';
  hist.forEach(function(h){
    var ch=CHANNELS.find(function(c){return c.id===h.id;});if(!ch)return;
    list.appendChild(_makeCard(ch,container));
    var ts=document.createElement('div');ts.style.cssText='font-size:9px;color:var(--text3);padding:1px 12px 5px;';
    ts.textContent=_ago(h.ts)+' ago';list.appendChild(ts);
  });
  var clr=document.createElement('button');clr.className='ym-btn ym-btn-ghost';
  clr.style.cssText='width:100%;margin-top:8px;font-size:11px;color:var(--red);border-color:rgba(255,69,96,.2)';
  clr.textContent='✕ Clear history';
  clr.addEventListener('click',function(){localStorage.removeItem(HIST_KEY);renderPanel(container);});
  list.appendChild(clr);content.appendChild(list);
}

function _ago(ts){
  if(!ts)return'?';var d=Math.floor((Date.now()-ts)/1000);
  if(d<60)return d+'s';if(d<3600)return Math.floor(d/60)+'min';
  if(d<86400)return Math.floor(d/3600)+'h';return Math.floor(d/86400)+'d';
}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

window.YM_S['video.sphere.js']={
  name:'WebTV',icon:'📺',category:'Media',
  description:'Free worldwide TV & radio — HLS streams, no YouTube, no ads.',
  emit:[],receive:[],
  activate(ctx){_ctx=ctx;},
  deactivate(){_destroyHls();_ctx=null;_curCh=null;_panel=null;},
  renderPanel
};
})();