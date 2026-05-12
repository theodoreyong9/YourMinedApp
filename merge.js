// merge.js — Architecture loader unique : met à jour files.json et themes-files.json
const fs  = require('fs');
const { execSync } = require('child_process');
const { extractThemeMedia } = require('./merge_media_extractor');

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

// ── SPHÈRES ───────────────────────────────────────────────────────────────────
async function updateSpheresJson(files, ghActor, forkOwner) {
  let filesJson = [];
  try { filesJson = safeParseJson(fs.readFileSync('files.json', 'utf8')); } catch(e) {}

  for (const { filename, isUpdate, codeUrl, wallet, score, laps, timestamp, wip } of files.filter(f => f.filename && f.filename.endsWith('.sphere.js'))) {
    const effectiveCodeUrl = codeUrl || ('https://raw.githubusercontent.com/' + forkOwner + '/' + BASE_REPO.split('/')[1] + '/main/' + filename);
    const entry = {
      filename,
      author:         wallet || '',
      ghAuthor:       ghActor,
      last_committer: ghActor,
      codeUrl:        effectiveCodeUrl,
      wip:            !!wip,
      score:     parseFloat((score    || 0).toFixed(6)),
      laps:      parseFloat((laps     || 0).toFixed(6)),
      timestamp: timestamp || Math.floor(Date.now() / 1000),
      merged_at: Math.floor(Date.now() / 1000)
    };
    // Transfer ownership si demandé
    if (transferTo) entry.owner = transferTo;
    // Sinon préserve l'owner existant si déjà défini
    else if (idx >= 0 && filesJson[idx].owner) entry.owner = filesJson[idx].owner;
    const idx = filesJson.findIndex(f => f.filename === filename);
    if (idx >= 0) {
      filesJson[idx] = Object.assign({}, filesJson[idx], entry);
      console.log('Updated sphere', filename);
    } else {
      filesJson.push(entry);
      console.log('Added sphere', filename);
    }
  }

  fs.writeFileSync('files.json', JSON.stringify(filesJson, null, 2));
}

// ── THÈMES ────────────────────────────────────────────────────────────────────
async function updateThemesJson(files, ghActor, forkOwner) {
  let themesJson = [];
  try { themesJson = safeParseJson(fs.readFileSync('themes-files.json', 'utf8')); } catch(e) {}

  for (const { filename, codeUrl, icon, description, wip, score, laps, timestamp } of files.filter(f => f.filename && f.filename.endsWith('.theme.html'))) {
    const forkRepo   = BASE_REPO.split('/')[1];
    const effectiveCU = codeUrl || ('https://raw.githubusercontent.com/' + forkOwner + '/' + forkRepo + '/main/' + filename);

    // Extrait les médias depuis le code HTML du thème dans le fork
    let media = { photos: [], videos: [] };
    try {
      const themeResp = await fetch(effectiveCU + '?t=' + Date.now(), {
        headers: { 'Authorization': 'token ' + GITHUB_TOKEN, 'Accept': 'application/vnd.github.v3.raw' }
      });
      if (themeResp.ok) {
        const themeCode = await themeResp.text();
        media = extractThemeMedia(themeCode);
        console.log('Media extracted from', filename, '— photos:', media.photos.length, 'videos:', media.videos.length);
      }
    } catch(e) {
      console.warn('Could not extract media from', filename, ':', e.message);
    }

    const nameFromFile = filename.replace(/\.theme\.html$/, '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const entry = {
      filename,
      name:        nameFromFile,
      icon:        icon || '🎨',
      description: description || '',
      ghAuthor:    ghActor,
      codeUrl:     effectiveCU,
      wip:         !!wip,
      media,
      score:     parseFloat((score    || 0).toFixed(6)),
      laps:      parseFloat((laps     || 0).toFixed(6)),
      timestamp: timestamp || Math.floor(Date.now() / 1000),
      merged_at: Math.floor(Date.now() / 1000)
    };

    const idx = themesJson.findIndex(t => t.filename === filename);
    if (idx >= 0) {
      themesJson[idx] = Object.assign({}, themesJson[idx], entry);
      console.log('Updated theme', filename);
    } else {
      themesJson.push(entry);
      console.log('Added theme', filename);
    }
  }

  fs.writeFileSync('themes-files.json', JSON.stringify(themesJson, null, 2));
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  const validationPath = '/tmp/validation_result.json';
  if (!fs.existsSync(validationPath)) { console.error('No validation result found.'); process.exit(1); }

  const { walletPubkey, ghActor, files } = JSON.parse(fs.readFileSync(validationPath, 'utf8'));
  if (!files || !files.length) { console.log('No files to merge.'); process.exit(0); }

  console.log('Merging ' + files.length + ' file(s) from @' + ghActor);

  // Info PR pour récupérer le fork
  const prInfo = await ghAPI('/repos/' + BASE_REPO + '/pulls/' + PR_NUMBER);
  const forkOwner = prInfo.head && prInfo.head.repo && prInfo.head.repo.owner ? prInfo.head.repo.owner.login : ghActor;
  const forkRepo  = prInfo.head && prInfo.head.repo ? prInfo.head.repo.full_name : ghActor + '/' + BASE_REPO.split('/')[1];

  run('git config user.name "YourMine Bot"');
  run('git config user.email "bot@yourmine.xyz"');
  run('git checkout main');
  run('git pull origin main');

  // Copie les events
  const prEventsDir = PR_CONTENT_DIR + '/events';
  if (fs.existsSync(prEventsDir)) {
    if (!fs.existsSync('events')) fs.mkdirSync('events');
    const mainEvents = new Set(fs.readdirSync('events'));
    for (const evFile of fs.readdirSync(prEventsDir)) {
      if (!mainEvents.has(evFile)) {
        fs.copyFileSync(prEventsDir + '/' + evFile, 'events/' + evFile);
        console.log('Copied event', evFile);
      }
    }
  }

  // Met à jour files.json (sphères) et themes-files.json (thèmes)
  await updateSpheresJson(files, ghActor, forkOwner);
  await updateThemesJson(files, ghActor, forkOwner);

  // Commit et push
  run('git add files.json themes-files.json events/');
  run('git commit -m "bot: merge @' + ghActor + ' — files.json + themes-files.json updated"');
  run('git push https://x-access-token:' + GITHUB_TOKEN + '@github.com/' + BASE_REPO + '.git main');
  console.log('Pushed to main');

  // Ferme la PR avec commentaire
  try {
    const fileList = files.map(f =>
      '- `' + f.filename + '` (' + (f.isUpdate ? 'updated' : 'new') + ') → [code](' + (f.codeUrl || '') + ')'
    ).join('\n');
    await ghAPI('/repos/' + BASE_REPO + '/issues/' + PR_NUMBER + '/comments', 'POST', {
      body: '✅ Merged by YourMine Bot\n\n' + fileList + '\n\nCode hosted in your fork · registries updated.'
    });
    await ghAPI('/repos/' + BASE_REPO + '/pulls/' + PR_NUMBER, 'PATCH', { state: 'closed' });
    console.log('PR closed');
  } catch(e) { console.warn('Could not close PR:', e.message); }

  // Synchronise le fork
  try {
    await ghAPI('/repos/' + forkRepo + '/merge-upstream', 'POST', { branch: 'main' });
    console.log('Fork synced');
  } catch(e) { console.warn('Fork sync:', e.message); }

  console.log('\nDone — ' + files.length + ' file(s) merged.');
}

main().catch(e => { console.error('Merge error:', e.message); process.exit(1); });
