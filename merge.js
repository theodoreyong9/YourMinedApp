// merge.js — Copie les fichiers de la branche vers main + update files.json
// FIX: utilise git checkout <branch> -- <file> au lieu de git merge
// pour éviter les conflits sur files.json lors des updates
const fs   = require('fs');
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

  const validationPath = '/tmp/validation_result.json';
  if (!fs.existsSync(validationPath)) {
    console.error('No validation result found. Run validate.js first.');
    process.exit(1);
  }
  const { filename, walletPubkey, isUpdate, score, laps, timestamp } = JSON.parse(
    fs.readFileSync(validationPath, 'utf8')
  );

  console.log(`${isUpdate ? 'Updating' : 'Merging'} ${filename} from ${branchName} to main`);

  // 1. Checkout main
  run('git checkout main');
  run('git pull origin main');

  // FIX: copie uniquement les fichiers nécessaires depuis la branche
  // Évite tout conflit — pas de merge, pas de rebase
  run(`git checkout origin/${branchName} -- ${filename}`);

  // Copie aussi les nouveaux event logs de la branche (pas déjà sur main)
  try {
    const eventsOnBranch = execSync(
      `git ls-tree --name-only origin/${branchName} events/`, { encoding: 'utf8' }
    ).trim().split('\n').filter(Boolean);

    const eventsOnMain = fs.existsSync('events')
      ? fs.readdirSync('events').map(f => `events/${f}`)
      : [];

    for (const evFile of eventsOnBranch) {
      if (!eventsOnMain.includes(evFile)) {
        run(`git checkout origin/${branchName} -- ${evFile}`);
      }
    }
  } catch(e) {
    console.log('No events/ dir on branch or already up to date');
  }

  // 2. Update files.json sur main (lu depuis le disque = version main à jour)
  const filesJsonPath = 'files.json';
  const filesJson = fs.existsSync(filesJsonPath)
    ? JSON.parse(fs.readFileSync(filesJsonPath, 'utf8'))
    : [];

  const existingIdx = filesJson.findIndex(f => f.filename === filename);
  const entry = {
    filename,
    branch:         branchName,
    author:         walletPubkey,
    last_committer: walletPubkey,
    score:          parseFloat(score.toFixed(6)),
    laps:           parseInt(laps, 10),
    timestamp,
    merged_at:      Math.floor(Date.now() / 1000)
  };

  if (existingIdx >= 0) {
    filesJson[existingIdx] = { ...filesJson[existingIdx], ...entry };
  } else {
    filesJson.push(entry);
  }

  fs.writeFileSync(filesJsonPath, JSON.stringify(filesJson, null, 2));
  console.log('✓ files.json updated');

  // 3. Commit + push
  run('git add .');
  run(`git commit -m "bot: ${isUpdate ? 'update' : 'add'} ${filename} from ${walletPubkey}"`);
  run('git push origin main');

  console.log(`✓ ${isUpdate ? 'Updated' : 'Merged'} ${filename} to main`);
}

main().catch(e => {
  console.error('Merge error:', e.message);
  process.exit(1);
});
