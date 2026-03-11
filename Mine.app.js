// ════════════════════════════════════════════════════════
//  mine.app.js — YourMine Wallet + Mining Interface
// ════════════════════════════════════════════════════════

(function(YM, $, el, fetchText, fetchJSON, REPO_RAW, REPO_API) {

const DEVNET   = 'https://api.devnet.solana.com';
const YM_MINT  = 'k5KdweiLaLDR57YqVQ9WCWNdLDQm4wMTzz5zPRRPLMn';
const STORE_KEY = 'ym_wallet_v1';

// Formula constants
const ALPHA = 0.7, BETA = 0.4, GAMMA = 1.2, C_STAB = 1e6;

let walletState = { locked: true, keypair: null, pubkey: null };
let mineState   = { sol: 0, ym: 0, claimable: 0, lastBurn: 0, lastRate: 0, lastBurnTs: 0, slot: 0 };
let cycleTimer  = null;

// ── FORMULA ───────────────────────────────────────────────
function calcClaimable(S, T, t, A) {
  if (!S || !t || !A) return 0;
  const num = S * Math.pow(t, ALPHA);
  const logA = Math.log(A);
  const denom = Math.pow(BETA * (1 - T) * logA + Math.log(1 + C_STAB / Math.pow(A, BETA * (1 - T))), GAMMA);
  return denom > 0 ? num / denom : 0;
}

// ── CRYPTO UTILS ──────────────────────────────────────────
async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const keyMat = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' }, keyMat, { name: 'AES-GCM', length: 256 }, false, ['encrypt','decrypt']);
}

async function encryptSecret(secret, password) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, 'ym-salt-v1');
  const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(secret));
  return { iv: Array.from(iv), data: Array.from(new Uint8Array(enc)) };
}

async function decryptSecret(stored, password) {
  const key = await deriveKey(password, 'ym-salt-v1');
  const iv = new Uint8Array(stored.iv);
  const data = new Uint8Array(stored.data);
  const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(dec);
}

// ── WALLET OPERATIONS ─────────────────────────────────────
async function createWallet(passphrase, password) {
  const sol = window.solanaWeb3;
  const kp  = sol.Keypair.generate();
  const secret = passphrase ? `phrase:${passphrase}` : `privkey:${Array.from(kp.secretKey)}`;
  const enc = await encryptSecret(secret, password);
  const stored = { pubkey: kp.publicKey.toString(), enc, created: Date.now() };
  localStorage.setItem(STORE_KEY, JSON.stringify(stored));
  return kp;
}

async function unlockWallet(password) {
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) throw new Error('Aucun wallet enregistré');
  const stored = JSON.parse(raw);
  const secret = await decryptSecret(stored.enc, password);
  const sol = window.solanaWeb3;
  let kp;
  if (secret.startsWith('phrase:')) {
    // BIP39-ish: derive from passphrase bytes
    const phrase = secret.slice(7);
    const seed = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(phrase));
    kp = sol.Keypair.fromSeed(new Uint8Array(seed).slice(0, 32));
  } else {
    const bytes = JSON.parse('[' + secret.slice(8) + ']');
    kp = sol.Keypair.fromSecretKey(new Uint8Array(bytes));
  }
  walletState.keypair = kp;
  walletState.pubkey  = kp.publicKey.toString();
  walletState.locked  = false;
  // Expose
  window._EW = { getYMBalance: () => mineState.ym };
  window.yourMineApp?.walletManager?.handleWalletConnected?.(kp.publicKey).catch(() => {});
  await refreshBalances();
  return kp;
}

function lockWallet() {
  walletState = { locked: true, keypair: null, pubkey: null };
  window.yourMineApp?.walletManager?.handleWalletDisconnected?.().catch(() => {});
  renderWalletSection();
}

