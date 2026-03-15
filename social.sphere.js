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
let _callPeer = null;
let _peerConnection = null;
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

// ── FULL PROFILE PACKET ────────────────────────────────────────────────────
// Un seul paquet contient tout : identité, coords, réseaux sociaux, sphères
function buildProfilePacket(){
  const p = _ctx?.loadProfile?.() ?? {};
  const state = loadState();
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
    _nearUsers.set(data.uuid, {profile:data, ts, peerId});
    _gossipCache.set(data.uuid, {profile:data, ts});
    if(_ctx) _ctx.setNotification?.(_nearUsers.size);
    _refreshNear?.(); // refresh à chaque update, pas seulement les nouveaux
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
async function startVoiceCall(peerId){
  try{
    const stream = await navigator.mediaDevices.getUserMedia({audio:true,video:false});
    _peerConnection = new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
    stream.getTracks().forEach(t=>_peerConnection.addTrack(t,stream));
    _peerConnection.ontrack = e=>{
      const audio = document.createElement('audio');
      audio.srcObject = e.streams[0]; audio.autoplay = true;
      document.body.appendChild(audio);
    };
    _peerConnection.onicecandidate = e=>{
      if(e.candidate) _ctx?.send('social:ice',{candidate:e.candidate,to:peerId});
    };
    const offer = await _peerConnection.createOffer();
    await _peerConnection.setLocalDescription(offer);
    _ctx?.send('social:call-offer',{sdp:offer.sdp,to:peerId});
    _callPeer = peerId;
    window.YM_toast?.('📞 Calling…','info');
  }catch(e){ window.YM_toast?.('Call failed: '+e.message,'error'); }
}

async function handleCallOffer(data){
  try{
    const stream = await navigator.mediaDevices.getUserMedia({audio:true});
    _peerConnection = new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
    stream.getTracks().forEach(t=>_peerConnection.addTrack(t,stream));
    _peerConnection.ontrack = e=>{
      const audio = document.createElement('audio'); audio.srcObject=e.streams[0]; audio.autoplay=true; document.body.appendChild(audio);
    };
    _peerConnection.onicecandidate = e=>{
      if(e.candidate) _ctx?.send('social:ice',{candidate:e.candidate,to:data.from});
    };
    await _peerConnection.setRemoteDescription({type:'offer',sdp:data.sdp});
    const answer = await _peerConnection.createAnswer();
    await _peerConnection.setLocalDescription(answer);
    _ctx?.send('social:call-answer',{sdp:answer.sdp,to:data.from});
    _callPeer = data.from;
    window.YM_toast?.('📞 Call connected','success');
  }catch(e){ window.YM_toast?.('Incoming call error: '+e.message,'error'); }
}

function hangUp(){
  if(_peerConnection){_peerConnection.close();_peerConnection=null;}
  if(_callPeer){_ctx?.send('social:call-end',{to:_callPeer});_callPeer=null;}
  window.YM_toast?.('Call ended','info');
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

async function fetchFeedItems(networks){
  const items = [];
  for(const n of networks.filter(n=>FEED_NETWORKS.find(f=>f.id===n.id))){
    try{
      if(n.id==='mastodon' && n.handle){
        const [user,instance] = n.handle.replace('@','').split('@');
        if(instance){
          const acc = await (await fetch(`https://${instance}/api/v1/accounts/lookup?acct=${user}`)).json();
          const posts = await (await fetch(`https://${instance}/api/v1/accounts/${acc.id}/statuses?limit=5`)).json();
          posts.forEach(p=>items.push({network:'Mastodon',author:acc.display_name||acc.username,text:p.content.replace(/<[^>]+>/g,''),ts:new Date(p.created_at).getTime(),url:p.url}));
        }
      }
      if(n.id==='bluesky' && n.handle){
        const handle = n.handle.replace('@','');
        const data = await (await fetch(`https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${handle}&limit=5`)).json();
        (data.feed||[]).forEach(f=>{
          const post = f.post?.record;
          if(post?.text) items.push({network:'Bluesky',author:handle,text:post.text,ts:new Date(post.createdAt).getTime(),url:`https://bsky.app/profile/${handle}`});
        });
      }
      if(n.id==='github' && n.handle){
        const user=n.handle.replace('@','');
        const events=await(await fetch(`https://api.github.com/users/${user}/events/public?per_page=5`)).json();
        events.filter(e=>e.type==='PushEvent').forEach(e=>{
          const msg=e.payload?.commits?.[0]?.message||'pushed';
          items.push({network:'GitHub',author:user,text:msg,ts:new Date(e.created_at).getTime(),url:`https://github.com/${user}`});
        });
      }
      if(n.id==='devto' && n.handle){
        const user=n.handle.replace('@','');
        const posts=await(await fetch(`https://dev.to/api/articles?username=${user}&per_page=5`)).json();
        if(Array.isArray(posts)) posts.forEach(p=>items.push({network:'Dev.to',author:user,text:p.title,ts:new Date(p.published_at).getTime(),url:p.url}));
      }
      if(n.id==='hashnode' && n.handle){
        const user=n.handle.replace('@','');
        const r=await fetch('https://gql.hashnode.com/',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({query:`{user(username:"${user}"){posts(page:1,pageSize:5){nodes{title,url,publishedAt}}}}`})});
        const d=await r.json();
        (d.data?.user?.posts?.nodes||[]).forEach(p=>items.push({network:'Hashnode',author:user,text:p.title,ts:new Date(p.publishedAt).getTime(),url:p.url}));
      }
      if(n.id==='medium' && n.handle){
        const user=n.handle.replace('@','');
        const r=await fetch(`https://api.rss2json.com/v1/api.json?rss_url=https://medium.com/feed/@${user}`);
        const d=await r.json();
        (d.items||[]).slice(0,5).forEach(p=>items.push({network:'Medium',author:user,text:p.title,ts:new Date(p.pubDate).getTime(),url:p.link}));
      }
      if(n.id==='substack' && n.handle){
        const host=n.handle.includes('.')?n.handle:`${n.handle}.substack.com`;
        const r=await fetch(`https://api.rss2json.com/v1/api.json?rss_url=https://${host}/feed`);
        const d=await r.json();
        (d.items||[]).slice(0,5).forEach(p=>items.push({network:'Substack',author:host,text:p.title,ts:new Date(p.pubDate).getTime(),url:p.link}));
      }
      if(n.id==='paragraph' && n.handle){
        const handle=n.handle.replace('paragraph.xyz/','').replace('@','');
        const r=await fetch(`https://api.rss2json.com/v1/api.json?rss_url=https://paragraph.xyz/@${handle}/feed`);
        const d=await r.json();
        (d.items||[]).slice(0,5).forEach(p=>items.push({network:'Paragraph',author:handle,text:p.title,ts:new Date(p.pubDate).getTime(),url:p.link}));
      }
      if(n.id==='reddit' && n.handle){
        const user=n.handle.replace('u/','').replace('@','');
        const r=await fetch(`https://www.reddit.com/user/${user}/submitted.json?limit=5`);
        const d=await r.json();
        (d.data?.children||[]).forEach(c=>items.push({network:'Reddit',author:user,text:c.data.title,ts:c.data.created_utc*1000,url:`https://reddit.com${c.data.permalink}`}));
      }
    }catch{}
  }
  return items.sort((a,b)=>b.ts-a.ts);
}

// ── SPHERE DEFINITION ────────────────────────────────────────────────────────
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
    startGeo();
    startHeartbeat();

    window.addEventListener('ym:peer-join', ()=>setTimeout(broadcastPresence, 300));

    ctx.onReceive((type,data,peerId)=>{
      if(type==='social:presence')          handlePresence(data, peerId);
      else if(type==='social:presence-req') broadcastPresence();
      else if(type==='social:call-offer')   handleCallOffer({...data,from:peerId});
      else if(type==='social:call-answer' && _peerConnection) _peerConnection.setRemoteDescription({type:'answer',sdp:data.sdp});
      else if(type==='social:ice' && _peerConnection) _peerConnection.addIceCandidate(data.candidate).catch(()=>{});
      else if(type==='social:call-end' && _callPeer===peerId) hangUp();
    });

    _cleanTimer = setInterval(cleanGossip, 5000);

    // Relance le heartbeat quand l'écran se réveille
    document.addEventListener('visibilitychange', ()=>{
      if(!document.hidden){
        startHeartbeat(); // repart depuis zéro
        broadcastPresence();
      }
    });
  },

  deactivate(){
    stopGeo();
    stopHeartbeat();
    if(_cleanTimer){clearInterval(_cleanTimer);_cleanTimer=null;}
    if(_peerConnection){_peerConnection.close();_peerConnection=null;}
    _nearUsers.clear();_gossipCache.clear();
    _ctx = null;
  },

  renderPanel(container){
    _panelHistory.length=0;
    container.style.cssText='display:flex;flex-direction:column;height:100%';
    container.innerHTML='';

    const content=document.createElement('div');
    content.id='social-tab-content';
    content.style.cssText='flex:1;overflow-y:auto;padding:14px';
    container.appendChild(content);

    const tabs=document.createElement('div');tabs.className='ym-tabs';
    tabs.style.cssText='border-top:1px solid rgba(232,160,32,.12);border-bottom:none;margin:0;flex-shrink:0';
    ['Near','Contacts','Feed'].forEach((t,i)=>{
      const tab=document.createElement('div');
      tab.className='ym-tab'+(i===0?' active':'');
      tab.dataset.tab=t;tab.textContent=t;
      tab.addEventListener('click',()=>{
        container.querySelectorAll('.ym-tab').forEach(x=>x.classList.remove('active'));
        tab.classList.add('active');
        if(t==='Near')_ctx?.setNotification?.(0);
        renderSocialTabInto(content,t);
      });
      tabs.appendChild(tab);
    });
    container.appendChild(tabs);
    if(_ctx)_ctx.setNotification?.(0);
    renderSocialTabInto(content,'Near');
  },

  profileSection(container){
    const state=loadState();
    const networks=state.networks||[];
    const prof=_ctx?.loadProfile?.()??{};

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
  }
};

