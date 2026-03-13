// search.sphere.js — YourMine Search Sphere
// Category: YourMine | Author: theodoreyong9
(function(){
'use strict';

window.YM_S = window.YM_S || {};
window.YM_S['search.sphere.js'] = {
  name: 'Search',
  category: 'YourMine',
  author: 'theodoreyong9',
  description: 'Full-text search across all active sphere data, with AI idea generator',

  activate(ctx) {
    this._ctx = ctx;
    ctx.addPill('🔍 Search', body => renderSearchUI(body, ctx));
    // Index data received from other spheres
    ctx.p2p.onReceive((data, peerId) => indexP2PData(data, peerId));
  },

  deactivate() {},

  getBroadcastData() { return null; }
};

// ── INDEX ─────────────────────────────────────────────────
const IDX = []; // [{ id, text, meta, sphere, ts, data }]

function addToIndex(entry) {
  const id = entry.id || Date.now() + Math.random();
  if (IDX.find(e => e.id === id)) return;
  IDX.unshift({ ...entry, id, ts: Date.now() });
  if (IDX.length > 2000) IDX.pop();
  if (document.getElementById('srch-results')) renderResults(SQ.q, SQ.selected);
}

function indexP2PData(data, peerId) {
  if (!data || typeof data !== 'object') return;
  // Index any readable text from incoming p2p packets
  let text = '';
  if (data.type === 'profile') text = [data.displayName, data.bio, data.uuid].filter(Boolean).join(' ');
  else if (data.content) text = data.content;
  else text = JSON.stringify(data).slice(0, 400);

  if (text.trim()) addToIndex({
    id: (data.uuid || peerId) + '-' + Date.now(),
    text,
    meta: { source: 'p2p', peerId, sphere: data.sphere || 'unknown' },
    sphere: data.sphere || 'p2p',
  });
}

// Index data from active spheres periodically
function scanSpheres() {
  for (const [fn, sphere] of Object.entries(window.YM_S || {})) {
    if (!sphere || fn === 'search.sphere.js') continue;
    try {
      const broadcastData = sphere.getBroadcastData?.();
      if (broadcastData) addToIndex({
        id: fn + '-self-' + Math.floor(Date.now()/5000),
        text: JSON.stringify(broadcastData).replace(/[{}"]/g,' '),
        meta: { source: 'sphere', sphere: fn },
        sphere: fn,
        data: broadcastData
      });
    } catch {}
  }
}
setInterval(scanSpheres, 5000);

// ── SEARCH STATE ──────────────────────────────────────────
const SQ = { q: '', selected: new Set(), aiPrompt: '' };

function search(q) {
  if (!q.trim()) return [...IDX].slice(0, 60);
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  return IDX.filter(e => terms.every(t => (e.text || '').toLowerCase().includes(t)))
    .sort((a, b) => {
      // Boost exact phrase match
      const aScore = (a.text.toLowerCase().includes(q.toLowerCase()) ? 2 : 0) + (terms.filter(t => a.text.toLowerCase().includes(t)).length);
      const bScore = (b.text.toLowerCase().includes(q.toLowerCase()) ? 2 : 0) + (terms.filter(t => b.text.toLowerCase().includes(t)).length);
      return bScore - aScore;
    })
    .slice(0, 100);
}

// ── CSS ───────────────────────────────────────────────────
const CSS = `<style>
.srch-input{width:100%;background:rgba(17,17,19,.9);border:1.5px solid rgba(200,240,160,.3);border-radius:10px;padding:11px 14px;color:#e8e8f0;font-family:'Space Mono',monospace;font-size:.82rem;outline:none;box-sizing:border-box;transition:border-color .2s}
.srch-input:focus{border-color:#c8f0a0;box-shadow:0 0 16px rgba(200,240,160,.08)}
.srch-input::placeholder{color:rgba(232,232,240,.3)}
.srch-result{display:flex;gap:10px;padding:11px 12px;border:1px solid rgba(200,240,160,.1);border-radius:9px;margin-bottom:6px;cursor:pointer;transition:all .2s;background:rgba(17,17,19,.7);align-items:flex-start}
.srch-result:hover{border-color:rgba(200,240,160,.3);background:rgba(200,240,160,.04)}
.srch-result.selected{border-color:#c8f0a0;background:rgba(200,240,160,.08)}
.srch-check{width:16px;height:16px;border:1.5px solid rgba(200,240,160,.3);border-radius:4px;flex-shrink:0;margin-top:2px;display:flex;align-items:center;justify-content:center;font-size:.7rem;color:#c8f0a0;transition:all .2s}
.srch-result.selected .srch-check{background:rgba(200,240,160,.2);border-color:#c8f0a0}
.srch-body{flex:1;min-width:0}
.srch-sphere{font-family:'Space Mono',monospace;font-size:.62rem;color:rgba(200,240,160,.5);letter-spacing:.08em;text-transform:uppercase;margin-bottom:3px}
.srch-text{font-family:'Barlow Condensed',sans-serif;font-size:.88rem;color:#e8e8f0;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.srch-text mark{background:rgba(200,240,160,.25);color:#c8f0a0;border-radius:2px;padding:0 2px}
.srch-meta{font-size:.72rem;color:rgba(232,232,240,.35);margin-top:2px;font-family:'Space Mono',monospace}
.srch-btn{padding:8px 14px;border-radius:8px;border:none;cursor:pointer;font-family:'Barlow Condensed',sans-serif;font-size:.82rem;font-weight:700;letter-spacing:.04em;transition:all .2s}
.srch-btn-p{background:#c8f0a0;color:#111113}
.srch-btn-s{background:rgba(200,240,160,.08);border:1px solid rgba(200,240,160,.25);color:#e8e8f0}
.srch-btn-p:hover{box-shadow:0 0 14px rgba(200,240,160,.35)}
.srch-ai-box{background:rgba(17,17,19,.9);border:1px solid rgba(200,240,160,.15);border-radius:10px;padding:12px;margin-top:10px}
.srch-ai-msg{background:rgba(200,240,160,.04);border:1px solid rgba(200,240,160,.1);border-radius:8px;padding:10px;margin-bottom:6px}
.srch-ai-role{font-family:'Space Mono',monospace;font-size:.62rem;color:rgba(200,240,160,.5);letter-spacing:.08em;text-transform:uppercase;margin-bottom:4px}
.srch-ai-text{font-family:'Barlow Condensed',sans-serif;font-size:.85rem;color:#e8e8f0;line-height:1.5;white-space:pre-wrap;word-break:break-word}
.srch-spinner{display:inline-block;width:14px;height:14px;border:2px solid rgba(200,240,160,.2);border-top-color:#c8f0a0;border-radius:50%;animation:sspin .7s linear infinite;vertical-align:middle;margin-right:5px}
@keyframes sspin{to{transform:rotate(360deg)}}
.srch-empty{text-align:center;padding:28px 16px;color:rgba(232,232,240,.3);font-family:'Space Mono',monospace;font-size:.75rem;line-height:2}
.srch-sel-bar{display:flex;align-items:center;gap:8px;padding:8px 0;margin-bottom:8px}
.srch-count{font-family:'Space Mono',monospace;font-size:.72rem;color:rgba(200,240,160,.6)}
</style>`;

// ── MAIN UI ───────────────────────────────────────────────
function renderSearchUI(body, ctx) {
  body.innerHTML = CSS + `
  <div style="padding:12px 16px">
    <div style="margin-bottom:10px">
      <input class="srch-input" id="srch-q" placeholder="Search across spheres, profiles, content…" oninput="srchQuery(this.value)">
    </div>

    <div class="srch-sel-bar" id="srch-sel-bar" style="display:none">
      <span class="srch-count" id="srch-sel-count">0 selected</span>
      <button class="srch-btn srch-btn-s" style="font-size:.76rem" onclick="srchClearSel()">Clear</button>
      <button class="srch-btn srch-btn-p" style="font-size:.76rem;margin-left:auto" onclick="srchOpenAI()">✦ Build Sphere Idea</button>
    </div>

    <div id="srch-results"></div>

    <!-- AI Panel -->
    <div id="srch-ai-panel" style="display:none">
      <div style="border-top:1px solid rgba(200,240,160,.12);margin:12px 0"></div>
      <div class="srch-ai-box">
        <div style="font-family:'Space Mono',monospace;font-size:.68rem;color:rgba(200,240,160,.6);letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px">Sphere/App Idea Generator</div>
        <div id="srch-ai-history"></div>
        <div style="font-family:'Barlow Condensed',sans-serif;font-size:.8rem;color:rgba(232,232,240,.45);margin-bottom:6px;line-height:1.4" id="srch-ai-context-hint"></div>
        <textarea id="srch-ai-prompt" style="width:100%;background:rgba(0,0,0,.3);border:1px solid rgba(200,240,160,.2);border-radius:8px;padding:9px 12px;color:#e8e8f0;font-family:'Space Mono',monospace;font-size:.75rem;resize:vertical;min-height:70px;outline:none;box-sizing:border-box" placeholder="Refine the idea or describe what you want to build…"></textarea>
        <div style="display:flex;gap:8px;margin-top:6px">
          <button class="srch-btn srch-btn-p" style="flex:1" id="srch-ai-send" onclick="srchAISend()">✦ Generate Idea</button>
          <button class="srch-btn srch-btn-s" onclick="srchAIToBuild()">→ Build</button>
          <button class="srch-btn srch-btn-s" onclick="srchCloseAI()">×</button>
        </div>
        <div id="srch-ai-msg"></div>
      </div>
    </div>
  </div>`;

  renderResults('', new Set());
}

function srchQuery(q) {
  SQ.q = q;
  renderResults(q, SQ.selected);
}
window.srchQuery = srchQuery;

function renderResults(q, selected) {
  const el = document.getElementById('srch-results');
  if (!el) return;
  const results = search(q);

  if (!results.length) {
    el.innerHTML = q
      ? '<div class="srch-empty">No results for "' + escHtml(q) + '"</div>'
      : `<div class="srch-empty">Index is empty.<br>Activate spheres and receive<br>P2P data to populate.</div>`;
    return;
  }

  el.innerHTML = results.map(r => {
    const isSel = selected.has(r.id);
    const highlighted = highlightText(r.text, q);
    return `<div class="srch-result${isSel?' selected':''}" onclick="srchToggle('${escAttr(r.id)}')">
      <div class="srch-check">${isSel ? '✓' : ''}</div>
      <div class="srch-body">
        <div class="srch-sphere">${escHtml(r.sphere || 'unknown')}</div>
        <div class="srch-text">${highlighted}</div>
        <div class="srch-meta">${timeAgo(r.ts)}</div>
      </div>
    </div>`;
  }).join('');

  updateSelBar();
}

window.srchToggle = function(id) {
  if (SQ.selected.has(id)) SQ.selected.delete(id);
  else SQ.selected.add(id);
  renderResults(SQ.q, SQ.selected);
  updateSelBar();
};

function updateSelBar() {
  const bar = document.getElementById('srch-sel-bar');
  const count = document.getElementById('srch-sel-count');
  if (!bar) return;
  const n = SQ.selected.size;
  bar.style.display = n > 0 ? 'flex' : 'none';
  if (count) count.textContent = n + ' selected';
}

window.srchClearSel = function() { SQ.selected.clear(); renderResults(SQ.q, SQ.selected); updateSelBar(); };

window.srchOpenAI = function() {
  const panel = document.getElementById('srch-ai-panel');
  if (panel) panel.style.display = 'block';
  // Pre-fill context hint
  const selected = IDX.filter(e => SQ.selected.has(e.id));
  const hint = document.getElementById('srch-ai-context-hint');
  if (hint) hint.textContent = `Using ${selected.length} selected item${selected.length!==1?'s':''} as context.`;
};

window.srchCloseAI = function() {
  const panel = document.getElementById('srch-ai-panel');
  if (panel) panel.style.display = 'none';
};

const srchAIHistory = [];

window.srchAISend = async function() {
  const promptEl = document.getElementById('srch-ai-prompt');
  const userPrompt = promptEl?.value.trim();
  if (!userPrompt) { YM?.toast?.('Enter a prompt'); return; }

  // Get Claude key from build sphere
  const claudeKey = JSON.parse(localStorage.getItem('ym_build') || '{}').claudeKey || '';
  if (!claudeKey) { YM?.toast?.('Enter Claude API key in the Build sphere → Keys'); return; }

  // Gather selected context
  const contextItems = IDX.filter(e => SQ.selected.has(e.id));
  const contextText = contextItems.map(e => `[${e.sphere}] ${e.text}`).join('\n');

  const systemPrompt = `You are a creative advisor helping design YourMine spheres and mini-apps.
YourMine is a decentralized PWA with P2P networking. Spheres are plugins (sphere.js files). Sites are mini-apps (site.html files).
Given data from the user's active spheres, generate a concrete, implementable idea for a new sphere or site.
Include: sphere name, category (social/commerce/transport/jeux/autres/YourMine), what it does, what P2P data it uses, key features, suggested sphere API calls.
Keep it concise and actionable.${contextText ? '\n\nUser context data:\n' + contextText.slice(0,2000) : ''}`;

  srchAIHistory.push({ role: 'user', content: userPrompt });
  if (promptEl) promptEl.value = '';

  const sendBtn = document.getElementById('srch-ai-send');
  if (sendBtn) { sendBtn.disabled = true; sendBtn.innerHTML = '<span class="srch-spinner"></span>Thinking…'; }

  renderAIHistory2();

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': claudeKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: systemPrompt,
        messages: srchAIHistory.map(m => ({ role: m.role, content: m.content }))
      })
    });
    const d = await r.json();
    const reply = d.content?.[0]?.text || 'No response';
    srchAIHistory.push({ role: 'assistant', content: reply });
  } catch(e) {
    srchAIHistory.push({ role: 'assistant', content: `Error: ${e.message}` });
  } finally {
    if (sendBtn) { sendBtn.disabled = false; sendBtn.innerHTML = '✦ Generate Idea'; }
    renderAIHistory2();
  }
};

