// mine.sphere.js — YourMine · Proof of Sacrifice
(function(){
'use strict';
window.YM_S=window.YM_S||{};

// Exposed so bio.site.html can read
let _mineState={sol:0,ym:0,lastBurnLamports:0,lastActionSlot:0,taxRate:20,totalBurned:0,currentSlot:0,programInitialized:false};
let walletState={locked:true,keypair:null,pubkey:null,connection:null};
let pdas={};
let _cycleTimer=null,_claimTimer=null,_ctx=null;

window.YM_S['mine.sphere.js']={
  name:'Mine',icon:'⛏',category:'YourMine',
  author:'theodoreyong9',
  description:'Solana wallet + Proof of Sacrifice on-chain mining',
  _mineState,

  async activate(ctx){
    _ctx=ctx;
    await _loadSolana();await _loadQR();
    // Header button — opens mine panel
    ctx.addHeaderBtn('⛏',()=>openMine(ctx));
    // Figure tab — wallet balances
    ctx.addFigureTab('Wallet',renderFigure,0);
    if(!walletState.locked)await refreshBalances().then(()=>_updateFigCount(ctx));
  },
  deactivate(){clearInterval(_cycleTimer);clearInterval(_claimTimer)},
  getBroadcastData(){return walletState.pubkey?{type:'mine',pubkey:walletState.pubkey,claimable:calcClaimable().toFixed(4)}:null},
};

// ── CONFIG ────────────────────────────────────────────────
const PID='6ue88JtUXzKN5yrFkauU85EHpg4aSsM9QfarvHBQS7TZ';
const CREATOR='7Cjt3kRF6FvQQ2XkfxcdsaU9hAZsz6odXWVaLUUhRLZ6';
const TOKEN_PGM='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const ASSOC_PGM='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1brs';
const DEVNET='https://api.devnet.solana.com',DEVNET2='https://rpc.ankr.com/solana_devnet';
const STORE_KEY='ym_wallet_v1';
const MIN_BURN=0.0001;

async function _loadSolana(){if(window.solanaWeb3)return;await new Promise((r,j)=>{const s=document.createElement('script');s.src='https://unpkg.com/@solana/web3.js@1.98.0/lib/index.iife.min.js';s.onload=r;s.onerror=j;document.head.appendChild(s)})}
async function _loadQR(){if(window.QRCode)return;await new Promise(r=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';s.onload=r;s.onerror=r;document.head.appendChild(s)})}

// ── OPEN MINE (sphere panel via ctx pill or direct call) ──
function openMine(ctx){
  // Use the sphere panel system
  if(!ctx._openMinePanel){
    ctx.addPill('',body=>renderMine(body));
    ctx._openMinePanel=true;
  }
  // Directly trigger the sphere panel
  window.YM?.openSpherePanel?.('mine.sphere.js')||_openFallback();
}
function _openFallback(){
  let panel=document.getElementById('mine-standalone');
  if(!panel){panel=document.createElement('div');panel.id='mine-standalone';panel.style.cssText='position:fixed;inset:0;background:var(--bg);z-index:700;overflow-y:auto';const close=document.createElement('button');close.textContent='×';close.style.cssText='position:sticky;top:12px;left:calc(100% - 44px);display:block;width:32px;height:32px;border-radius:50%;background:var(--surface2);border:1px solid var(--border);color:var(--text2);font-size:1.2rem;cursor:pointer;z-index:1';close.onclick=()=>panel.style.display='none';panel.appendChild(close);const body=document.createElement('div');renderMine(body);panel.appendChild(body);document.body.appendChild(panel)}
  else{panel.style.display='';const body=panel.querySelector('.mine-wrap')?.parentElement;if(body)renderMine(body)}
}

// ── BASE58 ────────────────────────────────────────────────
const B58=(()=>{const A='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz',M={};for(let i=0;i<A.length;i++)M[A[i]]=BigInt(i);return{encode(b){let n=0n;for(const x of b)n=(n<<8n)|BigInt(x);let s='';while(n>0n){s=A[Number(n%58n)]+s;n/=58n}for(const x of b){if(x!==0)break;s='1'+s}return s},decode(s){let n=0n;for(const c of s){if(!(c in M))throw Error('Bad b58');n=n*58n+M[c]}const h=n.toString(16).padStart(2,'0');const b=Uint8Array.from((h.length%2?'0'+h:h).match(/.{2}/g).map(x=>parseInt(x,16)));let l=0;for(const c of s){if(c==='1')l++;else break}const o=new Uint8Array(l+b.length);o.set(b,l);return o}}})();

async function mnemonicToSeed(m){const e=new TextEncoder(),k=await crypto.subtle.importKey('raw',e.encode(m.normalize('NFKD')),'PBKDF2',false,['deriveBits']);return new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:e.encode('mnemonic'),iterations:2048,hash:'SHA-512'},k,512))}
async function slip10(seed,path){const mk=await crypto.subtle.importKey('raw',new TextEncoder().encode('ed25519 seed'),{name:'HMAC',hash:'SHA-512'},false,['sign']);let I=new Uint8Array(await crypto.subtle.sign('HMAC',mk,seed)),kL=I.slice(0,32),kR=I.slice(32);for(const seg of path.replace(/^m\//,'').split('/')){const hard=seg.endsWith("'");const idx=((parseInt(seg)+(hard?0x80000000:0))>>>0);const d=new Uint8Array(37);d[0]=0;d.set(kL,1);d[33]=(idx>>>24)&0xff;d[34]=(idx>>>16)&0xff;d[35]=(idx>>>8)&0xff;d[36]=idx&0xff;const ck=await crypto.subtle.importKey('raw',kR,{name:'HMAC',hash:'SHA-512'},false,['sign']);const ci=new Uint8Array(await crypto.subtle.sign('HMAC',ck,d));kL=ci.slice(0,32);kR=ci.slice(32)}return kL}
async function pwKey(pw,salt){const km=await crypto.subtle.importKey('raw',new TextEncoder().encode(pw),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:200000,hash:'SHA-256'},km,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])}
async function saveEnc(secret,pw,kp){const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),key=await pwKey(pw,salt),ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(secret));localStorage.setItem(STORE_KEY,JSON.stringify({salt:Array.from(salt),iv:Array.from(iv),ct:Array.from(new Uint8Array(ct)),hint:kp?kp.publicKey.toString().slice(0,8)+'…':''}))}
async function loadEnc(pw){const raw=localStorage.getItem(STORE_KEY);if(!raw)throw Error('No wallet');const{salt,iv,ct}=JSON.parse(raw);const key=await pwKey(pw,new Uint8Array(salt));let pt;try{pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(iv)},key,new Uint8Array(ct))}catch{throw Error('Wrong password')}return new TextDecoder().decode(pt)}
function hasSaved(){return!!localStorage.getItem(STORE_KEY)}
function savedHint(){try{return JSON.parse(localStorage.getItem(STORE_KEY)||'{}').hint||''}catch{return''}}

