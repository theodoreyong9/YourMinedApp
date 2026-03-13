// build.sphere.js — YourMine Build Sphere
// Category: YourMine | Author: theodoreyong9
(function(){
'use strict';

window.YM_S = window.YM_S || {};
window.YM_S['build.sphere.js'] = {
  name: 'Build',
  category: 'YourMine',
  author: 'theodoreyong9',
  description: 'Code, test and publish spheres & sites with AI assistance',

  async activate(ctx) {
    this._ctx = ctx;
    loadBuildState();
    ctx.addPill('🛠 Build', body => renderBuildUI(body, ctx));
  },

  deactivate() {},

  getBroadcastData() {
    if (!BS.testCode) return null;
    return { type: 'test-request', name: BS.testName, requestId: BS.testRequestId };
  }
};

// ── STATE ─────────────────────────────────────────────────
const BS = {
  ghToken: '',
  openaiKey: '',
  claudeKey: '',
  codeType: 'sphere', // 'sphere' | 'site'
  fileName: '',
  code: '',
  aiPrompt: '',
  aiHistory: [],
  testCode: null,
  testName: '',
  testRequestId: null,
  linkedDocs: [],
};

function loadBuildState() {
  try {
    const d = JSON.parse(localStorage.getItem('ym_build') || '{}');
    BS.ghToken = d.ghToken || '';
    BS.openaiKey = d.openaiKey || '';
    BS.claudeKey = d.claudeKey || '';
    BS.code = d.code || '';
    BS.fileName = d.fileName || '';
    BS.codeType = d.codeType || 'sphere';
  } catch {}
}

function saveBuildState() {
  try { localStorage.setItem('ym_build', JSON.stringify({ ghToken: BS.ghToken, openaiKey: BS.openaiKey, claudeKey: BS.claudeKey, code: BS.code, fileName: BS.fileName, codeType: BS.codeType })); } catch {}
}

// ── YRM ACCESS LEVEL ──────────────────────────────────────
function getYRMBalance() {
  // Read from mine sphere if active
  return window.YM_S?.['mine.sphere.js'] ? (parseFloat(localStorage.getItem('ym_last_claimable') || '0')) : 0;
}

function canPublish() { return true; } // for now: all can publish (0 YRM threshold)
function canJoinOrg() { return BS.ghToken.length > 5; }

// ── CSS ───────────────────────────────────────────────────
const CSS = `<style>
.b-tabs{display:flex;border-bottom:1px solid rgba(200,240,160,.12);margin-bottom:12px;overflow-x:auto;scrollbar-width:none}
.b-tab{padding:10px 14px;background:none;border:none;border-bottom:2px solid transparent;color:rgba(232,232,240,.4);font-family:'Barlow Condensed',sans-serif;font-size:.82rem;font-weight:700;cursor:pointer;letter-spacing:.05em;text-transform:uppercase;transition:all .2s;white-space:nowrap}
.b-tab.on{color:#c8f0a0;border-bottom-color:#c8f0a0}
.b-panel{display:none}.b-panel.on{display:block}
.b-input{width:100%;background:rgba(255,255,255,.04);border:1px solid rgba(200,240,160,.2);border-radius:8px;padding:9px 12px;color:#e8e8f0;font-family:'Space Mono',monospace;font-size:.78rem;outline:none;margin-bottom:8px;box-sizing:border-box}
.b-input:focus{border-color:rgba(200,240,160,.5)}
.b-input::placeholder{color:rgba(232,232,240,.3)}
.b-textarea{width:100%;background:rgba(0,0,0,.3);border:1px solid rgba(200,240,160,.15);border-radius:8px;padding:10px 12px;color:#c8f0a0;font-family:'Space Mono',monospace;font-size:.72rem;outline:none;resize:vertical;min-height:160px;line-height:1.6;box-sizing:border-box}
.b-textarea:focus{border-color:rgba(200,240,160,.35)}
.b-textarea::placeholder{color:rgba(200,240,160,.25)}
.b-btn{padding:9px 16px;border-radius:8px;border:none;cursor:pointer;font-family:'Barlow Condensed',sans-serif;font-size:.85rem;font-weight:700;letter-spacing:.04em;transition:all .2s}
.b-btn-p{background:#c8f0a0;color:#111113}
.b-btn-s{background:rgba(200,240,160,.08);border:1px solid rgba(200,240,160,.25);color:#e8e8f0}
.b-btn-p:hover{box-shadow:0 0 14px rgba(200,240,160,.35)}
.b-btn-p:disabled,.b-btn-s:disabled{opacity:.4;cursor:not-allowed}
.b-label{font-family:'Space Mono',monospace;font-size:.67rem;color:rgba(200,240,160,.5);letter-spacing:.1em;text-transform:uppercase;margin-bottom:5px}
.b-card{background:rgba(200,240,160,.04);border:1px solid rgba(200,240,160,.12);border-radius:10px;padding:13px;margin-bottom:10px}
.b-msg-ai{background:rgba(17,17,19,.9);border:1px solid rgba(200,240,160,.12);border-radius:8px;padding:10px 12px;margin-bottom:6px}
.b-msg-user{background:rgba(200,240,160,.06);border:1px solid rgba(200,240,160,.2);border-radius:8px;padding:10px 12px;margin-bottom:6px}
.b-msg-role{font-family:'Space Mono',monospace;font-size:.62rem;color:rgba(200,240,160,.5);margin-bottom:4px;letter-spacing:.08em;text-transform:uppercase}
.b-msg-text{font-family:'Barlow Condensed',sans-serif;font-size:.85rem;color:#e8e8f0;line-height:1.5;white-space:pre-wrap;word-break:break-word}
.b-spinner{display:inline-block;width:14px;height:14px;border:2px solid rgba(200,240,160,.2);border-top-color:#c8f0a0;border-radius:50%;animation:bspin .7s linear infinite;vertical-align:middle;margin-right:6px}
@keyframes bspin{to{transform:rotate(360deg)}}
.b-toggle-row{display:flex;align-items:center;gap:12px;margin-bottom:10px}
.b-toggle-label{font-family:'Barlow Condensed',sans-serif;font-size:.85rem;color:#e8e8f0;flex:1}
.b-seg{display:flex;border:1px solid rgba(200,240,160,.2);border-radius:8px;overflow:hidden;margin-bottom:12px}
.b-seg-btn{flex:1;padding:8px;background:none;border:none;color:rgba(232,232,240,.4);font-family:'Barlow Condensed',sans-serif;font-size:.82rem;font-weight:700;cursor:pointer;transition:all .2s;letter-spacing:.04em}
.b-seg-btn.on{background:rgba(200,240,160,.15);color:#c8f0a0}
.b-doc-item{display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid rgba(200,240,160,.1);border-radius:7px;margin-bottom:5px;font-family:'Space Mono',monospace;font-size:.72rem;color:#e8e8f0}
.b-doc-item button{background:none;border:none;color:rgba(255,100,100,.6);cursor:pointer;font-size:.9rem;margin-left:auto}
</style>`;

// ── MAIN UI ───────────────────────────────────────────────
function renderBuildUI(body, ctx) {
  body.innerHTML = CSS + `
  <div style="padding:12px 16px">
    <div class="b-tabs">
      <button class="b-tab on" onclick="bTab('editor',this)">Editor</button>
      <button class="b-tab" onclick="bTab('ai',this)">AI</button>
      <button class="b-tab" onclick="bTab('publish',this)">Publish</button>
      <button class="b-tab" onclick="bTab('settings',this)">Keys</button>
    </div>

    <div class="b-panel on" id="bp-editor"></div>
    <div class="b-panel" id="bp-ai"></div>
    <div class="b-panel" id="bp-publish"></div>
    <div class="b-panel" id="bp-settings"></div>
  </div>`;

  renderEditor();
  renderAI(ctx);
  renderPublish();
  renderSettings();
}

function bTab(id, el) {
  document.querySelectorAll('.b-tab').forEach(t => t.classList.remove('on'));
  document.querySelectorAll('.b-panel').forEach(p => p.classList.remove('on'));
  el.classList.add('on');
  document.getElementById('bp-' + id)?.classList.add('on');
}
window.bTab = bTab;

// ── EDITOR ────────────────────────────────────────────────
function renderEditor() {
  const el = document.getElementById('bp-editor');
  if (!el) return;
  el.innerHTML = `
    <div class="b-label">Type</div>
    <div class="b-seg" style="margin-bottom:10px">
      <button class="b-seg-btn${BS.codeType==='sphere'?' on':''}" onclick="bSetType('sphere',this)">Sphere (.sphere.js)</button>
      <button class="b-seg-btn${BS.codeType==='site'?' on':''}" onclick="bSetType('site',this)">Site (.site.html)</button>
    </div>
    <div class="b-label">File name</div>
    <input class="b-input" id="b-fname" value="${BS.fileName}" placeholder="${BS.codeType==='sphere'?'my-sphere':'my-site'}" oninput="BS&&(BS.fileName=this.value)">
    <div class="b-label">Code</div>
    <textarea class="b-textarea" id="b-code" rows="14" placeholder="// Paste or generate your code here…" oninput="bCodeChange(this.value)">${escHtml(BS.code)}</textarea>
    <div style="display:flex;gap:8px;margin-top:8px">
      <button class="b-btn b-btn-s" style="flex:1" onclick="bLoadFile()">📂 Load File</button>
      <button class="b-btn b-btn-s" style="flex:1" onclick="bSaveLocal()">💾 Save Draft</button>
      <button class="b-btn b-btn-s" style="flex:1" onclick="bLiveTest()">▶ Test</button>
    </div>
    <div id="b-editor-msg"></div>
    <input type="file" id="b-file-input" accept=".js,.html" style="display:none" onchange="bHandleFile(this)">
  `;
}

window.bSetType = function(type, el) {
  BS.codeType = type;
  document.querySelectorAll('.b-seg-btn').forEach(b => b.classList.remove('on'));
  el.classList.add('on');
  const fn = document.getElementById('b-fname');
  if (fn && !fn.value) fn.placeholder = type === 'sphere' ? 'my-sphere' : 'my-site';
};

window.bCodeChange = function(v) { BS.code = v; };

window.bLoadFile = function() { document.getElementById('b-file-input')?.click(); };
window.bHandleFile = function(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    BS.code = e.target.result;
    BS.fileName = file.name.replace(/\.(sphere\.js|site\.html)$/, '');
    BS.codeType = file.name.endsWith('.html') ? 'site' : 'sphere';
    const ta = document.getElementById('b-code');
    if (ta) ta.value = BS.code;
    const fn = document.getElementById('b-fname');
    if (fn) fn.value = BS.fileName;
    saveBuildState();
  };
  reader.readAsText(file);
};

window.bSaveLocal = function() { BS.code = document.getElementById('b-code')?.value || BS.code; BS.fileName = document.getElementById('b-fname')?.value || BS.fileName; saveBuildState(); YM?.toast?.('Draft saved'); };

window.bLiveTest = function() {
  const code = document.getElementById('b-code')?.value || BS.code;
  const name = (document.getElementById('b-fname')?.value || 'test') + (BS.codeType==='sphere'?'.sphere.js':'.site.html');
  if (!code) { YM?.toast?.('No code to test'); return; }
  if (BS.codeType === 'sphere') {
    try {
      eval(code);
      const sphere = window.YM_S?.[name];
      if (sphere?.activate) sphere.activate(window.YM?.getCtx?.(name));
      YM?.toast?.('Sphere loaded in sandbox ✓');
    } catch(e) {
      const msg = document.getElementById('b-editor-msg');
      if (msg) msg.innerHTML = `<div style="color:#ff6b6b;font-family:'Space Mono',monospace;font-size:.72rem;margin-top:6px;white-space:pre-wrap">${e.message}</div>`;
    }
  } else {
    // Open site in a new overlay
    const blob = new Blob([code], { type:'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }
};

// ── AI ────────────────────────────────────────────────────
function renderAI(ctx) {
  const el = document.getElementById('bp-ai');
  if (!el) return;
  el.innerHTML = `
    <div class="b-card" style="margin-bottom:10px">
      <div class="b-label">AI Provider</div>
      <div class="b-seg" style="margin:6px 0">
        <button class="b-seg-btn on" id="b-ai-claude" onclick="bAIProvider('claude',this)">Claude</button>
        <button class="b-seg-btn" id="b-ai-openai" onclick="bAIProvider('openai',this)">OpenAI</button>
      </div>
      <div class="b-label">Context: active spheres API docs</div>
      <div id="b-docs-list"></div>
      <button class="b-btn b-btn-s" style="font-size:.78rem;margin-top:4px" onclick="bAddDoc()">+ Add sphere/doc</button>
    </div>

    <div id="b-ai-history" style="max-height:280px;overflow-y:auto;margin-bottom:8px"></div>

    <div class="b-label">Prompt</div>
    <textarea class="b-textarea" id="b-ai-prompt" rows="4" placeholder="Describe the sphere or site you want to build…\ne.g. 'A commerce sphere that shows nearby vendors with Solana payment integration'"></textarea>
    <div style="display:flex;gap:8px;margin-top:6px">
      <button class="b-btn b-btn-p" style="flex:1" id="b-ai-send" onclick="bAISend()">✦ Generate</button>
      <button class="b-btn b-btn-s" onclick="bAIClear()">Clear</button>
      <button class="b-btn b-btn-s" onclick="bUseCode()">→ Editor</button>
    </div>
    <div id="b-ai-msg"></div>
  `;
  renderDocsList();
  renderAIHistory();
}

let bAIProviderKey = 'claude';
window.bAIProvider = function(p, el) {
  bAIProviderKey = p;
  document.querySelectorAll('#bp-ai .b-seg-btn').forEach(b => b.classList.remove('on'));
  el.classList.add('on');
};

function renderDocsList() {
  const el = document.getElementById('b-docs-list');
  if (!el) return;
  if (!BS.linkedDocs.length) { el.innerHTML = '<div style="color:rgba(232,232,240,.35);font-size:.76rem;font-family:\'Space Mono\',monospace;margin-bottom:4px">No docs linked</div>'; return; }
  el.innerHTML = BS.linkedDocs.map((d,i) => `<div class="b-doc-item">${d.name}<button onclick="bRemoveDoc(${i})">×</button></div>`).join('');
}

window.bAddDoc = function() {
  const name = prompt('Sphere filename (e.g. mine.sphere.js):');
  if (!name) return;
  BS.linkedDocs.push({ name, content: `// API docs for ${name} would be embedded here` });
  renderDocsList();
};
window.bRemoveDoc = function(i) { BS.linkedDocs.splice(i,1); renderDocsList(); };

function buildSystemPrompt() {
  const type = BS.codeType === 'sphere' ? 'sphere (.sphere.js)' : 'site (.site.html)';
  let sys = `You are helping build a YourMine ${type}. 

YourMine is a decentralized PWA with P2P networking via Trystero. Spheres are self-contained JS files that register via window.YM_S['filename.sphere.js'] = { name, category, author, description, activate(ctx), deactivate(), getBroadcastData() }.

The ctx object provided to activate() has:
- ctx.addPill(label, renderFn) — adds bottom nav pill
- ctx.addProfileTab(label, renderFn) — adds profile tab
- ctx.addFigureTab(label, renderFn, count) — adds figure/counter tab
- ctx.updateFigureCount(n)
- ctx.toast(msg) / ctx.dialog(title, body, ok)
- ctx.p2p.send(data) / ctx.p2p.onReceive(cb)
- ctx.getProfile() / ctx.saveProfile(data)

The category must be one of: YourMine, social, commerce, transport, jeux, autres.
Use dark theme CSS vars: --bg:#111113, --accent:#c8f0a0, --title:#e8e8f0, --border:rgba(200,240,160,.15).
Font: 'Space Mono' monospace + 'Barlow Condensed' sans-serif.
Return ONLY the complete file code, no markdown fences.`;

  if (BS.linkedDocs.length) {
    sys += '\n\nLinked context:\n' + BS.linkedDocs.map(d => `--- ${d.name} ---\n${d.content}`).join('\n\n');
  }
  return sys;
}

function renderAIHistory() {
  const el = document.getElementById('b-ai-history');
  if (!el) return;
  if (!BS.aiHistory.length) { el.innerHTML = ''; return; }
  el.innerHTML = BS.aiHistory.map(m => `
    <div class="${m.role==='user'?'b-msg-user':'b-msg-ai'}">
      <div class="b-msg-role">${m.role==='user'?'You':'AI'}</div>
      <div class="b-msg-text">${escHtml(m.content.slice(0,800))}${m.content.length>800?'…':''}</div>
    </div>`).join('');
  el.scrollTop = el.scrollHeight;
}

window.bAIClear = function() { BS.aiHistory = []; renderAIHistory(); };

window.bUseCode = function() {
  // Find last AI message with code
  const last = [...BS.aiHistory].reverse().find(m => m.role === 'assistant');
  if (last) {
    BS.code = last.content;
    const ta = document.getElementById('b-code');
    if (ta) ta.value = BS.code;
    saveBuildState();
    YM?.toast?.('Code copied to editor');
  }
};

window.bAISend = async function() {
  const prompt = document.getElementById('b-ai-prompt')?.value.trim();
  if (!prompt) { YM?.toast?.('Enter a prompt'); return; }

  const hasKey = bAIProviderKey === 'claude' ? BS.claudeKey : BS.openaiKey;
  if (!hasKey) { YM?.toast?.(`Enter ${bAIProviderKey === 'claude' ? 'Claude' : 'OpenAI'} API key in Keys tab`); return; }

  BS.aiHistory.push({ role: 'user', content: prompt });
  document.getElementById('b-ai-prompt').value = '';
  const sendBtn = document.getElementById('b-ai-send');
  if (sendBtn) { sendBtn.disabled = true; sendBtn.innerHTML = '<span class="b-spinner"></span>Generating…'; }

  renderAIHistory();

  try {
    let reply = '';
    if (bAIProviderKey === 'claude') {
      const messages = BS.aiHistory.map(m => ({ role: m.role, content: m.content }));
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST',
        headers:{ 'x-api-key': BS.claudeKey, 'anthropic-version':'2023-06-01', 'content-type':'application/json' },
        body: JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:4096, system: buildSystemPrompt(), messages })
      });
      const d = await r.json();
      reply = d.content?.[0]?.text || JSON.stringify(d);
    } else {
      const messages = [{ role:'system', content: buildSystemPrompt() }, ...BS.aiHistory.map(m => ({ role:m.role, content:m.content }))];
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method:'POST',
        headers:{ Authorization: `Bearer ${BS.openaiKey}`, 'Content-Type':'application/json' },
        body: JSON.stringify({ model:'gpt-4o', messages, max_tokens:4096 })
      });
      const d = await r.json();
      reply = d.choices?.[0]?.message?.content || JSON.stringify(d);
    }
    BS.aiHistory.push({ role: 'assistant', content: reply });
    renderAIHistory();
  } catch(e) {
    BS.aiHistory.push({ role: 'assistant', content: `Error: ${e.message}` });
    renderAIHistory();
  } finally {
    if (sendBtn) { sendBtn.disabled = false; sendBtn.innerHTML = '✦ Generate'; }
  }
};

