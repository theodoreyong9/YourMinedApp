// profile.js — YourMine Profile Panel
(function(){
'use strict';

function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function getContacts(){try{return JSON.parse(localStorage.getItem('ym_contacts_v1')||'[]');}catch{return[];}}
function getFavorites(){try{return JSON.parse(localStorage.getItem('ym_fav_contacts')||'[]');}catch{return[];}}
function setFavorites(arr){localStorage.setItem('ym_fav_contacts',JSON.stringify(arr));}
function isFav(uuid){return getFavorites().includes(uuid);}
function toggleFav(uuid){var f=getFavorites();var i=f.indexOf(uuid);if(i>=0)f.splice(i,1);else f.push(uuid);setFavorites(f);}


// ── SPHERE VISIBILITY ─────────────────────────────────────────────────────────
var VISIBILITY_KEY='ym_sphere_visibility';
function getVisibility(){try{return JSON.parse(localStorage.getItem(VISIBILITY_KEY)||'{}');}catch{return{};}}
function setVisibility(obj){localStorage.setItem(VISIBILITY_KEY,JSON.stringify(obj));}
function getSphereVisibility(name){return getVisibility()[name]||'all';}
function setSphereVisibility(name,val){var v=getVisibility();v[name]=val;setVisibility(v);}
window.YM_getSphereVisibility=getSphereVisibility;
window.YM_canSeeSphere=function(sphereName,peerUUID){
  var vis=getSphereVisibility(sphereName);
  if(vis==='all')return true;
  if(vis==='contacts')return getContacts().some(function(c){return c.uuid===peerUUID;});
  if(Array.isArray(vis))return vis.includes(peerUUID);
  return true;
};

// ── SPHERES TAB ───────────────────────────────────────────────────────────────
function renderSphereProfiles(container,fromSphere){
  container.style.cssText='flex:1;overflow-y:auto;padding:12px 16px';
  container.innerHTML='';

  // Re-render if a sphere activates after profile is open
  var _sphereListener=function(){
    if(container.isConnected) renderSphereProfiles(container,null);
  };
  window.addEventListener('ym:sphere-activated',_sphereListener,{once:false});
  // Clean up when container is removed
  var _obs=new MutationObserver(function(){
    if(!document.body.contains(container)){
      window.removeEventListener('ym:sphere-activated',_sphereListener);
      _obs.disconnect();
    }
  });
  _obs.observe(document.body,{childList:true,subtree:true});
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
        // ── Visibilité ──────────────────────────────────────────────
        var visRow=document.createElement('div');
        visRow.style.cssText='margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid var(--border)';
        var curVis=getSphereVisibility(name);
        var contacts=getContacts();
        visRow.innerHTML=
          '<div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--text3);margin-bottom:8px">Qui peut voir cette sphère active</div>'+
          '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">'+
            '<button class="ym-btn vis-pill '+(curVis==='all'?'ym-btn-accent':'ym-btn-ghost')+'" data-vis="all" style="font-size:10px;padding:4px 10px">Tous</button>'+
            '<button class="ym-btn vis-pill '+(curVis==='contacts'?'ym-btn-accent':'ym-btn-ghost')+'" data-vis="contacts" style="font-size:10px;padding:4px 10px">Contacts</button>'+
            (contacts.length?'<button class="ym-btn vis-pill '+(Array.isArray(curVis)?'ym-btn-accent':'ym-btn-ghost')+'" data-vis="custom" style="font-size:10px;padding:4px 10px">Sélection</button>':'')+'</div>'+
          '<div id="vis-custom-'+name.replace(/\./g,'_')+'" style="display:'+(Array.isArray(curVis)?'block':'none')+'">'+
            (contacts.map(function(c){
              var isSelected=Array.isArray(curVis)&&curVis.includes(c.uuid);
              var cname=(c.nickname||(c.profile&&c.profile.name)||c.uuid.slice(0,8));
              return'<label style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px;cursor:pointer"><input type="checkbox" data-uuid="'+c.uuid+'" '+(isSelected?'checked':'')+'>'+esc(cname)+'</label>';
            }).join(''))+
          '</div>';

        visRow.querySelectorAll('.vis-pill').forEach(function(btn){
          btn.addEventListener('click',function(){
            var val=this.dataset.vis;
            if(val==='custom'){
              var customDiv=visRow.querySelector('#vis-custom-'+name.replace(/\./g,'_'));
              customDiv.style.display=customDiv.style.display==='none'?'block':'none';
              var checked=Array.from(customDiv.querySelectorAll('input:checked')).map(function(i){return i.dataset.uuid;});
              setSphereVisibility(name,checked.length?checked:'contacts');
            }else{
              setSphereVisibility(name,val);
              var customDiv=visRow.querySelector('#vis-custom-'+name.replace(/\./g,'_'));
              if(customDiv)customDiv.style.display='none';
            }
            visRow.querySelectorAll('.vis-pill').forEach(function(b){
              var curV=getSphereVisibility(name);
              var match=(b.dataset.vis==='custom'&&Array.isArray(curV))||(b.dataset.vis===curV);
              b.className='ym-btn vis-pill '+(match?'ym-btn-accent':'ym-btn-ghost');
              b.style.cssText='font-size:10px;padding:4px 10px';
            });
          });
        });

        var customDiv=visRow.querySelector('#vis-custom-'+name.replace(/\./g,'_'));
        if(customDiv){
          customDiv.querySelectorAll('input[type=checkbox]').forEach(function(cb){
            cb.addEventListener('change',function(){
              var checked=Array.from(customDiv.querySelectorAll('input:checked')).map(function(i){return i.dataset.uuid;});
              setSphereVisibility(name,checked.length?checked:[]);
            });
          });
        }

        content.appendChild(visRow);

        // FIX: use a dedicated subcontainer so sphere's innerHTML= can't overwrite the visibility toggle
        if(s&&typeof s.profileSection==='function'){
          var profileSubContainer=document.createElement('div');
          content.appendChild(profileSubContainer);
          try{s.profileSection(profileSubContainer);}
          catch(e){profileSubContainer.innerHTML='<div style="color:var(--text3);font-size:11px">'+e.message+'</div>';}
        }else if(!s){
          content.innerHTML+='<div style="color:var(--text2);font-size:12px">Active</div>';
        }
      }
    }
    hdr.addEventListener('click',function(){open=!open;if(open)openAcc();else{content.style.display='none';hdr.querySelector('span:last-child').textContent='▼';}});
    wrap.appendChild(hdr);wrap.appendChild(content);container.appendChild(wrap);
    if(fromSphere&&name===fromSphere&&s&&s.profileSection){requestAnimationFrame(function(){openAcc();wrap.scrollIntoView({behavior:'smooth',block:'start'});});}

  });
}

function render(fromSphere){
  var body=document.getElementById('panel-profile-body');
  var LP=window.YM&&window.YM.getProfile;
  var SP=window.YM&&window.YM.saveProfile;
  if(!body||!LP||!SP) return;
  var panelEl=document.getElementById('panel-profile');
  if(panelEl){panelEl.style.zIndex='302';if(!panelEl.classList.contains('open'))panelEl.classList.add('open');}
  body.innerHTML='';
  body.style.cssText='display:flex;flex-direction:column;height:100%;padding:0';
  var panelHead=document.getElementById('panel-profile');
  panelHead=panelHead&&panelHead.querySelector('.panel-head');
  if(panelHead&&!panelHead.querySelector('#prof-menu-btn')){
    var menuBtn=document.createElement('button');menuBtn.id='prof-menu-btn';menuBtn.className='ym-btn ym-btn-ghost';
    menuBtn.style.cssText='padding:4px 10px;font-size:16px;min-height:unset';menuBtn.textContent='⚙';panelHead.appendChild(menuBtn);
  }
  var menuBtnEl=document.getElementById('prof-menu-btn');
  if(menuBtnEl){menuBtnEl.onclick=function(){_openProfileMenu();};}
  var tcArea=document.createElement('div');tcArea.id='profile-tab-content';
  tcArea.style.cssText='flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden';body.appendChild(tcArea);
  var tabs=document.createElement('div');tabs.className='ym-tabs';
  tabs.style.cssText='border-top:1px solid rgba(232,160,32,.12);border-bottom:none;margin:0;flex-shrink:0';body.appendChild(tabs);
  var TABS=[['contacts','Contacts'],['sph','⬡ Spheres']];
  function goTab(id){
    tabs.querySelectorAll('.ym-tab').forEach(function(t){t.classList.toggle('active',t.dataset.tab===id);});
    tcArea.innerHTML='';tcArea.style.overflow='hidden';
    if(id==='contacts'){renderContactsTab(tcArea);}
    else if(id==='sph'){renderSphereProfiles(tcArea,fromSphere);fromSphere=null;}
  }
  TABS.forEach(function(tabDef,i){
    var t=document.createElement('div');t.className='ym-tab'+(i===0?' active':'');t.dataset.tab=tabDef[0];t.textContent=tabDef[1];
    t.addEventListener('click',function(){goTab(tabDef[0]);});tabs.appendChild(t);
  });
  goTab(fromSphere?'sph':'contacts');
}

function _buildBackupData(){
  var LP=window.YM&&window.YM.getProfile;
  var data={_version:1,_date:new Date().toISOString(),profile:LP?LP():null,
    contacts:JSON.parse(localStorage.getItem('ym_contacts_v1')||'[]'),sphereConfigs:{}};
  for(var i=0;i<localStorage.length;i++){
    var k=localStorage.key(i);
    if(k&&k.startsWith('ym_')&&k!=='ym_wallet_v1'){
      try{data.sphereConfigs[k]=JSON.parse(localStorage.getItem(k));}
      catch(e){data.sphereConfigs[k]=localStorage.getItem(k);}
    }
  }
  return data;
}