async function kpFromSecret(secret){const sol=window.solanaWeb3;if(secret.startsWith('phrase:')){const words=secret.slice(7).trim().replace(/\s+/g,' ').toLowerCase().split(' ');const seed=await mnemonicToSeed(words.join(' '));return sol.Keypair.fromSeed(await slip10(seed,"m/44'/501'/0'/0'"))}if(secret.startsWith('privkey:')){const raw=secret.slice(8).trim();let bytes;try{bytes=B58.decode(raw)}catch{bytes=raw.startsWith('[')?new Uint8Array(JSON.parse(raw)):Uint8Array.from(raw.match(/.{1,2}/g).map(b=>parseInt(b,16)))}return bytes.length===64?sol.Keypair.fromSecretKey(bytes):sol.Keypair.fromSeed(bytes)}throw Error('Bad secret')}

async function getConn(){if(walletState.connection)return walletState.connection;const sol=window.solanaWeb3;for(const ep of[DEVNET,DEVNET2]){try{const c=new sol.Connection(ep,'confirmed');await Promise.race([c.getLatestBlockhash(),new Promise((_,r)=>setTimeout(()=>r(),4000))]);walletState.connection=c;return c}catch{}}walletState.connection=new sol.Connection(DEVNET,'confirmed');return walletState.connection}

async function computePDAs(pk){const sol=window.solanaWeb3,pg=new sol.PublicKey(PID),e=new TextEncoder();const[g]=await sol.PublicKey.findProgramAddress([e.encode('global_state')],pg);const[ym]=await sol.PublicKey.findProgramAddress([e.encode('yrm_mint')],pg);const[sv]=await sol.PublicKey.findProgramAddress([e.encode('sol_vault')],pg);const[ua]=await sol.PublicKey.findProgramAddress([e.encode('user_account'),pk.toBytes()],pg);const[ut]=await sol.PublicKey.findProgramAddress([pk.toBuffer(),new sol.PublicKey(TOKEN_PGM).toBuffer(),ym.toBuffer()],new sol.PublicKey(ASSOC_PGM));pdas={globalState:g,yrmMint:ym,solVault:sv,userAccount:ua,userToken:ut}}

