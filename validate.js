// validate.js — Architecture loader unique : le code reste dans le fork, PR = files.json + event
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const https  = require('https');
const { verifySignature, checkScoreEligibility } = require('./solana-utils');

const MAX_EVENT_AGE_SEC = 3600;
const MIN_TS_GAP_SEC    = 300;

// Allowed file types
const ALLOWED_SPHERE    = f => f.endsWith('.sphere.js');
const ALLOWED_PROFILE   = f => f.endsWith('.profile.js');
const ALLOWED_REGISTRY  = f => f === 'name.json' || f === 'profile.json';
const ALLOWED_FILE      = f => ALLOWED_SPHERE(f) || ALLOWED_PROFILE(f) || ALLOWED_REGISTRY(f);

function safeParseJson(raw) {
  if (!raw || !raw.trim()) return [];
  try { return JSON.parse(raw); }
  catch(e) { try { return JSON.parse(raw.replace(/,\s*([}\]])/g, '$1').trim()); } catch(e2) { return []; } }
}

function fetchCodeFromFork(codeUrl) {
  return new Promise((resolve, reject) => {
    const req = https.get(codeUrl, (res) => {
      if (res.statusCode !== 200) { reject(new Error('HTTP ' + res.statusCode + ' fetching code from fork: ' + codeUrl)); return; }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.abort(); reject(new Error('Timeout fetching code from fork')); });
  });
}

