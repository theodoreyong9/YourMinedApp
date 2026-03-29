// validate.js — Vérifie signature Solana + score YRM pour chaque fichier pushé
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { verifySignature, checkScoreEligibility } = require('./solana-utils');

function gitShow(ref, filePath) {
  return execSync(`git show "${ref}:${filePath}"`, { encoding: 'utf8' });
}

function gitLsTree(ref, dir) {
  try {
    return execSync(`git ls-tree --name-only "${ref}" "${dir}/"`, { encoding: 'utf8' })
      .trim().split('\n').filter(Boolean);
  } catch(e) { return []; }
}

async function main() {
  const branchName = process.env.BRANCH_NAME;
  if (!branchName || !branchName.startsWith('user/')) {
    console.log('Not a user branch, skipping.');
    process.exit(0);
  }

  const walletPubkey = branchName.split('/')[1];
  console.log(`Branch: ${branchName} — Wallet: ${walletPubkey}`);

  // Lit files.json depuis main
  const filesJsonPath = 'files.json';
  const filesJson = fs.existsSync(filesJsonPath)
    ? JSON.parse(fs.readFileSync(filesJsonPath, 'utf8'))
    : [];

  // ── Source de vérité : les event logs sur la branche ──────────────────────
  const eventPaths = gitLsTree(`origin/${branchName}`, 'events');
  console.log(`Found ${eventPaths.length} event log(s) on branch`);

  if (!eventPaths.length) {
    console.error('No event logs found on branch');
    process.exit(1);
  }

  // Parse tous les events du bon wallet
  const events = [];
  for (const evPath of eventPaths) {
    try {
      const content = gitShow(`origin/${branchName}`, evPath);
      const ev = JSON.parse(content);
      if (ev.wallet === walletPubkey && ev.filename) {
        events.push(ev);
      }
    } catch(e) { continue; }
  }

  // Garde un seul event par filename (le plus récent = timestamp le plus grand)
  const eventsByFile = {};
  for (const ev of events) {
    if (!eventsByFile[ev.filename] || ev.timestamp > eventsByFile[ev.filename].timestamp) {
      eventsByFile[ev.filename] = ev;
    }
  }

  const filesToValidate = Object.values(eventsByFile);
  console.log(`Files to validate: ${filesToValidate.map(e => e.filename).join(', ')}`);

  // ── Score on-chain — une seule fois pour le wallet ────────────────────────
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

  // ── Validation fichier par fichier ────────────────────────────────────────
  const results = [];

  for (const event of filesToValidate) {
    const { filename } = event;
    console.log(`\n--- ${filename} ---`);

    // Refuse si appartient à un autre wallet
    const otherOwner = filesJson.find(f => f.filename === filename && f.author !== walletPubkey);
    if (otherOwner) {
      console.error(`✗ ${filename} belongs to ${otherOwner.author} — refused`);
      continue;
    }

    const isUpdate = filesJson.some(f => f.filename === filename && f.author === walletPubkey);

    // Lit le fichier source depuis la branche
    let sourceCode;
    try {
      sourceCode = gitShow(`origin/${branchName}`, filename).replace(/\r\n/g, '\n');
    } catch(e) {
      console.error(`✗ Cannot read ${filename} from branch: ${e.message}`);
      continue;
    }

    // Hash — strict pour nouvelle pub, ignoré pour update
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
    files:     results,
    allPassed: true
  }, null, 2));

  console.log(`\n✓ Validation passed — ${results.length} file(s) ready to merge`);
}

main().catch(e => {
  console.error('Validation error:', e.message);
  process.exit(1);
});