function _restoreBackupData(data){
  var SP=window.YM&&window.YM.saveProfile;
  if(!data||data._version!==1)throw new Error('Format invalide');
  if(data.profile){
    var curP=window.YM&&window.YM.getProfile&&window.YM.getProfile();
    if(curP&&curP.uuid)data.profile.uuid=curP.uuid;
    if(SP)SP(data.profile);
  }
  if(data.contacts)localStorage.setItem('ym_contacts_v1',JSON.stringify(data.contacts));
  if(data.sphereConfigs){
    Object.keys(data.sphereConfigs).forEach(function(k){
      if(k==='ym_wallet_v1'||k==='ym_profile_v1')return;
      var v=data.sphereConfigs[k];
      localStorage.setItem(k,typeof v==='string'?v:JSON.stringify(v));
    });
  }
}

function openRecoveryOverlay(){
  var p=window.YM&&window.YM.getProfile&&window.YM.getProfile();
  if(!p)return;
  var myNewUUID=p.uuid;
  var overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px)';
  var box=document.createElement('div');
  box.style.cssText='background:var(--surface2,#12121e);border:1px solid var(--border,rgba(255,255,255,.1));border-radius:var(--r-lg,16px);padding:20px;max-width:340px;width:90vw;max-height:90vh;overflow-y:auto';

  // Two modes — SEND (I need recovery) or RECEIVE (I help someone)
  box.innerHTML=
    '<div style="font-family:var(--font-d);font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--accent);margin-bottom:14px">Identity Recovery</div>'+
    '<div style="display:flex;gap:8px;margin-bottom:18px">'+
      '<button class="ym-btn rec-tab '+(true?'ym-btn-accent':'ym-btn-ghost')+'" data-tab="send" style="flex:1;font-size:11px">I need recovery</button>'+
      '<button class="ym-btn rec-tab ym-btn-ghost" data-tab="receive" style="flex:1;font-size:11px">Help someone</button>'+
    '</div>'+
    '<div id="rec-send-panel">'+
      '<div class="ym-notice info" style="font-size:11px;margin-bottom:14px">Enter the UUID of a contact who knew your old identity. They will see your new UUID and can restore it.</div>'+
      '<input class="ym-input" id="rec-contact-uuid" placeholder="Contact UUID…" style="width:100%;font-size:11px;font-family:var(--font-m);margin-bottom:8px">'+
      '<div id="rec-send-status" style="font-size:11px;min-height:16px;margin-bottom:8px"></div>'+
      '<button class="ym-btn ym-btn-accent" id="rec-send-btn" style="width:100%">Send recovery request</button>'+
    '</div>'+
    '<div id="rec-receive-panel" style="display:none">'+
      '<div class="ym-notice info" style="font-size:11px;margin-bottom:14px">If someone sent you a recovery request, their new UUID appears below. Choose who they are in your contacts to restore their identity.</div>'+
      '<div id="rec-requests-list"></div>'+
    '</div>'+
    '<button class="ym-btn ym-btn-ghost" id="rec-close" style="width:100%;font-size:11px;margin-top:12px">Close</button>';

  overlay.appendChild(box);document.body.appendChild(overlay);

  // Tab switching
  box.querySelectorAll('.rec-tab').forEach(function(tab){
    tab.addEventListener('click',function(){
      box.querySelectorAll('.rec-tab').forEach(function(t){t.className='ym-btn rec-tab ym-btn-ghost';t.style.flex='1';t.style.fontSize='11px';});
      this.className='ym-btn rec-tab ym-btn-accent';this.style.flex='1';this.style.fontSize='11px';
      var t=this.dataset.tab;
      document.getElementById('rec-send-panel').style.display=t==='send'?'':'none';
      document.getElementById('rec-receive-panel').style.display=t==='receive'?'':'none';
      if(t==='receive') _renderRecoveryRequests();
    });
  });

  // SEND — store recovery request locally keyed by contact UUID
  // When contact opens their receive panel they'll see pending requests
  var RECOVERY_KEY='ym_recovery_requests';
  function getRecoveryRequests(){try{return JSON.parse(localStorage.getItem(RECOVERY_KEY)||'[]');}catch{return[];}}
  function saveRecoveryRequests(arr){localStorage.setItem(RECOVERY_KEY,JSON.stringify(arr));}

  document.getElementById('rec-send-btn').addEventListener('click',function(){
    var contactUUID=(document.getElementById('rec-contact-uuid').value||'').trim();
    var status=document.getElementById('rec-send-status');
    if(!contactUUID){status.textContent='Enter a UUID';status.style.color='var(--red,#e84040)';return;}
    // Store request: {contactUUID, myNewUUID, timestamp}
    // When the contact opens their receive panel they check for requests addressed to them
    // We send via P2P if peer is near, otherwise store for manual check
    var req={from:myNewUUID,to:contactUUID,ts:Date.now()};
    if(window.YM_P2P&&window.YM_P2P.sendTo){
      window.YM_P2P.sendTo(contactUUID,{sphere:'social.sphere.js',type:'identity:recovery-request',data:req});
    }
    // Also store locally in case peer is offline
    var stored=getRecoveryRequests();
    stored=stored.filter(function(r){return r.to!==contactUUID;});
    stored.push(req);
    saveRecoveryRequests(stored);
    status.textContent='Request sent ✓';status.style.color='var(--green,#30e880)';
  });

  // RECEIVE — show pending requests addressed to me
  function _renderRecoveryRequests(){
    var list=document.getElementById('rec-requests-list');
    list.innerHTML='';
    var allReqs=getRecoveryRequests().filter(function(r){return r.to===myNewUUID;});
    // Also check incoming P2P requests stored in ym_recovery_incoming
    var incoming=[];try{incoming=JSON.parse(localStorage.getItem('ym_recovery_incoming')||'[]');}catch{}
    var reqs=allReqs.concat(incoming);
    if(!reqs.length){
      list.innerHTML='<div style="font-size:12px;color:var(--text3);padding:8px 0">No pending requests</div>';
      return;
    }
    var contacts=window.YM&&window.YM.getProfile&&window.YM.getProfile()||{};
    var contactList=[];try{contactList=JSON.parse(localStorage.getItem('ym_contacts_v1')||'[]');}catch{}
    reqs.forEach(function(req){
      var row=document.createElement('div');
      row.style.cssText='padding:12px;border:1px solid var(--border);border-radius:var(--r-sm,8px);margin-bottom:8px';
      row.innerHTML=
        '<div style="font-size:10px;color:var(--text3);font-family:var(--font-m);word-break:break-all;margin-bottom:10px">New UUID: '+req.from+'</div>'+
        '<div style="font-size:11px;color:var(--text2);margin-bottom:8px">Who is this person in your contacts?</div>'+
        '<select class="ym-input rec-contact-select" style="width:100%;font-size:11px;margin-bottom:8px">'+
          '<option value="">— Choose a contact —</option>'+
          contactList.map(function(c){
            var name=c.nickname||(c.profile&&c.profile.name)||c.uuid.slice(0,8);
            return'<option value="'+c.uuid+'">'+name+'</option>';
          }).join('')+
        '</select>'+
        '<button class="ym-btn ym-btn-accent rec-confirm-btn" style="width:100%;font-size:11px">Restore identity</button>';

      row.querySelector('.rec-confirm-btn').addEventListener('click',function(){
        var oldUUID=row.querySelector('.rec-contact-select').value;
        if(!oldUUID){return;}
        // Send back the old UUID to the requester via P2P
        if(window.YM_P2P&&window.YM_P2P.sendTo){
          window.YM_P2P.sendTo(req.from,{sphere:'social.sphere.js',type:'identity:recovery-response',data:{oldUUID:oldUUID,newUUID:req.from}});
        }
        // Update contact list — replace old UUID with new UUID
        var updated=contactList.map(function(c){
          if(c.uuid===oldUUID){c.uuid=req.from;if(c.profile)c.profile.uuid=req.from;}
          return c;
        });
        localStorage.setItem('ym_contacts_v1',JSON.stringify(updated));
        // Remove request
        var remaining=getRecoveryRequests().filter(function(r){return r.from!==req.from;});
        saveRecoveryRequests(remaining);
        row.innerHTML='<div style="color:var(--green,#30e880);font-size:12px">Identity restored ✓</div>';
        if(window.YM_toast)window.YM_toast('Identity restored','success');
      });
      list.appendChild(row);
    });
  }

  // Listen for incoming recovery requests via P2P
  window.addEventListener('ym:p2p-data',function onRecovery(e){
    var msg=e.detail&&e.detail.msg;
    if(!msg||msg.sphere!=='social.sphere.js')return;
    if(msg.type==='identity:recovery-request'&&msg.data.to===myNewUUID){
      var inc=[];try{inc=JSON.parse(localStorage.getItem('ym_recovery_incoming')||'[]');}catch{}
      inc=inc.filter(function(r){return r.from!==msg.data.from;});
      inc.push(msg.data);
      localStorage.setItem('ym_recovery_incoming',JSON.stringify(inc));
    }
    if(msg.type==='identity:recovery-response'&&msg.data.newUUID===myNewUUID){
      // Restore old UUID
      var SP=window.YM&&window.YM.saveProfile;
      if(SP){var prof=p;prof.uuid=msg.data.oldUUID;SP(prof);}
      if(window.YM_toast)window.YM_toast('Your identity has been restored','success');
      window.removeEventListener('ym:p2p-data',onRecovery);
      overlay.remove();
    }
  });

  box.querySelector('#rec-close').addEventListener('click',function(){overlay.remove();});
  overlay.addEventListener('click',function(e){if(e.target===overlay)overlay.remove();});
}

