/* jshint esversion:11, browser:true */
// towerdefense.sphere.js — Tower Defense v8
// Solo : base v6 qui marchait (vagues auto, shop HTML inter-vagues, icônes 2 rangées en bas)
// VS   : 2 terminaux, invitation profil/YM_Social, brouillard de guerre, switch vue
// Sync VS : seulement les événements (spawn attaquants, vies perdues) via YM_Social.sendGameMsg
(function () {
  'use strict';
  window.YM_S = window.YM_S || {};

  const SCORES_KEY = 'ym_td_scores_v8';
  function loadScores() { try { return JSON.parse(localStorage.getItem(SCORES_KEY)||'[]'); } catch(e){return[];} }
  function saveScore(s) { const a=loadScores(); a.unshift(s); localStorage.setItem(SCORES_KEY,JSON.stringify(a.slice(0,20))); }

  let _ctx=null, _game=null;
  let _stopMenuPoll=null;
  let _myTowersBroadcast=[]; // tours locales exposées via broadcastData() pour vue espion adverse

  function _launchGame(container, launchFn){
    // Stopper le poll du menu avant de lancer le jeu
    if(_stopMenuPoll){_stopMenuPoll();_stopMenuPoll=null;}
    launchFn();
  }

  // ── TOURS ──────────────────────────────────────────────────────────────────
  const TOWER_DEFS = {
    archer: {cost:50,  range:90,  dmg:16,  rate:800,  col:0x3b82f6,name:'Archer', emoji:'🏹',cat:'basic',
      desc:'Rapide, mono-cible. Bon départ.',
      upg:[{cost:60,dmg:26,label:'Pointes de fer'},{cost:110,dmg:44,rate:650,label:'Arc composé'},{cost:200,dmg:80,rate:500,range:110,label:'Maître archer'}]},
    rapid:  {cost:75,  range:72,  dmg:8,   rate:240,  col:0x10b981,name:'Gatling',emoji:'⚡',cat:'basic',
      desc:'Ultra-rapide, faible dégât. DPS élevé.',
      upg:[{cost:70,dmg:13,rate:190,label:'Huilé'},{cost:130,dmg:20,rate:150,label:'Overclocké'},{cost:240,dmg:32,rate:110,range:85,label:'Minigun'}]},
    sniper: {cost:110, range:220, dmg:75,  rate:2000, col:0x8b5cf6,name:'Sniper', emoji:'🎯',cat:'basic',
      desc:'Longue portée & gros dégâts. Très lent.',
      upg:[{cost:90,dmg:125,rate:1700,label:'Lunette+'},{cost:160,dmg:200,rate:1400,label:'Anti-matériel'},{cost:300,dmg:360,rate:1100,range:260,label:'Rail Gun'}]},
    frost:  {cost:85,  range:100, dmg:7,   rate:700,  col:0x38bdf8,name:'Frost',  emoji:'❄️',cat:'support',slow:0.40,
      desc:'Ralentit les ennemis.',
      upg:[{cost:75,slow:0.20,range:120,label:'Gel profond'},{cost:140,dmg:14,slow:0.12,rate:550,label:'Blizzard'},{cost:260,dmg:22,slow:0.05,range:140,rate:400,label:'Zéro absolu'}]},
    cannon: {cost:130, range:110, dmg:100, rate:2600, col:0xef4444,name:'Canon',  emoji:'💣',cat:'heavy',splash:70,
      desc:'Dégâts de zone. Dévastateur en groupe.',
      upg:[{cost:100,dmg:160,splash:90,label:'Obus explosif'},{cost:190,dmg:260,splash:120,label:'Cluster'},{cost:350,dmg:420,splash:160,rate:2000,label:'Thermobarique'}]},
    poison: {cost:90,  range:95,  dmg:5,   rate:560,  col:0xa3e635,name:'Poison', emoji:'☠️',cat:'dot',poison:true,
      desc:'DoT venimeux. Se cumule.',
      upg:[{cost:80,dmg:8,rate:440,label:'Neurotoxine'},{cost:145,dmg:14,rate:340,range:115,label:'Plague'},{cost:270,dmg:22,rate:260,range:135,label:'Biohazard'}]},
    tesla:  {cost:150, range:125, dmg:50,  rate:1400, col:0xfacc15,name:'Tesla',  emoji:'⚡',cat:'special',chain:3,
      desc:'Foudre en chaîne sur plusieurs ennemis.',
      upg:[{cost:120,dmg:75,chain:4,label:'Superconducteur'},{cost:220,dmg:115,chain:5,range:145,label:'Tempête'},{cost:400,dmg:180,chain:7,range:165,rate:1000,label:'Dieu de la foudre'}]},
    mortar: {cost:160, range:180, dmg:140, rate:3500, col:0xf97316,name:'Mortier',emoji:'🔥',cat:'heavy',splash:110,minRange:60,
      desc:'AoE longue portée. Zone aveugle proche.',
      upg:[{cost:140,dmg:220,splash:130,label:'Phosphore blanc'},{cost:260,dmg:340,splash:160,rate:2800,label:'Incendiaire'},{cost:480,dmg:550,splash:200,rate:2200,label:'Daisy Cutter'}]},
    laser:  {cost:200, range:150, dmg:35,  rate:120,  col:0xf43f5e,name:'Laser',  emoji:'🔴',cat:'special',pierce:true,
      desc:'Perce tous les ennemis en ligne.',
      upg:[{cost:180,dmg:55,rate:100,label:'Faisceau focalisé'},{cost:320,dmg:90,rate:80,range:170,label:'Laser X'},{cost:580,dmg:150,rate:60,range:200,label:'Étoile de la mort'}]},
    cryo:   {cost:140, range:115, dmg:30,  rate:1200, col:0x67e8f9,name:'Cryo',   emoji:'🧊',cat:'support',freeze:true,
      desc:'Gèle les ennemis 1.5s.',
      upg:[{cost:120,range:135,label:'Gel profond'},{cost:220,dmg:55,range:155,label:'Cryostase'},{cost:400,dmg:90,range:175,rate:900,label:'Zéro absolu'}]},
    flame:  {cost:120, range:80,  dmg:22,  rate:300,  col:0xff6b35,name:'Flamer', emoji:'🌋',cat:'dot',burn:true,
      desc:'Brûle les ennemis. Cône de dégâts.',
      upg:[{cost:100,dmg:36,range:95,label:'Napalm'},{cost:190,dmg:60,rate:240,range:115,label:'Souffle de dragon'},{cost:360,dmg:100,rate:180,range:140,label:'Enfer'}]},
    vortex: {cost:180, range:130, dmg:20,  rate:1800, col:0xc026d3,name:'Vortex', emoji:'🌀',cat:'special',pull:true,
      desc:'Attire les ennemis pour les regrouper.',
      upg:[{cost:160,range:155,dmg:35,label:'Puits de gravité'},{cost:290,range:180,dmg:60,rate:1400,label:'Trou noir'},{cost:520,range:210,dmg:100,rate:1000,label:'Singularité'}]},
  };

  // ── ATTAQUANTS (mode VS) ────────────────────────────────────────────────────
  const ATTACKER_DEFS = {
    grunt:   {cost:20,  hp:35,  spd:55, reward:8,  col:'#ef4444',name:'Grunt',    emoji:'👊',size:9,  desc:'Basique bon marché'},
    fast:    {cost:30,  hp:20,  spd:120,reward:10, col:'#fbbf24',name:'Dasher',   emoji:'💨',size:8,  desc:'Très rapide'},
    tank:    {cost:80,  hp:320, spd:28, reward:40, col:'#6366f1',name:'Tank',     emoji:'🛡',size:14, desc:'Très résistant',armor:0.25},
    swarm:   {cost:15,  hp:10,  spd:85, reward:3,  col:'#84cc16',name:'Swarm×3',  emoji:'🐝',size:6,  desc:'Envoyé par 3',count:3},
    stealth: {cost:55,  hp:70,  spd:75, reward:28, col:'#475569',name:'Fantôme',  emoji:'👻',size:8,  desc:'Furtif',stealth:true},
    healer:  {cost:90,  hp:90,  spd:48, reward:35, col:'#34d399',name:'Médecin',  emoji:'💚',size:10, desc:'Soigne les alliés',heals:true},
    armored: {cost:70,  hp:170, spd:40, reward:32, col:'#94a3b8',name:'Cuirassé', emoji:'⚙️',size:12, desc:'45% armure',armor:0.45},
    boss:    {cost:200, hp:900, spd:20, reward:100,col:'#7c3aed',name:'TITAN',    emoji:'💀',size:18, desc:'Boss massif',armor:0.30,boss:true},
  };

  // ── ENNEMIS SOLO (vagues auto) ──────────────────────────────────────────────
  const ENEMY_TYPES = {
    grunt:    {hp:30,  spd:50, rew:10,col:'#ef4444',shape:'circle', name:'Grunt',   size:9},
    fast:     {hp:18,  spd:110,rew:12,col:'#fbbf24',shape:'diamond',name:'Dasher',  size:8},
    tank:     {hp:280, spd:30, rew:35,col:'#6366f1',shape:'hex',    name:'Tank',    size:14,armor:0.25},
    swarm:    {hp:8,   spd:80, rew:4, col:'#84cc16',shape:'circle', name:'Swarm',   size:6},
    armored:  {hp:150, spd:42, rew:28,col:'#94a3b8',shape:'hex',    name:'Armored', size:12,armor:0.45},
    flyer:    {hp:55,  spd:90, rew:18,col:'#e879f9',shape:'diamond',name:'Flyer',   size:8, flying:true},
    healer:   {hp:80,  spd:45, rew:30,col:'#34d399',shape:'circle', name:'Healer',  size:10,heals:true},
    splitter: {hp:120, spd:38, rew:22,col:'#fb923c',shape:'circle', name:'Splitter',size:11,splits:true},
    stealth:  {hp:65,  spd:72, rew:25,col:'#475569',shape:'diamond',name:'Phantom', size:8, stealth:true},
    berserker:{hp:200, spd:28, rew:32,col:'#dc2626',shape:'hex',    name:'Berseker',size:13,rages:true},
    titan:    {hp:800, spd:22, rew:80,col:'#7c3aed',shape:'hex',    name:'Titan',   size:18,armor:0.35,boss:true},
    overlord: {hp:3500,spd:18, rew:300,col:'#ff0000',shape:'diamond',name:'Overlord',size:22,armor:0.20,boss:true},
  };

  const WAVE_SCRIPT = [
    {squads:[{type:'grunt',count:8,delay:600}],inter:7000},
    {squads:[{type:'grunt',count:10,delay:500},{type:'fast',count:4,delay:400,offset:3000}],inter:7000},
    {squads:[{type:'grunt',count:8,delay:500},{type:'swarm',count:20,delay:200,offset:2000}],inter:8000},
    {squads:[{type:'tank',count:2,delay:2000},{type:'grunt',count:10,delay:400,offset:2000}],inter:8000},
    {squads:[{type:'fast',count:12,delay:300},{type:'armored',count:3,delay:1500,offset:3000}],inter:9000},
    {squads:[{type:'swarm',count:30,delay:180},{type:'fast',count:8,delay:350,offset:4000}],inter:9000},
    {squads:[{type:'titan',count:1,delay:5000}],inter:10000,bossWave:true},
    {squads:[{type:'flyer',count:10,delay:400},{type:'stealth',count:6,delay:600,offset:2500}],inter:9000},
    {squads:[{type:'healer',count:4,delay:1200},{type:'grunt',count:15,delay:400,offset:1000}],inter:10000},
    {squads:[{type:'splitter',count:6,delay:900},{type:'armored',count:5,delay:1000,offset:2000}],inter:10000},
    {squads:[{type:'berserker',count:4,delay:1400},{type:'fast',count:14,delay:300,offset:1500}],inter:11000},
    {squads:[{type:'swarm',count:40,delay:150},{type:'tank',count:3,delay:2000,offset:5000}],inter:11000},
    {squads:[{type:'stealth',count:12,delay:500},{type:'healer',count:5,delay:1000,offset:2000}],inter:11000},
    {squads:[{type:'overlord',count:1,delay:8000}],inter:14000,bossWave:true},
    {squads:[{type:'flyer',count:16,delay:300},{type:'berserker',count:5,delay:1200,offset:3000}],inter:12000},
    {squads:[{type:'armored',count:10,delay:700},{type:'splitter',count:8,delay:800,offset:3000}],inter:12000},
    {squads:[{type:'swarm',count:50,delay:130},{type:'titan',count:2,delay:5000,offset:6000}],inter:14000,bossWave:true},
    {squads:[{type:'stealth',count:16,delay:400},{type:'healer',count:8,delay:800,offset:2000},{type:'fast',count:20,delay:250,offset:5000}],inter:14000},
    {squads:[{type:'berserker',count:10,delay:800},{type:'armored',count:12,delay:700,offset:3000},{type:'splitter',count:10,delay:600,offset:7000}],inter:16000},
    {squads:[{type:'overlord',count:2,delay:7000},{type:'titan',count:3,delay:4000,offset:8000},{type:'swarm',count:30,delay:150,offset:2000}],inter:0,bossWave:true},
  ];

  // Les upgrades sont RÉPÉTABLES — coût augmente de 60% à chaque achat
  // purchasedUpgrades stocke maintenant le nombre de fois acheté : {id: count}
  const GLOBAL_UPGRADES = [
    {id:'dmg_all',    name:'Académie',     emoji:'⚔️', cost:200, desc:'Toutes tours +15% dégâts',       effect:{dmgMult:0.15}},
    {id:'range_all',  name:'Optique',      emoji:'🔭', cost:150, desc:'Toutes tours +12% portée',        effect:{rangeMult:0.12}},
    {id:'rate_all',   name:'Logistique',   emoji:'📦', cost:180, desc:'Toutes tours -10% délai de tir',  effect:{rateMult:-0.10}},
    {id:'gold_mine',  name:'Mine d\'or',   emoji:'⛏️', cost:300, desc:'+5 or par kill',                 effect:{goldBonus:5}},
    {id:'lives_up',   name:'Corps médical',emoji:'💊', cost:250, desc:'+5 vies',                         effect:{livesBonus:5}},
    {id:'interest',   name:'Banque',       emoji:'🏦', cost:400, desc:'+2% intérêts sur l\'or/vague',   effect:{interest:0.02}},
    {id:'detect',     name:'Radar',        emoji:'📡', cost:200, desc:'Toutes tours détectent le furtif',effect:{detectStealth:true}, unique:true},
    {id:'splash_all', name:'Démolitions',  emoji:'💥', cost:280, desc:'Tours splash +30% rayon',         effect:{splashMult:0.30}},
    {id:'chain_all',  name:'Conducteur',   emoji:'🌩️', cost:260, desc:'Tesla +2 cibles en chaîne',      effect:{chainBonus:2}},
    {id:'slow_boost', name:'Cryogénie',    emoji:'🌡️', cost:220, desc:'Tours Frost/Cryo +20% ralent.',  effect:{slowBoost:0.20}},
    {id:'dmg_crit',   name:'Artillerie',   emoji:'🎯', cost:320, desc:'Toutes tours +20% dégâts (bis)',  effect:{dmgMult:0.20}},
    {id:'gold2',      name:'Commerce',     emoji:'💹', cost:350, desc:'+8 or par kill (bis)',             effect:{goldBonus:8}},
  ];

  // ── VS : état session ───────────────────────────────────────────────────────
  // Clé localStorage pour session VS en cours
  const VS_SESSION_KEY='ym_td_vs_session';
  function getVSSession(){try{return JSON.parse(localStorage.getItem(VS_SESSION_KEY)||'null');}catch{return null;}}
  function setVSSession(s){if(s)localStorage.setItem(VS_SESSION_KEY,JSON.stringify(s));else localStorage.removeItem(VS_SESSION_KEY);}

  // ── INVITATION VS ──────────────────────────────────────────────────────────
  // Mécanisme correct YourMine :
  // L'invitant expose td_invite via broadcastData() → inclus dans social:presence heartbeat
  // Le receveur le lit depuis _nearUsers.get(uuid).profile.td_invite (mis à jour en temps réel)
  // Pas d'API réseau custom — utilise l'infra existante de social.sphere.js

  function _myUUID(){
    const p=window.YM&&window.YM.getProfile&&window.YM.getProfile();
    return (p&&p.uuid)||null;
  }
  function _myName(){
    const p=window.YM&&window.YM.getProfile&&window.YM.getProfile();
    return (p&&p.name)||'Joueur';
  }

  // L'invite en cours à broadcaster (lu par broadcastData())
  let _currentInviteBroadcast=null;

  // broadcastData() est appelé par social.sphere.js dans buildProfilePacket()
  // → le champ td_invite arrive dans le profil broadcasté à tous les peers
  function broadcastData(){
    const out={};
    if(_currentInviteBroadcast) out.td_invite=_currentInviteBroadcast;
    // Exposer les tours pour la vue espion adverse (lues via _nearUsers.profile.td_towers)
    if(typeof _myTowersBroadcast!=='undefined'&&_myTowersBroadcast.length)
      out.td_towers=_myTowersBroadcast;
    return out;
  }

  // Lire une invitation destinée à moi dans le profil d'un near user
  // peerProfile = _nearUsers.get(uuid).profile (mis à jour à chaque heartbeat)
  function _readInviteFromProfile(peerProfile){
    const inv=peerProfile&&peerProfile.td_invite;
    if(!inv) return null;
    const myId=_myUUID();
    if(myId&&inv.toUUID!==myId) return null; // pas pour moi
    if(Date.now()-inv.ts>3600000) return null; // expirée 1h
    return inv;
  }

  // Invitation acceptée → stockée localement pour renderModeSelect
  function _checkPendingInvite(){
    try{const v=localStorage.getItem('ym_td_pending_invite');if(v){const inv=JSON.parse(v);if(Date.now()-inv.ts<3600000)return inv;}}catch{}
    return null;
  }
  function _storePendingInvite(inv){localStorage.setItem('ym_td_pending_invite',JSON.stringify({...inv,ts:inv.ts||Date.now()}));}
  function _clearPendingInvite(){localStorage.removeItem('ym_td_pending_invite');}

  function _sendVSInviteTo(opponentUUID, opponentName){
    const gameId='td_'+Date.now()+'_'+Math.random().toString(36).slice(2,7);
    const sess={
      status:'active', role:'host', // hôte est actif immédiatement
      opponentUUID, opponentName, gameId,
      myLives:30, opponentLives:30,
      myAttackers:{}, myGoldDef:200, myGoldAtk:100,
      opponentWaveIdx:0, fogReveal:[],
    };
    setVSSession(sess);
    _currentInviteBroadcast={toUUID:opponentUUID, gameId, fromName:_myName(), ts:Date.now()};
    return sess;
  }

  function _clearInviteFromMyProfile(){
    _currentInviteBroadcast=null;
  }

  function _acceptVSInvite(invite){
    _clearPendingInvite();
    const sess={
      status:'active', role:'guest',
      opponentUUID:invite.fromUUID, opponentName:invite.fromName, gameId:invite.gameId,
      myLives:30, opponentLives:30,
      myAttackers:{}, myGoldDef:200, myGoldAtk:100,
      opponentWaveIdx:0, fogReveal:[],
    };
    setVSSession(sess);
  }

  // ── PANEL PRINCIPAL ────────────────────────────────────────────────────────
  function renderPanel(container){
    container.style.cssText='display:flex;flex-direction:column;height:100%;overflow:hidden;background:#07080e;font-family:monospace';
    container.innerHTML='';

    const gameZone=document.createElement('div');
    gameZone.style.cssText='flex:1;overflow:hidden;min-height:0;position:relative';

    const overlay=document.createElement('div');
    overlay.style.cssText='position:absolute;inset:0;z-index:200;display:none;flex-direction:column;background:#07080e;overflow-y:auto;padding:14px;box-sizing:border-box';
    gameZone.appendChild(overlay);
    container.appendChild(gameZone);

    const tabBar=document.createElement('div');
    tabBar.style.cssText='display:flex;border-top:1px solid rgba(255,255,255,.07);flex-shrink:0;background:#040508';

    const goPlay=()=>{
      overlay.style.display='none';
      tabBar.querySelectorAll('div').forEach((x,i)=>x.style.color=i===0?'#f59e0b':'rgba(255,255,255,.35)');
    };

    [['play','🗼 Jeu'],['scores','🏆 Scores'],['guide','📖 Guide']].forEach(([id,lbl],idx)=>{
      const t=document.createElement('div');
      t.style.cssText=`flex:1;padding:9px 4px;text-align:center;cursor:pointer;font-size:12px;font-weight:600;color:${idx===0?'#f59e0b':'rgba(255,255,255,.35)'}`;
      t.textContent=lbl;
      t.onclick=()=>{
        tabBar.querySelectorAll('div').forEach((x,i)=>x.style.color=i===idx?'#f59e0b':'rgba(255,255,255,.35)');
        if(id==='play'){overlay.style.display='none';}
        else if(id==='scores'){overlay.style.display='flex';overlay.style.flexDirection='column';_renderScoresInto(overlay,()=>{_destroyGame();goPlay();renderModeSelect(gameZone);});}
        else{overlay.style.display='flex';overlay.style.flexDirection='column';_renderGuideInto(overlay);}
      };
      tabBar.appendChild(t);
    });
    container.appendChild(tabBar);

    renderModeSelect(gameZone);
  }

  // ── ÉCRAN DE SÉLECTION DE MODE ─────────────────────────────────────────────
  function renderModeSelect(container){
    // Ne jamais détruire un jeu en cours ici — seulement nettoyer si on revient vraiment au menu
    const sess=getVSSession();
    const pendingInvite=_checkPendingInvite();

    container.innerHTML='';
    container.style.cssText='flex:1;overflow:hidden;position:relative;background:#07080e;display:flex;flex-direction:column';

    const scroll=document.createElement('div');
    scroll.style.cssText='flex:1;overflow-y:auto;padding:14px 12px;box-sizing:border-box;display:flex;flex-direction:column;gap:10px';
    container.appendChild(scroll);

    // Titre
    const titleDiv=document.createElement('div');
    titleDiv.style.cssText='text-align:center;margin-bottom:2px';
    titleDiv.innerHTML='<div style="font-size:28px">🗼</div><div style="font-size:17px;font-weight:900;color:#f59e0b">Tower Defense</div>';
    scroll.appendChild(titleDiv);

    // Animation CSS
    if(!document.getElementById('td-pulse-style')){
      const st=document.createElement('style');
      st.id='td-pulse-style';
      st.textContent='@keyframes tdpulse{from{box-shadow:0 0 0 0 rgba(16,185,129,.4)}to{box-shadow:0 0 0 8px rgba(16,185,129,0)}}';
      document.head.appendChild(st);
    }

    // ── Invitation reçue en attente ──────────────────────────
    if(pendingInvite){
      const inv=document.createElement('button');
      inv.style.cssText='width:100%;padding:11px 14px;background:linear-gradient(135deg,rgba(16,185,129,.14),rgba(16,185,129,.04));border:1.5px solid rgba(16,185,129,.6);border-radius:12px;cursor:pointer;font-family:monospace;text-align:left;animation:tdpulse 1.5s ease-in-out infinite alternate';
      inv.innerHTML=`<div style="font-size:13px;font-weight:700;color:#10b981;margin-bottom:2px">📨 Défi de ${pendingInvite.fromName}</div>
        <div style="font-size:10px;color:rgba(255,255,255,.5)">Tap pour accepter · Tower Defense VS</div>`;
      inv.onclick=()=>{
        _acceptVSInvite(pendingInvite); _clearPendingInvite();
        _launchGame(container,()=>{
          container.style.cssText='flex:1;overflow:hidden;position:relative;background:#07080e';
          container.innerHTML=''; _startVSGame(container,getVSSession());
        });
      };
      scroll.appendChild(inv);
    }

    // ── Partie VS active ─────────────────────────────────────
    if(sess&&sess.status==='active'){
      const res=document.createElement('button');
      res.style.cssText='width:100%;padding:10px 14px;background:rgba(99,102,241,.12);border:1px solid rgba(99,102,241,.4);border-radius:10px;cursor:pointer;font-family:monospace;text-align:left';
      res.innerHTML=`<div style="font-size:12px;font-weight:700;color:#a5b4fc">⟳ Reprendre VS vs ${sess.opponentName||'adversaire'}</div>`;
      res.onclick=()=>_launchGame(container,()=>{container.style.cssText='flex:1;overflow:hidden;position:relative;background:#07080e';container.innerHTML='';_startVSGame(container,sess);});
      scroll.appendChild(res);
    }

    // ── Solo ─────────────────────────────────────────────────
    const soloBtn=document.createElement('button');
    soloBtn.style.cssText='width:100%;padding:13px 14px;background:linear-gradient(135deg,rgba(245,158,11,.12),rgba(245,158,11,.04));border:1.5px solid rgba(245,158,11,.45);border-radius:12px;cursor:pointer;font-family:monospace;text-align:left';
    soloBtn.innerHTML=`<div style="font-size:14px;font-weight:700;color:#f59e0b;margin-bottom:2px">🗡️ Mode Solo</div>
      <div style="font-size:10px;color:rgba(255,255,255,.4)">20 vagues · Boutique inter-vagues · Améliorations globales</div>`;
    soloBtn.onclick=()=>_launchGame(container,()=>{container.style.cssText='flex:1;overflow:hidden;position:relative;background:#07080e';container.innerHTML='';_loadPhaser(()=>renderSoloGame(container));});
    scroll.appendChild(soloBtn);

    // ── VS : liste contacts/near invitables ──────────────────
    const vsTitle=document.createElement('div');
    vsTitle.style.cssText='font-size:10px;font-weight:700;color:rgba(239,68,68,.75);letter-spacing:1px;text-transform:uppercase;margin-top:4px';
    vsTitle.textContent='⚔️ Versus — Défier';
    scroll.appendChild(vsTitle);

    // Construire la liste des pairs disponibles
    function getPeers(){
      const peers=[]; const seen=new Set();
      // Near users — profil mis à jour en temps réel par social:presence heartbeat
      if(window.YM_Social&&window.YM_Social._nearUsers){
        window.YM_Social._nearUsers.forEach((u,uuid)=>{
          if(uuid===_myUUID()||seen.has(uuid))return; seen.add(uuid);
          const profile=u.profile||u;
          peers.push({uuid,name:profile.name||uuid.slice(0,8),near:true,profile});
        });
      }
      // Contacts (snapshot localStorage — pas temps réel, mais utile si pas nearby)
      try{
        JSON.parse(localStorage.getItem('ym_contacts_v1')||'[]').forEach(c=>{
          if(!c.uuid||seen.has(c.uuid)||c.uuid===_myUUID())return; seen.add(c.uuid);
          // Préférer le profil live si disponible
          const liveProfile=window.YM_Social?._nearUsers?.get(c.uuid)?.profile;
          const profile=liveProfile||c.profile||c;
          peers.push({uuid:c.uuid,name:c.nickname||profile.name||c.uuid.slice(0,8),near:false,profile});
        });
      }catch{}
      return peers;
    }

    const peers=getPeers();

    if(!peers.length){
      const empty=document.createElement('div');
      empty.style.cssText='font-size:11px;color:rgba(255,255,255,.3);text-align:center;padding:14px 0;background:rgba(255,255,255,.03);border-radius:10px;border:1px solid rgba(255,255,255,.06)';
      empty.textContent='Aucun contact disponible.\nAjoutez des contacts dans votre profil.';
      scroll.appendChild(empty);
    } else {
      peers.forEach(peer=>{
        const isSent=sess&&sess.opponentUUID===peer.uuid&&sess.status==='waiting';
        const invFromPeer=_readInviteFromProfile(peer.profile);

        const row=document.createElement('div');
        row.style.cssText='display:flex;align-items:center;gap:10px;padding:9px 11px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:10px';

        const av=document.createElement('div');
        av.style.cssText='width:34px;height:34px;border-radius:50%;background:#1a1b2e;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;position:relative';
        av.textContent=(peer.name&&peer.name.charAt(0).toUpperCase())||'?';
        if(peer.near){const d=document.createElement('div');d.style.cssText='position:absolute;bottom:0;right:0;width:8px;height:8px;background:#10b981;border-radius:50%;border:2px solid #07080e';av.appendChild(d);}
        row.appendChild(av);

        const info=document.createElement('div');
        info.style.cssText='flex:1;min-width:0';
        info.innerHTML=`<div style="font-size:12px;font-weight:600;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${peer.name}</div><div style="font-size:9px;color:rgba(255,255,255,.35)">${peer.near?'● Nearby':'Contact'}</div>`;
        row.appendChild(info);

        const act=document.createElement('div');
        if(invFromPeer){
          const b=document.createElement('button');
          b.style.cssText='padding:5px 9px;background:rgba(16,185,129,.2);border:1px solid #10b981;color:#10b981;border-radius:7px;cursor:pointer;font-size:10px;font-weight:700;font-family:monospace;white-space:nowrap';
          b.textContent='✓ Accepter';
          b.onclick=()=>{
            _storePendingInvite({fromUUID:peer.uuid,fromName:peer.name,gameId:invFromPeer.gameId});
            _acceptVSInvite({fromUUID:peer.uuid,fromName:peer.name,gameId:invFromPeer.gameId});
            _launchGame(container,()=>{
              container.style.cssText='flex:1;overflow:hidden;position:relative;background:#07080e';
              container.innerHTML=''; _startVSGame(container,getVSSession());
            });
          };
          act.appendChild(b);
        } else if(isSent){
          // Ne devrait plus arriver (status passe direct à active) mais garder en sécurité
          const w=document.createElement('div');w.style.cssText='display:flex;flex-direction:column;align-items:flex-end;gap:3px';
          const s2=document.createElement('div');s2.style.cssText='font-size:9px;color:#a5b4fc';s2.textContent='▶ En jeu';
          const x=document.createElement('button');x.style.cssText='font-size:9px;color:rgba(239,68,68,.6);background:none;border:none;cursor:pointer;font-family:monospace';x.textContent='Annuler';
          x.onclick=()=>{setVSSession(null);_clearInviteFromMyProfile();renderModeSelect(container);};
          w.appendChild(s2);w.appendChild(x);act.appendChild(w);
        } else {
          const b=document.createElement('button');
          b.style.cssText='padding:5px 9px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.4);color:#ef4444;border-radius:7px;cursor:pointer;font-size:10px;font-weight:700;font-family:monospace;white-space:nowrap';
          b.textContent='⚔️ Défier';
          b.onclick=()=>{
            const newSess=_sendVSInviteTo(peer.uuid,peer.name);
            _launchGame(container,()=>{
              container.style.cssText='flex:1;overflow:hidden;position:relative;background:#07080e';
              container.innerHTML=''; _startVSGame(container,newSess);
            });
          };
          act.appendChild(b);
        }

        row.appendChild(act);
        scroll.appendChild(row);
      });
    }

    // Poll léger — vérifie seulement si une nouvelle invite est arrivée
    // S'arrête dès que le container n'est plus le menu (jeu lancé)
    let _pollStopped=false;
    const iv=setInterval(()=>{
      if(_pollStopped||!container.isConnected){clearInterval(iv);return;}
      if(!container.contains(scroll)){clearInterval(iv);return;}
      const peers=getPeers();
      const hasNewInvite=peers.some(p=>_readInviteFromProfile(p.profile));
      const hasPending=!!_checkPendingInvite();
      if(hasNewInvite||hasPending){
        _pollStopped=true;
        clearInterval(iv);
        renderModeSelect(container);
      }
    },4000);
    // Enregistrer l'arrêt du poll — appelé quand un jeu est lancé
    _stopMenuPoll=()=>{_pollStopped=true;clearInterval(iv);};
  }


  function _destroyGame(){
    if(_game){try{_game.destroy(true);}catch(e){} _game=null;}
  }

  function _loadPhaser(cb){
    if(window.Phaser){cb();return;}
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/phaser/3.60.0/phaser.min.js';
    s.onload=cb; document.head.appendChild(s);
  }

  // ── SCORES & GUIDE ─────────────────────────────────────────────────────────
  function _renderScoresInto(c,onRestart){
    const scores=loadScores();
    let h=`<div style="font-size:16px;font-weight:700;color:#f59e0b;margin-bottom:10px">🏆 Meilleurs scores</div>`;
    h+=`<button id="td-restart" style="width:100%;padding:8px;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);color:#f59e0b;border-radius:8px;cursor:pointer;font-family:monospace;font-size:12px;font-weight:700;margin-bottom:12px">↺ Nouvelle partie</button>`;
    if(!scores.length) h+='<div style="color:rgba(255,255,255,.3);text-align:center;margin-top:30px">Aucune partie enregistrée.</div>';
    else scores.forEach((s,i)=>{
      const medal=['🥇','🥈','🥉'][i]||`#${i+1}`;
      h+=`<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:9px;margin-bottom:5px;background:rgba(255,255,255,.04)">
        <span>${medal}</span>
        <div style="flex:1"><div style="color:#fff;font-size:12px">${s.name||'Commandant'}${s.mode==='vs'?' ⚔️':''}</div>
        <div style="font-size:10px;color:rgba(255,255,255,.3)">Vague ${s.wave} · ${s.kills||0} kills${s.victory?' · ✦':''}</div></div>
        <div style="color:#f59e0b;font-size:14px;font-weight:700">${s.score.toLocaleString()}</div></div>`;
    });
    c.innerHTML=h;
    const btn=c.querySelector('#td-restart');
    if(btn&&onRestart) btn.onclick=onRestart;
  }

  function _renderGuideInto(c){
    let h=`<div style="font-size:16px;font-weight:700;color:#f59e0b;margin-bottom:10px">📖 Guide</div>
    <div style="background:rgba(255,255,255,.04);border-radius:8px;padding:10px;margin-bottom:12px;font-size:10px;color:rgba(255,255,255,.6);line-height:1.8">
      <b style="color:#f59e0b">Solo :</b> Placez des tours, survivez aux vagues. Shop entre chaque vague.<br>
      <b style="color:#ef4444">VS :</b> Chaque joueur sur son terminal. Vous voyez votre terrain.<br>
      Switch "👁 Espionner" pour voir le terrain adverse — zone limitée par vos attaques.<br>
      <span style="color:#60a5fa">💰 Or défense</span> → acheter des <b>tours</b> (gagné en tuant des ennemis).<br>
      <span style="color:#f59e0b">⚔️ Or attaque</span> → acheter des <b>attaquants</b> (gagné quand ils avancent).<br>
      <b>Inviter :</b> fiche contact → ⬡ Spheres → Tower Defense → Défier.
    </div>
    <div style="font-size:12px;font-weight:700;color:#f59e0b;margin-bottom:7px">🗼 Tours</div>`;
    Object.entries(TOWER_DEFS).forEach(([,t])=>{
      h+=`<div style="padding:6px 9px;border-radius:7px;margin-bottom:4px;background:rgba(255,255,255,.03);border-left:2px solid #${t.col.toString(16).padStart(6,'0')}">
        <div style="display:flex;justify-content:space-between"><span style="font-size:11px;color:#fff">${t.emoji} ${t.name}</span><span style="color:#f59e0b;font-size:9px">${t.cost}g</span></div>
        <div style="font-size:9px;color:rgba(255,255,255,.4)">${t.desc}</div></div>`;
    });
    h+=`<div style="font-size:12px;font-weight:700;color:#ef4444;margin:10px 0 7px">⚔️ Attaquants VS</div>`;
    Object.entries(ATTACKER_DEFS).forEach(([,a])=>{
      h+=`<div style="padding:6px 9px;border-radius:7px;margin-bottom:4px;background:rgba(255,255,255,.03);border-left:2px solid ${a.col}">
        <div style="display:flex;justify-content:space-between"><span style="font-size:11px;color:#fff">${a.emoji} ${a.name}</span><span style="color:#ef4444;font-size:9px">${a.cost}⚔️</span></div>
        <div style="font-size:9px;color:rgba(255,255,255,.4)">${a.desc}</div></div>`;
    });
    c.innerHTML=h;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── MODE SOLO (base v6 qui marchait) ─────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  function renderSoloGame(container){
    const Phaser=window.Phaser;
    const W=container.offsetWidth||360, H=container.offsetHeight||520;
    const BAR_H=82, TOP_H=36; // BAR_H = 2 rangées de 41px

    function makePathA(W,H){const m=20;return[{x:m,y:-30},{x:m,y:H*.15},{x:W*.48,y:H*.15},{x:W*.48,y:H*.38},{x:W*.18,y:H*.38},{x:W*.18,y:H*.62},{x:W*.70,y:H*.62},{x:W*.70,y:H*.82},{x:W-m,y:H*.82},{x:W-m,y:H+30}];}
    function buildPD(pts){const s=[]; let t=0;for(let i=0;i<pts.length-1;i++){const l=Math.hypot(pts[i+1].x-pts[i].x,pts[i+1].y-pts[i].y);s.push(l);t+=l;}return{pts,segLengths:s,total:t};}
    function posOnPath(pd,d){let r=Math.max(0,d);for(let i=0;i<pd.segLengths.length;i++){const sl=pd.segLengths[i];if(r<=sl){const t=r/sl;return{x:pd.pts[i].x+t*(pd.pts[i+1].x-pd.pts[i].x),y:pd.pts[i].y+t*(pd.pts[i+1].y-pd.pts[i].y),done:false};}r-=sl;}return{x:pd.pts[pd.pts.length-1].x,y:pd.pts[pd.pts.length-1].y,done:true};}
    function isOnPath(pd,x,y,rad=28){const pts=pd.pts;for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1],dx=b.x-a.x,dy=b.y-a.y,len2=dx*dx+dy*dy;if(!len2)continue;const t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/len2));if((x-a.x-t*dx)**2+(y-a.y-t*dy)**2<rad*rad)return true;}return false;}

    let gold=200,lives=30,score=0,waveIdx=0;
    let towers=[],enemies=[],bullets=[],particles=[],killFeedTexts=[];
    let selectedTower='archer',gameOver=false,betweenWaves=false;
    let combo=0,comboTimer=0,killCount=0,waveActive=false;
    let globalMods={dmgMult:0,rangeMult:0,rateMult:0,goldBonus:0,livesBonus:0,interest:0,slowBoost:0,splashMult:0,chainBonus:0,detectStealth:false};
    let purchasedUpgrades={}; // {id: count} — upgrades répétables
    let hudTexts={},shopOverlay=null,shopIsOpen=false,towerOverlay=null;
    let scene=null;
    const pathRaw=makePathA(W,H-BAR_H+TOP_H);
    const pd=buildPD(pathRaw);

    const effR=(cfg)=>cfg.range*(1+globalMods.rangeMult);
    const effD=(cfg)=>cfg.dmg*(1+globalMods.dmgMult);
    const effRate=(cfg)=>cfg.rate*(1+globalMods.rateMult);

    function preload(){}

    function create(){
      scene=this;
      drawBg(this); drawPathVis(this,pathRaw); createHUD(this); createIconBar(this);
      this.input.on('pointerdown',ptr=>{
        if(gameOver||shopIsOpen)return;
        const{x,y}=ptr;
        const ct=towers.find(t=>Math.hypot(t.x-x,t.y-y)<22);
        if(ct){showTowerOverlay(ct);return;}
        if(y>H-BAR_H||y<TOP_H)return;
        if(isOnPath(pd,x,y)){showFloat(this,'Chemin!',x,y-28,'#fbbf24');return;}
        if(towers.some(t=>Math.hypot(t.x-x,t.y-y)<36)){showFloat(this,'Trop proche!',x,y-28,'#fbbf24');return;}
        const cfg=TOWER_DEFS[selectedTower];
        if(gold<cfg.cost){showFloat(this,'Pas assez d\'or!',x,y-28,'#ef4444');return;}
        gold-=cfg.cost; placeTower(this,x,y,selectedTower); updateHUD();
      });
      const prev=this.add.graphics().setDepth(50);
      this.input.on('pointermove',ptr=>{
        prev.clear();
        if(gameOver||shopIsOpen||ptr.y>H-BAR_H||ptr.y<TOP_H)return;
        const cfg=TOWER_DEFS[selectedTower];
        const ok=!isOnPath(pd,ptr.x,ptr.y)&&!towers.some(t=>Math.hypot(t.x-ptr.x,t.y-ptr.y)<36);
        prev.lineStyle(1,ok?cfg.col:0xff4444,0.3);prev.strokeCircle(ptr.x,ptr.y,effR(cfg));
        prev.fillStyle(ok?cfg.col:0xff4444,0.2);prev.fillCircle(ptr.x,ptr.y,14);
      });
      this.time.delayedCall(1800,()=>startWave(this));
    }

    function drawBg(scene){
      const bg=scene.add.graphics();bg.fillStyle(0x07080e);bg.fillRect(0,0,W,H);
      const gr=scene.add.graphics();gr.lineStyle(0.5,0xffffff,0.025);
      for(let x=0;x<W;x+=36)gr.lineBetween(x,0,x,H);
      for(let y=0;y<H;y+=36)gr.lineBetween(0,y,W,y);
      const st=scene.add.graphics();
      for(let i=0;i<80;i++){st.fillStyle(0xffffff,Math.random()*.55+.05);st.fillCircle(Math.random()*W,Math.random()*H,Math.random()<.1?1.4:.6);}
      const nb=scene.add.graphics();
      [[0x3b1d6e,W*.3,H*.4,90],[0x0c3b52,W*.7,H*.6,80],[0x1a0a30,W*.5,H*.2,70]].forEach(([c,x,y,r])=>{nb.fillStyle(c,0.18);nb.fillCircle(x,y,r);});
    }

    function drawPathVis(scene,pts){
      const g=scene.add.graphics();
      g.lineStyle(48,0x000000,.5);g.beginPath();pts.forEach((p,i)=>i?g.lineTo(p.x+3,p.y+3):g.moveTo(p.x+3,p.y+3));g.strokePath();
      g.lineStyle(44,0x1a2040,1);g.beginPath();pts.forEach((p,i)=>i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y));g.strokePath();
      g.lineStyle(36,0x131628,1);g.beginPath();pts.forEach((p,i)=>i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y));g.strokePath();
      g.lineStyle(2,0x5b21b6,.65);g.beginPath();pts.forEach((p,i)=>i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y));g.strokePath();
    }

    // ── BARRE D'ICÔNES 2 RANGÉES EN BAS ────────────────────────────────────
    function createIconBar(scene){
      const barY=H-BAR_H;
      const barBg=scene.add.graphics().setDepth(90);
      barBg.fillStyle(0x000000,.93);barBg.fillRect(0,barY,W,BAR_H);
      barBg.lineStyle(1,0x333344,.6);barBg.lineBetween(0,barY,W,barY);
      barBg.lineStyle(1,0x333344,.3);barBg.lineBetween(0,barY+BAR_H/2,W,barY+BAR_H/2);

      const tKeys=Object.keys(TOWER_DEFS); // 12 tours
      const ROW1=tKeys.slice(0,6), ROW2=tKeys.slice(6);
      const btnW=Math.floor(W/6);

      function drawRow(row, rowY){
        row.forEach((id,i)=>{
          const cfg=TOWER_DEFS[id];
          const bx=i*btnW;
          const btn=scene.add.graphics().setDepth(91);
          btn.setInteractive(new Phaser.Geom.Rectangle(bx,rowY,btnW,BAR_H/2),Phaser.Geom.Rectangle.Contains);
          function drawBtn(sel){
            btn.clear();
            btn.fillStyle(sel?cfg.col:0x0a0d1a,sel?.20:.93);
            btn.fillRect(bx+1,rowY+1,btnW-2,BAR_H/2-2);
            if(sel){btn.lineStyle(1.5,cfg.col,.9);btn.strokeRect(bx+1,rowY+1,btnW-2,BAR_H/2-2);}
          }
          drawBtn(id===selectedTower);
          btn._id=id; btn.drawMe=drawBtn; btn._isTB=true;
          btn.on('pointerdown',()=>{
            selectedTower=id;
            scene.children.list.filter(c=>c._isTB).forEach(c=>c.drawMe(c._id===id));
          });
          const cx=bx+btnW/2;
          scene.add.text(cx,rowY+4,cfg.emoji,{fontSize:'14px'}).setOrigin(0.5,0).setDepth(92);
          scene.add.text(cx,rowY+20,cfg.cost+'g',{fontSize:'7px',color:'#f59e0b',fontFamily:'monospace'}).setOrigin(0.5,0).setDepth(92);
          scene.add.text(cx,rowY+29,cfg.name,{fontSize:'6px',color:'rgba(255,255,255,.3)',fontFamily:'monospace'}).setOrigin(0.5,0).setDepth(92);
        });
      }
      drawRow(ROW1, barY);
      drawRow(ROW2, barY+BAR_H/2);
    }

    function createHUD(scene){
      const hg=scene.add.graphics().setDepth(90);
      hg.fillStyle(0x000000,.88);hg.fillRect(0,0,W,TOP_H);
      hudTexts.gold=scene.add.text(8,4,'💰 '+gold,{fontSize:'11px',color:'#f59e0b',fontFamily:'monospace'}).setDepth(91);
      hudTexts.lives=scene.add.text(W/2,4,'❤️ '+lives,{fontSize:'11px',color:'#ef4444',fontFamily:'monospace'}).setOrigin(0.5,0).setDepth(91);
      hudTexts.score=scene.add.text(W-6,4,'⭐ '+score,{fontSize:'11px',color:'#a78bfa',fontFamily:'monospace'}).setOrigin(1,0).setDepth(91);
      hudTexts.wave=scene.add.text(W/2,18,'Vague 0/'+WAVE_SCRIPT.length,{fontSize:'9px',color:'rgba(255,255,255,.35)',fontFamily:'monospace'}).setOrigin(0.5,0).setDepth(91);
      hudTexts.combo=scene.add.text(W/2,TOP_H+28,'',{fontSize:'14px',color:'#fbbf24',fontFamily:'monospace',fontStyle:'bold',stroke:'#000',strokeThickness:3}).setOrigin(0.5).setDepth(95).setAlpha(0);
    }
    function updateHUD(){
      if(hudTexts.gold)hudTexts.gold.setText('💰 '+gold.toLocaleString());
      if(hudTexts.lives)hudTexts.lives.setText('❤️ '+lives);
      if(hudTexts.score)hudTexts.score.setText('⭐ '+score.toLocaleString());
    }

    // ── TOURS ──────────────────────────────────────────────────────────────
    function placeTower(scene,x,y,type){
      const base=TOWER_DEFS[type];
      const cfg={...base,upgrades:JSON.parse(JSON.stringify(base.upg)),upg:undefined};
      const g=scene.add.graphics().setPosition(x,y).setDepth(15);
      drawTowerGfx(g,cfg,0);
      g.setInteractive(new Phaser.Geom.Circle(0,0,20),Phaser.Geom.Circle.Contains);
      const ico=scene.add.text(x,y-1,cfg.emoji,{fontSize:'12px'}).setOrigin(0.5).setDepth(16);
      const rg=scene.add.graphics().setPosition(x,y).setDepth(9);
      rg.lineStyle(1,cfg.col,.1);rg.strokeCircle(0,0,effR(cfg));rg.visible=false;
      g.on('pointerover',()=>rg.visible=true);g.on('pointerout',()=>rg.visible=false);
      const lvlTxt=scene.add.text(x+14,y-14,'1',{fontSize:'7px',color:'#ffffff60',fontFamily:'monospace'}).setDepth(17);
      emitBurst(scene,x,y,cfg.col);
      scene.tweens.add({targets:[g,ico],scaleX:{from:0,to:1},scaleY:{from:0,to:1},duration:200,ease:'Back.Out'});
      const t={x,y,type,cfg,g,ico,rg,lvlTxt,lastFire:0,level:0,totalDmg:0,kills:0};
      towers.push(t); score+=8; updateHUD(); return t;
    }

    function drawTowerGfx(g,cfg,level){
      g.clear();
      if(level>=3){g.fillStyle(cfg.col,.08);g.fillCircle(0,0,26);}
      if(level>=2){g.fillStyle(cfg.col,.14);g.fillCircle(0,0,22);}
      g.fillStyle(0x080b1a);g.fillCircle(0,0,19);g.fillStyle(0x111830);g.fillCircle(0,0,16);
      g.lineStyle(level>=1?2.5:1.8,cfg.col,level>=2?1:.8);g.strokeCircle(0,0,12);
      if(level>=1){g.lineStyle(1,cfg.col,.3);g.strokeCircle(0,0,16);}
      if(cfg.splash){g.fillStyle(cfg.col,.5);for(let k=0;k<3;k++){const a=k*Math.PI*2/3;g.fillCircle(Math.cos(a)*5,Math.sin(a)*5,2);}}
      else if(cfg.chain){g.lineStyle(1.5,cfg.col,.7);g.lineBetween(-6,-4,6,-4);g.lineBetween(-6,0,6,0);g.lineBetween(-6,4,6,4);}
      else if(cfg.poison){g.fillStyle(cfg.col,.6);g.fillCircle(0,0,4);}
      else if(cfg.pierce){g.lineStyle(2.5,cfg.col,.9);g.lineBetween(-7,0,7,0);}
      else if(cfg.pull){g.lineStyle(1.5,cfg.col,.5);for(let k=0;k<4;k++){const a=k*Math.PI*.5;g.lineBetween(Math.cos(a)*3,Math.sin(a)*3,Math.cos(a)*8,Math.sin(a)*8);}}
      else if(cfg.freeze){g.fillStyle(cfg.col,.5);g.fillRect(-3,-7,6,14);g.fillRect(-7,-3,14,6);}
      else if(cfg.burn){g.fillStyle(cfg.col,.7);g.fillTriangle(0,-7,-5,5,5,5);}
      else{g.lineStyle(1.5,cfg.col,.5);g.lineBetween(-5,0,5,0);g.lineBetween(0,-5,0,5);}
    }

    function showTowerOverlay(tower){
      removeAllOverlays();
      const canvasEl=container.querySelector('canvas');
      const cRect=canvasEl?canvasEl.getBoundingClientRect():{width:W,height:H};
      const sx=W/cRect.width,sy=H/cRect.height;
      const ox=Math.min(tower.x/sx,cRect.width-162);
      const oy=Math.max(tower.y/sy-115,TOP_H+4);
      const colHex='#'+tower.cfg.col.toString(16).padStart(6,'0');
      const hasUpg=tower.level<(tower.cfg.upgrades||[]).length;
      const upg=hasUpg?tower.cfg.upgrades[tower.level]:null;
      const ov=document.createElement('div');
      ov.id='td-tower-ov';
      ov.style.cssText=`position:absolute;left:${ox}px;top:${oy}px;width:158px;background:#050710;border:1px solid ${colHex}55;border-radius:10px;padding:10px;z-index:300;font-family:monospace;pointer-events:all`;
      const upgHtml=hasUpg?`<div style="font-size:9px;color:rgba(255,255,255,.4);margin-bottom:4px">→ Niv${tower.level+2}: ${upg.label}</div>
        <button id="td-upg" style="width:100%;padding:6px;background:${gold>=upg.cost?'rgba(16,185,129,.18)':'rgba(239,68,68,.1)'};border:1px solid ${gold>=upg.cost?'#10b981':'#ef4444'};color:${gold>=upg.cost?'#10b981':'#ef4444'};border-radius:6px;cursor:pointer;font-size:10px;font-weight:700;font-family:monospace">${gold>=upg.cost?`✓ Améliorer (${upg.cost}g)`:`✗ ${upg.cost}g requis`}</button>`
        :'<div style="font-size:9px;color:#f59e0b;text-align:center">✦ NIVEAU MAX ✦</div>';
      const sellVal=Math.round(tower.cfg.cost*.6);
      ov.innerHTML=`<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
        <span style="font-size:15px">${tower.cfg.emoji}</span>
        <div><div style="font-size:12px;font-weight:700;color:#fff">${tower.cfg.name}</div>
        <div style="font-size:9px;color:rgba(255,255,255,.4)">Niv${tower.level+1} · ${Math.round(tower.totalDmg)} dmg</div></div></div>
        <div style="font-size:9px;color:rgba(255,255,255,.35);margin-bottom:8px">DMG:${Math.round(effD(tower.cfg))} · PORT:${Math.round(effR(tower.cfg))}</div>
        ${upgHtml}
        <button id="td-sell" style="width:100%;padding:5px;background:rgba(239,68,68,.1);border:1px solid #ef444444;color:#ef4444;border-radius:6px;cursor:pointer;font-size:10px;margin-top:5px;font-family:monospace">💰 Vendre (${sellVal}g)</button>
        <button id="td-close" style="width:100%;padding:4px;background:transparent;border:none;color:rgba(255,255,255,.25);cursor:pointer;font-size:10px;margin-top:3px">✕</button>`;
      container.appendChild(ov); towerOverlay=ov;
      ov.querySelector('#td-close').onclick=()=>removeAllOverlays();
      ov.querySelector('#td-sell').onclick=()=>{
        gold+=sellVal;
        tower.g.destroy();tower.ico.destroy();tower.rg.destroy();tower.lvlTxt.destroy();
        towers=towers.filter(t=>t!==tower); updateHUD(); removeAllOverlays();
      };
      if(hasUpg&&ov.querySelector('#td-upg')){
        ov.querySelector('#td-upg').onclick=()=>{
          if(gold<upg.cost){showFloat(scene,'Pas assez d\'or!',tower.x,tower.y-40,'#ef4444');removeAllOverlays();return;}
          gold-=upg.cost; tower.level++;
          Object.keys(upg).forEach(k=>{if(k!=='cost'&&k!=='label')tower.cfg[k]=upg[k];});
          drawTowerGfx(tower.g,tower.cfg,tower.level);
          tower.rg.clear();tower.rg.lineStyle(1,tower.cfg.col,.12);tower.rg.strokeCircle(0,0,effR(tower.cfg));
          tower.lvlTxt.setText(''+(tower.level+1));
          emitBurst(scene,tower.x,tower.y,tower.cfg.col);
          score+=20; updateHUD(); removeAllOverlays();
        };
      }
      setTimeout(()=>{if(towerOverlay===ov)removeAllOverlays();},6000);
    }

    // ── VAGUES ─────────────────────────────────────────────────────────────
    function startWave(sc){
      if(gameOver)return;
      waveActive=true; betweenWaves=false; shopIsOpen=false; removeAllOverlays();
      const ws=WAVE_SCRIPT[Math.min(waveIdx,WAVE_SCRIPT.length-1)];
      const scale=Math.pow(1.18, waveIdx); // s'applique dès la vague 1, plus de difficulté progressive
      waveIdx++;
      if(hudTexts.wave)hudTexts.wave.setText(`Vague ${waveIdx}/${WAVE_SCRIPT.length}`);
      showFloat2(sc,ws.bossWave?`⚠ VAGUE BOSS ${waveIdx}`:`⚔ Vague ${waveIdx}`,W/2,H/2-50,ws.bossWave?'#ff4444':'#fbbf24');
      ws.squads.forEach(sq=>{
        const offset=sq.offset||0;
        for(let i=0;i<sq.count;i++){
          sc.time.delayedCall(offset+i*sq.delay,()=>{
            if(gameOver)return;
            const def=ENEMY_TYPES[sq.type];
            spawnEnemy(sc,{hp:Math.round(def.hp*scale),spd:Math.min(def.spd+(waveIdx-1)*2.5,180),reward:Math.round(def.rew*scale),col:def.col,shape:def.shape,size:def.size,armor:def.armor||0,flying:!!def.flying,stealth:!!def.stealth,heals:!!def.heals,splits:!!def.splits,rages:!!def.rages,boss:!!def.boss,name:def.name,typeid:sq.type});
          });
        }
      });
      const maxD=(ws.squads.reduce((mx,sq)=>Math.max(mx,(sq.offset||0)+sq.count*sq.delay),0))+4000;
      sc.time.delayedCall(maxD,()=>checkWaveEnd(sc,ws));
    }

    function checkWaveEnd(sc,ws){
      if(gameOver)return;
      if(enemies.length>0){sc.time.delayedCall(2000,()=>checkWaveEnd(sc,ws));return;}
      waveActive=false; betweenWaves=true;
      if(globalMods.interest>0){const b=Math.floor(gold*globalMods.interest);if(b>0){gold+=b;showFloat2(sc,`+${b}g intérêts`,W/2,H/2-30,'#f59e0b');}}
      const bonus=50+waveIdx*15; gold+=bonus; score+=bonus*2; updateHUD();
      showFloat2(sc,`Vague dégagée! +${bonus}g`,W/2,H/2-50,'#10b981');
      if(waveIdx>=WAVE_SCRIPT.length){triggerVictory();return;}
      sc.time.delayedCall(1800,()=>{if(!gameOver)showWaveShop(sc);});
    }

    function startNextWave(){
      if(gameOver||!betweenWaves)return;
      betweenWaves=false; shopIsOpen=false;
      if(scene)scene.time.delayedCall(600,()=>startWave(scene));
    }

    // ── SHOP INTER-VAGUES (overlay HTML) ────────────────────────────────────
    function showWaveShop(sc){
      removeAllOverlays(); shopIsOpen=true;
      // Toutes les upgrades sont disponibles, coût augmente de 60% par achat précédent
      // Sauf 'unique' (Radar) qui disparaît une fois acheté
      const pool=GLOBAL_UPGRADES.filter(u=>!(u.unique&&purchasedUpgrades[u.id]));
      const offers=[...pool].sort(()=>Math.random()-.5).slice(0,3).map(u=>{
        const times=purchasedUpgrades[u.id]||0;
        const actualCost=Math.round(u.cost*Math.pow(1.6,times));
        return {...u, actualCost, times};
      });

      const ov=document.createElement('div');
      ov.id='td-shop-ov';
      ov.style.cssText='position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:calc(100% - 28px);max-width:310px;background:#050710;border:1px solid rgba(245,158,11,.35);border-radius:12px;padding:14px;z-index:400;font-family:monospace;pointer-events:all';

      const offerHtml=offers.map(u=>{
        const can=gold>=u.actualCost;
        const timesLabel=u.times>0?` <span style="color:rgba(255,255,255,.35);font-size:8px">(×${u.times+1})</span>`:'';
        return `<div style="padding:8px;border-radius:8px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);margin-bottom:7px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <span style="font-size:13px">${u.emoji} <strong style="color:#fff;font-size:11px">${u.name}</strong>${timesLabel}</span>
            <span style="font-size:11px;color:#f59e0b">${u.actualCost}g</span></div>
          <div style="font-size:9px;color:rgba(255,255,255,.4);margin-bottom:6px">${u.desc}</div>
          <button data-id="${u.id}" data-cost="${u.actualCost}" class="shop-btn" style="width:100%;padding:6px;background:${can?'rgba(16,185,129,.15)':'rgba(100,100,100,.1)'};border:1px solid ${can?'#10b981':'#444'};color:${can?'#10b981':'#555'};border-radius:6px;cursor:${can?'pointer':'default'};font-size:10px;font-family:monospace">${can?`✓ Acheter (${u.actualCost}g)`:`✗ Besoin de ${u.actualCost}g`}</button>
        </div>`;
      }).join('');

      ov.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div style="font-size:13px;font-weight:700;color:#f59e0b">🏪 Améliorations</div>
        <div style="font-size:9px;color:rgba(255,255,255,.4)">Vague ${waveIdx}/${WAVE_SCRIPT.length}</div></div>
        <div style="font-size:10px;color:rgba(255,255,255,.3);margin-bottom:10px">💰 Trésorerie: ${gold.toLocaleString()}g · Répétables (coût ×1.6)</div>
        ${offerHtml}
        <button id="shop-close" style="width:100%;padding:8px;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.35);color:#f59e0b;border-radius:8px;cursor:pointer;font-size:11px;font-family:monospace;font-weight:700">▶ Lancer la vague suivante →</button>`;
      container.appendChild(ov); shopOverlay=ov;

      ov.querySelectorAll('.shop-btn').forEach(btn=>{
        btn.addEventListener('click',()=>{
          const id=btn.dataset.id;
          const cost=parseInt(btn.dataset.cost);
          const u=GLOBAL_UPGRADES.find(x=>x.id===id);
          if(!u||gold<cost)return;
          gold-=cost;
          purchasedUpgrades[id]=(purchasedUpgrades[id]||0)+1;
          applyGlobalUpg(u.effect); updateHUD();
          showFloat2(sc,`✦ ${u.name}!`,W/2,H*.4,'#10b981');
          removeAllOverlays(); showWaveShop(sc);
        });
      });
      ov.querySelector('#shop-close').onclick=()=>{removeAllOverlays();startNextWave();};
    }

    function applyGlobalUpg(e){
      if(e.dmgMult)globalMods.dmgMult+=e.dmgMult;
      if(e.rangeMult)globalMods.rangeMult+=e.rangeMult;
      if(e.rateMult)globalMods.rateMult+=e.rateMult;
      if(e.goldBonus)globalMods.goldBonus+=e.goldBonus;
      if(e.livesBonus){lives+=e.livesBonus;updateHUD();}
      if(e.interest)globalMods.interest+=e.interest;
      if(e.slowBoost)globalMods.slowBoost+=e.slowBoost;
      if(e.splashMult)globalMods.splashMult+=e.splashMult;
      if(e.chainBonus)globalMods.chainBonus+=e.chainBonus;
      if(e.detectStealth)globalMods.detectStealth=true;
    }

    function removeAllOverlays(){
      [shopOverlay,towerOverlay].forEach(ov=>{if(ov&&ov.parentNode)ov.remove();});
      shopOverlay=null; towerOverlay=null; shopIsOpen=false;
    }

    // ── ENNEMIS ────────────────────────────────────────────────────────────
    function spawnEnemy(sc,data){
      const colNum=parseInt(data.col.replace('#',''),16);
      const g=sc.add.graphics().setDepth(10);
      const hpBar=sc.add.graphics().setDepth(12);
      const fx=sc.add.graphics().setDepth(11);
      const trail=sc.add.graphics().setDepth(8);
      const start=posOnPath(pd,0);
      const e={g,hpBar,fx,trail,hp:data.hp,maxHp:data.hp,spd:data.spd,col:data.col,colNum,reward:data.reward,shape:data.shape,size:data.size,armor:data.armor||0,flying:data.flying,stealth:data.stealth,heals:data.heals,splits:data.splits,rages:data.rages,boss:data.boss,name:data.name,typeid:data.typeid,distTraveled:0,x:start.x,y:start.y,dead:false,frozen:false,freezeTimer:0,slowTimer:0,slowFactor:1,poisonTimer:0,poisonDmg:0,burnTimer:0,burnDmg:0,raging:false,pulseT:Math.random()*Math.PI*2,trailHist:[],healTimer:0,stealthVisible:false,stealthFlicker:0,splitDone:false};
      enemies.push(e); drawEnemy(e); return e;
    }

    function drawEnemy(e){
      e.g.clear();const r=e.size,c=e.colNum;
      e.g.setAlpha(e.stealth&&!e.stealthVisible?0.35:1);
      if(e.shape==='diamond'){e.g.fillStyle(c,1);e.g.fillTriangle(0,-r,r*.7,0,0,r);e.g.fillTriangle(0,-r,-r*.7,0,0,r);e.g.lineStyle(e.boss?2:1.5,e.boss?0xffd700:0xffffff,.25);e.g.strokeTriangle(0,-r,r*.7,0,0,r);}
      else if(e.shape==='hex'){const pts=[];for(let k=0;k<6;k++){const a=k/6*Math.PI*2-Math.PI/6;pts.push({x:Math.cos(a)*r,y:Math.sin(a)*r});}e.g.fillStyle(c,1);e.g.beginPath();pts.forEach((p,i)=>i?e.g.lineTo(p.x,p.y):e.g.moveTo(p.x,p.y));e.g.closePath();e.g.fillPath();e.g.lineStyle(e.boss?2.5:1.5,e.boss?0xffd700:0xffffff,.3);e.g.beginPath();pts.forEach((p,i)=>i?e.g.lineTo(p.x,p.y):e.g.moveTo(p.x,p.y));e.g.closePath();e.g.strokePath();}
      else{e.g.fillStyle(c,1);e.g.fillCircle(0,0,r);e.g.fillStyle(0xffffff,.18);e.g.fillCircle(-r*.22,-r*.25,r*.32);e.g.lineStyle(e.boss?2:1.5,e.boss?0xffd700:0xffffff,.3);e.g.strokeCircle(0,0,r);}
      if(e.stealth){e.g.lineStyle(1,0x475569,.5);e.g.strokeCircle(0,0,r+3);}
    }

    function update(time,delta){
      if(gameOver)return;
      const dt=delta/1000;
      if(comboTimer>0){comboTimer-=dt;if(comboTimer<=0){combo=0;if(hudTexts.combo)hudTexts.combo.setText('');}}

      for(let i=enemies.length-1;i>=0;i--){
        const e=enemies[i];if(e.dead)continue;
        e.pulseT+=0.05;
        if(e.heals){e.healTimer-=dt;if(e.healTimer<=0){e.healTimer=1.2;enemies.forEach(ne=>{if(!ne.dead&&ne!==e&&Math.hypot(ne.x-e.x,ne.y-e.y)<60)ne.hp=Math.min(ne.maxHp,ne.hp+ne.maxHp*.04);});}}
        if(e.freezeTimer>0){e.freezeTimer-=dt;e.fx.clear();e.fx.setPosition(e.x,e.y);e.fx.lineStyle(3,0x67e8f9,.7);e.fx.strokeCircle(0,0,e.size+5);if(e.freezeTimer<=0)e.frozen=false;else{e.g.setPosition(e.x,e.y);e.hpBar.setPosition(e.x,e.y);continue;}}
        else if(e.slowTimer>0){e.slowTimer-=dt;e.fx.clear();e.fx.setPosition(e.x,e.y);e.fx.lineStyle(2,0x38bdf8,.4);e.fx.strokeCircle(0,0,e.size+4);}
        else{e.slowFactor=1;e.fx.clear();}
        if(e.poisonTimer>0){e.poisonTimer-=dt;e.hp-=e.poisonDmg*dt;if(e.hp<=0){killEnemy(e,i);continue;}}
        if(e.burnTimer>0){e.burnTimer-=dt;e.hp-=e.burnDmg*dt;if(e.hp<=0){killEnemy(e,i);continue;}}
        if(e.rages&&!e.raging&&e.hp<e.maxHp*.5){e.raging=true;e.spd*=1.7;showFloat2(scene,'EN RAGE!',e.x,e.y-30,'#ff4444');}
        if(e.stealth){e.stealthFlicker+=dt;e.stealthVisible=globalMods.detectStealth||towers.some(t=>t.type==='laser'&&Math.hypot(t.x-e.x,t.y-e.y)<t.cfg.range);e.g.setAlpha(e.stealthVisible?1:0.3+Math.sin(e.stealthFlicker*3)*.1);}

        if(!e.frozen){
          e.distTraveled+=e.spd*e.slowFactor*dt;
          const pos=posOnPath(pd,e.distTraveled);
          e.x=pos.x; e.y=pos.y;
          if(pos.done){
            e.dead=true;
            let loss=1;if(e.boss)loss=5;else if(e.typeid==='titan')loss=4;else if(e.armor>0.3)loss=2;
            lives=Math.max(0,lives-loss);
            cleanupEnemy(e); enemies.splice(i,1);
            if(scene)scene.cameras.main.shake(300,0.012);
            updateHUD();
            showFloat2(scene,`-${loss} ❤️`,W/2,H*.35,'#ef4444');
            if(lives<=0){triggerGameOver();return;}
            continue;
          }
        }
        e.g.setPosition(e.x,e.y); e.hpBar.setPosition(e.x,e.y);
        const bw=e.boss?38:(e.size>12?28:22);
        e.hpBar.clear();e.hpBar.fillStyle(0x000000,.7);e.hpBar.fillRect(-bw/2,-e.size-13,bw,4);
        const pct=Math.max(0,e.hp/e.maxHp);
        e.hpBar.fillStyle(pct>.6?0x22c55e:pct>.3?0xfbbf24:0xef4444);e.hpBar.fillRect(-bw/2,-e.size-13,bw*pct,4);
        e.trailHist.push({x:e.x,y:e.y});if(e.trailHist.length>8)e.trailHist.shift();
        e.trail.clear();e.trailHist.forEach((p,j)=>{e.trail.fillStyle(e.colNum,(j/e.trailHist.length)*.2);e.trail.fillCircle(p.x,p.y,(j/e.trailHist.length)*e.size*.4);});
      }

      towers.forEach(tower=>{
        const er=effRate(tower.cfg);if(time-tower.lastFire<er)return;
        let cands=enemies.filter(e=>!e.dead&&Math.hypot(tower.x-e.x,tower.y-e.y)<=effR(tower.cfg));
        if(!globalMods.detectStealth&&tower.type!=='laser')cands=cands.filter(e=>!e.stealth||e.stealthVisible);
        if(tower.cfg.minRange)cands=cands.filter(e=>Math.hypot(tower.x-e.x,tower.y-e.y)>=tower.cfg.minRange);
        if(!cands.length)return;
        cands.sort((a,b)=>b.distTraveled-a.distTraveled);
        const tgt=cands[0]; tower.lastFire=time;
        if(tower.cfg.chain)doChain(tower,tgt,time);
        else if(tower.cfg.pierce)doPierce(tower,tgt);
        else if(tower.cfg.pull)doPull(tower,cands);
        else if(tower.cfg.burn)doFlame(tower,tgt);
        else fireBullet(scene,tower,tgt,effD(tower.cfg));
      });

      for(let i=bullets.length-1;i>=0;i--){
        const b=bullets[i];if(!b.target||b.target.dead){b.g.destroy();bullets.splice(i,1);continue;}
        const dx=b.target.x-b.g.x,dy=b.target.y-b.g.y,dist=Math.hypot(dx,dy);
        if(dist<9){applyHit(b);b.g.destroy();bullets.splice(i,1);}
        else{const sp=240/60;b.g.x+=dx/dist*sp;b.g.y+=dy/dist*sp;}
      }
      for(let i=particles.length-1;i>=0;i--){
        const p=particles[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=220*dt;p.life-=dt;
        p.g.setPosition(p.x,p.y).setAlpha(Math.max(0,p.life/p.maxLife));
        if(p.life<=0){p.g.destroy();particles.splice(i,1);}
      }
      killFeedTexts=killFeedTexts.filter(t=>t.active);
    }

    function doChain(tower,first,time){
      const maxC=Math.min((tower.cfg.chain||3)+(globalMods.chainBonus||0),8);
      let tgts=[first],last=first;
      for(let k=1;k<maxC;k++){const n=enemies.find(e=>!e.dead&&e!==last&&!tgts.includes(e)&&Math.hypot(last.x-e.x,last.y-e.y)<70);if(n){tgts.push(n);last=n;}else break;}
      tgts.forEach((t,idx)=>fireBullet(scene,tower,t,effD(tower.cfg)*Math.pow(.75,idx)));
      for(let k=0;k<tgts.length-1;k++){const cg=scene.add.graphics().setDepth(55);cg.lineStyle(2.5,0xfacc15,1);cg.beginPath();cg.moveTo(tgts[k].x,tgts[k].y);cg.lineTo(tgts[k+1].x,tgts[k+1].y);cg.strokePath();scene.tweens.add({targets:cg,alpha:0,duration:180,onComplete:()=>cg.destroy()});}
    }
    function doPierce(tower,first){
      const dx=first.x-tower.x,dy=first.y-tower.y,len=Math.hypot(dx,dy)||1,nx=dx/len,ny=dy/len;
      const hit=enemies.filter(e=>!e.dead&&Math.hypot(tower.x-e.x,tower.y-e.y)<=effR(tower.cfg));
      hit.sort((a,b)=>Math.abs((a.x-tower.x)*ny-(a.y-tower.y)*nx)-Math.abs((b.x-tower.x)*ny-(b.y-tower.y)*nx));
      hit.slice(0,5).forEach((e,idx)=>{const d=effD(tower.cfg)*Math.pow(.85,idx);e.hp-=d;tower.totalDmg+=d;if(e.hp<=0)killEnemy(e,enemies.indexOf(e));});
      const lg=scene.add.graphics().setDepth(55);lg.lineStyle(3,tower.cfg.col,.85);lg.beginPath();lg.moveTo(tower.x,tower.y);lg.lineTo(first.x,first.y);lg.strokePath();scene.tweens.add({targets:lg,alpha:0,duration:90,onComplete:()=>lg.destroy()});
    }
    function doPull(tower,cands){
      const er=effR(tower.cfg);
      cands.forEach(e=>{const dx=tower.x-e.x,dy=tower.y-e.y,d=Math.hypot(dx,dy)||1;const f=60*(1-d/er);e.x+=dx/d*f*(1/60);e.y+=dy/d*f*(1/60);e.hp-=effD(tower.cfg)*.3;if(e.hp<=0)killEnemy(e,enemies.indexOf(e));});
      const vg=scene.add.graphics().setPosition(tower.x,tower.y).setDepth(55);vg.lineStyle(2,0xc026d3,.7);vg.strokeCircle(0,0,8);scene.tweens.add({targets:vg,scaleX:3,scaleY:3,alpha:0,duration:400,ease:'Cubic.Out',onComplete:()=>vg.destroy()});
    }
    function doFlame(tower,tgt){
      const er=effR(tower.cfg),angle=Math.atan2(tgt.y-tower.y,tgt.x-tower.x),ca=Math.PI/4;
      enemies.forEach(e=>{if(e.dead)return;const d=Math.hypot(e.x-tower.x,e.y-tower.y);if(d>er)return;const ea=Math.atan2(e.y-tower.y,e.x-tower.x);let da=Math.abs(ea-angle);if(da>Math.PI)da=Math.PI*2-da;if(da<ca){const dm=effD(tower.cfg)*(1-da/ca*.5);e.hp-=dm;tower.totalDmg+=dm;e.burnTimer=2.5;e.burnDmg=tower.cfg.dmg*.15;if(e.hp<=0)killEnemy(e,enemies.indexOf(e));}});
      for(let k=0;k<6;k++){const a=angle+(Math.random()-.5)*(Math.PI/3),dist=Math.random()*er;const fg=scene.add.graphics().setDepth(45).setPosition(tower.x,tower.y);fg.fillStyle(tower.cfg.col,.7);fg.fillCircle(0,0,4);const tx=tower.x+Math.cos(a)*dist,ty=tower.y+Math.sin(a)*dist;scene.tweens.add({targets:fg,x:tx,y:ty,alpha:0,scaleX:.2,scaleY:.2,duration:180,onComplete:()=>fg.destroy()});}
    }

    function fireBullet(sc,tower,target,dmg){
      const g=sc.add.graphics().setDepth(40);
      const isBig=tower.cfg.splash>0,isChain=!!tower.cfg.chain,isCryo=tower.cfg.freeze;
      const r=isBig?5.5:(isChain?4:2.5);
      g.fillStyle(tower.cfg.col,1);
      if(isBig){g.fillCircle(0,0,r);g.lineStyle(2,0xff8800,.6);g.strokeCircle(0,0,r);}
      else if(isCryo){g.fillStyle(tower.cfg.col,.9);g.fillCircle(0,0,r);g.lineStyle(1,0xffffff,.6);g.strokeCircle(0,0,r);}
      else if(isChain){g.lineStyle(2,tower.cfg.col,1);g.strokeCircle(0,0,r);g.fillStyle(0xffffff,.5);g.fillCircle(0,0,r*.4);}
      else g.fillCircle(0,0,r);
      g.setPosition(tower.x,tower.y);
      bullets.push({g,target,tower,dmg,col:tower.cfg.col});
    }

    function applyHit(b){
      const e=b.target,tower=b.tower;if(e.dead)return;
      let dmg=b.dmg*(1-e.armor);e.hp-=dmg;tower.totalDmg+=dmg;
      if(tower.cfg.slow){e.slowTimer=2.0;e.slowFactor=tower.cfg.slow+(globalMods.slowBoost||0);}
      if(tower.cfg.freeze){e.freezeTimer=1.5;e.frozen=true;emitBurst(scene,e.x,e.y,0x67e8f9);}
      if(tower.cfg.poison){e.poisonTimer=4.5;e.poisonDmg=tower.cfg.dmg*.25;}
      if(tower.cfg.burn){e.burnTimer=2.5;e.burnDmg=tower.cfg.dmg*.15;}
      if(tower.cfg.splash>0){
        const sr=tower.cfg.splash*(1+(globalMods.splashMult||0));
        enemies.forEach(ne=>{if(!ne.dead&&ne!==e&&Math.hypot(ne.x-e.x,ne.y-e.y)<sr){ne.hp-=dmg*.5;if(ne.hp<=0)killEnemy(ne,enemies.indexOf(ne));}});
        const sg=scene.add.graphics().setPosition(e.x,e.y).setDepth(70);sg.lineStyle(3,tower.cfg.col,.7);sg.strokeCircle(0,0,5);scene.tweens.add({targets:sg,scaleX:sr/5,scaleY:sr/5,alpha:0,duration:300,ease:'Cubic.Out',onComplete:()=>sg.destroy()});
      }
      if(e.hp<=0)killEnemy(e,enemies.indexOf(e));
    }

    function killEnemy(e,idx){
      if(e.dead)return; e.dead=true; killCount++;
      combo++; comboTimer=3.0;
      const mult=combo>=10?3:combo>=5?2:combo>=3?1.5:1;
      const earned=Math.round(e.reward*mult)+(globalMods.goldBonus||0);
      gold+=earned; score+=earned*4+(e.boss?2000:e.typeid==='titan'?800:0); updateHUD();
      if(combo>=3&&hudTexts.combo){hudTexts.combo.setText(combo>=10?`${combo}x MEGA COMBO!`:combo>=5?`${combo}x COMBO!`:`${combo}x Combo`).setAlpha(1);scene.tweens.add({targets:hudTexts.combo,alpha:0,delay:2200,duration:500});}
      addKillFeed(e.name,earned,e.boss);
      if(e.splits&&!e.splitDone){e.splitDone=true;for(let k=0;k<3;k++){const ne=spawnEnemy(scene,{...ENEMY_TYPES['swarm'],hp:Math.round(e.maxHp*.2),spd:ENEMY_TYPES['swarm'].spd,reward:Math.round(e.reward*.2),rew:Math.round(e.reward*.2),typeid:'swarm',col:ENEMY_TYPES['swarm'].col,shape:'circle',size:6,armor:0,flying:false,stealth:false,heals:false,splits:false,rages:false,boss:false,name:'Swarm'});ne.x=e.x;ne.y=e.y;ne.distTraveled=e.distTraveled;}}
      for(let k=0;k<(e.boss?40:e.size>12?20:10);k++){const pg=scene.add.graphics().setDepth(70);pg.fillStyle(k%2===0?e.colNum:0xffffff,1);pg.fillCircle(0,0,e.boss?5:e.size>12?3.5:2.5);pg.setPosition(e.x,e.y);particles.push({g:pg,x:e.x,y:e.y,vx:(Math.random()-.5)*(e.boss?280:180),vy:(Math.random()-.9)*(e.boss?300:210),life:Math.random()*.9+.3,maxLife:1.4});}
      emitBurst(scene,e.x,e.y,e.colNum);
      if(e.boss)scene.cameras.main.shake(500,.018);
      cleanupEnemy(e);if(idx>=0&&idx<enemies.length)enemies.splice(idx,1);
    }
    function cleanupEnemy(e){e.g.destroy();e.hpBar.destroy();e.fx.destroy();e.trail.destroy();}
    function emitBurst(sc,x,y,col){const g=sc.add.graphics().setPosition(x,y).setDepth(80);g.lineStyle(2.5,col,.85);g.strokeCircle(0,0,5);sc.tweens.add({targets:g,scaleX:5.5,scaleY:5.5,alpha:0,duration:380,ease:'Cubic.Out',onComplete:()=>g.destroy()});}
    function addKillFeed(name,gold,isBoss){if(!scene)return;const t=scene.add.text(W-6,TOP_H+6+killFeedTexts.length*14,`${isBoss?'💀 ':''}${name} +${gold}g`,{fontSize:'9px',color:isBoss?'#ffd700':'rgba(255,255,255,.55)',fontFamily:'monospace',stroke:'#000',strokeThickness:2}).setOrigin(1,0).setDepth(98);killFeedTexts.push(t);scene.tweens.add({targets:t,alpha:0,delay:2500,duration:600,onComplete:()=>{t.destroy();killFeedTexts=killFeedTexts.filter(x=>x!==t);}});killFeedTexts.forEach((tt,i)=>{tt.y=TOP_H+6+i*14;});}
    function showFloat(sc,txt,x,y,col){if(!sc)return;const t=sc.add.text(x,y,txt,{fontSize:'12px',color:col,fontFamily:'monospace',fontStyle:'bold',stroke:'#000',strokeThickness:3}).setOrigin(0.5).setDepth(200);sc.tweens.add({targets:t,y:y-36,alpha:0,duration:1500,onComplete:()=>t.destroy()});}
    function showFloat2(sc,txt,x,y,col){if(!sc)return;const t=sc.add.text(x,y,txt,{fontSize:'16px',color:col||'#fff',fontFamily:'monospace',fontStyle:'bold',stroke:'#000',strokeThickness:4}).setOrigin(0.5).setDepth(200);sc.tweens.add({targets:t,y:y-50,alpha:0,duration:2000,ease:'Cubic.Out',onComplete:()=>t.destroy()});}

    function triggerGameOver(){
      if(gameOver)return; gameOver=true; removeAllOverlays();
      const name=_ctx?.loadProfile?.()?.name||'Commandant';
      saveScore({name,score,wave:waveIdx,kills:killCount,towers:towers.length,ts:Date.now(),mode:'solo'});
      const ov=document.createElement('div');
      ov.style.cssText='position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:rgba(0,0,0,.92);z-index:500;font-family:monospace';
      ov.innerHTML=`<div style="font-size:40px">💀</div>
        <div style="font-size:24px;font-weight:900;color:#ef4444">GAME OVER</div>
        <div style="font-size:18px;color:#f59e0b;font-weight:700">${score.toLocaleString()} pts</div>
        <div style="font-size:11px;color:rgba(255,255,255,.4)">${killCount} kills · Vague ${waveIdx}/${WAVE_SCRIPT.length}</div>
        <button id="go-replay" style="margin-top:8px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);border:none;color:#fff;font-weight:800;padding:12px 26px;border-radius:10px;cursor:pointer;font-family:monospace;font-size:13px">↺ REJOUER</button>`;
      container.appendChild(ov);
      ov.querySelector('#go-replay').onclick=()=>{ov.remove();_destroyGame();renderSoloGame(container);};
    }

    function triggerVictory(){
      if(gameOver)return; gameOver=true; removeAllOverlays();
      const name=_ctx?.loadProfile?.()?.name||'Commandant';
      saveScore({name,score,wave:WAVE_SCRIPT.length,kills:killCount,towers:towers.length,ts:Date.now(),mode:'solo',victory:true});
      const ov=document.createElement('div');
      ov.style.cssText='position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:rgba(0,0,0,.92);z-index:500;font-family:monospace';
      ov.innerHTML=`<div style="font-size:40px">🏆</div>
        <div style="font-size:28px;font-weight:900;color:#ffd700">VICTOIRE !</div>
        <div style="font-size:18px;color:#f59e0b;font-weight:700">${score.toLocaleString()} pts</div>
        <div style="font-size:11px;color:rgba(255,255,255,.4)">${killCount} kills · 20 vagues !</div>
        <button id="go-replay" style="margin-top:8px;background:linear-gradient(135deg,#fbbf24,#d97706);border:none;color:#000;font-weight:800;padding:12px 26px;border-radius:10px;cursor:pointer;font-family:monospace;font-size:13px">↺ REJOUER</button>`;
      container.appendChild(ov);
      ov.querySelector('#go-replay').onclick=()=>{ov.remove();_destroyGame();renderSoloGame(container);};
    }

    const config={type:Phaser.AUTO,width:W,height:H,parent:container,backgroundColor:'#07080e',scene:{preload,create,update},scale:{mode:Phaser.Scale.NONE}};
    _game=new Phaser.Game(config);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── MODE VS ───────────────────────────────────────────────────────────────
  // Chaque joueur voit SON propre terrain (qu'il gère)
  // Bouton switch pour voir le terrain adverse (brouillard de guerre)
  // Sync : seulement les événements (spawn attaquant, vie perdue)
  // ══════════════════════════════════════════════════════════════════════════
  // ══════════════════════════════════════════════════════════════════════════
  // ── MODE VS ───────────────────────────────────────────────────────────────
  // Architecture simple :
  // - Chaque joueur voit son propre terrain
  // - Les attaquants achetés sont envoyés via ctx.send à chaque vague
  // - La session est persistée dans localStorage pour survie aux re-renders
  // ══════════════════════════════════════════════════════════════════════════

  // ══════════════════════════════════════════════════════════════════════════
  // ── MODE VS v3 ────────────────────────────────────────────────────────────
  // - Shop inter-vagues synchronisé (les deux doivent cliquer "Lancer")
  // - 12 tours comme en solo + upgrades défense entre vagues
  // - Attaque = upgrades des attaquants de la prochaine vague
  // - Espion : terrain toujours visible, nouvelles tours révélées par attaquants
  // ══════════════════════════════════════════════════════════════════════════

  function _startVSGame(container, sess){
    _destroyGame();
    container.innerHTML='';
    container.style.cssText='flex:1;overflow:hidden;position:relative;background:#07080e';
    _loadPhaser(()=>renderVSGame(container, sess));
  }

  function renderVSGame(container, sess){
    const Phaser=window.Phaser;
    const W=container.offsetWidth||360, H=container.offsetHeight||520;
    const BAR_H=36, TOP_H=44; // barre du bas fine (sélecteur tour uniquement)

    // Chemin
    function makePathPts(){const m=20,GH=H-BAR_H-TOP_H;return[{x:m,y:TOP_H-30},{x:m,y:TOP_H+GH*.15},{x:W*.48,y:TOP_H+GH*.15},{x:W*.48,y:TOP_H+GH*.38},{x:W*.18,y:TOP_H+GH*.38},{x:W*.18,y:TOP_H+GH*.62},{x:W*.70,y:TOP_H+GH*.62},{x:W*.70,y:TOP_H+GH*.82},{x:W-m,y:TOP_H+GH*.82},{x:W-m,y:H+30}];}
    function buildPD(pts){const s=[];let t=0;for(let i=0;i<pts.length-1;i++){const l=Math.hypot(pts[i+1].x-pts[i].x,pts[i+1].y-pts[i].y);s.push(l);t+=l;}return{pts,segLengths:s,total:t};}
    function posOnPath(pd,d){let r=Math.max(0,d);for(let i=0;i<pd.segLengths.length;i++){const sl=pd.segLengths[i];if(r<=sl){const t2=r/sl;return{x:pd.pts[i].x+t2*(pd.pts[i+1].x-pd.pts[i].x),y:pd.pts[i].y+t2*(pd.pts[i+1].y-pd.pts[i].y),done:false};}r-=sl;}return{x:pd.pts[pd.pts.length-1].x,y:pd.pts[pd.pts.length-1].y,done:true};}
    function isOnPath(pd,x,y,rad=28){for(let i=0;i<pd.pts.length-1;i++){const a=pd.pts[i],b=pd.pts[i+1],dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy;if(!l2)continue;const t2=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/l2));if((x-a.x-t2*dx)**2+(y-a.y-t2*dy)**2<rad*rad)return true;}return false;}

    const pathPts=makePathPts(), pd=buildPD(pathPts);

    // ── État ─────────────────────────────────────────────────
    let myGoldDef=sess.myGoldDef||200;
    let myGoldAtk=sess.myGoldAtk||80;
    let myLives=sess.myLives||30;
    let opponentLives=sess.opponentLives||30;
    // Attaquants prévus pour la prochaine vague : {type, count, hpMult, spdMult}
    let nextWaveAttackers=sess.nextWaveAttackers||[
      {type:'grunt',count:3,hpMult:1,spdMult:1},
    ];
    // Upgrades globales défense
    let defUpgrades=sess.defUpgrades||{};
    let defMods={dmgMult:0,rangeMult:0,rateMult:0,goldBonus:0,detectStealth:false};
    Object.entries(defUpgrades).forEach(([id,n])=>{for(let i=0;i<n;i++)_applyDefUpg(id);});

    let waveIdx=sess.waveIdx||0;
    let myKills=0, myScore=0;
    let gameOver=false, shopIsOpen=false;
    let selectedTower='archer';
    let myTowers=[], myEnemies=[], myBullets=[];
    let hudTexts={}, shopOverlay=null, sc=null;

    function _applyDefUpg(id){
      const u=GLOBAL_UPGRADES.find(x=>x.id===id);if(!u)return;
      const e=u.effect;
      if(e.dmgMult)defMods.dmgMult+=e.dmgMult;
      if(e.rangeMult)defMods.rangeMult+=e.rangeMult;
      if(e.rateMult)defMods.rateMult+=e.rateMult;
      if(e.goldBonus)defMods.goldBonus+=e.goldBonus;
      if(e.detectStealth)defMods.detectStealth=true;
    }
    function effR(cfg){return cfg.range*(1+defMods.rangeMult);}
    function effD(cfg){return cfg.dmg*(1+defMods.dmgMult);}
    function effRate(cfg){return cfg.rate*(1+defMods.rateMult);}

    function saveState(){
      const s=getVSSession()||sess;
      Object.assign(s,{myGoldDef,myGoldAtk,myLives,opponentLives,waveIdx,nextWaveAttackers,defUpgrades,status:'active'});
      setVSSession(s);
    }

    // ── Communication VS ─────────────────────────────────────
    // Tours locales exposées via broadcastData() (heartbeat 5s, non rate-limité)
    function refreshBroadcast(){
      _myTowersBroadcast=myTowers.map(t=>({x:t.x,y:t.y,type:t.type,level:t.level}));
    }

    function vsSend(type,payload){
      if(_ctx&&_ctx.send)try{_ctx.send('td:'+type,{...payload,gid:sess.gameId});}catch(e){}
    }

    // Attaquants envoyés avec délai > GAP(3s)
    function sendAttackers(atkList){
      if(!atkList||!atkList.length)return;
      // Simuler localement pour révéler le brouillard adverse
      atkList.forEach(a=>{
        const def=ATTACKER_DEFS[a.type];
        if(def){
          const count=a.count||1;
          for(let i=0;i<count;i++)
            myAtkInFlight.push({dist:i*300, spd:def.spd*(a.spdMult||1), done:false});
        }
      });
      // Envoyer avec délai > GAP=3s pour éviter le rate limiter
      setTimeout(()=>vsSend('atk',{list:atkList}),4000);
    }

    let _readyReceived=false,_goReceived=false;
    let _shopReadyReceived=false;

    if(_ctx&&_ctx.onReceive){
      _ctx.onReceive((type,data)=>{
        if(!type.startsWith('td:'))return;
        if(data.gid&&data.gid!==sess.gameId)return;
        const t=type.slice(3);

        if(t==='ready'){
          _readyReceived=true;
          if(sess.role==='host'){
            const startAt=Date.now()+3500;
            vsSend('go',{startAt});
            scheduleFirstWave(startAt);
          }
        }
        if(t==='go'&&!_goReceived){
          _goReceived=true;
          scheduleFirstWave(data.startAt);
        }
        if(t==='atk'){
          if(gameOver||!sc)return;
          (data.list||[]).forEach(a=>{
            const def=ATTACKER_DEFS[a.type];if(!def)return;
            spawnEnemy(sc,{...def,typeid:a.type,
              hp:Math.round(def.hp*(a.hpMult||1)*(1+waveIdx*.12)),
              spd:Math.min(def.spd*(a.spdMult||1)+waveIdx*1.5,170),
              reward:Math.round(def.reward*(1+waveIdx*.1))});
          });
        }
        if(t==='shopready'){
          // L'adversaire a cliqué "Lancer"
          _shopReadyReceived=true;
          tryLaunchNextWave();
        }
        if(t==='wave'){
          // L'hôte lance la vague → le guest suit
          if(sess.role==='guest')launchWave(sc,data.waveIdx);
        }
        if(t==='gameover'){
          if(!gameOver){gameOver=true;triggerWin();}
        }
      });
    }

    // ── Shop inter-vagues synchronisé ─────────────────────────
    let _myShopReady=false;

    function showInterWaveShop(){
      shopIsOpen=true; _myShopReady=false; _shopReadyReceived=false;
      removeShopOv();

      const ov=document.createElement('div');
      ov.style.cssText='position:absolute;inset:0;z-index:500;background:rgba(5,7,16,.97);overflow-y:auto;font-family:monospace;display:flex;flex-direction:column';
      container.appendChild(ov); shopOverlay=ov;

      // Tabs Défense / Attaque
      let shopTab='defense';
      function renderShop(){
        ov.innerHTML='';
        // Header
        const hdr=document.createElement('div');
        hdr.style.cssText='padding:10px 12px 0;flex-shrink:0';
        hdr.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <div style="font-size:13px;font-weight:700;color:#f59e0b">🏪 Entre-vague ${waveIdx}</div>
          <div style="font-size:10px;color:rgba(255,255,255,.4)">💰${myGoldDef} ⚔️${myGoldAtk}</div>
        </div>
        <div style="display:flex;gap:6px;margin-bottom:10px">
          <button id="tab-def" style="flex:1;padding:7px;background:${shopTab==='defense'?'rgba(96,165,250,.2)':'rgba(255,255,255,.05)'};border:1px solid ${shopTab==='defense'?'#60a5fa':'rgba(255,255,255,.1)'};color:${shopTab==='defense'?'#60a5fa':'rgba(255,255,255,.5)'};border-radius:8px;cursor:pointer;font-family:monospace;font-size:11px;font-weight:700">🗼 Défense</button>
          <button id="tab-atk" style="flex:1;padding:7px;background:${shopTab==='attack'?'rgba(239,68,68,.2)':'rgba(255,255,255,.05)'};border:1px solid ${shopTab==='attack'?'#ef4444':'rgba(255,255,255,.1)'};color:${shopTab==='attack'?'#ef4444':'rgba(255,255,255,.5)'};border-radius:8px;cursor:pointer;font-family:monospace;font-size:11px;font-weight:700">⚔️ Attaque</button>
        </div>`;
        ov.appendChild(hdr);
        hdr.querySelector('#tab-def').onclick=()=>{shopTab='defense';renderShop();};
        hdr.querySelector('#tab-atk').onclick=()=>{shopTab='attack';renderShop();};

        const body=document.createElement('div');
        body.style.cssText='flex:1;overflow-y:auto;padding:0 12px 10px';
        ov.appendChild(body);

        if(shopTab==='defense'){
          renderDefenseShop(body);
        } else {
          renderAttackShop(body);
        }

        // Bouton lancer
        const footer=document.createElement('div');
        footer.style.cssText='flex-shrink:0;padding:10px 12px';
        footer.innerHTML=`
          <div id="shop-status" style="font-size:10px;color:rgba(255,255,255,.4);text-align:center;margin-bottom:8px">
            ${_myShopReady?'✓ Vous êtes prêt · ':''} ${_shopReadyReceived?'✓ Adversaire prêt':'⌛ Attente adversaire…'}
          </div>
          <button id="shop-launch" style="width:100%;padding:11px;background:${_myShopReady?'rgba(100,100,100,.2)':'linear-gradient(135deg,rgba(245,158,11,.2),rgba(245,158,11,.08))'};border:1px solid ${_myShopReady?'rgba(255,255,255,.1)':'rgba(245,158,11,.5)'};color:${_myShopReady?'rgba(255,255,255,.3)':'#f59e0b'};border-radius:10px;cursor:${_myShopReady?'default':'pointer'};font-family:monospace;font-size:13px;font-weight:700">
            ${_myShopReady?'✓ Prêt — en attente de l\'adversaire…':'▶ Prêt — Lancer la vague →'}
          </button>`;
        ov.appendChild(footer);
        footer.querySelector('#shop-launch').onclick=()=>{
          if(_myShopReady)return;
          _myShopReady=true;
          vsSend('shopready',{});
          renderShop(); // refresh pour montrer état
          tryLaunchNextWave();
        };
      }

      renderShop();

      function renderDefenseShop(body){
        body.innerHTML='<div style="font-size:10px;color:rgba(255,255,255,.35);margin-bottom:8px">Améliorations globales (répétables) · 💰 Or défense</div>';
        const pool=GLOBAL_UPGRADES.filter(u=>!(u.unique&&defUpgrades[u.id]));
        const offers=pool.sort(()=>Math.random()-.5).slice(0,4).map(u=>{
          const times=defUpgrades[u.id]||0;
          const cost=Math.round(u.cost*Math.pow(1.6,times));
          return{...u,cost,times};
        });
        offers.forEach(u=>{
          const can=myGoldDef>=u.cost;
          const d=document.createElement('div');
          d.style.cssText='padding:9px 10px;border-radius:9px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);margin-bottom:8px';
          d.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <span style="font-size:13px">${u.emoji} <strong style="color:#fff;font-size:11px">${u.name}</strong>${u.times>0?` <span style="color:rgba(255,255,255,.3);font-size:8px">×${u.times+1}</span>`:''}</span>
            <span style="font-size:11px;color:#60a5fa">${u.cost}💰</span></div>
          <div style="font-size:9px;color:rgba(255,255,255,.4);margin-bottom:7px">${u.desc}</div>
          <button data-upg="${u.id}" data-cost="${u.cost}" style="width:100%;padding:6px;background:${can?'rgba(96,165,250,.15)':'rgba(100,100,100,.1)'};border:1px solid ${can?'#60a5fa':'#444'};color:${can?'#60a5fa':'#555'};border-radius:7px;cursor:${can?'pointer':'default'};font-size:10px;font-family:monospace">${can?`✓ Acheter (${u.cost}💰)`:`✗ ${u.cost}💰 requis`}</button>`;
          body.appendChild(d);
          const btn=d.querySelector('[data-upg]');
          btn.onclick=()=>{
            if(myGoldDef<u.cost)return;
            myGoldDef-=u.cost;
            defUpgrades[u.id]=(defUpgrades[u.id]||0)+1;
            _applyDefUpg(u.id);
            if(u.effect.livesBonus){myLives+=u.effect.livesBonus;updateHUD();}
            updateHUD(); renderShop();
          };
        });
      }

      function renderAttackShop(body){
        body.innerHTML='<div style="font-size:10px;color:rgba(255,255,255,.35);margin-bottom:8px">Améliorez les attaquants de la prochaine vague · ⚔️ Or attaque</div>';

        // Afficher les attaquants prévus avec options d'upgrade
        nextWaveAttackers.forEach((atk,idx)=>{
          const def=ATTACKER_DEFS[atk.type];if(!def)return;
          const d=document.createElement('div');
          d.style.cssText='padding:9px 10px;border-radius:9px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);margin-bottom:8px';
          d.innerHTML=`<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
            <span style="font-size:18px">${def.emoji}</span>
            <div><div style="font-size:12px;font-weight:700;color:#fff">${def.name} ×${atk.count}</div>
            <div style="font-size:9px;color:rgba(255,255,255,.4)">HP ×${atk.hpMult.toFixed(1)} · Vitesse ×${atk.spdMult.toFixed(1)}</div></div></div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px">
            <button data-mod="count" data-idx="${idx}" style="padding:5px;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);color:#f59e0b;border-radius:6px;cursor:pointer;font-size:9px;font-family:monospace">+1 envoi<br><span style="font-size:8px">${20}⚔️</span></button>
            <button data-mod="hp" data-idx="${idx}" style="padding:5px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:#ef4444;border-radius:6px;cursor:pointer;font-size:9px;font-family:monospace">+25% HP<br><span style="font-size:8px">${25}⚔️</span></button>
            <button data-mod="spd" data-idx="${idx}" style="padding:5px;background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.3);color:#fbbf24;border-radius:6px;cursor:pointer;font-size:9px;font-family:monospace">+20% vit.<br><span style="font-size:8px">${20}⚔️</span></button>
          </div>`;
          body.appendChild(d);
          d.querySelectorAll('[data-mod]').forEach(btn=>{
            const costs={count:20,hp:25,spd:20};
            btn.onclick=()=>{
              const mod=btn.dataset.mod;
              const cost=costs[mod];
              if(myGoldAtk<cost)return;
              myGoldAtk-=cost;
              if(mod==='count')atk.count++;
              else if(mod==='hp')atk.hpMult=+(atk.hpMult*1.25).toFixed(2);
              else atk.spdMult=+(atk.spdMult*1.20).toFixed(2);
              updateHUD(); renderShop();
            };
          });
        });

        // Ajouter un nouveau type d'attaquant
        const addDiv=document.createElement('div');
        addDiv.style.cssText='margin-top:4px';
        addDiv.innerHTML='<div style="font-size:10px;color:rgba(255,255,255,.3);margin-bottom:6px">Ajouter un type d\'attaquant :</div>';
        const sel=document.createElement('select');
        sel.style.cssText='width:100%;padding:7px;background:#0a0d1a;border:1px solid rgba(255,255,255,.15);color:#fff;border-radius:8px;font-family:monospace;font-size:11px;margin-bottom:6px';
        Object.entries(ATTACKER_DEFS).forEach(([id,a])=>{
          const opt=document.createElement('option');
          opt.value=id; opt.textContent=`${a.emoji} ${a.name} — ${a.desc}`;
          sel.appendChild(opt);
        });
        addDiv.appendChild(sel);
        const addBtn=document.createElement('button');
        addBtn.style.cssText='width:100%;padding:7px;background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.35);color:#ef4444;border-radius:8px;cursor:pointer;font-family:monospace;font-size:11px;font-weight:700';
        addBtn.textContent=`+ Ajouter ce type (40⚔️)`;
        addBtn.onclick=()=>{
          if(myGoldAtk<40)return;
          myGoldAtk-=40;
          const existing=nextWaveAttackers.find(a=>a.type===sel.value);
          if(existing)existing.count++;
          else nextWaveAttackers.push({type:sel.value,count:1,hpMult:1,spdMult:1});
          updateHUD(); renderShop();
        };
        addDiv.appendChild(addBtn);
        body.appendChild(addDiv);
      }

      function tryLaunchNextWave(){
        if(!_myShopReady||!_shopReadyReceived)return;
        removeShopOv();
        shopIsOpen=false;
        if(sess.role==='host'){
          const startAt=Date.now()+2000;
          vsSend('wave',{waveIdx,startAt});
          setTimeout(()=>launchWave(sc,waveIdx),2000);
        }
        // Le guest attend td:wave
      }
    }

    // ── Vagues ───────────────────────────────────────────────
    const AUTO_WAVE=[
      [{type:'grunt',count:6,delay:650}],
      [{type:'grunt',count:8,delay:550},{type:'fast',count:4,delay:400,offset:3000}],
      [{type:'swarm',count:20,delay:200},{type:'tank',count:2,delay:2000,offset:3500}],
      [{type:'fast',count:12,delay:300},{type:'armored',count:3,delay:1200,offset:3000}],
      [{type:'stealth',count:8,delay:500},{type:'grunt',count:12,delay:400,offset:2000}],
      [{type:'healer',count:4,delay:1200},{type:'tank',count:3,delay:2000,offset:1500}],
      [{type:'boss',count:1,delay:5000}],
      [{type:'armored',count:10,delay:600},{type:'fast',count:15,delay:250,offset:4000}],
    ];

    function scheduleFirstWave(startAt){
      const delay=Math.max(500,startAt-Date.now());
      // Compte à rebours
      let rem=Math.ceil(delay/1000);
      const tick=setInterval(()=>{
        rem--;
        if(rem>0&&sc)showFloat2(sc,String(rem),W/2,H*.4,'#fbbf24');
        else clearInterval(tick);
      },1000);
      if(sc)showFloat2(sc,'⚔️ VS — GO !',W/2,H*.35,'#ef4444');
      setTimeout(()=>launchWave(sc,0),delay);
    }

    function launchWave(psc,idx){
      if(gameOver||!psc)return;
      waveIdx=idx+1;
      if(hudTexts.wave)hudTexts.wave.setText('Vague '+waveIdx);
      showFloat2(psc,waveIdx===1?'⚔️ Vague 1 !':'⚔️ Vague '+waveIdx,W/2,H*.35,'#ef4444');

      const ws=AUTO_WAVE[(waveIdx-1)%AUTO_WAVE.length];
      const scale=1+Math.max(0,waveIdx-2)*.18;

      // Spawner ennemis auto sur MON chemin
      ws.forEach(sq=>{
        for(let i=0;i<sq.count;i++){
          setTimeout(()=>{
            if(gameOver||!sc)return;
            const def=ATTACKER_DEFS[sq.type]||ATTACKER_DEFS.grunt;
            spawnEnemy(sc,{...def,typeid:sq.type,
              hp:Math.round(def.hp*scale),
              spd:Math.min(def.spd+waveIdx*2,160),
              reward:Math.round(def.reward*scale)});
          },(sq.offset||0)+i*sq.delay);
        }
      });

      // Envoyer mes attaquants achetés sur le terrain adverse (délai > GAP 3s)
      sendAttackers(nextWaveAttackers.map(a=>({...a})));
      saveState();

      // Fin de vague : attendre que tous les ennemis soient morts ou partis, puis shop
      const waveMaxDur=(ws.reduce((mx,sq)=>Math.max(mx,(sq.offset||0)+sq.count*sq.delay),0))+6000;
      setTimeout(()=>{
        if(gameOver)return;
        // Attendre que le chemin soit vide
        const checkEmpty=()=>{
          if(gameOver)return;
          if(myEnemies.length>0){setTimeout(checkEmpty,1500);return;}
          const bonus=50+waveIdx*12;
          myGoldDef+=bonus; myGoldAtk+=Math.round(bonus*.4); updateHUD();
          showFloat2(sc,`+${bonus}💰 +${Math.round(bonus*.4)}⚔️`,W/2,H*.35,'#10b981');
          setTimeout(()=>showInterWaveShop(),1000);
        };
        checkEmpty();
      },waveMaxDur);
    }

    // ── Phaser create / update ────────────────────────────────
    function create(){
      sc=this;
      drawBg(this); drawPath(this);
      createHUD(this); createTowerSelector(this);

      this.input.on('pointerdown',ptr=>{
        if(gameOver||shopIsOpen)return;
        const{x,y}=ptr;
        const ct=myTowers.find(t=>Math.hypot(t.x-x,t.y-y)<22);
        if(ct){showTowerMenu(ct);return;}
        if(y>H-BAR_H||y<TOP_H)return;
        if(isOnPath(pd,x,y)){showFloat(this,'Chemin!',x,y-28,'#fbbf24');return;}
        if(myTowers.some(t=>Math.hypot(t.x-x,t.y-y)<36)){showFloat(this,'Trop proche!',x,y-28,'#fbbf24');return;}
        const cfg=TOWER_DEFS[selectedTower];
        if(myGoldDef<cfg.cost){showFloat(this,'Pas assez 💰',x,y-28,'#ef4444');return;}
        myGoldDef-=cfg.cost; placeTower(this,x,y,selectedTower); updateHUD();
        refreshBroadcast();
      });

      showFloat2(this,'⚔️ VS — En attente…',W/2,H*.35,'rgba(255,255,255,.5)');
      if(sess.role==='guest'){
        setTimeout(()=>vsSend('ready',{}),800);
        setTimeout(()=>{if(!_goReceived){_goReceived=true;scheduleFirstWave(Date.now()+2000);}},18000);
      } else {
        setTimeout(()=>{if(!_readyReceived){scheduleFirstWave(Date.now()+2000);}},22000);
      }
    }

    function drawBg(s){
      const bg=s.add.graphics();bg.fillStyle(0x07080e);bg.fillRect(0,0,W,H);
      const gr=s.add.graphics();gr.lineStyle(0.5,0xffffff,0.025);
      for(let x=0;x<W;x+=36)gr.lineBetween(x,0,x,H);
      for(let y=0;y<H;y+=36)gr.lineBetween(0,y,W,y);
    }
    function drawPath(s){
      const g=s.add.graphics();
      g.lineStyle(44,0x1a2040,1);g.beginPath();pathPts.forEach((p,i)=>i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y));g.strokePath();
      g.lineStyle(36,0x131628,1);g.beginPath();pathPts.forEach((p,i)=>i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y));g.strokePath();
      g.lineStyle(2,0xef4444,.4);g.beginPath();pathPts.forEach((p,i)=>i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y));g.strokePath();
    }

    // ── HUD ──────────────────────────────────────────────────
    let spyMode=false, spyOverlay=null;

    function createHUD(s){
      const hg=s.add.graphics().setDepth(90);hg.fillStyle(0x000000,.9);hg.fillRect(0,0,W,TOP_H);
      hudTexts.myLives=s.add.text(6,3,'❤️ '+myLives,{fontSize:'11px',color:'#ef4444',fontFamily:'monospace'}).setDepth(91);
      hudTexts.opLives=s.add.text(6,17,'👤 '+opponentLives,{fontSize:'10px',color:'rgba(255,255,255,.4)',fontFamily:'monospace'}).setDepth(91);
      hudTexts.myGDef=s.add.text(W/2,3,'💰 '+myGoldDef,{fontSize:'11px',color:'#60a5fa',fontFamily:'monospace'}).setOrigin(0.5,0).setDepth(91);
      hudTexts.myGAtk=s.add.text(W/2,17,'⚔️ '+myGoldAtk,{fontSize:'10px',color:'#f59e0b',fontFamily:'monospace'}).setOrigin(0.5,0).setDepth(91);
      hudTexts.wave=s.add.text(W-6,3,'Vague '+waveIdx,{fontSize:'10px',color:'rgba(255,255,255,.35)',fontFamily:'monospace'}).setOrigin(1,0).setDepth(91);
      const back=s.add.text(W-6,17,'✕',{fontSize:'10px',color:'rgba(255,255,255,.3)',fontFamily:'monospace'}).setOrigin(1,0).setDepth(91).setInteractive();
      back.on('pointerdown',()=>{saveState();removeShopOv();removeSpyOv();_destroyGame();container.innerHTML='';renderModeSelect(container);});
      // Bouton espion HTML
      const spyBtn=document.createElement('button');
      spyBtn.style.cssText='position:absolute;left:50%;top:'+TOP_H+'px;transform:translateX(-50%);padding:3px 12px;background:rgba(0,0,0,.8);border:1px solid rgba(239,68,68,.4);color:rgba(239,68,68,.8);border-radius:0 0 8px 8px;cursor:pointer;font-family:monospace;font-size:9px;font-weight:700;z-index:95;letter-spacing:1px';
      spyBtn.textContent='👁 ESPIONNER';
      spyBtn.onclick=()=>spyMode?closeSpyOv():openSpyOv();
      container.appendChild(spyBtn);
      hudTexts.spyBtn=spyBtn;
    }
    function updateHUD(){
      if(hudTexts.myLives)hudTexts.myLives.setText('❤️ '+myLives);
      if(hudTexts.opLives)hudTexts.opLives.setText('👤 '+opponentLives);
      if(hudTexts.myGDef)hudTexts.myGDef.setText('💰 '+myGoldDef);
      if(hudTexts.myGAtk)hudTexts.myGAtk.setText('⚔️ '+myGoldAtk);
      if(hudTexts.wave)hudTexts.wave.setText('Vague '+waveIdx);
    }

    // ── Sélecteur de tour (menu déroulant HTML) ───────────────
    function createTowerSelector(s){
      const barY=H-BAR_H;
      const bg=s.add.graphics().setDepth(90);
      bg.fillStyle(0x000000,.93);bg.fillRect(0,barY,W,BAR_H);
      bg.lineStyle(1,0x333344,.5);bg.lineBetween(0,barY,W,barY);

      // Menu déroulant HTML pour les tours (toutes les 12)
      const wrap=document.createElement('div');
      wrap.style.cssText='position:absolute;left:8px;right:8px;bottom:4px;z-index:91;display:flex;align-items:center;gap:6px';
      const sel=document.createElement('select');
      sel.style.cssText='flex:1;padding:5px 8px;background:#0a0d1a;border:1px solid rgba(96,165,250,.3);color:#60a5fa;border-radius:8px;font-family:monospace;font-size:11px;font-weight:700';
      Object.entries(TOWER_DEFS).forEach(([id,t])=>{
        const opt=document.createElement('option');
        opt.value=id;
        opt.textContent=`${t.emoji} ${t.name} — ${t.cost}💰`;
        sel.appendChild(opt);
      });
      sel.value=selectedTower;
      sel.onchange=()=>{selectedTower=sel.value;};
      wrap.appendChild(sel);
      // Info coût
      const info=document.createElement('div');
      info.style.cssText='font-size:10px;color:rgba(255,255,255,.4);font-family:monospace;white-space:nowrap';
      info.textContent='← tap';
      wrap.appendChild(info);
      container.appendChild(wrap);
    }

    // ── Vue espion ───────────────────────────────────────────
    // Zones révélées = segments du chemin traversés par MES attaquants
    const FOG=16;
    const fogRevealedSegs=new Set(sess.fogReveal||[]);
    // Tours adverses connues (toutes les tours, révélées si elles sont dans une zone révélée)
    let _knownOpTowers=[];

    function openSpyOv(){
      spyMode=true;
      if(hudTexts.spyBtn){hudTexts.spyBtn.textContent='🔙 MON TERRAIN';hudTexts.spyBtn.style.color='#60a5fa';hudTexts.spyBtn.style.borderColor='rgba(96,165,250,.4)';}
      spyOverlay=document.createElement('div');
      spyOverlay.style.cssText=`position:absolute;left:0;top:${TOP_H+20}px;right:0;bottom:${BAR_H}px;z-index:80;background:#07080e;overflow:hidden`;
      spyOverlay.innerHTML='<canvas id="spy-c" style="position:absolute;inset:0"></canvas><div style="position:absolute;top:4px;left:0;right:0;text-align:center;font-family:monospace;font-size:9px;color:rgba(239,68,68,.5);letter-spacing:2px">TERRAIN ADVERSE</div>';
      container.appendChild(spyOverlay);
      drawSpyCanvas();
    }
    function closeSpyOv(){
      spyMode=false;
      if(spyOverlay&&spyOverlay.parentNode)spyOverlay.remove();spyOverlay=null;
      if(hudTexts.spyBtn){hudTexts.spyBtn.textContent='👁 ESPIONNER';hudTexts.spyBtn.style.color='rgba(239,68,68,.8)';hudTexts.spyBtn.style.borderColor='rgba(239,68,68,.4)';}
    }
    function removeSpyOv(){if(spyOverlay&&spyOverlay.parentNode)spyOverlay.remove();spyOverlay=null;}

    function drawSpyCanvas(){
      if(!spyOverlay)return;
      const canvas=spyOverlay.querySelector('#spy-c');if(!canvas)return;
      const cw=container.offsetWidth,ch=container.offsetHeight-TOP_H-20-BAR_H;
      canvas.width=cw;canvas.height=ch;
      const ctx=canvas.getContext('2d');

      // Tours adverses depuis broadcastData (heartbeat 5s)
      const liveProf=window.YM_Social?._nearUsers?.get(sess.opponentUUID)?.profile;
      const allOpTowers=(liveProf&&liveProf.td_towers)||_knownOpTowers;
      if(allOpTowers.length>_knownOpTowers.length)_knownOpTowers=allOpTowers;

      // Fond
      ctx.fillStyle='#07080e';ctx.fillRect(0,0,cw,ch);
      ctx.strokeStyle='rgba(255,255,255,0.02)';ctx.lineWidth=0.5;
      for(let x=0;x<cw;x+=36){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,ch);ctx.stroke();}
      for(let y=0;y<ch;y+=36){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(cw,y);ctx.stroke();}

      // Chemin (toujours visible)
      const yOff=TOP_H+20;
      ctx.strokeStyle='rgba(30,20,40,1)';ctx.lineWidth=40;
      ctx.beginPath();pathPts.forEach((p,i)=>{const py=p.y-yOff;i?ctx.lineTo(p.x,py):ctx.moveTo(p.x,py);});ctx.stroke();
      ctx.strokeStyle='rgba(239,68,68,0.35)';ctx.lineWidth=2;
      ctx.beginPath();pathPts.forEach((p,i)=>{const py=p.y-yOff;i?ctx.lineTo(p.x,py):ctx.moveTo(p.x,py);});ctx.stroke();

      // Afficher TOUTES les tours dans les zones révélées
      // Une tour est révélée si elle est dans un segment traversé par mes attaquants
      _knownOpTowers.forEach(t=>{
        const ty=t.y-yOff;
        // Trouver dans quel segment ce point tombe (basé sur distance parcourue)
        // On cherche la position la plus proche sur le chemin
        let closest=0,minD=Infinity;
        pathPts.forEach((p)=>{const d=Math.hypot(p.x-t.x,p.y-(t.y));if(d<minD){minD=d;closest=p;}});
        // Calculer le segment
        let distT=0;
        for(let i=0;i<pathPts.length-1;i++){
          const sl=pd.segLengths[i];
          const a=pathPts[i],b=pathPts[i+1];
          const dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy;
          const proj=l2?Math.max(0,Math.min(1,((t.x-a.x)*dx+(t.y-a.y)*dy)/l2)):0;
          const px=a.x+proj*dx,py2=a.y+proj*dy;
          if(Math.hypot(t.x-px,t.y-py2)<40){distT+=proj*sl;break;}
          distT+=sl;
        }
        const seg=Math.min(FOG-1,Math.floor((distT/pd.total)*FOG));

        if(fogRevealedSegs.has(seg)){
          // Tour visible dans cette zone
          const cfg=TOWER_DEFS[t.type];if(!cfg)return;
          const col='#'+cfg.col.toString(16).padStart(6,'0');
          ctx.beginPath();ctx.arc(t.x,ty,17,0,Math.PI*2);
          ctx.fillStyle='rgba(8,11,26,0.9)';ctx.fill();
          ctx.strokeStyle=col;ctx.lineWidth=t.level>=1?2.5:1.8;ctx.stroke();
          ctx.font='12px serif';ctx.textAlign='center';ctx.textBaseline='middle';
          ctx.fillText(cfg.emoji,t.x,ty);
          if(t.level>0){ctx.font='7px monospace';ctx.fillStyle='rgba(255,255,255,0.5)';ctx.fillText('N'+(t.level+1),t.x+16,ty-13);}
        } else {
          // Tour dans brouillard : juste un point flou
          ctx.beginPath();ctx.arc(t.x,ty,5,0,Math.PI*2);
          ctx.fillStyle='rgba(100,100,100,0.15)';ctx.fill();
        }
      });

      // Brouillard sur les zones non révélées
      const segH=ch/FOG;
      for(let seg=0;seg<FOG;seg++){
        if(!fogRevealedSegs.has(seg)){
          ctx.fillStyle='rgba(0,0,0,0.75)';ctx.fillRect(0,seg*segH,cw,segH);
        }
      }

      // Légende
      const revealed=fogRevealedSegs.size;
      ctx.font='9px monospace';ctx.fillStyle='rgba(255,255,255,.35)';ctx.textAlign='left';ctx.textBaseline='bottom';
      ctx.fillText(revealed===0?'Envoyez des attaquants pour révéler!':`${Math.round(revealed/FOG*100)}% révélé · ${_knownOpTowers.filter(t=>{
        let d=0;for(let i=0;i<pathPts.length-1;i++){const sl=pd.segLengths[i];const a=pathPts[i],b=pathPts[i+1];const l2=(b.x-a.x)**2+(b.y-a.y)**2;const p=l2?Math.max(0,Math.min(1,((t.x-a.x)*(b.x-a.x)+(t.y-a.y)*(b.y-a.y))/l2)):0;if(Math.hypot(t.x-a.x-p*(b.x-a.x),t.y-a.y-p*(b.y-a.y))<40){d+=p*sl;break;}d+=sl;}
        return fogRevealedSegs.has(Math.min(FOG-1,Math.floor((d/pd.total)*FOG)));
      }).length} tours vues`,6,ch-5);
    }

    // Révéler fog quand mes attaquants avancent (simulé localement)
    const myAtkInFlight=[];
    function revealFog(dist){
      const seg=Math.min(FOG-1,Math.floor((dist/pd.total)*FOG));
      if(!fogRevealedSegs.has(seg)){
        fogRevealedSegs.add(seg);
        if(spyMode)drawSpyCanvas();
        const s=getVSSession();if(s){s.fogReveal=[...fogRevealedSegs];setVSSession(s);}
      }
    }

    // ── Tours ────────────────────────────────────────────────
    function placeTower(s,x,y,type){
      const base=TOWER_DEFS[type];
      const cfg={...base,upgrades:JSON.parse(JSON.stringify(base.upg)),upg:undefined};
      const g=s.add.graphics().setPosition(x,y).setDepth(15);
      drawTGfx(g,cfg,0);
      g.setInteractive(new Phaser.Geom.Circle(0,0,20),Phaser.Geom.Circle.Contains);
      const ico=s.add.text(x,y-1,cfg.emoji,{fontSize:'12px'}).setOrigin(0.5).setDepth(16);
      const rg=s.add.graphics().setPosition(x,y).setDepth(9);rg.lineStyle(1,cfg.col,.1);rg.strokeCircle(0,0,effR(cfg));rg.visible=false;
      g.on('pointerover',()=>rg.visible=true);g.on('pointerout',()=>rg.visible=false);
      const lvl=s.add.text(x+13,y-13,'1',{fontSize:'7px',color:'#ffffff50',fontFamily:'monospace'}).setDepth(17);
      emitB(s,x,y,cfg.col);
      const t={x,y,type,cfg,g,ico,rg,lvlTxt:lvl,lastFire:0,level:0,totalDmg:0};
      myTowers.push(t); return t;
    }
    function drawTGfx(g,cfg,lv){
      g.clear();
      if(lv>=2){g.fillStyle(cfg.col,.1);g.fillCircle(0,0,22);}
      g.fillStyle(0x080b1a);g.fillCircle(0,0,19);g.fillStyle(0x111830);g.fillCircle(0,0,16);
      g.lineStyle(lv>=1?2.5:1.8,cfg.col,lv>=2?1:.8);g.strokeCircle(0,0,12);
      if(cfg.splash){g.fillStyle(cfg.col,.5);for(let k=0;k<3;k++){const a=k*Math.PI*2/3;g.fillCircle(Math.cos(a)*5,Math.sin(a)*5,2);}}
      else if(cfg.chain){g.lineStyle(1.5,cfg.col,.7);g.lineBetween(-6,-4,6,-4);g.lineBetween(-6,0,6,0);g.lineBetween(-6,4,6,4);}
      else if(cfg.pierce){g.lineStyle(2.5,cfg.col,.9);g.lineBetween(-7,0,7,0);}
      else{g.lineStyle(1.5,cfg.col,.5);g.lineBetween(-5,0,5,0);g.lineBetween(0,-5,0,5);}
    }

    function removeShopOv(){if(shopOverlay&&shopOverlay.parentNode)shopOverlay.remove();shopOverlay=null;shopIsOpen=false;}

    function showTowerMenu(tower){
      removeShopOv();shopIsOpen=true;
      const canvasEl=container.querySelector('canvas');
      const cRect=canvasEl?canvasEl.getBoundingClientRect():{width:W,height:H};
      const ox=Math.min(tower.x/(W/cRect.width),cRect.width-162);
      const oy=Math.max(tower.y/(H/cRect.height)-115,TOP_H+4);
      const colHex='#'+tower.cfg.col.toString(16).padStart(6,'0');
      const hasUpg=tower.level<(tower.cfg.upgrades||[]).length;
      const upg=hasUpg?tower.cfg.upgrades[tower.level]:null;
      const sell=Math.round(tower.cfg.cost*.6);
      const ov=document.createElement('div');
      ov.style.cssText=`position:absolute;left:${ox}px;top:${oy}px;width:158px;background:#050710;border:1px solid ${colHex}55;border-radius:10px;padding:10px;z-index:400;font-family:monospace`;
      ov.innerHTML=`<div style="display:flex;gap:6px;align-items:center;margin-bottom:8px"><span style="font-size:15px">${tower.cfg.emoji}</span><div><div style="font-size:12px;font-weight:700;color:#fff">${tower.cfg.name} Niv${tower.level+1}</div><div style="font-size:9px;color:rgba(255,255,255,.4)">${Math.round(tower.totalDmg)} dmg</div></div></div>
        ${hasUpg?`<button id="vs-upg" style="width:100%;padding:6px;background:${myGoldDef>=upg.cost?'rgba(16,185,129,.18)':'rgba(100,100,100,.1)'};border:1px solid ${myGoldDef>=upg.cost?'#10b981':'#444'};color:${myGoldDef>=upg.cost?'#10b981':'#555'};border-radius:6px;cursor:pointer;font-size:10px;font-family:monospace">${myGoldDef>=upg.cost?'↑ '+upg.label+' ('+upg.cost+'💰)':'✗ '+upg.cost+'💰'}</button>`:'<div style="font-size:9px;color:#f59e0b;text-align:center">✦ MAX</div>'}
        <button id="vs-sell" style="width:100%;padding:5px;background:rgba(239,68,68,.1);border:1px solid #ef444433;color:#ef4444;border-radius:6px;cursor:pointer;font-size:10px;margin-top:5px;font-family:monospace">💰 Vendre (${sell}💰)</button>
        <button id="vs-cl" style="width:100%;padding:4px;background:transparent;border:none;color:rgba(255,255,255,.25);cursor:pointer;font-size:10px;margin-top:3px">✕</button>`;
      container.appendChild(ov);shopOverlay=ov;
      ov.querySelector('#vs-cl').onclick=()=>removeShopOv();
      ov.querySelector('#vs-sell').onclick=()=>{
        myGoldDef+=sell;tower.g.destroy();tower.ico.destroy();tower.rg.destroy();tower.lvlTxt.destroy();
        myTowers=myTowers.filter(t=>t!==tower);updateHUD();removeShopOv();refreshBroadcast();
      };
      if(hasUpg){const ub=ov.querySelector('#vs-upg');if(ub)ub.onclick=()=>{
        if(myGoldDef<upg.cost)return;
        myGoldDef-=upg.cost;tower.level++;
        Object.keys(upg).forEach(k=>{if(k!=='cost'&&k!=='label')tower.cfg[k]=upg[k];});
        drawTGfx(tower.g,tower.cfg,tower.level);tower.rg.clear();tower.rg.lineStyle(1,tower.cfg.col,.12);tower.rg.strokeCircle(0,0,effR(tower.cfg));tower.lvlTxt.setText(''+(tower.level+1));
        emitB(sc,tower.x,tower.y,tower.cfg.col);updateHUD();removeShopOv();refreshBroadcast();
      };}
    }

    // ── Ennemis ──────────────────────────────────────────────
    function spawnEnemy(s,data){
      const colNum=parseInt(data.col.replace('#',''),16);
      const g=s.add.graphics().setDepth(10);
      const hpBar=s.add.graphics().setDepth(12);
      const start=posOnPath(pd,0);
      const e={g,hpBar,hp:data.hp,maxHp:data.hp,spd:data.spd,col:data.col,colNum,reward:data.reward,size:data.size||9,armor:data.armor||0,stealth:!!data.stealth,boss:!!data.boss,typeid:data.typeid,distTraveled:0,x:start.x,y:start.y,dead:false,slowTimer:0,slowFactor:1};
      g.fillStyle(colNum,1);
      if(data.boss){const pts=[];for(let k=0;k<6;k++){const a=k/6*Math.PI*2;pts.push({x:Math.cos(a)*e.size,y:Math.sin(a)*e.size});}g.beginPath();pts.forEach((p,i)=>i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y));g.closePath();g.fillPath();g.lineStyle(2,0xffd700,.8);g.beginPath();pts.forEach((p,i)=>i?g.lineTo(p.x,p.y):g.moveTo(p.x,p.y));g.closePath();g.strokePath();}
      else{g.fillCircle(0,0,e.size);g.lineStyle(1.5,0xffffff,.2);g.strokeCircle(0,0,e.size);}
      myEnemies.push(e);return e;
    }

    function emitB(s,x,y,col){const g=s.add.graphics().setPosition(x,y).setDepth(80);g.lineStyle(2.5,col,.85);g.strokeCircle(0,0,5);s.tweens.add({targets:g,scaleX:5,scaleY:5,alpha:0,duration:350,onComplete:()=>g.destroy()});}
    function showFloat(s,txt,x,y,col){if(!s)return;const t=s.add.text(x,y,txt,{fontSize:'12px',color:col,fontFamily:'monospace',fontStyle:'bold',stroke:'#000',strokeThickness:3}).setOrigin(0.5).setDepth(200);s.tweens.add({targets:t,y:y-36,alpha:0,duration:1500,onComplete:()=>t.destroy()});}
    function showFloat2(s,txt,x,y,col){if(!s)return;const t=s.add.text(x,y,txt,{fontSize:'16px',color:col||'#fff',fontFamily:'monospace',fontStyle:'bold',stroke:'#000',strokeThickness:4}).setOrigin(0.5).setDepth(200);s.tweens.add({targets:t,y:y-50,alpha:0,duration:2000,onComplete:()=>t.destroy()});}

    function update(time,delta){
      if(gameOver)return;
      const dt=delta/1000;

      // Attaquants en vol → révéler le brouillard adverse
      for(let i=myAtkInFlight.length-1;i>=0;i--){
        const a=myAtkInFlight[i];if(a.done)continue;
        a.dist+=a.spd*dt;revealFog(a.dist);
        if(a.dist>=pd.total){a.done=true;myAtkInFlight.splice(i,1);}
      }

      // Ennemis
      for(let i=myEnemies.length-1;i>=0;i--){
        const e=myEnemies[i];if(e.dead)continue;
        if(e.slowTimer>0)e.slowTimer-=dt;else e.slowFactor=1;
        e.distTraveled+=e.spd*e.slowFactor*dt;
        const pos=posOnPath(pd,e.distTraveled);e.x=pos.x;e.y=pos.y;
        if(pos.done){
          e.dead=true;
          const loss=e.boss?4:e.armor>0.3?2:1;
          myLives=Math.max(0,myLives-loss);updateHUD();saveState();
          e.g.destroy();e.hpBar.destroy();myEnemies.splice(i,1);
          if(myLives<=0){vsSend('gameover',{});triggerLoss();return;}
          continue;
        }
        e.g.setPosition(e.x,e.y);e.hpBar.setPosition(e.x,e.y);
        const bw=e.boss?34:20;
        e.hpBar.clear();e.hpBar.fillStyle(0x000000,.7);e.hpBar.fillRect(-bw/2,-e.size-12,bw,3.5);
        const pct=Math.max(0,e.hp/e.maxHp);
        e.hpBar.fillStyle(pct>.6?0x22c55e:pct>.3?0xfbbf24:0xef4444);e.hpBar.fillRect(-bw/2,-e.size-12,bw*pct,3.5);
      }

      // Tours tirent
      myTowers.forEach(tower=>{
        if(time-tower.lastFire<effRate(tower.cfg))return;
        let cands=myEnemies.filter(e=>!e.dead&&Math.hypot(tower.x-e.x,tower.y-e.y)<=effR(tower.cfg));
        if(!defMods.detectStealth&&tower.type!=='laser')cands=cands.filter(e=>!e.stealth);
        if(tower.cfg.minRange)cands=cands.filter(e=>Math.hypot(tower.x-e.x,tower.y-e.y)>=tower.cfg.minRange);
        if(!cands.length)return;
        cands.sort((a,b)=>b.distTraveled-a.distTraveled);
        const tgt=cands[0];tower.lastFire=time;
        if(tower.cfg.chain){
          let tgts=[tgt];let last=tgt;
          for(let k=1;k<(tower.cfg.chain||3);k++){const n=myEnemies.find(e=>!e.dead&&e!==last&&!tgts.includes(e)&&Math.hypot(last.x-e.x,last.y-e.y)<70);if(n){tgts.push(n);last=n;}else break;}
          tgts.forEach((t,idx)=>fireBullet(sc,tower,t,effD(tower.cfg)*Math.pow(.75,idx)));
        } else fireBullet(sc,tower,tgt,effD(tower.cfg)*(1-tgt.armor));
      });

      for(let i=myBullets.length-1;i>=0;i--){
        const b=myBullets[i];if(!b.target||b.target.dead){b.g.destroy();myBullets.splice(i,1);continue;}
        const dx=b.target.x-b.g.x,dy=b.target.y-b.g.y,dist=Math.hypot(dx,dy);
        if(dist<8){
          b.target.hp-=b.dmg;b.tower.totalDmg+=b.dmg;
          if(tower&&tower.cfg&&tower.cfg.slow){b.target.slowTimer=1.8;b.target.slowFactor=b.tower.cfg.slow||0.5;}
          if(b.target.hp<=0){
            b.target.dead=true;myGoldDef+=b.target.reward+(defMods.goldBonus||0);myGoldAtk+=Math.round(b.target.reward*.4);myKills++;updateHUD();
            if(b.tower.cfg.splash>0){const sr=b.tower.cfg.splash*(1+defMods.splashMult||0);myEnemies.forEach(ne=>{if(!ne.dead&&ne!==b.target&&Math.hypot(ne.x-b.target.x,ne.y-b.target.y)<sr){ne.hp-=b.dmg*.5;if(ne.hp<=0){ne.dead=true;myEnemies=myEnemies.filter(x=>x!==ne);if(ne.g)ne.g.destroy();if(ne.hpBar)ne.hpBar.destroy();}}});}
            emitB(sc,b.target.x,b.target.y,b.tower.cfg.col);
            if(b.target.g)b.target.g.destroy();if(b.target.hpBar)b.target.hpBar.destroy();
            myEnemies=myEnemies.filter(e=>e!==b.target);
          }
          b.g.destroy();myBullets.splice(i,1);
        }else{b.g.x+=dx/dist*(240/60);b.g.y+=dy/dist*(240/60);}
      }
    }

    function fireBullet(s,tower,target,dmg){
      if(!s)return;
      const g=s.add.graphics().setDepth(40);g.fillStyle(tower.cfg.col,1);g.fillCircle(0,0,tower.cfg.splash?5:2.5);g.setPosition(tower.x,tower.y);
      myBullets.push({g,target,tower,dmg});
    }

    // ── Fin de partie ─────────────────────────────────────────
    if(_ctx&&_ctx.onReceive){
      _ctx.onReceive((type,data)=>{
        if(type!=='td:gameover')return;
        if(data.gid&&data.gid!==sess.gameId)return;
        if(!gameOver){gameOver=true;triggerWin();}
      });
    }

    function triggerLoss(){
      if(gameOver)return;gameOver=true;setVSSession(null);
      const ov=document.createElement('div');
      ov.style.cssText='position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:rgba(0,0,0,.92);z-index:600;font-family:monospace';
      ov.innerHTML=`<div style="font-size:40px">💀</div><div style="font-size:24px;font-weight:900;color:#ef4444">DÉFAITE</div>
        <div style="font-size:11px;color:rgba(255,255,255,.4)">Vague ${waveIdx} · ${myKills} kills</div>
        <button id="vs-menu" style="margin-top:8px;background:#0f1020;border:1px solid rgba(255,255,255,.15);color:#fff;font-weight:700;padding:11px 24px;border-radius:10px;cursor:pointer;font-family:monospace;font-size:13px">⟵ Menu</button>
        <button id="vs-retry" style="background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.4);color:#ef4444;font-weight:700;padding:9px 20px;border-radius:10px;cursor:pointer;font-family:monospace;font-size:12px">↺ Rejouer VS</button>`;
      container.appendChild(ov);
      ov.querySelector('#vs-menu').onclick=()=>{ov.remove();_destroyGame();container.innerHTML='';renderModeSelect(container);};
      ov.querySelector('#vs-retry').onclick=()=>{ov.remove();_destroyGame();const ns={...sess,myLives:30,opponentLives:30,myGoldDef:200,myGoldAtk:80,waveIdx:0,fogReveal:[],nextWaveAttackers:[{type:'grunt',count:3,hpMult:1,spdMult:1}],defUpgrades:{},status:'active'};setVSSession(ns);_startVSGame(container,ns);};
    }
    function triggerWin(){
      if(gameOver)return;gameOver=true;setVSSession(null);
      saveScore({name:_myName(),score:myScore,wave:waveIdx,kills:myKills,ts:Date.now(),mode:'vs',victory:true});
      const ov=document.createElement('div');
      ov.style.cssText='position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:rgba(0,0,0,.92);z-index:600;font-family:monospace';
      ov.innerHTML=`<div style="font-size:40px">🏆</div><div style="font-size:24px;font-weight:900;color:#ffd700">VICTOIRE !</div>
        <div style="font-size:11px;color:rgba(255,255,255,.4)">Vague ${waveIdx} · ${myKills} kills</div>
        <button id="vs-menu" style="margin-top:8px;background:linear-gradient(135deg,#fbbf24,#d97706);border:none;color:#000;font-weight:800;padding:11px 24px;border-radius:10px;cursor:pointer;font-family:monospace;font-size:13px">⟵ Menu</button>
        <button id="vs-retry" style="background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.3);color:#fbbf24;font-weight:700;padding:9px 20px;border-radius:10px;cursor:pointer;font-family:monospace;font-size:12px">↺ Rejouer VS</button>`;
      container.appendChild(ov);
      ov.querySelector('#vs-menu').onclick=()=>{ov.remove();_destroyGame();container.innerHTML='';renderModeSelect(container);};
      ov.querySelector('#vs-retry').onclick=()=>{ov.remove();_destroyGame();const ns={...sess,myLives:30,opponentLives:30,myGoldDef:200,myGoldAtk:80,waveIdx:0,fogReveal:[],nextWaveAttackers:[{type:'grunt',count:3,hpMult:1,spdMult:1}],defUpgrades:{},status:'active'};setVSSession(ns);_startVSGame(container,ns);};
    }

    _game=new Phaser.Game({type:Phaser.AUTO,width:W,height:H,parent:container,backgroundColor:'#07080e',scene:{preload:()=>{},create,update},scale:{mode:Phaser.Scale.NONE}});
  }

  function peerSection(container, ctx){
    container.innerHTML='';
    const myUUID=_myUUID();
    if(!ctx||!ctx.uuid||ctx.uuid===myUUID){
      container.innerHTML='<div style="font-size:11px;color:rgba(255,255,255,.3)">C\'est votre profil.</div>';
      return;
    }

    // Profil live du pair (mis à jour toutes les 5s via social:presence)
    let peerProfile=null;
    if(window.YM_Social&&window.YM_Social._nearUsers&&window.YM_Social._nearUsers.has(ctx.uuid)){
      peerProfile=window.YM_Social._nearUsers.get(ctx.uuid)?.profile;
    }
    if(!peerProfile){
      try{const c=JSON.parse(localStorage.getItem('ym_contacts_v1')||'[]').find(x=>x.uuid===ctx.uuid);if(c)peerProfile=c.profile||c;}catch{}
    }

    const sess=getVSSession();
    const isWaiting=sess&&sess.opponentUUID===ctx.uuid&&sess.status==='waiting';
    const isActive=sess&&sess.opponentUUID===ctx.uuid&&sess.status==='active';
    const invFromPeer=peerProfile?_readInviteFromProfile(peerProfile):null;
    const myInv=(window.YM&&window.YM.getProfile&&window.YM.getProfile())||{};
    const myOutgoing=myInv.td_invite&&myInv.td_invite.toUUID===ctx.uuid?myInv.td_invite:null;

    const wrap=document.createElement('div');wrap.style.cssText='display:flex;flex-direction:column;gap:8px';

    if(invFromPeer){
      const d=document.createElement('div');
      d.style.cssText='padding:10px;background:linear-gradient(135deg,rgba(16,185,129,.12),rgba(16,185,129,.04));border:1.5px solid rgba(16,185,129,.5);border-radius:10px';
      d.innerHTML=`<div style="font-size:12px;font-weight:700;color:#10b981;margin-bottom:4px">⚔️ Défi de ${peerProfile.name||ctx.uuid.slice(0,8)} !</div>
        <button id="p-accept" style="width:100%;padding:8px;background:rgba(16,185,129,.2);border:1px solid #10b981;color:#10b981;border-radius:8px;cursor:pointer;font-size:11px;font-weight:700;font-family:monospace">✓ Accepter</button>`;
      d.querySelector('#p-accept').onclick=()=>{
        _storePendingInvite({fromUUID:ctx.uuid,fromName:peerProfile.name||ctx.uuid.slice(0,8),gameId:invFromPeer.gameId});
        _acceptVSInvite({fromUUID:ctx.uuid,fromName:peerProfile.name||ctx.uuid.slice(0,8),gameId:invFromPeer.gameId});
        if(window.YM&&window.YM.openSpherePanel) window.YM.openSpherePanel('towerdefense.sphere.js');
      };
      wrap.appendChild(d);
    }

    if(isWaiting){
      const d=document.createElement('div');
      d.style.cssText='padding:9px 12px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.3);border-radius:9px';
      d.innerHTML=`<div style="font-size:11px;color:#f59e0b;margin-bottom:5px">⏳ Invitation envoyée…</div>
        <button id="p-cancel" style="width:100%;padding:5px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:#ef4444;border-radius:7px;cursor:pointer;font-size:10px;font-family:monospace">Annuler</button>`;
      d.querySelector('#p-cancel').onclick=()=>{setVSSession(null);_clearInviteFromMyProfile();peerSection(container,ctx);};
      wrap.appendChild(d);
    } else if(isActive){
      const d=document.createElement('div');
      d.style.cssText='padding:9px 12px;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.3);border-radius:9px';
      d.innerHTML=`<div style="font-size:11px;color:#10b981;margin-bottom:5px">✓ Partie VS en cours</div>
        <button id="p-open" style="width:100%;padding:7px;background:rgba(16,185,129,.15);border:1px solid rgba(16,185,129,.4);color:#10b981;border-radius:7px;cursor:pointer;font-size:11px;font-family:monospace">▶ Ouvrir Tower Defense</button>`;
      d.querySelector('#p-open').onclick=()=>{if(window.YM&&window.YM.openSpherePanel)window.YM.openSpherePanel('towerdefense.sphere.js');};
      wrap.appendChild(d);
    } else if(!invFromPeer){
      const btn=document.createElement('button');
      btn.style.cssText='width:100%;padding:10px;background:linear-gradient(135deg,rgba(239,68,68,.1),rgba(99,102,241,.07));border:1.5px solid rgba(239,68,68,.38);border-radius:10px;cursor:pointer;font-family:monospace;font-size:12px;font-weight:700;color:#ef4444';
      btn.textContent='⚔️ Défier en Tower Defense VS';
      btn.onclick=()=>{
        const newSess=_sendVSInviteTo(ctx.uuid,peerProfile&&peerProfile.name||ctx.uuid.slice(0,8));
        // Ouvrir le plugin Tower Defense pour que l'hôte joue immédiatement
        if(window.YM&&window.YM.openSpherePanel) window.YM.openSpherePanel('towerdefense.sphere.js');
        // Le plugin va voir sess.status='active' et proposer de rejoindre
      };
      wrap.appendChild(btn);
      const hint=document.createElement('div');
      hint.style.cssText='font-size:10px;color:rgba(255,255,255,.2);text-align:center';
      hint.textContent='Visible dans votre fiche (broadcasté en temps réel)';
      wrap.appendChild(hint);
    }

    container.appendChild(wrap);
  }

  // ── EXPORT ─────────────────────────────────────────────────────────────────
  window.YM_S['towerdefense.sphere.js']={
    name:'Tower Defense', icon:'🗼', category:'Games',
    description:'Tower Defense v9 — Solo (20 vagues) + VS multijoueur (2 terminaux, broadcastData, brouillard de guerre)',
    emit:[], receive:[],
    broadcastData,
    activate(ctx){_ctx=ctx;},
    deactivate(){_destroyGame();_currentInviteBroadcast=null;},
    renderPanel,
    peerSection,
    profileSection(container){
      const scores=loadScores(); if(!scores.length)return;
      const best=scores[0];
      const el=document.createElement('div');
      el.style.cssText='display:flex;align-items:center;gap:10px;background:#0b0c14;border:1px solid rgba(245,158,11,.2);border-radius:12px;padding:10px';
      el.innerHTML=`<span style="font-size:22px">🗼</span>
        <div style="flex:1"><div style="font-size:12px;font-weight:700;color:#f59e0b">Tower Defense${best.mode==='vs'?' VS':''}</div>
        <div style="font-size:10px;color:rgba(255,255,255,.4)">Vague ${best.wave} · ${best.kills||0} kills${best.victory?' · ✦':''}</div></div>
        <div style="font-size:14px;font-weight:700;color:#f59e0b">${best.score.toLocaleString()}</div>`;
      container.appendChild(el);
    }
  };
})();