function serBurn(lam,tax){const b=new ArrayBuffer(17),v=new DataView(b);[203,142,66,81,199,170,67,130].forEach((x,i)=>new Uint8Array(b)[i]=x);v.setBigUint64(8,BigInt(lam),true);v.setUint8(16,Math.round(tax));return new Uint8Array(b)}
function serClaim(){return new Uint8Array([62,198,214,193,213,159,108,210])}
function serInit(){return new Uint8Array([175,175,109,31,13,152,155,237])}

async function buildSend(tx){const conn=await getConn(),kp=walletState.keypair;if(!kp)throw Error('Locked');const{blockhash}=await conn.getLatestBlockhash('confirmed');tx.recentBlockhash=blockhash;tx.feePayer=kp.publicKey;tx.sign(kp);const sig=await conn.sendRawTransaction(tx.serialize());await conn.confirmTransaction(sig,'confirmed');return sig}
async function ensureInit(){if(_mineState.programInitialized)return;const conn=await getConn(),sol=window.solanaWeb3;const info=await conn.getAccountInfo(pdas.globalState);if(info){_mineState.programInitialized=true;return}const tx=new sol.Transaction();tx.add(new sol.TransactionInstruction({keys:[{pubkey:pdas.globalState,isSigner:false,isWritable:true},{pubkey:pdas.yrmMint,isSigner:false,isWritable:true},{pubkey:walletState.keypair.publicKey,isSigner:true,isWritable:true},{pubkey:new sol.PublicKey(TOKEN_PGM),isSigner:false,isWritable:false},{pubkey:sol.SystemProgram.programId,isSigner:false,isWritable:false}],programId:new sol.PublicKey(PID),data:serInit()}));await buildSend(tx);_mineState.programInitialized=true}
async function doBurn(amt,tax){const sol=window.solanaWeb3,lam=Math.floor(amt*sol.LAMPORTS_PER_SOL);await ensureInit();const tx=new sol.Transaction();tx.add(new sol.TransactionInstruction({keys:[{pubkey:pdas.globalState,isSigner:false,isWritable:true},{pubkey:pdas.userAccount,isSigner:false,isWritable:true},{pubkey:pdas.yrmMint,isSigner:false,isWritable:true},{pubkey:pdas.userToken,isSigner:false,isWritable:true},{pubkey:pdas.solVault,isSigner:false,isWritable:true},{pubkey:new sol.PublicKey(CREATOR),isSigner:false,isWritable:true},{pubkey:walletState.keypair.publicKey,isSigner:true,isWritable:true},{pubkey:new sol.PublicKey(TOKEN_PGM),isSigner:false,isWritable:false},{pubkey:new sol.PublicKey(ASSOC_PGM),isSigner:false,isWritable:false},{pubkey:sol.SystemProgram.programId,isSigner:false,isWritable:false}],programId:new sol.PublicKey(PID),data:serBurn(lam,tax)}));return buildSend(tx)}
async function doClaim(){const sol=window.solanaWeb3,tx=new sol.Transaction();tx.add(new sol.TransactionInstruction({keys:[{pubkey:pdas.globalState,isSigner:false,isWritable:true},{pubkey:pdas.userAccount,isSigner:false,isWritable:true},{pubkey:pdas.yrmMint,isSigner:false,isWritable:true},{pubkey:pdas.userToken,isSigner:false,isWritable:true},{pubkey:walletState.keypair.publicKey,isSigner:true,isWritable:false},{pubkey:new sol.PublicKey(TOKEN_PGM),isSigner:false,isWritable:false}],programId:new sol.PublicKey(PID),data:serClaim()}));return buildSend(tx)}
async function doSend(to,amt){const sol=window.solanaWeb3,tx=new sol.Transaction().add(sol.SystemProgram.transfer({fromPubkey:walletState.keypair.publicKey,toPubkey:new sol.PublicKey(to),lamports:Math.floor(amt*sol.LAMPORTS_PER_SOL)}));return buildSend(tx)}

