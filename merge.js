// merge.js — Push fichiers validés sur main + update files.json
const fs  = require('fs');
const { execSync } = require('child_process');

const GITHUB_TOKEN   = process.env.GITHUB_TOKEN;
const BASE_REPO      = process.env.BASE_REPO;
const PR_NUMBER      = process.env.PR_NUMBER;
const PR_CONTENT_DIR = process.env.PR_CONTENT_DIR || '_pr_content';

function run(cmd) {
  console.log(`$ ${cmd}`);
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] });
}
async function ghAPI(path, method, body) {
  const r = await fetch('https://api.github.com' + path, {
    method: method || 'GET',
    headers: {
      'Authorization': 'token ' + GITHUB_TOKEN,
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

  console.log(`Merging ${files.length} file(s) from @${ghActor} to main`);

  // Récupère le fork owner depuis la PR
  const prInfo = await ghAPI(`/repos/${BASE_REPO}/pulls/${PR_NUMBER}`);
  const forkOwner = prInfo.head && prInfo.head.repo && prInfo.head.repo.owner
    ? prInfo.head.repo.owner.login
    : ghActor;
  const forkRepo  = prInfo.head && prInfo.head.repo ? prInfo.head.repo.full_name : `${ghActor}/${BASE_REPO.split('/')[1]}`;
  console.log(`Fork: ${forkOwner}/${forkRepo}`);

  run('git config user.name "YourMine Bot"');
  run('git config user.email "bot@yourmine.xyz"');
  run('git checkout main');
  run('git pull origin main');

  for (const { filename } of files) {
    const src = `${PR_CONTENT_DIR}/${filename}`;
    if (!fs.existsSync(src)) { console.error(`File not found: ${src}`); process.exit(1); }
    fs.copyFileSync(src, filename);
    console.log(`✓ Copied ${filename}`);
  }

  // Copie les events (seulement ceux qui n'existent pas encore sur main)
  const prEventsDir = `${PR_CONTENT_DIR}/events`;
  if (fs.existsSync(prEventsDir)) {
    if (!fs.existsSync('events')) fs.mkdirSync('events');
    const mainEvents = new Set(fs.readdirSync('events'));
    for (const evFile of fs.readdirSync(prEventsDir)) {
      if (!mainEvents.has(evFile)) {
        fs.copyFileSync(`${prEventsDir}/${evFile}`, `events/${evFile}`);
        console.log(`✓ Copied event ${evFile}`);
      }
    }
  }

  // Met à jour files.json
  let filesJson = [];
  try { filesJson = safeParseJson(fs.readFileSync('files.json', 'utf8')); } catch(e) {}

  for (const { filename, isUpdate, score, laps, burnSlot, timestamp } of files) {
    // Build codeUrl so liste.js can load the code directly from the user's fork
    const baseName = filename.replace(/\.sphere\.js$/, '');
    const codeUrl = 'https://raw.githubusercontent.com/' + ghActor + '/' + BASE_REPO.split('/')[1] + '/main/' + baseName + '.sphere.code.js';
    const entry = {
      filename,
      author:         walletPubkey,
      ghAuthor:       ghActor,
      last_committer: ghActor,
      codeUrl,
      score:     parseFloat((score    || 0).toFixed(6)),
      laps:      parseFloat((laps     || 0).toFixed(6)),
      burnSlot:  burnSlot  || 0,
      timestamp: timestamp || Math.floor(Date.now() / 1000),
      merged_at: Math.floor(Date.now() / 1000)
    };

    const idx = filesJson.findIndex(f => f.filename === filename);
    if (idx >= 0) { filesJson[idx] = Object.assign({}, filesJson[idx], entry); console.log(`✓ Updated ${filename}`); }
    else          { filesJson.push(entry);                                      console.log(`✓ Added ${filename}`); }
  }

  fs.writeFileSync('files.json', JSON.stringify(filesJson, null, 2));

  run('git add .');
  run(`git commit -m "bot: merge @${ghActor}"`);
  run(`git push https://x-access-token:${GITHUB_TOKEN}@github.com/${BASE_REPO}.git main`);
  console.log('✓ Pushed to main');

  // FIX: ferme la PR avec un commentaire de succès, puis close
  // (on ne peut pas la marquer "merged" via API sans passer par le merge endpoint,
  //  mais on indique clairement le succès dans le commentaire)
  try {
    const fileList = files.map(f => `- \`${f.filename}\` (${f.isUpdate ? 'updated' : 'new'})`).join('\n');
    await ghAPI(`/repos/${BASE_REPO}/issues/${PR_NUMBER}/comments`, 'POST', {
      body: `✅ Merged by YourMine Bot\n\n${fileList}\n\nThe code has been pushed to main and files.json has been updated.`
    });
    await ghAPI(`/repos/${BASE_REPO}/pulls/${PR_NUMBER}`, 'PATCH', { state: 'closed' });
    console.log('✓ PR closed with success comment');
  } catch(e) { console.warn('Could not close PR:', e.message); }

  // FIX: synchronise la branche main du fork avec upstream pour les upgrades futurs
  // Sans ça, le fork diverge et les prochaines PRs peuvent inclure des diffs parasites
  try {
    await ghAPI(`/repos/${forkRepo}/merge-upstream`, 'POST', { branch: 'main' });
    console.log('✓ Fork synced with upstream');
  } catch(e) {
    // merge-upstream peut échouer si le fork est déjà à jour ou n'existe plus — non bloquant
    console.warn('Fork sync warning:', e.message);
  }

  console.log(`\n✓ Done — ${files.length} file(s) on main`);
}

main().catch(e => { console.error('Merge error:', e.message); process.exit(1); });
