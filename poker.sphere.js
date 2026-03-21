/* jshint esversion:11, browser:true */
// poker.sphere.js — YourMine Poker — Texas Hold'em P2P fullscreen
(function(){
'use strict';
window.YM_S = window.YM_S || {};

const SCORES_KEY='ym_poker_scores_v1';
let _ctx=null,_myUUID=null,_myName=null;
let _tables={};   // tableId → table state
let _activeTable=null;
let _fullscreenEl=null;
let _panelEl=null;

// ── UTILS ──────────────────────────────────────────────────────────────────
function gid(){return 'pk'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);}
function getContacts(){try{return JSON.parse(localStorage.getItem('ym_contacts_v1')||'[]');}catch(e){return[];}}
function loadScores(){try{return JSON.parse(localStorage.getItem(SCORES_KEY)||'[]');}catch(e){return[];}}
function addScore(e){const s=loadScores();s.unshift(e);localStorage.setItem(SCORES_KEY,JSON.stringify(s.slice(0,50)));}

// ── DECK ──────────────────────────────────────────────────────────────────
const SUITS=['♠','♥','♦','♣'];
const RANKS=['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
const RANK_VAL={2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,T:10,J:11,Q:12,K:13,A:14};
function newDeck(){const d=[];SUITS.forEach(s=>RANKS.forEach(r=>d.push(r+s)));return d;}
function shuffle(d){for(let i=d.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[d[i],d[j]]=[d[j],d[i]];}return d;}
function cardEl(c,back){
  const el=document.createElement('div');
  el.style.cssText='width:40px;height:58px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;border:1px solid rgba(255,255,255,.2);box-shadow:0 2px 8px rgba(0,0,0,.5);flex-shrink:0;margin:2px';
  if(back||!c){
    el.style.background='#1a1a3e';el.style.color='var(--accent)';el.textContent='🂠';
  }else{
    const red=c[1]==='♥'||c[1]==='♦';
    el.style.background='#f5f5f0';
    el.style.color=red?'#c0392b':'#1a1a2e';
    el.innerHTML='<span style="font-size:11px;line-height:1">'+c[0]+'<br>'+c[1]+'</span>';
  }
  return el;
}

// ── HAND EVALUATOR ─────────────────────────────────────────────────────────
// Simple 7-card evaluator → score numérique (plus haut = meilleure main)
function evalHand(cards){
  // Génère toutes les combinaisons de 5 cartes parmi 7
  const best={score:-1};
  const c7=cards.filter(Boolean);
  if(c7.length<5)return{score:0,name:'—'};
  combo(c7,5).forEach(h=>{const s=eval5(h);if(s.score>best.score)Object.assign(best,s);});
  return best;
}
function combo(arr,k){if(k===0)return[[]];if(!arr.length)return[];const[h,...t]=arr;return[...combo(t,k-1).map(c=>[h,...c]),...combo(t,k)];}
function eval5(h){
  const ranks=h.map(c=>RANK_VAL[c[0]]).sort((a,b)=>b-a);
  const suits=h.map(c=>c[1]);
  const flush=suits.every(s=>s===suits[0]);
  const uniqR=[...new Set(ranks)];
  const straight=uniqR.length===5&&(uniqR[0]-uniqR[4]===4||(uniqR[0]===14&&JSON.stringify(uniqR.slice(1))===JSON.stringify([5,4,3,2])));
  const cnt={};ranks.forEach(r=>{cnt[r]=(cnt[r]||0)+1;});
  const counts=Object.values(cnt).sort((a,b)=>b-a);
  const topR=ranks[0];
  if(flush&&straight)return{score:8*1e7+topR,name:'Straight Flush'};
  if(counts[0]===4)return{score:7*1e7+topR,name:'Four of a Kind'};
  if(counts[0]===3&&counts[1]===2)return{score:6*1e7+topR,name:'Full House'};
  if(flush)return{score:5*1e7+topR,name:'Flush'};
  if(straight)return{score:4*1e7+topR,name:'Straight'};
  if(counts[0]===3)return{score:3*1e7+topR,name:'Three of a Kind'};
  if(counts[0]===2&&counts[1]===2)return{score:2*1e7+topR,name:'Two Pair'};
  if(counts[0]===2)return{score:1*1e7+topR,name:'One Pair'};
  return{score:topR,name:'High Card'};
}

// ── P2P ────────────────────────────────────────────────────────────────────
function bc(type,data){try{window.YM_P2P?.broadcast({sphere:'poker.sphere.js',type,data});}catch(e){}}
function st(peerId,type,data){try{window.YM_P2P?.sendTo(peerId,{sphere:'poker.sphere.js',type,data});}catch(e){}}
function peerOf(uuid){return window.YM_Social?._nearUsers?.get(uuid)?.peerId||null;}

// ── TABLE ──────────────────────────────────────────────────────────────────
function mkTable(opts){
  return{
    id:gid(),host:_myUUID,name:opts.name||'Table',
    players:[{uuid:_myUUID,name:_myName,chips:opts.chips||1000,bet:0,folded:false,allIn:false,hand:[],sitOut:false}],
    maxPlayers:opts.max||6,state:'waiting',
    deck:[],board:[],pot:0,roundBets:{},
    cur:0,dealer:0,bb:opts.bb||20,sb:opts.sb||10,
    ts:Date.now()
  };
}

function tablePub(t){
  return{id:t.id,host:t.host,name:t.name,max:t.maxPlayers,state:t.state,
    bb:t.bb,sb:t.sb,ts:t.ts,
    players:t.players.map(p=>({uuid:p.uuid,name:p.name,chips:p.chips}))};
}

// ── GAME HOST LOGIC ────────────────────────────────────────────────────────
function startGame(tableId){
  const t=_tables[tableId];
  if(!t||t.host!==_myUUID||t.players.length<2)return;
  t.state='preflop';t.deck=shuffle(newDeck());t.board=[];t.pot=0;t.roundBets={};
  t.players.forEach(p=>{p.folded=false;p.allIn=false;p.bet=0;p.hand=[t.deck.pop(),t.deck.pop()];});
  t.dealer=(t.dealer+1)%t.players.length;
  // Blinds
  const sbP=t.players[(t.dealer+1)%t.players.length];
  const bbP=t.players[(t.dealer+2)%t.players.length];
  doBlind(t,sbP,t.sb);doBlind(t,bbP,t.bb);
  t.cur=(t.dealer+3)%t.players.length;
  while(t.players[t.cur].folded||t.players[t.cur].allIn){t.cur=(t.cur+1)%t.players.length;}
  pushState(t);
}

function doBlind(t,p,amt){
  const a=Math.min(amt,p.chips);p.chips-=a;p.bet+=a;t.pot+=a;t.roundBets[p.uuid]=(t.roundBets[p.uuid]||0)+a;
}

function doAction(tableId,uuid,action,amount){
  const t=_tables[tableId];if(!t||t.host!==_myUUID)return;
  if(t.players[t.cur]?.uuid!==uuid)return;
  const p=t.players[t.cur];
  const maxBet=Math.max(0,...Object.values(t.roundBets));
  const toCall=maxBet-(t.roundBets[uuid]||0);

  if(action==='fold'){p.folded=true;}
  else if(action==='check'){}
  else if(action==='call'){
    const a=Math.min(toCall,p.chips);p.chips-=a;p.bet+=a;t.pot+=a;t.roundBets[uuid]=(t.roundBets[uuid]||0)+a;
    if(p.chips===0)p.allIn=true;
  }
  else if(action==='raise'||action==='bet'){
    const a=Math.min(Math.max(amount,t.bb),p.chips);p.chips-=a;p.bet+=a;t.pot+=a;t.roundBets[uuid]=(t.roundBets[uuid]||0)+a;
    if(p.chips===0)p.allIn=true;
  }
  else if(action==='allin'){
    const a=p.chips;p.chips=0;p.bet+=a;t.pot+=a;t.roundBets[uuid]=(t.roundBets[uuid]||0)+a;p.allIn=true;
  }
  advanceGame(t);
}

function advanceGame(t){
  const active=t.players.filter(p=>!p.folded);
  if(active.length===1){endRound(t,[active[0]]);return;}
  const maxBet=Math.max(0,...Object.values(t.roundBets));
  const allActed=t.players.every(p=>p.folded||p.allIn||(t.roundBets[p.uuid]||0)>=maxBet);
  if(allActed){
    // Prochaine street
    if(t.state==='preflop'){t.state='flop';t.board.push(t.deck.pop(),t.deck.pop(),t.deck.pop());}
    else if(t.state==='flop'){t.state='turn';t.board.push(t.deck.pop());}
    else if(t.state==='turn'){t.state='river';t.board.push(t.deck.pop());}
    else{endRound(t,showdown(t));return;}
    t.roundBets={};
    t.cur=(t.dealer+1)%t.players.length;
    while(t.players[t.cur].folded||t.players[t.cur].allIn){t.cur=(t.cur+1)%t.players.length;}
  }else{
    t.cur=(t.cur+1)%t.players.length;
    while(t.players[t.cur].folded||t.players[t.cur].allIn){t.cur=(t.cur+1)%t.players.length;}
  }
  pushState(t);
}

function showdown(t){
  const active=t.players.filter(p=>!p.folded);
  let best=-1,winners=[];
  active.forEach(p=>{
    const s=evalHand([...p.hand,...t.board]).score;
    if(s>best){best=s;winners=[p];}else if(s===best)winners.push(p);
  });
  return winners;
}

function endRound(t,winners){
  t.state='showdown';
  const share=Math.floor(t.pot/winners.length);
  winners.forEach(w=>w.chips+=share);
  const rem=t.pot-share*winners.length;
  winners[0].chips+=rem;
  addScore({table:t.name,winners:winners.map(w=>w.name),pot:t.pot,ts:Date.now()});
  t.pot=0;
  pushState(t);
  t.players=t.players.filter(p=>p.chips>0);
  if(t.players.length<2){t.state='finished';pushState(t);}
  else{setTimeout(()=>{t.state='waiting';t.board=[];t.roundBets={};t.players.forEach(p=>{p.bet=0;p.hand=[];p.folded=false;p.allIn=false;});pushState(t);},4000);}
}

// Envoie l'état à chaque joueur (cache les mains des autres)
function pushState(t){
  t.players.forEach(p=>{
    const view={
      ...t,
      players:t.players.map(pl=>({
        uuid:pl.uuid,name:pl.name,chips:pl.chips,bet:pl.bet,
        folded:pl.folded,allIn:pl.allIn,
        hand:pl.uuid===p.uuid?pl.hand:pl.hand.map(()=>null)
      }))
    };
    if(p.uuid===_myUUID){_tables[t.id]=t;renderGame();}
    else{const pid=peerOf(p.uuid);if(pid)st(pid,'pk:state',view);}
  });
}

function renderGame(){
  if(_activeTable&&_fullscreenEl)renderFullscreen(_fullscreenEl,_tables[_activeTable]);
}

// ── RECEIVE ────────────────────────────────────────────────────────────────
function onReceive(type,data,peerId){
  if(type==='pk:announce'){
    if(!_tables[data.id]){_tables[data.id]={...data,_remote:true};}
    refreshTablesList();
  }
  else if(type==='pk:join-req'){
    const t=_tables[data.tableId];
    if(!t||t.host!==_myUUID||t.state!=='waiting'){st(peerId,'pk:join-res',{ok:false,reason:'Not joinable'});return;}
    if(t.players.length>=t.maxPlayers){st(peerId,'pk:join-res',{ok:false,reason:'Table full'});return;}
    t.players.push({uuid:data.uuid,name:data.name,chips:t.bb*50,bet:0,folded:false,allIn:false,hand:[]});
    st(peerId,'pk:join-res',{ok:true,table:t});
    bc('pk:announce',tablePub(t));
    pushState(t);
  }
  else if(type==='pk:join-res'){
    if(!data.ok){window.YM_toast?.('Join failed: '+data.reason,'error');return;}
    _tables[data.table.id]=data.table;
    _activeTable=data.table.id;
    if(_fullscreenEl)renderFullscreen(_fullscreenEl,data.table);
    else openFullscreen(data.table.id);
  }
  else if(type==='pk:state'){
    _tables[data.id]=data;
    if(_activeTable===data.id&&_fullscreenEl)renderFullscreen(_fullscreenEl,data);
  }
  else if(type==='pk:action'){
    doAction(data.tableId,data.uuid,data.action,data.amount||0);
  }
  else if(type==='pk:start'){
    if(_tables[data.tableId]?.host===_myUUID)startGame(data.tableId);
  }
  else if(type==='pk:invite'){
    // Notification d'invitation
    const msg='♠ '+data.hostName+' invites you to "'+data.tableName+'"';
    window.YM_toast?.(msg,'info');
    // Stocke l'invite pour affichage dans la sphère
    const inv=JSON.parse(localStorage.getItem('ym_poker_invites')||'[]');
    inv.unshift({...data,ts:Date.now()});
    localStorage.setItem('ym_poker_invites',JSON.stringify(inv.slice(0,10)));
    if(_ctx)_ctx.setNotification(inv.length);
    refreshTablesList();
  }
}

let _refreshTables=null;
function refreshTablesList(){if(_refreshTables)_refreshTables();}

// ── FULLSCREEN ─────────────────────────────────────────────────────────────
function openFullscreen(tableId){
  if(_fullscreenEl){_fullscreenEl.remove();_fullscreenEl=null;}
  const el=document.createElement('div');
  el.id='pk-fullscreen';
  el.style.cssText='position:fixed;inset:0;z-index:9990;background:#0a1628;display:flex;flex-direction:column;touch-action:none';
  document.body.appendChild(el);
  _fullscreenEl=el;
  _activeTable=tableId;
  const t=_tables[tableId];
  if(t)renderFullscreen(el,t);
}

function closeFullscreen(){
  if(_fullscreenEl){_fullscreenEl.remove();_fullscreenEl=null;}
  _activeTable=null;
}

function renderFullscreen(el,t){
  el.innerHTML='';
  if(!t){el.innerHTML='<div style="color:var(--text3);padding:24px;text-align:center">Game not found</div>';return;}

  const myP=t.players?.find(p=>p.uuid===_myUUID);
  const isHost=t.host===_myUUID;

  // ── Header ──
  const hdr=document.createElement('div');
  hdr.style.cssText='flex-shrink:0;display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(0,0,0,.4);border-bottom:1px solid rgba(255,255,255,.08)';
  hdr.innerHTML=
    '<button id="pk-close" style="background:none;border:none;color:rgba(255,255,255,.5);font-size:20px;cursor:pointer;padding:0 6px">✕</button>'+
    '<span style="font-family:var(--font-d);font-size:12px;color:var(--accent);letter-spacing:2px">'+t.name.toUpperCase()+'</span>'+
    '<span style="font-size:11px;color:var(--text3);margin-left:auto">'+t.state.toUpperCase()+'</span>'+
    '<div style="width:8px;height:8px;border-radius:50%;background:'+(t.state==='waiting'?'var(--text3)':'#30e880')+'"></div>';
  el.appendChild(hdr);
  hdr.querySelector('#pk-close').addEventListener('click',closeFullscreen);

  // ── Board ──
  const boardEl=document.createElement('div');
  boardEl.style.cssText='flex-shrink:0;display:flex;flex-direction:column;align-items:center;padding:16px;border-bottom:1px solid rgba(255,255,255,.06)';
  const cardsRow=document.createElement('div');
  cardsRow.style.cssText='display:flex;justify-content:center;gap:0;margin-bottom:10px;min-height:64px;align-items:center';
  if(t.board?.length){
    t.board.forEach(c=>cardsRow.appendChild(cardEl(c,false)));
    for(let i=t.board.length;i<5;i++){const ph=document.createElement('div');ph.style.cssText='width:40px;height:58px;border-radius:6px;background:rgba(255,255,255,.05);margin:2px;flex-shrink:0';cardsRow.appendChild(ph);}
  }else{
    for(let i=0;i<5;i++){const ph=document.createElement('div');ph.style.cssText='width:40px;height:58px;border-radius:6px;background:rgba(255,255,255,.05);margin:2px;flex-shrink:0';cardsRow.appendChild(ph);}
  }
  boardEl.appendChild(cardsRow);
  boardEl.innerHTML+='<div style="display:flex;gap:16px;font-size:12px"><span style="color:var(--text3)">POT</span><span style="color:var(--accent);font-weight:700">'+(t.pot||0)+'</span><span style="color:var(--text3)">BB</span><span style="color:var(--text2)">'+t.bb+'</span></div>';
  el.appendChild(boardEl);

  // ── Sièges ──
  const seatsEl=document.createElement('div');
  seatsEl.style.cssText='flex:1;overflow-y:auto;padding:10px;display:flex;flex-wrap:wrap;gap:8px;align-content:flex-start';
  (t.players||[]).forEach((p,i)=>{
    const isMe=p.uuid===_myUUID;
    const isCur=t.players[t.cur]?.uuid===p.uuid&&!['waiting','showdown','finished'].includes(t.state);
    const seat=document.createElement('div');
    seat.style.cssText='flex:1;min-width:130px;max-width:200px;background:rgba(255,255,255,.04);border:1px solid '+
      (isCur?'var(--accent)':isMe?'rgba(34,211,238,.5)':'rgba(255,255,255,.08)')+';border-radius:10px;padding:10px;text-align:center;opacity:'+(p.folded?.5:1);
    seat.innerHTML=
      '<div style="font-size:12px;font-weight:600;color:'+(isMe?'var(--cyan)':'var(--text)')+';margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+p.name+(isMe?' ★':'')+(i===t.dealer?' 🎯':'')+'</div>'+
      '<div style="font-size:14px;font-weight:700;color:var(--accent);margin-bottom:6px">'+p.chips+'</div>'+
      (p.bet?'<div style="font-size:10px;color:var(--text3);margin-bottom:4px">bet '+p.bet+'</div>':'')+
      '<div style="display:flex;justify-content:center;gap:2px;min-height:30px;align-items:center">'+
        (p.hand?.length?p.hand.map(c=>isMe&&c?
          '<div style="width:28px;height:40px;border-radius:4px;background:#f5f5f0;color:'+(c&&(c[1]==='♥'||c[1]==='♦')?'#c0392b':'#1a1a2e')+';display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;margin:1px;border:1px solid rgba(0,0,0,.2)"><span style="line-height:1">'+c[0]+'<br>'+c[1]+'</span></div>':
          '<div style="width:28px;height:40px;border-radius:4px;background:#1a1a3e;margin:1px;border:1px solid rgba(232,160,32,.2)"></div>').join(''):'')+
      '</div>'+
      (p.folded?'<div style="font-size:10px;color:#e84040;margin-top:4px">FOLD</div>':'')+
      (p.allIn?'<div style="font-size:10px;color:var(--accent);margin-top:4px">ALL IN</div>':'')+
      (isCur?'<div style="font-size:10px;color:var(--accent);margin-top:4px;animation:ym-pulse 1s infinite">● TURN</div>':'');
    seatsEl.appendChild(seat);
  });
  el.appendChild(seatsEl);

  // ── Actions ──
  const isMyTurn=myP&&!myP.folded&&!myP.allIn&&t.players[t.cur]?.uuid===_myUUID&&!['waiting','showdown','finished'].includes(t.state);

  const actEl=document.createElement('div');
  actEl.style.cssText='flex-shrink:0;padding:10px 12px;background:rgba(0,0,0,.4);border-top:1px solid rgba(255,255,255,.08);display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:center';

  if(t.state==='waiting'&&isHost&&t.players.length>=2){
    const startBtn=document.createElement('button');
    startBtn.className='ym-btn ym-btn-accent';
    startBtn.style.cssText='font-size:14px;padding:10px 32px;width:100%';
    startBtn.textContent='▶ Start Game ('+t.players.length+' players)';
    startBtn.addEventListener('click',()=>startGame(t.id));
    actEl.appendChild(startBtn);
  }else if(t.state==='waiting'){
    actEl.innerHTML='<div style="color:var(--text3);font-size:12px;text-align:center;width:100%">Waiting for host to start…<br>'+t.players.length+'/'+t.maxPlayers+' players</div>';
  }else if(t.state==='showdown'){
    const winners=showdown(t);
    actEl.innerHTML='<div style="color:var(--accent);font-size:14px;font-weight:700;text-align:center;width:100%">🏆 '+winners.map(w=>w.name).join(' & ')+' wins!</div>';
  }else if(t.state==='finished'){
    actEl.innerHTML='<div style="color:var(--text3);font-size:12px;text-align:center;width:100%">Game over</div>';
    const newBtn=document.createElement('button');
    newBtn.className='ym-btn ym-btn-ghost';newBtn.style.cssText='margin-top:6px;width:100%';newBtn.textContent='Close';
    newBtn.addEventListener('click',closeFullscreen);actEl.appendChild(newBtn);
  }else if(isMyTurn){
    const maxBet=Math.max(0,...Object.values(t.roundBets||{}));
    const myBet=t.roundBets?.[_myUUID]||0;
    const toCall=maxBet-myBet;

    function send(action,amount){
      if(isHost){doAction(t.id,_myUUID,action,amount);}
      else{const pid=peerOf(t.host);if(pid)st(pid,'pk:action',{tableId:t.id,uuid:_myUUID,action,amount:amount||0});}
    }

    const foldBtn=document.createElement('button');
    foldBtn.className='ym-btn ym-btn-ghost';foldBtn.style.cssText='flex:1;font-size:13px;color:#e84040;border-color:rgba(232,64,64,.3)';foldBtn.textContent='Fold';
    foldBtn.addEventListener('click',()=>send('fold'));actEl.appendChild(foldBtn);

    if(toCall===0){
      const chkBtn=document.createElement('button');
      chkBtn.className='ym-btn ym-btn-ghost';chkBtn.style.cssText='flex:1;font-size:13px';chkBtn.textContent='Check';
      chkBtn.addEventListener('click',()=>send('check'));actEl.appendChild(chkBtn);
    }else{
      const callBtn=document.createElement('button');
      callBtn.className='ym-btn ym-btn-ghost';callBtn.style.cssText='flex:1;font-size:13px';callBtn.textContent='Call '+toCall;
      callBtn.addEventListener('click',()=>send('call'));actEl.appendChild(callBtn);
    }

    const raiseRow=document.createElement('div');
    raiseRow.style.cssText='display:flex;gap:6px;width:100%';
    raiseRow.innerHTML=
      '<input type="number" id="pk-raise" class="ym-input" style="flex:1;font-size:12px" placeholder="Raise amount" min="'+t.bb+'" step="'+t.bb+'" value="'+(t.bb*2)+'">'+
      '<button class="ym-btn ym-btn-accent" id="pk-do-raise" style="font-size:13px;flex:1">Raise</button>'+
      '<button class="ym-btn ym-btn-ghost" id="pk-allin" style="font-size:13px">All In</button>';
    actEl.appendChild(raiseRow);
    raiseRow.querySelector('#pk-do-raise').addEventListener('click',()=>{
      const amt=parseInt(raiseRow.querySelector('#pk-raise').value)||t.bb*2;
      send('raise',amt);
    });
    raiseRow.querySelector('#pk-allin').addEventListener('click',()=>send('allin'));
  }else{
    actEl.innerHTML='<div style="color:var(--text3);font-size:11px;text-align:center;width:100%">Waiting for '+(t.players[t.cur]?.name||'…')+'</div>';
  }

  // Bouton inviter si host
  if(isHost&&t.state==='waiting'){
    const invBtn=document.createElement('button');
    invBtn.className='ym-btn ym-btn-ghost';invBtn.style.cssText='font-size:11px;width:100%;margin-top:4px';
    invBtn.textContent='✉ Invite contacts';
    invBtn.addEventListener('click',()=>{
      getContacts().forEach(c=>{
        const pid=peerOf(c.uuid);
        if(pid)st(pid,'pk:invite',{tableId:t.id,hostUUID:_myUUID,hostName:_myName,tableName:t.name});
      });
      window.YM_toast?.('Invites sent','success');
    });
    actEl.appendChild(invBtn);
  }

  el.appendChild(actEl);
}

// ── PANEL ──────────────────────────────────────────────────────────────────
function renderPanel(container){
  _panelEl=container;
  container.style.cssText='display:flex;flex-direction:column;height:100%';
  container.innerHTML='';

  if(!document.getElementById('pk-css')){
    const s=document.createElement('style');s.id='pk-css';
    s.textContent='@keyframes ym-pulse{0%,100%{opacity:1}50%{opacity:.4}}';
    document.head.appendChild(s);
  }

  const TABS=[['tables','♠ Tables'],['scores','🏆 Scores']];
  let curTab='tables';

  const track=document.createElement('div');
  track.style.cssText='flex:1;overflow:hidden;min-height:0;display:flex;flex-direction:column';
  container.appendChild(track);

  const tabs=document.createElement('div');
  tabs.className='ym-tabs';
  tabs.style.cssText='border-top:1px solid rgba(232,160,32,.12);margin:0;flex-shrink:0';
  TABS.forEach(([id,label])=>{
    const t=document.createElement('div');
    t.className='ym-tab'+(id==='tables'?' active':'');
    t.dataset.tab=id;t.textContent=label;
    t.addEventListener('click',()=>{
      curTab=id;
      tabs.querySelectorAll('.ym-tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===id));
      track.innerHTML='';
      if(id==='tables')renderTablesTab(track);
      else renderScoresTab(track);
    });
    tabs.appendChild(t);
  });
  container.appendChild(tabs);

  renderTablesTab(track);
  Object.values(_tables).filter(t=>t.host===_myUUID).forEach(t=>bc('pk:announce',tablePub(t)));
}

function renderTablesTab(container){
  container.innerHTML='';
  const hdr=document.createElement('div');
  hdr.style.cssText='flex-shrink:0;padding:10px 14px;display:flex;gap:8px';
  hdr.innerHTML=
    '<button id="pk-new" class="ym-btn ym-btn-accent" style="flex:1;font-size:12px">+ New Table</button>'+
    '<button id="pk-scan" class="ym-btn ym-btn-ghost" style="padding:6px 10px;font-size:16px" title="Scan">↺</button>';
  container.appendChild(hdr);

  // Invitations reçues
  const invites=JSON.parse(localStorage.getItem('ym_poker_invites')||'[]');
  if(invites.length){
    const invEl=document.createElement('div');
    invEl.style.cssText='padding:8px 14px;background:rgba(232,160,32,.06);border-bottom:1px solid var(--border)';
    invEl.innerHTML='<div style="font-size:10px;color:var(--accent);margin-bottom:6px;text-transform:uppercase;letter-spacing:1px">Invitations</div>';
    invites.forEach((inv,i)=>{
      const row=document.createElement('div');
      row.style.cssText='display:flex;align-items:center;gap:8px;padding:4px 0';
      row.innerHTML=
        '<span style="font-size:12px;flex:1">♠ <b>'+inv.hostName+'</b> — '+inv.tableName+'</span>'+
        '<button data-acc="'+i+'" class="ym-btn ym-btn-accent" style="font-size:11px;padding:3px 10px">Join</button>'+
        '<button data-dec="'+i+'" class="ym-btn ym-btn-ghost" style="font-size:11px;padding:3px 8px">✕</button>';
      row.querySelector('[data-acc]').addEventListener('click',()=>{
        const pid=peerOf(inv.hostUUID);
        if(pid)st(pid,'pk:join-req',{tableId:inv.tableId,uuid:_myUUID,name:_myName});
        const arr=JSON.parse(localStorage.getItem('ym_poker_invites')||'[]');
        arr.splice(i,1);localStorage.setItem('ym_poker_invites',JSON.stringify(arr));
        _ctx?.setNotification(arr.length||0);
        renderTablesTab(container);
      });
      row.querySelector('[data-dec]').addEventListener('click',()=>{
        const arr=JSON.parse(localStorage.getItem('ym_poker_invites')||'[]');
        arr.splice(i,1);localStorage.setItem('ym_poker_invites',JSON.stringify(arr));
        _ctx?.setNotification(arr.length||0);
        renderTablesTab(container);
      });
      invEl.appendChild(row);
    });
    container.appendChild(invEl);
  }

  const list=document.createElement('div');
  list.style.cssText='flex:1;overflow-y:auto;padding:8px 14px';
  container.appendChild(list);

  _refreshTables=()=>renderTablesList(list);
  renderTablesList(list);

  hdr.querySelector('#pk-new').addEventListener('click',()=>{
    const name=prompt('Table name:','Table '+(Object.keys(_tables).length+1));
    if(name===null)return;
    const t=mkTable({name:name.trim()||'Table'});
    _tables[t.id]=t;bc('pk:announce',tablePub(t));
    renderTablesList(list);
    openFullscreen(t.id);
  });
  hdr.querySelector('#pk-scan').addEventListener('click',()=>{
    bc('pk:scan',{});renderTablesList(list);
  });
}

function renderTablesList(list){
  list.innerHTML='';
  const tables=Object.values(_tables).filter(t=>t.state!=='finished');
  if(!tables.length){
    list.innerHTML='<div style="color:var(--text3);font-size:12px;padding:16px;text-align:center">No tables yet.<br>Create one or wait for nearby players.</div>';
    return;
  }
  tables.sort((a,b)=>b.ts-a.ts).forEach(t=>{
    const isHost=t.host===_myUUID;
    const joined=t.players?.some(p=>p.uuid===_myUUID);
    const card=document.createElement('div');
    card.className='ym-card';card.style.cssText='margin-bottom:8px;cursor:pointer';
    card.innerHTML=
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">'+
        '<b style="font-size:14px">♠ '+t.name+'</b>'+
        '<span style="font-size:11px;background:rgba(232,160,32,.15);padding:2px 8px;border-radius:999px;color:var(--accent)">'+
          (t.players?.length||'?')+'/'+t.maxPlayers+
        '</span>'+
      '</div>'+
      '<div style="font-size:11px;color:var(--text3);margin-bottom:8px">'+t.state.toUpperCase()+' · BB '+t.bb+'</div>'+
      '<div style="display:flex;gap:6px">'+
        (joined?'<button data-open="'+t.id+'" class="ym-btn ym-btn-accent" style="flex:1;font-size:12px">▶ Open</button>':'')+
        (!joined&&t.state==='waiting'?'<button data-join="'+t.id+'" class="ym-btn ym-btn-ghost" style="flex:1;font-size:12px">Join</button>':'')+
      '</div>';
    card.querySelector('[data-open]')?.addEventListener('click',e=>{
      e.stopPropagation();openFullscreen(e.target.dataset.open);
    });
    card.querySelector('[data-join]')?.addEventListener('click',e=>{
      e.stopPropagation();
      const tbl=_tables[e.target.dataset.join];if(!tbl)return;
      const pid=peerOf(tbl.host);
      if(!pid){window.YM_toast?.('Host not reachable','error');return;}
      st(pid,'pk:join-req',{tableId:tbl.id,uuid:_myUUID,name:_myName});
    });
    list.appendChild(card);
  });
}

function renderScoresTab(container){
  container.style.cssText='flex:1;overflow-y:auto;padding:14px';
  container.innerHTML='';
  const scores=loadScores();
  if(!scores.length){container.innerHTML='<div style="color:var(--text3);font-size:12px;padding:8px">No games played yet.</div>';return;}
  scores.forEach(s=>{
    const el=document.createElement('div');
    el.style.cssText='display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.05);font-size:12px';
    el.innerHTML=
      '<span style="flex:1">'+s.table+'</span>'+
      '<span style="color:var(--accent)">🏆 '+(s.winners||[s.winner]).join(' & ')+'</span>'+
      '<span style="background:rgba(232,160,32,.15);padding:1px 7px;border-radius:999px;color:var(--accent);font-size:11px">'+s.pot+'</span>'+
      '<span style="color:var(--text3);font-size:10px">'+new Date(s.ts).toLocaleDateString()+'</span>';
    container.appendChild(el);
  });
}

// ── SPHERE ─────────────────────────────────────────────────────────────────
window.YM_S['poker.sphere.js']={
  name:'Poker',icon:'♠',category:'Games',
  description:'Texas Hold\'em P2P fullscreen — invite nearby contacts',
  emit:[],receive:[],

  activate(ctx){
    _ctx=ctx;
    _myUUID=ctx.loadProfile?.()?.uuid||gid();
    _myName=ctx.loadProfile?.()?.name||'Player';
    ctx.onReceive(onReceive);
    // Notifications d'invites en attente
    const inv=JSON.parse(localStorage.getItem('ym_poker_invites')||'[]');
    if(inv.length)ctx.setNotification(inv.length);
  },
  deactivate(){
    closeFullscreen();_ctx=null;_panelEl=null;_refreshTables=null;
  },
  renderPanel,

  profileSection(container){
    // Bouton inviter depuis la fiche profil d'un contact
    const myTables=Object.values(_tables).filter(t=>t.host===_myUUID&&t.state==='waiting');
    if(!myTables.length){
      const el=document.createElement('div');
      el.style.cssText='display:flex;gap:6px';
      el.innerHTML='<div style="font-size:12px;color:var(--text3);flex:1">No open table</div>'+
        '<button id="ps-pk-new" class="ym-btn ym-btn-ghost" style="font-size:11px">Create</button>';
      el.querySelector('#ps-pk-new').addEventListener('click',()=>{
        const t=mkTable({name:_myName+"'s Table"});
        _tables[t.id]=t;bc('pk:announce',tablePub(t));
        window.YM?.openSpherePanel?.('poker.sphere.js');
        setTimeout(()=>openFullscreen(t.id),300);
      });
      container.appendChild(el);
    }else{
      // Montré dans la fiche du contact peer
      const btn=document.createElement('button');
      btn.className='ym-btn ym-btn-accent';
      btn.style.cssText='width:100%;font-size:12px';
      btn.textContent='♠ Invite to '+myTables[0].name;
      // Note: ce bouton est affiché dans MA section de profil
      // L'invitation vers un contact se fait via le bouton dans renderProfileView de social
      btn.addEventListener('click',()=>{window.YM?.openSpherePanel?.('poker.sphere.js');});
      container.appendChild(btn);
    }
  }
};

// Expose pour que social.sphere.js puisse envoyer une invite depuis la fiche profil
window.YM_Poker={
  inviteContact(uuid){
    const myTables=Object.values(_tables).filter(t=>t.host===_myUUID&&t.state==='waiting');
    if(!myTables.length){
      window.YM_toast?.('Create a table first','warn');
      window.YM?.openSpherePanel?.('poker.sphere.js');return;
    }
    const t=myTables[0];
    const pid=peerOf(uuid);
    if(!pid){window.YM_toast?.('Player not reachable','error');return;}
    st(pid,'pk:invite',{tableId:t.id,hostUUID:_myUUID,hostName:_myName,tableName:t.name});
    window.YM_toast?.('Invite sent!','success');
  }
};
})();
