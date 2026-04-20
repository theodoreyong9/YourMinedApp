/* jshint esversion:11, browser:true */
// video.sphere.js — YourMine WebTV & Free Streaming Navigator
(function(){
'use strict';
window.YM_S = window.YM_S || {};

const FAVS_KEY = 'ym_video_favs_v1';
const HIST_KEY = 'ym_video_hist_v1';
const MAX_HIST = 50;

// ── CATALOGUE ────────────────────────────────────────────────────────────────
// Sources 100% gratuites, légales, mondiales, sans pub (embed)
const CHANNELS = [
  // ── LIVE TV / NEWS ──
  {id:'euronews',name:'Euronews',cat:'📰 News',lang:'🌐',tags:['news','live'],
    type:'yt-live',ytId:'_m8V-JU0O_Y',desc:'European multilingual news channel live'},
  {id:'dw',name:'DW News',cat:'📰 News',lang:'🌐',tags:['news','live'],
    type:'yt-live',ytId:'YsRFODR6MB8',desc:'Deutsche Welle — global news in English'},
  {id:'france24en',name:'France 24 EN',cat:'📰 News',lang:'🇬🇧',tags:['news','live'],
    type:'yt-live',ytId:'h3MuIUNCCLI',desc:'France 24 English — live news from Paris'},
  {id:'france24fr',name:'France 24 FR',cat:'📰 News',lang:'🇫🇷',tags:['news','live'],
    type:'yt-live',ytId:'3J6prBt04ks',desc:'France 24 Français — info en direct'},
  {id:'aljaz',name:'Al Jazeera',cat:'📰 News',lang:'🌐',tags:['news','live'],
    type:'yt-live',ytId:'Z_xml6N9sOg',desc:'Al Jazeera English live stream'},
  {id:'cgtv',name:'CGTN',cat:'📰 News',lang:'🌐',tags:['news','live'],
    type:'yt-live',ytId:'lOXTIsWj9FE',desc:'China Global Television Network English'},
  {id:'nhk',name:'NHK World',cat:'📰 News',lang:'🌐',tags:['news','live','japan'],
    type:'yt-live',ytId:'VjKBnrN7Chg',desc:'NHK World Japan — English news & culture'},
  {id:'rt',name:'RT International',cat:'📰 News',lang:'🌐',tags:['news','live'],
    type:'yt-live',ytId:'UTGCOEwFbV0',desc:'RT International live news broadcast'},
  {id:'trtworld',name:'TRT World',cat:'📰 News',lang:'🌐',tags:['news','live'],
    type:'yt-live',ytId:'qsLD2JCGHco',desc:'Turkish Radio and Television World service'},

  // ── DOCUMENTAIRES ──
  {id:'docutube',name:'Naked Science',cat:'🎥 Docs',lang:'🌐',tags:['science','doc'],
    type:'yt-ch',ytId:'UCbHEEsPHxhXMJHyEZ1UJRg',desc:'Epic science documentaries — free'},
  {id:'curiosity',name:'Curiosity Stream',cat:'🎥 Docs',lang:'🌐',tags:['doc','science','nature'],
    type:'yt-ch',ytId:'UCGfDzPUdAwVeUf4YPTfcl8A',desc:'Top documentary clips from Curiosity Stream'},
  {id:'ibcnat',name:'BBC Earth',cat:'🎥 Docs',lang:'🌐',tags:['nature','wildlife','doc'],
    type:'yt-ch',ytId:'UCMV5oB5BbO8eumkpyEcXAaA',desc:'BBC Earth — nature & wildlife documentaries'},
  {id:'natgeo',name:'Nat Geo Wild',cat:'🎥 Docs',lang:'🌐',tags:['nature','doc'],
    type:'yt-ch',ytId:'UCpVoyZ2LniqY9uRKKAjfhfQ',desc:'National Geographic Wild clips & docs'},
  {id:'topdoc',name:'Top Documentary Films',cat:'🎥 Docs',lang:'🌐',tags:['doc','free'],
    type:'web',url:'https://topdocumentaryfilms.com',desc:'Largest free documentary library online'},
  {id:'archive_docs',name:'Internet Archive — Docs',cat:'🎥 Docs',lang:'🌐',tags:['doc','free','classic'],
    type:'archive',query:'documentary',desc:'Public domain & Creative Commons documentaries'},

  // ── CINÉMA & CLASSIQUES ──
  {id:'cinema_archive',name:'Classic Cinema',cat:'🎬 Cinema',lang:'🌐',tags:['film','classic','free'],
    type:'archive',query:'feature+film',desc:'Full public domain classic films from Internet Archive'},
  {id:'omeleto',name:'Omeleto',cat:'🎬 Cinema',lang:'🌐',tags:['short','film','indie'],
    type:'yt-ch',ytId:'UCiBSPgrLLJaFW1xyQ7T5gLw',desc:'Award-winning short films — free'},
  {id:'dust',name:'DUST Sci-Fi',cat:'🎬 Cinema',lang:'🌐',tags:['scifi','short','film'],
    type:'yt-ch',ytId:'UCXuqSBlHAE6Xw-yeJA0Tunw',desc:'DUST — sci-fi short films'},
  {id:'alter',name:'ALTER Horror',cat:'🎬 Cinema',lang:'🌐',tags:['horror','short','film'],
    type:'yt-ch',ytId:'UC4foa5B_ORQfO-OzQQUNryQ',desc:'ALTER — horror short films'},
  {id:'retrospekt',name:'Retrospekt',cat:'🎬 Cinema',lang:'🌐',tags:['classic','film','retro'],
    type:'yt-ch',ytId:'UCpS5zRfJ4FRf2EQKvQVOUhw',desc:'Retro sci-fi & B-movies'},

  // ── MUSIQUE & CONCERTS ──
  {id:'oprah',name:'ARTE Concert',cat:'🎵 Music',lang:'🌐',tags:['concert','classical','live'],
    type:'web',url:'https://concert.arte.tv',desc:'Free concerts — classical, jazz, rock, world'},
  {id:'medici',name:'Medici.tv Free',cat:'🎵 Music',lang:'🌐',tags:['classical','concert'],
    type:'web',url:'https://www.medici.tv',desc:'Classical music concerts & operas — free section'},
  {id:'museek',name:'Museek',cat:'🎵 Music',lang:'🌐',tags:['music','video'],
    type:'yt-ch',ytId:'UCK9rrUAGZJVU8VxH-rrHiSA',desc:'Curated music videos — no ads'},
  {id:'npr_music',name:'NPR Music',cat:'🎵 Music',lang:'🇺🇸',tags:['music','live','session'],
    type:'yt-ch',ytId:'UCWX3yGbODQ3sFDSvuCIRRmg',desc:'Tiny Desk concerts & music sessions'},
  {id:'la_blogotheque',name:'La Blogotheque',cat:'🎵 Music',lang:'🌐',tags:['music','indie','session'],
    type:'yt-ch',ytId:'UCWlS3uFAXQODhyHqfTFv8Kw',desc:'Intimate live music sessions in Paris'},
  {id:'boiler',name:'Boiler Room',cat:'🎵 Music',lang:'🌐',tags:['electronic','dj','live'],
    type:'yt-ch',ytId:'UCGBpxWJr9FNOcFYA5GkKrMg',desc:'Iconic underground DJ sets & live music'},
  {id:'mastadon',name:'Cercle',cat:'🎵 Music',lang:'🌐',tags:['electronic','dj','nature'],
    type:'yt-ch',ytId:'UCTQEN3MRJu7lGKOl7REQHVQ',desc:'Electronic music in extraordinary locations'},

  // ── SCIENCE & TECH ──
  {id:'yt_lectures',name:'MIT OpenCourseWare',cat:'🔬 Science',lang:'🌐',tags:['science','edu'],
    type:'yt-ch',ytId:'UCEBb1b_L6zDS3xTUrIALZOw',desc:'MIT lectures — physics, CS, math & more'},
  {id:'numberphile',name:'Numberphile',cat:'🔬 Science',lang:'🌐',tags:['math','science'],
    type:'yt-ch',ytId:'UCoxcjq-8xIDTYp3uz647V5A',desc:'Beautiful maths for everyone'},
  {id:'veritasium',name:'Veritasium',cat:'🔬 Science',lang:'🌐',tags:['science','physics'],
    type:'yt-ch',ytId:'UCHnyfMqiRRG1u-2MsSQLbXA',desc:'Science experiments & ideas'},
  {id:'kurzgesagt',name:'Kurzgesagt',cat:'🔬 Science',lang:'🌐',tags:['science','animation','edu'],
    type:'yt-ch',ytId:'UCsXVk37bltHxD1rDPwtNM8Q',desc:'Animated science & philosophy'},
  {id:'perimeter',name:'Perimeter Institute',cat:'🔬 Science',lang:'🌐',tags:['physics','lecture'],
    type:'yt-ch',ytId:'UCLjJ3jbVc9Yoy_aPNdGkANw',desc:'Frontier physics — public lectures'},

  // ── CULTURE & ART ──
  {id:'arte',name:'ARTE',cat:'🎨 Culture',lang:'🌐',tags:['culture','art','film'],
    type:'web',url:'https://www.arte.tv/en/videos/most-viewed/',desc:'ARTE — European culture & art TV'},
  {id:'louvre',name:'Le Louvre',cat:'🎨 Culture',lang:'🌐',tags:['art','museum'],
    type:'yt-ch',ytId:'UCriMZFZBxN9gMx9szKmVAqQ',desc:'Virtual visits & art history from the Louvre'},
  {id:'tate',name:'Tate Modern',cat:'🎨 Culture',lang:'🌐',tags:['art','museum'],
    type:'yt-ch',ytId:'UC4eWC8AHXqCQVXlMBd8Xf2A',desc:'Contemporary art — Tate galleries'},
  {id:'moma',name:'MoMA',cat:'🎨 Culture',lang:'🌐',tags:['art','museum','modern'],
    type:'yt-ch',ytId:'UCNB_jQcpKFNSqLVNPNJqHOA',desc:'Museum of Modern Art — talks & exhibitions'},
  {id:'getty',name:'Getty Museum',cat:'🎨 Culture',lang:'🌐',tags:['art','museum'],
    type:'yt-ch',ytId:'UCFEkX9GD5G9mFMSAGgIjSrw',desc:'J. Paul Getty Museum — art history'},

  // ── VOYAGE & NATURE ──
  {id:'dronestagram',name:'Drone Footage',cat:'🌍 Nature',lang:'🌐',tags:['drone','nature','landscape'],
    type:'yt-ch',ytId:'UCVp_6oydBrKFR8wLi-JxRvA',desc:'Stunning aerial drone footage worldwide'},
  {id:'earthtv',name:'EarthCam',cat:'🌍 Nature',lang:'🌐',tags:['live','webcam','world'],
    type:'web',url:'https://www.earthcam.com',desc:'Live webcams from landmarks around the world'},
  {id:'relaxing',name:'Relaxing White Noise',cat:'🌍 Nature',lang:'🌐',tags:['nature','ambient','relax'],
    type:'yt-live',ytId:'nMfPqeZjc2c',desc:'Relaxing nature sounds — rain, forest, ocean'},
  {id:'kiwi',name:'Walk the Planet',cat:'🌍 Nature',lang:'🌐',tags:['travel','walk','city'],
    type:'yt-ch',ytId:'UCStjO38Ub2NfJhDkxLVdL6g',desc:'4K walking tours of cities worldwide'},
];

// ── STORAGE ────────────────────────────────────────────────────────────────────
function loadFavs(){try{return JSON.parse(localStorage.getItem(FAVS_KEY)||'[]');}catch(e){return[];}}
function saveFavs(a){localStorage.setItem(FAVS_KEY,JSON.stringify(a));}
function toggleFav(id){var f=loadFavs();var i=f.indexOf(id);if(i>=0)f.splice(i,1);else f.push(id);saveFavs(f);}
function isFav(id){return loadFavs().includes(id);}

function loadHist(){try{return JSON.parse(localStorage.getItem(HIST_KEY)||'[]');}catch(e){return[];}}
function addHist(ch){
  var h=loadHist().filter(function(x){return x.id!==ch.id;});
  h.unshift({id:ch.id,name:ch.name,ts:Date.now()});
  h=h.slice(0,MAX_HIST);
  localStorage.setItem(HIST_KEY,JSON.stringify(h));
}

// ── PLAYER ────────────────────────────────────────────────────────────────────
function getEmbedUrl(ch){
  switch(ch.type){
    case 'yt-live':
      return 'https://www.youtube-nocookie.com/embed/'+ch.ytId+'?autoplay=1&rel=0&modestbranding=1';
    case 'yt-ch':
      return 'https://www.youtube-nocookie.com/embed/videoseries?list='+ch.ytId+'&autoplay=1&rel=0&modestbranding=1';
    case 'archive':
      return 'https://archive.org/embed/'+ch.query+'&autoplay=0';
    case 'web':
      return ch.url;
    default:
      return null;
  }
}

// ── RENDER ────────────────────────────────────────────────────────────────────
var _ctx = null;
var _panel = null;
var _curCh = null;
var _filterCat = '';
var _filterText = '';
var _tab = 'browse'; // browse | favs | history

function renderPanel(container){
  _panel = container;
  container.innerHTML = '';
  container.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;background:var(--bg)';

  // ── Player zone ──
  var playerWrap = document.createElement('div');
  playerWrap.id = 'vp-player';
  playerWrap.style.cssText = 'flex-shrink:0;background:#000;position:relative;aspect-ratio:16/9;max-height:38%;overflow:hidden';
  if(_curCh){
    _renderPlayer(playerWrap, _curCh);
  }else{
    playerWrap.innerHTML =
      '<div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:rgba(255,255,255,.25)">' +
        '<div style="font-size:40px">📺</div>' +
        '<div style="font-family:var(--font-m);font-size:11px;letter-spacing:2px">SELECT A CHANNEL</div>' +
      '</div>';
  }
  container.appendChild(playerWrap);

  // ── Now playing bar ──
  if(_curCh){
    var nowBar = document.createElement('div');
    nowBar.style.cssText = 'flex-shrink:0;display:flex;align-items:center;gap:10px;padding:8px 14px;background:rgba(0,0,0,.6);border-bottom:1px solid rgba(240,168,48,.15)';
    nowBar.innerHTML =
      '<div style="width:6px;height:6px;border-radius:50%;background:var(--red);animation:vpPulse 1.2s ease-in-out infinite;flex-shrink:0"></div>'+
      '<div style="flex:1;min-width:0">'+
        '<div style="font-size:12px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(_curCh.name)+'</div>'+
        '<div style="font-size:10px;color:var(--text3)">'+esc(_curCh.desc||_curCh.cat)+'</div>'+
      '</div>'+
      '<button id="vp-fav" style="background:none;border:none;font-size:18px;cursor:pointer;line-height:1;padding:4px">'+(isFav(_curCh.id)?'★':'☆')+'</button>'+
      '<button id="vp-stop" style="background:none;border:none;color:var(--text3);font-size:12px;cursor:pointer;padding:4px 8px;border-radius:6px;border:1px solid rgba(255,255,255,.1)">✕ Stop</button>';
    nowBar.querySelector('#vp-fav').addEventListener('click', function(){
      toggleFav(_curCh.id);
      renderPanel(container);
    });
    nowBar.querySelector('#vp-stop').addEventListener('click', function(){
      _curCh = null;
      renderPanel(container);
    });
    container.appendChild(nowBar);
  }

  // ── Tabs ──
  var tabs = document.createElement('div');
  tabs.style.cssText = 'flex-shrink:0;display:flex;background:rgba(0,0,0,.3);border-bottom:1px solid rgba(255,255,255,.06)';
  [['browse','📺 Channels'],['favs','★ Favs'],['history','🕓 History']].forEach(function(t){
    var btn = document.createElement('button');
    btn.style.cssText = 'flex:1;padding:10px 4px;background:none;border:none;border-top:2px solid '+(_tab===t[0]?'var(--gold)':'transparent')+';color:'+(_tab===t[0]?'var(--gold)':'rgba(255,255,255,.3)')+';font-size:11px;font-family:var(--font-d);letter-spacing:1px;cursor:pointer;transition:color .18s';
    btn.textContent = t[1];
    btn.addEventListener('click', function(){_tab=t[0];renderPanel(container);});
    tabs.appendChild(btn);
  });
  container.appendChild(tabs);

  // ── Content ──
  var content = document.createElement('div');
  content.style.cssText = 'flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch';
  container.appendChild(content);

  if(_tab === 'browse'){
    _renderBrowse(content, container);
  }else if(_tab === 'favs'){
    _renderFavs(content, container);
  }else{
    _renderHistory(content, container);
  }

  // Inject CSS once
  if(!document.getElementById('vp-style')){
    var s = document.createElement('style');
    s.id = 'vp-style';
    s.textContent = '@keyframes vpPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.75)}}.vp-card{transition:border-color .18s,background .18s}.vp-card:hover{border-color:rgba(240,168,48,.35)!important;background:rgba(240,168,48,.04)!important}';
    document.head.appendChild(s);
  }
}

function _renderPlayer(wrap, ch){
  var embedUrl = getEmbedUrl(ch);
  if(!embedUrl){
    wrap.innerHTML = '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--text3);font-size:12px">No player available</div>';
    return;
  }
  if(ch.type === 'web'){
    // External site — open in new tab + show banner
    wrap.innerHTML =
      '<div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:rgba(240,168,48,.04)">'+
        '<div style="font-size:32px">🌐</div>'+
        '<div style="font-size:13px;font-weight:600;color:var(--text)">'+esc(ch.name)+'</div>'+
        '<div style="font-size:11px;color:var(--text3);text-align:center;padding:0 20px">'+esc(ch.desc)+'</div>'+
        '<a href="'+ch.url+'" target="_blank" rel="noopener" style="padding:10px 20px;background:var(--gold);color:#000;border-radius:10px;font-size:13px;font-weight:700;text-decoration:none;font-family:var(--font-b)">Open in Browser ↗</a>'+
      '</div>';
  }else if(ch.type === 'archive'){
    // Internet Archive — search embed
    var searchUrl = 'https://archive.org/search?query='+ch.query+'&mediatype=movies&sort=-downloads';
    wrap.innerHTML =
      '<div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:#111">'+
        '<div style="font-size:32px">🏛</div>'+
        '<div style="font-size:13px;font-weight:600;color:var(--text)">'+esc(ch.name)+'</div>'+
        '<div style="font-size:11px;color:var(--text3);text-align:center;padding:0 20px">Free public domain library</div>'+
        '<a href="'+searchUrl+'" target="_blank" rel="noopener" style="padding:10px 20px;background:var(--gold);color:#000;border-radius:10px;font-size:13px;font-weight:700;text-decoration:none;font-family:var(--font-b)">Browse Library ↗</a>'+
      '</div>';
  }else{
    var iframe = document.createElement('iframe');
    iframe.src = embedUrl;
    iframe.allow = 'autoplay; fullscreen; picture-in-picture';
    iframe.allowFullscreen = true;
    iframe.style.cssText = 'width:100%;height:100%;border:none;display:block';
    iframe.loading = 'lazy';
    wrap.appendChild(iframe);
  }
}

function _renderBrowse(content, container){
  // Search + cats
  var controls = document.createElement('div');
  controls.style.cssText = 'padding:10px 14px;display:flex;flex-direction:column;gap:8px;background:rgba(0,0,0,.2);border-bottom:1px solid rgba(255,255,255,.05)';

  var searchBox = document.createElement('input');
  searchBox.className = 'ym-input';
  searchBox.placeholder = '🔍 Search channels…';
  searchBox.value = _filterText;
  searchBox.style.cssText = 'font-size:12px;padding:8px 12px';
  searchBox.addEventListener('input', function(){_filterText = searchBox.value.toLowerCase();_renderChannelList(list, container);});
  controls.appendChild(searchBox);

  var cats = [...new Set(CHANNELS.map(function(c){return c.cat;}))];
  var catRow = document.createElement('div');
  catRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px';
  ['All', ...cats].forEach(function(cat){
    var pill = document.createElement('span');
    pill.style.cssText = 'padding:3px 10px;border-radius:12px;font-size:10px;cursor:pointer;border:1px solid;'+
      (_filterCat===cat||(cat==='All'&&!_filterCat)
        ?'background:var(--gold);color:#000;border-color:var(--gold)'
        :'background:rgba(255,255,255,.04);color:var(--text3);border-color:rgba(255,255,255,.1)');
    pill.textContent = cat;
    pill.addEventListener('click', function(){
      _filterCat = cat==='All'?'':cat;
      renderPanel(container);
    });
    catRow.appendChild(pill);
  });
  controls.appendChild(catRow);
  content.appendChild(controls);

  var list = document.createElement('div');
  list.style.cssText = 'padding:10px 14px;display:flex;flex-direction:column;gap:8px';
  content.appendChild(list);
  _renderChannelList(list, container);
}

function _renderChannelList(list, container){
  list.innerHTML = '';
  var filtered = CHANNELS.filter(function(ch){
    var matchCat = !_filterCat || ch.cat === _filterCat;
    var matchTxt = !_filterText ||
      ch.name.toLowerCase().includes(_filterText) ||
      (ch.desc||'').toLowerCase().includes(_filterText) ||
      (ch.tags||[]).join(' ').includes(_filterText);
    return matchCat && matchTxt;
  });
  if(!filtered.length){
    list.innerHTML = '<div style="color:var(--text3);font-size:12px;padding:20px;text-align:center">No channels found</div>';
    return;
  }
  filtered.forEach(function(ch){
    list.appendChild(_makeChannelCard(ch, container));
  });
}

function _makeChannelCard(ch, container){
  var isPlaying = _curCh && _curCh.id === ch.id;
  var fav = isFav(ch.id);
  var card = document.createElement('div');
  card.className = 'vp-card';
  card.style.cssText =
    'display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:12px;border:1px solid '+
    (isPlaying?'rgba(240,168,48,.4)':'rgba(255,255,255,.07)')+';'+
    'background:'+(isPlaying?'rgba(240,168,48,.06)':'rgba(255,255,255,.02)')+';cursor:pointer';
  card.innerHTML =
    '<div style="width:42px;height:42px;border-radius:10px;background:rgba(255,255,255,.05);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;border:1px solid rgba(255,255,255,.06)">'+ch.cat.split(' ')[0]+'</div>'+
    '<div style="flex:1;min-width:0">'+
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">'+
        '<span style="font-size:13px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(ch.name)+'</span>'+
        '<span style="font-size:12px">'+ch.lang+'</span>'+
        (isPlaying?'<span style="font-size:9px;background:var(--red);color:#fff;padding:1px 5px;border-radius:4px;letter-spacing:1px">LIVE</span>':'')+
      '</div>'+
      '<div style="font-size:10px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(ch.desc||ch.cat)+'</div>'+
    '</div>'+
    '<div style="display:flex;gap:6px;flex-shrink:0;align-items:center">'+
      '<span style="font-size:16px;cursor:pointer" data-fav="'+ch.id+'">'+(fav?'★':'☆')+'</span>'+
      '<span style="font-size:18px;color:'+(isPlaying?'var(--gold)':'rgba(255,255,255,.2)')+'">▶</span>'+
    '</div>';

  card.querySelector('[data-fav]').addEventListener('click', function(e){
    e.stopPropagation();
    toggleFav(ch.id);
    renderPanel(_panel);
  });
  card.addEventListener('click', function(){
    _curCh = ch;
    addHist(ch);
    renderPanel(container);
    // Scroll to top to show player
    container.scrollTop = 0;
  });
  return card;
}

function _renderFavs(content, container){
  var favIds = loadFavs();
  var favChs = favIds.map(function(id){return CHANNELS.find(function(c){return c.id===id;});}).filter(Boolean);
  if(!favChs.length){
    content.innerHTML = '<div style="color:var(--text3);font-size:12px;padding:32px;text-align:center">No favourites yet.<br>Tap ☆ on any channel.</div>';
    return;
  }
  var list = document.createElement('div');
  list.style.cssText = 'padding:10px 14px;display:flex;flex-direction:column;gap:8px';
  favChs.forEach(function(ch){list.appendChild(_makeChannelCard(ch,container));});
  content.appendChild(list);
}

function _renderHistory(content, container){
  var hist = loadHist();
  if(!hist.length){
    content.innerHTML = '<div style="color:var(--text3);font-size:12px;padding:32px;text-align:center">No watch history yet.</div>';
    return;
  }
  var list = document.createElement('div');
  list.style.cssText = 'padding:10px 14px;display:flex;flex-direction:column;gap:8px';
  hist.forEach(function(h){
    var ch = CHANNELS.find(function(c){return c.id===h.id;});
    if(!ch)return;
    var card = _makeChannelCard(ch, container);
    // Add timestamp
    var ago = _ago(h.ts);
    var ts = document.createElement('div');
    ts.style.cssText = 'font-size:9px;color:var(--text3);text-align:right;padding:0 12px 6px;margin-top:-4px';
    ts.textContent = 'Watched '+ago+' ago';
    list.appendChild(card);
    list.appendChild(ts);
  });
  var clearBtn = document.createElement('button');
  clearBtn.className = 'ym-btn ym-btn-ghost';
  clearBtn.style.cssText = 'width:100%;margin-top:8px;font-size:11px;color:var(--red);border-color:rgba(255,69,96,.3)';
  clearBtn.textContent = '✕ Clear history';
  clearBtn.addEventListener('click', function(){localStorage.removeItem(HIST_KEY);renderPanel(container);});
  list.appendChild(clearBtn);
  content.appendChild(list);
}

function _ago(ts){
  if(!ts)return'?';
  var d = Math.floor((Date.now()-ts)/1000);
  if(d<60)return d+'s';
  if(d<3600)return Math.floor(d/60)+'min';
  if(d<86400)return Math.floor(d/3600)+'h';
  return Math.floor(d/86400)+'d';
}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

// ── SPHERE REGISTRATION ───────────────────────────────────────────────────────
window.YM_S['video.sphere.js'] = {
  name:        'VideoTV',
  icon:        '📺',
  category:    'Media',
  description: 'Free worldwide WebTV — news, docs, cinema, music, science. No ads, no sub.',
  emit:        [],
  receive:     [],

  activate(ctx){
    _ctx = ctx;
  },
  deactivate(){
    _ctx = null;
    _curCh = null;
    _panel = null;
  },
  renderPanel
};

})();