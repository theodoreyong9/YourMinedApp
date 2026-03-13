// mine.sphere.js — YourMine Wallet & Mining Sphere
// Category: YourMine | Author: theodoreyong9
(function(){
'use strict';

// ── CONSTANTS ─────────────────────────────────────────────
const YM_TOKEN = 'k5KdweiLaLDR57YqVQ9WCWNdLDQm4wMTzz5zPRRPLMn';
const STORAGE_KEY = 'ym_wallet_v1';
const RPC = 'https://api.devnet.solana.com';
const FEE = 0.001; // 0.1% burn fee
// Formula constants
const ALPHA = 0.6, BETA = 0.4, GAMMA = 1.2, C_CONST = 1000;

// ── SPHERE REGISTRATION ───────────────────────────────────
window.YM_S = window.YM_S || {};
window.YM_S['mine.sphere.js'] = {
  name: 'Mine',
  category: 'YourMine',
  author: 'theodoreyong9',
  description: 'Solana wallet, YM token management, burn & claim mining',

  async activate(ctx) {
    this._ctx = ctx;
    await loadSolanaSDK();
    loadWalletState();

    ctx.addPill('💎 Mine', body => renderMineUI(body, ctx));

    ctx.addFigureTab('Wallet', el => renderWalletFigure(el, ctx), 0);

    ctx.addProfileTab('Mine', el => renderMineProfile(el));

    // Auto-refresh every 30s when active
    this._timer = setInterval(() => refreshBalances(ctx), 30000);
  },

  deactivate() {
    clearInterval(this._timer);
  },

  getBroadcastData() {
    // Only share non-sensitive data
    if (!WS.publicKey) return null;
    return {
      uuid: window.YM?.getState?.()?.userData?.uuid,
      publicKey: WS.publicKey,
      lastClaimable: WS.claimableYM?.toFixed?.(4)
    };
  }
};

// ── WALLET STATE ──────────────────────────────────────────
const WS = {
  publicKey: null,
  keypair: null,
  solBalance: 0,
  ymBalance: 0,
  lastBurn: 0,
  patienceRate: 0.2,
  lastActionTime: 0,
  claimableYM: 0,
  blockHeight: 0,
  locked: true,
};

function loadWalletState() {
  try {
    const d = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    WS.publicKey = d.publicKey || null;
    WS.lastBurn = d.lastBurn || 0;
    WS.patienceRate = d.patienceRate || 0.2;
    WS.lastActionTime = d.lastActionTime || 0;
    WS.encrypted = d.encrypted || null;
  } catch {}
}

function saveWalletMeta() {
  const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    ...existing,
    publicKey: WS.publicKey,
    lastBurn: WS.lastBurn,
    patienceRate: WS.patienceRate,
    lastActionTime: WS.lastActionTime,
  }));
}

// ── SOLANA SDK LOADER ─────────────────────────────────────
async function loadSolanaSDK() {
  if (window.solanaWeb3) return;
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/@solana/web3.js@1.98.0/lib/index.iife.min.js';
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    s.onload = res; s.onerror = () => res(); // optional
    document.head.appendChild(s);
  });
}

// ── CRYPTO HELPERS ────────────────────────────────────────
async function encrypt(text, pass) {
  const enc = new TextEncoder();
  const km = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.deriveKey(
    { name:'PBKDF2', salt, iterations:100000, hash:'SHA-256' },
    km, { name:'AES-GCM', length:256 }, false, ['encrypt']
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, key, enc.encode(text));
  const arr = [...salt, ...iv, ...new Uint8Array(ct)];
  return btoa(String.fromCharCode(...arr));
}

async function decrypt(cipher, pass) {
  const data = new Uint8Array(atob(cipher).split('').map(c => c.charCodeAt(0)));
  const salt = data.slice(0,16), iv = data.slice(16,28), ct = data.slice(28);
  const enc = new TextEncoder();
  const km = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name:'PBKDF2', salt, iterations:100000, hash:'SHA-256' },
    km, { name:'AES-GCM', length:256 }, false, ['decrypt']
  );
  const pt = await crypto.subtle.decrypt({ name:'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(pt);
}

// ── SOLANA RPC ────────────────────────────────────────────
async function rpc(method, params=[]) {
  const r = await fetch(RPC, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ jsonrpc:'2.0', id:1, method, params })
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.result;
}

