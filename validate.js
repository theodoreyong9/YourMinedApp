// validate.js — Vérifie signature Solana + score YRM
// Le checkout Actions a déjà mis les fichiers de la branche sur le disque
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { verifySignature, checkScoreEligibility } = require('./solana-utils');

async function main() {
  const branchName = process.env.BRANCH_NAME;
  if (!branchName || !branchName.startsWith('user/')) {
    console.log('Not a user branch, skipping.');
    process.exit(0);
  }

  // Branche = user/<wallet>
  const walletPubkey = branchName.split('/')[1];
  console.log(`Branch: ${branchName} — Wallet: ${walletPubkey}`);

  // Lit files.json (version de la branche courante, sur le disque)
  const filesJsonPath = 'files.json';
  const filesJson = fs.existsSync(filesJsonPath)
    ? JSON.parse(fs.readFileSync(filesJsonPath, 'utf8'))
    : [];

  // ── Source de vérité : tous les event logs dans events/ ───────────────────
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

  // ── Score on-chain — une seule fois ───────────────────────────────────────
  // files.json sur la branche peut différer de main — on lit main via git
  const { execSync } = require('child_process');
  let filesJsonMain = [];
  try {
    const raw = execSync('git show origin/main:files.json', { encoding: 'utf8' });
    filesJsonMain = JSON.parse(raw);
  } catch(e) { filesJsonMain = []; }

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

    // Refuse si ce fichier appartient à un autre wallet sur main
    const otherOwner = filesJsonMain.find(f => f.filename === filename && f.author !== walletPubkey);
    if (otherOwner) {
      console.error(`✗ ${filename} belongs to another wallet — skipped`);
      continue;
    }

    const isUpdate = filesJsonMain.some(f => f.filename === filename && f.author === walletPubkey);

    // Lit le fichier source depuis le disque (déjà checkouted par Actions)
    if (!fs.existsSync(filename)) {
      console.error(`✗ ${filename} not found on disk`);
      continue;
    }
    const sourceCode = fs.readFileSync(filename, 'utf8').replace(/\r\n/g, '\n');

    // Hash — strict nouvelle pub, ignoré pour update
    const actualHash = crypto.createHash('sha256').update(sourceCode).digest('hex');
    if (!isUpdate && actualHash !== event.content_hash) {
      console.error(`✗ Hash mismatch: expected ${event.content_hash}, got ${actualHash}`);
      continue;
    }
    console.log('✓ Hash OK');

    // Signature — toujours sur les données ORIGINALES de l'event
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
      continue;
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