// ── PUBLISH ───────────────────────────────────────────────
function renderPublish() {
  const el = document.getElementById('bp-publish');
  if (!el) return;
  el.innerHTML = `
    <div class="b-card">
      <div class="b-label">Repository</div>
      <div style="font-family:'Space Mono',monospace;font-size:.75rem;color:#c8f0a0;margin-bottom:8px">theodoreyong9/YourMinedApp</div>
      <div class="b-label">File to publish</div>
      <div style="font-family:'Space Mono',monospace;font-size:.78rem;color:#e8e8f0;margin-bottom:12px" id="b-pub-fname">
        ${BS.fileName ? (BS.fileName + (BS.codeType==='sphere'?'.sphere.js':'.site.html')) : 'Set file name in Editor tab'}
      </div>
    </div>

    <div class="b-card">
      <div class="b-label">Publish Mode</div>
      <div class="b-seg" style="margin:6px 0">
        <button class="b-seg-btn on" id="bpm-direct" onclick="bSetPubMode('direct',this)">Direct Push</button>
        <button class="b-seg-btn" id="bpm-test" onclick="bSetPubMode('test',this)">Test First</button>
      </div>
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:.82rem;color:rgba(232,232,240,.5);line-height:1.5;margin-top:6px" id="b-pub-mode-desc">
        Push directly to the YourMine repository. Requires a valid GitHub token with repo access.
      </div>
    </div>

    <div style="margin-bottom:10px">
      <div class="b-label">Commit message</div>
      <input class="b-input" id="b-commit-msg" value="Add sphere via YourMine Build" placeholder="What does this add/change?">
    </div>

    <div style="display:flex;gap:8px">
      <button class="b-btn b-btn-p" style="flex:1" onclick="bDoPublish()">🚀 Publish</button>
      <button class="b-btn b-btn-s" style="flex:1" onclick="bJoinOrg()">Join Org</button>
    </div>
    <div id="b-publish-msg"></div>
  `;
}

