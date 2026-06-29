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

  // ── DIAGNOSTIC LOG ───────────────────────────────────────────
  // On mobile there's no convenient devtools console to read. Without
  // visibility into what's actually happening, every "fix" so far has been
  // a guess. This makes the real timeline visible in the app itself,
  // including — critically — what an abandoned (timed-out) call eventually
  // does. Our timeout logic uses Promise.race: when the timer wins, we
  // throw OUR error, but the real model call keeps running unobserved. If
  // it later succeeds or fails, that information was being thrown away.
  // Now it gets logged, which is the only way to actually tell "truly
  // stuck forever" apart from "just slower than our timeout guess".
  const _debugLog = [];
  function dlog(msg) {
    const t = ((performance.now ? performance.now() : Date.now()) / 1000).toFixed(2);
    _debugLog.push('[' + t + 's] ' + msg);
    if (_debugLog.length > 200) _debugLog.shift();
    console.log('[YM AI]', msg);
    if (window.__ymAiDebugUpdate) window.__ymAiDebugUpdate();
  }

  // ── DRAFT PERSISTENCE ────────────────────────────────────────
  // Saved at every section boundary (not mid-section — that would need
  // exact token-level resume, not worth the complexity). On reload, if a
  // draft exists, the UI offers "Continue" to resume from the last
  // completed section instead of starting over from scratch.
  const DRAFT_KEY = 'ym_ai_draft_v1';

  function saveDraft(partial) {
    try {
      const existing = loadDraftRaw() || {};
      const merged = Object.assign({}, existing, partial, { ts: Date.now() });
      localStorage.setItem(DRAFT_KEY, JSON.stringify(merged));
    } catch (e) { /* storage full/unavailable — non-fatal, just no resume */ }
  }
  function loadDraftRaw() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
  }


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
      lines.push('## OBSERVED PATTERNS (>70% of files)');
      spec.required.slice(0, 6).forEach(p => lines.push('- ' + p.pattern + ' — ' + p.freq));
      lines.push('');
    }
    if (spec.constraints) {
      lines.push('## HARD CONSTRAINTS');
      spec.constraints.slice(0, 4).forEach(c => lines.push('- ' + c));
      lines.push('');
    }
    if (spec.skeleton_by_intent) {
      const chosen = pickSkeleton(spec.skeleton_by_intent, userPrompt);
      lines.push('## SKELETON — start from this structure, fill it in, do not invent a new one');
      lines.push('### ' + chosen.intent);
      lines.push(chosen.code);
      lines.push('');
    }
    if (similarExamples && similarExamples.length) {
      lines.push('## SIMILAR EXISTING FILE (real, mined from the repo — follow its conventions, do not copy verbatim)');
      // Only the single best match by default — more examples means a
      // bigger prompt the model has to read before it can respond at all,
      // which is exactly what was causing the "stuck at 0 lines" hang.
      const ex = similarExamples[0];
      lines.push('### ' + ex.filename + (ex.description ? ' — ' + ex.description : ''));
      lines.push('```');
      lines.push(ex.snippet);
      lines.push('```');
      lines.push('');
    }
    if (spec.anti_patterns) {
      lines.push('## ANTI-PATTERNS — never do these');
      spec.anti_patterns.slice(0, 4).forEach(a => lines.push('- ' + a));
      lines.push('');
    }
    lines.push('Output ONLY the complete file content. No explanation, no markdown fences.');
    let prompt = lines.join('\n');
    // Hard cap — a smaller prompt means faster prefill on a 1.5B model
    // before the first token can even appear. If still too long, trim from
    // the middle (keep the start: core rules; and the end: the instruction).
    const HARD_CAP = 3200;
    if (prompt.length > HARD_CAP) {
      const headKeep = Math.floor(HARD_CAP * 0.7);
      const tailKeep = HARD_CAP - headKeep;
      prompt = prompt.slice(0, headKeep) + '\n…(trimmed for speed)…\n' + prompt.slice(-tailKeep);
    }
    return prompt;
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
    const intent = detectIntent(userPrompt, keys);
    return { intent, code: skeletonMap[intent], matched: true };
  }

  function detectIntent(userPrompt, candidateKeys) {
    const keys = candidateKeys || Object.keys(INTENT_KEYWORDS);
    const p = (userPrompt || '').toLowerCase();
    let best = null, bestScore = 0;
    keys.forEach(key => {
      const words = INTENT_KEYWORDS[key] || [];
      const score = words.reduce((acc, w) => acc + (p.includes(w) ? 1 : 0), 0);
      if (score > bestScore) { bestScore = score; best = key; }
    });
    if (best) return best;
    return keys.includes('widget') ? 'widget' : keys[0];
  }

  // Deterministic, fixed section plans per intent — no model call needed.
  // This is what used to be a separate "ask the model for a JSON plan"
  // round-trip; that extra call was itself a common stuck point (model
  // never responds → whole generation hangs before any code appears).
  // Skipping it removes one full model round-trip and one failure mode.
  const FIXED_SECTION_PLANS = {
    widget:         ['structure_and_state', 'render_panel'],
    p2p_game:       ['structure_and_state', 'p2p_handlers', 'render_panel', 'broadcast_data'],
    social_overlay: ['structure_and_state', 'render_panel', 'peer_section'],
  };
  function getFixedSectionPlan(userPrompt) {
    const intent = detectIntent(userPrompt);
    return FIXED_SECTION_PLANS[intent] || FIXED_SECTION_PLANS.widget;
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
      try { similarExamples = await retrieveSimilarSpheres(userPrompt, category, 1); } catch {}
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
  let _webllmWorker = null;

  // Dedicated Worker (not a Service Worker — different thing entirely).
  // WebGPU has always been natively supported in dedicated Workers, so this
  // is the correct mechanism for surviving tab-switching while the page
  // stays open. The previous attempt at this broke for an unrelated reason:
  // an artificial 90s handshake timeout would sometimes fire while the
  // worker was still legitimately loading (measured: 40-90s is normal on
  // slower devices), and falling back to a second, main-thread engine
  // without first cancelling the worker's in-flight download caused two
  // simultaneous ~900MB downloads. The fix is not to drop the Worker — it's
  // to not race it against a guessed timeout and not run two engines at
  // once. One engine type, decided once, no fallback mid-flight.
  function _createWorker() {
    const code = `
      import * as webllm from '${WEBLLM_CDN}';
      const handler = new webllm.WebWorkerMLCEngineHandler();
      self.onmessage = (msg) => { handler.onmessage(msg); };
    `;
    const blob = new Blob([code], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url, { type: 'module' });
    worker.addEventListener('error', (e) => dlog('worker error event: ' + e.message));
    return worker;
  }

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
    try { _webllmWorker?.terminate(); } catch {}
    _webllmWorker = null;
  }

  // Terminate the worker when the page is actually closed/navigated away
  // from — otherwise it (and the GPU work it's doing) can keep running
  // after the tab visually closes. pagehide is more reliable than
  // beforeunload on mobile browsers.
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', _resetWebllmState);
    window.addEventListener('beforeunload', _resetWebllmState);
  }

  async function _createEngine(onProgress) {
    if (_webllmProgress !== onProgress) _webllmProgress = onProgress || null;
    if (_webllmProgress) _webllmProgress({ text: 'Initializing engine (worker)…', progress: 0 });
    dlog('CreateWebWorkerMLCEngine() called for model ' + WEBLLM_MODEL);
    const _t0 = performance.now ? performance.now() : Date.now();
    if (!_webllmWorker) _webllmWorker = _createWorker();
    // No timeout race here — a slow load is not a stuck load. If it never
    // resolves, that's what Stop is for.
    const engine = await window.webllm.CreateWebWorkerMLCEngine(_webllmWorker, WEBLLM_MODEL, {
      initProgressCallback: (p) => {
        dlog('load progress: ' + Math.round((p.progress || 0) * 100) + '% — ' + (p.text || ''));
        if (_webllmProgress) _webllmProgress({ text: p.text, progress: p.progress });
      },
    });
    dlog('CreateWebWorkerMLCEngine() resolved after ' + (((performance.now ? performance.now() : Date.now()) - _t0) / 1000).toFixed(1) + 's — engine object obtained');
    return engine;
  }


  async function initWebLLM(onProgress, _isRetry) {
    if (_webllmReady && _webllmEngine) { dlog('initWebLLM: already ready, reusing engine'); return _webllmEngine; }
    if (_webllmLoading && !_isRetry) {
      // Wait for existing load
      await new Promise(r => { const iv = setInterval(() => { if (!_webllmLoading) { clearInterval(iv); r(); } }, 300); });
      if (_webllmReady) return _webllmEngine;
      // If the load that just finished failed (e.g. lost context), fall through and retry.
    }
    _webllmLoading = true;
    _webllmProgress = onProgress || null;
    dlog('initWebLLM: starting' + (_isRetry ? ' (retry)' : ''));
    await _acquireWakeLock();
    try {
      // Load WebLLM from CDN
      if (!window.webllm) {
        dlog('loading webllm library from CDN…');
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
        dlog('webllm library loaded from CDN');
      } else {
        dlog('webllm library already present');
      }
      let engine;
      try {
        engine = await _createEngine(onProgress);
      } catch (e) {
        dlog('engine creation FAILED: ' + e.message);
        if (_isGpuContextLostError(e) && !_isRetry) {
          // Screen-off / backgrounding likely killed the GPU context mid-load.
          // Reset state and retry once, now that the page is visible again.
          console.warn('[YM AI] GPU context lost during load, retrying once…');
          _webllmEngine = null; _webllmReady = false;
          try { _webllmWorker?.terminate(); } catch {}
          _webllmWorker = null;
          if (onProgress) onProgress({ text: 'GPU context lost (screen off?) — retrying…', progress: 0 });
          _webllmLoading = false;
          return await initWebLLM(onProgress, true);
        }
        throw e;
      }
      _webllmEngine = engine;
      window.__webllm = engine;
      _webllmReady = true;
      dlog('initWebLLM: ready — _webllmReady=true');
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
  function _withTimeout(promise, ms, message) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
    ]);
  }

  async function checkWebGpuSupport() {
    if (typeof navigator === 'undefined' || !navigator.gpu) {
      return { supported: false, reason: 'WebGPU is not available in this browser. On iOS this needs a recent Safari; on Android, a recent Chrome.' };
    }
    // We used to also call navigator.gpu.requestAdapter() here on the main
    // thread just to pre-check compatibility. That created a SECOND,
    // separate WebGPU adapter/context alongside the one the Worker creates
    // for the actual engine — and there is no API to release a GPUAdapter
    // from JS once requested, so it lingers until garbage collected. Doing
    // this on every panel visit (no full reload needed to retrigger it)
    // accumulates live GPU contexts across a testing session, which is a
    // very plausible contributor to the spontaneous "Instance reference no
    // longer exists" device loss seen during generation. Removed: the
    // Worker's own engine creation is the real, single, sufficient test —
    // it already has clear error handling if the device truly can't run it.
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
    const mem = navigator.deviceMemory; // not available on iOS, rough hint on Android/Chrome
    if (isMobile && typeof mem === 'number' && mem <= 2) {
      return { supported: true, risky: true, reason: 'This device reports ~' + mem + 'GB RAM — local AI generation may fail or be very slow. Ollama/Lemonade on a desktop is more reliable.' };
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

  // Wraps an async generator so that if no new chunk arrives within
  // `timeoutMs`, it throws instead of hanging silently forever. This is
  // what was missing: "Processing prompt…" with no timeout meant a stuck
  // model call just sat there with zero feedback and zero way out.
  // A manually-resolvable "stop" signal. Previously, clicking Stop only
  // terminated the worker silently — it did NOT unblock the `await` that
  // was waiting on a response from that worker, because terminating a
  // worker does not reject pending postMessage-based promises in most
  // implementations. The UI looked stuck even after "Engine terminated"
  // because the underlying wait was never actually cancelled. This fixes
  // that: Stop now races against the wait directly, every time.
  let _stopSignalResolve = null;
  function _newStopSignal() {
    return new Promise((resolve) => { _stopSignalResolve = resolve; });
  }
  function _triggerStop() {
    if (_stopSignalResolve) { _stopSignalResolve(); _stopSignalResolve = null; }
  }

  // No timer-based timeout anymore — only Stop interrupts. Guessed timeout
  // durations (25s, 75s, 100s...) kept being wrong for real device behavior
  // (model loads/reloads taking 40-90s, generation bursts varying wildly)
  // and caused premature aborts/retries that made things worse, not better.
  // If the model is going to respond, let it; if it's truly stuck, the
  // person can see that nothing is happening and tap Stop themselves.
  async function* withStopSignal(gen, stopSignal) {
    const it = gen[Symbol.asyncIterator] ? gen[Symbol.asyncIterator]() : gen;
    while (true) {
      let result;
      if (stopSignal) {
        result = await Promise.race([
          it.next(),
          stopSignal.then(() => { throw new Error('__STOPPED_BY_USER__'); }),
        ]);
      } else {
        result = await it.next();
      }
      if (result.done) return;
      yield result.value;
    }
  }

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
        const promptChars = systemPrompt.length + userPrompt.length;
        dlog('calling chat.completions.create — prompt ~' + promptChars + ' chars, max_tokens=' + maxTokens);
        const _t0 = performance.now ? performance.now() : Date.now();
        try {
          stream = await llm.chat.completions.create({
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
            temperature: 0.3, max_tokens: maxTokens, stream: true,
          });
          dlog('create() resolved after ' + (((performance.now ? performance.now() : Date.now()) - _t0) / 1000).toFixed(1) + 's — stream object obtained, now waiting for first chunk…');
        } catch (e) {
          dlog('create() THREW after ' + (((performance.now ? performance.now() : Date.now()) - _t0) / 1000).toFixed(1) + 's: ' + e.message);
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
          let gotAny = false;
          for await (const chunk of stream) {
            if (!gotAny) {
              gotAny = true;
              dlog('FIRST CHUNK received after ' + (((performance.now ? performance.now() : Date.now()) - _t0) / 1000).toFixed(1) + 's total');
            }
            const d = chunk.choices?.[0]?.delta?.content || '';
            if (d) yield d;
          }
          dlog('stream finished normally, ' + (((performance.now ? performance.now() : Date.now()) - _t0) / 1000).toFixed(1) + 's total');
        } catch (e) {
          dlog('stream iteration THREW after ' + (((performance.now ? performance.now() : Date.now()) - _t0) / 1000).toFixed(1) + 's: ' + e.message);
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
  // not the whole file. onSection lets the UI render each block as it
  // starts/streams/finishes, instead of one opaque blob of text.
  //
  // Section planning used to be a model call (ask for a JSON manifest
  // before writing code). That call was itself getting stuck with no
  // output — one more model round-trip is one more place to hang. It's
  // now done locally and instantly via getFixedSectionPlan(), based on the
  // same intent detection the context builder already uses for skeleton
  // selection. No model call, no extra latency, no extra failure point.

  // resumeState: { sections, completedIndex, assembled } — when provided,
  // skips planning and continues from where a previous run left off
  // (see the localStorage draft system below).
  async function* sectionedGenerate(engine, model, systemPrompt, userPrompt, filename, onProgress, onSection, resumeState, stopSignal) {
    let sections, startIndex = 0, assembled = '';
    if (resumeState && resumeState.sections) {
      sections = resumeState.sections;
      startIndex = resumeState.completedIndex || 0;
      assembled = resumeState.assembled || '';
      if (onSection) sections.forEach((s, i) => onSection(i, sections.length, s, i < startIndex ? 'done' : 'pending', i < startIndex ? null : ''));
    } else {
      sections = getFixedSectionPlan(userPrompt);
      if (onSection) sections.forEach((s, i) => onSection(i, sections.length, s, 'pending', ''));
    }

    for (let i = startIndex; i < sections.length; i++) {
      const sec = sections[i];
      // (Section name/progress is already visible in the block list below —
      // no need to also repeat it in the main status line.)
      if (onSection) onSection(i, sections.length, sec, 'active', '');

      let secCode = '';
      let attempt = 0;
      // Instead of one long call per section, do several short bursts with
      // a pause between them. The device's GPU context was observed to
      // spontaneously die ~11s into continuous generation — almost
      // certainly a thermal/power cutoff, not something we can negotiate
      // with. Keeping each individual call short and giving the GPU a
      // breather between calls is the lever we actually have: it can't
      // guarantee stability, but it directly targets the one measured
      // failure pattern instead of guessing at something else.
      const MICRO_BURST_TOKENS = 120;
      const MICRO_BURST_PAUSE_MS = 600;
      const MAX_BURSTS_PER_SECTION = 6;
      while (attempt < 2) {
        attempt++;
        secCode = '';
        try {
          for (let burst = 0; burst < MAX_BURSTS_PER_SECTION; burst++) {
            if (burst > 0) {
              dlog('pausing ' + MICRO_BURST_PAUSE_MS + 'ms before next burst (let GPU settle)…');
              await new Promise(r => setTimeout(r, MICRO_BURST_PAUSE_MS));
            }
            const burstPrompt = userPrompt +
              '\n\nYou are now writing ONLY the "' + sec + '" section of ' + filename + '.\n' +
              'Already written for this section so far (do not repeat):\n```\n' + secCode.slice(-600) + '\n```\n' +
              'Continue writing ONLY the next part for "' + sec + '". If this section is already complete, output nothing. Output raw code only, no markdown fences.';
            dlog('section "' + sec + '" burst ' + (burst + 1) + '/' + MAX_BURSTS_PER_SECTION + ' (attempt ' + attempt + ', ' + MICRO_BURST_TOKENS + ' tokens max)');
            let burstCode = '';
            const gen = withStopSignal(
              streamGenerate(engine, model, systemPrompt, burstPrompt, onProgress, MICRO_BURST_TOKENS),
              stopSignal
            );
            for await (const chunk of gen) {
              burstCode += chunk;
              secCode += chunk;
              if (onSection) onSection(i, sections.length, sec, 'active', secCode);
              yield chunk;
            }
            // Model signaled it has nothing more to add for this section —
            // stop bursting instead of spending more calls/GPU time on it.
            if (!burstCode || burstCode.trim().length < 3) {
              dlog('section "' + sec + '" — model produced no further content, section considered done');
              break;
            }
          }
          break; // attempt succeeded
        } catch (e) {
          if (e.message === '__STOPPED_BY_USER__') {
            if (onSection) onSection(i, sections.length, sec, 'error', secCode);
            saveDraft({ sections, completedIndex: i, assembled });
            throw new Error('Stopped by user.');
          }
          // Only a real thrown error (e.g. GPU context lost) lands here now
          // — never a guessed timeout. One retry for that case; if it
          // happens again, stop and say so honestly instead of looping.
          if (attempt >= 2) {
            if (onSection) onSection(i, sections.length, sec, 'error', secCode);
            saveDraft({ sections, completedIndex: i, assembled });
            throw e;
          }
          dlog('section "' + sec + '" error: ' + e.message + ' — retrying…');
          if (onProgress) onProgress({ text: 'Retrying…', progress: 1 });
        }
      }
      assembled += '\n' + secCode;
      if (onSection) onSection(i, sections.length, sec, 'done', secCode);
      saveDraft({ sections, completedIndex: i + 1, assembled });
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
  async function renderAIContent(body) {
    body.innerHTML = '';
    body.style.cssText = 'flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;display:flex;flex-direction:column;min-height:0;padding:0';

    // ── Compatibility check FIRST, before building any form ──────
    // This used to happen silently in the background while the (disabled)
    // form was already visible. Now nothing else renders until we know
    // whether this device can actually run something.
    body.innerHTML =
      '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:40px 20px;text-align:center">' +
        '<span style="width:20px;height:20px;border:2px solid rgba(255,255,255,.15);border-top-color:var(--gold);border-radius:50%;animation:ym-ai-spin .7s linear infinite"></span>' +
        '<div style="font-size:11px;color:var(--text3)">Checking device compatibility…</div>' +
      '</div>';
    if (!document.getElementById('ym-ai-spin-style')) {
      const styleEl0 = document.createElement('style');
      styleEl0.id = 'ym-ai-spin-style';
      styleEl0.textContent = '@keyframes ym-ai-spin{to{transform:rotate(360deg)}}';
      document.head.appendChild(styleEl0);
    }

    let _detectedEngine;
    try {
      _detectedEngine = await _withTimeout(detectEngine(), 12000, 'Compatibility check timed out after 12s.');
    } catch (e) {
      _detectedEngine = { type: 'unsupported', label: 'Detection failed', models: [], reason: e.message + ' Your browser may not support the checks needed for local AI on this device.' };
    }

    if (_detectedEngine.type === 'unsupported') {
      body.innerHTML =
        '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:32px 20px;text-align:center">' +
          '<span style="font-size:32px">✗</span>' +
          '<div style="font-size:13px;font-weight:600;color:var(--text)">No local AI engine available on this device</div>' +
          '<div style="font-size:11px;color:var(--text3);line-height:1.6;max-width:320px">' + esc(_detectedEngine.reason || '') + '</div>' +
          '<div style="display:flex;gap:8px;width:100%;max-width:280px;margin-top:6px">' +
            '<button id="ai-copy-prompt" class="ym-btn ym-btn-ghost" style="flex:1;font-size:11px;padding:10px">⎘ Copy prompt</button>' +
            '<button id="ai-exit" class="ym-btn ym-btn-danger" style="flex:1;font-size:11px;padding:10px">✕ Exit</button>' +
          '</div>' +
        '</div>';
      body.querySelector('#ai-copy-prompt')?.addEventListener('click', () => {
        const promptText = 'yourmine-dapp.web.app/readme is the prompt realizing my will and you are the engine through which I will formulate the new orchestration.';
        navigator.clipboard?.writeText(promptText).then(() => {
          toast('Prompt copied — paste it in your AI', 'success');
        }).catch(() => {
          const ta = document.createElement('textarea');
          ta.value = promptText; ta.style.cssText = 'position:fixed;opacity:0';
          document.body.appendChild(ta); ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          toast('Prompt copied — paste it in your AI', 'success');
        });
      });
      body.querySelector('#ai-exit')?.addEventListener('click', () => {
        // ai.js doesn't own the surrounding panel/navigation — build.js
        // listens for this and routes back to the main Build flow.
        window.dispatchEvent(new CustomEvent('ym:ai-exit'));
      });
      return;
    }
    if (_detectedEngine.type === 'webllm' && _detectedEngine.risky) {
      dlog('device check: risky — ' + _detectedEngine.riskyReason);
    } else {
      dlog('device check: OK — ' + _detectedEngine.label);
    }

    body.innerHTML = '';
    let _type = 'sphere';
    let _engine = _detectedEngine;
    let _model = _engine.models[0] || '';

    // One clean status line. Silent when things are fine — only speaks up
    // when there's something the person actually needs to know.
    const statusRow = document.createElement('div');
    statusRow.style.cssText = 'padding:10px 14px;display:flex;align-items:center;gap:8px;flex-shrink:0;font-size:11px;color:var(--text3)';
    body.appendChild(statusRow);

    let _specStatus = 'loading'; // loading | ok | fallback

    function updateEngBadge() {
      if (_engine.type === 'unsupported') {
        statusRow.innerHTML = '<span style="color:var(--red)">✗</span><span>No local AI available on this device</span>';
        body.querySelector('#ai-generate') && (body.querySelector('#ai-generate').disabled = true);
        return;
      }
      if (_engine.type === 'webllm' && _engine.risky && !_webllmReady) {
        statusRow.innerHTML = '<span style="color:var(--gold)">⚠</span><span>' + esc(_engine.riskyReason || 'May be unreliable on this device') + '</span>';
        return;
      }
      // Nothing wrong to report — keep it minimal, like other AI apps do.
      statusRow.innerHTML = '<span style="color:var(--green)">●</span><span>Ready' + (_engine.models.length > 1 ? '' : '') + '</span>';
      if (_engine.models.length > 1) {
        statusRow.innerHTML += '<select id="ai-model" style="margin-left:auto;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);color:var(--text2);font-size:10px;border-radius:6px;padding:2px 6px;cursor:pointer">' +
          _engine.models.map(m => '<option value="' + esc(m) + '"' + (m === _model ? ' selected' : '') + '>' + esc(m) + '</option>').join('') +
          '</select>';
        body.querySelector('#ai-model')?.addEventListener('change', e => { _model = e.target.value; });
      }
    }

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

    // ── Draft resume banner ──────────────────────────────────
    const draftRow = document.createElement('div');
    draftRow.style.cssText = 'display:none;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0';
    body.appendChild(draftRow);

    const _existingDraft = loadDraftRaw();
    if (_existingDraft && _existingDraft.sections && _existingDraft.completedIndex < _existingDraft.sections.length) {
      const ageMin = Math.round((Date.now() - (_existingDraft.ts || 0)) / 60000);
      draftRow.style.display = '';
      draftRow.innerHTML =
        '<div class="ym-notice info" style="font-size:11px;margin-bottom:6px">' +
          '↺ Unfinished draft found (' + _existingDraft.completedIndex + '/' + _existingDraft.sections.length + ' sections, ' + ageMin + 'min ago) — ' + esc(_existingDraft.filename || '') +
        '</div>' +
        '<div style="display:flex;gap:6px">' +
          '<button id="draft-continue" class="ym-btn ym-btn-accent" style="flex:1;font-size:11px">↳ Continue</button>' +
          '<button id="draft-discard" class="ym-btn ym-btn-ghost" style="flex:1;font-size:11px">✕ Discard</button>' +
        '</div>';
    }

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
    genWrap.style.cssText = 'padding:10px 14px;flex-shrink:0;border-bottom:1px solid rgba(255,255,255,.06);display:flex;gap:6px';
    genWrap.innerHTML =
      '<button id="ai-generate" class="ym-btn ym-btn-accent" style="flex:1;font-size:13px;padding:12px;display:flex;align-items:center;justify-content:center;gap:8px">' +
        '<span id="ai-spinner" style="display:none;width:13px;height:13px;border:2px solid rgba(0,0,0,.25);border-top-color:currentColor;border-radius:50%;animation:ym-ai-spin .7s linear infinite;flex-shrink:0"></span>' +
        '<span id="ai-generate-label">✦ Generate</span>' +
      '</button>' +
      '<button id="ai-stop" class="ym-btn ym-btn-danger" style="display:none;flex-shrink:0;font-size:13px;padding:12px 16px">✕ Stop</button>';
    body.appendChild(genWrap);
    const progEl0 = document.createElement('div');
    progEl0.id = 'ai-progress';
    progEl0.style.cssText = 'font-size:10px;color:var(--text3);margin:6px 14px 0;min-height:14px;text-align:center;flex-shrink:0';
    body.appendChild(progEl0);

    let _stopRequested = false;
    body.querySelector('#ai-stop').addEventListener('click', () => {
      _stopRequested = true;
      dlog('Stop clicked — calling engine.interruptGenerate() if available');
      // This is the real interrupt: it tells the WebLLM engine itself to
      // stop the in-flight generation. Without this, "stop" only abandoned
      // our own promise — the engine kept computing in the background,
      // which is why it looked like Stop did nothing.
      try { _webllmEngine?.interruptGenerate?.(); } catch (e) { dlog('interruptGenerate() failed: ' + e.message); }
      _triggerStop(); // also unblocks our own wrapper immediately
      toast('Stopped', 'info');
    });

    // ── Block list — shows each section live as it streams in ─
    const blocksWrap = document.createElement('div');
    blocksWrap.style.cssText = 'display:none;padding:8px 14px;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0;flex-direction:column;gap:4px;max-height:160px;overflow-y:auto';
    body.appendChild(blocksWrap);

    function renderBlock(idx, total, name, status, codeSoFar) {
      blocksWrap.style.display = 'flex';
      let card = blocksWrap.querySelector('[data-block="' + idx + '"]');
      if (!card) {
        card = document.createElement('div');
        card.dataset.block = idx;
        card.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06)';
        blocksWrap.appendChild(card);
      }
      const icon = status === 'done' ? '✓' : (status === 'active' ? '◐' : '○');
      const color = status === 'done' ? 'var(--green)' : (status === 'active' ? 'var(--gold)' : 'var(--text3)');
      const lines = codeSoFar ? codeSoFar.split('\n').length : 0;
      card.innerHTML =
        '<span style="color:' + color + ';flex-shrink:0;width:14px;text-align:center">' + icon + '</span>' +
        '<span style="font-size:10px;color:var(--text2);flex:1;font-family:var(--font-m)">' + esc(name) + ' <span style="color:var(--text3)">(' + (idx+1) + '/' + total + ')</span></span>' +
        '<span style="font-size:9px;color:var(--text3);flex-shrink:0">' + (status === 'active' ? lines + ' lines…' : (status === 'done' ? lines + ' lines ✓' : 'waiting')) + '</span>';
    }
    function resetBlocks() { blocksWrap.innerHTML = ''; blocksWrap.style.display = 'none'; }

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
      '<div id="ai-validate" style="font-size:10px;margin-bottom:6px;min-height:14px"></div>' +
      '<button id="ai-fix" style="display:none;width:100%;font-size:11px;padding:8px;margin-bottom:14px" class="ym-btn ym-btn-ghost">🔧 Fix flagged issues (same chunked approach)</button>' +
      '<button id="ai-diag-toggle" style="background:none;border:none;color:var(--text3);font-size:9px;padding:4px 0;text-align:left;cursor:pointer;text-decoration:underline">Diagnostics</button>' +
      '<textarea id="ai-diag-log" readonly style="display:none;width:100%;height:140px;font-family:var(--font-m);font-size:9px;line-height:1.5;box-sizing:border-box;margin-bottom:6px;background:rgba(0,0,0,.2);color:var(--text3);border:1px solid rgba(255,255,255,.08);border-radius:6px;padding:6px"></textarea>' +
      '<button id="ai-diag-copy" style="display:none;width:100%;font-size:10px;padding:6px;margin-bottom:14px" class="ym-btn ym-btn-ghost">⎘ Copy diagnostics</button>';
    body.appendChild(outWrap);

    // Diagnostics panel — shows the real call timeline, including what
    // happened to calls our own timeout already gave up on. This is what
    // lets us tell "actually stuck" apart from "just slower than we guessed".
    const diagToggle = outWrap.querySelector('#ai-diag-toggle');
    const diagLog = outWrap.querySelector('#ai-diag-log');
    const diagCopy = outWrap.querySelector('#ai-diag-copy');
    function refreshDiagPanel() {
      diagToggle.textContent = 'Diagnostics (' + _debugLog.length + ')';
      if (diagLog.style.display !== 'none') {
        diagLog.value = _debugLog.join('\n');
        diagLog.scrollTop = diagLog.scrollHeight;
      }
    }
    window.__ymAiDebugUpdate = refreshDiagPanel;
    diagToggle.addEventListener('click', () => {
      const show = diagLog.style.display === 'none';
      diagLog.style.display = show ? '' : 'none';
      diagCopy.style.display = show ? '' : 'none';
      if (show) refreshDiagPanel();
    });
    diagCopy.addEventListener('click', () => {
      const text = _debugLog.join('\n');
      navigator.clipboard?.writeText(text).then(() => toast('Diagnostics copied', 'success')).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
        toast('Diagnostics copied', 'success');
      });
    });
    refreshDiagPanel();

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
    // Shared generation runner — used by Generate, draft Continue, and Fix.
    async function runGeneration({ prompt, cat, type, filename, userPrompt, systemPrompt, resumeState, isFix }) {
      const outEl   = body.querySelector('#ai-output');
      const progEl  = body.querySelector('#ai-progress');
      const charsEl = body.querySelector('#ai-chars');
      const valEl   = body.querySelector('#ai-validate');
      const fixBtn  = body.querySelector('#ai-fix');
      const genBtn  = body.querySelector('#ai-generate');
      const spinnerEl = body.querySelector('#ai-spinner');
      const labelEl   = body.querySelector('#ai-generate-label');

      genBtn.disabled = true;
      const stopBtn = body.querySelector('#ai-stop');
      if (stopBtn) stopBtn.style.display = '';
      _stopRequested = false;
      const stopSignal = _newStopSignal();
      if (spinnerEl) spinnerEl.style.display = '';
      if (labelEl) labelEl.textContent = isFix ? 'Fixing…' : 'Generating…';
      if (fixBtn) fixBtn.style.display = 'none';
      resetBlocks();
      if (!resumeState) outEl.value = '';
      let fullCode = resumeState ? (resumeState.assembled || '') : '';
      outEl.value = fullCode;
      charsEl.textContent = fullCode.length + ' chars';
      valEl.textContent = '';
      progEl.textContent = _engine.type === 'webllm' && !_webllmReady ? 'Loading AI model (first time ~1GB) — keep screen on…' : 'Starting…';

      if (!resumeState) {
        saveDraft({ type, prompt, cat, filename, sections: null, completedIndex: 0, assembled: '' });
      }

      function onProgress(p) {
        if (!p) return;
        if (p.progress < 1) {
          const pct = Math.round(p.progress * 100);
          progEl.innerHTML = '<span style="color:var(--cyan)">⬇ ' + pct + '% — ' + esc(p.text || 'Loading model…') + '</span>';
        } else {
          progEl.textContent = p.text || 'Generating…';
        }
      }
      function onSection(idx, total, name, status, codeSoFar) {
        renderBlock(idx, total, name, status, codeSoFar);
      }

      // Load the model FIRST, fully separate from the per-chunk timeout
      // used during actual generation below. This was the real bug: model
      // loading (a ~900MB download, routinely >25s) was happening lazily
      // inside the first section's call, racing against that section's 25s
      // timeout — so a perfectly normal download was being misdiagnosed as
      // "stuck" before the model ever got a chance to respond.
      if (_engine.type === 'webllm' && !_webllmReady) {
        try {
          await Promise.race([
            initWebLLM(onProgress),
            stopSignal.then(() => { throw new Error('Stopped by user.'); }),
          ]);
        } catch (e) {
          if (e.message === 'Stopped by user.') {
            progEl.textContent = '■ Stopped';
          } else {
            progEl.innerHTML = '<span style="color:var(--red)">Failed to load — try again</span>';
            dlog('model load failed: ' + e.message);
          }
          genBtn.disabled = false;
          if (stopBtn) stopBtn.style.display = 'none';
          if (spinnerEl) spinnerEl.style.display = 'none';
          if (labelEl) labelEl.textContent = '✦ Generate';
          return fullCode;
        }
      }

      let tokenCount = 0;
      const t0 = Date.now();
      let _gotFirstChunk = false;
      let _dotCount = 0;
      const heartbeat = setInterval(() => {
        if (_gotFirstChunk) return;
        _dotCount = (_dotCount % 3) + 1;
        progEl.textContent = 'Thinking' + '.'.repeat(_dotCount);
      }, 500);

      try {
        const gen = type === 'sphere'
          ? sectionedGenerate(_engine, _model, systemPrompt, userPrompt, filename, onProgress, onSection, resumeState, stopSignal)
          : streamGenerate(_engine, _model, systemPrompt, userPrompt, onProgress);

        let _lastDomUpdate = 0;
        for await (const chunk of gen) {
          if (_stopRequested) { progEl.textContent = '■ Stopped'; break; }
          _gotFirstChunk = true;
          fullCode += chunk;
          tokenCount++;
          const now = Date.now();
          if (now - _lastDomUpdate > 150) {
            outEl.value = fullCode;
            outEl.scrollTop = outEl.scrollHeight;
            charsEl.textContent = fullCode.length + ' chars';
            _lastDomUpdate = now;
          }
          progEl.textContent = 'Writing…';
        }
        // Make sure the very last bit is always shown, even if it landed
        // inside the throttle window above.
        outEl.value = fullCode;
        outEl.scrollTop = outEl.scrollHeight;
        charsEl.textContent = fullCode.length + ' chars';
        clearInterval(heartbeat);
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        if (_stopRequested) {
          // already showed "Stopped" above
        } else if (!fullCode) {
          progEl.innerHTML = '<span style="color:var(--red)">No response — try again</span>';
        } else {
          progEl.innerHTML = '<span style="color:var(--green)">✓ Done</span>';
        }
        dlog('generation finished — ' + fullCode.length + ' chars in ' + elapsed + 's');

        if (type === 'sphere' && fullCode) {
          const issues = validateSphereCode(fullCode, filename);
          if (issues.length) {
            valEl.innerHTML = '<span style="color:var(--red)">⚠ ' + issues.map(esc).join(' · ') + '</span>';
            if (fixBtn) { fixBtn.style.display = ''; fixBtn.dataset.issues = JSON.stringify(issues); }
          } else {
            valEl.innerHTML = '<span style="color:var(--green)">✓ Structure looks valid</span>';
          }
        }
        if (fullCode) { toast(isFix ? 'Fix applied!' : 'Code generated!', 'success'); clearDraft(); }
      } catch (e) {
        clearInterval(heartbeat);
        if (e.message === 'Stopped by user.') {
          progEl.textContent = '■ Stopped';
        } else {
          progEl.innerHTML = '<span style="color:var(--red)">Something went wrong — try again</span>';
          dlog('generation error: ' + e.message);
          if (window.__ymAiDebugUpdate) window.__ymAiDebugUpdate();
        }
      } finally {
        genBtn.disabled = false;
        if (stopBtn) stopBtn.style.display = 'none';
        if (spinnerEl) spinnerEl.style.display = 'none';
        if (labelEl) labelEl.textContent = '✦ Generate';
      }
      return fullCode;
    }

    body.querySelector('#ai-generate').addEventListener('click', async () => {
      const prompt = (body.querySelector('#ai-prompt')?.value || '').trim();
      const cat    = (body.querySelector('#ai-cat')?.value || '').trim() || 'Tools';
      if (!prompt) { toast('Enter a prompt first', 'warn'); return; }

      const ext      = _type === 'sphere' ? '.sphere.js' : '.theme.html';
      const slug     = prompt.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24).replace(/-$/, '');
      const filename = slug + ext;

      body.querySelector('#ai-progress').textContent = 'Building context (similar files + skeleton)…';
      const systemPrompt = await getSystemPrompt(_type, prompt, cat);
      const userPrompt = [
        'Generate a YourMine ' + _type + ' file.',
        'Filename: ' + filename,
        'Category: ' + cat,
        '',
        'Requirements:',
        prompt,
      ].join('\n');

      await runGeneration({ prompt, cat, type: _type, filename, userPrompt, systemPrompt });
    });

    // Draft continue/discard
    draftRow.querySelector('#draft-continue')?.addEventListener('click', async () => {
      const d = loadDraftRaw();
      if (!d) return;
      body.querySelector('#ai-prompt').value = d.prompt || '';
      body.querySelector('#ai-cat').value = d.cat || '';
      setType(d.type || 'sphere');
      draftRow.style.display = 'none';
      const systemPrompt = await getSystemPrompt(d.type, d.prompt, d.cat);
      const userPrompt = [
        'Generate a YourMine ' + d.type + ' file.',
        'Filename: ' + d.filename,
        'Category: ' + d.cat,
        '',
        'Requirements:',
        d.prompt,
      ].join('\n');
      await runGeneration({
        prompt: d.prompt, cat: d.cat, type: d.type, filename: d.filename,
        userPrompt, systemPrompt,
        resumeState: { sections: d.sections, completedIndex: d.completedIndex, assembled: d.assembled },
      });
    });
    draftRow.querySelector('#draft-discard')?.addEventListener('click', () => {
      clearDraft();
      draftRow.style.display = 'none';
      toast('Draft discarded', 'info');
    });

    // Fix flagged issues — reuses the exact same chunked-generation machinery,
    // just with a prompt that includes the existing (broken) code + the
    // specific issues the validator found, asking the model to rewrite it
    // correctly in the same section-by-section way.
    body.querySelector('#ai-fix')?.addEventListener('click', async () => {
      const fixBtn = body.querySelector('#ai-fix');
      const existingCode = body.querySelector('#ai-output')?.value || '';
      if (!existingCode) return;
      let issues = [];
      try { issues = JSON.parse(fixBtn.dataset.issues || '[]'); } catch {}
      const prompt = (body.querySelector('#ai-prompt')?.value || '').trim();
      const cat = (body.querySelector('#ai-cat')?.value || '').trim() || 'Tools';
      const ext = '.sphere.js';
      const slug = prompt.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24).replace(/-$/, '') || 'fixed';
      const filename = slug + ext;

      body.querySelector('#ai-progress').textContent = 'Building context for fix…';
      const systemPrompt = await getSystemPrompt('sphere', prompt, cat);
      const userPrompt = [
        'Fix this existing YourMine sphere file. Rewrite it completely, correctly this time.',
        'Filename: ' + filename,
        'Issues found by the validator (fix ALL of them):',
        issues.map(i => '- ' + i).join('\n'),
        '',
        'Original (broken) code:',
        '```',
        existingCode,
        '```',
        '',
        'Original requirements:',
        prompt,
      ].join('\n');

      await runGeneration({ prompt, cat, type: 'sphere', filename, userPrompt, systemPrompt, isFix: true });
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
