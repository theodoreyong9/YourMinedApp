// social.sphere.js — YourMine Social Sphere
(function(){
'use strict';
window.YM_S = window.YM_S || {};

const GOSSIP_TTL = 15 * 60 * 1000; // 15 minutes
const NEAR_RADIUS = 100; // metres
const FEED_INTERVAL = 5 * 60 * 1000; // 5 min refresh
const SOCIAL_KEY = 'ym_social_v1';
const CONTACTS_KEY = 'ym_contacts_v1';

// ── STATE ──────────────────────────────────────────────────────────────────
let _ctx = null;
let _nearUsers = new Map(); // uuid → {profile, ts, coords}
let _gossipCache = new Map(); // uuid → {profile, ts}
let _watchId = null;
let _myCoords = null;
let _callPeer = null; // uuid of active voice call
let _peerConnection = null;
let _feedTimer = null;

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
    broadcastPresence();
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

// ── P2P PRESENCE ────────────────────────────────────────────────────────────
function broadcastPresence(){
  if(!_ctx||!_myCoords) return;
  const p = _ctx.loadProfile?.()??{};
  _ctx.send('social:presence',{
    uuid:p.uuid, name:p.name, bio:p.bio, avatar:p.avatar,
    lat:_myCoords.lat, lng:_myCoords.lng,
    spheres:p.spheres||[], pubkey:p.pubkey
  });
}

function handlePresence(data, peerId){
  if(!data?.uuid) return;
  const ts=Date.now();
  const myProfile=_ctx?.loadProfile?.()??{};
  if(data.uuid===myProfile.uuid) return; // ignore self

  // Check if already a direct contact
  const isContact=!!getContact(data.uuid);

  if(_myCoords && data.lat && data.lng){
    const dist=haversine(_myCoords.lat,_myCoords.lng,data.lat,data.lng);
    if(dist<=NEAR_RADIUS){
      // Near user — put in near list and gossip cache
      _nearUsers.set(data.uuid,{profile:data,ts,peerId});
      _gossipCache.set(data.uuid,{profile:data,ts});
      if(_ctx) _ctx.setNotification?.(_nearUsers.size);
      refreshNearUI?.();
      // Check reciprocal contact for call button
      checkReciprocal(data.uuid);
      return;
    }
  }
  // Not in range — check if it's a gossip (already in cache, uuid not near)
  if(!_nearUsers.has(data.uuid)&&!isContact){
    const existing=_gossipCache.get(data.uuid);
    if(existing) return; // already have gossip from this uuid, skip (per spec)
    _gossipCache.set(data.uuid,{profile:data,ts});
  }
}

// Expire gossip
function cleanGossip(){
  const now=Date.now();
  for(const[uuid,entry] of _gossipCache){
    if(now-entry.ts>GOSSIP_TTL) _gossipCache.delete(uuid);
  }
  for(const[uuid,entry] of _nearUsers){
    if(now-entry.ts>30000) _nearUsers.delete(uuid); // 30s timeout for near
  }
}

// Check if contact is reciprocal (both have added each other)
function checkReciprocal(uuid){
  const myContacts=loadContacts();
  const theyHaveMe=_nearUsers.get(uuid)?.profile?.contacts?.includes?.(_ctx?.loadProfile?.()?.uuid);
  const weHaveThem=!!myContacts.find(c=>c.uuid===uuid);
  if(weHaveThem&&theyHaveMe) showCallButton(uuid);
}

let _refreshNear=null;
function refreshNearUI(){ _refreshNear?.(); }

// ── VOICE CALLS ──────────────────────────────────────────────────────────────
function showCallButton(uuid){
  // Will be rendered in the contacts tab
}

async function startVoiceCall(peerId){
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
    _peerConnection=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
    stream.getTracks().forEach(t=>_peerConnection.addTrack(t,stream));
    _peerConnection.ontrack=e=>{
      const audio=document.createElement('audio');
      audio.srcObject=e.streams[0];audio.autoplay=true;
      document.body.appendChild(audio);
    };
    _peerConnection.onicecandidate=e=>{
      if(e.candidate) _ctx?.send('social:ice',{candidate:e.candidate,to:peerId});
    };
    const offer=await _peerConnection.createOffer();
    await _peerConnection.setLocalDescription(offer);
    _ctx?.send('social:call-offer',{sdp:offer.sdp,to:peerId});
    _callPeer=peerId;
    window.YM_toast?.('📞 Calling…','info');
  }catch(e){ window.YM_toast?.('Call failed: '+e.message,'error'); }
}

async function handleCallOffer(data){
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    _peerConnection=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
    stream.getTracks().forEach(t=>_peerConnection.addTrack(t,stream));
    _peerConnection.ontrack=e=>{
      const audio=document.createElement('audio');audio.srcObject=e.streams[0];audio.autoplay=true;document.body.appendChild(audio);
    };
    _peerConnection.onicecandidate=e=>{
      if(e.candidate) _ctx?.send('social:ice',{candidate:e.candidate,to:data.from});
    };
    await _peerConnection.setRemoteDescription({type:'offer',sdp:data.sdp});
    const answer=await _peerConnection.createAnswer();
    await _peerConnection.setLocalDescription(answer);
    _ctx?.send('social:call-answer',{sdp:answer.sdp,to:data.from});
    _callPeer=data.from;
    window.YM_toast?.('📞 Call connected','success');
  }catch(e){ window.YM_toast?.('Incoming call error: '+e.message,'error'); }
}

