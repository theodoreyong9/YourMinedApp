/* jshint esversion:11, -W033 */
// messenger.sphere.js — YourMine Messenger
// Messages P2P chiffrés entre contacts réciproques
(function(){
'use strict';
window.YM_S = window.YM_S || {};

const MSG_KEY   = 'ym_msg_v1';      // {uuid: [{from,text,ts,sent}]}
const DRAFT_KEY = 'ym_msg_draft';   // {uuid: text}
const NOTIF_KEY = 'ym_msg_notif';   // {uuid: count}

// ── STATE ──────────────────────────────────────────────────────────────────
let _ctx = null;
let _currentChat = null;
let _pendingConv = null; // uuid à ouvrir au prochain renderPanel
let _unread = {};
let _onNewMsg = null;

// ── STORAGE ────────────────────────────────────────────────────────────────
function loadMsgs(uuid){
  try{const all=JSON.parse(localStorage.getItem(MSG_KEY)||'{}');return all[uuid]||[];}catch{return[];}
}
function saveMsgs(uuid,msgs){
  try{const all=JSON.parse(localStorage.getItem(MSG_KEY)||'{}');all[uuid]=msgs;localStorage.setItem(MSG_KEY,JSON.stringify(all));}catch{}
}
function addMsg(uuid,msg){
  const msgs=loadMsgs(uuid);msgs.push(msg);saveMsgs(uuid,msgs);
}
function loadDraft(uuid){try{return JSON.parse(localStorage.getItem(DRAFT_KEY)||'{}')[uuid]||'';}catch{return '';}}
function saveDraft(uuid,text){try{const d=JSON.parse(localStorage.getItem(DRAFT_KEY)||'{}');d[uuid]=text;localStorage.setItem(DRAFT_KEY,JSON.stringify(d));}catch{}}
function loadUnread(){try{return JSON.parse(localStorage.getItem(NOTIF_KEY)||'{}');}catch{return{};}}
function saveUnread(u){try{localStorage.setItem(NOTIF_KEY,JSON.stringify(u));}catch{}}
function clearUnread(uuid){const u=loadUnread();delete u[uuid];saveUnread(u);_unread=u;}
function incUnread(uuid){const u=loadUnread();u[uuid]=(u[uuid]||0)+1;saveUnread(u);_unread=u;}
function totalUnread(){return Object.values(loadUnread()).reduce((a,b)=>a+b,0);}

// ── CONTACTS ───────────────────────────────────────────────────────────────
function getContacts(){try{return JSON.parse(localStorage.getItem('ym_contacts_v1')||'[]');}catch{return[];}}
function getContact(uuid){return getContacts().find(c=>c.uuid===uuid);}
function getMyUUID(){return _ctx?.loadProfile?.()?.uuid||'';}

// ── QUEUE OFFLINE ──────────────────────────────────────────────────────────
const QUEUE_KEY='ym_msg_queue_v1';
function loadQueue(){try{return JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]');}catch{return[];}}
function saveQueue(q){try{localStorage.setItem(QUEUE_KEY,JSON.stringify(q));}catch{}}

function getPeerId(uuid){return window.YM_Social?._nearUsers?.get(uuid)?.peerId||null;}
function isNear(uuid){return !!(window.YM_Social?._nearUsers?.has(uuid));}

// ── SEND ───────────────────────────────────────────────────────────────────
function sendMsg(toUUID,text){
  if(!text.trim())return false;
  const myUUID=getMyUUID();
  const msg={from:myUUID,to:toUUID,text:text.trim(),ts:Date.now(),sent:false};
  addMsg(toUUID,msg);

  if(isNear(toUUID)){
    _deliverMsg(toUUID,msg);
  } else {
    // Hors ligne — met en queue
    const q=loadQueue();
    q.push({to:toUUID,text:msg.text,ts:msg.ts});
    saveQueue(q);
    window.YM_toast?.('Message queued (contact offline)','info');
  }
  return true;
}

function _deliverMsg(toUUID,msg){
  const peerId=getPeerId(toUUID);
  if(!peerId)return;
  const payload={sphere:'messenger.sphere.js',type:'msg:text',data:{text:msg.text,ts:msg.ts}};
  try{window.YM_P2P?.sendTo(peerId,payload);}catch{}
  try{window.YM_P2P?.broadcast(payload);}catch{}
  // Marque comme envoyé
  const all=JSON.parse(localStorage.getItem(MSG_KEY)||'{}');
  const conv=all[toUUID]||[];
  const m=conv.find(x=>x.ts===msg.ts&&x.from===msg.from);
  if(m){m.sent=true;localStorage.setItem(MSG_KEY,JSON.stringify(all));}
}

function _flushQueue(uuid){
  const q=loadQueue();
  const toSend=q.filter(m=>m.to===uuid);
  if(!toSend.length)return;
  const myUUID=getMyUUID();
  toSend.forEach(m=>{
    _deliverMsg(uuid,{from:myUUID,to:uuid,text:m.text,ts:m.ts});
  });
  saveQueue(q.filter(m=>m.to!==uuid));
  // Rafraîchit l'UI si conv ouverte
  if(_currentChat===uuid)_onNewMsg?.();
}

// ── RECEIVE ────────────────────────────────────────────────────────────────
function handleIncoming(data,peerId){
  const myUUID=getMyUUID();
  if(!data||!data.text||!data.ts)return;
  // Trouve l'UUID depuis les near users
  const near=window.YM_Social?._nearUsers;
  let fromUUID=null;
  if(near){for(const[uuid,u] of near){if(u.peerId===peerId){fromUUID=uuid;break;}}}
  if(!fromUUID)return;
  if(!getContact(fromUUID))return;
  // Évite les doublons (broadcast peut arriver 2x)
  const existing=loadMsgs(fromUUID);
  if(existing.find(m=>m.ts===data.ts&&m.from===fromUUID))return;

  const msg={from:fromUUID,to:myUUID,text:data.text,ts:data.ts,sent:false};
  addMsg(fromUUID,msg);

  if(_currentChat===fromUUID){
    _onNewMsg?.();
  }else{
    incUnread(fromUUID);
    if(_ctx)_ctx.setNotification(totalUnread());
    const name=getContact(fromUUID)?.nickname||getContact(fromUUID)?.profile?.name||fromUUID.slice(0,8);
    window.YM_toast?.(name+': '+data.text.slice(0,40),'info');
    _updateBadges?.();
  }
}

// ── UI HELPERS ─────────────────────────────────────────────────────────────
let _updateBadges = null;

function _avatarHtml(profile,size=32){
  if(profile?.avatar)return '<img src="'+profile.avatar+'" style="width:'+size+'px;height:'+size+'px;border-radius:50%;object-fit:cover;flex-shrink:0">';
  return '<div style="width:'+size+'px;height:'+size+'px;border-radius:50%;background:var(--surface3);display:flex;align-items:center;justify-content:center;font-size:'+(size*0.45|0)+'px;flex-shrink:0">'+(profile?.name?.charAt(0)||'👤')+'</div>';
}

function _timeStr(ts){
  const d=new Date(ts),now=new Date();
  const sameDay=d.toDateString()===now.toDateString();
  if(sameDay)return d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0');
  return (d.getMonth()+1)+'/'+d.getDate();
}

// ── PANEL PRINCIPAL ─────────────────────────────────────────────────────────
function renderPanel(container){
  container.style.cssText='display:flex;flex-direction:column;height:100%';
  container.innerHTML='';
  // Si openConv a été appelé avant renderPanel, ouvre directement la conv
  if(_pendingConv){
    const contact=getContact(_pendingConv);
    _pendingConv=null;
    if(contact){openChat(container,contact);return;}
  }
  _currentChat=null;
  renderConversationList(container);
}

function renderConversationList(container){
  container.innerHTML='';
  container.style.cssText='display:flex;flex-direction:column;height:100%';

  // Header
  const hdr=document.createElement('div');
  hdr.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:12px 16px 0;flex-shrink:0';
  hdr.innerHTML='<div style="font-family:var(--font-d);font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text3)">Messages</div>';
  container.appendChild(hdr);

  // Liste scrollable
  const list=document.createElement('div');
  list.style.cssText='flex:1;overflow-y:auto;padding:10px 16px';
  container.appendChild(list);

  _updateBadges=()=>renderList();

  function renderList(){
    list.innerHTML='';
    const contacts=getContacts();
    const unread=loadUnread();

    if(!contacts.length){
      list.innerHTML='<div style="color:var(--text3);font-size:12px;padding:16px 0;text-align:center">No contacts yet.<br>Add contacts in Profile to start messaging.</div>';
      return;
    }

    // Trie par dernier message (plus récent en premier)
    const sorted=[...contacts].sort((a,b)=>{
      const la=loadMsgs(a.uuid);const lb=loadMsgs(b.uuid);
      const ta=la[la.length-1]?.ts||0;const tb=lb[lb.length-1]?.ts||0;
      return tb-ta;
    });

    sorted.forEach(c=>{
      const prof=c.profile||{uuid:c.uuid,name:c.nickname||'Unknown'};
      const msgs=loadMsgs(c.uuid);
      const last=msgs[msgs.length-1];
      const unreadCount=unread[c.uuid]||0;
      const isNear=window.YM_Social?._nearUsers?.has(c.uuid);

      const row=document.createElement('div');
      row.style.cssText='display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.05);cursor:pointer';
      row.innerHTML=
        '<div style="position:relative;flex-shrink:0">'+
          _avatarHtml(prof,40)+
          (isNear?'<div style="position:absolute;bottom:1px;right:1px;width:9px;height:9px;border-radius:50%;background:#30e880;border:2px solid var(--surface)"></div>':'')+
        '</div>'+
        '<div style="flex:1;min-width:0">'+
          '<div style="display:flex;align-items:baseline;gap:6px;margin-bottom:2px">'+
            '<span style="font-weight:'+(unreadCount?700:500)+';font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(c.nickname||prof.name||'Anonymous')+'</span>'+
            '<span style="font-size:10px;color:var(--text3);flex-shrink:0;margin-left:auto">'+(last?_timeStr(last.ts):'')+'</span>'+
          '</div>'+
          '<div style="font-size:11px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+
            (last?(last.sent?'You: ':'')+last.text:'Start a conversation…')+
          '</div>'+
        '</div>'+
        (unreadCount?'<div style="width:18px;height:18px;border-radius:50%;background:var(--accent);color:#000;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">'+unreadCount+'</div>':'');

      row.addEventListener('click',()=>openChat(container,c));
      list.appendChild(row);
    });
  }

  renderList();
}

// ── CHAT VIEW ──────────────────────────────────────────────────────────────
function openChat(container,contact){
  _currentChat=contact.uuid;
  clearUnread(contact.uuid);
  if(_ctx)_ctx.setNotification(totalUnread());

  container.innerHTML='';
  container.style.cssText='display:flex;flex-direction:column;height:100%';

  const prof=contact.profile||{uuid:contact.uuid,name:contact.nickname||'Unknown'};
  const isNear=window.YM_Social?._nearUsers?.has(contact.uuid);

  // Header chat
  const hdr=document.createElement('div');
  hdr.style.cssText='display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--border);flex-shrink:0;background:var(--surface2)';
  hdr.innerHTML=
    '<button id="msg-back" class="ym-btn ym-btn-ghost" style="padding:4px 8px;font-size:13px">‹</button>'+
    '<div style="position:relative">'+
      _avatarHtml(prof,34)+
      (isNear?'<div style="position:absolute;bottom:0;right:0;width:8px;height:8px;border-radius:50%;background:#30e880;border:2px solid var(--surface2)"></div>':'')+
    '</div>'+
    '<div style="flex:1;min-width:0;cursor:pointer" id="msg-name">'+
      '<div style="font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(contact.nickname||prof.name||'Anonymous')+'</div>'+
      '<div style="font-size:10px;color:var(--text3)">'+(isNear?'🟢 Nearby':'⚫ Offline')+'</div>'+
    '</div>'+
    (isNear&&window.YM_Social?.isReciprocal?.(contact.uuid)?
      '<button id="msg-call" class="ym-btn ym-btn-ghost" style="padding:4px 8px;font-size:14px" title="Call">📞</button>':'');
  container.appendChild(hdr);

  // Zone messages
  const msgsEl=document.createElement('div');
  msgsEl.style.cssText='flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:6px';
  container.appendChild(msgsEl);

  // Input
  const inputRow=document.createElement('div');
  inputRow.style.cssText='display:flex;align-items:flex-end;gap:8px;padding:10px 14px;border-top:1px solid var(--border);flex-shrink:0;background:var(--surface2)';
  const textarea=document.createElement('textarea');
  textarea.className='ym-input';
  textarea.style.cssText='flex:1;height:38px;max-height:100px;resize:none;font-size:13px;line-height:1.4;overflow-y:auto';
  textarea.placeholder=isNear?'Message…':'Not nearby — messages queued';
  textarea.value=loadDraft(contact.uuid);
  const sendBtn=document.createElement('button');
  sendBtn.className='ym-btn ym-btn-accent';
  sendBtn.style.cssText='padding:8px 14px;font-size:13px;align-self:flex-end';
  sendBtn.textContent='↑';
  inputRow.appendChild(textarea);inputRow.appendChild(sendBtn);
  container.appendChild(inputRow);

  // Render messages
  function renderMsgs(){
    const msgs=loadMsgs(contact.uuid);
    msgsEl.innerHTML='';
    if(!msgs.length){
      msgsEl.innerHTML='<div style="text-align:center;color:var(--text3);font-size:12px;padding:24px 0">No messages yet</div>';
    }else{
      let lastDate='';
      msgs.forEach(msg=>{
        const d=new Date(msg.ts).toDateString();
        if(d!==lastDate){
          lastDate=d;
          const sep=document.createElement('div');
          sep.style.cssText='text-align:center;font-size:10px;color:var(--text3);padding:8px 0';
          sep.textContent=new Date(msg.ts).toLocaleDateString();
          msgsEl.appendChild(sep);
        }
        const mine=msg.sent||msg.from===getMyUUID();
        const bubble=document.createElement('div');
        bubble.style.cssText='max-width:78%;padding:8px 12px;border-radius:16px;font-size:13px;line-height:1.45;word-break:break-word;'+
          (mine?'align-self:flex-end;background:var(--accent);color:#000;border-bottom-right-radius:4px':'align-self:flex-start;background:var(--surface3);color:var(--text);border-bottom-left-radius:4px');
        bubble.textContent=msg.text;
        const meta=document.createElement('div');
        meta.style.cssText='font-size:9px;color:'+(mine?'rgba(0,0,0,.5)':'var(--text3)')+';text-align:'+(mine?'right':'left')+';margin-top:2px;padding:0 2px';
        meta.textContent=_timeStr(msg.ts);
        const wrap=document.createElement('div');
        wrap.style.cssText='display:flex;flex-direction:column;align-self:'+(mine?'flex-end':'flex-start')+';max-width:78%';
        wrap.appendChild(bubble);wrap.appendChild(meta);
        msgsEl.appendChild(wrap);
      });
      // Scroll en bas
      requestAnimationFrame(()=>{msgsEl.scrollTop=msgsEl.scrollHeight;});
    }
  }

  renderMsgs();
  _onNewMsg=renderMsgs;

  // Draft auto-save
  textarea.addEventListener('input',()=>{
    saveDraft(contact.uuid,textarea.value);
    // Auto-resize
    textarea.style.height='38px';
    textarea.style.height=Math.min(textarea.scrollHeight,100)+'px';
  });

  // Send
  function doSend(){
    const text=textarea.value;
    if(!sendMsg(contact.uuid,text))return;
    saveDraft(contact.uuid,'');
    textarea.value='';textarea.style.height='38px';
    renderMsgs();
  }
  sendBtn.addEventListener('click',doSend);
  textarea.addEventListener('keydown',e=>{
    if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();doSend();}
  });

  hdr.querySelector('#msg-back')?.addEventListener('click',()=>{
    _currentChat=null;_onNewMsg=null;
    renderConversationList(container);
  });
  // Clic sur le nom → ouvre le profil
  hdr.querySelector('#msg-name')?.addEventListener('click',()=>{
    window.YM?.openProfilePanel?.(prof);
  });
  hdr.querySelector('#msg-call')?.addEventListener('click',()=>{
    window.YM_Social?.startVoiceCall?.(contact.uuid);
  });
}

// ── SPHERE DEFINITION ──────────────────────────────────────────────────────
window.YM_S['messenger.sphere.js']={
  name:'Messenger',
  icon:'💬',
  category:'Communication',
  description:'P2P messages between nearby contacts',
  author:'yourmine',
  emit:[],
  receive:[],

  activate(ctx){
    _ctx=ctx;
    _unread=loadUnread();
    const total=totalUnread();
    if(total>0)ctx.setNotification(total);

    ctx.onReceive((type,data,peerId)=>{
      if(type==='msg:text')handleIncoming(data,peerId);
    });

    // Flush queue quand un peer rejoint
    window.addEventListener('ym:peer-join',_onPeerJoin);
  },

  deactivate(){
    window.removeEventListener('ym:peer-join',_onPeerJoin);
    _currentChat=null;_pendingConv=null;_onNewMsg=null;_updateBadges=null;_ctx=null;
  },

  renderPanel,

  profileSection(container){
    // Bouton "Open Messenger" dans le dépliant messenger de profile/spheres
    const btn=document.createElement('button');
    btn.className='ym-btn ym-btn-ghost';
    btn.style.cssText='width:100%;font-size:12px';
    btn.textContent='💬 Open Messenger';
    btn.addEventListener('click',()=>{
      window.YM?.openSpherePanel?.('messenger.sphere.js');
    });
    container.appendChild(btn);
    // Affiche le nombre de non-lus
    const unread=totalUnread();
    if(unread>0){
      const badge=document.createElement('div');
      badge.style.cssText='text-align:center;font-size:11px;color:var(--accent);margin-top:6px';
      badge.textContent=unread+' unread message'+(unread>1?'s':'');
      container.appendChild(badge);
    }
  }
};

function _onPeerJoin(){
  // Flush les messages en queue pour tous les peers qui viennent de rejoindre
  const q=loadQueue();
  if(!q.length)return;
  const uuids=[...new Set(q.map(m=>m.to))];
  uuids.forEach(uuid=>{
    if(isNear(uuid))setTimeout(()=>_flushQueue(uuid),600);
  });
}

// Expose openConv pour profile.js et autres
window.YM_Messenger={
  openConv(uuid){
    _pendingConv=uuid;
    // Si le panel est déjà ouvert, ouvre directement la conv
    const body=document.getElementById('panel-sphere-body');
    if(body&&body.innerHTML!==''){
      const contact=getContact(uuid);
      if(contact){body.innerHTML='';body.style.cssText='display:flex;flex-direction:column;height:100%';openChat(body,contact);}
    }
  },
};

})();
