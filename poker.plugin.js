/**
 * YourMine Plugin — Texas Hold'em Poker v1.1
 * Poker P2P multi-table. L'hôte gère la logique, les guests jouent.
 * category: jeux
 * website: https://github.com/theodoreyong9/YourMinedApp
 */
const plugin = (() => {
  const ID  = 'jeux.poker';
  const KEY = 'ym_poker_';
  const TURN_TIMEOUT = 30;

  let _YM = null;
  let _hubBound = false;
  let _container = null;
  let _activeTab = 'table';

  const tables = {};
  const SUITS = ['♠','♥','♦','♣'];
  const VALS  = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
  const VNUM  = Object.fromEntries(VALS.map((v,i)=>[v,i+2]));

  function store(k,v) {
    if (v===undefined) return JSON.parse(localStorage.getItem(KEY+k)||'null');
    localStorage.setItem(KEY+k, JSON.stringify(v));
  }
  function send(peerId, payload) { _YM.sendTo(peerId, { plugin: ID, ...payload }); }
  function sendAll(tid, payload) {
    const t=tables[tid]; if(!t) return;
    t.players.forEach(p=>{ if(p.id!==me()) send(p.peerId,{...payload,to:p.uuid}); });
  }
  function me() { return _YM?.profile?.uuid; }
  function myPeerId() {
    return _YM?.nearPeers?.find(e=>e.uuid===me())?.peerId || '';
  }
  function peerByUuid(uuid) {
    return _YM?.nearPeers?.find(e=>e.uuid===uuid) || _YM?.peers?.find(p=>p.uuid===uuid);
  }
  function peerName(uuid) {
    const p=peerByUuid(uuid);
    if(p?.profile?.name) return p.profile.name;
    if(p?.name) return p.name;
    return store('pname_'+uuid)||'Pair';
  }
  function rerender() { if(_container) renderInto(_container); }

  // ── Turn timer ──
  const _turnTimers={};
  function startTurnTimer(tid) {
    clearTurnTimer(tid);
    const t=tables[tid]; if(!t||t.done||t.phase==='lobby') return;
    _turnTimers[tid]={remaining:TURN_TIMEOUT};
    _turnTimers[tid].interval=setInterval(()=>{
      const tm=_turnTimers[tid]; if(!tm) return;
      tm.remaining--;
      rerender();
      if(tm.remaining<=0) {
        clearTurnTimer(tid);
        if(t.isHost){ const cur=t.players[t.currentIdx]; if(cur) hostAct(tid,cur.id,'fold',0); }
        else { const cur=t.players[t.currentIdx]; if(cur?.id===me()) doAct(t,'fold',0); }
      }
    },1000);
  }
  function clearTurnTimer(tid) {
    if(_turnTimers[tid]?.interval) clearInterval(_turnTimers[tid].interval);
    delete _turnTimers[tid];
  }
  function timerRem(tid) { return _turnTimers[tid]?.remaining??TURN_TIMEOUT; }

  // ── Cards ──
  function mkDeck(){
    const d=[]; for(const s of SUITS) for(const v of VALS) d.push({s,v});
    for(let i=d.length-1;i>0;i--){const j=0|Math.random()*(i+1);[d[i],d[j]]=[d[j],d[i]];}
    return d;
  }
  function evalBest(cards){
    if(!cards||cards.length<2) return{score:0,name:'—'};
    const combos=[];
    if(cards.length<=5){combos.push(cards);}
    else{for(let i=0;i<cards.length;i++)for(let j=i+1;j<cards.length;j++)combos.push(cards.filter((_,k)=>k!==i&&k!==j));}
    let best=null;
    for(const c of combos){const s=eval5(c);if(!best||s.score>best.score)best=s;}
    return best||{score:0,name:'—'};
  }
  function eval5(cards){
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
    return{score:rank*1e7+tb.reduce((a,n,i)=>a+n*Math.pow(100,4-i),0),name};
  }
  function cardHtml(c,back=false){
    if(back||!c) return '<div class="pk-c back">🂠</div>';
    const red=c.s==='♥'||c.s==='♦';
    return `<div class="pk-c" style="color:${red?'#ff4f8b':'var(--text-1)'}"><span class="pk-tl">${c.v}<small>${c.s}</small></span><span class="pk-su">${c.s}</span><span class="pk-br">${c.v}<small>${c.s}</small></span></div>`;
  }
  let _css=false;
  function injectCSS(){
    if(_css)return;_css=true;
    const s=document.createElement('style');
    s.textContent='.pk-c{display:inline-flex;flex-direction:column;align-items:center;justify-content:space-between;width:34px;height:50px;background:var(--bg-card);border:1.5px solid var(--border);border-radius:6px;padding:2px;font-family:var(--font-mono);font-size:.68rem;flex-shrink:0}.pk-c.back{background:linear-gradient(135deg,#1a1a3e,#0d0d22);border-color:rgba(124,77,255,.4);font-size:1.3rem;display:inline-flex;align-items:center;justify-content:center}.pk-c.empty{background:transparent;border:1.5px dashed var(--border);opacity:.3;width:34px;height:50px;border-radius:6px;flex-shrink:0}.pk-tl{line-height:1;align-self:flex-start;display:flex;flex-direction:column;align-items:center}.pk-tl small,.pk-br small{font-size:.5em}.pk-su{font-size:.95rem;line-height:1}.pk-br{line-height:1;align-self:flex-end;display:flex;flex-direction:column;align-items:center;transform:rotate(180deg)}';
    document.head.appendChild(s);
  }

  // ── Persist / restore ──
  function persist(){
    const save={};
    for(const[tid,t] of Object.entries(tables))
      save[tid]={...t,deck:t.isHost?(t.deck||[]):[],allHands:t.isHost?(t.allHands||{}):{},_scored:t._scored||false};
    if(!Object.keys(save).length) localStorage.removeItem(KEY+'tables');
    else store('tables',save);
  }
  function restore(){
    const s=store('tables'); if(!s) return;
    for(const[tid,t] of Object.entries(s)) tables[tid]={...t,allHands:t.allHands||{},_scored:t._scored||false};
    if(!Object.keys(tables).length) return;
    setTimeout(()=>{
      for(const[tid,t] of Object.entries(tables)){
        if(t.isHost&&!t.done&&t.phase!=='lobby'){
          hostSync(tid);
          startTurnTimer(tid);
        }
      }
    },3500);
  }

  // ── Host ──
  function pub(tid){
    const t=tables[tid];
    return{phase:t.phase,pot:t.pot,community:t.community,currentIdx:t.currentIdx,
      dealerIdx:t.dealerIdx,roundBet:t.roundBet,done:t.done,result:t.result||null,_scored:t._scored||false,
      players:t.players.map(({id,name,chips,bet,hasActed,status})=>({id,name,chips,bet,hasActed,status}))};
  }
  function hostSync(tid){
    const t=tables[tid]; if(!t) return;
    const p=pub(tid);
    t.players.forEach(pl=>{
      if(pl.id===me()) return;
      send(pl.peerId,{type:'sync',tid,pub:p,to:pl.uuid});
      if(!t.done&&t.phase!=='lobby'&&t.allHands[pl.id])
        send(pl.peerId,{type:'hand',tid,cards:t.allHands[pl.id],to:pl.uuid});
    });
    persist(); rerender();
  }
  function nxtActive(t,from){
    let j=(from+1)%t.players.length,g=0;
    while(t.players[j].status!=='active'&&g<t.players.length){j=(j+1)%t.players.length;g++;}
    return j;
  }
  function hostDeal(tid){
    const t=tables[tid]; if(!t) return;
    t.players.forEach(p=>{if(p.chips<=0&&p.status!=='away')p.chips=1000;});
    const eligible=t.players.filter(p=>p.chips>0&&p.status!=='away');
    if(eligible.length<2){_YM.toast('Pas assez de joueurs','error');return;}
    clearTurnTimer(tid);
    t.deck=mkDeck();t.community=[];t.pot=0;t.allHands={};t.done=false;t.result=null;t._scored=false;
    t.phase='preflop';
    t.dealerIdx=(t.dealerIdx+1)%t.players.length;
    while(t.players[t.dealerIdx].chips<=0||t.players[t.dealerIdx].status==='away')
      t.dealerIdx=(t.dealerIdx+1)%t.players.length;
    t.players.forEach(p=>{p.bet=0;p.hasActed=false;p.status=(p.chips>0&&p.status!=='away')?'active':'out';});
    const si=nxtActive(t,t.dealerIdx),bi=nxtActive(t,si);
    const sbP=t.players[si],bbP=t.players[bi];
    const sa=Math.min(t.sb,sbP.chips),ba=Math.min(t.bb,bbP.chips);
    sbP.chips-=sa;sbP.bet=sa;if(!sbP.chips)sbP.status='allin';
    bbP.chips-=ba;bbP.bet=ba;if(!bbP.chips)bbP.status='allin';
    t.roundBet=ba;
    t.players.filter(p=>p.status==='active'||p.status==='allin').forEach(p=>{t.allHands[p.id]=[t.deck.pop(),t.deck.pop()];});
    t.myHand=t.allHands[me()]||[];
    t.currentIdx=nxtActive(t,bi);
    hostSync(tid);
    startTurnTimer(tid);
    _YM.toast('🃏 Cartes distribuées !');
  }
  function hostAct(tid,fromId,action,amount){
    const t=tables[tid]; if(!t||t.done||t.phase==='lobby') return;
    const pi=t.players.findIndex(p=>p.id===fromId);
    if(pi<0||t.currentIdx!==pi) return;
    const p=t.players[pi]; if(p.status!=='active') return;
    clearTurnTimer(tid);
    if(action==='fold'){p.status='fold';p.hasActed=true;}
    else if(action==='check'){if(p.bet<t.roundBet)return;p.hasActed=true;}
    else if(action==='call'){const x=Math.min(t.roundBet-p.bet,p.chips);p.chips-=x;p.bet+=x;if(!p.chips)p.status='allin';p.hasActed=true;}
    else if(action==='raise'){const r=Math.max(amount||0,t.roundBet+t.bb),a=Math.min(r-p.bet,p.chips);p.chips-=a;p.bet+=a;t.roundBet=p.bet;if(!p.chips)p.status='allin';t.players.forEach(o=>{if(o.id!==fromId&&o.status==='active')o.hasActed=false;});p.hasActed=true;}
    else if(action==='allin'){const a=p.chips;p.chips=0;p.bet+=a;if(p.bet>t.roundBet){t.roundBet=p.bet;t.players.forEach(o=>{if(o.id!==fromId&&o.status==='active')o.hasActed=false;});}p.status='allin';p.hasActed=true;}
    if(hostRoundEnd(tid)) return;
    t.currentIdx=nxtActive(t,pi);
    hostSync(tid);
    startTurnTimer(tid);
  }
  function hostRoundEnd(tid){
    const t=tables[tid];
    const alive=t.players.filter(p=>p.status==='active'||p.status==='allin');
    if(alive.length<=1){
      const w=alive[0]||t.players.find(p=>p.status==='allin');
      if(w){t.players.forEach(p=>{t.pot+=p.bet;p.bet=0;});w.chips+=t.pot;
        hostEnd(tid,{pot:t.pot,winner:w.id,winnerName:w.name,results:[{id:w.id,name:w.name,hand:[],handName:'Tous se sont couchés'}],players:t.players.map(p=>({id:p.id,chips:p.chips}))});}
      return true;
    }
    const act=t.players.filter(p=>p.status==='active');
    if(!act.length){hostStreet(tid);return true;}
    if(act.every(p=>p.hasActed&&p.bet===t.roundBet)){hostStreet(tid);return true;}
    return false;
  }
  function hostStreet(tid){
    const t=tables[tid];
    t.players.forEach(p=>{t.pot+=p.bet;p.bet=0;p.hasActed=false;});t.roundBet=0;
    const alive=t.players.filter(p=>p.status==='active'||p.status==='allin');
    if(alive.length<=1){hostShowdown(tid);return;}
    if(t.phase==='preflop'){t.phase='flop';t.community.push(t.deck.pop(),t.deck.pop(),t.deck.pop());}
    else if(t.phase==='flop'){t.phase='turn';t.community.push(t.deck.pop());}
    else if(t.phase==='turn'){t.phase='river';t.community.push(t.deck.pop());}
    else{hostShowdown(tid);return;}
    let i=(t.dealerIdx+1)%t.players.length,g=0;
    while(t.players[i].status!=='active'&&g<t.players.length){i=(i+1)%t.players.length;g++;}
    t.currentIdx=i;
    if(!t.players.some(p=>p.status==='active')){hostSync(tid);setTimeout(()=>hostStreet(tid),700);}
    else{hostSync(tid);startTurnTimer(tid);}
  }
  function hostShowdown(tid){
    const t=tables[tid];
    t.players.forEach(p=>{t.pot+=p.bet;p.bet=0;});
    const alive=t.players.filter(p=>p.status==='active'||p.status==='allin');
    const ev=alive.map(p=>{const h=t.allHands[p.id]||[],b=evalBest([...h,...t.community]);return{id:p.id,name:p.name,hand:h,handName:b.name,score:b.score};});
    ev.sort((a,b)=>b.score-a.score);
    const w=ev[0];const wp=t.players.find(p=>p.id===w.id);if(wp)wp.chips+=t.pot;
    hostEnd(tid,{pot:t.pot,winner:w.id,winnerName:w.name,results:ev,players:t.players.map(p=>({id:p.id,chips:p.chips})),community:t.community});
  }
  function hostEnd(tid,result){
    const t=tables[tid]; if(!t||t.done) return;
    clearTurnTimer(tid);
    t.pot=0;t.done=true;t.result=result;
    result.players.forEach(r=>{const p=t.players.find(q=>q.id===r.id);if(p)p.chips=r.chips;});
    if(result.community)t.community=result.community;
    if(!t._scored){t._scored=true;addScore(result.winner===me()?'win':'loss',t.players.filter(p=>p.id!==me()).map(p=>p.name),result.pot);}
    sendAll(tid,{type:'showdown',tid,result});persist();rerender();
    _YM.toast(result.winner===me()?'🏆 Vous remportez '+result.pot+'🪙 !':'🃏 '+result.winnerName+' gagne '+result.pot+'🪙');
  }
  function addScore(result,opponents,pot){
    store('wins',(store('wins')||0)+(result==='win'?1:0));
    store('losses',(store('losses')||0)+(result==='loss'?1:0));
    const hist=store('history')||[];hist.unshift({result,pot,opponents,ts:Date.now()});if(hist.length>50)hist.length=50;store('history',hist);
  }
  function findLobbyTable(){ return Object.values(tables).find(t=>t.isHost&&t.phase==='lobby'&&!t.done&&t.players.length<8); }
  function invitePeer(peerUuid,peerId){
    const my=_YM.profile,name=peerName(peerUuid);
    store('pname_'+peerUuid,name);
    const existing=findLobbyTable();let tid,t;
    if(existing){tid=existing.tid;t=existing;if(t.players.find(p=>p.id===peerUuid)){_YM.toast(name+' est déjà à cette table','error');return;}t.players.push({id:peerUuid,name,peerId,uuid:peerUuid,chips:1000,bet:0,hasActed:false,status:'active'});}
    else{tid='pk_'+Date.now();t=tables[tid]={tid,isHost:true,hostId:my.uuid,phase:'lobby',done:false,_scored:false,players:[{id:my.uuid,name:my.name,peerId:myPeerId(),uuid:my.uuid,chips:1000,bet:0,hasActed:false,status:'active'},{id:peerUuid,name,peerId,uuid:peerUuid,chips:1000,bet:0,hasActed:false,status:'active'}],myHand:[],allHands:{},community:[],deck:[],pot:0,roundBet:20,currentIdx:0,dealerIdx:-1,sb:10,bb:20,result:null};}
    send(peerId,{type:'invite',tid,sb:t.sb,bb:t.bb,hostUuid:my.uuid,players:t.players.map(p=>({id:p.id,name:p.name,chips:p.chips,status:p.status})),to:peerUuid});
    persist();_YM.toast('🃏 Invitation envoyée à '+name);rerender();
  }

  // ── Messages ──
  function onMsg(data){
    if(data.plugin!==ID) return;
    if(data.to&&data.to!==me()) return;
    const{type,tid}=data; if(!type||!tid) return;
    if(type==='invite'){
      for(const[k,t] of Object.entries(tables)){if(t.hostId===data.hostUuid&&t.done)delete tables[k];}
      const existing=Object.values(tables).find(t=>t.tid===tid);
      if(existing){existing.players=data.players||existing.players;persist();rerender();return;}
      tables[tid]={tid,isHost:false,hostId:data.hostUuid,hostPeerId:data.from,phase:'lobby',done:false,_scored:false,
        players:(data.players||[]).map(p=>({...p,peerId:p.id===data.hostUuid?data.from:(peerByUuid(p.id)?.peerId||'')})),
        myHand:[],allHands:{},community:[],deck:[],pot:0,roundBet:data.bb||20,currentIdx:0,dealerIdx:-1,sb:data.sb||10,bb:data.bb||20,result:null,_from:peerName(data.hostUuid)};
      persist();_YM.notify(ID);_YM.toast('🃏 '+peerName(data.hostUuid)+' vous invite !');rerender();return;
    }
    if(type==='invite_ok'){
      const t=tables[tid]; if(!t||!t.isHost) return;
      let p=t.players.find(pl=>pl.id===data.fromUuid);
      if(!p){p={id:data.fromUuid,name:peerName(data.fromUuid),peerId:data.from,uuid:data.fromUuid,chips:1000,bet:0,hasActed:false,status:'active'};t.players.push(p);}
      else{p.status='active';p.peerId=data.from;}
      _YM.toast('🃏 '+peerName(data.fromUuid)+' rejoint !');
      t.players.forEach(pl=>{if(pl.id!==me())send(pl.peerId,{type:'lobby_update',tid,players:t.players.map(p=>({id:p.id,name:p.name,chips:p.chips,status:p.status})),to:pl.uuid});});
      hostSync(tid);return;
    }
    if(type==='lobby_update'){const t=tables[tid];if(!t||t.isHost)return;t.players=data.players||t.players;persist();rerender();return;}
    if(type==='invite_no'){const t=tables[tid];if(!t||!t.isHost)return;t.players=t.players.filter(p=>p.id!==data.fromUuid);_YM.toast(peerName(data.fromUuid)+' décline.');hostSync(tid);return;}
    if(type==='sync'){
      const t=tables[tid]; if(!t||t.isHost) return;
      const p=data.pub;
      t.phase=p.phase;t.pot=p.pot;t.community=p.community||[];t.currentIdx=p.currentIdx;t.dealerIdx=p.dealerIdx;t.roundBet=p.roundBet;
      t.players=p.players.map(pl=>({...pl,peerId:pl.id===t.hostId?t.hostPeerId:(peerByUuid(pl.id)?.peerId||'')}));
      t.done=p.done||false;t.result=p.result||null;if(p._scored)t._scored=true;
      if(!t.done&&t.phase==='preflop')t.myHand=[];
      delete t._from;persist();rerender();
      if(!t.done&&t.phase!=='lobby'&&t.players[t.currentIdx]?.id===me()){
        startTurnTimer(tid);_YM.notify(ID);_YM.toast('🃏 C\'est votre tour !');
      } else { clearTurnTimer(tid); }
      return;
    }
    if(type==='hand'){const t=tables[tid];if(!t||t.isHost)return;t.myHand=data.cards||[];persist();rerender();return;}
    if(type==='action'){const t=tables[tid];if(!t||!t.isHost)return;hostAct(tid,data.fromUuid,data.action,data.amount||0);return;}
    if(type==='showdown'){
      const t=tables[tid];if(!t||t.isHost)return;
      clearTurnTimer(tid);
      const result=data.result;
      if(!t._scored){t._scored=true;const isWin=result.winner===me();addScore(isWin?'win':'loss',t.players.filter(p=>p.id!==me()).map(p=>p.name),result.pot);_YM.toast(isWin?'🏆 Vous remportez '+result.pot+'🪙 !':'🃏 '+result.winnerName+' gagne '+result.pot+'🪙');}
      t.done=true;t.result=result;result.players.forEach(r=>{const p=t.players.find(q=>q.id===r.id);if(p)p.chips=r.chips;});
      if(result.community)t.community=result.community;persist();rerender();return;
    }
    if(type==='kick'){clearTurnTimer(tid);if(!tables[tid])return;delete tables[tid];persist();_YM.toast('🃏 Table fermée.');rerender();return;}
    if(type==='leave'){const t=tables[tid];if(!t||!t.isHost)return;const p=t.players.find(pl=>pl.id===data.fromUuid);if(!p)return;p.status='away';if(!t.done&&t.phase!=='lobby'){if(t.currentIdx===t.players.indexOf(p))hostAct(tid,data.fromUuid,'fold',0);else hostSync(tid);}return;}
  }

  // ── Render ──
  function renderInto(container){
    _container=container;injectCSS();container.innerHTML='';
    const tabs=[['table','🃏 Tables'],['scores','🏆 Scores']];
    const tabBar=document.createElement('div');tabBar.style.cssText='display:flex;border-bottom:1px solid var(--border)';
    tabs.forEach(([id,label])=>{const btn=document.createElement('button');btn.style.cssText=`flex:1;padding:10px;font-size:.76rem;background:none;border:none;cursor:pointer;color:${_activeTab===id?'var(--accent)':'var(--text-2)'};border-bottom:2px solid ${_activeTab===id?'var(--accent)':'transparent'};font-weight:${_activeTab===id?'700':'400'}`;btn.textContent=label;btn.onclick=()=>{_activeTab=id;rerender();};tabBar.appendChild(btn);});
    container.appendChild(tabBar);const body=document.createElement('div');container.appendChild(body);
    if(_activeTab==='table')renderTables(body);else renderScores(body);
  }
  function renderTables(c){
    const tList=Object.values(tables);
    if(!tList.length){c.innerHTML='<div style="text-align:center;padding:36px 20px;color:var(--text-2);font-size:.8rem;line-height:1.9"><div style="font-size:2.8rem;margin-bottom:10px">🃏</div>Aucune partie.<br><small style="color:var(--text-3)">Ouvrez le profil d\'un pair pour l\'inviter.</small></div>';return;}
    const invites=tList.filter(t=>t._from),active=tList.filter(t=>!t._from&&!t.done),done=tList.filter(t=>!t._from&&t.done);
    [...invites,...active,...done].forEach(t=>{if(t._from)renderInvite(c,t);else if(t.done)renderResult(c,t);else if(t.phase==='lobby')renderLobby(c,t);else renderGame(c,t);});
  }
  function W(c){const w=document.createElement('div');w.style.cssText='border-bottom:1px solid var(--border)';c.appendChild(w);return w;}
  function avH(name,sz=32){const cols=['#00d4aa','#7c4dff','#ff6b35','#00e87a','#f5c842','#ff4f8b'];const cl=cols[(name||'?').charCodeAt(0)%cols.length];return `<div style="width:${sz}px;height:${sz}px;border-radius:50%;flex-shrink:0;background:var(--bg-card);display:flex;align-items:center;justify-content:center;font-size:${sz*.38}px;color:${cl};font-weight:700">${(name||'?')[0].toUpperCase()}</div>`;}
  function renderInvite(c,t){
    const w=W(c);w.style.cssText+='padding:24px;text-align:center';
    w.innerHTML=`<div style="font-size:2rem;margin-bottom:8px">🃏</div><div style="font-size:.9rem;font-weight:700;margin-bottom:5px">${t._from} vous invite</div><div style="font-size:.7rem;color:var(--text-2);margin-bottom:12px">Texas Hold'em · ${t.sb}/${t.bb} · 1000🪙</div>`;
    const row=document.createElement('div');row.style.cssText='display:flex;gap:8px;justify-content:center';
    const yes=document.createElement('button');yes.className='btn-accent';yes.textContent='✔ Accepter';yes.style.flex='1';yes.onclick=()=>{send(t.hostPeerId,{type:'invite_ok',tid:t.tid,fromUuid:me(),to:t.hostId});delete t._from;persist();_YM.toast('🃏 Rejoint !');rerender();};
    const no=document.createElement('button');no.className='btn-secondary';no.textContent='✕ Refuser';no.style.flex='1';no.onclick=()=>{send(t.hostPeerId,{type:'invite_no',tid:t.tid,fromUuid:me(),to:t.hostId});delete tables[t.tid];persist();rerender();};
    row.appendChild(yes);row.appendChild(no);w.appendChild(row);
  }
  function renderLobby(c,t){
    const w=W(c);
    const hdr=document.createElement('div');hdr.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--border);background:rgba(0,0,0,.15)';
    hdr.innerHTML=`<span style="font-family:var(--font-mono);font-size:.8rem;color:var(--accent)">🃏 SALON · ${t.sb}/${t.bb} · ${t.players.length} joueur${t.players.length>1?'s':''}</span>`;
    if(t.isHost){const deal=document.createElement('button');deal.className='btn-accent';deal.style.fontSize='.66rem';deal.textContent='▶ Lancer';deal.onclick=()=>hostDeal(t.tid);hdr.appendChild(deal);}
    w.appendChild(hdr);
    const seats=document.createElement('div');seats.style.cssText='display:flex;flex-wrap:wrap;gap:8px;padding:14px;justify-content:center';
    t.players.forEach(p=>{const isMe=p.id===me();const seat=document.createElement('div');seat.style.cssText=`display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 8px;min-width:60px;background:var(--bg-card);border:1.5px solid ${isMe?'var(--accent)':'var(--border)'};border-radius:12px`;seat.innerHTML=`${avH(p.name,36)}<div style="font-size:.62rem;font-weight:700;color:${isMe?'var(--accent)':'var(--text-1)'};max-width:64px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${isMe?'Moi':p.name}</div><div style="font-size:.56rem;font-family:var(--font-mono);color:var(--text-2)">${p.chips}🪙</div>`;seats.appendChild(seat);});
    w.appendChild(seats);
    const hint=document.createElement('div');hint.style.cssText='text-align:center;font-size:.62rem;color:var(--text-3);padding:0 14px 14px;line-height:1.6';hint.textContent=t.isHost?'Invitez des pairs via leur profil · 2–8 joueurs':'En attente que l\'hôte lance la partie…';w.appendChild(hint);
  }
  function renderGame(c,t){
    const w=W(c);const myP=t.players.find(p=>p.id===me());const rem=timerRem(t.tid);
    const PH=['preflop','flop','turn','river'];const pL={preflop:'Pré-flop',flop:'Flop',turn:'Turn',river:'River'};
    const top=document.createElement('div');top.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:6px 12px;border-bottom:1px solid var(--border);background:rgba(0,0,0,.15)';
    top.innerHTML=`<div style="display:flex;gap:2px">${PH.map(p=>`<span style="font-size:.56rem;font-family:var(--font-mono);padding:2px 6px;border-radius:4px;background:${t.phase===p?'rgba(0,212,170,.15)':'transparent'};color:${t.phase===p?'var(--accent)':'var(--text-3)'}">${pL[p]}</span>`).join('')}</div><span style="font-family:var(--font-mono);font-size:.78rem;color:#ff6b35">Pot ${t.pot}🪙</span>`;
    w.appendChild(top);
    // Timer bar
    const timerWrap=document.createElement('div');timerWrap.style.cssText='height:3px;background:var(--border)';
    const pct=Math.round(rem/TURN_TIMEOUT*100);const tc=pct>50?'var(--accent)':pct>20?'#f5c842':'#ff6b35';
    const timerFill=document.createElement('div');timerFill.style.cssText=`height:100%;width:${pct}%;background:${tc};transition:width .9s linear`;
    timerWrap.appendChild(timerFill);w.appendChild(timerWrap);
    // Players
    const prow=document.createElement('div');prow.style.cssText='display:flex;flex-wrap:wrap;gap:4px;justify-content:center;padding:8px 6px 4px';
    t.players.forEach((p,i)=>{const isMe=p.id===me(),isCur=i===t.currentIdx,isD=i===t.dealerIdx;const chip=document.createElement('div');chip.style.cssText=`display:flex;flex-direction:column;align-items:center;gap:2px;min-width:50px;padding:5px 4px;border-radius:9px;border:1.5px solid ${isCur?'var(--accent)':isMe?'rgba(0,212,170,.25)':'transparent'};background:${isCur?'rgba(0,212,170,.06)':'transparent'};opacity:${p.status==='fold'?.4:1}`;chip.innerHTML=`<div style="position:relative">${avH(p.name,28)}${isD?'<div style="position:absolute;bottom:-3px;right:-3px;background:#f5c842;color:#000;font-size:.4rem;font-weight:900;border-radius:50%;width:12px;height:12px;display:flex;align-items:center;justify-content:center">D</div>':''}</div><div style="font-size:.52rem;font-weight:700;color:${isMe?'var(--accent)':'var(--text-1)'};max-width:52px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${isMe?'Moi':p.name}</div><div style="font-size:.5rem;font-family:var(--font-mono);color:var(--text-2)">${p.chips}🪙</div>${p.bet>0?`<div style="font-size:.48rem;color:#ff6b35">${p.bet}🪙</div>`:''}<div style="font-size:.44rem;color:${isCur?'#ff6b35':'var(--text-3)'}">${p.status==='fold'?'couché':p.status==='allin'?'ALL-IN':isCur?'▶ '+rem+'s':''}</div>`;prow.appendChild(chip);});
    w.appendChild(prow);
    // Community
    const comm=document.createElement('div');comm.style.cssText='display:flex;gap:4px;justify-content:center;padding:8px;background:rgba(0,212,170,.03);border-radius:10px;margin:2px 8px 4px';
    for(let i=0;i<5;i++){const el=document.createElement('div');el.innerHTML=t.community[i]?cardHtml(t.community[i]):'<div class="pk-c empty"></div>';comm.appendChild(el);}
    w.appendChild(comm);
    // My hand
    const hw=document.createElement('div');hw.style.cssText='display:flex;flex-direction:column;align-items:center;gap:5px;padding:6px 8px';
    const hl=document.createElement('div');hl.style.cssText='font-size:.56rem;font-family:var(--font-mono);color:var(--text-3);text-transform:uppercase';hl.textContent=myP?.status==='fold'?'Couché':'Mes cartes';
    const mc=document.createElement('div');mc.style.cssText='display:flex;gap:5px';
    if(t.myHand?.length===2){mc.innerHTML=cardHtml(t.myHand[0])+cardHtml(t.myHand[1]);if(t.community.length>=3){const best=evalBest([...t.myHand,...t.community]);const hn=document.createElement('div');hn.style.cssText='font-size:.66rem;font-family:var(--font-mono);color:var(--accent);padding:3px 10px;background:rgba(0,212,170,.08);border-radius:6px;border:1px solid rgba(0,212,170,.2)';hn.textContent='✦ '+best.name;hw.appendChild(hl);hw.appendChild(mc);hw.appendChild(hn);w.appendChild(hw);renderActions(w,t,myP);return;}}
    else{mc.innerHTML=cardHtml(null,true)+cardHtml(null,true);}
    hw.appendChild(hl);hw.appendChild(mc);w.appendChild(hw);renderActions(w,t,myP);
  }
  function renderActions(c,t,myP){
    const isCurMe=t.players[t.currentIdx]?.id===me();
    if(!myP||myP.status!=='active'||!isCurMe){
      const w=document.createElement('div');w.style.cssText='text-align:center;padding:10px;font-size:.7rem;color:var(--text-3);font-family:var(--font-mono)';
      if(myP?.status==='fold')w.textContent='Couché';else if(myP?.status==='allin')w.textContent='All-in — en attente…';else w.textContent='⌛ Tour de '+(t.players[t.currentIdx]?.name||'?');
      c.appendChild(w);return;
    }
    const toCall=Math.min(t.roundBet-myP.bet,myP.chips);const canCheck=myP.bet>=t.roundBet;
    const wrap=document.createElement('div');wrap.style.cssText='padding:8px 10px 10px;border-top:1px solid var(--border)';
    const r1=document.createElement('div');r1.style.cssText='display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-bottom:7px';
    const fold=document.createElement('button');fold.className='btn-secondary';fold.style.fontSize='.68rem';fold.textContent='🏳 Coucher';fold.onclick=()=>doAct(t,'fold');
    if(canCheck){const ck=document.createElement('button');ck.className='btn-accent';ck.style.fontSize='.68rem';ck.textContent='✔ Checker';ck.onclick=()=>doAct(t,'check');r1.appendChild(fold);r1.appendChild(ck);}
    else{const cl=document.createElement('button');cl.className='btn-accent';cl.style.fontSize='.68rem';cl.textContent='📞 Suivre +'+toCall+'🪙';cl.onclick=()=>doAct(t,'call');r1.appendChild(fold);r1.appendChild(cl);}
    wrap.appendChild(r1);
    const r2=document.createElement('div');r2.style.cssText='display:flex;gap:6px;align-items:center;justify-content:center';
    const inp=document.createElement('input');inp.type='number';inp.style.cssText='width:76px;text-align:center;padding:5px 8px;font-family:var(--font-mono);background:var(--bg-card);border:1px solid var(--border);border-radius:8px;color:var(--text-1)';inp.min=t.roundBet+t.bb;inp.max=myP.chips;inp.step=t.bb;inp.value=Math.min(t.roundBet+t.bb,myP.chips);
    const raise=document.createElement('button');raise.className='btn-secondary';raise.style.fontSize='.68rem';raise.textContent='🔺 Relancer';raise.onclick=()=>doAct(t,'raise',+inp.value||t.roundBet+t.bb);
    const allin=document.createElement('button');allin.className='btn-secondary';allin.style.cssText='font-size:.68rem;color:#ff6b35;border-color:#ff6b35';allin.textContent='♠ All-in';allin.onclick=()=>doAct(t,'allin',myP.chips);
    r2.appendChild(inp);r2.appendChild(raise);r2.appendChild(allin);wrap.appendChild(r2);c.appendChild(wrap);
  }
  function doAct(t,action,amount){
    clearTurnTimer(t.tid);
    if(t.isHost){hostAct(t.tid,me(),action,amount||0);}
    else{
      send(t.hostPeerId,{type:'action',tid:t.tid,action,amount:amount||0,fromUuid:me(),to:t.hostId});
      const myP=t.players.find(p=>p.id===me());
      if(myP){if(action==='fold')myP.status='fold';else if(action==='call'){const x=Math.min(t.roundBet-myP.bet,myP.chips);myP.chips-=x;myP.bet+=x;if(!myP.chips)myP.status='allin';}else if(action==='raise'){const x=Math.min((amount||t.roundBet+t.bb)-myP.bet,myP.chips);myP.chips-=x;myP.bet+=x;if(!myP.chips)myP.status='allin';}else if(action==='allin'){myP.chips=0;myP.bet+=amount||0;myP.status='allin';}myP.hasActed=true;}
      persist();rerender();
    }
  }
  function renderResult(c,t){
    const res=t.result;if(!res){c.appendChild(document.createTextNode('⌛ Résultat…'));return;}
    const isWin=res.winner===me();const w=W(c);
    const hdr=document.createElement('div');hdr.style.cssText='text-align:center;padding:16px 14px 8px';
    hdr.innerHTML=`<div style="font-size:2rem;margin-bottom:6px">${isWin?'🏆':'🃏'}</div><div style="font-size:.98rem;font-weight:700;color:${isWin?'var(--accent)':'var(--text-1)'}">${isWin?'Vous avez gagné !':(res.winnerName||'Pair')+' gagne'}</div><div style="font-size:.72rem;font-family:var(--font-mono);color:#ff6b35;margin-top:3px">Pot : ${res.pot}🪙</div>`;
    w.appendChild(hdr);
    if(t.community?.length){const comm=document.createElement('div');comm.style.cssText='display:flex;gap:4px;justify-content:center;margin:0 8px 10px';t.community.forEach(card=>{const el=document.createElement('div');el.innerHTML=cardHtml(card);comm.appendChild(el);});w.appendChild(comm);}
    if(res.results){const rl=document.createElement('div');rl.style.cssText='padding:0 8px';res.results.forEach(r=>{const isW=r.id===res.winner;const row=document.createElement('div');row.style.cssText=`display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:9px;margin-bottom:4px;background:${isW?'rgba(0,212,170,.06)':'var(--bg-card)'};border:1px solid ${isW?'rgba(0,212,170,.22)':'var(--border)'}`;row.innerHTML=`${avH(r.name,26)}<div style="flex:1;min-width:0"><div style="font-size:.72rem;font-weight:700;color:${isW?'var(--accent)':'var(--text-1)'}">${r.id===me()?'Moi':r.name}${isW?' 🏆':''}</div><div style="font-size:.62rem;color:var(--accent);font-family:var(--font-mono)">${r.handName||'—'}</div></div><div style="display:flex;gap:3px">${(r.hand||[]).map(card=>cardHtml(card)).join('')}</div>`;rl.appendChild(row);});w.appendChild(rl);}
    const btns=document.createElement('div');btns.style.cssText='padding:12px 8px 14px;display:flex;flex-direction:column;gap:8px';
    if(t.isHost){const newH=document.createElement('button');newH.className='btn-accent';newH.style.width='100%';newH.textContent='🔄 Nouvelle main';newH.onclick=()=>hostDeal(t.tid);btns.appendChild(newH);}
    else{const msg=document.createElement('div');msg.style.cssText='font-size:.66rem;color:var(--text-3);font-family:var(--font-mono);text-align:center;padding:6px 0';msg.textContent='⌛ L\'hôte lance la prochaine main…';btns.appendChild(msg);}
    const leave=document.createElement('button');leave.className='btn-secondary';leave.style.width='100%';leave.textContent='🚪 Quitter la table';
    leave.onclick=()=>{clearTurnTimer(t.tid);if(t.isHost)sendAll(t.tid,{type:'kick',tid:t.tid});else send(t.hostPeerId,{type:'leave',tid:t.tid,fromUuid:me(),to:t.hostId});delete tables[t.tid];persist();rerender();};
    btns.appendChild(leave);w.appendChild(btns);
  }
  function renderScores(c){
    const wins=store('wins')||0,losses=store('losses')||0;const total=wins+losses;
    if(!total){c.innerHTML='<div style="text-align:center;padding:36px 20px;color:var(--text-2);font-size:.8rem"><div style="font-size:2rem;opacity:.2;margin-bottom:8px">🏆</div>Jouez votre première partie !</div>';return;}
    const sb=document.createElement('div');sb.style.cssText='display:flex;border-bottom:1px solid var(--border)';
    [['🏆',wins,'Victoires','var(--accent)'],['😔',losses,'Défaites','#ff6b35']].forEach(([ico,n,lbl,col],i)=>{const cell=document.createElement('div');cell.style.cssText=`flex:1;display:flex;flex-direction:column;align-items:center;gap:1px;padding:16px 4px;${i===0?'border-right:1px solid var(--border)':''}`;cell.innerHTML=`<span style="font-size:1rem">${ico}</span><strong style="font-size:1.5rem;color:${col};font-family:var(--font-mono)">${n}</strong><span style="font-size:.56rem;color:var(--text-2)">${lbl}</span>`;sb.appendChild(cell);});
    c.appendChild(sb);
    const hist=store('history')||[];
    if(hist.length){const lbl=document.createElement('div');lbl.style.cssText='font-size:.62rem;color:var(--text-2);text-transform:uppercase;letter-spacing:.05em;padding:8px 14px 4px';lbl.textContent='Dernières parties';c.appendChild(lbl);hist.slice(0,10).forEach(h=>{const isW=h.result==='win';const row=document.createElement('div');row.style.cssText='display:flex;align-items:center;gap:8px;padding:5px 14px;border-bottom:1px solid var(--border)';row.innerHTML=`<span style="font-size:.9rem">${isW?'🏆':'😔'}</span><div style="flex:1"><div style="font-size:.72rem;font-weight:700;color:${isW?'var(--accent)':'#ff6b35'}">${isW?'Victoire':'Défaite'}</div><div style="font-size:.6rem;color:var(--text-2)">vs ${(h.opponents||[]).join(', ')||'Pair'} · ${h.pot}🪙</div></div><span style="font-size:.58rem;color:var(--text-3)">${new Date(h.ts).toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'})}</span>`;c.appendChild(row);});}
    const rst=document.createElement('button');rst.className='btn-secondary';rst.style.cssText='font-size:.65rem;margin:10px 14px;width:calc(100% - 28px)';rst.textContent='↺ Remettre à zéro';rst.onclick=()=>{if(confirm('Remettre à zéro ?')){['wins','losses','history'].forEach(k=>localStorage.removeItem(KEY+k));rerender();}};c.appendChild(rst);
  }

  return {
    name:'jeux.poker',icon:'🃏',description:'Texas Hold\'em Poker P2P multi-table.',
    init(YM){_YM=YM;if(YM.onData)YM.onData(ID,onMsg);},
    render(container,YM){_YM=YM;if(!_hubBound){YM.onHub(onMsg);_hubBound=true;}if(YM.onData)YM.onData(ID,onMsg);_activeTab='table';restore();renderInto(container);},
    couple(peerId,container,YM){
      _YM=YM;if(!_hubBound){YM.onHub(onMsg);_hubBound=true;}if(YM.onData)YM.onData(ID,onMsg);
      const peerEntry=YM.nearPeers?.find(e=>e.peerId===peerId);
      const peerUuid=peerEntry?.uuid||YM.peers.find(p=>p.peerId===peerId)?.uuid;
      const pn=peerEntry?.profile?.name||YM.peers.find(p=>p.peerId===peerId)?.name||'Pair';
      const activeGame=Object.values(tables).find(g=>!g.done&&g.phase!=='lobby'&&g.players.some(p=>p.id===peerUuid));
      const inLobby=Object.values(tables).find(g=>!g.done&&g.phase==='lobby'&&g.players.some(p=>p.id===peerUuid));
      if(activeGame){const info=document.createElement('div');info.style.cssText='text-align:center;padding:8px 0;font-size:.72rem;color:var(--text-2)';info.textContent=activeGame.players[activeGame.currentIdx]?.id===me()?'⌛ Votre tour !':'💬 Tour de '+(activeGame.players[activeGame.currentIdx]?.name||'?');container.appendChild(info);return;}
      if(inLobby&&inLobby.isHost){const note=document.createElement('div');note.style.cssText='font-size:.66rem;color:var(--text-2);font-family:var(--font-mono);padding:6px 0;text-align:center;margin-bottom:8px';note.textContent='⌛ Salon en attente ('+inLobby.players.length+' joueur'+(inLobby.players.length>1?'s':'')+')';container.appendChild(note);return;}
      const lobbyTable=findLobbyTable();const card=document.createElement('div');card.style.cssText='background:linear-gradient(135deg,rgba(124,77,255,.1),rgba(0,212,170,.07));border:1px solid rgba(124,77,255,.3);border-radius:12px;padding:14px 16px;text-align:center';card.innerHTML=`<div style="font-size:.62rem;color:var(--accent);font-family:var(--font-mono);text-transform:uppercase;letter-spacing:.8px;margin-bottom:5px">🃏 POKER</div><div style="font-size:.76rem;color:var(--text-2);margin-bottom:12px">Texas Hold'em · 10/20 · 1000🪙</div>`;const btn=document.createElement('button');btn.className='btn-accent';btn.textContent=lobbyTable?'🃏 Inviter à la table ('+lobbyTable.players.length+' joueur'+(lobbyTable.players.length>1?'s':'')+')'  :'🃏 Inviter à jouer';btn.style.width='100%';btn.onclick=()=>{invitePeer(peerUuid,peerId);btn.textContent='✓ Invité !';btn.disabled=true;};card.appendChild(btn);container.appendChild(card);
    },
    destroy(){for(const[tid,t] of Object.entries(tables)){clearTurnTimer(tid);if(t.isHost)sendAll(tid,{type:'kick',tid});else if(t.hostPeerId)send(t.hostPeerId,{type:'leave',tid,fromUuid:me(),to:t.hostId});}},
  };
})();
