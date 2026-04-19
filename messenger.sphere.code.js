/* jshint esversion:11, -W033 */
// messenger.sphere.js — YourMine Messenger
(function(){
'use strict';
window.YM_S = window.YM_S || {};

const MSG_KEY  = 'ym_msg_v1';
const DRAFT_KEY= 'ym_msg_draft';
const NOTIF_KEY= 'ym_msg_notif';

let _ctx = null;
let _currentChat = null;
let _pendingConv = null;
let _onNewMsg = null;
let _updateList = null;
let _autoReplied = {}; // {uuid: true} — évite les boucles

function _loadAR(){try{return JSON.parse(localStorage.getItem('ym_msg_autoreply')||'{"on":false,"text":""}');}catch(e){return{on:false,text:''};}}


// ── STORAGE ────────────────────────────────────────────────────────────────
function loadMsgs(uuid){
  try{return JSON.parse(localStorage.getItem(MSG_KEY)||'{}')[uuid]||[];}catch(e){return[];}
}
function saveMsgs(uuid,msgs){
  try{const a=JSON.parse(localStorage.getItem(MSG_KEY)||'{}');a[uuid]=msgs.slice(-200);localStorage.setItem(MSG_KEY,JSON.stringify(a));}catch(e){}
}
function addMsg(uuid,msg){
  const m=loadMsgs(uuid);m.push(msg);saveMsgs(uuid,m);
}
function loadDraft(uuid){
  try{return JSON.parse(localStorage.getItem(DRAFT_KEY)||'{}')[uuid]||'';}catch(e){return'';}
}
function saveDraft(uuid,text){
  try{const d=JSON.parse(localStorage.getItem(DRAFT_KEY)||'{}');if(text)d[uuid]=text;else delete d[uuid];localStorage.setItem(DRAFT_KEY,JSON.stringify(d));}catch(e){}
}
function loadUnread(){try{return JSON.parse(localStorage.getItem(NOTIF_KEY)||'{}');}catch(e){return{};}}
function saveUnread(u){try{localStorage.setItem(NOTIF_KEY,JSON.stringify(u));}catch(e){}}
function clearUnread(uuid){const u=loadUnread();delete u[uuid];saveUnread(u);}
function incUnread(uuid){const u=loadUnread();u[uuid]=(u[uuid]||0)+1;saveUnread(u);}
function totalUnread(){return Object.values(loadUnread()).reduce(function(a,b){return a+b;},0);}
function getContacts(){try{return JSON.parse(localStorage.getItem('ym_contacts_v1')||'[]');}catch(e){return[];}}
function getContact(uuid){return getContacts().find(function(c){return c.uuid===uuid;});}
function getMyUUID(){return(_ctx&&_ctx.loadProfile&&_ctx.loadProfile().uuid)||'';}

// ── SEND ───────────────────────────────────────────────────────────────────
function sendMsg(toUUID,text){
  text=(text||'').trim();
  if(!text)return false;
  const myUUID=getMyUUID();
  const msg={from:myUUID,to:toUUID,text:text,ts:Date.now(),sent:false};
  addMsg(toUUID,msg);

  const near=window.YM_Social&&window.YM_Social._nearUsers;
  const entry=near&&near.get(toUUID);
  const peerId=entry&&entry.peerId;

  if(peerId&&window.YM_P2P){
    const payload={sphere:'messenger.sphere.js',type:'msg:text',data:{text:text,ts:msg.ts}};
    try{window.YM_P2P.sendTo(peerId,payload);}catch(e){}
    // Marque envoyé
    const all=JSON.parse(localStorage.getItem(MSG_KEY)||'{}');
    const conv=all[toUUID]||[];
    const m=conv.find(function(x){return x.ts===msg.ts&&x.from===myUUID;});
    if(m){m.sent=true;localStorage.setItem(MSG_KEY,JSON.stringify(all));}
  }else{
    window.YM_toast&&window.YM_toast('Contact offline — message saved locally','info');
  }
  return true;
}

// ── RECEIVE ────────────────────────────────────────────────────────────────
function handleIncoming(data,peerId){
  if(!data||!data.text||!data.ts)return;
  const myUUID=getMyUUID();
  const near=window.YM_Social&&window.YM_Social._nearUsers;
  let fromUUID=null;
  if(near){near.forEach(function(u,uuid){if(u.peerId===peerId)fromUUID=uuid;});}
  if(!fromUUID||!getContact(fromUUID))return;
  // Déduplique
  if(loadMsgs(fromUUID).find(function(m){return m.ts===data.ts&&m.from===fromUUID;}))return;

  addMsg(fromUUID,{from:fromUUID,to:myUUID,text:data.text,ts:data.ts,sent:false});

  // Auto-reply — une seule fois par contact par session
  if(!_autoReplied[fromUUID]){
    const ar=_loadAR();
    if(ar.on&&ar.text){
      _autoReplied[fromUUID]=true;
      setTimeout(function(){sendMsg(fromUUID,ar.text);if(_onNewMsg)_onNewMsg();},800);
    }
  }

  if(_currentChat===fromUUID){
    if(_onNewMsg)_onNewMsg();
  }else{
    incUnread(fromUUID);
    if(_ctx)_ctx.setNotification(totalUnread());
    const c=getContact(fromUUID);
    const name=(c&&(c.nickname||(c.profile&&c.profile.name)))||fromUUID.slice(0,8);
    if(window.YM_toast)window.YM_toast(name+': '+data.text.slice(0,40),'info');
    if(_updateList)_updateList();
  }
}

// ── HELPERS ────────────────────────────────────────────────────────────────
function _ava(profile,size){
  size=size||36;
  if(profile&&profile.avatar)return '<img src="'+profile.avatar+'" style="width:'+size+'px;height:'+size+'px;border-radius:50%;object-fit:cover;flex-shrink:0">';
  return '<div style="width:'+size+'px;height:'+size+'px;border-radius:50%;background:var(--surface3);display:flex;align-items:center;justify-content:center;font-size:'+(size*0.45|0)+'px;flex-shrink:0">'+((profile&&profile.name&&profile.name.charAt(0))||'👤')+'</div>';
}
function _time(ts){
  const d=new Date(ts),now=new Date();
  if(d.toDateString()===now.toDateString())return d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0');
  return (d.getMonth()+1)+'/'+d.getDate();
}

// ── PANEL ──────────────────────────────────────────────────────────────────
function renderPanel(container){
  container.style.cssText='display:flex;flex-direction:column;height:100%';
  container.innerHTML='';
  if(_pendingConv){
    const c=getContact(_pendingConv);
    _pendingConv=null;
    if(c){openChat(container,c);return;}
  }
  _currentChat=null;
  renderList(container);
}

function renderList(container){
  container.innerHTML='';
  _currentChat=null;

  const hdr=document.createElement('div');
  hdr.style.cssText='padding:12px 16px 8px;flex-shrink:0;font-family:var(--font-d);font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text3)';
  hdr.textContent='Messages';
  container.appendChild(hdr);

  const list=document.createElement('div');
  list.style.cssText='flex:1;overflow-y:auto;padding:0 8px';
  container.appendChild(list);

  _updateList=function(){renderListItems(list,container);};
  renderListItems(list,container);
}

function renderListItems(list,container){
  list.innerHTML='';
  const contacts=getContacts();
  const unread=loadUnread();

  if(!contacts.length){
    list.innerHTML='<div style="color:var(--text3);font-size:12px;padding:16px;text-align:center">No contacts yet</div>';
    return;
  }

  const sorted=contacts.slice().sort(function(a,b){
    const ma=loadMsgs(a.uuid),mb=loadMsgs(b.uuid);
    return ((mb[mb.length-1]&&mb[mb.length-1].ts)||0)-((ma[ma.length-1]&&ma[ma.length-1].ts)||0);
  });

  sorted.forEach(function(c){
    const prof=c.profile||{uuid:c.uuid,name:c.nickname||'Unknown'};
    const msgs=loadMsgs(c.uuid);
    const last=msgs[msgs.length-1];
    const u=unread[c.uuid]||0;
    const isNear=!!(window.YM_Social&&window.YM_Social._nearUsers&&window.YM_Social._nearUsers.has(c.uuid));

    const row=document.createElement('div');
    row.style.cssText='display:flex;align-items:center;gap:10px;padding:10px 8px;border-radius:var(--r-sm);cursor:pointer;border-bottom:1px solid rgba(255,255,255,.04)';
    row.innerHTML=
      '<div style="position:relative;flex-shrink:0">'+_ava(prof,40)+
        (isNear?'<div style="position:absolute;bottom:1px;right:1px;width:9px;height:9px;border-radius:50%;background:#30e880;border:2px solid var(--surface)"></div>':'')+
      '</div>'+
      '<div style="flex:1;min-width:0">'+
        '<div style="display:flex;align-items:baseline;gap:4px;margin-bottom:2px">'+
          '<span style="font-weight:'+(u?700:500)+';font-size:13px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(c.nickname||prof.name||'Anonymous')+'</span>'+
          (last?'<span style="font-size:10px;color:var(--text3);flex-shrink:0">'+_time(last.ts)+'</span>':'')+
        '</div>'+
        '<div style="font-size:11px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+
          (last?(last.from===getMyUUID()?'You: ':'')+last.text:'Start a conversation…')+
        '</div>'+
      '</div>'+
      (u?'<div style="width:18px;height:18px;border-radius:50%;background:var(--accent);color:#000;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">'+u+'</div>':'');

    row.addEventListener('click',function(){openChat(container,c);});
    list.appendChild(row);
  });
}

// ── CHAT ──────────────────────────────────────────────────────────────────
function openChat(container,contact){
  _currentChat=contact.uuid;
  clearUnread(contact.uuid);
  if(_ctx)_ctx.setNotification(totalUnread());

  container.innerHTML='';
  container.style.cssText='display:flex;flex-direction:column;height:100%';

  const prof=contact.profile||{uuid:contact.uuid,name:contact.nickname||'Unknown'};
  const isNear=!!(window.YM_Social&&window.YM_Social._nearUsers&&window.YM_Social._nearUsers.has(contact.uuid));
  const canCall=isNear&&window.YM_Social&&window.YM_Social.isReciprocal&&window.YM_Social.isReciprocal(contact.uuid);

  // Header
  const hdr=document.createElement('div');
  hdr.style.cssText='display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--border);flex-shrink:0;background:var(--surface2)';
  hdr.innerHTML=
    '<button id="msg-back" class="ym-btn ym-btn-ghost" style="padding:4px 8px;font-size:14px">‹</button>'+
    '<div style="position:relative">'+_ava(prof,34)+
      (isNear?'<div style="position:absolute;bottom:0;right:0;width:8px;height:8px;border-radius:50%;background:#30e880;border:2px solid var(--surface2)"></div>':'')+
    '</div>'+
    '<div id="msg-name" style="flex:1;min-width:0;cursor:pointer">'+
      '<div style="font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(contact.nickname||prof.name||'Anonymous')+'</div>'+
      '<div style="font-size:10px;color:var(--text3)">'+(isNear?'🟢 Nearby':'⚫ Offline')+'</div>'+
    '</div>'+
    (canCall?'<button id="msg-call" class="ym-btn ym-btn-ghost" style="padding:4px 8px;font-size:14px">📞</button>':'');
  container.appendChild(hdr);

  hdr.querySelector('#msg-back').addEventListener('click',function(){_onNewMsg=null;renderList(container);});
  hdr.querySelector('#msg-name').addEventListener('click',function(){if(window.YM&&window.YM.openProfilePanel)window.YM.openProfilePanel(prof);});
  var callBtn=hdr.querySelector('#msg-call');
  if(callBtn)callBtn.addEventListener('click',function(){if(window.YM_Social&&window.YM_Social.startVoiceCall)window.YM_Social.startVoiceCall(contact.uuid);});

  // Messages
  const msgsEl=document.createElement('div');
  msgsEl.style.cssText='flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column';
  container.appendChild(msgsEl);

  function renderMsgs(){
    msgsEl.innerHTML='';
    const msgs=loadMsgs(contact.uuid);
    if(!msgs.length){
      msgsEl.innerHTML='<div style="text-align:center;color:var(--text3);font-size:12px;padding:24px 0">No messages yet</div>';
    }else{
      var lastDate='';
      msgs.forEach(function(msg){
        var d=new Date(msg.ts).toDateString();
        if(d!==lastDate){
          lastDate=d;
          var sep=document.createElement('div');
          sep.style.cssText='text-align:center;font-size:10px;color:var(--text3);padding:8px 0';
          sep.textContent=new Date(msg.ts).toLocaleDateString();
          msgsEl.appendChild(sep);
        }
        var mine=msg.from===getMyUUID();
        var wrap=document.createElement('div');
        wrap.style.cssText='display:flex;flex-direction:column;align-items:'+(mine?'flex-end':'flex-start')+';margin-bottom:4px';
        var bubble=document.createElement('div');
        bubble.style.cssText='display:inline-block;max-width:80%;padding:8px 12px;border-radius:16px;font-size:13px;line-height:1.5;word-break:break-word;white-space:pre-wrap;'+
          (mine?'background:var(--accent);color:#000;border-bottom-right-radius:4px':'background:var(--surface3);color:var(--text);border-bottom-left-radius:4px');
        bubble.textContent=msg.text;
        var meta=document.createElement('div');
        meta.style.cssText='font-size:9px;color:var(--text3);margin-top:2px;padding:0 4px';
        meta.textContent=_time(msg.ts)+(mine?(msg.sent?' ✓':' ⏳'):'');
        wrap.appendChild(bubble);wrap.appendChild(meta);
        msgsEl.appendChild(wrap);
      });
      requestAnimationFrame(function(){msgsEl.scrollTop=msgsEl.scrollHeight;});
    }
  }
  renderMsgs();
  _onNewMsg=renderMsgs;

  // Input
  const inputRow=document.createElement('div');
  inputRow.style.cssText='display:flex;align-items:flex-end;gap:8px;padding:10px 14px;border-top:1px solid var(--border);flex-shrink:0;background:var(--surface2)';
  const ta=document.createElement('textarea');
  ta.className='ym-input';
  ta.style.cssText='flex:1;height:38px;max-height:100px;resize:none;font-size:13px;line-height:1.4;overflow-y:auto';
  ta.placeholder='Message…';
  ta.value=loadDraft(contact.uuid);
  const sendBtn=document.createElement('button');
  sendBtn.className='ym-btn ym-btn-accent';
  sendBtn.style.cssText='padding:8px 14px;font-size:13px;align-self:flex-end';
  sendBtn.textContent='↑';
  inputRow.appendChild(ta);inputRow.appendChild(sendBtn);
  container.appendChild(inputRow);

  ta.addEventListener('input',function(){
    saveDraft(contact.uuid,ta.value);
    ta.style.height='38px';
    ta.style.height=Math.min(ta.scrollHeight,100)+'px';
  });
  function doSend(){
    if(!sendMsg(contact.uuid,ta.value))return;
    saveDraft(contact.uuid,'');
    ta.value='';ta.style.height='38px';
    renderMsgs();
  }
  sendBtn.addEventListener('click',doSend);
  ta.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();doSend();}});
  ta.focus();
}