async function refreshBalances(){if(!walletState.pubkey)return;const sol=window.solanaWeb3,conn=await getConn(),pk=new sol.PublicKey(walletState.pubkey);try{_mineState.sol=await conn.getBalance(pk)/sol.LAMPORTS_PER_SOL}catch{}try{const info=await conn.getAccountInfo(pdas.userToken);if(info?.data){const v=new DataView(info.data.buffer);_mineState.ym=Number(v.getBigUint64(64,true))/1e18}}catch{}try{_mineState.currentSlot=await conn.getSlot()}catch{}try{const info=await conn.getAccountInfo(pdas.userAccount);if(info?.data&&info.data.length>=65){const v=new DataView(info.data.buffer);let o=40;_mineState.taxRate=v.getUint8(o);o++;_mineState.lastActionSlot=Number(v.getBigUint64(o,true));o+=8;_mineState.totalBurned=Number(v.getBigUint64(o,true));o+=8;_mineState.lastBurnLamports=Number(v.getBigUint64(o,true))}}catch{}try{_mineState.programInitialized=!!(await conn.getAccountInfo(pdas.globalState))}catch{}// Also save pubkey to profile for bio.site
  if(_ctx&&walletState.pubkey)_ctx.saveProfile({pubkey:walletState.pubkey});
  _updateUI();if(_ctx)_updateFigCount(_ctx)}

function calcClaimable(){const{lastBurnLamports:lb,lastActionSlot:las,currentSlot:cs,taxRate:tr}=_mineState;if(!lb||!las||!cs)return 0;const dSlot=Math.max(1,cs-las),dGen=Math.max(1,cs-111111111);if(dSlot<30)return 0;const S=lb/1e9,tau=Math.min(tr,40)/100;const num=Math.pow(dSlot,1.1)*S;const inner=Math.pow(dGen,2.2*(1-tau))+Math.pow(33,3);if(inner<=1)return 0;const den=Math.pow(Math.log(inner),3);if(den<=0||!isFinite(den)||!isFinite(num))return 0;const r=num/den;return(r<0||!isFinite(r)||r>1e12)?0:r}

async function unlockWallet(pw){const secret=await loadEnc(pw);const kp=await kpFromSecret(secret);walletState={locked:false,keypair:kp,pubkey:kp.publicKey.toString(),connection:null};await computePDAs(kp.publicKey);await refreshBalances();return kp}
function lockWallet(){walletState.keypair?.secretKey?.fill(0);walletState={locked:true,keypair:null,pubkey:null,connection:null};pdas={};clearInterval(_cycleTimer);clearInterval(_claimTimer)}
async function createWallet(phrase,pw){const sol=window.solanaWeb3;let secret,kp;if(phrase?.trim()){const w=phrase.trim().replace(/\s+/g,' ').toLowerCase().split(' ');if(w.length!==12&&w.length!==24)throw Error('Need 12 or 24 words');secret='phrase:'+w.join(' ');kp=await kpFromSecret(secret)}else{kp=sol.Keypair.generate();secret='privkey:'+B58.encode(kp.secretKey)}await saveEnc(secret,pw,kp);return kp}
async function importWallet(raw,pw){const sol=window.solanaWeb3;let kp;if(raw.startsWith('[')){kp=sol.Keypair.fromSecretKey(new Uint8Array(JSON.parse(raw)))}else{let bytes;try{bytes=B58.decode(raw)}catch{bytes=/^[0-9a-f]+$/i.test(raw)?Uint8Array.from(raw.match(/.{2}/g).map(b=>parseInt(b,16))):new Uint8Array(JSON.parse(raw))}kp=bytes.length===64?sol.Keypair.fromSecretKey(bytes):sol.Keypair.fromSeed(bytes)}const secret='privkey:'+B58.encode(kp.secretKey);await saveEnc(secret,pw,kp);return kp}

