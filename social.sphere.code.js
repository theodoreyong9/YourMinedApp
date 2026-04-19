// social.sphere.js — YourMine Social Sphere
(function(){
'use strict';
window.YM_S = window.YM_S || {};

const GOSSIP_TTL = 15 * 60 * 1000;
const NEAR_RADIUS = 100;
const HEARTBEAT_INTERVAL = 5000; // 5s full profile broadcast
const NEAR_TIMEOUT = 15000;      // 15s sans heartbeat = parti
const SOCIAL_KEY = 'ym_social_v1';
const CONTACTS_KEY = 'ym_contacts_v1';

// ── STATE ──────────────────────────────────────────────────────────────────
let _ctx = null;
let _nearUsers = new Map();   // uuid → {profile, ts, peerId}
let _gossipCache = new Map(); // uuid → {profile, ts}
let _watchId = null;
let _myCoords = null;


let _heartbeatTimer = null;
let _cleanTimer = null;
let _refreshNear = null;

// ── STORAGE ────────────────────────────────────────────────────────────────
function loadState(){ try{return JSON.parse(localStorage.getItem(SOCIAL_KEY)||'{}')}catch{return{}} }
function saveState(d){ localStorage.setItem(SOCIAL_KEY, JSON.stringify({...loadState(),...d})) }
function loadContacts(){ try{return JSON.parse(localStorage.getItem(CONTACTS_KEY)||'[]')}catch{return[]} }
function saveContacts(c){ localStorage.setItem(CONTACTS_KEY, JSON.stringify(c)) }
function getContact(uuid){ return loadContacts().find(c=>c.uuid===uuid) }
function addContact(profile){
  const contacts=loadContacts();
  if(!contacts.find(c=>c.uuid===profile.uuid)){
    contacts.push({uuid:profile.uuid, name:profile.name||'', nickname:'', addedAt:Date.now(), profile});
    saveContacts(contacts);
  }
}
function updateNickname(uuid, nickname){
  const contacts=loadContacts();
  const c=contacts.find(c=>c.uuid===uuid);
  if(c){c.nickname=nickname;saveContacts(contacts);}
}

// ── GEO ────────────────────────────────────────────────────────────────────
function startGeo(){
  if(!navigator.geolocation) return;
  _watchId = navigator.geolocation.watchPosition(pos=>{
    _myCoords={lat:pos.coords.latitude, lng:pos.coords.longitude, acc:pos.coords.accuracy};
  }, null, {enableHighAccuracy:true,maximumAge:5000,timeout:10000});
}
function stopGeo(){
  if(_watchId!==null){navigator.geolocation.clearWatch(_watchId);_watchId=null;}
}
function haversine(lat1,lng1,lat2,lng2){
  const R=6371000,dLat=(lat2-lat1)*Math.PI/180,dLng=(lng2-lng1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

// ── ICE SERVERS (STUN + TURN publics gratuits) ────────────────────────────
// Un seul paquet contient tout : identité, coords, réseaux sociaux, sphères
function buildProfilePacket(){
  const p = _ctx?.loadProfile?.() ?? {};
  const state = loadState();
  const contactUUIDs = loadContacts().map(c=>c.uuid);
  // Collecte les données broadcastées par chaque sphère active
  const extraData={};
  if(window.YM_sphereRegistry){
    window.YM_sphereRegistry.forEach((sphere)=>{
      if(typeof sphere.broadcastData==='function'){
        try{Object.assign(extraData,sphere.broadcastData());}catch(e){}
      }
    });
  }
  return {
    uuid:     p.uuid,
    name:     p.name,
    bio:      p.bio,
    avatar:   p.avatar,
    site:     p.site,
    spheres:  p.spheres || [],
    pubkey:   p.pubkey,
    lat:      _myCoords?.lat,
    lng:      _myCoords?.lng,
    networks: (state.networks || []).map(n => ({id:n.id, handle:n.handle})),
    contacts: contactUUIDs,
    ...extraData,
    ts:       Date.now()
  };
}

// ── HEARTBEAT ──────────────────────────────────────────────────────────────
function broadcastPresence(){
  if(!_ctx) return;
  _ctx.send('social:presence', buildProfilePacket());
}

function startHeartbeat(){
  stopHeartbeat();
  broadcastPresence(); // immédiat
  _heartbeatTimer = setInterval(broadcastPresence, HEARTBEAT_INTERVAL);
}
function stopHeartbeat(){
  if(_heartbeatTimer){clearInterval(_heartbeatTimer);_heartbeatTimer=null;}
}

// ── PRESENCE HANDLER ──────────────────────────────────────────────────────
function handlePresence(data, peerId){
  if(!data?.uuid) return;
  const myUUID = _ctx?.loadProfile?.()?.uuid;
  if(data.uuid === myUUID) return;

  const ts = Date.now();
  let isNear = false;
  if(_myCoords && data.lat && data.lng){
    isNear = haversine(_myCoords.lat, _myCoords.lng, data.lat, data.lng) <= NEAR_RADIUS;
  } else {
    isNear = true; // même room P2P = assez proche pour les tests
  }

  if(isNear){
    const wasNew=!_nearUsers.has(data.uuid);
    _nearUsers.set(data.uuid, {profile:data, ts, peerId});
    _gossipCache.set(data.uuid, {profile:data, ts});
    if(wasNew){
      if(_ctx) _ctx.setNotification?.(_nearUsers.size);
      _incTabBadge('Near'); // badge sur l'onglet Near
    }
    _refreshNear?.();
    // Met à jour le contact stocké si on l'a
    const contact=getContact(data.uuid);
    if(contact){
      const contacts=loadContacts();
      const c=contacts.find(x=>x.uuid===data.uuid);
      if(c){c.profile=data;saveContacts(contacts);}
    }
    return;
  }

  // Gossip : pas proche mais dans la room
  if(!_nearUsers.has(data.uuid) && !getContact(data.uuid)){
    _gossipCache.set(data.uuid, {profile:data, ts});
  }
}

// ── CLEANUP ────────────────────────────────────────────────────────────────
function cleanGossip(){
  const now = Date.now();
  for(const [uuid,entry] of _gossipCache){
    if(now - entry.ts > GOSSIP_TTL) _gossipCache.delete(uuid);
  }
  // Expire les users "near" qui n'ont pas envoyé de heartbeat depuis NEAR_TIMEOUT
  let changed = false;
  for(const [uuid,entry] of _nearUsers){
    if(now - entry.ts > NEAR_TIMEOUT){ _nearUsers.delete(uuid); changed = true; }
  }
  if(changed){
    if(_ctx) _ctx.setNotification?.(_nearUsers.size || 0);
    _refreshNear?.();
  }
}

// ── VOICE CALLS ──────────────────────────────────────────────────────────────
// ── VOICE CALL ────────────────────────────────────────────────────────────────



function _getPeerId(uuid){
  return _nearUsers.get(uuid)?.peerId||null;
}


function isReciprocal(uuid){
  if(!getContact(uuid)) return false;
  const myUUID=_ctx?.loadProfile?.()?.uuid;
  if(!myUUID) return false;
  const theirContacts=_nearUsers.get(uuid)?.profile?.contacts||[];
  return theirContacts.includes(myUUID);
}





// ── SYSTÈME DE DEMANDES D'INTERACTION (pile centralisée) ──────────────────────
// Toute demande (appel, partage, etc.) s'empile et est affichée l'une après l'autre
const _interactionQueue=[];
let _interactionActive=false;

function _pushInteraction(opts){
  // opts: {type, profile, icon, label, sublabel, onAccept, onDecline}
  _interactionQueue.push(opts);
  if(!_interactionActive) _nextInteraction();
}

function _nextInteraction(){
  if(!_interactionQueue.length){_interactionActive=false;return;}
  _interactionActive=true;
  const opts=_interactionQueue[0];
  _showInteractionUI(opts,
    ()=>{_interactionQueue.shift();_interactionActive=false;opts.onAccept?.();_nextInteraction();},
    ()=>{_interactionQueue.shift();_interactionActive=false;opts.onDecline?.();_nextInteraction();}
  );
}

function _showInteractionUI(opts,onAccept,onDecline){
  document.getElementById('ym-interaction-ui')?.remove();
  const profile=opts.profile||{};
  const av=profile.avatar
    ?`<img src="${profile.avatar}" style="width:48px;height:48px;border-radius:50%;object-fit:cover;margin-bottom:8px">`
    :`<div style="width:48px;height:48px;border-radius:50%;background:var(--surface3);display:flex;align-items:center;justify-content:center;font-size:20px;margin:0 auto 8px">${profile.name?.charAt(0)||'👤'}</div>`;
  const queueLen=_interactionQueue.length;
  const ui=document.createElement('div');
  ui.id='ym-interaction-ui';
  ui.style.cssText='position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:9999;background:var(--surface2);border:1px solid var(--accent);border-radius:var(--r);padding:16px 20px;min-width:260px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,.7);text-align:center';
  ui.innerHTML=`
    ${queueLen>1?`<div style="font-size:9px;color:var(--text3);margin-bottom:8px">${queueLen} pending interactions</div>`:''}
    ${av}
    <div style="font-weight:600;font-size:14px;margin-bottom:2px">${profile.name||'Unknown'}</div>
    <div style="font-size:13px;color:var(--accent);margin-bottom:4px">${opts.icon||''} ${opts.label||''}</div>
    ${opts.sublabel?`<div style="font-size:11px;color:var(--text3);margin-bottom:12px">${opts.sublabel}</div>`:'<div style="height:12px"></div>'}
    <div style="display:flex;gap:10px;justify-content:center">
      <button id="int-decline" style="width:52px;height:52px;border-radius:50%;background:#e84040;border:none;font-size:22px;cursor:pointer">✕</button>
      <button id="int-accept" style="width:52px;height:52px;border-radius:50%;background:#30e880;border:none;font-size:22px;cursor:pointer">✓</button>
    </div>`;
  document.body.appendChild(ui);
  ui.querySelector('#int-accept').addEventListener('click',onAccept);
  ui.querySelector('#int-decline').addEventListener('click',onDecline);
}


// ── QR SCANNER ────────────────────────────────────────────────────────────────
function generateQR(uuid, container){
  if(!window.QRCode) return;
  container.innerHTML='';
  new window.QRCode(container,{text:'yourmine://contact/'+uuid,width:120,height:120,correctLevel:QRCode.CorrectLevel.M});
}

function startQRScanner(container, onResult){
  // Utilise BarcodeDetector si disponible (Chrome/Android), sinon jsQR comme fallback
  container.innerHTML=`<div style="position:relative;width:100%;max-width:260px;margin:0 auto">
    <video id="qr-video" style="width:100%;border-radius:var(--r-sm)" autoplay playsinline muted></video>
    <canvas id="qr-canvas" style="display:none"></canvas>
    <div style="font-size:10px;color:var(--text3);text-align:center;margin-top:4px">Point your camera at a YourMine QR code</div>
    <button class="ym-btn ym-btn-ghost" id="qr-cancel" style="width:100%;margin-top:6px;font-size:11px">Cancel</button>
  </div>`;

  let stream=null;
  let animFrame=null;

  container.querySelector('#qr-cancel').addEventListener('click',()=>{
    stop();onResult(null);
  });

  function stop(){
    if(animFrame)cancelAnimationFrame(animFrame);
    stream?.getTracks().forEach(t=>t.stop());
    stream=null;
  }

  navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}}).then(s=>{
    stream=s;
    const video=container.querySelector('#qr-video');
    const canvas=container.querySelector('#qr-canvas');
    video.srcObject=s;
    video.play();

    if('BarcodeDetector' in window){
      const detector=new BarcodeDetector({formats:['qr_code']});
      async function detect(){
        if(video.readyState===video.HAVE_ENOUGH_DATA){
          try{
            const codes=await detector.detect(video);
            if(codes.length){stop();onResult(codes[0].rawValue);return;}
          }catch{}
        }
        animFrame=requestAnimationFrame(detect);
      }
      animFrame=requestAnimationFrame(detect);
    }else{
      // Fallback : charge jsQR dynamiquement
      const script=document.createElement('script');
      script.src='https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js';
      script.onload=()=>{
        const ctx=canvas.getContext('2d');
        function scan(){
          if(video.readyState===video.HAVE_ENOUGH_DATA){
            canvas.width=video.videoWidth;canvas.height=video.videoHeight;
            ctx.drawImage(video,0,0,canvas.width,canvas.height);
            const img=ctx.getImageData(0,0,canvas.width,canvas.height);
            const code=window.jsQR?.(img.data,img.width,img.height);
            if(code){stop();onResult(code.data);return;}
          }
          animFrame=requestAnimationFrame(scan);
        }
        animFrame=requestAnimationFrame(scan);
      };
      document.head.appendChild(script);
    }
  }).catch(()=>{
    container.innerHTML=`<div class="ym-notice error">Camera access denied</div>`;
    onResult(null);
  });
}

// ── RÉSEAUX SOCIAUX ───────────────────────────────────────────────────────────
// Réseaux avec API publique extractible sans auth/PKCE → feed actif
const FEED_NETWORKS = [
  {id:'mastodon',  label:'Mastodon',     hint:'@user@instance.social'},
  {id:'bluesky',   label:'Bluesky',      hint:'@handle.bsky.social'},
  {id:'github',    label:'GitHub',       hint:'@username'},
  {id:'paragraph', label:'Paragraph.xyz',hint:'paragraph.xyz/@handle'},
  {id:'medium',    label:'Medium',       hint:'@username'},
  {id:'reddit',    label:'Reddit',       hint:'u/username'},
  {id:'substack',  label:'Substack',     hint:'username.substack.com'},
  {id:'devto',     label:'Dev.to',       hint:'@username'},
  {id:'hashnode',  label:'Hashnode',     hint:'@username'},
];

// Réseaux affichés dans le profil partagé mais sans extraction de feed (OAuth requis)
const PROFILE_ONLY_NETWORKS = [
  {id:'x',         label:'X',            hint:'@username'},
  {id:'linkedin',  label:'LinkedIn',     hint:'linkedin.com/in/handle'},
  {id:'instagram', label:'Instagram',    hint:'@username'},
  {id:'youtube',   label:'YouTube',      hint:'@channel'},
  {id:'twitch',    label:'Twitch',       hint:'@username'},
  {id:'tiktok',    label:'TikTok',       hint:'@username'},
];

const ALL_NETWORKS=[...FEED_NETWORKS,...PROFILE_ONLY_NETWORKS];

// Extrait la première image d'un contenu HTML
function extractImage(html){
  if(!html) return null;
  const m=html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m?m[1]:null;
}
// Extrait le texte d'un contenu HTML
function extractText(html){
  return html?html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim():'';
}
async function fetchFeedItems(networks){
  const items = [];
  for(const n of networks.filter(n=>FEED_NETWORKS.find(f=>f.id===n.id))){
    try{
      if(n.id==='mastodon' && n.handle){
        const [user,instance] = n.handle.replace('@','').split('@');
        if(instance){
          const acc = await (await fetch(`https://${instance}/api/v1/accounts/lookup?acct=${user}`)).json();
          const posts = await (await fetch(`https://${instance}/api/v1/accounts/${acc.id}/statuses?limit=5`)).json();
          posts.forEach(p=>{
            const img=p.media_attachments?.find(a=>a.type==='image')?.url||extractImage(p.content);
            const txt=extractText(p.content);
            items.push({network:'Mastodon',author:acc.display_name||acc.username,
              title:'',text:txt,image:img,ts:new Date(p.created_at).getTime(),url:p.url});
          });
        }
      }
      if(n.id==='bluesky' && n.handle){
        const handle = n.handle.replace('@','');
        const data = await (await fetch(`https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${handle}&limit=5`)).json();
        (data.feed||[]).forEach(f=>{
          const post=f.post?.record;
          const img=f.post?.embed?.images?.[0]?.thumb||f.post?.embed?.thumbnail;
          if(post?.text) items.push({network:'Bluesky',author:handle,title:'',text:post.text,image:img||null,
            ts:new Date(post.createdAt).getTime(),url:`https://bsky.app/profile/${handle}`});
        });
      }
      if(n.id==='github' && n.handle){
        const user=n.handle.replace('@','');
        const events=await(await fetch(`https://api.github.com/users/${user}/events/public?per_page=5`)).json();
        events.filter(e=>e.type==='PushEvent').forEach(e=>{
          const msg=e.payload?.commits?.[0]?.message||'pushed';
          items.push({network:'GitHub',author:user,title:'',text:msg,image:null,
            ts:new Date(e.created_at).getTime(),url:`https://github.com/${user}`});
        });
      }
      if(n.id==='medium' && n.handle){
        const user=n.handle.replace('@','');
        try{
          const r=await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent('https://medium.com/feed/@'+user)}`);
          if(!r.ok) throw new Error('skip');
          const d=await r.json();
          if(d.status==='ok')(d.items||[]).slice(0,5).forEach(p=>items.push({network:'Medium',author:user,
            title:p.title,text:extractText(p.content||p.description||''),
            image:p.thumbnail||extractImage(p.content)||extractImage(p.description),
            ts:new Date(p.pubDate).getTime(),url:p.link}));
        }catch{}
      }
      if(n.id==='substack' && n.handle){
        const host=n.handle.includes('.')?n.handle:`${n.handle}.substack.com`;
        try{
          const r=await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent('https://'+host+'/feed')}`);
          if(!r.ok) throw new Error('skip');
          const d=await r.json();
          if(d.status==='ok')(d.items||[]).slice(0,5).forEach(p=>items.push({network:'Substack',author:host,
            title:p.title,text:extractText(p.content||p.description||''),
            image:p.thumbnail||extractImage(p.content)||extractImage(p.description),
            ts:new Date(p.pubDate).getTime(),url:p.link}));
        }catch{}
      }
      if(n.id==='paragraph' && n.handle){
        const handle=n.handle.replace('paragraph.xyz/','').replace('@','');
        try{
          const r=await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent('https://paragraph.xyz/@'+handle+'/rss')}`);
          if(!r.ok) throw new Error('skip');
          const d=await r.json();
          if(d.status==='ok'&&d.items?.length){
            d.items.slice(0,5).forEach(p=>items.push({network:'Paragraph',author:handle,
              title:p.title,text:extractText(p.content||p.description||''),
              image:p.thumbnail||extractImage(p.content)||extractImage(p.description),
              ts:new Date(p.pubDate).getTime(),url:p.link}));
          }
        }catch{}
      }
      if(n.id==='devto' && n.handle){
        const user=n.handle.replace('@','');
        const posts=await(await fetch(`https://dev.to/api/articles?username=${user}&per_page=5`)).json();
        if(Array.isArray(posts)) posts.forEach(p=>items.push({network:'Dev.to',author:user,
          title:p.title,text:p.description||'',image:p.cover_image||p.social_image||null,
          ts:new Date(p.published_at).getTime(),url:p.url}));
      }
      if(n.id==='hashnode' && n.handle){
        const user=n.handle.replace('@','');
        const r=await fetch('https://gql.hashnode.com/',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({query:`{user(username:"${user}"){posts(page:1,pageSize:5){nodes{title,url,publishedAt,brief,coverImage{url}}}}}`})});
        const d=await r.json();
        (d.data?.user?.posts?.nodes||[]).forEach(p=>items.push({network:'Hashnode',author:user,
          title:p.title,text:p.brief||'',image:p.coverImage?.url||null,
          ts:new Date(p.publishedAt).getTime(),url:p.url}));
      }
      if(n.id==='reddit' && n.handle){
        const user=n.handle.replace('u/','').replace('@','');
        const r=await fetch(`https://www.reddit.com/user/${user}/submitted.json?limit=5`);
        const d=await r.json();
        (d.data?.children||[]).forEach(c=>{
          const post=c.data;
          const img=post.thumbnail&&post.thumbnail.startsWith('http')?post.thumbnail:null;
          items.push({network:'Reddit',author:user,title:post.title,text:post.selftext?.slice(0,200)||'',image:img,
            ts:post.created_utc*1000,url:`https://reddit.com${post.permalink}`});
        });
      }
    }catch{}
  }
  return items.sort((a,b)=>b.ts-a.ts);
}

