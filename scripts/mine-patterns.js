#!/usr/bin/env node
/* jshint esversion:11 */
// mine-patterns.js — run OFFLINE (Node), not in the browser.
//
// Crawls files.json + themes-files.json from the YourMinedApp repo (and its
// forks if you point it at them), fetches each sphere/theme's real code,
// extracts structural patterns, and writes a compact ym-spec.json that
// ai.js fetches at runtime instead of a hand-written README.
//
// Usage:
//   node mine-patterns.js [--out ym-spec.json] [--threshold 0.4]
//
// Requires Node 18+ (global fetch).

const fs = require('fs');
const path = require('path');

const GH_OWNER = 'theodoreyong9';
const GH_REPO  = 'YourMinedApp';
const RAW_BASE = `https://raw.githubusercontent.com/${GH_OWNER}/${GH_REPO}/main/`;
const FILES_URL  = RAW_BASE + 'files.json';
const THEMES_URL = RAW_BASE + 'themes-files.json';

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out') out.out = args[++i];
    if (args[i] === '--threshold') out.threshold = parseFloat(args[++i]);
  }
  return out;
}

async function fetchJson(url, fallback) {
  try {
    const r = await fetch(url + '?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } catch (e) {
    console.warn('[mine] failed to fetch', url, e.message);
    return fallback;
  }
}

async function fetchText(url) {
  try {
    const r = await fetch(url + '?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.text();
  } catch (e) {
    return null;
  }
}

// ── EXTRACTION ────────────────────────────────────────────────
function extractSphereFile(code, filename) {
  return {
    filename,
    lineCount: code.split('\n').length,
    hasIIFE: /^\s*\(function\s*\(\s*\)\s*\{[\s\S]{0,40}['"]use strict/.test(code.trim()),
    hasRegistryAssign: /window\.YM_S\s*\[/.test(code) || /window\.YM_S\s*\.\s*\w+\s*=/.test(code),
    hasActivate: /\bactivate\s*\(/.test(code),
    hasDeactivateTopLevel: /\bdeactivate\s*\(\)\s*\{/.test(code) && !/ctx\.deactivate\s*=/.test(code),
    hasRenderPanel: /\brenderPanel\s*\(/.test(code),
    hasProfileSection: /\bprofileSection\s*\(/.test(code),
    hasPeerSection: /\bpeerSection\s*\(/.test(code),
    hasBroadcastData: /\bbroadcastData\s*\(\s*\)/.test(code),
    ctxCalls: dedupe([...code.matchAll(/ctx\.(\w+)/g)].map(m => m[1])),
    p2pCalls: dedupe([...code.matchAll(/YM_P2P\.(\w+)/g)].map(m => m[1])),
    helperFns: dedupe([...code.matchAll(/function\s+(\w+)\s*\(/g)].map(m => m[1])),
    usesLocalStorage: /\blocalStorage\.(get|set)Item/.test(code),
    usesFetchInActivate: (() => {
      const m = code.match(/activate\s*\([^)]*\)\s*\{([\s\S]*?)\n\s*\}/);
      return m ? /await\s+fetch\(/.test(m[1]) : false;
    })(),
  };
}

function extractThemeFile(code, filename) {
  return {
    filename,
    lineCount: code.split('\n').length,
    hasThemeMeta: /window\.YM_THEME_META\s*=/.test(code),
    hasWallpaperPresets: /window\.YM_WALLPAPER_PRESETS\s*=/.test(code),
    requiredIdsFound: dedupe([...code.matchAll(/id=["']([\w-]+)["']/g)].map(m => m[1])),
  };
}

function dedupe(arr) { return Array.from(new Set(arr)); }

// ── SPEC BUILDING ─────────────────────────────────────────────
function buildSpec(sphereFiles, themeFiles, threshold) {
  const total = sphereFiles.length || 1;
  const freq = {};
  const bump = (k) => { freq[k] = (freq[k] || 0) + 1; };

  sphereFiles.forEach(f => {
    if (f.hasIIFE) bump('iife_wrapper');
    if (f.hasRegistryAssign) bump('window.YM_S registry assignment');
    if (f.hasActivate) bump('activate()');
    if (f.hasDeactivateTopLevel) bump('deactivate() as top-level method');
    if (f.hasRenderPanel) bump('renderPanel()');
    if (f.hasProfileSection) bump('profileSection()');
    if (f.hasPeerSection) bump('peerSection()');
    if (f.hasBroadcastData) bump('broadcastData()');
    f.ctxCalls.forEach(c => bump('ctx.' + c));
    f.p2pCalls.forEach(c => bump('YM_P2P.' + c));
  });

  const required = Object.entries(freq)
    .map(([k, v]) => ({ pattern: k, freq: Math.round((v / total) * 100) + '%', _ratio: v / total }))
    .filter(p => p._ratio >= threshold)
    .sort((a, b) => b._ratio - a._ratio)
    .map(({ pattern, freq }) => ({ pattern, freq }));

  const antiPatterns = [];
  if (sphereFiles.some(f => f.usesLocalStorage)) {
    antiPatterns.push('Do not use localStorage directly in a sphere — use ctx.storage.get/set/del instead');
  }
  if (sphereFiles.some(f => f.usesFetchInActivate)) {
    antiPatterns.push('Do not await slow network calls directly inside activate() — activate() must return in under 8 seconds; defer fetches to a background task or first panel open');
  }
  antiPatterns.push('Never declare top-level vars outside the IIFE');
  antiPatterns.push('Never assign deactivate via ctx.deactivate = ... — it must be a top-level method on the YM_S object');
  antiPatterns.push('Keep broadcastData() payload under 500 bytes');

  const spec = {
    v: 1,
    generatedAt: new Date().toISOString(),
    totalFilesMined: sphereFiles.length,
    totalThemesMined: themeFiles.length,
    core: {
      wrapper: "(function(){'use strict'; ... })();",
      registry: "window.YM_S['FILENAME'] = { name, icon, category, description, activate(ctx){}, deactivate(){}, renderPanel(container){} };",
      required_methods: ['activate(ctx)', 'deactivate()', 'renderPanel(container)'],
      optional_methods: ['profileSection(container)', 'peerSection(container, peerCtx)', 'broadcastData()'],
      fields: ['name', 'icon', 'category', 'description'],
    },
    ctx_api: {
      storage: ['ctx.storage.get(key)', 'ctx.storage.set(key, val)', 'ctx.storage.del(key)'],
      ui: ['ctx.toast(msg, type)', 'ctx.openPanel(renderFn)', 'ctx.setNotification(n)'],
      p2p: ['ctx.send(type, data)  // rate-limited 10/s', 'ctx.onReceive((type, data, peerId) => {})'],
      profile: ['ctx.saveProfile(obj)', 'ctx.loadProfile()'],
    },
    global_api: {
      registry: 'window.YM_sphereRegistry  // Map<filename, ctx> of active spheres',
      p2p_direct: 'window.YM_P2P.sendTo(peerId, {sphere, type, data})',
      open_sphere: "window.YM.openSpherePanel('filename.sphere.js')",
      open_profile: 'window.YM.openProfilePanel(profileObject)',
      social_near: 'window.YM_Social?._nearUsers  // Map<uuid,{profile,ts,peerId,broadcastData}>',
      widget_pages: 'window.YM_Desk.registerWidgetPage(id,page) / registeredWidgetPage(id) / unregisterWidget(id)',
    },
    css_vars: ['--bg', '--text', '--text2', '--text3', '--gold', '--cyan', '--red', '--green', '--font-d', '--font-b', '--font-m'],
    ui_classes: ['.ym-card', '.ym-card-title', '.ym-btn', '.ym-btn-accent', '.ym-btn-ghost', '.ym-btn-danger', '.ym-input', '.ym-notice', '.ym-tabs', '.ym-tab', '.pill'],
    required,
    constraints: [
      'activate() must complete in <8s — never await slow calls inline',
      'deactivate() is a top-level method, never ctx.deactivate=...',
      'window.YM_S key MUST exactly match the filename',
      'broadcastData() payload must stay under 500 bytes',
      'Do not clamp targetPage to pageCount at widget spawn — registerWidgetPage creates pages as needed',
    ],
    skeleton_by_intent: {
      widget: "(function(){\n'use strict';\nwindow.YM_S = window.YM_S || {};\nlet _ctx = null;\nwindow.YM_S['FILENAME'] = {\n  name: 'Name', icon: '🔮', category: 'Tools', description: 'Desc',\n  activate(ctx){ _ctx = ctx; },\n  deactivate(){ _ctx = null; },\n  renderPanel(c){ c.innerHTML = '<div class=\"ym-card\"><div class=\"ym-card-title\">Name</div></div>'; },\n};\n})();",
      p2p_game: "(function(){\n'use strict';\nwindow.YM_S = window.YM_S || {};\nlet _ctx=null,_state='waiting';\nwindow.YM_S['FILENAME'] = {\n  name:'Game', icon:'🎮', category:'Games', description:'Desc',\n  activate(ctx){ _ctx=ctx; ctx.onReceive((type,data,peerId)=>{ /* state machine transitions */ }); },\n  deactivate(){ _ctx=null; _state='waiting'; },\n  renderPanel(c){ c.innerHTML = '<div class=\"ym-card\">'+_state+'</div>'; },\n  broadcastData(){ return { state:_state }; },\n};\n})();",
      social_overlay: "(function(){\n'use strict';\nwindow.YM_S = window.YM_S || {};\nlet _ctx=null;\nwindow.YM_S['FILENAME'] = {\n  name:'Overlay', icon:'✦', category:'Social', description:'Desc',\n  activate(ctx){ _ctx=ctx; },\n  deactivate(){ _ctx=null; },\n  renderPanel(c){ c.innerHTML=''; },\n  peerSection(c, peerCtx){ c.innerHTML = '<div>'+(peerCtx.profile?.name||'?')+'</div>'; },\n};\n})();",
    },
    anti_patterns: antiPatterns,
  };

  return spec;
}

// ── MAIN ──────────────────────────────────────────────────────
async function main() {
  const { out = 'ym-spec.json', threshold = 0.4 } = parseArgs();

  console.log('[mine] fetching files.json …');
  const files = await fetchJson(FILES_URL, []);
  console.log('[mine] fetching themes-files.json …');
  const themes = await fetchJson(THEMES_URL, []);

  console.log(`[mine] mining ${files.length} sphere files …`);
  const sphereFiles = [];
  for (const f of files) {
    const url = f.codeUrl || (RAW_BASE + (f.filename || ''));
    if (!url) continue;
    const code = await fetchText(url);
    if (!code) { console.warn('[mine] skip (fetch failed):', f.filename); continue; }
    sphereFiles.push(extractSphereFile(code, f.filename));
    process.stdout.write('.');
  }
  console.log('');

  console.log(`[mine] mining ${themes.length} theme files …`);
  const themeFiles = [];
  for (const t of themes) {
    const fname = t.filename || t.file;
    const url = t.codeUrl || (RAW_BASE + 'src/themes/' + fname);
    if (!fname) continue;
    const code = await fetchText(url);
    if (!code) { console.warn('[mine] skip (fetch failed):', fname); continue; }
    themeFiles.push(extractThemeFile(code, fname));
    process.stdout.write('.');
  }
  console.log('');

  const spec = buildSpec(sphereFiles, themeFiles, threshold);
  fs.writeFileSync(path.resolve(out), JSON.stringify(spec, null, 2));
  console.log(`[mine] wrote ${out} (${sphereFiles.length} spheres, ${themeFiles.length} themes mined)`);
  console.log(`[mine] ${spec.required.length} patterns kept at >${Math.round(threshold*100)}% frequency`);
}

main().catch(e => { console.error(e); process.exit(1); });
