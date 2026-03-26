<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,maximum-scale=1">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#08080f">
<meta name="theme-color" content="#08080f" media="(prefers-color-scheme: dark)">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<title>YourMine</title>
<link rel="manifest" href="/manifest.json">
<link rel="apple-touch-icon" href="/icon-splash-dark.png">
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=Space+Mono:wght@400;700&family=Barlow:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
:root{
  color-scheme:dark;
  --bg:#08080f;--surface:#10101c;--surface2:#181828;--surface3:#20203a;
  --border:#2a2a45;--border2:#383860;
  --text:#dde0f0;--text2:#8888b0;--text3:#44446a;
  --accent:#e8a020;--accent-dim:#a07010;--accent-glow:rgba(232,160,32,.18);
  --cyan:#18d8f0;--blue:#4488ff;--red:#ff4455;--green:#30e880;
  --safe-b:env(safe-area-inset-bottom,0px);
  --safe-t:env(safe-area-inset-top,0px);
  --dock-h:68px;
  --font-d:'Syne',sans-serif;--font-m:'Space Mono',monospace;--font-b:'Barlow',sans-serif;
  --r:10px;--r-sm:6px;--r-lg:18px;
  --cols:4;--rows:6;
}
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
html,body{height:100%;overflow:hidden;background:var(--bg);color:var(--text);font-family:var(--font-b);padding-top:var(--safe-t)}
*{scrollbar-width:thin;scrollbar-color:var(--border2) transparent}

/* SCANLINES — moins intrusif */
body::after{content:'';position:fixed;inset:0;background:repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.012) 3px,rgba(0,0,0,.012) 4px);pointer-events:none;z-index:9900}

/* BACKGROUND */
#ym-wp{position:fixed;inset:0;z-index:0;background-size:cover;background-position:center;background-repeat:no-repeat}
#ym-bg{position:fixed;inset:0;z-index:1;pointer-events:none;overflow:hidden;background:transparent;transition:background .3s}
#ym-bg::before{content:'';position:absolute;width:70vmax;height:70vmax;border-radius:50%;background:radial-gradient(circle,rgba(24,216,240,.15),transparent 70%);top:-20vmax;right:-15vmax;opacity:0;transition:opacity 1.2s ease}
#ym-bg::after{content:'';position:absolute;width:60vmax;height:60vmax;border-radius:50%;background:radial-gradient(circle,rgba(232,160,32,.12),transparent 70%);bottom:-15vmax;left:-10vmax;opacity:0;transition:opacity 1.2s ease}
body.has-wallpaper #ym-bg{background:transparent}
body.has-wallpaper #ym-bg::before,body.has-wallpaper #ym-bg::after{opacity:.4}