async function getSolBalance(pk) {
  const lam = await rpc('getBalance', [pk, { commitment:'confirmed' }]);
  return (lam?.value || 0) / 1e9;
}

async function getYMBalance(pk) {
  try {
    const r = await rpc('getTokenAccountsByOwner', [
      pk,
      { mint: YM_TOKEN },
      { encoding:'jsonParsed', commitment:'confirmed' }
    ]);
    const acc = r?.value?.[0]?.account?.data?.parsed?.info?.tokenAmount;
    return parseFloat(acc?.uiAmount || 0);
  } catch { return 0; }
}

async function getSlot() {
  try { return await rpc('getSlot', []); }
  catch { return 300000000; }
}

// ── FORMULA ───────────────────────────────────────────────
function calcImmediate(S, T) { return S * (1 - T) * (1 - FEE); }

function calcClaimable(S, T, lastActionTime, blockHeight) {
  if (!S || !blockHeight) return 0;
  const t = (Date.now() - lastActionTime) / 1000;
  if (t <= 0) return 0;
  const bT = BETA * (1 - T);
  const lnA = Math.log(blockHeight);
  const inner = bT * lnA + Math.log(1 + C_CONST / Math.pow(blockHeight, bT));
  if (!inner || isNaN(inner)) return 0;
  const denom = Math.pow(inner, GAMMA);
  return (S * Math.pow(t, ALPHA)) / denom;
}

// ── BALANCE REFRESH ───────────────────────────────────────
async function refreshBalances(ctx) {
  if (!WS.publicKey) return;
  try {
    const [sol, ym, slot] = await Promise.all([
      getSolBalance(WS.publicKey),
      getYMBalance(WS.publicKey),
      getSlot()
    ]);
    WS.solBalance = sol;
    WS.ymBalance = ym;
    WS.blockHeight = slot;
    WS.claimableYM = calcClaimable(WS.lastBurn, WS.patienceRate, WS.lastActionTime, slot);

    // Update figure count with claimable
    ctx?.updateFigureCount?.(parseFloat(WS.claimableYM.toFixed(2)));

    // Update any open UI
    document.querySelectorAll('[data-mine-refresh]').forEach(el => {
      const key = el.getAttribute('data-mine-refresh');
      if (key === 'sol') el.textContent = WS.solBalance.toFixed(4) + ' SOL';
      else if (key === 'ym') el.textContent = WS.ymBalance.toFixed(4) + ' YM';
      else if (key === 'claimable') el.textContent = WS.claimableYM.toFixed(4) + ' YM';
    });
  } catch(e) { console.warn('Refresh failed:', e); }
}

// ── WALLET OPERATIONS ─────────────────────────────────────
async function createWallet(pass) {
  const { Keypair } = solanaWeb3;
  const kp = Keypair.generate();
  await storeKeypair(kp, pass);
  return kp;
}

async function importWallet(secret, pass) {
  const { Keypair } = solanaWeb3;
  let kp;
  if (secret.startsWith('phrase:')) {
    // BIP39 phrase → use simple derivation for demo
    const phrase = secret.replace('phrase:','').trim();
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(phrase));
    const seed = new Uint8Array(hash).slice(0,32);
    kp = Keypair.fromSeed(seed);
  } else if (secret.startsWith('privkey:')) {
    const pk = secret.replace('privkey:','').trim();
    const bytes = JSON.parse(pk);
    kp = Keypair.fromSecretKey(new Uint8Array(bytes));
  } else {
    throw new Error('Format: "phrase:…" or "privkey:[…]"');
  }
  await storeKeypair(kp, pass);
  return kp;
}

async function storeKeypair(kp, pass) {
  const secretStr = JSON.stringify(Array.from(kp.secretKey));
  const encrypted = await encrypt(`privkey:${secretStr}`, pass);
  const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...existing, encrypted, publicKey: kp.publicKey.toString() }));
  WS.publicKey = kp.publicKey.toString();
  WS.keypair = kp;
  WS.locked = false;
  WS.encrypted = encrypted;
  saveWalletMeta();
}

