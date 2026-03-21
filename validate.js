// validate.js — Vérifie signature Solana + score YRM + unicité du nom
const fs = require('fs');
const path = require('path');
const { verifySignature, checkScoreEligibility } = require('./solana-utils');

async function main() {
  const branchName = process.env.BRANCH_NAME;
  if (!branchName || !branchName.startsWith('user/')) {
    console.log('Not a user branch, skipping validation.');
    process.exit(0);
  }

  // Extrait wallet + filename de la branche : user/<wallet>/<filename>
  const parts = branchName.split('/');
  if (parts.length < 3) {
    console.error('Invalid branch format. Expected user/<wallet>/<filename>');
    process.exit(1);
  }
  const walletPubkey = parts[1];
  const filename = parts.slice(2).join('/');

  console.log(`Validating: ${filename} from wallet ${walletPubkey}`);

  // 1. Trouve l'event log correspondant dans .registry/events/
  const eventsDir = path.join('.registry', 'events');
  if (!fs.existsSync(eventsDir)) {
    console.error('No .registry/events/ directory found');
    process.exit(1);
  }

  const eventFiles = fs.readdirSync(eventsDir).filter(f => f.endsWith('.json'));
  let event = null;
  for (const ef of eventFiles) {
    const e = JSON.parse(fs.readFileSync(path.join(eventsDir, ef), 'utf8'));
    if (e.filename === filename && e.wallet === walletPubkey) {
      event = e;
      break;
    }
  }

  if (!event) {
    console.error(`No event log found for ${filename} from ${walletPubkey}`);
    process.exit(1);
  }

  // 2. Vérifie que le fichier source existe
  const srcPath = path.join('src', filename);
  if (!fs.existsSync(srcPath)) {
    console.error(`Source file not found: ${srcPath}`);
    process.exit(1);
  }
  const sourceCode = fs.readFileSync(srcPath, 'utf8');

  // 3. Vérifie le hash du contenu
  const crypto = require('crypto');
  const actualHash = crypto.createHash('sha256').update(sourceCode).digest('hex');
  if (actualHash !== event.content_hash) {
    console.error(`Hash mismatch! Expected ${event.content_hash}, got ${actualHash}`);
    process.exit(1);
  }
  console.log('✓ Hash verified');

  // 4. Vérifie la signature Solana
  const message = JSON.stringify({
    action: event.action,
    filename: event.filename,
    content_hash: event.content_hash,
    nonce: event.nonce,
    timestamp: event.timestamp
  });
  const sigValid = verifySignature(message, event.signature, walletPubkey);
  if (!sigValid) {
    console.error('✗ Invalid Solana signature');
    process.exit(1);
  }
  console.log('✓ Signature verified');

  // 5. Vérifie le score on-chain (YRM claimable)
  const scoreCheck = await checkScoreEligibility(walletPubkey);
  if (!scoreCheck.eligible) {
    console.error(`✗ Score not eligible: ${scoreCheck.reason}`);
    console.error(`  curRatio=${scoreCheck.curRatio}, lastRatio=${scoreCheck.lastRatio}`);
    process.exit(1);
  }
  console.log(`✓ Score eligible (claimable=${scoreCheck.score.toFixed(4)} YRM)`);

  // 6. Vérifie l'unicité dans files.json
  const filesJsonPath = path.join('src', 'files.json');
  const filesJson = fs.existsSync(filesJsonPath)
    ? JSON.parse(fs.readFileSync(filesJsonPath, 'utf8'))
    : [];
  if (filesJson.some(f => f.filename === filename)) {
    console.error(`✗ Filename "${filename}" already exists in files.json`);
    process.exit(1);
  }
  console.log('✓ Filename unique');

  // Sauvegarde les infos pour merge.js
  const validationResult = {
    filename,
    walletPubkey,
    score: scoreCheck.score,
    laps: scoreCheck.curRatio,
    timestamp: event.timestamp,
    nonce: event.nonce
  };
  fs.writeFileSync('/tmp/validation_result.json', JSON.stringify(validationResult, null, 2));
  console.log('✓ Validation passed');
}

main().catch(e => {
  console.error('Validation error:', e.message);
  process.exit(1);
});
