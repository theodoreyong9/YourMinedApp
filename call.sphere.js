/* jshint esversion:11, browser:true */
// call.sphere.js — YourMine Voice Calls + Call History
(function(){
'use strict';
window.YM_S = window.YM_S || {};

const HISTORY_KEY = 'ym_call_history_v1';

let _ctx = null;
let _callPeer = null;
let _callUUID = null;
let _peerConnection = null;
let _localStream = null;
let _callUI = null;
let _callerTone = null;
let _ringtone = null;
let _iceQueue = [];
let _remoteDescSet = false;

const ICE_SERVERS=[
  {urls:'stun:stun.l.google.com:19302'},
  {urls:'stun:stun1.l.google.com:19302'},
  {urls:'stun:stun.cloudflare.com:3478'},
  {urls:'turn:openrelay.metered.ca:80',username:'openrelayproject',credential:'openrelayproject'},
  {urls:'turn:openrelay.metered.ca:443',username:'openrelayproject',credential:'openrelayproject'},
  {urls:'turn:openrelay.metered.ca:443?transport=tcp',username:'openrelayproject',credential:'openrelayproject'},
];

// ── HISTORY ────────────────────────────────────────────────────────────────
function loadHistory(){try{return JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]');}catch(e){return[];}}
function addHistory(entry){
  const h=loadHistory();
  h.unshift(entry);
  localStorage.setItem(HISTORY_KEY,JSON.stringify(h.slice(0,50)));
}
function getContacts(){try{return JSON.parse(localStorage.getItem('ym_contacts_v1')||'[]');}catch(e){return[];}}
function getContact(uuid){return getContacts().find(c=>c.uuid===uuid);}
function getMyUUID(){return _ctx&&_ctx.loadProfile&&_ctx.loadProfile().uuid||'';}

// ── SEND ───────────────────────────────────────────────────────────────────
function _send(type,data,peerId){
  const msg={sphere:'call.sphere.js',type,data};
  try{window.YM_P2P&&window.YM_P2P.broadcast&&window.YM_P2P.broadcast(msg);}catch(e){}
  if(peerId&&window.YM_P2P&&window.YM_P2P.sendTo){
    try{window.YM_P2P.sendTo(peerId,msg);}catch(e){}
  }
}

function _peerId(uuid){
  var near=window.YM_Social&&window.YM_Social._nearUsers;
  return near&&near.get(uuid)&&near.get(uuid).peerId||null;
}

function _isReciproc(uuid){
  if(!getContact(uuid))return false;
  var myUUID=getMyUUID();
  var near=window.YM_Social&&window.YM_Social._nearUsers;
  var entry=near&&near.get(uuid);
  var theirContacts=entry&&entry.profile&&entry.profile.contacts||[];
  return theirContacts.includes(myUUID);
}

// ── TONES ──────────────────────────────────────────────────────────────────
function _startCallerTone(){
  try{
    var ctx=new (window.AudioContext||window.webkitAudioContext)();
    var playing=true;
    function ring(){
      if(!playing)return;
      var osc=ctx.createOscillator();var gain=ctx.createGain();
      osc.connect(gain);gain.connect(ctx.destination);
      osc.type='sine';osc.frequency.value=425;
      gain.gain.setValueAtTime(0,ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.15,ctx.currentTime+0.05);
      gain.gain.setValueAtTime(0.15,ctx.currentTime+0.4);
      gain.gain.linearRampToValueAtTime(0,ctx.currentTime+0.45);
      osc.start(ctx.currentTime);osc.stop(ctx.currentTime+0.5);
      setTimeout(function(){
        if(!playing)return;
        var o2=ctx.createOscillator();var g2=ctx.createGain();
        o2.connect(g2);g2.connect(ctx.destination);
        o2.type='sine';o2.frequency.value=425;
        g2.gain.setValueAtTime(0,ctx.currentTime);
        g2.gain.linearRampToValueAtTime(0.15,ctx.currentTime+0.05);
        g2.gain.setValueAtTime(0.15,ctx.currentTime+0.4);
        g2.gain.linearRampToValueAtTime(0,ctx.currentTime+0.45);
        o2.start(ctx.currentTime);o2.stop(ctx.currentTime+0.5);
      },500);
      setTimeout(function(){if(playing)ring();},3000);
    }
    ring();
    _callerTone={stop:function(){playing=false;setTimeout(function(){ctx.close();},600);}};
  }catch(e){}
}
function _stopCallerTone(){if(_callerTone){_callerTone.stop();_callerTone=null;}}

function _startRingtone(){
  try{
    var ctx=new (window.AudioContext||window.webkitAudioContext)();
    var playing=true;
    function ring(){
      if(!playing)return;
      var osc=ctx.createOscillator();var gain=ctx.createGain();
      osc.connect(gain);gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880,ctx.currentTime);
      osc.frequency.setValueAtTime(660,ctx.currentTime+0.15);
      gain.gain.setValueAtTime(0.3,ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.4);
      osc.start(ctx.currentTime);osc.stop(ctx.currentTime+0.4);
      setTimeout(function(){if(playing)ring();},900);
    }
    ring();
    _ringtone={stop:function(){playing=false;setTimeout(function(){ctx.close();},500);}};
  }catch(e){}
}
function _stopRingtone(){if(_ringtone){_ringtone.stop();_ringtone=null;}}

// ── CALL UI ────────────────────────────────────────────────────────────────
function _removeCallUI(){
  document.getElementById('ym-call-incoming')?.remove();
  document.getElementById('ym-call-ui')?.remove();
  _callUI=null;
}

function _showCallUI(state,uuid){
  _removeCallUI();
  var c=getContact(uuid)||{};
  var prof=c.profile||{uuid:uuid,name:'Unknown'};
  var name=c.nickname||prof.name||'Unknown';
  var ui=document.createElement('div');
  ui.id='ym-call-ui';
  ui.style.cssText='position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:9999;background:var(--surface2);border:1px solid var(--accent);border-radius:var(--r);padding:12px 20px;min-width:220px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,.6);text-align:center;display:flex;align-items:center;gap:12px';
  ui.innerHTML='<div style="font-size:13px;color:var(--text);flex:1">'+(state==='calling'?'📞 Calling '+name+'…':'📞 '+name)+'</div>'+
    '<div id="call-timer" style="font-size:12px;color:var(--text3);min-width:36px">0:00</div>'+
    '<button id="call-hangup" style="width:36px;height:36px;border-radius:50%;background:#e84040;border:none;font-size:16px;cursor:pointer">✕</button>';
  document.body.appendChild(ui);_callUI=ui;
  ui.querySelector('#call-hangup').addEventListener('click',hangUp);
  if(state==='connected'){
    var sec=0;
    var timer=setInterval(function(){
      if(!document.getElementById('ym-call-ui')){clearInterval(timer);return;}
      sec++;ui.querySelector('#call-timer').textContent=Math.floor(sec/60)+':'+(sec%60).toString().padStart(2,'0');
    },1000);
  }
}

function _updateCallUI(state){
  if(state==='connected'){
    _stopCallerTone();
    _showCallUI('connected',_callUUID);
  }
}

function _showIncomingCallUI(profile,onAccept,onDecline){
  _startRingtone();
  document.getElementById('ym-call-incoming')?.remove();
  var name=profile.name||'Unknown';
  var av=profile.avatar
    ?'<img src="'+profile.avatar+'" style="width:48px;height:48px;border-radius:50%;object-fit:cover;margin-bottom:8px">'
    :'<div style="width:48px;height:48px;border-radius:50%;background:var(--surface3);display:flex;align-items:center;justify-content:center;font-size:20px;margin:0 auto 8px">'+(name.charAt(0)||'👤')+'</div>';
  var ui=document.createElement('div');
  ui.id='ym-call-incoming';
  ui.style.cssText='position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:9999;background:var(--surface2);border:1px solid var(--accent);border-radius:var(--r);padding:16px 20px;min-width:260px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,.7);text-align:center';
  ui.innerHTML=av+
    '<div style="font-weight:600;font-size:14px;margin-bottom:2px">'+name+'</div>'+
    '<div style="font-size:13px;color:var(--accent);margin-bottom:12px">📞 Incoming call</div>'+
    '<div style="display:flex;gap:10px;justify-content:center">'+
      '<button id="call-decline" style="width:56px;height:56px;border-radius:50%;background:#e84040;border:none;font-size:24px;cursor:pointer">✕</button>'+
      '<button id="call-accept" style="width:56px;height:56px;border-radius:50%;background:#30e880;border:none;font-size:24px;cursor:pointer">✓</button>'+
    '</div>';
  document.body.appendChild(ui);
  ui.querySelector('#call-accept').addEventListener('click',function(){ui.remove();_stopRingtone();onAccept();});
  ui.querySelector('#call-decline').addEventListener('click',function(){ui.remove();_stopRingtone();onDecline();});
}

// ── HANG UP ────────────────────────────────────────────────────────────────
function hangUp(){
  _stopRingtone();_stopCallerTone();
  if(_callPeer)_send('call:end',{},_callPeer);
  // Log historique
  if(_callUUID){
    var c=getContact(_callUUID);
    var name=c&&(c.nickname||(c.profile&&c.profile.name))||_callUUID.slice(0,8);
    addHistory({uuid:_callUUID,name:name,type:_callPeer?'outgoing':'incoming',ts:Date.now()});
  }
  if(_peerConnection){_peerConnection.close();_peerConnection=null;}
  if(_localStream){_localStream.getTracks().forEach(function(t){t.stop();});_localStream=null;}
  _callPeer=null;_callUUID=null;
  _iceQueue=[];_remoteDescSet=false;
  document.getElementById('ym-call-audio')?.remove();
  _removeCallUI();
}

// ── START CALL ─────────────────────────────────────────────────────────────
async function startVoiceCall(uuid){
  if(!getContact(uuid)){window.YM_toast?.('Add this person to contacts first','warn');return;}
  if(!_isReciproc(uuid)){window.YM_toast?.('Contact must add you back first','warn');return;}
  var peerId=_peerId(uuid);
  if(!peerId){window.YM_toast?.('Peer not reachable','error');return;}

  _stopRingtone();_stopCallerTone();
  if(_peerConnection){_peerConnection.close();_peerConnection=null;}
  if(_localStream){_localStream.getTracks().forEach(function(t){t.stop();});_localStream=null;}
  _callPeer=null;_callUUID=null;_iceQueue=[];_remoteDescSet=false;
  _removeCallUI();

  try{
    _localStream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
    _peerConnection=new RTCPeerConnection({iceServers:ICE_SERVERS});
    _localStream.getTracks().forEach(function(t){_peerConnection.addTrack(t,_localStream);});
    _peerConnection.ontrack=function(e){
      var audio=document.getElementById('ym-call-audio');
      if(!audio){audio=document.createElement('audio');audio.id='ym-call-audio';audio.autoplay=true;document.body.appendChild(audio);}
      audio.srcObject=e.streams[0];
    };
    _peerConnection.onconnectionstatechange=function(){
      console.log('[Call] caller state:',_peerConnection&&_peerConnection.connectionState);
      if(_peerConnection&&_peerConnection.connectionState==='connected')_updateCallUI('connected');
      if(_peerConnection&&['disconnected','failed','closed'].includes(_peerConnection.connectionState))hangUp();
    };

    _callPeer=peerId;_callUUID=uuid;
    _showCallUI('calling',uuid);
    _startCallerTone();

    var offer=await _peerConnection.createOffer();
    await _peerConnection.setLocalDescription(offer);
    await new Promise(function(res){
      if(_peerConnection.iceGatheringState==='complete'){res();return;}
      _peerConnection.onicegatheringstatechange=function(){if(_peerConnection&&_peerConnection.iceGatheringState==='complete')res();};
      setTimeout(res,8000);
    });
    if(!_peerConnection)return;
    _send('call:offer',{sdp:_peerConnection.localDescription.sdp},peerId);
  }catch(e){window.YM_toast?.('Call failed: '+e.message,'error');hangUp();}
}

// ── HANDLE OFFER ───────────────────────────────────────────────────────────
async function handleCallOffer(data){
  var fromUUID=data.fromUUID;
  if(!getContact(fromUUID)||!_isReciproc(fromUUID)){
    _send('call:end',{},data.from);return;
  }
  var callerProfile=getContact(fromUUID)&&getContact(fromUUID).profile||{name:'Unknown',uuid:fromUUID};
  _showIncomingCallUI(callerProfile,async function(){
    _callPeer=data.from;_callUUID=fromUUID;
    _showCallUI('calling',fromUUID);
    try{
      _localStream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
      _peerConnection=new RTCPeerConnection({iceServers:ICE_SERVERS});
      _localStream.getTracks().forEach(function(t){_peerConnection.addTrack(t,_localStream);});
      _peerConnection.ontrack=function(e){
        var audio=document.getElementById('ym-call-audio');
        if(!audio){audio=document.createElement('audio');audio.id='ym-call-audio';audio.autoplay=true;document.body.appendChild(audio);}
        audio.srcObject=e.streams[0];
      };
      _peerConnection.onconnectionstatechange=function(){
        console.log('[Call] callee state:',_peerConnection&&_peerConnection.connectionState);
        if(_peerConnection&&_peerConnection.connectionState==='connected')_updateCallUI('connected');
        if(_peerConnection&&['disconnected','failed','closed'].includes(_peerConnection.connectionState))hangUp();
      };
      await _peerConnection.setRemoteDescription({type:'offer',sdp:data.sdp});
      _remoteDescSet=true;
      var answer=await _peerConnection.createAnswer();
      await _peerConnection.setLocalDescription(answer);
      await new Promise(function(res){
        if(_peerConnection.iceGatheringState==='complete'){res();return;}
        _peerConnection.onicegatheringstatechange=function(){if(_peerConnection&&_peerConnection.iceGatheringState==='complete')res();};
        setTimeout(res,8000);
      });
      if(!_peerConnection)return;
      _send('call:answer',{sdp:_peerConnection.localDescription.sdp},data.from);
    }catch(e){window.YM_toast?.('Call error: '+e.message,'error');hangUp();}
  },function(){
    _send('call:end',{},data.from);
    addHistory({uuid:fromUUID,name:callerProfile.name,type:'missed',ts:Date.now()});
  });
}

// ── HANDLE ANSWER ──────────────────────────────────────────────────────────
async function handleCallAnswer(data){
  if(data.from!==_callPeer)return;
  if(!_peerConnection)return;
  try{
    await _peerConnection.setRemoteDescription({type:'answer',sdp:data.sdp});
    _iceQueue.forEach(async function(c){
      try{await _peerConnection.addIceCandidate(c);}catch(e){}
    });
    _iceQueue=[];_remoteDescSet=true;
  }catch(e){console.warn('[Call] answer error:',e.message);}
}

// ── PANEL ──────────────────────────────────────────────────────────────────
function renderPanel(container){
  container.style.cssText='display:flex;flex-direction:column;height:100%';
  container.innerHTML='';

  const hdr=document.createElement('div');
  hdr.style.cssText='padding:12px 16px 8px;flex-shrink:0;font-family:var(--font-d);font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text3)';
  hdr.textContent='Call History';
  container.appendChild(hdr);

  const list=document.createElement('div');
  list.style.cssText='flex:1;overflow-y:auto;padding:0 8px';
  container.appendChild(list);

  const clearBtn=document.createElement('button');
  clearBtn.className='ym-btn ym-btn-ghost';
  clearBtn.style.cssText='flex-shrink:0;font-size:11px;margin:8px 16px;width:calc(100% - 32px)';
  clearBtn.textContent='Clear history';
  clearBtn.addEventListener('click',function(){
    localStorage.removeItem(HISTORY_KEY);
    renderList();
  });
  container.appendChild(clearBtn);

  function renderList(){
    list.innerHTML='';
    var history=loadHistory();
    if(!history.length){
      list.innerHTML='<div style="color:var(--text3);font-size:12px;padding:16px;text-align:center">No calls yet.</div>';
      return;
    }
    history.forEach(function(entry){
      var icon=entry.type==='outgoing'?'📞':entry.type==='missed'?'📵':'📲';
      var color=entry.type==='missed'?'#e84040':entry.type==='outgoing'?'var(--cyan)':'#30e880';
      var row=document.createElement('div');
      row.style.cssText='display:flex;align-items:center;gap:10px;padding:10px 8px;border-radius:var(--r-sm);border-bottom:1px solid rgba(255,255,255,.04)';
      row.innerHTML=
        '<span style="font-size:18px">'+icon+'</span>'+
        '<div style="flex:1;min-width:0">'+
          '<div style="font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+entry.name+'</div>'+
          '<div style="font-size:10px;color:'+color+'">'+entry.type+'</div>'+
        '</div>'+
        '<div style="font-size:10px;color:var(--text3)">'+_timeStr(entry.ts)+'</div>'+
        '<button data-uuid="'+entry.uuid+'" style="background:none;border:none;color:var(--accent);font-size:16px;cursor:pointer;padding:4px" title="Call back">📞</button>';
      row.querySelector('[data-uuid]').addEventListener('click',function(e){
        e.stopPropagation();
        startVoiceCall(e.target.dataset.uuid);
      });
      list.appendChild(row);
    });
  }
  renderList();
}

function _timeStr(ts){
  var d=new Date(ts),now=new Date();
  if(d.toDateString()===now.toDateString())return d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  var diff=(now-d)/(1000*3600*24);
  if(diff<7)return['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
  return d.toLocaleDateString([],{day:'2-digit',month:'2-digit'});
}

// ── SPHERE ─────────────────────────────────────────────────────────────────
window.YM_S['call.sphere.js']={
  name:'Call',
  icon:'📞',
  category:'Communication',
  description:'Voice calls between contacts + call history',
  emit:[],receive:[],

  activate(ctx){
    _ctx=ctx;
    ctx.onReceive(function(type,data,peerId){
      if(type==='call:offer'){
        // Résout fromUUID depuis peerId via nearUsers
        var near=window.YM_Social&&window.YM_Social._nearUsers;
        var fromUUID=null;
        if(near){near.forEach(function(u,uuid){if(u.peerId===peerId)fromUUID=uuid;});}
        handleCallOffer(Object.assign({},data,{from:peerId,fromUUID:fromUUID}));
      }
      else if(type==='call:answer')handleCallAnswer(Object.assign({},data,{from:peerId}));
      else if(type==='call:end'){
        if(peerId===_callPeer)hangUp();
      }
    });
    // Badge = appels manqués
    var missed=loadHistory().filter(function(h){return h.type==='missed';}).length;
    if(missed>0)ctx.setNotification(missed);
  },

  deactivate(){
    hangUp();_ctx=null;
  },

  renderPanel,

  peerSection(container,peerCtx){
    var uuid=peerCtx.uuid;
    var isNear=peerCtx.isNear;
    var isReciproc=peerCtx.isReciproc;
    if(isNear&&isReciproc){
      var btn=document.createElement('button');
      btn.className='ym-btn ym-btn-ghost';
      btn.style.cssText='width:100%;font-size:12px;color:var(--cyan);border-color:rgba(34,211,238,.3)';
      btn.textContent='📞 Voice Call';
      btn.addEventListener('click',function(){startVoiceCall(uuid);});
      container.appendChild(btn);
    }else{
      var info=document.createElement('div');
      info.style.cssText='font-size:11px;color:var(--text3);text-align:center;padding:4px';
      info.textContent=isNear?'Add each other as contacts to call':'Not nearby';
      container.appendChild(info);
    }
  }
};

// Expose pour social.sphere.js et profile.js
window.YM_Call={startVoiceCall,hangUp};

})();

