// social.sphere.js — YourMine Social Sphere
(function(){
'use strict';
window.YM_S=window.YM_S||{};

// PKCE-capable social networks with text/photo/video content
const SOCIAL_NETWORKS=[
  {id:'twitter',    name:'X / Twitter',   icon:'𝕏', handleLabel:'Username',  handleHint:'e.g. elonmusk (no @)',       url:h=>`https://x.com/${h}`,          pkce:true,  content:['text','photo','video']},
  {id:'instagram',  name:'Instagram',     icon:'📸', handleLabel:'Username',  handleHint:'e.g. natgeo',                url:h=>`https://instagram.com/${h}`,  pkce:true,  content:['photo','video']},
  {id:'youtube',    name:'YouTube',       icon:'▶',  handleLabel:'@handle',   handleHint:'e.g. @mkbhd',               url:h=>`https://youtube.com/@${h.replace('@','')}`,pkce:true,content:['video']},
  {id:'tiktok',     name:'TikTok',        icon:'♪',  handleLabel:'Username',  handleHint:'e.g. charlidamelio',         url:h=>`https://tiktok.com/@${h}`,    pkce:true,  content:['video']},
  {id:'linkedin',   name:'LinkedIn',      icon:'in', handleLabel:'Profile ID',handleHint:'e.g. in/satyanadella',       url:h=>`https://linkedin.com/in/${h}`,pkce:true,  content:['text','photo']},
  {id:'github',     name:'GitHub',        icon:'⬡',  handleLabel:'Username',  handleHint:'e.g. torvalds',              url:h=>`https://github.com/${h}`,     pkce:true,  content:['text']},
  {id:'twitch',     name:'Twitch',        icon:'🎮', handleLabel:'Username',  handleHint:'e.g. ninja',                 url:h=>`https://twitch.tv/${h}`,      pkce:true,  content:['video']},
  {id:'reddit',     name:'Reddit',        icon:'🟠', handleLabel:'u/ username',handleHint:'e.g. spez (no u/)',         url:h=>`https://reddit.com/user/${h}`,pkce:true,  content:['text','photo','video']},
  {id:'mastodon',   name:'Mastodon',      icon:'🐘', handleLabel:'user@instance',handleHint:'e.g. user@mastodon.social',url:h=>{const[u,i]=h.includes('@')?h.split('@'):[h,'mastodon.social'];return`https://${i}/@${u}`},pkce:true,content:['text','photo']},
  {id:'bluesky',    name:'Bluesky',       icon:'🦋', handleLabel:'Handle',    handleHint:'e.g. jay.bsky.social',       url:h=>`https://bsky.app/profile/${h}`,pkce:true, content:['text','photo','video']},
  {id:'farcaster',  name:'Farcaster',     icon:'🟣', handleLabel:'Username',  handleHint:'e.g. dwr (no @)',            url:h=>`https://warpcast.com/${h}`,   pkce:false, content:['text','photo']},
  {id:'lens',       name:'Lens Protocol', icon:'🌿', handleLabel:'Handle',    handleHint:'e.g. stani.lens',            url:h=>`https://hey.xyz/u/${h.replace('.lens','')}`,pkce:false,content:['text','photo','video']},
  {id:'snapchat',   name:'Snapchat',      icon:'👻', handleLabel:'Username',  handleHint:'e.g. djkhaled',              url:h=>`https://snapchat.com/add/${h}`,pkce:false,content:['photo','video']},
  {id:'pinterest',  name:'Pinterest',     icon:'📌', handleLabel:'Username',  handleHint:'e.g. chloemoretz',           url:h=>`https://pinterest.com/${h}`,  pkce:true,  content:['photo']},
  {id:'spotify',    name:'Spotify',       icon:'🎵', handleLabel:'User ID',   handleHint:'from profile URL /user/{id}',url:h=>`https://open.spotify.com/user/${h}`,pkce:true,content:['text']},
];

let peers={};    // peerId → {uuid,lat,lng,handle,ts}
let _ctx=null;
let _room=null;

window.YM_S['social.sphere.js']={
  name:'Social',icon:'◉',category:'social',
  author:'theodoreyong9',
  description:'P2P geolocation social — discover nearby people',

  async activate(ctx){
    _ctx=ctx;
    ctx.addPill('◉ Social',body=>renderSocial(body));
    ctx.addProfileTab('Social',renderProfileTab);
    ctx.addFigureTab('Near',renderFigureTab,0);
    // Receive P2P data from other social spheres
    ctx.p2p.onReceive((data,peerId)=>{
      if(!data||typeof data!=='object')return;
      peers[peerId]={...data,ts:Date.now()};
      _pruneOld();ctx.updateFigureCount(Object.keys(peers).length);
      _refreshNearList();
    });
    // Broadcast own position every 8s only if we have a position
    setInterval(()=>{
      if(!_myPos)return;
      const profile=ctx.getProfile();
      ctx.p2p.send({type:'social',uuid:profile.uuid,handle:profile.displayName||'Anon',lat:_myPos.lat,lng:_myPos.lng,networks:(profile.socialNetworks||[]).filter(n=>n.handle).map(n=>({n:n.network,h:n.handle}))});
    },8000);
  },

  deactivate(){peers={};_room=null},
  getBroadcastData(){return null}, // handled above
};

let _myPos=null;
let _nearBody=null;

function _pruneOld(){const now=Date.now();for(const id of Object.keys(peers)){if(now-peers[id].ts>60000)delete peers[id]}}
function _refreshNearList(){if(_nearBody)renderNearInto(_nearBody)}

function renderSocial(body){
  body.innerHTML=`<div style="padding:16px;display:flex;flex-direction:column;gap:10px">
    <div class="ym-panel">
      <div class="ym-panel-title">Nearby</div>
      <div id="soc-geo-status" class="ym-notice info" style="font-size:11px">Tap to enable location</div>
      <button class="ym-btn ym-btn-accent" id="soc-locate-btn" style="width:100%;margin-top:10px">📍 Enable Location</button>
    </div>
    <div id="soc-near-wrap" style="display:none">
      <div class="ym-panel">
        <div class="ym-panel-title">Near Me — <span id="soc-near-count">0</span> peers</div>
        <div id="soc-near-list" style="display:flex;flex-direction:column;gap:6px"></div>
      </div>
    </div>
  </div>`;
  _nearBody=body.querySelector('#soc-near-list');
  body.querySelector('#soc-locate-btn')?.addEventListener('click',()=>requestGeo(body));
  if(_myPos)_showGeoActive(body);
}

function requestGeo(body){
  if(!navigator.geolocation){body.querySelector('#soc-geo-status').textContent='Geolocation not supported';return}
  navigator.geolocation.getCurrentPosition(pos=>{
    _myPos={lat:pos.coords.latitude,lng:pos.coords.longitude};
    _showGeoActive(body);
  },err=>{
    body.querySelector('#soc-geo-status').textContent='Location denied — '+err.message;
  },{enableHighAccuracy:true,timeout:8000});
}

function _showGeoActive(body){
  const status=body.querySelector('#soc-geo-status');
  if(status){status.textContent=`📍 ${_myPos.lat.toFixed(4)}, ${_myPos.lng.toFixed(4)}`;status.className='ym-notice success'}
  const btn=body.querySelector('#soc-locate-btn');if(btn)btn.style.display='none';
  const wrap=body.querySelector('#soc-near-wrap');if(wrap)wrap.style.display='';
  renderNearInto(body.querySelector('#soc-near-list'));
}

function renderNearInto(el){
  if(!el)return;
  const cnt=Object.keys(peers).length;
  const countEl=document.getElementById('soc-near-count');if(countEl)countEl.textContent=cnt;
  if(cnt===0){el.innerHTML='<div style="color:var(--text3);font-size:11px;padding:8px 0">No peers nearby yet. Both devices must have Social active.</div>';return}
  el.innerHTML=Object.entries(peers).map(([id,p])=>{
    const dist=_myPos&&p.lat&&p.lng?_haversine(_myPos.lat,_myPos.lng,p.lat,p.lng):null;
    const nets=(p.networks||[]).map(n=>`<span class="ym-chip" style="font-size:9px">${n.n}</span>`).join('');
    return `<div class="ym-list-item" style="flex-direction:column;align-items:flex-start;gap:6px">
      <div style="display:flex;align-items:center;gap:10px;width:100%">
        <div class="li-icon">◉</div>
        <div class="li-body">
          <div class="li-name">${p.handle||'Anon'}</div>
          <div class="li-sub">${p.uuid?p.uuid.slice(0,8)+'…':''}${dist!==null?' · '+_fmtDist(dist):''}</div>
        </div>
      </div>
      ${nets?`<div style="display:flex;gap:4px;flex-wrap:wrap;padding-left:42px">${nets}</div>`:''}
    </div>`;
  }).join('');
}

function _haversine(lat1,lng1,lat2,lng2){const R=6371000,dLat=(lat2-lat1)*Math.PI/180,dLng=(lng2-lng1)*Math.PI/180,a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))}
function _fmtDist(m){return m<1000?Math.round(m)+'m':(m/1000).toFixed(1)+'km'}

