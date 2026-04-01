// validate.js — Vérifie signature Solana + score YRM + protections
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { verifySignature, checkScoreEligibility } = require('./solana-utils');

const MAX_FILE_SIZE  = 50 * 1024;     // 50 Ko
const MIN_TS_GAP_SEC = 60;            // 60s minimum entre deux soumissions du même wallet

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

  // Lit files.json depuis main
  let filesJsonMain = [];
  try {
    filesJsonMain = safeParseJson(fs.readFileSync('files.json', 'utf8'));
    console.log(`files.json on main: ${filesJsonMain.length} entry(ies)`);
  } catch(e) {
    console.warn('files.json not found, using []');
    filesJsonMain = [];
  }

  // ── Event logs dans _pr_content/events/ ───────────────────────────────────
  const eventsDir = path.join(prContentDir, 'events');
  if (!fs.existsSync(eventsDir)) {
    console.error('No events/ directory in PR content');
    process.exit(1);
  }

  const allEvents = fs.readdirSync(eventsDir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(eventsDir, f), 'utf8')); }
      catch(e) { return null; }
    })
    .filter(e => e && e.wallet && e.filename);

  if (!allEvents.length) {
    console.error('No event logs found in PR');
    process.exit(1);
  }

  // Un seul event par filename — le plus récent
  const eventsByFile = {};
  for (const ev of allEvents) {
    if (!eventsByFile[ev.filename] || ev.timestamp > eventsByFile[ev.filename].timestamp) {
      eventsByFile[ev.filename] = ev;
    }
  }

  // Fichiers présents dans _pr_content/
  const presentFiles = Object.values(eventsByFile).filter(ev =>
    fs.existsSync(path.join(prContentDir, ev.filename))
  );
  if (!presentFiles.length) {
    console.error('No sphere files found in PR content');
    process.exit(1);
  }

  const walletPubkey = presentFiles[0].wallet;
  console.log(`Wallet: ${walletPubkey}`);

  // ── PROTECTION : tous les events appartiennent au même wallet ──────────────
  if (presentFiles.some(ev => ev.wallet !== walletPubkey)) {
    console.error('✗ Mixed wallets in PR — refused');
    process.exit(1);
  }

  // ── PROTECTION : rate limit — timestamp entre soumissions ─────────────────
  // Vérifie que le wallet n'a pas soumis trop récemment (via les event logs existants sur main)
  const mainEventsDir = 'events';
  if (fs.existsSync(mainEventsDir)) {
    const mainEventFiles = fs.readdirSync(mainEventsDir).filter(f => f.endsWith('.json'));
    let lastMainTs = 0;
    for (const ef of mainEventFiles) {
      try {
        const ev = JSON.parse(fs.readFileSync(path.join(mainEventsDir, ef), 'utf8'));
        if (ev.wallet === walletPubkey && ev.timestamp > lastMainTs) lastMainTs = ev.timestamp;
      } catch(e) {}
    }
    const now = Math.floor(Date.now() / 1000);
    const minNewTs = Math.min(...presentFiles.map(ev => ev.timestamp));
    if (lastMainTs > 0 && (minNewTs - lastMainTs) < MIN_TS_GAP_SEC) {
      console.error(`✗ Rate limit: minimum ${MIN_TS_GAP_SEC}s between submissions (last was ${now - lastMainTs}s ago)`);
      process.exit(1);
    }
    console.log('✓ Rate limit OK');
  }

  // ── PROTECTION : anti-replay — nonces uniques globalement ─────────────────
  // Collecte tous les nonces déjà connus sur main
  const knownNonces = new Set();
  const mainEvDir = 'events';
  if (fs.existsSync(mainEvDir)) {
    for (const ef of fs.readdirSync(mainEvDir).filter(f => f.endsWith('.json'))) {
      try {
        const ev = JSON.parse(fs.readFileSync(path.join(mainEvDir, ef), 'utf8'));
        if (ev.nonce) knownNonces.add(ev.nonce);
      } catch(e) {}
    }
  }
  for (const event of presentFiles) {
    if (knownNonces.has(event.nonce)) {
      console.error(`✗ Replay attack detected: nonce ${event.nonce} already used`);
      process.exit(1);
    }
  }
  console.log('✓ Anti-replay OK');

  // ── Score on-chain ─────────────────────────────────────────────────────────
  const walletPubs = filesJsonMain
    .filter(f => f.author === walletPubkey)
    .sort((a, b) => (b.merged_at || 0) - (a.merged_at || 0));
  const lastPub      = walletPubs[0] || null;
  const lastPubScore = lastPub ? lastPub.score : 0;
  const lastPubLaps  = lastPub ? Math.max(1, lastPub.laps) : 1;

  const scoreCheck = await checkScoreEligibility(walletPubkey, lastPubScore, lastPubLaps);
  if (!scoreCheck.eligible) {
    console.error(`✗ Score not eligible: ${scoreCheck.reason}`);
    process.exit(1);
  }
  console.log(`✓ Score eligible (claimable=${scoreCheck.score.toFixed(4)} YRM)`);

  // ── Validation fichier par fichier ────────────────────────────────────────
  const results = [];

  for (const event of presentFiles) {
    const { filename } = event;
    console.log(`\n--- ${filename} ---`);

    // PROTECTION : uniquement les fichiers .sphere.js
    if (!filename.endsWith('.sphere.js')) {
      console.error(`✗ REFUSED: only .sphere.js files are allowed (got: ${filename})`);
      process.exit(1);
    }

    const existingEntry = filesJsonMain.find(f => f.filename === filename);

    if (existingEntry) {
      if (existingEntry.ghAuthor !== ghActor) {
        console.error(`✗ REFUSED: ${filename} belongs to @${existingEntry.ghAuthor}`);
        process.exit(1);
      }
      console.log(`→ Update authorized (@${ghActor})`);
    } else {
      console.log(`→ New file`);
    }

    const isUpdate = !!(existingEntry && existingEntry.ghAuthor === ghActor);

    const filePath = path.join(prContentDir, filename);
    const sourceCode = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

    // PROTECTION : taille max 50 Ko
    const fileSizeBytes = Buffer.byteLength(sourceCode, 'utf8');
    if (fileSizeBytes > MAX_FILE_SIZE) {
      console.error(`✗ File too large: ${filename} is ${(fileSizeBytes/1024).toFixed(1)} KB (max 50 KB)`);
      process.exit(1);
    }
    console.log(`✓ Size OK (${(fileSizeBytes/1024).toFixed(1)} KB)`);

    // Hash
    const actualHash = crypto.createHash('sha256').update(sourceCode).digest('hex');
    if (!isUpdate && actualHash !== event.content_hash) {
      console.error(`✗ Hash mismatch: expected ${event.content_hash}, got ${actualHash}`);
      process.exit(1);
    }
    console.log('✓ Hash OK');

    // Signature
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

    // FIX: stocke les données PER-FILE depuis l'event log (pas les données globales du wallet)
    results.push({
      filename,
      isUpdate,
      score:     event.score     || 0,    // score au moment de la soumission
      laps:      event.laps      || 0,    // laps au moment de la soumission
      timestamp: event.timestamp || Math.floor(Date.now()/1000)
    });
  }

  if (!results.length) {
    console.error('No files passed validation');
    process.exit(1);
  }

  fs.writeFileSync('/tmp/validation_result.json', JSON.stringify({
    walletPubkey,
    ghActor,
    files: results   // chaque fichier a ses propres score/laps/timestamp
  }, null, 2));

  console.log(`\n✓ Validation passed — ${results.length} file(s) ready`);
}

main().catch(e => {
  console.error('Validation error:', e.message);
  process.exit(1);
});