function hangUp(){
  if(_peerConnection){_peerConnection.close();_peerConnection=null;}
  if(_callPeer){_ctx?.send('social:call-end',{to:_callPeer});_callPeer=null;}
  window.YM_toast?.('Call ended','info');
}

// ── QR ────────────────────────────────────────────────────────────────────────
function generateQR(uuid, container){
  if(!window.QRCode) return;
  container.innerHTML='';
  new window.QRCode(container,{text:'yourmine://contact/'+uuid,width:120,height:120,correctLevel:QRCode.CorrectLevel.M});
}

// ── FEED ────────────────────────────────────────────────────────────────────
const SOCIAL_NETWORKS = [
  {id:'mastodon', label:'Mastodon', hint:'@username@instance.social', pkce:false, endpoint:'mastodon'},
  {id:'reddit',   label:'Reddit', hint:'u/username', pkce:true, endpoint:'reddit'},
  {id:'bluesky',  label:'Bluesky / AT Proto', hint:'@handle.bsky.social', pkce:false, endpoint:'bsky'},
  {id:'x',        label:'X / Twitter', hint:'@username', pkce:true, endpoint:'twitter'},
  {id:'linkedin', label:'LinkedIn', hint:'linkedin.com/in/handle', pkce:true, endpoint:'linkedin'},
  {id:'github',   label:'GitHub', hint:'@username', pkce:true, endpoint:'github'},
  {id:'instagram',label:'Instagram', hint:'@username', pkce:true, endpoint:'instagram'},
  {id:'facebook', label:'Facebook', hint:'@username', pkce:true, endpoint:'facebook'},
  {id:'threads',  label:'Threads', hint:'@username', pkce:true, endpoint:'threads'},
  {id:'tumblr',   label:'Tumblr', hint:'@username', pkce:true, endpoint:'tumblr'},
  {id:'youtube',  label:'YouTube', hint:'@channel', pkce:true, endpoint:'youtube'},
];

