// mine.sphere.js — YourMine · Proof of Sacrifice
// @icon ⛏
// @cat YourMine
// @author theodoreyong9
// @desc Solana wallet + on-chain Proof of Sacrifice mining
(function () {
'use strict';

window.YM_S = window.YM_S || {};
window.YM_S['mine.sphere.js'] = {
  name:   'Mine',
  icon:   '⛏',
  category: 'YourMine',
  author: 'theodoreyong9',
  description: 'Solana wallet + Proof of Sacrifice on-chain mining',

  async activate(ctx) {
    this._ctx = ctx;
    await loadSolanaLib();
    await loadQRLib();
    ctx.addPill('⛏ Mine', body => render(body));
    ctx.addFigureTab('Wallet', renderFigure, 0);
    ctx.addProfileTab('Mine', renderProfileTab);
    if (!walletState.locked) refreshBalances().then(() => updateFigure(ctx));
  },

  deactivate() {
    clearInterval(_cycleTimer);
    clearInterval(_claimTimer);
  },

  getBroadcastData() {
    if (!walletState.pubkey) return null;
    return {
      type: 'mine',
      pubkey: walletState.pubkey,
      claimable: calcClaimable().toFixed(4),
    };
  },
};

// ── CONFIG ────────────────────────────────────────────────
const PROGRAM_ID      = '6ue88JtUXzKN5yrFkauU85EHpg4aSsM9QfarvHBQS7TZ';
const CREATOR_ADDRESS = '7Cjt3kRF6FvQQ2XkfxcdsaU9hAZsz6odXWVaLUUhRLZ6';
const YM_MINT         = 'k5KdweiLaLDR57YqVQ9WCWNdLDQm4wMTzz5zPRRPLMn';
const DEVNET          = 'https://api.devnet.solana.com';
const DEVNET2         = 'https://rpc.ankr.com/solana_devnet';
const STORE_KEY       = 'ym_wallet_v1';
const TOKEN_PROGRAM   = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const ASSOC_TOKEN_PGM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
const REFERENCE_GENESIS = 111111111;
const YRM_DECIMALS    = 1_000_000_000_000_000_000;
const MIN_BURN_SOL    = 0.0001;
const DEFAULT_TAX     = 20;

// ── STATE ─────────────────────────────────────────────────
let walletState = { locked:true, keypair:null, pubkey:null, connection:null };
let pdas = { globalState:null, yrmMint:null, solVault:null, userAccount:null, userToken:null };
let mineState = { sol:0, ym:0, lastBurnLamports:0, lastActionSlot:0, taxRate:DEFAULT_TAX, totalBurned:0, currentSlot:0, programInitialized:false };
let _cycleTimer = null;
let _claimTimer = null;

// ── LIB LOADERS ───────────────────────────────────────────
async function loadSolanaLib() {
  if (window.solanaWeb3) return;
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/@solana/web3.js@1.98.0/lib/index.iife.min.js';
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}
async function loadQRLib() {
  if (window.QRCode) return;
  await new Promise((res) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    s.onload = res; s.onerror = res;
    document.head.appendChild(s);
  });
}

// ── BASE58 ────────────────────────────────────────────────
const Base58 = (() => {
  const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const M = {}; for (let i=0;i<A.length;i++) M[A[i]]=BigInt(i);
  return {
    encode(buf){ let n=0n; for(const b of buf)n=(n<<8n)|BigInt(b); let s=''; while(n>0n){s=A[Number(n%58n)]+s;n/=58n} for(const b of buf){if(b!==0)break;s='1'+s} return s; },
    decode(str){ let n=0n; for(const c of str){if(!(c in M))throw new Error('Invalid base58: '+c);n=n*58n+M[c]} const hex=n.toString(16).padStart(2,'0'); const bytes=Uint8Array.from((hex.length%2?'0'+hex:hex).match(/.{2}/g).map(b=>parseInt(b,16))); let l=0;for(const c of str){if(c==='1')l++;else break} const out=new Uint8Array(l+bytes.length);out.set(bytes,l);return out; },
  };
})();

// ── BIP39 / SLIP-0010 ─────────────────────────────────────
async function mnemonicToSeed(m) {
  const e=new TextEncoder();const k=await crypto.subtle.importKey('raw',e.encode(m.normalize('NFKD')),'PBKDF2',false,['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:e.encode('mnemonic'),iterations:2048,hash:'SHA-512'},k,512));
}
async function deriveSlip10(seed, path) {
  const mk=await crypto.subtle.importKey('raw',new TextEncoder().encode('ed25519 seed'),{name:'HMAC',hash:'SHA-512'},false,['sign']);
  let I=new Uint8Array(await crypto.subtle.sign('HMAC',mk,seed)),kL=I.slice(0,32),kR=I.slice(32);
  for(const seg of path.replace(/^m\//,'').split('/')){
    const hard=seg.endsWith("'");const idx=((parseInt(seg)+(hard?0x80000000:0))>>>0);
    const data=new Uint8Array(37);data[0]=0;data.set(kL,1);data[33]=(idx>>>24)&0xff;data[34]=(idx>>>16)&0xff;data[35]=(idx>>>8)&0xff;data[36]=idx&0xff;
    const ck=await crypto.subtle.importKey('raw',kR,{name:'HMAC',hash:'SHA-512'},false,['sign']);
    const ci=new Uint8Array(await crypto.subtle.sign('HMAC',ck,data));kL=ci.slice(0,32);kR=ci.slice(32);
  }
  return kL;
}

// ── AES-GCM encryption (200k PBKDF2) ─────────────────────
async function _pwKey(pw, salt) {
  const km=await crypto.subtle.importKey('raw',new TextEncoder().encode(pw),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:200000,hash:'SHA-256'},km,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function saveEncrypted(secret, pw, kp) {
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await _pwKey(pw,salt),ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(secret));
  localStorage.setItem(STORE_KEY,JSON.stringify({salt:Array.from(salt),iv:Array.from(iv),ct:Array.from(new Uint8Array(ct)),hint:kp?kp.publicKey.toString().slice(0,8)+'…':''}));
}
async function loadEncrypted(pw) {
  const raw=localStorage.getItem(STORE_KEY);if(!raw)throw new Error('No wallet saved');
  const blob=JSON.parse(raw),salt=new Uint8Array(blob.salt),iv=new Uint8Array(blob.iv),ct=new Uint8Array(blob.ct);
  let key;try{key=await _pwKey(pw,salt)}catch{throw new Error('Key derivation failed')}
  let pt;try{pt=await crypto.subtle.decrypt({name:'AES-GCM',iv},key,ct)}catch{throw new Error('Wrong password')}
  return new TextDecoder().decode(pt);
}
function hasSaved(){return!!localStorage.getItem(STORE_KEY)}
function savedHint(){try{return JSON.parse(localStorage.getItem(STORE_KEY)||'{}').hint||''}catch{return''}}

// ── KEYPAIR ───────────────────────────────────────────────
async function keypairFromSecret(secret) {
  const sol=window.solanaWeb3;if(!sol)throw new Error('solanaWeb3 not loaded');
  if(secret.startsWith('phrase:')){
    const words=secret.slice(7).trim().replace(/\s+/g,' ').toLowerCase().split(' ');
    if(words.length!==12&&words.length!==24)throw new Error('Phrase must be 12 or 24 words');
    const seed=await mnemonicToSeed(words.join(' '));
    return sol.Keypair.fromSeed(await deriveSlip10(seed,"m/44'/501'/0'/0'"));
  }
  if(secret.startsWith('privkey:')){
    const raw=secret.slice(8).trim();let bytes;
    try{bytes=Base58.decode(raw)}catch{if(/^[0-9a-fA-F]{64,128}$/.test(raw))bytes=Uint8Array.from(raw.match(/.{1,2}/g).map(b=>parseInt(b,16)));else if(raw.startsWith('['))bytes=new Uint8Array(JSON.parse(raw));else throw new Error('Unknown key format')}
    if(bytes.length===64)return sol.Keypair.fromSecretKey(bytes);
    if(bytes.length===32)return sol.Keypair.fromSeed(bytes);
    throw new Error('Key must be 32 or 64 bytes');
  }
  throw new Error('Corrupted secret format');
}

// ── CONNECTION ────────────────────────────────────────────
async function getConnection() {
  if(walletState.connection)return walletState.connection;
  const sol=window.solanaWeb3;
  for(const ep of[DEVNET,DEVNET2]){
    try{const c=new sol.Connection(ep,'confirmed');await Promise.race([c.getLatestBlockhash(),new Promise((_,r)=>setTimeout(()=>r(),4000))]);walletState.connection=c;return c}catch{}
  }
  walletState.connection=new sol.Connection(DEVNET,'confirmed');return walletState.connection;
}

// ── PDAs ──────────────────────────────────────────────────
async function computePDAs(pubkey) {
  const sol=window.solanaWeb3,pg=new sol.PublicKey(PROGRAM_ID),enc=new TextEncoder();
  const[globalState]=await sol.PublicKey.findProgramAddress([enc.encode('global_state')],pg);
  const[yrmMint]=await sol.PublicKey.findProgramAddress([enc.encode('yrm_mint')],pg);
  const[solVault]=await sol.PublicKey.findProgramAddress([enc.encode('sol_vault')],pg);
  const[userAccount]=await sol.PublicKey.findProgramAddress([enc.encode('user_account'),pubkey.toBytes()],pg);
  const[userToken]=await sol.PublicKey.findProgramAddress([pubkey.toBuffer(),new sol.PublicKey(TOKEN_PROGRAM).toBuffer(),yrmMint.toBuffer()],new sol.PublicKey(ASSOC_TOKEN_PGM));
  pdas={globalState,yrmMint,solVault,userAccount,userToken};
}

// ── INSTRUCTION SERIALIZATION ─────────────────────────────
function serializeBurn(lamports, taxRate) {
  const buf=new ArrayBuffer(17),view=new DataView(buf);
  [203,142,66,81,199,170,67,130].forEach((b,i)=>new Uint8Array(buf)[i]=b);
  view.setBigUint64(8,BigInt(lamports),true);view.setUint8(16,Math.round(taxRate));
  return new Uint8Array(buf);
}
function serializeClaim(){return new Uint8Array([62,198,214,193,213,159,108,210])}
function serializeInit(){return new Uint8Array([175,175,109,31,13,152,155,237])}

// ── TRANSACTIONS ──────────────────────────────────────────
async function buildAndSend(tx) {
  const conn=await getConnection(),kp=walletState.keypair;
  if(!kp)throw new Error('Wallet locked');
  const{blockhash}=await conn.getLatestBlockhash('confirmed');
  tx.recentBlockhash=blockhash;tx.feePayer=kp.publicKey;tx.sign(kp);
  const sig=await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction(sig,'confirmed');
  return sig;
}
async function ensureInitialized() {
  if(mineState.programInitialized)return;
  const conn=await getConnection(),sol=window.solanaWeb3;
  const info=await conn.getAccountInfo(pdas.globalState);
  if(info){mineState.programInitialized=true;return}
  const tx=new sol.Transaction();
  tx.add(new sol.TransactionInstruction({keys:[{pubkey:pdas.globalState,isSigner:false,isWritable:true},{pubkey:pdas.yrmMint,isSigner:false,isWritable:true},{pubkey:walletState.keypair.publicKey,isSigner:true,isWritable:true},{pubkey:new sol.PublicKey(TOKEN_PROGRAM),isSigner:false,isWritable:false},{pubkey:sol.SystemProgram.programId,isSigner:false,isWritable:false}],programId:new sol.PublicKey(PROGRAM_ID),data:serializeInit()}));
  await buildAndSend(tx);mineState.programInitialized=true;
}
async function performBurn(amtSOL, taxRatePct) {
  if(!walletState.keypair)throw new Error('Wallet locked');
  const sol=window.solanaWeb3,lamports=Math.floor(amtSOL*sol.LAMPORTS_PER_SOL);
  await ensureInitialized();
  const tx=new sol.Transaction();
  tx.add(new sol.TransactionInstruction({keys:[{pubkey:pdas.globalState,isSigner:false,isWritable:true},{pubkey:pdas.userAccount,isSigner:false,isWritable:true},{pubkey:pdas.yrmMint,isSigner:false,isWritable:true},{pubkey:pdas.userToken,isSigner:false,isWritable:true},{pubkey:pdas.solVault,isSigner:false,isWritable:true},{pubkey:new sol.PublicKey(CREATOR_ADDRESS),isSigner:false,isWritable:true},{pubkey:walletState.keypair.publicKey,isSigner:true,isWritable:true},{pubkey:new sol.PublicKey(TOKEN_PROGRAM),isSigner:false,isWritable:false},{pubkey:new sol.PublicKey(ASSOC_TOKEN_PGM),isSigner:false,isWritable:false},{pubkey:sol.SystemProgram.programId,isSigner:false,isWritable:false}],programId:new sol.PublicKey(PROGRAM_ID),data:serializeBurn(lamports,taxRatePct)}));
  return buildAndSend(tx);
}
async function performClaim() {
  if(!walletState.keypair)throw new Error('Wallet locked');
  const sol=window.solanaWeb3,tx=new sol.Transaction();
  tx.add(new sol.TransactionInstruction({keys:[{pubkey:pdas.globalState,isSigner:false,isWritable:true},{pubkey:pdas.userAccount,isSigner:false,isWritable:true},{pubkey:pdas.yrmMint,isSigner:false,isWritable:true},{pubkey:pdas.userToken,isSigner:false,isWritable:true},{pubkey:walletState.keypair.publicKey,isSigner:true,isWritable:false},{pubkey:new sol.PublicKey(TOKEN_PROGRAM),isSigner:false,isWritable:false}],programId:new sol.PublicKey(PROGRAM_ID),data:serializeClaim()}));
  return buildAndSend(tx);
}

// ── ON-CHAIN READ ─────────────────────────────────────────
async function refreshBalances() {
  if(!walletState.pubkey)return;
  const sol=window.solanaWeb3,conn=await getConnection(),pk=new sol.PublicKey(walletState.pubkey);
  try{mineState.sol=await conn.getBalance(pk)/sol.LAMPORTS_PER_SOL}catch{}
  try{const info=await conn.getAccountInfo(pdas.userToken);if(info?.data){const view=new DataView(info.data.buffer);mineState.ym=Number(view.getBigUint64(64,true))/YRM_DECIMALS}}catch{}
  try{mineState.currentSlot=await conn.getSlot()}catch{}
  try{
    const info=await conn.getAccountInfo(pdas.userAccount);
    if(info?.data&&info.data.length>=65){const view=new DataView(info.data.buffer);let off=8+32;
      mineState.taxRate=view.getUint8(off);off+=1;mineState.lastActionSlot=Number(view.getBigUint64(off,true));off+=8;mineState.totalBurned=Number(view.getBigUint64(off,true));off+=8;mineState.lastBurnLamports=Number(view.getBigUint64(off,true));
    }
  }catch{}
  try{const info=await conn.getAccountInfo(pdas.globalState);mineState.programInitialized=!!info}catch{}
  updateBalanceUI();
  if(window.YM_S['mine.sphere.js']?._ctx)updateFigure(window.YM_S['mine.sphere.js']._ctx);
}

// ── CLAIMABLE ─────────────────────────────────────────────
function calcClaimable() {
  const{lastBurnLamports,lastActionSlot,currentSlot,taxRate}=mineState;
  if(!lastBurnLamports||!lastActionSlot||!currentSlot)return 0;
  const dSlot=Math.max(1,currentSlot-lastActionSlot);
  const dGenesis=Math.max(1,currentSlot-REFERENCE_GENESIS);
  if(dSlot<30)return 0;
  const burnSOL=lastBurnLamports/1e9,tau=Math.min(taxRate,40)/100;
  const num=Math.pow(dSlot,1.1)*burnSOL;
  const inner=Math.pow(dGenesis,2.2*(1-tau))+Math.pow(33,3);
  if(inner<=1)return 0;
  const denom=Math.pow(Math.log(inner),3.0);
  if(denom<=0||!isFinite(denom)||!isFinite(num))return 0;
  const r=num/denom;
  return(r<0||!isFinite(r)||r>1e12)?0:r;
}

// ── WALLET OPS ────────────────────────────────────────────
async function createWallet(phrase, pw) {
  const sol=window.solanaWeb3;if(!sol)throw new Error('solanaWeb3 not loaded');
  let secret,kp;
  if(phrase&&phrase.trim()){
    const words=phrase.trim().replace(/\s+/g,' ').toLowerCase().split(' ');
    if(words.length!==12&&words.length!==24)throw new Error('Phrase must be 12 or 24 words');
    secret='phrase:'+words.join(' ');kp=await keypairFromSecret(secret);
  }else{kp=sol.Keypair.generate();secret='privkey:'+Base58.encode(kp.secretKey)}
  await saveEncrypted(secret,pw,kp);return kp;
}
async function unlockWallet(pw) {
  const secret=await loadEncrypted(pw);const kp=await keypairFromSecret(secret);
  walletState={locked:false,keypair:kp,pubkey:kp.publicKey.toString(),connection:null};
  await computePDAs(kp.publicKey);await refreshBalances();return kp;
}
function lockWallet() {
  if(walletState.keypair?.secretKey)walletState.keypair.secretKey.fill(0);
  walletState={locked:true,keypair:null,pubkey:null,connection:null};
  pdas={globalState:null,yrmMint:null,solVault:null,userAccount:null,userToken:null};
  clearInterval(_cycleTimer);clearInterval(_claimTimer);
}
async function importWallet(rawKey, pw) {
  const sol=window.solanaWeb3;if(!sol)throw new Error('solanaWeb3 not loaded');
  let kp;
  if(rawKey.startsWith('[')){kp=sol.Keypair.fromSecretKey(new Uint8Array(JSON.parse(rawKey)))}
  else{let bytes;try{bytes=Base58.decode(rawKey)}catch{if(/^[0-9a-fA-F]{64,128}$/.test(rawKey))bytes=Uint8Array.from(rawKey.match(/.{1,2}/g).map(b=>parseInt(b,16)));else throw new Error('Unknown format. Use JSON array [0,1,...] or Base58.')}if(bytes.length===64)kp=sol.Keypair.fromSecretKey(bytes);else if(bytes.length===32)kp=sol.Keypair.fromSeed(bytes);else throw new Error('Key must be 32 or 64 bytes')}
  const secret='privkey:'+Base58.encode(kp.secretKey);
  await saveEncrypted(secret,pw,kp);return kp;
}
async function sendSOL(to, amtSOL) {
  if(!walletState.keypair)throw new Error('Wallet locked');
  const sol=window.solanaWeb3;
  const tx=new sol.Transaction().add(sol.SystemProgram.transfer({fromPubkey:walletState.keypair.publicKey,toPubkey:new sol.PublicKey(to),lamports:Math.floor(amtSOL*sol.LAMPORTS_PER_SOL)}));
  return buildAndSend(tx);
}

// ── FIGURE TAB ────────────────────────────────────────────
function updateFigure(ctx) {
  ctx.updateFigureCount(mineState.ym > 0 ? 1 : 0);
}
function renderFigure(el) {
  const c=calcClaimable();
  el.innerHTML=`<div style="padding:20px">
    <div class="ym-panel">
      <div class="ym-panel-title">Wallet Balances</div>
      <div class="ym-stat-row"><span class="ym-stat-label">SOL</span><span class="ym-stat-value blue" id="fig-sol">${mineState.sol.toFixed(6)}</span></div>
      <div class="ym-stat-row"><span class="ym-stat-label">YRM</span><span class="ym-stat-value accent" id="fig-yrm">${mineState.ym.toFixed(4)}</span></div>
      <div class="ym-stat-row"><span class="ym-stat-label">Claimable</span><span class="ym-stat-value gold" id="fig-claimable">${c.toFixed(6)}</span></div>
    </div>
    <div class="ym-panel">
      <div class="ym-panel-title">Mining Stats</div>
      <div class="ym-stat-row"><span class="ym-stat-label">Last Burn</span><span class="ym-stat-value" id="fig-last-burn">${mineState.lastBurnLamports?(mineState.lastBurnLamports/1e9).toFixed(4)+' SOL':'—'}</span></div>
      <div class="ym-stat-row"><span class="ym-stat-label">Patience τ</span><span class="ym-stat-value">${mineState.taxRate??DEFAULT_TAX}%</span></div>
      <div class="ym-stat-row"><span class="ym-stat-label">Slot</span><span class="ym-stat-value">${mineState.currentSlot||'—'}</span></div>
      ${walletState.pubkey?`<div class="ym-stat-row"><span class="ym-stat-label">Address</span><span style="font-family:var(--font-mono);font-size:9px;color:var(--text3);word-break:break-all">${walletState.pubkey.slice(0,8)}…${walletState.pubkey.slice(-6)}</span></div>`:''}
    </div>
  </div>`;
}
function renderProfileTab(el) {
  el.innerHTML=`<div style="padding:20px">
    ${walletState.pubkey?`
    <div class="ym-panel">
      <div class="ym-panel-title">Public Key (Safe to Share)</div>
      <div style="font-family:var(--font-mono);font-size:10px;color:var(--accent);word-break:break-all;cursor:pointer" onclick="navigator.clipboard.writeText('${walletState.pubkey}')">${walletState.pubkey}</div>
    </div>
    <div class="ym-panel">
      <div class="ym-panel-title">Mining History</div>
      <div class="ym-stat-row"><span class="ym-stat-label">Total burned (lamports)</span><span class="ym-stat-value">${mineState.totalBurned||0}</span></div>
      <div class="ym-stat-row"><span class="ym-stat-label">Last claimable YRM</span><span class="ym-stat-value gold">${calcClaimable().toFixed(6)}</span></div>
    </div>`:'<div class="ym-notice info">Unlock your wallet to see mining data.</div>'}
  </div>`;
}

// ── RENDER (pill body) ────────────────────────────────────
function render(body) {
  // Inject sphere-local CSS once
  if (!document.getElementById('mine-sphere-css')) {
    const style = document.createElement('style');
    style.id = 'mine-sphere-css';
    style.textContent = `
      .mine-wrap{padding:16px;display:flex;flex-direction:column;gap:10px}
      .mine-addr{font-family:var(--font-mono);font-size:9px;color:var(--text3);word-break:break-all;margin-top:2px}
    `;
    document.head.appendChild(style);
  }

  if (walletState.locked) renderLocked(body);
  else renderUnlocked(body);
}

function renderLocked(body) {
  const has=hasSaved(),hint=savedHint();
  body.innerHTML=`<div class="mine-wrap">
    ${!has?`
      <div class="ym-notice info">Enter a BIP39 phrase (12 or 24 words) — compatible with Phantom.</div>
      <div style="position:relative">
        <input class="ym-input" id="mine-phrase" placeholder="BIP39 phrase (12 or 24 words)" type="password" style="padding-right:36px"/>
        <button id="mine-pp-btn" type="button" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text3);cursor:pointer;font-size:.9rem">👁</button>
      </div>
      <input class="ym-input" id="mine-pw"  placeholder="Encryption password" type="password"/>
      <input class="ym-input" id="mine-pw2" placeholder="Confirm password" type="password"/>
      <button class="ym-btn ym-btn-accent" id="mine-create-btn" style="width:100%">Create Wallet</button>
      <details style="margin-top:4px">
        <summary style="font-size:10px;color:var(--text3);cursor:pointer">Import private key</summary>
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:10px">
          <input class="ym-input" id="mine-import-key" placeholder="Base58 or JSON array [0,1,…]" type="password"/>
          <input class="ym-input" id="mine-import-pw"  placeholder="Encryption password" type="password"/>
          <button class="ym-btn" id="mine-import-btn" style="width:100%">Import</button>
        </div>
      </details>
    `:`
      ${hint?`<div style="font-size:10px;color:var(--text3);margin-bottom:4px">🔑 Saved wallet: ${hint}</div>`:''}
      <input class="ym-input" id="mine-pw" placeholder="Password" type="password"/>
      <button class="ym-btn ym-btn-accent" id="mine-unlock-btn" style="width:100%">Unlock</button>
      <details style="margin-top:4px">
        <summary style="font-size:10px;color:var(--text3);cursor:pointer">Import another wallet</summary>
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:10px">
          <input class="ym-input" id="mine-import-key" placeholder="Base58 or JSON array" type="password"/>
          <input class="ym-input" id="mine-import-pw"  placeholder="New password" type="password"/>
          <button class="ym-btn" id="mine-import-btn" style="width:100%">Import &amp; Replace</button>
        </div>
      </details>
      <button class="ym-btn ym-btn-ghost" id="mine-reset-btn" style="width:100%;font-size:10px">Delete local wallet</button>
    `}
    <div id="mine-err" class="ym-notice error" style="display:none"></div>
  </div>`;
  wireLockedEvents(body);
}

function renderUnlocked(body) {
  const c=calcClaimable();
  const addr=walletState.pubkey||'';
  body.innerHTML=`<div class="mine-wrap">

    <!-- Wallet header -->
    <div class="ym-panel" style="margin-bottom:0">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
        <div>
          <div class="ym-panel-title" style="margin-bottom:2px">Active Wallet</div>
          <div class="mine-addr">${addr}</div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="ym-btn ym-btn-ghost" id="mine-copy-addr" style="padding:6px 10px;font-size:.9rem" title="Copy address">⧉</button>
          <button class="ym-btn ym-btn-danger" id="mine-lock-btn" style="padding:6px 12px;font-size:11px">Lock</button>
        </div>
      </div>
    </div>

    <!-- Balances -->
    <div class="ym-panel" id="mine-stats">
      <div class="ym-panel-title">Balances</div>
      <div class="ym-stat-row"><span class="ym-stat-label">SOL</span><span class="ym-stat-value blue" id="mine-sol-val">${mineState.sol.toFixed(6)}</span></div>
      <div class="ym-stat-row"><span class="ym-stat-label">YRM</span><span class="ym-stat-value accent" id="mine-yrm-val">${mineState.ym.toFixed(4)}</span></div>
      <div class="ym-stat-row"><span class="ym-stat-label">Claimable</span><span class="ym-stat-value gold" id="mine-claim-val">${c.toFixed(6)}</span></div>
      <div class="ym-stat-row"><span class="ym-stat-label">Slot</span><span class="ym-stat-value" id="mine-slot-val">${mineState.currentSlot||'—'}</span></div>
    </div>

    <!-- Burn & Claim -->
    <div class="ym-panel">
      <div class="ym-panel-title">Burn &amp; Claim</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div>
          <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">SOL to burn</div>
          <input class="ym-input" id="mine-burn-amt" type="number" min="${MIN_BURN_SOL}" step="0.001" placeholder="${MIN_BURN_SOL}"/>
        </div>
        <div>
          <div style="display:flex;justify-content:space-between;margin-bottom:6px">
            <span style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">Patience τ</span>
            <span style="font-family:var(--font-display);font-size:13px;font-weight:700;color:var(--accent)" id="mine-rate-lbl">20%</span>
          </div>
          <input class="ym-slider" id="mine-rate-slider" type="range" min="0" max="40" step="1" value="20"/>
          <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:9px;color:var(--text3)">
            <span>0% — Fast</span><span>40% — Max bonus</span>
          </div>
        </div>
        <div class="ym-notice info" style="font-size:10px">Team fee (0.1%): <strong id="mine-fee-lbl">—</strong> SOL</div>
        <div style="display:flex;gap:8px">
          <button class="ym-btn ym-btn-accent" id="mine-burn-btn" style="flex:1">🔥 Burn</button>
          <button class="ym-btn" id="mine-claim-btn" style="flex:1">⚡ Claim <span id="mine-claim-amt">(${c.toFixed(4)})</span></button>
        </div>
        <div id="mine-tx-msg" class="ym-notice success" style="display:none"></div>
      </div>
    </div>

    <!-- Receive -->
    <div class="ym-panel">
      <div class="ym-panel-title">Receive</div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:10px">
        <div id="mine-qr" style="background:#fff;padding:8px;border-radius:8px;display:inline-block"></div>
        <div style="font-family:var(--font-mono);font-size:9px;color:var(--text3);word-break:break-all;text-align:center">${addr}</div>
        <button class="ym-btn ym-btn-ghost" id="mine-copy-addr2" style="width:100%">⧉ Copy address</button>
      </div>
    </div>

    <!-- Send -->
    <div class="ym-panel">
      <div class="ym-panel-title">Send SOL</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <input class="ym-input" id="mine-send-to"  placeholder="Recipient address"/>
        <input class="ym-input" id="mine-send-amt" type="number" step="0.001" placeholder="Amount SOL"/>
        <button class="ym-btn ym-btn-accent" id="mine-send-btn">Send</button>
      </div>
    </div>

  </div>`;

  // QR code
  if (window.QRCode && addr) {
    const qrEl=document.getElementById('mine-qr');
    if(qrEl){qrEl.innerHTML='';new window.QRCode(qrEl,{text:addr,width:160,height:160,correctLevel:QRCode.CorrectLevel.M})}
  }

  updateFeePreview(body);
  wireUnlockedEvents(body);
  startCycles();
}

// ── WIRE EVENTS ───────────────────────────────────────────
function wireLockedEvents(body) {
  const $=id=>body.querySelector('#'+id);
  $('mine-pp-btn')?.addEventListener('click',()=>{const i=$('mine-phrase');if(i)i.type=i.type==='password'?'text':'password'});
  $('mine-create-btn')?.addEventListener('click',async()=>{
    const phrase=$('mine-phrase')?.value||'',pw=$('mine-pw')?.value||'',pw2=$('mine-pw2')?.value||'';
    if(!pw)return showErr(body,'Password required');if(pw!==pw2)return showErr(body,'Passwords differ');
    try{await createWallet(phrase,pw);await unlockWallet(pw);renderUnlocked(body)}catch(e){showErr(body,e.message)}
  });
  $('mine-unlock-btn')?.addEventListener('click',async()=>{
    const pw=$('mine-pw')?.value||'';
    try{await unlockWallet(pw);renderUnlocked(body)}catch(e){showErr(body,e.message)}
  });
  $('mine-pw')?.addEventListener('keydown',e=>{if(e.key==='Enter')$('mine-unlock-btn')?.click()});
  $('mine-import-btn')?.addEventListener('click',async()=>{
    const raw=($('mine-import-key')?.value||'').trim(),pw=($('mine-import-pw')?.value||'').trim();
    if(!raw)return showErr(body,'Key required');if(!pw)return showErr(body,'Password required');
    try{await importWallet(raw,pw);await unlockWallet(pw);renderUnlocked(body)}catch(e){showErr(body,e.message)}
  });
  $('mine-reset-btn')?.addEventListener('click',()=>{
    if(confirm('Delete local wallet? Make sure you have your phrase saved.'))
    {localStorage.removeItem(STORE_KEY);renderLocked(body)}
  });
}

function wireUnlockedEvents(body) {
  const $=id=>body.querySelector('#'+id);
  $('mine-lock-btn')?.addEventListener('click',()=>{lockWallet();renderLocked(body)});
  $('mine-copy-addr')?.addEventListener('click',()=>navigator.clipboard?.writeText(walletState.pubkey||'').catch(()=>{}));
  $('mine-copy-addr2')?.addEventListener('click',()=>navigator.clipboard?.writeText(walletState.pubkey||'').catch(()=>{}));

  const slider=$('mine-rate-slider');
  slider?.addEventListener('input',()=>{const l=$('mine-rate-lbl');if(l)l.textContent=slider.value+'%';updateFeePreview(body)});
  $('mine-burn-amt')?.addEventListener('input',()=>updateFeePreview(body));

  $('mine-burn-btn')?.addEventListener('click',async()=>{
    const amt=parseFloat($('mine-burn-amt')?.value||'0');
    const rate=parseInt($('mine-rate-slider')?.value||'20');
    if(!amt||amt<MIN_BURN_SOL)return showTx(body,`Minimum: ${MIN_BURN_SOL} SOL`,true);
    if(amt>mineState.sol)return showTx(body,'Insufficient SOL',true);
    const btn=$('mine-burn-btn');btn.disabled=true;btn.textContent='⏳';
    try{const sig=await performBurn(amt,rate);showTx(body,'Burn confirmed ✓ '+sig.slice(0,12)+'…');setTimeout(()=>refreshBalances(),2000)}
    catch(e){showTx(body,e.message,true)}
    finally{btn.disabled=false;btn.textContent='🔥 Burn'}
  });

  $('mine-claim-btn')?.addEventListener('click',async()=>{
    const c=calcClaimable();if(c<=0)return showTx(body,'Nothing to claim yet',true);
    const btn=$('mine-claim-btn');btn.disabled=true;btn.textContent='⏳';
    try{const sig=await performClaim();showTx(body,'Claim confirmed ✓ '+sig.slice(0,12)+'…');setTimeout(()=>refreshBalances(),2000)}
    catch(e){showTx(body,e.message,true)}
    finally{btn.disabled=false;btn.textContent='⚡ Claim'}
  });

  $('mine-send-btn')?.addEventListener('click',async()=>{
    const to=$('mine-send-to')?.value?.trim(),amt=parseFloat($('mine-send-amt')?.value||'0');
    if(!to||!amt)return;
    try{const sig=await sendSOL(to,amt);showTx(body,'Sent ✓ '+sig.slice(0,12)+'…');setTimeout(refreshBalances,2000)}
    catch(e){showTx(body,e.message,true)}
  });
}

function updateFeePreview(body) {
  const amt=parseFloat(body.querySelector('#mine-burn-amt')?.value||'0');
  const el=body.querySelector('#mine-fee-lbl');if(el)el.textContent=(amt*0.001).toFixed(6)+' SOL';
}

// ── LIVE UPDATES ──────────────────────────────────────────
function updateBalanceUI() {
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v};
  set('mine-sol-val', mineState.sol.toFixed(6));
  set('mine-yrm-val', mineState.ym.toFixed(4));
  set('mine-slot-val', mineState.currentSlot||'—');
  // Also update figure tab if open
  const fs=document.getElementById('fig-sol');if(fs)fs.textContent=mineState.sol.toFixed(6);
  const fy=document.getElementById('fig-yrm');if(fy)fy.textContent=mineState.ym.toFixed(4);
}

function startCycles() {
  clearInterval(_cycleTimer);clearInterval(_claimTimer);
  _cycleTimer=setInterval(refreshBalances,15000);
  _claimTimer=setInterval(()=>{
    const c=calcClaimable();
    const cv=document.getElementById('mine-claim-val');if(cv)cv.textContent=c.toFixed(6);
    const ca=document.getElementById('mine-claim-amt');if(ca)ca.textContent=`(${c.toFixed(4)})`;
    const fc=document.getElementById('fig-claimable');if(fc)fc.textContent=c.toFixed(6);
  },2000);
}

// ── HELPERS ───────────────────────────────────────────────
function showErr(body, msg) {const e=body.querySelector('#mine-err');if(e){e.textContent=msg;e.style.display='flex'}}
function showTx(body, msg, isErr=false) {
  const el=document.getElementById('mine-tx-msg');if(!el)return;
  el.textContent=msg;el.className='ym-notice '+(isErr?'error':'success');el.style.display='flex';
  setTimeout(()=>{el.style.display='none'},5000);
}

})();
