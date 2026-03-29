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
    console.log('Not a user branch, skipping.');
    process.exit(0);
  }

  const validationPath = '/tmp/validation_result.json';
  if (!fs.existsSync(validationPath)) {
    console.error('No validation result found.');
    process.exit(1);
  }

  const { walletPubkey, ghActor, score, laps, timestamp, files } = JSON.parse(
    fs.readFileSync(validationPath, 'utf8')
  );

  if (!files || !files.length) {
    console.log('No files to merge.');
    process.exit(0);
  }

  // 1. Passe sur main et se met à jour
  run('git checkout main');
  run('git pull origin main');

  // 2. Copie chaque fichier validé depuis la branche — pas de git merge
  for (const { filename } of files) {
    console.log(`Copying ${filename}…`);
    run(`git checkout origin/${branchName} -- "${filename}"`);
  }

  // 3. Copie les event logs nouveaux (pas encore sur main)
  const eventsOnMain = fs.existsSync('events')
    ? fs.readdirSync('events').map(f => `events/${f}`)
    : [];

  let eventsOnBranch = [];
  try {
    eventsOnBranch = execSync(
      `git ls-tree --name-only "origin/${branchName}" events/`,
      { encoding: 'utf8' }
    ).trim().split('\n').filter(Boolean);
  } catch(e) { /* pas de events/ sur la branche */ }

  for (const evFile of eventsOnBranch) {
    if (!eventsOnMain.includes(evFile)) {
      run(`git checkout origin/${branchName} -- "${evFile}"`);
    }
  }

  // 4. Lit files.json depuis main (déjà à jour sur le disque)
  const filesJsonPath = 'files.json';
  const filesJson = fs.existsSync(filesJsonPath)
    ? JSON.parse(fs.readFileSync(filesJsonPath, 'utf8'))
    : [];

  for (const { filename, isUpdate } of files) {
    const entry = {
      filename,
      branch:         branchName,
      author:         walletPubkey,
      last_committer: ghActor || walletPubkey,  // username GitHub, pas adresse wallet
      score:          parseFloat(score.toFixed(6)),
      laps:           parseInt(laps, 10),
      timestamp,
      merged_at:      Math.floor(Date.now() / 1000)
    };

    const idx = filesJson.findIndex(f => f.filename === filename);
    if (idx >= 0) {
      filesJson[idx] = { ...filesJson[idx], ...entry };
      console.log(`✓ Updated ${filename}`);
    } else {
      filesJson.push(entry);
      console.log(`✓ Added ${filename}`);
    }
  }

  fs.writeFileSync(filesJsonPath, JSON.stringify(filesJson, null, 2));

  // 5. Commit + push
  run('git add .');
  const fileList = files.map(f => f.filename).join(', ');
  run(`git commit -m "bot: merge [${fileList}] from ${ghActor || walletPubkey}"`);
  run('git push origin main');

  console.log(`\n✓ Done — ${files.length} file(s) on main`);
}

main().catch(e => {
  console.error('Merge error:', e.message);
  process.exit(1);
});
