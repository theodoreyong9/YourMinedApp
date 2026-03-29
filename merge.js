// merge.js — Copie les fichiers validés vers main + update files.json
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
    console.error('No validation result found.');
    process.exit(1);
  }

  const validation = JSON.parse(fs.readFileSync(validationPath, 'utf8'));
  const { walletPubkey, ghActor, score, laps, timestamp, files } = validation;

  if (!files || !files.length) {
    console.log('No files to merge.');
    process.exit(0);
  }

  // 1. Checkout main à jour
  run('git checkout main');
  run('git pull origin main');

  // 2. Copie chaque fichier validé depuis la branche (pas de git merge)
  for (const { filename } of files) {
    console.log(`Copying ${filename} from ${branchName}…`);
    run(`git checkout origin/${branchName} -- ${filename}`);
  }

  // 3. Copie les nouveaux event logs (ceux pas encore sur main)
  try {
    const eventsOnBranch = execSync(
      `git ls-tree --name-only origin/${branchName} events/`,
      { encoding: 'utf8' }
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
    console.log('No events/ on branch or already up to date');
  }

  // 4. Update files.json
  const filesJsonPath = 'files.json';
  const filesJson = fs.existsSync(filesJsonPath)
    ? JSON.parse(fs.readFileSync(filesJsonPath, 'utf8'))
    : [];

  for (const { filename, isUpdate } of files) {
    const existingIdx = filesJson.findIndex(f => f.filename === filename);
    const entry = {
      filename,
      branch:    branchName,
      author:    walletPubkey,
      // FIX: github username du dernier commit, pas l'adresse wallet
      last_committer: ghActor || walletPubkey,
      score:     parseFloat(score.toFixed(6)),
      laps:      parseInt(laps, 10),
      timestamp,
      merged_at: Math.floor(Date.now() / 1000)
    };

    if (existingIdx >= 0) {
      filesJson[existingIdx] = { ...filesJson[existingIdx], ...entry };
      console.log(`✓ Updated ${filename} in files.json`);
    } else {
      filesJson.push(entry);
      console.log(`✓ Added ${filename} to files.json`);
    }
  }

  fs.writeFileSync(filesJsonPath, JSON.stringify(filesJson, null, 2));

  // 5. Commit + push
  run('git add .');
  const fileList = files.map(f => f.filename).join(', ');
  run(`git commit -m "bot: merge [${fileList}] from ${ghActor || walletPubkey}"`);
  run('git push origin main');

  console.log(`✓ Done — ${files.length} file(s) merged to main`);
}

main().catch(e => {
  console.error('Merge error:', e.message);
  process.exit(1);
});
