// profile.js — YourMine Profile Panel
(function(){
'use strict';

function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function getContacts(){try{return JSON.parse(localStorage.getItem('ym_contacts_v1')||'[]');}catch{return[];}}
function getFavorites(){try{return JSON.parse(localStorage.getItem('ym_fav_contacts')||'[]');}catch{return[];}}
function setFavorites(arr){localStorage.setItem('ym_fav_contacts',JSON.stringify(arr));}
function isFav(uuid){return getFavorites().includes(uuid);}
function toggleFav(uuid){var f=getFavorites();var i=f.indexOf(uuid);if(i>=0)f.splice(i,1);else f.push(uuid);setFavorites(f);}

function render(fromSphere){
  var body=document.getElementById('panel-profile-body');
  var LP=window.YM&&window.YM.getProfile;
  var SP=window.YM&&window.YM.saveProfile;
  if(!body||!LP||!SP) return;

  // Fix z-index : s'assure que le panel profile est au-dessus
  var panelEl=document.getElementById('panel-profile');
  if(panelEl){
    panelEl.style.zIndex='302';
    // Si le panel n'est pas ouvert, force l'ouverture
    if(!panelEl.classList.contains('open'))panelEl.classList.add('open');
  }
  // Ferme proprement le panel-sphere s'il est ouvert et bloque
  var spherePanel=document.getElementById('panel-sphere');
  if(spherePanel&&spherePanel.classList.contains('open')){
    // Ne ferme pas automatiquement — l'utilisateur a peut-être voulu les deux ouverts
    // mais s'assure que profile est au-dessus
  }
  body.innerHTML='';
  body.style.cssText='display:flex;flex-direction:column;height:100%;padding:0';

  // Bouton backup dans le panel-head existant
  var panelHead=document.getElementById('panel-profile');
  panelHead=panelHead&&panelHead.querySelector('.panel-head');
  if(panelHead&&!panelHead.querySelector('#prof-backup-btn')){
    var bkBtn=document.createElement('button');
    bkBtn.id='prof-backup-btn';bkBtn.className='ym-btn ym-btn-ghost';
    bkBtn.style.cssText='padding:4px 8px;font-size:14px;min-height:unset';
    bkBtn.textContent='💾';
    panelHead.appendChild(bkBtn);
  }
  var bkBtnEl=document.getElementById('prof-backup-btn');
  if(bkBtnEl){bkBtnEl.onclick=openBackupOverlay;}

  // Zone contenu + onglets
  var tcArea=document.createElement('div');
  tcArea.id='profile-tab-content';
  tcArea.style.cssText='flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden';
  body.appendChild(tcArea);

  var tabs=document.createElement('div');
  tabs.className='ym-tabs';
  tabs.style.cssText='border-top:1px solid rgba(232,160,32,.12);border-bottom:none;margin:0;flex-shrink:0';
  body.appendChild(tabs);

  var TABS=[['contacts','Contacts'],['sph','⬡ Spheres']];

  function goTab(id){
    tabs.querySelectorAll('.ym-tab').forEach(function(t){t.classList.toggle('active',t.dataset.tab===id);});
    tcArea.innerHTML='';
    tcArea.style.overflow='hidden';
    if(id==='contacts'){renderContactsTab(tcArea);}
    else if(id==='sph'){renderSphereProfiles(tcArea,fromSphere);fromSphere=null;}
  }

  TABS.forEach(function(tabDef,i){
    var t=document.createElement('div');
    t.className='ym-tab'+(i===0?' active':'');
    t.dataset.tab=tabDef[0];t.textContent=tabDef[1];
    t.addEventListener('click',function(){goTab(tabDef[0]);});
    tabs.appendChild(t);
  });

  goTab(fromSphere?'sph':'contacts');
}

function _buildBackupData(){
  // Collecte : profil + contacts + spheres activées + configurations localStorage ym_*
  var LP=window.YM&&window.YM.getProfile;
  var data={
    _version:1,
    _date:new Date().toISOString(),
    profile:LP?LP():null,
    contacts:JSON.parse(localStorage.getItem('ym_contacts_v1')||'[]'),
    sphereConfigs:{}
  };
  // Exporte toutes les clés ym_* (configs spheres, préférences)
  for(var i=0;i<localStorage.length;i++){
    var k=localStorage.key(i);
    if(k&&k.startsWith('ym_')&&k!=='ym_wallet_v1'){// ne jamais exporter la clé wallet chiffrée directement
      try{data.sphereConfigs[k]=JSON.parse(localStorage.getItem(k));}
      catch(e){data.sphereConfigs[k]=localStorage.getItem(k);}
    }
  }
  return data;
}

function _restoreBackupData(data){
  var SP=window.YM&&window.YM.saveProfile;
  if(!data||data._version!==1)throw new Error('Format invalide');
  if(data.profile&&SP)SP(data.profile);
  if(data.contacts)localStorage.setItem('ym_contacts_v1',JSON.stringify(data.contacts));
  if(data.sphereConfigs){
    Object.keys(data.sphereConfigs).forEach(function(k){
      if(k==='ym_wallet_v1')return;// sécurité : ne jamais écraser le wallet
      var v=data.sphereConfigs[k];
      localStorage.setItem(k,typeof v==='string'?v:JSON.stringify(v));
    });
  }
}

function openBackupOverlay(){
  var overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px)';
  var box=document.createElement('div');
  box.style.cssText='background:var(--surface2);border:1px solid var(--border);border-radius:var(--r-lg);padding:20px;max-width:320px;width:90vw;max-height:90vh;overflow-y:auto';
  box.innerHTML=
    '<div style="font-family:var(--font-d);font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--accent);margin-bottom:10px">Backup / Restore</div>'+
    '<div class="ym-notice info" style="font-size:11px;margin-bottom:14px">Export ou import un fichier JSON contenant ton profil, tes contacts, les sphères activées et leurs configurations.</div>'+
    '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:8px">'+
      '<button class="ym-btn ym-btn-accent" id="bk-dl" style="width:100%">⬇ Télécharger la sauvegarde</button>'+
      '<button class="ym-btn ym-btn-ghost" id="bk-ul" style="width:100%">⬆ Importer une sauvegarde</button>'+
      '<input type="file" id="bk-file" accept=".json,application/json" style="display:none">'+
    '</div>'+
    '<div id="bk-st" class="ym-notice" style="display:none;margin-bottom:8px"></div>'+
    '<button class="ym-btn ym-btn-ghost" id="bk-close" style="width:100%;font-size:11px">Fermer</button>';
  overlay.appendChild(box);document.body.appendChild(overlay);

  function st(msg,type){var e=box.querySelector('#bk-st');e.textContent=msg;e.className='ym-notice '+(type||'info');e.style.display='flex';}

  box.querySelector('#bk-dl').addEventListener('click',function(){
    try{
      var data=_buildBackupData();
      var blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
      var a=document.createElement('a');
      a.href=URL.createObjectURL(blob);
      a.download='yourmine-backup-'+new Date().toISOString().slice(0,10)+'.json';
      a.click();URL.revokeObjectURL(a.href);
      st('Sauvegarde téléchargée ✓','success');
    }catch(e){st(e.message,'error');}
  });

  box.querySelector('#bk-ul').addEventListener('click',function(){
    box.querySelector('#bk-file').click();
  });

  box.querySelector('#bk-file').addEventListener('change',function(){
    var file=this.files[0];if(!file)return;
    var reader=new FileReader();
    reader.onload=function(ev){
      try{
        var data=JSON.parse(ev.target.result);
        _restoreBackupData(data);
        st('Restauré avec succès ✓','success');
        // Recharge tout immédiatement sans rechargement de page
        setTimeout(function(){
          // 1. Re-render profile
          render();
          // 2. Re-render liste des spheres
          if(window.YM_Liste){
            if(window.YM_Liste._forceRefresh)window.YM_Liste._forceRefresh();
            var lEl=document.getElementById('panel-mine-liste');
            if(lEl&&lEl.style.display!=='none')window.YM_Liste.render(lEl);
          }
          // 3. Re-activer les spheres sauvegardées
          var newProfile=window.YM&&window.YM.getProfile?window.YM.getProfile():null;
          var savedSpheres=(newProfile&&newProfile.spheres)||[];
          var currentSpheres=window.YM_sphereRegistry?Array.from(window.YM_sphereRegistry.keys()):[];
          // Désactive les spheres qui ne sont plus dans la sauvegarde
          currentSpheres.forEach(function(s){
            if(!savedSpheres.includes(s)&&s!=='social.sphere.js'){
              if(window.YM)window.YM.deactivateSphere(s);
            }
          });
          // Active les spheres de la sauvegarde qui ne sont pas encore actives
          savedSpheres.forEach(function(s){
            if(!window.YM_sphereRegistry||!window.YM_sphereRegistry.has(s)){
              if(window.YM_Liste)window.YM_Liste.activateSphereByName(s).catch(function(){});
            }
          });
          // 4. Re-render desk
          if(window.YM_Desk)window.YM_Desk.renderDesk();
        },50);
      }catch(e){st('Erreur : '+e.message,'error');}
    };
    reader.readAsText(file);
  });

  box.querySelector('#bk-close').addEventListener('click',function(){overlay.remove();});
  overlay.addEventListener('click',function(e){if(e.target===overlay)overlay.remove();});
}

// ── CONTACTS TAB ─────────────────────────────────────────────────────────────
function renderContactsTab(container){
  container.style.cssText='display:flex;flex-direction:column;height:100%;overflow:hidden';

  // ── Sphere filter bar ──────────────────────────────────────────
  var sphereBar=document.createElement('div');
  sphereBar.style.cssText='flex-shrink:0;padding:8px 16px 4px;border-bottom:1px solid var(--border);overflow-x:auto;white-space:nowrap;display:flex;gap:6px;-webkit-overflow-scrolling:touch';
  container.appendChild(sphereBar);

  var listWrap=document.createElement('div');
  listWrap.style.cssText='flex:1;overflow-y:auto;padding:8px 16px 4px';
  container.appendChild(listWrap);

  // Barre search + bouton + add
  var searchBar=document.createElement('div');
  searchBar.style.cssText='border-top:1px solid var(--border);padding:8px 16px 6px;flex-shrink:0;display:flex;gap:6px;align-items:center';
  searchBar.innerHTML=
    '<button id="pc-add-btn" class="ym-btn ym-btn-accent" style="padding:4px 10px;font-size:18px;line-height:1;flex-shrink:0" title="Add contact">+</button>'+
    '<input class="ym-input" id="pcs" placeholder="Search contacts…" style="flex:1;font-size:11px">'+
    '<button id="fav-btn" class="ym-btn ym-btn-ghost" style="padding:4px 10px;font-size:16px">☆</button>';
  container.appendChild(searchBar);

  // Overlay d'ajout de contact
  var addOverlay=null;
  searchBar.querySelector('#pc-add-btn').addEventListener('click',function(){
    if(addOverlay){addOverlay.remove();addOverlay=null;return;}
    addOverlay=document.createElement('div');
    addOverlay.style.cssText='position:fixed;inset:0;z-index:9990;background:rgba(0,0,0,.82);display:flex;align-items:flex-end;justify-content:center';
    var box=document.createElement('div');
    box.style.cssText='background:#12121e;border:1px solid rgba(255,255,255,.12);border-radius:18px 18px 0 0;padding:20px;width:100%;max-width:500px;box-shadow:0 -8px 32px rgba(0,0,0,.6)';
    box.innerHTML=
      '<div style="font-size:14px;font-weight:600;margin-bottom:12px">Add Contact</div>'+
      '<div style="display:flex;gap:6px;margin-bottom:8px">'+
        '<input class="ym-input" id="pc-uuid-input" placeholder="Paste UUID…" style="flex:1;font-size:12px;font-family:var(--font-m)">'+
        '<button id="pc-uuid-add" class="ym-btn ym-btn-accent" style="font-size:12px">Add</button>'+
        '<button id="pc-qr-btn" class="ym-btn ym-btn-ghost" style="padding:6px 10px;font-size:16px">📷</button>'+
      '</div>'+
      '<div id="pc-add-status" style="font-size:11px;min-height:16px"></div>'+
      '<div id="pc-qr-container" style="display:none;margin-top:10px"></div>'+
      '<button id="pc-add-close" class="ym-btn ym-btn-ghost" style="width:100%;margin-top:12px;font-size:12px">Cancel</button>';
    addOverlay.appendChild(box);document.body.appendChild(addOverlay);
    addOverlay.addEventListener('click',function(e){if(e.target===addOverlay){addOverlay.remove();addOverlay=null;}});
    box.querySelector('#pc-add-close').addEventListener('click',function(){addOverlay.remove();addOverlay=null;});

    box.querySelector('#pc-uuid-add').addEventListener('click',function(){
      var uuid=box.querySelector('#pc-uuid-input').value.trim();
      var status=box.querySelector('#pc-add-status');
      if(!uuid){status.textContent='Enter a UUID';status.style.color='#e84040';return;}
      addContactByUUID(uuid,function(msg,ok){
        status.textContent=msg;status.style.color=ok?'#30e880':'#e84040';
        if(ok){renderList(searchBar.querySelector('#pcs').value.toLowerCase());buildSphereBar();setTimeout(function(){if(addOverlay){addOverlay.remove();addOverlay=null;}},800);}
      });
    });

    box.querySelector('#pc-qr-btn').addEventListener('click',function(){
      var qrC=box.querySelector('#pc-qr-container');
      if(qrC.style.display==='none'){
        qrC.style.display='block';qrC.innerHTML='';
        startQRScanner(qrC,function(result){
          if(result){box.querySelector('#pc-uuid-input').value=result;qrC.style.display='none';}
          else{qrC.style.display='none';}
        });
      }else{qrC.style.display='none';qrC.innerHTML='';}
    });
  });

  var showFavOnly=false;
  var q='';
  var activeSphere=''; // sphere filtrée

  // ── Construit la barre de spheres communes ─────────────────────
  function buildSphereBar(){
    sphereBar.innerHTML='';
    var contacts=getContacts();
    var mySpheres=(window.YM&&window.YM.getProfile&&window.YM.getProfile().spheres)||[];
    // Collecte toutes les spheres présentes chez au moins un contact
    var sphereCounts={};
    contacts.forEach(function(c){
      var cSpheres=(c.profile&&c.profile.spheres)||[];
      cSpheres.filter(function(s){return mySpheres.includes(s);}).forEach(function(s){
        sphereCounts[s]=(sphereCounts[s]||0)+1;
      });
    });
    var sphereList=Object.keys(sphereCounts).sort(function(a,b){return sphereCounts[b]-sphereCounts[a];});
    if(!sphereList.length){sphereBar.style.display='none';return;}
    sphereBar.style.display='flex';
    // Pill "All"
    var allPill=document.createElement('span');
    allPill.className='pill'+(activeSphere?'':' active');
    allPill.style.cssText='cursor:pointer;flex-shrink:0';
    allPill.textContent='All';
    allPill.addEventListener('click',function(){activeSphere='';buildSphereBar();renderList(q);});
    sphereBar.appendChild(allPill);
    // Pills par sphere
    sphereList.forEach(function(sName){
      var sObj=window.YM_sphereRegistry&&window.YM_sphereRegistry.get(sName);
      var icon=(sObj&&sObj.icon)||'⬡';
      var label=sName.replace('.sphere.js','');
      var pill=document.createElement('span');
      pill.className='pill'+(activeSphere===sName?' active':'');
      pill.style.cssText='cursor:pointer;flex-shrink:0;display:flex;align-items:center;gap:4px';
      pill.innerHTML=icon+' '+esc(label)+' <span style="font-size:9px;opacity:.6">('+sphereCounts[sName]+')</span>';
      pill.addEventListener('click',function(){
        activeSphere=activeSphere===sName?'':sName;
        buildSphereBar();renderList(q);
      });
      sphereBar.appendChild(pill);
    });
  }

  function renderList(query){
    q=query||'';
    listWrap.innerHTML='';
    var contacts=getContacts();
    var filtered=contacts;
    if(showFavOnly)filtered=filtered.filter(function(c){return isFav(c.uuid);});
    if(q)filtered=filtered.filter(function(c){
      var n=(c.nickname||(c.profile&&c.profile.name)||c.uuid).toLowerCase();
      return n.indexOf(q)>=0;
    });
    // Filtre par sphere si activée
    if(activeSphere){
      filtered=filtered.filter(function(c){
        var cSpheres=(c.profile&&c.profile.spheres)||[];
        return cSpheres.includes(activeSphere);
      });
    }
    if(!filtered.length){
      listWrap.innerHTML='<div style="color:var(--text3);font-size:12px;padding:8px 0">No contacts'+(showFavOnly?' in favorites':'')+'</div>';
      return;
    }
    filtered.forEach(function(c){
      var prof=c.profile||{uuid:c.uuid,name:c.nickname||'Unknown'};
      var fav=isFav(c.uuid);
      var isNear=!!(window.YM_Social&&window.YM_Social._nearUsers&&window.YM_Social._nearUsers.has(c.uuid));
      var isReciproc=!!(window.YM_Social&&window.YM_Social.isReciprocal&&window.YM_Social.isReciprocal(c.uuid));
      var canCall=isNear&&isReciproc;
      var hasMsg=!!(window.YM_sphereRegistry&&window.YM_sphereRegistry.has('messenger.sphere.js'));

      var card=document.createElement('div');
      card.className='ym-card';
      card.style.cssText='cursor:pointer;margin-bottom:8px';

      var avImg='<img src="'+prof.avatar+'" style="width:40px;height:40px;border-radius:50%;object-fit:cover;flex-shrink:0">';
      var avFb='<div style="width:40px;height:40px;border-radius:50%;background:var(--surface3);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">'+((prof.name&&prof.name.charAt(0))||'👤')+'</div>';
      var av=prof.avatar?avImg:avFb;

      var actions='<div style="display:flex;align-items:center;gap:12px;flex-shrink:0">'+
        (canCall?'<button data-call style="background:none;border:none;font-size:20px;cursor:pointer;padding:0;line-height:1">📞</button>':'')+
        (hasMsg?'<button data-msg style="background:none;border:none;font-size:20px;cursor:pointer;padding:0;line-height:1">💬</button>':'')+
        '<span data-fav style="font-size:20px;cursor:pointer;color:'+(fav?'var(--accent)':'var(--text3)')+';line-height:1">'+(fav?'★':'☆')+'</span>'+
        '<button data-del style="background:none;border:none;width:24px;height:24px;border-radius:50%;background:var(--surface3);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:12px;cursor:pointer;color:var(--text3);flex-shrink:0">×</button>'+
      '</div>';

      // Si une sphere est sélectionnée, affiche la section peerSection de cette sphere en dessous
      var sphereSection='';
      if(activeSphere){
        var sObj2=window.YM_sphereRegistry&&window.YM_sphereRegistry.get(activeSphere);
        if(sObj2&&typeof sObj2.peerSection==='function'){
          sphereSection='<div id="peer-sphere-'+c.uuid.replace(/-/g,'_')+'"></div>';
        }
      }

      card.innerHTML=
        '<div data-contact-header style="display:flex;align-items:center;gap:10px;cursor:pointer">'+
          av+
          '<div style="flex:1;min-width:0">'+
            '<div style="font-weight:600;font-size:13px">'+(c.nickname||prof.name||'Anonymous')+'</div>'+
            (prof.bio?'<div style="font-size:11px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(prof.bio)+'</div>':'')+
          '</div>'+
          actions+
        '</div>'+
        sphereSection;

      card.querySelector('[data-fav]').addEventListener('click',function(e){e.stopPropagation();toggleFav(c.uuid);renderList(q);});
      card.querySelector('[data-del]').addEventListener('click',function(e){
        e.stopPropagation();
        localStorage.setItem('ym_contacts_v1',JSON.stringify(getContacts().filter(function(x){return x.uuid!==c.uuid;})));
        renderList(q);buildSphereBar();
      });
      var msgBtn=card.querySelector('[data-msg]');
      if(msgBtn){msgBtn.addEventListener('click',function(e){
        e.stopPropagation();
        if(window.YM_Messenger&&window.YM_Messenger.openConv){window.YM_Messenger.openConv(c.uuid);}
        if(window.YM&&window.YM.openSpherePanel){window.YM.openSpherePanel('messenger.sphere.js');}
      });}
      var callBtn=card.querySelector('[data-call]');
      if(callBtn){callBtn.addEventListener('click',function(e){
        e.stopPropagation();
        if(window.YM_Social&&window.YM_Social.startVoiceCall){window.YM_Social.startVoiceCall(c.uuid);}
      });}
      card.addEventListener('click',function(e){
        // Ouvre le profil uniquement si on clique sur la barre du nom (header), pas sur le dépliant sphere
        if(e.target.closest('[data-contact-header]')&&!e.target.closest('[data-fav]')&&!e.target.closest('[data-del]')&&!e.target.closest('[data-msg]')&&!e.target.closest('[data-call]')){
          if(window.YM&&window.YM.openProfilePanel){window.YM.openProfilePanel(prof);}
        }
      });
      listWrap.appendChild(card);

      // Injecte le peerSection de la sphere active sous la card
      if(activeSphere){
        var slotId='peer-sphere-'+c.uuid.replace(/-/g,'_');
        var slot=card.querySelector('#'+slotId);
        if(slot){
          var sObj3=window.YM_sphereRegistry&&window.YM_sphereRegistry.get(activeSphere);
          if(sObj3&&typeof sObj3.peerSection==='function'){
            slot.style.cssText='margin-top:8px;padding-top:8px;border-top:1px solid var(--border)';
            try{
              var pCtx={uuid:c.uuid,isNear:isNear,isReciproc:isReciproc,profile:prof};
              sObj3.peerSection(slot,pCtx);
            }catch(e2){}
          }
        }
      }
    });
  }

  buildSphereBar();
  renderList();

  searchBar.querySelector('#pcs').addEventListener('input',function(e){renderList(e.target.value.toLowerCase());});
  searchBar.querySelector('#fav-btn').addEventListener('click',function(){
    showFavOnly=!showFavOnly;
    var btn=searchBar.querySelector('#fav-btn');
    btn.style.color=showFavOnly?'var(--accent)':'var(--text3)';
    btn.textContent=showFavOnly?'★':'☆';
    renderList(searchBar.querySelector('#pcs').value.toLowerCase());
  });
}

function addContactByUUID(uuid,cb){
  uuid=(uuid||'').trim();
  if(!uuid){if(cb)cb('Enter a UUID',false);return;}
  var all=getContacts();
  if(all.find(function(c){return c.uuid===uuid;})){if(cb)cb('Already in contacts',false);return;}
  var near=window.YM_Social&&window.YM_Social._nearUsers;
  var profile=null;
  if(near&&near.has(uuid)){var u=near.get(uuid);profile=u.profile||{uuid:uuid,name:''};}
  all.push({uuid:uuid,nickname:'',profile:profile||{uuid:uuid,name:''}});
  localStorage.setItem('ym_contacts_v1',JSON.stringify(all));
  if(cb)cb('Added ✓',true);
}

function startQRScanner(container,onResult){
  container.innerHTML=
    '<div style="display:flex;gap:6px;align-items:center;padding:4px 0">'+
      '<input type="file" id="qr-file-input" accept="image/*" style="display:none">'+
      '<button id="qr-gallery-btn" class="ym-btn ym-btn-ghost" style="flex:1;font-size:11px">🖼 Image QR</button>'+
      '<button id="qr-camera-btn" class="ym-btn ym-btn-ghost" style="flex:1;font-size:11px">📷 Caméra live</button>'+
    '</div>'+
    '<div id="qr-video-wrap" style="display:none;margin-top:6px">'+
      '<video id="qr-video" autoplay playsinline muted style="width:100%;border-radius:8px;max-height:160px;object-fit:cover"></video>'+
      '<canvas id="qr-canvas" style="display:none"></canvas>'+
      '<div id="qr-scan-msg" style="font-size:10px;color:var(--text3);text-align:center;margin-top:4px">Pointez le QR code vers la caméra…</div>'+
    '</div>';

  function extractUUID(raw){
    if(!raw)return null;
    var m=raw.match(/yourmine:\/\/(?:contact|profile)\/([a-f0-9-]{36})/i);if(m)return m[1];
    m=raw.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);if(m)return m[1];
    return null;
  }

  function scanFile(file){
    if(!file)return;
    if(window.BarcodeDetector){
      createImageBitmap(file).then(function(img){return new BarcodeDetector({formats:['qr_code']}).detect(img);})
        .then(function(res){onResult(extractUUID(res[0]&&res[0].rawValue));})
        .catch(function(){onResult(null);});
    }else{onResult(null);}
  }

  var fi=container.querySelector('#qr-file-input');
  container.querySelector('#qr-gallery-btn').addEventListener('click',function(){fi.click();});
  fi.addEventListener('change',function(){scanFile(this.files[0]);});

  var _stream=null;
  container.querySelector('#qr-camera-btn').addEventListener('click',function(){
    var wrap=container.querySelector('#qr-video-wrap');
    if(wrap.style.display!=='none'){
      wrap.style.display='none';
      if(_stream){_stream.getTracks().forEach(function(t){t.stop();});_stream=null;}
      return;
    }
    if(!navigator.mediaDevices){onResult(null);return;}
    wrap.style.display='block';
    navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}}).then(function(stream){
      _stream=stream;
      var video=wrap.querySelector('#qr-video'),canvas=wrap.querySelector('#qr-canvas'),msg=wrap.querySelector('#qr-scan-msg');
      video.srcObject=stream;
      function tick(){
        if(!video.videoWidth){requestAnimationFrame(tick);return;}
        canvas.width=video.videoWidth;canvas.height=video.videoHeight;
        canvas.getContext('2d').drawImage(video,0,0);
        if(window.BarcodeDetector){
          new BarcodeDetector({formats:['qr_code']}).detect(canvas)
            .then(function(res){
              if(res.length){stream.getTracks().forEach(function(t){t.stop();});onResult(extractUUID(res[0].rawValue));}
              else requestAnimationFrame(tick);
            }).catch(function(){requestAnimationFrame(tick);});
        }else{msg.textContent='BarcodeDetector non supporté sur ce navigateur';}
      }
      requestAnimationFrame(tick);
    }).catch(function(e){wrap.querySelector('#qr-scan-msg').textContent='Caméra refusée : '+e.message;});
  });

  // Cleanup si le container est retiré
  var _obs=new MutationObserver(function(){
    if(!document.body.contains(container)){
      if(_stream){_stream.getTracks().forEach(function(t){t.stop();});}
      _obs.disconnect();
    }
  });
  _obs.observe(document.body,{childList:true,subtree:true});
}

