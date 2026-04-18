// validate.js — Vérifie signature Solana + score YRM + protections
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { verifySignature, checkScoreEligibility } = require('./solana-utils');

const MAX_FILE_SIZE     = 100 * 1024;  // 100 Ko
const MIN_TS_GAP_SEC    = 300;         // 5 min entre soumissions du même wallet (nouveaux fichiers)
const MAX_EVENT_AGE_SEC = 3600;        // Events > 1h ignorés (vieux events accumulés dans le fork)
const MAX_NEW_FILES     = 1;           // 1 seul nouveau fichier par PR

function safeParseJson(raw) {
  if (!raw || !raw.trim()) return [];
  try { return JSON.parse(raw); }
  catch(e) {
    try { return JSON.parse(raw.replace(/,\s*([}\]])/g, '$1').trim()); }
    catch(e2) { console.warn('JSON parse failed:', e2.message); return []; }
  }
}

async function main() {
  const ghActor      = process.env.GH_ACTOR;
  const prContentDir = process.env.PR_CONTENT_DIR || '_pr_content';
  console.log(`PR from @${ghActor}`);

  let filesJsonMain = [];
  try {
    filesJsonMain = safeParseJson(fs.readFileSync('files.json', 'utf8'));
    console.log(`files.json on main: ${filesJsonMain.length} entry(ies)`);
  } catch(e) { console.warn('files.json not found, using []'); }

  const eventsDir = path.join(prContentDir, 'events');
  if (!fs.existsSync(eventsDir)) { console.error('No events/ directory in PR'); process.exit(1); }

  const now = Math.floor(Date.now() / 1000);

  // Charge tous les events, filtre les trop anciens (vieux events du fork)
  const allEvents = fs.readdirSync(eventsDir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(eventsDir, f), 'utf8')); }
      catch(e) { return null; }
    })
    .filter(e => e && e.wallet && e.filename)
    .filter(ev => {
      const age = now - (ev.timestamp || 0);
      if (age > MAX_EVENT_AGE_SEC) {
        console.log(`  Skipping stale event for ${ev.filename} (age ${age}s)`);
        return false;
      }
      return true;
    });

  if (!allEvents.length) {
    console.error(`✗ No fresh events (all older than ${MAX_EVENT_AGE_SEC}s)`);
    process.exit(1);
  }

  // Garde l'event le plus récent par fichier
  const eventsByFile = {};
  for (const ev of allEvents) {
    if (!eventsByFile[ev.filename] || ev.timestamp > eventsByFile[ev.filename].timestamp)
      eventsByFile[ev.filename] = ev;
  }

  // Garde seulement les fichiers dont le .sphere.js est présent dans la PR
  const presentFiles = Object.values(eventsByFile).filter(ev =>
    fs.existsSync(path.join(prContentDir, ev.filename))
  );

  if (!presentFiles.length) { console.error('No sphere files found in PR'); process.exit(1); }

  const walletPubkey = presentFiles[0].wallet;
  console.log(`Wallet: ${walletPubkey}`);

  if (presentFiles.some(ev => ev.wallet !== walletPubkey)) {
    console.error('✗ Mixed wallets in PR'); process.exit(1);
  }

  // Classifie : nouveaux / upgrades / non autorisés
  const newFiles     = [];
  const upgradeFiles = [];
  for (const ev of presentFiles) {
    const existing = filesJsonMain.find(f => f.filename === ev.filename);
    if (!existing) {
      // FIX: vérifie aussi que le fichier n'existe PAS physiquement dans le repo
      // Les fichiers du repo non référencés dans files.json sont protégés (maison mère)
      if (fs.existsSync(ev.filename)) {
        console.error(`✗ PROTECTED: ${ev.filename} exists in repo but not in files.json`);
        process.exit(1);
      }
      newFiles.push(ev);
    } else if (existing.ghAuthor === ghActor) {
      upgradeFiles.push(ev);
    } else {
      console.error(`✗ REFUSED: ${ev.filename} belongs to @${existing.ghAuthor}`);
      process.exit(1);
    }
  }

  console.log(`New files: ${newFiles.length}, Upgrades: ${upgradeFiles.length}`);

  // Max 1 nouveau fichier par PR
  if (newFiles.length > MAX_NEW_FILES) {
    console.error(`✗ Too many new files: ${newFiles.length} (max ${MAX_NEW_FILES})`);
    process.exit(1);
  }

  // ── Rate limit — nouveaux fichiers seulement ──────────────────────────────
  if (newFiles.length > 0) {
    const mainEvDir = 'events';
    let lastMainTs = 0;
    if (fs.existsSync(mainEvDir)) {
      for (const ef of fs.readdirSync(mainEvDir).filter(f => f.endsWith('.json'))) {
        try {
          const ev = JSON.parse(fs.readFileSync(path.join(mainEvDir, ef), 'utf8'));
          if (ev.wallet === walletPubkey && ev.timestamp > lastMainTs) lastMainTs = ev.timestamp;
        } catch(e) {}
      }
    }
    if (lastMainTs > 0) {
      const minNewTs = Math.min.apply(null, newFiles.map(ev => ev.timestamp));
      const gap = minNewTs - lastMainTs;
      if (gap < MIN_TS_GAP_SEC) {
        console.error(`✗ Rate limit: ${MIN_TS_GAP_SEC}s required, only ${gap}s elapsed`);
        process.exit(1);
      }
    }
    console.log('✓ Rate limit OK');
  } else {
    console.log('✓ Rate limit skipped (upgrades only)');
  }

  // ── Anti-replay nonces ────────────────────────────────────────────────────
  const knownNonces = new Set();
  if (fs.existsSync('events')) {
    for (const ef of fs.readdirSync('events').filter(f => f.endsWith('.json'))) {
      try {
        const ev = JSON.parse(fs.readFileSync(path.join('events', ef), 'utf8'));
        if (ev.nonce) knownNonces.add(ev.nonce);
      } catch(e) {}
    }
  }
  for (const event of presentFiles) {
    if (knownNonces.has(event.nonce)) {
      console.error(`✗ Replay attack: nonce ${event.nonce} already used`);
      process.exit(1);
    }
  }
  console.log('✓ Anti-replay OK');

  // ── Score on-chain — nouveaux fichiers seulement ──────────────────────────
  let scoreCheck = { score: 0, currentLaps: 1, eligible: true };
  if (newFiles.length > 0) {
    const walletPubs = filesJsonMain
      .filter(f => f.ghAuthor === ghActor)
      .sort((a, b) => (b.merged_at || 0) - (a.merged_at || 0));
    const lastPub      = walletPubs[0] || null;
    const lastPubScore = lastPub ? (lastPub.score || 0) : 0;
    const lastPubLaps  = lastPub ? Math.max(1, lastPub.laps || 1) : 1;

    scoreCheck = await checkScoreEligibility(walletPubkey, lastPubScore, lastPubLaps);
    if (!scoreCheck.eligible) {
      console.error(`✗ Score not eligible for new file: ${scoreCheck.reason}`);
      process.exit(1);
    }
    console.log(`✓ Score eligible (claimable=${scoreCheck.score.toFixed(4)} YRM)`);
  } else {
    console.log('✓ Score check skipped (upgrades only)');
  }

  // ── Validation par fichier ────────────────────────────────────────────────
  const results = [];

  for (const event of presentFiles) {
    const { filename } = event;
    console.log(`\n--- ${filename} ---`);

    if (!filename.endsWith('.sphere.js')) {
      console.error(`✗ Only .sphere.js files allowed: ${filename}`);
      process.exit(1);
    }

    const existingEntry = filesJsonMain.find(f => f.filename === filename);
    const isUpdate = !!(existingEntry && existingEntry.ghAuthor === ghActor);
    console.log(`→ ${isUpdate ? 'Update authorized (@'+ghActor+')' : 'New file'}`);

    const filePath = path.join(prContentDir, filename);
    const sourceCode = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

    const sizeBytes = Buffer.byteLength(sourceCode, 'utf8');
    if (sizeBytes > MAX_FILE_SIZE) {
      console.error(`✗ File too large: ${(sizeBytes/1024).toFixed(1)} KB`);
      process.exit(1);
    }
    console.log(`✓ Size OK (${(sizeBytes/1024).toFixed(1)} KB)`);

    const actualHash = crypto.createHash('sha256').update(sourceCode).digest('hex');
    if (!isUpdate && actualHash !== event.content_hash) {
      console.error(`✗ Hash mismatch: expected ${event.content_hash}, got ${actualHash}`);
      process.exit(1);
    }
    console.log('✓ Hash OK');

    // Message signé sans burnSlot — doit correspondre exactement à build.js
    const message = JSON.stringify({
      action:       event.action,
      filename:     event.filename,
      content_hash: event.content_hash,
      nonce:        event.nonce,
      timestamp:    event.timestamp,
      score:        event.score,
      laps:         event.laps
    });
    if (!verifySignature(message, event.signature, walletPubkey)) {
      console.error(`✗ Invalid signature for ${filename}`);
      process.exit(1);
    }
    console.log('✓ Signature OK');
    console.log(`✓ ${filename} validated (${isUpdate ? 'update' : 'new'})`);

    results.push({
      filename, isUpdate,
      score:     event.score     || 0,
      laps:      event.laps      || 0,
      burnSlot:  event.burnSlot  || 0,
      timestamp: event.timestamp || Math.floor(Date.now()/1000)
    });
  }

  if (!results.length) { console.error('No files passed validation'); process.exit(1); }

  fs.writeFileSync('/tmp/validation_result.json', JSON.stringify({
    walletPubkey, ghActor, files: results
  }, null, 2));
  console.log(`\n✓ Validation passed — ${results.length} file(s) ready`);
}

main().catch(e => { console.error('Validation error:', e.message); process.exit(1); });
