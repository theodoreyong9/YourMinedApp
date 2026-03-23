/* jshint esversion:11, browser:true */
// deeplink.sphere.js — Open native apps via URI schemes on mobile & desktop
// Example: spotify:// → opens Spotify, vscode:// → opens VS Code
(function(){
'use strict';
window.YM_S = window.YM_S || {};

const LINKS_KEY = 'ym_deeplink_v1';

// ── BUILT-IN APPS ────────────────────────────────────────────────────────────
// uri: URI scheme to launch the app
// fallback: web URL if app not installed
// ios / android / desktop: platform availability hints
const BUILTIN_APPS = [
  // ── Music & Media ──────────────────────────────────────────────────────────
  {id:'spotify',    name:'Spotify',         icon:'🎵', category:'Music',
   uri:'spotify://',                        fallback:'https://open.spotify.com',
   ios:true, android:true, desktop:true,    desc:'Open Spotify'},
  {id:'deezer',     name:'Deezer',          icon:'🎶', category:'Music',
   uri:'deezer://',                         fallback:'https://www.deezer.com',
   ios:true, android:true, desktop:false,   desc:'Open Deezer'},
  {id:'applemusic', name:'Apple Music',     icon:'🍎', category:'Music',
   uri:'music://',                          fallback:'https://music.apple.com',
   ios:true, android:false, desktop:true,   desc:'Open Apple Music'},
  {id:'youtube',    name:'YouTube',         icon:'📺', category:'Video',
   uri:'youtube://',                        fallback:'https://www.youtube.com',
   ios:true, android:true, desktop:false,   desc:'Open YouTube'},
  {id:'netflix',    name:'Netflix',         icon:'🎬', category:'Video',
   uri:'nflx://',                           fallback:'https://www.netflix.com',
   ios:true, android:true, desktop:false,   desc:'Open Netflix'},
  {id:'twitch',     name:'Twitch',          icon:'🎮', category:'Video',
   uri:'twitch://',                         fallback:'https://www.twitch.tv',
   ios:true, android:true, desktop:false,   desc:'Open Twitch'},
  {id:'tiktok',     name:'TikTok',          icon:'🎵', category:'Video',
   uri:'snssdk1233://',                     fallback:'https://www.tiktok.com',
   ios:true, android:true, desktop:false,   desc:'Open TikTok'},

  // ── Social ─────────────────────────────────────────────────────────────────
  {id:'instagram',  name:'Instagram',       icon:'📸', category:'Social',
   uri:'instagram://',                      fallback:'https://www.instagram.com',
   ios:true, android:true, desktop:false,   desc:'Open Instagram'},
  {id:'twitter',    name:'Twitter / X',     icon:'🐦', category:'Social',
   uri:'twitter://',                        fallback:'https://x.com',
   ios:true, android:true, desktop:false,   desc:'Open Twitter/X'},
  {id:'facebook',   name:'Facebook',        icon:'👥', category:'Social',
   uri:'fb://',                             fallback:'https://www.facebook.com',
   ios:true, android:true, desktop:false,   desc:'Open Facebook'},
  {id:'whatsapp',   name:'WhatsApp',        icon:'💬', category:'Messaging',
   uri:'whatsapp://',                       fallback:'https://web.whatsapp.com',
   ios:true, android:true, desktop:true,    desc:'Open WhatsApp'},
  {id:'telegram',   name:'Telegram',        icon:'✈️', category:'Messaging',
   uri:'tg://',                             fallback:'https://web.telegram.org',
   ios:true, android:true, desktop:true,    desc:'Open Telegram'},
  {id:'signal',     name:'Signal',          icon:'🔒', category:'Messaging',
   uri:'sgnl://',                           fallback:'https://signal.org',
   ios:true, android:true, desktop:true,    desc:'Open Signal'},
  {id:'discord',    name:'Discord',         icon:'💜', category:'Messaging',
   uri:'discord://',                        fallback:'https://discord.com/app',
   ios:true, android:true, desktop:true,    desc:'Open Discord'},
  {id:'slack',      name:'Slack',           icon:'#️⃣', category:'Messaging',
   uri:'slack://',                          fallback:'https://app.slack.com',
   ios:true, android:true, desktop:true,    desc:'Open Slack'},

  // ── Productivity ────────────────────────────────────────────────────────────
  {id:'notion',     name:'Notion',          icon:'📝', category:'Productivity',
   uri:'notion://',                         fallback:'https://www.notion.so',
   ios:true, android:true, desktop:true,    desc:'Open Notion'},
  {id:'obsidian',   name:'Obsidian',        icon:'💎', category:'Productivity',
   uri:'obsidian://',                       fallback:'https://obsidian.md',
   ios:true, android:true, desktop:true,    desc:'Open Obsidian'},
  {id:'vscode',     name:'VS Code',         icon:'🖥', category:'Dev',
   uri:'vscode://',                         fallback:'https://vscode.dev',
   ios:false, android:false, desktop:true,  desc:'Open VS Code'},
  {id:'figma',      name:'Figma',           icon:'🎨', category:'Design',
   uri:'figma://',                          fallback:'https://www.figma.com',
   ios:false, android:false, desktop:true,  desc:'Open Figma'},
  {id:'linear',     name:'Linear',          icon:'📐', category:'Productivity',
   uri:'linear://',                         fallback:'https://linear.app',
   ios:true, android:false, desktop:true,   desc:'Open Linear'},

  // ── Maps & Navigation ───────────────────────────────────────────────────────
  {id:'maps',       name:'Apple Maps',      icon:'🗺', category:'Maps',
   uri:'maps://',                           fallback:'https://maps.apple.com',
   ios:true, android:false, desktop:false,  desc:'Open Apple Maps'},
  {id:'googlemaps', name:'Google Maps',     icon:'📍', category:'Maps',
   uri:'comgooglemaps://',                  fallback:'https://maps.google.com',
   ios:true, android:true, desktop:false,   desc:'Open Google Maps'},
  {id:'waze',       name:'Waze',            icon:'🚗', category:'Maps',
   uri:'waze://',                           fallback:'https://www.waze.com',
   ios:true, android:true, desktop:false,   desc:'Open Waze'},

  // ── Shopping ────────────────────────────────────────────────────────────────
  {id:'amazon',     name:'Amazon',          icon:'🛒', category:'Shopping',
   uri:'com.amazon.mobile.shopping://www.amazon.com',fallback:'https://www.amazon.com',
   ios:true, android:true, desktop:false,   desc:'Open Amazon'},

  // ── Health & Fitness ────────────────────────────────────────────────────────
  {id:'strava',     name:'Strava',          icon:'🏃', category:'Health',
   uri:'strava://',                         fallback:'https://www.strava.com',
   ios:true, android:true, desktop:false,   desc:'Open Strava'},

  // ── Finance ────────────────────────────────────────────────────────────────
  {id:'paypal',     name:'PayPal',          icon:'💳', category:'Finance',
   uri:'paypal://',                         fallback:'https://www.paypal.com',
   ios:true, android:true, desktop:false,   desc:'Open PayPal'},
];

// ── STORAGE ───────────────────────────────────────────────────────────────────
function loadLinks(){try{return JSON.parse(localStorage.getItem(LINKS_KEY)||'[]');}catch(e){return[];}}
function saveLinks(d){localStorage.setItem(LINKS_KEY,JSON.stringify(d));}
function gid(){return 'dl'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

// ── OPEN ──────────────────────────────────────────────────────────────────────
// Tente d'ouvrir l'URI native. Si l'app n'est pas installée, redirige vers fallback après délai
function openDeepLink(uri,fallback){
  if(!uri)return;
  const start=Date.now();
  const fallbackUrl=fallback||null;

  // Crée un iframe invisible pour déclencher le scheme URI sans navigation
  const frame=document.createElement('iframe');
  frame.style.cssText='position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0';
  frame.src=uri;
  document.body.appendChild(frame);

  if(fallbackUrl){
    // Si on est encore dans l'app après 2s, l'app native n'a pas été ouverte → fallback web
    setTimeout(()=>{
      if(document.hidden)return; // App s'est mise en background = succès
      if(Date.now()-start>1800){
        window.open(fallbackUrl,'_blank');
      }
      frame.remove();
    },2000);
  }else{
    setTimeout(()=>frame.remove(),3000);
  }
}

// ── PANEL ─────────────────────────────────────────────────────────────────────
let _activeTab='apps';
function renderPanel(container){
  container.style.cssText='display:flex;flex-direction:column;height:100%;overflow:hidden';
  container.innerHTML='';

  const track=document.createElement('div');
  track.style.cssText='flex:1;overflow:hidden;min-height:0;display:flex;flex-direction:column';
  container.appendChild(track);

  const tabs=document.createElement('div');
  tabs.className='ym-tabs';
  tabs.style.cssText='border-top:1px solid rgba(232,160,32,.12);margin:0;flex-shrink:0';
  [['apps','📱 Apps'],['custom','⚙ Custom']].forEach(([id,label])=>{
    const t=document.createElement('div');
    t.className='ym-tab'+(_activeTab===id?' active':'');
    t.dataset.tab=id;t.textContent=label;
    t.addEventListener('click',()=>{
      _activeTab=id;
      tabs.querySelectorAll('.ym-tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===id));
      track.innerHTML='';
      if(id==='apps')renderAppsTab(track);
      else renderCustomTab(track);
    });
    tabs.appendChild(t);
  });
  container.appendChild(tabs);

  if(_activeTab==='apps')renderAppsTab(track);
  else renderCustomTab(track);
}

function renderAppsTab(container){
  container.innerHTML='';
  container.style.cssText='flex:1;display:flex;flex-direction:column;overflow:hidden';

  // Barre de recherche + filtre catégorie
  const hdr=document.createElement('div');
  hdr.style.cssText='flex-shrink:0;padding:10px 14px;border-bottom:1px solid var(--border);display:flex;flex-direction:column;gap:6px';
  hdr.innerHTML='<input id="dl-search" class="ym-input" placeholder="Search apps…" style="font-size:12px">';
  container.appendChild(hdr);

  // Filtre catégorie
  const cats=[...new Set(BUILTIN_APPS.map(a=>a.category))];
  let activeCat='All';
  const catBar=document.createElement('div');
  catBar.style.cssText='display:flex;gap:4px;flex-wrap:wrap';

  function renderCats(){
    catBar.innerHTML='';
    ['All',...cats].forEach(cat=>{
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

  const list=document.createElement('div');
  list.style.cssText='flex:1;overflow-y:auto;padding:8px 14px';
  container.appendChild(list);

  function renderList(){
    list.innerHTML='';
    const q=hdr.querySelector('#dl-search').value.toLowerCase();
    const apps=BUILTIN_APPS.filter(a=>{
      if(activeCat!=='All'&&a.category!==activeCat)return false;
      if(q&&!a.name.toLowerCase().includes(q)&&!a.category.toLowerCase().includes(q))return false;
      return true;
    });
    if(!apps.length){list.innerHTML='<div style="color:var(--text3);font-size:12px;padding:16px;text-align:center">No apps found.</div>';return;}
    apps.forEach(app=>{
      const row=document.createElement('div');
      row.style.cssText='display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.05);cursor:pointer';
      const platforms=[app.ios&&'iOS',app.android&&'Android',app.desktop&&'Desktop'].filter(Boolean).join(' · ');
      row.innerHTML=
        '<div style="font-size:28px;width:40px;text-align:center;flex-shrink:0">'+app.icon+'</div>'+
        '<div style="flex:1;min-width:0">'+
          '<div style="font-size:13px;font-weight:600">'+esc(app.name)+'</div>'+
          '<div style="font-size:10px;color:var(--text3)">'+esc(app.category)+' · '+esc(platforms)+'</div>'+
        '</div>'+
        '<button class="dl-open ym-btn ym-btn-accent" style="font-size:12px;padding:6px 14px;flex-shrink:0">Open</button>'+
        '<button class="dl-add ym-btn ym-btn-ghost" style="font-size:11px;padding:6px 8px;flex-shrink:0" title="Add to My Links">+</button>';
      row.querySelector('.dl-open').addEventListener('click',e=>{
        e.stopPropagation();
        openDeepLink(app.uri,app.fallback);
        window.YM_toast?.('Opening '+app.name+'…','info');
      });
      row.querySelector('.dl-add').addEventListener('click',e=>{
        e.stopPropagation();
        const links=loadLinks();
        if(links.find(l=>l.uri===app.uri)){window.YM_toast?.('Already in My Links','warn');return;}
        links.unshift({id:gid(),name:app.name,icon:app.icon,uri:app.uri,fallback:app.fallback,category:app.category});
        saveLinks(links);
        window.YM_toast?.(app.name+' added to My Links','success');
      });
      list.appendChild(row);
    });
  }

  hdr.querySelector('#dl-search').addEventListener('input',renderList);
  renderList();
}

function renderCustomTab(container){
  container.innerHTML='';
  container.style.cssText='flex:1;display:flex;flex-direction:column;overflow:hidden';

  const hdr=document.createElement('div');
  hdr.style.cssText='flex-shrink:0;padding:10px 14px;border-bottom:1px solid var(--border)';
  hdr.innerHTML=
    '<div style="font-size:11px;color:var(--text3);margin-bottom:8px">My saved links — saved apps + custom URI schemes</div>'+
    '<button id="dl-add-custom" class="ym-btn ym-btn-accent" style="width:100%;font-size:12px">+ Add custom link</button>';
  container.appendChild(hdr);

  const list=document.createElement('div');
  list.style.cssText='flex:1;overflow-y:auto;padding:8px 14px';
  container.appendChild(list);

  function renderLinks(){
    list.innerHTML='';
    const links=loadLinks();
    if(!links.length){
      list.innerHTML='<div style="color:var(--text3);font-size:12px;padding:16px;text-align:center">No saved links.<br>Open 📱 Apps and tap + to save links here.</div>';
      return;
    }
    links.forEach((link,i)=>{
      const row=document.createElement('div');
      row.style.cssText='display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.05)';
      row.innerHTML=
        '<div style="font-size:24px;width:36px;text-align:center;flex-shrink:0">'+esc(link.icon||'🔗')+'</div>'+
        '<div style="flex:1;min-width:0">'+
          '<div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(link.name)+'</div>'+
          '<div style="font-size:10px;color:var(--text3);font-family:var(--font-m);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(link.uri)+'</div>'+
        '</div>'+
        '<button class="dl-open ym-btn ym-btn-accent" style="font-size:12px;padding:5px 12px">Open</button>'+
        '<button class="dl-del ym-btn ym-btn-ghost" style="font-size:12px;padding:5px 8px;color:#e84040">×</button>';
      row.querySelector('.dl-open').addEventListener('click',()=>{
        openDeepLink(link.uri,link.fallback);
        window.YM_toast?.('Opening '+link.name+'…','info');
      });
      row.querySelector('.dl-del').addEventListener('click',()=>{
        if(!confirm('Remove "'+link.name+'"?'))return;
        const arr=loadLinks();arr.splice(i,1);saveLinks(arr);renderLinks();
      });
      list.appendChild(row);
    });
  }

  hdr.querySelector('#dl-add-custom').addEventListener('click',()=>{
    _showAddCustom(renderLinks);
  });

  renderLinks();
}

function _showAddCustom(onDone){
  const overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;z-index:9990;background:rgba(0,0,0,.75);display:flex;align-items:flex-end;justify-content:center';
  const box=document.createElement('div');
  box.style.cssText='background:var(--surface2);border-radius:var(--r-lg) var(--r-lg) 0 0;padding:20px;width:100%;max-width:500px';
  box.innerHTML=
    '<div style="font-size:14px;font-weight:600;margin-bottom:14px">Add Custom Deep Link</div>'+
    '<div style="font-size:11px;color:var(--text3);margin-bottom:12px">'+
      'URI scheme examples:<br>'+
      '<code style="font-size:11px;color:var(--accent)">spotify://</code> · <code style="font-size:11px;color:var(--accent)">vscode://</code> · <code style="font-size:11px;color:var(--accent)">notion://</code>'+
    '</div>'+
    '<div style="display:flex;flex-direction:column;gap:8px">'+
      '<input id="cl-icon" class="ym-input" placeholder="Icon (emoji)" style="font-size:16px;width:60px">'+
      '<input id="cl-name" class="ym-input" placeholder="App name *" style="font-size:13px">'+
      '<input id="cl-uri" class="ym-input" placeholder="URI scheme (e.g. spotify://) *" style="font-size:12px;font-family:var(--font-m)">'+
      '<input id="cl-fallback" class="ym-input" placeholder="Fallback URL (https://…)" style="font-size:12px">'+
      '<input id="cl-cat" class="ym-input" placeholder="Category" style="font-size:12px">'+
    '</div>'+
    '<div style="display:flex;gap:8px;margin-top:14px">'+
      '<button id="cl-cancel" class="ym-btn ym-btn-ghost" style="flex:1">Cancel</button>'+
      '<button id="cl-save" class="ym-btn ym-btn-accent" style="flex:1">Save</button>'+
    '</div>';
  overlay.appendChild(box);document.body.appendChild(overlay);
  overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove();});
  box.querySelector('#cl-cancel').addEventListener('click',()=>overlay.remove());
  box.querySelector('#cl-save').addEventListener('click',()=>{
    const name=box.querySelector('#cl-name').value.trim();
    const uri=box.querySelector('#cl-uri').value.trim();
    if(!name||!uri){window.YM_toast?.('Name and URI required','error');return;}
    const links=loadLinks();
    links.unshift({
      id:gid(),
      name,
      icon:box.querySelector('#cl-icon').value.trim()||'🔗',
      uri,
      fallback:box.querySelector('#cl-fallback').value.trim()||null,
      category:box.querySelector('#cl-cat').value.trim()||'Custom'
    });
    saveLinks(links);
    overlay.remove();
    if(onDone)onDone();
    window.YM_toast?.('Link saved','success');
  });
}

// ── SPHERE ────────────────────────────────────────────────────────────────────
window.YM_S['deeplink.sphere.js']={
  name:'DeepLink',icon:'🔗',category:'Tools',
  description:'Open native apps via URI schemes — mobile & desktop',
  emit:[],receive:[],
  activate(ctx){},
  deactivate(){},
  renderPanel,
  profileSection(container){
    const links=loadLinks();
    if(!links.length)return;
    const wrap=document.createElement('div');
    wrap.style.cssText='display:flex;flex-direction:column;gap:6px';
    const title=document.createElement('div');
    title.style.cssText='font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:2px';
    title.textContent='My Apps';
    wrap.appendChild(title);
    const grid=document.createElement('div');
    grid.style.cssText='display:flex;flex-wrap:wrap;gap:8px';
    links.slice(0,8).forEach(link=>{
      const btn=document.createElement('button');
      btn.className='ym-btn ym-btn-ghost';
      btn.style.cssText='display:flex;align-items:center;gap:6px;font-size:12px;padding:6px 10px';
      btn.innerHTML='<span>'+esc(link.icon||'🔗')+'</span><span>'+esc(link.name)+'</span>';
      btn.addEventListener('click',()=>{openDeepLink(link.uri,link.fallback);});
      grid.appendChild(btn);
    });
    wrap.appendChild(grid);
    container.appendChild(wrap);
  }
};
})();