// ── TABS ──────────────────────────────────────────────────────────────────────
function renderSocialTabInto(content,tab){
  content.innerHTML='';
  if(tab==='Near')          renderNearTab(content);
  else if(tab==='Contacts') renderContactsTab(content);
  else if(tab==='Feed')     renderFeedTab(content);
}

// ── NEAR TAB ──────────────────────────────────────────────────────────────────
function renderNearTab(el){
  const near=[..._nearUsers.values()];

  el.innerHTML=`
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
      <div style="font-size:10px;color:var(--text3)">Within ${NEAR_RADIUS}m · ${near.length} online</div>
      <div style="margin-left:auto;font-size:10px;color:var(--text3)">${_myCoords?'📍':'🌐'} ${_myCoords?(_myCoords.lat.toFixed(3)+','+_myCoords.lng.toFixed(3)):'P2P room'}</div>
    </div>
  `;

  if(!near.length){
    el.innerHTML+=`<div style="text-align:center;padding:32px 0;color:var(--text3);font-size:12px">No one nearby right now…<br><span style="font-size:10px">Move around or share your link</span></div>`;
  }else{
    near.forEach(u=>{
      el.appendChild(userCard(u.profile,'near',()=>{
        addContact(u.profile);
        window.YM_toast?.('Contact added','success');
        renderNearTab(el);
      }));
    });
  }
  _refreshNear=()=>{
    const activeTab=document.querySelector('#social-tab-content')
      ?.closest('[style*="flex"]')?.querySelector('.ym-tab.active');
    const tab=activeTab?.dataset?.tab;
    const content=document.getElementById('social-tab-content');
    if(!content) return;
    if(tab==='Near') renderNearTab(content);
    else if(tab==='Contacts') renderContactsTab(content);
  };
}

