// validate.js — Vérifie signature Solana + score YRM
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { verifySignature, checkScoreEligibility } = require('./solana-utils');

function safeParseJson(raw) {
  if (!raw || !raw.trim()) return [];
  try {
    return JSON.parse(raw);
  } catch(e) {
    const cleaned = raw.replace(/,\s*([}\]])/g, '$1').trim();
    try {
      return JSON.parse(cleaned);
    } catch(e2) {
      console.warn('Warning: could not parse JSON, using []:', e2.message);
      return [];
    }
  }
}

async function main() {
  const branchName = process.env.BRANCH_NAME;
  if (!branchName || !branchName.startsWith('user/')) {
    console.log('Not a user branch, skipping.');
    process.exit(0);
  }

  const walletPubkey = branchName.split('/')[1];
  console.log(`Branch: ${branchName} — Wallet: ${walletPubkey}`);

  // Lit files.json depuis main via git
  let filesJsonMain = [];
  try {
    const raw = execSync('git show origin/main:files.json', { encoding: 'utf8' });
    filesJsonMain = safeParseJson(raw);
  } catch(e) {
    console.warn('files.json not found on main or unreadable, using []');
    filesJsonMain = [];
  }
  console.log(`files.json on main: ${filesJsonMain.length} entry(ies)`);

  // ── Event logs sur le disque ───────────────────────────────────────────────
  const eventsDir = 'events';
  if (!fs.existsSync(eventsDir)) {
    console.error('No events/ directory on branch');
    process.exit(1);
  }

  const allEvents = fs.readdirSync(eventsDir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(eventsDir, f), 'utf8')); }
      catch(e) { return null; }
    })
    .filter(e => e && e.wallet === walletPubkey && e.filename);

  if (!allEvents.length) {
    console.error(`No event logs found for wallet ${walletPubkey}`);
    process.exit(1);
  }

  // Un seul event par filename — le plus récent
  const eventsByFile = {};
  for (const ev of allEvents) {
    if (!eventsByFile[ev.filename] || ev.timestamp > eventsByFile[ev.filename].timestamp) {
      eventsByFile[ev.filename] = ev;
    }
  }
  console.log(`Files to validate: ${Object.keys(eventsByFile).join(', ')}`);

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

  for (const event of Object.values(eventsByFile)) {
    const { filename } = event;
    console.log(`\n--- ${filename} ---`);

    const existingEntry = filesJsonMain.find(f => f.filename === filename);

    if (existingEntry) {
      // Le fichier existe déjà dans main
      if (existingEntry.author !== walletPubkey) {
        // Appartient à un autre wallet — refus strict
        console.error(`✗ ${filename} already published by wallet ${existingEntry.author} — refused`);
        process.exit(1); // erreur bloquante, pas juste un skip
      }
      // Même wallet → c'est un update, autorisé
      console.log(`→ Update authorized for ${filename}`);
    } else {
      // Nouveau fichier — vérifie qu'il n'existe pas déjà (double sécurité)
      if (filesJsonMain.some(f => f.filename === filename)) {
        console.error(`✗ ${filename} already exists in files.json — refused`);
        process.exit(1);
      }
      console.log(`→ New file: ${filename}`);
    }

    const isUpdate = !!(existingEntry && existingEntry.author === walletPubkey);

    if (!fs.existsSync(filename)) {
      console.error(`✗ ${filename} not found on disk`);
      process.exit(1);
    }
    const sourceCode = fs.readFileSync(filename, 'utf8').replace(/\r\n/g, '\n');

    // Hash — strict pour nouvelle pub, ignoré pour update
    const actualHash = crypto.createHash('sha256').update(sourceCode).digest('hex');
    if (!isUpdate && actualHash !== event.content_hash) {
      console.error(`✗ Hash mismatch: expected ${event.content_hash}, got ${actualHash}`);
      process.exit(1);
    }
    console.log('✓ Hash OK');

    // Signature — toujours sur les données originales de l'event
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
    ghActor:   process.env.GH_ACTOR || walletPubkey,
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
