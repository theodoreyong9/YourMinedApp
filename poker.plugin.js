/**
 * FRODON PLUGIN — Texas Hold'em Poker P2P  v3.0
 * Réécriture calquée sur le pattern TicTacToe :
 * - games{} à la place de T (plusieurs tables simultanées)
 * - addScore() identique au TicTacToe, appelé une seule fois
 * - "Nouvelle main" = rematch, envoyé par l'hôte, reçu par tous
 * - Pas de double-appel applyResult, pas de blocage state_sync
 */
frodon.register({
  id: 'poker', name: "Texas Hold'em", version: '3.0.0',
  author: 'frodon-community',
  description: "Poker Texas Hold'em multijoueur P2P — jusqu'à 8 joueurs.",
  icon: '🃏',
}, () => {

  const PLUGIN_ID = 'poker';
  const store = frodon.storage(PLUGIN_ID);
  const myId  = () => frodon.getMyProfile().peerId;

  /* ─── Deck / évaluation ──────────────────────────────────────────── */
  const SUITS = ['♠','♥','♦','♣'];
  const VALS  = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
  const VNUM  = Object.fromEntries(VALS.map((v,i) => [v, i+2]));

  function mkDeck() {
    const d = [];
    for(const s of SUITS) for(const v of VALS) d.push({s,v});
    for(let i=d.length-1;i>0;i--){const j=0|Math.random()*(i+1);[d[i],d[j]]=[d[j],d[i]];}
    return d;
  }
  function evalBest(cards) {
    if(!cards||cards.length<2) return {score:0,name:'—'};
    const combos=[];
    if(cards.length<=5){combos.push(cards);}
    else{for(let i=0;i<cards.length;i++)for(let j=i+1;j<cards.length;j++)combos.push(cards.filter((_,k)=>k!==i&&k!==j));}
    let best=null;
    for(const c of combos){const s=eval5(c);if(!best||s.score>best.score)best=s;}
    return best||{score:0,name:'—'};
  }
  function eval5(cards) {
    const ns=cards.map(c=>VNUM[c.v]||0).sort((a,b)=>b-a);
    const suits=cards.map(c=>c.s);
    const flush=suits.every(s=>s===suits[0]);
    let straight=false,sHigh=0;
    if(ns[0]-ns[4]===4&&new Set(ns).size===5){straight=true;sHigh=ns[0];}
    if(''+ns==='14,5,4,3,2'){straight=true;sHigh=5;}
    const cnt={};ns.forEach(n=>cnt[n]=(cnt[n]||0)+1);
    const freq=Object.entries(cnt).map(([n,c])=>({n:+n,c})).sort((a,b)=>b.c-a.c||b.n-a.n);
    let rank,name,tb;
    if(flush&&straight)                    {rank=sHigh===14?8:7;name=sHigh===14?'Quinte flush royale':'Quinte flush';tb=[sHigh];}
    else if(freq[0].c===4)                 {rank=6;name='Carré';tb=[freq[0].n,freq[1]?.n||0];}
    else if(freq[0].c===3&&freq[1]?.c===2) {rank=5;name='Full house';tb=[freq[0].n,freq[1].n];}
    else if(flush)                          {rank=4;name='Couleur';tb=ns;}
    else if(straight)                       {rank=3;name='Suite';tb=[sHigh];}
    else if(freq[0].c===3)                  {rank=2;name='Brelan';tb=[freq[0].n,...freq.slice(1).map(f=>f.n)];}
    else if(freq[0].c===2&&freq[1]?.c===2)  {rank=1;name='Double paire';tb=[freq[0].n,freq[1].n,freq[2]?.n||0];}
    else if(freq[0].c===2)                  {rank=0;name='Paire';tb=[freq[0].n,...freq.slice(1).map(f=>f.n)];}
    else                                    {rank=-1;name='Carte haute';tb=ns;}
    const score=rank*1e7+tb.reduce((a,n,i)=>a+n*Math.pow(100,4-i),0);
    return {score,name};
  }
  function cardHtml(c,back=false){
    if(back||!c)return'<div class="pk-card back">🂠</div>';
    const red=c.s==='♥'||c.s==='♦';
    return`<div class="pk-card" style="color:${red?'#ff4f8b':'var(--txt)'}"><span class="pk-card-tl">${c.v}<small>${c.s}</small></span><span class="pk-card-suit">${c.s}</span><span class="pk-card-br">${c.v}<small>${c.s}</small></span></div>`;
  }

  /* ─── État : games{} comme TicTacToe ────────────────────────────── */
  // Clé = tableId, valeur = objet table
  const games = {};

  function getGame(tid) { return games[tid] || null; }
  function getMyGame()  { return Object.values(games).find(g => g.players.some(p=>p.id===myId())) || null; }

  /* ─── Scores — identique TicTacToe ──────────────────────────────── */
  function addScore(result, opponentNames, pot) {
    store.set('wins',      (store.get('wins')     ||0)+(result==='win' ?1:0));
    store.set('losses',    (store.get('losses')   ||0)+(result==='loss'?1:0));
    store.set('chips_won', (store.get('chips_won')||0)+(result==='win' ?pot:0));
    const hist=store.get('history')||[];
    hist.unshift({result, pot, opponents:opponentNames, ts:Date.now()});
    if(hist.length>50) hist.length=50;
    store.set('history', hist);
  }

  /* ─── Persistance ───────────────────────────────────────────────── */
  function persist() {
    const toSave={};
    for(const [tid,g] of Object.entries(games)) {
      toSave[tid]={...g,
        allHands: g.isHost?(g.allHands||{}):{[myId()]:g.myHand||[]},
        deck: g.isHost?(g.deck||[]):[],
      };
    }
    if(Object.keys(toSave).length===0) store.del('games');
    else store.set('games',toSave);
  }
  function restore() {
    const saved=store.get('games');
    if(!saved) return;
    for(const [tid,g] of Object.entries(saved)) {
      games[tid]={...g, allHands:g.allHands||{}, myHand:g.allHands?.[myId()]||[]};
    }
    if(Object.keys(games).length===0) return;
    setTimeout(()=>{
      for(const [tid,g] of Object.entries(games)) {
        if(g.isHost) hostSync(tid);
        else toHost(tid,'resync',{});
      }
    },3500);
    frodon.refreshSphereTab(PLUGIN_ID);
  }

  /* ─── Réseau ────────────────────────────────────────────────────── */
  function toAll(tid,type,extra={})   { const g=games[tid]; if(!g)return; g.players.forEach(p=>{if(p.id!==myId())frodon.sendDM(p.id,PLUGIN_ID,{type,tid,...extra,_silent:true});}); }
  function toPlayer(pid,type,extra={}) { frodon.sendDM(pid,PLUGIN_ID,{type,...extra,_silent:true}); }
  function toHost(tid,type,extra={})  { const g=games[tid]; if(!g)return; frodon.sendDM(g.hostId,PLUGIN_ID,{type,tid,...extra,_silent:true}); }

  /* ─── Logique hôte ──────────────────────────────────────────────── */
  function hostPublicState(tid) {
    const g=games[tid];
    return {phase:g.phase,players:g.players.map(({id,name,avatar,chips,bet,hasActed,status})=>({id,name,avatar,chips,bet,hasActed,status})),community:g.community,pot:g.pot,currentIdx:g.currentIdx,dealerIdx:g.dealerIdx,roundBet:g.roundBet,sb:g.sb,bb:g.bb,result:g.result||null};
  }
  function hostSync(tid) {
    const g=games[tid]; if(!g) return;
    const pub=hostPublicState(tid);
    g.players.forEach(p=>{
      if(p.id===myId()) return;
      toPlayer(p.id,'state_sync',{tid,pub});
      if(g.allHands[p.id]&&g.phase!=='lobby'&&g.phase!=='ended') toPlayer(p.id,'hand',{tid,cards:g.allHands[p.id]});
    });
    persist();
    frodon.refreshSphereTab(PLUGIN_ID);
  }

  function hostDeal(tid) {
    const g=games[tid]; if(!g) return;
    const active=g.players.filter(p=>p.chips>0);
    if(active.length<2){frodon.showToast('Pas assez de joueurs',true);return;}

    g.deck=mkDeck(); g.community=[]; g.pot=0; g.phase='preflop'; g.allHands={}; g.result=null;

    g.dealerIdx=(g.dealerIdx+1)%g.players.length;
    while(g.players[g.dealerIdx].chips<=0) g.dealerIdx=(g.dealerIdx+1)%g.players.length;

    const nxt=idx=>{let i=(idx+1)%g.players.length;while(g.players[i].chips<=0)i=(i+1)%g.players.length;return i;};
    const sbIdx=nxt(g.dealerIdx),bbIdx=nxt(sbIdx);
    g.players.forEach(p=>{p.bet=0;p.hasActed=false;p.status=p.chips>0?'active':'out';});
    const sb=g.players[sbIdx],bb=g.players[bbIdx];
    const sbA=Math.min(g.sb,sb.chips),bbA=Math.min(g.bb,bb.chips);
    sb.chips-=sbA;sb.bet=sbA;if(sb.chips===0)sb.status='allin';
    bb.chips-=bbA;bb.bet=bbA;if(bb.chips===0)bb.status='allin';
    g.roundBet=bbA;
    g.players.filter(p=>p.status==='active'||p.status==='allin').forEach(p=>{g.allHands[p.id]=[g.deck.pop(),g.deck.pop()];});
    g.myHand=g.allHands[myId()]||[];
    g.currentIdx=nxt(bbIdx);

    hostSync(tid);
    frodon.showToast('🃏 Cartes distribuées !');
    setTimeout(()=>frodon.focusPlugin(PLUGIN_ID),200);
  }

  function hostAction(tid,fromId,action,amount) {
    const g=games[tid]; if(!g||g.phase==='lobby'||g.phase==='ended') return;
    const pIdx=g.players.findIndex(p=>p.id===fromId); if(pIdx<0||g.currentIdx!==pIdx) return;
    const p=g.players[pIdx]; if(p.status!=='active') return;

    if(action==='fold')  {p.status='fold';p.hasActed=true;}
    else if(action==='check') {if(p.bet<g.roundBet)return;p.hasActed=true;}
    else if(action==='call')  {const t=Math.min(g.roundBet-p.bet,p.chips);p.chips-=t;p.bet+=t;if(p.chips===0)p.status='allin';p.hasActed=true;}
    else if(action==='raise') {const r=Math.max(amount||0,g.roundBet+g.bb),a=Math.min(r-p.bet,p.chips);p.chips-=a;p.bet+=a;g.roundBet=p.bet;if(p.chips===0)p.status='allin';g.players.forEach(op=>{if(op.id!==fromId&&op.status==='active')op.hasActed=false;});p.hasActed=true;}
    else if(action==='allin') {const a=p.chips;p.chips=0;p.bet+=a;if(p.bet>g.roundBet){g.roundBet=p.bet;g.players.forEach(op=>{if(op.id!==fromId&&op.status==='active')op.hasActed=false;});}p.status='allin';p.hasActed=true;}

    if(hostCheckRoundEnd(tid)) return;
    let next=(pIdx+1)%g.players.length,guard=0;
    while(g.players[next].status!=='active'&&guard<g.players.length){next=(next+1)%g.players.length;guard++;}
    g.currentIdx=next;
    hostSync(tid);
  }

  function hostCheckRoundEnd(tid) {
    const g=games[tid];
    const inHand=g.players.filter(p=>p.status==='active'||p.status==='allin');
    if(inHand.length<=1) {
      const w=inHand[0]||g.players.find(p=>p.status==='allin');
      if(w){g.players.forEach(p=>{g.pot+=p.bet;p.bet=0;});w.chips+=g.pot;
        const winPot=g.pot;
        hostFinish(tid,{pot:winPot,winner:w.id,winnerName:w.name,results:[{id:w.id,name:w.name,hand:[],handName:'Tous les autres ont couché'}],players:g.players.map(p=>({id:p.id,chips:p.chips}))});}
      return true;
    }
    const active=g.players.filter(p=>p.status==='active');
    if(active.length===0||active.every(p=>p.hasActed&&p.bet===g.roundBet)){hostNextStreet(tid);return true;}
    return false;
  }

  function hostNextStreet(tid) {
    const g=games[tid];
    g.players.forEach(p=>{g.pot+=p.bet;p.bet=0;p.hasActed=false;});g.roundBet=0;
    const inHand=g.players.filter(p=>p.status==='active'||p.status==='allin');
    if(inHand.length<=1){hostShowdown(tid);return;}
    if(g.phase==='preflop'){g.phase='flop';g.community.push(g.deck.pop(),g.deck.pop(),g.deck.pop());}
    else if(g.phase==='flop') {g.phase='turn'; g.community.push(g.deck.pop());}
    else if(g.phase==='turn') {g.phase='river';g.community.push(g.deck.pop());}
    else if(g.phase==='river'){hostShowdown(tid);return;}
    let idx=(g.dealerIdx+1)%g.players.length;
    while(g.players[idx].status!=='active'){idx=(idx+1)%g.players.length;if(idx===g.dealerIdx)break;}
    g.currentIdx=idx;hostSync(tid);
  }

  function hostShowdown(tid) {
    const g=games[tid];
    g.players.forEach(p=>{g.pot+=p.bet;p.bet=0;});
    const inHand=g.players.filter(p=>p.status==='active'||p.status==='allin');
    const evals=inHand.map(p=>{const h=g.allHands[p.id]||[];const b=evalBest([...h,...g.community]);return{id:p.id,name:p.name,hand:h,handName:b.name,score:b.score};});
    evals.sort((a,b)=>b.score-a.score);
    const winner=evals[0];const wp=g.players.find(p=>p.id===winner.id);if(wp)wp.chips+=g.pot;
    hostFinish(tid,{pot:g.pot,winner:winner.id,winnerName:winner.name,results:evals,players:g.players.map(p=>({id:p.id,chips:p.chips})),community:g.community});
  }

  // Point de sortie unique côté hôte — appelé UNE seule fois
  function hostFinish(tid,result) {
    const g=games[tid]; if(!g) return;
    g.pot=0; g.phase='ended'; g.result=result;
    result.players.forEach(r=>{const p=g.players.find(q=>q.id===r.id);if(p)p.chips=r.chips;});
    if(result.community) g.community=result.community;
    // Enregistrer le score côté hôte
    const isWin=result.winner===myId();
    addScore(isWin?'win':'loss', g.players.filter(p=>p.id!==myId()).map(p=>p.name), result.pot);
    // Envoyer showdown aux clients (ils appelleront applyResult)
    toAll(tid,'showdown',result);
    persist();
    frodon.refreshSphereTab(PLUGIN_ID);
    frodon.showToast(isWin?'🏆 Vous remportez '+result.pot+'🪙 !':'🃏 '+result.winnerName+' gagne '+result.pot+'🪙');
    setTimeout(()=>frodon.focusPlugin(PLUGIN_ID),300);
  }

  // Appelé côté CLIENT uniquement (pas hôte) à réception du DM 'showdown'
  function applyResult(tid,result) {
    const g=games[tid]; if(!g) return;
    g.phase='ended'; g.result=result;
    result.players.forEach(r=>{const p=g.players.find(q=>q.id===r.id);if(p)p.chips=r.chips;});
    if(result.community) g.community=result.community;
    // Score côté client
    const isWin=result.winner===myId();
    addScore(isWin?'win':'loss', g.players.filter(p=>p.id!==myId()).map(p=>p.name), result.pot);
    persist();
    frodon.refreshSphereTab(PLUGIN_ID);
    frodon.showToast(isWin?'🏆 Vous remportez '+result.pot+'🪙 !':'🃏 '+result.winnerName+' gagne '+result.pot+'🪙');
    setTimeout(()=>frodon.focusPlugin(PLUGIN_ID),300);
  }

  /* ─── DM handler ────────────────────────────────────────────────── */
  frodon.onDM(PLUGIN_ID, (fromId,payload) => {
    const {type,tid}=payload;

    if(type==='invite') {
      const host=frodon.getPeer(fromId);
      games[tid]={id:tid,isHost:false,hostId:fromId,phase:'lobby',
        players:payload.players||[],myHand:[],allHands:{},community:[],deck:[],
        pot:0,roundBet:payload.bb||20,currentIdx:0,dealerIdx:-1,
        sb:payload.sb||10,bb:payload.bb||20,result:null,_inviteFrom:host?.name||'?'};
      games[tid].players.forEach(p=>{if(p.id===myId())p.isMe=true;});
      persist();
      frodon.showToast('🃏 '+(host?.name||'?')+' vous invite !');
      frodon.refreshSphereTab(PLUGIN_ID);
      setTimeout(()=>frodon.focusPlugin(PLUGIN_ID),400);
      return;
    }

    if(type==='invite_accept') {
      const g=games[tid]; if(!g||!g.isHost) return;
      const peer=frodon.getPeer(fromId);
      let p=g.players.find(pl=>pl.id===fromId);
      if(!p){p={id:fromId,name:peer?.name||'?',avatar:peer?.avatar||'',chips:1000,bet:0,hasActed:false,status:'active',isMe:false};g.players.push(p);}
      else p.status='active';
      frodon.showToast('🃏 '+(peer?.name||'?')+' rejoint !');
      hostSync(tid); return;
    }

    if(type==='invite_decline') {
      const g=games[tid]; if(!g||!g.isHost) return;
      g.players=g.players.filter(p=>p.id!==fromId);
      frodon.showToast((frodon.getPeer(fromId)?.name||'?')+' décline.');
      hostSync(tid); return;
    }

    if(type==='state_sync') {
      const g=games[tid]; if(!g) return;
      const pub=payload.pub;
      // Accepter si: on n'est pas ended, OU si la nouvelle phase n'est pas ended (nouvelle donne)
      if(g.phase!=='ended' || pub.phase!=='ended') {
        g.phase=pub.phase; g.community=pub.community; g.pot=pub.pot;
        g.currentIdx=pub.currentIdx; g.dealerIdx=pub.dealerIdx; g.roundBet=pub.roundBet;
        g.players=pub.players.map(p=>({...p,isMe:p.id===myId()}));
        g.result=pub.result||null;
      }
      persist(); frodon.refreshSphereTab(PLUGIN_ID);
      if(g.phase!=='ended'&&g.phase!=='lobby'&&g.players[g.currentIdx]?.id===myId()) {
        frodon.showToast('🃏 C\'est votre tour !');
        setTimeout(()=>frodon.focusPlugin(PLUGIN_ID),300);
      }
      return;
    }

    if(type==='hand') {
      const g=games[tid]; if(!g) return;
      g.myHand=payload.cards||[];
      persist(); frodon.refreshSphereTab(PLUGIN_ID); return;
    }

    if(type==='action') {
      const g=games[tid]; if(!g||!g.isHost) return;
      hostAction(tid,fromId,payload.action,payload.amount||0); return;
    }

    if(type==='showdown') {
      // Côté CLIENT uniquement — l'hôte passe par hostFinish directement
      if(!games[tid]||games[tid].isHost) return;
      applyResult(tid,payload); return;
    }

    if(type==='kick') {
      if(!games[tid]) return;
      delete games[tid];
      persist(); frodon.showToast('🃏 Table fermée.'); frodon.refreshSphereTab(PLUGIN_ID); return;
    }

    if(type==='new_hand') {
      // L'hôte envoie new_hand pour lancer une nouvelle main directement
      // Les clients mettent à jour leurs chips et passent en mode attente
      const g=games[tid]; if(!g) return;
      payload.players.forEach(r=>{const p=g.players.find(q=>q.id===r.id);if(p)p.chips=r.chips;});
      g.phase='preflop'; g.result=null; g.myHand=[]; g.community=[];
      persist(); frodon.refreshSphereTab(PLUGIN_ID);
      frodon.showToast('🃏 Nouvelle main en cours…'); return;
    }

    if(type==='leave') {
      const g=games[tid]; if(!g||!g.isHost) return;
      const p=g.players.find(pl=>pl.id===fromId);
      if(p){p.status='away';}
      if(g.phase!=='lobby'&&g.phase!=='ended'){
        if(g.currentIdx===g.players.indexOf(p)) hostAction(tid,fromId,'fold',0);
        else hostSync(tid);
      }
      return;
    }

    if(type==='resync') {
      const g=games[tid]; if(!g||!g.isHost) return;
      let p=g.players.find(pl=>pl.id===fromId);
      if(!p){const peer=frodon.getPeer(fromId);if(peer){p=g.players.find(pl=>pl.status==='away'&&pl.name===peer.name);}
        if(p){if(g.allHands[p.id]){g.allHands[fromId]=g.allHands[p.id];delete g.allHands[p.id];}p.id=fromId;p.avatar=frodon.getPeer(fromId)?.avatar||p.avatar;}}
      if(p&&p.status==='away')p.status='active';
      toPlayer(fromId,'state_sync',{tid,pub:hostPublicState(tid)});
      if(g.allHands[fromId])toPlayer(fromId,'hand',{tid,cards:g.allHands[fromId]});
      hostSync(tid); return;
    }
  });

  /* ─── Hooks pair ────────────────────────────────────────────────── */
  frodon.onPeerAppear(peer=>{
    for(const [tid,g] of Object.entries(games)){
      const p=g.players.find(pl=>pl.id===peer.peerId||
        (pl.status==='away'&&pl.name===peer.name));
      if(!p) continue;
      if(g.isHost){
        if(p.id!==peer.peerId&&g.allHands[p.id]){g.allHands[peer.peerId]=g.allHands[p.id];delete g.allHands[p.id];}
        p.id=peer.peerId;p.avatar=peer.avatar||p.avatar;
        if(p.status==='away')p.status='active';
        toPlayer(peer.peerId,'state_sync',{tid,pub:hostPublicState(tid)});
        if(g.allHands[peer.peerId])toPlayer(peer.peerId,'hand',{tid,cards:g.allHands[peer.peerId]});
        hostSync(tid);
      } else if(peer.peerId===g.hostId){
        setTimeout(()=>toHost(tid,'resync',{}),500);
      }
    }
  });

  frodon.onPeerLeave(peerId=>{
    for(const [tid,g] of Object.entries(games)){
      if(!g.isHost) continue;
      const p=g.players.find(pl=>pl.id===peerId);if(!p||p.status==='out')continue;
      p.status='away';
      if(g.phase!=='lobby'&&g.phase!=='ended'){
        if(g.players[g.currentIdx]?.id===peerId) hostAction(tid,peerId,'fold',0);
        else hostSync(tid);
      }
    }
  });

  /* ─── Fiche d'un pair ────────────────────────────────────────────── */
  frodon.registerPeerAction(PLUGIN_ID,'🃏 Poker',(peerId,container)=>{
    const peer=frodon.getPeer(peerId);if(!peer){container.appendChild(frodon.makeElement('div','no-posts','Pair indisponible.'));return;}
    const peerName=peer.name||'?';
    // Chercher une partie existante avec ce pair
    const existing=Object.values(games).find(g=>g.players.some(p=>p.id===peerId));

    if(!existing) {
      const btn=frodon.makeElement('button','plugin-action-btn acc','🃏 Créer une table & inviter');
      btn.addEventListener('click',()=>{
        const me=frodon.getMyProfile(),tid='pk_'+Date.now();
        games[tid]={id:tid,isHost:true,hostId:myId(),phase:'lobby',
          players:[{id:myId(),name:me.name,avatar:me.avatar||'',chips:1000,bet:0,hasActed:false,status:'active',isMe:true},
                   {id:peerId,name:peerName,avatar:peer.avatar||'',chips:1000,bet:0,hasActed:false,status:'active',isMe:false}],
          myHand:[],allHands:{},community:[],deck:[],pot:0,roundBet:20,
          currentIdx:0,dealerIdx:-1,sb:10,bb:20,result:null};
        frodon.sendDM(peerId,PLUGIN_ID,{type:'invite',tid,sb:10,bb:20,
          players:games[tid].players.map(p=>({id:p.id,name:p.name,avatar:p.avatar||'',chips:p.chips,status:p.status})),
          _label:'🃏 Invitation au Poker !'});
        persist();frodon.showToast('🃏 Invitation envoyée');
        frodon.refreshSphereTab(PLUGIN_ID);setTimeout(()=>frodon.focusPlugin(PLUGIN_ID),200);
      });
      container.appendChild(btn);return;
    }

    const g=existing;
    if(g.isHost&&g.phase==='lobby') {
      const inTable=g.players.find(p=>p.id===peerId);
      if(inTable){container.appendChild(frodon.makeElement('div','no-posts','Déjà à la table ✓'));}
      else{
        const btn=frodon.makeElement('button','plugin-action-btn','+ Ajouter à la table');
        btn.addEventListener('click',()=>{
          g.players.push({id:peerId,name:peerName,avatar:peer.avatar||'',chips:1000,bet:0,hasActed:false,status:'active',isMe:false});
          frodon.sendDM(peerId,PLUGIN_ID,{type:'invite',tid:g.id,sb:g.sb,bb:g.bb,
            players:g.players.map(p=>({id:p.id,name:p.name,avatar:p.avatar||'',chips:p.chips,status:p.status})),
            _label:'🃏 Invitation au Poker !'});
          frodon.showToast('🃏 Invitation à '+peerName);frodon.refreshSphereTab(PLUGIN_ID);
        });
        container.appendChild(btn);
      }
    } else if(g.phase==='ended'&&g.result) {
      const isWin=g.result.winner===myId();
      const st=frodon.makeElement('div','');
      st.style.cssText='font-family:var(--mono);font-size:.72rem;text-align:center;padding:6px 0 6px;color:'+(isWin?'var(--ok)':'var(--warn)');
      st.textContent=isWin?'🏆 Victoire !':'😔 '+(g.result.winnerName||'?')+' a gagné';
      container.appendChild(st);
      const go=frodon.makeElement('button','plugin-action-btn acc','▶ Voir le résultat');
      go.addEventListener('click',()=>frodon.focusPlugin(PLUGIN_ID));
      container.appendChild(go);
    } else {
      const isMyturn=g.players[g.currentIdx]?.id===myId();
      const st=frodon.makeElement('div','');
      st.style.cssText='font-family:var(--mono);font-size:.68rem;text-align:center;padding:4px 0 6px;color:var(--txt2)';
      st.textContent=isMyturn?'⌛ Votre tour':'💬 Tour de '+(g.players[g.currentIdx]?.name||'?');
      container.appendChild(st);
      const go=frodon.makeElement('button','plugin-action-btn acc','▶ Jouer dans SPHERE');
      go.addEventListener('click',()=>frodon.focusPlugin(PLUGIN_ID));
      container.appendChild(go);
    }
  });

  /* ─── Panneau SPHERE ─────────────────────────────────────────────── */
  frodon.registerBottomPanel(PLUGIN_ID,[
    {id:'table',label:'🃏 Table',
      render(container){
        injectCSS();
        const g=getMyGame();
        if(!g){renderEmpty(container);return;}
        if(g._inviteFrom){renderInvite(container,g);return;}
        if(g.phase==='lobby'){renderLobby(container,g);return;}
        if(g.phase==='ended'){renderResult(container,g);return;}
        renderGame(container,g);
      }},
    {id:'scores',label:'🏆 Scores',
      render(container){renderScores(container);}},
  ]);

  /* ─── Rendus ─────────────────────────────────────────────────────── */
  function renderEmpty(c){
    const w=frodon.makeElement('div','');w.style.cssText='text-align:center;padding:32px 20px';
    w.innerHTML='<div style="font-size:2.8rem;margin-bottom:10px">🃏</div><div style="color:var(--txt2);font-size:.76rem;line-height:1.8">Aucune partie en cours.<br><small style="color:var(--txt3)">Ouvrez le profil d\'un pair pour l\'inviter.</small></div>';
    c.appendChild(w);
  }

  function renderInvite(c,g){
    const w=frodon.makeElement('div','');w.style.cssText='padding:20px;text-align:center';
    w.innerHTML=`<div style="font-size:2rem;margin-bottom:8px">🃏</div><div style="font-size:.88rem;font-weight:700;color:var(--txt);margin-bottom:4px">${g._inviteFrom} vous invite</div><div style="font-size:.68rem;color:var(--txt2);margin-bottom:16px">Texas Hold'em · ${g.sb}/${g.bb} blindes · 1000🪙</div>`;
    const r=frodon.makeElement('div','');r.style.cssText='display:flex;gap:8px;justify-content:center';
    const acc=frodon.makeElement('button','plugin-action-btn acc','✔ Accepter');
    acc.addEventListener('click',()=>{
      toHost(g.id,'invite_accept',{});delete g._inviteFrom;persist();
      frodon.showToast('🃏 Vous avez rejoint !');frodon.refreshSphereTab(PLUGIN_ID);
    });
    const dec=frodon.makeElement('button','plugin-action-btn','✕ Refuser');
    dec.addEventListener('click',()=>{toHost(g.id,'invite_decline',{});delete games[g.id];persist();frodon.refreshSphereTab(PLUGIN_ID);});
    r.appendChild(acc);r.appendChild(dec);w.appendChild(r);c.appendChild(w);
  }

  function renderLobby(c,g){
    const hdr=frodon.makeElement('div','');
    hdr.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid var(--bdr)';
    hdr.innerHTML=`<div style="font-family:var(--mono);font-size:.8rem;color:var(--acc)">🃏 SALON · ${g.sb}/${g.bb}</div>`;
    if(g.isHost){const s=frodon.makeElement('button','plugin-action-btn acc','▶ Lancer');s.style.fontSize='.65rem';s.addEventListener('click',()=>hostDeal(g.id));hdr.appendChild(s);}
    c.appendChild(hdr);
    const seats=frodon.makeElement('div','');seats.style.cssText='display:flex;flex-wrap:wrap;gap:8px;padding:12px;justify-content:center';
    g.players.forEach(p=>{
      const seat=frodon.makeElement('div','');
      seat.style.cssText=`display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 8px;min-width:60px;background:var(--sur2);border:1.5px solid ${p.isMe?'var(--acc)':'var(--bdr2)'};border-radius:12px`;
      seat.innerHTML=`${mkAv(p,36)}<div style="font-size:.6rem;font-weight:700;color:${p.isMe?'var(--acc)':'var(--txt)'};max-width:64px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.isMe?'Moi':p.name}</div><div style="font-size:.55rem;font-family:var(--mono);color:var(--txt2)">${p.chips}🪙</div>`;
      if(g.isHost&&!p.isMe){
        const rm=frodon.makeElement('button','');rm.style.cssText='font-size:.5rem;padding:2px 5px;background:rgba(255,68,68,.1);border:1px solid rgba(255,68,68,.2);border-radius:4px;color:var(--warn);cursor:pointer;margin-top:2px';rm.textContent='✕';
        rm.addEventListener('click',()=>{frodon.sendDM(p.id,PLUGIN_ID,{type:'kick',tid:g.id,_silent:true});g.players=g.players.filter(pl=>pl.id!==p.id);hostSync(g.id);});
        seat.appendChild(rm);
      }
      seats.appendChild(seat);
    });
    c.appendChild(seats);
    if(g.isHost){const hint=frodon.makeElement('div','');hint.style.cssText='text-align:center;font-size:.6rem;color:var(--txt3);padding:0 12px 14px';hint.textContent='Ouvrez le profil d\'un pair pour l\'ajouter · 2-8 joueurs';c.appendChild(hint);}
  }

  function renderGame(c,g){
    const me=g.players.find(p=>p.isMe||p.id===myId());
    const PHASES=['preflop','flop','turn','river'];
    const PLABELS={preflop:'Pré-flop',flop:'Flop',turn:'Turn',river:'River'};

    const top=frodon.makeElement('div','');
    top.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:5px 10px;border-bottom:1px solid var(--bdr);background:rgba(0,0,0,.2)';
    top.innerHTML=`<div style="display:flex;gap:4px">${PHASES.map(ph=>`<span style="font-size:.56rem;font-family:var(--mono);padding:2px 7px;border-radius:4px;background:${g.phase===ph?'rgba(0,245,200,.15)':'transparent'};color:${g.phase===ph?'var(--acc)':'var(--txt3)'}">${PLABELS[ph]}</span>`).join('')}</div><div style="font-family:var(--mono);font-size:.75rem;color:var(--warn)">Pot ${g.pot}🪙</div>`;
    c.appendChild(top);

    const row=frodon.makeElement('div','');row.style.cssText='display:flex;flex-wrap:wrap;gap:4px;justify-content:center;padding:8px 6px 4px';
    g.players.forEach((p,i)=>{
      const isD=i===g.dealerIdx,isCur=i===g.currentIdx;
      const chip=frodon.makeElement('div','');
      chip.style.cssText=`display:flex;flex-direction:column;align-items:center;gap:2px;min-width:50px;padding:5px 4px;border-radius:9px;border:1.5px solid ${isCur?'var(--acc2)':p.isMe?'rgba(0,245,200,.25)':'transparent'};background:${isCur?'rgba(124,77,255,.08)':'transparent'};opacity:${p.status==='fold'?.45:1}`;
      chip.innerHTML=`<div style="position:relative">${mkAv(p,30)}${isD?'<div style="position:absolute;bottom:-3px;right:-3px;background:#f5c842;color:#000;font-size:.42rem;font-weight:900;border-radius:50%;width:13px;height:13px;display:flex;align-items:center;justify-content:center">D</div>':''}</div><div style="font-size:.52rem;font-weight:700;color:${p.isMe?'var(--acc)':'var(--txt)'};max-width:54px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.isMe?'Moi':p.name}</div><div style="font-size:.5rem;font-family:var(--mono);color:var(--txt2)">${p.chips}🪙</div>${p.bet>0?`<div style="font-size:.48rem;font-family:var(--mono);color:var(--warn)">${p.bet}🪙</div>`:''}${p.status==='fold'?'<div style="font-size:.47rem;color:var(--txt3)">couché</div>':''}${p.status==='allin'?'<div style="font-size:.47rem;color:var(--warn)">ALL-IN</div>':''}`;
      row.appendChild(chip);
    });
    c.appendChild(row);

    const comm=frodon.makeElement('div','');comm.style.cssText='display:flex;gap:5px;justify-content:center;padding:8px;margin:2px 8px 4px;background:rgba(0,245,200,.03);border-radius:10px';
    for(let i=0;i<5;i++){const el=frodon.makeElement('div','');el.innerHTML=g.community[i]?cardHtml(g.community[i]):'<div class="pk-card empty"></div>';comm.appendChild(el);}
    c.appendChild(comm);

    // Mes cartes
    const hw=frodon.makeElement('div','');hw.style.cssText='display:flex;flex-direction:column;align-items:center;gap:5px;padding:6px 8px';
    const hl=frodon.makeElement('div','');hl.style.cssText='font-size:.56rem;font-family:var(--mono);color:var(--txt3);text-transform:uppercase;letter-spacing:.8px';hl.textContent='Mes cartes';
    const mc=frodon.makeElement('div','');mc.style.cssText='display:flex;gap:6px';
    if(me?.status==='fold'){mc.innerHTML=cardHtml(null,true)+cardHtml(null,true);hl.textContent='Couché';}
    else if(g.myHand?.length===2){
      mc.innerHTML=cardHtml(g.myHand[0])+cardHtml(g.myHand[1]);
      if(g.community.length>=3){const b=evalBest([...g.myHand,...g.community]);const hn=frodon.makeElement('div','');hn.style.cssText='font-size:.65rem;font-family:var(--mono);color:var(--acc2);padding:3px 10px;background:rgba(124,77,255,.1);border-radius:6px;border:1px solid rgba(124,77,255,.25)';hn.textContent='✦ '+b.name;hw.appendChild(hl);hw.appendChild(mc);hw.appendChild(hn);c.appendChild(hw);renderActions(c,g,me);return;}
    } else {mc.innerHTML=cardHtml(null,true)+cardHtml(null,true);}
    hw.appendChild(hl);hw.appendChild(mc);c.appendChild(hw);
    renderActions(c,g,me);
  }

  function renderActions(c,g,me){
    if(!me||me.status!=='active'||g.players[g.currentIdx]?.id!==myId()){
      const w=frodon.makeElement('div','');w.style.cssText='text-align:center;padding:10px;font-size:.68rem;color:var(--txt3);font-family:var(--mono)';
      w.textContent=me?.status==='fold'?'Couché':me?.status==='allin'?'All-in':'⌛ Tour de '+(g.players[g.currentIdx]?.name||'?');
      c.appendChild(w);return;
    }
    const toCall=Math.min(g.roundBet-me.bet,me.chips),canCheck=me.bet>=g.roundBet;
    const wrap=frodon.makeElement('div','');wrap.style.cssText='padding:8px 10px 10px;border-top:1px solid var(--bdr)';
    const row1=frodon.makeElement('div','');row1.style.cssText='display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-bottom:7px';
    const fold=frodon.makeElement('button','plugin-action-btn','🏳 Coucher');fold.style.fontSize='.68rem';fold.addEventListener('click',()=>doAction(g,'fold'));
    if(canCheck){
      const chk=frodon.makeElement('button','plugin-action-btn acc','✔ Checker');chk.style.fontSize='.68rem';chk.addEventListener('click',()=>doAction(g,'check'));
      row1.appendChild(fold);row1.appendChild(chk);
    } else {
      const call=frodon.makeElement('button','plugin-action-btn acc','📞 Suivre +'+toCall+'🪙');call.style.fontSize='.68rem';call.addEventListener('click',()=>doAction(g,'call'));
      row1.appendChild(fold);row1.appendChild(call);
    }
    wrap.appendChild(row1);
    const row2=frodon.makeElement('div','');row2.style.cssText='display:flex;gap:6px;align-items:center;justify-content:center';
    const inp=document.createElement('input');inp.type='number';inp.className='f-input';inp.style.cssText='width:80px;text-align:center;padding:5px 8px;font-family:var(--mono)';inp.min=g.roundBet+g.bb;inp.max=me.chips;inp.step=g.bb;inp.value=Math.min(g.roundBet+g.bb,me.chips);
    const raise=frodon.makeElement('button','plugin-action-btn','🔺 Relancer');raise.style.fontSize='.68rem';raise.addEventListener('click',()=>doAction(g,'raise',parseInt(inp.value)||g.roundBet+g.bb));
    const allin=frodon.makeElement('button','plugin-action-btn','♠ All-in');allin.style.cssText+=';font-size:.68rem;color:var(--warn);border-color:rgba(255,193,7,.35)';allin.addEventListener('click',()=>doAction(g,'allin',me.chips));
    row2.appendChild(inp);row2.appendChild(raise);row2.appendChild(allin);
    wrap.appendChild(row2);c.appendChild(wrap);
  }

  function doAction(g,action,amount){
    if(g.isHost){hostAction(g.id,myId(),action,amount||0);}
    else{
      toHost(g.id,'action',{action,amount:amount||0});
      const me=g.players.find(p=>p.id===myId());
      if(me){
        if(action==='fold')  me.status='fold';
        else if(action==='call')  {const t=Math.min(g.roundBet-me.bet,me.chips);me.chips-=t;me.bet+=t;}
        else if(action==='raise') {const t=Math.min((amount||g.roundBet+g.bb)-me.bet,me.chips);me.chips-=t;me.bet+=t;g.roundBet=me.bet;}
        else if(action==='allin') {me.chips=0;me.bet+=amount||0;me.status='allin';}
        me.hasActed=true;
      }
      persist();frodon.refreshSphereTab(PLUGIN_ID);
    }
  }

  function renderResult(c,g){
    const res=g.result;
    if(!res){const w=frodon.makeElement('div','');w.style.cssText='text-align:center;padding:24px;color:var(--txt3);font-size:.72rem';w.textContent='⌛ Résultat en attente…';c.appendChild(w);return;}
    const isWin=res.winner===myId();
    const winP=g.players.find(p=>p.id===res.winner);

    const hdr=frodon.makeElement('div','');hdr.style.cssText='text-align:center;padding:14px 12px 8px';
    hdr.innerHTML=`<div style="font-size:1.8rem;margin-bottom:5px">${isWin?'🏆':'🃏'}</div><div style="font-size:.95rem;font-weight:700;color:${isWin?'var(--ok)':'var(--txt)'}">${isWin?'Vous avez gagné !':((winP?.name||res.winnerName||'?')+' gagne')}</div><div style="font-size:.7rem;font-family:var(--mono);color:var(--warn);margin-top:3px">Pot : ${res.pot}🪙</div>`;
    c.appendChild(hdr);

    if(g.community.length){const comm=frodon.makeElement('div','');comm.style.cssText='display:flex;gap:5px;justify-content:center;margin:0 8px 10px';g.community.forEach(card=>{const el=frodon.makeElement('div','');el.innerHTML=cardHtml(card);comm.appendChild(el);});c.appendChild(comm);}

    if(res.results){
      const rl=frodon.makeElement('div','');rl.style.cssText='padding:0 8px';
      res.results.forEach(r=>{
        const isW=r.id===res.winner;const row=frodon.makeElement('div','');
        row.style.cssText=`display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:9px;margin-bottom:4px;background:${isW?'rgba(0,229,122,.08)':'var(--sur2)'};border:1px solid ${isW?'rgba(0,229,122,.25)':'var(--bdr)'}`;
        const ph=g.players.find(p=>p.id===r.id);
        row.innerHTML=`${mkAv(ph||{name:r.name},26)}<div style="flex:1;min-width:0"><div style="font-size:.72rem;font-weight:700;color:${isW?'var(--ok)':'var(--txt)'}">${r.id===myId()?'Moi':r.name}${isW?' 🏆':''}</div><div style="font-size:.6rem;color:var(--acc2);font-family:var(--mono)">${r.handName||'—'}</div></div><div style="display:flex;gap:3px">${(r.hand||[]).map(card=>cardHtml(card)).join('')}</div>`;
        rl.appendChild(row);
      });c.appendChild(rl);
    }

    // Chips restants
    const chips=frodon.makeElement('div','');chips.style.cssText='margin:10px 8px 0;border-top:1px solid var(--bdr);padding-top:8px';
    const lbl=frodon.makeElement('div','');lbl.style.cssText='font-size:.56rem;color:var(--txt3);font-family:var(--mono);text-transform:uppercase;letter-spacing:.8px;margin-bottom:5px';lbl.textContent='Chips restants';chips.appendChild(lbl);
    g.players.forEach(p=>{
      const row=frodon.makeElement('div','');row.style.cssText='display:flex;justify-content:space-between;font-size:.68rem;font-family:var(--mono);padding:2px 0';
      const nm=frodon.makeElement('span','',p.isMe?'Moi':p.name);nm.style.color=p.isMe?'var(--acc)':'var(--txt2)';
      const ch=frodon.makeElement('span','',p.chips>0?p.chips+'🪙':'💀 éliminé');ch.style.color=p.chips>0?'var(--txt2)':'var(--warn)';
      row.appendChild(nm);row.appendChild(ch);chips.appendChild(row);
    });c.appendChild(chips);

    // Boutons
    const btns=frodon.makeElement('div','');btns.style.cssText='padding:12px 8px 14px;display:flex;flex-direction:column;gap:8px';

    if(g.isHost){
      // Rebuy info
      const broke=g.players.filter(p=>p.chips<=0&&p.status!=='away');
      if(broke.length){const info=frodon.makeElement('div','');info.style.cssText='font-size:.62rem;color:var(--txt2);text-align:center;padding:5px 8px;background:rgba(255,107,53,.07);border:1px solid rgba(255,107,53,.2);border-radius:7px';info.textContent='⚠ '+broke.length+' joueur'+(broke.length>1?'s':'')+' éliminé'+(broke.length>1?'s':'')+' → rebuy 1000🪙';btns.appendChild(info);}
      // Bouton nouvelle main — hôte uniquement
      const newH=frodon.makeElement('button','plugin-action-btn acc','🔄 Nouvelle main');
      newH.style.cssText+=';width:100%';
      newH.addEventListener('click',()=>{
        // Rebuy les éliminés
        g.players.forEach(p=>{if(p.chips<=0&&p.status!=='away')p.chips=1000;});
        // Notifier les clients AVANT de lancer la donne
        toAll(g.id,'new_hand',{players:g.players.map(p=>({id:p.id,chips:p.chips}))});
        // Lancer la nouvelle donne directement
        hostDeal(g.id);
      });
      btns.appendChild(newH);
    } else {
      const wait=frodon.makeElement('div','');wait.style.cssText='font-size:.64rem;color:var(--txt3);font-family:var(--mono);text-align:center;padding:8px 0';wait.textContent='⌛ En attente que l\'hôte lance une nouvelle main…';btns.appendChild(wait);
    }

    const leave=frodon.makeElement('button','plugin-action-btn','🚪 Quitter la table');
    leave.style.cssText+=';width:100%';
    leave.addEventListener('click',()=>{
      if(g.isHost)toAll(g.id,'kick',{});else toHost(g.id,'leave',{});
      delete games[g.id];persist();frodon.refreshSphereTab(PLUGIN_ID);
    });
    btns.appendChild(leave);c.appendChild(btns);
  }

  function renderScores(c){
    const wins=store.get('wins')||0,losses=store.get('losses')||0,chipsWon=store.get('chips_won')||0;
    const total=wins+losses;
    if(!total){
      c.innerHTML='<div style="text-align:center;padding:22px 14px;color:var(--txt2);font-size:.72rem"><div style="font-size:1.6rem;opacity:.2;margin-bottom:6px">🏆</div>Jouez votre première partie !</div>';return;
    }
    const sb=frodon.makeElement('div','');sb.style.cssText='display:flex;border:1px solid var(--bdr2);border-radius:10px;overflow:hidden;margin:8px';
    [['🏆',wins,'Victoires','var(--ok)'],['😔',losses,'Défaites','var(--warn)']].forEach(([ico,n,lbl,col],i)=>{
      const cell=frodon.makeElement('div','');cell.style.cssText='flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;padding:12px 4px;'+(i===0?'border-right:1px solid var(--bdr2)':'');
      cell.innerHTML=`<span style="font-size:1rem">${ico}</span><strong style="font-size:1.2rem;color:${col};font-family:var(--mono)">${n}</strong><span style="font-size:.52rem;color:var(--txt2)">${lbl}</span>`;
      sb.appendChild(cell);
    });c.appendChild(sb);

    const rate=Math.round(wins/total*100);
    const bw=frodon.makeElement('div','');bw.style.cssText='margin:0 8px 10px';
    bw.innerHTML=`<div style="display:flex;justify-content:space-between;font-size:.58rem;color:var(--txt2);font-family:var(--mono);margin-bottom:3px"><span>Taux de victoire</span><span style="color:var(--ok)">${rate}%</span></div><div style="height:5px;background:var(--sur2);border-radius:4px;overflow:hidden"><div style="height:100%;width:${rate}%;background:linear-gradient(90deg,var(--ok),var(--acc));border-radius:4px"></div></div><div style="font-size:.55rem;color:var(--txt2);font-family:var(--mono);margin-top:3px;text-align:center">${total} partie${total>1?'s':''} jouée${total>1?'s':''}</div>`;
    c.appendChild(bw);

    if(chipsWon>0){const cw=frodon.makeElement('div','');cw.style.cssText='margin:0 8px 10px;padding:8px 10px;background:rgba(0,229,122,.07);border:1px solid rgba(0,229,122,.2);border-radius:8px;display:flex;justify-content:space-between;align-items:center';cw.innerHTML=`<span style="font-size:.65rem;color:var(--txt2)">Total chips gagnés</span><strong style="font-family:var(--mono);color:var(--ok)">${chipsWon.toLocaleString()}🪙</strong>`;c.appendChild(cw);}

    const hist=store.get('history')||[];
    if(hist.length){
      const lbl2=frodon.makeElement('div','section-label','Dernières parties');lbl2.style.margin='0 8px 6px';c.appendChild(lbl2);
      hist.slice(0,12).forEach(h=>{
        const isWin=h.result==='win';
        const row=frodon.makeElement('div','');row.style.cssText='display:flex;align-items:center;gap:8px;padding:5px 10px;border-bottom:1px solid var(--bdr)';
        row.innerHTML=`<span style="font-size:.9rem">${isWin?'🏆':'😔'}</span>`;
        const inf=frodon.makeElement('div','');inf.style.cssText='flex:1;min-width:0';
        inf.innerHTML=`<div style="font-size:.72rem;font-weight:700;color:${isWin?'var(--ok)':'var(--warn)'}">${isWin?'Victoire':'Défaite'}</div><div style="font-size:.6rem;color:var(--txt2)">vs ${(h.opponents||[]).join(', ')||'?'} · ${h.pot}🪙</div>`;
        row.appendChild(inf);row.appendChild(frodon.makeElement('span','mini-card-ts',frodon.formatTime(h.ts)));
        c.appendChild(row);
      });
    }

    const rst=frodon.makeElement('button','plugin-action-btn');rst.style.cssText+=';font-size:.62rem;margin:10px 8px 0;width:calc(100% - 16px);color:var(--txt3);border-color:var(--bdr)';rst.textContent='↺ Remettre à zéro';
    rst.addEventListener('click',()=>{if(!confirm('Remettre tous les scores à zéro ?'))return;['wins','losses','chips_won','history'].forEach(k=>store.del(k));frodon.refreshSphereTab(PLUGIN_ID);frodon.showToast('Scores remis à zéro');});
    c.appendChild(rst);
  }

  /* ─── Helpers ────────────────────────────────────────────────────── */
  function mkAv(p,size=32){
    const cols=['#00f5c8','#7c4dff','#ff6b35','#00e87a','#f5c842','#ff4f8b'];
    const cl=cols[((p?.name||'?').charCodeAt(0)||0)%cols.length];
    return`<div style="width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;flex-shrink:0;background:var(--sur2);display:flex;align-items:center;justify-content:center;font-size:${size*.38}px;color:${cl};font-weight:700;font-family:var(--mono)">${p?.avatar?`<img src="${p.avatar}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">`:''}${(p?.name||'?')[0].toUpperCase()}</div>`;
  }

  let _cssInjected=false;
  function injectCSS(){
    if(_cssInjected)return;_cssInjected=true;
    const s=document.createElement('style');
    s.textContent=`.pk-card{display:inline-flex;flex-direction:column;align-items:center;justify-content:space-between;width:36px;height:52px;background:var(--sur);border:1.5px solid var(--bdr2);border-radius:7px;padding:3px;font-family:var(--mono);font-size:.7rem;flex-shrink:0}.pk-card.back{background:linear-gradient(135deg,#1a1a3e,#0d0d22);border-color:rgba(124,77,255,.4);font-size:1.4rem;display:inline-flex;align-items:center;justify-content:center;width:36px;height:52px;border-radius:7px;flex-shrink:0}.pk-card.empty{background:transparent;border:1.5px dashed var(--bdr);opacity:.3;width:36px;height:52px;border-radius:7px;flex-shrink:0}.pk-card-tl{line-height:1;align-self:flex-start;display:flex;flex-direction:column;align-items:center}.pk-card-tl small,.pk-card-br small{font-size:.55em}.pk-card-suit{font-size:1rem;line-height:1}.pk-card-br{line-height:1;align-self:flex-end;display:flex;flex-direction:column;align-items:center;transform:rotate(180deg)}`;
    document.head.appendChild(s);
  }

  /* ─── Boot ───────────────────────────────────────────────────────── */
  frodon.registerUninstallHook(PLUGIN_ID,()=>{
    for(const [tid,g] of Object.entries(games)){if(g.isHost)toAll(tid,'kick',{});else toHost(tid,'leave',{});}
  });

  restore();
  return {destroy(){for(const [tid,g] of Object.entries(games)){if(g.isHost)toAll(tid,'kick',{});else toHost(tid,'leave',{});}}};
});
