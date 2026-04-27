// merge.js — Architecture loader unique : met à jour files.json avec codeUrl
const fs  = require('fs');
const { execSync } = require('child_process');

const GITHUB_TOKEN   = process.env.GITHUB_TOKEN;
const BASE_REPO      = process.env.BASE_REPO;
const PR_NUMBER      = process.env.PR_NUMBER;
const PR_CONTENT_DIR = process.env.PR_CONTENT_DIR || '_pr_content';

function run(cmd) {
  console.log('$ ' + cmd);
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] });
}
async function ghAPI(path, method, body) {
  const r = await fetch('https://api.github.com' + path, {
    method: method || 'GET',
    headers: { 'Authorization': 'token ' + GITHUB_TOKEN, 'Content-Type': 'application/json', 'Accept': 'application/vnd.github.v3+json' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || r.status); }
  return r.status === 204 ? null : r.json();
}
function safeParseJson(raw) {
  if (!raw || !raw.trim()) return [];
  try { return JSON.parse(raw); }
  catch(e) { try { return JSON.parse(raw.replace(/,\s*([}\]])/g, '$1').trim()); } catch(e2) { return []; } }
}

async function main() {
  const validationPath = '/tmp/validation_result.json';
  if (!fs.existsSync(validationPath)) { console.error('No validation result found.'); process.exit(1); }

  const { walletPubkey, ghActor, files } = JSON.parse(fs.readFileSync(validationPath, 'utf8'));
  if (!files || !files.length) { console.log('No files to merge.'); process.exit(0); }

  console.log('Merging ' + files.length + ' file(s) from @' + ghActor + ' to main');

  // Info PR pour récupérer le fork
  const prInfo = await ghAPI('/repos/' + BASE_REPO + '/pulls/' + PR_NUMBER);
  const forkOwner = prInfo.head && prInfo.head.repo && prInfo.head.repo.owner ? prInfo.head.repo.owner.login : ghActor;
  const forkRepo  = prInfo.head && prInfo.head.repo ? prInfo.head.repo.full_name : ghActor + '/' + BASE_REPO.split('/')[1];

  run('git config user.name "YourMine Bot"');
  run('git config user.email "bot@yourmine.xyz"');
  run('git checkout main');
  run('git pull origin main');

  // Architecture loader unique : on ne copie PAS de .sphere.js sur main
  // On copie uniquement les events
  const prEventsDir = PR_CONTENT_DIR + '/events';
  if (fs.existsSync(prEventsDir)) {
    if (!fs.existsSync('events')) fs.mkdirSync('events');
    const mainEvents = new Set(fs.readdirSync('events'));
    for (const evFile of fs.readdirSync(prEventsDir)) {
      if (!mainEvents.has(evFile)) {
        fs.copyFileSync(prEventsDir + '/' + evFile, 'events/' + evFile);
        console.log('Copied event ' + evFile);
      }
    }
  }

  // Met à jour files.json avec codeUrl pointant vers le fork de l'user
  let filesJson = [];
  try { filesJson = safeParseJson(fs.readFileSync('files.json', 'utf8')); } catch(e) {}

  for (const { filename, isUpdate, codeUrl, wallet, score, laps, timestamp } of files) {
    // codeUrl = lien direct vers le code dans le fork de l'user
    const effectiveCodeUrl = codeUrl || ('https://raw.githubusercontent.com/' + forkOwner + '/' + BASE_REPO.split('/')[1] + '/main/' + filename);

    const entry = {
      filename,
      author:         walletPubkey || wallet || '',
      ghAuthor:       ghActor,
      last_committer: ghActor,
      codeUrl:        effectiveCodeUrl,    // ← clé du loader unique
      score:     parseFloat((score    || 0).toFixed(6)),
      laps:      parseFloat((laps     || 0).toFixed(6)),
      timestamp: timestamp || Math.floor(Date.now() / 1000),
      merged_at: Math.floor(Date.now() / 1000)
    };

    const idx = filesJson.findIndex(f => f.filename === filename);
    if (idx >= 0) {
      // Upgrade : peut changer ghAuthor ou wallet si l'un des deux correspond
      filesJson[idx] = Object.assign({}, filesJson[idx], entry);
      console.log('Updated ' + filename + ' → codeUrl: ' + effectiveCodeUrl);
    } else {
      filesJson.push(entry);
      console.log('Added ' + filename + ' → codeUrl: ' + effectiveCodeUrl);
    }
  }

  fs.writeFileSync('files.json', JSON.stringify(filesJson, null, 2));

  run('git add files.json events/');
  run('git commit -m "bot: merge @' + ghActor + ' — files.json updated"');
  run('git push https://x-access-token:' + GITHUB_TOKEN + '@github.com/' + BASE_REPO + '.git main');
  console.log('Pushed to main');

  // Ferme la PR avec commentaire de succès
  try {
    const fileList = files.map(f => '- `' + f.filename + '` (' + (f.isUpdate ? 'updated' : 'new') + ') → [code](' + (f.codeUrl || '') + ')').join('\n');
    await ghAPI('/repos/' + BASE_REPO + '/issues/' + PR_NUMBER + '/comments', 'POST', {
      body: '✅ Merged by YourMine Bot\n\n' + fileList + '\n\nCode hosted in your fork · files.json updated with codeUrl.'
    });
    await ghAPI('/repos/' + BASE_REPO + '/pulls/' + PR_NUMBER, 'PATCH', { state: 'closed' });
    console.log('PR closed');
  } catch(e) { console.warn('Could not close PR:', e.message); }

  // Synchronise le fork avec upstream
  try {
    await ghAPI('/repos/' + forkRepo + '/merge-upstream', 'POST', { branch: 'main' });
    console.log('Fork synced');
  } catch(e) { console.warn('Fork sync:', e.message); }

  console.log('\nDone — ' + files.length + ' file(s), files.json updated.');
}

main().catch(e => { console.error('Merge error:', e.message); process.exit(1); });
