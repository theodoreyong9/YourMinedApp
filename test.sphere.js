<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Navigateur Web Minimal</title>
  <style>
    body, html {
      margin: 0;
      padding: 0;
      height: 100%;
      font-family: sans-serif;
    }
    #navbar {
      display: flex;
      padding: 5px;
      background-color: #f0f0f0;
      align-items: center;
      gap: 5px;
    }
    #url {
      flex: 1;
      padding: 5px;
    }
    #webview {
      width: 100%;
      height: calc(100% - 40px);
      border: none;
    }
  </style>
</head>
<body>
  <div id="navbar">
    <button id="go">Aller</button>
    <input type="text" id="url" placeholder="https://example.com" />
  </div>
  <iframe id="webview"></iframe>

  <script src="mon-plugin.js"></script> <!-- Ton fichier JS plugin -->
  <script>
    'use strict';

    const goButton = document.getElementById('go');
    const urlInput = document.getElementById('url');
    const webview = document.getElementById('webview');

    goButton.addEventListener('click', () => {
      let url = urlInput.value.trim();
      if (!/^https?:\/\//.test(url)) {
        url = 'https://' + url;
      }
      webview.src = url;
    });

    // Permet d'appuyer sur Entrée dans le champ URL
    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') goButton.click();
    });

    // Exemple d'utilisation de ton objet plugin
    window.YM_S.init = function() {
      console.log("Plugin YM_S initialisé !");
    };
    window.YM_S.init();
  </script>
</body>
</html>