let bPubMode = 'direct';
window.bSetPubMode = function(mode, el) {
  bPubMode = mode;
  document.querySelectorAll('#bp-publish .b-seg-btn').forEach(b => b.classList.remove('on'));
  el.classList.add('on');
  const desc = document.getElementById('b-pub-mode-desc');
  if (desc) desc.textContent = mode === 'direct'
    ? 'Push directly to the YourMine repository. Requires a valid GitHub token with repo access.'
    : 'Submit for testing via P2P. Nearby contacts can request the code and test together before publishing.';
};

window.bDoPublish = async function() {
  const code = BS.code || document.getElementById('b-code')?.value;
  const name = BS.fileName || document.getElementById('b-fname')?.value;
  const ext = BS.codeType === 'sphere' ? '.sphere.js' : '.site.html';
  const filename = name.endsWith(ext) ? name : name + ext;
  const msg = document.getElementById('b-commit-msg')?.value || 'Add file';

  if (!code) { YM?.toast?.('No code to publish'); return; }
  if (!name) { YM?.toast?.('Set a file name'); return; }
  if (!BS.ghToken) { YM?.toast?.('Enter GitHub token in Keys tab'); return; }

  if (bPubMode === 'test') {
    BS.testCode = code; BS.testName = filename; BS.testRequestId = Date.now().toString();
    YM?.toast?.('Test request broadcast to peers');
    return;
  }

  const ok = await YM?.dialog?.('Publish to GitHub', `Publish "${filename}" to theodoreyong9/YourMinedApp?`, 'Publish');
  if (!ok) return;

  try {
    const setMsg = (html) => { const el = document.getElementById('b-publish-msg'); if (el) el.innerHTML = html; };
    setMsg('<div style="font-family:\'Space Mono\',monospace;font-size:.75rem;color:rgba(200,240,160,.7);margin-top:8px"><span class="b-spinner"></span>Publishing…</div>');

    // Check if file exists (to get SHA for update)
    let sha = null;
    try {
      const check = await fetch(`https://api.github.com/repos/theodoreyong9/YourMinedApp/contents/${filename}`,
        { headers:{ Authorization:`token ${BS.ghToken}`, Accept:'application/vnd.github.v3+json' } });
      if (check.ok) { const d = await check.json(); sha = d.sha; }
    } catch {}

    const body = { message: msg, content: btoa(unescape(encodeURIComponent(code))), branch: 'main' };
    if (sha) body.sha = sha;

    const r = await fetch(`https://api.github.com/repos/theodoreyong9/YourMinedApp/contents/${filename}`, {
      method:'PUT',
      headers:{ Authorization:`token ${BS.ghToken}`, 'Content-Type':'application/json', Accept:'application/vnd.github.v3+json' },
      body: JSON.stringify(body)
    });

    if (r.ok) {
      setMsg('<div style="color:#c8f0a0;font-family:\'Space Mono\',monospace;font-size:.75rem;margin-top:8px">✓ Published successfully!</div>');
      YM?.toast?.('Published ✓');
    } else {
      const err = await r.json();
      setMsg(`<div style="color:#ff6b6b;font-family:'Space Mono',monospace;font-size:.72rem;margin-top:8px">${err.message || 'Publish failed'}</div>`);
    }
  } catch(e) {
    const el = document.getElementById('b-publish-msg');
    if (el) el.innerHTML = `<div style="color:#ff6b6b;font-family:'Space Mono',monospace;font-size:.72rem;margin-top:8px">${e.message}</div>`;
  }
};

