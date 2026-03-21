// merge.js — Merge vers main + update files.json
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function run(cmd) {
  console.log(`$ ${cmd}`);
  return execSync(cmd, { stdio: 'inherit' });
}

async function main() {
  const branchName = process.env.BRANCH_NAME;
  if (!branchName || !branchName.startsWith('user/')) {
    console.log('Not a user branch, skipping merge.');
    process.exit(0);
  }

  // Lit le résultat de validation
  const validationPath = '/tmp/validation_result.json';
  if (!fs.existsSync(validationPath)) {
    console.error('No validation result found. Run validate.js first.');
    process.exit(1);
  }
  const validation = JSON.parse(fs.readFileSync(validationPath, 'utf8'));
  const { filename, walletPubkey, score, laps, timestamp } = validation;

  console.log(`Merging ${filename} from ${branchName} to main`);

  // 1. Checkout main
  run('git checkout main');
  run(`git merge --no-ff origin/${branchName} -m "feat: merge ${filename} from ${walletPubkey}"`);

  // 2. Update files.json
  const filesJsonPath = path.join('src', 'files.json');
  const filesJson = fs.existsSync(filesJsonPath)
    ? JSON.parse(fs.readFileSync(filesJsonPath, 'utf8'))
    : [];

  const existingIdx = filesJson.findIndex(f => f.filename === filename);
  const entry = {
    filename,
    branch: branchName,
    author: walletPubkey,
    last_committer: walletPubkey,
    score: parseFloat(score.toFixed(6)),
    laps: parseFloat(laps.toFixed(6)),
    timestamp,
    merged_at: Math.floor(Date.now() / 1000)
  };

  if (existingIdx >= 0) {
    // Mise à jour last_committer (collaboration)
    filesJson[existingIdx] = { ...filesJson[existingIdx], ...entry };
  } else {
    filesJson.push(entry);
  }

  fs.writeFileSync(filesJsonPath, JSON.stringify(filesJson, null, 2));
  console.log('✓ files.json updated');

  // 3. Commit + push
  run('git add src/files.json');
  run(`git commit -m "bot: update files.json for ${filename}"`);
  run('git push origin main');

  console.log(`✓ Merged ${filename} to main`);
}

main().catch(e => {
  console.error('Merge error:', e.message);
  process.exit(1);
});