// ── SPHERE DEFINITION ────────────────────────────────────────────────────────
let _onPeerJoin=null;
let _onVisibility=null;

window.YM_S['social.sphere.js'] = {
  name:'Social',
  icon:'🌐',
  category:'Communication',
  description:'Near discovery, contacts, social feeds, voice calls',
  author:'theodoreyong9',
  emit:['name','bio','avatar','site','lat','lng','networks'],
  receive:['name','bio','avatar','site','spheres','networks'],
  statuses:['online','away','busy'],

  async activate(ctx){
    _ctx = ctx;

    _refreshNear=()=>{
      const panel=_getSocialPanel();
      if(!panel) return;
      const content=panel.querySelector('#social-tab-content');
      if(!content) return;
      const tab=panel.querySelector('.ym-tab.active')?.dataset?.tab;
      if(tab==='Near') renderNearTab(content);
      else if(tab==='Feed') renderFeedTab(content);
    };

    startGeo();
    startHeartbeat();

    _onPeerJoin=()=>setTimeout(broadcastPresence, 300);
    window.addEventListener('ym:peer-join', _onPeerJoin);

    ctx.onReceive(async(type,data,peerId)=>{
      if(type==='social:presence') handlePresence(data, peerId);
      else if(type==='social:presence-req') broadcastPresence();
    });

    _cleanTimer = setInterval(cleanGossip, 5000);

    _onVisibility=()=>{
      if(!document.hidden){startHeartbeat();broadcastPresence();}
    };
    document.addEventListener('visibilitychange', _onVisibility);
  },

  deactivate(){
    stopGeo();
    stopHeartbeat();
    if(_cleanTimer){clearInterval(_cleanTimer);_cleanTimer=null;}
    if(_onPeerJoin){window.removeEventListener('ym:peer-join',_onPeerJoin);_onPeerJoin=null;}
    if(_onVisibility){document.removeEventListener('visibilitychange',_onVisibility);_onVisibility=null;}
    window.YM_Call?.hangUp();
    _nearUsers.clear();_gossipCache.clear();
    _ctx=null;
  },

  renderPanel(container){
    _panelHistory.length=0;
    container.style.cssText='display:flex;flex-direction:column;height:100%';
    container.innerHTML='';

    const TABS=['Near','Feed'];
    let curIdx=0;

    // Slider horizontal
    const slider=document.createElement('div');
    slider.id='social-tab-content';
    slider.style.cssText='flex:1;overflow:hidden;position:relative';

    const track=document.createElement('div');
    track.style.cssText='display:flex;height:100%;transition:transform .25s ease;will-change:transform';
    slider.appendChild(track);

    TABS.forEach(()=>{
      const pane=document.createElement('div');
      pane.style.cssText='flex:0 0 100%;width:100%;height:100%;overflow-y:auto;padding:14px';
      track.appendChild(pane);
    });

    const tabs=document.createElement('div');tabs.className='ym-tabs';
    tabs.style.cssText='border-top:1px solid rgba(232,160,32,.12);border-bottom:none;margin:0;flex-shrink:0';

    function goTab(idx,animate=true){
      curIdx=idx;
      track.style.transition=animate?'transform .25s ease':'none';
      track.style.transform='translateX(-'+idx*100+'%)';
      tabs.querySelectorAll('.ym-tab').forEach((t,i)=>t.classList.toggle('active',i===idx));
      const pane=track.children[idx];
      pane.innerHTML='';
      if(idx===0){_ctx?.setNotification?.(0);renderNearTab(pane);}
      else if(idx===1)renderFeedTab(pane);
    }

    // Swipe horizontal
    let sx=0,sy=0,sw=false;
    slider.addEventListener('pointerdown',e=>{sx=e.clientX;sy=e.clientY;sw=true;},{passive:true});
    slider.addEventListener('pointerup',e=>{
      if(!sw)return;sw=false;
      const dx=e.clientX-sx,dy=e.clientY-sy;
      if(Math.abs(dx)>40&&Math.abs(dx)>Math.abs(dy)*1.2){
        const next=dx<0?Math.min(curIdx+1,TABS.length-1):Math.max(curIdx-1,0);
        if(next!==curIdx)goTab(next);
      }
    },{passive:true});
    slider.addEventListener('pointercancel',()=>{sw=false;});

    TABS.forEach((t,i)=>{
      const tab=document.createElement('div');
      tab.className='ym-tab'+(i===0?' active':'');
      tab.dataset.tab=t;tab.textContent=t;
      tab.addEventListener('click',()=>goTab(i));
      tabs.appendChild(tab);
    });

    // _refreshNear pointe vers le bon pane
    _refreshNear=()=>{
      if(curIdx===0){
        const pane=track.children[0];
        renderNearTab(pane);
      }
    };

    container.appendChild(slider);
    container.appendChild(tabs);
    if(_ctx)_ctx.setNotification?.(0);
    goTab(0,false);
  },

  profileSection(container){
    const state=loadState();
    const networks=state.networks||[];
    const prof=(_ctx&&_ctx.loadProfile&&_ctx.loadProfile())||{};

    // ── Identité ────────────────────────────────────────────
    const ident = document.createElement('div');
    ident.innerHTML =
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">'
      +'<div id="soc-pav" style="width:64px;height:64px;border-radius:50%;background:var(--surface3);border:2px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:28px;cursor:pointer;overflow:hidden;flex-shrink:0">'
      +(prof.avatar?'<img src="'+prof.avatar+'" style="width:100%;height:100%;object-fit:cover">':'&#128100;')
      +'</div>'
      +'<div style="flex:1;display:flex;flex-direction:column;gap:6px">'
      +'<input class="ym-input" id="soc-name" placeholder="Display name" value="'+(prof.name||'')+'" style="font-size:12px">'
      +'<input class="ym-input" id="soc-site" placeholder="Website" value="'+(prof.site||'')+'" style="font-size:12px">'
      +'</div></div>'
      +'<textarea class="ym-input" id="soc-bio" placeholder="Short bio" style="height:52px;font-size:12px;margin-bottom:8px">'+(prof.bio||'')+'</textarea>';
    container.appendChild(ident);

    ident.querySelector('#soc-pav').addEventListener('click',()=>{
      const inp=document.createElement('input');inp.type='file';inp.accept='image/*';
      inp.onchange=()=>{const r=new FileReader();r.onload=e=>{_ctx?.saveProfile?.({avatar:e.target.result});ident.querySelector('#soc-pav').innerHTML='<img src="'+e.target.result+'" style="width:100%;height:100%;object-fit:cover">';};r.readAsDataURL(inp.files[0]);};
      inp.click();
    });

    // ── Réseaux sociaux en accordéon ────────────────────────
    const netTitle = document.createElement('div');
    netTitle.style.cssText='font-family:var(--font-d,monospace);font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text3);margin-bottom:8px;margin-top:4px';
    netTitle.textContent='Social Networks';
    container.appendChild(netTitle);

    ALL_NETWORKS.forEach(n=>{
      const saved = networks.find(x=>x.id===n.id);
      const hasFeed = !!FEED_NETWORKS.find(f=>f.id===n.id);
      const row = document.createElement('div');
      row.style.cssText='border:1px solid var(--border);border-radius:var(--r-sm);margin-bottom:6px;overflow:hidden';

      // Header cliquable
      const header = document.createElement('div');
      header.style.cssText='display:flex;align-items:center;gap:8px;padding:8px 10px;cursor:pointer;background:rgba(255,255,255,.02)';
      header.innerHTML=`
        <span style="font-size:11px;color:${saved?.handle?'var(--accent)':'var(--text2)'};flex:1">${n.label}${saved?.handle?' · <span style="color:var(--text3);font-size:10px">'+saved.handle+'</span>':''}</span>
        ${hasFeed?'<span style="font-size:9px;color:var(--green)">feed</span>':''}
        <span style="font-size:10px;color:var(--text3)">${saved?.handle?'✓':'+'}</span>
      `;
      row.appendChild(header);

      // Champ déroulant
      const body = document.createElement('div');
      body.style.cssText='display:none;padding:8px 10px;border-top:1px solid var(--border)';
      const inp = document.createElement('input');
      inp.className='ym-input';inp.placeholder=n.hint;inp.value=saved?.handle||'';inp.style.fontSize='11px';
      body.appendChild(inp);
      row.appendChild(body);

      header.addEventListener('click',()=>{
        const open=body.style.display!=='none';
        body.style.display=open?'none':'block';
        if(!open)inp.focus();
      });
      inp.addEventListener('change',()=>{
        const cur=loadState().networks||[];
        const idx=cur.findIndex(x=>x.id===n.id);
        if(inp.value.trim()){if(idx>=0)cur[idx].handle=inp.value.trim();else cur.push({id:n.id,handle:inp.value.trim()});}
        else{if(idx>=0)cur.splice(idx,1);}
        saveState({networks:cur});
        broadcastPresence();
        // Met à jour le header
        const lbl=header.querySelector('span');
        lbl.innerHTML=`${n.label}${inp.value.trim()?' · <span style="color:var(--text3);font-size:10px">'+inp.value.trim()+'</span>':''}`;
        header.querySelector('span:last-child').textContent=inp.value.trim()?'✓':'+';
        header.querySelector('span:first-child').style.color=inp.value.trim()?'var(--accent)':'var(--text2)';
        body.style.display='none';
      });

      container.appendChild(row);
    });

    // ── Save en bas ────────────────────────────────────────
    const saveBtn = document.createElement('button');
    saveBtn.className='ym-btn ym-btn-accent';saveBtn.style.cssText='width:100%;margin-top:14px';
    saveBtn.textContent='Save identity';
    saveBtn.addEventListener('click',()=>{
      _ctx?.saveProfile?.({name:ident.querySelector('#soc-name').value,bio:ident.querySelector('#soc-bio').value,site:ident.querySelector('#soc-site').value});
      broadcastPresence();
      window.YM_toast?.('Social profile saved','success');
    });
    container.appendChild(saveBtn);
  },

  getTabBadges(){
    return {Near:_nearUsers.size, Contacts:0, Feed:0};
  },

  // Hook appelé par profile.js dans la fiche d'un pair
  peerSection(container, ctx){
    const{uuid,isNear,isReciproc}=ctx;
    if(isNear&&isReciproc){
      const btn=document.createElement('button');
      btn.className='ym-btn ym-btn-ghost';
      btn.style.cssText='width:100%;font-size:12px;color:var(--cyan);border-color:rgba(34,211,238,.3)';
      btn.textContent='📞 Voice Call';
      btn.addEventListener('click',()=>window.YM_Call?.startVoiceCall(uuid));
      container.appendChild(btn);
    }else{
      const info=document.createElement('div');
      info.style.cssText='font-size:11px;color:var(--text3);text-align:center;padding:4px';
      info.textContent=isNear?'Add each other as contacts to call':'Not nearby';
      container.appendChild(info);
    }
  }
};