// ── SPHERES TAB ───────────────────────────────────────────────────────────────
function renderSphereProfiles(container,fromSphere){
  container.style.cssText='flex:1;overflow-y:auto;padding:12px 16px';
  container.innerHTML='';
  var p=window.YM&&window.YM.getProfile&&window.YM.getProfile();
  var active=(p&&p.spheres)||[];
  if(!active.length){container.innerHTML='<div style="color:var(--text3);font-size:12px;padding:8px 0">No active spheres</div>';return;}
  active.forEach(function(name){
    var s=window.YM_sphereRegistry&&window.YM_sphereRegistry.get(name);
    var wrap=document.createElement('div');wrap.style.cssText='margin-bottom:8px;border:1px solid var(--border);border-radius:var(--r);overflow:hidden';
    var label=name.replace('.sphere.js','');
    var iconIsUrl=s&&s.icon&&(s.icon.indexOf('http')===0||s.icon.indexOf('/')===0);
    var iconHtml=iconIsUrl?'<img src="'+s.icon+'" style="width:24px;height:24px;border-radius:4px;object-fit:contain">':'<span style="font-size:20px">'+((s&&s.icon)||'⬡')+'</span>';
    var hdr=document.createElement('div');
    hdr.style.cssText='display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--surface2);cursor:pointer;user-select:none;-webkit-user-select:none';
    hdr.innerHTML=iconHtml+'<span style="font-family:var(--font-d);font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--accent);flex:1">'+label+'</span><span style="font-size:11px;color:var(--text3)">▼</span>';
    var content=document.createElement('div');content.style.cssText='padding:12px 14px;display:none;background:var(--surface)';
    var open=false;
    function openAcc(){
      open=true;content.style.display='';hdr.querySelector('span:last-child').textContent='▲';
      if(!content.children.length){
        if(s&&typeof s.profileSection==='function'){try{s.profileSection(content);}catch(e){content.innerHTML='<div style="color:var(--text3);font-size:11px">'+e.message+'</div>';}}
        else{content.innerHTML='<div style="color:var(--text2);font-size:12px">'+((s&&s.description)||'Active')+'</div>';}
      }
    }
    hdr.addEventListener('click',function(){open=!open;if(open)openAcc();else{content.style.display='none';hdr.querySelector('span:last-child').textContent='▼';}});
    wrap.appendChild(hdr);wrap.appendChild(content);container.appendChild(wrap);
    if(fromSphere&&name===fromSphere&&s&&s.profileSection){requestAnimationFrame(function(){openAcc();wrap.scrollIntoView({behavior:'smooth',block:'start'});});}
  });
}