function openBackupOverlay(){
  var overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px)';
  var box=document.createElement('div');
  box.style.cssText='background:var(--surface2,#12121e);border:1px solid var(--border,rgba(255,255,255,.1));border-radius:var(--r-lg,16px);padding:20px;max-width:320px;width:90vw;max-height:90vh;overflow-y:auto';
  box.innerHTML='<div style="font-family:var(--font-d);font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--accent);margin-bottom:10px">Backup / Restore</div>'+
    '<div class="ym-notice info" style="font-size:11px;margin-bottom:14px">Export ou import un fichier JSON contenant ton profil, tes contacts, les sphères et leurs configurations. <b>L\'UUID ne peut pas être restauré (non-transférable).</b></div>'+
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
    try{var data=_buildBackupData();var blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
      var a=document.createElement('a');a.href=URL.createObjectURL(blob);
      a.download='yourmine-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();URL.revokeObjectURL(a.href);
      st('Sauvegarde téléchargée ✓','success');}catch(e){st(e.message,'error');}
  });
  box.querySelector('#bk-ul').addEventListener('click',function(){box.querySelector('#bk-file').click();});
  box.querySelector('#bk-file').addEventListener('change',function(){
    var file=this.files[0];if(!file)return;
    var reader=new FileReader();
    reader.onload=function(ev){
      try{var data=JSON.parse(ev.target.result);_restoreBackupData(data);
        st('Restauré ✓ (UUID conservé)','success');
        setTimeout(function(){render();if(window.YM_Liste&&window.YM_Liste._forceRefresh)window.YM_Liste._forceRefresh();if(window.YM_Desk)window.YM_Desk.renderDesk();},50);
      }catch(e){st('Erreur : '+e.message,'error');}
    };reader.readAsText(file);
  });
  box.querySelector('#bk-close').addEventListener('click',function(){overlay.remove();});
  overlay.addEventListener('click',function(e){if(e.target===overlay)overlay.remove();});
}

function renderContactsTab(container){
  container.style.cssText='display:flex;flex-direction:column;height:100%;overflow:hidden';
  var sphereBar=document.createElement('div');
  sphereBar.style.cssText='flex-shrink:0;padding:8px 16px 4px;border-bottom:1px solid var(--border);overflow-x:auto;white-space:nowrap;display:flex;gap:6px;-webkit-overflow-scrolling:touch';
  container.appendChild(sphereBar);
  var listWrap=document.createElement('div');listWrap.style.cssText='flex:1;overflow-y:auto;padding:8px 16px 4px';container.appendChild(listWrap);
  var searchBar=document.createElement('div');
  searchBar.style.cssText='border-top:1px solid var(--border);padding:8px 16px 6px;flex-shrink:0;display:flex;gap:6px;align-items:center';
  searchBar.innerHTML='<button id="pc-add-btn" class="ym-btn ym-btn-accent" style="padding:4px 10px;font-size:18px;line-height:1;flex-shrink:0" title="Add contact">+</button>'+
    '<input class="ym-input" id="pcs" placeholder="Search contacts…" style="flex:1;font-size:11px">'+
    '<button id="fav-btn" class="ym-btn ym-btn-ghost" style="padding:4px 10px;font-size:16px">☆</button>';
  container.appendChild(searchBar);
  var addOverlay=null;
  searchBar.querySelector('#pc-add-btn').addEventListener('click',function(){
    if(addOverlay){addOverlay.remove();addOverlay=null;return;}
    addOverlay=document.createElement('div');
    addOverlay.style.cssText='position:fixed;inset:0;z-index:9990;background:rgba(0,0,0,.82);display:flex;align-items:flex-end;justify-content:center';
    var box=document.createElement('div');
    box.style.cssText='background:#12121e;border:1px solid rgba(255,255,255,.12);border-radius:18px 18px 0 0;padding:20px;width:100%;max-width:500px;box-shadow:0 -8px 32px rgba(0,0,0,.6)';
    box.innerHTML='<div style="font-size:14px;font-weight:600;margin-bottom:12px">Add Contact</div>'+
      '<div style="display:flex;gap:6px;margin-bottom:6px">'+
        '<input class="ym-input" id="pc-name-input" placeholder="Search by name…" style="flex:1;font-size:12px">'+
        '<button id="pc-name-search" class="ym-btn ym-btn-ghost" style="font-size:12px">Search</button>'+
      '</div>'+
      '<div id="pc-name-results" style="margin-bottom:8px"></div>'+
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
      if(qrC.style.display==='none'){qrC.style.display='block';qrC.innerHTML='';
        startQRScanner(qrC,function(result){if(result){box.querySelector('#pc-uuid-input').value=result;qrC.style.display='none';}else{qrC.style.display='none';}});
      }else{qrC.style.display='none';qrC.innerHTML='';}
    });
  });
  var showFavOnly=false,q='',activeSphere='';
  function buildSphereBar(){
    sphereBar.innerHTML='';
    var contacts=getContacts();
    var mySpheres=(window.YM&&window.YM.getProfile&&window.YM.getProfile().spheres)||[];
    var sphereCounts={};
    contacts.forEach(function(c){(c.profile&&c.profile.spheres||[]).filter(function(s){return mySpheres.includes(s);}).forEach(function(s){sphereCounts[s]=(sphereCounts[s]||0)+1;});});
    var sphereList=Object.keys(sphereCounts).sort(function(a,b){return sphereCounts[b]-sphereCounts[a];});
    if(!sphereList.length){sphereBar.style.display='none';return;}
    sphereBar.style.display='flex';
    var allPill=document.createElement('span');allPill.className='pill'+(activeSphere?'':' active');allPill.style.cssText='cursor:pointer;flex-shrink:0';allPill.textContent='All';
    allPill.addEventListener('click',function(){activeSphere='';buildSphereBar();renderList(q);});sphereBar.appendChild(allPill);
    sphereList.forEach(function(sName){
      var sObj=window.YM_sphereRegistry&&window.YM_sphereRegistry.get(sName);
      var icon=(sObj&&sObj.icon)||'⬡';var label=sName.replace('.sphere.js','');
      var pill=document.createElement('span');pill.className='pill'+(activeSphere===sName?' active':'');
      pill.style.cssText='cursor:pointer;flex-shrink:0;display:flex;align-items:center;gap:4px';
      pill.innerHTML=icon+' '+esc(label)+' <span style="font-size:9px;opacity:.6">('+sphereCounts[sName]+')</span>';
      pill.addEventListener('click',function(){activeSphere=activeSphere===sName?'':sName;buildSphereBar();renderList(q);});
      sphereBar.appendChild(pill);
    });
  }
  function renderList(query){
    q=query||'';listWrap.innerHTML='';
    var contacts=getContacts();
    var filtered=contacts;
    if(showFavOnly)filtered=filtered.filter(function(c){return isFav(c.uuid);});
    if(q)filtered=filtered.filter(function(c){return((c.nickname||(c.profile&&c.profile.name)||c.uuid).toLowerCase()).indexOf(q)>=0;});
    if(activeSphere)filtered=filtered.filter(function(c){return((c.profile&&c.profile.spheres)||[]).includes(activeSphere);});
    if(!filtered.length){listWrap.innerHTML='<div style="color:var(--text3);font-size:12px;padding:8px 0">No contacts'+(showFavOnly?' in favorites':'')+'</div>';return;}
    filtered.forEach(function(c){
      var prof=c.profile||{uuid:c.uuid,name:c.nickname||'Unknown'};
      var fav=isFav(c.uuid);
      var isNear=!!(window.YM_Social&&window.YM_Social._nearUsers&&window.YM_Social._nearUsers.has(c.uuid));
      var isReciproc=!!(window.YM_Social&&window.YM_Social.isReciprocal&&window.YM_Social.isReciprocal(c.uuid));
      var canCall=isNear&&isReciproc;
      var hasMsg=!!(window.YM_sphereRegistry&&window.YM_sphereRegistry.has('messenger.sphere.js'));
      var card=document.createElement('div');card.className='ym-card';card.style.cssText='cursor:pointer;margin-bottom:8px';
      var avImg='<img src="'+prof.avatar+'" style="width:40px;height:40px;border-radius:50%;object-fit:cover;flex-shrink:0">';
      var avFb='<div style="width:40px;height:40px;border-radius:50%;background:var(--surface3,rgba(255,255,255,.05));display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">'+((prof.name&&prof.name.charAt(0))||'👤')+'</div>';
      var av=prof.avatar?avImg:avFb;
      var actions='<div style="display:flex;align-items:center;gap:12px;flex-shrink:0">'+
        (canCall?'<button data-call style="background:none;border:none;font-size:20px;cursor:pointer;padding:0;line-height:1">📞</button>':'')+
        (hasMsg?'<button data-msg style="background:none;border:none;font-size:20px;cursor:pointer;padding:0;line-height:1">💬</button>':'')+
        '<span data-fav style="font-size:20px;cursor:pointer;color:'+(fav?'var(--accent)':'var(--text3)')+';line-height:1">'+(fav?'★':'☆')+'</span>'+
        '<button data-del style="background:none;border:none;width:24px;height:24px;border-radius:50%;background:var(--surface3,rgba(255,255,255,.05));border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:12px;cursor:pointer;color:var(--text3);flex-shrink:0">×</button>'+
      '</div>';
      card.innerHTML='<div data-contact-header style="display:flex;align-items:center;gap:10px;cursor:pointer">'+av+
        '<div style="flex:1;min-width:0"><div style="font-weight:600;font-size:13px">'+(c.nickname||prof.name||'Anonymous')+'</div>'+
        (prof.bio?'<div style="font-size:11px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(prof.bio)+'</div>':'')+
        '</div>'+actions+'</div>';
      card.querySelector('[data-fav]').addEventListener('click',function(e){e.stopPropagation();toggleFav(c.uuid);renderList(q);});
      card.querySelector('[data-del]').addEventListener('click',function(e){
        e.stopPropagation();localStorage.setItem('ym_contacts_v1',JSON.stringify(getContacts().filter(function(x){return x.uuid!==c.uuid;})));renderList(q);buildSphereBar();
      });
      var msgBtn=card.querySelector('[data-msg]');
      if(msgBtn){msgBtn.addEventListener('click',function(e){e.stopPropagation();if(window.YM_Messenger&&window.YM_Messenger.openConv)window.YM_Messenger.openConv(c.uuid);if(window.YM&&window.YM.openSpherePanel)window.YM.openSpherePanel('messenger.sphere.js');});}
      var callBtn=card.querySelector('[data-call]');
      if(callBtn){callBtn.addEventListener('click',function(e){e.stopPropagation();if(window.YM_Social&&window.YM_Social.startVoiceCall)window.YM_Social.startVoiceCall(c.uuid);});}
      card.addEventListener('click',function(e){
        if(e.target.closest('[data-contact-header]')&&!e.target.closest('[data-fav]')&&!e.target.closest('[data-del]')&&!e.target.closest('[data-msg]')&&!e.target.closest('[data-call]')){
          if(window.YM&&window.YM.openProfilePanel)window.YM.openProfilePanel(prof);
        }
      });
      listWrap.appendChild(card);
    });
  }
  buildSphereBar();renderList();
  searchBar.querySelector('#pcs').addEventListener('input',function(e){renderList(e.target.value.toLowerCase());});
  searchBar.querySelector('#fav-btn').addEventListener('click',function(){
    showFavOnly=!showFavOnly;var btn=searchBar.querySelector('#fav-btn');
    btn.style.color=showFavOnly?'var(--accent)':'var(--text3)';btn.textContent=showFavOnly?'★':'☆';
    renderList(searchBar.querySelector('#pcs').value.toLowerCase());
  });
}