function _updateFigCount(ctx){ctx.updateFigureCount(_mineState.ym>0?1:0)}
function renderFigure(el){
  const c=calcClaimable();
  el.innerHTML=`<div style="padding:20px">
    <div class="ym-panel">
      <div class="ym-panel-title">Balances</div>
      <div class="ym-stat-row"><span class="ym-stat-label">SOL</span><span class="ym-stat-value blue" id="fig-sol">${_mineState.sol.toFixed(6)}</span></div>
      <div class="ym-stat-row"><span class="ym-stat-label">YRM</span><span class="ym-stat-value accent" id="fig-yrm">${_mineState.ym.toFixed(4)}</span></div>
      <div class="ym-stat-row"><span class="ym-stat-label">Claimable</span><span class="ym-stat-value gold" id="fig-claim">${c.toFixed(6)}</span></div>
      <div class="ym-stat-row"><span class="ym-stat-label">Last Burn</span><span class="ym-stat-value">${_mineState.lastBurnLamports?(_mineState.lastBurnLamports/1e9).toFixed(4)+' SOL':'—'}</span></div>
      <div class="ym-stat-row"><span class="ym-stat-label">Patience τ</span><span class="ym-stat-value">${_mineState.taxRate}%</span></div>
    </div>
    ${walletState.pubkey?`<div class="ym-panel"><div class="ym-panel-title">Address</div><div style="font-family:var(--font-mono);font-size:10px;color:var(--accent);word-break:break-all;cursor:pointer" onclick="navigator.clipboard?.writeText('${walletState.pubkey}')" title="Click to copy">${walletState.pubkey}</div></div>`:''}
  </div>`
}

function renderMine(body){
  if(!document.getElementById('mine-css')){const s=document.createElement('style');s.id='mine-css';s.textContent=`.mine-wrap{padding:16px;display:flex;flex-direction:column;gap:10px}.mine-addr{font-family:var(--font-mono);font-size:9px;color:var(--text3);word-break:break-all;margin-top:2px}`;document.head.appendChild(s)}
  if(walletState.locked)renderLocked(body);else renderUnlocked(body);
}

function renderLocked(body){
  const has=hasSaved(),hint=savedHint();
  body.innerHTML=`<div class="mine-wrap">
    ${!has?`
      <div class="ym-notice info">BIP39 phrase (12 or 24 words) compatible with Phantom. Leave empty to generate a new wallet.</div>
      <div style="position:relative">
        <input class="ym-input" id="mine-phrase" type="password" placeholder="BIP39 phrase (optional)" style="padding-right:38px"/>
        <button type="button" id="mine-eye" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text3);cursor:pointer">👁</button>
      </div>
      <input class="ym-input" id="mine-pw" type="password" placeholder="Encryption password"/>
      <input class="ym-input" id="mine-pw2" type="password" placeholder="Confirm password"/>
      <button class="ym-btn ym-btn-accent" id="mine-create-btn" style="width:100%">Create Wallet</button>
      <details><summary style="font-size:10px;color:var(--text3);cursor:pointer;padding:4px 0">Import private key</summary>
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">
          <input class="ym-input" id="mine-ik" type="password" placeholder="Base58 or JSON array [0,1,…]"/>
          <input class="ym-input" id="mine-ipw" type="password" placeholder="Password"/>
          <button class="ym-btn" id="mine-import-btn" style="width:100%">Import</button>
        </div>
      </details>
    `:`
      ${hint?`<div style="font-size:10px;color:var(--text3)">Wallet: ${hint}</div>`:''}
      <input class="ym-input" id="mine-pw" type="password" placeholder="Password"/>
      <button class="ym-btn ym-btn-accent" id="mine-unlock-btn" style="width:100%">Unlock</button>
      <details><summary style="font-size:10px;color:var(--text3);cursor:pointer;padding:4px 0">Import another wallet</summary>
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">
          <input class="ym-input" id="mine-ik" type="password" placeholder="Base58 or JSON array"/>
          <input class="ym-input" id="mine-ipw" type="password" placeholder="New password"/>
          <button class="ym-btn" id="mine-import-btn" style="width:100%">Import &amp; Replace</button>
        </div>
      </details>
      <button class="ym-btn ym-btn-ghost" id="mine-reset-btn" style="width:100%;font-size:10px">Delete local wallet</button>
    `}
    <div id="mine-err" class="ym-notice error" style="display:none"></div>
  </div>`;
  const $=id=>body.querySelector('#'+id);
  $('mine-eye')?.addEventListener('click',()=>{const i=$('mine-phrase');if(i)i.type=i.type==='password'?'text':'password'});
  $('mine-create-btn')?.addEventListener('click',async()=>{const pw=$('mine-pw')?.value||'',pw2=$('mine-pw2')?.value||'';if(!pw)return showErr(body,'Password required');if(pw!==pw2)return showErr(body,'Passwords differ');try{await createWallet($('mine-phrase')?.value||'',pw);await unlockWallet(pw);renderUnlocked(body)}catch(e){showErr(body,e.message)}});
  $('mine-unlock-btn')?.addEventListener('click',async()=>{try{await unlockWallet($('mine-pw')?.value||'');renderUnlocked(body)}catch(e){showErr(body,e.message)}});
  $('mine-pw')?.addEventListener('keydown',e=>{if(e.key==='Enter')$('mine-unlock-btn')?.click()});
  $('mine-import-btn')?.addEventListener('click',async()=>{const raw=($('mine-ik')?.value||'').trim(),pw=$('mine-ipw')?.value||'';if(!raw||!pw)return showErr(body,'Fill all fields');try{await importWallet(raw,pw);await unlockWallet(pw);renderUnlocked(body)}catch(e){showErr(body,e.message)}});
  $('mine-reset-btn')?.addEventListener('click',()=>{if(confirm('Delete local wallet?')){localStorage.removeItem('ym_wallet_v1');renderLocked(body)}});
}

