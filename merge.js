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

  // FIX: chaque fichier a ses propres score/laps/timestamp
  const { walletPubkey, ghActor, files } = JSON.parse(
    fs.readFileSync(validationPath, 'utf8')
  );

  if (!files || !files.length) {
    console.log('No files to merge.');
    process.exit(0);
  }

  console.log(`Merging ${files.length} file(s) from @${ghActor} to main`);

  run('git config user.name "YourMine Bot"');
  run('git config user.email "bot@yourmine.xyz"');
  run('git checkout main');
  run('git pull origin main');

  // Copie les fichiers validés
  for (const { filename } of files) {
    const src = `${PR_CONTENT_DIR}/${filename}`;
    if (!fs.existsSync(src)) { console.error(`File not found: ${src}`); process.exit(1); }
    fs.copyFileSync(src, filename);
    console.log(`✓ Copied ${filename}`);
  }

  // Copie les nouveaux event logs
  const prEventsDir = `${PR_CONTENT_DIR}/events`;
  if (fs.existsSync(prEventsDir)) {
    if (!fs.existsSync('events')) fs.mkdirSync('events');
    const mainEvents = fs.readdirSync('events');
    for (const evFile of fs.readdirSync(prEventsDir)) {
      if (!mainEvents.includes(evFile)) {
        fs.copyFileSync(`${prEventsDir}/${evFile}`, `events/${evFile}`);
        console.log(`✓ Copied event ${evFile}`);
      }
    }
  }

  // Update files.json — chaque fichier avec SES PROPRES données
  let filesJson = [];
  try { filesJson = safeParseJson(fs.readFileSync('files.json', 'utf8')); }
  catch(e) { filesJson = []; }

  for (const { filename, isUpdate, score, laps, timestamp } of files) {
    const entry = {
      filename,
      author:         walletPubkey,
      ghAuthor:       ghActor,
      last_committer: ghActor,
      // FIX: score/laps/timestamp propres à ce fichier (depuis son event log)
      score:          parseFloat((score || 0).toFixed(6)),
      laps:           parseFloat((laps  || 0).toFixed(6)),
      timestamp:      timestamp || Math.floor(Date.now() / 1000),
      merged_at:      Math.floor(Date.now() / 1000)
    };

    const idx = filesJson.findIndex(f => f.filename === filename);
    if (idx >= 0) {
      filesJson[idx] = { ...filesJson[idx], ...entry };
      console.log(`✓ Updated ${filename} (score=${entry.score}, laps=${entry.laps})`);
    } else {
      filesJson.push(entry);
      console.log(`✓ Added ${filename} (score=${entry.score}, laps=${entry.laps})`);
    }
  }

  fs.writeFileSync('files.json', JSON.stringify(filesJson, null, 2));

  run('git add .');
  run(`git commit -m "bot: merge @${ghActor}"`);
  run(`git push https://x-access-token:${GITHUB_TOKEN}@github.com/${BASE_REPO}.git main`);
  console.log('✓ Pushed to main');

  try {
    const fileList = files.map(f => `- \`${f.filename}\` (${f.isUpdate ? 'updated' : 'new'}, score=${(f.score||0).toFixed(4)})`).join('\n');
    await ghAPI(`/repos/${BASE_REPO}/issues/${PR_NUMBER}/comments`, 'POST', {
      body: `✅ Merged by YourMine Bot\n\n${fileList}`
    });
    await ghAPI(`/repos/${BASE_REPO}/pulls/${PR_NUMBER}`, 'PATCH', { state: 'closed' });
    console.log('✓ PR closed');
  } catch(e) {
    console.warn('Could not close PR:', e.message);
  }

  console.log(`\n✓ Done — ${files.length} file(s) on main`);
}

main().catch(e => {
  console.error('Merge error:', e.message);
  process.exit(1);
});
