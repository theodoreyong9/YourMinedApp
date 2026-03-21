/* jshint esversion:11, browser:true */
// poker.sphere.js — YourMine Poker
// Texas Hold'em P2P multi-table fullscreen
// Onglet 1: Tables (invitations, rejoindre)
// Onglet 2: Jeu (fullscreen)
// Onglet 3: Config & scores
(function(){
'use strict';
window.YM_S = window.YM_S || {};

const SCORES_KEY = 'ym_poker_scores_v1';
const TABLES_KEY = 'ym_poker_tables_v1';

let _ctx = null;
let _myUUID = null;
let _myName = null;
let _tables = {}; // {tableId: {id,host,players,state,pot,board,bets,round,...}}
let _activeTable = null;
let _panelContainer = null;
let _currentTab = 'tables';

// ── SCORES ─────────────────────────────────────────────────────────────────
function loadScores(){try{return JSON.parse(localStorage.getItem(SCORES_KEY)||'[]');}catch(e){return[];}}
function addScore(entry){const s=loadScores();s.unshift(entry);localStorage.setItem(SCORES_KEY,JSON.stringify(s.slice(0,50)));}

// ── DECK ───────────────────────────────────────────────────────────────────
const SUITS=['♠','♥','♦','♣'];
const RANKS=['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
function newDeck(){const d=[];SUITS.forEach(s=>RANKS.forEach(r=>d.push({r,s})));return d;}
function shuffle(arr){for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}return arr;}
function cardHtml(card,faceDown){
  if(faceDown||!card)return '<div class="pk-card pk-back">🂠</div>';
  const red=card.s==='♥'||card.s==='♦';
  return '<div class="pk-card" style="color:'+(red?'#e84040':'#fff')+'">'+(card.r+card.s)+'</div>';
}

// ── P2P ────────────────────────────────────────────────────────────────────
function broadcast(type,data){
  if(!window.YM_P2P)return;
  try{window.YM_P2P.broadcast({sphere:'poker.sphere.js',type,data});}catch(e){}
}
function sendTo(peerId,type,data){
  if(!window.YM_P2P||!peerId)return;
  try{window.YM_P2P.sendTo(peerId,{sphere:'poker.sphere.js',type,data});}catch(e){}
}
function getPeerId(uuid){return window.YM_Social?._nearUsers?.get(uuid)?.peerId||null;}

// ── TABLE MANAGEMENT ───────────────────────────────────────────────────────
function gid(){return 'pk-'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);}

function createTable(opts){
  const id=gid();
  const table={
    id,host:_myUUID,
    players:[{uuid:_myUUID,name:_myName,chips:opts.chips||1000,bet:0,folded:false,allIn:false,hand:[]}],
    maxPlayers:opts.maxPlayers||6,
    state:'waiting', // waiting|preflop|flop|turn|river|showdown
    deck:[],board:[],pot:0,bets:{},
    currentPlayer:0,dealer:0,round:0,
    bigBlind:opts.bigBlind||20,smallBlind:opts.smallBlind||10,
    ts:Date.now(),name:opts.name||'Table '+Object.keys(_tables).length+1,
  };
  _tables[id]=table;
  broadcast('pk:table-announce',tablePublic(table));
  return table;
}

function tablePublic(t){
  return {id:t.id,host:t.host,name:t.name,playerCount:t.players.length,
    maxPlayers:t.maxPlayers,state:t.state,bigBlind:t.bigBlind,ts:t.ts,
    players:t.players.map(p=>({uuid:p.uuid,name:p.name,chips:p.chips}))};
}

// ── GAME LOGIC (host only) ─────────────────────────────────────────────────
function startGame(tableId){
  const t=_tables[tableId];
  if(!t||t.host!==_myUUID||t.players.length<2)return;
  t.state='preflop';
  t.deck=shuffle(newDeck());
  t.board=[];t.pot=0;t.bets={};
  t.players.forEach(p=>{p.folded=false;p.allIn=false;p.bet=0;p.hand=[t.deck.pop(),t.deck.pop()];});
  t.dealer=(t.dealer+1)%t.players.length;
  t.currentPlayer=(t.dealer+3)%t.players.length; // after big blind
  // Blinds
  const sb=t.players[(t.dealer+1)%t.players.length];
  const bb=t.players[(t.dealer+2)%t.players.length];
  postBlind(t,sb,t.smallBlind);
  postBlind(t,bb,t.bigBlind);
  broadcastTableState(t);
}

function postBlind(t,player,amount){
  const a=Math.min(amount,player.chips);
  player.chips-=a;player.bet+=a;t.pot+=a;t.bets[player.uuid]=(t.bets[player.uuid]||0)+a;
}

function hostAction(tableId,playerUUID,action,amount){
  const t=_tables[tableId];
  if(!t||t.host!==_myUUID)return;
  const pi=t.players.findIndex(p=>p.uuid===playerUUID);
  if(pi<0||t.players[pi].folded)return;
  const p=t.players[pi];
  const maxBet=Math.max(...Object.values(t.bets).concat(0));

  if(action==='fold'){p.folded=true;}
  else if(action==='call'){
    const toCall=maxBet-(t.bets[playerUUID]||0);
    const a=Math.min(toCall,p.chips);p.chips-=a;p.bet+=a;t.pot+=a;t.bets[playerUUID]=(t.bets[playerUUID]||0)+a;
    if(p.chips===0)p.allIn=true;
  }
  else if(action==='check'){}
  else if(action==='raise'&&amount>0){
    const a=Math.min(amount,p.chips);p.chips-=a;p.bet+=a;t.pot+=a;t.bets[playerUUID]=(t.bets[playerUUID]||0)+a;
    if(p.chips===0)p.allIn=true;
  }

  // Avance le tour
  nextPlayer(t);
}

function nextPlayer(t){
  const active=t.players.filter(p=>!p.folded&&!p.allIn);
  if(active.length<=1){endRound(t);return;}
  const maxBet=Math.max(...Object.values(t.bets).concat(0));
  const allCalled=t.players.every(p=>p.folded||p.allIn||(t.bets[p.uuid]||0)>=maxBet);

  if(allCalled){
    // Avance phase
    if(t.state==='preflop'){t.state='flop';t.board.push(t.deck.pop(),t.deck.pop(),t.deck.pop());}
    else if(t.state==='flop'){t.state='turn';t.board.push(t.deck.pop());}
    else if(t.state==='turn'){t.state='river';t.board.push(t.deck.pop());}
    else if(t.state==='river'){endRound(t);return;}
    t.bets={};t.players.forEach(p=>{if(!p.folded)t.bets[p.uuid]=0;});
    t.currentPlayer=(t.dealer+1)%t.players.length;
    while(t.players[t.currentPlayer].folded)t.currentPlayer=(t.currentPlayer+1)%t.players.length;
  }else{
    do{t.currentPlayer=(t.currentPlayer+1)%t.players.length;}
    while(t.players[t.currentPlayer].folded||t.players[t.currentPlayer].allIn);
  }
  broadcastTableState(t);
}

function endRound(t){
  t.state='showdown';
  // Simplifié : le joueur non-fold avec le plus de chips gagne (à remplacer par vrai hand evaluator)
  const winners=t.players.filter(p=>!p.folded);
  if(winners.length===1){
    winners[0].chips+=t.pot;
    addScore({table:t.name,winner:winners[0].name,pot:t.pot,ts:Date.now()});
  }else{
    // Distribue équitablement pour simplifier
    const share=Math.floor(t.pot/winners.length);
    winners.forEach(w=>w.chips+=share);
  }
  t.pot=0;
  broadcastTableState(t);
  // Élimine les joueurs à 0
  t.players=t.players.filter(p=>p.chips>0);
  if(t.players.length>=2){
    setTimeout(()=>{t.state='waiting';broadcastTableState(t);},4000);
  }else{
    t.state='finished';broadcastTableState(t);
  }
}

function broadcastTableState(t){
  // Envoie l'état complet à chaque joueur (les mains des autres cachées)
  t.players.forEach(p=>{
    const peerId=getPeerId(p.uuid);
    if(!peerId&&p.uuid!==_myUUID)return;
    const state={
      ...t,
      players:t.players.map(pl=>({
        uuid:pl.uuid,name:pl.name,chips:pl.chips,bet:pl.bet,
        folded:pl.folded,allIn:pl.allIn,
        hand:pl.uuid===p.uuid?pl.hand:pl.hand.map(()=>null) // cache les autres mains
      }))
    };
    if(p.uuid===_myUUID){handleTableState(state);}
    else{sendTo(peerId,'pk:state',state);}
  });
}

// ── RECEIVE ────────────────────────────────────────────────────────────────
function handleReceive(type,data,peerId){
  if(type==='pk:table-announce'){
    if(!_tables[data.id])_tables[data.id]={...data,_remote:true};
    refreshTablesUI();
  }
  else if(type==='pk:join-req'){
    const t=_tables[data.tableId];
    if(!t||t.host!==_myUUID||t.state!=='waiting')return;
    if(t.players.length>=t.maxPlayers){sendTo(peerId,'pk:join-res',{ok:false,reason:'Table full'});return;}
    t.players.push({uuid:data.uuid,name:data.name,chips:t.bigBlind*50,bet:0,folded:false,allIn:false,hand:[]});
    sendTo(peerId,'pk:join-res',{ok:true,table:t});
    broadcast('pk:table-announce',tablePublic(t));
    broadcastTableState(t);
  }
  else if(type==='pk:join-res'){
    if(!data.ok){window.YM_toast?.('Join failed: '+data.reason,'error');return;}
    _tables[data.table.id]=data.table;
    _activeTable=data.table.id;
    renderActiveTable();
  }
  else if(type==='pk:state'){
    handleTableState(data);
  }
  else if(type==='pk:action'){
    hostAction(data.tableId,data.uuid,data.action,data.amount);
  }
  else if(type==='pk:start'){
    if(_tables[data.tableId]&&_tables[data.tableId].host===_myUUID)startGame(data.tableId);
  }
  else if(type==='pk:invite'){
    window.YM_toast?.('♠ Poker invite from '+data.hostName+' — table "'+data.tableName+'"','info');
  }
}

function handleTableState(state){
  if(!_tables[state.id])_tables[state.id]=state;
  else Object.assign(_tables[state.id],state);
  if(_activeTable===state.id)renderActiveTable();
}

// ── RENDER ─────────────────────────────────────────────────────────────────
function refreshTablesUI(){
  if(_panelContainer&&_currentTab==='tables')renderTablesTab(_panelContainer.querySelector('#pk-tab-content'));
}

function renderPanel(container){
  _panelContainer=container;
  container.style.cssText='display:flex;flex-direction:column;height:100%;background:var(--bg)';
  container.innerHTML='';

  // CSS poker
  if(!document.getElementById('pk-css')){
    const s=document.createElement('style');s.id='pk-css';
    s.textContent=`
      .pk-card{display:inline-flex;align-items:center;justify-content:center;
        width:36px;height:52px;background:#1a1a2e;border:1px solid rgba(255,255,255,.2);
        border-radius:6px;font-size:13px;font-weight:700;margin:2px;box-shadow:0 2px 8px rgba(0,0,0,.4)}
      .pk-back{color:var(--accent);font-size:20px;background:rgba(232,160,32,.1)}
      .pk-chip{display:inline-block;background:var(--accent);color:#000;border-radius:999px;
        font-size:10px;font-weight:700;padding:2px 8px}
      .pk-seat{background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:var(--r);
        padding:8px;text-align:center;flex:1;min-width:0}
      .pk-seat.active{border-color:var(--accent);background:rgba(232,160,32,.08)}
      .pk-seat.folded{opacity:.4}
    `;
    document.head.appendChild(s);
  }

  const TABS=[['tables','♠ Tables'],['game','▶ Game'],['config','⚙ Config']];

  const content=document.createElement('div');
  content.id='pk-tab-content';
  content.style.cssText='flex:1;overflow:hidden;min-height:0;display:flex;flex-direction:column';
  container.appendChild(content);

  const tabs=document.createElement('div');
  tabs.className='ym-tabs';
  tabs.style.cssText='border-top:1px solid rgba(232,160,32,.12);border-bottom:none;margin:0;flex-shrink:0';
  TABS.forEach(([id,label])=>{
    const t=document.createElement('div');
    t.className='ym-tab'+(id==='tables'?' active':'');
    t.dataset.tab=id;t.textContent=label;
    t.addEventListener('click',()=>{
      _currentTab=id;
      tabs.querySelectorAll('.ym-tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===id));
      content.innerHTML='';
      if(id==='tables')renderTablesTab(content);
      else if(id==='game')renderActiveTable();
      else renderConfigTab(content);
    });
    tabs.appendChild(t);
  });
  container.appendChild(tabs);

  renderTablesTab(content);
  // Announce nos tables
  Object.values(_tables).filter(t=>t.host===_myUUID).forEach(t=>broadcast('pk:table-announce',tablePublic(t)));
}

function renderTablesTab(container){
  container.innerHTML='';
  container.style.cssText='display:flex;flex-direction:column;height:100%;overflow:hidden';

  const hdr=document.createElement('div');
  hdr.style.cssText='padding:12px 14px;flex-shrink:0;display:flex;gap:8px';
  hdr.innerHTML=
    '<button id="pk-create" class="ym-btn ym-btn-accent" style="flex:1;font-size:12px">+ New Table</button>'+
    '<button id="pk-refresh" class="ym-btn ym-btn-ghost" style="padding:6px 10px;font-size:16px" title="Refresh">↺</button>';
  container.appendChild(hdr);

  const list=document.createElement('div');
  list.style.cssText='flex:1;overflow-y:auto;padding:0 14px';
  container.appendChild(list);

  function renderList(){
    list.innerHTML='';
    const tables=Object.values(_tables).filter(t=>t.state!=='finished');
    if(!tables.length){
      list.innerHTML='<div style="color:var(--text3);font-size:12px;padding:16px;text-align:center">No tables yet.<br>Create one or wait for nearby players.</div>';
      return;
    }
    tables.forEach(t=>{
      const isHost=t.host===_myUUID;
      const isJoined=t.players?.some(p=>p.uuid===_myUUID);
      const card=document.createElement('div');
      card.className='ym-card';
      card.style.cssText='margin-bottom:8px;cursor:pointer';
      card.innerHTML=
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">'+
          '<span style="font-weight:600;font-size:14px">♠ '+(t.name||t.id)+'</span>'+
          '<span class="pk-chip">'+(t.playerCount||t.players?.length||0)+'/'+t.maxPlayers+'</span>'+
        '</div>'+
        '<div style="font-size:11px;color:var(--text3);margin-bottom:8px">Blinds: '+(t.smallBlind||10)+'/'+( t.bigBlind||20)+' — State: '+t.state+'</div>'+
        '<div style="display:flex;gap:6px">'+
          (isHost&&t.state==='waiting'?'<button data-start="'+t.id+'" class="ym-btn ym-btn-accent" style="font-size:11px;flex:1">▶ Start</button>':'') +
          (isHost&&t.state==='waiting'?'<button data-invite="'+t.id+'" class="ym-btn ym-btn-ghost" style="font-size:11px;flex:1">✉ Invite</button>':'') +
          (!isJoined&&t.state==='waiting'?'<button data-join="'+t.id+'" class="ym-btn ym-btn-ghost" style="font-size:11px;flex:1">Join</button>':'') +
          (isJoined?'<button data-open="'+t.id+'" class="ym-btn ym-btn-ghost" style="font-size:11px;flex:1">▶ Open</button>':'') +
        '</div>';

      card.querySelector('[data-start]')?.addEventListener('click',e=>{
        e.stopPropagation();startGame(e.target.dataset.start);renderList();
      });
      card.querySelector('[data-join]')?.addEventListener('click',e=>{
        e.stopPropagation();
        const tbl=_tables[e.target.dataset.join];
        if(!tbl)return;
        const hostPeer=getPeerId(tbl.host);
        if(!hostPeer){window.YM_toast?.('Host not reachable','error');return;}
        sendTo(hostPeer,'pk:join-req',{tableId:tbl.id,uuid:_myUUID,name:_myName});
      });
      card.querySelector('[data-open]')?.addEventListener('click',e=>{
        e.stopPropagation();
        _activeTable=e.target.dataset.open;
        _currentTab='game';
        _panelContainer.querySelectorAll('.ym-tab').forEach(x=>x.classList.toggle('active',x.dataset.tab==='game'));
        const content=_panelContainer.querySelector('#pk-tab-content');
        content.innerHTML='';renderActiveTable();
      });
      card.querySelector('[data-invite]')?.addEventListener('click',e=>{
        e.stopPropagation();
        const tbl=_tables[e.target.dataset.invite];
        const contacts=JSON.parse(localStorage.getItem('ym_contacts_v1')||'[]');
        contacts.forEach(c=>{
          const peerId=getPeerId(c.uuid);
          if(peerId)sendTo(peerId,'pk:invite',{tableId:tbl.id,hostName:_myName,tableName:tbl.name});
        });
        window.YM_toast?.('Invite sent to contacts','success');
      });
      list.appendChild(card);
    });
  }

  hdr.querySelector('#pk-create').addEventListener('click',()=>{
    const name=prompt('Table name:','Table '+(Object.keys(_tables).length+1));
    if(name===null)return;
    const t=createTable({name:name.trim()||'Table',chips:1000,bigBlind:20,smallBlind:10,maxPlayers:6});
    _activeTable=t.id;renderList();
  });
  hdr.querySelector('#pk-refresh').addEventListener('click',()=>{
    broadcast('pk:table-announce',{id:'__scan__'});renderList();
  });

  renderList();
}

function renderActiveTable(){
  const content=_panelContainer?.querySelector('#pk-tab-content');
  if(!content)return;
  if(_currentTab!=='game')return;
  content.innerHTML='';
  content.style.cssText='display:flex;flex-direction:column;height:100%;overflow:hidden;background:#0a1628';

  if(!_activeTable||!_tables[_activeTable]){
    content.innerHTML='<div style="color:var(--text3);font-size:13px;padding:24px;text-align:center">No active game.<br>Join or create a table.</div>';
    return;
  }

  const t=_tables[_activeTable];
  const myPlayer=t.players?.find(p=>p.uuid===_myUUID);

  // Board
  const boardEl=document.createElement('div');
  boardEl.style.cssText='flex-shrink:0;padding:16px;text-align:center;border-bottom:1px solid rgba(255,255,255,.06)';
  boardEl.innerHTML=
    '<div style="font-size:10px;color:var(--text3);margin-bottom:4px">'+t.name+' — '+t.state.toUpperCase()+'</div>'+
    '<div style="margin-bottom:8px">'+
      (t.board?.length?t.board.map(c=>cardHtml(c,false)).join(''):'<span style="color:var(--text3);font-size:12px">Waiting for cards…</span>')+
    '</div>'+
    '<div style="font-size:12px;color:var(--accent)"><span class="pk-chip">POT: '+(t.pot||0)+'</span></div>';
  content.appendChild(boardEl);

  // Sièges
  const seatsEl=document.createElement('div');
  seatsEl.style.cssText='flex:1;overflow-y:auto;padding:10px 12px;display:flex;flex-wrap:wrap;gap:8px;align-content:flex-start';
  (t.players||[]).forEach(p=>{
    const isMe=p.uuid===_myUUID;
    const isCur=t.players[t.currentPlayer]?.uuid===p.uuid&&(t.state!=='waiting'&&t.state!=='showdown');
    const seat=document.createElement('div');
    seat.className='pk-seat'+(isCur?' active':'')+(p.folded?' folded':'');
    seat.style.cssText+=(isMe?';border-color:var(--cyan)':'');
    seat.innerHTML=
      '<div style="font-size:11px;font-weight:600;margin-bottom:4px;color:'+(isMe?'var(--cyan)':'var(--text)')+'">'+p.name+(isMe?' (you)':'')+'</div>'+
      '<div class="pk-chip" style="margin-bottom:6px">'+p.chips+'</div>'+
      (p.bet?'<div style="font-size:10px;color:var(--text3)">bet: '+p.bet+'</div>':'')+
      '<div style="margin-top:4px">'+
        (isMe&&p.hand?.length?p.hand.map(c=>cardHtml(c,false)).join('')
          :p.hand?.length?p.hand.map(()=>cardHtml(null,true)).join(''):'')
      +'</div>'+
      (p.folded?'<div style="font-size:10px;color:#e84040;margin-top:2px">FOLD</div>':'')+
      (p.allIn?'<div style="font-size:10px;color:var(--accent);margin-top:2px">ALL IN</div>':'');
    seatsEl.appendChild(seat);
  });
  content.appendChild(seatsEl);

  // Actions (seulement si c'est mon tour ou si je suis host)
  const isMyTurn=t.players?.[t.currentPlayer]?.uuid===_myUUID&&t.state!=='waiting'&&t.state!=='showdown'&&t.state!=='finished';
  const isHost=t.host===_myUUID;

  if(isMyTurn||isHost){
    const actEl=document.createElement('div');
    actEl.style.cssText='flex-shrink:0;padding:10px 12px;border-top:1px solid rgba(255,255,255,.08);display:flex;gap:6px;flex-wrap:wrap;background:rgba(0,0,0,.3)';
    const maxBet=Math.max(...Object.values(t.bets||{}).concat(0));
    const myBet=t.bets?.[_myUUID]||0;
    const toCall=maxBet-myBet;

    if(isMyTurn){
      if(toCall===0){
        actEl.innerHTML+='<button data-act="check" class="ym-btn ym-btn-ghost" style="flex:1;font-size:12px">Check</button>';
      }else{
        actEl.innerHTML+='<button data-act="fold" class="ym-btn ym-btn-ghost" style="flex:1;font-size:12px;color:#e84040">Fold</button>'+
          '<button data-act="call" class="ym-btn ym-btn-ghost" style="flex:1;font-size:12px">Call '+toCall+'</button>';
      }
      actEl.innerHTML+=
        '<div style="display:flex;gap:4px;flex:2;min-width:120px">'+
          '<input type="number" id="pk-raise-amt" class="ym-input" placeholder="Raise" style="flex:1;font-size:11px" min="'+(t.bigBlind||20)+'" step="'+(t.bigBlind||20)+'">'+
          '<button data-act="raise" class="ym-btn ym-btn-accent" style="font-size:12px">Raise</button>'+
        '</div>';
    }
    if(isHost&&t.state==='waiting'&&(t.players?.length||0)>=2){
      actEl.innerHTML+='<button id="pk-host-start" class="ym-btn ym-btn-accent" style="width:100%;font-size:13px;margin-top:4px">▶ Start Game</button>';
    }
    content.appendChild(actEl);

    actEl.querySelectorAll('[data-act]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const action=btn.dataset.act;
        const amount=action==='raise'?parseInt(actEl.querySelector('#pk-raise-amt')?.value||0):0;
        if(isHost){
          hostAction(_activeTable,_myUUID,action,amount);
        }else{
          const hostPeer=getPeerId(t.host);
          sendTo(hostPeer,'pk:action',{tableId:_activeTable,uuid:_myUUID,action,amount});
        }
      });
    });
    actEl.querySelector('#pk-host-start')?.addEventListener('click',()=>startGame(_activeTable));
  }
}