// ── SHARE OVERLAY ─────────────────────────────────────────────────────────────
function showShare(){
  var p=window.YM&&window.YM.getProfile&&window.YM.getProfile();
  if(!p||!p.uuid)return;
  var overlay=document.getElementById('ym-share-overlay');
  if(overlay){overlay.remove();return;}
  overlay=document.createElement('div');
  overlay.id='ym-share-overlay';
  overlay.style.cssText='position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px)';
  var box=document.createElement('div');
  box.style.cssText='background:var(--surface2);border:1px solid var(--accent);border-radius:var(--r-lg);padding:24px;text-align:center;max-width:280px;width:90vw';
  box.innerHTML=
    '<div style="font-family:var(--font-d);font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--accent);margin-bottom:16px">Share profile</div>'+
    '<div id="share-qr-box" style="display:flex;justify-content:center;margin-bottom:12px"></div>'+
    '<div style="font-family:var(--font-m);font-size:9px;color:var(--text3);word-break:break-all;margin-bottom:12px">'+p.uuid+'</div>'+
    '<div style="display:flex;gap:8px">'+
      '<button class="ym-btn ym-btn-ghost" id="share-copy-btn" style="flex:1;font-size:11px">⧉ Copy UUID</button>'+
      '<button class="ym-btn ym-btn-ghost" id="share-close-btn" style="font-size:11px">✕</button>'+
    '</div>';
  overlay.appendChild(box);document.body.appendChild(overlay);
  var qrEl=box.querySelector('#share-qr-box');
  function doQR(){new window.QRCode(qrEl,{text:'yourmine://contact/'+p.uuid,width:140,height:140,correctLevel:QRCode.CorrectLevel.M});}
  if(window.QRCode)doQR();else{var s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';s.onload=doQR;document.head.appendChild(s);}
  box.querySelector('#share-copy-btn').addEventListener('click',function(){
    if(navigator.clipboard){navigator.clipboard.writeText(p.uuid);}
    if(window.YM_toast){window.YM_toast('UUID copied','success');}
  });
  box.querySelector('#share-close-btn').addEventListener('click',function(){overlay.remove();});
  overlay.addEventListener('click',function(e){if(e.target===overlay)overlay.remove();});
}

window.YM_Profile={render:render,renderFor:function(n){render(n);},showShare:showShare};

// ── FICHE PROFIL D'UN PAIR ────────────────────────────────────────────────
// Appelé par index.html openProfilePanel(profile)
// Ne connaît aucune sphère spécifique — appelle le hook peerSection de chacune
function renderPeerProfile(container,profile){
  container.innerHTML='';
  container.style.cssText='flex:1;overflow-y:auto;padding:16px';

  var myUUID=window.YM&&window.YM.getProfile&&window.YM.getProfile().uuid;
  var isContact=false;
  try{
    var contacts=JSON.parse(localStorage.getItem('ym_contacts_v1')||'[]');
    isContact=contacts.some(function(c){return c.uuid===profile.uuid;});
  }catch(e){}
  var isNear=!!(window.YM_Social&&window.YM_Social._nearUsers&&window.YM_Social._nearUsers.has(profile.uuid));
  var isReciproc=!!(window.YM_Social&&window.YM_Social.isReciprocal&&window.YM_Social.isReciprocal(profile.uuid));

  // ── Contact bar ───────────────────────────────────────────
  var contactBar=document.createElement('div');
  if(isContact){
    contactBar.style.cssText='display:flex;align-items:center;gap:8px;margin-bottom:12px;padding:8px 12px;background:rgba(48,232,128,.08);border:1px solid rgba(48,232,128,.25);border-radius:var(--r-sm)';
    contactBar.innerHTML='<span style="color:#30e880;font-size:12px;flex:1">✓ In contacts</span>';
    var rmBtn=document.createElement('button');
    rmBtn.className='ym-btn ym-btn-ghost';rmBtn.style.cssText='padding:4px 10px;font-size:11px;min-height:unset;color:#e84040';
    rmBtn.textContent='Remove';
    rmBtn.addEventListener('click',function(){
      try{
        var all=JSON.parse(localStorage.getItem('ym_contacts_v1')||'[]');
        localStorage.setItem('ym_contacts_v1',JSON.stringify(all.filter(function(c){return c.uuid!==profile.uuid;})));
      }catch(e){}
      if(window.YM_toast){window.YM_toast('Contact removed','info');}
      renderPeerProfile(container,profile);
    });
    contactBar.appendChild(rmBtn);
  }else{
    var addBtn=document.createElement('button');
    addBtn.className='ym-btn ym-btn-accent';
    addBtn.style.cssText='width:100%;margin-bottom:12px';
    addBtn.textContent='+ Add Contact';
    addBtn.addEventListener('click',function(){
      try{
        var all=JSON.parse(localStorage.getItem('ym_contacts_v1')||'[]');
        if(!all.find(function(c){return c.uuid===profile.uuid;})){
          all.push({uuid:profile.uuid,nickname:'',profile:profile});
          localStorage.setItem('ym_contacts_v1',JSON.stringify(all));
        }
      }catch(e){}
      if(window.YM_toast){window.YM_toast('Contact added','success');}
      renderPeerProfile(container,profile);
    });
    contactBar.appendChild(addBtn);
  }
  container.appendChild(contactBar);

  // ── Avatar + identité ──────────────────────────────────────
  var ident=document.createElement('div');
  ident.style.cssText='text-align:center;padding:12px 0 16px';
  var rawSite=profile.site||'';
  var siteUrl=rawSite&&!rawSite.startsWith('http')?'https://'+rawSite:rawSite;
  var av=profile.avatar?'<img src="'+profile.avatar+'" style="width:72px;height:72px;border-radius:50%;object-fit:cover">':'<div style="width:72px;height:72px;border-radius:50%;background:var(--surface3);display:flex;align-items:center;justify-content:center;font-size:32px;margin:0 auto">'+(profile.name&&profile.name.charAt(0)||'👤')+'</div>';
  ident.innerHTML=
    '<div style="margin-bottom:8px">'+av+'</div>'+
    '<div style="font-size:18px;font-weight:600;margin-bottom:4px">'+(profile.name||'Anonymous')+'</div>'+
    (profile.bio?'<div style="font-size:13px;color:var(--text2);max-width:280px;margin:0 auto 4px">'+profile.bio+'</div>':'')+
    (siteUrl?'<a href="'+siteUrl+'" target="_blank" rel="noopener" style="font-size:11px;color:var(--cyan)">'+rawSite+'</a>':'')+
    (isNear?'<div style="font-size:10px;color:#30e880;margin-top:6px">● Nearby</div>':'');
  container.appendChild(ident);

  // ── Réseaux ───────────────────────────────────────────────
  if(profile.networks&&profile.networks.length){
    var nets=document.createElement('div');nets.className='ym-card';
    nets.style.cssText='margin-bottom:10px';
    nets.innerHTML='<div class="ym-card-title">Social Networks</div><div style="display:flex;flex-wrap:wrap;gap:4px">'+
      profile.networks.map(function(n){return '<span class="pill">'+n.id+' '+n.handle+'</span>';}).join('')+'</div>';
    container.appendChild(nets);
  }

  // ── Wallet ────────────────────────────────────────────────
  if(profile.pubkey){
    var wallet=document.createElement('div');wallet.className='ym-card';
    wallet.style.cssText='margin-bottom:10px';
    wallet.innerHTML='<div class="ym-card-title">Wallet</div>'+
      '<div style="font-family:var(--font-m);font-size:9px;color:var(--text3);word-break:break-all">'+profile.pubkey+'</div>';
    container.appendChild(wallet);
  }

  // ── Sphères via hook peerSection ──────────────────────────
  if(profile.spheres&&profile.spheres.length){
    var mySpheres=(window.YM&&window.YM.getProfile&&window.YM.getProfile().spheres)||[];
    var shared=profile.spheres.filter(function(s){return mySpheres.includes(s);});
    var others=profile.spheres.filter(function(s){return !mySpheres.includes(s);});

    var ctx={uuid:profile.uuid,isNear:isNear,isReciproc:isReciproc};

    if(shared.length){
      var sharedTitle=document.createElement('div');
      sharedTitle.style.cssText='font-family:var(--font-d);font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--accent);margin:12px 0 6px';
      sharedTitle.textContent='Spheres in common';
      container.appendChild(sharedTitle);
      shared.forEach(function(sphereFile){
        _renderPeerAccordion(container,sphereFile,ctx);
      });
    }

    if(others.length){
      var othersTitle=document.createElement('div');
      othersTitle.style.cssText='font-family:var(--font-d);font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text3);margin:12px 0 6px';
      othersTitle.textContent='Other spheres';
      container.appendChild(othersTitle);
      others.forEach(function(sphereFile){
        var sphereName=sphereFile.replace('.sphere.js','');
        var sphereObj=window.YM_sphereRegistry&&window.YM_sphereRegistry.get(sphereFile);
        var row=document.createElement('div');
        row.style.cssText='display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--border);border-radius:var(--r-sm);margin-bottom:6px;cursor:pointer;opacity:.7';
        var icon=(sphereObj&&sphereObj.icon)||'⬡';
        row.innerHTML='<span style="font-size:16px">'+icon+'</span>'+
          '<span style="font-size:12px;flex:1">'+sphereName+'</span>'+
          '<span style="font-size:11px;color:var(--accent)">↗ Find</span>';
        row.addEventListener('click',function(){
          if(window.YM_Liste&&window.YM_Liste._searchAndOpen)window.YM_Liste._searchAndOpen(sphereName);
          if(window.YM&&window.YM.openPanel)window.YM.openPanel('panel-spheres');
        });
        container.appendChild(row);
      });
    }
  }
}

function _renderPeerAccordion(container,sphereFile,ctx){
  var sphereName=sphereFile.replace('.sphere.js','');
  var sphereObj=window.YM_sphereRegistry&&window.YM_sphereRegistry.get(sphereFile);
  var icon=(sphereObj&&sphereObj.icon)||'⬡';

  var wrap=document.createElement('div');
  wrap.style.cssText='border:1px solid var(--border);border-radius:var(--r-sm);margin-bottom:6px';

  var hdr=document.createElement('div');
  hdr.style.cssText='display:flex;align-items:center;gap:8px;padding:9px 12px;cursor:pointer;background:rgba(255,255,255,.02)';
  hdr.innerHTML=
    '<span style="font-size:16px">'+icon+'</span>'+
    '<span style="font-size:12px;font-weight:600;flex:1">'+sphereName+'</span>'+
    '<span class="acc-arrow" style="font-size:10px;color:var(--text3)">›</span>';

  var body=document.createElement('div');
  body.style.cssText='display:none;padding:10px 12px;border-top:1px solid var(--border)';

  hdr.addEventListener('click',function(){
    var open=body.style.display!=='none';
    body.style.display=open?'none':'block';
    hdr.querySelector('.acc-arrow').textContent=open?'›':'⌄';
    // Charge le contenu au premier clic via peerSection
    if(!open&&!body.children.length){
      if(sphereObj&&typeof sphereObj.peerSection==='function'){
        try{sphereObj.peerSection(body,ctx);}
        catch(e){body.innerHTML='<div style="color:var(--text3);font-size:11px">'+e.message+'</div>';}
      }else{
        body.innerHTML='<div style="font-size:11px;color:var(--text2)">'+(sphereObj&&sphereObj.description||'No interactions available')+'</div>';
      }
    }
  });

  wrap.appendChild(hdr);wrap.appendChild(body);
  container.appendChild(wrap);
}

// Enregistre le renderer pour index.html
window._renderProfileView=renderPeerProfile;

})();