async function refreshBalances() {
  if (!walletState.pubkey) return;
  const sol = window.solanaWeb3;
  const conn = new sol.Connection(DEVNET, 'confirmed');
  try {
    const lamports = await conn.getBalance(new sol.PublicKey(walletState.pubkey));
    mineState.sol = lamports / 1e9;
  } catch {}
  try {
    const pk = new sol.PublicKey(walletState.pubkey);
    const mint = new sol.PublicKey(YM_MINT);
    const accounts = await conn.getParsedTokenAccountsByOwner(pk, { mint });
    mineState.ym = accounts.value[0]?.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0;
  } catch {}
  try {
    const conn2 = new sol.Connection(DEVNET);
    mineState.slot = await conn2.getSlot();
  } catch {}
  updateBalanceUI();
  window.YM_updateBalance?.(mineState.ym);
}

// ── BURN & CLAIM ──────────────────────────────────────────
async function performBurn(amt, rate) {
  if (!walletState.keypair) throw new Error('Wallet verrouillé');
  mineState.lastBurn   = amt;
  mineState.lastRate   = rate;
  mineState.lastBurnTs = Date.now();
  localStorage.setItem('ym_mine_state', JSON.stringify(mineState));
  // Inject into bridge if present
  const burnAmt = $('burnAmount');
  const taxSlider = $('taxSlider');
  const confirmBtn = $('confirmBurnBtn');
  if (burnAmt && taxSlider && confirmBtn) {
    burnAmt.value = amt;
    taxSlider.value = rate;
    taxSlider.dispatchEvent(new Event('input', { bubbles: true }));
    confirmBtn.onclick?.();
  }
}

async function performClaim() {
  const claimBtn = $('claimBtn');
  if (claimBtn) { claimBtn.onclick?.(); return; }
  throw new Error('Bridge de claim introuvable');
}

async function sendToken(to, amount, isSol = false) {
  if (!walletState.keypair) throw new Error('Wallet verrouillé');
  const sol = window.solanaWeb3;
  const conn = new sol.Connection(DEVNET, 'confirmed');
  const from = walletState.keypair;
  const toPk  = new sol.PublicKey(to);

  if (isSol) {
    const tx = new sol.Transaction().add(
      sol.SystemProgram.transfer({ fromPubkey: from.publicKey, toPubkey: toPk, lamports: Math.floor(amount * 1e9) })
    );
    const { blockhash } = await conn.getRecentBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = from.publicKey;
    tx.sign(from);
    const sig = await conn.sendRawTransaction(tx.serialize());
    return sig;
  }
  throw new Error('Transfert YM: implémentation token program requise');
}

// ── CLAIMABLE CALC ────────────────────────────────────────
function getClaimable() {
  const s = mineState;
  if (!s.lastBurn || !s.lastBurnTs) return 0;
  const t = (Date.now() - s.lastBurnTs) / 1000;
  return calcClaimable(s.lastBurn, s.lastRate, t, s.slot || 300000000);
}

// ── UI ─────────────────────────────────────────────────────
function render() {
  const body = $('ym-app-body');
  if (!body) return;

  const stored = localStorage.getItem(STORE_KEY);
  const hasWallet = !!stored;

  body.innerHTML = `
  <!-- Wallet section -->
  <div class="ym-panel" id="mine-wallet-section">
    ${walletState.locked ? renderLocked(hasWallet) : renderUnlocked()}
  </div>

  <!-- Stats section -->
  ${!walletState.locked ? renderStats() : ''}

  <!-- Burn & Claim -->
  ${!walletState.locked ? renderBurnClaim() : ''}

  <!-- Transfer -->
  ${!walletState.locked ? renderTransfer() : ''}

  <!-- Formula / About -->
  <div class="ym-panel" style="margin-top:8px">
    <div class="ym-panel-title">Formule YM</div>
    <div class="ym-formula">
      <div class="num">S · t<sup>α</sup></div>
      <div class="sep">─────────────────────</div>
      <div class="denom">[β(1−T)·ln(A) + ln(1 + C/A<sup>β(1−T)</sup>)]<sup>γ</sup></div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
      ${[['α','0.7','croissance temporelle'],['β','0.4','patience / âge'],['γ','1.2','compression'],['C','1e6','stabilisation']].map(([k,v,d])=>`
        <div class="ym-card" style="flex:1;min-width:100px;cursor:default">
          <div style="font-family:var(--font-display);font-size:18px;font-weight:800;color:var(--accent)">${k}</div>
          <div style="font-size:10px;color:var(--text3)">${v} — ${d}</div>
        </div>`).join('')}
    </div>
  </div>

  <!-- Hidden bridge for external wallet app integration -->
  <div id="ym-wallet-bridge" style="display:none">
    <input id="burnAmount"/><input id="taxSlider" type="range" min="0" max="40"/>
    <button id="confirmBurnBtn"></button><button id="claimBtn"></button>
  </div>
  `;

  wireWalletEvents();
  if (!walletState.locked) {
    startCycle();
    updateClaimableLoop();
  }
}