function renderUnlocked(body){
  const c=calcClaimable(),addr=walletState.pubkey||'';
  body.innerHTML=`<div class="mine-wrap">
    <div class="ym-panel" style="margin-bottom:0">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <div><div class="ym-panel-title" style="margin-bottom:2px">Active Wallet</div><div class="mine-addr">${addr}</div></div>
        <div style="display:flex;gap:6px">
          <button class="ym-btn ym-btn-ghost" id="mine-copy" style="padding:5px 10px" title="Copy">⧉</button>
          <button class="ym-btn ym-btn-danger" id="mine-lock" style="padding:5px 12px;font-size:11px">Lock</button>
        </div>
      </div>
    </div>
    <div class="ym-panel">
      <div class="ym-panel-title">Balances</div>
      <div class="ym-stat-row"><span class="ym-stat-label">SOL</span><span class="ym-stat-value blue" id="mine-sol">${_mineState.sol.toFixed(6)}</span></div>
      <div class="ym-stat-row"><span class="ym-stat-label">YRM</span><span class="ym-stat-value accent" id="mine-yrm">${_mineState.ym.toFixed(4)}</span></div>
      <div class="ym-stat-row"><span class="ym-stat-label">Claimable</span><span class="ym-stat-value gold" id="mine-cval">${c.toFixed(6)}</span></div>
      <div class="ym-stat-row"><span class="ym-stat-label">Slot</span><span class="ym-stat-value" id="mine-slot">${_mineState.currentSlot||'—'}</span></div>
    </div>
    <div class="ym-panel">
      <div class="ym-panel-title">Burn &amp; Claim</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <input class="ym-input" id="mine-bamt" type="number" min="${MIN_BURN}" step="0.001" placeholder="${MIN_BURN} SOL minimum"/>
        <div>
          <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">Patience τ</span><span style="font-family:var(--font-display);font-size:13px;font-weight:700;color:var(--accent)" id="mine-rlbl">20%</span></div>
          <input class="ym-slider" id="mine-rslider" type="range" min="0" max="40" step="1" value="20"/>
          <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--text3);margin-top:3px"><span>0% fast</span><span>40% max bonus</span></div>
        </div>
        <div class="ym-notice info" style="font-size:10px">Fee 0.1%: <strong id="mine-fee">—</strong> SOL</div>
        <div style="display:flex;gap:8px">
          <button class="ym-btn ym-btn-accent" id="mine-burn-btn" style="flex:1">🔥 Burn</button>
          <button class="ym-btn" id="mine-claim-btn" style="flex:1">⚡ Claim (<span id="mine-ca">${c.toFixed(4)}</span>)</button>
        </div>
        <div id="mine-txmsg" class="ym-notice success" style="display:none"></div>
      </div>
    </div>
    <div class="ym-panel">
      <div class="ym-panel-title">Receive</div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:10px">
        <div id="mine-qr" style="background:#fff;padding:8px;border-radius:8px"></div>
        <div style="font-family:var(--font-mono);font-size:9px;color:var(--text3);word-break:break-all;text-align:center">${addr}</div>
        <button class="ym-btn ym-btn-ghost" id="mine-copy2" style="width:100%">⧉ Copy address</button>
      </div>
    </div>
    <div class="ym-panel">
      <div class="ym-panel-title">Send SOL</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <input class="ym-input" id="mine-sto" placeholder="Recipient address"/>
        <input class="ym-input" id="mine-samt" type="number" step="0.001" placeholder="Amount SOL"/>
        <button class="ym-btn ym-btn-accent" id="mine-send-btn">Send</button>
      </div>
    </div>
  </div>`;
  if(window.QRCode&&addr){const el=body.querySelector('#mine-qr');if(el){el.innerHTML='';new QRCode(el,{text:addr,width:150,height:150,correctLevel:QRCode.CorrectLevel.M})}}
  const $=id=>body.querySelector('#'+id);
  _updateFee(body);
  $('mine-rslider')?.addEventListener('input',()=>{const l=$('mine-rlbl');if(l)l.textContent=$('mine-rslider').value+'%';_updateFee(body)});
  $('mine-bamt')?.addEventListener('input',()=>_updateFee(body));
  $('mine-copy')?.addEventListener('click',()=>navigator.clipboard?.writeText(addr));
  $('mine-copy2')?.addEventListener('click',()=>navigator.clipboard?.writeText(addr));
  $('mine-lock')?.addEventListener('click',()=>{lockWallet();renderLocked(body)});
  $('mine-burn-btn')?.addEventListener('click',async()=>{
    const amt=parseFloat($('mine-bamt')?.value||0),rate=parseInt($('mine-rslider')?.value||20);
    if(!amt||amt<MIN_BURN)return showTx(body,`Min ${MIN_BURN} SOL`,true);if(amt>_mineState.sol)return showTx(body,'Insufficient SOL',true);
    $('mine-burn-btn').disabled=true;$('mine-burn-btn').textContent='⏳';
    try{const sig=await doBurn(amt,rate);showTx(body,'Burn confirmed ✓ '+sig.slice(0,12)+'…');setTimeout(refreshBalances,2000)}catch(e){showTx(body,e.message,true)}
    finally{const b=$('mine-burn-btn');if(b){b.disabled=false;b.textContent='🔥 Burn'}}
  });
  $('mine-claim-btn')?.addEventListener('click',async()=>{
    if(calcClaimable()<=0)return showTx(body,'Nothing to claim yet',true);
    $('mine-claim-btn').disabled=true;$('mine-claim-btn').innerHTML='⏳';
    try{const sig=await doClaim();showTx(body,'Claim confirmed ✓ '+sig.slice(0,12)+'…');setTimeout(refreshBalances,2000)}catch(e){showTx(body,e.message,true)}
    finally{const b=$('mine-claim-btn');if(b){b.disabled=false;b.innerHTML=`⚡ Claim (<span id="mine-ca">${calcClaimable().toFixed(4)}</span>)`}}
  });
  $('mine-send-btn')?.addEventListener('click',async()=>{const to=$('mine-sto')?.value?.trim(),amt=parseFloat($('mine-samt')?.value||0);if(!to||!amt)return;try{const sig=await doSend(to,amt);showTx(body,'Sent ✓ '+sig.slice(0,12)+'…');setTimeout(refreshBalances,2000)}catch(e){showTx(body,e.message,true)}});
  startCycles(body);
}

