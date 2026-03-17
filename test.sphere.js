<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>YM Browser</title>
<style>
  body { margin:0; font-family:sans-serif; display:flex; height:100vh; }
  #sidebar { width:200px; background:#111; color:#fff; padding:10px; }
  #content { flex:1; background:#1a1a1a; color:#fff; }
  .app { padding:10px; cursor:pointer; border-bottom:1px solid #333; }
</style>
</head>
<body>

<div id="sidebar"></div>
<div id="content"></div>

<script>
'use strict';

window.YM_S = {}; // registry des spheres

// ── Fake context (important pour tes plugins)
function createCtx() {
  return {
    setNotification(n) {
      console.log('notif:', n);
    },
    onReceive(handler) {
      // stub (P2P pas implémenté ici)
      this._onReceive = handler;
    },
    loadProfile() {
      return { uuid: 'me-123', name: 'Me' };
    }
  };
}

// ── Loader de sphere
function loadSphere(src) {
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    document.body.appendChild(s);
  });
}

// ── Init
async function init() {
  // 👉 charge ton plugin ici
  await loadSphere('./messenger.sphere.js');

  const sidebar = document.getElementById('sidebar');
  const content = document.getElementById('content');

  Object.keys(window.YM_S).forEach((key) => {
    const sphere = window.YM_S[key];

    const btn = document.createElement('div');
    btn.className = 'app';
    btn.textContent = sphere.icon + ' ' + sphere.name;

    btn.onclick = () => {
      content.innerHTML = '';

      const ctx = createCtx();

      // IMPORTANT
      sphere.activate(ctx);

      if (sphere.renderPanel) {
        sphere.renderPanel(content);
      }
    };

    sidebar.appendChild(btn);
  });
}

init();
</script>

</body>
</html>