async function fetchFeedItems(networks){
  // For networks with public APIs (Mastodon, Bluesky, GitHub)
  const items=[];
  for(const n of networks){
    try{
      if(n.id==='mastodon'&&n.handle){
        const [user,instance]=n.handle.replace('@','').split('@');
        if(instance){
          const r=await fetch(`https://${instance}/api/v1/accounts/lookup?acct=${user}`);
          const acc=await r.json();
          const posts=await (await fetch(`https://${instance}/api/v1/accounts/${acc.id}/statuses?limit=5`)).json();
          posts.forEach(p=>items.push({network:'Mastodon',author:acc.display_name||acc.username,text:p.content.replace(/<[^>]+>/g,''),ts:new Date(p.created_at).getTime(),url:p.url}));
        }
      }
      if(n.id==='bluesky'&&n.handle){
        const handle=n.handle.replace('@','');
        const r=await fetch(`https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${handle}&limit=5`);
        const data=await r.json();
        (data.feed||[]).forEach(f=>{
          const post=f.post?.record;
          if(post?.text) items.push({network:'Bluesky',author:handle,text:post.text,ts:new Date(post.createdAt).getTime(),url:`https://bsky.app/profile/${handle}`});
        });
      }
      if(n.id==='github'&&n.handle){
        const user=n.handle.replace('@','');
        const r=await fetch(`https://api.github.com/users/${user}/events/public?per_page=5`);
        const events=await r.json();
        events.filter(e=>e.type==='PushEvent').forEach(e=>{
          const msg=e.payload?.commits?.[0]?.message||'pushed';
          items.push({network:'GitHub',author:user,text:msg,ts:new Date(e.created_at).getTime(),url:`https://github.com/${user}`});
        });
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
  emit:['name','bio','avatar','site','lat','lng'],
  receive:['name','bio','avatar','site','spheres'],
  statuses:['online','away','busy'],

  async activate(ctx){
    _ctx=ctx;
    startGeo();
    ctx.onReceive((type,data,peerId)=>{
      if(type==='social:presence') handlePresence(data,peerId);
      else if(type==='social:call-offer') handleCallOffer({...data,from:peerId});
      else if(type==='social:call-answer' && _peerConnection) _peerConnection.setRemoteDescription({type:'answer',sdp:data.sdp});
      else if(type==='social:ice' && _peerConnection) _peerConnection.addIceCandidate(data.candidate).catch(()=>{});
      else if(type==='social:call-end') { if(_callPeer===peerId){hangUp();} }
      else if(type==='social:code-request'){
        // Someone wants the code of a test sphere
        ctx.send('social:code-response',{sphereName:data.sphereName,code:localStorage.getItem('ym_build_code')||''},peerId);
      }
    });
    // Periodic gossip cleanup
    setInterval(cleanGossip, 60000);
    // Profile tab addition is handled if profile panel is open
    window.addEventListener('ym:profile-updated',()=>{ /* re-render social section */ });
    // Broadcast immediately if we have location
    if(_myCoords) broadcastPresence();
    // Add profile section header button for social

  },

  deactivate(){
    stopGeo();
    clearInterval(_feedTimer);
    if(_peerConnection){_peerConnection.close();_peerConnection=null;}
    _nearUsers.clear();_gossipCache.clear();
    _ctx=null;
  },

  renderPanel(container){
    container.innerHTML='';
    const tabs=document.createElement('div');tabs.className='ym-tabs';
    ['Near','Contacts','Feed'].forEach((t,i)=>{
      const tab=document.createElement('div');
      tab.className='ym-tab'+(i===0?' active':'');
      tab.dataset.tab=t;tab.textContent=t;
      tab.addEventListener('click',()=>{
        container.querySelectorAll('.ym-tab').forEach(x=>x.classList.remove('active'));
        tab.classList.add('active');
        renderSocialTab(container,t);
      });
      tabs.appendChild(tab);
    });
    container.appendChild(tabs);
    const content=document.createElement('div');content.id='social-tab-content';
    container.appendChild(content);
    renderSocialTab(container,'Near');
  },

  getBroadcastData(){
    const p=_ctx?.loadProfile?.()??{};
    return p.uuid?{type:'social:presence',uuid:p.uuid,name:p.name,bio:p.bio,avatar:p.avatar,spheres:p.spheres}:null;
  },

  // Called from Profile panel Spheres tab — renders social identity fields
  profileSection(container){
    const state = loadState();
    const networks = state.networks || [];
    const prof = _ctx?.loadProfile?.() ?? {};
    // --- Identity fields ---
    const ident = document.createElement('div');
    ident.innerHTML =
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">'
      + '<div id="soc-pav" style="width:64px;height:64px;border-radius:50%;background:var(--surface3);border:2px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:28px;cursor:pointer;overflow:hidden;flex-shrink:0">'
      + (prof.avatar ? '<img src="'+prof.avatar+'" style="width:100%;height:100%;object-fit:cover">' : '&#128100;')
      + '</div>'
      + '<div style="flex:1;display:flex;flex-direction:column;gap:6px">'
      + '<input class="ym-input" id="soc-name" placeholder="Display name" value="'+(prof.name||'')+'" style="font-size:12px">'
      + '<input class="ym-input" id="soc-site" placeholder="Website" value="'+(prof.site||'')+'" style="font-size:12px">'
      + '</div></div>'
      + '<textarea class="ym-input" id="soc-bio" placeholder="Short bio" style="height:52px;font-size:12px;margin-bottom:8px">'+(prof.bio||'')+'</textarea>'
      + '<button class="ym-btn ym-btn-accent" id="soc-save" style="width:100%;margin-bottom:14px">Save identity</button>';
    container.appendChild(ident);
    ident.querySelector('#soc-pav').addEventListener('click', () => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
      inp.onchange = () => { const r = new FileReader(); r.onload = e => { _ctx?.saveProfile?.({avatar:e.target.result}); ident.querySelector('#soc-pav').innerHTML = '<img src="'+e.target.result+'" style="width:100%;height:100%;object-fit:cover">'; }; r.readAsDataURL(inp.files[0]); };
      inp.click();
    });
    ident.querySelector('#soc-save').addEventListener('click', () => {
      _ctx?.saveProfile?.({
        name: ident.querySelector('#soc-name').value,
        bio:  ident.querySelector('#soc-bio').value,
        site: ident.querySelector('#soc-site').value,
      });
      window.YM_toast?.('Social profile saved', 'success');
    });
    // --- Social networks ---
    const netTitle = document.createElement('div');
    netTitle.style.cssText = 'font-family:var(--font-d,monospace);font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text3);margin-bottom:8px';
    netTitle.textContent = 'Social Networks';
    container.appendChild(netTitle);
    SOCIAL_NETWORKS.forEach(n => {
      const saved = networks.find(x => x.id === n.id) || {};
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:7px';
      const lbl = document.createElement('div');
      lbl.style.cssText = 'width:76px;font-size:10px;color:var(--text2);flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      lbl.textContent = n.label;
      const inp = document.createElement('input');
      inp.className = 'ym-input'; inp.placeholder = n.hint; inp.value = saved.handle || '';
      inp.style.cssText = 'flex:1;font-size:11px'; inp.dataset.networkId = n.id;
      inp.addEventListener('change', () => {
        const cur = loadState().networks || [];
        const idx = cur.findIndex(x => x.id === n.id);
        if (inp.value.trim()) {
          if (idx >= 0) cur[idx].handle = inp.value.trim(); else cur.push({id:n.id, handle:inp.value.trim()});
        } else { if (idx >= 0) cur.splice(idx, 1); }
        saveState({networks: cur});
      });
      row.appendChild(lbl); row.appendChild(inp); container.appendChild(row);
    });
  },

  // Tab badge counts for notification indicators
  getTabBadges(){
    return {
      Near: _nearUsers.size,
      Contacts: 0,
      Feed: 0
    };
  }
};

function renderSocialTab(container,tab){
  const content=container.querySelector('#social-tab-content');
  if(!content) return;
  content.innerHTML='';
  if(tab==='Near') renderNearTab(content);
  else if(tab==='Contacts') renderContactsTab(content);
  else if(tab==='Feed') renderFeedTab(content);
}

// ── NEAR TAB ──────────────────────────────────────────────────────────────────
function renderNearTab(el){
  cleanGossip();
  const near=[..._nearUsers.values()];
  const myUUID=_ctx?.loadProfile?.()?.uuid;

  el.innerHTML=`
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
      <div style="font-size:10px;color:var(--text3)">Within ${NEAR_RADIUS}m</div>
      <div style="margin-left:auto;font-size:10px;color:var(--${_myCoords?'green':'red'}})">${_myCoords?'📍 '+_myCoords.lat.toFixed(4):'📍 No location'}</div>
    </div>
  `;

  if(!near.length){
    el.innerHTML+=`<div style="text-align:center;padding:32px 0;color:var(--text3);font-size:12px">No one nearby right now…<br><span style="font-size:10px">Move around or share your link</span></div>`;
  } else {
    near.forEach(u=>{
      el.appendChild(userCard(u.profile,'near',()=>{
        addContact(u.profile);
        window.YM_toast?.('Contact added','success');
        renderNearTab(el);
      }));
    });
  }

  // QR share section
  const qrSection=document.createElement('div');
  qrSection.className='ym-card';
  qrSection.style.marginTop='12px';
  qrSection.innerHTML=`<div class="ym-card-title">Share your profile</div><div id="social-qr" style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:8px"></div>
    <div style="font-family:var(--font-mono);font-size:9px;color:var(--text3);text-align:center;word-break:break-all">${myUUID||''}</div>
    <button class="ym-btn ym-btn-ghost" id="social-copy-uuid" style="width:100%;margin-top:8px;font-size:11px">⧉ Copy UUID</button>`;
  el.appendChild(qrSection);
  if(myUUID){
    const qrEl=el.querySelector('#social-qr');
    if(window.QRCode) generateQR(myUUID,qrEl);
    el.querySelector('#social-copy-uuid')?.addEventListener('click',()=>{
      navigator.clipboard?.writeText(myUUID);window.YM_toast?.('UUID copied','success');
    });
  }

  // Add by UUID / QR
  const addSection=document.createElement('div');
  addSection.className='ym-card';addSection.style.marginTop='10px';
  addSection.innerHTML=`<div class="ym-card-title">Add contact by UUID</div>
    <div style="display:flex;gap:8px">
      <input class="ym-input" id="add-uuid-input" placeholder="UUID…" style="flex:1">
      <button class="ym-btn ym-btn-accent" id="add-uuid-btn">Add</button>
    </div>`;
  el.appendChild(addSection);
  el.querySelector('#add-uuid-btn')?.addEventListener('click',()=>{
    const uuid=el.querySelector('#add-uuid-input')?.value?.trim();
    if(!uuid){window.YM_toast?.('Enter a UUID','error');return}
    addContact({uuid,name:'Unknown',addedVia:'uuid'});
    window.YM_toast?.('Contact added','success');
    el.querySelector('#add-uuid-input').value='';
  });
  _refreshNear=()=>renderNearTab(el);
}

// ── CONTACTS TAB ──────────────────────────────────────────────────────────────
function renderContactsTab(el){
  const contacts=loadContacts();
  el.innerHTML=`<input class="ym-input" id="contacts-search" placeholder="Search contacts…" style="margin-bottom:10px">`;
  const listEl=document.createElement('div');listEl.id='contacts-list';el.appendChild(listEl);

  function renderFiltered(q=''){
    const filtered=contacts.filter(c=>{
      const n=(c.nickname||c.profile?.name||c.uuid).toLowerCase();
      return !q||n.includes(q.toLowerCase());
    });
    listEl.innerHTML='';
    if(!filtered.length){listEl.innerHTML=`<div style="color:var(--text3);font-size:12px;padding:8px">No contacts yet</div>`;return}
    filtered.forEach(c=>{
      const card=userCard(c.profile||{uuid:c.uuid,name:c.nickname||c.name||'Unknown'},'contact',null);
      // Nickname edit
      const nickInput=document.createElement('input');
      nickInput.className='ym-input';nickInput.style.cssText='margin-top:8px;font-size:11px';
      nickInput.placeholder='Set nickname…';nickInput.value=c.nickname||'';
      nickInput.addEventListener('change',()=>{ updateNickname(c.uuid,nickInput.value);window.YM_toast?.('Nickname saved','success'); });
      card.appendChild(nickInput);
      // Voice call button if near and reciprocal
      const nearEntry=_nearUsers.get(c.uuid);
      if(nearEntry){
        const callBtn=document.createElement('button');
        callBtn.className='ym-btn ym-btn-cyan';callBtn.style.cssText='width:100%;margin-top:8px;font-size:12px';
        callBtn.textContent='📞 Voice Call';
        callBtn.addEventListener('click',()=>startVoiceCall(nearEntry.peerId));
        card.appendChild(callBtn);
      }
      // Remove contact
      const delBtn=document.createElement('button');
      delBtn.className='ym-btn ym-btn-danger';delBtn.style.cssText='width:100%;margin-top:6px;font-size:11px';
      delBtn.textContent='Remove';
      delBtn.addEventListener('click',()=>{
        const all=loadContacts().filter(x=>x.uuid!==c.uuid);saveContacts(all);renderContactsTab(el);
      });
      card.appendChild(delBtn);
      listEl.appendChild(card);
    });
  }
  renderFiltered();
  el.querySelector('#contacts-search')?.addEventListener('input',e=>renderFiltered(e.target.value));
}

// ── FEED TAB ──────────────────────────────────────────────────────────────────
function renderFeedTab(el){
  const state=loadState();
  const networks=state.networks||[];
  el.innerHTML='';
  const hint=document.createElement('div');
  hint.style.cssText='font-size:11px;color:var(--text3);padding:4px 0 10px;text-align:center';
  hint.textContent='Configure your social networks in Profile → Spheres tab';
  el.appendChild(hint);
  const items=document.createElement('div');items.id='feed-items';items.style.cssText='display:flex;flex-direction:column;gap:10px';
  if(networks.length){items.innerHTML='<div style="color:var(--text3);font-size:12px;text-align:center;padding:12px">Loading…</div>';el.appendChild(items);loadAndRenderFeed(items,networks);}
  else{items.innerHTML='<div style="color:var(--text3);font-size:12px;text-align:center;padding:24px">No social networks configured yet.</div>';el.appendChild(items);}
}

async function loadAndRenderFeed(container,networks){
  container.innerHTML=`<div style="color:var(--text3);font-size:12px;text-align:center;padding:16px">Loading…</div>`;
  try{
    const items=await fetchFeedItems(networks);
    container.innerHTML='';
    if(!items.length){container.innerHTML=`<div style="color:var(--text3);font-size:12px;text-align:center;padding:16px">No posts found.<br>Check your handles are correct.</div>`;return}
    items.slice(0,20).forEach(item=>{
      const card=document.createElement('div');
      card.className='ym-card';
      card.style.cursor='pointer';
      card.innerHTML=`
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span class="pill">${item.network}</span>
          <span style="font-size:11px;color:var(--text2);font-weight:500">${item.author}</span>
          <span style="font-size:9px;color:var(--text3);margin-left:auto">${new Date(item.ts).toLocaleDateString()}</span>
        </div>
        <div style="font-size:12px;color:var(--text);line-height:1.5">${item.text.slice(0,200)}${item.text.length>200?'…':''}</div>
      `;
      if(item.url) card.addEventListener('click',()=>window.open(item.url,'_blank'));
      container.appendChild(card);
    });
  }catch(e){container.innerHTML=`<div class="ym-notice error">Feed error: ${e.message}</div>`;}
}

// ── PROFILE VISITOR ──────────────────────────────────────────────────────────
// Expose for index.html to open a profile by uuid
window.YM_Social = {
  openProfile(uuid){
    const near=_nearUsers.get(uuid);
    const contact=getContact(uuid);
    const profile=near?.profile||contact?.profile||{uuid,name:'Unknown'};
    const body=document.getElementById('panel-sphere-body');
    if(!body) return;
    document.getElementById('sphere-panel-title').textContent=profile.name||uuid.slice(0,8)+'…';
    renderProfileView(body,profile);
    window.YM?.openPanel?.('panel-sphere');
  }
};

function renderProfileView(container, profile){
  const activeSpheresHTML=(profile.spheres||[]).map(s=>`<span class="pill active">${s.replace('.sphere.js','')}</span>`).join('');
  container.innerHTML=`
    <div style="text-align:center;padding:20px 0 12px">
      <div style="font-size:56px;margin-bottom:8px">${profile.avatar?`<img src="${profile.avatar}" style="width:72px;height:72px;border-radius:50%;object-fit:cover">`:profile.name?profile.name.charAt(0).toUpperCase():'👤'}</div>
      <div style="font-size:18px;font-weight:600;margin-bottom:4px">${profile.name||'Anonymous'}</div>
      ${profile.bio?`<div style="font-size:13px;color:var(--text2);max-width:280px;margin:0 auto">${profile.bio}</div>`:''}
      ${profile.site?`<a href="${profile.site}" target="_blank" style="font-size:11px;color:var(--cyan);display:block;margin-top:4px">${profile.site}</a>`:''}
    </div>
    <div class="ym-card">
      <div class="ym-card-title">UUID</div>
      <div style="font-family:var(--font-mono);font-size:9px;word-break:break-all;color:var(--text3)">${profile.uuid}</div>
    </div>
    ${activeSpheresHTML?`<div class="ym-card"><div class="ym-card-title">Active Spheres</div><div>${activeSpheresHTML}</div></div>`:''}
    ${profile.pubkey?`<div class="ym-card"><div class="ym-card-title">Wallet</div><div style="font-family:var(--font-mono);font-size:9px;color:var(--text3)">${profile.pubkey}</div></div>`:''}
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="ym-btn ym-btn-accent" id="add-contact-btn" style="flex:1">Add to Contacts</button>
    </div>
    ${(profile.spheres||[]).length?`
    <div class="ym-card" style="margin-top:12px">
      <div class="ym-card-title">Try their spheres</div>
      ${(profile.spheres||[]).map(s=>`<button class="ym-btn ym-btn-ghost" style="width:100%;margin-bottom:6px;font-size:11px" onclick="window.YM_Liste?.activateSphereByName?.('${s}')">Activate ${s.replace('.sphere.js','')}</button>`).join('')}
    </div>`:''}
  `;
  container.querySelector('#add-contact-btn')?.addEventListener('click',()=>{
    addContact(profile);window.YM_toast?.('Contact added','success');
  });
}

// ── USER CARD HELPER ──────────────────────────────────────────────────────────
function userCard(profile,type,onAdd){
  const card=document.createElement('div');
  card.className='ym-card';card.style.cursor='pointer';
  const isContact=!!getContact(profile.uuid);
  card.innerHTML=`
    <div style="display:flex;align-items:center;gap:12px">
      <div style="font-size:28px;flex-shrink:0">${profile.avatar?`<img src="${profile.avatar}" style="width:36px;height:36px;border-radius:50%;object-fit:cover">`:profile.name?.charAt(0)||'👤'}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:13px">${profile.name||'Anonymous'}</div>
        ${profile.bio?`<div style="font-size:11px;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${profile.bio}</div>`:''}
        <div style="font-size:9px;font-family:var(--font-mono);color:var(--text3)">${profile.uuid?.slice(0,8)||''}…</div>
      </div>
      ${type==='near'?'<span class="pill active">near</span>':''}
    </div>
    ${onAdd&&!isContact?`<button class="ym-btn ym-btn-ghost" style="width:100%;margin-top:8px;font-size:11px" data-add>+ Add Contact</button>`:''}
  `;
  card.querySelector('[data-add]')?.addEventListener('click',e=>{e.stopPropagation();onAdd?.()});
  card.addEventListener('click',()=>window.YM_Social?.openProfile?.(profile.uuid));
  return card;
}

})();
