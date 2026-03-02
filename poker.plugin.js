/**
 * FRODON PLUGIN — Texas Hold'em Poker P2P  v1.2.0
 * Fix: saveHistory côté tous les joueurs, onglet Scores, rebuy 0-chips,
 *      bouton Nouvelle main visible pour tous, confirmation rebuy.
 */
frodon.register({
  id: 'poker', name: "Texas Hold'em", version: '1.2.0',
  author: 'frodon-community',
  description: "Poker Texas Hold'em multijoueur P2P — jusqu'à 8 joueurs.",
  icon: '🃏',
}, () => {
  const PLUGIN_ID = 'poker';
  const store = frodon.storage(PLUGIN_ID);
  const SUITS = ['♠','♥','♦','♣'];
  const VALS  = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
  const VNUM  = Object.fromEntries(VALS.map((v,i)=>[v,i+2]));

  function mkDeck(){const d=[];for(const s of SUITS)for(const v of VALS)d.push({s,v});for(let i=d.length-1;i>0;i--){const j=0|Math.random()*(i+1);[d[i],d[j]]=[d[j],d[i]];}return d;}
  function cardHtml(c,back=false){if(back||!c)return'<div class="pk-card back">🂠</div>';const red=c.s==='♥'||c.s==='♦';return`<div class="pk-card" style="color:${red?'#ff4f8b':'var(--txt)'}"><span class="pk-card-tl">${c.v}<small>${c.s}</small></span><span class="pk-card-suit">${c.s}</span><span class="pk-card-br">${c.v}<small>${c.s}</small></span></div>`;}

  function evalBest(cards){if(!cards||cards.length<2)return{score:0,name:'—'};const combos=[];if(cards.length<=5){combos.push(cards);}else{for(let i=0;i<cards.length;i++)for(let j=i+1;j<cards.length;j++)combos.push(cards.filter((_,k)=>k!==i&&k!==j));}let best=null;for(const c of combos){const s=eval5(c);if(!best||s.score>best.score)best=s;}return best||{score:0,name:'—'};}
  function eval5(cards){const ns=cards.map(c=>VNUM[c.v]||0).sort((a,b)=>b-a);const suits=cards.map(c=>c.s);const flush=suits.every(s=>s===suits[0]);let straight=false,sHigh=0;if(ns[0]-ns[4]===4&&new Set(ns).size===5){straight=true;sHigh=ns[0];}if(''+ns==='14,5,4,3,2'){straight=true;sHigh=5;}const cnt={};ns.forEach(n=>cnt[n]=(cnt[n]||0)+1);const freq=Object.entries(cnt).map(([n,c])=>({n:+n,c})).sort((a,b)=>b.c-a.c||b.n-a.n);let rank,name,tb;if(flush&&straight){rank=sHigh===14?8:7;name=sHigh===14?'Quinte flush royale':'Quinte flush';tb=[sHigh];}else if(freq[0].c===4){rank=6;name='Carré';tb=[freq[0].n,freq[1]?.n||0];}else if(freq[0].c===3&&freq[1]?.c===2){rank=5;name='Full house';tb=[freq[0].n,freq[1].n];}else if(flush){rank=4;name='Couleur';tb=ns;}else if(straight){rank=3;name='Suite';tb=[sHigh];}else if(freq[0].c===3){rank=2;name='Brelan';tb=[freq[0].n,...freq.slice(1).map(f=>f.n)];}else if(freq[0].c===2&&freq[1]?.c===2){rank=1;name='Double paire';tb=[freq[0].n,freq[1].n,freq[2]?.n||0];}else if(freq[0].c===2){rank=0;name:'Paire';tb=[freq[0].n,...freq.slice(1).map(f=>f.n)];}else{rank=-1;name='Carte haute';tb=ns;}const score=rank*1e7+tb.reduce((a,n,i)=>a+n*Math.pow(100,4-i),0);return{score,name};}

  let T = null;
  const myId = () => frodon.getMyProfile().peerId;

  /* ── Persistance ── */
  function persist(){
    if(!T){store.del('table');return;}
    store.set('table',{...T,pendingInvites:[...(T.pendingInvites||[])],deck:T.isHost?(T.deck||[]):[],allHands:T.isHost?(T.allHands||{}):{[myId()]:T.myHand||[]}});
  }
  function restore(){
    const s=store.get('table');if(!s)return;
    T={...s,pendingInvites:new Set(s.pendingInvites||[]),allHands:s.allHands||{},myHand:s.allHands?.[myId()]||[]};
    setTimeout(()=>{if(!T)return;if(T.isHost){hostSync();frodon.showToast('🃏 Partie restaurée');}else{toHost('resync',{});}},3500);
    frodon.refreshSphereTab(PLUGIN_ID);
  }

  /* ── Réseau ── */
  function toAll(type,extra={}){if(!T)return;T.players.forEach(p=>{if(p.id!==myId())frodon.sendDM(p.id,PLUGIN_ID,{type,tid:T.id,...extra,_silent:true});});}
  function toPlayer(pid,type,extra={}){frodon.sendDM(pid,PLUGIN_ID,{type,tid:T?.id,...extra,_silent:true});}
  function toHost(type,extra={}){if(!T)return;frodon.sendDM(T.hostId,PLUGIN_ID,{type,tid:T.id,...extra,_silent:true});}

  /* ── Logique hôte ── */
  function hostPublicState(){return{phase:T.phase,players:T.players.map(({id,name,avatar,chips,bet,hasActed,status})=>({id,name,avatar,chips,bet,hasActed,status})),community:T.community,pot:T.pot,currentIdx:T.currentIdx,dealerIdx:T.dealerIdx,roundBet:T.roundBet,sb:T.sb,bb:T.bb,showResult:T.showResult||null};}
  function hostSync(){const pub=hostPublicState();T.players.forEach(p=>{if(p.id===myId())return;toPlayer(p.id,'state_sync',{pub});if(T.allHands[p.id]&&T.phase!=='lobby'&&T.phase!=='ended')toPlayer(p.id,'hand',{cards:T.allHands[p.id]});});persist();frodon.refreshSphereTab(PLUGIN_ID);}

  function hostDeal(){
    T.deck=mkDeck();T.community=[];T.pot=0;T.phase='preflop';T.allHands={};T.showResult=null;
    const active=T.players.filter(p=>p.chips>0);if(active.length<2){frodon.showToast('Pas assez de joueurs',true);return;}
    T.dealerIdx=(T.dealerIdx+1)%T.players.length;while(T.players[T.dealerIdx].chips<=0)T.dealerIdx=(T.dealerIdx+1)%T.players.length;
    const nxt=idx=>{let i=(idx+1)%T.players.length;while(T.players[i].chips<=0)i=(i+1)%T.players.length;return i;};
    const sbIdx=nxt(T.dealerIdx),bbIdx=nxt(sbIdx);
    T.players.forEach(p=>{p.bet=0;p.hasActed=false;p.status=p.chips>0?'active':'out';});
    const sb=T.players[sbIdx],bb=T.players[bbIdx];
    const sbA=Math.min(T.sb,sb.chips),bbA=Math.min(T.bb,bb.chips);
    sb.chips-=sbA;sb.bet=sbA;if(sb.chips===0)sb.status='allin';
    bb.chips-=bbA;bb.bet=bbA;if(bb.chips===0)bb.status='allin';
    T.roundBet=bbA;
    T.players.filter(p=>p.status==='active'||p.status==='allin').forEach(p=>{T.allHands[p.id]=[T.deck.pop(),T.deck.pop()];});
    T.myHand=T.allHands[myId()]||[];
    T.currentIdx=nxt(bbIdx);
    hostSync();frodon.showToast('🃏 Cartes distribuées !');setTimeout(()=>frodon.focusPlugin(PLUGIN_ID),200);
  }

  function hostCheckRoundEnd(){
    const folded=T.players.filter(p=>p.status==='active'||p.status==='allin');
    if(folded.length<=1){const w=folded[0]||T.players.find(p=>p.status==='allin');if(w){T.players.forEach(p=>{T.pot+=p.bet;p.bet=0;});w.chips+=T.pot;const result={pot:T.pot,winner:w.id,winnerName:w.name,results:[{id:w.id,name:w.name,hand:[],handName:'Tous les autres ont couché'}],players:T.players.map(p=>({id:p.id,chips:p.chips}))};T.pot=0;T.phase='ended';T.showResult=result;toAll('showdown',result);applyShowdown(result);}return true;}
    const active=T.players.filter(p=>p.status==='active');
    if(active.length===0||active.every(p=>p.hasActed&&p.bet===T.roundBet)){hostNextStreet();return true;}
    return false;
  }

  function hostNextStreet(){
    T.players.forEach(p=>{T.pot+=p.bet;p.bet=0;p.hasActed=false;});T.roundBet=0;
    const active=T.players.filter(p=>p.status==='active'||p.status==='allin');
    if(active.length<=1){hostShowdown();return;}
    if(T.phase==='preflop'){T.phase='flop';T.community.push(T.deck.pop(),T.deck.pop(),T.deck.pop());}
    else if(T.phase==='flop'){T.phase='turn';T.community.push(T.deck.pop());}
    else if(T.phase==='turn'){T.phase='river';T.community.push(T.deck.pop());}
    else if(T.phase==='river'){hostShowdown();return;}
    let idx=(T.dealerIdx+1)%T.players.length;while(T.players[idx].status!=='active'){idx=(idx+1)%T.players.length;if(idx===T.dealerIdx)break;}
    T.currentIdx=idx;hostSync();
  }

  function hostShowdown(){
    T.players.forEach(p=>{T.pot+=p.bet;p.bet=0;});
    const inHand=T.players.filter(p=>p.status==='active'||p.status==='allin');
    const evals=inHand.map(p=>{const h=T.allHands[p.id]||[];const b=evalBest([...h,...T.community]);return{id:p.id,name:p.name,hand:h,handName:b.name,score:b.score};});
    evals.sort((a,b)=>b.score-a.score);
    const winner=evals[0];const wp=T.players.find(p=>p.id===winner.id);if(wp)wp.chips+=T.pot;
    const result={pot:T.pot,winner:winner.id,winnerName:winner.name,results:evals,players:T.players.map(p=>({id:p.id,chips:p.chips})),community:T.community};
    T.pot=0;T.phase='ended';T.showResult=result;
    toAll('showdown',result);applyShowdown(result);
  }

  /* ── Scores ── */
  function saveScore(isWin, isDraw, opponentNames, pot) {
    store.set('wins',   (store.get('wins')   || 0) + (isWin  ? 1 : 0));
    store.set('losses', (store.get('losses') || 0) + (!isWin && !isDraw ? 1 : 0));
    store.set('draws',  (store.get('draws')  || 0) + (isDraw ? 1 : 0));
    store.set('chips_won', (store.get('chips_won') || 0) + (isWin ? pot : 0));
    const hist = store.get('history') || [];
    hist.unshift({
      result: isWin ? 'win' : isDraw ? 'draw' : 'loss',
      pot,
      opponents: opponentNames,
      ts: Date.now(),
    });
    if(hist.length > 50) hist.length = 50;
    store.set('history', hist);
  }

  function applyShowdown(result){
    if(!T)return;
    T.phase='ended';T.showResult=result;
    result.players.forEach(r=>{const p=T.players.find(q=>q.id===r.id);if(p)p.chips=r.chips;});
    if(result.community)T.community=result.community;

    // Comptabiliser le score pour TOUS les joueurs (pas seulement l'hôte)
    const isWin = result.winner === myId();
    const isDraw = false; // pas de draw au poker
    const opponentNames = T.players.filter(p => p.id !== myId()).map(p => p.name);
    saveScore(isWin, isDraw, opponentNames, result.pot);

    persist();
    frodon.refreshSphereTab(PLUGIN_ID);
    if(isWin) frodon.showToast('🏆 Vous remportez ' + result.pot + '🪙 !');
    else frodon.showToast('🃏 ' + result.winnerName + ' gagne ' + result.pot + '🪙');
    setTimeout(()=>frodon.focusPlugin(PLUGIN_ID),300);
  }

  /* ── DM handler ── */
  frodon.onDM(PLUGIN_ID,(fromId,payload)=>{
    const{type,tid}=payload;
    if(type==='invite'){const host=frodon.getPeer(fromId);T={id:tid,isHost:false,hostId:fromId,phase:'lobby',players:payload.players||[],myHand:[],allHands:{},community:[],deck:[],pot:0,roundBet:payload.bb||20,currentIdx:0,dealerIdx:-1,sb:payload.sb||10,bb:payload.bb||20,pendingInvites:new Set(),showResult:null,_inviteFrom:host?.name||'?'};T.players.forEach(p=>{if(p.id===myId())p.isMe=true;});persist();frodon.showToast('🃏 '+(host?.name||'?')+' vous invite !');frodon.refreshSphereTab(PLUGIN_ID);setTimeout(()=>frodon.focusPlugin(PLUGIN_ID),400);return;}
    if(type==='invite_accept'){if(!T||!T.isHost||T.id!==tid)return;const peer=frodon.getPeer(fromId);let p=T.players.find(pl=>pl.id===fromId);if(!p){p={id:fromId,name:peer?.name||'?',avatar:peer?.avatar||'',chips:1000,bet:0,hasActed:false,status:'active',isMe:false};T.players.push(p);}else{p.status='active';}T.pendingInvites.delete(fromId);frodon.showToast('🃏 '+(peer?.name||'?')+' rejoint !');hostSync();return;}
    if(type==='invite_decline'){if(!T||!T.isHost||T.id!==tid)return;T.pendingInvites.delete(fromId);T.players=T.players.filter(p=>p.id!==fromId);frodon.showToast((frodon.getPeer(fromId)?.name||'?')+' décline.');hostSync();return;}
    if(type==='state_sync'){if(!T||T.id!==tid)return;const pub=payload.pub;
      if(T.showResult&&pub.phase!=='ended'){}
      else{T.phase=pub.phase;T.community=pub.community;T.pot=pub.pot;T.currentIdx=pub.currentIdx;T.dealerIdx=pub.dealerIdx;T.roundBet=pub.roundBet;T.players=pub.players.map(p=>({...p,isMe:p.id===myId()}));}
      if(pub.showResult)T.showResult=pub.showResult;
      persist();frodon.refreshSphereTab(PLUGIN_ID);
      if(T.phase!=='ended'&&T.phase!=='lobby'&&!T.showResult&&T.players[T.currentIdx]?.id===myId()){frodon.showToast('🃏 C\'est votre tour !');setTimeout(()=>frodon.focusPlugin(PLUGIN_ID),300);}
      if(T.phase==='ended'||T.showResult)setTimeout(()=>frodon.focusPlugin(PLUGIN_ID),300);
      return;}
    if(type==='hand'){if(!T||T.id!==tid)return;T.myHand=payload.cards||[];persist();frodon.refreshSphereTab(PLUGIN_ID);return;}
    if(type==='action'){if(!T||!T.isHost||T.id!==tid)return;hostAction(fromId,payload.action,payload.amount||0);return;}
    if(type==='showdown'){if(!T||T.id!==tid)return;applyShowdown(payload);return;}
    if(type==='kick'){if(!T||T.id!==tid)return;frodon.showToast('🃏 Vous avez quitté la table.');T=null;persist();frodon.refreshSphereTab(PLUGIN_ID);return;}
    if(type==='replace_notify'){if(!T||T.id!==tid)return;const p=T.players.find(pl=>pl.id===payload.oldId);if(p){p.id=payload.newId;p.name=payload.newName;p.avatar=payload.newAvatar||'';}frodon.showToast('🃏 '+payload.oldName+' → '+payload.newName);persist();frodon.refreshSphereTab(PLUGIN_ID);return;}
    if(type==='leave'){if(!T||T.id!==tid)return;if(T.isHost){const p=T.players.find(pl=>pl.id===fromId);if(p){p.status='away';p.chips=0;}if(T.phase!=='lobby'&&T.phase!=='ended'){if(T.currentIdx===T.players.indexOf(p))hostCheckRoundEnd();else hostSync();}}return;}
    if(type==='resync'){if(!T||!T.isHost||T.id!==tid)return;
      let p=T.players.find(pl=>pl.id===fromId);
      if(!p){const peer=frodon.getPeer(fromId);if(peer){p=T.players.find(pl=>pl.status==='away'&&pl.name===peer.name);}if(p){const oldId=p.id;if(T.allHands[oldId]){T.allHands[fromId]=T.allHands[oldId];delete T.allHands[oldId];}p.id=fromId;p.avatar=peer?.avatar||p.avatar;}}
      if(p&&p.status==='away')p.status='active';
      const pub=hostPublicState();toPlayer(fromId,'state_sync',{pub});if(T.allHands[fromId])toPlayer(fromId,'hand',{cards:T.allHands[fromId]});
      hostSync();return;}
    if(type==='new_hand_vote'){if(!T||!T.isHost||T.id!==tid)return;
      if(!T._newHandVotes) T._newHandVotes = new Set();
      T._newHandVotes.add(fromId);
      // Si tous les joueurs actifs ont voté (ou l'hôte décide), lancer
      const activePlayers = T.players.filter(p => p.id !== myId() && p.status !== 'away');
      if(T._newHandVotes.size >= activePlayers.length) {
        T._newHandVotes = new Set();
        hostStartNewHand();
      } else {
        frodon.showToast('🃏 ' + (frodon.getPeer(fromId)?.name||'?') + ' veut rejouer (' + T._newHandVotes.size + '/' + activePlayers.length + ')');
        hostSync();
      }
      return;}
  });

  function hostAction(fromId,action,amount){
    if(!T||!T.isHost||T.phase==='lobby'||T.phase==='ended')return;
    const pIdx=T.players.findIndex(p=>p.id===fromId);if(pIdx<0||T.currentIdx!==pIdx)return;
    const p=T.players[pIdx];if(p.status!=='active')return;
    if(action==='fold'){p.status='fold';p.hasActed=true;}
    else if(action==='check'){if(p.bet<T.roundBet)return;p.hasActed=true;}
    else if(action==='call'){const t=Math.min(T.roundBet-p.bet,p.chips);p.chips-=t;p.bet+=t;if(p.chips===0)p.status='allin';p.hasActed=true;}
    else if(action==='raise'){const r=Math.max(amount||0,T.roundBet+T.bb);const a=Math.min(r-p.bet,p.chips);p.chips-=a;p.bet+=a;T.roundBet=p.bet;if(p.chips===0)p.status='allin';T.players.forEach(op=>{if(op.id!==fromId&&op.status==='active')op.hasActed=false;});p.hasActed=true;}
    else if(action==='allin'){const a=p.chips;p.chips=0;p.bet+=a;if(p.bet>T.roundBet){T.roundBet=p.bet;T.players.forEach(op=>{if(op.id!==fromId&&op.status==='active')op.hasActed=false;});}p.status='allin';p.hasActed=true;}
    if(hostCheckRoundEnd())return;
    let next=(pIdx+1)%T.players.length,guard=0;while(T.players[next].status!=='active'&&guard<T.players.length){next=(next+1)%T.players.length;guard++;}
    T.currentIdx=next;hostSync();
  }

  function hostStartNewHand() {
    // Rebuy automatique pour les joueurs à 0
    T.players.forEach(p => {
      if(p.chips <= 0 && p.status !== 'away') {
        p.chips = 1000;
        frodon.showToast('🃏 Rebuy : ' + (p.isMe ? 'vous' : p.name) + ' reçoit 1000🪙');
      }
    });
    T.phase = 'lobby';
    T.showResult = null;
    T._newHandVotes = new Set();
    T.players.forEach(p => { p.bet = 0; p.hasActed = false; p.status = p.chips > 0 ? 'active' : 'out'; });
    hostSync();
  }

  frodon.onPeerAppear(peer=>{
    if(!T)return;
    let p=T.players.find(pl=>pl.id===peer.peerId);
    if(!p){
      p=T.players.find(pl=>pl.status==='away'&&pl.name===peer.name);
      if(p&&T.isHost){const oldId=p.id;if(T.allHands[oldId]){T.allHands[peer.peerId]=T.allHands[oldId];delete T.allHands[oldId];}p.id=peer.peerId;p.avatar=peer.avatar||p.avatar;}
      else if(p&&!T.isHost){p.id=peer.peerId;}
    }
    if(!p)return;
    frodon.showToast('🃏 '+peer.name+' est de retour !');
    if(T.isHost){if(p.status==='away')p.status='active';const pub=hostPublicState();toPlayer(peer.peerId,'state_sync',{pub});if(T.allHands[peer.peerId])toPlayer(peer.peerId,'hand',{cards:T.allHands[peer.peerId]});hostSync();}
    else if(peer.peerId===T.hostId||p.id===T.hostId){setTimeout(()=>toHost('resync',{}),500);}
  });

  frodon.onPeerLeave(peerId=>{
    if(!T||!T.isHost)return;const p=T.players.find(pl=>pl.id===peerId);if(!p||p.status==='out')return;
    p.status='away';frodon.showToast('🃏 '+p.name+' s\'est déconnecté');
    if(T.phase!=='lobby'&&T.phase!=='ended'){if(T.players[T.currentIdx]?.id===peerId)hostAction(peerId,'fold',0);else hostSync();}
    else frodon.refreshSphereTab(PLUGIN_ID);
  });

  frodon.registerPeerAction(PLUGIN_ID,'🃏 Poker',(peerId,container)=>{
    const peer=frodon.getPeer(peerId),peerName=peer?.name||'?';
    if(!T){const btn=frodon.makeElement('button','plugin-action-btn acc','🃏 Créer une table & inviter');btn.addEventListener('click',()=>{const me=frodon.getMyProfile(),tid='pk_'+Date.now();T={id:tid,isHost:true,hostId:myId(),phase:'lobby',players:[{id:myId(),name:me.name,avatar:me.avatar||'',chips:1000,bet:0,hasActed:false,status:'active',isMe:true},{id:peerId,name:peerName,avatar:peer?.avatar||'',chips:1000,bet:0,hasActed:false,status:'active',isMe:false}],myHand:[],allHands:{},community:[],deck:[],pot:0,roundBet:20,currentIdx:0,dealerIdx:-1,sb:10,bb:20,pendingInvites:new Set([peerId]),showResult:null,_newHandVotes:new Set()};frodon.sendDM(peerId,PLUGIN_ID,{type:'invite',tid,sb:10,bb:20,players:T.players.map(p=>({id:p.id,name:p.name,avatar:p.avatar||'',chips:p.chips,status:p.status})),_label:'🃏 Invitation au Poker !'});persist();frodon.showToast('🃏 Invitation envoyée');frodon.refreshSphereTab(PLUGIN_ID);setTimeout(()=>frodon.focusPlugin(PLUGIN_ID),200);});container.appendChild(btn);return;}
    if(T.isHost&&T.phase==='lobby'){const inTable=T.players.find(p=>p.id===peerId);if(inTable){container.appendChild(frodon.makeElement('div','no-posts','Déjà à la table ✓'));}else{const btn=frodon.makeElement('button','plugin-action-btn','+ Ajouter à la table');btn.addEventListener('click',()=>{T.players.push({id:peerId,name:peerName,avatar:peer?.avatar||'',chips:1000,bet:0,hasActed:false,status:'active',isMe:false});T.pendingInvites.add(peerId);frodon.sendDM(peerId,PLUGIN_ID,{type:'invite',tid:T.id,sb:T.sb,bb:T.bb,players:T.players.map(p=>({id:p.id,name:p.name,avatar:p.avatar||'',chips:p.chips,status:p.status})),_label:'🃏 Invitation au Poker !'});frodon.showToast('🃏 Invitation à '+peerName);frodon.refreshSphereTab(PLUGIN_ID);});container.appendChild(btn);}}
    else{const p=T.players.find(pl=>pl.id===peerId);container.appendChild(frodon.makeElement('div','no-posts',p?('En jeu ('+p.chips+'🪙)'):'Partie en cours'));}
  });

  frodon.registerBottomPanel(PLUGIN_ID,[
    {id:'table',label:'🃏 Table',render(container){
      injectCSS();
      if(!T){renderEmpty(container);return;}
      if(T._inviteFrom){renderInvitePrompt(container);return;}
      if(T.phase==='lobby'){renderLobby(container);return;}
      if(T.phase==='ended'||T.showResult){renderResult(container);return;}
      renderGame(container);
    }},
    {id:'scores',label:'🏆 Scores',render(container){
      renderScores(container);
    }},
    {id:'history',label:'📜 Historique',render(container){
      renderHistory(container);
    }},
  ]);

  function renderEmpty(c){const w=frodon.makeElement('div','');w.style.cssText='text-align:center;padding:32px 20px';w.innerHTML='<div style="font-size:2.8rem;margin-bottom:10px">🃏</div><div style="color:var(--txt2);font-size:.76rem;line-height:1.8">Aucune partie en cours.<br><small style="color:var(--txt3)">Ouvrez le profil d\'un pair pour l\'inviter.</small></div>';c.appendChild(w);}

  function renderInvitePrompt(c){
    const w=frodon.makeElement('div','');w.style.cssText='padding:20px;text-align:center';
    w.innerHTML=`<div style="font-size:2rem;margin-bottom:8px">🃏</div><div style="font-size:.88rem;font-weight:700;color:var(--txt);margin-bottom:4px">${T._inviteFrom} vous invite</div><div style="font-size:.68rem;color:var(--txt2);margin-bottom:16px">Texas Hold'em · ${T.sb}/${T.bb} blindes · 1000🪙</div>`;
    const r=frodon.makeElement('div','');r.style.cssText='display:flex;gap:8px;justify-content:center';
    const acc=frodon.makeElement('button','plugin-action-btn acc','✔ Accepter');
    acc.addEventListener('click',()=>{toHost('invite_accept',{});delete T._inviteFrom;persist();frodon.showToast('🃏 Vous avez rejoint !');frodon.refreshSphereTab(PLUGIN_ID);});
    const dec=frodon.makeElement('button','plugin-action-btn','✕ Refuser');
    dec.addEventListener('click',()=>{toHost('invite_decline',{});T=null;persist();frodon.refreshSphereTab(PLUGIN_ID);});
    r.appendChild(acc);r.appendChild(dec);w.appendChild(r);c.appendChild(w);
  }

  function renderLobby(c){
    const hdr=frodon.makeElement('div','');hdr.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid var(--bdr)';
    hdr.innerHTML=`<div style="font-family:var(--mono);font-size:.8rem;color:var(--acc)">🃏 SALON · ${T.sb}/${T.bb}</div>`;
    if(T.isHost){const s=frodon.makeElement('button','plugin-action-btn acc','▶ Lancer la partie');s.style.fontSize='.65rem';s.addEventListener('click',()=>hostDeal());hdr.appendChild(s);}
    c.appendChild(hdr);
    const seats=frodon.makeElement('div','');seats.style.cssText='display:flex;flex-wrap:wrap;gap:8px;padding:12px;justify-content:center';
    T.players.forEach(p=>{
      const isPending=T.pendingInvites?.has(p.id);
      const seat=frodon.makeElement('div','');seat.style.cssText=`display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 8px;min-width:60px;background:var(--sur2);border:1.5px solid ${p.isMe?'var(--acc)':isPending?'var(--warn)':'var(--bdr2)'};border-radius:12px`;
      seat.innerHTML=`${mkAvHtml(p,36)}<div style="font-size:.6rem;font-weight:700;color:${p.isMe?'var(--acc)':'var(--txt)'};max-width:64px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.isMe?'Moi':p.name}</div><div style="font-size:.55rem;font-family:var(--mono);color:var(--txt2)">${p.chips}🪙</div>${isPending?'<div style="font-size:.47rem;color:var(--warn)">invité…</div>':''}`;
      if(T.isHost&&!p.isMe){const rm=frodon.makeElement('button','');rm.style.cssText='font-size:.5rem;padding:2px 5px;background:rgba(255,68,68,.1);border:1px solid rgba(255,68,68,.2);border-radius:4px;color:var(--warn);cursor:pointer;margin-top:2px';rm.textContent='✕';rm.addEventListener('click',()=>{frodon.sendDM(p.id,PLUGIN_ID,{type:'kick',tid:T.id,_silent:true});T.players=T.players.filter(pl=>pl.id!==p.id);T.pendingInvites?.delete(p.id);hostSync();});seat.appendChild(rm);}
      seats.appendChild(seat);
    });
    c.appendChild(seats);
    if(T.isHost){const hint=frodon.makeElement('div','');hint.style.cssText='text-align:center;font-size:.6rem;color:var(--txt3);font-family:var(--mono);padding:0 12px 14px';hint.textContent='Ouvrez le profil d\'un pair pour l\'ajouter · 2-8 joueurs';c.appendChild(hint);}
  }

  function renderGame(c){
    const me=T.players.find(p=>p.isMe||p.id===myId());
    const phaseLabel={preflop:'Pré-flop',flop:'Flop',turn:'Turn',river:'River'};
    const PHASES=['preflop','flop','turn','river'];
    const top=frodon.makeElement('div','');top.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:5px 10px;border-bottom:1px solid var(--bdr);background:rgba(0,0,0,.2)';
    top.innerHTML=`<div style="display:flex;gap:4px">${PHASES.map(p=>`<span style="font-size:.56rem;font-family:var(--mono);padding:2px 7px;border-radius:4px;background:${T.phase===p?'rgba(0,245,200,.15)':'transparent'};color:${T.phase===p?'var(--acc)':'var(--txt3)'}">${phaseLabel[p]}</span>`).join('')}</div><div style="font-family:var(--mono);font-size:.75rem;color:var(--warn)">Pot ${T.pot}🪙</div>`;
    c.appendChild(top);
    const row=frodon.makeElement('div','');row.style.cssText='display:flex;flex-wrap:wrap;gap:4px;justify-content:center;padding:8px 6px 4px';
    T.players.forEach((p,i)=>{const isD=i===T.dealerIdx,isCur=i===T.currentIdx;const chip=frodon.makeElement('div','');chip.style.cssText=`display:flex;flex-direction:column;align-items:center;gap:2px;min-width:50px;padding:5px 4px;border-radius:9px;border:1.5px solid ${isCur?'var(--acc2)':p.isMe?'rgba(0,245,200,.25)':'transparent'};background:${isCur?'rgba(124,77,255,.08)':'transparent'};opacity:${p.status==='fold'?.45:1}`;chip.innerHTML=`<div style="position:relative">${mkAvHtml(p,30)}${isD?'<div style="position:absolute;bottom:-3px;right:-3px;background:#f5c842;color:#000;font-size:.42rem;font-weight:900;border-radius:50%;width:13px;height:13px;display:flex;align-items:center;justify-content:center;border:1.5px solid var(--bg)">D</div>':''}${p.status==='away'?'<div style="position:absolute;top:-2px;right:-2px;background:#ff4444;border-radius:50%;width:8px;height:8px;border:1.5px solid var(--bg)"></div>':''}</div><div style="font-size:.52rem;font-weight:700;color:${p.isMe?'var(--acc)':'var(--txt)'};max-width:54px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.isMe?'Moi':p.name}</div><div style="font-size:.5rem;font-family:var(--mono);color:var(--txt2)">${p.chips}🪙</div>${p.bet>0?`<div style="font-size:.48rem;font-family:var(--mono);color:var(--warn)">${p.bet}🪙</div>`:''}${p.status==='fold'?'<div style="font-size:.47rem;color:var(--txt3)">couché</div>':''}${p.status==='allin'?'<div style="font-size:.47rem;color:var(--warn)">ALL-IN</div>':''}${p.status==='away'?'<div style="font-size:.47rem;color:#ff6b35">absent</div>':''}`;row.appendChild(chip);});
    c.appendChild(row);
    const comm=frodon.makeElement('div','');comm.style.cssText='display:flex;gap:5px;justify-content:center;padding:8px;background:rgba(0,245,200,.03);border-radius:10px;margin:2px 8px 4px';
    for(let i=0;i<5;i++){const el=frodon.makeElement('div','');el.innerHTML=T.community[i]?cardHtml(T.community[i]):'<div class="pk-card empty"></div>';comm.appendChild(el);}
    c.appendChild(comm);
    const hw=frodon.makeElement('div','');hw.style.cssText='display:flex;flex-direction:column;align-items:center;gap:5px;padding:6px 8px';
    const hl=frodon.makeElement('div','');hl.style.cssText='font-size:.56rem;font-family:var(--mono);color:var(--txt3);text-transform:uppercase;letter-spacing:.8px';hl.textContent='Mes cartes';
    const mc=frodon.makeElement('div','');mc.style.cssText='display:flex;gap:6px';
    if(me?.status==='fold'){mc.innerHTML=cardHtml(null,true)+cardHtml(null,true);hl.textContent='Couché';}
    else if(T.myHand?.length===2){mc.innerHTML=cardHtml(T.myHand[0])+cardHtml(T.myHand[1]);if(T.community.length>=3){const best=evalBest([...T.myHand,...T.community]);const hn=frodon.makeElement('div','');hn.style.cssText='font-size:.65rem;font-family:var(--mono);color:var(--acc2);padding:3px 10px;background:rgba(124,77,255,.1);border-radius:6px;border:1px solid rgba(124,77,255,.25)';hn.textContent='✦ '+best.name;hw.appendChild(hl);hw.appendChild(mc);hw.appendChild(hn);c.appendChild(hw);renderActions(c,me);if(T.isHost)renderReplaceZone(c);return;}}
    else{mc.innerHTML=cardHtml(null,true)+cardHtml(null,true);}
    hw.appendChild(hl);hw.appendChild(mc);c.appendChild(hw);renderActions(c,me);if(T.isHost)renderReplaceZone(c);
  }

  function renderActions(c,me){
    if(!me||me.status!=='active'){const w=frodon.makeElement('div','');w.style.cssText='text-align:center;padding:10px;font-size:.68rem;color:var(--txt3);font-family:var(--mono)';if(me?.status==='fold')w.textContent='Couché — en attente du prochain tour';else if(me?.status==='allin')w.textContent='All-in — en attente des autres';else w.textContent='⌛ Tour de '+(T.players[T.currentIdx]?.name||'?');c.appendChild(w);return;}
    if(T.players[T.currentIdx]?.id!==myId()){const w=frodon.makeElement('div','');w.style.cssText='text-align:center;padding:10px;font-size:.68rem;color:var(--txt3);font-family:var(--mono)';w.textContent='⌛ Tour de '+(T.players[T.currentIdx]?.name||'?');c.appendChild(w);return;}
    const toCall=Math.min(T.roundBet-me.bet,me.chips),canCheck=me.bet>=T.roundBet;
    const wrap=frodon.makeElement('div','');wrap.style.cssText='padding:8px 10px 10px;border-top:1px solid var(--bdr)';
    const row1=frodon.makeElement('div','');row1.style.cssText='display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-bottom:7px';
    const fold=frodon.makeElement('button','plugin-action-btn','🏳 Coucher');fold.style.fontSize='.68rem';fold.addEventListener('click',()=>doAction('fold'));
    if(canCheck){const check=frodon.makeElement('button','plugin-action-btn acc','✔ Checker');check.style.fontSize='.68rem';check.addEventListener('click',()=>doAction('check'));row1.appendChild(fold);row1.appendChild(check);}
    else{const call=frodon.makeElement('button','plugin-action-btn acc','📞 Suivre +'+toCall+'🪙');call.style.fontSize='.68rem';call.addEventListener('click',()=>doAction('call'));row1.appendChild(fold);row1.appendChild(call);}
    wrap.appendChild(row1);
    const row2=frodon.makeElement('div','');row2.style.cssText='display:flex;gap:6px;align-items:center;justify-content:center';
    const inp=document.createElement('input');inp.type='number';inp.className='f-input';inp.style.cssText='width:80px;text-align:center;padding:5px 8px;font-family:var(--mono)';inp.min=T.roundBet+T.bb;inp.max=me.chips;inp.step=T.bb;inp.value=Math.min(T.roundBet+T.bb,me.chips);
    const raise=frodon.makeElement('button','plugin-action-btn','🔺 Relancer');raise.style.fontSize='.68rem';raise.addEventListener('click',()=>doAction('raise',parseInt(inp.value)||T.roundBet+T.bb));
    const allin=frodon.makeElement('button','plugin-action-btn','♠ All-in');allin.style.cssText+=';font-size:.68rem;color:var(--warn);border-color:rgba(255,193,7,.35)';allin.addEventListener('click',()=>doAction('allin',me.chips));
    row2.appendChild(inp);row2.appendChild(raise);row2.appendChild(allin);wrap.appendChild(row2);c.appendChild(wrap);
  }

  function doAction(action,amount){
    if(!T)return;
    if(T.isHost){hostAction(myId(),action,amount||0);}
    else{toHost('action',{action,amount:amount||0});const me=T.players.find(p=>p.id===myId());if(me){if(action==='fold')me.status='fold';else if(action==='call'){const t=Math.min(T.roundBet-me.bet,me.chips);me.chips-=t;me.bet+=t;}else if(action==='raise'){const t=Math.min((amount||T.roundBet+T.bb)-me.bet,me.chips);me.chips-=t;me.bet+=t;T.roundBet=me.bet;}else if(action==='allin'){me.chips=0;me.bet+=amount||0;me.status='allin';}me.hasActed=true;}persist();frodon.refreshSphereTab(PLUGIN_ID);}
  }

  function renderReplaceZone(c){
    const away=T.players.filter(p=>p.status==='away'&&!p.isMe);if(!away.length)return;
    const zone=frodon.makeElement('div','');zone.style.cssText='border-top:1px solid var(--bdr);padding:8px 10px 4px';zone.innerHTML='<div style="font-size:.57rem;color:var(--warn);font-family:var(--mono);text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px">⚠ Joueurs déconnectés</div>';
    away.forEach(awayP=>{
      const row=frodon.makeElement('div','');row.style.cssText='display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap';
      row.innerHTML=`<span style="font-size:.68rem;color:var(--txt2);flex-shrink:0">${awayP.name} (${awayP.chips}🪙)</span>`;
      const avail=frodon.getAllPeers().filter(p=>p.peerId!==myId()&&!T.players.find(tp=>tp.id===p.peerId));
      if(avail.length){const sel=document.createElement('select');sel.className='f-input';sel.style.cssText='font-size:.6rem;padding:3px 6px;flex:1;min-width:0';sel.innerHTML='<option value="">Remplacer par…</option>'+avail.map(p=>`<option value="${p.peerId}">${p.name}</option>`).join('');const btn=frodon.makeElement('button','plugin-action-btn','↻');btn.style.cssText+=';font-size:.6rem;padding:4px 8px;flex-shrink:0';btn.addEventListener('click',()=>{if(!sel.value)return;const np=frodon.getPeer(sel.value);if(!np)return;frodon.sendDM(awayP.id,PLUGIN_ID,{type:'kick',tid:T.id,_silent:true});const idx=T.players.findIndex(p=>p.id===awayP.id);if(idx>=0){if(T.allHands[awayP.id]){T.allHands[np.peerId]=T.allHands[awayP.id];delete T.allHands[awayP.id];}T.players[idx]={...T.players[idx],id:np.peerId,name:np.name,avatar:np.avatar||'',status:'active'};}frodon.sendDM(np.peerId,PLUGIN_ID,{type:'invite',tid:T.id,sb:T.sb,bb:T.bb,players:T.players.map(p=>({id:p.id,name:p.name,avatar:p.avatar||'',chips:p.chips,status:p.status})),_label:'🃏 Remplacement en cours !'});T.players.forEach(p=>{if(p.id!==myId()&&p.id!==np.peerId)toPlayer(p.id,'replace_notify',{oldId:awayP.id,oldName:awayP.name,newId:np.peerId,newName:np.name,newAvatar:np.avatar||''});});frodon.showToast('🃏 '+awayP.name+' → '+np.name);hostSync();});row.appendChild(sel);row.appendChild(btn);}
      else{row.innerHTML+=`<span style="font-size:.6rem;color:var(--txt3)">Aucun pair dispo</span>`;}
      zone.appendChild(row);
    });
    c.appendChild(zone);
  }

  function renderResult(c){
    const res=T.showResult;
    if(!res){const w=frodon.makeElement('div','');w.style.cssText='text-align:center;padding:24px;color:var(--txt3);font-size:.72rem;font-family:var(--mono)';w.textContent='⌛ En attente du résultat…';c.appendChild(w);return;}
    const win=res.winner===myId();const winP=T.players.find(p=>p.id===res.winner);

    // Header résultat
    const hdr=frodon.makeElement('div','');hdr.style.cssText='text-align:center;padding:14px 12px 8px';
    hdr.innerHTML=`<div style="font-size:1.8rem;margin-bottom:5px">${win?'🏆':'🃏'}</div><div style="font-size:.95rem;font-weight:700;color:${win?'var(--ok)':'var(--txt)'}">${win?'Vous avez gagné !':((winP?.name||res.winnerName||'?')+' gagne')}</div><div style="font-size:.7rem;font-family:var(--mono);color:var(--warn);margin-top:3px">Pot : ${res.pot}🪙</div>`;
    c.appendChild(hdr);

    // Cartes communes
    if(T.community.length){const comm=frodon.makeElement('div','');comm.style.cssText='display:flex;gap:5px;justify-content:center;margin:0 8px 10px';T.community.forEach(card=>{const el=frodon.makeElement('div','');el.innerHTML=cardHtml(card);comm.appendChild(el);});c.appendChild(comm);}

    // Résultats des mains
    if(res.results){const rl=frodon.makeElement('div','');rl.style.cssText='padding:0 8px';res.results.forEach(r=>{const isW=r.id===res.winner;const row=frodon.makeElement('div','');row.style.cssText=`display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:9px;margin-bottom:4px;background:${isW?'rgba(0,229,122,.08)':'var(--sur2)'};border:1px solid ${isW?'rgba(0,229,122,.25)':'var(--bdr)'}`;const ph=T.players.find(p=>p.id===r.id);row.innerHTML=`${mkAvHtml(ph||{name:r.name,avatar:''},26)}<div style="flex:1;min-width:0"><div style="font-size:.72rem;font-weight:700;color:${isW?'var(--ok)':'var(--txt)'}">${r.id===myId()?'Moi':r.name}${isW?' 🏆':''}</div><div style="font-size:.6rem;color:var(--acc2);font-family:var(--mono)">${r.handName||'—'}</div></div><div style="display:flex;gap:3px">${(r.hand||[]).map(card=>cardHtml(card)).join('')}</div>`;rl.appendChild(row);});c.appendChild(rl);}

    // Chips restants
    const chips=frodon.makeElement('div','');chips.style.cssText='margin:10px 8px 0;border-top:1px solid var(--bdr);padding-top:8px';
    const chipsLbl=frodon.makeElement('div','');chipsLbl.style.cssText='font-size:.56rem;color:var(--txt3);font-family:var(--mono);text-transform:uppercase;letter-spacing:.8px;margin-bottom:5px';chipsLbl.textContent='Chips restants';chips.appendChild(chipsLbl);
    const brokeCount = T.players.filter(p=>p.chips<=0&&p.status!=='away').length;
    T.players.forEach(p=>{
      const row=frodon.makeElement('div','');row.style.cssText='display:flex;justify-content:space-between;align-items:center;font-size:.68rem;font-family:var(--mono);padding:2px 0';
      const nameEl=frodon.makeElement('span','',p.isMe?'Moi':p.name);nameEl.style.color=p.isMe?'var(--acc)':'var(--txt2)';
      const chipsEl=frodon.makeElement('span','',p.chips>0?p.chips+'🪙':'💀 éliminé');chipsEl.style.color=p.chips>0?'var(--txt2)':'var(--warn)';
      row.appendChild(nameEl);row.appendChild(chipsEl);chips.appendChild(row);
    });
    c.appendChild(chips);

    // Zone "Nouvelle main" — visible par TOUS les joueurs
    const btns=frodon.makeElement('div','');btns.style.cssText='padding:12px 8px 14px';

    if(T.isHost) {
      // L'hôte voit le bouton "Nouvelle main" et l'info rebuy si besoin
      if(brokeCount > 0) {
        const rebuyInfo=frodon.makeElement('div','');rebuyInfo.style.cssText='font-size:.62rem;color:var(--txt2);font-family:var(--mono);text-align:center;margin-bottom:8px;padding:5px 8px;background:rgba(255,107,53,.07);border:1px solid rgba(255,107,53,.2);border-radius:7px';
        rebuyInfo.textContent='⚠ '+brokeCount+' joueur'+(brokeCount>1?'s':'')+' à 0🪙 — recevra un rebuy de 1000🪙';
        btns.appendChild(rebuyInfo);
      }
      const newH=frodon.makeElement('button','plugin-action-btn acc','🔄 Nouvelle main');
      newH.style.cssText+=';width:100%;margin-bottom:8px';
      newH.addEventListener('click',()=>hostStartNewHand());
      btns.appendChild(newH);
    } else {
      // Les clients voient un bouton "Demander une nouvelle main"
      const voteBtn=frodon.makeElement('button','plugin-action-btn acc','🔄 Nouvelle main ?');
      voteBtn.style.cssText+=';width:100%;margin-bottom:8px';
      voteBtn.addEventListener('click',()=>{
        toHost('new_hand_vote',{});
        voteBtn.disabled=true;voteBtn.textContent='✓ Demande envoyée…';
        frodon.showToast('🃏 Demande envoyée à l\'hôte !');
      });
      btns.appendChild(voteBtn);
      const hint=frodon.makeElement('div','');hint.style.cssText='font-size:.58rem;color:var(--txt3);font-family:var(--mono);text-align:center;margin-bottom:8px';hint.textContent='L\'hôte doit valider pour lancer une nouvelle main';btns.appendChild(hint);
    }

    const leave=frodon.makeElement('button','plugin-action-btn','🚪 Quitter la table');
    leave.style.cssText+=';width:100%';
    leave.addEventListener('click',()=>{if(T.isHost)toAll('kick',{});else toHost('leave',{});T=null;persist();frodon.refreshSphereTab(PLUGIN_ID);});
    btns.appendChild(leave);
    c.appendChild(btns);
  }

  /* ── Onglet Scores ── */
  function renderScores(c) {
    const wins   = store.get('wins')   || 0;
    const losses = store.get('losses') || 0;
    const draws  = store.get('draws')  || 0;
    const chipsWon = store.get('chips_won') || 0;
    const total  = wins + losses + draws;

    if(!total) {
      const em=frodon.makeElement('div','');em.style.cssText='text-align:center;padding:32px 20px;color:var(--txt2);font-size:.76rem;line-height:1.9';em.innerHTML='<div style="font-size:2.2rem;opacity:.2;margin-bottom:8px">🏆</div>Jouez votre première partie !';c.appendChild(em);return;
    }

    // Blocs stats principaux
    const sb=frodon.makeElement('div','');sb.style.cssText='display:flex;border:1px solid var(--bdr2);border-radius:10px;overflow:hidden;margin:10px 8px 8px';
    [['🏆',wins,'Victoires','var(--ok)'],['😔',losses,'Défaites','var(--warn)'],['🤝',draws,'Nulles','var(--txt2)']].forEach(([ico,n,lbl,col],i)=>{
      const cell=frodon.makeElement('div','');cell.style.cssText='flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;padding:12px 4px;'+(i<2?'border-right:1px solid var(--bdr2)':'');
      cell.innerHTML=`<span style="font-size:1.1rem">${ico}</span><strong style="font-size:1.3rem;color:${col};font-family:var(--mono)">${n}</strong><span style="font-size:.52rem;color:var(--txt2)">${lbl}</span>`;
      sb.appendChild(cell);
    });
    c.appendChild(sb);

    // Taux de victoire
    const rate=Math.round(wins/total*100);
    const bw=frodon.makeElement('div','');bw.style.cssText='margin:0 8px 10px';
    bw.innerHTML=`<div style="display:flex;justify-content:space-between;font-size:.58rem;color:var(--txt2);font-family:var(--mono);margin-bottom:3px"><span>Taux de victoire</span><span style="color:var(--ok)">${rate}%</span></div><div style="height:5px;background:var(--sur2);border-radius:4px;overflow:hidden"><div style="height:100%;width:${rate}%;background:linear-gradient(90deg,var(--ok),var(--acc));border-radius:4px"></div></div><div style="font-size:.55rem;color:var(--txt2);font-family:var(--mono);margin-top:3px;text-align:center">${total} partie${total>1?'s':''} jouée${total>1?'s':''}</div>`;
    c.appendChild(bw);

    // Chips gagnés
    if(chipsWon > 0) {
      const cw=frodon.makeElement('div','');cw.style.cssText='margin:0 8px 12px;padding:8px 10px;background:rgba(0,229,122,.07);border:1px solid rgba(0,229,122,.2);border-radius:8px;display:flex;justify-content:space-between;align-items:center';
      cw.innerHTML=`<span style="font-size:.65rem;color:var(--txt2)">Total chips gagnés</span><strong style="font-family:var(--mono);color:var(--ok)">${chipsWon.toLocaleString()}🪙</strong>`;
      c.appendChild(cw);
    }

    // Bouton reset
    const resetBtn=frodon.makeElement('button','plugin-action-btn');resetBtn.style.cssText+=';font-size:.62rem;margin:0 8px;width:calc(100% - 16px);color:var(--txt3);border-color:var(--bdr)';resetBtn.textContent='↺ Remettre les scores à zéro';
    resetBtn.addEventListener('click',()=>{
      if(!confirm('Remettre tous les scores à zéro ?')) return;
      ['wins','losses','draws','chips_won','history'].forEach(k=>store.del(k));
      frodon.refreshSphereTab(PLUGIN_ID);
      frodon.showToast('Scores remis à zéro');
    });
    c.appendChild(resetBtn);
  }

  /* ── Onglet Historique ── */
  function renderHistory(c) {
    const hist=store.get('history')||[];
    if(!hist.length){const em=frodon.makeElement('div','no-posts','Aucune partie jouée.');em.style.padding='24px 16px';c.appendChild(em);return;}
    hist.slice(0,30).forEach(h=>{
      const isWin=h.result==='win',isDraw=h.result==='draw';
      const row=frodon.makeElement('div','');row.style.cssText='display:flex;align-items:flex-start;gap:10px;padding:8px 12px;border-bottom:1px solid var(--bdr)';
      const ico=frodon.makeElement('span','');ico.style.cssText='font-size:1.2rem;flex-shrink:0;margin-top:1px';ico.textContent=isDraw?'🤝':isWin?'🏆':'😔';
      const inf=frodon.makeElement('div','');inf.style.cssText='flex:1;min-width:0';
      const res=frodon.makeElement('div','');res.style.cssText='font-size:.76rem;font-weight:700;color:'+(isDraw?'var(--txt2)':isWin?'var(--ok)':'var(--warn)');res.textContent=isDraw?'Égalité':isWin?'Victoire':'Défaite';
      const opp=frodon.makeElement('div','');opp.style.cssText='font-size:.62rem;color:var(--txt2);margin-top:1px';opp.textContent='vs '+(h.opponents?.join(', ')||'?');
      const pot=frodon.makeElement('div','');pot.style.cssText='font-size:.58rem;color:var(--txt3);font-family:var(--mono)';pot.textContent='Pot : '+h.pot+'🪙';
      inf.appendChild(res);inf.appendChild(opp);inf.appendChild(pot);
      const ts=frodon.makeElement('span','mini-card-ts',frodon.formatTime(h.ts));ts.style.flexShrink='0';
      row.appendChild(ico);row.appendChild(inf);row.appendChild(ts);
      c.appendChild(row);
    });
  }

  function mkAvHtml(p,size=32){const col=['#00f5c8','#7c4dff','#ff6b35','#00e87a','#f5c842','#ff4f8b'];const cl=col[((p?.name||'?').charCodeAt(0)||0)%col.length];return`<div style="width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;flex-shrink:0;background:var(--sur2);display:flex;align-items:center;justify-content:center;font-size:${size*.38}px;color:${cl};font-weight:700;font-family:var(--mono)">${p?.avatar?`<img src="${p.avatar}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">`:''}${(p?.name||'?')[0].toUpperCase()}</div>`;}

  let _cssInjected=false;
  function injectCSS(){if(_cssInjected)return;_cssInjected=true;const s=document.createElement('style');s.textContent=`.pk-card{display:inline-flex;flex-direction:column;align-items:center;justify-content:space-between;width:36px;height:52px;background:var(--sur);border:1.5px solid var(--bdr2);border-radius:7px;padding:3px;font-family:var(--mono);font-size:.7rem;position:relative;flex-shrink:0}.pk-card.back{background:linear-gradient(135deg,#1a1a3e,#0d0d22);border-color:rgba(124,77,255,.4);font-size:1.4rem;display:inline-flex;align-items:center;justify-content:center;width:36px;height:52px;border-radius:7px;flex-shrink:0}.pk-card.empty{background:transparent;border:1.5px dashed var(--bdr);opacity:.3;width:36px;height:52px;border-radius:7px;flex-shrink:0}.pk-card-tl{line-height:1;align-self:flex-start;display:flex;flex-direction:column;align-items:center}.pk-card-tl small,.pk-card-br small{font-size:.55em}.pk-card-suit{font-size:1rem;line-height:1}.pk-card-br{line-height:1;align-self:flex-end;display:flex;flex-direction:column;align-items:center;transform:rotate(180deg)}`;document.head.appendChild(s);}

  frodon.registerUninstallHook(PLUGIN_ID,()=>{if(!T)return;if(T.isHost)toAll('kick',{});else toHost('leave',{});T=null;persist();});
  restore();
  return{destroy(){if(!T)return;if(T.isHost)toAll('kick',{});else toHost('leave',{});T=null;persist();}};
});
