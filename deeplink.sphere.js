/* jshint esversion:11, browser:true */
// deeplink.sphere.js — Launcher d'apps natives via URI schemes
// Interface façon folder : liste d'apps, clic = ajoute aux favoris, favori = lance l'app
(function(){
'use strict';
window.YM_S=window.YM_S||{};

const FAV_KEY='ym_deeplink_fav_v1';

// ── APPS — liste exhaustive par catégorie ─────────────────────────────────────
const APPS=[
  // ── 🌐 Navigateurs ────────────────────────────────────────────────────────
  {id:'safari',       name:'Safari',           icon:'🧭', cat:'Browsers',   uri:'x-web-search://'},
  {id:'chrome',       name:'Chrome',           icon:'🔵', cat:'Browsers',   uri:'googlechrome://',     android:'intent://open#Intent;scheme=googlechrome;package=com.android.chrome;end'},
  {id:'firefox',      name:'Firefox',          icon:'🦊', cat:'Browsers',   uri:'firefox://',          android:'intent://open#Intent;scheme=firefox;package=org.mozilla.firefox;end'},
  {id:'brave',        name:'Brave',            icon:'🦁', cat:'Browsers',   uri:'brave://',            android:'intent://open#Intent;scheme=brave;package=com.brave.browser;end'},
  {id:'opera',        name:'Opera',            icon:'🔴', cat:'Browsers',   uri:'opera://',            android:'intent://open#Intent;scheme=opera;package=com.opera.browser;end'},
  {id:'edge',         name:'Edge',             icon:'🌊', cat:'Browsers',   uri:'microsoft-edge://',   android:'intent://open#Intent;scheme=microsoft-edge;package=com.microsoft.emmx;end'},
  {id:'duckgo',       name:'DuckDuckGo',       icon:'🦆', cat:'Browsers',   uri:'ddgQuickLink://',     android:'intent://open#Intent;scheme=ddgQuickLink;package=com.duckduckgo.mobile.android;end'},
  {id:'tor',          name:'Tor Browser',      icon:'🧅', cat:'Browsers',   uri:'tor://',              android:'intent://open#Intent;scheme=tor;package=org.torproject.torbrowser;end'},

  // ── 📧 Email ──────────────────────────────────────────────────────────────
  {id:'gmail',        name:'Gmail',            icon:'📧', cat:'Email',      uri:'googlegmail://',      android:'intent://open#Intent;scheme=googlegmail;package=com.google.android.gm;end'},
  {id:'mail',         name:'Apple Mail',       icon:'✉️', cat:'Email',      uri:'message://'},
  {id:'outlook',      name:'Outlook',          icon:'📨', cat:'Email',      uri:'ms-outlook://',       android:'intent://open#Intent;scheme=ms-outlook;package=com.microsoft.office.outlook;end'},
  {id:'protonmail',   name:'Proton Mail',      icon:'🔐', cat:'Email',      uri:'protonmail://',       android:'intent://open#Intent;scheme=protonmail;package=ch.protonmail.android;end'},
  {id:'spark',        name:'Spark Mail',       icon:'⚡', cat:'Email',      uri:'readdle-spark://',    android:'intent://open#Intent;scheme=readdle-spark;package=com.readdle.spark;end'},
  {id:'hey',          name:'HEY Email',        icon:'👋', cat:'Email',      uri:'hey://',              android:'intent://open#Intent;scheme=hey;package=com.basecamp.hey;end'},

  // ── 🎵 Musique ────────────────────────────────────────────────────────────
  {id:'spotify',      name:'Spotify',          icon:'🎵', cat:'Music',      uri:'spotify://',          android:'intent://open#Intent;scheme=spotify;package=com.spotify.music;end'},
  {id:'deezer',       name:'Deezer',           icon:'🎶', cat:'Music',      uri:'deezer://',           android:'intent://open#Intent;scheme=deezer;package=deezer.android.app;end'},
  {id:'applemusic',   name:'Apple Music',      icon:'🍎', cat:'Music',      uri:'music://'},
  {id:'tidal',        name:'Tidal',            icon:'🌊', cat:'Music',      uri:'tidal://',            android:'intent://open#Intent;scheme=tidal;package=com.aspiro.tidal;end'},
  {id:'soundcloud',   name:'SoundCloud',       icon:'☁️', cat:'Music',      uri:'soundcloud://',       android:'intent://open#Intent;scheme=soundcloud;package=com.soundcloud.android;end'},
  {id:'shazam',       name:'Shazam',           icon:'🎯', cat:'Music',      uri:'shazam://',           android:'intent://open#Intent;scheme=shazam;package=com.shazam.android;end'},
  {id:'bandcamp',     name:'Bandcamp',         icon:'🎸', cat:'Music',      uri:'bandcamp://',         android:'intent://open#Intent;scheme=bandcamp;package=com.bandcamp.android;end'},
  {id:'audiomack',    name:'Audiomack',        icon:'🎤', cat:'Music',      uri:'audiomack://',        android:'intent://open#Intent;scheme=audiomack;package=com.audiomack;end'},

  // ── 📺 Vidéo & Streaming ──────────────────────────────────────────────────
  {id:'youtube',      name:'YouTube',          icon:'📺', cat:'Video',      uri:'youtube://',          android:'intent://www.youtube.com#Intent;scheme=https;package=com.google.android.youtube;end'},
  {id:'netflix',      name:'Netflix',          icon:'🎬', cat:'Video',      uri:'nflx://www.netflix.com', android:'intent://www.netflix.com#Intent;scheme=https;package=com.netflix.mediaclient;end'},
  {id:'prime',        name:'Prime Video',      icon:'📦', cat:'Video',      uri:'aiv://',              android:'intent://open#Intent;scheme=aiv;package=com.amazon.avod.thirdpartyclient;end'},
  {id:'disney',       name:'Disney+',          icon:'✨', cat:'Video',      uri:'disneyplus://',       android:'intent://open#Intent;scheme=disneyplus;package=com.disney.disneyplus;end'},
  {id:'twitch',       name:'Twitch',           icon:'💜', cat:'Video',      uri:'twitch://open',       android:'intent://open#Intent;scheme=twitch;package=tv.twitch.android.app;end'},
  {id:'tiktok',       name:'TikTok',           icon:'🎵', cat:'Video',      uri:'snssdk1233://feed',   android:'intent://open#Intent;scheme=snssdk1233;package=com.zhiliaoapp.musically;end'},
  {id:'vimeo',        name:'Vimeo',            icon:'🎞', cat:'Video',      uri:'vimeo://',            android:'intent://open#Intent;scheme=vimeo;package=com.vimeo.android.videoapp;end'},
  {id:'dailymotion',  name:'Dailymotion',      icon:'🎦', cat:'Video',      uri:'dailymotion://',      android:'intent://open#Intent;scheme=dailymotion;package=com.dailymotion.dailymotion;end'},
  {id:'mubi',         name:'MUBI',             icon:'🎭', cat:'Video',      uri:'mubi://',             android:'intent://open#Intent;scheme=mubi;package=com.mubi;end'},

  // ── 💬 Messaging ──────────────────────────────────────────────────────────
  {id:'whatsapp',     name:'WhatsApp',         icon:'💬', cat:'Messaging',  uri:'whatsapp://send',     android:'intent://send#Intent;scheme=whatsapp;package=com.whatsapp;end'},
  {id:'telegram',     name:'Telegram',         icon:'✈️', cat:'Messaging',  uri:'tg://resolve',        android:'intent://resolve#Intent;scheme=tg;package=org.telegram.messenger;end'},
  {id:'signal',       name:'Signal',           icon:'🔒', cat:'Messaging',  uri:'sgnl://',             android:'intent://open#Intent;scheme=sgnl;package=org.thoughtcrime.securesms;end'},
  {id:'discord',      name:'Discord',          icon:'🎮', cat:'Messaging',  uri:'discord://',          android:'intent://discord.com#Intent;scheme=https;package=com.discord;end'},
  {id:'slack',        name:'Slack',            icon:'#️⃣', cat:'Messaging',  uri:'slack://',            android:'intent://open#Intent;scheme=slack;package=com.Slack;end'},
  {id:'messenger',    name:'Messenger',        icon:'💙', cat:'Messaging',  uri:'fb-messenger://',     android:'intent://open#Intent;scheme=fb-messenger;package=com.facebook.orca;end'},
  {id:'teams',        name:'MS Teams',         icon:'🟣', cat:'Messaging',  uri:'msteams://',          android:'intent://open#Intent;scheme=msteams;package=com.microsoft.teams;end'},
  {id:'viber',        name:'Viber',            icon:'💜', cat:'Messaging',  uri:'viber://',            android:'intent://open#Intent;scheme=viber;package=com.viber.voip;end'},
  {id:'line',         name:'Line',             icon:'🟩', cat:'Messaging',  uri:'line://',             android:'intent://open#Intent;scheme=line;package=jp.naver.line.android;end'},
  {id:'skype',        name:'Skype',            icon:'🔷', cat:'Messaging',  uri:'skype://',            android:'intent://open#Intent;scheme=skype;package=com.skype.raider;end'},
  {id:'kakaotalk',    name:'KakaoTalk',        icon:'🟡', cat:'Messaging',  uri:'kakaolink://',        android:'intent://open#Intent;scheme=kakaolink;package=com.kakao.talk;end'},

  // ── 📸 Social ─────────────────────────────────────────────────────────────
  {id:'instagram',    name:'Instagram',        icon:'📸', cat:'Social',     uri:'instagram://app',     android:'intent://instagram.com#Intent;scheme=https;package=com.instagram.android;end'},
  {id:'twitter',      name:'X (Twitter)',      icon:'🐦', cat:'Social',     uri:'twitter://timeline',  android:'intent://timeline#Intent;scheme=twitter;package=com.twitter.android;end'},
  {id:'facebook',     name:'Facebook',         icon:'👥', cat:'Social',     uri:'fb://',               android:'intent://open#Intent;scheme=fb;package=com.facebook.katana;end'},
  {id:'linkedin',     name:'LinkedIn',         icon:'💼', cat:'Social',     uri:'linkedin://',         android:'intent://open#Intent;scheme=linkedin;package=com.linkedin.android;end'},
  {id:'snapchat',     name:'Snapchat',         icon:'👻', cat:'Social',     uri:'snapchat://',         android:'intent://open#Intent;scheme=snapchat;package=com.snapchat.android;end'},
  {id:'reddit',       name:'Reddit',           icon:'🤖', cat:'Social',     uri:'reddit://',           android:'intent://open#Intent;scheme=reddit;package=com.reddit.frontpage;end'},
  {id:'pinterest',    name:'Pinterest',        icon:'📌', cat:'Social',     uri:'pinterest://',        android:'intent://open#Intent;scheme=pinterest;package=com.pinterest;end'},
  {id:'mastodon',     name:'Mastodon',         icon:'🐘', cat:'Social',     uri:'mastodon://',         android:'intent://open#Intent;scheme=mastodon;package=org.joinmastodon.android;end'},
  {id:'threads',      name:'Threads',          icon:'🧵', cat:'Social',     uri:'barcelona://',        android:'intent://open#Intent;scheme=barcelona;package=com.instagram.barcelona;end'},
  {id:'bluesky',      name:'Bluesky',          icon:'🦋', cat:'Social',     uri:'bluesky://',          android:'intent://open#Intent;scheme=bluesky;package=xyz.blueskyweb.app;end'},
  {id:'bereal',       name:'BeReal',           icon:'📷', cat:'Social',     uri:'bereal://',           android:'intent://open#Intent;scheme=bereal;package=com.bereal.ft;end'},

  // ── 📁 Productivité ───────────────────────────────────────────────────────
  {id:'notion',       name:'Notion',           icon:'📝', cat:'Productivity', uri:'notion://',         android:'intent://open#Intent;scheme=notion;package=notion.id;end'},
  {id:'obsidian',     name:'Obsidian',         icon:'💎', cat:'Productivity', uri:'obsidian://',       android:'intent://open#Intent;scheme=obsidian;package=md.obsidian;end'},
  {id:'evernote',     name:'Evernote',         icon:'🐘', cat:'Productivity', uri:'evernote://',       android:'intent://open#Intent;scheme=evernote;package=com.evernote;end'},
  {id:'bear',         name:'Bear',             icon:'🐻', cat:'Productivity', uri:'bear://'},
  {id:'craft',        name:'Craft',            icon:'✏️', cat:'Productivity', uri:'craft://'},
  {id:'todoist',      name:'Todoist',          icon:'✅', cat:'Productivity', uri:'todoist://',        android:'intent://open#Intent;scheme=todoist;package=com.todoist;end'},
  {id:'things',       name:'Things',           icon:'☁️', cat:'Productivity', uri:'things://'},
  {id:'linear',       name:'Linear',           icon:'📐', cat:'Productivity', uri:'linear://',         android:'intent://open#Intent;scheme=linear;package=io.linear;end'},
  {id:'asana',        name:'Asana',            icon:'🎯', cat:'Productivity', uri:'asana://',          android:'intent://open#Intent;scheme=asana;package=com.asana.app;end'},
  {id:'trello',       name:'Trello',           icon:'📋', cat:'Productivity', uri:'trello://',         android:'intent://open#Intent;scheme=trello;package=com.trello;end'},
  {id:'dropbox',      name:'Dropbox',          icon:'📦', cat:'Productivity', uri:'dbapi-2://',        android:'intent://open#Intent;scheme=dbapi-2;package=com.dropbox.android;end'},
  {id:'gdrive',       name:'Google Drive',     icon:'🗂', cat:'Productivity', uri:'googledrive://',    android:'intent://open#Intent;scheme=googledrive;package=com.google.android.apps.docs;end'},
  {id:'onedrive',     name:'OneDrive',         icon:'☁️', cat:'Productivity', uri:'ms-onedrive://',    android:'intent://open#Intent;scheme=ms-onedrive;package=com.microsoft.skydrive;end'},

  // ── 🖥 Dev & Design ───────────────────────────────────────────────────────
  {id:'vscode',       name:'VS Code',          icon:'🖥', cat:'Dev',        uri:'vscode://'},
  {id:'xcode',        name:'Xcode',            icon:'🔨', cat:'Dev',        uri:'xcode://'},
  {id:'figma',        name:'Figma',            icon:'🎨', cat:'Dev',        uri:'figma://'},
  {id:'sketch',       name:'Sketch',           icon:'💠', cat:'Dev',        uri:'sketch://'},
  {id:'zeplin',       name:'Zeplin',           icon:'🔌', cat:'Dev',        uri:'zpl://'},
  {id:'github',       name:'GitHub',           icon:'🐙', cat:'Dev',        uri:'github://',           android:'intent://open#Intent;scheme=github;package=com.github.android;end'},
  {id:'sourcetree',   name:'Sourcetree',       icon:'🌲', cat:'Dev',        uri:'sourcetree://'},
  {id:'tower',        name:'Tower Git',        icon:'🏰', cat:'Dev',        uri:'com.fournova.tower2://'},

  // ── 🗺 Maps & Transport ───────────────────────────────────────────────────
  {id:'googlemaps',   name:'Google Maps',      icon:'🗺', cat:'Maps',       uri:'comgooglemaps://',    android:'intent://maps.google.com#Intent;scheme=https;package=com.google.android.apps.maps;end'},
  {id:'applemaps',    name:'Apple Maps',       icon:'🍎', cat:'Maps',       uri:'maps://'},
  {id:'waze',         name:'Waze',             icon:'🚗', cat:'Maps',       uri:'waze://',             android:'intent://open#Intent;scheme=waze;package=com.waze;end'},
  {id:'citymapper',   name:'Citymapper',       icon:'🚇', cat:'Maps',       uri:'citymapper://',       android:'intent://open#Intent;scheme=citymapper;package=com.citymapper.app.release;end'},
  {id:'uber',         name:'Uber',             icon:'🚕', cat:'Maps',       uri:'uber://',             android:'intent://open#Intent;scheme=uber;package=com.ubercab;end'},
  {id:'lyft',         name:'Lyft',             icon:'🩷', cat:'Maps',       uri:'lyft://',             android:'intent://open#Intent;scheme=lyft;package=me.lyft.android;end'},
  {id:'bolt',         name:'Bolt',             icon:'⚡', cat:'Maps',       uri:'taxify://',           android:'intent://open#Intent;scheme=taxify;package=ee.mtakso.client;end'},
  {id:'lime',         name:'Lime',             icon:'🛴', cat:'Maps',       uri:'lime://',             android:'intent://open#Intent;scheme=lime;package=com.limebike;end'},

  // ── 💳 Finance ────────────────────────────────────────────────────────────
  {id:'paypal',       name:'PayPal',           icon:'💳', cat:'Finance',    uri:'paypal://touchWallet', android:'intent://touchWallet#Intent;scheme=paypal;package=com.paypal.android.p2pmobile;end'},
  {id:'revolut',      name:'Revolut',          icon:'🔵', cat:'Finance',    uri:'revolut://',           android:'intent://open#Intent;scheme=revolut;package=com.revolut.revolut;end'},
  {id:'wise',         name:'Wise',             icon:'💚', cat:'Finance',    uri:'wise://',              android:'intent://open#Intent;scheme=wise;package=com.transferwise.android;end'},
  {id:'n26',          name:'N26',              icon:'🏦', cat:'Finance',    uri:'n26://',               android:'intent://open#Intent;scheme=n26;package=de.number26.android;end'},
  {id:'cashapp',      name:'Cash App',         icon:'💰', cat:'Finance',    uri:'squarecash://',        android:'intent://open#Intent;scheme=squarecash;package=com.squareup.cash;end'},
  {id:'venmo',        name:'Venmo',            icon:'🎊', cat:'Finance',    uri:'venmo://',             android:'intent://open#Intent;scheme=venmo;package=com.venmo;end'},
  {id:'binance',      name:'Binance',          icon:'🪙', cat:'Finance',    uri:'bnc://',               android:'intent://open#Intent;scheme=bnc;package=com.binance.dev;end'},
  {id:'coinbase',     name:'Coinbase',         icon:'🔵', cat:'Finance',    uri:'coinbase://',          android:'intent://open#Intent;scheme=coinbase;package=com.coinbase.android;end'},

  // ── 🏃 Sport & Santé ──────────────────────────────────────────────────────
  {id:'strava',       name:'Strava',           icon:'🏃', cat:'Health',     uri:'strava://',            android:'intent://open#Intent;scheme=strava;package=com.strava;end'},
  {id:'garmin',       name:'Garmin Connect',   icon:'⌚', cat:'Health',     uri:'gcm-connect://',       android:'intent://open#Intent;scheme=gcm-connect;package=com.garmin.android.apps.connectmobile;end'},
  {id:'komoot',       name:'Komoot',           icon:'🚵', cat:'Health',     uri:'komoot://',            android:'intent://open#Intent;scheme=komoot;package=de.komoot.android;end'},
  {id:'myfitnesspal', name:'MyFitnessPal',     icon:'🥗', cat:'Health',     uri:'myfitnesspal://',      android:'intent://open#Intent;scheme=myfitnesspal;package=com.myfitnesspal.android;end'},

  // ── 🛒 Shopping ───────────────────────────────────────────────────────────
  {id:'amazon',       name:'Amazon',           icon:'🛒', cat:'Shopping',   uri:'com.amazon.mobile.shopping.web://www.amazon.com', android:'intent://www.amazon.com#Intent;scheme=https;package=com.amazon.mShop.android.shopping;end'},
  {id:'ebay',         name:'eBay',             icon:'🔨', cat:'Shopping',   uri:'ebay://',              android:'intent://open#Intent;scheme=ebay;package=com.ebay.mobile;end'},
  {id:'aliexpress',   name:'AliExpress',       icon:'🏮', cat:'Shopping',   uri:'aliexpress://',        android:'intent://open#Intent;scheme=aliexpress;package=com.alibaba.aliexpresshd;end'},
  {id:'etsy',         name:'Etsy',             icon:'🎨', cat:'Shopping',   uri:'etsy://',              android:'intent://open#Intent;scheme=etsy;package=com.etsy.android;end'},
  {id:'vinted',       name:'Vinted',           icon:'👗', cat:'Shopping',   uri:'vinted://',            android:'intent://open#Intent;scheme=vinted;package=eu.vinted.app;end'},

  // ── 📰 News & Lecture ─────────────────────────────────────────────────────
  {id:'pocket',       name:'Pocket',           icon:'🎯', cat:'Reading',    uri:'pocket-oauth-v1://',   android:'intent://open#Intent;scheme=pocket-oauth-v1;package=com.ideashower.readitlater.pro;end'},
  {id:'instapaper',   name:'Instapaper',       icon:'📄', cat:'Reading',    uri:'instapaper://',        android:'intent://open#Intent;scheme=instapaper;package=com.instapaper.android;end'},
  {id:'kindle',       name:'Kindle',           icon:'📚', cat:'Reading',    uri:'kindle://',            android:'intent://open#Intent;scheme=kindle;package=com.amazon.kindle;end'},
  {id:'feedly',       name:'Feedly',           icon:'📰', cat:'Reading',    uri:'feedly://',            android:'intent://open#Intent;scheme=feedly;package=com.devhd.feedly;end'},

  // ── ☁️ Météo & Utilitaires ────────────────────────────────────────────────
  {id:'darksky',      name:'Weather (iOS)',    icon:'🌤', cat:'Utils',      uri:'darksky://'},
  {id:'1password',    name:'1Password',        icon:'🔑', cat:'Utils',      uri:'onepassword://',       android:'intent://open#Intent;scheme=onepassword;package=com.agilebits.onepassword;end'},
  {id:'lastpass',     name:'LastPass',         icon:'🔐', cat:'Utils',      uri:'lastpass://',          android:'intent://open#Intent;scheme=lastpass;package=com.lastpass.lpandroid;end'},
  {id:'bitwarden',    name:'Bitwarden',        icon:'🛡', cat:'Utils',      uri:'bitwarden://',         android:'intent://open#Intent;scheme=bitwarden;package=com.x8bit.bitwarden;end'},
  {id:'authy',        name:'Authy',            icon:'🔢', cat:'Utils',      uri:'authy://',             android:'intent://open#Intent;scheme=authy;package=com.authy.authy;end'},
  {id:'airdrop',      name:'AirDrop',          icon:'📡', cat:'Utils',      uri:'airdrop://'},
  {id:'shortcuts',    name:'Shortcuts (iOS)',  icon:'⚡', cat:'Utils',      uri:'shortcuts://'},
  {id:'files',        name:'Files (iOS)',      icon:'🗂', cat:'Utils',      uri:'shareddocuments://'},
  {id:'settings',     name:'Settings (iOS)',   icon:'⚙️', cat:'Utils',      uri:'app-settings://'},
  {id:'settings_a',   name:'Settings (Android)',icon:'⚙️',cat:'Utils',      android:'intent://#Intent;action=android.settings.SETTINGS;end'},
];

// ── PLATFORM ───────────────────────────────────────────────────────────────────
function isIOS(){return /iphone|ipad|ipod/i.test(navigator.userAgent);}
function isAndroid(){return /android/i.test(navigator.userAgent);}

// ── LAUNCH ────────────────────────────────────────────────────────────────────
function launch(app){
  var uri=isAndroid()&&app.android?app.android:app.uri;
  if(!uri)return;
  // window.location.href naviguerait hors du PWA — on utilise un iframe invisible
  // ou window.open selon le type de scheme
  if(uri.startsWith('http')){
    window.open(uri,'_blank');
    return;
  }
  // Scheme natif — iframe invisible pour déclencher sans naviguer
  var frame=document.createElement('iframe');
  frame.style.cssText='position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;border:none';
  frame.src=uri;
  document.body.appendChild(frame);
  setTimeout(function(){
    if(frame.parentNode)frame.remove();
    // Fallback store si on est toujours là après 2s (app non installée)
    if(!document.hidden){
      var store=isIOS()?app.ios_store:app.android_store;
      if(store){
        window.open(store,'_blank');
        window.YM_toast&&window.YM_toast(app.name+' not found — opening store','info');
      }
    }
  },2000);
  window.YM_toast&&window.YM_toast('Opening '+app.name+'…','info');
}

// ── STORAGE ───────────────────────────────────────────────────────────────────
function loadFavs(){try{return JSON.parse(localStorage.getItem(FAV_KEY)||'[]');}catch(e){return[];}}
function saveFavs(d){localStorage.setItem(FAV_KEY,JSON.stringify(d));}
function isFav(id){return loadFavs().some(function(f){return f.id===id;});}
function toggleFav(app){
  var favs=loadFavs();
  var idx=favs.findIndex(function(f){return f.id===app.id;});
  if(idx>=0){favs.splice(idx,1);}else{favs.unshift({id:app.id,name:app.name,icon:app.icon,uri:app.uri,android:app.android});}
  saveFavs(favs);
}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

// ── PANEL ─────────────────────────────────────────────────────────────────────
function renderPanel(container){
  container.style.cssText='display:flex;flex-direction:column;height:100%;overflow:hidden';
  container.innerHTML='';

  // Panel = UNIQUEMENT les favoris (grille) + bouton browse
  // La config (ajout/retrait d'apps) est dans profileSection
  const body=document.createElement('div');
  body.style.cssText='flex:1;overflow-y:auto';
  container.appendChild(body);

  function renderFavGrid(){
    body.innerHTML='';
    var favs=loadFavs();
    if(!favs.length){
      body.innerHTML='<div style="color:var(--text3);font-size:12px;padding:24px 16px;text-align:center">No apps yet.<br>Go to your Profile → DeepLink to add apps.</div>';
      return;
    }
    var grid=document.createElement('div');
    grid.style.cssText='display:grid;grid-template-columns:repeat(4,1fr);gap:16px;padding:16px';
    favs.forEach(function(f){
      var app=APPS.find(function(a){return a.id===f.id;})||f;
      var btn=document.createElement('div');
      btn.style.cssText='display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer';
      var iconDiv=document.createElement('div');
      iconDiv.style.cssText='width:56px;height:56px;border-radius:14px;background:var(--surface2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:28px;transition:transform .12s';
      iconDiv.textContent=app.icon||'🔗';
      var lbl=document.createElement('span');
      lbl.style.cssText='font-size:10px;color:var(--text2);text-align:center;max-width:64px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      lbl.textContent=app.name;
      btn.appendChild(iconDiv);btn.appendChild(lbl);
      iconDiv.addEventListener('mouseenter',function(){iconDiv.style.transform='scale(1.1)';});
      iconDiv.addEventListener('mouseleave',function(){iconDiv.style.transform='';});
      btn.addEventListener('click',function(){launch(app);});
      grid.appendChild(btn);
    });
    body.appendChild(grid);
    var hint=document.createElement('div');
    hint.style.cssText='font-size:10px;color:var(--text3);text-align:center;padding:4px 8px 16px';
    hint.textContent='Tap to open · Manage in Profile';
    body.appendChild(hint);
  }
  renderFavGrid();

  // Variables pour le reste du panel (Browse)
  const cats=[...new Set(APPS.map(function(a){return a.cat;}))];
  var activeTab='all';
  const hdr=null; // unused placeholder for compat

  function renderCats(){
    catBar.innerHTML='';
    ['⭐ Favs','All',...cats].forEach(function(cat){
      var id=cat==='⭐ Favs'?'favs':cat==='All'?'all':cat;
      var b=document.createElement('button');
      b.className='ym-btn ym-btn-ghost';
      b.style.cssText='font-size:10px;padding:2px 9px;white-space:nowrap;flex-shrink:0'+(id===activeTab?';background:var(--accent);color:#000':'');
      b.textContent=cat;
      b.addEventListener('click',function(){activeTab=id;renderCats();render();});
      catBar.appendChild(b);
    });
  }

  function render(){
    body.innerHTML='';
    var q=hdr.querySelector('#dl-q').value.toLowerCase();
    var favs=loadFavs();

    var apps;
    if(activeTab==='favs'){
      // Dossier des favoris
      if(!favs.length){
        body.innerHTML='<div style="color:var(--text3);font-size:12px;padding:24px 16px;text-align:center">No saved apps yet.<br>Browse All and tap ⭐ to add here.</div>';
        return;
      }
      // Grille de lancement — comme un folder
      var grid=document.createElement('div');
      grid.style.cssText='display:grid;grid-template-columns:repeat(4,1fr);gap:16px;padding:16px';
      favs.forEach(function(f){
        var app=APPS.find(function(a){return a.id===f.id;})||f;
        var btn=document.createElement('div');
        btn.style.cssText='display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer';
        btn.innerHTML=
          '<div style="width:56px;height:56px;border-radius:14px;background:var(--surface2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:28px;transition:transform .12s">'+esc(app.icon||'🔗')+'</div>'+
          '<span style="font-size:10px;color:var(--text2);text-align:center;max-width:64px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(app.name)+'</span>';
        btn.querySelector('div').addEventListener('mouseenter',function(e){e.target.style.transform='scale(1.1)';});
        btn.querySelector('div').addEventListener('mouseleave',function(e){e.target.style.transform='';});
        btn.addEventListener('click',function(){launch(app);});
        btn.addEventListener('contextmenu',function(e){e.preventDefault();toggleFav(app);render();window.YM_toast&&window.YM_toast('Removed from apps','info');});
        grid.appendChild(btn);
      });
      // Ajouter custom
      var addTile=document.createElement('div');
      addTile.style.cssText='display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer;opacity:.6';
      addTile.innerHTML=
        '<div style="width:56px;height:56px;border-radius:14px;background:var(--surface2);border:1px dashed var(--border2);display:flex;align-items:center;justify-content:center;font-size:24px">+</div>'+
        '<span style="font-size:10px;color:var(--text3)">Custom</span>';
      addTile.addEventListener('click',function(){_showAddCustom(function(){render();});});
      grid.appendChild(addTile);
      body.appendChild(grid);
      body.innerHTML+='<div style="font-size:10px;color:var(--text3);text-align:center;padding:8px">Long press an icon to remove · Browse All to add</div>';
      return;
    }

    // Liste de toutes les apps ou par catégorie
    apps=APPS.filter(function(a){
      if(activeTab!=='all'&&a.cat!==activeTab)return false;
      if(q&&!a.name.toLowerCase().includes(q)&&!(a.cat||'').toLowerCase().includes(q))return false;
      return true;
    });
    if(q)apps=apps.filter(function(a){return a.name.toLowerCase().includes(q)||a.cat.toLowerCase().includes(q);});

    // Regroupe par catégorie si 'all'
    if(activeTab==='all'&&!q){
      var byCat={};
      apps.forEach(function(a){var c=a.cat||'Other';if(!byCat[c])byCat[c]=[];byCat[c].push(a);});
      Object.entries(byCat).forEach(function([cat,list]){
        var lbl=document.createElement('div');
        lbl.style.cssText='font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;padding:10px 16px 4px;font-weight:600';
        lbl.textContent=cat;body.appendChild(lbl);
        list.forEach(function(app){body.appendChild(mkAppRow(app));});
      });
    }else{
      apps.forEach(function(app){body.appendChild(mkAppRow(app));});
    }
    if(!apps.length)body.innerHTML='<div style="color:var(--text3);font-size:12px;padding:24px;text-align:center">No apps found.</div>';
  }

  function mkAppRow(app){
    var fav=isFav(app.id);
    var row=document.createElement('div');
    row.style.cssText='display:flex;align-items:center;gap:12px;padding:10px 16px;cursor:pointer;transition:background .1s';
    row.innerHTML=
      '<div style="width:42px;height:42px;border-radius:11px;background:var(--surface2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">'+esc(app.icon||'🔗')+'</div>'+
      '<div style="flex:1;min-width:0">'+
        '<div style="font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(app.name)+'</div>'+
        '<div style="font-size:10px;color:var(--text3)">'+esc(app.cat||'')+'</div>'+
      '</div>'+
      '<button class="dl-star" style="background:none;border:none;cursor:pointer;font-size:18px;padding:4px 8px;flex-shrink:0;color:'+(fav?'#f4c430':'var(--text3)')+'">'+  (fav?'⭐':'☆')+'</button>';
    row.addEventListener('mouseenter',function(){row.style.background='rgba(255,255,255,.03)';});
    row.addEventListener('mouseleave',function(){row.style.background='';});
    row.addEventListener('click',function(e){
      if(e.target.closest('.dl-star'))return;
      launch(app);
    });
    row.querySelector('.dl-star').addEventListener('click',function(e){
      e.stopPropagation();
      toggleFav(app);
      var wasFav=fav;fav=!fav;
      e.target.textContent=fav?'⭐':'☆';
      e.target.style.color=fav?'#f4c430':'var(--text3)';
      window.YM_toast&&window.YM_toast(wasFav?app.name+' removed':'Added to apps','success');
    });
    return row;
  }

  renderCats();render();
  hdr.querySelector('#dl-q').addEventListener('input',render);
}

function _showAddCustom(onDone){
  var overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;z-index:9990;background:rgba(0,0,0,.75);display:flex;align-items:flex-end;justify-content:center';
  var box=document.createElement('div');
  box.style.cssText='background:var(--surface2);border-radius:var(--r-lg) var(--r-lg) 0 0;padding:20px;width:100%;max-width:500px';
  box.innerHTML=
    '<div style="font-size:14px;font-weight:600;margin-bottom:10px">Custom App / URI</div>'+
    '<div style="font-size:11px;color:var(--text3);margin-bottom:12px">'+
      'Any URI scheme registered on your device.<br>'+
      '<code style="color:var(--accent)">spotify://</code> · <code style="color:var(--accent)">vscode://</code> · <code style="color:var(--accent)">myapp://</code>'+
    '</div>'+
    '<div style="display:flex;gap:8px;margin-bottom:8px">'+
      '<input id="cc-icon" class="ym-input" placeholder="🔗" style="width:52px;font-size:18px;text-align:center">'+
      '<input id="cc-name" class="ym-input" placeholder="App name *" style="flex:1;font-size:13px">'+
    '</div>'+
    '<input id="cc-uri" class="ym-input" placeholder="URI scheme (e.g. myapp://) *" style="width:100%;font-size:12px;font-family:var(--font-m);margin-bottom:14px">'+
    '<div style="display:flex;gap:8px">'+
      '<button id="cc-cancel" class="ym-btn ym-btn-ghost" style="flex:1">Cancel</button>'+
      '<button id="cc-save" class="ym-btn ym-btn-accent" style="flex:1">Add & Launch</button>'+
    '</div>';
  overlay.appendChild(box);document.body.appendChild(overlay);
  overlay.addEventListener('click',function(e){if(e.target===overlay)overlay.remove();});
  box.querySelector('#cc-cancel').addEventListener('click',function(){overlay.remove();});
  box.querySelector('#cc-save').addEventListener('click',function(){
    var name=box.querySelector('#cc-name').value.trim();
    var uri=box.querySelector('#cc-uri').value.trim();
    if(!name||!uri){window.YM_toast&&window.YM_toast('Name and URI required','error');return;}
    var app={id:'custom_'+Date.now(),name,icon:box.querySelector('#cc-icon').value.trim()||'🔗',uri,cat:'Custom',custom:true};
    var favs=loadFavs();favs.unshift(app);saveFavs(favs);
    overlay.remove();
    if(onDone)onDone();
    launch(app);
  });
}

function _showBrowseApps(onDone){
  var overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;z-index:9990;background:rgba(0,0,0,.8);display:flex;flex-direction:column';
  var header=document.createElement('div');
  header.style.cssText='flex-shrink:0;background:var(--surface2);padding:12px 16px;display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--border)';
  header.innerHTML=
    '<input id="ba-q" class="ym-input" placeholder="Search apps…" style="flex:1;font-size:13px">'+
    '<button id="ba-close" class="ym-btn ym-btn-ghost" style="font-size:12px">Done</button>';
  var catBar=document.createElement('div');
  catBar.style.cssText='flex-shrink:0;display:flex;gap:4px;flex-wrap:wrap;padding:8px 16px;background:var(--surface2);border-bottom:1px solid var(--border);overflow-x:auto';
  var list=document.createElement('div');
  list.style.cssText='flex:1;overflow-y:auto;background:var(--surface)';
  overlay.appendChild(header);overlay.appendChild(catBar);overlay.appendChild(list);
  document.body.appendChild(overlay);

  var cats=[...new Set(APPS.map(function(a){return a.cat;}))];
  var activeC='All';

  function renderC(){
    catBar.innerHTML='';
    ['All',...cats].forEach(function(cat){
      var b=document.createElement('button');b.className='ym-btn ym-btn-ghost';
      b.style.cssText='font-size:10px;padding:2px 9px;white-space:nowrap;flex-shrink:0'+(cat===activeC?';background:var(--accent);color:#000':'');
      b.textContent=cat;b.addEventListener('click',function(){activeC=cat;renderC();renderList();});catBar.appendChild(b);
    });
  }
  function renderList(){
    list.innerHTML='';
    var q=header.querySelector('#ba-q').value.toLowerCase();
    var apps=APPS.filter(function(a){return(activeC==='All'||a.cat===activeC)&&(!q||a.name.toLowerCase().includes(q));});
    apps.forEach(function(app){
      var fav=isFav(app.id);
      var row=document.createElement('div');
      row.style.cssText='display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.04)';
      var iconEl=document.createElement('div');
      iconEl.style.cssText='width:40px;height:40px;border-radius:10px;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0';
      iconEl.textContent=app.icon||'🔗';
      var info=document.createElement('div');info.style.cssText='flex:1;min-width:0';
      info.innerHTML='<div style="font-size:13px;font-weight:500">'+esc(app.name)+'</div><div style="font-size:10px;color:var(--text3)">'+esc(app.cat)+'</div>';
      var starBtn=document.createElement('button');
      starBtn.style.cssText='background:none;border:none;font-size:20px;cursor:pointer;padding:4px 8px;flex-shrink:0;color:'+(fav?'#f4c430':'var(--text3)');
      starBtn.textContent=fav?'⭐':'☆';
      starBtn.addEventListener('click',function(e){
        e.stopPropagation();
        toggleFav(app);fav=!fav;
        starBtn.textContent=fav?'⭐':'☆';
        starBtn.style.color=fav?'#f4c430':'var(--text3)';
        window.YM_toast&&window.YM_toast(fav?app.name+' added':'Removed','info');
      });
      row.appendChild(iconEl);row.appendChild(info);row.appendChild(starBtn);
      list.appendChild(row);
    });
    if(!apps.length)list.innerHTML='<div style="color:var(--text3);font-size:12px;padding:24px;text-align:center">No apps found.</div>';
  }
  renderC();renderList();
  header.querySelector('#ba-q').addEventListener('input',renderList);
  header.querySelector('#ba-close').addEventListener('click',function(){overlay.remove();if(onDone)onDone();});
}

// ── SPHERE ─────────────────────────────────────────────────────────────────────
window.YM_S['deeplink.sphere.js']={
  name:'DeepLink',icon:'🚀',category:'Tools',
  description:'Launch native apps — URI schemes for iOS, Android & desktop',
  emit:[],receive:[],
  activate:function(){},
  deactivate:function(){},
  renderPanel,

  // ── Config apps dans le profil ─────────────────────────────────────────────
  profileSection:function(container){
    var self=this;
    function refresh(){
      container.innerHTML='';
      var favs=loadFavs();

      // Grille des apps favorites
      if(favs.length){
        var grid=document.createElement('div');
        grid.style.cssText='display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:10px';
        favs.forEach(function(f){
          var app=APPS.find(function(a){return a.id===f.id;})||f;
          var btn=document.createElement('div');
          btn.style.cssText='display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;position:relative';
          var iconEl=document.createElement('div');
          iconEl.style.cssText='width:48px;height:48px;border-radius:12px;background:var(--surface2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:24px';
          iconEl.textContent=app.icon||'🔗';
          var lblEl=document.createElement('span');
          lblEl.style.cssText='font-size:9px;color:var(--text2);text-align:center;max-width:52px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
          lblEl.textContent=app.name;
          var delEl=document.createElement('div');
          delEl.style.cssText='position:absolute;top:-4px;left:-4px;width:18px;height:18px;border-radius:50%;background:var(--accent);color:#000;font-size:10px;font-weight:900;display:flex;align-items:center;justify-content:center;cursor:pointer;line-height:1';
          delEl.textContent='×';
          delEl.addEventListener('click',function(e){e.stopPropagation();toggleFav(app);refresh();});
          btn.appendChild(iconEl);btn.appendChild(lblEl);btn.appendChild(delEl);
          btn.addEventListener('click',function(){launch(app);});
          grid.appendChild(btn);
        });
        container.appendChild(grid);
      }

      // Bouton + ajouter des apps
      var browseBtn=document.createElement('button');
      browseBtn.className='ym-btn ym-btn-ghost';
      browseBtn.style.cssText='width:100%;font-size:12px;margin-bottom:8px';
      browseBtn.textContent='+ Add apps to my launcher';
      browseBtn.addEventListener('click',function(){_showBrowseApps(refresh);});
      container.appendChild(browseBtn);

      // Bouton + custom scheme
      var customBtn=document.createElement('button');
      customBtn.className='ym-btn ym-btn-ghost';
      customBtn.style.cssText='width:100%;font-size:11px;color:var(--text3)';
      customBtn.textContent='+ Custom URI scheme';
      customBtn.addEventListener('click',function(){_showAddCustom(refresh);});
      container.appendChild(customBtn);
    }
    refresh();
  },

  // ── Vue visiteur — liens publics ───────────────────────────────────────────
  peerSection:function(container){
    var favs=loadFavs();
    if(!favs.length)return;
    var wrap=document.createElement('div');
    wrap.style.cssText='display:flex;flex-direction:column;gap:6px';
    var title=document.createElement('div');
    title.style.cssText='font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px';
    title.textContent='Apps';
    wrap.appendChild(title);
    var grid=document.createElement('div');
    grid.style.cssText='display:flex;flex-wrap:wrap;gap:8px';
    favs.slice(0,10).forEach(function(f){
      var app=APPS.find(function(a){return a.id===f.id;})||f;
      var btn=document.createElement('button');
      btn.className='ym-btn ym-btn-ghost';
      btn.style.cssText='display:flex;align-items:center;gap:5px;font-size:11px;padding:5px 10px';
      btn.innerHTML='<span style="font-size:15px">'+esc(app.icon||'🔗')+'</span><span>'+esc(app.name)+'</span>';
      btn.addEventListener('click',function(){launch(app);});
      grid.appendChild(btn);
    });
    wrap.appendChild(grid);
    container.appendChild(wrap);
  }
};
})();