async function main() {
  const ghActor      = process.env.GH_ACTOR;
  const prContentDir = process.env.PR_CONTENT_DIR || '_pr_content';
  console.log('PR from @' + ghActor);

  let filesJsonMain = [];
  try {
    filesJsonMain = safeParseJson(fs.readFileSync('files.json', 'utf8'));
    console.log('files.json on main: ' + filesJsonMain.length + ' entry(ies)');
  } catch(e) { console.warn('files.json not found, using []'); }

  // Lit les events dans la PR
  const eventsDir = path.join(prContentDir, 'events');
  if (!fs.existsSync(eventsDir)) { console.error('No events/ directory in PR'); process.exit(1); }

  const now = Math.floor(Date.now() / 1000);

  const allEvents = fs.readdirSync(eventsDir)
    .filter(f => f.endsWith('.json'))
    .map(f => { try { return JSON.parse(fs.readFileSync(path.join(eventsDir, f), 'utf8')); } catch(e) { return null; } })
    .filter(e => e && e.wallet && e.filename)
    .filter(ev => {
      const age = now - (ev.timestamp || 0);
      if (age > MAX_EVENT_AGE_SEC) {
        console.log('  Skipping stale event for ' + ev.filename + ' (age ' + age + 's)');
        return false;
      }
      return true;
    });

  if (!allEvents.length) {
    console.error('No fresh events (all older than ' + MAX_EVENT_AGE_SEC + 's)');
    process.exit(1);
  }

  // Garde l'event le plus récent par fichier
  const eventsByFile = {};
  for (const ev of allEvents) {
    if (!eventsByFile[ev.filename] || ev.timestamp > eventsByFile[ev.filename].timestamp)
      eventsByFile[ev.filename] = ev;
  }

  const events = Object.values(eventsByFile);
  if (!events.length) { console.error('No valid events'); process.exit(1); }

  const walletPubkey = events[0].wallet;
  console.log('Wallet: ' + walletPubkey);

  // Unpublish profile — remove entry from profile.json
  const unpublishEvent = events.find(ev => ev.action === 'unpublish_profile');
  if (unpublishEvent) {
    if (!unpublishEvent.signature) { console.error('Signature required for unpublish_profile'); process.exit(1); }
    const msgU = JSON.stringify({action:'unpublish_profile',filename:'profile.json',wallet:unpublishEvent.wallet,nonce:unpublishEvent.nonce,timestamp:unpublishEvent.timestamp,uuid:unpublishEvent.profileEntry?.uuid});
    if (!verifySignature(msgU, unpublishEvent.signature, walletPubkey)) { console.error('Invalid signature for unpublish_profile'); process.exit(1); }
    // Verify UUID belongs to this wallet
    const profileJsonMain2 = (() => { try { return JSON.parse(fs.readFileSync('profile.json','utf8')); } catch(e) { return []; } })();
    const entry = profileJsonMain2.find(p => p.uuid === unpublishEvent.profileEntry?.uuid);
    if (entry && entry.pubkey !== walletPubkey) { console.error('REFUSED: profile UUID belongs to another wallet'); process.exit(1); }
    fs.writeFileSync('/tmp/validation_result.json', JSON.stringify({walletPubkey,ghActor,files:[{action:'unpublish_profile',filename:'profile.json',wallet:walletPubkey,profileEntry:unpublishEvent.profileEntry,timestamp:unpublishEvent.timestamp,nonce:unpublishEvent.nonce}]},null,2));
    console.log('Unpublish profile validation passed');
    process.exit(0);
  }

  // Score update — special action that updates all wallet files scores
  const scoreUpdateEvent = events.find(ev => ev.action === 'score_update');
  if (scoreUpdateEvent) {
    if (!scoreUpdateEvent.signature) {
      console.error('Signature required for score_update');
      process.exit(1);
    }
    const msg = JSON.stringify({
      action: 'score_update', wallet: scoreUpdateEvent.wallet,
      nonce: scoreUpdateEvent.nonce, timestamp: scoreUpdateEvent.timestamp,
      score: scoreUpdateEvent.score, laps: scoreUpdateEvent.laps
    });
    if (!verifySignature(msg, scoreUpdateEvent.signature, walletPubkey)) {
      console.error('Invalid signature for score_update');
      process.exit(1);
    }
    // Verify score on-chain
    const walletPubs = filesJsonMain
      .filter(f => f.author === walletPubkey)
      .sort((a, b) => (b.merged_at || 0) - (a.merged_at || 0));
    const lastPub = walletPubs[0] || null;
    const sc = await checkScoreEligibility(
      walletPubkey,
      lastPub ? (lastPub.score || 0) : 0,
      lastPub ? Math.max(1, lastPub.laps || 1) : 1
    );
    if (!sc.eligible) {
      console.error('Score not eligible: ' + sc.reason);
      process.exit(1);
    }
    console.log('Score update eligible — score=' + sc.score.toFixed(4) + ' laps=' + sc.currentLaps);
    fs.writeFileSync('/tmp/validation_result.json', JSON.stringify({
      walletPubkey, ghActor,
      files: [{ action: 'score_update', wallet: walletPubkey, score: sc.score, laps: sc.currentLaps, timestamp: scoreUpdateEvent.timestamp, nonce: scoreUpdateEvent.nonce }]
    }, null, 2));
    console.log('\nScore update validation passed');
    process.exit(0);
  }

  // Vérifie les types de fichiers
  for (const ev of events) {
    if (!ALLOWED_FILE(ev.filename)) {
      console.error('File type not allowed: ' + ev.filename);
      process.exit(1);
    }
  }

  // Load profile.json for .profile.js ownership checks
  let profileJsonMain = [];
  try { profileJsonMain = JSON.parse(fs.readFileSync('profile.json', 'utf8')); } catch(e) {}

  // Classifie : nouveaux / upgrades
  const newFiles     = [];
  const upgradeFiles = [];
  for (const ev of events) {
    // Registry files — always treated as upgrades (merge.js handles dedup)
    if (ALLOWED_REGISTRY(ev.filename)) {
      upgradeFiles.push(ev);
      continue;
    }

    // .profile.js — ownership check via profile.json, not files.json
    if (ALLOWED_PROFILE(ev.filename)) {
      const uuidFromFile = ev.filename.replace('.profile.js', '');
      const existingProfile = profileJsonMain.find(p => p.uuid === uuidFromFile);
      if (existingProfile && existingProfile.pubkey !== walletPubkey) {
        console.error('REFUSED: ' + ev.filename + ' belongs to wallet ' + existingProfile.pubkey);
        process.exit(1);
      }
      // Profile spheres are always upgrades (no score check needed)
      upgradeFiles.push(ev);
      continue;
    }

    // .sphere.js — standard check via files.json
    const existing = filesJsonMain.find(f => f.filename === ev.filename);
    if (!existing) {
      if (fs.existsSync(ev.filename)) {
        console.error('PROTECTED: ' + ev.filename + ' exists in repo but not in files.json');
        process.exit(1);
      }
      newFiles.push(ev);
    } else {
      const ghMatch     = existing.ghAuthor === ghActor;
      const walletMatch = existing.author === walletPubkey;
      if (!ghMatch && !walletMatch) {
        console.error('REFUSED: ' + ev.filename + ' belongs to @' + existing.ghAuthor);
        process.exit(1);
      }
      upgradeFiles.push(ev);
    }
  }

  console.log('New: ' + newFiles.length + ', Upgrades: ' + upgradeFiles.length);

  if (newFiles.length > 1) {
    console.error('Too many new files in one PR (max 1)');
    process.exit(1);
  }

  // Rate limit — nouveaux seulement
  if (newFiles.length > 0) {
    const mainEvDir = 'events';
    let lastMainTs = 0;
    if (fs.existsSync(mainEvDir)) {
      for (const ef of fs.readdirSync(mainEvDir).filter(f => f.endsWith('.json'))) {
        try {
          const ev = JSON.parse(fs.readFileSync(path.join(mainEvDir, ef), 'utf8'));
          if (ev.wallet === walletPubkey && ev.timestamp > lastMainTs) lastMainTs = ev.timestamp;
        } catch(e) {}
      }
    }
    if (lastMainTs > 0) {
      const gap = Math.min.apply(null, newFiles.map(ev => ev.timestamp)) - lastMainTs;
      if (gap < MIN_TS_GAP_SEC) {
        console.error('Rate limit: ' + MIN_TS_GAP_SEC + 's required, only ' + gap + 's elapsed');
        process.exit(1);
      }
    }
    console.log('Rate limit OK');
  }

  // Anti-replay nonces
  const knownNonces = new Set();
  if (fs.existsSync('events')) {
    for (const ef of fs.readdirSync('events').filter(f => f.endsWith('.json'))) {
      try { const ev = JSON.parse(fs.readFileSync(path.join('events', ef), 'utf8')); if (ev.nonce) knownNonces.add(ev.nonce); } catch(e) {}
    }
  }
  for (const ev of events) {
    if (knownNonces.has(ev.nonce)) {
      console.error('Replay attack: nonce ' + ev.nonce + ' already used');
      process.exit(1);
    }
  }
  console.log('Anti-replay OK');

  // Score on-chain — nouveaux fichiers code seulement (.sphere.js, .profile.js)
  const newCodeFiles = newFiles.filter(f => ALLOWED_SPHERE(f.filename) || ALLOWED_PROFILE(f.filename));
  let scoreCheck = { score: 0, currentLaps: 1, eligible: true };
  if (newCodeFiles.length > 0) {
    const walletPubs = filesJsonMain
      .filter(f => f.ghAuthor === ghActor || f.author === walletPubkey)
      .sort((a, b) => (b.merged_at || 0) - (a.merged_at || 0));
    const lastPub = walletPubs[0] || null;
    scoreCheck = await checkScoreEligibility(
      walletPubkey,
      lastPub ? (lastPub.score || 0) : 0,
      lastPub ? Math.max(1, lastPub.laps || 1) : 1
    );
    if (!scoreCheck.eligible) {
      console.error('Score not eligible: ' + scoreCheck.reason);
      process.exit(1);
    }
    console.log('Score eligible (claimable=' + scoreCheck.score.toFixed(4) + ')');
  } else {
    console.log('Score check skipped (upgrades or registry only)');
  }

  // Validation par event
  const results = [];
  for (const event of events) {
    const { filename } = event;
    console.log('\n--- ' + filename + ' ---');

    const isRegistryFile = ALLOWED_REGISTRY(filename);
    const isCodeFile     = ALLOWED_SPHERE(filename) || ALLOWED_PROFILE(filename);
    const existing       = filesJsonMain.find(f => f.filename === filename);
    const isUpdate       = !!(existing);
    console.log('→ ' + (isUpdate ? 'Upgrade' : 'New') + ' | type: ' + (isRegistryFile ? 'registry' : 'code'));

    // Hash + signature vérification pour les fichiers code seulement
    if (isCodeFile) {
      const codeUrl = event.codeUrl || ('https://raw.githubusercontent.com/' + ghActor + '/' + GH_REPO_NAME() + '/main/' + filename);
      console.log('  codeUrl: ' + codeUrl);

      let codeSource = '';
      try {
        codeSource = await fetchCodeFromFork(codeUrl);
        codeSource = codeSource.replace(/\r\n/g, '\n');
      } catch(e) {
        console.error('Cannot fetch code from fork: ' + e.message);
        process.exit(1);
      }

      const actualHash = crypto.createHash('sha256').update(codeSource).digest('hex');
      if (actualHash !== event.content_hash) {
        console.error('Hash mismatch for ' + filename);
        console.error('  Expected: ' + event.content_hash);
        console.error('  Got:      ' + actualHash);
        process.exit(1);
      }
      console.log('Hash OK');

      if (event.signature) {
        const message = JSON.stringify({
          action: event.action, filename: event.filename,
          content_hash: event.content_hash, nonce: event.nonce,
          timestamp: event.timestamp, score: event.score, laps: event.laps,
          codeUrl: event.codeUrl
        });
        if (!verifySignature(message, event.signature, walletPubkey)) {
          console.error('Invalid signature for ' + filename);
          process.exit(1);
        }
        console.log('Signature OK');
      } else {
        console.log('No signature (upgrade via GitHub only)');
      }
    }

    // Signature requise pour les registry files (name.json, profile.json)
    if (isRegistryFile) {
      if (!event.signature) {
        console.error('Signature required for registry file: ' + filename);
        process.exit(1);
      }
      const message = JSON.stringify({
        action: event.action, filename: event.filename,
        nonce: event.nonce, timestamp: event.timestamp,
        wallet: event.wallet
      });
      if (!verifySignature(message, event.signature, walletPubkey)) {
        console.error('Invalid signature for registry file: ' + filename);
        process.exit(1);
      }
      console.log('Signature OK (registry)');
    }

    console.log(filename + ' validated');

    // FIX: use blockchain score for new code files, event score for upgrades/registry
    const finalScore = (newCodeFiles.length > 0 && !isUpdate && isCodeFile)
      ? scoreCheck.score
      : (event.score || 0);
    const finalLaps = (newCodeFiles.length > 0 && !isUpdate && isCodeFile)
      ? scoreCheck.currentLaps
      : (event.laps || 0);

    results.push({
      filename, isUpdate, isRegistryFile,
      codeUrl: event.codeUrl || null,
      ghAuthor: ghActor,
      wallet: walletPubkey,
      score:    finalScore,
      laps:     finalLaps,
      timestamp: event.timestamp || Math.floor(Date.now() / 1000),
      // Pass through registry payloads for merge.js
      nameEntry:    event.nameEntry    || null,
      profileEntry: event.profileEntry || null,
    });
  }

  if (!results.length) { console.error('No files validated'); process.exit(1); }

  fs.writeFileSync('/tmp/validation_result.json', JSON.stringify({ walletPubkey, ghActor, files: results }, null, 2));
  console.log('\nValidation passed — ' + results.length + ' file(s) ready');
}

function GH_REPO_NAME() { return 'YourMinedApp'; }

main().catch(e => { console.error('Validation error:', e.message); process.exit(1); });