/* GRAIN OVERLAY pour wallpaper */
body.has-wallpaper::before{content:'';position:fixed;inset:0;z-index:1;pointer-events:none;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E");background-repeat:repeat;background-size:256px}

/* DESKTOP */
#desktop{position:fixed;top:0;left:0;right:0;bottom:calc(var(--dock-h) + var(--safe-b));z-index:2;overflow:hidden;touch-action:pan-y}
#desktop-slider{display:flex;height:100%;align-items:stretch;transition:transform .35s cubic-bezier(.4,0,.2,1);will-change:transform}
.desktop-page{flex:0 0 100vw;width:100vw;height:calc(100dvh - var(--dock-h) - var(--safe-b));display:grid;grid-template-columns:repeat(var(--cols),1fr);grid-template-rows:repeat(var(--rows),1fr);padding:10px 8px 6px;gap:4px;overflow:hidden;position:relative}
@media(hover:hover) and (pointer:fine){
  .desktop-page{flex:0 0 calc(100vw - 64px);width:calc(100vw - 64px)}
}

/* DRAG CELL HIGHLIGHT */
.cell-hl{position:absolute;background:rgba(232,160,32,.2);border-radius:50%;pointer-events:none;z-index:3;transition:left .08s,top .08s,width .08s,height .08s}

/* ICONS */
.icon-wrap{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;cursor:pointer;padding:3px;border-radius:8px;position:relative;touch-action:none;-webkit-user-select:none;user-select:none;width:fit-content;height:fit-content;place-self:center}
.icon-body{
  width:52px;height:52px;border-radius:50%;
  background:rgba(16,16,30,.85);
  backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
  border:1px solid rgba(255,255,255,.07);
  display:flex;align-items:center;justify-content:center;font-size:25px;
  box-shadow:0 4px 16px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.06);
  flex-shrink:0;position:relative;
  transition:transform .18s,box-shadow .18s;
}
.icon-body:hover{box-shadow:0 6px 24px rgba(0,0,0,.65),0 0 0 1px rgba(232,160,32,.2),inset 0 1px 0 rgba(255,255,255,.08)}
.icon-wrap:active .icon-body{transform:scale(0.9)}
.icon-label{font-size:10px;font-weight:500;letter-spacing:.2px;color:#fff;text-align:center;max-width:64px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-shadow:0 1px 8px rgba(0,0,0,.95),0 0 20px rgba(0,0,0,.8)}
.icon-notif{position:absolute;top:-7px;right:-7px;min-width:20px;height:20px;border-radius:10px;background:var(--accent);color:#000;font-size:11px;display:flex;align-items:center;justify-content:center;padding:0 5px;font-weight:700;border:2px solid var(--bg);z-index:2}
.icon-del{position:absolute;top:-7px;left:-7px;width:22px;height:22px;border-radius:50%;background:var(--accent);color:#000;font-size:14px;font-weight:900;display:none;align-items:center;justify-content:center;z-index:10;cursor:pointer;border:2px solid var(--bg);line-height:1;pointer-events:all}
body.edit-mode .icon-del{display:flex}
body.edit-mode .icon-body:not(.folder-body){animation:wob .5s ease-in-out infinite}
@keyframes wob{0%{transform:rotate(-2.5deg)}50%{transform:rotate(2.5deg)}100%{transform:rotate(-2.5deg)}}
.folder-body{background:linear-gradient(135deg,var(--surface2),var(--surface3));position:relative;border-radius:50%}
.folder-grid{position:absolute;inset:8px;display:grid;grid-template-columns:repeat(2,1fr);gap:2px;overflow:hidden;border-radius:50%}
.folder-grid .fi{font-size:13px;display:flex;align-items:center;justify-content:center}

/* DRAG GHOST */
#drag-ghost{position:fixed;pointer-events:none;z-index:9800;opacity:.72;transform:scale(1.15) rotate(3deg);display:none}

/* NAV BAR */
#nav-bar{
  position:fixed;bottom:0;left:0;right:0;
  height:calc(var(--dock-h) + var(--safe-b));
  padding-bottom:var(--safe-b);z-index:350;
  display:flex;flex-direction:column;align-items:stretch;
  background:rgba(8,8,18,.85);
  backdrop-filter:blur(24px) saturate(160%);
  -webkit-backdrop-filter:blur(24px) saturate(160%);
  border-top:1px solid rgba(255,255,255,.06);
}
body.has-wallpaper #nav-bar{background:rgba(0,0,0,.88)}
#nav-bar::after{content:'';position:absolute;bottom:calc(-1 * var(--safe-b));left:0;right:0;height:var(--safe-b);background:#08080f}
@media all and (display-mode:standalone){
  #nav-bar{background:#08080f !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;border-top:1px solid rgba(255,255,255,.06) !important}
  #nav-bar::after{background:#08080f}
}

/* PAGE DOTS */
#page-dots{position:fixed;bottom:calc(var(--dock-h) + var(--safe-b) + 6px);left:0;right:0;display:flex;gap:6px;align-items:center;justify-content:center;pointer-events:none;z-index:205}
.pdot{width:6px;height:6px;border-radius:3px;background:rgba(255,255,255,.18);transition:all .3s cubic-bezier(.4,0,.2,1);flex-shrink:0}
.pdot.active{width:22px;background:var(--accent);box-shadow:0 0 8px rgba(232,160,32,.5)}

/* DOCK */
#dock{display:flex;flex-direction:row;align-items:center;justify-content:space-around;flex:1;padding:0 8px}
.dbtn{
  display:flex;align-items:center;justify-content:center;
  background:none;border:none;cursor:pointer;
  padding:10px;border-radius:14px;
  transition:all .22s cubic-bezier(.4,0,.2,1);
  color:rgba(255,255,255,.55);-webkit-tap-highlight-color:transparent;
  min-width:44px;min-height:44px;font-size:24px;font-family:var(--font-m);
}
.dbtn:hover{background:rgba(255,255,255,.07);transform:translateY(-1px)}
.dbtn:active{transform:scale(.92);background:rgba(232,160,32,.12)}
#btn-back{font-size:28px;color:rgba(232,160,32,.7)}
#btn-back:active{color:var(--accent)}

/* PWA INSTALL BUTTON */
#pwa-install-btn{
  position:fixed;bottom:calc(var(--dock-h) + var(--safe-b) + 28px);left:50%;transform:translateX(-50%);
  z-index:206;display:none;align-items:center;gap:8px;
  background:var(--surface);border:1px solid var(--border2);
  color:var(--accent);font-family:var(--font-d);font-size:9px;font-weight:700;
  letter-spacing:2px;text-transform:uppercase;padding:10px 14px;border-radius:14px;
  cursor:pointer;
  box-shadow:0 8px 32px rgba(0,0,0,.6),0 0 0 1px rgba(232,160,32,.15);
  backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
  transition:all .22s;-webkit-tap-highlight-color:transparent;white-space:nowrap;letter-spacing:3px;
}
#pwa-install-btn:hover{background:var(--surface2);border-color:var(--accent);box-shadow:0 0 12px var(--accent-glow);transform:translateX(-50%) translateY(-1px)}
#pwa-install-btn:active{transform:translateX(-50%) scale(.95)}
#pwa-install-btn .pwa-icon{font-size:13px;line-height:1}
@media all and (display-mode:standalone){#pwa-install-btn{display:none!important}}

/* PC — right sidebar */
@media(hover:hover) and (pointer:fine){
  :root{--cols:8;--rows:5;--dock-h:0px}
  #desktop{right:64px;bottom:0!important}
  #nav-bar{left:auto;right:0;top:0;bottom:0;height:auto;width:64px;flex-direction:column;border-top:none;border-left:1px solid rgba(42,42,69,.35);padding-bottom:0;cursor:pointer}
  #page-dots{bottom:16px;left:0;right:64px}
  .pdot.active{width:22px;height:6px}
  #dock{flex-direction:column;padding:8px 0;justify-content:center;gap:2px;flex:1}
  .dbtn{font-size:20px;min-width:48px;min-height:40px;padding:8px 0;flex-direction:column;gap:2px}
  #pwa-install-btn{left:calc(50% - 32px);bottom:28px}
}

/* PANELS — glassmorphism renforcé */
.ym-overlay{position:fixed;top:0;left:0;right:0;bottom:calc(var(--dock-h) + var(--safe-b));background:rgba(0,0,0,.6);z-index:300;opacity:0;pointer-events:none;transition:opacity .25s;backdrop-filter:blur(8px)}
.ym-overlay.open{opacity:1;pointer-events:all}
.ym-panel{
  position:fixed;top:0;left:0;right:0;bottom:calc(var(--dock-h) + var(--safe-b));
  background:rgba(8,8,18,.82);
  backdrop-filter:blur(32px) saturate(180%);
  -webkit-backdrop-filter:blur(32px) saturate(180%);
  border-top:1px solid rgba(232,160,32,.15);
  border-left:1px solid rgba(255,255,255,.05);
  border-right:1px solid rgba(255,255,255,.05);
  box-shadow:0 -8px 40px rgba(0,0,0,.6);
  z-index:301;transform:translateY(100%);
  transition:transform .32s cubic-bezier(.4,0,.2,1);
  display:flex;flex-direction:column;border-radius:var(--r-lg) var(--r-lg) 0 0;overflow:hidden;
}
.ym-panel.open{transform:translateY(0)}
@media(hover:hover) and (pointer:fine){
  .ym-overlay{right:64px;bottom:0;backdrop-filter:none;-webkit-backdrop-filter:none;background:rgba(0,0,0,.5)}
  .ym-panel{right:64px;bottom:0}
}
.panel-handle{
  width:36px;height:4px;border-radius:2px;
  background:rgba(255,255,255,.15);
  margin:10px auto 0;flex-shrink:0;cursor:grab;
  transition:background .2s,width .2s;
}
.panel-handle:hover{background:rgba(232,160,32,.5);width:48px}
.panel-head{
  display:flex;align-items:center;padding:12px 18px;
  border-bottom:1px solid rgba(255,255,255,.05);
  flex-shrink:0;min-height:52px;gap:10px;
  background:rgba(255,255,255,.02);
}
.panel-head h2{font-family:var(--font-d);font-size:10px;font-weight:700;letter-spacing:4px;text-transform:uppercase;background:linear-gradient(90deg,var(--accent),var(--cyan));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.panel-body{flex:1;overflow:hidden;display:flex;flex-direction:column;padding:0;-webkit-overflow-scrolling:touch}
#panel-sphere-body{display:flex;flex-direction:column;padding:0}
.panel-body::-webkit-scrollbar{width:2px}
.panel-body::-webkit-scrollbar-thumb{background:var(--accent-dim);border-radius:2px}

/* COMPONENTS */
.ym-input{
  width:100%;background:rgba(255,255,255,.04);
  border:1px solid rgba(255,255,255,.08);
  border-radius:var(--r-sm);padding:10px 12px;color:var(--text);
  font-family:var(--font-b);font-size:13px;outline:none;
  transition:border-color .2s,box-shadow .2s,background .2s;
  backdrop-filter:blur(4px);
}
.ym-input:focus{background:rgba(255,255,255,.06);border-color:rgba(232,160,32,.5);box-shadow:0 0 0 3px rgba(232,160,32,.1)}
.ym-input::placeholder{color:var(--text3)}
textarea.ym-input{resize:vertical;min-height:80px;font-family:var(--font-m);font-size:12px}
.ym-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:9px 16px;border-radius:var(--r-sm);font-family:var(--font-b);font-size:13px;font-weight:500;cursor:pointer;transition:all .22s;border:1px solid transparent}
.ym-btn-accent{background:var(--accent);border-color:var(--accent);color:#000;font-weight:700;box-shadow:0 4px 20px rgba(232,160,32,.25)}
.ym-btn-accent:hover{background:#ffb830;box-shadow:0 8px 28px rgba(232,160,32,.35);transform:translateY(-1px)}
.ym-btn-accent:active{transform:scale(.97)}
.ym-btn-cyan{background:var(--cyan);border-color:var(--cyan);color:#000;font-weight:700}
.ym-btn-ghost{background:transparent;border-color:var(--border2);color:var(--text2)}.ym-btn-ghost:hover{border-color:var(--accent);color:var(--accent)}
.ym-btn-danger{background:transparent;border-color:var(--red);color:var(--red)}.ym-btn-danger:hover{background:var(--red);color:#fff}
.ym-btn:disabled{opacity:.4;cursor:not-allowed}
.ym-card{
  background:rgba(255,255,255,.025);
  border:1px solid rgba(255,255,255,.055);
  border-radius:var(--r);padding:14px;margin-bottom:10px;
  backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
  transition:border-color .2s;
}
.ym-card:hover{border-color:rgba(232,160,32,.18)}
.ym-card-title{font-family:var(--font-d);font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--accent-dim);margin-bottom:10px}
.ym-stat-row{display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.04)}
.ym-stat-row:last-child{border-bottom:none}
.ym-stat-label{font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;font-family:var(--font-m)}
.ym-stat-value{font-family:var(--font-m);font-size:13px;color:var(--text)}
.ym-stat-value.gold{color:var(--accent)}.ym-stat-value.blue{color:var(--blue)}.ym-stat-value.cyan{color:var(--cyan)}.ym-stat-value.green{color:var(--green)}
.ym-notice{padding:8px 12px;border-radius:var(--r-sm);font-size:12px;display:flex;align-items:flex-start;gap:8px;margin-bottom:8px;line-height:1.5}
.ym-notice.info{background:rgba(68,136,255,.08);border:1px solid rgba(68,136,255,.25);color:var(--blue)}
.ym-notice.success{background:rgba(48,232,128,.08);border:1px solid rgba(48,232,128,.25);color:var(--green)}
.ym-notice.error{background:rgba(255,68,85,.08);border:1px solid rgba(255,68,85,.25);color:var(--red)}
.ym-notice.warn{background:rgba(232,160,32,.08);border:1px solid rgba(232,160,32,.25);color:var(--accent)}
.ym-separator{height:1px;background:linear-gradient(90deg,transparent,var(--accent-dim),transparent);margin:14px 0}
.ym-tabs{display:flex;border-bottom:1px solid rgba(232,160,32,.12);margin-bottom:14px;flex-shrink:0}
.ym-tab{
  flex:1;padding:10px 4px 8px;text-align:center;
  font-size:8px;font-family:var(--font-d);letter-spacing:2px;text-transform:uppercase;
  color:var(--text3);cursor:pointer;border-bottom:2px solid transparent;
  transition:color .18s;margin-bottom:-1px;position:relative;
  -webkit-tap-highlight-color:transparent;
}
.ym-tab.active{color:var(--accent);border-bottom-color:var(--accent)}
.ym-tab.active::after{content:'';position:absolute;bottom:-1px;left:20%;right:20%;height:2px;border-radius:1px;background:var(--accent);box-shadow:0 0 8px var(--accent)}
.ym-tab-badge{position:absolute;top:4px;right:4px;min-width:14px;height:14px;border-radius:7px;background:var(--accent);color:#000;font-size:8px;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0 3px;font-family:var(--font-m);pointer-events:none}
.ym-slider{width:100%;height:3px;background:var(--surface3);border-radius:2px;outline:none;cursor:pointer;-webkit-appearance:none;appearance:none}
.ym-slider::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:var(--accent);cursor:pointer;box-shadow:0 0 6px var(--accent-glow)}
.pill{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:12px;font-size:10px;font-family:var(--font-m);background:rgba(255,255,255,.04);border:1px solid var(--border2);color:var(--text3);margin:2px}
.pill.active{background:rgba(232,160,32,.12);border-color:var(--accent);color:var(--accent)}
.profile-avatar{width:72px;height:72px;border-radius:50%;background:var(--surface3);border:2px solid var(--accent-dim);display:flex;align-items:center;justify-content:center;font-size:32px;margin:0 auto 12px;cursor:pointer;overflow:hidden;box-shadow:0 0 16px var(--accent-glow)}
.profile-avatar img{width:100%;height:100%;object-fit:cover}
.uuid-display{font-family:var(--font-m);font-size:9px;color:var(--text3);word-break:break-all;cursor:pointer;padding:6px 8px;background:var(--surface3);border-radius:var(--r-sm);border:1px solid var(--border);transition:border-color .2s;margin-bottom:10px}
.uuid-display:hover{border-color:var(--accent)}

/* DIALOGS */
.dlg{position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:500;display:none;align-items:center;justify-content:center;backdrop-filter:blur(6px)}
.dlg.open{display:flex}
.dlg-box{
  background:rgba(10,10,22,.94);
  backdrop-filter:blur(24px) saturate(180%);
  -webkit-backdrop-filter:blur(24px) saturate(180%);
  border:1px solid rgba(232,160,32,.15);
  border-radius:var(--r-lg);padding:20px;width:min(300px,90vw);
  display:flex;flex-direction:column;gap:12px;
  box-shadow:0 24px 80px rgba(0,0,0,.7),inset 0 1px 0 rgba(255,255,255,.05);
}
.dlg-title{font-family:var(--font-d);font-size:11px;font-weight:700;letter-spacing:2px;color:var(--accent);text-align:center}

/* TOASTS */
#toasts{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:700;display:flex;flex-direction:column;gap:5px;min-width:220px;max-width:340px;pointer-events:none}
.toast{
  background:rgba(10,10,22,.92);
  backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
  border:1px solid var(--border2);border-radius:12px;
  padding:9px 14px;font-size:13px;
  animation:tin .2s ease;display:flex;align-items:center;gap:8px;
  box-shadow:0 8px 24px rgba(0,0,0,.5);
}
.toast.success{border-color:var(--green);color:var(--green)}.toast.error{border-color:var(--red);color:var(--red)}.toast.info{border-color:var(--cyan);color:var(--cyan)}.toast.warn{border-color:var(--accent);color:var(--accent)}
@keyframes tin{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}

/* LOADER */
#ym-loader{position:fixed;inset:0;background:var(--bg);z-index:1000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;transition:opacity .4s}
#ym-loader.hidden{opacity:0;pointer-events:none}
.ldr-t{font-family:var(--font-d);font-size:18px;font-weight:800;letter-spacing:8px;background:linear-gradient(90deg,var(--accent),var(--cyan));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.ldr-b{width:150px;height:2px;border-radius:1px;overflow:hidden}
.ldr-f{height:100%;background:linear-gradient(90deg,var(--accent),var(--cyan));animation:ldr 1.2s ease infinite}
@keyframes ldr{0%{width:0;margin-left:0}50%{width:60%;margin-left:20%}100%{width:0;margin-left:100%}}
</style>
</head>
<body>

<!-- Three.js background — chargé en premier pour que le canvas soit prêt -->
<div id="ym-wp"></div>
<script>
// threebg — inline pour éviter un fichier externe
(function(){
'use strict';
function init(){
  const wp=document.getElementById('ym-wp');
  if(!wp)return;
  const canvas=document.createElement('canvas');
  canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;transition:opacity .5s';
  wp.appendChild(canvas);
  const THREE=window.THREE;
  const W=window.innerWidth,H=window.innerHeight;
  const renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));
  renderer.setSize(W,H);
  renderer.setClearColor(0x08080f,1);
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(60,W/H,.1,1000);
  camera.position.set(0,0,28);
  // Particules
  const N=Math.min(900,Math.floor(W*H/2000));
  const positions=new Float32Array(N*3);
  const colors=new Float32Array(N*3);
  const sizes=new Float32Array(N);
  const PAL=[[0.91,0.63,0.13],[0.10,0.85,0.94],[0.27,0.53,1.00],[0.19,0.91,0.50]];
  for(let i=0;i<N;i++){
    const r=12+Math.random()*22,theta=Math.random()*Math.PI*2,phi=Math.acos(2*Math.random()-1);
    positions[i*3]=r*Math.sin(phi)*Math.cos(theta)+(Math.random()-.5)*6;
    positions[i*3+1]=r*Math.sin(phi)*Math.sin(theta)+(Math.random()-.5)*6;
    positions[i*3+2]=r*Math.cos(phi)+(Math.random()-.5)*6;
    const c=PAL[Math.floor(Math.random()*PAL.length)];
    colors[i*3]=c[0];colors[i*3+1]=c[1];colors[i*3+2]=c[2];
    sizes[i]=Math.random()<.05?3.5:Math.random()<.2?2:1.2;
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(positions,3));
  geo.setAttribute('color',new THREE.BufferAttribute(colors,3));
  geo.setAttribute('size',new THREE.BufferAttribute(sizes,1));
  const mat=new THREE.ShaderMaterial({
    uniforms:{uTime:{value:0},uScroll:{value:0}},
    vertexShader:`attribute float size;attribute vec3 color;varying vec3 vColor;varying float vAlpha;uniform float uTime;uniform float uScroll;void main(){vColor=color;vec3 p=position;float s=sin(uTime*.4+p.x*.5)*1.2;float c2=cos(uTime*.3+p.y*.4)*1.2;p.x+=s;p.y+=c2;p.z+=cos(uTime*.35+p.z*.3)*.8;p.y+=uScroll*.04;vec4 mv=modelViewMatrix*vec4(p,1.);float dist=length(mv.xyz);vAlpha=smoothstep(35.,5.,dist)*.7+.15;gl_PointSize=size*(280./dist);gl_Position=projectionMatrix*mv;}`,
    fragmentShader:`varying vec3 vColor;varying float vAlpha;void main(){float d=length(gl_PointCoord-.5)*2.;float a=smoothstep(1.,.2,d);if(a<.01)discard;gl_FragColor=vec4(vColor,a*vAlpha);}`,
    transparent:true,vertexColors:true,depthWrite:false,blending:THREE.AdditiveBlending
  });
  const particles=new THREE.Points(geo,mat);
  scene.add(particles);
  // Wireframe sphere
  const wGeo=new THREE.IcosahedronGeometry(9,2);
  const edges=new THREE.EdgesGeometry(wGeo);
  const wMat=new THREE.LineBasicMaterial({color:0x18d8f0,transparent:true,opacity:.06});
  const wire=new THREE.LineSegments(edges,wMat);
  scene.add(wire);
  // Inner glow
  const igGeo=new THREE.SphereGeometry(5,16,16);
  const igMat=new THREE.ShaderMaterial({
    uniforms:{uTime:{value:0}},
    vertexShader:`varying vec3 vNormal;void main(){vNormal=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec3 vNormal;uniform float uTime;void main(){float rim=pow(1.-abs(dot(vNormal,vec3(0.,0.,1.))),3.);float pulse=.5+.5*sin(uTime*.8);vec3 col=mix(vec3(.91,.63,.13),vec3(.10,.85,.94),pulse);gl_FragColor=vec4(col,rim*.12);}`,
    transparent:true,side:THREE.FrontSide,depthWrite:false,blending:THREE.AdditiveBlending
  });
  const glow=new THREE.Mesh(igGeo,igMat);
  scene.add(glow);
  // Mouse / gyro
  let mx=0,my=0,tx=0,ty=0;
  window.addEventListener('mousemove',e=>{mx=(e.clientX/W-.5)*2;my=(e.clientY/H-.5)*2;});
  if(window.DeviceOrientationEvent)window.addEventListener('deviceorientation',e=>{if(e.beta!=null&&e.gamma!=null){mx=(e.gamma/45);my=(e.beta-45)/45;}});
  let scroll=0;
  document.addEventListener('scroll',()=>{scroll=window.scrollY||0;},{passive:true});
  window.addEventListener('resize',()=>{const W2=window.innerWidth,H2=window.innerHeight;camera.aspect=W2/H2;camera.updateProjectionMatrix();renderer.setSize(W2,H2);});
  let t=0,last=0,visible=true;
  document.addEventListener('visibilitychange',()=>{visible=!document.hidden;});
  function tick(now){
    requestAnimationFrame(tick);if(!visible)return;
    const dt=Math.min((now-last)/1000,.05);last=now;t+=dt;
    tx+=(mx-tx)*dt*1.5;ty+=(my-ty)*dt*1.5;
    mat.uniforms.uTime.value=t;mat.uniforms.uScroll.value=scroll;igMat.uniforms.uTime.value=t;
    particles.rotation.y=t*.025+tx*.08;particles.rotation.x=ty*.05;
    wire.rotation.y=-t*.015+tx*.04;wire.rotation.x=-ty*.025;wire.rotation.z=t*.01;
    glow.rotation.y=t*.04;
    camera.position.x=tx*1.5;camera.position.y=-ty*1.;camera.lookAt(0,0,0);
    renderer.render(scene,camera);
  }
  requestAnimationFrame(tick);
  const obs=new MutationObserver(()=>{canvas.style.opacity=document.body.classList.contains('has-wallpaper')?'0':'1';});
  obs.observe(document.body,{attributes:true,attributeFilter:['class']});
}
if(window.THREE){init();}
else{
  const s=document.createElement('script');
  s.src='https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  s.onload=init;s.onerror=()=>console.warn('[YM] threebg: Three.js failed');
  document.head.appendChild(s);
}
})();
</script>

<div id="ym-bg"></div>
<div id="ym-loader"><div class="ldr-t">YOURMINE</div><div class="ldr-b"><div class="ldr-f"></div></div><div style="font-family:var(--font-m);font-size:9px;color:var(--text3);letter-spacing:2px">LOADING MESH</div></div>
<div id="toasts"></div>
<div id="desktop"><div id="desktop-slider"></div></div>
<div id="drag-ghost"></div>
<div id="page-dots"></div>
<div id="nav-bar">
  <div id="dock">
    <button class="dbtn" id="btn-back" title="Back">&#8249;</button>
    <button class="dbtn" id="btn-profile">&#10005;</button>
    <button class="dbtn" id="btn-figure"><img src="ym512.png" style="width:28px;height:28px;object-fit:contain;border-radius:6px" alt="YM"></button>
  </div>
</div>

<!-- DIALOGS -->
<div class="dlg" id="folder-dlg">
  <div class="dlg-box">
    <div class="dlg-title">Create Folder</div>
    <input class="ym-input" id="folder-name-input" placeholder="Folder name">
    <div style="display:flex;gap:8px">
      <button class="ym-btn ym-btn-ghost" style="flex:1" id="folder-cancel">Cancel</button>
      <button class="ym-btn ym-btn-accent" style="flex:1" id="folder-confirm">Create</button>
    </div>
  </div>
</div>
<div class="dlg" id="folder-view">
  <div class="dlg-box" style="width:min(340px,95vw)">
    <div style="margin-bottom:10px">
      <div id="fv-title" style="font-family:var(--font-d);font-size:11px;font-weight:700;letter-spacing:2px;color:var(--accent)"></div>
    </div>
    <div id="fv-items" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;min-height:60px"></div>
  </div>
</div>
<div class="dlg" id="bg-dlg">
  <div class="dlg-box" style="width:min(420px,94vw);max-height:85vh;display:flex;flex-direction:column;overflow:hidden">
    <div class="dlg-title" id="bg-dlg-title">Background</div>
    <div style="display:flex;gap:8px;margin-bottom:10px">
      <button class="ym-btn ym-btn-ghost" id="bg-wp" style="flex:1;font-size:12px">📁 Upload image</button>
      <button class="ym-btn ym-btn-ghost" id="bg-remove" style="font-size:12px;color:var(--text3)">✕ Remove</button>
    </div>
    <div style="font-size:10px;color:var(--text3);margin-bottom:6px;text-transform:uppercase;letter-spacing:1px">Free wallpapers</div>
    <div id="bg-presets" style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;overflow-y:auto;flex:1;padding-bottom:4px"></div>
    <button class="ym-btn ym-btn-danger" id="bg-del" style="width:100%;display:none;margin-top:8px">🗑 Delete this page</button>
  </div>
</div>

<!-- PANELS -->
<div class="ym-overlay" id="panel-overlay"></div>
<div class="ym-panel" id="panel-spheres"><div class="panel-handle"></div><div class="panel-head"><h2>Spheres</h2></div><div class="panel-body" id="panel-spheres-body">Loading...</div></div>
<div class="ym-panel" id="panel-profile"><div class="panel-handle"></div><div class="panel-head"><h2>Profile</h2><button id="profile-share-btn" class="ym-btn ym-btn-ghost" style="margin-left:auto;padding:4px 8px;font-size:14px;min-height:unset" title="Share profile">🔗</button></div><div class="panel-body" id="panel-profile-body"></div></div>
<div class="ym-panel" id="panel-build"><div class="panel-handle"></div><div class="panel-head"><h2>Build</h2></div><div class="panel-body" id="panel-build-body">Loading...</div></div>
<div class="ym-panel" id="panel-mine"><div class="panel-handle"></div><div class="panel-head"><h2>Wallet</h2></div><div class="panel-body" id="panel-mine-body"></div></div>
<div class="ym-panel" id="panel-sphere"><div class="panel-handle"></div><div class="panel-head"><h2 id="sphere-panel-title">Sphere</h2></div><div class="panel-body" id="panel-sphere-body"></div></div>
<div class="ym-panel" id="panel-profile-view"><div class="panel-handle"></div><div class="panel-head"><h2 id="profile-view-title">Profile</h2></div><div class="panel-body" id="panel-profile-view-body"></div></div>
<div class="ym-panel" id="panel-about"><div class="panel-handle"></div><div class="panel-head"><h2>YourMine</h2></div><div class="panel-body"><div style="flex:1;overflow-y:auto;padding:16px">
  <div class="ym-card" style="margin-bottom:8px"><div style="font-size:13px;color:var(--text);line-height:1.7;font-style:italic">Imaginez qu'une simple preuve de volonté puisse produire de la cryptomonnaie et permettre de déployer des applications en ligne selon votre imagination, instantanément et sans permission. Voilà ce qu'est YourMine.</div></div>
  <div style="text-align:center;padding:24px 0 16px">
    <div style="font-family:var(--font-d);font-size:24px;font-weight:900;background:linear-gradient(90deg,var(--accent),var(--cyan));-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:4px;margin-bottom:4px">YOURMINE</div>
    <div style="font-size:10px;color:var(--text3);letter-spacing:3px">MINE &#183; BUILD &#183; CONNECT</div>
  </div>
  <div class="ym-card"><div class="ym-card-title">The Paradigm</div><div style="font-size:12px;color:var(--text2);line-height:2"><div>"Amazon built a worldwideweb of sellers."</div><div>"Google developed an automated search engine."</div><div>"Facebook developed a social incentive network."</div><div>"WordPress developed a plugin platform."</div><div>"Bitcoin developed decentralized proof of work."</div><div>"OpenAI built a unified interactive GPT."</div><div style="color:var(--accent);margin-top:8px;font-style:italic;font-size:13px">"YourMine builds an interaction engine on a Mine to Build paradigm."</div></div></div>
  <div class="ym-card"><div class="ym-card-title">The YourMine Formula</div><div style="text-align:center;padding:14px 8px;font-family:var(--font-m);font-size:15px;color:var(--accent);background:var(--surface3);border-radius:var(--r-sm);margin-bottom:12px;letter-spacing:1px">S &#183; t<sup>&#945;</sup> / [ln(A<sup>&#946;(1&#8722;T)</sup> + C)]<sup>&#947;</sup></div><div style="font-size:11px;color:var(--text2);line-height:1.9">A user <strong style="color:var(--text)">burns SOL</strong> and selects a patience rate T.<br>&#8594; Immediate reward: <span style="color:var(--cyan)">x(1&#8722;T) YRM</span><br>&#8594; The rest becomes a <span style="color:var(--accent)">claimable bonus</span> that grows over time.<br>Every burn or claim <strong style="color:var(--text)">resets the personal clock</strong>.<br><span style="color:var(--text3)">0.1% protocol fee on each burn.</span></div><div class="ym-separator"></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:10px"><div style="background:var(--surface3);border-radius:6px;padding:7px 8px"><span style="color:var(--text3)">S</span> — last burn amount</div><div style="background:var(--surface3);border-radius:6px;padding:7px 8px"><span style="color:var(--text3)">t</span> — time since last action</div><div style="background:var(--surface3);border-radius:6px;padding:7px 8px"><span style="color:var(--text3)">T</span> — patience rate (0&#8209;40%)</div><div style="background:var(--surface3);border-radius:6px;padding:7px 8px"><span style="color:var(--text3)">A</span> — protocol age (block height)</div><div style="background:var(--surface3);border-radius:6px;padding:7px 8px"><span style="color:var(--text3)">&#945;</span> — temporal growth exponent</div><div style="background:var(--surface3);border-radius:6px;padding:7px 8px"><span style="color:var(--text3)">&#946;</span> — patience/age interaction</div><div style="background:var(--surface3);border-radius:6px;padding:7px 8px"><span style="color:var(--text3)">&#947;</span> — concentration compression</div><div style="background:var(--surface3);border-radius:6px;padding:7px 8px"><span style="color:var(--text3)">C</span> — stabilisation constant</div></div></div>
  <div class="ym-card"><div class="ym-card-title">Why this structure?</div><div style="font-size:11px;color:var(--text2);line-height:1.9"><div style="margin-bottom:6px"><span style="color:var(--accent);font-weight:600">Pareto</span> — Economic distributions follow a power law.</div><div style="margin-bottom:6px"><span style="color:var(--accent);font-weight:600">Zipf</span> — In self-organised systems, ranks follow a 1/r&#7503; hierarchy.</div><div style="margin-bottom:6px"><span style="color:var(--accent);font-weight:600">Boltzmann</span> — Exponential distributions are naturally compressed by the logarithm.</div><div><span style="color:var(--accent);font-weight:600">Odum</span> — In energy systems, efficiency decreases with age.</div></div></div>
  <div class="ym-card"><div class="ym-card-title">Two asset classes</div><div style="display:flex;gap:10px"><div style="flex:1;background:var(--surface3);border-radius:var(--r-sm);padding:12px;text-align:center"><div style="font-size:22px;margin-bottom:6px">&#128274;</div><div style="font-family:var(--font-d);font-size:9px;letter-spacing:1px;color:var(--text3);margin-bottom:4px">SOULBOUND</div><div style="font-size:11px;color:var(--text2)">Non-transferable. Holds burn, patience rate, personal clock and production rights.</div></div><div style="flex:1;background:var(--surface3);border-radius:var(--r-sm);padding:12px;text-align:center"><div style="font-size:22px;margin-bottom:6px">&#128176;</div><div style="font-family:var(--font-d);font-size:9px;letter-spacing:1px;color:var(--accent);margin-bottom:4px">LIQUID YRM</div><div style="font-size:11px;color:var(--text2)">Claimed rewards become standard transferable tokens.</div></div></div></div>
  <div class="ym-card"><div class="ym-card-title">Spheres — the plugin layer</div><div style="font-size:11px;color:var(--text2);line-height:1.8">Spheres are modular plugins that extend YourMine's desktop. Each sphere adds functionality: social discovery, feeds, DeFi tools, and more. Anyone can build and publish a sphere.</div></div>
  <div style="text-align:center;font-size:10px;color:var(--text3);padding:8px 0 28px">Devnet &#183; Proof of Sacrifice &#183; Disinflationary formula test</div>
</div></div></div>

<!-- PWA INSTALL BUTTON -->
<button id="pwa-install-btn" aria-label="Install YourMine"><span class="pwa-icon">⬇</span>INSTALL APP</button>

<script src="desk.js"></script>
<script type="module">
// ============================================================
// YOURMINE SHELL v5
// ============================================================
const PK='ym_profile_v1', AK='ym_activity_v1';
const isPC=()=>window.matchMedia('(hover:hover) and (pointer:fine)').matches;

// ── UTILS ─────────────────────────────────────────────────────
function gid(){return([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16));}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function toast(msg,type='info',dur=3000){const el=document.createElement('div');el.className='toast '+type;el.textContent=msg;document.getElementById('toasts').appendChild(el);setTimeout(()=>el.remove(),dur);}
window.YM_toast=toast;window.YM_escHtml=esc;

// ── PROFILE ───────────────────────────────────────────────────
function LP(){try{return JSON.parse(localStorage.getItem(PK)||'null');}catch{return null;}}
function SP(d){const p={...(LP()||{}),...d};localStorage.setItem(PK,JSON.stringify(p));window.dispatchEvent(new CustomEvent('ym:profile-updated',{detail:p}));return p;}
function OC(){let p=LP();if(!p?.uuid)p=SP({uuid:gid(),name:'',bio:'',avatar:'',spheres:[],created:Date.now()});return p;}
function log(t,d){const l=JSON.parse(localStorage.getItem(AK)||'[]');l.unshift({t,d,ts:Date.now()});if(l.length>200)l.length=200;localStorage.setItem(AK,JSON.stringify(l));}

// ── P2P RATE LIMITING ─────────────────────────────────────────
const p2pS=new Map(),p2pR=new Map(),GAP=3000;
function cS(id){const n=Date.now();if(n-(p2pS.get(id)||0)<GAP)return false;p2pS.set(id,n);return true;}
function cR(id){const n=Date.now();if(n-(p2pR.get(id)||0)<GAP)return false;p2pR.set(id,n);return true;}

// ── PANELS ────────────────────────────────────────────────────
const overlay=document.getElementById('panel-overlay');
let _panel=null;
const navStack=[];
let _suppressTabPush=false;

function openPanel(id){
  if(_panel&&_panel!==id){document.getElementById(_panel)?.classList.remove('open');_panel=null;}
  const p=document.getElementById(id);if(!p)return;
  _panel=id;overlay.classList.add('open');p.classList.add('open');
  if(id==='panel-build')window.YM_Build?.render?.();
  pushNav({type:'panel',id});
}
function closePanel(id,pop=true){
  document.getElementById(id)?.classList.remove('open');
  if(_panel===id){overlay.classList.remove('open');_panel=null;}
  if(pop){const i=navStack.map(x=>x.id).lastIndexOf(id);if(i>=0)navStack.splice(i,1);}
}
function closeAll(){
  document.querySelectorAll('.ym-panel.open').forEach(p=>p.classList.remove('open'));
  overlay.classList.remove('open');_panel=null;navStack.length=0;
}

document.querySelectorAll('.ym-panel').forEach(panel=>{
  const head=panel.querySelector('.panel-head');
  const handle=panel.querySelector('.panel-handle');
  let sy=0;
  handle?.addEventListener('pointerdown',e=>{sy=e.clientY;});
  handle?.addEventListener('pointerup',e=>{if(_panel&&(e.clientY-sy>40||Math.abs(e.clientY-sy)<8))closePanel(_panel);});
  head?.addEventListener('click',e=>{if(!e.target.closest('button')&&!e.target.closest('input'))closePanel(_panel);});
});
overlay.addEventListener('click',closeAll);
document.getElementById('nav-bar').addEventListener('click',e=>{if(_panel&&!e.target.closest('.dbtn'))closeAll();});

history.replaceState({t:'root',stack:[]},'','#');

window.addEventListener('popstate',e=>{
  const state=e.state||{t:'root',stack:[]};
  navStack.length=0;
  (state.stack||[]).forEach(s=>navStack.push(s));
  document.querySelectorAll('.ym-panel.open').forEach(p=>p.classList.remove('open'));
  overlay.classList.remove('open');_panel=null;
  if(state.t==='root') return;
  const lastPanel=navStack.slice().reverse().find(s=>s.type==='panel');
  if(lastPanel){
    const p=document.getElementById(lastPanel.id);
    if(p){p.classList.add('open');overlay.classList.add('open');_panel=lastPanel.id;}
  }
  if(lastPanel?.id==='panel-sphere'){
    const entry=navStack.slice().reverse().find(s=>s.type==='panel'&&s.id==='panel-sphere');
    if(entry?.sphereId){
      const s=window.YM_sphereRegistry?.get(entry.sphereId);
      if(s){
        document.getElementById('sphere-panel-title').textContent=s.name||entry.sphereId.replace('.sphere.js','');
        const settingsBtn=document.getElementById('sphere-panel-settings');
        if(settingsBtn){settingsBtn.style.display=s.profileSection?'':'none';}
        const body=document.getElementById('panel-sphere-body');
        if(body){body.innerHTML='';if(typeof s.renderPanel==='function')s.renderPanel(body);}
      }
    }
  }
  const lastTab=navStack.slice().reverse().find(s=>s.type==='tab'&&s.panelId===lastPanel?.id);
  if(lastTab){
    const panelEl=document.getElementById(lastTab.panelId);
    const t=panelEl?.querySelector(`.ym-tab[data-tab="${lastTab.tabId}"]`);
    if(t){_suppressTabPush=true;t.click();_suppressTabPush=false;}
  }
});

function pushNav(entry){
  navStack.push(entry);
  const stack=navStack.map(s=>{const {restore,...rest}=s;return rest;});
  history.pushState({t:entry.type,stack},'','#'+(entry.id||entry.panelId)+(entry.tabId?'/'+entry.tabId:''));
}
document.querySelectorAll('.ym-panel').forEach(panel=>{
  panel.addEventListener('click',e=>{
    if(_suppressTabPush)return;
    const tab=e.target.closest('.ym-tab');if(!tab?.dataset.tab)return;
    pushNav({type:'tab',panelId:panel.id,tabId:tab.dataset.tab});
  },true);
});

function checkURLRoute(){
  const raw=location.pathname.replace(/^\//,'')||location.hash.replace('#','').replace(/^panel-[\w-]+\/?/,'');
  const m=raw.match(/^([\w-]+)\.sphere(\.js)?$/i);
  if(m)setTimeout(async()=>{const n=m[1]+'.sphere.js';if(!window.YM_sphereRegistry?.has(n)){try{await window.YM_Liste?.activateSphereByName?.(n);}catch{}}openSpherePanel(n);},1400);
  const pm=raw.match(/^([a-f0-9-]+)\.([\w-]+)\.sphere$/i);
  if(pm)setTimeout(()=>window.YM_Social?.openProfile?.(pm[1]),1400);
}
window.addEventListener('hashchange',checkURLRoute);
setTimeout(checkURLRoute,100);

// ── DOCK ──────────────────────────────────────────────────────
function togglePanel(id,onOpen){if(_panel===id)closePanel(id);else{openPanel(id);onOpen?.();}}
document.getElementById('btn-back').addEventListener('click',()=>{
  if(navStack.length>0)history.back();
  else window.YM?.openPanel?.('panel-spheres'),window.YM_Liste?.render?.();
});
document.getElementById('btn-profile').addEventListener('click',()=>togglePanel('panel-profile',()=>window.YM_Profile?.render?.()));
document.getElementById('profile-share-btn')?.addEventListener('click',()=>window.YM_Profile?.showShare?.());
document.getElementById('btn-figure').addEventListener('click',()=>togglePanel('panel-mine',()=>window.YM_Mine?.render?.(document.getElementById('panel-mine-body'))));

// ── SPHERE REGISTRY ───────────────────────────────────────────
window.YM_sphereRegistry=new Map();

function mkCtx(name){
  const _listeners=[];
  return{
    addHeaderBtn:()=>{},addPill:()=>{},addFigureTab:()=>{},
    saveProfile:SP,loadProfile:LP,
    updateFigureCount(n){},
    send(type,data,pid){if(!window.YM_P2P)return false;if(pid&&!cS(pid))return false;window.YM_P2P.broadcast({sphere:name,type,data});return true;},
    onReceive(cb){
      const h=e=>{const{peerId,msg}=e.detail;if(msg.sphere===name)cb(msg.type,msg.data,peerId);};
      window.addEventListener('ym:p2p-data',h);
      _listeners.push(h);
    },
    storage:{
      get(k){try{return JSON.parse(localStorage.getItem('ym_s|'+name+'|'+k));}catch{return null;}},
      set(k,v){localStorage.setItem('ym_s|'+name+'|'+k,JSON.stringify(v));},
      del(k){localStorage.removeItem('ym_s|'+name+'|'+k);}
    },
    setNotification(n){window.YM_Desk?.setNotif?.(name,n);},
    openPanel(fn){if(fn){document.getElementById('panel-sphere-body').innerHTML='';fn(document.getElementById('panel-sphere-body'));}openPanel('panel-sphere');},
    toast,
    setTabBadge(container,tabId,count){
      const tab=container?.querySelector?.(`.ym-tab[data-tab="${tabId}"]`);if(!tab)return;
      let badge=tab.querySelector('.ym-tab-badge');
      if(count>0){if(!badge){badge=document.createElement('span');badge.className='ym-tab-badge';tab.appendChild(badge);}badge.textContent=count;}
      else badge?.remove();
    },
    _cleanup(){_listeners.forEach(h=>window.removeEventListener('ym:p2p-data',h));_listeners.length=0;}
  };
}

let _sphereActivating=false;

async function activateSphere(name,obj){
  if(window.YM_sphereRegistry.has(name))return;
  const ctx=mkCtx(name);
  obj._ctx=ctx;
  window.YM_sphereRegistry.set(name,obj);
  if(window.YM_Desk){
    window.YM_Desk.addIcon(name,obj.icon||'⬡',obj.name||name.replace('.sphere.js',''));
  }else{
    setTimeout(()=>window.YM_Desk?.addIcon?.(name,obj.icon||'⬡',obj.name||name.replace('.sphere.js','')),500);
  }
  if(typeof obj.activate==='function'){
    _sphereActivating=true;
    const r=obj.activate(ctx);
    _sphereActivating=false;
    if(r&&typeof r.catch==='function')await r.catch(e=>console.warn('[YM] activate:',e));
  }
  const p=OC();if(!p.spheres.includes(name)){p.spheres.push(name);SP({spheres:p.spheres});}
  log('activate',{sphere:name});
}
function deactivateSphere(name){
  const s=window.YM_sphereRegistry.get(name);
  if(s?.deactivate)try{s.deactivate();}catch{}
  const ctx=s?._ctx;
  if(ctx?._cleanup)ctx._cleanup();
  window.YM_sphereRegistry.delete(name);
  window.YM_Desk?.removeIcon?.(name);
  const p=OC();p.spheres=(p.spheres||[]).filter(x=>x!==name);SP({spheres:p.spheres});
  window.YM_Liste?._setInactive?.(name);log('deactivate',{sphere:name});
  window.YM_Desk?.autoCleanPages?.();
}
async function openSpherePanel(id){
  window.YM_Desk?.setNotif?.(id,0);
  let s=window.YM_sphereRegistry.get(id);
  if(!s){try{if(window.YM_Liste?.activateSphereByName)await window.YM_Liste.activateSphereByName(id);}catch{}s=window.YM_sphereRegistry.get(id);}
  if(!s){toast('Sphere not found','error');return;}
  document.getElementById('sphere-panel-title').textContent=s.name||id.replace('.sphere.js','');
  let settingsBtn=document.getElementById('sphere-panel-settings');
  if(!settingsBtn){
    settingsBtn=document.createElement('button');
    settingsBtn.id='sphere-panel-settings';
    settingsBtn.className='ym-btn ym-btn-ghost';
    settingsBtn.style.cssText='padding:4px 8px;font-size:13px;min-height:unset';
    settingsBtn.textContent='⚙';
    document.querySelector('#panel-sphere .panel-head').appendChild(settingsBtn);
  }
  settingsBtn.onclick=()=>{
    openPanel('panel-profile');
    window.YM_Profile?.renderFor?.(id);
  };
  settingsBtn.style.display=s.profileSection?'':'none';
  const body=document.getElementById('panel-sphere-body');body.innerHTML='';
  if(typeof s.renderPanel==='function')s.renderPanel(body);
  else body.innerHTML=`<div class="ym-notice info">${esc(s.description||'No content.')}</div>`;
  if(typeof s.getTabBadges==='function'){
    Object.entries(s.getTabBadges()).forEach(([tabId,count])=>{
      const tab=body.querySelector(`.ym-tab[data-tab="${tabId}"]`);
      if(tab&&count>0){const b=document.createElement('span');b.className='ym-tab-badge';b.textContent=count;tab.appendChild(b);}
    });
  }
  openPanel('panel-sphere');
  const last=navStack[navStack.length-1];
  if(last&&last.id==='panel-sphere') last.sphereId=id;
  log('open',{sphere:id});
}

function openProfilePanel(profile){
  const displayName=profile.name||(profile.uuid?.slice(0,8)+'…')||'Profile';
  document.getElementById('profile-view-title').textContent=displayName;
  const body=document.getElementById('panel-profile-view-body');
  body.innerHTML='';
  window._renderProfileView?.(body,profile);
  openPanel('panel-profile-view');
  log('open',{profile:profile.uuid});
}

// ── SECURITY ──────────────────────────────────────────────────
const _f=window.fetch.bind(window);
window.fetch=function(input,init){return _f(input,init);};
Object.defineProperty(window,'fetch',{configurable:false,writable:false,value:window.fetch});
const _NativeWS=window.WebSocket;
window.WebSocket=function(url,...args){return new _NativeWS(url,...args);};
window.WebSocket.CONNECTING=0;window.WebSocket.OPEN=1;window.WebSocket.CLOSING=2;window.WebSocket.CLOSED=3;
Object.defineProperty(window,'WebSocket',{configurable:false,writable:false,value:window.WebSocket});
const _lsSetItem=localStorage.setItem.bind(localStorage);
const _lsRemoveItem=localStorage.removeItem.bind(localStorage);
localStorage.setItem=function(key,val){
  if(window._ym_sl&&key==='ym_profile_v1'){console.warn('[YM] localStorage: ym_profile_v1 write blocked in sphere');return;}
  return _lsSetItem(key,val);
};
localStorage.removeItem=function(key){
  if(window._ym_sl&&key==='ym_profile_v1'){console.warn('[YM] localStorage: ym_profile_v1 remove blocked in sphere');return;}
  return _lsRemoveItem(key);
};

// ── P2P ───────────────────────────────────────────────────────
const YM_RELAYS=[
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://relay.nostr.wirednet.jp',
  'wss://nostr.oxtr.dev',
];

async function initP2P(){
  window.addEventListener('error',e=>{if(e.message&&(e.message.includes('WebSocket')||e.message.includes('wss://')))e.stopImmediatePropagation();},true);
  const _warn=console.warn;const _error=console.error;
  console.warn=(...a)=>{if(typeof a[0]==='string'&&(a[0].includes('Trystero')||a[0].includes('wss://')))return;_warn(...a);};
  console.error=(...a)=>{if(typeof a[0]==='string'&&(a[0].includes('WebSocket')||a[0].includes('wss://')))return;_error(...a);};
  for(const cdn of['https://cdn.jsdelivr.net/npm/trystero@0.21.0/+esm','https://esm.run/trystero@0.21.0']){
    try{
      const{joinRoom}=await import(cdn);
      const room=joinRoom({appId:'yourmine-v1',relayUrls:YM_RELAYS},'ym-main');
      const[send,recv]=room.makeAction('ym');
      recv((data,pid)=>{
        if(data?.type==='social:presence'||cR(pid)){
          window.dispatchEvent(new CustomEvent('ym:p2p-data',{detail:{peerId:pid,msg:data}}));
        }
      });
      room.onPeerJoin(id=>{
        window.dispatchEvent(new CustomEvent('ym:peer-join',{detail:{peerId:id}}));
        setTimeout(()=>send({sphere:'social.sphere.js',type:'social:presence-req',data:{}},[id]),200);
        setTimeout(()=>send({sphere:'social.sphere.js',type:'social:presence-req',data:{}},[id]),1500);
      });
      room.onPeerLeave(id=>{p2pS.delete(id);p2pR.delete(id);window.dispatchEvent(new CustomEvent('ym:peer-leave',{detail:{peerId:id}}));});
      window.YM_P2P={broadcast(d){send(d);},sendTo(id,d){if(cS(id))send(d,[id]);},room};
      document.addEventListener('visibilitychange',()=>{if(!document.hidden)window.dispatchEvent(new CustomEvent('ym:peer-join',{detail:{peerId:'_self_'}}));});
      return;
    }catch(e){_warn('[YM] P2P:',cdn,e.message);}
  }
}

async function loadSphereURL(url,name){
  if(_sphereActivating){console.warn('[YM] Sphere tried to load another sphere during activation — blocked');return null;}
  const r=await _f(url);if(!r.ok)throw new Error('HTTP '+r.status);
  const _protected={YM:window.YM,YM_Desk:window.YM_Desk,YM_sphereRegistry:window.YM_sphereRegistry,YM_P2P:window.YM_P2P,fetch:window.fetch};
  const _protectedYM_S={...window.YM_S};
  window._ym_sl=name;
  const blob=new Blob([await r.text()],{type:'text/javascript'});
  const blobUrl=URL.createObjectURL(blob);
  await new Promise((res,rej)=>{
    const s=document.createElement('script');s.src=blobUrl;
    s.onload=()=>{URL.revokeObjectURL(blobUrl);res();};
    s.onerror=()=>{URL.revokeObjectURL(blobUrl);rej(new Error('Script load failed: '+name));};
    document.head.appendChild(s);
  });
  Object.entries(_protected).forEach(([k,v])=>{if(window[k]!==v){console.warn('[YM] Sphere tried to overwrite',k,'— restored');window[k]=v;}});
  if(window.YM_S){
    Object.keys(window.YM_S).forEach(k=>{
      if(k!==name&&_protectedYM_S&&_protectedYM_S[k]&&window.YM_S[k]!==_protectedYM_S[k]){
        console.warn('[YM] Sphere tried to overwrite YM_S['+k+'] — restored');
        window.YM_S[k]=_protectedYM_S[k];
      }
    });
  }
  window._ym_sl=null;return window.YM_S?.[name];
}
function loadScript(src){return new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=rej;document.head.appendChild(s);});}

// ── PUBLIC API ────────────────────────────────────────────────
window.YM={
  toast,openPanel,closePanel,openSpherePanel,openProfilePanel,activateSphere,deactivateSphere,
  addIconToDesktop:(id,icon,label)=>window.YM_Desk?.addIcon?.(id,icon,label),
  removeIconFromDesktop:(id)=>window.YM_Desk?.removeIcon?.(id),
  activateSphereByName(n){const id=n.endsWith('.sphere.js')?n:n+'.sphere.js';if(window.YM_sphereRegistry.has(id))openSpherePanel(id);else toast('Not active: '+n,'warn');},
  getProfile:LP,saveProfile:SP,createCtx:mkCtx,loadSphereFromURL:loadSphereURL,
  p2p:()=>window.YM_P2P,
  setIconNotif:(id,n)=>window.YM_Desk?.setNotif?.(id,n)
};

// ── INIT ──────────────────────────────────────────────────────
async function init(){
  OC();
  window.YM_Desk?.deskInit?.();
  for(const m of['mine.js','liste.js','build.js','profile.js']){try{await loadScript(m);}catch(e){console.warn('[YM]',m,e.message);}}
  const p=LP();
  if(p?.spheres?.length){
    try{if(window.YM_Liste?.fetchSphereList)await window.YM_Liste.fetchSphereList();}catch{}
    for(const sname of p.spheres){
      if(!window.YM_sphereRegistry.has(sname))
        try{if(window.YM_Liste?.activateSphereByName)await window.YM_Liste.activateSphereByName(sname);}catch(e){console.warn('[YM] restore:',sname,e.message);}
    }
  }
  initP2P();
  if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
  setTimeout(()=>document.getElementById('ym-loader').classList.add('hidden'),400);

  // PWA install
  if(!window.matchMedia('(display-mode:standalone)').matches){
    let _prompt=null;
    const btn=document.getElementById('pwa-install-btn');
    window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();_prompt=e;btn.style.display='flex';});
    btn.addEventListener('click',async()=>{
      if(!_prompt)return;
      btn.style.opacity='.6';btn.style.pointerEvents='none';
      try{_prompt.prompt();const{outcome}=await _prompt.userChoice;if(outcome==='accepted'){btn.style.display='none';_prompt=null;}}
      catch(e){console.warn('[YM] install:',e);}
      btn.style.opacity='';btn.style.pointerEvents='';
    });
    window.matchMedia('(display-mode:standalone)').addEventListener('change',e=>{if(e.matches)btn.style.display='none';});
    window.addEventListener('appinstalled',()=>{btn.style.display='none';_prompt=null;});
  }
}
init();
</script>
</body>
</html>
