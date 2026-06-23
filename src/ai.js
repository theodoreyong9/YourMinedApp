/* jshint esversion:11 */
// ai.js — YourMine AI Code Generator
(function () {
  'use strict';

  const GH_OWNER = 'theodoreyong9';
  const GH_REPO  = 'YourMinedApp';
  const RAW_BASE = 'https://raw.githubusercontent.com/' + GH_OWNER + '/' + GH_REPO + '/main/';
  const SPEC_URL = (window.YM_SPEC_OVERRIDE && window.YM_SPEC_OVERRIDE.url) || RAW_BASE + 'ym-spec.json';

  // Fallback system prompt — used only if ym-spec.json cannot be fetched.
  const FALLBACK_SYSTEM_SPHERE = `You are an expert YourMine developer. Output ONLY the complete file code. No explanation, no markdown fences, no preamble.

## SPHERE FILE (filename.sphere.js)
(function(){
'use strict';
window.YM_S = window.YM_S || {};
let _ctx = null, _timer = null;
window.YM_S['FILENAME'] = {
  name: 'Display Name',
  icon: '🔮',
  category: 'Tools',
  description: 'Under 140 chars.',

  activate(ctx) {
    _ctx = ctx;
  },

  deactivate() {
    if (_timer) { clearInterval(_timer); _timer = null; }
    _ctx = null;
  },

  renderPanel(container) {
    container.innerHTML = '<div style="padding:16px"><div class="ym-card"><div class="ym-card-title">Title</div></div></div>';
  },
};
})();

## THEME FILE (name.theme.html)
<!-- HTML fragment injected into <body> by index.html -->
<script>
window.YM_THEME_META = {"name":"ThemeName","icon":"🎨","description":"Short description"};
</script>

## CRITICAL RULES
- IIFE wrapper always — no top-level vars
- window.YM_S key MUST exactly match the filename
- activate() must complete in <8s — never await slow calls inside it
- deactivate() is a top-level method on the object, never ctx.deactivate=...

Output ONLY the complete file content. No explanation, no markdown fences.`;

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function toast(m, t) { if (window.YM_toast) window.YM_toast(m, t); }

  // ── YM_SPEC LOADING ──────────────────────────────────────────
  // ym-spec.json is generated offline by mine-patterns.js from the real
  // repo's *.sphere.js / *.theme.html files. It replaces a hand-written
  // README with a frequency-ranked, machine-readable rule set, which is
  // far more token-efficient and reliable for small local models.
  let _spec = null;
  let _specPromise = null;

  async function loadSpec(force) {
    if (_spec && !force) return _spec;
    if (_specPromise && !force) return _specPromise;
    _specPromise = (async () => {
      try {
        const r = await fetch(SPEC_URL + '?t=' + Date.now(), { cache: 'no-store' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const spec = await r.json();
        if (!spec || !spec.v) throw new Error('invalid spec');
        _spec = spec;
        return spec;
      } catch (e) {
        console.warn('[YM AI] ym-spec.json unavailable, using fallback prompt:', e.message);
        _spec = null;
        return null;
      }
    })();
    return _specPromise;
  }

  // Renders a loaded ym-spec.json into a compact system prompt.
  // userPrompt drives skeleton selection; similarExamples are real mined
  // files retrieved for this specific request (see retrieveSimilarSpheres).
  function renderSpecAsSystemPrompt(spec, type, userPrompt, similarExamples) {
    if (!spec) return FALLBACK_SYSTEM_SPHERE;
    const lines = [];
    lines.push('You are an expert YourMine developer. Output ONLY the complete file code. No explanation, no markdown fences, no preamble.');
    lines.push('');
    lines.push('# TARGET: ' + (type === 'theme' ? '.theme.html file' : '.sphere.js file'));
    lines.push('');
    if (spec.core) {
      lines.push('## STRUCTURE (mined from ' + (spec.totalFilesMined || '?') + ' real files)');
      if (spec.core.wrapper) lines.push('Wrapper: ' + spec.core.wrapper);
      if (spec.core.registry) lines.push('Registry: ' + spec.core.registry);
      if (spec.core.required_methods) lines.push('Required methods: ' + spec.core.required_methods.join(', '));
      if (spec.core.optional_methods) lines.push('Optional methods: ' + spec.core.optional_methods.join(', '));
      if (spec.core.fields) lines.push('Required fields on the object: ' + spec.core.fields.join(', '));
      lines.push('');
    }
    if (spec.ctx_api) {
      lines.push('## ctx API (only call what is documented here)');
      Object.entries(spec.ctx_api).forEach(([group, calls]) => {
        lines.push('- ' + group + ': ' + calls.join(', '));
      });
      lines.push('');
    }
    if (spec.global_api) {
      lines.push('## Global API');
      Object.entries(spec.global_api).forEach(([k, v]) => {
        lines.push('- ' + k + ': ' + v);
      });
      lines.push('');
    }
    if (spec.css_vars) {
      lines.push('## CSS variables — always use, never hardcode colors');
      lines.push(spec.css_vars.join(' '));
      lines.push('');
    }
    if (spec.ui_classes) {
      lines.push('## UI classes available');
      lines.push(spec.ui_classes.join(' '));
      lines.push('');
    }
    if (spec.required && spec.required.length) {
      lines.push('## OBSERVED PATTERNS (frequency across mined repo — treat anything >70% as mandatory)');
      spec.required.forEach(p => lines.push('- ' + p.pattern + ' — ' + p.freq + ' of files'));
      lines.push('');
    }
    if (spec.constraints) {
      lines.push('## HARD CONSTRAINTS');
      spec.constraints.forEach(c => lines.push('- ' + c));
      lines.push('');
    }
    if (spec.skeleton_by_intent) {
      const chosen = pickSkeleton(spec.skeleton_by_intent, userPrompt);
      lines.push('## SKELETON — start from this structure, fill it in, do not invent a new one');
      lines.push('### ' + chosen.intent + (chosen.matched ? ' (matched from your prompt)' : ' (default — no strong match found)'));
      lines.push(chosen.code);
      lines.push('');
    }
    if (similarExamples && similarExamples.length) {
      lines.push('## SIMILAR EXISTING FILES (real, mined from the repo — follow their conventions, do not copy verbatim)');
      similarExamples.forEach(ex => {
        lines.push('### ' + ex.filename + (ex.description ? ' — ' + ex.description : ''));
        lines.push('```');
        lines.push(ex.snippet);
        lines.push('```');
      });
      lines.push('');
    }
    if (spec.anti_patterns) {
      lines.push('## ANTI-PATTERNS — never do these');
      spec.anti_patterns.forEach(a => lines.push('- ' + a));
      lines.push('');
    }
    lines.push('Output ONLY the complete file content. No explanation, no markdown fences.');
    return lines.join('\n');
  }

  // ── INTENT DETECTION ─────────────────────────────────────────
  // Cheap keyword router: maps words in the user's prompt to a skeleton
  // key. This is the "context builder" picking ONE relevant skeleton
  // instead of dumping every skeleton into the prompt (which wastes a
  // huge chunk of a 1.5B model's limited context window).
  const INTENT_KEYWORDS = {
    p2p_game: ['game', 'jeu', 'poker', 'cards', 'match', 'multiplayer', 'p2p', 'opponent', 'turn-based', 'tour par tour', 'duel'],
    social_overlay: ['profile', 'profil', 'peer', 'social', 'friend', 'ami', 'nearby', 'overlay', 'badge', 'status'],
    widget: ['widget', 'tool', 'outil', 'utility', 'counter', 'clock', 'timer', 'note', 'tracker', 'dashboard'],
  };

  function pickSkeleton(skeletonMap, userPrompt) {
    const keys = Object.keys(skeletonMap);
    if (!keys.length) return { intent: null, code: '', matched: false };
    const p = (userPrompt || '').toLowerCase();
    let best = null, bestScore = 0;
    keys.forEach(key => {
      const words = INTENT_KEYWORDS[key] || [];
      const score = words.reduce((acc, w) => acc + (p.includes(w) ? 1 : 0), 0);
      if (score > bestScore) { bestScore = score; best = key; }
    });
    if (best) return { intent: best, code: skeletonMap[best], matched: true };
    // Default to "widget" if present, else the first available skeleton
    const fallbackKey = skeletonMap.widget ? 'widget' : keys[0];
    return { intent: fallbackKey, code: skeletonMap[fallbackKey], matched: false };
  }

  // ── SIMILAR FILE RETRIEVAL ───────────────────────────────────
  // Pulls files.json (the real registry, not the spec) and ranks entries
  // by keyword overlap with the user prompt + chosen category, fetches
  // the top matches' real code, and keeps only a short snippet of each
  // (first ~40 lines) to stay cheap on tokens.
  let _filesJsonCache = null;
  async function fetchFilesJsonForRetrieval(force) {
    if (_filesJsonCache && !force) return _filesJsonCache;
    try {
      const url = (window.YM_FILES_OVERRIDE && window.YM_FILES_OVERRIDE.url) || (RAW_BASE + 'files.json');
      const r = await fetch(url + '?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      _filesJsonCache = await r.json();
    } catch (e) {
      _filesJsonCache = [];
    }
    return _filesJsonCache;
  }

  function tokenize(s) {
    return (s || '').toLowerCase().match(/[a-z0-9]+/g) || [];
  }

  async function retrieveSimilarSpheres(userPrompt, category, topK) {
    topK = topK || 3;
    const files = await fetchFilesJsonForRetrieval();
    if (!files.length) return [];
    const queryTokens = new Set([...tokenize(userPrompt), ...tokenize(category)]);
    if (!queryTokens.size) return [];

    const scored = files.map(f => {
      // Real files.json entries are often missing name/description/category
      // (older merges, before merge.js's metadata extraction landed, or
      // extraction failed silently). filename is the one field guaranteed
      // to exist, so it's weighted highest; the rest are bonus signal.
      const filenameStem = (f.filename || '').replace(/\.sphere\.js$/, '').replace(/[-_]/g, ' ');
      const fnTokens = tokenize(filenameStem);
      const metaTokens = tokenize([f.name, f.description, f.category].filter(Boolean).join(' '));

      let score = 0;
      fnTokens.forEach(t => { if (queryTokens.has(t)) score += 3; });   // filename match = strong signal
      metaTokens.forEach(t => { if (queryTokens.has(t)) score += 1; }); // metadata match = weaker, often absent
      if (category && f.category && f.category.toLowerCase() === category.toLowerCase()) score += 2;

      return { f, score };
    }).filter(s => s.score > 0).sort((a, b) => b.score - a.score).slice(0, topK);

    const results = [];
    for (const { f } of scored) {
      const url = f.codeUrl || (RAW_BASE + (f.filename || ''));
      if (!url) continue;
      try {
        const r = await fetch(url + '?t=' + Date.now(), { cache: 'no-store' });
        if (!r.ok) continue;
        const code = await r.text();
        const snippet = code.split('\n').slice(0, 20).join('\n');
        results.push({ filename: f.filename, description: f.description || '', snippet });
      } catch {}
    }
    return results;
  }

  async function getSystemPrompt(type, userPrompt, category) {
    const spec = await loadSpec();
    let similarExamples = [];
    if (type === 'sphere' && userPrompt) {
      try { similarExamples = await retrieveSimilarSpheres(userPrompt, category, 3); } catch {}
    }
    return renderSpecAsSystemPrompt(spec, type, userPrompt, similarExamples);
  }

  // ── WEBLLM CONFIG ────────────────────────────────────────────
  const WEBLLM_CDN = 'https://esm.run/@mlc-ai/web-llm';
  const WEBLLM_MODEL = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC'; // ~900MB, fast on mobile
  let _webllmLoading = false;
  let _webllmReady = false;
  let _webllmEngine = null;
  let _webllmProgress = null; // callback for progress updates
  let _wakeLock = null;

  // On mobile, the screen turning off (or the tab being backgrounded) while
  // the ~900MB model downloads can cause the browser to tear down the
  // WebGPU device/instance. When that happens, WebLLM throws something like
  // "A valid external Instance reference no longer exists" once the screen
  // comes back — not a bug in our code, a lost GPU context. We mitigate by
  // (1) holding a screen wake lock during load, and (2) detecting the lost
  // engine and transparently recreating it once instead of crashing.
  async function _acquireWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        _wakeLock = await navigator.wakeLock.request('screen');
        _wakeLock.addEventListener('release', () => { _wakeLock = null; });
      }
    } catch (e) {
      // Wake lock can fail (denied, unsupported, low battery) — non-fatal
      console.warn('[YM AI] wake lock unavailable:', e.message);
    }
  }
  function _releaseWakeLock() {
    try { _wakeLock?.release(); } catch {}
    _wakeLock = null;
  }
  // Re-acquire if the page becomes visible again mid-load (some browsers
  // auto-release the lock when backgrounded, then allow re-acquiring).
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && _webllmLoading && !_wakeLock) {
        _acquireWakeLock();
      }
    });
  }

  function _isGpuContextLostError(e) {
    const msg = String(e && e.message || e || '');
    return /Instance reference no longer exists|device.*lost|GPUDevice|lost.*context|already.*disposed|object.*disposed/i.test(msg);
  }

  function _resetWebllmState() {
    _webllmReady = false;
    _webllmEngine = null;
    window.__webllm = null;
  }

  async function _createEngine(onProgress) {
    if (_webllmProgress !== onProgress) _webllmProgress = onProgress || null;
    if (_webllmProgress) _webllmProgress({ text: 'Initializing engine…', progress: 0 });
    const engine = await window.webllm.CreateMLCEngine(WEBLLM_MODEL, {
      initProgressCallback: (p) => {
        if (_webllmProgress) _webllmProgress({ text: p.text, progress: p.progress });
      },
    });
    return engine;
  }

  async function initWebLLM(onProgress, _isRetry) {
    if (_webllmReady && _webllmEngine) return _webllmEngine;
    if (_webllmLoading && !_isRetry) {
      // Wait for existing load
      await new Promise(r => { const iv = setInterval(() => { if (!_webllmLoading) { clearInterval(iv); r(); } }, 300); });
      if (_webllmReady) return _webllmEngine;
      // If the load that just finished failed (e.g. lost context), fall through and retry.
    }
    _webllmLoading = true;
    _webllmProgress = onProgress || null;
    await _acquireWakeLock();
    try {
      // Load WebLLM from CDN
      if (!window.webllm) {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.type = 'module';
          s.textContent = `
            import * as webllm from '${WEBLLM_CDN}';
            window.webllm = webllm;
            window.dispatchEvent(new Event('webllm-loaded'));
          `;
          document.head.appendChild(s);
          window.addEventListener('webllm-loaded', resolve, { once: true });
          setTimeout(() => reject(new Error('WebLLM CDN timeout')), 30000);
        });
      }
      let engine;
      try {
        engine = await _createEngine(onProgress);
      } catch (e) {
        if (_isGpuContextLostError(e) && !_isRetry) {
          // Screen-off / backgrounding likely killed the GPU context mid-load.
          // Reset state and retry once, now that the page is visible again.
          console.warn('[YM AI] GPU context lost during load, retrying once…');
          _webllmEngine = null; _webllmReady = false;
          if (onProgress) onProgress({ text: 'GPU context lost (screen off?) — retrying…', progress: 0 });
          _webllmLoading = false;
          return await initWebLLM(onProgress, true);
        }
        throw e;
      }
      _webllmEngine = engine;
      window.__webllm = engine;
      _webllmReady = true;
      return engine;
    } finally {
      _webllmLoading = false;
      _releaseWakeLock();
    }
  }

  // ── GENERATION ────────────────────────────────────────────────
  // 1. Ollama (desktop) → 2. Lemonade (desktop) → 3. WebLLM Q4 (universal, auto-load)
  // ── CAPABILITY PREFLIGHT ─────────────────────────────────────
  // We cannot guarantee WebGPU survives a full generation on mobile — the
  // OS can suspend a backgrounded tab regardless of Wake Lock, throttle
  // thermally, or simply not have enough free memory for a ~900MB model.
  // What we CAN do is detect upfront when conditions are clearly bad and
  // say so honestly, instead of letting the person wait through a failed
  // download/load.
  async function checkWebGpuSupport() {
    if (typeof navigator === 'undefined' || !navigator.gpu) {
      return { supported: false, reason: 'WebGPU is not available in this browser. On iOS this needs a recent Safari; on Android, a recent Chrome.' };
    }
    // navigator.gpu existing only means the API exists — it does NOT mean a
    // real adapter is behind it. Actually requesting one is the only honest
    // check; without this we only find out after downloading ~900MB.
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) {
        return { supported: false, reason: 'Unable to find a compatible GPU on this device/browser. WebGPU API is present but no adapter responded — see https://webgpureport.org/ to check support.' };
      }
    } catch (e) {
      return { supported: false, reason: 'GPU adapter request failed: ' + e.message };
    }
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
    const mem = navigator.deviceMemory; // not available on iOS, rough hint on Android/Chrome
    if (isMobile && typeof mem === 'number' && mem <= 2) {
      return { supported: true, risky: true, reason: 'This device reports ~' + mem + 'GB RAM — local AI generation may fail or be very slow. Ollama/Lemonade on a desktop is more reliable.' };
    }
    if (isMobile) {
      return { supported: true, risky: true, reason: 'Mobile WebGPU generation can be interrupted if the OS backgrounds the tab. Keep this tab in the foreground and the screen on during generation.' };
    }
    return { supported: true, risky: false };
  }

  async function detectEngine() {
    // 1. Ollama
    try {
      const r = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(800) });
      if (r.ok) {
        const d = await r.json();
        const models = (d.models || []).map(m => m.name).filter(Boolean);
        return { type: 'ollama', label: 'Ollama (local)', models: models.length ? models : ['llama3'] };
      }
    } catch {}
    // 2. Lemonade
    try {
      const r = await fetch('http://localhost:13305/api/v1/models', { signal: AbortSignal.timeout(800) });
      if (r.ok) {
        const d = await r.json();
        const models = (d.data || d.models || []).map(m => m.id || m.name || m).filter(Boolean);
        return { type: 'lemonade', label: 'Lemonade (local)', models: models.length ? models : ['default'] };
      }
    } catch {}
    // 3. WebLLM — check capability before claiming it's "always available"
    const gpu = await checkWebGpuSupport();
    if (!gpu.supported) {
      return { type: 'unsupported', label: 'No local AI engine available on this device', models: [], reason: gpu.reason };
    }
    const label = _webllmReady ? 'WebLLM ' + WEBLLM_MODEL : 'WebLLM (loading on first use…)' + (gpu.risky ? ' ⚠' : '');
    return { type: 'webllm', label, models: ['webllm'], risky: gpu.risky, riskyReason: gpu.reason };
  }

  // Default kept deliberately short: a single 4096-token call on a 1.5B
  // model in-browser is exactly what was timing out/crashing on long
  // generations. Shorter calls, chained together (see sectionedGenerate),
  // finish faster individually and survive interruptions better — losing
  // one short section costs far less than losing one giant call near the end.
  const DEFAULT_MAX_TOKENS = 1200;

  async function* streamGenerate(engine, model, systemPrompt, userPrompt, onProgress, maxTokens, _isRetry) {
    maxTokens = maxTokens || DEFAULT_MAX_TOKENS;
    if (engine.type === 'webllm') {
      // Auto-load if not ready (or reload if a previous run disposed the engine)
      const llm = await initWebLLM(onProgress);
      if (!llm) throw new Error('WebLLM failed to initialize');
      // Generation itself can take a while too — keep the screen on so the
      // GPU context doesn't get torn down mid-stream the same way it can
      // during the initial model download.
      await _acquireWakeLock();
      try {
        let stream;
        try {
          stream = await llm.chat.completions.create({
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
            temperature: 0.3, max_tokens: maxTokens, stream: true,
          });
        } catch (e) {
          if (_isGpuContextLostError(e)) {
            _resetWebllmState();
            if (!_isRetry) {
              if (onProgress) onProgress({ text: 'Engine was disposed (background/screen-off) — reloading and retrying…', progress: 0 });
              yield* streamGenerate(engine, model, systemPrompt, userPrompt, onProgress, maxTokens, true);
              return;
            }
            throw new Error('The AI engine keeps getting disposed by the OS. Reopen the AI tab, keep this tab in the foreground with the screen on, and try again.');
          }
          throw e;
        }
        try {
          for await (const chunk of stream) {
            const d = chunk.choices?.[0]?.delta?.content || '';
            if (d) yield d;
          }
        } catch (e) {
          if (_isGpuContextLostError(e)) {
            _resetWebllmState();
            throw new Error('GPU context was lost mid-generation (screen turned off or app backgrounded?). The partial output above was lost — reopen the AI tab and try again, keeping the screen on.');
          }
          throw e;
        }
      } finally {
        _releaseWakeLock();
      }
      return;
    }
    if (engine.type === 'lemonade') {
      const resp = await fetch('http://localhost:13305/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], stream: true, max_tokens: maxTokens }),
      });
      if (!resp.ok) throw new Error('Lemonade error ' + resp.status);
      yield* readSSE(resp);
      return;
    }
    if (engine.type === 'ollama') {
      const resp = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], stream: true }),
      });
      if (!resp.ok) throw new Error('Ollama error ' + resp.status);
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          try { const ev = JSON.parse(line); const d = ev.message?.content || ''; if (d) yield d; } catch {}
        }
      }
      return;
    }
    if (engine.type === 'unsupported') {
      throw new Error(engine.reason || 'No AI engine available on this device. Install Lemonade or Ollama, or use a browser with WebGPU support.');
    }
    throw new Error('No engine available. Install Lemonade or Ollama, or enable WebGPU.');
  }

  async function* readSSE(resp) {
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') return;
        try { const ev = JSON.parse(raw); const d = ev.choices?.[0]?.delta?.content || ev.delta?.text || ''; if (d) yield d; } catch {}
      }
    }
  }

  // ── SECTIONED GENERATION (for large files) ──────────────────
  // Always used for spheres now (not optional): a single 4096-token call
  // on-device was the direct cause of long generations crashing/timing out.
  // Splitting into short, separately-completed sections means each call
  // finishes faster, and if one call fails only that section is lost —
  // not the whole file.
  const SECTION_PLAN_SUFFIX = `

Before writing any code, first output a single line of JSON describing the sections you will write, like:
{"sections":["header_and_state","ui_render","p2p_logic","helpers"]}
Keep it to 3-5 sections max. Output ONLY that JSON line. Do not write code yet.`;

  async function planSections(engine, model, systemPrompt, userPrompt) {
    let full = '';
    // Manifest is tiny — cap tokens hard so this call is fast no matter what.
    for await (const chunk of streamGenerate(engine, model, systemPrompt, userPrompt + SECTION_PLAN_SUFFIX, null, 150)) {
      full += chunk;
      if (full.length > 400) break;
    }
    try {
      const m = full.match(/\{[^}]*"sections"[^}]*\}/);
      if (m) {
        const parsed = JSON.parse(m[0]);
        if (Array.isArray(parsed.sections) && parsed.sections.length) return parsed.sections.slice(0, 5);
      }
    } catch {}
    return null; // fall back to single-shot
  }

  async function* sectionedGenerate(engine, model, systemPrompt, userPrompt, filename, onProgress) {
    const sections = await planSections(engine, model, systemPrompt, userPrompt);
    if (!sections) {
      // Fallback: single-shot generation (still capped at DEFAULT_MAX_TOKENS)
      yield* streamGenerate(engine, model, systemPrompt, userPrompt, onProgress);
      return;
    }
    if (onProgress) onProgress({ text: 'Plan: ' + sections.join(', '), progress: 1 });
    let assembled = '';
    for (let i = 0; i < sections.length; i++) {
      const sec = sections[i];
      if (onProgress) onProgress({ text: 'Section ' + (i + 1) + '/' + sections.length + ': ' + sec, progress: 1 });
      const secPrompt = userPrompt +
        '\n\nYou are now writing ONLY the "' + sec + '" section of ' + filename + '.\n' +
        // Keep carried-over context short (~600 chars, not 1500) — this is
        // the per-call prompt size that matters most for speed/reliability.
        'Context so far (already written, do not repeat):\n```\n' + assembled.slice(-600) + '\n```\n' +
        'Continue writing ONLY the next part for "' + sec + '". Output raw code only, no markdown fences, no repetition of prior code.';
      let secCode = '';
      for await (const chunk of streamGenerate(engine, model, systemPrompt, secPrompt, onProgress, 900)) {
        secCode += chunk;
        yield chunk;
      }
      assembled += '\n' + secCode;
    }
  }

  // ── VALIDATION (post-generation repair hints) ────────────────
  function validateSphereCode(code, filename) {
    const issues = [];
    if (!/^\s*\(function\s*\(\s*\)\s*\{/.test(code)) issues.push('Missing top-level IIFE wrapper');
    if (!code.includes('window.YM_S')) issues.push('Missing window.YM_S registry assignment');
    if (filename && !code.includes(filename)) issues.push('window.YM_S key does not match filename "' + filename + '"');
    if (!/activate\s*\(/.test(code)) issues.push('Missing activate() method');
    if (!/deactivate\s*\(\)\s*\{/.test(code)) issues.push('Missing top-level deactivate() method');
    if (!/renderPanel\s*\(/.test(code)) issues.push('Missing renderPanel() method');
    return issues;
  }

  // ── RENDER ────────────────────────────────────────────────────
  function renderAIContent(body) {
    body.innerHTML = '';
    body.style.cssText = 'flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;display:flex;flex-direction:column;min-height:0;padding:0';

    let _type = 'sphere';
    let _engine = { type: 'none', label: 'Detecting…', models: [] };
    let _model = '';

    // Engine + spec indicator
    const engRow = document.createElement('div');
    engRow.style.cssText = 'padding:8px 14px;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap';
    body.appendChild(engRow);
    const warnRow = document.createElement('div');
    warnRow.style.cssText = 'display:none;padding:6px 14px;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0';
    body.appendChild(warnRow);

    let _specStatus = 'loading'; // loading | ok | fallback

    function updateEngBadge() {
      const ok = _engine.type !== 'none' && _engine.type !== 'unsupported';
      const specLabel = _specStatus === 'ok' ? 'spec ✓' : (_specStatus === 'fallback' ? 'spec: fallback' : 'spec…');
      engRow.innerHTML =
        '<div style="width:6px;height:6px;border-radius:50%;flex-shrink:0;background:' + (ok ? 'var(--green)' : 'var(--red)') + '"></div>' +
        '<span style="font-size:9px;color:var(--text3);flex:1;min-width:0">' + esc(_webllmReady && _engine.type==='webllm' ? 'WebLLM ' + WEBLLM_MODEL + ' ✓' : _engine.label) + '</span>' +
        '<span style="font-size:9px;color:' + (_specStatus==='ok'?'var(--green)':'var(--text3)') + ';flex-shrink:0">' + esc(specLabel) + '</span>' +
        (_engine.models.length > 1 ?
          '<select id="ai-model" style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);color:var(--text2);font-size:10px;border-radius:6px;padding:2px 6px;cursor:pointer">' +
          _engine.models.map(m => '<option value="' + esc(m) + '"' + (m === _model ? ' selected' : '') + '>' + esc(m) + '</option>').join('') +
          '</select>' : '');
      body.querySelector('#ai-model')?.addEventListener('change', e => { _model = e.target.value; });

      if (_engine.type === 'unsupported') {
        warnRow.style.display = '';
        warnRow.innerHTML = '<div class="ym-notice error" style="font-size:10px">✗ ' + esc(_engine.reason || 'No AI engine available on this device.') + '</div>';
        body.querySelector('#ai-generate') && (body.querySelector('#ai-generate').disabled = true);
      } else if (_engine.type === 'webllm' && _engine.risky && !_webllmReady) {
        warnRow.style.display = '';
        warnRow.innerHTML = '<div class="ym-notice warn" style="font-size:10px">⚠ ' + esc(_engine.riskyReason || 'Mobile generation can be unreliable.') + '</div>';
      } else {
        warnRow.style.display = 'none';
      }
    }

    detectEngine().then(eng => {
      _engine = eng;
      _model = eng.models[0] || '';
      updateEngBadge();
    });
    loadSpec().then(spec => { _specStatus = spec ? 'ok' : 'fallback'; updateEngBadge(); });
    updateEngBadge();

    // Type toggle
    const typeRow = document.createElement('div');
    typeRow.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0';
    typeRow.innerHTML =
      '<div style="font-family:var(--font-d);font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text2);flex:1">Generate</div>' +
      '<div style="display:flex;gap:0;border:1px solid rgba(255,255,255,.12);border-radius:8px;overflow:hidden">' +
        '<button id="ai-type-sphere" style="background:rgba(240,168,48,.12);border:none;color:var(--gold);font-size:10px;padding:5px 12px;cursor:pointer">⬡ Sphere</button>' +
        '<button id="ai-type-theme"  style="background:none;border:none;color:var(--text3);font-size:10px;padding:5px 12px;cursor:pointer">🎨 Thème</button>' +
      '</div>';
    body.appendChild(typeRow);

    // Prompt
    const promptWrap = document.createElement('div');
    promptWrap.style.cssText = 'padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0';
    promptWrap.innerHTML =
      '<div style="font-family:var(--font-d);font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text2);margin-bottom:8px">Prompt</div>' +
      '<textarea id="ai-prompt" class="ym-input" rows="6" style="font-size:12px;font-family:var(--font-b);line-height:1.5;width:100%;box-sizing:border-box;resize:vertical" placeholder="Describe what to generate…"></textarea>';
    body.appendChild(promptWrap);

    // Category
    const optsWrap = document.createElement('div');
    optsWrap.style.cssText = 'padding:8px 14px;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0';
    optsWrap.innerHTML =
      '<div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Category</div>' +
      '<input id="ai-cat" class="ym-input" placeholder="Tools" style="font-size:11px;width:100%;box-sizing:border-box">' +
      '<div style="font-size:9px;color:var(--text3);margin-top:6px">Generation runs in short chunks automatically — more reliable than one long call.</div>';
    body.appendChild(optsWrap);

    // Generate button
    if (!document.getElementById('ym-ai-spin-style')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'ym-ai-spin-style';
      styleEl.textContent = '@keyframes ym-ai-spin{to{transform:rotate(360deg)}}';
      document.head.appendChild(styleEl);
    }
    const genWrap = document.createElement('div');
    genWrap.style.cssText = 'padding:10px 14px;flex-shrink:0;border-bottom:1px solid rgba(255,255,255,.06)';
    genWrap.innerHTML =
      '<button id="ai-generate" class="ym-btn ym-btn-accent" style="width:100%;font-size:13px;padding:12px;display:flex;align-items:center;justify-content:center;gap:8px">' +
        '<span id="ai-spinner" style="display:none;width:13px;height:13px;border:2px solid rgba(0,0,0,.25);border-top-color:currentColor;border-radius:50%;animation:ym-ai-spin .7s linear infinite;flex-shrink:0"></span>' +
        '<span id="ai-generate-label">✦ Generate</span>' +
      '</button>' +
      '<div id="ai-progress" style="font-size:10px;color:var(--text3);margin-top:6px;min-height:14px;text-align:center"></div>';
    body.appendChild(genWrap);

    // Output
    const outWrap = document.createElement('div');
    outWrap.style.cssText = 'flex:1;display:flex;flex-direction:column;min-height:0;padding:10px 14px 0';
    outWrap.innerHTML =
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-shrink:0">' +
        '<div style="font-family:var(--font-d);font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text2);flex:1">Output</div>' +
        '<span id="ai-chars" style="font-size:9px;color:var(--text3)">0 chars</span>' +
        '<button id="ai-copy" class="ym-btn ym-btn-ghost" style="font-size:9px;padding:3px 9px">⎘ Copy</button>' +
      '</div>' +
      '<textarea id="ai-output" class="ym-input" style="flex:1;min-height:180px;font-family:var(--font-m);font-size:10px;line-height:1.6;resize:vertical;box-sizing:border-box;margin-bottom:6px" placeholder="Generated code appears here…" spellcheck="false"></textarea>' +
      '<div id="ai-validate" style="font-size:10px;margin-bottom:14px;min-height:14px"></div>';
    body.appendChild(outWrap);

    // Type toggle wiring
    function setType(t) {
      _type = t;
      const sBtn  = typeRow.querySelector('#ai-type-sphere');
      const thBtn = typeRow.querySelector('#ai-type-theme');
      if (t === 'sphere') {
        sBtn.style.cssText  = 'background:rgba(240,168,48,.12);border:none;color:var(--gold);font-size:10px;padding:5px 12px;cursor:pointer';
        thBtn.style.cssText = 'background:none;border:none;color:var(--text3);font-size:10px;padding:5px 12px;cursor:pointer';
      } else {
        thBtn.style.cssText = 'background:rgba(8,224,248,.12);border:none;color:var(--cyan);font-size:10px;padding:5px 12px;cursor:pointer';
        sBtn.style.cssText  = 'background:none;border:none;color:var(--text3);font-size:10px;padding:5px 12px;cursor:pointer';
      }
    }
    typeRow.querySelector('#ai-type-sphere').addEventListener('click', () => setType('sphere'));
    typeRow.querySelector('#ai-type-theme').addEventListener('click',  () => setType('theme'));

    // Generate
    body.querySelector('#ai-generate').addEventListener('click', async () => {
      const prompt    = (body.querySelector('#ai-prompt')?.value || '').trim();
      const cat       = (body.querySelector('#ai-cat')?.value || '').trim() || 'Tools';
      const outEl     = body.querySelector('#ai-output');
      const progEl    = body.querySelector('#ai-progress');
      const charsEl   = body.querySelector('#ai-chars');
      const valEl     = body.querySelector('#ai-validate');
      const genBtn    = body.querySelector('#ai-generate');

      if (!prompt) { toast('Enter a prompt first', 'warn'); return; }

      const ext      = _type === 'sphere' ? '.sphere.js' : '.theme.html';
      const slug     = prompt.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24).replace(/-$/, '');
      const filename = slug + ext;

      progEl.textContent = 'Building context (similar files + skeleton)…';
      const systemPrompt = await getSystemPrompt(_type, prompt, cat);

      const userPrompt = [
        'Generate a YourMine ' + _type + ' file.',
        'Filename: ' + filename,
        'Category: ' + cat,
        '',
        'Requirements:',
        prompt,
      ].join('\n');

      genBtn.disabled = true;
      const spinnerEl = body.querySelector('#ai-spinner');
      const labelEl = body.querySelector('#ai-generate-label');
      if (spinnerEl) spinnerEl.style.display = '';
      if (labelEl) labelEl.textContent = 'Generating…';
      outEl.value = '';
      charsEl.textContent = '0 chars';
      valEl.textContent = '';
      progEl.textContent = _engine.type === 'webllm' && !_webllmReady ? 'Loading AI model (first time ~1GB) — keep screen on…' : 'Starting…';

      // Progress callback for WebLLM download
      function onProgress(p) {
        if (!p) return;
        if (p.progress < 1) {
          const pct = Math.round(p.progress * 100);
          progEl.innerHTML = '<span style="color:var(--cyan)">⬇ ' + pct + '% — ' + esc(p.text || 'Loading model…') + '</span>';
        } else {
          progEl.textContent = p.text || 'Generating…';
        }
      }

      let fullCode = '';
      let tokenCount = 0;
      const t0 = Date.now();
      let _gotFirstChunk = false;

      // Heartbeat: without this, the UI looks frozen during the gap between
      // "model loaded" and "first token arrives" (the model is processing
      // the system prompt + retrieved examples, which can take a while on
      // a 1.5B model on a phone CPU/GPU). This makes it visibly alive.
      const heartbeat = setInterval(() => {
        if (_gotFirstChunk) return;
        if (_engine.type === 'webllm' && !_webllmReady) return; // download progress owns the text during load
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        progEl.innerHTML = '<span style="color:var(--cyan)">⏳ Processing prompt… ' + elapsed + 's (no output yet is normal here)</span>';
      }, 1000);

      try {
        const gen = _type === 'sphere'
          ? sectionedGenerate(_engine, _model, systemPrompt, userPrompt, filename, onProgress)
          : streamGenerate(_engine, _model, systemPrompt, userPrompt, onProgress);

        for await (const chunk of gen) {
          _gotFirstChunk = true;
          fullCode += chunk;
          tokenCount++;
          outEl.value = fullCode;
          outEl.scrollTop = outEl.scrollHeight;
          charsEl.textContent = fullCode.length + ' chars';
          if (tokenCount % 5 === 0) {
            const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
            progEl.textContent = '⚡ Generating… ' + fullCode.length + ' chars · ' + elapsed + 's';
          }
        }
        clearInterval(heartbeat);
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        if (!fullCode) {
          progEl.innerHTML = '<span style="color:var(--red)">✗ Model returned no output after ' + elapsed + 's — try again or shorten the prompt</span>';
        } else {
          progEl.innerHTML = '<span style="color:var(--green)">✓ Done in ' + elapsed + 's — ' + fullCode.length + ' chars</span>';
        }

        if (_type === 'sphere' && fullCode) {
          const issues = validateSphereCode(fullCode, filename);
          if (issues.length) {
            valEl.innerHTML = '<span style="color:var(--red)">⚠ ' + issues.map(esc).join(' · ') + '</span>';
          } else {
            valEl.innerHTML = '<span style="color:var(--green)">✓ Structure looks valid</span>';
          }
        }
        if (fullCode) toast('Code generated!', 'success');
      } catch (e) {
        clearInterval(heartbeat);
        progEl.innerHTML = '<span style="color:var(--red)">✗ ' + esc(e.message) + '</span>';
        toast(e.message, 'error');
      } finally {
        genBtn.disabled = false;
        if (spinnerEl) spinnerEl.style.display = 'none';
        if (labelEl) labelEl.textContent = '✦ Generate';
      }
    });

    // Copy
    body.querySelector('#ai-copy').addEventListener('click', () => {
      const code = body.querySelector('#ai-output')?.value || '';
      if (!code) { toast('Nothing to copy', 'warn'); return; }
      navigator.clipboard?.writeText(code)
        .then(() => toast('Copied!', 'success'))
        .catch(() => {
          const ta = document.createElement('textarea');
          ta.value = code; ta.style.cssText = 'position:fixed;opacity:0';
          document.body.appendChild(ta); ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          toast('Copied!', 'success');
        });
    });
  }

  // ── PATCH YM_Build.render ──────────────────────────────────────
  // Ensures YM_Build exposes the AI tab even if build.js loaded first
  // without an AI entry point (older cached builds).
  function _patchBuildRender() {
    if (!window.YM_Build) return false;
    if (window.YM_Build.__ai) return true;
    const origRender = window.YM_Build.render;
    window.YM_Build.render = async function (containerArg, presetType) {
      await origRender.call(this, containerArg, presetType);
    };
    window.YM_Build.__ai = true;
    return true;
  }

  // ── BOOT ──────────────────────────────────────────────────────
  (function boot() {
    loadSpec(); // kick off spec fetch early so it's warm by the time the panel opens
    _patchBuildRender();
    let n = 0;
    const iv = setInterval(() => {
      n++;
      if (_patchBuildRender()) clearInterval(iv);
      if (n > 60) clearInterval(iv);
    }, 500);
  })();

  window.YM_AI = {
    renderAIContent,
    getSystemPrompt,
    loadSpec,
    validateSphereCode,
    SYSTEM_SPHERE: FALLBACK_SYSTEM_SPHERE,
  };

})();
