// validate.js — Vérifie signature Solana + score YRM + unicité du nom
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { verifySignature, checkScoreEligibility } = require('./solana-utils');

async function main() {
  const branchName = process.env.BRANCH_NAME;
  if (!branchName || !branchName.startsWith('user/')) {
    console.log('Not a user branch, skipping validation.');
    process.exit(0);
  }

  const parts = branchName.split('/');
  if (parts.length < 3) {
    console.error('Invalid branch format. Expected user/<wallet>/<filename>');
    process.exit(1);
  }
  const walletPubkey = parts[1];
  const filename     = parts.slice(2).join('/');
  console.log(`Validating: ${filename} from wallet ${walletPubkey}`);

  // 1. Trouve l'event log dans events/
  const eventsDir = 'events';
  let event = null;
  if (fs.existsSync(eventsDir)) {
    const eventFiles = fs.readdirSync(eventsDir).filter(f => f.endsWith('.json'));
    for (const ef of eventFiles) {
      const e = JSON.parse(fs.readFileSync(path.join(eventsDir, ef), 'utf8'));
      if (e.filename === filename && e.wallet === walletPubkey) {
        event = e;
        break;
      }
    }
  }
  if (!event) {
    console.error(`No event log found for ${filename} from ${walletPubkey}`);
    process.exit(1);
  }

  // 2. Vérifie que le fichier source existe
  if (!fs.existsSync(filename)) {
    console.error(`Source file not found: ${filename}`);
    process.exit(1);
  }
  // FIX: normalise les fins de ligne — GitHub peut changer \r\n en \n au checkout
  const sourceCode = fs.readFileSync(filename, 'utf8').replace(/\r\n/g, '\n');

  // 3. Lit files.json — détermine si c'est une nouvelle pub ou un update
  const filesJsonPath = 'files.json';
  const filesJson = fs.existsSync(filesJsonPath)
    ? JSON.parse(fs.readFileSync(filesJsonPath, 'utf8'))
    : [];

  const isUpdate = filesJson.some(f => f.filename === filename && f.author === walletPubkey);
  console.log(isUpdate ? '→ Update (same wallet, same file)' : '→ New publication');

  // 4. Hash du contenu
  // FIX: même normalisation \r\n → \n que côté browser
  const actualHash = crypto.createHash('sha256').update(sourceCode).digest('hex');
  if (!isUpdate && actualHash !== event.content_hash) {
    console.error(`Hash mismatch! Expected ${event.content_hash}, got ${actualHash}`);
    process.exit(1);
  }
  console.log('✓ Hash verified');

  // 5. Signature — TOUJOURS vérifiée sur les données ORIGINALES de l'event
  // (event.content_hash = hash au moment de la signature, jamais modifié)
  const message = JSON.stringify({
    action:       event.action,
    filename:     event.filename,
    content_hash: event.content_hash,
    nonce:        event.nonce,
    timestamp:    event.timestamp,
    score:        event.score,
    laps:         event.laps
  });
  const sigValid = verifySignature(message, event.signature, walletPubkey);
  if (!sigValid) {
    console.error('✗ Invalid Solana signature');
    process.exit(1);
  }
  console.log('✓ Signature verified');

  // 6. Score on-chain
  const walletPubs = filesJson
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

  // 7. Unicité — seulement pour une nouvelle pub
  if (!isUpdate && filesJson.some(f => f.filename === filename)) {
    console.error(`✗ "${filename}" already published by another wallet`);
    process.exit(1);
  }
  console.log('✓ OK');

  fs.writeFileSync('/tmp/validation_result.json', JSON.stringify({
    filename, walletPubkey, isUpdate,
    score:     scoreCheck.score,
    laps:      scoreCheck.currentLaps,
    timestamp: event.timestamp,
    nonce:     event.nonce
  }, null, 2));
  console.log('✓ Validation passed');
}

main().catch(e => {
  console.error('Validation error:', e.message);
  process.exit(1);
});