function renderLocked(hasWallet) {
  return `
  <div class="ym-panel-title">Wallet Solana</div>
  <div class="ym-wallet-unlock" id="mine-unlock-form">
    ${!hasWallet ? `
      <div class="ym-notice info"><span>Créez un wallet ou importez une clé privée / passphrase existante.</span></div>
      <input class="ym-input" id="mine-passphrase" placeholder="Passphrase (optionnel)" type="password"/>
      <input class="ym-input" id="mine-privkey-import" placeholder="Clé privée Base58 ou JSON array (import)" type="password"/>
      <input class="ym-input" id="mine-password" placeholder="Mot de passe de chiffrement" type="password"/>
      <input class="ym-input" id="mine-password2" placeholder="Confirmer mot de passe" type="password"/>
      <div style="display:flex;gap:8px">
        <button class="ym-btn ym-btn-accent" id="mine-create-btn" style="flex:1">Créer</button>
        <button class="ym-btn" id="mine-import-btn" style="flex:1">Importer</button>
      </div>
    ` : `
      <div class="ym-wallet-address" id="mine-pubkey-preview">${JSON.parse(localStorage.getItem('ym_wallet_v1') || '{}').pubkey || '…'}</div>
      <input class="ym-input" id="mine-password" placeholder="Mot de passe" type="password"/>
      <button class="ym-btn ym-btn-accent" id="mine-unlock-btn" style="width:100%">Déverrouiller</button>
      <details style="margin-top:4px">
        <summary style="font-size:10px;color:var(--text3);cursor:pointer;letter-spacing:.5px">Importer un autre wallet</summary>
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:10px">
          <input class="ym-input" id="mine-privkey-import" placeholder="Clé privée Base58 ou JSON array" type="password"/>
          <input class="ym-input" id="mine-import-pw" placeholder="Nouveau mot de passe" type="password"/>
          <button class="ym-btn" id="mine-import-btn" style="width:100%">Importer et remplacer</button>
        </div>
      </details>
      <button class="ym-btn ym-btn-ghost" id="mine-reset-btn" style="width:100%;font-size:10px;margin-top:4px">Supprimer le wallet local</button>
    `}
    <div id="mine-wallet-error" class="ym-notice error" style="display:none"></div>
  </div>`;
}

function renderUnlocked() {
  const addr = walletState.pubkey || '';
  const short = addr ? addr.slice(0,8)+'…'+addr.slice(-6) : '';
  return `
  <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
    <div>
      <div class="ym-panel-title">Wallet Actif</div>
      <div class="ym-wallet-address">${addr}</div>
    </div>
    <div style="display:flex;gap:8px">
      <button class="ym-btn ym-btn-ghost" id="mine-copy-addr" data-tip="Copier adresse">⧉</button>
      <button class="ym-btn ym-btn-danger" id="mine-lock-btn">Verrouiller</button>
    </div>
  </div>`;
}

