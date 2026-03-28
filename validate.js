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

  // Extrait wallet + filename : user/<wallet>/<filename>
  const parts = branchName.split('/');
  if (parts.length < 3) {
    console.error('Invalid branch format. Expected user/<wallet>/<filename>');
    process.exit(1);
  }
  const walletPubkey = parts[1];
  const filename     = parts.slice(2).join('/');
  console.log(`Validating: ${filename} from wallet ${walletPubkey}`);

  // 1. Trouve l'event log dans events/ (racine)
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

  // 2. Vérifie que le fichier source existe (racine)
  const srcPath = filename;
  if (!fs.existsSync(srcPath)) {
    console.error(`Source file not found: ${srcPath}`);
    process.exit(1);
  }
  const sourceCode = fs.readFileSync(srcPath, 'utf8');

  // 3. Lit files.json pour savoir si c'est une nouvelle pub ou un update
  const filesJsonPath = 'files.json';
  const filesJson = fs.existsSync(filesJsonPath)
    ? JSON.parse(fs.readFileSync(filesJsonPath, 'utf8'))
    : [];

  const isUpdate = filesJson.some(f => f.filename === filename && f.author === walletPubkey);
  console.log(isUpdate ? '→ Update detected (same wallet, same file)' : '→ New publication');

  // 4. Vérifie le hash du contenu
  // Strict pour une nouvelle pub (le code ne doit pas avoir changé depuis la signature)
  // Ignoré pour un update (le wallet met à jour son propre fichier)
  const actualHash = crypto.createHash('sha256').update(sourceCode).digest('hex');
  if (!isUpdate && actualHash !== event.content_hash) {
    console.error(`Hash mismatch! Expected ${event.content_hash}, got ${actualHash}`);
    process.exit(1);
  }
  console.log('✓ Hash verified');

  // 5. Vérifie la signature Solana
  // IMPORTANT : toujours vérifier sur les données ORIGINALES de l'event log
  // (event.content_hash = hash au moment de la signature, pas le hash actuel)
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

  // 6. Vérifie le score on-chain
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
  console.log(`✓ Score eligible (claimable=${scoreCheck.score.toFixed(4)} YRM, curRatio=${scoreCheck.curRatio.toFixed(6)})`);

  // 7. Vérifie l'unicité seulement pour une nouvelle pub
  if (!isUpdate && filesJson.some(f => f.filename === filename)) {
    console.error(`✗ Filename "${filename}" already exists in files.json`);
    process.exit(1);
  }
  console.log('✓ Filename unique (or authorized update)');

  // Sauvegarde pour merge.js
  const validationResult = {
    filename,
    walletPubkey,
    isUpdate,
    score:     scoreCheck.score,
    laps:      scoreCheck.currentLaps,
    timestamp: event.timestamp,
    nonce:     event.nonce
  };
  fs.writeFileSync('/tmp/validation_result.json', JSON.stringify(validationResult, null, 2));
  console.log('✓ Validation passed');
}

main().catch(e => {
  console.error('Validation error:', e.message);
  process.exit(1);
});
