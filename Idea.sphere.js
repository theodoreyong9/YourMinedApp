/* jshint esversion:11, browser:true */
// agent.sphere.js — YourMine Network Agent
// Analyses active spheres + peer profile data to suggest new sphere ideas
(function(){
'use strict';
window.YM_S = window.YM_S || {};

let _ctx = null;
let _analysisCache = null;
let _lastAnalysis = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5min

// ── DATA COLLECTION ───────────────────────────────────────────
function collectNetworkData() {
  const data = {
    mySpheres: [],
    myProfile: {},
    peers: [],
    sharedPatterns: {},
    sphereCombos: {},
  };

  // My active spheres
  if (window.YM_sphereRegistry) {
    window.YM_sphereRegistry.forEach((obj, name) => {
      data.mySpheres.push({
        name: obj.name || name,
        id: name,
        category: obj.category || 'Other',
        description: obj.description || '',
      });
    });
  }

  // My profile
  const profile = window.YM?.getProfile?.() || {};
  data.myProfile = {
    name: profile.name || '',
    bio: profile.bio || '',
    spheres: profile.spheres || [],
  };

  // Peers data from Social sphere
  const nearUsers = window.YM_Social?._nearUsers;
  if (nearUsers) {
    nearUsers.forEach((userData, uuid) => {
      const p = userData.profile || {};
      const broadcast = userData.broadcastData || {};
      const peerSpheres = p.spheres || [];

      data.peers.push({
        uuid: uuid.slice(0, 8),
        name: p.name || 'Anonymous',
        bio: p.bio || '',
        spheres: peerSpheres,
        broadcast,
      });

      // Count sphere frequency across peers
      peerSpheres.forEach(sid => {
        data.sharedPatterns[sid] = (data.sharedPatterns[sid] || 0) + 1;
      });

      // Count sphere combos (pairs)
      for (let i = 0; i < peerSpheres.length; i++) {
        for (let j = i + 1; j < peerSpheres.length; j++) {
          const combo = [peerSpheres[i], peerSpheres[j]].sort().join('+');
          data.sphereCombos[combo] = (data.sphereCombos[combo] || 0) + 1;
        }
      }
    });
  }

  return data;
}

function buildAnalysisPrompt(data) {
  const mySphereNames = data.mySpheres.map(s => s.name + ' (' + s.category + ')').join(', ') || 'none';
  const peerCount = data.peers.length;

  // Top shared spheres
  const topShared = Object.entries(data.sharedPatterns)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id, count]) => id.replace('.sphere.js', '') + ' ×' + count)
    .join(', ') || 'none';

  // Top combos
  const topCombos = Object.entries(data.sphereCombos)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([combo, count]) => combo.replace(/\.sphere\.js/g, '').replace('+', ' + ') + ' ×' + count)
    .join(', ') || 'none';

  // Peer bios sample
  const bios = data.peers
    .filter(p => p.bio)
    .slice(0, 6)
    .map(p => '"' + p.bio.slice(0, 60) + '"')
    .join(', ') || 'none';

  // Broadcast data sample
  const broadcasts = data.peers
    .filter(p => Object.keys(p.broadcast).length > 0)
    .slice(0, 4)
    .map(p => JSON.stringify(p.broadcast).slice(0, 80))
    .join(' | ') || 'none';

  return `You are analyzing a decentralized PWA network called YourMine.
Users install modular "spheres" (mini-apps) and connect P2P.

CURRENT USER:
- Active spheres: ${mySphereNames}
- Bio: "${data.myProfile.bio || 'none'}"

NETWORK (${peerCount} peers online):
- Most common spheres: ${topShared}
- Most common sphere combos: ${topCombos}
- Peer bios: ${bios}
- Live broadcast data: ${broadcasts}

TASK: Suggest ONE new sphere idea that would be genuinely useful for this network.
Base your suggestion on real patterns you see — missing bridges between existing spheres, unmet needs from bios, or opportunities from the broadcast data.

Respond in this exact JSON format (no markdown, no explanation):
{
  "name": "SphereName",
  "icon": "emoji",
  "category": "Tools|Games|AI|Finance|Commerce|Social|Media|Search|Agent|Communication",
  "tagline": "One sentence, max 80 chars",
  "why": "2-3 sentences explaining what pattern you detected and why this sphere fills it",
  "prompt": "The prompt to generate this sphere with AI (2-3 sentences, technical, specific)"
}`;
}

// ── ANALYSIS ──────────────────────────────────────────────────
async function runAnalysis(forceRefresh) {
  const now = Date.now();
  if (!forceRefresh && _analysisCache && (now - _lastAnalysis) < CACHE_TTL) {
    return _analysisCache;
  }

  const data = collectNetworkData();

  // Need at least the local sphere data to be useful
  if (data.mySpheres.length === 0 && data.peers.length === 0) {
    throw new Error('No network data available yet — activate some spheres and wait for peers');
  }

  const prompt = buildAnalysisPrompt(data);

  // Call Anthropic API
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || 'API error ' + resp.status);
  }

  const apiData = await resp.json();
  const text = (apiData.content || []).map(b => b.text || '').join('').trim();

  let suggestion;
  try {
    suggestion = JSON.parse(text);
  } catch {
    // Try to extract JSON from response
    const match = text.match(/\{[\s\S]*\}/);
    if (match) suggestion = JSON.parse(match[0]);
    else throw new Error('Could not parse suggestion from AI response');
  }

  _analysisCache = { suggestion, data, timestamp: now };
  _lastAnalysis = now;
  return _analysisCache;
}