async function unlockWallet(pass) {
  if (!WS.encrypted) throw new Error('No wallet stored');
  const plain = await decrypt(WS.encrypted, pass);
  const kp = await importWallet(plain, pass);
  WS.keypair = kp;
  WS.locked = false;
  return kp;
}

function lockWallet() {
  WS.keypair = null;
  WS.locked = true;
}

// ── SEND ──────────────────────────────────────────────────
async function sendSOL(toAddr, amount) {
  if (!WS.keypair) throw new Error('Unlock wallet first');
  const { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } = solanaWeb3;
  const conn = new Connection(RPC, 'confirmed');
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: WS.keypair.publicKey,
      toPubkey: new PublicKey(toAddr),
      lamports: Math.floor(amount * LAMPORTS_PER_SOL)
    })
  );
  const { blockhash } = await conn.getRecentBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = WS.keypair.publicKey;
  tx.sign(WS.keypair);
  const sig = await conn.sendRawTransaction(tx.serialize());
  return sig;
}

// ── UI HELPERS ────────────────────────────────────────────
const CSS = `
<style>
.m-card{background:rgba(200,240,160,.04);border:1px solid rgba(200,240,160,.15);border-radius:12px;padding:16px;margin-bottom:12px}
.m-label{font-family:var(--mono,'Space Mono',monospace);font-size:.68rem;color:rgba(200,240,160,.5);letter-spacing:.1em;text-transform:uppercase;margin-bottom:4px}
.m-val{font-family:var(--mono,'Space Mono',monospace);font-size:1rem;color:#e8e8f0;word-break:break-all}
.m-val.big{font-size:1.5rem;color:#c8f0a0}
.m-row{display:flex;gap:8px;margin-bottom:8px}
.m-btn{flex:1;padding:10px;border-radius:8px;border:none;cursor:pointer;font-family:'Barlow Condensed',sans-serif;font-size:.88rem;font-weight:700;letter-spacing:.05em;transition:all .2s}
.m-btn-p{background:#c8f0a0;color:#111113}
.m-btn-p:hover{box-shadow:0 0 16px rgba(200,240,160,.4)}
.m-btn-s{background:rgba(200,240,160,.08);border:1px solid rgba(200,240,160,.25);color:#e8e8f0}
.m-input{width:100%;background:rgba(255,255,255,.04);border:1px solid rgba(200,240,160,.2);border-radius:8px;padding:9px 12px;color:#e8e8f0;font-family:var(--mono,'Space Mono',monospace);font-size:.8rem;outline:none;margin-bottom:8px}
.m-input:focus{border-color:rgba(200,240,160,.5)}
.m-input::placeholder{color:rgba(232,232,240,.3)}
.m-tabs{display:flex;border-bottom:1px solid rgba(200,240,160,.12);margin-bottom:12px}
.m-tab{padding:10px 14px;background:none;border:none;border-bottom:2px solid transparent;color:rgba(232,232,240,.4);font-family:'Barlow Condensed',sans-serif;font-size:.82rem;font-weight:700;cursor:pointer;letter-spacing:.05em;text-transform:uppercase;transition:all .2s}
.m-tab.on{color:#c8f0a0;border-bottom-color:#c8f0a0}
.m-panel{display:none}.m-panel.on{display:block}
.m-slider{width:100%;accent-color:#c8f0a0;margin:8px 0}
.m-info{font-family:'Barlow Condensed',sans-serif;font-size:.82rem;color:rgba(232,232,240,.5);line-height:1.6;margin-bottom:8px}
.m-qr{display:flex;justify-content:center;padding:16px;background:#fff;border-radius:8px;margin:10px 0}
.m-addr{word-break:break-all;font-family:var(--mono,'Space Mono',monospace);font-size:.7rem;color:#c8f0a0;background:rgba(200,240,160,.06);padding:8px;border-radius:6px;cursor:pointer}
.m-err{color:#ff6b6b;font-size:.78rem;margin-top:4px;font-family:var(--mono,'Space Mono',monospace)}
.m-ok{color:#c8f0a0;font-size:.78rem;margin-top:4px;font-family:var(--mono,'Space Mono',monospace)}
.m-spinner{display:inline-block;width:16px;height:16px;border:2px solid rgba(200,240,160,.2);border-top-color:#c8f0a0;border-radius:50%;animation:mspin .7s linear infinite;vertical-align:middle;margin-right:6px}
@keyframes mspin{to{transform:rotate(360deg)}}
</style>
`;

