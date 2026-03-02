/**
 * FRODON PLUGIN — Texas Hold'em Poker P2P  v1.0.0
 *
 * Architecture :
 *   - L'HÔTE détient l'état complet (deck, mains privées, scores).
 *   - Il envoie à chaque joueur sa main privée (type:'hand') + l'état
 *     public (type:'state_sync') après chaque action.
 *   - Les joueurs envoient leurs actions à l'hôte (type:'action').
 *   - En cas de déconnexion : joueur marqué 'away', son tour est skipé.
 *     À la reconnexion : il envoie 'resync' et l'hôte lui renvoie son état.
 *   - L'hôte peut remplacer un joueur away par un nouveau pair découvert.
 */
frodon.register({
  id: 'poker',
  name: 'Texas Hold\'em',
  version: '1.0.0',
  author: 'frodon-community',
  description: 'Poker Texas Hold\'em multijoueur P2P — jusqu\'à 8 joueurs.',
  icon: '🃏',
}, () => {

  const PLUGIN_ID = 'poker';
  const store     = frodon.storage(PLUGIN_ID);

  /* ═══════════════════════════════════════════════
     CARTES
  ═══════════════════════════════════════════════ */
  const SUITS  = ['♠','♥','♦','♣'];
  const VALS   = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
  const VNUM   = Object.fromEntries(VALS.map((v,i)=>[v,i+2]));

  function mkDeck() {
    const d = [];
    for(const s of SUITS) for(const v of VALS) d.push({s,v});
    for(let i=d.length-1;i>0;i--){ const j=0|Math.random()*(i+1); [d[i],d[j]]=[d[j],d[i]]; }
    return d;
  }

  function cardHtml(c, back=false) {
    if(back || !c) return `<div class="pk-card back">🂠</div>`;
    const red = c.s==='♥'||c.s==='♦';
    const col = red ? '#ff4f8b' : 'var(--txt)';
    return `<div class="pk-card" style="color:${col}">
      <span class="pk-card-tl">${c.v}<small>${c.s}</small></span>
      <span class="pk-card-suit">${c.s}</span>
      <span class="pk-card-br">${c.v}<small>${c.s}</small></span>
    </div>`;
  }

  /* ═══════════════════════════════════════════════
     ÉVALUATEUR DE MAIN (Texas Hold'em, 5-7 cartes)
  ═══════════════════════════════════════════════ */
  function evalBest(cards) {
    if(!cards||cards.length<2) return {score:0,name:'—'};
    const combos = [];
    if(cards.length<=5) { combos.push(cards); }
    else {
      for(let i=0;i<cards.length;i++)
        for(let j=i+1;j<cards.length;j++)
          combos.push(cards.filter((_,k)=>k!==i&&k!==j));
    }
    let best=null;
    for(const c of combos){ const s=eval5(c); if(!best||s.score>best.score) best=s; }
    return best||{score:0,name:'—'};
  }

  function eval5(cards) {
    const ns   = cards.map(c=>VNUM[c.v]||0).sort((a,b)=>b-a);
    const suits = cards.map(c=>c.s);
    const flush = suits.every(s=>s===suits[0]);
    let straight=false, sHigh=0;
    if(ns[0]-ns[4]===4 && new Set(ns).size===5){ straight=true; sHigh=ns[0]; }
    if(''+ns==='14,5,4,3,2'){ straight=true; sHigh=5; }
    const cnt={};  ns.forEach(n=>cnt[n]=(cnt[n]||0)+1);
    const freq=Object.entries(cnt).map(([n,c])=>({n:+n,c})).sort((a,b)=>b.c-a.c||b.n-a.n);
    let rank, name, tb;
    if(flush&&straight){ rank=straight&&sHigh===14?8:7; name=sHigh===14?'Quinte flush royale':'Quinte flush'; tb=[sHigh]; }
    else if(freq[0].c===4){ rank=6; name='Carré';       tb=[freq[0].n,freq[1]?.n||0]; }
    else if(freq[0].c===3&&freq[1]?.c===2){ rank=5; name='Full house'; tb=[freq[0].n,freq[1].n]; }
    else if(flush){ rank=4; name='Couleur';              tb=ns; }
    else if(straight){ rank=3; name='Suite';             tb=[sHigh]; }
    else if(freq[0].c===3){ rank=2; name='Brelan';       tb=[freq[0].n,...freq.slice(1).map(f=>f.n)]; }
    else if(freq[0].c===2&&freq[1]?.c===2){ rank=1; name='Double paire'; tb=[freq[0].n,freq[1].n,freq[2]?.n||0]; }
    else if(freq[0].c===2){ rank=0; name='Paire';        tb=[freq[0].n,...freq.slice(1).map(f=>f.n)]; }
    else{ rank=-1; name='Carte haute';                   tb=ns; }
    const score=rank*1e7 + tb.reduce((a,n,i)=>a+n*Math.pow(100,4-i),0);
    return {score,name};
  }

  /* ═══════════════════════════════════════════════
     ÉTAT DE PARTIE (mémoire uniquement)
  ═══════════════════════════════════════════════ */
  /*
    table = {
      id, isHost, hostId, phase,   // 'lobby'|'preflop'|'flop'|'turn'|'river'|'showdown'|'ended'
      players: [{id,name,avatar,chips,bet,hasActed,status}],
      myHand: [{s,v},{s,v}],       // ma main privée
      allHands: {peerId:[c,c]},    // hôte uniquement
      community: [],               // cartes communes (0-5)
      deck: [],                    // hôte uniquement
      pot: 0,
      roundBet: 0,                 // mise maximale du tour actuel
      currentIdx: 0,               // index du joueur qui doit agir
      dealerIdx: 0,
      sb: 10, bb: 20,
      pendingInvites: Set,
      showResult: null,            // résultat après showdown
    }
  */
  let T = null; // table courante

  const myId = () => frodon.getMyProfile().peerId;

  /* ═══════════════════════════════════════════════
     HELPERS RÉSEAU
  ═══════════════════════════════════════════════ */
  function toAll(type, extra={}) {
    if(!T) return;
    T.players.forEach(p => {
      if(p.id!==myId()) frodon.sendDM(p.id, PLUGIN_ID, {type, tid:T.id, ...extra, _silent:true});
    });
  }
  function toPlayer(peerId, type, extra={}) {
    frodon.sendDM(peerId, PLUGIN_ID, {type, tid:T?.id, ...extra, _silent:true});
  }
  function toHost(type, extra={}) {
    if(!T) return;
    frodon.sendDM(T.hostId, PLUGIN_ID, {type, tid:T.id, ...extra, _silent:true});
  }

  /* ═══════════════════════════════════════════════
     LOGIQUE DE L'HÔTE
  ═══════════════════════════════════════════════ */
  function hostPublicState() {
    return {
      phase: T.phase,
      players: T.players.map(({id,name,avatar,chips,bet,hasActed,status}) =>
        ({id,name,avatar,chips,bet,hasActed,status})),
      community: T.community,
      pot: T.pot,
      currentIdx: T.currentIdx,
      dealerIdx: T.dealerIdx,
      roundBet: T.roundBet,
      sb: T.sb,
      bb: T.bb,
    };
  }

  function hostSync() {
    const pub = hostPublicState();
    T.players.forEach(p => {
      if(p.id===myId()) return;
      toPlayer(p.id, 'state_sync', {pub});
      if(T.allHands[p.id] && T.phase!=='lobby' && T.phase!=='ended')
        toPlayer(p.id, 'hand', {cards: T.allHands[p.id]});
    });
    frodon.refreshSphereTab(PLUGIN_ID);
  }

  function hostDeal() {
    T.deck    = mkDeck();
    T.community = [];
    T.pot       = 0;
    T.phase     = 'preflop';
    T.allHands  = {};
    T.showResult= null;

    // Avance dealer, trouve SB & BB parmi les actifs
    const active = T.players.filter(p=>p.chips>0);
    if(active.length<2){ frodon.showToast('Pas assez de joueurs actifs',true); return; }

    T.dealerIdx = (T.dealerIdx+1) % T.players.length;
    // Skip players with 0 chips
    while(T.players[T.dealerIdx].chips<=0) T.dealerIdx=(T.dealerIdx+1)%T.players.length;

    const next = idx => {
      let i=(idx+1)%T.players.length;
      while(T.players[i].chips<=0) i=(i+1)%T.players.length;
      return i;
    };
    const sbIdx = next(T.dealerIdx);
    const bbIdx = next(sbIdx);

    // Réinitialise les mises + statuts
    T.players.forEach(p => {
      p.bet=0; p.hasActed=false;
      p.status = p.chips>0 ? 'active' : 'out';
    });

    // Blindes
    const sb=T.players[sbIdx], bb=T.players[bbIdx];
    const sbAmt=Math.min(T.sb,sb.chips), bbAmt=Math.min(T.bb,bb.chips);
    sb.chips-=sbAmt; sb.bet=sbAmt;
    bb.chips-=bbAmt; bb.bet=bbAmt;
    if(sb.chips===0) sb.status='allin';
    if(bb.chips===0) bb.status='allin';
    T.roundBet = bbAmt;

    // Distribution des cartes
    T.players.filter(p=>p.status==='active'||p.status==='allin').forEach(p => {
      T.allHands[p.id] = [T.deck.pop(), T.deck.pop()];
    });
    T.myHand = T.allHands[myId()] || [];

    // Premier à agir = gauche du BB
    let firstIdx = next(bbIdx);
    while(T.players[firstIdx].status!=='active') {
      firstIdx = next(firstIdx);
      if(firstIdx===bbIdx) break;
    }
    T.currentIdx = firstIdx;

    hostSync();
    frodon.showToast('🃏 Cartes distribuées !');
    setTimeout(()=>frodon.focusPlugin(PLUGIN_ID), 200);
  }

  function hostCheckRoundEnd() {
    const active = T.players.filter(p=>p.status==='active');
    const folded = T.players.filter(p=>p.status==='active'||p.status==='allin');

    // Un seul joueur non-couché → il gagne tout de suite
    if(folded.length<=1) {
      const winner = folded[0] || T.players.find(p=>p.status==='allin');
      if(winner) {
        T.players.forEach(p=>{ T.pot+=p.bet; p.bet=0; });
        winner.chips += T.pot;
        const result = {
          pot:T.pot, winner:winner.id, winnerName:winner.name,
          results:[{id:winner.id,name:winner.name,hand:[],handName:'Tous les autres ont couché'}],
          players:T.players.map(p=>({id:p.id,chips:p.chips})),
        };
        T.pot=0; T.phase='ended'; T.showResult=result;
        toAll('showdown', result);
        applyShowdown(result);
        return true;
      }
    }

    // Tour terminé si tous les actifs ont agi et ont la même mise
    const roundOver = active.length===0 || active.every(p => p.hasActed && p.bet===T.roundBet);
    if(roundOver) {
      hostNextStreet();
      return true;
    }
    return false;
  }

  function hostNextStreet() {
    // Encaisse les mises
    T.players.forEach(p=>{ T.pot+=p.bet; p.bet=0; p.hasActed=false; });
    T.roundBet=0;

    const active = T.players.filter(p=>p.status==='active'||p.status==='allin');
    if(active.length<=1){ hostShowdown(); return; }

    if(T.phase==='preflop'){ T.phase='flop';  T.community.push(T.deck.pop(),T.deck.pop(),T.deck.pop()); }
    else if(T.phase==='flop'){ T.phase='turn'; T.community.push(T.deck.pop()); }
    else if(T.phase==='turn'){ T.phase='river';T.community.push(T.deck.pop()); }
    else if(T.phase==='river'){ hostShowdown(); return; }

    // Premier actif gauche du dealer
    let idx = (T.dealerIdx+1)%T.players.length;
    while(T.players[idx].status!=='active'){
      idx=(idx+1)%T.players.length;
      if(idx===T.dealerIdx) break;
    }
    T.currentIdx=idx;
    hostSync();
  }

  function hostShowdown() {
    T.players.forEach(p=>{ T.pot+=p.bet; p.bet=0; });
    const inHand = T.players.filter(p=>p.status==='active'||p.status==='allin');

    const evals = inHand.map(p => {
      const hand = T.allHands[p.id]||[];
      const best = evalBest([...hand,...T.community]);
      return {id:p.id, name:p.name, hand, handName:best.name, score:best.score};
    });
    evals.sort((a,b)=>b.score-a.score);
    const winner = evals[0];

    // Attribue le pot (simplifié — pas de side pots)
    const wp = T.players.find(p=>p.id===winner.id);
    if(wp) wp.chips += T.pot;

    const result = {
      pot:T.pot, winner:winner.id, winnerName:winner.name,
      results: evals,
      players: T.players.map(p=>({id:p.id,chips:p.chips})),
      community: T.community,
    };
    T.pot=0; T.phase='ended'; T.showResult=result;
    toAll('showdown', result);
    applyShowdown(result);

    // Historique
    const hist = store.get('history')||[];
    hist.unshift({isWin:winner.id===myId(),winner:winner.name,pot:result.pot,ts:Date.now()});
    if(hist.length>30) hist.length=30;
    store.set('history',hist);
  }

  function hostAction(fromId, action, amount) {
    if(!T||!T.isHost) return;
    if(T.phase==='lobby'||T.phase==='ended') return;
    const pIdx = T.players.findIndex(p=>p.id===fromId);
    if(pIdx<0||T.currentIdx!==pIdx) return;
    const p = T.players[pIdx];
    if(p.status!=='active') return;

    if(action==='fold') {
      p.status='fold'; p.hasActed=true;
    } else if(action==='check') {
      if(p.bet<T.roundBet) return; // invalide
      p.hasActed=true;
    } else if(action==='call') {
      const toCall = Math.min(T.roundBet-p.bet, p.chips);
      p.chips-=toCall; p.bet+=toCall;
      if(p.chips===0) p.status='allin';
      p.hasActed=true;
    } else if(action==='raise') {
      const minRaise = T.roundBet + T.bb;
      const raiseAmt = Math.max(amount||0, minRaise);
      const actual   = Math.min(raiseAmt-p.bet, p.chips);
      p.chips-=actual; p.bet+=actual;
      T.roundBet = p.bet;
      if(p.chips===0) p.status='allin';
      // Reset hasActed pour les autres actifs
      T.players.forEach(op=>{ if(op.id!==fromId&&op.status==='active') op.hasActed=false; });
      p.hasActed=true;
    } else if(action==='allin') {
      const all = p.chips;
      p.chips=0; p.bet+=all;
      if(p.bet>T.roundBet) {
        T.roundBet=p.bet;
        T.players.forEach(op=>{ if(op.id!==fromId&&op.status==='active') op.hasActed=false; });
      }
      p.status='allin'; p.hasActed=true;
    }

    if(hostCheckRoundEnd()) return;

    // Avance au prochain actif
    let next=(pIdx+1)%T.players.length;
    let guard=0;
    while(T.players[next].status!=='active'&&guard<T.players.length){ next=(next+1)%T.players.length; guard++; }
    T.currentIdx=next;
    hostSync();
  }

  function applyShowdown(result) {
    if(!T) return;
    T.phase='ended'; T.showResult=result;
    result.players.forEach(r=>{ const p=T.players.find(q=>q.id===r.id); if(p) p.chips=r.chips; });
    if(result.community) T.community=result.community;
    frodon.refreshSphereTab(PLUGIN_ID);
    if(result.winner===myId()) frodon.showToast('🏆 Vous remportez '+result.pot+'🪙 !');
    else frodon.showToast('🃏 '+result.winnerName+' gagne '+result.pot+'🪙');
    setTimeout(()=>frodon.focusPlugin(PLUGIN_ID),300);
  }

  /* ═══════════════════════════════════════════════
     HANDLER DM
  ═══════════════════════════════════════════════ */
  frodon.onDM(PLUGIN_ID, (fromId, payload) => {
    const {type, tid} = payload;

    /* ── INVITATION ── */
    if(type==='invite') {
      const host = frodon.getPeer(fromId);
      T = {
        id:tid, isHost:false, hostId:fromId, phase:'lobby',
        players:payload.players||[],
        myHand:[], allHands:{}, community:[], deck:[],
        pot:0, roundBet:payload.bb||20, currentIdx:0, dealerIdx:-1,
        sb:payload.sb||10, bb:payload.bb||20, pendingInvites:new Set(),
        showResult:null, _inviteFrom:host?.name||'?',
      };
      T.players.forEach(p=>{ if(p.id===myId()) p.isMe=true; });
      frodon.showToast('🃏 '+(host?.name||'?')+' vous invite au poker !');
      frodon.refreshSphereTab(PLUGIN_ID);
      setTimeout(()=>frodon.focusPlugin(PLUGIN_ID),400);
      return;
    }

    /* ── RÉPONSE INVITATION ── */
    if(type==='invite_accept') {
      if(!T||!T.isHost||T.id!==tid) return;
      const peer = frodon.getPeer(fromId);
      let p = T.players.find(pl=>pl.id===fromId);
      if(!p) {
        p={id:fromId,name:peer?.name||'?',avatar:peer?.avatar||'',chips:1000,bet:0,hasActed:false,status:'active',isMe:false};
        T.players.push(p);
      } else { p.status='active'; }
      T.pendingInvites.delete(fromId);
      frodon.showToast('🃏 '+(peer?.name||'?')+' rejoint la table !');
      hostSync();
      return;
    }
    if(type==='invite_decline') {
      if(!T||!T.isHost||T.id!==tid) return;
      T.pendingInvites.delete(fromId);
      T.players = T.players.filter(p=>p.id!==fromId);
      frodon.showToast((frodon.getPeer(fromId)?.name||'?')+' décline.');
      hostSync(); return;
    }

    /* ── SYNCHRO STATE (non-hôte reçoit) ── */
    if(type==='state_sync') {
      if(!T||T.id!==tid) return;
      const pub=payload.pub;
      T.phase=pub.phase; T.community=pub.community; T.pot=pub.pot;
      T.currentIdx=pub.currentIdx; T.dealerIdx=pub.dealerIdx;
      T.roundBet=pub.roundBet;
      T.players=pub.players.map(p=>({...p,isMe:p.id===myId()}));
      frodon.refreshSphereTab(PLUGIN_ID);
      if(T.players[T.currentIdx]?.id===myId()&&T.phase!=='lobby'&&T.phase!=='ended'){
        frodon.showToast('🃏 C\'est votre tour !');
        setTimeout(()=>frodon.focusPlugin(PLUGIN_ID),300);
      }
      return;
    }
    if(type==='hand') {
      if(!T||T.id!==tid) return;
      T.myHand=payload.cards||[];
      frodon.refreshSphereTab(PLUGIN_ID); return;
    }

    /* ── ACTION JOUEUR → HÔTE ── */
    if(type==='action') {
      if(!T||!T.isHost||T.id!==tid) return;
      hostAction(fromId, payload.action, payload.amount||0); return;
    }

    /* ── SHOWDOWN (non-hôte reçoit) ── */
    if(type==='showdown') {
      if(!T||T.id!==tid) return;
      applyShowdown(payload); return;
    }

    /* ── KICK / REMPLACEMENT ── */
    if(type==='kick') {
      if(!T||T.id!==tid) return;
      frodon.showToast('🃏 Vous avez été remplacé par un autre joueur.');
      T=null; frodon.refreshSphereTab(PLUGIN_ID); return;
    }
    if(type==='replace_notify') {
      if(!T||T.id!==tid) return;
      const p=T.players.find(pl=>pl.id===payload.oldId);
      if(p){ p.id=payload.newId; p.name=payload.newName; p.avatar=payload.newAvatar||''; }
      frodon.showToast('🃏 '+payload.oldName+' remplacé par '+payload.newName);
      frodon.refreshSphereTab(PLUGIN_ID); return;
    }

    /* ── RESYNC (hôte reçoit) ── */
    if(type==='resync') {
      if(!T||!T.isHost||T.id!==tid) return;
      const p=T.players.find(pl=>pl.id===fromId);
      if(p&&p.status==='away') p.status='active';
      const pub=hostPublicState();
      toPlayer(fromId,'state_sync',{pub});
      if(T.allHands[fromId]) toPlayer(fromId,'hand',{cards:T.allHands[fromId]});
      return;
    }

    /* ── QUITTER ── */
    if(type==='leave') {
      if(!T||T.id!==tid) return;
      if(T.isHost) {
        const p=T.players.find(pl=>pl.id===fromId);
        if(p){ p.status='away'; p.chips=0; }
        if(T.phase!=='lobby'&&T.phase!=='ended') {
          if(T.currentIdx===T.players.indexOf(p)) hostCheckRoundEnd();
          else hostSync();
        }
      }
      return;
    }
  });

  /* ═══════════════════════════════════════════════
     CONNEXION / DÉCONNEXION PEERS
  ═══════════════════════════════════════════════ */
  frodon.onPeerAppear(peer => {
    if(!T) return;
    const p = T.players.find(pl=>pl.id===peer.peerId);
    if(!p) return;
    frodon.showToast('🃏 '+peer.name+' est de retour !');
    if(T.isHost) {
      if(p.status==='away') p.status='active';
      const pub=hostPublicState();
      toPlayer(peer.peerId,'state_sync',{pub});
      if(T.allHands[peer.peerId]) toPlayer(peer.peerId,'hand',{cards:T.allHands[peer.peerId]});
      hostSync();
    } else if(peer.peerId===T.hostId) {
      toHost('resync',{});
    }
  });

  frodon.onPeerLeave(peerId => {
    if(!T||!T.isHost) return;
    const p=T.players.find(pl=>pl.id===peerId);
    if(!p||p.status==='out') return;
    p.status='away';
    frodon.showToast('🃏 '+p.name+' s\'est déconnecté');
    if(T.phase!=='lobby'&&T.phase!=='ended'){
      if(T.players[T.currentIdx]?.id===peerId){
        // Skip ce joueur — on le fold automatiquement
        hostAction(peerId,'fold',0);
      } else { hostSync(); }
    } else { frodon.refreshSphereTab(PLUGIN_ID); }
  });

  /* ═══════════════════════════════════════════════
     ACTION PROFIL PAIR — BOUTON INVITER
  ═══════════════════════════════════════════════ */
  frodon.registerPeerAction(PLUGIN_ID, '🃏 Poker', (peerId, container) => {
    const peer = frodon.getPeer(peerId);
    const peerName = peer?.name||'?';

    if(!T) {
      const btn = frodon.makeElement('button','plugin-action-btn acc','🃏 Créer une table & inviter');
      btn.addEventListener('click',()=>{
        const me = frodon.getMyProfile();
        const tid = 'pk_'+Date.now();
        T = {
          id:tid, isHost:true, hostId:myId(), phase:'lobby',
          players:[
            {id:myId(),name:me.name,avatar:me.avatar||'',chips:1000,bet:0,hasActed:false,status:'active',isMe:true},
            {id:peerId,name:peerName,avatar:peer?.avatar||'',chips:1000,bet:0,hasActed:false,status:'active',isMe:false},
          ],
          myHand:[], allHands:{}, community:[], deck:[],
          pot:0, roundBet:20, currentIdx:0, dealerIdx:-1,
          sb:10, bb:20, pendingInvites:new Set([peerId]), showResult:null,
        };
        frodon.sendDM(peerId, PLUGIN_ID, {
          type:'invite', tid, sb:10, bb:20,
          players:T.players.map(p=>({id:p.id,name:p.name,avatar:p.avatar||'',chips:p.chips,status:p.status})),
          _label:'🃏 Invitation au Poker !',
        });
        frodon.showToast('🃏 Invitation envoyée à '+peerName);
        frodon.refreshSphereTab(PLUGIN_ID);
        setTimeout(()=>frodon.focusPlugin(PLUGIN_ID),200);
      });
      container.appendChild(btn); return;
    }

    if(T.isHost && T.phase==='lobby') {
      const inTable = T.players.find(p=>p.id===peerId);
      if(inTable) {
        container.appendChild(frodon.makeElement('div','no-posts','Déjà à la table ✓'));
      } else {
        const btn = frodon.makeElement('button','plugin-action-btn','+ Ajouter à la table');
        btn.addEventListener('click',()=>{
          T.players.push({id:peerId,name:peerName,avatar:peer?.avatar||'',chips:1000,bet:0,hasActed:false,status:'active',isMe:false});
          T.pendingInvites.add(peerId);
          frodon.sendDM(peerId, PLUGIN_ID, {
            type:'invite', tid:T.id, sb:T.sb, bb:T.bb,
            players:T.players.map(p=>({id:p.id,name:p.name,avatar:p.avatar||'',chips:p.chips,status:p.status})),
            _label:'🃏 Invitation au Poker !',
          });
          frodon.showToast('🃏 Invitation à '+peerName);
          frodon.refreshSphereTab(PLUGIN_ID);
        });
        container.appendChild(btn);
      }
    } else if(T) {
      const p = T.players.find(pl=>pl.id===peerId);
      const st = frodon.makeElement('div','no-posts','');
      st.textContent = p ? ('En jeu ('+p.chips+'🪙)') : 'Partie en cours';
      container.appendChild(st);
    }
  });

  /* ═══════════════════════════════════════════════
     PANNEAU SPHERE
  ═══════════════════════════════════════════════ */
  frodon.registerBottomPanel(PLUGIN_ID, [

    { id:'table', label:'🃏 Table',
      render(container) {
        injectCSS();
        if(!T)               { renderEmpty(container); return; }
        if(T._inviteFrom)    { renderInvitePrompt(container); return; }
        if(T.phase==='lobby'){ renderLobby(container); return; }
        if(T.phase==='ended'){ renderResult(container); return; }
        renderGame(container);
      }
    },

    { id:'history', label:'📜 Historique',
      render(container) {
        const hist = store.get('history')||[];
        if(!hist.length){ container.appendChild(frodon.makeElement('div','no-posts','Aucune partie jouée.')); return; }
        hist.slice(0,20).forEach(h=>{
          const row=frodon.makeElement('div','');
          row.style.cssText='display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid var(--bdr)';
          row.innerHTML=`<span style="font-size:1.1rem">${h.isWin?'🏆':'😔'}</span>
            <div style="flex:1;min-width:0">
              <div style="font-size:.74rem;font-weight:700;color:${h.isWin?'var(--ok)':'var(--warn)'}">${h.isWin?'Victoire':'Défaite'}</div>
              <div style="font-size:.6rem;color:var(--txt2);font-family:var(--mono)">${h.isWin?'Vous avez':''+h.winner+' a'} remporté ${h.pot}🪙</div>
            </div>
            <span style="font-size:.56rem;color:var(--txt3);font-family:var(--mono)">${frodon.formatTime(h.ts)}</span>`;
          container.appendChild(row);
        });
      }
    },

  ]);

  /* ═══════════════════════════════════════════════
     RENDUS UI
  ═══════════════════════════════════════════════ */
  function renderEmpty(c) {
    const w=frodon.makeElement('div','');
    w.style.cssText='text-align:center;padding:32px 20px';
    w.innerHTML=`<div style="font-size:2.8rem;margin-bottom:10px">🃏</div>
      <div style="color:var(--txt2);font-size:.76rem;line-height:1.8">Aucune partie en cours.<br>
      <small style="color:var(--txt3)">Ouvrez le profil d'un pair pour l'inviter.</small></div>`;
    c.appendChild(w);
  }

  function renderInvitePrompt(c) {
    const w=frodon.makeElement('div','');
    w.style.cssText='padding:20px;text-align:center';
    w.innerHTML=`<div style="font-size:2rem;margin-bottom:8px">🃏</div>
      <div style="font-size:.88rem;font-weight:700;color:var(--txt);margin-bottom:4px">${T._inviteFrom} vous invite</div>
      <div style="font-size:.68rem;color:var(--txt2);margin-bottom:16px">Texas Hold'em · ${T.sb}/${T.bb} blindes · 1000🪙 chacun</div>`;
    const r=frodon.makeElement('div',''); r.style.cssText='display:flex;gap:8px;justify-content:center';
    const acc=frodon.makeElement('button','plugin-action-btn acc','✔ Accepter');
    acc.addEventListener('click',()=>{
      toHost('invite_accept',{});
      delete T._inviteFrom;
      frodon.showToast('🃏 Vous avez rejoint la table !');
      frodon.refreshSphereTab(PLUGIN_ID);
    });
    const dec=frodon.makeElement('button','plugin-action-btn','✕ Refuser');
    dec.addEventListener('click',()=>{ toHost('invite_decline',{}); T=null; frodon.refreshSphereTab(PLUGIN_ID); });
    r.appendChild(acc); r.appendChild(dec); w.appendChild(r); c.appendChild(w);
  }

  function renderLobby(c) {
    // Header
    const hdr=frodon.makeElement('div','');
    hdr.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid var(--bdr)';
    hdr.innerHTML=`<div style="font-family:var(--mono);font-size:.8rem;color:var(--acc)">🃏 SALON · ${T.sb}/${T.bb}</div>`;
    if(T.isHost){
      const start=frodon.makeElement('button','plugin-action-btn acc','▶ Lancer la partie');
      start.style.cssText+=';font-size:.65rem;padding:5px 14px';
      start.addEventListener('click',()=>hostDeal());
      hdr.appendChild(start);
    }
    c.appendChild(hdr);

    // Sièges
    const seats=frodon.makeElement('div','');
    seats.style.cssText='display:flex;flex-wrap:wrap;gap:8px;padding:12px;justify-content:center';
    T.players.forEach(p=>{
      const seat=frodon.makeElement('div','');
      const isPending = T.pendingInvites?.has(p.id);
      seat.style.cssText=`display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 8px;min-width:60px;background:var(--sur2);border:1.5px solid ${p.isMe?'var(--acc)':isPending?'var(--warn)':'var(--bdr2)'};border-radius:12px;transition:.2s`;
      seat.innerHTML=`${mkAvHtml(p,36)}
        <div style="font-size:.6rem;font-weight:700;color:${p.isMe?'var(--acc)':'var(--txt)'};text-align:center;max-width:64px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.isMe?'Moi':p.name}</div>
        <div style="font-size:.55rem;font-family:var(--mono);color:var(--txt2)">${p.chips}🪙</div>
        ${isPending?'<div style="font-size:.47rem;color:var(--warn);font-family:var(--mono)">invité…</div>':''}`;
      if(T.isHost&&!p.isMe){
        const rm=frodon.makeElement('button','');
        rm.style.cssText='font-size:.5rem;padding:2px 5px;background:rgba(255,68,68,.1);border:1px solid rgba(255,68,68,.2);border-radius:4px;color:var(--warn);cursor:pointer;margin-top:2px';
        rm.textContent='✕';
        rm.addEventListener('click',()=>{
          frodon.sendDM(p.id,PLUGIN_ID,{type:'kick',tid:T.id,_silent:true});
          T.players=T.players.filter(pl=>pl.id!==p.id);
          T.pendingInvites?.delete(p.id);
          hostSync();
        });
        seat.appendChild(rm);
      }
      seats.appendChild(seat);
    });
    c.appendChild(seats);

    if(T.isHost){
      const hint=frodon.makeElement('div','');
      hint.style.cssText='text-align:center;font-size:.6rem;color:var(--txt3);font-family:var(--mono);padding:0 12px 14px';
      hint.textContent='Ouvrez le profil d\'un pair pour l\'inviter · 2-8 joueurs';
      c.appendChild(hint);
    }
  }

  function renderGame(c) {
    const me=T.players.find(p=>p.isMe||p.id===myId());
    const phaseLabel={preflop:'Pré-flop',flop:'Flop',turn:'Turn',river:'River'};
    const PHASES=['preflop','flop','turn','river'];

    // Barre de phase + pot
    const top=frodon.makeElement('div','');
    top.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:5px 10px;border-bottom:1px solid var(--bdr);background:rgba(0,0,0,.2)';
    top.innerHTML=`<div style="display:flex;gap:4px">${PHASES.map(p=>`<span style="font-size:.56rem;font-family:var(--mono);padding:2px 7px;border-radius:4px;background:${T.phase===p?'rgba(0,245,200,.15)':'transparent'};color:${T.phase===p?'var(--acc)':'var(--txt3)'}">${phaseLabel[p]}</span>`).join('')}</div>
      <div style="font-family:var(--mono);font-size:.75rem;color:var(--warn)">Pot&nbsp;${T.pot}🪙</div>`;
    c.appendChild(top);

    // Joueurs
    const playersRow=frodon.makeElement('div','');
    playersRow.style.cssText='display:flex;flex-wrap:wrap;gap:4px;justify-content:center;padding:8px 6px 4px';
    T.players.forEach((p,i)=>{
      const isDealer=i===T.dealerIdx;
      const isCurrent=i===T.currentIdx;
      const statCol = {active:'var(--ok)',away:'#ff6b35',fold:'var(--txt3)',allin:'var(--warn)',out:'var(--txt3)'}[p.status]||'var(--txt3)';
      const chip=frodon.makeElement('div','');
      chip.style.cssText=`display:flex;flex-direction:column;align-items:center;gap:2px;min-width:50px;padding:5px 4px;border-radius:9px;border:1.5px solid ${isCurrent?'var(--acc2)':p.isMe?'rgba(0,245,200,.25)':'transparent'};background:${isCurrent?'rgba(124,77,255,.08)':'transparent'};opacity:${p.status==='fold'?.45:1};transition:.2s`;
      chip.innerHTML=`<div style="position:relative">
          ${mkAvHtml(p,30)}
          ${isDealer?'<div style="position:absolute;bottom:-3px;right:-3px;background:#f5c842;color:#000;font-size:.42rem;font-weight:900;border-radius:50%;width:13px;height:13px;display:flex;align-items:center;justify-content:center;border:1.5px solid var(--bg);z-index:2">D</div>':''}
          ${p.status==='away'?'<div style="position:absolute;top:-2px;right:-2px;background:#ff4444;border-radius:50%;width:8px;height:8px;border:1.5px solid var(--bg)"></div>':''}
        </div>
        <div style="font-size:.52rem;font-weight:700;color:${p.isMe?'var(--acc)':'var(--txt)'};text-align:center;max-width:54px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.isMe?'Moi':p.name}</div>
        <div style="font-size:.5rem;font-family:var(--mono);color:var(--txt2)">${p.chips}🪙</div>
        ${p.bet>0?`<div style="font-size:.48rem;font-family:var(--mono);color:var(--warn)">${p.bet}🪙</div>`:''}
        ${p.status==='fold'?'<div style="font-size:.47rem;color:var(--txt3)">couché</div>':''}
        ${p.status==='allin'?'<div style="font-size:.47rem;color:var(--warn)">ALL-IN</div>':''}
        ${p.status==='away'?'<div style="font-size:.47rem;color:#ff6b35">absent</div>':''}`;
      playersRow.appendChild(chip);
    });
    c.appendChild(playersRow);

    // Cartes communes
    const comm=frodon.makeElement('div','');
    comm.style.cssText='display:flex;gap:5px;justify-content:center;padding:8px;background:rgba(0,245,200,.03);border-radius:10px;margin:2px 8px 4px';
    for(let i=0;i<5;i++){
      const el=frodon.makeElement('div','');
      el.innerHTML = T.community[i] ? cardHtml(T.community[i]) : `<div class="pk-card empty"></div>`;
      comm.appendChild(el);
    }
    c.appendChild(comm);

    // Ma main
    const handWrap=frodon.makeElement('div','');
    handWrap.style.cssText='display:flex;flex-direction:column;align-items:center;gap:5px;padding:6px 8px';
    const handLbl=frodon.makeElement('div','');
    handLbl.style.cssText='font-size:.56rem;font-family:var(--mono);color:var(--txt3);text-transform:uppercase;letter-spacing:.8px';
    handLbl.textContent='Mes cartes';
    const myCards=frodon.makeElement('div','');
    myCards.style.cssText='display:flex;gap:6px';
    if(me?.status==='fold'){
      myCards.innerHTML=cardHtml(null,true)+cardHtml(null,true);
      handLbl.textContent='Couché';
    } else if(T.myHand&&T.myHand.length===2){
      myCards.innerHTML=cardHtml(T.myHand[0])+cardHtml(T.myHand[1]);
      if(T.community.length>=3){
        const best=evalBest([...T.myHand,...T.community]);
        const hn=frodon.makeElement('div','');
        hn.style.cssText='font-size:.65rem;font-family:var(--mono);color:var(--acc2);padding:3px 10px;background:rgba(124,77,255,.1);border-radius:6px;border:1px solid rgba(124,77,255,.25)';
        hn.textContent='✦ '+best.name;
        handWrap.appendChild(handLbl); handWrap.appendChild(myCards); handWrap.appendChild(hn);
        c.appendChild(handWrap);
        renderActions(c,me);
        if(T.isHost) renderReplaceZone(c);
        return;
      }
    } else {
      myCards.innerHTML=cardHtml(null,true)+cardHtml(null,true);
    }
    handWrap.appendChild(handLbl); handWrap.appendChild(myCards);
    c.appendChild(handWrap);
    renderActions(c,me);
    if(T.isHost) renderReplaceZone(c);
  }

  function renderActions(c, me) {
    if(!me||me.status!=='active') {
      const w=frodon.makeElement('div','');
      w.style.cssText='text-align:center;padding:10px;font-size:.68rem;color:var(--txt3);font-family:var(--mono)';
      if(me?.status==='fold') w.textContent='Couché — en attente du prochain tour';
      else if(me?.status==='allin') w.textContent='All-in — en attente du prochain tour';
      else w.textContent='⌛ Tour de '+(T.players[T.currentIdx]?.name||'?');
      c.appendChild(w); return;
    }
    const isMyTurn = T.players[T.currentIdx]?.id===myId();
    if(!isMyTurn){
      const w=frodon.makeElement('div','');
      w.style.cssText='text-align:center;padding:10px;font-size:.68rem;color:var(--txt3);font-family:var(--mono)';
      w.textContent='⌛ Tour de '+(T.players[T.currentIdx]?.name||'?');
      c.appendChild(w); return;
    }

    const toCall = Math.min(T.roundBet-me.bet, me.chips);
    const canCheck = me.bet>=T.roundBet;

    const wrap=frodon.makeElement('div','');
    wrap.style.cssText='padding:8px 10px 10px;border-top:1px solid var(--bdr)';

    const row1=frodon.makeElement('div','');
    row1.style.cssText='display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-bottom:7px';

    const fold=frodon.makeElement('button','plugin-action-btn','🏳 Coucher');
    fold.style.cssText+=';font-size:.68rem';
    fold.addEventListener('click',()=>doAction('fold'));

    if(canCheck){
      const check=frodon.makeElement('button','plugin-action-btn acc','✔ Checker');
      check.style.cssText+=';font-size:.68rem';
      check.addEventListener('click',()=>doAction('check'));
      row1.appendChild(fold); row1.appendChild(check);
    } else {
      const call=frodon.makeElement('button','plugin-action-btn acc','📞 Suivre +'+toCall+'🪙');
      call.style.cssText+=';font-size:.68rem';
      call.addEventListener('click',()=>doAction('call'));
      row1.appendChild(fold); row1.appendChild(call);
    }
    wrap.appendChild(row1);

    // Relance
    const row2=frodon.makeElement('div','');
    row2.style.cssText='display:flex;gap:6px;align-items:center;justify-content:center';
    const inp=document.createElement('input');
    inp.type='number'; inp.className='f-input';
    inp.style.cssText='width:80px;text-align:center;padding:5px 8px;font-family:var(--mono)';
    inp.min=T.roundBet+T.bb; inp.max=me.chips; inp.step=T.bb;
    inp.value=Math.min(T.roundBet+T.bb, me.chips);
    const raise=frodon.makeElement('button','plugin-action-btn','🔺 Relancer');
    raise.style.cssText+=';font-size:.68rem';
    raise.addEventListener('click',()=>doAction('raise',parseInt(inp.value)||T.roundBet+T.bb));
    const allin=frodon.makeElement('button','plugin-action-btn','♠ All-in');
    allin.style.cssText+=';font-size:.68rem;color:var(--warn);border-color:rgba(255,193,7,.35)';
    allin.addEventListener('click',()=>doAction('allin',me.chips));
    row2.appendChild(inp); row2.appendChild(raise); row2.appendChild(allin);
    wrap.appendChild(row2);
    c.appendChild(wrap);
  }

  function doAction(action, amount) {
    if(!T) return;
    if(T.isHost) { hostAction(myId(),action,amount||0); }
    else {
      toHost('action',{action,amount:amount||0});
      // Mise à jour optimiste locale
      const me=T.players.find(p=>p.id===myId());
      if(me){
        if(action==='fold'){ me.status='fold'; }
        else if(action==='call'){ const t=Math.min(T.roundBet-me.bet,me.chips); me.chips-=t; me.bet+=t; }
        else if(action==='raise'){ const t=Math.min((amount||T.roundBet+T.bb)-me.bet,me.chips); me.chips-=t; me.bet+=t; T.roundBet=me.bet; }
        else if(action==='allin'){ me.chips=0; me.bet+=amount||0; me.status='allin'; }
        me.hasActed=true;
      }
      frodon.refreshSphereTab(PLUGIN_ID);
    }
  }

  function renderReplaceZone(c) {
    const away = T.players.filter(p=>p.status==='away'&&!p.isMe);
    if(!away.length) return;

    const zone=frodon.makeElement('div','');
    zone.style.cssText='border-top:1px solid var(--bdr);padding:8px 10px 4px;margin-top:2px';
    zone.innerHTML='<div style="font-size:.57rem;color:var(--warn);font-family:var(--mono);text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px">⚠ Joueurs déconnectés</div>';

    away.forEach(awayP=>{
      const row=frodon.makeElement('div','');
      row.style.cssText='display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap';
      row.innerHTML=`<span style="font-size:.68rem;color:var(--txt2);flex-shrink:0">${awayP.name} (${awayP.chips}🪙)</span>`;

      const avail = frodon.getAllPeers().filter(p=>
        p.peerId!==myId()&&!T.players.find(tp=>tp.id===p.peerId)
      );
      if(avail.length){
        const sel=document.createElement('select');
        sel.className='f-input'; sel.style.cssText='font-size:.6rem;padding:3px 6px;flex:1;min-width:0';
        sel.innerHTML='<option value="">Remplacer par…</option>'+
          avail.map(p=>`<option value="${p.peerId}">${p.name}</option>`).join('');
        const btn=frodon.makeElement('button','plugin-action-btn','↻');
        btn.style.cssText+=';font-size:.6rem;padding:4px 8px;flex-shrink:0';
        btn.addEventListener('click',()=>{
          if(!sel.value) return;
          const np=frodon.getPeer(sel.value); if(!np) return;
          // Kick l'ancien
          frodon.sendDM(awayP.id,PLUGIN_ID,{type:'kick',tid:T.id,_silent:true});
          // Remplace dans la table
          const idx=T.players.findIndex(p=>p.id===awayP.id);
          if(idx>=0){
            if(T.allHands[awayP.id]){ T.allHands[np.peerId]=T.allHands[awayP.id]; delete T.allHands[awayP.id]; }
            T.players[idx]={...T.players[idx],id:np.peerId,name:np.name,avatar:np.avatar||'',status:'active'};
          }
          // Invite le nouveau
          frodon.sendDM(np.peerId,PLUGIN_ID,{
            type:'invite',tid:T.id,sb:T.sb,bb:T.bb,
            players:T.players.map(p=>({id:p.id,name:p.name,avatar:p.avatar||'',chips:p.chips,status:p.status})),
            _label:'🃏 Remplacement en cours de partie !',
          });
          // Notifie les autres
          T.players.forEach(p=>{
            if(p.id!==myId()&&p.id!==np.peerId)
              toPlayer(p.id,'replace_notify',{oldId:awayP.id,oldName:awayP.name,newId:np.peerId,newName:np.name,newAvatar:np.avatar||''});
          });
          frodon.showToast('🃏 '+awayP.name+' → '+np.name);
          hostSync();
        });
        row.appendChild(sel); row.appendChild(btn);
      } else {
        row.innerHTML+=`<span style="font-size:.6rem;color:var(--txt3);font-family:var(--mono)">Aucun pair disponible</span>`;
      }
      zone.appendChild(row);
    });
    c.appendChild(zone);
  }

  function renderResult(c) {
    const res = T.showResult;
    if(!res){ renderEmpty(c); return; }

    const win = res.winner===myId();
    const winP = T.players.find(p=>p.id===res.winner);

    const hdr=frodon.makeElement('div','');
    hdr.style.cssText='text-align:center;padding:14px 12px 8px';
    hdr.innerHTML=`<div style="font-size:1.8rem;margin-bottom:5px">${win?'🏆':'🃏'}</div>
      <div style="font-size:.95rem;font-weight:700;color:${win?'var(--ok)':'var(--txt)'}">${win?'Vous avez gagné !':((winP?.name||res.winnerName||'?')+' gagne')}</div>
      <div style="font-size:.7rem;font-family:var(--mono);color:var(--warn);margin-top:3px">Pot&nbsp;:&nbsp;${res.pot}🪙</div>`;
    c.appendChild(hdr);

    // Cartes communes
    if(T.community.length){
      const comm=frodon.makeElement('div','');
      comm.style.cssText='display:flex;gap:5px;justify-content:center;margin:0 8px 10px';
      T.community.forEach(card=>{ const el=frodon.makeElement('div',''); el.innerHTML=cardHtml(card); comm.appendChild(el); });
      c.appendChild(comm);
    }

    // Résultats des mains
    if(res.results){
      const rl=frodon.makeElement('div','');
      rl.style.cssText='padding:0 8px';
      res.results.forEach(r=>{
        const isW=r.id===res.winner;
        const row=frodon.makeElement('div','');
        row.style.cssText=`display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:9px;margin-bottom:4px;background:${isW?'rgba(0,229,122,.08)':'var(--sur2)'};border:1px solid ${isW?'rgba(0,229,122,.25)':'var(--bdr)'}`;
        const ph=T.players.find(p=>p.id===r.id);
        row.innerHTML=`${mkAvHtml(ph||{name:r.name,avatar:''},26)}
          <div style="flex:1;min-width:0">
            <div style="font-size:.72rem;font-weight:700;color:${isW?'var(--ok)':'var(--txt)'}">${r.id===myId()?'Moi':r.name}${isW?' 🏆':''}</div>
            <div style="font-size:.6rem;color:var(--acc2);font-family:var(--mono)">${r.handName||'—'}</div>
          </div>
          <div style="display:flex;gap:3px">${(r.hand||[]).map(card=>cardHtml(card)).join('')}</div>`;
        rl.appendChild(row);
      });
      c.appendChild(rl);
    }

    // Chips après la main
    const chips=frodon.makeElement('div','');
    chips.style.cssText='margin:10px 8px 0;border-top:1px solid var(--bdr);padding-top:8px';
    chips.innerHTML='<div style="font-size:.56rem;color:var(--txt3);font-family:var(--mono);text-transform:uppercase;letter-spacing:.8px;margin-bottom:5px">Chips restants</div>'+
      T.players.map(p=>`<div style="display:flex;justify-content:space-between;font-size:.68rem;font-family:var(--mono);padding:2px 0;color:${p.isMe?'var(--acc)':'var(--txt2)'}"><span>${p.isMe?'Moi':p.name}</span><span>${p.chips}🪙</span></div>`).join('');
    c.appendChild(chips);

    // Boutons
    const btns=frodon.makeElement('div','');
    btns.style.cssText='display:flex;gap:8px;padding:12px 8px';
    if(T.isHost){
      const newH=frodon.makeElement('button','plugin-action-btn acc','🔄 Nouvelle main');
      newH.addEventListener('click',()=>{
        T.phase='lobby'; T.showResult=null;
        T.players.forEach(p=>{ p.bet=0; p.hasActed=false; p.status=p.chips>0?'active':'out'; });
        hostSync();
      });
      btns.appendChild(newH);
    }
    const leave=frodon.makeElement('button','plugin-action-btn','🚪 Quitter la table');
    leave.addEventListener('click',()=>{
      if(T.isHost) toAll('kick',{});
      else toHost('leave',{});
      T=null; frodon.refreshSphereTab(PLUGIN_ID);
    });
    btns.appendChild(leave);
    c.appendChild(btns);
  }

  /* ═══════════════════════════════════════════════
     HELPERS RENDER
  ═══════════════════════════════════════════════ */
  function mkAvHtml(p, size=32) {
    const col=['#00f5c8','#7c4dff','#ff6b35','#00e87a','#f5c842','#ff4f8b'];
    const c = col[((p?.name||'?').charCodeAt(0)||0)%col.length];
    const letter = (p?.name||'?')[0].toUpperCase();
    return `<div style="width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;flex-shrink:0;background:var(--sur2);display:flex;align-items:center;justify-content:center;font-size:${size*.38}px;color:${c};font-weight:700;font-family:var(--mono)">
      ${p?.avatar?`<img src="${p.avatar}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">`:''}
      ${letter}
    </div>`;
  }

  let _cssInjected=false;
  function injectCSS() {
    if(_cssInjected) return; _cssInjected=true;
    const style=document.createElement('style');
    style.textContent=`
      .pk-card{display:inline-flex;flex-direction:column;align-items:center;justify-content:space-between;width:36px;height:52px;background:var(--sur);border:1.5px solid var(--bdr2);border-radius:7px;padding:3px;font-family:var(--mono);font-size:.7rem;position:relative;flex-shrink:0}
      .pk-card.back{background:linear-gradient(135deg,#1a1a3e,#0d0d22);border-color:rgba(124,77,255,.4);font-size:1.4rem;display:inline-flex;align-items:center;justify-content:center;width:36px;height:52px;border-radius:7px;flex-shrink:0}
      .pk-card.empty{background:transparent;border:1.5px dashed var(--bdr);opacity:.3;width:36px;height:52px;border-radius:7px;flex-shrink:0}
      .pk-card-tl{line-height:1;align-self:flex-start;display:flex;flex-direction:column;align-items:center;gap:0}
      .pk-card-tl small,.pk-card-br small{font-size:.55em}
      .pk-card-suit{font-size:1rem;line-height:1}
      .pk-card-br{line-height:1;align-self:flex-end;display:flex;flex-direction:column;align-items:center;transform:rotate(180deg)}
    `;
    document.head.appendChild(style);
  }

  /* ═══════════════════════════════════════════════
     UNINSTALL
  ═══════════════════════════════════════════════ */
  frodon.registerUninstallHook(PLUGIN_ID, ()=>{
    if(!T) return;
    if(T.isHost) toAll('kick',{});
    else toHost('leave',{});
    T=null;
  });

  return { destroy() {
    if(!T) return;
    if(T.isHost) toAll('kick',{});
    else toHost('leave',{});
    T=null;
  }};
});