function renderStats() {
  const claimable = getClaimable();
  return `
  <div class="ym-panel" id="mine-stats-panel">
    <div class="ym-panel-title">Balances</div>
    <div class="ym-stat-row"><span class="ym-stat-label">SOL</span><span class="ym-stat-value blue" id="mine-sol-bal">${mineState.sol.toFixed(6)}</span></div>
    <div class="ym-stat-row"><span class="ym-stat-label">YM</span><span class="ym-stat-value accent" id="mine-ym-bal">${mineState.ym.toFixed(4)}</span></div>
    <div class="ym-stat-row"><span class="ym-stat-label">Claimable</span><span class="ym-stat-value gold" id="mine-claimable">${claimable.toFixed(6)}</span></div>
    <div class="ym-stat-row"><span class="ym-stat-label">Dernier burn</span><span class="ym-stat-value" id="mine-last-burn">${mineState.lastBurn || '—'}</span></div>
    <div class="ym-stat-row"><span class="ym-stat-label">Taux patience</span><span class="ym-stat-value" id="mine-last-rate">${mineState.lastRate ? (mineState.lastRate*100).toFixed(1)+'%' : '—'}</span></div>
    <div class="ym-stat-row"><span class="ym-stat-label">Slot</span><span class="ym-stat-value" id="mine-slot">${mineState.slot || '—'}</span></div>
  </div>`;
}

function renderBurnClaim() {
  return `
  <div class="ym-panel" id="mine-burn-panel">
    <div class="ym-panel-title">Burn & Claim</div>
    <div style="display:flex;flex-direction:column;gap:12px">
      <div>
        <label style="font-size:10px;color:var(--text3);display:block;margin-bottom:6px;letter-spacing:0.5px;text-transform:uppercase">Montant SOL à bruler</label>
        <input class="ym-input" id="mine-burn-amount" type="number" min="0" step="0.001" placeholder="0.001" value="${mineState.lastBurn || ''}"/>
      </div>
      <div>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px">
          <label style="font-size:10px;color:var(--text3);letter-spacing:0.5px;text-transform:uppercase">Taux de patience T</label>
          <span style="font-family:var(--font-display);font-size:13px;font-weight:700;color:var(--accent)" id="mine-rate-display">${Math.round((mineState.lastRate||0)*100)}%</span>
        </div>
        <input class="ym-slider" id="mine-rate-slider" type="range" min="0" max="40" step="1" value="${Math.round((mineState.lastRate||0)*100)}"/>
        <div style="display:flex;justify-content:space-between;margin-top:4px">
          <span style="font-size:9px;color:var(--text3)">0% — Immédiat</span>
          <span style="font-size:9px;color:var(--text3)">40% — Max bonus</span>
        </div>
      </div>
      <div class="ym-notice info" id="mine-burn-preview">
        <div>
          <div style="font-size:10px">Récompense immédiate: <strong id="mine-imm-reward">—</strong> YM</div>
          <div style="font-size:10px;margin-top:2px">Commission (0.1%): <strong id="mine-fee">—</strong> SOL</div>
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="ym-btn ym-btn-accent" id="mine-burn-btn" style="flex:1">Burn</button>
        <button class="ym-btn" id="mine-claim-btn" style="flex:1">Claim <span id="mine-claim-amount">(${getClaimable().toFixed(4)})</span></button>
      </div>
      <div id="mine-tx-status" style="display:none" class="ym-notice success"></div>
    </div>
  </div>`;
}

function renderTransfer() {
  return `
  <div class="ym-panel">
    <div class="ym-panel-title">Envoyer</div>
    <div style="display:flex;flex-direction:column;gap:10px">
      <div style="display:flex;gap:6px">
        <button class="ym-tab active" id="mine-send-ym-tab">YM</button>
        <button class="ym-tab" id="mine-send-sol-tab">SOL</button>
      </div>
      <input class="ym-input" id="mine-send-to" placeholder="Adresse destinataire"/>
      <input class="ym-input" id="mine-send-amt" type="number" step="0.001" placeholder="Montant"/>
      <button class="ym-btn ym-btn-accent" id="mine-send-btn">Envoyer</button>
    </div>
  </div>`;
}