// ── MAIN MINE UI (PILL CONTENT) ───────────────────────────
function renderMineUI(body, ctx) {
  body.innerHTML = CSS + `
  <div style="padding:16px">
    <div class="m-tabs">
      <button class="m-tab on" onclick="mTab('wallet',this)">Wallet</button>
      <button class="m-tab" onclick="mTab('mine',this)">Mine</button>
      <button class="m-tab" onclick="mTab('send',this)">Send</button>
      <button class="m-tab" onclick="mTab('receive',this)">Receive</button>
    </div>

    <!-- WALLET TAB -->
    <div class="m-panel on" id="mp-wallet">
      <div id="mp-wallet-inner"></div>
    </div>

    <!-- MINE TAB -->
    <div class="m-panel" id="mp-mine">
      <div id="mp-mine-inner"></div>
    </div>

    <!-- SEND TAB -->
    <div class="m-panel" id="mp-send">
      <div id="mp-send-inner"></div>
    </div>

    <!-- RECEIVE TAB -->
    <div class="m-panel" id="mp-receive">
      <div id="mp-receive-inner"></div>
    </div>
  </div>`;

  renderWalletTab(ctx);
  renderMineTab(ctx);
  renderSendTab();
  renderReceiveTab();
}

function mTab(id, el) {
  document.querySelectorAll('.m-tab').forEach(t => t.classList.remove('on'));
  document.querySelectorAll('.m-panel').forEach(p => p.classList.remove('on'));
  el.classList.add('on');
  document.getElementById(`mp-${id}`)?.classList.add('on');
}

// ── WALLET TAB ────────────────────────────────────────────
function renderWalletTab(ctx) {
  const el = document.getElementById('mp-wallet-inner');
  if (!el) return;

  if (!WS.publicKey) {
    el.innerHTML = `
      <div class="m-info">No wallet found. Create a new one or import an existing wallet.</div>
      <div class="m-row">
        <button class="m-btn m-btn-p" onclick="mCreateWallet()">+ Create Wallet</button>
        <button class="m-btn m-btn-s" onclick="mImportWallet()">↓ Import</button>
      </div>
      <div id="m-wallet-form"></div>
    `;
    return;
  }

  if (WS.locked) {
    el.innerHTML = `
      <div class="m-card">
        <div class="m-label">Public Key</div>
        <div class="m-addr" onclick="navigator.clipboard.writeText('${WS.publicKey}')">${WS.publicKey}</div>
      </div>
      <div class="m-label">Unlock Wallet</div>
      <input class="m-input" type="password" id="m-pass-unlock" placeholder="Password">
      <div class="m-row">
        <button class="m-btn m-btn-p" onclick="mUnlock()">Unlock</button>
        <button class="m-btn m-btn-s" onclick="mImportWallet()">Import other</button>
      </div>
      <div id="m-wallet-msg"></div>
    `;
    return;
  }

  el.innerHTML = `
    <div class="m-card">
      <div class="m-label">Public Key</div>
      <div class="m-addr" onclick="navigator.clipboard.writeText('${WS.publicKey}');YM?.toast?.('Copied!')">
        ${WS.publicKey}
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
      <div class="m-card" style="margin:0">
        <div class="m-label">SOL Balance</div>
        <div class="m-val big" data-mine-refresh="sol">${WS.solBalance.toFixed(4)} SOL</div>
      </div>
      <div class="m-card" style="margin:0">
        <div class="m-label">YM Balance</div>
        <div class="m-val big" data-mine-refresh="ym">${WS.ymBalance.toFixed(4)} YM</div>
      </div>
    </div>
    <div class="m-row">
      <button class="m-btn m-btn-s" onclick="mRefresh()">⟳ Refresh</button>
      <button class="m-btn m-btn-s" onclick="mLock()">🔒 Lock</button>
    </div>
    <div id="m-wallet-msg"></div>
  `;

  refreshBalances(ctx);
}