function renderConfigTab(container){
  container.innerHTML='';
  container.style.cssText='flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:12px';

  // Scores
  const scores=loadScores();
  const scoresEl=document.createElement('div');
  scoresEl.className='ym-card';
  scoresEl.innerHTML='<div class="ym-card-title">Score History</div>';
  if(!scores.length){
    scoresEl.innerHTML+='<div style="color:var(--text3);font-size:12px">No games played yet.</div>';
  }else{
    scores.slice(0,20).forEach(s=>{
      const row=document.createElement('div');
      row.style.cssText='display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:12px';
      row.innerHTML=
        '<span>'+s.table+'</span>'+
        '<span style="color:var(--accent)">🏆 '+s.winner+'</span>'+
        '<span class="pk-chip">'+s.pot+'</span>'+
        '<span style="color:var(--text3)">'+new Date(s.ts).toLocaleDateString()+'</span>';
      scoresEl.appendChild(row);
    });
  }
  container.appendChild(scoresEl);

  // Clear scores
  const clrBtn=document.createElement('button');
  clrBtn.className='ym-btn ym-btn-ghost';
  clrBtn.style.cssText='font-size:11px';
  clrBtn.textContent='Clear score history';
  clrBtn.addEventListener('click',()=>{localStorage.removeItem(SCORES_KEY);renderConfigTab(container);});
  container.appendChild(clrBtn);
}

