// validate.js — Vérifie signature Solana + score YRM + ownership GitHub
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { verifySignature, checkScoreEligibility } = require('./solana-utils');

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

  // Lit files.json depuis main (repo principal checkouted à la racine)
  let filesJsonMain = [];
  try {
    filesJsonMain = safeParseJson(fs.readFileSync('files.json', 'utf8'));
    console.log(`files.json on main: ${filesJsonMain.length} entry(ies)`);
  } catch(e) {
    console.warn('files.json not found, using []');
    filesJsonMain = [];
  }

  // ── Event logs depuis le contenu de la PR ─────────────────────────────────
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

  // Ne garde que les fichiers présents dans le contenu de la PR
  const presentFiles = Object.values(eventsByFile).filter(ev =>
    fs.existsSync(path.join(prContentDir, ev.filename))
  );
  if (!presentFiles.length) {
    console.error('No sphere files found in PR content');
    process.exit(1);
  }
  console.log(`Files to validate: ${presentFiles.map(e => e.filename).join(', ')}`);

  // Wallet = depuis l'event log (pas depuis le nom de branche)
  const walletPubkey = presentFiles[0].wallet;
  console.log(`Wallet: ${walletPubkey}`);

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
    const { filename, wallet } = event;
    console.log(`\n--- ${filename} ---`);

    // Vérifie que tous les events appartiennent au même wallet
    if (wallet !== walletPubkey) {
      console.error(`✗ Mixed wallets in PR — refused`);
      process.exit(1);
    }

    const existingEntry = filesJsonMain.find(f => f.filename === filename);

    if (existingEntry) {
      // Ownership = compte GitHub
      if (existingEntry.ghAuthor !== ghActor) {
        console.error(`✗ REFUSED: ${filename} belongs to @${existingEntry.ghAuthor}`);
        process.exit(1);
      }
      console.log(`→ Update authorized (@${ghActor})`);
    } else {
      console.log(`→ New file`);
    }

    const isUpdate = !!(existingEntry && existingEntry.ghAuthor === ghActor);

    const sourceCode = fs.readFileSync(
      path.join(prContentDir, filename), 'utf8'
    ).replace(/\r\n/g, '\n');

    const actualHash = crypto.createHash('sha256').update(sourceCode).digest('hex');
    if (!isUpdate && actualHash !== event.content_hash) {
      console.error(`✗ Hash mismatch: expected ${event.content_hash}, got ${actualHash}`);
      process.exit(1);
    }
    console.log('✓ Hash OK');

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
    results.push({ filename, isUpdate });
  }

  if (!results.length) {
    console.error('No files passed validation');
    process.exit(1);
  }

  fs.writeFileSync('/tmp/validation_result.json', JSON.stringify({
    walletPubkey,
    ghActor,
    score:     scoreCheck.score,
    laps:      scoreCheck.currentLaps,
    timestamp: Math.floor(Date.now() / 1000),
    files:     results
  }, null, 2));

  console.log(`\n✓ Validation passed — ${results.length} file(s) ready`);
}

main().catch(e => {
  console.error('Validation error:', e.message);
  process.exit(1);
});