// ── SYNC ───────────────────────────────────────────────────────────────────
// Quand un peer rejoint, on lui envoie les timestamps de nos messages envoyés
// pour qu'il puisse nous demander ceux qu'il n'a pas reçus
function _onPeerJoin(e){
  const peerId=e&&e.detail&&e.detail.peerId;
  if(!peerId||peerId==='_self_')return;
  // Trouve l'UUID de ce peer
  const near=window.YM_Social&&window.YM_Social._nearUsers;
  if(!near)return;
  let uuid=null;
  near.forEach(function(u,id){if(u.peerId===peerId)uuid=id;});
  if(!uuid||!getContact(uuid))return;
  // Envoie nos timestamps pour ce contact
  const msgs=loadMsgs(uuid);
  const myUUID=getMyUUID();
  const sentTs=msgs.filter(function(m){return m.from===myUUID;}).map(function(m){return m.ts;});
  if(!sentTs.length)return;
  setTimeout(function(){
    try{window.YM_P2P&&window.YM_P2P.sendTo(peerId,{sphere:'messenger.sphere.js',type:'msg:sync-req',data:{ts:sentTs,from:myUUID}});}catch(e2){}
  },1000);
}

// B reçoit sync-req de A — répond avec les timestamps manquants
function handleSyncReq(data,peerId){
  if(!data||!data.ts||!data.from)return;
  const fromUUID=data.from;
  if(!getContact(fromUUID))return;
  const have=loadMsgs(fromUUID).filter(function(m){return m.from===fromUUID;}).map(function(m){return m.ts;});
  const missing=data.ts.filter(function(ts){return !have.includes(ts);});
  if(!missing.length)return;
  try{window.YM_P2P&&window.YM_P2P.sendTo(peerId,{sphere:'messenger.sphere.js',type:'msg:sync-res',data:{missing:missing}});}catch(e){}
}