function addContactByUUID(uuid,cb){
  uuid=(uuid||'').trim();if(!uuid){if(cb)cb('Enter a UUID',false);return;}
  var all=getContacts();if(all.find(function(c){return c.uuid===uuid;})){if(cb)cb('Already in contacts',false);return;}
  var near=window.YM_Social&&window.YM_Social._nearUsers;var profile=null;
  if(near&&near.has(uuid)){var u=near.get(uuid);profile=u.profile||{uuid:uuid,name:''};}
  all.push({uuid:uuid,nickname:'',profile:profile||{uuid:uuid,name:''}});
  localStorage.setItem('ym_contacts_v1',JSON.stringify(all));if(cb)cb('Added ✓',true);
}

function startQRScanner(container,onResult){
  container.innerHTML='<div style="display:flex;gap:6px;align-items:center;padding:4px 0">'+
    '<input type="file" id="qr-file-input" accept="image/*" style="display:none">'+
    '<button id="qr-gallery-btn" class="ym-btn ym-btn-ghost" style="flex:1;font-size:11px">🖼 Image QR</button>'+
    '<button id="qr-camera-btn" class="ym-btn ym-btn-ghost" style="flex:1;font-size:11px">📷 Caméra live</button></div>'+
    '<div id="qr-video-wrap" style="display:none;margin-top:6px">'+
    '<video id="qr-video" autoplay playsinline muted style="width:100%;border-radius:8px;max-height:160px;object-fit:cover"></video>'+
    '<canvas id="qr-canvas" style="display:none"></canvas>'+
    '<div id="qr-scan-msg" style="font-size:10px;color:var(--text3);text-align:center;margin-top:4px">Pointez le QR code vers la caméra…</div></div>';
  function extractUUID(raw){if(!raw)return null;var m=raw.match(/yourmine:\/\/(?:contact|profile)\/([a-f0-9-]{36})/i);if(m)return m[1];m=raw.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);if(m)return m[1];return null;}
  function scanFile(file){if(!file)return;if(window.BarcodeDetector){createImageBitmap(file).then(function(img){return new BarcodeDetector({formats:['qr_code']}).detect(img);}).then(function(res){onResult(extractUUID(res[0]&&res[0].rawValue));}).catch(function(){onResult(null);});}else{onResult(null);}}
  var fi=container.querySelector('#qr-file-input');container.querySelector('#qr-gallery-btn').addEventListener('click',function(){fi.click();});fi.addEventListener('change',function(){scanFile(this.files[0]);});
  var _stream=null;
  container.querySelector('#qr-camera-btn').addEventListener('click',function(){
    var wrap=container.querySelector('#qr-video-wrap');if(wrap.style.display!=='none'){wrap.style.display='none';if(_stream){_stream.getTracks().forEach(function(t){t.stop();});_stream=null;}return;}
    if(!navigator.mediaDevices){onResult(null);return;}wrap.style.display='block';
    navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}}).then(function(stream){
      _stream=stream;var video=wrap.querySelector('#qr-video'),canvas=wrap.querySelector('#qr-canvas'),msg=wrap.querySelector('#qr-scan-msg');video.srcObject=stream;
      function tick(){if(!video.videoWidth){requestAnimationFrame(tick);return;}canvas.width=video.videoWidth;canvas.height=video.videoHeight;canvas.getContext('2d').drawImage(video,0,0);
        if(window.BarcodeDetector){new BarcodeDetector({formats:['qr_code']}).detect(canvas).then(function(res){if(res.length){stream.getTracks().forEach(function(t){t.stop();});onResult(extractUUID(res[0].rawValue));}else requestAnimationFrame(tick);}).catch(function(){requestAnimationFrame(tick);});}
        else{msg.textContent='BarcodeDetector non supporté';}}requestAnimationFrame(tick);
    }).catch(function(e){wrap.querySelector('#qr-scan-msg').textContent='Caméra refusée : '+e.message;});
  });
  var _obs=new MutationObserver(function(){if(!document.body.contains(container)){if(_stream){_stream.getTracks().forEach(function(t){t.stop();});}  _obs.disconnect();}});
  _obs.observe(document.body,{childList:true,subtree:true});
}