// ── CONTACTS TAB ──────────────────────────────────────────────────────────────
function renderContactsTab(el){
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
      // Appel vocal si proche
      const nearEntry=_nearUsers.get(c.uuid);
      if(nearEntry){
        const callBtn=document.createElement('button');callBtn.className='ym-btn ym-btn-cyan';callBtn.style.cssText='width:100%;margin-top:8px;font-size:12px';
        callBtn.textContent='📞 Voice Call';
        callBtn.addEventListener('click',e=>{e.stopPropagation();startVoiceCall(nearEntry.peerId);});
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
  const subTabs=document.createElement('div');subTabs.className='ym-tabs';
  ['Nearby','Contacts'].forEach((t,i)=>{
    const tab=document.createElement('div');
    tab.className='ym-tab'+(i===0?' active':'');
    tab.dataset.tab=t;tab.textContent=t;
    tab.addEventListener('click',()=>{
      subTabs.querySelectorAll('.ym-tab').forEach(x=>x.classList.remove('active'));
      tab.classList.add('active');
      feedContent.innerHTML='';
      if(t==='Nearby') loadFeedForUsers([..._nearUsers.values()].map(u=>u.profile),feedContent);
      else loadFeedForUsers(loadContacts().map(c=>c.profile).filter(Boolean),feedContent);
    });
    subTabs.appendChild(tab);
  });
  el.appendChild(subTabs);
  const feedContent=document.createElement('div');feedContent.style.cssText='display:flex;flex-direction:column;gap:10px';
  el.appendChild(feedContent);
  // Charge Nearby par défaut
  loadFeedForUsers([..._nearUsers.values()].map(u=>u.profile),feedContent);
}

async function loadFeedForUsers(profiles,container){
  if(!profiles.length){
    container.innerHTML=`<div style="text-align:center;padding:24px;color:var(--text3);font-size:12px">No profiles with social networks yet</div>`;
    return;
  }
  container.innerHTML=`<div style="text-align:center;padding:12px;color:var(--text3);font-size:12px">Loading…</div>`;
  // Collecte tous les réseaux de tous les profils
  const allNetworks=[];
  profiles.forEach(p=>{
    (p.networks||[]).forEach(n=>{
      if(!allNetworks.find(x=>x.id===n.id&&x.handle===n.handle))
        allNetworks.push({...n,_owner:p.name||p.uuid?.slice(0,8)});
    });
  });
  if(!allNetworks.length){
    container.innerHTML=`<div style="text-align:center;padding:24px;color:var(--text3);font-size:12px">No public social networks found in these profiles</div>`;
    return;
  }
  try{
    const items=await fetchFeedItems(allNetworks);
    container.innerHTML='';
    if(!items.length){container.innerHTML=`<div style="text-align:center;padding:16px;color:var(--text3);font-size:12px">No posts found</div>`;return;}
    items.slice(0,30).forEach(item=>{
      const card=document.createElement('div');card.className='ym-card';card.style.cursor='pointer';
      card.innerHTML=`
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span class="pill">${item.network}</span>
          <span style="font-size:11px;color:var(--text2);font-weight:500">${item.author}</span>
          <span style="font-size:9px;color:var(--text3);margin-left:auto">${new Date(item.ts).toLocaleDateString()}</span>
        </div>
        <div style="font-size:12px;color:var(--text);line-height:1.5">${item.text.slice(0,200)}${item.text.length>200?'…':''}</div>
        ${item.image?`<img src="${item.image}" style="width:100%;border-radius:var(--r-sm);margin-top:8px;max-height:200px;object-fit:cover" loading="lazy">`:''}
      `;
      if(item.url) card.addEventListener('click',()=>window.open(item.url,'_blank'));
      container.appendChild(card);
    });
  }catch(e){container.innerHTML=`<div class="ym-notice error">Feed error: ${e.message}</div>`;}
}

// Stack de navigation interne — plus utilisée, gardée vide
const _panelHistory=[];

window.YM_Social = {
  openProfile(uuid){
    const near=_nearUsers.get(uuid);
    const contact=getContact(uuid);
    const profile=near?.profile||contact?.profile||{uuid,name:'Unknown'};
    if(!profile) return;
    // Utilise openProfilePanel qui gère le titre et le history
    if(window.YM?.openProfilePanel){
      window.YM.openProfilePanel(profile);
      // Render le profil dans le body après ouverture
      requestAnimationFrame(()=>{
        const body=document.getElementById('panel-sphere-body');
        if(body){body.innerHTML='';renderProfileView(body,profile);}
      });
    }
  }
};

function _showInternalBack(){}
function _hideInternalBack(){}

function renderProfileView(container,profile){
  const nets=(profile.networks||[]).map(n=>`<span class="pill">${n.id} ${n.handle}</span>`).join('');
  const spheres=(profile.spheres||[]).map(s=>`<span class="pill active">${s.replace('.sphere.js','')}</span>`).join('');
  const rawSite=profile.site||'';
  const siteUrl=rawSite&&!rawSite.startsWith('http')?'https://'+rawSite:rawSite;
  const isContact=!!getContact(profile.uuid);
  const contactBar=isContact
    ?`<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding:8px 12px;background:rgba(48,232,128,.08);border:1px solid rgba(48,232,128,.25);border-radius:var(--r-sm)"><span style="color:var(--green);font-size:12px;flex:1">✓ In contacts</span><button class="ym-btn ym-btn-danger" id="remove-contact-btn" style="padding:4px 10px;font-size:11px;min-height:unset">Remove</button></div>`
    :`<button class="ym-btn ym-btn-accent" id="add-contact-btn" style="width:100%;margin-bottom:12px">+ Add Contact</button>`;
  container.innerHTML=`
    ${contactBar}
    <div style="text-align:center;padding:12px 0">
      <div style="margin-bottom:8px">${profile.avatar?
        `<img src="${profile.avatar}" style="width:72px;height:72px;border-radius:50%;object-fit:cover">`:
        `<div style="width:72px;height:72px;border-radius:50%;background:var(--surface3);display:flex;align-items:center;justify-content:center;font-size:32px;margin:0 auto">${profile.name?.charAt(0)||'👤'}</div>`}</div>
      <div style="font-size:18px;font-weight:600;margin-bottom:4px">${profile.name||'Anonymous'}</div>
      ${profile.bio?`<div style="font-size:13px;color:var(--text2);max-width:280px;margin:0 auto">${profile.bio}</div>`:''}
      ${siteUrl?`<a href="${siteUrl}" target="_blank" rel="noopener noreferrer" style="font-size:11px;color:var(--cyan);display:block;margin-top:6px">${rawSite}</a>`:''}
    </div>
    ${nets?`<div class="ym-card"><div class="ym-card-title">Social Networks</div><div style="display:flex;flex-wrap:wrap;gap:4px">${nets}</div></div>`:''}
    ${spheres?`<div class="ym-card"><div class="ym-card-title">Active Spheres</div><div>${spheres}</div></div>`:''}
    ${profile.pubkey?`<div class="ym-card"><div class="ym-card-title">Wallet</div><div style="font-family:var(--font-m);font-size:9px;color:var(--text3);word-break:break-all">${profile.pubkey}</div></div>`:''}
  `;
  container.querySelector('#add-contact-btn')?.addEventListener('click',()=>{
    addContact(profile);window.YM_toast?.('Contact added','success');renderProfileView(container,profile);
  });
  container.querySelector('#remove-contact-btn')?.addEventListener('click',()=>{
    saveContacts(loadContacts().filter(x=>x.uuid!==profile.uuid));
    window.YM_toast?.('Contact removed','info');renderProfileView(container,profile);
  });
}

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

// ============================================================
// YOURMINE — SPHERE SCHEMA
// Référence formelle pour les développeurs de sphères
// ============================================================
// Une sphère est un plugin autonome chargé dynamiquement dans YourMine.
// Elle doit s'enregistrer dans window.YM_S avec la clé = nom du fichier.
//
// USAGE :
//   window.YM_S = window.YM_S || {};
//   window.YM_S['ma-sphere.sphere.js'] = { ...schéma ci-dessous... };
// ============================================================

/**
 * @typedef {Object} SphereDefinition
 *
 * ── IDENTIFICATION ────────────────────────────────────────────
 *
 * @property {string} name
 *   Nom affiché dans l'UI. Court, lisible.
 *   Exemple : 'Social', 'Mining', 'Weather'
 *
 * @property {string} icon
 *   Icône de la sphère sur le bureau.
 *   Peut être :
 *     - Un emoji          → '🌐'
 *     - Une URL absolue   → 'https://example.com/icon.png'
 *     - Un chemin relatif → '/icons/my-sphere.png'
 *   Si c'est une URL/chemin, YourMine affiche une <img>.
 *   Sinon il affiche l'emoji directement.
 *
 * @property {string} category
 *   Catégorie utilisée comme filtre dans la recherche de sphères.
 *   Valeurs suggérées (libres) :
 *     'Communication' | 'Finance' | 'Social' | 'Tools' |
 *     'Games' | 'Media' | 'Data' | 'Productivity'
 *
 * @property {string} description
 *   Description courte (1-2 phrases) utilisée dans la recherche
 *   et affichée dans la fiche de la sphère.
 *
 * @property {string} author
 *   Identifiant de l'auteur (ex: nom GitHub, UUID YourMine).
 *   Utilisé comme filtre dans la recherche.
 *
 * ── CONTRAT DE DONNÉES P2P ────────────────────────────────────
 * Déclare ce que la sphère lit et écrit dans le profil P2P.
 * Permet à YourMine de savoir quelles sphères sont compatibles
 * entre elles et d'afficher des suggestions de compatibilité.
 *
 * @property {string[]} emit
 *   Champs du profil que cette sphère publie aux autres pairs.
 *   Ces données sont envoyées via ctx.send() et visibles des
 *   sphères qui les déclarent en receive.
 *   Exemple : ['name', 'bio', 'avatar', 'lat', 'lng', 'networks']
 *
 * @property {string[]} receive
 *   Champs du profil que cette sphère consomme depuis les pairs.
 *   YourMine peut suggérer des sphères complémentaires basées
 *   sur ce tableau.
 *   Exemple : ['name', 'bio', 'avatar', 'spheres', 'networks']
 *
 * ── STATUTS UTILISATEUR ───────────────────────────────────────
 *
 * @property {string[]} [statuses]
 *   Statuts que cette sphère peut attribuer à l'utilisateur.
 *   Affichés dans le profil et diffusés aux pairs.
 *   Exemple : ['online', 'away', 'busy', 'mining', 'streaming']
 *   Optionnel — omettre si la sphère ne gère pas de statuts.
 *
 * ── CYCLE DE VIE ─────────────────────────────────────────────
 * Ces méthodes sont appelées par YourMine automatiquement.
 *
 * @property {function(SphereContext): Promise<void>} activate
 *   Appelée quand l'utilisateur active la sphère.
 *   C'est ici qu'on initialise les listeners, timers, connexions.
 *   Reçoit un ctx (voir SphereContext ci-dessous).
 *   DOIT être async ou retourner une Promise.
 *
 * @property {function(): void} deactivate
 *   Appelée quand l'utilisateur désactive la sphère.
 *   Nettoyer tous les timers, listeners, connexions WebRTC, etc.
 *   NE PAS laisser de fuites mémoire ici.
 *
 * ── RENDU ─────────────────────────────────────────────────────
 *
 * @property {function(HTMLElement): void} renderPanel
 *   Appelée quand l'utilisateur tape sur l'icône de la sphère.
 *   Reçoit un conteneur DOM vide — construire l'UI dedans.
 *   Utiliser les classes CSS YourMine : ym-card, ym-btn, ym-tabs,
 *   ym-input, ym-notice, ym-stat-row, pill, etc.
 *
 * @property {function(HTMLElement): void} [profileSection]
 *   Optionnel. Si présent, YourMine injecte cette section dans
 *   le panneau Profil → onglet de la sphère.
 *   Utiliser pour les réglages liés à l'identité de l'utilisateur.
 *
 * @property {function(): Object<string,number>} [getTabBadges]
 *   Optionnel. Retourne un objet {tabId: count} pour afficher
 *   des badges de notification sur les onglets du panel.
 *   Exemple : { Near: 3, Contacts: 0, Feed: 1 }
 */

/**
 * @typedef {Object} SphereContext
 * Objet ctx passé à activate(). Fournit l'API YourMine à la sphère.
 *
 * @property {function(string, any, string=): boolean} send
 *   Envoie un message P2P.
 *   send(type, data, peerId?)
 *   Sans peerId → broadcast à tous les pairs.
 *   Avec peerId → envoi direct à un pair spécifique.
 *   Retourne false si le rate-limit est atteint.
 *
 * @property {function(function(string, any, string): void): void} onReceive
 *   Enregistre un handler pour les messages P2P entrants.
 *   onReceive((type, data, peerId) => { ... })
 *
 * @property {function(): Object} loadProfile
 *   Retourne le profil courant de l'utilisateur.
 *   { uuid, name, bio, avatar, site, spheres, pubkey, ... }
 *
 * @property {function(Object): Object} saveProfile
 *   Sauvegarde des champs dans le profil utilisateur (merge).
 *   saveProfile({ name: 'Alice', bio: '...' })
 *
 * @property {function(number): void} setNotification
 *   Met à jour le badge de notification sur l'icône de la sphère.
 *   setNotification(0) → efface le badge.
 *   setNotification(5) → affiche "5".
 *
 * @property {function(string): void} updateFigureCount
 *   Met à jour le compteur affiché sur le bouton YM du dock.
 *   Réservé aux sphères qui gèrent un solde ou un score global.
 *
 * @property {function(string, string=): void} toast
 *   Affiche une notification toast.
 *   toast(message, type?)
 *   type : 'info' | 'success' | 'warn' | 'error'  (défaut: 'info')
 *
 * @property {function(HTMLElement): void} [openPanel]
 *   Ouvre le panel sphère avec un contenu personnalisé.
 *   Utile pour ouvrir le panel depuis un contexte externe.
 *
 * @property {function(HTMLElement, string, number): void} setTabBadge
 *   Met à jour un badge sur un onglet spécifique du panel.
 *   setTabBadge(container, tabId, count)
 */

// ── TEMPLATE MINIMAL ──────────────────────────────────────────────────────────
// Copier-coller ce template pour créer une nouvelle sphère.

/*

(function(){
'use strict';
window.YM_S = window.YM_S || {};

let _ctx = null;

window.YM_S['ma-sphere.sphere.js'] = {

  // ── Identification ──────────────────────────────────────────
  name:        'Ma Sphère',
  icon:        '⭐',              // emoji ou URL d'image
  category:    'Tools',           // filtre de recherche
  description: 'Ce que fait ma sphère en une phrase.',
  author:      'mon-identifiant',

  // ── Contrat de données P2P ──────────────────────────────────
  emit:    [],  // ex: ['name', 'lat', 'lng']
  receive: [],  // ex: ['name', 'spheres']

  // ── Statuts utilisateur ─────────────────────────────────────
  statuses: [], // ex: ['online', 'busy'] — omettre si inutile

  // ── Cycle de vie ────────────────────────────────────────────
  async activate(ctx){
    _ctx = ctx;
    // Initialiser ici : timers, listeners P2P, connexions...
    ctx.onReceive((type, data, peerId) => {
      // Traiter les messages P2P entrants
    });
  },

  deactivate(){
    // Nettoyer ici : clearInterval, fermer connexions...
    _ctx = null;
  },

  // ── Rendu ────────────────────────────────────────────────────
  renderPanel(container){
    // Construire l'UI dans container
    // Classes disponibles : ym-card, ym-btn-accent, ym-tabs, ym-input...
    container.innerHTML = `
      <div class="ym-card">
        <div class="ym-card-title">Ma Sphère</div>
        <p style="font-size:12px;color:var(--text2)">Contenu ici.</p>
        <button class="ym-btn ym-btn-accent" id="my-btn">Action</button>
      </div>
    `;
    container.querySelector('#my-btn').addEventListener('click', () => {
      _ctx?.toast('Hello!', 'success');
    });
  },

  // ── Optionnel ────────────────────────────────────────────────
  profileSection(container){
    // Réglages à injecter dans le panel Profil (optionnel)
  },

  getTabBadges(){
    return {}; // ex: { 'Tab1': 2 }
  }

};
})();

*/
