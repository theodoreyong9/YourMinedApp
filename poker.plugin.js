/**
 * FRODON PLUGIN — Texas Hold'em Poker P2P  v4.3
 * Fix: multi-invite lobby, une table par lobby, plusieurs tables simultanées
 */
frodon.register({
  id:'poker', name:"Texas Hold'em", version:'4.3.0',
  author:'frodon-community', description:"Poker Texas Hold'em P2P.", icon:'🃏',
}, () => {
  const PLUGIN_ID = 'poker';
  const store = frodon.storage(PLUGIN_ID);
  const tables = {};
  const SUITS = ['♠','♥','♦','♣'];
  const VALS  = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
  const VNUM  = Object.fromEntries(VALS.map((v,i) => [v, i+2]));

  function mkDeck() {
    const d = [];
    for (const s of SUITS) for (const v of VALS) d.push({s,v});
    for (let i = d.length-1; i > 0; i--) {
      const j = 0|Math.random()*(i+1);
      [d[i],d[j]] = [d[j],d[i]];
    }
    return d;
  }

  function evalBest(cards) {
    if (!cards || cards.length < 2) return {score:0, name:'—'};
    const combos = [];
    if (cards.length <= 5) { combos.push(cards); }
    else { for (let i=0;i<cards.length;i++) for(let j=i+1;j<cards.length;j++) combos.push(cards.filter((_,k)=>k!==i&&k!==j)); }
    let best = null;
    for (const c of combos) { const s=eval5(c); if(!best||s.score>best.score) best=s; }
    return best || {score:0, name:'—'};
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
    if(flush&&straight&&sHigh===14){rank=8;name='Quinte flush royale';tb=[sHigh];}
    else if(flush&&straight)       {rank=7;name='Quinte flush';tb=[sHigh];}
    else if(freq[0].c===4)         {rank=6;name='Carré';tb=[freq[0].n,freq[1]?.n||0];}
    else if(freq[0].c===3&&freq[1]?.c===2){rank=5;name='Full house';tb=[freq[0].n,freq[1].n];}
    else if(flush)                 {rank=4;name='Couleur';tb=ns;}
    else if(straight)              {rank=3;name='Suite';tb=[sHigh];}
    else if(freq[0].c===3)         {rank=2;name='Brelan';tb=[freq[0].n,...freq.slice(1).map(f=>f.n)];}
    else if(freq[0].c===2&&freq[1]?.c===2){rank=1;name='Double paire';tb=[freq[0].n,freq[1].n,freq[2]?.n||0];}
    else if(freq[0].c===2)         {rank=0;name='Paire';tb=[freq[0].n,...freq.slice(1).map(f=>f.n)];}
    else                           {rank=-1;name='Carte haute';tb=ns;}
    return {score:rank*1e7+tb.reduce((a,n,i)=>a+n*Math.pow(100,4-i),0),name};
  }

  function cardHtml(c,back=false) {
    if(back||!c) return '<div class="pk-card back">🂠</div>';
    const red=c.s==='♥'||c.s==='♦';
    return `<div class="pk-card" style="color:${red?'#ff4f8b':'var(--txt)'}"><span class="pk-card-tl">${c.v}<small>${c.s}</small></span><span class="pk-card-suit">${c.s}</span><span class="pk-card-br">${c.v}<small>${c.s}</small></span></div>`;
  }

  const me = () => frodon.getMyProfile().peerId;
  const peerName = id => frodon.getPeer(id)?.name || store.get('pname_'+id) || 'Pair inconnu';

  function addScore(result,opponents,pot) {
    store.set('wins',(store.get('wins')||0)+(result==='win'?1:0));
    store.set('losses',(store.get('losses')||0)+(result==='loss'?1:0));
    store.set('chips_won',(store.get('chips_won')||0)+(result==='win'?pot:0));
    const hist=store.get('history')||[];
    hist.unshift({result,pot,opponents,ts:Date.now()});
    if(hist.length>50)hist.length=50;
    store.set('history',hist);
  }

  function persist() {
    const save={};
    for(const [tid,t] of Object.entries(tables)) {
      save[tid]={...t,deck:t.isHost?(t.deck||[]):[],allHands:t.isHost?(t.allHands||{}):{},_scored:t._scored||false};
    }
    if(!Object.keys(save).length) store.del('tables');
    else store.set('tables',save);
  }

  function restore() {
    const s=store.get('tables'); if(!s) return;
    for(const [tid,t] of Object.entries(s))
      tables[tid]={...t,allHands:t.allHands||{},_scored:t._scored||false};
    if(!Object.keys(tables).length) return;
    setTimeout(()=>{
      for(const [tid,t] of Object.entries(tables)) {
        if(t.isHost) hostSync(tid); else send(t.hostId,'resync',{tid});
      }
    },3500);
    frodon.refreshSphereTab(PLUGIN_ID);
  }

  function send(pid,type,payload) { frodon.sendDM(pid,PLUGIN_ID,{type,...payload,_silent:true}); }
  function sendAll(tid,type,payload) {
    const t=tables[tid]; if(!t) return;
    t.players.forEach(p=>{ if(p.id!==me()) send(p.id,type,{tid,...payload}); });
  }

  function pub(tid) {
    const t=tables[tid];
    return {
      phase:t.phase, pot:t.pot, community:t.community, currentIdx:t.currentIdx,
      dealerIdx:t.dealerIdx, roundBet:t.roundBet, done:t.done, result:t.result||null,
      _scored:t._scored||false,
      players:t.players.map(({id,name,chips,bet,hasActed,status})=>({id,name,chips,bet,hasActed,status})),
    };
  }

  function hostSync(tid) {
    const t=tables[tid]; if(!t) return;
    const p=pub(tid);
    t.players.forEach(pl=>{
      if(pl.id===me()) return;
      send(pl.id,'sync',{tid,pub:p});
      if(!t.done&&t.phase!=='lobby'&&t.allHands[pl.id]) send(pl.id,'hand',{tid,cards:t.allHands[pl.id]});
    });
    persist(); frodon.refreshSphereTab(PLUGIN_ID);
  }

  /* ── Logique de jeu (identique v4.2) ── */
  function hostDeal(tid) {
    const t=tables[tid]; if(!t) return;
    t.players.forEach(p=>{ if(p.chips<=0) p.chips=1000; });
    if(t.players.filter(p=>p.chips>0).length<2){ frodon.showToast('Pas assez de joueurs'); return; }
    t.deck=mkDeck(); t.community=[]; t.pot=0; t.allHands={}; t.done=false; t.result=null; t._scored=false;
    t.phase='preflop'; t.dealerIdx=(t.dealerIdx+1)%t.players.length;
    while(t.players[t.dealerIdx].chips<=0) t.dealerIdx=(t.dealerIdx+1)%t.players.length;
    t.players.forEach(p=>{ p.bet=0; p.hasActed=false; p.status=p.chips>0?'active':'out'; });
    const nxt=i=>{ let j=(i+1)%t.players.length; while(t.players[j].chips<=0) j=(j+1)%t.players.length; return j; };
    const si=nxt(t.dealerIdx),bi=nxt(si);
    const sbP=t.players[si],bbP=t.players[bi];
    const sa=Math.min(t.sb,sbP.chips),ba=Math.min(t.bb,bbP.chips);
    sbP.chips-=sa; sbP.bet=sa; if(!sbP.chips) sbP.status='allin';
    bbP.chips-=ba; bbP.bet=ba; if(!bbP.chips) bbP.status='allin';
    t.roundBet=ba;
    t.players.filter(p=>p.status==='active'||p.status==='allin').forEach(p=>{ t.allHands[p.id]=[t.deck.pop(),t.deck.pop()]; });
    t.myHand=t.allHands[me()]||[];
    t.currentIdx=nxt(bi);
    hostSync(tid); frodon.showToast('🃏 Cartes distribuées !');
    setTimeout(()=>frodon.focusPlugin(PLUGIN_ID),200);
  }

  function hostAct(tid,fromId,action,amount) {
    const t=tables[tid]; if(!t||t.done||t.phase==='lobby') return;
    const pi=t.players.findIndex(p=>p.id===fromId);
    if(pi<0||t.currentIdx!==pi) return;
    const p=t.players[pi]; if(p.status!=='active') return;
    if(action==='fold'){ p.status='fold'; p.hasActed=true; }
    else if(action==='check'){ if(p.bet<t.roundBet) return; p.hasActed=true; }
    else if(action==='call'){ const x=Math.min(t.roundBet-p.bet,p.chips); p.chips-=x; p.bet+=x; if(!p.chips) p.status='allin'; p.hasActed=true; }
    else if(action==='raise'){ const r=Math.max(amount||0,t.roundBet+t.bb),a=Math.min(r-p.bet,p.chips); p.chips-=a; p.bet+=a; t.roundBet=p.bet; if(!p.chips) p.status='allin'; t.players.forEach(o=>{ if(o.id!==fromId&&o.status==='active') o.hasActed=false; }); p.hasActed=true; }
    else if(action==='allin'){ const a=p.chips; p.chips=0; p.bet+=a; if(p.bet>t.roundBet){ t.roundBet=p.bet; t.players.forEach(o=>{ if(o.id!==fromId&&o.status==='active') o.hasActed=false; }); } p.status='allin'; p.hasActed=true; }
    if(hostRoundEnd(tid)) return;
    let next=(pi+1)%t.players.length,guard=0;
    while(t.players[next].status!=='active'&&guard<t.players.length){ next=(next+1)%t.players.length; guard++; }
    t.currentIdx=next; hostSync(tid);
  }

  function hostRoundEnd(tid) {
    const t=tables[tid];
    const alive=t.players.filter(p=>p.status==='active'||p.status==='allin');
    if(alive.length<=1) {
      const w=alive[0]||t.players.find(p=>p.status==='allin');
      if(w){ t.players.forEach(p=>{ t.pot+=p.bet; p.bet=0; }); w.chips+=t.pot; hostEnd(tid,{pot:t.pot,winner:w.id,winnerName:w.name,results:[{id:w.id,name:w.name,hand:[],handName:'Tous se sont couchés'}],players:t.players.map(p=>({id:p.id,chips:p.chips}))}); }
      return true;
    }
    const act=t.players.filter(p=>p.status==='active');
    if(!act.length||act.every(p=>p.hasActed&&p.bet===t.roundBet)){ hostStreet(tid); return true; }
    return false;
  }

  function hostStreet(tid) {
    const t=tables[tid];
    t.players.forEach(p=>{ t.pot+=p.bet; p.bet=0; p.hasActed=false; }); t.roundBet=0;
    const alive=t.players.filter(p=>p.status==='active'||p.status==='allin');
    if(alive.length<=1){ hostShowdown(tid); return; }
    if(t.phase==='preflop'){ t.phase='flop'; t.community.push(t.deck.pop(),t.deck.pop(),t.deck.pop()); }
    else if(t.phase==='flop'){ t.phase='turn'; t.community.push(t.deck.pop()); }
    else if(t.phase==='turn'){ t.phase='river'; t.community.push(t.deck.pop()); }
    else{ hostShowdown(tid); return; }
    let i=(t.dealerIdx+1)%t.players.length;
    while(t.players[i].status!=='active'){ i=(i+1)%t.players.length; if(i===t.dealerIdx) break; }
    t.currentIdx=i;
    if(!t.players.some(p=>p.status==='active')){ hostSync(tid); setTimeout(()=>hostStreet(tid),700); }
    else hostSync(tid);
  }

  function hostShowdown(tid) {
    const t=tables[tid];
    t.players.forEach(p=>{ t.pot+=p.bet; p.bet=0; });
    const alive=t.players.filter(p=>p.status==='active'||p.status==='allin');
    const ev=alive.map(p=>{ const h=t.allHands[p.id]||[],b=evalBest([...h,...t.community]); return {id:p.id,name:p.name,hand:h,handName:b.name,score:b.score}; });
    ev.sort((a,b)=>b.score-a.score);
    const w=ev[0]; const wp=t.players.find(p=>p.id===w.id); if(wp) wp.chips+=t.pot;
    hostEnd(tid,{pot:t.pot,winner:w.id,winnerName:w.name,results:ev,players:t.players.map(p=>({id:p.id,chips:p.chips})),community:t.community});
  }

  function hostEnd(tid,result) {
    const t=tables[tid]; if(!t||t.done) return;
    t.pot=0; t.done=true; t.result=result;
    result.players.forEach(r=>{ const p=t.players.find(q=>q.id===r.id); if(p) p.chips=r.chips; });
    if(result.community) t.community=result.community;
    if(!t._scored){ t._scored=true; const isWin=result.winner===me(); addScore(isWin?'win':'loss',t.players.filter(p=>p.id!==me()).map(p=>p.name),result.pot); }
    sendAll(tid,'showdown',{result}); persist(); frodon.refreshSphereTab(PLUGIN_ID);
    const isWin=result.winner===me();
    frodon.showToast(isWin?'🏆 Vous remportez '+result.pot+'🪙 !':'🃏 '+result.winnerName+' gagne '+result.pot+'🪙');
    setTimeout(()=>frodon.focusPlugin(PLUGIN_ID),300);
  }

  /* ── FIX v4.3: trouver la table en lobby de cet hôte pour y ajouter le peer ── */
  function findLobbyTable(hostId) {
    return Object.values(tables).find(t => t.isHost && t.hostId===hostId && t.phase==='lobby' && !t.done && t.players.length < 8);
  }

  /* ── Inviter un pair depuis son profil ── */
  /* 
     Logique: si l'hôte a déjà une table en lobby, on y ajoute le pair.
     Sinon on crée une nouvelle table.
     Une fois la partie lancée, l'invitation crée une NOUVELLE table.
  */
  function invitePeer(peerId) {
    const name = peerName(peerId);
    const my   = frodon.getMyProfile();

    // Chercher table en lobby existante (pas encore lancée)
    const existing = findLobbyTable(me());
    let tid, t;

    if(existing) {
      // Ajouter à la table existante
      tid = existing.tid; t = existing;
      if(t.players.find(p=>p.id===peerId)){ frodon.showToast(name+' est déjà à cette table'); return; }
      t.players.push({id:peerId,name,chips:1000,bet:0,hasActed:false,status:'active'});
    } else {
      // Créer nouvelle table
      tid = 'pk_'+Date.now();
      t = tables[tid] = {
        tid, isHost:true, hostId:me(), phase:'lobby', done:false, _scored:false,
        players:[
          {id:me(), name:my.name, chips:1000, bet:0, hasActed:false, status:'active'},
          {id:peerId, name, chips:1000, bet:0, hasActed:false, status:'active'},
        ],
        myHand:[], allHands:{}, community:[], deck:[],
        pot:0, roundBet:20, currentIdx:0, dealerIdx:-1, sb:10, bb:20, result:null,
      };
    }

    send(peerId,'invite',{
      tid, sb:t.sb, bb:t.bb,
      players:t.players.map(p=>({id:p.id,name:p.name,chips:p.chips,status:p.status})),
      _label:'🃏 Invitation Poker !',
    });
    persist();
    frodon.showToast('🃏 Invitation envoyée à '+name);
    frodon.refreshSphereTab(PLUGIN_ID);
    setTimeout(()=>frodon.focusPlugin(PLUGIN_ID),200);
  }

  /* ── Messages réseau ── */
  frodon.onDM(PLUGIN_ID,(fromId,payload)=>{
    const {type,tid}=payload; if(!type||!tid) return;

    if(type==='invite') {
      for(const [k,t] of Object.entries(tables)) { if(t.hostId===fromId&&t.done) delete tables[k]; }
      // Si on a déjà une table en lobby pour cet hôte, mettre à jour
      const existing=Object.values(tables).find(t=>t.tid===tid);
      if(existing) {
        existing.players=payload.players||existing.players;
        persist(); frodon.refreshSphereTab(PLUGIN_ID); return;
      }
      tables[tid]={
        tid,isHost:false,hostId:fromId,phase:'lobby',done:false,_scored:false,
        players:payload.players||[],myHand:[],allHands:{},community:[],deck:[],
        pot:0,roundBet:payload.bb||20,currentIdx:0,dealerIdx:-1,sb:payload.sb||10,bb:payload.bb||20,result:null,
        _from:peerName(fromId),
      };
      persist();
      frodon.showToast('🃏 '+peerName(fromId)+' vous invite !');
      frodon.refreshSphereTab(PLUGIN_ID);
      setTimeout(()=>frodon.focusPlugin(PLUGIN_ID),400);
      return;
    }

    if(type==='invite_ok') {
      const t=tables[tid]; if(!t||!t.isHost) return;
      let p=t.players.find(pl=>pl.id===fromId);
      if(!p){ p={id:fromId,name:peerName(fromId),chips:1000,bet:0,hasActed:false,status:'active'}; t.players.push(p); }
      else p.status='active';
      frodon.showToast('🃏 '+peerName(fromId)+' rejoint !');
      // Re-broadcaster la liste à jour à tous les joueurs du lobby
      t.players.forEach(pl=>{ if(pl.id!==me()) send(pl.id,'lobby_update',{tid,players:t.players.map(p=>({id:p.id,name:p.name,chips:p.chips,status:p.status}))}); });
      hostSync(tid); return;
    }

    if(type==='lobby_update') {
      const t=tables[tid]; if(!t||t.isHost) return;
      t.players=payload.players||t.players;
      persist(); frodon.refreshSphereTab(PLUGIN_ID); return;
    }

    if(type==='invite_no') {
      const t=tables[tid]; if(!t||!t.isHost) return;
      t.players=t.players.filter(p=>p.id!==fromId);
      frodon.showToast(peerName(fromId)+' décline.'); hostSync(tid); return;
    }

    if(type==='sync') {
      const t=tables[tid]; if(!t||t.isHost) return;
      const p=payload.pub;
      t.phase=p.phase; t.pot=p.pot; t.community=p.community||[]; t.currentIdx=p.currentIdx;
      t.dealerIdx=p.dealerIdx; t.roundBet=p.roundBet; t.players=p.players;
      t.done=p.done||false; t.result=p.result||null;
      if(p._scored) t._scored=true;
      if(!t.done&&t.phase==='preflop') t.myHand=[];
      delete t._from;
      persist(); frodon.refreshSphereTab(PLUGIN_ID);
      if(!t.done&&t.phase!=='lobby'&&t.players[t.currentIdx]?.id===me()){
        frodon.showToast('🃏 C\'est votre tour !');
        setTimeout(()=>frodon.focusPlugin(PLUGIN_ID),300);
      }
      return;
    }

    if(type==='hand') { const t=tables[tid]; if(!t||t.isHost) return; t.myHand=payload.cards||[]; persist(); frodon.refreshSphereTab(PLUGIN_ID); return; }
    if(type==='action') { const t=tables[tid]; if(!t||!t.isHost) return; hostAct(tid,fromId,payload.action,payload.amount||0); return; }

    if(type==='showdown') {
      const t=tables[tid]; if(!t||t.isHost) return;
      const result=payload.result;
      if(!t._scored){ t._scored=true; const isWin=result.winner===me(); addScore(isWin?'win':'loss',t.players.filter(p=>p.id!==me()).map(p=>p.name),result.pot); frodon.showToast(isWin?'🏆 Vous remportez '+result.pot+'🪙 !':'🃏 '+result.winnerName+' gagne '+result.pot+'🪙'); }
      t.done=true; t.result=result;
      result.players.forEach(r=>{ const p=t.players.find(q=>q.id===r.id); if(p) p.chips=r.chips; });
      if(result.community) t.community=result.community;
      persist(); frodon.refreshSphereTab(PLUGIN_ID);
      setTimeout(()=>frodon.focusPlugin(PLUGIN_ID),300); return;
    }

    if(type==='kick') { if(!tables[tid]) return; delete tables[tid]; persist(); frodon.showToast('🃏 Table fermée.'); frodon.refreshSphereTab(PLUGIN_ID); return; }

    if(type==='leave') {
      const t=tables[tid]; if(!t||!t.isHost) return;
      const p=t.players.find(pl=>pl.id===fromId); if(!p) return;
      p.status='away';
      if(!t.done&&t.phase!=='lobby'){ if(t.currentIdx===t.players.indexOf(p)) hostAct(tid,fromId,'fold',0); else hostSync(tid); }
      return;
    }

    if(type==='resync') {
      const t=tables[tid]; if(!t||!t.isHost) return;
      let p=t.players.find(pl=>pl.id===fromId);
      if(!p){ const nm=peerName(fromId); p=t.players.find(pl=>pl.status==='away'&&pl.name===nm); if(p){ if(t.allHands[p.id]){t.allHands[fromId]=t.allHands[p.id];delete t.allHands[p.id];}p.id=fromId; } }
      if(p&&p.status==='away') p.status='active';
      send(fromId,'sync',{tid,pub:pub(tid)});
      if(t.allHands[fromId]) send(fromId,'hand',{tid,cards:t.allHands[fromId]});
      hostSync(tid); return;
    }
  });

  frodon.onPeerAppear(peer=>{
    store.set('pname_'+peer.peerId, peer.name); // cache name
    for(const [tid,t] of Object.entries(tables)) {
      const p=t.players.find(pl=>pl.id===peer.peerId)||t.players.find(pl=>pl.status==='away'&&pl.name===peer.name);
      if(!p) continue;
      frodon.showToast('🃏 '+peer.name+' est de retour !');
      if(t.isHost) {
        if(p.id!==peer.peerId){ if(t.allHands[p.id]){t.allHands[peer.peerId]=t.allHands[p.id];delete t.allHands[p.id];}p.id=peer.peerId; }
        if(p.status==='away') p.status='active';
        send(peer.peerId,'sync',{tid,pub:pub(tid)});
        if(t.allHands[peer.peerId]) send(peer.peerId,'hand',{tid,cards:t.allHands[peer.peerId]});
        hostSync(tid);
      } else if(peer.peerId===t.hostId) {
        setTimeout(()=>send(t.hostId,'resync',{tid}),500);
      }
    }
  });

  frodon.onPeerLeave(peerId=>{
    for(const [tid,t] of Object.entries(tables)) {
      if(!t.isHost) continue;
      const p=t.players.find(pl=>pl.id===peerId); if(!p) continue;
      p.status='away';
      if(!t.done&&t.phase!=='lobby'){ if(t.players[t.currentIdx]?.id===peerId) hostAct(tid,peerId,'fold',0); else hostSync(tid); }
    }
  });

  /* ── Profil pair ── */
  frodon.registerPeerAction(PLUGIN_ID,'🃏 Poker',(peerId,container)=>{
    const name=peerName(peerId);
    // Chercher si ce pair est dans une partie en cours (non terminée, non lobby)
    const activeGame=Object.values(tables).find(g=>!g.done&&g.phase!=='lobby'&&g.players.some(p=>p.id===peerId));
    // Chercher si ce pair est dans un lobby en cours
    const inLobby=Object.values(tables).find(g=>!g.done&&g.phase==='lobby'&&g.players.some(p=>p.id===peerId));

    if(activeGame) {
      const isMine=activeGame.players[activeGame.currentIdx]?.id===me();
      const st=frodon.makeElement('div','');
      st.style.cssText='text-align:center;padding:4px 0 6px;font-size:.68rem;color:var(--txt2)';
      st.textContent=isMine?'⌛ Votre tour':'💬 Tour de '+(activeGame.players[activeGame.currentIdx]?.name||'?');
      container.appendChild(st);
      const go=frodon.makeElement('button','plugin-action-btn acc','▶ Ouvrir');
      go.addEventListener('click',()=>frodon.focusPlugin(PLUGIN_ID));
      container.appendChild(go);
      return;
    }

    // Bouton inviter (crée ou rejoint un lobby existant)
    const lobbyTable=findLobbyTable(me());
    const btnLabel=lobbyTable
      ? '🃏 Inviter à rejoindre la table ('+lobbyTable.players.length+' joueurs)'
      : '🃏 Créer une table et inviter';

    const btn=frodon.makeElement('button','plugin-action-btn acc',btnLabel);
    btn.addEventListener('click',()=>{ invitePeer(peerId); UI._closeModal?.(); });
    container.appendChild(btn);

    if(inLobby && !activeGame) {
      const note=frodon.makeElement('div','');
      note.style.cssText='font-size:.6rem;color:var(--txt3);font-family:var(--mono);margin-top:4px;text-align:center';
      note.textContent='⌛ Déjà dans un lobby avec vous';
      container.appendChild(note);
    }
  });

  /* ── SPHERE ── */
  frodon.registerBottomPanel(PLUGIN_ID,[
    {id:'table',label:'🃏 Table',render(container){
      injectCSS();
      const tList=Object.values(tables);
      if(!tList.length){ renderEmpty(container); return; }
      const invites=tList.filter(t=>t._from);
      const active=tList.filter(t=>!t._from&&!t.done);
      const done=tList.filter(t=>!t._from&&t.done);
      for(const t of [...invites,...active,...done]) {
        if(t._from) renderInvite(container,t);
        else if(t.done) renderResult(container,t);
        else if(t.phase==='lobby') renderLobby(container,t);
        else renderGame(container,t);
      }
    }},
    {id:'scores',label:'🏆 Scores',render(container){renderScores(container);}},
  ]);

  function W(c) { const w=frodon.makeElement('div',''); w.style.cssText='border-bottom:1px solid var(--bdr);margin-bottom:2px'; c.appendChild(w); return w; }
  function avH(p,sz=32) {
    const cols=['#00f5c8','#7c4dff','#ff6b35','#00e87a','#f5c842','#ff4f8b'];
    const nm=p?.name||'?'; const cl=cols[nm.charCodeAt(0)%cols.length];
    return `<div style="width:${sz}px;height:${sz}px;border-radius:50%;flex-shrink:0;background:var(--sur2);display:flex;align-items:center;justify-content:center;font-size:${sz*.38}px;color:${cl};font-weight:700">${nm[0].toUpperCase()}</div>`;
  }

  function renderEmpty(c) {
    const w=frodon.makeElement('div','');
    w.style.cssText='text-align:center;padding:32px 20px';
    w.innerHTML='<div style="font-size:2.8rem;margin-bottom:10px">🃏</div><div style="color:var(--txt2);font-size:.76rem;line-height:1.8">Aucune partie.<br><small style="color:var(--txt3)">Ouvrez le profil d\'un pair pour l\'inviter.</small></div>';
    c.appendChild(w);
  }

  function renderInvite(c,t) {
    const w=W(c); w.style.cssText+='padding:20px;text-align:center';
    w.innerHTML=`<div style="font-size:2rem;margin-bottom:8px">🃏</div><div style="font-size:.88rem;font-weight:700;margin-bottom:4px">${t._from} vous invite</div><div style="font-size:.68rem;color:var(--txt2);margin-bottom:10px">Texas Hold\'em · ${t.sb}/${t.bb} · 1000🪙</div>`;
    // Liste joueurs déjà dans le lobby
    if(t.players.length>1) {
      const seats=frodon.makeElement('div',''); seats.style.cssText='display:flex;flex-wrap:wrap;gap:5px;justify-content:center;margin-bottom:12px';
      t.players.forEach(p=>{ const s=frodon.makeElement('div',''); s.style.cssText='font-size:.6rem;font-family:var(--mono);color:var(--txt2);background:var(--sur2);padding:2px 8px;border-radius:10px'; s.textContent=(p.id===me()?'Vous':p.name); seats.appendChild(s); });
      w.appendChild(seats);
    }
    const row=frodon.makeElement('div',''); row.style.cssText='display:flex;gap:8px;justify-content:center';
    const yes=frodon.makeElement('button','plugin-action-btn acc','✔ Accepter');
    yes.addEventListener('click',()=>{ send(t.hostId,'invite_ok',{tid:t.tid}); delete t._from; persist(); frodon.showToast('🃏 Rejoint !'); frodon.refreshSphereTab(PLUGIN_ID); });
    const no=frodon.makeElement('button','plugin-action-btn','✕ Refuser');
    no.addEventListener('click',()=>{ send(t.hostId,'invite_no',{tid:t.tid}); delete tables[t.tid]; persist(); frodon.refreshSphereTab(PLUGIN_ID); });
    row.appendChild(yes); row.appendChild(no); w.appendChild(row);
  }

  function renderLobby(c,t) {
    const w=W(c);
    const hdr=frodon.makeElement('div','');
    hdr.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid var(--bdr);background:rgba(0,0,0,.2)';
    hdr.innerHTML=`<span style="font-family:var(--mono);font-size:.8rem;color:var(--acc)">🃏 SALON · ${t.sb}/${t.bb} · ${t.players.length} joueur${t.players.length>1?'s':''}</span>`;
    if(t.isHost) {
      const btns=frodon.makeElement('div',''); btns.style.cssText='display:flex;gap:6px';
      const deal=frodon.makeElement('button','plugin-action-btn acc','▶ Lancer'); deal.style.fontSize='.65rem';
      deal.addEventListener('click',()=>hostDeal(t.tid));
      btns.appendChild(deal);
      // Bouton "Nouvelle table" si on veut en parallèle
      const newT=frodon.makeElement('button','plugin-action-btn','+ Table'); newT.style.fontSize='.6rem'; newT.title='Créer une deuxième table en parallèle';
      newT.addEventListener('click',()=>{
        const my=frodon.getMyProfile();
        const tid2='pk_'+Date.now();
        tables[tid2]={tid:tid2,isHost:true,hostId:me(),phase:'lobby',done:false,_scored:false,players:[{id:me(),name:my.name,chips:1000,bet:0,hasActed:false,status:'active'}],myHand:[],allHands:{},community:[],deck:[],pot:0,roundBet:20,currentIdx:0,dealerIdx:-1,sb:10,bb:20,result:null};
        persist(); frodon.refreshSphereTab(PLUGIN_ID); frodon.showToast('Nouvelle table créée — invitez des pairs');
      });
      btns.appendChild(newT); hdr.appendChild(btns);
    }
    w.appendChild(hdr);
    const seats=frodon.makeElement('div',''); seats.style.cssText='display:flex;flex-wrap:wrap;gap:8px;padding:12px;justify-content:center';
    t.players.forEach(p=>{
      const isMe=p.id===me(); const seat=frodon.makeElement('div','');
      seat.style.cssText=`display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 8px;min-width:60px;background:var(--sur2);border:1.5px solid ${isMe?'var(--acc)':'var(--bdr2)'};border-radius:12px;opacity:${p.status==='away'?.5:1}`;
      seat.innerHTML=`${avH(p,36)}<div style="font-size:.6rem;font-weight:700;color:${isMe?'var(--acc)':'var(--txt)'};max-width:64px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${isMe?'Moi':p.name}</div><div style="font-size:.55rem;font-family:var(--mono);color:var(--txt2)">${p.chips}🪙</div>${p.status==='away'?'<div style="font-size:.46rem;color:var(--txt3)">absent</div>':''}`;
      seats.appendChild(seat);
    });
    w.appendChild(seats);
    const hint=frodon.makeElement('div',''); hint.style.cssText='text-align:center;font-size:.6rem;color:var(--txt3);padding:0 12px 14px;line-height:1.6';
    hint.textContent=t.isHost?'Invitez des pairs depuis leur fiche · 2–8 joueurs · Lancez quand prêt':'En attente que l\'hôte lance la partie…';
    w.appendChild(hint);
  }

  function renderGame(c,t) {
    const w=W(c);
    const myP=t.players.find(p=>p.id===me());
    const PH=['preflop','flop','turn','river'];
    const pL={preflop:'Pré-flop',flop:'Flop',turn:'Turn',river:'River'};
    const top=frodon.makeElement('div','');
    top.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:5px 10px;border-bottom:1px solid var(--bdr);background:rgba(0,0,0,.2)';
    top.innerHTML=`<div style="display:flex;gap:3px">${PH.map(p=>`<span style="font-size:.55rem;font-family:var(--mono);padding:2px 6px;border-radius:4px;background:${t.phase===p?'rgba(0,245,200,.15)':'transparent'};color:${t.phase===p?'var(--acc)':'var(--txt3)'}">${pL[p]}</span>`).join('')}</div><span style="font-family:var(--mono);font-size:.75rem;color:var(--warn)">Pot ${t.pot}🪙</span>`;
    w.appendChild(top);
    const prow=frodon.makeElement('div',''); prow.style.cssText='display:flex;flex-wrap:wrap;gap:4px;justify-content:center;padding:8px 6px 4px';
    t.players.forEach((p,i)=>{
      const isMe=p.id===me(),isCur=i===t.currentIdx,isD=i===t.dealerIdx;
      const chip=frodon.makeElement('div','');
      chip.style.cssText=`display:flex;flex-direction:column;align-items:center;gap:2px;min-width:50px;padding:5px 4px;border-radius:9px;border:1.5px solid ${isCur?'var(--acc2)':isMe?'rgba(0,245,200,.25)':'transparent'};background:${isCur?'rgba(124,77,255,.08)':'transparent'};opacity:${p.status==='fold'?.4:1}`;
      chip.innerHTML=`<div style="position:relative">${avH(p,30)}${isD?'<div style="position:absolute;bottom:-3px;right:-3px;background:#f5c842;color:#000;font-size:.42rem;font-weight:900;border-radius:50%;width:13px;height:13px;display:flex;align-items:center;justify-content:center">D</div>':''}</div><div style="font-size:.52rem;font-weight:700;color:${isMe?'var(--acc)':'var(--txt)'};max-width:54px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${isMe?'Moi':p.name}</div><div style="font-size:.5rem;font-family:var(--mono);color:var(--txt2)">${p.chips}🪙</div>${p.bet>0?`<div style="font-size:.48rem;color:var(--warn)">${p.bet}🪙</div>`:''}${p.status==='fold'?'<div style="font-size:.46rem;color:var(--txt3)">couché</div>':''}${p.status==='allin'?'<div style="font-size:.46rem;color:var(--warn)">ALL-IN</div>':''}`;
      prow.appendChild(chip);
    });
    w.appendChild(prow);
    const comm=frodon.makeElement('div',''); comm.style.cssText='display:flex;gap:5px;justify-content:center;padding:8px;background:rgba(0,245,200,.03);border-radius:10px;margin:2px 8px 4px';
    for(let i=0;i<5;i++){ const el=frodon.makeElement('div',''); el.innerHTML=t.community[i]?cardHtml(t.community[i]):'<div class="pk-card empty"></div>'; comm.appendChild(el); }
    w.appendChild(comm);
    const hw=frodon.makeElement('div',''); hw.style.cssText='display:flex;flex-direction:column;align-items:center;gap:5px;padding:6px 8px';
    const hl=frodon.makeElement('div',''); hl.style.cssText='font-size:.56rem;font-family:var(--mono);color:var(--txt3);text-transform:uppercase'; hl.textContent=myP?.status==='fold'?'Couché':'Mes cartes';
    const mc=frodon.makeElement('div',''); mc.style.cssText='display:flex;gap:6px';
    if(t.myHand?.length===2) {
      mc.innerHTML=cardHtml(t.myHand[0])+cardHtml(t.myHand[1]);
      if(t.community.length>=3) {
        const best=evalBest([...t.myHand,...t.community]);
        const hn=frodon.makeElement('div',''); hn.style.cssText='font-size:.65rem;font-family:var(--mono);color:var(--acc2);padding:3px 10px;background:rgba(124,77,255,.1);border-radius:6px;border:1px solid rgba(124,77,255,.25)'; hn.textContent='✦ '+best.name;
        hw.appendChild(hl); hw.appendChild(mc); hw.appendChild(hn); w.appendChild(hw); renderActions(w,t,myP); return;
      }
    } else { mc.innerHTML=cardHtml(null,true)+cardHtml(null,true); }
    hw.appendChild(hl); hw.appendChild(mc); w.appendChild(hw); renderActions(w,t,myP);
  }

  function renderActions(c,t,myP) {
    if(!myP||myP.status!=='active'||t.players[t.currentIdx]?.id!==me()) {
      const w=frodon.makeElement('div',''); w.style.cssText='text-align:center;padding:10px;font-size:.68rem;color:var(--txt3);font-family:var(--mono)';
      if(myP?.status==='fold') w.textContent='Couché';
      else if(myP?.status==='allin') w.textContent='All-in';
      else w.textContent='⌛ Tour de '+(t.players[t.currentIdx]?.name||'?');
      c.appendChild(w); return;
    }
    const toCall=Math.min(t.roundBet-myP.bet,myP.chips);
    const canCheck=myP.bet>=t.roundBet;
    const wrap=frodon.makeElement('div',''); wrap.style.cssText='padding:8px 10px 10px;border-top:1px solid var(--bdr)';
    const r1=frodon.makeElement('div',''); r1.style.cssText='display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-bottom:7px';
    const fold=frodon.makeElement('button','plugin-action-btn','🏳 Coucher'); fold.style.fontSize='.68rem'; fold.addEventListener('click',()=>doAct(t,'fold'));
    if(canCheck){ const ck=frodon.makeElement('button','plugin-action-btn acc','✔ Checker'); ck.style.fontSize='.68rem'; ck.addEventListener('click',()=>doAct(t,'check')); r1.appendChild(fold); r1.appendChild(ck); }
    else{ const cl=frodon.makeElement('button','plugin-action-btn acc','📞 Suivre +'+toCall+'🪙'); cl.style.fontSize='.68rem'; cl.addEventListener('click',()=>doAct(t,'call')); r1.appendChild(fold); r1.appendChild(cl); }
    wrap.appendChild(r1);
    const r2=frodon.makeElement('div',''); r2.style.cssText='display:flex;gap:6px;align-items:center;justify-content:center';
    const inp=document.createElement('input'); inp.type='number'; inp.className='f-input'; inp.style.cssText='width:80px;text-align:center;padding:5px 8px;font-family:var(--mono)'; inp.min=t.roundBet+t.bb; inp.max=myP.chips; inp.step=t.bb; inp.value=Math.min(t.roundBet+t.bb,myP.chips);
    const raise=frodon.makeElement('button','plugin-action-btn','🔺 Relancer'); raise.style.fontSize='.68rem'; raise.addEventListener('click',()=>doAct(t,'raise',+inp.value||t.roundBet+t.bb));
    const allin=frodon.makeElement('button','plugin-action-btn','♠ All-in'); allin.style.fontSize='.68rem'; allin.style.color='var(--warn)'; allin.addEventListener('click',()=>doAct(t,'allin',myP.chips));
    r2.appendChild(inp); r2.appendChild(raise); r2.appendChild(allin); wrap.appendChild(r2); c.appendChild(wrap);
  }

  function doAct(t,action,amount) {
    if(t.isHost){ hostAct(t.tid,me(),action,amount||0); }
    else {
      send(t.hostId,'action',{tid:t.tid,action,amount:amount||0});
      const myP=t.players.find(p=>p.id===me());
      if(myP) {
        if(action==='fold') myP.status='fold';
        else if(action==='call'){ const x=Math.min(t.roundBet-myP.bet,myP.chips); myP.chips-=x; myP.bet+=x; }
        else if(action==='raise'){ const x=Math.min((amount||t.roundBet+t.bb)-myP.bet,myP.chips); myP.chips-=x; myP.bet+=x; }
        else if(action==='allin'){ myP.chips=0; myP.bet+=amount||0; myP.status='allin'; }
        myP.hasActed=true;
      }
      persist(); frodon.refreshSphereTab(PLUGIN_ID);
    }
  }

  function renderResult(c,t) {
    const res=t.result;
    if(!res){ c.appendChild(frodon.makeElement('div','no-posts','⌛ Résultat…')); return; }
    const isWin=res.winner===me();
    const w=W(c);
    const hdr=frodon.makeElement('div',''); hdr.style.cssText='text-align:center;padding:14px 12px 8px';
    hdr.innerHTML=`<div style="font-size:1.8rem;margin-bottom:5px">${isWin?'🏆':'🃏'}</div><div style="font-size:.95rem;font-weight:700;color:${isWin?'var(--ok)':'var(--txt)'}">${isWin?'Vous avez gagné !':(res.winnerName||'Pair inconnu')+' gagne'}</div><div style="font-size:.7rem;font-family:var(--mono);color:var(--warn);margin-top:3px">Pot : ${res.pot}🪙</div>`;
    w.appendChild(hdr);
    if(t.community?.length){ const comm=frodon.makeElement('div',''); comm.style.cssText='display:flex;gap:5px;justify-content:center;margin:0 8px 10px'; t.community.forEach(card=>{ const el=frodon.makeElement('div',''); el.innerHTML=cardHtml(card); comm.appendChild(el); }); w.appendChild(comm); }
    if(res.results){
      const rl=frodon.makeElement('div',''); rl.style.cssText='padding:0 8px';
      res.results.forEach(r=>{
        const isW=r.id===res.winner; const row=frodon.makeElement('div','');
        row.style.cssText=`display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:9px;margin-bottom:4px;background:${isW?'rgba(0,229,122,.08)':'var(--sur2)'};border:1px solid ${isW?'rgba(0,229,122,.25)':'var(--bdr)'}`;
        const pr=t.players.find(p=>p.id===r.id);
        row.innerHTML=`${avH(pr||{name:r.name},26)}<div style="flex:1;min-width:0"><div style="font-size:.72rem;font-weight:700;color:${isW?'var(--ok)':'var(--txt)'}">${r.id===me()?'Moi':r.name}${isW?' 🏆':''}</div><div style="font-size:.6rem;color:var(--acc2);font-family:var(--mono)">${r.handName||'—'}</div></div><div style="display:flex;gap:3px">${(r.hand||[]).map(card=>cardHtml(card)).join('')}</div>`;
        rl.appendChild(row);
      }); w.appendChild(rl);
    }
    const chips=frodon.makeElement('div',''); chips.style.cssText='margin:10px 8px 0;border-top:1px solid var(--bdr);padding-top:8px';
    const lbl=frodon.makeElement('div',''); lbl.style.cssText='font-size:.56rem;color:var(--txt3);font-family:var(--mono);text-transform:uppercase;letter-spacing:.8px;margin-bottom:5px'; lbl.textContent='Chips restants'; chips.appendChild(lbl);
    t.players.forEach(p=>{
      const isMe=p.id===me(); const row=frodon.makeElement('div',''); row.style.cssText='display:flex;justify-content:space-between;font-size:.68rem;font-family:var(--mono);padding:2px 0';
      const nm=frodon.makeElement('span','',isMe?'Moi':p.name); nm.style.color=isMe?'var(--acc)':'var(--txt2)';
      const ch=frodon.makeElement('span','',p.chips>0?p.chips+'🪙':'💀 0'); ch.style.color=p.chips>0?'var(--txt2)':'var(--warn)';
      row.appendChild(nm); row.appendChild(ch); chips.appendChild(row);
    }); w.appendChild(chips);
    const btns=frodon.makeElement('div',''); btns.style.cssText='padding:12px 8px 14px;display:flex;flex-direction:column;gap:8px';
    if(t.isHost){ const newH=frodon.makeElement('button','plugin-action-btn acc','🔄 Nouvelle main'); newH.style.width='100%'; newH.addEventListener('click',()=>hostDeal(t.tid)); btns.appendChild(newH); }
    else{ const msg=frodon.makeElement('div',''); msg.style.cssText='font-size:.64rem;color:var(--txt3);font-family:var(--mono);text-align:center;padding:6px 0'; msg.textContent="⌛ L\'hôte lance la prochaine main…"; btns.appendChild(msg); }
    const leave=frodon.makeElement('button','plugin-action-btn','🚪 Quitter la table'); leave.style.width='100%';
    leave.addEventListener('click',()=>{ if(t.isHost) sendAll(t.tid,'kick',{}); else send(t.hostId,'leave',{tid:t.tid}); delete tables[t.tid]; persist(); frodon.refreshSphereTab(PLUGIN_ID); });
    btns.appendChild(leave); w.appendChild(btns);
  }

  function renderScores(c) {
    const wins=store.get('wins')||0,losses=store.get('losses')||0,chipsWon=store.get('chips_won')||0;
    const total=wins+losses;
    if(!total){ c.innerHTML='<div style="text-align:center;padding:28px 14px;color:var(--txt2);font-size:.72rem"><div style="font-size:1.6rem;opacity:.2;margin-bottom:6px">🏆</div>Jouez votre première partie !</div>'; return; }
    const sb=frodon.makeElement('div',''); sb.style.cssText='display:flex;border:1px solid var(--bdr2);border-radius:10px;overflow:hidden;margin:8px';
    [['🏆',wins,'Victoires','var(--ok)'],['😔',losses,'Défaites','var(--warn)']].forEach(([ico,n,lbl,col],i)=>{
      const cell=frodon.makeElement('div',''); cell.style.cssText='flex:1;display:flex;flex-direction:column;align-items:center;gap:1px;padding:14px 4px;'+(i===0?'border-right:1px solid var(--bdr2)':'');
      cell.innerHTML=`<span style="font-size:1rem">${ico}</span><strong style="font-size:1.4rem;color:${col};font-family:var(--mono)">${n}</strong><span style="font-size:.52rem;color:var(--txt2)">${lbl}</span>`;
      sb.appendChild(cell);
    }); c.appendChild(sb);
    const rate=Math.round(wins/total*100);
    const bw=frodon.makeElement('div',''); bw.style.cssText='margin:0 8px 10px';
    bw.innerHTML=`<div style="display:flex;justify-content:space-between;font-size:.58rem;color:var(--txt2);font-family:var(--mono);margin-bottom:3px"><span>Taux de victoire</span><span style="color:var(--ok)">${rate}%</span></div><div style="height:5px;background:var(--sur2);border-radius:4px;overflow:hidden"><div style="height:100%;width:${rate}%;background:linear-gradient(90deg,var(--ok),var(--acc));border-radius:4px"></div></div><div style="font-size:.55rem;color:var(--txt2);text-align:center;margin-top:3px">${total} partie${total>1?'s':''}</div>`;
    c.appendChild(bw);
    if(chipsWon>0){ const cw=frodon.makeElement('div',''); cw.style.cssText='margin:0 8px 10px;padding:8px 10px;background:rgba(0,229,122,.07);border:1px solid rgba(0,229,122,.2);border-radius:8px;display:flex;justify-content:space-between'; cw.innerHTML=`<span style="font-size:.65rem;color:var(--txt2)">Chips gagnés</span><strong style="font-family:var(--mono);color:var(--ok)">${chipsWon.toLocaleString()}🪙</strong>`; c.appendChild(cw); }
    const hist=store.get('history')||[];
    if(hist.length){ const l=frodon.makeElement('div','section-label','Dernières parties'); l.style.margin='0 8px 6px'; c.appendChild(l); hist.slice(0,10).forEach(h=>{ const isW=h.result==='win'; const row=frodon.makeElement('div',''); row.style.cssText='display:flex;align-items:center;gap:8px;padding:5px 10px;border-bottom:1px solid var(--bdr)'; row.innerHTML=`<span style="font-size:.9rem">${isW?'🏆':'😔'}</span>`; const inf=frodon.makeElement('div',''); inf.style.cssText='flex:1'; inf.innerHTML=`<div style="font-size:.72rem;font-weight:700;color:${isW?'var(--ok)':'var(--warn)'}">${isW?'Victoire':'Défaite'}</div><div style="font-size:.6rem;color:var(--txt2)">vs ${(h.opponents||[]).join(', ')||'Pair inconnu'} · ${h.pot}🪙</div>`; row.appendChild(inf); row.appendChild(frodon.makeElement('span','mini-card-ts',frodon.formatTime(h.ts))); c.appendChild(row); }); }
    const rst=frodon.makeElement('button','plugin-action-btn'); rst.style.cssText='font-size:.62rem;margin:10px 8px 0;width:calc(100% - 16px);color:var(--txt3);border-color:var(--bdr)'; rst.textContent='↺ Remettre à zéro';
    rst.addEventListener('click',()=>{ if(!confirm('Remettre à zéro ?')) return; ['wins','losses','chips_won','history'].forEach(k=>store.del(k)); frodon.refreshSphereTab(PLUGIN_ID); });
    c.appendChild(rst);
  }

  let _css=false;
  function injectCSS() {
    if(_css) return; _css=true;
    const s=document.createElement('style');
    s.textContent='.pk-card{display:inline-flex;flex-direction:column;align-items:center;justify-content:space-between;width:36px;height:52px;background:var(--sur);border:1.5px solid var(--bdr2);border-radius:7px;padding:3px;font-family:var(--mono);font-size:.7rem;flex-shrink:0}.pk-card.back{background:linear-gradient(135deg,#1a1a3e,#0d0d22);border-color:rgba(124,77,255,.4);font-size:1.4rem;display:inline-flex;align-items:center;justify-content:center;width:36px;height:52px;border-radius:7px;flex-shrink:0}.pk-card.empty{background:transparent;border:1.5px dashed var(--bdr);opacity:.3;width:36px;height:52px;border-radius:7px;flex-shrink:0}.pk-card-tl{line-height:1;align-self:flex-start;display:flex;flex-direction:column;align-items:center}.pk-card-tl small,.pk-card-br small{font-size:.55em}.pk-card-suit{font-size:1rem;line-height:1}.pk-card-br{line-height:1;align-self:flex-end;display:flex;flex-direction:column;align-items:center;transform:rotate(180deg)}';
    document.head.appendChild(s);
  }

  frodon.registerUninstallHook(PLUGIN_ID,()=>{ for(const [tid,t] of Object.entries(tables)){ if(t.isHost) sendAll(tid,'kick',{}); else send(t.hostId,'leave',{tid}); } });

  restore();
  return { destroy() { for(const [tid,t] of Object.entries(tables)){ if(t.isHost) sendAll(tid,'kick',{}); else send(t.hostId,'leave',{tid}); } } };
});