function wireWalletEvents() {
  const body = $('ym-app-body');
  if (!body) return;

  // Create wallet
  body.querySelector('#mine-create-btn')?.addEventListener('click', async () => {
    const pp = body.querySelector('#mine-passphrase')?.value || '';
    const pw = body.querySelector('#mine-password')?.value || '';
    const pw2 = body.querySelector('#mine-password2')?.value || '';
    if (!pw) return showWalletError('Mot de passe requis');
    if (pw !== pw2) return showWalletError('Mots de passe différents');
    try {
      await createWallet(pp, pw);
      await unlockWallet(pw);
      render();
    } catch(e) { showWalletError(e.message); }
  });

  // Unlock
  body.querySelector('#mine-unlock-btn')?.addEventListener('click', async () => {
    const pw = body.querySelector('#mine-password')?.value || '';
    try {
      await unlockWallet(pw);
      render();
    } catch(e) { showWalletError('Mot de passe incorrect'); }
  });

  // Reset
  body.querySelector('#mine-reset-btn')?.addEventListener('click', () => {
    if (confirm('Supprimer le wallet local ? Assurez-vous d\'avoir sauvegardé votre clé.')) {
      localStorage.removeItem(STORE_KEY);
      render();
    }
  });

  // Import wallet
  body.querySelector('#mine-import-btn')?.addEventListener('click', async () => {
    const raw = (body.querySelector('#mine-privkey-import')?.value || '').trim();
    const pw  = (body.querySelector('#mine-import-pw') || body.querySelector('#mine-password2') || body.querySelector('#mine-password'))?.value || '';
    if (!raw)  return showWalletError('Clé privée requise');
    if (!pw)   return showWalletError('Mot de passe requis');
    try {
      const sol = window.solanaWeb3;
      let kp;
      if (raw.startsWith('[')) {
        kp = sol.Keypair.fromSecretKey(new Uint8Array(JSON.parse(raw)));
      } else {
        const bs = sol.bs58?.decode?.(raw);
        if (bs) { kp = sol.Keypair.fromSecretKey(bs); }
        else { throw new Error('Format non reconnu. Utilisez un JSON array [0,1,2,...] ou Base58.'); }
      }
      const secret = `privkey:${JSON.stringify(Array.from(kp.secretKey))}`;
      const enc    = await encryptSecret(secret, pw);
      localStorage.setItem(STORE_KEY, JSON.stringify({ pubkey: kp.publicKey.toString(), enc, created: Date.now() }));
      await unlockWallet(pw);
      render();
    } catch(e) { showWalletError(e.message); }
  });

  // Lock

  // Copy address
  body.querySelector('#mine-copy-addr')?.addEventListener('click', () => {
    navigator.clipboard.writeText(walletState.pubkey || '').catch(()=>{});
  });

  // Rate slider
  const slider = body.querySelector('#mine-rate-slider');
  if (slider) {
    slider.oninput = () => {
      const v = parseInt(slider.value);
      const display = body.querySelector('#mine-rate-display');
      if (display) display.textContent = v + '%';
      updateBurnPreview();
    };
  }

  // Burn amount input
  body.querySelector('#mine-burn-amount')?.addEventListener('input', updateBurnPreview);

  // Burn btn
  body.querySelector('#mine-burn-btn')?.addEventListener('click', async () => {
    const amt  = parseFloat(body.querySelector('#mine-burn-amount')?.value || '0');
    const rate = parseInt(body.querySelector('#mine-rate-slider')?.value || '0') / 100;
    if (!amt || amt <= 0) return;
    const btn = body.querySelector('#mine-burn-btn');
    btn.disabled = true; btn.innerHTML = '<div class="ym-loading"></div>';
    try {
      await performBurn(amt, rate);
      showTxStatus('Burn soumis !');
      await refreshBalances();
      render();
    } catch(e) { showTxStatus(e.message, true); }
    btn.disabled = false; btn.textContent = 'Burn';
  });

  // Claim btn
  body.querySelector('#mine-claim-btn')?.addEventListener('click', async () => {
    try {
      await performClaim();
      showTxStatus('Claim soumis !');
      await refreshBalances();
    } catch(e) { showTxStatus(e.message, true); }
  });

  // Send
  let sendMode = 'YM';
  body.querySelector('#mine-send-ym-tab')?.addEventListener('click', () => { sendMode = 'YM'; body.querySelector('#mine-send-ym-tab').classList.add('active'); body.querySelector('#mine-send-sol-tab').classList.remove('active'); });
  body.querySelector('#mine-send-sol-tab')?.addEventListener('click', () => { sendMode = 'SOL'; body.querySelector('#mine-send-sol-tab').classList.add('active'); body.querySelector('#mine-send-ym-tab').classList.remove('active'); });
  body.querySelector('#mine-send-btn')?.addEventListener('click', async () => {
    const to  = body.querySelector('#mine-send-to')?.value?.trim();
    const amt = parseFloat(body.querySelector('#mine-send-amt')?.value || '0');
    if (!to || !amt) return;
    try {
      const sig = await sendToken(to, amt, sendMode === 'SOL');
      showTxStatus('Tx: ' + sig.slice(0,16) + '…');
    } catch(e) { showTxStatus(e.message, true); }
  });

  updateBurnPreview();
}