function showShare(){
  var p=window.YM&&window.YM.getProfile&&window.YM.getProfile();if(!p||!p.uuid)return;
  var overlay=document.getElementById('ym-share-overlay');if(overlay){overlay.remove();return;}
  overlay=document.createElement('div');overlay.id='ym-share-overlay';
  overlay.style.cssText='position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px)';
  var box=document.createElement('div');
  box.style.cssText='background:var(--surface2,#12121e);border:1px solid var(--accent);border-radius:var(--r-lg,16px);padding:24px;text-align:center;max-width:280px;width:90vw';
  box.innerHTML='<div style="font-family:var(--font-d);font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--accent);margin-bottom:16px">Share profile</div>'+
    '<div id="share-qr-box" style="display:flex;justify-content:center;margin-bottom:12px"></div>'+
    '<div style="font-family:var(--font-m);font-size:9px;color:var(--text3);word-break:break-all;margin-bottom:12px">'+p.uuid+'</div>'+
    '<div style="display:flex;gap:8px"><button class="ym-btn ym-btn-ghost" id="share-copy-btn" style="flex:1;font-size:11px">⧉ Copy UUID</button>'+
    '<button class="ym-btn ym-btn-ghost" id="share-close-btn" style="font-size:11px">✕</button></div>';
  overlay.appendChild(box);document.body.appendChild(overlay);
  var qrEl=box.querySelector('#share-qr-box');
  function doQR(){new window.QRCode(qrEl,{text:'yourmine://contact/'+p.uuid,width:140,height:140,correctLevel:QRCode.CorrectLevel.M});}
  if(window.QRCode)doQR();else{var s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';s.onload=doQR;document.head.appendChild(s);}
  box.querySelector('#share-copy-btn').addEventListener('click',function(){if(navigator.clipboard)navigator.clipboard.writeText(p.uuid);if(window.YM_toast)window.YM_toast('UUID copied','success');});
  box.querySelector('#share-close-btn').addEventListener('click',function(){overlay.remove();});
  overlay.addEventListener('click',function(e){if(e.target===overlay)overlay.remove();});
}

function renderPeerProfile(container,profile){
  container.innerHTML='';container.style.cssText='flex:1;overflow-y:auto;padding:16px';
  var isContact=false;
  try{var contacts=JSON.parse(localStorage.getItem('ym_contacts_v1')||'[]');isContact=contacts.some(function(c){return c.uuid===profile.uuid;});}catch(e){}
  var isNear=!!(window.YM_Social&&window.YM_Social._nearUsers&&window.YM_Social._nearUsers.has(profile.uuid));
  var isReciproc=!!(window.YM_Social&&window.YM_Social.isReciprocal&&window.YM_Social.isReciprocal(profile.uuid));
  var contactBar=document.createElement('div');
  if(isContact){
    contactBar.style.cssText='display:flex;align-items:center;gap:8px;margin-bottom:12px;padding:8px 12px;background:rgba(48,232,128,.08);border:1px solid rgba(48,232,128,.25);border-radius:var(--r-sm,8px)';
    contactBar.innerHTML='<span style="color:#30e880;font-size:12px;flex:1">✓ In contacts</span>';
    var rmBtn=document.createElement('button');rmBtn.className='ym-btn ym-btn-ghost';rmBtn.style.cssText='padding:4px 10px;font-size:11px;min-height:unset;color:#e84040';rmBtn.textContent='Remove';
    rmBtn.addEventListener('click',function(){try{var all=JSON.parse(localStorage.getItem('ym_contacts_v1')||'[]');localStorage.setItem('ym_contacts_v1',JSON.stringify(all.filter(function(c){return c.uuid!==profile.uuid;})));}catch(e){}if(window.YM_toast)window.YM_toast('Contact removed','info');renderPeerProfile(container,profile);});
    contactBar.appendChild(rmBtn);
  }else{
    var addBtn=document.createElement('button');addBtn.className='ym-btn ym-btn-accent';addBtn.style.cssText='width:100%;margin-bottom:12px';addBtn.textContent='+ Add Contact';
    addBtn.addEventListener('click',function(){try{var all=JSON.parse(localStorage.getItem('ym_contacts_v1')||'[]');if(!all.find(function(c){return c.uuid===profile.uuid;})){all.push({uuid:profile.uuid,nickname:'',profile:profile});localStorage.setItem('ym_contacts_v1',JSON.stringify(all));}}catch(e){}if(window.YM_toast)window.YM_toast('Contact added','success');renderPeerProfile(container,profile);});
    contactBar.appendChild(addBtn);
  }
  container.appendChild(contactBar);
  var rawSite=profile.site||'';var siteUrl=rawSite&&!rawSite.startsWith('http')?'https://'+rawSite:rawSite;
  var av=profile.avatar?'<img src="'+profile.avatar+'" style="width:72px;height:72px;border-radius:50%;object-fit:cover">':'<div style="width:72px;height:72px;border-radius:50%;background:var(--surface3,rgba(255,255,255,.05));display:flex;align-items:center;justify-content:center;font-size:32px;margin:0 auto">'+(profile.name&&profile.name.charAt(0)||'👤')+'</div>';
  var ident=document.createElement('div');ident.style.cssText='text-align:center;padding:12px 0 16px';
  ident.innerHTML='<div style="margin-bottom:8px">'+av+'</div><div style="font-size:18px;font-weight:600;margin-bottom:4px">'+(profile.name||'Anonymous')+'</div>'+
    (profile.bio?'<div style="font-size:13px;color:var(--text2);max-width:280px;margin:0 auto 4px">'+profile.bio+'</div>':'')+
    (siteUrl?'<a href="'+siteUrl+'" target="_blank" rel="noopener" style="font-size:11px;color:var(--cyan)">'+rawSite+'</a>':'')+
    (isNear?'<div style="font-size:10px;color:#30e880;margin-top:6px">● Nearby</div>':'');
  container.appendChild(ident);
  if(profile.networks&&profile.networks.length){var nets=document.createElement('div');nets.className='ym-card';nets.style.cssText='margin-bottom:10px';nets.innerHTML='<div class="ym-card-title">Social Networks</div><div style="display:flex;flex-wrap:wrap;gap:4px">'+profile.networks.map(function(n){return'<span class="pill">'+n.id+' '+n.handle+'</span>';}).join('')+'</div>';container.appendChild(nets);}
  if(profile.pubkey){var wallet=document.createElement('div');wallet.className='ym-card';wallet.style.cssText='margin-bottom:10px';wallet.innerHTML='<div class="ym-card-title">Wallet</div><div style="font-family:var(--font-m);font-size:9px;color:var(--text3);word-break:break-all">'+profile.pubkey+'</div>';container.appendChild(wallet);}
  if(profile.spheres&&profile.spheres.length){
    var mySpheres=(window.YM&&window.YM.getProfile&&window.YM.getProfile().spheres)||[];
    var shared=profile.spheres.filter(function(s){return mySpheres.includes(s);});
    var others=profile.spheres.filter(function(s){return!mySpheres.includes(s);});
    var ctx={uuid:profile.uuid,isNear:isNear,isReciproc:isReciproc};
    if(shared.length){var st2=document.createElement('div');st2.style.cssText='font-family:var(--font-d);font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--accent);margin:12px 0 6px';st2.textContent='Spheres in common';container.appendChild(st2);shared.forEach(function(sf){_renderPeerAccordion(container,sf,ctx);});}
    if(others.length){var ot=document.createElement('div');ot.style.cssText='font-family:var(--font-d);font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text3);margin:12px 0 6px';ot.textContent='Other spheres';container.appendChild(ot);
      others.forEach(function(sphereFile){var sphereName=sphereFile.replace('.sphere.js','');var sphereObj=window.YM_sphereRegistry&&window.YM_sphereRegistry.get(sphereFile);var row=document.createElement('div');row.style.cssText='display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--border);border-radius:var(--r-sm,8px);margin-bottom:6px;cursor:pointer;opacity:.7';var icon=(sphereObj&&sphereObj.icon)||'⬡';row.innerHTML='<span style="font-size:16px">'+icon+'</span><span style="font-size:12px;flex:1">'+sphereName+'</span><span style="font-size:11px;color:var(--accent)">↗ Find</span>';row.addEventListener('click',function(){if(window.YM_Liste&&window.YM_Liste._searchAndOpen)window.YM_Liste._searchAndOpen(sphereName);if(window.YM&&window.YM.openPanel)window.YM.openPanel('panel-spheres');});container.appendChild(row);});
    }
  }
}

function _renderPeerAccordion(container,sphereFile,ctx){
  var sphereName=sphereFile.replace('.sphere.js','');
  var sphereObj=window.YM_sphereRegistry&&window.YM_sphereRegistry.get(sphereFile);
  var icon=(sphereObj&&sphereObj.icon)||'⬡';
  var wrap=document.createElement('div');wrap.style.cssText='border:1px solid var(--border);border-radius:var(--r-sm,8px);margin-bottom:6px';
  var hdr=document.createElement('div');hdr.style.cssText='display:flex;align-items:center;gap:8px;padding:9px 12px;cursor:pointer;background:rgba(255,255,255,.02)';
  hdr.innerHTML='<span style="font-size:16px">'+icon+'</span><span style="font-size:12px;font-weight:600;flex:1">'+sphereName+'</span><span class="acc-arrow" style="font-size:10px;color:var(--text3)">›</span>';
  var body=document.createElement('div');body.style.cssText='display:none;padding:10px 12px;border-top:1px solid var(--border)';
  hdr.addEventListener('click',function(){
    var open=body.style.display!=='none';body.style.display=open?'none':'block';hdr.querySelector('.acc-arrow').textContent=open?'›':'⌄';
    if(!open&&!body.children.length){if(sphereObj&&typeof sphereObj.peerSection==='function'){try{sphereObj.peerSection(body,ctx);}catch(e){body.innerHTML='<div style="color:var(--text3);font-size:11px">'+e.message+'</div>';}}else{body.innerHTML='<div style="font-size:11px;color:var(--text2)">'+(sphereObj&&sphereObj.description||'No interactions available')+'</div>';}}
  });
  wrap.appendChild(hdr);wrap.appendChild(body);container.appendChild(wrap);
}

window._renderProfileView=renderPeerProfile;
window.YM_Profile={render:render,renderFor:function(n){render(n);},showShare:showShare};
window.openBackupOverlay=openBackupOverlay;
window.openRecoveryOverlay=openRecoveryOverlay;

})();