window.bJoinOrg = function() {
  if (!BS.ghToken) { YM?.toast?.('Enter GitHub token first'); return; }
  YM?.toast?.('Org invite sent via bot (devnet)');
};

// ── SETTINGS ──────────────────────────────────────────────
function renderSettings() {
  const el = document.getElementById('bp-settings');
  if (!el) return;
  el.innerHTML = `
    <div class="b-card">
      <div class="b-label">GitHub Personal Access Token</div>
      <input class="b-input" type="password" id="b-gh-token" value="${BS.ghToken}" placeholder="ghp_…">
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:.78rem;color:rgba(232,232,240,.35);line-height:1.5">
        Needs repo + contents:write scope. Used to publish files.
      </div>
    </div>
    <div class="b-card">
      <div class="b-label">Claude API Key</div>
      <input class="b-input" type="password" id="b-claude-key" value="${BS.claudeKey}" placeholder="sk-ant-…">
    </div>
    <div class="b-card">
      <div class="b-label">OpenAI API Key</div>
      <input class="b-input" type="password" id="b-openai-key" value="${BS.openaiKey}" placeholder="sk-…">
    </div>
    <button class="b-btn b-btn-p" style="width:100%;margin-top:4px" onclick="bSaveKeys()">Save Keys</button>
  `;
}

window.bSaveKeys = function() {
  BS.ghToken = document.getElementById('b-gh-token')?.value.trim() || '';
  BS.claudeKey = document.getElementById('b-claude-key')?.value.trim() || '';
  BS.openaiKey = document.getElementById('b-openai-key')?.value.trim() || '';
  saveBuildState();
  YM?.toast?.('Keys saved ✓');
};

function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

})();