function renderFigureTab(el){
  el.innerHTML=`<div style="padding:20px">
    <div class="ym-panel">
      <div class="ym-panel-title">Nearby Peers</div>
      <div id="fig-soc-count" style="font-family:var(--font-display);font-size:2rem;font-weight:900;color:var(--accent)">${Object.keys(peers).length}</div>
      <div style="font-size:10px;color:var(--text3);margin-top:4px">P2P peers with Social active</div>
    </div>
  </div>`;
}

// ── PROFILE TAB — social networks ─────────────────────────
function renderProfileTab(el){
  const profile=_ctx?.getProfile()||{};
  const saved=profile.socialNetworks||[];

  el.innerHTML=`<div style="padding:16px;display:flex;flex-direction:column;gap:12px">
    <div class="ym-panel">
      <div class="ym-panel-title">Display Info</div>
      <label style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:4px">Display Name</label>
      <input class="ym-input" id="soc-name" value="${profile.displayName||''}" placeholder="Your name or handle" style="margin-bottom:10px"/>
      <label style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:4px">Bio</label>
      <textarea class="ym-input" id="soc-bio" style="resize:vertical;min-height:60px;font-size:12px">${profile.bio||''}</textarea>
      <label style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:4px;margin-top:10px">Avatar Emoji</label>
      <input class="ym-input" id="soc-emoji" value="${profile.avatarEmoji||''}" placeholder="e.g. 🦊" maxlength="4" style="width:80px"/>
    </div>
    <div class="ym-panel">
      <div class="ym-panel-title">Social Networks</div>
      <p style="font-size:10px;color:var(--text3);margin-bottom:12px;line-height:1.6">Add your accounts. PKCE-enabled networks can authenticate directly. Others link to your public profile.</p>
      <div id="soc-net-list" style="display:flex;flex-direction:column;gap:8px">
        ${SOCIAL_NETWORKS.map(net=>{
          const existing=saved.find(s=>s.network===net.id);
          return renderNetRow(net,existing?.handle||'');
        }).join('')}
      </div>
    </div>
    <button class="ym-btn ym-btn-accent" id="soc-save-btn" style="width:100%">Save Profile</button>
    <div id="soc-save-msg" class="ym-notice success" style="display:none">Saved ✓</div>
  </div>`;

  el.querySelector('#soc-save-btn')?.addEventListener('click',()=>{
    const networks=SOCIAL_NETWORKS.map(net=>({
      network:net.id,
      handle:(el.querySelector(`#soc-h-${net.id}`)?.value||'').trim()
    })).filter(n=>n.handle);
    _ctx?.saveProfile({
      displayName:el.querySelector('#soc-name')?.value||'',
      bio:el.querySelector('#soc-bio')?.value||'',
      avatarEmoji:el.querySelector('#soc-emoji')?.value||'',
      socialNetworks:networks,
    });
    const msg=el.querySelector('#soc-save-msg');if(msg){msg.style.display='flex';setTimeout(()=>msg.style.display='none',2000)}
  });
}

function renderNetRow(net,handle){
  const contentIcons=net.content.map(c=>c==='text'?'T':c==='photo'?'📷':'🎬').join(' ');
  return `<div style="border:1px solid var(--border);border-radius:var(--r2);padding:12px;background:var(--bg2)">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
      <span style="font-size:18px;width:28px;text-align:center">${net.icon}</span>
      <div style="flex:1">
        <div style="font-family:var(--font-display);font-size:12px;font-weight:700;color:var(--text)">${net.name}</div>
        <div style="display:flex;gap:6px;margin-top:2px;align-items:center">
          ${net.pkce?'<span class="ym-chip accent" style="font-size:8px">PKCE</span>':''}
          <span style="font-size:9px;color:var(--text3)">${contentIcons}</span>
        </div>
      </div>
    </div>
    <label style="font-size:9px;color:var(--text3);letter-spacing:.5px;text-transform:uppercase;display:block;margin-bottom:4px">${net.handleLabel}</label>
    <input class="ym-input" id="soc-h-${net.id}" value="${handle}" placeholder="${net.handleHint}" style="font-size:11px;padding:7px 12px"/>
  </div>`;
}

})();