// Compteurs de badges par onglet
const _tabBadges={Near:0,Contacts:0,Feed:0};

function _getSocialPanel(){
  // Le panel social est dans panel-sphere-body
  const body=document.getElementById('panel-sphere-body');
  if(!body) return null;
  // Vérifie que c'est bien le panel social (contient social-tab-content)
  return body.querySelector('#social-tab-content') ? body : null;
}

function _incTabBadge(tab){
  _tabBadges[tab]=(_tabBadges[tab]||0)+1;
  _updateTabBadgeUI(tab);
}
function _clearTabBadge(tab){
  _tabBadges[tab]=0;
  _updateTabBadgeUI(tab);
}
function _updateTabBadgeUI(tab){
  const panel=_getSocialPanel();
  const t=panel?.querySelector(`.ym-tab[data-tab="${tab}"]`);
  if(!t) return;
  let badge=t.querySelector('.ym-tab-badge');
  const count=_tabBadges[tab]||0;
  if(count>0){
    if(!badge){badge=document.createElement('span');badge.className='ym-tab-badge';t.appendChild(badge);}
    badge.textContent=count;
  }else if(badge){badge.remove();}
}
function renderSocialTabInto(content,tab){
  content.innerHTML='';
  if(tab==='Near')      renderNearTab(content);
  else if(tab==='Feed') renderFeedTab(content);
}