function renderAIHistory2() {
  const el = document.getElementById('srch-ai-history');
  if (!el) return;
  el.innerHTML = srchAIHistory.map(m => `
    <div class="srch-ai-msg">
      <div class="srch-ai-role">${m.role === 'user' ? 'You' : 'AI'}</div>
      <div class="srch-ai-text">${escHtml(m.content)}</div>
    </div>`).join('');
  el.scrollTop = el.scrollHeight;
}

window.srchAIToBuild = function() {
  const last = [...srchAIHistory].reverse().find(m => m.role === 'assistant');
  if (!last) { YM?.toast?.('No AI response yet'); return; }
  // Send to build sphere if active
  const buildSphere = window.YM_S?.['build.sphere.js'];
  if (buildSphere?._ctx) {
    localStorage.setItem('ym_build_idea', last.content);
    YM?.toast?.('Idea saved — open Build sphere AI tab');
  } else {
    YM?.toast?.('Activate the Build sphere to continue');
  }
};

// ── UTILS ─────────────────────────────────────────────────
function highlightText(text, q) {
  const safe = escHtml(text.slice(0, 120));
  if (!q.trim()) return safe;
  try {
    const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi');
    return safe.replace(re, '<mark>$1</mark>');
  } catch { return safe; }
}

function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escAttr(s) { return String(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function timeAgo(ts) {
  const s = Math.floor((Date.now()-ts)/1000);
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s/60) + 'm ago';
  if (s < 86400) return Math.floor(s/3600) + 'h ago';
  return Math.floor(s/86400) + 'd ago';
}

// Public for use by other spheres: add items to the search index
window.YM_searchIndex = function(entry) { addToIndex(entry); };

})();