// ── Profile Sphere Editor ─────────────────────────────────────────────────────
function openProfileSphereEditor(){
  var p=window.YM&&window.YM.getProfile?window.YM.getProfile():{};
  var uuid=p.uuid||'';
  var name=p.name||'';
  if(!name){window.YM_toast&&window.YM_toast('Set a name in your profile first','error');return;}

  // Load existing profile sphere config from localStorage
  var PROF_KEY='ym_profile_sphere_'+uuid;
  var config;
  try{config=JSON.parse(localStorage.getItem(PROF_KEY)||'null');}catch{config=null;}
  config=config||{
    keywords:[],
    bio:p.bio||'',
    accent:'#f0a830',
    sections:['identity','spheres','networks','bio'],
    customCode:''
  };

  var ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;z-index:3000;background:rgba(0,0,0,.9);display:flex;flex-direction:column;overflow:hidden';
  ov.innerHTML=
    '<div style="flex:1;overflow-y:auto;padding:16px">'+

    // Keywords
    '<div style="font-size:11px;color:var(--text3);margin-bottom:4px;text-transform:uppercase;letter-spacing:.1em">Keywords (comma separated)</div>'+
    '<input id="pse-keywords" class="ym-input" style="margin-bottom:12px;font-size:12px" value="'+config.keywords.join(', ')+'" placeholder="builder, circular economy, web3…">'+

    // Accent color
    '<div style="font-size:11px;color:var(--text3);margin-bottom:4px;text-transform:uppercase;letter-spacing:.1em">Accent color</div>'+
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">'+
    '<input type="color" id="pse-accent" value="'+config.accent+'" style="width:40px;height:32px;border:none;background:none;cursor:pointer;padding:0">'+
    '<span id="pse-accent-val" style="font-size:12px;color:var(--text3)">'+config.accent+'</span>'+
    '</div>'+

    // Sections order — only relevant for custom code
    '<div id="pse-sections-wrap" style="display:'+(config.customCode?'block':'none')+'">'+
    '<div style="font-size:11px;color:var(--text3);margin-bottom:4px;text-transform:uppercase;letter-spacing:.1em">Sections order</div>'+
    '<div id="pse-sections" style="margin-bottom:8px"></div>'+
    '</div>'+
    '<div style="font-size:11px;color:var(--text3);margin-bottom:4px;margin-top:4px;text-transform:uppercase;letter-spacing:.1em">Spheres</div>'+
    '<div id="pse-spheres" style="margin-bottom:12px"></div>'+

    // Custom code
    '<div style="display:flex;align-items:center;margin-bottom:4px">'+
    '<div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.1em;flex:1">Custom JS (optional — renderPanel body)</div>'+
    '<button id="pse-copy-prompt" class="ym-btn ym-btn-ghost" style="font-size:10px;padding:2px 8px">✦ Copy Prompt</button>'+
    '</div>'+
    '<textarea id="pse-code" style="width:100%;box-sizing:border-box;height:120px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:10px;color:var(--text);font-family:monospace;font-size:11px;margin-bottom:12px;resize:vertical" placeholder="// renderPanel body — or paste a full sphere (window.YM_S[...])">'+config.customCode+'</textarea>'+

    // Token for publish
    '<div id="pse-token-wrap">'+
    '<div style="font-size:11px;color:var(--text3);margin-bottom:4px;text-transform:uppercase;letter-spacing:.1em">GitHub token</div>'+
    '<input id="pse-token" type="password" class="ym-input" style="margin-bottom:4px;font-size:12px" placeholder="Token (or connect via Build)">'+
    '</div>'+

    '<div id="pse-token-wrap"></div>'+
    '<div id="pse-status" style="font-size:11px;color:var(--text3);text-align:center;min-height:14px;margin-top:4px"></div>'+
    '</div>'+
    // Bottom toolbar
    '<div style="border-top:1px solid rgba(255,255,255,.08);padding:12px 16px;flex-shrink:0">'+
    '<div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:10px">✦ Profile Sphere</div>'+
    '<div style="display:flex;gap:6px;margin-bottom:6px">'+
    '<button id="pse-before" class="ym-btn ym-btn-ghost" style="font-size:12px;flex:1">Before</button>'+
    '<button id="pse-after" class="ym-btn ym-btn-ghost" style="font-size:12px;flex:1">After</button>'+
    '<button id="pse-unpublish" class="ym-btn ym-btn-ghost" style="font-size:12px;flex:1;color:var(--red,#e84040);border-color:rgba(232,64,64,.3)">Unpublish</button>'+
    '</div>'+
    '<div style="display:flex;gap:6px">'+
    '<button id="pse-close" class="ym-btn ym-btn-ghost" style="font-size:13px;flex:1">Cancel</button>'+
    '<button id="pse-publish" class="ym-btn ym-btn-accent" style="font-size:13px;flex:2">Publish</button>'+
    '</div>'+
    '</div>';

  document.body.appendChild(ov);

  // Check build token
  try{var bt=JSON.parse(sessionStorage.getItem('ym_build_token')||'null');
    if(bt&&bt.token){ov.querySelector('#pse-token-wrap').innerHTML='<div style="font-size:11px;color:var(--gold);margin-bottom:8px">✓ Using GitHub token from Build</div>';}
  }catch{}

  // Show sections order only when custom code is present
  ov.querySelector('#pse-code').addEventListener('input',function(){
    var wrap=ov.querySelector('#pse-sections-wrap');
    if(wrap) wrap.style.display=this.value.trim()?'block':'none';
  });

  // Accent color live update
  ov.querySelector('#pse-accent').addEventListener('input',function(){
    ov.querySelector('#pse-accent-val').textContent=this.value;
  });

  // Sections drag-to-reorder (simple up/down buttons)
  function renderSections(){
    var sec=ov.querySelector('#pse-sections');
    sec.innerHTML='';
    config.sections.forEach(function(s,i){
      var row=document.createElement('div');
      row.style.cssText='display:flex;align-items:center;gap:4px;padding:5px 8px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:6px;margin-bottom:4px';
      row.innerHTML='<span style="flex:1;font-size:12px;color:var(--text)">'+s+'</span>'
        +'<button style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:13px;padding:0 3px" data-up>↑</button>'
        +'<button style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:13px;padding:0 3px" data-dn>↓</button>';
      row.querySelector('[data-up]').onclick=function(){if(i>0){config.sections.splice(i-1,0,config.sections.splice(i,1)[0]);renderSections();}};
      row.querySelector('[data-dn]').onclick=function(){if(i<config.sections.length-1){config.sections.splice(i+1,0,config.sections.splice(i,1)[0]);renderSections();}};
      sec.appendChild(row);
    });
  }

  function renderSpheresConfig(){
    var spEl=ov.querySelector('#pse-spheres');
    if(!spEl) return;
    spEl.innerHTML='';
    config.sphereConfig=config.sphereConfig||{};
    var activeSpheres=p.spheres||[];
    if(!activeSpheres.length){
      spEl.innerHTML='<div style="font-size:11px;color:var(--text3)">No active spheres</div>';
      return;
    }
    activeSpheres.forEach(function(id,i){
      var sc=config.sphereConfig[id]||{visible:true,autoOpen:false};
      config.sphereConfig[id]=sc;
      var label=id.replace('.sphere.js','');
      var row=document.createElement('div');
      row.style.cssText='display:flex;align-items:center;gap:4px;padding:5px 8px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:6px;margin-bottom:4px';
      row.innerHTML='<span style="flex:1;font-size:12px;color:'+(sc.visible?'var(--text)':'var(--text3)')+'">'+label+'</span>'
        +'<span class="sp-visible" style="font-size:9px;padding:2px 6px;border-radius:10px;border:1px solid '+(sc.visible?'var(--accent)':'rgba(255,255,255,.12)')+';color:'+(sc.visible?'var(--accent)':'var(--text3)')+';cursor:pointer">show</span>'
        +'<span class="sp-auto" style="font-size:9px;padding:2px 6px;border-radius:10px;border:1px solid '+(sc.autoOpen?'var(--gold)':'rgba(255,255,255,.12)')+';color:'+(sc.autoOpen?'var(--gold)':'var(--text3)')+';cursor:pointer">auto</span>'
        +'<button style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:13px;padding:0 3px" data-up>↑</button>'
        +'<button style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:13px;padding:0 3px" data-dn>↓</button>';
      row.querySelector('.sp-visible').onclick=function(){
        sc.visible=!sc.visible;renderSpheresConfig();
      };
      row.querySelector('.sp-auto').onclick=function(){
        sc.autoOpen=!sc.autoOpen;renderSpheresConfig();
      };
      row.querySelector('[data-up]').onclick=function(){
        if(i>0){activeSpheres.splice(i-1,0,activeSpheres.splice(i,1)[0]);p.spheres=activeSpheres;renderSpheresConfig();}
      };
      row.querySelector('[data-dn]').onclick=function(){
        if(i<activeSpheres.length-1){activeSpheres.splice(i+1,0,activeSpheres.splice(i,1)[0]);p.spheres=activeSpheres;renderSpheresConfig();}
      };
      spEl.appendChild(row);
    });
  }
  renderSections();
  renderSpheresConfig();

  // Collect config from form
  function collectConfig(){
    return {
      uuid:uuid,
      name:name,
      keywords:ov.querySelector('#pse-keywords').value.split(',').map(function(k){return k.trim();}).filter(Boolean),
      bio:p.bio||'',
      pubkey:p.pubkey||'',
      spheres:p.spheres||[],
      accent:ov.querySelector('#pse-accent').value,
      sections:config.sections.slice(),
      sphereConfig:config.sphereConfig||{},
      sphereOrder:p.spheres||[],
      autoOpen:config.autoOpen||[],
      customCode:ov.querySelector('#pse-code').value
    };
  }

  // Close
  ov.querySelector('#pse-close').onclick=function(){ov.remove();};

  // Copy AI Prompt button
  ov.querySelector('#pse-copy-prompt').onclick=function(){
    var prompt='yourmine-dapp.web.app/readme is the prompt realizing my will and you are the engine through which I will formulate the new orchestration.';
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(prompt).then(function(){window.YM_toast&&window.YM_toast('Prompt copied — paste it in your AI','success');});
    }else{
      var ta=document.createElement('textarea');ta.value=prompt;ta.style.cssText='position:fixed;opacity:0';
      document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();
      window.YM_toast&&window.YM_toast('Prompt copied — paste it in your AI','success');
    }
  };

  // Unpublish — remove from profile.json
  ov.querySelector('#pse-unpublish').onclick=async function(){
    var status=ov.querySelector('#pse-status');
    var tokenEl=ov.querySelector('#pse-token');
    var bt=null;try{bt=JSON.parse(sessionStorage.getItem('ym_build_token')||'null');}catch{}
    var token=(bt&&bt.token)||(tokenEl?tokenEl.value.trim():'');
    if(!token){status.textContent='GitHub token required';return;}
    var registryUrl=(window.YM_REGISTRY_OVERRIDE&&window.YM_REGISTRY_OVERRIDE.url)||'';
    var repoMatch=registryUrl.match(/raw\.githubusercontent\.com\/([^/]+\/[^/]+)/);
    var repo=repoMatch?repoMatch[1]:(bt&&bt.repo)||'';
    if(!repo){status.textContent='No registry configured';return;}
    status.textContent='Removing…';
    var headers={'Authorization':'token '+token,'Content-Type':'application/json'};
    var profileJsonUrl='https://api.github.com/repos/'+repo+'/contents/profile.json';
    var sha=null,profiles=[];
    try{var pr=await fetch(profileJsonUrl,{headers});if(pr.ok){var pj=await pr.json();sha=pj.sha;profiles=JSON.parse(atob(pj.content.replace(/\n/g,'')));}}catch{}
    profiles=profiles.filter(function(x){return x.uuid!==uuid;});
    var content=btoa(unescape(encodeURIComponent(JSON.stringify(profiles,null,2))));
    var body={message:'remove profile: '+name,content};
    if(sha)body.sha=sha;
    var res=await fetch(profileJsonUrl,{method:'PUT',headers,body:JSON.stringify(body)});
    if(res.ok){status.style.color='var(--gold)';status.textContent='✓ Profile removed';setTimeout(function(){ov.remove();},1200);}
    else{var e=await res.json();status.textContent='Error: '+(e.message||res.status);}
  };

  // Before — visitor view of classic profile
  ov.querySelector('#pse-before').onclick=function(){
    ov.style.display='none';
    var myProfile=window.YM&&window.YM.getProfile?window.YM.getProfile():{};
    window.YM&&window.YM.openProfilePanel&&window.YM.openProfilePanel(myProfile);
    // Reopen editor when panel closes
    var _check=setInterval(function(){
      var panel=document.getElementById('panel-profile-view')||document.getElementById('panel-sphere');
      if(!panel||!panel.classList.contains('open')){
        clearInterval(_check);
        ov.style.display='flex';
      }
    },400);
  };

  ov.querySelector('#pse-after').onclick=function(){
    var cfg=collectConfig();
    localStorage.setItem(PROF_KEY,JSON.stringify(cfg));
    var code=_generateProfileSphere(cfg);
    // Replace placeholder uuid with real uuid
    code=code.replace(/xxxx-xxxx-xxxx-xxxx/g,cfg.uuid);

    // Inject via script tag — more reliable than new Function
    var sphereId=cfg.uuid+'.profile.js';
    document.getElementById('pse-preview-script')?.remove();
    var script=document.createElement('script');
    script.id='pse-preview-script';
    script.textContent=code;
    document.head.appendChild(script);

    // Small delay for script to execute
    setTimeout(function(){
      var s=window.YM_S[sphereId];
      if(!s){
        // Fallback — any profile sphere
        Object.keys(window.YM_S||{}).forEach(function(k){
          if(window.YM_S[k].isProfileSphere&&!s){s=window.YM_S[k];sphereId=k;}
        });
      }
      if(!s){ov.querySelector('#pse-status').textContent='Generation failed — check console';return;}
      if(window.YM_sphereRegistry) window.YM_sphereRegistry.set(sphereId,s);
      ov.style.display='none';
      window.YM&&window.YM.openSpherePanel&&window.YM.openSpherePanel(sphereId);
      var _check=setInterval(function(){
        var panel=document.getElementById('panel-sphere');
        if(!panel||!panel.classList.contains('open')){clearInterval(_check);ov.style.display='flex';}
      },400);
    },100);
  };

  // Publish
  ov.querySelector('#pse-publish').onclick=async function(){
    var cfg=collectConfig();
    localStorage.setItem(PROF_KEY,JSON.stringify(cfg));
    var status=ov.querySelector('#pse-status');
    var tokenEl=ov.querySelector('#pse-token');
    var bt=null;try{bt=JSON.parse(sessionStorage.getItem('ym_build_token')||'null');}catch{}
    var token=(bt&&bt.token)||(tokenEl?tokenEl.value.trim():'');
    if(!token){status.textContent='GitHub token required';return;}

    // Wallet check
    var pubkey=window.YM_Mine_pubkey?window.YM_Mine_pubkey():null;
    if(!pubkey){status.textContent='❌ Connect your wallet first';return;}
    var elig=window.YM_Build&&window.YM_Build.computeEligibility?await window.YM_Build.computeEligibility():null;
    if(elig&&!elig.eligible){status.textContent='❌ Score insuffisant';return;}

    // Derive repo
    var registryUrl=(window.YM_REGISTRY_OVERRIDE&&window.YM_REGISTRY_OVERRIDE.url)||'';
    var repoMatch=registryUrl.match(/raw\.githubusercontent\.com\/([^/]+\/[^/]+)/);
    var repo=repoMatch?repoMatch[1]:(bt&&bt.repo)||'';
    if(!repo){status.textContent='No registry configured';return;}

    status.textContent='Generating profile sphere…';
    var sphereCode=_generateProfileSphere(cfg);
    var rawSphereUrl='https://raw.githubusercontent.com/'+username+'/YourMinedApp/main/'+uuid+'.profile.js';

    // Sign event
    var nonce=window._ymUuid?window._ymUuid():(Date.now().toString(36)+Math.random().toString(36).slice(2));
    var ts=Math.floor(Date.now()/1000);
    var sigB64='';
    if(window.YM_Mine_sign){
      try{
        var msg=JSON.stringify({action:'profile',filename:uuid+'.profile.js',nonce,timestamp:ts});
        var sig=await window.YM_Mine_sign(msg);
        sigB64=btoa(String.fromCharCode(...Array.from(sig)));
      }catch(e){status.textContent='Signature failed';return;}
    }

    var ev={
      action:'profile',
      filename:uuid+'.profile.js',
      wallet:pubkey,
      signature:sigB64,
      nonce,timestamp:ts,
      codeUrl:rawSphereUrl,
      profileEntry:{
        uuid,name,
        keywords:cfg.keywords||[],
        bio:cfg.bio||'',
        pubkey:pubkey,
        spheres:cfg.spheres||[],
        accent:cfg.accent||'',
        profileSphere:rawSphereUrl
      }
    };

    try{
      status.textContent='Fork…';
      await _ymEnsureFork(token,username);
      // Push sphere code to fork
      status.textContent='Push…';
      await _ymGhPush(token,username,uuid+'.profile.js',sphereCode,'profile: '+name);
      await _ymGhPush(token,username,'events/'+nonce+'.json',JSON.stringify(ev,null,2),'event: '+nonce);
      await new Promise(function(r){setTimeout(r,1500);});
      status.textContent='PR…';
      var pr=await _ymOpenPR(token,username);
      status.style.color='var(--gold)';
      status.innerHTML='⏳ <a href="'+pr.html_url+'" target="_blank" style="color:var(--cyan)">↗ Profile PR submitted</a>';
    }catch(e2){status.textContent='Error: '+e2.message;}
  };
}