// A reçoit sync-res de B — envoie les messages manquants
function handleSyncRes(data,peerId){
  if(!data||!data.missing||!data.missing.length)return;
  const near=window.YM_Social&&window.YM_Social._nearUsers;
  if(!near)return;
  let uuid=null;
  near.forEach(function(u,id){if(u.peerId===peerId)uuid=id;});
  if(!uuid)return;
  const myUUID=getMyUUID();
  const msgs=loadMsgs(uuid);
  data.missing.forEach(function(ts){
    const m=msgs.find(function(x){return x.ts===ts&&x.from===myUUID;});
    if(!m)return;
    setTimeout(function(){
      try{window.YM_P2P&&window.YM_P2P.sendTo(peerId,{sphere:'messenger.sphere.js',type:'msg:text',data:{text:m.text,ts:m.ts}});}catch(e){}
    },100);
  });
}

// ── SPHERE ─────────────────────────────────────────────────────────────────
window.YM_S['messenger.sphere.js']={
  name:'Messenger',
  icon:'💬',
  category:'Communication',
  description:'P2P messages between contacts',
  author:'yourmine',
  emit:[],receive:[],

  activate(ctx){
    _ctx=ctx;
    const total=totalUnread();
    if(total>0)ctx.setNotification(total);
    ctx.onReceive(function(type,data,peerId){
      if(type==='msg:text')handleIncoming(data,peerId);
      else if(type==='msg:sync-req')handleSyncReq(data,peerId);
      else if(type==='msg:sync-res')handleSyncRes(data,peerId);
    });
    // Sync au peer-join
    window.addEventListener('ym:peer-join',_onPeerJoin);
  },

  deactivate(){
    window.removeEventListener('ym:peer-join',_onPeerJoin);
    _ctx=null;_currentChat=null;_pendingConv=null;_onNewMsg=null;_updateList=null;_autoReplied={};
  },

  renderPanel:renderPanel,

  peerSection(container, ctx){
    const{uuid,isNear,isReciproc}=ctx;
    if(isNear&&isReciproc){
      const btn=document.createElement('button');
      btn.className='ym-btn ym-btn-ghost';
      btn.style.cssText='width:100%;font-size:12px';
      btn.textContent='💬 Send Message';
      btn.addEventListener('click',()=>{
        if(window.YM_Messenger?.openConv)window.YM_Messenger.openConv(uuid);
        window.YM?.openSpherePanel?.('messenger.sphere.js');
      });
      container.appendChild(btn);
    }else{
      const info=document.createElement('div');
      info.style.cssText='font-size:11px;color:var(--text3);text-align:center;padding:4px';
      info.textContent=isNear?'Add each other as contacts to message':'Not nearby';
      container.appendChild(info);
    }
  },

  profileSection(container){
    const AUTOREPLY_KEY='ym_msg_autoreply';
    function loadAR(){try{return JSON.parse(localStorage.getItem(AUTOREPLY_KEY)||'{"on":false,"text":""}');}catch(e){return{on:false,text:''};}}
    function saveAR(d){localStorage.setItem(AUTOREPLY_KEY,JSON.stringify(d));}
    const ar=loadAR();
    const wrap=document.createElement('div');
    wrap.innerHTML=
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'+
        '<span style="font-size:12px;color:var(--text2)">Auto-reply</span>'+
        '<label style="position:relative;display:inline-block;width:36px;height:20px;cursor:pointer">'+
          '<input type="checkbox" id="ar-toggle" style="opacity:0;width:0;height:0"'+(ar.on?' checked':'')+'>'+
          '<span id="ar-slider" style="position:absolute;inset:0;border-radius:20px;background:'+(ar.on?'var(--accent)':'var(--surface3)')+';transition:.2s"></span>'+
          '<span id="ar-knob" style="position:absolute;left:'+(ar.on?'18':'2')+'px;top:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:.2s"></span>'+
        '</label>'+
      '</div>'+
      '<textarea id="ar-text" class="ym-input" placeholder="Auto-reply message…" style="width:100%;height:60px;resize:none;font-size:11px;display:'+(ar.on?'block':'none')+'">'+( ar.text||'')+'</textarea>'+
      '<div id="ar-status" style="font-size:10px;color:var(--text3);margin-top:4px;display:'+(ar.on?'block':'none')+'">Active — sent once per contact per session</div>';
    container.appendChild(wrap);
    const toggle=wrap.querySelector('#ar-toggle');
    const slider=wrap.querySelector('#ar-slider');
    const knob=wrap.querySelector('#ar-knob');
    const taEl=wrap.querySelector('#ar-text');
    const status=wrap.querySelector('#ar-status');
    toggle.addEventListener('change',function(){
      const on=toggle.checked;
      slider.style.background=on?'var(--accent)':'var(--surface3)';
      knob.style.left=on?'18px':'2px';
      taEl.style.display=on?'block':'none';
      status.style.display=on?'block':'none';
      saveAR({on:on,text:taEl.value.trim()});
    });
    taEl.addEventListener('input',function(){
      saveAR({on:toggle.checked,text:taEl.value.trim()});
    });
  }
};

window.YM_Messenger={
  openConv:function(uuid){
    _pendingConv=uuid;
    const body=document.getElementById('panel-sphere-body');
    if(body&&body.querySelector('#msg-back')){
      // Panel déjà en vue chat — ignore
      return;
    }
    if(body&&body.style.height){
      const c=getContact(uuid);
      if(c){body.innerHTML='';body.style.cssText='display:flex;flex-direction:column;height:100%';openChat(body,c);}
    }
  }
};

})();