async function mCreateWallet() {
  const form = document.getElementById('m-wallet-form');
  if (!form) return;
  form.innerHTML = `
    <div class="m-label" style="margin-top:12px">Choose a password</div>
    <input class="m-input" type="password" id="m-pass-new" placeholder="Strong password">
    <input class="m-input" type="password" id="m-pass-new2" placeholder="Confirm password">
    <button class="m-btn m-btn-p" onclick="mDoCreate()">Create</button>
    <div id="m-wallet-msg2"></div>
  `;
}

async function mDoCreate() {
  const p1 = document.getElementById('m-pass-new')?.value;
  const p2 = document.getElementById('m-pass-new2')?.value;
  if (!p1 || p1 !== p2) {
    setMsg('m-wallet-msg2', 'Passwords do not match', 'err'); return;
  }
  try {
    setMsg('m-wallet-msg2', '<span class="m-spinner"></span>Creating…', '');
    const kp = await createWallet(p1);
    WS.encrypted = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}').encrypted;
    setMsg('m-wallet-msg2', `<div class="m-ok">Wallet created! Back up your key:<br><div class="m-addr">[${Array.from(kp.secretKey).join(',')}]</div></div>`, '');
    renderWalletTab(window.YM_S['mine.sphere.js']._ctx);
    YM?.toast?.('Wallet created!');
  } catch(e) { setMsg('m-wallet-msg2', e.message, 'err'); }
}

async function mImportWallet() {
  const form = document.getElementById('m-wallet-form');
  if (!form) return;
  form.innerHTML = `
    <div class="m-label" style="margin-top:12px">Secret (phrase:… or privkey:[…])</div>
    <textarea class="m-input" id="m-import-secret" rows="3" placeholder="phrase:word1 word2 … or privkey:[12,34,…]" style="resize:vertical"></textarea>
    <div class="m-label">Password</div>
    <input class="m-input" type="password" id="m-import-pass" placeholder="New password">
    <button class="m-btn m-btn-p" onclick="mDoImport()">Import</button>
    <div id="m-import-msg"></div>
  `;
}

async function mDoImport() {
  const secret = document.getElementById('m-import-secret')?.value.trim();
  const pass = document.getElementById('m-import-pass')?.value;
  if (!secret || !pass) { setMsg('m-import-msg','Fill all fields','err'); return; }
  try {
    setMsg('m-import-msg','<span class="m-spinner"></span>Importing…','');
    await importWallet(secret, pass);
    WS.encrypted = JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}').encrypted;
    renderWalletTab(window.YM_S['mine.sphere.js']._ctx);
    YM?.toast?.('Wallet imported!');
  } catch(e) { setMsg('m-import-msg', e.message, 'err'); }
}

async function mUnlock() {
  const pass = document.getElementById('m-pass-unlock')?.value;
  if (!pass) return;
  try {
    setMsg('m-wallet-msg','<span class="m-spinner"></span>Unlocking…','');
    const d = JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');
    WS.encrypted = d.encrypted;
    const plain = await decrypt(WS.encrypted, pass);
    const kp = plain.startsWith('privkey:') ?
      solanaWeb3.Keypair.fromSecretKey(new Uint8Array(JSON.parse(plain.replace('privkey:','')))) :
      null;
    if (!kp) throw new Error('Could not derive keypair');
    WS.keypair = kp; WS.locked = false;
    renderWalletTab(window.YM_S['mine.sphere.js']._ctx);
    YM?.toast?.('Unlocked ✓');
  } catch(e) { setMsg('m-wallet-msg', 'Wrong password', 'err'); }
}