function _updateFee(body){const el=body.querySelector('#mine-fee');if(el){const a=parseFloat(body.querySelector('#mine-bamt')?.value||0);el.textContent=(a*0.001).toFixed(6)+' SOL'}}
function startCycles(body){
  clearInterval(_cycleTimer);clearInterval(_claimTimer);
  _cycleTimer=setInterval(refreshBalances,15000);
  _claimTimer=setInterval(()=>{
    const c=calcClaimable();
    const cv=document.getElementById('mine-cval');if(cv)cv.textContent=c.toFixed(6);
    const ca=document.getElementById('mine-ca');if(ca)ca.textContent=c.toFixed(4);
    const fc=document.getElementById('fig-claim');if(fc)fc.textContent=c.toFixed(6);
  },2000);
}
function _updateUI(){
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v};
  set('mine-sol',_mineState.sol.toFixed(6));set('mine-yrm',_mineState.ym.toFixed(4));set('mine-slot',_mineState.currentSlot||'—');
  set('fig-sol',_mineState.sol.toFixed(6));set('fig-yrm',_mineState.ym.toFixed(4));
}
function showErr(body,msg){const e=body.querySelector('#mine-err');if(e){e.textContent=msg;e.style.display='flex'}}
function showTx(body,msg,err=false){const e=document.getElementById('mine-txmsg');if(!e)return;e.textContent=msg;e.className='ym-notice '+(err?'error':'success');e.style.display='flex';setTimeout(()=>{e.style.display='none'},5000)}
})();
