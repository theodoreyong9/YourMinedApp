/* jshint esversion:11, browser:true */
// anonmessenger.sphere.js — Envoie des messages anonymes à un utilisateur nearby
// Toi : tu sais à qui tu parles (tu as ouvert la conv depuis sa fiche)
// Lui : reçoit les messages d'un "Anon" — ne sait pas qui tu es
(function(){
'use strict';
window.YM_S = window.YM_S || {};

const CONVS_KEY = 'ym_anon_convs_v1';
const MYID_KEY  = 'ym_anon_myid_v1';

// ── ID anonyme persistant par session ────────────────────────────────────────
// Pour chaque conv ouverte, on génère un anonId unique (inconnu du destinataire)
function getAnonId(peerUUID){
  var store=JSON.parse(localStorage.getItem(MYID_KEY)||'{}');
  if(!store[peerUUID]){
    store[peerUUID]='anon_'+Math.random().toString(36).slice(2,10);
    localStorage.setItem(MYID_KEY,JSON.stringify(store));
  }
  return store[peerUUID];
}

// ── STORAGE ───────────────────────────────────────────────────────────────────
function loadConvs(){try{return JSON.parse(localStorage.getItem(CONVS_KEY)||'{}');}catch(e){return{};}}
function saveConvs(d){localStorage.setItem(CONVS_KEY,JSON.stringify(d));}
function addMsg(peerUUID,msg){
  var convs=loadConvs();
  if(!convs[peerUUID])convs[peerUUID]=[];
  convs[peerUUID].push(msg);
  convs[peerUUID]=convs[peerUUID].slice(-200);
  saveConvs(convs);
}

let _ctx=null;
let _currentPeer=null; // {uuid, name, peerId}
let _onUpdate=null;    // callback pour rafraîchir le panel
let _unread={};        // uuid → count

// ── P2P ───────────────────────────────────────────────────────────────────────
function sendAnon(peerUUID,text){
  var peerId=_getPeerId(peerUUID);
  if(!peerId){window.YM_toast&&window.YM_toast('Peer not reachable','error');return false;}
  var anonId=getAnonId(peerUUID);
  var msg={from:'anon',anonId,text,ts:Date.now()};
  try{window.YM_P2P&&window.YM_P2P.sendTo(peerId,{sphere:'anonmessenger.sphere.js',type:'anon:msg',data:msg});}
  catch(e){window.YM_toast&&window.YM_toast('Send failed','error');return false;}
  // Sauvegarde côté envoyeur avec le vrai UUID
  addMsg(peerUUID,{...msg,fromMe:true});
  return true;
}

function _getPeerId(uuid){
  var near=window.YM_Social&&window.YM_Social._nearUsers;
  if(near&&near.has(uuid))return near.get(uuid).peerId||null;
  var peers=window.YM_P2P&&window.YM_P2P.peers;
  if(peers){for(var[pid,info]of peers){if(info&&info.uuid===uuid)return pid;}}
  return null;
}

function _onReceive(type,data,peerId){
  if(type!=='anon:msg')return;
  // Trouve l'UUID de l'expéditeur via peerId
  var senderUUID=null;
  var near=window.YM_Social&&window.YM_Social._nearUsers;
  if(near){near.forEach(function(u,uuid){if(u.peerId===peerId)senderUUID=uuid;});}

  // On stocke la conv reçue sous l'anonId de l'expéditeur (on ne connaît pas son UUID)
  var anonId=data.anonId||'unknown_anon';
  addMsg('inbox_'+anonId,{from:anonId,text:data.text,ts:data.ts||Date.now(),fromMe:false});

  _unread['inbox_'+anonId]=(_unread['inbox_'+anonId]||0)+1;
  var total=Object.values(_unread).reduce(function(a,b){return a+b;},0);
  if(_ctx)_ctx.setNotification(total>0?total:0);
  window.YM_toast&&window.YM_toast('Anonymous message received','info');
  if(_onUpdate)_onUpdate();
}

// ── PANEL ─────────────────────────────────────────────────────────────────────
function renderPanel(container){
  container.style.cssText='display:flex;flex-direction:column;height:100%;overflow:hidden';
  container.innerHTML='';

  const convs=loadConvs();

  // Si une conv est active, l'affiche directement
  if(_currentPeer){
    renderChat(container,_currentPeer);
    return;
  }

  // Liste des convs — envoyées (UUID connu) + reçues (anonId)
  const hdr=document.createElement('div');
  hdr.style.cssText='flex-shrink:0;padding:12px 16px;border-bottom:1px solid var(--border);font-size:12px;color:var(--text3)';
  hdr.innerHTML=
    '<div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:4px">Anonymous Messages</div>'+
    '<div>Open a chat from someone\'s profile nearby. They won\'t know it\'s you.</div>';
  container.appendChild(hdr);

  const list=document.createElement('div');
  list.style.cssText='flex:1;overflow-y:auto';
  container.appendChild(list);

  _onUpdate=function(){renderPanel(container);};

  const keys=Object.keys(convs);
  if(!keys.length){
    list.innerHTML='<div style="color:var(--text3);font-size:12px;padding:24px;text-align:center">No conversations yet.<br>Open someone\'s nearby profile and tap 👻 Anon Message.</div>';
    return;
  }

  keys.sort(function(a,b){
    var la=convs[a],lb=convs[b];
    return (lb[lb.length-1]?.ts||0)-(la[la.length-1]?.ts||0);
  }).forEach(function(key){
    var msgs=convs[key];
    var last=msgs[msgs.length-1];
    var isInbox=key.startsWith('inbox_');
    var displayName=isInbox?'👻 Anon ('+(key.replace('inbox_','').slice(0,8))+'...)':'';
    if(!isInbox){
      // Essaie de trouver le nom du destinataire
      var near=window.YM_Social&&window.YM_Social._nearUsers;
      var u=near&&near.has(key)&&near.get(key);
      displayName='👻 → '+(u&&u.profile&&u.profile.name||key.slice(0,8)+'…');
    }
    var unread=_unread[key]||0;
    var row=document.createElement('div');
    row.style.cssText='display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.05);cursor:pointer';
    row.innerHTML=
      '<div style="width:36px;height:36px;border-radius:50%;background:var(--surface3);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">👻</div>'+
      '<div style="flex:1;min-width:0">'+
        '<div style="font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(displayName)+'</div>'+
        '<div style="font-size:11px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc((last&&last.text)||'')+'</div>'+
      '</div>'+
      (unread?'<div style="background:var(--accent);color:#000;border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700">'+unread+'</div>':'')+
      '<span style="font-size:10px;color:var(--text3)">'+_ago(last&&last.ts)+'</span>';
    row.addEventListener('click',function(){
      _unread[key]=0;
      var total=Object.values(_unread).reduce(function(a,b){return a+b;},0);
      if(_ctx)_ctx.setNotification(total>0?total:0);
      renderChat(container,{uuid:key,name:displayName,isInbox});
    });
    list.appendChild(row);
  });
}

function renderChat(container,peer){
  container.innerHTML='';
  _currentPeer=peer;

  const hdr=document.createElement('div');
  hdr.style.cssText='flex-shrink:0;display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--border)';
  hdr.innerHTML=
    '<button id="ac-back" style="background:none;border:none;color:var(--text3);font-size:20px;cursor:pointer;padding:0 4px;line-height:1">‹</button>'+
    '<span style="font-size:16px">👻</span>'+
    '<div style="flex:1;font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(peer.name)+'</div>'+
    (peer.isInbox?'':'<div style="font-size:10px;color:var(--text3)">They don\'t know it\'s you</div>');
  container.appendChild(hdr);
  hdr.querySelector('#ac-back').addEventListener('click',function(){_currentPeer=null;renderPanel(container);});

  const msgs=document.createElement('div');
  msgs.style.cssText='flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:8px';
  container.appendChild(msgs);

  const convs=loadConvs();
  (convs[peer.uuid||peer.uuid]||[]).forEach(function(m){
    var el=document.createElement('div');
    el.style.cssText='max-width:82%;padding:8px 12px;border-radius:12px;font-size:13px;line-height:1.5;word-break:break-word;'+
      (m.fromMe
        ?'align-self:flex-end;background:var(--accent);color:#000;border-bottom-right-radius:3px'
        :'align-self:flex-start;background:var(--surface3);color:var(--text);border-bottom-left-radius:3px');
    el.textContent=m.text;
    msgs.appendChild(el);
  });
  requestAnimationFrame(function(){msgs.scrollTop=msgs.scrollHeight;});

  // Input
  if(!peer.isInbox){
    const inputRow=document.createElement('div');
    inputRow.style.cssText='flex-shrink:0;display:flex;gap:8px;padding:10px 14px;border-top:1px solid var(--border)';
    const ta=document.createElement('textarea');
    ta.className='ym-input';ta.style.cssText='flex:1;height:40px;max-height:100px;resize:none;font-size:13px';
    ta.placeholder='Anonymous message…';
    const sendBtn=document.createElement('button');sendBtn.className='ym-btn ym-btn-accent';
    sendBtn.style.cssText='align-self:flex-end;padding:8px 14px';sendBtn.textContent='↑';
    inputRow.appendChild(ta);inputRow.appendChild(sendBtn);
    container.appendChild(inputRow);

    function doSend(){
      var text=ta.value.trim();if(!text)return;
      if(sendAnon(peer.uuid,text)){
        ta.value='';ta.style.height='40px';
        var el=document.createElement('div');
        el.style.cssText='max-width:82%;padding:8px 12px;border-radius:12px;font-size:13px;line-height:1.5;align-self:flex-end;background:var(--accent);color:#000;border-bottom-right-radius:3px;word-break:break-word';
        el.textContent=text;msgs.appendChild(el);
        msgs.scrollTop=msgs.scrollHeight;
      }
    }
    sendBtn.addEventListener('click',doSend);
    ta.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();doSend();}});
    ta.addEventListener('input',function(){ta.style.height='40px';ta.style.height=Math.min(ta.scrollHeight,100)+'px';});
  }else{
    // Inbox — on peut seulement lire, pas répondre (on ne connaît pas l'expéditeur)
    var notice=document.createElement('div');
    notice.style.cssText='flex-shrink:0;padding:10px 14px;font-size:11px;color:var(--text3);text-align:center;border-top:1px solid var(--border)';
    notice.textContent='You cannot reply — the sender is anonymous.';
    container.appendChild(notice);
  }
}

