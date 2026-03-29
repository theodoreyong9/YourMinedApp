// validate.js — Vérifie signature Solana + score YRM pour chaque fichier pushé
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { verifySignature, checkScoreEligibility } = require('./solana-utils');

async function main() {
  const branchName = process.env.BRANCH_NAME;
  if (!branchName || !branchName.startsWith('user/')) {
    console.log('Not a user branch, skipping validation.');
    process.exit(0);
  }

  // FIX: branche par wallet — user/<wallet>
  const parts = branchName.split('/');
  if (parts.length < 2) {
    console.error('Invalid branch format. Expected user/<wallet>');
    process.exit(1);
  }
  const walletPubkey = parts[1];
  console.log(`Branch: ${branchName} — Wallet: ${walletPubkey}`);

  // Lit files.json sur main
  const filesJsonPath = 'files.json';
  const filesJson = fs.existsSync(filesJsonPath)
    ? JSON.parse(fs.readFileSync(filesJsonPath, 'utf8'))
    : [];

  // Trouve tous les fichiers .sphere.js modifiés/ajoutés sur cette branche vs main
  let changedFiles = [];
  try {
    const output = execSync(
      `git diff --name-only origin/main...origin/${branchName}`,
      { encoding: 'utf8' }
    ).trim();
    changedFiles = output.split('\n').filter(f =>
      f.endsWith('.sphere.js') && !f.startsWith('events/')
    );
  } catch(e) {
    console.error('Could not diff branch vs main:', e.message);
    process.exit(1);
  }

  if (!changedFiles.length) {
    console.log('No sphere files changed, nothing to validate.');
    // Sauvegarde résultat vide pour merge.js
    fs.writeFileSync('/tmp/validation_result.json', JSON.stringify({
      walletPubkey, ghActor: process.env.GH_ACTOR || walletPubkey,
      files: [], allPassed: true
    }, null, 2));
    process.exit(0);
  }

  console.log(`Files to validate: ${changedFiles.join(', ')}`);

  // Score on-chain — calculé une seule fois pour le wallet
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

  const results = [];

  for (const filename of changedFiles) {
    console.log(`\n--- Validating: ${filename} ---`);

    const isUpdate = filesJson.some(f => f.filename === filename && f.author === walletPubkey);
    const isOtherOwner = filesJson.some(f => f.filename === filename && f.author !== walletPubkey);

    // Refuse si le fichier appartient à un autre wallet
    if (isOtherOwner) {
      console.error(`✗ ${filename} belongs to another wallet — skipping`);
      continue;
    }

    // Vérifie que le fichier existe sur la branche (checkout pour lire)
    let sourceCode = '';
    try {
      sourceCode = execSync(
        `git show origin/${branchName}:${filename}`,
        { encoding: 'utf8' }
      ).replace(/\r\n/g, '\n');
    } catch(e) {
      console.error(`✗ Cannot read ${filename} from branch: ${e.message}`);
      continue;
    }

    // Hash du contenu actuel
    const actualHash = crypto.createHash('sha256').update(sourceCode).digest('hex');

    // Trouve l'event log correspondant sur la branche
    let event = null;
    try {
      const eventsOutput = execSync(
        `git ls-tree --name-only origin/${branchName} events/`,
        { encoding: 'utf8' }
      ).trim().split('\n').filter(Boolean);

      for (const evPath of eventsOutput) {
        try {
          const evContent = execSync(
            `git show origin/${branchName}:${evPath}`,
            { encoding: 'utf8' }
          );
          const e = JSON.parse(evContent);
          if (e.filename === filename && e.wallet === walletPubkey) {
            event = e;
            break;
          }
        } catch(e2) { continue; }
      }
    } catch(e) { /* pas de dossier events encore */ }

    if (!event) {
      console.error(`✗ No event log found for ${filename}`);
      continue;
    }

    // Hash — strict pour nouvelle pub, ignoré pour update
    if (!isUpdate && actualHash !== event.content_hash) {
      console.error(`✗ Hash mismatch for ${filename}: expected ${event.content_hash}, got ${actualHash}`);
      continue;
    }
    console.log(`✓ Hash OK`);

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
    const sigValid = verifySignature(message, event.signature, walletPubkey);
    if (!sigValid) {
      console.error(`✗ Invalid signature for ${filename}`);
      continue;
    }
    console.log(`✓ Signature OK`);

    // Unicité — seulement pour nouvelle pub
    if (!isUpdate && filesJson.some(f => f.filename === filename)) {
      console.error(`✗ ${filename} already exists in files.json`);
      continue;
    }

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
    files:     results,
    allPassed: true
  }, null, 2));

  console.log(`\n✓ Validation passed for ${results.length} file(s)`);
}

main().catch(e => {
  console.error('Validation error:', e.message);
  process.exit(1);
});
