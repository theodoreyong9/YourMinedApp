/* jshint esversion:11, browser:true */
// deeplink.sphere.js — Lance les apps natives via URI schemes
// Tap → ouvre l'app si installée. Sinon → rien (ou store sur mobile)
(function(){
'use strict';
window.YM_S=window.YM_S||{};

const SAVED_KEY='ym_deeplink_v1';

// ── APPS NATIVES PAR PLATEFORME ───────────────────────────────────────────────
// uri     : schéma qui ouvre l'app native (si installée)
// android : Intent URL Android pour forcer l'app (sinon Play Store)
// ios_store / android_store : fallback store si app absente
const APPS=[
  // ── 🎵 Musique ─────────────────────────────────────────────────────────────
  {id:'spotify',     name:'Spotify',      icon:'🎵', cat:'Music',
   uri:'spotify://',
   android:'intent://open#Intent;scheme=spotify;package=com.spotify.music;end',
   ios_store:'https://apps.apple.com/app/spotify/id324684580',
   android_store:'https://play.google.com/store/apps/details?id=com.spotify.music'},
  {id:'deezer',      name:'Deezer',       icon:'🎶', cat:'Music',
   uri:'deezer://',
   android:'intent://open#Intent;scheme=deezer;package=deezer.android.app;end',
   ios_store:'https://apps.apple.com/app/deezer/id292738169',
   android_store:'https://play.google.com/store/apps/details?id=deezer.android.app'},
  {id:'applemusic',  name:'Apple Music',  icon:'🍎', cat:'Music',
   uri:'music://',
   ios_store:'https://apps.apple.com/app/apple-music/id1108187390'},
  {id:'soundcloud',  name:'SoundCloud',   icon:'☁️', cat:'Music',
   uri:'soundcloud://',
   android:'intent://soundcloud.com#Intent;scheme=https;package=com.soundcloud.android;end',
   ios_store:'https://apps.apple.com/app/soundcloud/id336353151',
   android_store:'https://play.google.com/store/apps/details?id=com.soundcloud.android'},
  {id:'shazam',      name:'Shazam',       icon:'🎯', cat:'Music',
   uri:'shazam://',
   android:'intent://open#Intent;scheme=shazam;package=com.shazam.android;end',
   ios_store:'https://apps.apple.com/app/shazam/id284993459',
   android_store:'https://play.google.com/store/apps/details?id=com.shazam.android'},

  // ── 📺 Vidéo ───────────────────────────────────────────────────────────────
  {id:'youtube',     name:'YouTube',      icon:'📺', cat:'Video',
   uri:'youtube://',
   android:'intent://www.youtube.com#Intent;scheme=https;package=com.google.android.youtube;end',
   ios_store:'https://apps.apple.com/app/youtube/id544007664',
   android_store:'https://play.google.com/store/apps/details?id=com.google.android.youtube'},
  {id:'netflix',     name:'Netflix',      icon:'🎬', cat:'Video',
   uri:'nflx://www.netflix.com',
   android:'intent://www.netflix.com#Intent;scheme=https;package=com.netflix.mediaclient;end',
   ios_store:'https://apps.apple.com/app/netflix/id363590051',
   android_store:'https://play.google.com/store/apps/details?id=com.netflix.mediaclient'},
  {id:'twitch',      name:'Twitch',       icon:'💜', cat:'Video',
   uri:'twitch://open',
   android:'intent://open#Intent;scheme=twitch;package=tv.twitch.android.app;end',
   ios_store:'https://apps.apple.com/app/twitch/id460177396',
   android_store:'https://play.google.com/store/apps/details?id=tv.twitch.android.app'},
  {id:'tiktok',      name:'TikTok',       icon:'🎵', cat:'Video',
   uri:'snssdk1233://feed',
   android:'intent://open#Intent;scheme=snssdk1233;package=com.zhiliaoapp.musically;end',
   ios_store:'https://apps.apple.com/app/tiktok/id835599320',
   android_store:'https://play.google.com/store/apps/details?id=com.zhiliaoapp.musically'},

  // ── 💬 Messaging ───────────────────────────────────────────────────────────
  {id:'whatsapp',    name:'WhatsApp',     icon:'💬', cat:'Messaging',
   uri:'whatsapp://send',
   android:'intent://send#Intent;scheme=whatsapp;package=com.whatsapp;end',
   ios_store:'https://apps.apple.com/app/whatsapp/id310633997',
   android_store:'https://play.google.com/store/apps/details?id=com.whatsapp'},
  {id:'telegram',    name:'Telegram',     icon:'✈️', cat:'Messaging',
   uri:'tg://resolve',
   android:'intent://resolve#Intent;scheme=tg;package=org.telegram.messenger;end',
   ios_store:'https://apps.apple.com/app/telegram/id686449807',
   android_store:'https://play.google.com/store/apps/details?id=org.telegram.messenger'},
  {id:'signal',      name:'Signal',       icon:'🔒', cat:'Messaging',
   uri:'sgnl://',
   android:'intent://open#Intent;scheme=sgnl;package=org.thoughtcrime.securesms;end',
   ios_store:'https://apps.apple.com/app/signal/id874139669',
   android_store:'https://play.google.com/store/apps/details?id=org.thoughtcrime.securesms'},
  {id:'discord',     name:'Discord',      icon:'🎮', cat:'Messaging',
   uri:'discord://',
   android:'intent://discord.com#Intent;scheme=https;package=com.discord;end',
   ios_store:'https://apps.apple.com/app/discord/id985746746',
   android_store:'https://play.google.com/store/apps/details?id=com.discord'},
  {id:'slack',       name:'Slack',        icon:'#️⃣', cat:'Messaging',
   uri:'slack://',
   android:'intent://open#Intent;scheme=slack;package=com.Slack;end',
   ios_store:'https://apps.apple.com/app/slack/id618783545',
   android_store:'https://play.google.com/store/apps/details?id=com.Slack'},
  {id:'messenger',   name:'Messenger',    icon:'💙', cat:'Messaging',
   uri:'fb-messenger://',
   android:'intent://open#Intent;scheme=fb-messenger;package=com.facebook.orca;end',
   ios_store:'https://apps.apple.com/app/messenger/id454638411',
   android_store:'https://play.google.com/store/apps/details?id=com.facebook.orca'},

  // ── 📸 Social ─────────────────────────────────────────────────────────────
  {id:'instagram',   name:'Instagram',    icon:'📸', cat:'Social',
   uri:'instagram://app',
   android:'intent://instagram.com#Intent;scheme=https;package=com.instagram.android;end',
   ios_store:'https://apps.apple.com/app/instagram/id389801252',
   android_store:'https://play.google.com/store/apps/details?id=com.instagram.android'},
  {id:'twitter',     name:'X (Twitter)',  icon:'🐦', cat:'Social',
   uri:'twitter://timeline',
   android:'intent://timeline#Intent;scheme=twitter;package=com.twitter.android;end',
   ios_store:'https://apps.apple.com/app/x/id333903271',
   android_store:'https://play.google.com/store/apps/details?id=com.twitter.android'},
  {id:'linkedin',    name:'LinkedIn',     icon:'💼', cat:'Social',
   uri:'linkedin://',
   android:'intent://open#Intent;scheme=linkedin;package=com.linkedin.android;end',
   ios_store:'https://apps.apple.com/app/linkedin/id288429040',
   android_store:'https://play.google.com/store/apps/details?id=com.linkedin.android'},
  {id:'snapchat',    name:'Snapchat',     icon:'👻', cat:'Social',
   uri:'snapchat://',
   android:'intent://open#Intent;scheme=snapchat;package=com.snapchat.android;end',
   ios_store:'https://apps.apple.com/app/snapchat/id447188370',
   android_store:'https://play.google.com/store/apps/details?id=com.snapchat.android'},
  {id:'reddit',      name:'Reddit',       icon:'🤖', cat:'Social',
   uri:'reddit://',
   android:'intent://open#Intent;scheme=reddit;package=com.reddit.frontpage;end',
   ios_store:'https://apps.apple.com/app/reddit/id1064216828',
   android_store:'https://play.google.com/store/apps/details?id=com.reddit.frontpage'},
  {id:'mastodon',    name:'Mastodon',     icon:'🐘', cat:'Social',
   uri:'mastodon://',
   android:'intent://open#Intent;scheme=mastodon;package=org.joinmastodon.android;end',
   ios_store:'https://apps.apple.com/app/mastodon/id1571998974',
   android_store:'https://play.google.com/store/apps/details?id=org.joinmastodon.android'},

  // ── 🗺 Maps & Transports ──────────────────────────────────────────────────
  {id:'googlemaps',  name:'Google Maps',  icon:'🗺', cat:'Maps',
   uri:'comgooglemaps://',
   android:'intent://maps.google.com#Intent;scheme=https;package=com.google.android.apps.maps;end',
   ios_store:'https://apps.apple.com/app/google-maps/id585027354',
   android_store:'https://play.google.com/store/apps/details?id=com.google.android.apps.maps'},
  {id:'applemaps',   name:'Apple Maps',   icon:'🍎', cat:'Maps',
   uri:'maps://',
   ios_store:'https://apps.apple.com/app/plans/id915056765'},
  {id:'waze',        name:'Waze',         icon:'🚗', cat:'Maps',
   uri:'waze://',
   android:'intent://open#Intent;scheme=waze;package=com.waze;end',
   ios_store:'https://apps.apple.com/app/waze/id323229106',
   android_store:'https://play.google.com/store/apps/details?id=com.waze'},
  {id:'uber',        name:'Uber',         icon:'🚕', cat:'Maps',
   uri:'uber://',
   android:'intent://open#Intent;scheme=uber;package=com.ubercab;end',
   ios_store:'https://apps.apple.com/app/uber/id368677368',
   android_store:'https://play.google.com/store/apps/details?id=com.ubercab'},

  // ── 💳 Finance ────────────────────────────────────────────────────────────
  {id:'paypal',      name:'PayPal',       icon:'💳', cat:'Finance',
   uri:'paypal://touchWallet',
   android:'intent://touchWallet#Intent;scheme=paypal;package=com.paypal.android.p2pmobile;end',
   ios_store:'https://apps.apple.com/app/paypal/id283646709',
   android_store:'https://play.google.com/store/apps/details?id=com.paypal.android.p2pmobile'},
  {id:'revolut',     name:'Revolut',      icon:'🔵', cat:'Finance',
   uri:'revolut://',
   android:'intent://open#Intent;scheme=revolut;package=com.revolut.revolut;end',
   ios_store:'https://apps.apple.com/app/revolut/id932493382',
   android_store:'https://play.google.com/store/apps/details?id=com.revolut.revolut'},

  // ── 🏃 Sport & Santé ──────────────────────────────────────────────────────
  {id:'strava',      name:'Strava',       icon:'🏃', cat:'Health',
   uri:'strava://',
   android:'intent://open#Intent;scheme=strava;package=com.strava;end',
   ios_store:'https://apps.apple.com/app/strava/id426826309',
   android_store:'https://play.google.com/store/apps/details?id=com.strava'},

  // ── 🖥 Desktop only ───────────────────────────────────────────────────────
  {id:'vscode',      name:'VS Code',      icon:'🖥', cat:'Dev',
   uri:'vscode://', desktop:true,
   ios_store:null, android_store:null},
  {id:'obsidian',    name:'Obsidian',     icon:'💎', cat:'Productivity',
   uri:'obsidian://', desktop:true,
   android:'intent://open#Intent;scheme=obsidian;package=md.obsidian;end',
   ios_store:'https://apps.apple.com/app/obsidian/id1557175442',
   android_store:'https://play.google.com/store/apps/details?id=md.obsidian'},
  {id:'notion',      name:'Notion',       icon:'📝', cat:'Productivity',
   uri:'notion://', desktop:true,
   android:'intent://open#Intent;scheme=notion;package=notion.id;end',
   ios_store:'https://apps.apple.com/app/notion/id1232780281',
   android_store:'https://play.google.com/store/apps/details?id=notion.id'},
  {id:'figma',       name:'Figma',        icon:'🎨', cat:'Design',
   uri:'figma://', desktop:true,
   ios_store:null, android_store:null},
];

// ── DETECT PLATFORM ───────────────────────────────────────────────────────────
function isIOS(){return /iphone|ipad|ipod/i.test(navigator.userAgent);}
function isAndroid(){return /android/i.test(navigator.userAgent);}
function isMobile(){return isIOS()||isAndroid();}

// ── LAUNCH ────────────────────────────────────────────────────────────────────
function launch(app){
  let uri=app.uri;

  if(isAndroid()&&app.android){
    // Intent URL Android → ouvre l'app ou propose le Play Store
    uri=app.android;
  }

  // Tente l'ouverture via window.location (pas de popup blocker)
  window.location.href=uri;

  // Après 2s, si on est toujours là, l'app n'est pas installée
  if(isMobile()){
    setTimeout(()=>{
      if(document.hidden)return; // App ouverte → on est en background
      const store=isIOS()?app.ios_store:app.android_store;
      if(store){
        if(confirm(app.name+' not found. Open App Store?')){
          window.open(store,'_blank');
        }
      }
    },2000);
  }
  window.YM_toast?.('Opening '+app.name+'…','info');
}

// ── STORAGE ───────────────────────────────────────────────────────────────────
function loadSaved(){try{return JSON.parse(localStorage.getItem(SAVED_KEY)||'[]');}catch(e){return[];}}
function saveSaved(d){localStorage.setItem(SAVED_KEY,JSON.stringify(d));}
function isSaved(id){return loadSaved().some(s=>s.id===id);}
function toggleSaved(app){
  const saved=loadSaved();
  const idx=saved.findIndex(s=>s.id===app.id);
  if(idx>=0){saved.splice(idx,1);}else{saved.unshift({id:app.id,name:app.name,icon:app.icon});}
  saveSaved(saved);
}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

// ── PANEL ─────────────────────────────────────────────────────────────────────
function renderPanel(container){
  container.style.cssText='display:flex;flex-direction:column;height:100%;overflow:hidden';
  container.innerHTML='';

  // Header — recherche + filtre catégorie
  const hdr=document.createElement('div');
  hdr.style.cssText='flex-shrink:0;padding:10px 14px;border-bottom:1px solid var(--border);display:flex;flex-direction:column;gap:6px';
  hdr.innerHTML='<input id="dl-q" class="ym-input" placeholder="Search apps…" style="font-size:12px">';
  container.appendChild(hdr);

  const cats=[...new Set(APPS.map(a=>a.cat))];
  let activeCat='All';
  const catBar=document.createElement('div');catBar.style.cssText='display:flex;gap:4px;flex-wrap:wrap';

  const list=document.createElement('div');
  list.style.cssText='flex:1;overflow-y:auto';
  container.appendChild(list);

  function renderCats(){
    catBar.innerHTML='';
    ['All','⭐ Saved',...cats].forEach(cat=>{
      const b=document.createElement('button');
      b.className='ym-btn ym-btn-ghost';
      b.style.cssText='font-size:10px;padding:2px 8px'+(cat===activeCat?';background:var(--accent);color:#000':'');
      b.textContent=cat;
      b.addEventListener('click',()=>{activeCat=cat;renderCats();renderList();});
      catBar.appendChild(b);
    });
  }
  hdr.appendChild(catBar);
  renderCats();

  // Ajouter un scheme custom
  const addBtn=document.createElement('button');
  addBtn.className='ym-btn ym-btn-ghost';
  addBtn.style.cssText='font-size:11px;align-self:flex-start';
  addBtn.textContent='+ Custom scheme';
  addBtn.addEventListener('click',()=>_showAddCustom(()=>renderList()));
  hdr.appendChild(addBtn);

  function renderList(){
    list.innerHTML='';
    const q=hdr.querySelector('#dl-q').value.toLowerCase();
    const saved=loadSaved();

    let apps=APPS;
    if(activeCat==='⭐ Saved'){
      apps=saved.map(s=>APPS.find(a=>a.id===s.id)).filter(Boolean);
      // Ajoute les customs
      const customs=saved.filter(s=>s.custom).map(s=>({...s,uri:s.uri}));
      apps=[...apps,...customs];
    }else if(activeCat!=='All'){
      apps=APPS.filter(a=>a.cat===activeCat);
    }
    if(q)apps=apps.filter(a=>a.name.toLowerCase().includes(q)||a.cat?.toLowerCase().includes(q));

    if(!apps.length){
      list.innerHTML='<div style="color:var(--text3);font-size:12px;padding:24px;text-align:center">No apps found.</div>';
      return;
    }

    // Regroupe par catégorie
    const byCat={};
    apps.forEach(a=>{const c=a.cat||'Custom';if(!byCat[c])byCat[c]=[];byCat[c].push(a);});

    Object.entries(byCat).forEach(([cat,catApps])=>{
      if(activeCat==='All'||activeCat==='⭐ Saved'){
        const lbl=document.createElement('div');
        lbl.style.cssText='font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;padding:10px 16px 4px;font-weight:600';
        lbl.textContent=cat;
        list.appendChild(lbl);
      }
      catApps.forEach(app=>{
        const starred=isSaved(app.id||(app.uri));
        const row=document.createElement('div');
        row.style.cssText='display:flex;align-items:center;gap:12px;padding:12px 16px;cursor:pointer;transition:background .12s';
        row.innerHTML=
          '<div style="font-size:30px;width:44px;height:44px;display:flex;align-items:center;justify-content:center;background:var(--surface2);border-radius:12px;flex-shrink:0">'+esc(app.icon||'🔗')+'</div>'+
          '<div style="flex:1;min-width:0">'+
            '<div style="font-size:14px;font-weight:600">'+esc(app.name)+'</div>'+
            '<div style="font-size:10px;color:var(--text3);font-family:var(--font-m)">'+esc(app.uri)+'</div>'+
          '</div>'+
          '<button class="dl-star ym-btn ym-btn-ghost" style="font-size:16px;padding:4px 8px;flex-shrink:0">'+(starred?'⭐':'☆')+'</button>'+
          '<button class="dl-launch ym-btn ym-btn-accent" style="padding:8px 16px;font-size:13px;font-weight:600;flex-shrink:0">▶</button>';
        row.addEventListener('mouseenter',()=>row.style.background='rgba(255,255,255,.03)');
        row.addEventListener('mouseleave',()=>row.style.background='');
        row.querySelector('.dl-launch').addEventListener('click',e=>{e.stopPropagation();launch(app);});
        row.querySelector('.dl-star').addEventListener('click',e=>{
          e.stopPropagation();
          toggleSaved(app);
          renderList();
        });
        list.appendChild(row);
      });
    });
  }

  hdr.querySelector('#dl-q').addEventListener('input',renderList);
  renderList();
}

function _showAddCustom(onDone){
  const overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;z-index:9990;background:rgba(0,0,0,.75);display:flex;align-items:flex-end;justify-content:center';
  const box=document.createElement('div');
  box.style.cssText='background:var(--surface2);border-radius:var(--r-lg) var(--r-lg) 0 0;padding:20px;width:100%;max-width:500px';
  box.innerHTML=
    '<div style="font-size:14px;font-weight:600;margin-bottom:10px">Custom URI Scheme</div>'+
    '<div style="font-size:11px;color:var(--text3);margin-bottom:12px">'+
      'Enter any URI scheme registered on your device.<br>'+
      'Examples: <code style="color:var(--accent)">spotify://</code>  <code style="color:var(--accent)">vscode://</code>  <code style="color:var(--accent)">obsidian://</code>'+
    '</div>'+
    '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px">'+
      '<div style="display:flex;gap:8px">'+
        '<input id="cc-icon" class="ym-input" placeholder="🔗" style="width:56px;font-size:18px;text-align:center">'+
        '<input id="cc-name" class="ym-input" placeholder="App name *" style="flex:1;font-size:13px">'+
      '</div>'+
      '<input id="cc-uri" class="ym-input" placeholder="URI scheme, e.g. myapp:// *" style="font-size:12px;font-family:var(--font-m)">'+
    '</div>'+
    '<div style="display:flex;gap:8px">'+
      '<button id="cc-cancel" class="ym-btn ym-btn-ghost" style="flex:1">Cancel</button>'+
      '<button id="cc-save" class="ym-btn ym-btn-accent" style="flex:1">Save & Launch</button>'+
    '</div>';
  overlay.appendChild(box);document.body.appendChild(overlay);
  overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove();});
  box.querySelector('#cc-cancel').addEventListener('click',()=>overlay.remove());
  box.querySelector('#cc-save').addEventListener('click',()=>{
    const name=box.querySelector('#cc-name').value.trim();
    const uri=box.querySelector('#cc-uri').value.trim();
    if(!name||!uri){window.YM_toast?.('Name and URI required','error');return;}
    const app={id:'custom_'+Date.now(),name,icon:box.querySelector('#cc-icon').value.trim()||'🔗',uri,cat:'Custom',custom:true};
    const saved=loadSaved();saved.unshift({...app});saveSaved(saved);
    overlay.remove();
    if(onDone)onDone();
    launch(app);
  });
}