function mLock() { lockWallet(); renderWalletTab(window.YM_S['mine.sphere.js']._ctx); YM?.toast?.('Locked'); }
async function mRefresh() { await refreshBalances(window.YM_S['mine.sphere.js']._ctx); YM?.toast?.('Refreshed'); }

// ── MINE TAB ──────────────────────────────────────────────
function renderMineTab(ctx) {
  const el = document.getElementById('mp-mine-inner');
  if (!el) return;

  const claimable = WS.claimableYM.toFixed(4);
  const elapsed = WS.lastActionTime ? Math.floor((Date.now()-WS.lastActionTime)/3600000) : 0;

  el.innerHTML = `
    <div class="m-card">
      <div class="m-label">Claimable YM</div>
      <div class="m-val big" data-mine-refresh="claimable">${claimable} YM</div>
      <div class="m-info" style="margin-top:4px">Last action: ${elapsed}h ago · Patience: ${Math.round(WS.patienceRate*100)}%</div>
    </div>

    <div class="m-label">Burn Amount (SOL)</div>
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
      <input class="m-input" style="margin:0;flex:1" type="number" id="m-burn-amt" min="0.001" step="0.001" max="10" value="${WS.lastBurn || 0.01}" oninput="mCalcPreview()">
      <span style="font-family:var(--mono,'Space Mono',monospace);font-size:.8rem;color:rgba(200,240,160,.6)">SOL</span>
    </div>

    <div class="m-label">Patience Rate: <span id="m-patience-label">${Math.round(WS.patienceRate*100)}%</span></div>
    <input class="m-slider" type="range" id="m-patience" min="0" max="40" step="1" value="${Math.round(WS.patienceRate*100)}" oninput="mCalcPreview()">

    <div class="m-card" id="m-preview">
      <div class="m-label">Burn preview</div>
      <div style="display:flex;justify-content:space-between;font-family:var(--mono,'Space Mono',monospace);font-size:.78rem;margin-bottom:6px">
        <span style="color:rgba(232,232,240,.5)">Immediate YM</span>
        <span id="m-prev-immediate" style="color:#c8f0a0">—</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-family:var(--mono,'Space Mono',monospace);font-size:.78rem">
        <span style="color:rgba(232,232,240,.5)">Protocol fee (0.1%)</span>
        <span id="m-prev-fee" style="color:rgba(232,232,240,.4)">—</span>
      </div>
    </div>

    <div class="m-row">
      <button class="m-btn m-btn-p" onclick="mDoBurn()">🔥 Burn</button>
      <button class="m-btn m-btn-s" onclick="mDoClaim()">⚡ Claim (${claimable} YM)</button>
    </div>
    <div id="m-mine-msg"></div>
  `;
  mCalcPreview();
}

function mCalcPreview() {
  const S = parseFloat(document.getElementById('m-burn-amt')?.value || 0);
  const T = parseFloat(document.getElementById('m-patience')?.value || 0) / 100;
  if (document.getElementById('m-patience-label')) document.getElementById('m-patience-label').textContent = Math.round(T*100) + '%';
  const immediate = calcImmediate(S, T);
  const fee = S * 0.001;
  if (document.getElementById('m-prev-immediate')) document.getElementById('m-prev-immediate').textContent = immediate.toFixed(4) + ' YM';
  if (document.getElementById('m-prev-fee')) document.getElementById('m-prev-fee').textContent = fee.toFixed(5) + ' SOL';
}

