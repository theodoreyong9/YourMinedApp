// merge.js — Merge PR via API GitHub + update files.json
const fs = require('fs');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const BASE_REPO    = process.env.BASE_REPO; // theodoreyong9/YourMinedApp

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
  catch(e) {
    try { return JSON.parse(raw.replace(/,\s*([}\]])/g, '$1').trim()); }
    catch(e2) { return []; }
  }
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
  console.log(`Merging PR #${prNumber} from @${ghActor}`);

  // 1. Merge la PR via API GitHub
  await ghAPI('/repos/' + BASE_REPO + '/pulls/' + prNumber + '/merge', 'PUT', {
    commit_title: 'bot: merge [' + files.map(f => f.filename).join(', ') + '] from @' + ghActor,
    merge_method: 'squash'
  });
  console.log('✓ PR merged');

  // 2. Lit files.json actuel depuis main via API
  let filesJson = [];
  let currentSha;
  try {
    const current = await ghAPI('/repos/' + BASE_REPO + '/contents/files.json?ref=main');
    currentSha = current.sha;
    filesJson = safeParseJson(Buffer.from(current.content, 'base64').toString('utf8'));
    console.log(`files.json on main: ${filesJson.length} entry(ies)`);
  } catch(e) {
    console.warn('files.json not found on main, starting fresh');
    filesJson = [];
  }

  // 3. Met à jour les entrées
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

  // 4. Push files.json via API (pas de git, pas de conflit)
  const content = Buffer.from(JSON.stringify(filesJson, null, 2)).toString('base64');
  const body = {
    message: 'bot: update files.json for [' + files.map(f => f.filename).join(', ') + ']',
    content,
    branch: 'main'
  };
  if (currentSha) body.sha = currentSha;

  await ghAPI('/repos/' + BASE_REPO + '/contents/files.json', 'PUT', body);
  console.log('✓ files.json updated on main');

  console.log(`\n✓ Done — ${files.length} file(s) merged to main`);
}

main().catch(e => {
  console.error('Merge error:', e.message);
  process.exit(1);
});
