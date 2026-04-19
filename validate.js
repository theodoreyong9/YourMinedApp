// validate.js — Vérifie signature Solana + score YRM + protections
// Architecture loader/code : .sphere.js (loader, mergé) + .sphere.code.js (code, dans fork)
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { verifySignature, checkScoreEligibility } = require('./solana-utils');

const MAX_LOADER_SIZE   = 5 * 1024;   // 5 Ko max pour le loader (.sphere.js)
const MAX_CODE_SIZE     = 500 * 1024; // 500 Ko max pour le code (.sphere.code.js)
const MIN_TS_GAP_SEC    = 300;        // 5 min entre soumissions (nouveaux fichiers)
const MAX_EVENT_AGE_SEC = 3600;       // Events > 1h ignorés
const MAX_NEW_FILES     = 1;          // 1 seul nouveau fichier par PR

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

  // Charge les events, filtre les trop anciens
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

  // Garde seulement les fichiers dont le loader (.sphere.js) est dans la PR
  const presentFiles = Object.values(eventsByFile).filter(ev =>
    fs.existsSync(path.join(prContentDir, ev.filename))
  );

  if (!presentFiles.length) { console.error('No sphere files found in PR'); process.exit(1); }

  const walletPubkey = presentFiles[0].wallet;
  console.log(`Wallet: ${walletPubkey}`);

  if (presentFiles.some(ev => ev.wallet !== walletPubkey)) {
    console.error('✗ Mixed wallets in PR'); process.exit(1);
  }

  // Classifie
  const newFiles     = [];
  const upgradeFiles = [];
  for (const ev of presentFiles) {
    const existing = filesJsonMain.find(f => f.filename === ev.filename);
    if (!existing) {
      // Fichier physique présent dans le repo mais pas dans files.json = protégé
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

  if (newFiles.length > MAX_NEW_FILES) {
    console.error(`✗ Too many new files: ${newFiles.length} (max ${MAX_NEW_FILES})`);
    process.exit(1);
  }

  // ── Rate limit ────────────────────────────────────────────────────────────
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

  // ── Anti-replay ────────────────────────────────────────────────────────────
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

  // ── Score on-chain ────────────────────────────────────────────────────────
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

    // Vérifie le LOADER (.sphere.js)
    const loaderPath = path.join(prContentDir, filename);
    const loaderCode = fs.readFileSync(loaderPath, 'utf8');
    const loaderSize = Buffer.byteLength(loaderCode, 'utf8');
    if (loaderSize > MAX_LOADER_SIZE) {
      console.error(`✗ Loader too large: ${(loaderSize/1024).toFixed(1)} KB (max ${MAX_LOADER_SIZE/1024} KB)`);
      console.error('  The loader must be auto-generated by build.js, not hand-written.');
      process.exit(1);
    }
    console.log(`✓ Loader size OK (${(loaderSize/1024).toFixed(1)} KB)`);

    // Vérifie le CODE (.sphere.code.js) — content_hash est le hash du code
    const baseName    = filename.replace(/\.sphere\.js$/, '');
    const codeFilename = baseName + '.sphere.code.js';
    const codePath    = path.join(prContentDir, codeFilename);

    if (!fs.existsSync(codePath)) {
      console.error(`✗ Missing code file: ${codeFilename} not found in PR`);
      console.error('  Make sure build.js pushes both the loader and the code file.');
      process.exit(1);
    }

    const codeSource = fs.readFileSync(codePath, 'utf8').replace(/\r\n/g, '\n');
    const codeSize   = Buffer.byteLength(codeSource, 'utf8');
    if (codeSize > MAX_CODE_SIZE) {
      console.error(`✗ Code too large: ${(codeSize/1024).toFixed(1)} KB (max ${MAX_CODE_SIZE/1024} KB)`);
      process.exit(1);
    }
    console.log(`✓ Code size OK (${(codeSize/1024).toFixed(1)} KB)`);

    // Vérifie le hash du code (content_hash dans l'event = hash du code)
    const actualCodeHash = crypto.createHash('sha256').update(codeSource).digest('hex');
    if (actualCodeHash !== event.content_hash) {
      console.error(`✗ Code hash mismatch`);
      console.error(`  Expected: ${event.content_hash}`);
      console.error(`  Got:      ${actualCodeHash}`);
      process.exit(1);
    }
    console.log('✓ Code hash OK');

    // Vérifie la signature (message signé = {action,filename,content_hash(=hash du code),nonce,timestamp,score,laps})
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