function showWalletError(msg) {
  const e = $('mine-wallet-error');
  if (e) { e.textContent = msg; e.style.display = 'flex'; }
}

function showTxStatus(msg, isError = false) {
  const s = $('mine-tx-status');
  if (!s) return;
  s.textContent = msg;
  s.className = `ym-notice ${isError ? 'error' : 'success'}`;
  s.style.display = 'flex';
  setTimeout(() => { s.style.display = 'none'; }, 5000);
}

function updateBurnPreview() {
  const body = $('ym-app-body');
  if (!body) return;
  const amt  = parseFloat(body.querySelector('#mine-burn-amount')?.value || '0');
  const rate = parseInt(body.querySelector('#mine-rate-slider')?.value || '0') / 100;
  const imm  = body.querySelector('#mine-imm-reward');
  const fee  = body.querySelector('#mine-fee');
  if (imm) imm.textContent = (amt * (1 - rate)).toFixed(4) + ' YM';
  if (fee) fee.textContent = (amt * 0.001).toFixed(6) + ' SOL';
}

function updateBalanceUI() {
  const s  = $('mine-sol-bal');
  const y  = $('mine-ym-bal');
  const sl = $('mine-slot');
  if (s)  s.textContent  = mineState.sol.toFixed(6);
  if (y)  y.textContent  = mineState.ym.toFixed(4);
  if (sl) sl.textContent = mineState.slot;
  // Le header affiche le claimable comme balance principale
  window.YM_setClaimable?.(getClaimable());
}

function updateClaimableLoop() {
  const tick = () => {
    const c = getClaimable();
    const cel = $('mine-claimable');
    const camtEl = $('mine-claim-amount');
    if (cel) cel.textContent = c.toFixed(6);
    if (camtEl) camtEl.textContent = `(${c.toFixed(4)})`;
  };
  tick();
  const timer = setInterval(tick, 2000);
  // Cleanup on next app load
  const orig = window._currentAppCleanup;
  window._currentAppCleanup = () => { clearInterval(timer); orig?.(); };
}

function startCycle() {
  clearInterval(cycleTimer);
  cycleTimer = setInterval(refreshBalances, 15000);
}

// ── RESTORE MINE STATE ────────────────────────────────────
const savedMine = localStorage.getItem('ym_mine_state');
if (savedMine) Object.assign(mineState, JSON.parse(savedMine));

// ── INIT ──────────────────────────────────────────────────
render();

return {
  cleanup: () => { clearInterval(cycleTimer); }
};

})(window._YM, window._$, window._el, window._fetchText, window._fetchJSON, window._REPO_RAW, window._REPO_API);
