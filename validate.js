// validate.js — Vérifie signature + anti-spam + règles repo

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { verifySignature, checkScoreEligibility } = require('./solana-utils');

const MAX_FILE_SIZE = 50 * 1024; // 50 KB
const MAX_FILES_PER_HOUR = 5;

function safeParseJson(raw) {
  if (!raw || !raw.trim()) return [];
  try { return JSON.parse(raw); }
  catch(e) {
    try { return JSON.parse(raw.replace(/,\s*([}\]])/g, '$1').trim()); }
    catch(e2) { return []; }
  }
}

async function main() {
  const ghActor      = process.env.GH_ACTOR;
  const prContentDir = process.env.PR_CONTENT_DIR || '_pr_content';
  const now = Math.floor(Date.now() / 1000);

  console.log(`PR from @${ghActor}`);

  // ── files.json ─────────────────────────────────────
  let filesJsonMain = [];
  try {
    filesJsonMain = safeParseJson(fs.readFileSync('files.json', 'utf8'));
  } catch(e) {
    filesJsonMain = [];
  }

  // ── RATE LIMIT ─────────────────────────────────────
  const recentFiles = filesJsonMain.filter(f =>
    f.ghAuthor === ghActor &&
    (now - (f.merged_at || 0)) < 3600
  );

  if (recentFiles.length >= MAX_FILES_PER_HOUR) {
    console.error(`✗ Rate limit exceeded (${MAX_FILES_PER_HOUR}/hour)`);
    process.exit(1);
  }
  console.log(`✓ Rate limit OK (${recentFiles.length}/${MAX_FILES_PER_HOUR})`);

  // ── NONCE anti replay ──────────────────────────────
  const usedNonces = new Set(
    filesJsonMain.map(f => f.nonce).filter(Boolean)
  );

  // ── EVENTS ─────────────────────────────────────────
  const eventsDir = path.join(prContentDir, 'events');
  if (!fs.existsSync(eventsDir)) {
    console.error('No events/');
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
    console.error('No events');
    process.exit(1);
  }

  // dernier event par fichier
  const eventsByFile = {};
  for (const ev of allEvents) {
    if (!eventsByFile[ev.filename] || ev.timestamp > eventsByFile[ev.filename].timestamp) {
      eventsByFile[ev.filename] = ev;
    }
  }

  const presentFiles = Object.values(eventsByFile).filter(ev =>
    fs.existsSync(path.join(prContentDir, ev.filename))
  );

  if (!presentFiles.length) {
    console.error('No valid files');
    process.exit(1);
  }

  const walletPubkey = presentFiles[0].wallet;

  // ── SCORE ──────────────────────────────────────────
  const walletPubs = filesJsonMain
    .filter(f => f.author === walletPubkey)
    .sort((a, b) => (b.merged_at || 0) - (a.merged_at || 0));

  const lastPub      = walletPubs[0] || null;
  const lastPubScore = lastPub ? lastPub.score : 0;
  const lastPubLaps  = lastPub ? Math.max(1, lastPub.laps) : 1;

  const scoreCheck = await checkScoreEligibility(walletPubkey, lastPubScore, lastPubLaps);
  if (!scoreCheck.eligible) {
    console.error(`✗ Score not eligible`);
    process.exit(1);
  }

  const results = [];

  for (const event of presentFiles) {
    const { filename, wallet } = event;

    // ── EXTENSION ─────────────────────────────
    if (!filename.endsWith('.js')) {
      console.error(`✗ Only .js allowed`);
      process.exit(1);
    }

    const filePath = path.join(prContentDir, filename);

    // ── SIZE LIMIT ────────────────────────────
    const stats = fs.statSync(filePath);
    if (stats.size > MAX_FILE_SIZE) {
      console.error(`✗ File too large (${stats.size} bytes)`);
      process.exit(1);
    }

    // ── SAME WALLET ───────────────────────────
    if (wallet !== walletPubkey) {
      console.error(`✗ Mixed wallets`);
      process.exit(1);
    }

    // ── NONCE ────────────────────────────────
    if (usedNonces.has(event.nonce)) {
      console.error(`✗ Nonce already used`);
      process.exit(1);
    }

    const existingEntry = filesJsonMain.find(f => f.filename === filename);

    if (existingEntry) {
      if (existingEntry.ghAuthor !== ghActor) {
        console.error(`✗ Not owner`);
        process.exit(1);
      }
    }

    const sourceCode = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

    const actualHash = crypto.createHash('sha256').update(sourceCode).digest('hex');

    if (!existingEntry && actualHash !== event.content_hash) {
      console.error(`✗ Hash mismatch`);
      process.exit(1);
    }

    const message = JSON.stringify({
      action: event.action,
      filename: event.filename,
      content_hash: event.content_hash,
      nonce: event.nonce,
      timestamp: event.timestamp,
      score: event.score,
      laps: event.laps
    });

    if (!verifySignature(message, event.signature, walletPubkey)) {
      console.error(`✗ Signature invalid`);
      process.exit(1);
    }

    results.push({
      filename,
      isUpdate: !!existingEntry,
      nonce: event.nonce
    });
  }

  fs.writeFileSync('/tmp/validation_result.json', JSON.stringify({
    walletPubkey,
    ghActor,
    score: scoreCheck.score,
    laps: scoreCheck.currentLaps,
    timestamp: now,
    files: results
  }, null, 2));

  console.log(`✓ VALIDATION OK (${results.length} files)`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
