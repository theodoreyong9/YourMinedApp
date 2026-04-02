// validate.js — Vérifie signature Solana + score YRM + protections
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { verifySignature, checkScoreEligibility } = require('./solana-utils');

const MAX_FILE_SIZE  = 100 * 1024;  // 100 Ko
const MIN_TS_GAP_SEC = 300;         // 5 min entre soumissions du même wallet

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
  } catch(e) { console.warn('files.json not found, using []'); }

  // ── Event logs ────────────────────────────────────────────────────────────
  const eventsDir = path.join(prContentDir, 'events');
  if (!fs.existsSync(eventsDir)) { console.error('No events/ directory in PR'); process.exit(1); }

  const allEvents = fs.readdirSync(eventsDir)
    .filter(f => f.endsWith('.json'))
    .map(f => { try { return JSON.parse(fs.readFileSync(path.join(eventsDir, f), 'utf8')); } catch(e) { return null; } })
    .filter(e => e && e.wallet && e.filename);

  if (!allEvents.length) { console.error('No event logs found'); process.exit(1); }

  // Un seul event par filename — le plus récent
  const eventsByFile = {};
  for (const ev of allEvents) {
    if (!eventsByFile[ev.filename] || ev.timestamp > eventsByFile[ev.filename].timestamp)
      eventsByFile[ev.filename] = ev;
  }

  const presentFiles = Object.values(eventsByFile).filter(ev =>
    fs.existsSync(path.join(prContentDir, ev.filename))
  );
  if (!presentFiles.length) { console.error('No sphere files found in PR'); process.exit(1); }

  const walletPubkey = presentFiles[0].wallet;
  console.log(`Wallet: ${walletPubkey}`);

  // Wallets mixtes interdits
  if (presentFiles.some(ev => ev.wallet !== walletPubkey)) {
    console.error('✗ Mixed wallets in PR'); process.exit(1);
  }

  // ── PROTECTION : rate limit 300s ─────────────────────────────────────────
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
    const minNewTs = Math.min(...presentFiles.map(ev => ev.timestamp));
    const gap = minNewTs - lastMainTs;
    if (gap < MIN_TS_GAP_SEC) {
      console.error(`✗ Rate limit: ${MIN_TS_GAP_SEC}s required between submissions, only ${gap}s elapsed`);
      process.exit(1);
    }
  }
  console.log('✓ Rate limit OK');

  // ── PROTECTION : anti-replay nonces ──────────────────────────────────────
  const knownNonces = new Set();
  if (fs.existsSync(mainEvDir)) {
    for (const ef of fs.readdirSync(mainEvDir).filter(f => f.endsWith('.json'))) {
      try { const ev = JSON.parse(fs.readFileSync(path.join(mainEvDir, ef), 'utf8')); if (ev.nonce) knownNonces.add(ev.nonce); } catch(e) {}
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
  // Ownership = ghAuthor. Le wallet peut changer d'une pub à l'autre (dernier wallet utilisé).
  const walletPubs = filesJsonMain
    .filter(f => f.ghAuthor === ghActor)
    .sort((a, b) => (b.merged_at || 0) - (a.merged_at || 0));
  const lastPub      = walletPubs[0] || null;
  const lastPubScore = lastPub ? (lastPub.score || 0) : 0;
  const lastPubLaps  = lastPub ? Math.max(1, lastPub.laps || 1) : 1;

  const scoreCheck = await checkScoreEligibility(walletPubkey, lastPubScore, lastPubLaps);
  if (!scoreCheck.eligible) {
    console.error(`✗ Score not eligible: ${scoreCheck.reason}`);
    process.exit(1);
  }
  console.log(`✓ Score eligible (claimable=${scoreCheck.score.toFixed(4)} YRM)`);

  // ── Validation par fichier ────────────────────────────────────────────────
  const results = [];

  for (const event of presentFiles) {
    const { filename } = event;
    console.log(`\n--- ${filename} ---`);

    // .sphere.js uniquement
    if (!filename.endsWith('.sphere.js')) {
      console.error(`✗ Only .sphere.js files allowed: ${filename}`);
      process.exit(1);
    }

    // Ownership — ghAuthor (pas le wallet)
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
    const filePath  = path.join(prContentDir, filename);
    const sourceCode = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

    // Taille max 100 Ko
    const sizeBytes = Buffer.byteLength(sourceCode, 'utf8');
    if (sizeBytes > MAX_FILE_SIZE) {
      console.error(`✗ File too large: ${(sizeBytes/1024).toFixed(1)} KB (max ${MAX_FILE_SIZE/1024} KB)`);
      process.exit(1);
    }
    console.log(`✓ Size OK (${(sizeBytes/1024).toFixed(1)} KB)`);

    // Hash
    const actualHash = crypto.createHash('sha256').update(sourceCode).digest('hex');
    if (!isUpdate && actualHash !== event.content_hash) {
      console.error(`✗ Hash mismatch: expected ${event.content_hash}, got ${actualHash}`);
      process.exit(1);
    }
    console.log('✓ Hash OK');

    // Signature — sur données originales de l'event
    const message = JSON.stringify({
      action: event.action, filename: event.filename,
      content_hash: event.content_hash, nonce: event.nonce,
      timestamp: event.timestamp, score: event.score, laps: event.laps
    });
    if (!verifySignature(message, event.signature, walletPubkey)) {
      console.error(`✗ Invalid signature for ${filename}`);
      process.exit(1);
    }
    console.log('✓ Signature OK');
    console.log(`✓ ${filename} validated (${isUpdate ? 'update' : 'new'})`);

    // Données PER-FILE depuis l'event (score/laps au moment de la soumission)
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