// ── RENDER ────────────────────────────────────────────────────
function renderPanel(container) {
  container.innerHTML = '';
  container.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden';

  // Header stats bar
  const statsBar = document.createElement('div');
  statsBar.style.cssText = 'flex-shrink:0;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.06);display:flex;gap:12px;align-items:center';
  container.appendChild(statsBar);

  function updateStats() {
    const data = collectNetworkData();
    const peerCount = data.peers.length;
    const sphereCount = data.mySpheres.length;
    statsBar.innerHTML =
      '<div style="display:flex;gap:16px;flex:1">' +
        '<div style="text-align:center"><div style="font-size:18px;font-weight:700;color:var(--gold)">' + sphereCount + '</div><div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:1px">Spheres</div></div>' +
        '<div style="text-align:center"><div style="font-size:18px;font-weight:700;color:var(--cyan)">' + peerCount + '</div><div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:1px">Peers</div></div>' +
      '</div>' +
      '<div style="font-size:9px;color:var(--text3)">' + (peerCount === 0 ? 'Waiting for peers…' : peerCount + ' peer' + (peerCount > 1 ? 's' : '') + ' online') + '</div>';
  }
  updateStats();

  // Main content area
  const main = document.createElement('div');
  main.style.cssText = 'flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:16px;display:flex;flex-direction:column;gap:12px';
  container.appendChild(main);

  function showIdle() {
    main.innerHTML = '';

    const intro = document.createElement('div');
    intro.style.cssText = 'padding:8px 0 4px';
    intro.innerHTML =
      '<div style="font-family:var(--font-d);font-size:13px;font-weight:700;color:var(--text);margin-bottom:6px">Network Agent</div>' +
      '<div style="font-size:12px;color:var(--text3);line-height:1.7">Analyses your active spheres and peer profiles to suggest what the network is missing.</div>';
    main.appendChild(intro);

    // Network snapshot
    const data = collectNetworkData();
    if (data.mySpheres.length > 0 || data.peers.length > 0) {
      const snap = document.createElement('div');
      snap.style.cssText = 'background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:10px;padding:12px';

      let snapHtml = '<div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">What I see</div>';

      if (data.mySpheres.length > 0) {
        snapHtml += '<div style="font-size:11px;color:var(--text2);margin-bottom:4px">Your spheres: <span style="color:var(--text)">' +
          data.mySpheres.map(s => s.name).join(', ') + '</span></div>';
      }

      if (data.peers.length > 0) {
        const topSphere = Object.entries(data.sharedPatterns).sort((a,b) => b[1]-a[1])[0];
        snapHtml += '<div style="font-size:11px;color:var(--text2);margin-bottom:4px">' + data.peers.length + ' peer' + (data.peers.length > 1 ? 's' : '') + ' online</div>';
        if (topSphere) {
          snapHtml += '<div style="font-size:11px;color:var(--text2)">Most common: <span style="color:var(--gold)">' + topSphere[0].replace('.sphere.js','') + '</span> ×' + topSphere[1] + '</div>';
        }
      } else {
        snapHtml += '<div style="font-size:11px;color:var(--text3)">No peers online yet — analysis will use your spheres only</div>';
      }

      snap.innerHTML = snapHtml;
      main.appendChild(snap);
    }

    // Analyse button
    const btn = document.createElement('button');
    btn.style.cssText = 'width:100%;padding:14px;background:linear-gradient(135deg,var(--gold,#f0a830),rgba(240,168,48,.75));color:#05030a;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;margin-top:4px';
    btn.textContent = '✦ Analyse Network';
    btn.addEventListener('click', () => showLoading());
    main.appendChild(btn);

    // Show cached result if available
    if (_analysisCache) {
      showResult(_analysisCache, true);
    }
  }

  function showLoading() {
    main.innerHTML = '';
    const loader = document.createElement('div');
    loader.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:40px 0';

    const dot = document.createElement('div');
    dot.style.cssText = 'width:10px;height:10px;border-radius:50%;background:var(--gold);animation:ym-agent-pulse 1.2s ease infinite';
    if (!document.getElementById('ym-agent-style')) {
      const s = document.createElement('style');
      s.id = 'ym-agent-style';
      s.textContent = '@keyframes ym-agent-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(.6)}}';
      document.head.appendChild(s);
    }

    const msg = document.createElement('div');
    msg.style.cssText = 'font-size:12px;color:var(--text3);text-align:center;line-height:1.7';
    msg.textContent = 'Analysing your network…';

    loader.appendChild(dot);
    loader.appendChild(msg);
    main.appendChild(loader);

    runAnalysis(true)
      .then(result => { showResult(result, false); })
      .catch(e => {
        main.innerHTML = '';
        const err = document.createElement('div');
        err.style.cssText = 'padding:16px;border-radius:10px;background:rgba(255,69,96,.08);border:1px solid rgba(255,69,96,.2);font-size:12px;color:var(--red,#ff4560);line-height:1.6';
        err.textContent = '✗ ' + e.message;
        main.appendChild(err);
        const retry = document.createElement('button');
        retry.style.cssText = 'width:100%;padding:12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:var(--text2);border-radius:10px;font-size:12px;cursor:pointer;margin-top:10px';
        retry.textContent = '← Back';
        retry.addEventListener('click', showIdle);
        main.appendChild(retry);
        if (_ctx) _ctx.toast(e.message, 'error');
      });
  }

  function showResult(result, fromCache) {
    const s = result.suggestion;
    if (!s) return;

    // Clear previous result cards if called from idle
    const existing = main.querySelector('[data-result]');
    if (existing) existing.remove();

    const card = document.createElement('div');
    card.dataset.result = '1';
    card.style.cssText = 'display:flex;flex-direction:column;gap:10px;margin-top:' + (fromCache ? '0' : '0') + 'px';

    if (!fromCache) {
      // Full result view
      main.innerHTML = '';
    }

    // Suggestion card
    const suggCard = document.createElement('div');
    suggCard.style.cssText = 'background:rgba(240,168,48,.06);border:1px solid rgba(240,168,48,.2);border-radius:12px;padding:16px';
    suggCard.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">' +
        '<span style="font-size:32px">' + (s.icon || '⬡') + '</span>' +
        '<div>' +
          '<div style="font-size:15px;font-weight:700;color:var(--text)">' + (s.name || '') + '</div>' +
          '<div style="font-size:10px;color:var(--text3);margin-top:2px">' + (s.category || '') + '</div>' +
        '</div>' +
      '</div>' +
      '<div style="font-size:13px;color:var(--text2);margin-bottom:10px;line-height:1.5">' + (s.tagline || '') + '</div>' +
      '<div style="font-size:11px;color:var(--text3);line-height:1.7;border-top:1px solid rgba(255,255,255,.06);padding-top:10px">' +
        '<span style="color:var(--gold);font-size:9px;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:4px">Why this?</span>' +
        (s.why || '') +
      '</div>';
    card.appendChild(suggCard);

    // Prompt card
    if (s.prompt) {
      const promptCard = document.createElement('div');
      promptCard.style.cssText = 'background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:12px';
      promptCard.innerHTML =
        '<div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Prompt for AI generator</div>' +
        '<div style="font-size:11px;color:var(--text2);line-height:1.7;font-family:var(--font-m)">' + s.prompt + '</div>';
      card.appendChild(promptCard);

      // Copy prompt button
      const copyBtn = document.createElement('button');
      copyBtn.style.cssText = 'width:100%;padding:11px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:var(--text2);border-radius:10px;font-size:12px;cursor:pointer;transition:border-color .15s';
      copyBtn.textContent = '⎘ Copy prompt';
      copyBtn.addEventListener('mouseenter',()=>{copyBtn.style.borderColor='rgba(255,255,255,.2)';});
      copyBtn.addEventListener('mouseleave',()=>{copyBtn.style.borderColor='rgba(255,255,255,.1)';});
      copyBtn.addEventListener('click', () => {
        navigator.clipboard?.writeText(s.prompt)
          .then(() => { copyBtn.textContent = '✓ Copied!'; setTimeout(() => { copyBtn.textContent = '⎘ Copy prompt'; }, 2000); })
          .catch(() => { if (_ctx) _ctx.toast('Copy failed', 'error'); });
      });
      card.appendChild(copyBtn);
    }

    // Timestamp
    const ts = document.createElement('div');
    ts.style.cssText = 'font-size:9px;color:var(--text3);text-align:center';
    ts.textContent = fromCache ? 'Cached · ' + new Date(result.timestamp).toLocaleTimeString() : 'Just now';
    card.appendChild(ts);

    if (fromCache) {
      main.appendChild(card);
    } else {
      main.appendChild(card);
      // New analysis button
      const newBtn = document.createElement('button');
      newBtn.style.cssText = 'width:100%;padding:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);color:var(--text3);border-radius:10px;font-size:12px;cursor:pointer';
      newBtn.textContent = '↺ New analysis';
      newBtn.addEventListener('click', () => showLoading());
      main.appendChild(newBtn);
    }
  }

  showIdle();
}

window.YM_S['agent.sphere.js'] = {
  name: 'Network Agent',
  icon: '✦',
  category: 'Agent',
  description: 'Analyses your spheres and peer profiles to suggest what the network is missing',

  activate(ctx) {
    _ctx = ctx;
  },

  deactivate() {
    _ctx = null;
    _analysisCache = null;
  },

  renderPanel,
};
})();