// ── SPHERE ────────────────────────────────────────────────────────────────────
window.YM_S['deeplink.sphere.js']={
  name:'DeepLink',icon:'🚀',category:'Tools',
  description:'Launch native apps via URI schemes — mobile & desktop',
  emit:[],receive:[],
  activate(ctx){},
  deactivate(){},
  renderPanel,
  profileSection(container){
    const saved=loadSaved();
    if(!saved.length)return;
    const wrap=document.createElement('div');
    wrap.style.cssText='display:flex;flex-direction:column;gap:6px';
    const title=document.createElement('div');
    title.style.cssText='font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px';
    title.textContent='My Apps';
    wrap.appendChild(title);
    const grid=document.createElement('div');
    grid.style.cssText='display:flex;flex-wrap:wrap;gap:6px';
    saved.slice(0,8).forEach(s=>{
      const app=APPS.find(a=>a.id===s.id)||s;
      const btn=document.createElement('button');
      btn.className='ym-btn ym-btn-ghost';
      btn.style.cssText='display:flex;align-items:center;gap:6px;font-size:12px;padding:6px 10px';
      btn.innerHTML='<span style="font-size:16px">'+esc(app.icon||'🔗')+'</span><span>'+esc(app.name)+'</span>';
      btn.addEventListener('click',()=>launch(app));
      grid.appendChild(btn);
    });
    wrap.appendChild(grid);
    container.appendChild(wrap);
  }
};
})();
