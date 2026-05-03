/* jshint esversion:11, -W033 */
// mine.js — YourMine Wallet & Proof of Sacrifice
// Based on mine.sphere.js — adapted for YourMine core module
(function(){
'use strict';

// ── BUFFER POLYFILL (browser n'a pas Buffer natif) ───────────────────────────
if(typeof window.Buffer==='undefined'){
  window.Buffer={
    from:function(data,enc){
      if(typeof data==='string'){
        if(enc==='base64'){
          const bin=atob(data),arr=new Uint8Array(bin.length);
          for(let i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);
          return arr;
        }
        const arr=new TextEncoder().encode(data);return arr;
      }
      if(data instanceof Uint8Array)return data;
      return new Uint8Array(data);
    },
    isBuffer:function(b){return b instanceof Uint8Array}
  };
}

// ── CONFIG ──────────────────────────────────────────────────────────────────
const PID     = '6ue88JtUXzKN5yrFkauU85EHpg4aSsM9QfarvHBQS7TZ';
const CREATOR = '7Cjt3kRF6FvQQ2XkfxcdsaU9hAZsz6odXWVaLUUhRLZ6';
const TOKEN_PGM  = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const ASSOC_PGM  = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
const DEVNET     = 'https://api.devnet.solana.com';
const DEVNET2    = 'https://rpc.ankr.com/solana_devnet';
const STORE_KEY  = 'ym_wallet_v1';
const MIN_BURN   = 0.0001;
// FIX: YRM has 18 decimals per web3-config.js
const YRM_DECIMALS = 1e18;

const FAUCETS = [
  {label:'Solana Faucet (official)', url:'https://faucet.solana.com'},
  {label:'QuickNode Faucet', url:'https://faucet.quicknode.com/solana/devnet'},
];

let _state = {sol:0,ym:0,lastBurnAmount:0,lastActionSlot:0,taxRate:20,totalBurned:0,currentSlot:0,programInitialized:false};
let _wallet = {locked:true,keypair:null,pubkey:null,connection:null};
let _pdas = {};
let _cycleTimer=null,_claimTimer=null;

// ── BASE58 ───────────────────────────────────────────────────────────────────
const B58=(()=>{
  const A='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz',M={};
  for(let i=0;i<A.length;i++)M[A[i]]=BigInt(i);
  return{
    encode(b){let n=0n;for(const x of b)n=(n<<8n)|BigInt(x);let s='';while(n>0n){s=A[Number(n%58n)]+s;n/=58n}for(const x of b){if(x!==0)break;s='1'+s}return s},
    decode(s){let n=0n;for(const c of s){if(!(c in M))throw Error('Bad b58');n=n*58n+M[c]}const h=n.toString(16).padStart(2,'0');const b=Uint8Array.from((h.length%2?'0'+h:h).match(/.{2}/g).map(x=>parseInt(x,16)));let l=0;for(const c of s){if(c==='1')l++;else break}const o=new Uint8Array(l+b.length);o.set(b,l);return o}
  };
})();

// ── CRYPTO HELPERS ───────────────────────────────────────────────────────────
async function mnemonicToSeed(m){
  const e=new TextEncoder(),k=await crypto.subtle.importKey('raw',e.encode(m.normalize('NFKD')),'PBKDF2',false,['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:e.encode('mnemonic'),iterations:2048,hash:'SHA-512'},k,512));
}
async function slip10(seed,path){
  const mk=await crypto.subtle.importKey('raw',new TextEncoder().encode('ed25519 seed'),{name:'HMAC',hash:'SHA-512'},false,['sign']);
  let I=new Uint8Array(await crypto.subtle.sign('HMAC',mk,seed)),kL=I.slice(0,32),kR=I.slice(32);
  for(const seg of path.replace(/^m\//,'').split('/')){
    const hard=seg.endsWith("'");const idx=((parseInt(seg)+(hard?0x80000000:0))>>>0);
    const d=new Uint8Array(37);d[0]=0;d.set(kL,1);d[33]=(idx>>>24)&0xff;d[34]=(idx>>>16)&0xff;d[35]=(idx>>>8)&0xff;d[36]=idx&0xff;
    const ck=await crypto.subtle.importKey('raw',kR,{name:'HMAC',hash:'SHA-512'},false,['sign']);
    const ci=new Uint8Array(await crypto.subtle.sign('HMAC',ck,d));kL=ci.slice(0,32);kR=ci.slice(32);
  }
  return kL;
}
async function pwKey(pw,salt){
  const km=await crypto.subtle.importKey('raw',new TextEncoder().encode(pw),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:200000,hash:'SHA-256'},km,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function saveEnc(secret,pw,kp){
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),key=await pwKey(pw,salt);
  const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(secret));
  localStorage.setItem(STORE_KEY,JSON.stringify({salt:Array.from(salt),iv:Array.from(iv),ct:Array.from(new Uint8Array(ct)),hint:kp?kp.publicKey.toString().slice(0,8)+'…':''}));
}
async function loadEnc(pw){
  const raw=localStorage.getItem(STORE_KEY);if(!raw)throw Error('No wallet');
  const{salt,iv,ct}=JSON.parse(raw);const key=await pwKey(pw,new Uint8Array(salt));
  let pt;try{pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(iv)},key,new Uint8Array(ct))}catch{throw Error('Wrong password')}
  return new TextDecoder().decode(pt);
}
function hasSaved(){return!!localStorage.getItem(STORE_KEY)}
function savedHint(){try{return JSON.parse(localStorage.getItem(STORE_KEY)||'{}').hint||''}catch{return''}}

async function kpFromSecret(secret){
  const sol=window.solanaWeb3;
  if(secret.startsWith('phrase:')){
    const words=secret.slice(7).trim().replace(/\s+/g,' ').toLowerCase().split(' ');
    const seed=await mnemonicToSeed(words.join(' '));
    return sol.Keypair.fromSeed(await slip10(seed,"m/44'/501'/0'/0'"));
  }
  if(secret.startsWith('privkey:')){
    const raw=secret.slice(8).trim();let bytes;
    try{bytes=B58.decode(raw)}catch{bytes=raw.startsWith('[')?new Uint8Array(JSON.parse(raw)):Uint8Array.from(raw.match(/.{1,2}/g).map(b=>parseInt(b,16)))}
    return bytes.length===64?sol.Keypair.fromSecretKey(bytes):sol.Keypair.fromSeed(bytes);
  }
  throw Error('Bad secret');
}

// ── SOLANA UTILS ─────────────────────────────────────────────────────────────
async function _loadSolana(){
  if(window.solanaWeb3)return;
  await new Promise((r,j)=>{
    const s=document.createElement('script');
    s.src='https://unpkg.com/@solana/web3.js@1.98.0/lib/index.iife.min.js';
    s.onload=r;s.onerror=j;document.head.appendChild(s);
  });
}
async function _loadQR(){
  if(window.QRCode)return;
  await new Promise(r=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';s.onload=r;s.onerror=r;document.head.appendChild(s)});
}

// ── NACL LOADER (FIX: chargement dynamique de tweetnacl) ─────────────────────
async function _loadNacl(){
  if(window.nacl)return;
  await new Promise((r,j)=>{
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/tweetnacl@1.0.3/nacl-fast.min.js';
    s.onload=r;s.onerror=j;document.head.appendChild(s);
  });
}

async function getConn(){
  if(_wallet.connection)return _wallet.connection;
  const sol=window.solanaWeb3;
  for(const ep of[DEVNET,DEVNET2]){
    try{const c=new sol.Connection(ep,'confirmed');await Promise.race([c.getLatestBlockhash(),new Promise((_,r)=>setTimeout(()=>r(),4000))]);_wallet.connection=c;return c}catch{}
  }
  _wallet.connection=new sol.Connection(DEVNET,'confirmed');return _wallet.connection;
}
async function computePDAs(pk){
  const sol=window.solanaWeb3,pg=new sol.PublicKey(PID),e=new TextEncoder();
  const[g]=await sol.PublicKey.findProgramAddress([e.encode('global_state')],pg);
  const[ym]=await sol.PublicKey.findProgramAddress([e.encode('yrm_mint')],pg);
  const[sv]=await sol.PublicKey.findProgramAddress([e.encode('sol_vault')],pg);
  const[ua]=await sol.PublicKey.findProgramAddress([e.encode('user_account'),pk.toBytes()],pg);
  // ATA derivation — uses toBuffer() to match original utils.js
  const[ut]=await sol.PublicKey.findProgramAddress([
    pk.toBuffer(),
    new sol.PublicKey(TOKEN_PGM).toBuffer(),
    ym.toBuffer()
  ],new sol.PublicKey(ASSOC_PGM));
  _pdas={globalState:g,yrmMint:ym,solVault:sv,userAccount:ua,userToken:ut};
}

// ── TRANSACTION SERIALIZERS ──────────────────────────────────────────────────
function serBurn(lam,tax){const b=new ArrayBuffer(17),v=new DataView(b);[203,142,66,81,199,170,67,130].forEach((x,i)=>new Uint8Array(b)[i]=x);v.setBigUint64(8,BigInt(lam),true);v.setUint8(16,Math.round(tax));return new Uint8Array(b)}
function serClaim(){return new Uint8Array([62,198,214,193,213,159,108,210])}
function serInit(){return new Uint8Array([175,175,109,31,13,152,155,237])}

async function buildSend(tx){
  const conn=await getConn(),kp=_wallet.keypair;
  if(!kp)throw Error('Wallet locked');
  const{blockhash}=await conn.getLatestBlockhash('confirmed');
  tx.recentBlockhash=blockhash;tx.feePayer=kp.publicKey;tx.sign(kp);
  const sig=await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction(sig,'confirmed');return sig;
}
async function ensureInit(){
  if(_state.programInitialized)return;
  // FIX: guard — if PDAs not computed yet, abort
  if(!_pdas.globalState)throw Error('PDAs not initialized');
  const conn=await getConn(),sol=window.solanaWeb3;
  const info=await conn.getAccountInfo(_pdas.globalState);
  if(info){_state.programInitialized=true;return}
  const tx=new sol.Transaction();
  tx.add(new sol.TransactionInstruction({keys:[
    {pubkey:_pdas.globalState,isSigner:false,isWritable:true},
    {pubkey:_pdas.yrmMint,isSigner:false,isWritable:true},
    {pubkey:_wallet.keypair.publicKey,isSigner:true,isWritable:true},
    {pubkey:new sol.PublicKey(TOKEN_PGM),isSigner:false,isWritable:false},
    {pubkey:sol.SystemProgram.programId,isSigner:false,isWritable:false}
  ],programId:new sol.PublicKey(PID),data:serInit()}));
  await buildSend(tx);_state.programInitialized=true;
}
async function doBurn(amt,tax){
  const sol=window.solanaWeb3,lam=Math.floor(amt*sol.LAMPORTS_PER_SOL);
  // FIX: ensure PDAs are ready before burn
  if(!_pdas.globalState)await computePDAs(_wallet.keypair.publicKey);
  await ensureInit();
  const tx=new sol.Transaction();
  tx.add(new sol.TransactionInstruction({keys:[
    {pubkey:_pdas.globalState,isSigner:false,isWritable:true},
    {pubkey:_pdas.userAccount,isSigner:false,isWritable:true},
    {pubkey:_pdas.yrmMint,isSigner:false,isWritable:true},
    {pubkey:_pdas.userToken,isSigner:false,isWritable:true},
    {pubkey:_pdas.solVault,isSigner:false,isWritable:true},
    {pubkey:new sol.PublicKey(CREATOR),isSigner:false,isWritable:true},
    {pubkey:_wallet.keypair.publicKey,isSigner:true,isWritable:true},
    {pubkey:new sol.PublicKey(TOKEN_PGM),isSigner:false,isWritable:false},
    {pubkey:new sol.PublicKey(ASSOC_PGM),isSigner:false,isWritable:false},
    {pubkey:sol.SystemProgram.programId,isSigner:false,isWritable:false}
  ],programId:new sol.PublicKey(PID),data:serBurn(lam,tax)}));
  return buildSend(tx);
}
async function doClaim(){
  // FIX: ensure PDAs are ready before claim
  if(!_pdas.globalState)await computePDAs(_wallet.keypair.publicKey);
  const sol=window.solanaWeb3,tx=new sol.Transaction();
  tx.add(new sol.TransactionInstruction({keys:[
    {pubkey:_pdas.globalState,isSigner:false,isWritable:true},
    {pubkey:_pdas.userAccount,isSigner:false,isWritable:true},
    {pubkey:_pdas.yrmMint,isSigner:false,isWritable:true},
    {pubkey:_pdas.userToken,isSigner:false,isWritable:true},
    {pubkey:_wallet.keypair.publicKey,isSigner:true,isWritable:false},
    {pubkey:new sol.PublicKey(TOKEN_PGM),isSigner:false,isWritable:false}
  ],programId:new sol.PublicKey(PID),data:serClaim()}));
  return buildSend(tx);
}
async function doSend(to,amt){
  const sol=window.solanaWeb3,tx=new sol.Transaction().add(sol.SystemProgram.transfer({
    fromPubkey:_wallet.keypair.publicKey,toPubkey:new sol.PublicKey(to),
    lamports:Math.floor(amt*sol.LAMPORTS_PER_SOL)
  }));
  return buildSend(tx);
}

// ── SIGN FOR BUILD ────────────────────────────────────────────────────────────
async function signMessage(message){
  if(_wallet.locked||!_wallet.keypair) throw Error('Wallet locked');
  // FIX: charger nacl dynamiquement si absent
  await _loadNacl();
  const kp=_wallet.keypair;
  const msgBytes=new TextEncoder().encode(message);
  const sig=await _signNacl(msgBytes,kp);
  if(!sig) throw Error('Could not sign');
  return {pubkey:kp.publicKey.toString(), signature:B58.encode(sig)};
}
async function _signNacl(msg,kp){
  const nacl=window.nacl||window.TweetNaCl;
  if(nacl&&nacl.sign){
    return nacl.sign.detached(msg,kp.secretKey);
  }
  throw Error('nacl not available');
}
window.YM_Mine_sign = async function(message){
  const result=await signMessage(message);
  // build.js attend un Uint8Array directement pour btoa(String.fromCharCode(...signature))
  return B58.decode(result.signature);
};
window.YM_Mine_pubkey = ()=>_wallet.pubkey;

// ── BALANCES ─────────────────────────────────────────────────────────────────
async function refreshBalances(){
  if(!_wallet.pubkey)return;
  const sol=window.solanaWeb3,conn=await getConn(),pk=new sol.PublicKey(_wallet.pubkey);
  try{_state.sol=await conn.getBalance(pk)/sol.LAMPORTS_PER_SOL}catch{}
  try{
    const info=await conn.getAccountInfo(_pdas.userToken);
    if(info&&info.data&&info.data.length>=72){
      const v=new DataView(info.data.buffer,info.data.byteOffset);
      // SPL Token account: amount at offset 64, u64 little-endian
      const raw=v.getBigUint64(64,true);
      _state.ym=Number(raw)/YRM_DECIMALS;
    }
  }catch(e){console.warn('[Mine] YRM balance error:',e.message);}
  try{_state.currentSlot=await conn.getSlot()}catch{}
  try{
    const info=await conn.getAccountInfo(_pdas.userAccount);
    if(info&&info.data&&info.data.length>=65){
      const v=new DataView(info.data.buffer,info.data.byteOffset);
      // offset: 8 (discriminator) + 32 (user pubkey) = 40
      let o=40;
      _state.taxRate=v.getUint8(o);o+=1;
      _state.lastActionSlot=Number(v.getBigUint64(o,true));o+=8;
      _state.totalBurned=Number(v.getBigUint64(o,true));o+=8;
      _state.lastBurnAmount=Number(v.getBigUint64(o,true));
    }
  }catch{}
  try{_state.programInitialized=!!(await conn.getAccountInfo(_pdas.globalState))}catch{}
  if(_wallet.pubkey&&window.YM&&window.YM.saveProfile){window.YM.saveProfile({pubkey:_wallet.pubkey});}
  _updateFigureBtn();
  _updateBalanceEls();
}

// ── CLAIMABLE FORMULA ────────────────────────────────────────────────────────
function calcClaimable(){
  const{lastBurnAmount:lb,lastActionSlot:las,currentSlot:cs,taxRate:tr}=_state;
  if(!lb||!las||!cs||cs<=las||cs-las<30)return 0;
  const S=lb/1e9; // lamports → SOL
  const tau=Math.min(tr,40)/100;
  const dSlot=Math.max(1,cs-las);
  const dGen=Math.max(1,cs-111111111);
  const num=Math.pow(dSlot,1.1)*S;
  const inner=Math.pow(dGen,2.2*(1-tau))+Math.pow(33,3);
  if(inner<=1)return 0;
  const den=Math.pow(Math.log(inner),3);
  if(den<=0||!isFinite(den)||!isFinite(num))return 0;
  const r=num/den;
  return(r<0||!isFinite(r)||r>1e12)?0:r;
}
window.YM_calcClaimable = calcClaimable;
// Expose _mineState pour build.js checkEligibility()
Object.defineProperty(window,'_mineState',{get:()=>_state,configurable:true});

function _updateFigureBtn(){
  const c=calcClaimable();
  const label=document.getElementById('fig-label');
  if(label) label.textContent=c>0?c.toFixed(2):'0';
}

function _updateBalanceEls(){
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v};
  set('mine-sol',_state.sol.toFixed(6));
  set('mine-yrm',_state.ym.toFixed(4));
  set('mine-slot',_state.currentSlot||'—');
  // FIX: also update claimable value immediately
  set('mine-cval',calcClaimable().toFixed(6));
}

// ── WALLET OPS ───────────────────────────────────────────────────────────────
async function unlockWallet(pw){
  const secret=await loadEnc(pw);
  const kp=await kpFromSecret(secret);
  _wallet={locked:false,keypair:kp,pubkey:kp.publicKey.toString(),connection:null};
  await computePDAs(kp.publicKey);
  await refreshBalances();
  return kp;
}
function lockWallet(){
  if(_wallet.keypair&&_wallet.keypair.secretKey)_wallet.keypair.secretKey.fill(0);
  _wallet={locked:true,keypair:null,pubkey:null,connection:null};
  _pdas={};
  clearInterval(_cycleTimer);clearInterval(_claimTimer);
  _updateFigureBtn();
}
async function createWallet(phrase,pw){
  const sol=window.solanaWeb3;let secret,kp;
  if(phrase&&phrase.trim()){
    const w=phrase.trim().replace(/\s+/g,' ').toLowerCase().split(' ');
    if(w.length!==12&&w.length!==24)throw Error('Need 12 or 24 words');
    secret='phrase:'+w.join(' ');kp=await kpFromSecret(secret);
  } else {
    kp=sol.Keypair.generate();secret='privkey:'+B58.encode(kp.secretKey);
  }
  await saveEnc(secret,pw,kp);return kp;
}
async function importWallet(raw,pw){
  const sol=window.solanaWeb3;let kp;
  if(raw.startsWith('[')){kp=sol.Keypair.fromSecretKey(new Uint8Array(JSON.parse(raw)));}
  else{
    let bytes;try{bytes=B58.decode(raw)}catch{bytes=/^[0-9a-f]+$/i.test(raw)?Uint8Array.from(raw.match(/.{2}/g).map(b=>parseInt(b,16))):new Uint8Array(JSON.parse(raw))}
    kp=bytes.length===64?sol.Keypair.fromSecretKey(bytes):sol.Keypair.fromSeed(bytes);
  }
  const secret='privkey:'+B58.encode(kp.secretKey);
  await saveEnc(secret,pw,kp);return kp;
}

// ── RENDER ───────────────────────────────────────────────────────────────────
async function render(container){
  await _loadSolana();
  await _loadQR();
  if(_wallet.locked) renderLocked(container);
  else renderUnlocked(container);
}

function renderLocked(body){
  const has=hasSaved(),hint=savedHint();
  const S=(s)=>'style="'+s+'"';
  const hdr='<div '+S('display:flex;align-items:center;gap:10px;margin-bottom:20px')+'>'+
    '<div '+S('width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,var(--accent),#e08020);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0')+'">⛏</div>'+
    '<div>'+
      '<div '+S('font-family:var(--font-d);font-size:13px;font-weight:700;letter-spacing:1px;color:var(--accent);text-transform:uppercase')+'">YourMine</div>'+
      '<div '+S('font-size:10px;color:var(--text3)')+'">Proof of Sacrifice · Devnet</div>'+
    '</div>'+
  '</div>';

  if(!has){
    body.innerHTML=hdr+
      '<div '+S('background:rgba(232,160,32,.07);border:1px solid rgba(232,160,32,.15);border-radius:var(--r-sm);padding:10px 12px;font-size:11px;color:var(--text2);margin-bottom:16px;line-height:1.5')+'">'+
        'BIP39 phrase (12/24 words) for Phantom import, or leave empty to generate new.'+
      '</div>'+
      '<div '+S('position:relative;margin-bottom:8px')+'>'+
        '<input class="ym-input" id="mine-phrase" type="password" placeholder="Seed phrase (optional)" '+S('padding-right:36px')+'/>'+
        '<button id="mine-eye" '+S('position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text3);cursor:pointer;font-size:13px')+'">👁</button>'+
      '</div>'+
      '<div '+S('display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px')+'>'+
        '<input class="ym-input" id="mine-pw" type="password" placeholder="Password"/>'+
        '<input class="ym-input" id="mine-pw2" type="password" placeholder="Confirm"/>'+
      '</div>'+
      '<button class="ym-btn ym-btn-accent" id="mine-create-btn" '+S('width:100%;margin-bottom:16px')+'">✦ Create Wallet</button>'+
      '<details '+S('border:1px solid var(--border);border-radius:var(--r-sm);padding:8px 12px')+'>'+
        '<summary '+S('font-size:11px;color:var(--text3);cursor:pointer;user-select:none')+'">Import private key</summary>'+
        '<div '+S('display:flex;flex-direction:column;gap:6px;margin-top:10px')+'>'+
          '<input class="ym-input" id="mine-ik" type="password" placeholder="Base58 or JSON [0,1,…]"/>'+
          '<input class="ym-input" id="mine-ipw" type="password" placeholder="Password"/>'+
          '<button class="ym-btn ym-btn-ghost" id="mine-import-btn" '+S('width:100%;font-size:11px')+'">Import</button>'+
        '</div>'+
      '</details>'+
      '<div id="mine-err" class="ym-notice error" '+S('display:none;margin-top:10px')+'"></div>'+
      '<div '+S('margin-top:16px;padding-top:12px;border-top:1px solid var(--border)')+'>'+
        FAUCETS.map(f=>'<a href="'+f.url+'" target="_blank" rel="noopener" '+S('display:flex;align-items:center;gap:6px;padding:5px 0;font-size:11px;color:var(--cyan);text-decoration:none')+'">'+
          '<span '+S('font-size:9px')+'">↗</span>'+f.label+'</a>').join('')+
      '</div>';
  } else {
    body.innerHTML=hdr+
      (hint?'<div '+S('display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:var(--r-sm);padding:8px 12px;margin-bottom:12px;font-size:11px;color:var(--text3)')+'">'+
        '<span '+S('font-size:14px')+'">🔐</span> '+hint+'</div>':'')+
      '<input class="ym-input" id="mine-pw" type="password" placeholder="Password" '+S('margin-bottom:10px')+'"/>'+
      '<button class="ym-btn ym-btn-accent" id="mine-unlock-btn" '+S('width:100%;margin-bottom:16px')+'">🔓 Unlock</button>'+
      '<details '+S('border:1px solid var(--border);border-radius:var(--r-sm);padding:8px 12px;margin-bottom:8px')+'>'+
        '<summary '+S('font-size:11px;color:var(--text3);cursor:pointer;user-select:none')+'">Import / replace wallet</summary>'+
        '<div '+S('display:flex;flex-direction:column;gap:6px;margin-top:10px')+'>'+
          '<input class="ym-input" id="mine-ik" type="password" placeholder="Base58 or JSON array"/>'+
          '<input class="ym-input" id="mine-ipw" type="password" placeholder="New password"/>'+
          '<button class="ym-btn ym-btn-ghost" id="mine-import-btn" '+S('width:100%;font-size:11px')+'">Import &amp; Replace</button>'+
        '</div>'+
      '</details>'+
      '<button class="ym-btn ym-btn-danger" id="mine-reset-btn" '+S('width:100%;font-size:10px')+'">Delete local wallet</button>'+
      '<div id="mine-err" class="ym-notice error" '+S('display:none;margin-top:10px')+'"></div>'+
      '<div '+S('margin-top:16px;padding-top:12px;border-top:1px solid var(--border)')+'>'+
        FAUCETS.map(f=>'<a href="'+f.url+'" target="_blank" rel="noopener" '+S('display:flex;align-items:center;gap:6px;padding:5px 0;font-size:11px;color:var(--cyan);text-decoration:none')+'">'+
          '<span '+S('font-size:9px')+'">↗</span>'+f.label+'</a>').join('')+
      '</div>';
  }

  const $=id=>body.querySelector('#'+id);
  if($('mine-eye')) $('mine-eye').addEventListener('click',()=>{const i=$('mine-phrase');if(i)i.type=i.type==='password'?'text':'password';});
  if($('mine-create-btn')) $('mine-create-btn').addEventListener('click',async()=>{
    const pw=$('mine-pw')?$('mine-pw').value:'',pw2=$('mine-pw2')?$('mine-pw2').value:'';
    if(!pw)return showErr(body,'Password required');
    if(pw!==pw2)return showErr(body,'Passwords do not match');
    try{await createWallet($('mine-phrase')?$('mine-phrase').value:'',pw);await unlockWallet(pw);render(body);}catch(e){showErr(body,e.message);}
  });
  if($('mine-unlock-btn')) $('mine-unlock-btn').addEventListener('click',async()=>{
    const btn=$('mine-unlock-btn');btn.disabled=true;btn.textContent='…';
    try{await unlockWallet($('mine-pw')?$('mine-pw').value:'');render(body);}
    catch(e){showErr(body,e.message);btn.disabled=false;btn.textContent='🔓 Unlock';}
  });
  if($('mine-pw')) $('mine-pw').addEventListener('keydown',e=>{if(e.key==='Enter'){const b=$('mine-unlock-btn')||$('mine-create-btn');if(b)b.click();}});
  if($('mine-import-btn')) $('mine-import-btn').addEventListener('click',async()=>{
    const raw=($('mine-ik')?$('mine-ik').value:'').trim(),pw=$('mine-ipw')?$('mine-ipw').value:'';
    if(!raw||!pw)return showErr(body,'Fill all fields');
    try{await importWallet(raw,pw);await unlockWallet(pw);render(body);}catch(e){showErr(body,e.message);}
  });
  if($('mine-reset-btn')) $('mine-reset-btn').addEventListener('click',()=>{if(confirm('Delete local wallet? This cannot be undone.')){localStorage.removeItem(STORE_KEY);render(body);}});
}

function renderUnlocked(body){
  const c=calcClaimable(),addr=_wallet.pubkey||'';
  const short=addr.slice(0,6)+'…'+addr.slice(-6);
  const S=(s)=>'style="'+s+'"';

  body.innerHTML=
  // ── Header adresse
  '<div '+S('display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:8px')+'>'+
    '<div '+S('display:flex;align-items:center;gap:6px')+'>'+
      '<div '+S('width:24px;height:24px;border-radius:7px;background:linear-gradient(135deg,var(--accent),#e08020);display:flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0')+'">⛏</div>'+
      '<span id="mine-addr" '+S('font-family:var(--font-m);font-size:11px;color:var(--text2);cursor:pointer;letter-spacing:.5px')+'" title="Copier">'+short+'</span>'+
    '</div>'+
    '<div '+S('display:flex;gap:4px')+'>'+
      '<button class="ym-btn ym-btn-ghost" id="mine-copy" '+S('padding:3px 8px;font-size:11px')+'">⧉</button>'+
      '<button class="ym-btn ym-btn-danger" id="mine-lock" '+S('padding:3px 8px;font-size:11px')+'">🔒</button>'+
    '</div>'+
  '</div>'+

  // ── Balances 3 tuiles
  '<div '+S('display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;margin-bottom:8px')+'>'+
    _tile('SOL','mine-sol',_state.sol.toFixed(3),'#60a5fa')+
    _tile('YRM','mine-yrm',_state.ym.toFixed(2),'var(--accent)')+
    _tile('Claim','mine-cval',c.toFixed(4),'#22d3ee')+
  '</div>'+

  // ── Stats compactes sur une ligne
  '<div '+S('display:flex;gap:4px;margin-bottom:8px;flex-wrap:wrap')+'>'+
    _badge('Slot','mine-slot',_state.currentSlot||'—')+
    _badge('Burn',null,_state.lastBurnAmount?(_state.lastBurnAmount/1e9).toFixed(3)+' SOL':'—')+
    _badge('τ',null,_state.taxRate+'%')+
  '</div>'+

  // ── Burn & Claim compact
  '<div '+S('border:1px solid var(--border);border-radius:var(--r-sm);padding:8px 10px;margin-bottom:8px')+'>'+
    '<div '+S('display:flex;align-items:center;gap:6px;margin-bottom:6px')+'>'+
      '<input class="ym-input" id="mine-bamt" type="number" min="'+MIN_BURN+'" step="0.001" placeholder="SOL" '+S('flex:1;min-width:0;font-size:11px')+'"/>'+
      '<span '+S('font-size:10px;color:var(--text3)')+'">τ</span>'+
      '<span class="ym-stat-value" id="mine-rlbl" '+S('font-size:11px;color:var(--accent);min-width:26px')+'">20%</span>'+
      '<button class="ym-btn ym-btn-accent" id="mine-burn-btn" '+S('padding:5px 12px;font-size:11px')+'">🔥</button>'+
      '<button class="ym-btn ym-btn-ghost" id="mine-claim-btn" '+S('padding:5px 12px;font-size:11px;color:var(--cyan);border-color:rgba(34,211,238,.3)')+'">⚡</button>'+
    '</div>'+
    '<input class="ym-slider" id="mine-rslider" type="range" min="0" max="40" step="1" value="20" '+S('width:100%;margin-bottom:2px')+'"/>'+
    '<div '+S('display:flex;justify-content:space-between;font-size:9px;color:var(--text3)')+'"><span>instant</span><span style="font-size:9px;color:var(--text3)">Fee: <span id="mine-fee">—</span> SOL</span><span>patient</span></div>'+
    '<div id="mine-txmsg" class="ym-notice" '+S('display:none;margin-top:6px')+'"></div>'+
  '</div>'+

  // ── Receive + Send compacts
  '<div '+S('display:grid;grid-template-columns:auto 1fr;gap:8px;margin-bottom:8px')+'>'+
    '<div '+S('display:flex;flex-direction:column;align-items:center;gap:4px;background:rgba(255,255,255,.02);border:1px solid var(--border);border-radius:var(--r-sm);padding:8px')+'>'+
      '<div '+S('font-family:var(--font-d);font-size:8px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--text3);align-self:flex-start')+'">Receive</div>'+
      '<div id="mine-qr" '+S('background:#fff;padding:4px;border-radius:5px')+'"></div>'+
    '</div>'+
    '<div '+S('display:flex;flex-direction:column;gap:6px;background:rgba(255,255,255,.02);border:1px solid var(--border);border-radius:var(--r-sm);padding:8px')+'>'+
      '<div '+S('font-family:var(--font-d);font-size:8px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--text3)')+'">Send SOL</div>'+
      '<input class="ym-input" id="mine-sto" placeholder="Adresse" '+S('font-size:11px')+'"/>'+
      '<input class="ym-input" id="mine-samt" type="number" step="0.001" placeholder="Montant" '+S('font-size:11px')+'"/>'+
      '<button class="ym-btn ym-btn-accent" id="mine-send-btn" '+S('font-size:11px;padding:5px')+'">Send ↗</button>'+
    '</div>'+
  '</div>'+

  // ── Faucets + formule
  '<div '+S('display:flex;gap:8px;flex-wrap:wrap;padding-top:6px;border-top:1px solid var(--border);align-items:center')+'>'+
    FAUCETS.map(f=>'<a href="'+f.url+'" target="_blank" rel="noopener" '+S('font-size:10px;color:var(--cyan);text-decoration:none;opacity:.7')+'">↗ '+f.label+'</a>').join('')+
    '<span '+S('margin-left:auto;font-size:9px;color:var(--text3);font-family:var(--font-m)')+'">S·t<sup>α</sup>/[ln(A<sup>β</sup>+C)]<sup>γ</sup></span>'+
  '</div>';

  // QR petit
  if(window.QRCode&&addr){
    const el=body.querySelector('#mine-qr');
    if(el){el.innerHTML='';new window.QRCode(el,{text:addr,width:72,height:72,correctLevel:window.QRCode.CorrectLevel.M});}
  }

  const $=id=>body.querySelector('#'+id);
  _updateFee(body);
  if($('mine-rslider'))$('mine-rslider').addEventListener('input',()=>{if($('mine-rlbl'))$('mine-rlbl').textContent=$('mine-rslider').value+'%';_updateFee(body);});
  if($('mine-bamt'))$('mine-bamt').addEventListener('input',()=>_updateFee(body));

  function copyAddr(){
    if(navigator.clipboard)navigator.clipboard.writeText(addr);
    if(window.YM_toast)window.YM_toast('Adresse copiée','success');
  }
  if($('mine-copy'))$('mine-copy').addEventListener('click',copyAddr);
  if($('mine-addr'))$('mine-addr').addEventListener('click',copyAddr);
  if($('mine-lock'))$('mine-lock').addEventListener('click',()=>{lockWallet();render(body);});

  if($('mine-burn-btn'))$('mine-burn-btn').addEventListener('click',async()=>{
    const amtEl=$('mine-bamt'),rslEl=$('mine-rslider');
    const amt=parseFloat(amtEl?amtEl.value:0),rate=parseInt(rslEl?rslEl.value:20);
    if(!amt||amt<MIN_BURN)return showTx(body,'Min '+MIN_BURN+' SOL',true);
    if(amt>_state.sol)return showTx(body,'SOL insuffisant',true);
    const btn=$('mine-burn-btn');btn.disabled=true;btn.textContent='⏳';
    try{const sig=await doBurn(amt,rate);showTx(body,'✓ '+sig.slice(0,10)+'…');setTimeout(refreshBalances,2000);}
    catch(e){showTx(body,e.message,true);}
    finally{if(btn){btn.disabled=false;btn.textContent='🔥';}}
  });

  if($('mine-claim-btn'))$('mine-claim-btn').addEventListener('click',async()=>{
    if(calcClaimable()<=0)return showTx(body,'Rien à claim',true);
    const btn=$('mine-claim-btn');btn.disabled=true;btn.textContent='⏳';
    try{const sig=await doClaim();showTx(body,'✓ '+sig.slice(0,10)+'…');setTimeout(refreshBalances,2000);}
    catch(e){showTx(body,e.message,true);}
    finally{if(btn){btn.disabled=false;btn.textContent='⚡';}}
  });

  if($('mine-send-btn'))$('mine-send-btn').addEventListener('click',async()=>{
    const to=($('mine-sto')?$('mine-sto').value:'').trim(),amt=parseFloat($('mine-samt')?$('mine-samt').value:0);
    if(!to||!amt)return;
    const btn=$('mine-send-btn');btn.disabled=true;btn.textContent='…';
    try{const sig=await doSend(to,amt);showTx(body,'✓ Envoyé '+sig.slice(0,10)+'…');setTimeout(refreshBalances,2000);}
    catch(e){showTx(body,e.message,true);}
    finally{if(btn){btn.disabled=false;btn.textContent='Send ↗';}}
  });

  _startCycles(body);
}

// ── UI HELPERS ────────────────────────────────────────────────────────────────
function _tile(label,id,val,color){
  return '<div style="background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:var(--r-sm);padding:8px 10px;min-width:0">'+
    '<div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px">'+label+'</div>'+
    '<div id="'+id+'" style="font-family:var(--font-m);font-size:13px;font-weight:600;color:'+color+';overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+val+'</div>'+
  '</div>';
}
function _badge(label,id,val){
  const inner='<span style="color:var(--text3);font-size:9px;text-transform:uppercase;margin-right:4px">'+label+'</span>'+
    '<span '+(id?'id="'+id+'"':'')+' style="font-size:10px;color:var(--text2)">'+val+'</span>';
  return '<div style="background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:var(--r-sm);padding:4px 8px;white-space:nowrap">'+inner+'</div>';
}

function _updateFee(body){
  const el=body.querySelector('#mine-fee');
  if(el){const amtEl=body.querySelector('#mine-bamt');const a=parseFloat(amtEl?amtEl.value:0);el.textContent=isNaN(a)?'—':(a*0.001).toFixed(6)+' SOL';}
}
function _startCycles(body){
  clearInterval(_cycleTimer);clearInterval(_claimTimer);
  _cycleTimer=setInterval(refreshBalances,15000);
  _claimTimer=setInterval(()=>{
    const c=calcClaimable();
    const el=document.getElementById('mine-cval');if(el)el.textContent=c.toFixed(6);
    _updateFigureBtn();
  },2000);
}
function showErr(body,msg){const e=body.querySelector('#mine-err');if(e){e.textContent=msg;e.style.display='flex';}}
function showTx(body,msg,err){
  err=err||false;
  const e=document.getElementById('mine-txmsg');if(!e)return;
  e.textContent=msg;e.className='ym-notice '+(err?'error':'success');e.style.display='flex';
  setTimeout(()=>{e.style.display='none';},5000);
}

// ── EXPORT ───────────────────────────────────────────────────────────────────
window.YM_Mine = { render, refreshBalances, calcClaimable, signMessage };

// Pre-load solana + nacl
_loadSolana().catch(()=>{});
_loadNacl().catch(()=>{});

})();