// ── SPHERE ─────────────────────────────────────────────────────────────────
window.YM_S['poker.sphere.js']={
  name:'Poker',
  icon:'♠',
  category:'Games',
  description:'Texas Hold\'em P2P — multi-table, nearby players',
  author:'yourmine',
  emit:[],receive:[],

  activate(ctx){
    _ctx=ctx;
    _myUUID=ctx.loadProfile?.()?.uuid||'unknown';
    _myName=ctx.loadProfile?.()?.name||'Player';
    ctx.onReceive((type,data,peerId)=>handleReceive(type,data,peerId));
    // Annonce les tables existantes
    Object.values(_tables).filter(t=>t.host===_myUUID).forEach(t=>broadcast('pk:table-announce',tablePublic(t)));
  },

  deactivate(){_ctx=null;_panelContainer=null;},

  renderPanel,

  profileSection(container){
    const scores=loadScores();
    const el=document.createElement('div');
    el.style.cssText='font-size:12px;color:var(--text2)';
    el.innerHTML=scores.length
      ?'🏆 '+scores.length+' game'+(scores.length>1?'s':'')+' played'
      :'No games yet';
    container.appendChild(el);
    // Bouton inviter à une partie
    const myTables=Object.values(_tables).filter(t=>t.host===_myUUID&&t.state==='waiting');
    if(myTables.length){
      const btn=document.createElement('button');
      btn.className='ym-btn ym-btn-ghost';
      btn.style.cssText='width:100%;font-size:12px;margin-top:6px';
      btn.textContent='♠ Invite to '+myTables[0].name;
      btn.addEventListener('click',()=>{window.YM?.openSpherePanel?.('poker.sphere.js');});
      container.appendChild(btn);
    }
  }
};
})();