function _ago(ts){
  if(!ts)return'';
  var d=Date.now()-ts;
  if(d<3600000)return Math.floor(d/60000)+'m';
  if(d<86400000)return Math.floor(d/3600000)+'h';
  return Math.floor(d/86400000)+'d';
}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

// ── SPHERE ────────────────────────────────────────────────────────────────────
window.YM_S['anonmessenger.sphere.js']={
  name:'AnonMessenger',icon:'👻',category:'Communication',
  description:'Send anonymous messages to nearby users — they don\'t know it\'s you',
  emit:[],receive:[],

  activate(ctx){
    _ctx=ctx;
    ctx.onReceive(_onReceive);
    var total=Object.values(_unread).reduce(function(a,b){return a+b;},0);
    if(total>0)ctx.setNotification(total);
  },
  deactivate(){_ctx=null;_currentPeer=null;_onUpdate=null;},
  renderPanel,

  // Pas de profileSection — la config n'a rien à exposer dans ton propre profil

  peerSection(container,ctx){
    // Visible uniquement si l'utilisateur est nearby (via social)
    var uuid=ctx.uuid;
    var isNear=ctx.isNear;
    if(!isNear){
      var info=document.createElement('div');
      info.style.cssText='font-size:11px;color:var(--text3)';
      info.textContent='Must be nearby to send anonymous messages';
      container.appendChild(info);
      return;
    }
    var btn=document.createElement('button');
    btn.className='ym-btn ym-btn-ghost';
    btn.style.cssText='width:100%;font-size:12px;color:var(--accent)';
    btn.textContent='👻 Send anonymous message';
    btn.addEventListener('click',function(){
      // Ouvre la conv dans AnonMessenger
      var near=window.YM_Social&&window.YM_Social._nearUsers;
      var u=near&&near.get(uuid);
      var name=u&&u.profile&&u.profile.name||'User';
      _currentPeer={uuid,name:'→ '+name,isInbox:false};
      window.YM&&window.YM.openSpherePanel&&window.YM.openSpherePanel('anonmessenger.sphere.js');
    });
    container.appendChild(btn);
  }
};
})();