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

// ── EXTRACT SPHERE METADATA ───────────────────────────────────────────────────
function extractSphereField(code, field) {
  const defMatch = code.match(/window\.YM_S\s*\[.*?\]\s*=\s*\{([\s\S]{0,1200})/);
  const searchIn = defMatch ? defMatch[1] : code.slice(0, 3000);
  const r1 = new RegExp("['\"]?" + field + "['\"]?\\s*:\\s*'([^'\\n\\$\\{\\}]{1,120})'");
  const r2 = new RegExp('[\'"?]' + field + '[\'"]?\\s*:\\s*"([^"\\n\\x24\\x7B\\x7D]{1,120})"');
  const m1 = searchIn.match(r1); if (m1) return m1[1].trim();
  const m2 = searchIn.match(r2); if (m2) return m2[1].trim();
  return null;
}

async function extractSphereMetadata(filename, codeUrl, forkOwner) {
  try {
    const url = codeUrl || ('https://raw.githubusercontent.com/' + forkOwner + '/' + BASE_REPO.split('/')[1] + '/main/' + filename);
    const r = await fetch(url + '?t=' + Date.now(), {
      headers: { 'Authorization': 'token ' + GITHUB_TOKEN }
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const code = await r.text();
    const name     = extractSphereField(code, 'name')     || filename.replace('.sphere.js', '');
    const icon     = extractSphereField(code, 'icon')     || '⬡';
    const category = extractSphereField(code, 'category') || 'Other';
    const description = extractSphereField(code, 'description') || '';
    const cardGif        = extractSphereField(code, 'cardGif')        || null;
    const cardBackground = extractSphereField(code, 'cardBackground') || null;
    const desktopGif     = extractSphereField(code, 'desktopGif')     || null;
    const fullscreen     = extractSphereField(code, 'fullscreen')     || false;
    console.log('Metadata extracted from', filename, '—', name, icon, category);
    const meta = { name, icon, category, description };
    if(cardGif)        meta.cardGif = cardGif;
    if(cardBackground) meta.cardBackground = cardBackground;
    if(desktopGif)     meta.desktopGif = desktopGif;
    if(fullscreen)     meta.fullscreen = true;
    return meta;
  } catch(e) {
    console.warn('Could not extract metadata from', filename, ':', e.message);
    return {
      name: filename.replace('.sphere.js', ''),
      icon: '⬡',
      category: 'Other',
      description: ''
    };
  }
}

// ── SPHÈRES ───────────────────────────────────────────────────────────────────
async function updateSpheresJson(files, ghActor, forkOwner) {
  let filesJson = [];
  try { filesJson = safeParseJson(fs.readFileSync('files.json', 'utf8')); } catch(e) {}

  for (const { filename, isUpdate, codeUrl, wallet, score, laps, timestamp, wip, transferTo } of files.filter(f => f.filename && f.filename.endsWith('.sphere.js'))) {
    const effectiveCodeUrl = codeUrl || ('https://raw.githubusercontent.com/' + forkOwner + '/' + BASE_REPO.split('/')[1] + '/main/' + filename);

    // Extract name, icon, category, description from sphere code
    const meta = await extractSphereMetadata(filename, effectiveCodeUrl, forkOwner);

    const idx = filesJson.findIndex(f => f.filename === filename);
    const entry = {
      filename,
      name:        meta.name,
      icon:        meta.icon,
      category:    meta.category,
      description: meta.description,
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
    if(meta.cardGif)        entry.cardGif = meta.cardGif;
    if(meta.cardBackground) entry.cardBackground = meta.cardBackground;
    if(meta.desktopGif)     entry.desktopGif = meta.desktopGif;
    if(meta.fullscreen)     entry.fullscreen = true;
    if (transferTo) entry.owner = transferTo;
    else if (idx >= 0 && filesJson[idx].owner) entry.owner = filesJson[idx].owner;

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

  for (const { filename, codeUrl, icon, description, wip, score, laps, timestamp, transferTo } of files.filter(f => f.filename && f.filename.endsWith('.theme.html'))) {
    const forkRepo   = BASE_REPO.split('/')[1];
    const effectiveCU = codeUrl || ('https://raw.githubusercontent.com/' + forkOwner + '/' + forkRepo + '/main/' + filename);

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
    if (transferTo) entry.owner = transferTo;
    else if (idx >= 0 && themesJson[idx]?.owner) entry.owner = themesJson[idx].owner;
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

// ── PROFILE SPHERES (.profile.js) ────────────────────────────────────────────
async function updateProfileSpheres(files, ghActor, forkOwner, walletPubkey) {
  const profileFiles = files.filter(f => f.filename && f.filename.endsWith('.profile.js'));
  if (!profileFiles.length) return;

  for (const { filename, codeUrl, wallet, score, laps, timestamp } of profileFiles) {
    // Validate — same rules as spheres
    if (!wallet || !score) {
      console.warn('Profile sphere rejected — missing wallet or score:', filename);
      continue;
    }
    const forkRepo = BASE_REPO.split('/')[1];
    const effectiveUrl = codeUrl || ('https://raw.githubusercontent.com/' + forkOwner + '/' + forkRepo + '/main/' + filename);

    // Fetch and copy .profile.js to main repo
    const r = await fetch(effectiveUrl + '?t=' + Date.now(), {
      headers: { 'Authorization': 'token ' + GITHUB_TOKEN }
    });
    if (!r.ok) { console.warn('Could not fetch', filename); continue; }
    const code = await r.text();
    fs.writeFileSync(filename, code);
    console.log('Profile sphere merged:', filename, '— wallet:', wallet, 'score:', score);
  }
}

// ── NAME REGISTRY (name.json) ─────────────────────────────────────────────────
async function updateNameRegistry(files, ghActor, walletPubkey) {
  const nameFiles = files.filter(f => f.filename === 'name.json');
  if (!nameFiles.length) return;

  for (const { wallet, score, laps, timestamp, nonce, nameEntry } of nameFiles) {
    if (!wallet || !score) {
      console.warn('name.json update rejected — missing wallet or score');
      continue;
    }
    if (!nameEntry || !nameEntry.name || !nameEntry.uuid) {
      console.warn('name.json update rejected — missing name or uuid in nameEntry');
      continue;
    }

    // Load existing name.json — array format
    let nameJson = [];
    try {
      const raw = JSON.parse(fs.readFileSync('name.json', 'utf8'));
      // Migrate old {name:uuid} format to array
      if (!Array.isArray(raw)) {
        nameJson = Object.entries(raw).map(([n, u]) => ({ name: n, uuid: u, pubkey: '', score: 0, laps: 0, timestamp: 0, nonce: '' }));
      } else {
        nameJson = raw;
      }
    } catch(e) {}

    const { name, uuid } = nameEntry;

    // Rules: unique name, one name per uuid
    const existingName = nameJson.find(e => e.name === name && e.uuid !== uuid);
    if (existingName) {
      console.warn('name.json update rejected — name already taken:', name);
      continue;
    }
    // Remove old entry for this uuid (name change)
    nameJson = nameJson.filter(e => e.uuid !== uuid);

    nameJson.push({
      name, uuid,
      pubkey:    wallet,
      score:     parseFloat(score.toFixed(6)),
      laps:      parseFloat((laps || 0).toFixed(6)),
      timestamp: timestamp || Math.floor(Date.now() / 1000),
      nonce:     nonce || ''
    });

    // Sort by score descending
    nameJson.sort((a, b) => (b.score || 0) - (a.score || 0));

    fs.writeFileSync('name.json', JSON.stringify(nameJson, null, 2));
    console.log('Name registry updated:', name, '->', uuid, '— score:', score);
  }
}

// ── PROFILE REGISTRY (profile.json) ──────────────────────────────────────────
async function updateProfileRegistry(files, ghActor, walletPubkey) {
  const profileJsonFiles = files.filter(f => f.filename === 'profile.json');
  if (!profileJsonFiles.length) return;

  for (const { filename, wallet, score, laps, timestamp, profileEntry } of profileJsonFiles) {
    if (!wallet || !score) {
      console.warn('profile.json update rejected — missing wallet or score');
      continue;
    }
    if (!profileEntry || !profileEntry.uuid) {
      console.warn('profile.json update rejected — missing profileEntry or uuid');
      continue;
    }

    // Load existing profile.json
    let profileJson = [];
    try { profileJson = JSON.parse(fs.readFileSync('profile.json', 'utf8')); } catch(e) {}

    // Replace or add entry — one entry per uuid
    const idx = profileJson.findIndex(p => p.uuid === profileEntry.uuid);
    const entry = {
      ...profileEntry,
      pubkey: wallet,
      score: parseFloat((score || 0).toFixed(6)),
      laps: parseFloat((laps || 0).toFixed(6)),
      ts: timestamp || Math.floor(Date.now() / 1000)
    };
    if (idx >= 0) profileJson[idx] = entry;
    else profileJson.push(entry);

    // Sort by score descending
    profileJson.sort((a, b) => (b.score || 0) - (a.score || 0));

    fs.writeFileSync('profile.json', JSON.stringify(profileJson, null, 2));
    console.log('Profile registry updated:', profileEntry.name, '— wallet:', wallet, 'score:', score);
  }
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  const validationPath = '/tmp/validation_result.json';
  if (!fs.existsSync(validationPath)) { console.error('No validation result found.'); process.exit(1); }

  const { walletPubkey, ghActor, files } = JSON.parse(fs.readFileSync(validationPath, 'utf8'));
  if (!files || !files.length) { console.log('No files to merge.'); process.exit(0); }

  console.log('Merging ' + files.length + ' file(s) from @' + ghActor);

  const prInfo = await ghAPI('/repos/' + BASE_REPO + '/pulls/' + PR_NUMBER);
  const forkOwner = prInfo.head && prInfo.head.repo && prInfo.head.repo.owner ? prInfo.head.repo.owner.login : ghActor;
  const forkRepo  = prInfo.head && prInfo.head.repo ? prInfo.head.repo.full_name : ghActor + '/' + BASE_REPO.split('/')[1];

  run('git config user.name "YourMine Bot"');
  run('git config user.email "bot@yourmine.xyz"');
  run('git checkout main');
  run('git pull origin main');

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

  // Score update — updates score across all registries for this wallet
  const scoreUpdateFile = files.find(f => f.action === 'score_update');
  if (scoreUpdateFile) {
    const { wallet, score, laps } = scoreUpdateFile;
    const registries = ['files.json', 'themes-files.json', 'name.json', 'profile.json'];
    for (const reg of registries) {
      if (!fs.existsSync(reg)) continue;
      try {
        let data = JSON.parse(fs.readFileSync(reg, 'utf8'));
        if (!Array.isArray(data)) {
          // Migrate name.json old format
          if (reg === 'name.json') {
            data = Object.entries(data).map(([n, u]) => ({ name: n, uuid: u, pubkey: '', score: 0, laps: 0 }));
          } else continue;
        }
        let updated = false;
        data = data.map(entry => {
          if (entry.author === wallet || entry.pubkey === wallet) {
            updated = true;
            return { ...entry, score: parseFloat(score.toFixed(6)), laps: parseFloat(laps.toFixed(6)) };
          }
          return entry;
        });
        if (updated) {
          fs.writeFileSync(reg, JSON.stringify(data, null, 2));
          console.log('Score updated in ' + reg + ' for wallet ' + wallet.slice(0, 8) + '…');
        }
      } catch(e) { console.warn('Could not update ' + reg + ':', e.message); }
    }
    run('git add files.json themes-files.json name.json profile.json');
    run('git commit -m "bot: score_update @' + ghActor + '"');
    run('git push origin main');
    return;
  }

  await updateSpheresJson(files, ghActor, forkOwner);
  await updateThemesJson(files, ghActor, forkOwner);
  await updateProfileSpheres(files, ghActor, forkOwner, walletPubkey);
  await updateNameRegistry(files, ghActor, walletPubkey);
  await updateProfileRegistry(files, ghActor, walletPubkey);

  const changedFiles = ['files.json', 'themes-files.json', 'events/'];
  if(files.some(f=>f.filename&&f.filename.endsWith('.profile.js'))) changedFiles.push('*.profile.js');
  if(files.some(f=>f.filename==='name.json')) changedFiles.push('name.json');
  if(files.some(f=>f.filename==='profile.json')) changedFiles.push('profile.json');

  run('git add ' + changedFiles.join(' '));
  run('git commit -m "bot: merge @' + ghActor + ' — registries updated"');
  run('git push https://x-access-token:' + GITHUB_TOKEN + '@github.com/' + BASE_REPO + '.git main');
  console.log('Pushed to main');

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

  try {
    await ghAPI('/repos/' + forkRepo + '/merge-upstream', 'POST', { branch: 'main' });
    console.log('Fork synced');
  } catch(e) { console.warn('Fork sync:', e.message); }

  console.log('\nDone — ' + files.length + ' file(s) merged.');
}

main().catch(e => { console.error('Merge error:', e.message); process.exit(1); });