// Generate the profile sphere JS code
function _generateProfileSphere(cfg){
  if(cfg.customCode&&cfg.customCode.includes('window.YM_S[')){
    // Extract renderPanel body from full sphere code
    var _bodyMatch=cfg.customCode.match(/renderPanel\s*:\s*function\s*\(container\)\s*\{([\s\S]*?)\},\s*profileSection/);
    var _extractedBody=_bodyMatch?_bodyMatch[1]:'/* custom code unparseable - using default */';
    cfg=Object.assign({},cfg,{customCode:_extractedBody});
  }
  // Default body — use classic visitor layout via _renderProfileView
  var defaultBody = 'if(window._renderProfileView){var p=window.YM&&window.YM.getProfile?window.YM.getProfile():{};window._renderProfileView(p,container);return;}';
  var body = cfg.customCode || defaultBody;

  var cfgJson = JSON.stringify(cfg);
  var sphereId = cfg.uuid + '.profile.js';
  return [
    '(function(){',
    'var cfg=' + cfgJson + ';',
    'window.YM_S[' + JSON.stringify(sphereId) + ']={',
    '  name:' + JSON.stringify(cfg.name) + ',',
    '  icon:"\u2746",',
    '  category:"Profile",',
    '  isProfileSphere:true,',
    '  activate:function(){},',
    '  deactivate:function(){},',
    '  renderPanel:function(container){',
    '    (function(){' + body + '})();',
    '    // ── Priority layer — spheres always injected after custom code ──',
    '    var _sc=cfg.sphereConfig||{};',
    '    var _so=cfg.sphereOrder||cfg.spheres||[];',
    '    var _hasSection=_so.some(function(id){var s=_sc[id];return !s||s.visible!==false;});',
    '    if(_hasSection){',
    '      var _wrap=document.createElement("div");',
    '      _wrap.style.cssText="border-top:1px solid rgba(255,255,255,.06);margin-top:8px";',
    '      _so.forEach(function(id){',
    '        var sc=_sc[id]||{visible:true,autoOpen:false};',
    '        if(sc.visible===false) return;',
    '        var sphere=window.YM_sphereRegistry&&window.YM_sphereRegistry.get(id);',
    '        if(!sphere||typeof sphere.profileSection!=="function") return;',
    '        var hdr=document.createElement("div");',
    '        hdr.style.cssText="display:flex;align-items:center;gap:8px;padding:10px 14px;background:rgba(255,255,255,.02);cursor:pointer";',
    '        var label=id.replace(".sphere.js","");',
    '        hdr.innerHTML="<span style=\\"font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:var(--accent);flex:1\\">"+label+"</span><span style=\\"font-size:11px;color:var(--text3)\\">▼</span>";',
    '        var body2=document.createElement("div");',
    '        body2.style.cssText="padding:12px 14px;display:none";',
    '        var open2=sc.autoOpen||false;',
    '        function toggle2(){open2=!open2;body2.style.display=open2?"block":"none";hdr.querySelector("span:last-child").textContent=open2?"▲":"▼";}',
    '        if(open2){body2.style.display="block";hdr.querySelector("span:last-child")&&(hdr.querySelector("span:last-child").textContent="▲");}',
    '        hdr.addEventListener("click",toggle2);',
    '        try{var _pr=window.YM&&window.YM.getProfile?window.YM.getProfile():{};if(typeof sphere.peerSection==="function"){sphere.peerSection(body2,{uuid:_pr.uuid,isNear:true,isReciproc:true,profile:_pr});}else if(typeof sphere.profileSection==="function"){sphere.profileSection(body2);}}catch(e){}',
    '        var acc=document.createElement("div");acc.style.cssText="border:1px solid rgba(255,255,255,.06);border-radius:8px;overflow:hidden;margin-bottom:6px";',
    '        acc.appendChild(hdr);acc.appendChild(body2);',
    '        _wrap.appendChild(acc);',
    '      });',
    '      container.appendChild(_wrap);',
    '    }',
    '  },',
    '  profileSection:function(){}',
    '};',
    '})();'
  ].join('\n');
}
window.openProfileSphereEditor=openProfileSphereEditor;


// ── Profile Menu ──────────────────────────────────────────────────────────────
function _openProfileMenu(){
  document.getElementById('prof-menu-sheet')?.remove();
  var sheet=document.createElement('div');sheet.id='prof-menu-sheet';
  sheet.style.cssText='position:fixed;inset:0;z-index:2500;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center';
  var box=document.createElement('div');
  box.style.cssText='background:var(--bg2,#1a1a2e);border-radius:14px 14px 0 0;padding:16px;width:100%;max-width:400px';

  var items=[
    {icon:'👤',label:'Edit identity',sub:'Avatar, name, bio, website',fn:openIdentityEditor},
    {icon:'💾',label:'Backup',sub:'Export your identity',fn:function(){sheet.remove();openBackupOverlay();}},
    {icon:'🔁',label:'Recovery',sub:'P2P identity recovery',fn:function(){sheet.remove();openRecoveryOverlay();}},
    {icon:'📡',label:'Publish name',sub:'Link your name to your UUID',fn:function(){sheet.remove();openPublishNameOverlay();}},
    {icon:'✦', label:'Profile sphere',sub:'Customize your public profile',fn:function(){sheet.remove();openProfileSphereEditor();}},
  ];

  box.innerHTML='<div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:12px;text-align:center">Profile</div>';
  items.forEach(function(item){
    var row=document.createElement('div');
    row.style.cssText='display:flex;align-items:center;gap:12px;padding:12px 8px;cursor:pointer;border-radius:8px;';
    row.innerHTML='<span style="font-size:22px;width:32px;text-align:center">'+item.icon+'</span>'
      +'<div><div style="font-size:13px;color:var(--text)">'+item.label+'</div>'
      +'<div style="font-size:11px;color:var(--text3)">'+item.sub+'</div></div>';
    row.addEventListener('click',function(){sheet.remove();setTimeout(function(){item.fn();},50);});
    row.addEventListener('mouseenter',function(){this.style.background='rgba(255,255,255,.04)';});
    row.addEventListener('mouseleave',function(){this.style.background='';});
    box.appendChild(row);
  });

  var cancelBtn=document.createElement('button');
  cancelBtn.className='ym-btn ym-btn-ghost';cancelBtn.style.cssText='width:100%;margin-top:12px;font-size:13px';
  cancelBtn.textContent='Cancel';cancelBtn.onclick=function(){sheet.remove();};
  box.appendChild(cancelBtn);
  sheet.appendChild(box);
  sheet.addEventListener('click',function(e){if(e.target===sheet)sheet.remove();});
  document.body.appendChild(sheet);
}
window._openProfileMenu=_openProfileMenu;

