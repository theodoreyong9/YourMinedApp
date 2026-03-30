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
  if (!fs.existsSync(validationPath)) {// merge.js — Merge PR via API GitHub + update files.json
const fs   = require('fs');
const { execSync } = require('child_process');

function run(cmd) {
  console.log(`$ ${cmd}`);
  return execSync(cmd, { stdio: 'inherit' });
}

async function ghAPI(path, method, body) {
  const { default: fetch } = await import('node-fetch').catch(() => ({ default: globalThis.fetch }));
  const r = await fetch('https://api.github.com' + path, {
    method: method || 'GET',
    headers: {
      'Authorization': 'token ' + process.env.GITHUB_TOKEN,
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github.v3+json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.message || r.status);
  }
  return r.status === 204 ? null : r.json();
}

async function main() {
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

  const prNumber = process.env.PR_NUMBER;
  const baseRepo = process.env.BASE_REPO; // theodoreyong9/YourMinedApp

  console.log(`Merging PR #${prNumber} from @${ghActor}`);

  // 1. Merge la PR via API GitHub
  await ghAPI('/repos/' + baseRepo + '/pulls/' + prNumber + '/merge', 'PUT', {
    commit_title: 'bot: merge [' + files.map(f => f.filename).join(', ') + '] from @' + ghActor,
    merge_method: 'squash'
  });
  console.log('✓ PR merged');

  // 2. Pull main pour avoir le contenu à jour
  run('git fetch upstream main');
  run('git checkout upstream/main -- files.json || true');

  // 3. Update files.json
  const filesJsonPath = 'files.json';
  let filesJson = [];
  try {
    filesJson = JSON.parse(fs.readFileSync(filesJsonPath, 'utf8'));
  } catch(e) {
    filesJson = [];
  }

  for (const { filename, isUpdate } of files) {
    const entry = {
      filename,
      author:         walletPubkey,
      ghAuthor:       ghActor,
      last_committer: ghActor,
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

  // 4. Push files.json mis à jour via API (évite les conflits git)
  const content = Buffer.from(JSON.stringify(filesJson, null, 2)).toString('base64');

  // Récupère le SHA actuel de files.json sur main
  let sha;
  try {
    const current = await ghAPI('/repos/' + baseRepo + '/contents/files.json?ref=main');
    sha = current.sha;
  } catch(e) { /* fichier absent */ }

  const body = {
    message: 'bot: update files.json for [' + files.map(f => f.filename).join(', ') + ']',
    content,
    branch: 'main'
  };
  if (sha) body.sha = sha;

  await ghAPI('/repos/' + baseRepo + '/contents/files.json', 'PUT', body);
  console.log('✓ files.json updated on main');

  console.log(`\n✓ Done — ${files.length} file(s) merged to main`);
}

main().catch(e => {
  console.error('Merge error:', e.message);
  process.exit(1);
});
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