// ── NEAR TAB ──────────────────────────────────────────────────────────────────
function renderNearTab(el){
  _clearTabBadge('Near');
  const near=[..._nearUsers.values()];
  const myUUID=_ctx?.loadProfile?.()?.uuid;
  const gossip=[..._gossipCache.values()]
    .filter(g=>!_nearUsers.has(g.profile.uuid)&&g.profile.uuid!==myUUID)
    .slice(0,10);

  el.innerHTML=`
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
      <div style="font-size:10px;color:var(--text3)">Within ${NEAR_RADIUS}m · ${near.length} online</div>
      <div style="margin-left:auto;font-size:10px;color:var(--text3)">${_myCoords?'📍':'🌐'} ${_myCoords?(_myCoords.lat.toFixed(3)+','+_myCoords.lng.toFixed(3)):'P2P room'}</div>
    </div>
  `;

  if(!near.length){
    el.innerHTML+=`<div style="text-align:center;padding:20px 0;color:var(--text3);font-size:12px">No one nearby right now…</div>`;
  }else{
    near.forEach(u=>{
      el.appendChild(userCard(u.profile,'near',()=>{
        addContact(u.profile);window.YM_toast?.('Contact added','success');renderNearTab(el);
      }));
    });
  }

  // Gossip — profils découverts indirectement
  if(gossip.length){
    const gossipHdr=document.createElement('div');
    gossipHdr.style.cssText='font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--text3);padding:12px 0 6px;border-top:1px solid var(--border);margin-top:8px';
    gossipHdr.textContent='Nearby (via others)';
    el.appendChild(gossipHdr);
    gossip.forEach(g=>{
      el.appendChild(userCard(g.profile,'gossip',()=>{
        addContact(g.profile);window.YM_toast?.('Contact added','success');renderNearTab(el);
      }));
    });
  }
}