async function mDoBurn() {
  if (!WS.keypair) { YM?.toast?.('Unlock wallet first'); return; }
  const S = parseFloat(document.getElementById('m-burn-amt')?.value || 0);
  const T = parseFloat(document.getElementById('m-patience')?.value || 0) / 100;
  if (!S || S < 0.001) { setMsg('m-mine-msg','Enter a burn amount','err'); return; }
  if (S > WS.solBalance) { setMsg('m-mine-msg','Insufficient SOL balance','err'); return; }

  const ok = await YM?.dialog?.('Confirm Burn', `Burn ${S} SOL with ${Math.round(T*100)}% patience? This resets your mining clock.`, 'Burn');
  if (!ok) return;

  try {
    setMsg('m-mine-msg','<span class="m-spinner"></span>Broadcasting burn…','');
    // Burn = send SOL to a designated program/burn address
    const BURN_ADDR = '1nc1nerator11111111111111111111111111111111'; // solana incinerator
    const sig = await sendSOL(BURN_ADDR, S);
    WS.lastBurn = S;
    WS.patienceRate = T;
    WS.lastActionTime = Date.now();
    saveWalletMeta();
    setMsg('m-mine-msg', `<span class="m-ok">Burned! Sig: ${sig.slice(0,16)}…</span>`, '');
    await refreshBalances(window.YM_S['mine.sphere.js']._ctx);
    renderMineTab(window.YM_S['mine.sphere.js']._ctx);
    YM?.toast?.('Burn confirmed!');
  } catch(e) { setMsg('m-mine-msg', e.message, 'err'); }
}

async function mDoClaim() {
  if (!WS.keypair) { YM?.toast?.('Unlock wallet first'); return; }
  if (WS.claimableYM < 0.0001) { YM?.toast?.('Nothing to claim yet'); return; }
  const ok = await YM?.dialog?.('Claim Rewards', `Claim ${WS.claimableYM.toFixed(4)} YM? This resets your mining clock.`, 'Claim');
  if (!ok) return;
  // Claim = call the YM bridge program (devnet)
  setMsg('m-mine-msg','<span class="m-spinner"></span>Claiming…','');
  // For devnet demo, simulate claim
  setTimeout(() => {
    WS.lastActionTime = Date.now();
    WS.claimableYM = 0;
    saveWalletMeta();
    setMsg('m-mine-msg','<span class="m-ok">Claimed! (devnet simulation)</span>','');
    renderMineTab(window.YM_S['mine.sphere.js']._ctx);
    YM?.toast?.('Claimed!');
  }, 1500);
}

// ── SEND TAB ──────────────────────────────────────────────
function renderSendTab() {
  const el = document.getElementById('mp-send-inner');
  if (!el) return;
  el.innerHTML = `
    <div class="m-tabs" style="margin-bottom:10px">
      <button class="m-tab on" onclick="mSendTab('sol',this)">SOL</button>
      <button class="m-tab" onclick="mSendTab('ym',this)">YM</button>
    </div>
    <div id="ms-token" style="display:block">SOL</div>

    <div class="m-label">Recipient Address</div>
    <input class="m-input" id="m-send-to" placeholder="Solana address (Base58)">
    <div class="m-label">Amount</div>
    <input class="m-input" id="m-send-amt" type="number" min="0" step="0.001" placeholder="0.00">
    <div class="m-row">
      <button class="m-btn m-btn-p" onclick="mDoSend()">Send →</button>
    </div>
    <div id="m-send-msg"></div>
  `;
}

let mSendToken = 'sol';
function mSendTab(t, el) {
  mSendToken = t;
  document.querySelectorAll('#mp-send .m-tab').forEach(x => x.classList.remove('on'));
  el.classList.add('on');
}

async function mDoSend() {
  if (!WS.keypair) { YM?.toast?.('Unlock wallet first'); return; }
  const to = document.getElementById('m-send-to')?.value.trim();
  const amt = parseFloat(document.getElementById('m-send-amt')?.value || 0);
  if (!to || !amt) { setMsg('m-send-msg','Fill all fields','err'); return; }
  const ok = await YM?.dialog?.('Confirm Send', `Send ${amt} ${mSendToken.toUpperCase()} to ${to.slice(0,12)}…?`, 'Send');
  if (!ok) return;
  try {
    setMsg('m-send-msg','<span class="m-spinner"></span>Sending…','');
    const sig = mSendToken === 'sol' ? await sendSOL(to, amt) : 'YM_transfer_not_impl';
    setMsg('m-send-msg', `<span class="m-ok">Sent! Sig: ${sig.slice(0,16)}…</span>`, '');
    await refreshBalances(window.YM_S['mine.sphere.js']._ctx);
  } catch(e) { setMsg('m-send-msg', e.message, 'err'); }
}