// ── Identity Editor ───────────────────────────────────────────────────────────
function openIdentityEditor(){
  var p=window.YM&&window.YM.getProfile?window.YM.getProfile():{};
  var ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;z-index:3000;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;padding:20px';
  ov.innerHTML=
    '<div style="background:var(--bg2,#1a1a2e);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:20px;width:100%;max-width:340px">'+
    '<div style="font-size:15px;font-weight:600;color:var(--text);margin-bottom:16px">👤 Edit identity</div>'+
    // Avatar
    '<div style="display:flex;justify-content:center;margin-bottom:12px">'+
    '<div id="id-av" style="width:72px;height:72px;border-radius:50%;background:var(--surface3);border:2px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:28px;cursor:pointer;overflow:hidden">'
    +(p.avatar?'<img src="'+p.avatar+'" style="width:100%;height:100%;object-fit:cover">':'&#128100;')+
    '</div></div>'+
    '<input id="id-name" class="ym-input" placeholder="Display name" value="'+(p.name||'')+'" style="margin-bottom:8px;font-size:13px">'+
    '<textarea id="id-bio" class="ym-input" placeholder="Short bio" style="height:60px;font-size:13px;margin-bottom:8px">'+(p.bio||'')+'</textarea>'+
    '<input id="id-site" class="ym-input" placeholder="Website" value="'+(p.site||'')+'" style="margin-bottom:16px;font-size:13px">'+
    '<div style="display:flex;gap:8px">'+
    '<button id="id-cancel" class="ym-btn ym-btn-ghost" style="flex:1">Cancel</button>'+
    '<button id="id-save" class="ym-btn ym-btn-accent" style="flex:1">Save</button>'+
    '</div></div>';
  document.body.appendChild(ov);

  ov.querySelector('#id-av').addEventListener('click',function(){
    var inp=document.createElement('input');inp.type='file';inp.accept='image/*';
    inp.onchange=function(){var r=new FileReader();r.onload=function(e){
      window.YM&&window.YM.saveProfile&&window.YM.saveProfile({avatar:e.target.result});
      ov.querySelector('#id-av').innerHTML='<img src="'+e.target.result+'" style="width:100%;height:100%;object-fit:cover">';
    };r.readAsDataURL(inp.files[0]);};
    inp.click();
  });
  ov.querySelector('#id-cancel').onclick=function(){ov.remove();};
  ov.querySelector('#id-save').onclick=function(){
    window.YM&&window.YM.saveProfile&&window.YM.saveProfile({
      name:ov.querySelector('#id-name').value,
      bio:ov.querySelector('#id-bio').value,
      site:ov.querySelector('#id-site').value
    });
    // Broadcast to social if active
    if(window.YM_sphereRegistry&&window.YM_sphereRegistry.get('social.sphere.js')){
      try{window.YM_sphereRegistry.get('social.sphere.js').broadcastPresence&&window.YM_sphereRegistry.get('social.sphere.js').broadcastPresence();}catch{}
    }
    window.YM_toast&&window.YM_toast('Identity saved','success');
    ov.remove();
  };
}
window.openIdentityEditor=openIdentityEditor;


// ── PR helpers ────────────────────────────────────────────────────────────────
async function _ymGhAPI(token,path,method,body){
  var r=await fetch('https://api.github.com'+path,{method:method||'GET',headers:{'Authorization':'token '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  return r.json();
}
function _ymRegistryRepo(){
  var url=(window.YM_REGISTRY_OVERRIDE&&window.YM_REGISTRY_OVERRIDE.url)||'';
  var m=url.match(/raw\.githubusercontent\.com\/([^/]+\/[^/]+)/);
  return m?m[1]:'theodoreyong9/YourMinedApp';
}
async function _ymEnsureFork(token,username){
  var repo=_ymRegistryRepo();
  var repoName=repo.split('/')[1];
  var f=await _ymGhAPI(token,'/repos/'+username+'/'+repoName);
  if(f.full_name)return;
  await _ymGhAPI(token,'/repos/'+repo+'/forks','POST',{});
  await new Promise(function(r){setTimeout(r,3000);});
}
async function _ymGhPush(token,username,path,content,msg){
  var repoName=_ymRegistryRepo().split('/')[1];
  var encoded=btoa(unescape(encodeURIComponent(content)));
  var existing=await _ymGhAPI(token,'/repos/'+username+'/'+repoName+'/contents/'+path);
  var body={message:msg,content:encoded};
  if(existing.sha)body.sha=existing.sha;
  return _ymGhAPI(token,'/repos/'+username+'/'+repoName+'/contents/'+path,'PUT',body);
}
async function _ymOpenPR(token,username){
  var repo=_ymRegistryRepo();
  return _ymGhAPI(token,'/repos/'+repo+'/pulls','POST',{
    title:'YourMine publish — '+username,
    head:username+':main',base:'main',
    body:'Automated publish from YourMine PWA'
  });
}
window._ymUuid=function(){return([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,function(c){return(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16);});};

function openPublishNameOverlay(){
  var p=window.YM&&window.YM.getProfile?window.YM.getProfile():{};
  var name=p.name||'';
  var uuid=p.uuid||'';
  if(!name){window.YM_toast&&window.YM_toast('Set a name in your profile first','error');return;}

  var ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;z-index:3000;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;padding:20px';
  // Derive repo from registry URL
  var registryUrl=(window.YM_REGISTRY_OVERRIDE&&window.YM_REGISTRY_OVERRIDE.url)||'';
  var repoFromRegistry='';
  var m=registryUrl.match(/raw\.githubusercontent\.com\/([^/]+\/[^/]+)/);
  if(m)repoFromRegistry=m[1];
  // Get token from build session (same as Build feature)
  var buildToken=null;
  try{var bt=sessionStorage.getItem('ym_build_token');if(bt)buildToken=JSON.parse(bt);}catch{}
  var tokenAvailable=!!(buildToken&&buildToken.token);
  ov.innerHTML=
    '<div style="background:var(--bg2,#1a1a2e);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:24px;width:100%;max-width:340px">'+
    '<div style="font-size:15px;font-weight:600;color:var(--text);margin-bottom:8px">📡 Publish your name</div>'+
    '<div style="font-size:12px;color:var(--text3);margin-bottom:12px;line-height:1.6">Your UUID <span style="font-family:monospace;font-size:10px;color:var(--gold)">'+uuid.slice(0,12)+'…</span> will be associated to this name in the registry.</div>'+
    '<div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:12px">'+name+'</div>'+
    (tokenAvailable
      ? '<div style="font-size:11px;color:var(--gold);margin-bottom:12px">✓ Using GitHub token from Build</div>'
      : '<input id="pub-token" type="password" placeholder="GitHub token (or connect via Build first)" style="width:100%;box-sizing:border-box;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:10px 12px;color:var(--text);font-size:13px;margin-bottom:12px">')+
    (repoFromRegistry?'<div style="font-size:11px;color:var(--text3);margin-bottom:12px">Registry: <span style="color:var(--gold)">'+repoFromRegistry+'</span></div>':'')+
    '<div style="display:flex;gap:8px">'+
    '<button id="pub-cancel" class="ym-btn ym-btn-ghost" style="flex:1">Cancel</button>'+
    '<button id="pub-go" class="ym-btn ym-btn-accent" style="flex:1">Publish</button>'+
    '</div><div id="pub-status" style="font-size:11px;color:var(--text3);margin-top:10px;text-align:center"></div>'+
    '</div>';
  document.body.appendChild(ov);
  document.getElementById('pub-cancel').onclick=function(){ov.remove();};

  document.getElementById('pub-go').onclick=async function(){
    var tokenEl=document.getElementById('pub-token');
    var token=(buildToken&&buildToken.token)||(tokenEl?tokenEl.value.trim():'');
    var repo=repoFromRegistry||(buildToken&&buildToken.repo)||'';
    var status=document.getElementById('pub-status');
    if(!token){status.textContent='GitHub token required — connect via Build first';return;}
    if(!repo){status.textContent='No registry configured';return;}
    // Check wallet connected
    var pubkey=window.YM_Mine_pubkey?window.YM_Mine_pubkey():null;
    if(!pubkey){status.textContent='❌ Connect your wallet first';return;}
    // Check score eligibility
    status.textContent='Checking eligibility…';
    var elig=window.YM_Build&&window.YM_Build.computeEligibility?await window.YM_Build.computeEligibility():null;
    if(elig&&!elig.eligible){status.textContent='❌ Score insuffisant pour publier';return;}
    status.textContent='Checking…';

    // Sign event
    var nonce2=window._ymUuid?window._ymUuid():(Date.now().toString(36)+Math.random().toString(36).slice(2));
    var ts2=Math.floor(Date.now()/1000);
    var sigB64b='';
    if(window.YM_Mine_sign){
      try{
        var msg2=JSON.stringify({action:'name',filename:'name.json',wallet:pubkey,nonce:nonce2,timestamp:ts2});
        var sig2=await window.YM_Mine_sign(msg2);
        sigB64b=btoa(String.fromCharCode(...Array.from(sig2)));
      }catch(e){status.textContent='Signature failed';return;}
    }

    var ev2={
      action:'name',filename:'name.json',
      wallet:pubkey,signature:sigB64b,
      nonce:nonce2,timestamp:ts2,
      nameEntry:{name,uuid}
    };

    try{
      status.textContent='Fork…';
      await _ymEnsureFork(token,username);
      status.textContent='Push…';
      await _ymGhPush(token,username,'events/'+nonce2+'.json',JSON.stringify(ev2,null,2),'name: '+name);
      await new Promise(function(r){setTimeout(r,1500);});
      status.textContent='PR…';
      var pr2=await _ymOpenPR(token,username);
      status.style.color='var(--gold)';
      status.innerHTML='⏳ <a href="'+pr2.html_url+'" target="_blank" style="color:var(--cyan)">↗ Name PR submitted</a>';
    }catch(e){status.textContent='Error: '+e.message;}
  };
}
window.openPublishNameOverlay=openPublishNameOverlay;