// ── CONTACTS TAB ──────────────────────────────────────────────────────────────
function renderContactsTab(el){
  _clearTabBadge('Contacts');
  const contacts=loadContacts();
  el.innerHTML='';

  // Add contact au-dessus de search
  const addSection=document.createElement('div');addSection.className='ym-card';addSection.style.marginBottom='12px';
  addSection.innerHTML=`
    <div class="ym-card-title">Add contact</div>
    <div style="display:flex;gap:8px;margin-bottom:0">
      <button class="ym-btn ym-btn-ghost" id="scan-qr-btn" style="padding:0 10px;font-size:16px;flex-shrink:0" title="Scan QR">📷</button>
      <input class="ym-input" id="add-uuid-input" placeholder="UUID…" style="flex:1">
      <button class="ym-btn ym-btn-accent" id="add-uuid-btn" style="flex-shrink:0">Add</button>
    </div>
    <div id="qr-scanner-container" style="display:none;margin-top:10px"></div>`;
  el.appendChild(addSection);

  el.querySelector('#add-uuid-btn')?.addEventListener('click',()=>{
    const uuid=el.querySelector('#add-uuid-input')?.value?.trim();
    if(!uuid){window.YM_toast?.('Enter a UUID','error');return;}
    addContact({uuid,name:'Unknown',addedVia:'uuid'});
    window.YM_toast?.('Contact added','success');
    el.querySelector('#add-uuid-input').value='';
    renderContactsTab(el);
  });
  el.querySelector('#scan-qr-btn')?.addEventListener('click',()=>{
    const sc=el.querySelector('#qr-scanner-container');
    if(sc.style.display!=='none'){sc.style.display='none';sc.innerHTML='';return;}
    sc.style.display='block';
    startQRScanner(sc,uuid=>{
      sc.style.display='none';sc.innerHTML='';
      if(!uuid){window.YM_toast?.('No QR detected','warn');return;}
      const m=uuid.match(/yourmine:\/\/contact\/([a-f0-9-]{36})/);
      addContact({uuid:m?m[1]:uuid,name:'Unknown',addedVia:'qr'});
      window.YM_toast?.('Contact added via QR','success');
      renderContactsTab(el);
    });
  });

  // Search
  const searchInput=document.createElement('input');
  searchInput.className='ym-input';searchInput.id='contacts-search';
  searchInput.placeholder='Search contacts…';searchInput.style.marginBottom='10px';
  el.appendChild(searchInput);

  const listEl=document.createElement('div');el.appendChild(listEl);

  function renderFiltered(q=''){
    const filtered=contacts.filter(c=>{
      const n=(c.nickname||c.profile?.name||c.uuid).toLowerCase();
      return !q||n.includes(q.toLowerCase());
    });
    listEl.innerHTML='';
    if(!filtered.length){listEl.innerHTML=`<div style="color:var(--text3);font-size:12px;padding:8px">No contacts yet</div>`;return;}
    filtered.forEach(c=>{
      const profile=c.profile||{uuid:c.uuid,name:c.nickname||c.name||'Unknown'};
      const card=document.createElement('div');card.className='ym-card';
      card.style.cssText='cursor:pointer;position:relative';

      // Croix remove dans le coin
      const delX=document.createElement('div');
      delX.style.cssText='position:absolute;top:8px;right:8px;width:20px;height:20px;border-radius:50%;background:var(--surface3);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:11px;cursor:pointer;color:var(--text3);z-index:2';
      delX.textContent='×';
      delX.addEventListener('click',e=>{e.stopPropagation();saveContacts(loadContacts().filter(x=>x.uuid!==c.uuid));renderContactsTab(el);});
      card.appendChild(delX);

      // Avatar + nom
      const avatar=profile.avatar?`<img src="${profile.avatar}" style="width:36px;height:36px;border-radius:50%;object-fit:cover">`:`<div style="width:36px;height:36px;border-radius:50%;background:var(--surface3);display:flex;align-items:center;justify-content:center;font-size:16px">${profile.name?.charAt(0)||'👤'}</div>`;
      const row=document.createElement('div');row.style.cssText='display:flex;align-items:center;gap:10px;padding-right:24px';
      row.innerHTML=`<div style="flex-shrink:0">${avatar}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:13px">${c.nickname||profile.name||'Anonymous'}</div>
          ${profile.bio?`<div style="font-size:11px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${profile.bio}</div>`:''}
        </div>`;
      card.appendChild(row);

      // Nickname input — stopPropagation pour éviter d'ouvrir le profil
      const nickWrap=document.createElement('div');nickWrap.style.marginTop='8px';
      const nickInput=document.createElement('input');
      nickInput.className='ym-input';nickInput.style.fontSize='11px';
      nickInput.placeholder='Set nickname…';nickInput.value=c.nickname||'';
      nickInput.addEventListener('click',e=>e.stopPropagation());
      nickInput.addEventListener('pointerdown',e=>e.stopPropagation());
      nickInput.addEventListener('change',e=>{
        e.stopPropagation();
        updateNickname(c.uuid,nickInput.value);
        window.YM_toast?.('Nickname saved','success');
        renderContactsTab(el);
      });
      nickWrap.appendChild(nickInput);card.appendChild(nickWrap);

      // Réseaux connus
      if(profile.networks?.length){
        const nets=document.createElement('div');nets.style.cssText='margin-top:6px;display:flex;flex-wrap:wrap;gap:4px';
        profile.networks.forEach(n=>{const p=document.createElement('span');p.className='pill';p.textContent=n.id+' '+n.handle;nets.appendChild(p);});
        card.appendChild(nets);
      }
      // Appel vocal si contact proche ET réciproque
      if(_nearUsers.has(profile.uuid)&&isReciprocal(profile.uuid)){
        const callBtn=document.createElement('button');callBtn.className='ym-btn ym-btn-cyan';callBtn.style.cssText='width:100%;margin-top:8px;font-size:12px';
        callBtn.textContent='📞 Voice Call';
        callBtn.addEventListener('click',e=>{e.stopPropagation();window.YM_Call?.startVoiceCall(profile.uuid);});
        card.appendChild(callBtn);
      }
      card.addEventListener('click',()=>window.YM_Social?.openProfile?.(profile.uuid));
      listEl.appendChild(card);
    });
  }
  renderFiltered();
  searchInput.addEventListener('input',e=>renderFiltered(e.target.value));
}

// ── FEED TAB ──────────────────────────────────────────────────────────────────
function renderFeedTab(el){
  el.innerHTML='';
  const tabs=['Nearby','Contacts'];
  let currentIdx=0;

  const subTabs=document.createElement('div');subTabs.className='ym-tabs';
  const feedContent=document.createElement('div');
  feedContent.style.cssText='flex:1;overflow:hidden;position:relative';

  // Swipe horizontal
  let swipeX=0,swipeY=0,swiping=false;
  feedContent.addEventListener('pointerdown',e=>{swipeX=e.clientX;swipeY=e.clientY;swiping=true;},{passive:true});
  feedContent.addEventListener('pointerup',e=>{
    if(!swiping)return;swiping=false;
    const dx=e.clientX-swipeX,dy=e.clientY-swipeY;
    if(Math.abs(dx)>40&&Math.abs(dx)>Math.abs(dy)*1.5){
      // Glisser droite → aller à Contacts (idx+1) ; gauche → Nearby (idx-1)
      const next=dx>0?Math.min(currentIdx+1,tabs.length-1):Math.max(currentIdx-1,0);
      if(next!==currentIdx){currentIdx=next;switchTab(next);}
    }
  },{passive:true});

  function switchTab(idx){
    currentIdx=idx;
    subTabs.querySelectorAll('.ym-tab').forEach((t,i)=>t.classList.toggle('active',i===idx));
    feedContent.innerHTML='<div style="text-align:center;padding:16px;color:var(--text3);font-size:12px">Loading…</div>';
    if(tabs[idx]==='Nearby'){
      loadFeedForUsers([..._nearUsers.values()].map(u=>u.profile),feedContent);
    }else{
      const contacts=(()=>{try{return JSON.parse(localStorage.getItem('ym_contacts_v1')||'[]');}catch{return[];}})();
      loadFeedForUsers(contacts.map(c=>c.profile).filter(Boolean),feedContent);
    }
  }

  tabs.forEach((t,i)=>{
    const tab=document.createElement('div');
    tab.className='ym-tab'+(i===0?' active':'');
    tab.dataset.tab=t;tab.textContent=t;
    tab.addEventListener('click',()=>switchTab(i));
    subTabs.appendChild(tab);
  });

  el.appendChild(subTabs);
  el.appendChild(feedContent);
  switchTab(0);
}

async function loadFeedForUsers(profiles,container){
  container.innerHTML='';
  if(!profiles.length){
    container.innerHTML=`<div style="text-align:center;padding:24px;color:var(--text3);font-size:12px">No profiles yet</div>`;
    return;
  }

  // Filtre les profils avec des réseaux feed
  const feedProfiles=profiles.filter(p=>(p.networks||[]).some(n=>FEED_NETWORKS.find(f=>f.id===n.id)));
  if(!feedProfiles.length){
    container.innerHTML=`<div style="text-align:center;padding:24px;color:var(--text3);font-size:12px">No public social networks in these profiles</div>`;
    return;
  }

  // Charge le feed de chaque profil séparément pour les bandeaux
  for(const profile of feedProfiles){
    const networks=(profile.networks||[]).filter(n=>FEED_NETWORKS.find(f=>f.id===n.id));
    if(!networks.length) continue;

    // Bandeau profil sticky + cliquable
    const banner=document.createElement('div');
    banner.style.cssText='position:sticky;top:0;z-index:10;background:rgba(8,8,15,.92);backdrop-filter:blur(8px);padding:8px 0 6px;cursor:pointer;display:flex;align-items:center;gap:10px;margin-bottom:4px';
    const av=profile.avatar?`<img src="${profile.avatar}" style="width:32px;height:32px;border-radius:50%;object-fit:cover">`:`<div style="width:32px;height:32px;border-radius:50%;background:var(--surface3);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">${profile.name?.charAt(0)||'👤'}</div>`;
    banner.innerHTML=`${av}<div style="flex:1;min-width:0"><div style="font-weight:600;font-size:13px;color:var(--text)">${profile.name||'Anonymous'}</div><div style="font-size:10px;color:var(--text3)">${networks.map(n=>n.id).join(' · ')}</div></div><span style="font-size:10px;color:var(--accent)">›</span>`;
    banner.addEventListener('click',()=>window.YM_Social?.openProfile?.(profile.uuid));
    container.appendChild(banner);

    // Placeholder loading
    const feedWrap=document.createElement('div');feedWrap.style.marginBottom='16px';
    feedWrap.innerHTML=`<div style="color:var(--text3);font-size:11px;padding:6px 0">Loading…</div>`;
    container.appendChild(feedWrap);

    // Charge en parallèle
    fetchFeedItems(networks).then(items=>{
      feedWrap.innerHTML='';
      if(!items.length){
        feedWrap.innerHTML=`<div style="color:var(--text3);font-size:11px;padding:6px 0;text-align:center">No posts found</div>`;
        return;
      }
      items.slice(0,10).forEach(item=>{
        const card=document.createElement('div');card.className='ym-card';card.style.cssText='cursor:pointer;margin-bottom:8px';
        // Extrait de texte
        const excerpt=item.text?(item.text.slice(0,180)+(item.text.length>180?'…':'')):'';
        card.innerHTML=`
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
            <span class="pill" style="font-size:9px">${item.network}</span>
            <span style="font-size:9px;color:var(--text3);margin-left:auto">${new Date(item.ts).toLocaleDateString()}</span>
          </div>
          ${item.image?`<img src="${item.image}" style="width:100%;border-radius:var(--r-sm);margin-bottom:8px;max-height:180px;object-fit:cover" loading="lazy" onerror="this.style.display='none'">`:''}
          <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:4px;line-height:1.4">${item.title||''}</div>
          ${excerpt?`<div style="font-size:12px;color:var(--text2);line-height:1.5">${excerpt}</div>`:''}
        `;
        if(item.url) card.addEventListener('click',()=>window.open(item.url,'_blank'));
        feedWrap.appendChild(card);
      });
    }).catch(()=>{
      feedWrap.innerHTML=`<div style="color:var(--text3);font-size:11px;padding:6px 0;text-align:center">Could not load feed</div>`;
    });
  }
}

// Stack de navigation interne — plus utilisée, gardée vide
const _panelHistory=[];

window.YM_Social = {
  openProfile(uuid){
    const near=_nearUsers.get(uuid);
    const contact=getContact(uuid);
    const profile=near?.profile||contact?.profile||{uuid,name:'Unknown'};
    if(!profile) return;
    window.YM?.openProfilePanel?.(profile);
  },
  isReciprocal,
  get _nearUsers(){return _nearUsers;}
};

// ── USER CARD ──────────────────────────────────────────────────────────────────
function userCard(profile,type,onAdd){
  const card=document.createElement('div');card.className='ym-card';card.style.cursor='pointer';
  const isContact=!!getContact(profile.uuid);
  card.innerHTML=`
    <div style="display:flex;align-items:center;gap:12px">
      <div style="font-size:28px;flex-shrink:0">${profile.avatar?`<img src="${profile.avatar}" style="width:36px;height:36px;border-radius:50%;object-fit:cover">`:profile.name?.charAt(0)||'👤'}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:13px">${profile.name||'Anonymous'}</div>
        ${profile.bio?`<div style="font-size:11px;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${profile.bio}</div>`:''}
      </div>
      ${onAdd&&!isContact?`<button class="ym-btn ym-btn-ghost" style="padding:4px 10px;font-size:12px;min-height:unset" data-add>+</button>`:''}
      ${isContact&&type==='near'?'<span style="font-size:10px;color:var(--green)">✓</span>':''}
    </div>
  `;
  card.querySelector('[data-add]')?.addEventListener('click',e=>{e.stopPropagation();onAdd?.();});
  card.addEventListener('click',e=>{if(!e.target.closest('[data-add]'))window.YM_Social?.openProfile?.(profile.uuid);});
  return card;
}

})();