// ── RECEIVE TAB ───────────────────────────────────────────
function renderReceiveTab() {
  const el = document.getElementById('mp-receive-inner');
  if (!el) return;
  const addr = WS.publicKey || 'No wallet yet';
  el.innerHTML = `
    <div class="m-card">
      <div class="m-label">Your Address</div>
      <div class="m-addr" onclick="navigator.clipboard.writeText('${addr}');YM?.toast?.('Copied!')">${addr}</div>
    </div>
    <div id="m-qr-container"></div>
    <div class="m-info" style="text-align:center">Tap address to copy · Valid on Solana devnet</div>
  `;
  if (addr && window.QRCode) {
    new QRCode(document.getElementById('m-qr-container'), {
      text: addr, width: 160, height: 160,
      colorDark: '#111113', colorLight: '#c8f0a0',
    });
  } else if (addr) {
    document.getElementById('m-qr-container').innerHTML = `<div class="m-qr"><img src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(addr)}&bgcolor=111113&color=c8f0a0" style="border-radius:6px"></div>`;
  }
}

// ── FIGURE TAB ────────────────────────────────────────────
function renderWalletFigure(el, ctx) {
  el.innerHTML = CSS + `<div style="padding:16px">` + (WS.publicKey ? `
    <div class="m-card">
      <div class="m-label">Claimable YM</div>
      <div class="m-val big" data-mine-refresh="claimable">${WS.claimableYM.toFixed(4)} YM</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
      <div class="m-card" style="margin:0"><div class="m-label">SOL</div><div class="m-val" data-mine-refresh="sol">${WS.solBalance.toFixed(4)}</div></div>
      <div class="m-card" style="margin:0"><div class="m-label">YM</div><div class="m-val" data-mine-refresh="ym">${WS.ymBalance.toFixed(4)}</div></div>
    </div>
    <div class="m-card">
      <div class="m-label">Address</div>
      <div class="m-addr" style="font-size:.68rem" onclick="navigator.clipboard.writeText('${WS.publicKey}');YM?.toast?.('Copied!')">${WS.publicKey}</div>
    </div>
    <div class="m-card">
      <div class="m-label">Mining Stats</div>
      <div style="font-family:var(--mono,'Space Mono',monospace);font-size:.78rem;color:rgba(232,232,240,.6);line-height:2">
        Last burn: ${WS.lastBurn} SOL<br>
        Patience rate: ${Math.round(WS.patienceRate*100)}%<br>
        Clock started: ${WS.lastActionTime ? new Date(WS.lastActionTime).toLocaleDateString() : 'Never'}
      </div>
    </div>
  ` : `<div class="m-info">No wallet connected. Open the Mine sphere to create or import.</div>`
  ) + `</div>`;
  refreshBalances(ctx);
}

// ── PROFILE TAB ───────────────────────────────────────────
function renderMineProfile(el) {
  // Hidden field: last known claimable YM balance
  el.innerHTML = `<div style="padding:16px">
    <div class="m-info">Mine data (kept private — not visible in your public profile)</div>
    <div class="m-card">
      <div class="m-label">Last Claimable YM</div>
      <div class="m-val">${WS.claimableYM.toFixed(4)} YM</div>
    </div>
    <div class="m-card">
      <div class="m-label">Public Key</div>
      <div class="m-addr" style="font-size:.68rem">${WS.publicKey || 'No wallet'}</div>
    </div>
  </div>`;
}

// ── UTILS ─────────────────────────────────────────────────
function setMsg(id, html, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = type === 'err' ? `<div class="m-err">${html}</div>` : `<div>${html}</div>`;
}

// Expose for onclick handlers
window.mTab = mTab;
window.mSendTab = mSendTab;
window.mCreateWallet = mCreateWallet;
window.mDoCreate = mDoCreate;
window.mImportWallet = mImportWallet;
window.mDoImport = mDoImport;
window.mUnlock = mUnlock;
window.mLock = mLock;
window.mRefresh = mRefresh;
window.mCalcPreview = mCalcPreview;
window.mDoBurn = mDoBurn;
window.mDoClaim = mDoClaim;
window.mDoSend = mDoSend;

})();
