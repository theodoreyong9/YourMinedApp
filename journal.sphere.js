/* journal.sphere.js — Social journal for YourMine
   One file per person. Publish via GitHub + wallet (first time).
   Update via GitHub only. Browse others' journals in the network.
*/
(function(){
'use strict';
window.YM_S = window.YM_S || {};

const SPHERE_ID  = 'journal.sphere.js';
const GH_OWNER   = 'theodoreyong9';
const GH_REPO    = 'YourMinedApp';
const GH_BRANCH  = 'main';
const RAW_BASE   = 'https://raw.githubusercontent.com/'+GH_OWNER+'/'+GH_REPO+'/'+GH_BRANCH+'/';
const JOURNAL_JSON = RAW_BASE+'journals.json';

let _ctx  = null;
let _tab  = 'feed'; // browse | mine | publish
let _journals = null;

function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function toast(m,t){_ctx&&_ctx.toast(m,t);}
function pubkey(){return window.YM_Mine_pubkey?window.YM_Mine_pubkey():null;}

// ── GitHub API ────────────────────────────────────────────────
async function ghAPI(token,path,method,body){
  const r=await fetch('https://api.github.com'+path,{
    method:method||'GET',
    headers:{'Authorization':'token '+token,'Content-Type':'application/json','Accept':'application/vnd.github.v3+json'},
    body:body?JSON.stringify(body):undefined
  });
  if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.message||'GitHub '+r.status);}
  return r.status===204?null:r.json();
}

async function ensureFork(token,username){
  try{await ghAPI(token,'/repos/'+username+'/'+GH_REPO);return;}catch{}
  await ghAPI(token,'/repos/'+GH_OWNER+'/'+GH_REPO+'/forks','POST',{});
  for(let i=0;i<12;i++){
    await new Promise(r=>setTimeout(r,3000));
    try{await ghAPI(token,'/repos/'+username+'/'+GH_REPO);return;}catch{}
  }
  throw new Error('Fork timeout');
}

async function ghPush(token,username,path,content,msg){
  let sha=null;
  try{const ex=await ghAPI(token,'/repos/'+username+'/'+GH_REPO+'/contents/'+path+'?ref='+GH_BRANCH);if(ex?.sha)sha=ex.sha;}catch{}
  const body={message:msg,content:btoa(unescape(encodeURIComponent(content))),branch:GH_BRANCH};
  if(sha)body.sha=sha;
  await ghAPI(token,'/repos/'+username+'/'+GH_REPO+'/contents/'+path,'PUT',body);
}

async function openPR(token,username,title){
  const ex=await ghAPI(token,'/repos/'+GH_OWNER+'/'+GH_REPO+'/pulls?state=open&head='+username+':'+GH_BRANCH);
  if(ex&&ex.length>0)return ex[0];
  return ghAPI(token,'/repos/'+GH_OWNER+'/'+GH_REPO+'/pulls','POST',{
    title:title,body:'Journal submission.',head:username+':'+GH_BRANCH,base:GH_BRANCH
  });
}

// ── Load registry ─────────────────────────────────────────────
async function loadJournals(force){
  if(_journals&&!force)return _journals;
  try{const r=await fetch(JOURNAL_JSON+'?t='+Date.now(),{cache:'no-store'});_journals=r.ok?await r.json():[];}
  catch{_journals=[];}
  return _journals;
}

// ── Generate journal.js ───────────────────────────────────────
function generateJournalFile(data){
  return `/* journal.js — Personal journal published on YourMine
   Author: @${data.github}
   Updated: ${new Date(data.updatedAt).toISOString()}
*/
(function(){
  var JOURNAL = ${JSON.stringify(data,null,2)};
  if(typeof window!=='undefined') window.YM_JOURNAL_DATA = JOURNAL;

  window.YM_renderJournal = function(container){
    container.innerHTML='';
    container.style.cssText='padding:20px;display:flex;flex-direction:column;gap:16px;font-family:Inter,sans-serif;color:#e4e6f4;max-width:600px;margin:0 auto';

    // Header
    var hd=document.createElement('div');
    hd.innerHTML=
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:4px">'+
        '<div style="font-size:32px">'+JOURNAL.icon+'</div>'+
        '<div>'+
          '<div style="font-size:20px;font-weight:700;color:#f0f0f8">'+JOURNAL.title+'</div>'+
          '<div style="font-size:11px;color:rgba(240,240,248,.4);margin-top:2px">by @'+JOURNAL.github+' · '+new Date(JOURNAL.updatedAt).toLocaleDateString('en',{year:'numeric',month:'long',day:'numeric'})+'</div>'+
        '</div>'+
      '</div>';
    container.appendChild(hd);

    var sep=document.createElement('div');
    sep.style.cssText='height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.08),transparent)';
    container.appendChild(sep);

    // Bio/intro
    if(JOURNAL.intro){
      var intro=document.createElement('div');
      intro.style.cssText='font-size:13px;color:rgba(240,240,248,.55);line-height:1.8;font-style:italic;padding:12px 14px;background:rgba(255,255,255,.03);border-left:2px solid rgba(240,168,48,.3);border-radius:0 8px 8px 0';
      intro.textContent=JOURNAL.intro;
      container.appendChild(intro);
    }

    // Entries
    if(JOURNAL.entries&&JOURNAL.entries.length){
      JOURNAL.entries.slice().reverse().forEach(function(entry){
        var card=document.createElement('div');
        card.style.cssText='background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:8px';
        var dateStr=entry.date?new Date(entry.date).toLocaleDateString('en',{weekday:'short',month:'short',day:'numeric'}):'';
        card.innerHTML=
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'+
            (entry.mood?'<span style="font-size:18px">'+entry.mood+'</span>':'')+
            '<div style="flex:1">'+
              '<div style="font-size:13px;font-weight:600;color:#f0f0f8">'+entry.title+'</div>'+
              '<div style="font-size:10px;color:rgba(240,240,248,.3)">'+dateStr+'</div>'+
            '</div>'+
          '</div>'+
          '<div style="font-size:13px;color:rgba(240,240,248,.6);line-height:1.8;white-space:pre-wrap">'+entry.content+'</div>'+
          (entry.tags&&entry.tags.length?
            '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">'+
              entry.tags.map(function(t){return '<span style="font-size:10px;padding:2px 8px;border-radius:4px;background:rgba(240,168,48,.08);border:1px solid rgba(240,168,48,.15);color:rgba(240,168,48,.7)">#'+t+'</span>';}).join('')+
            '</div>':''
          );
        container.appendChild(card);
      });
    }

    // Footer
    var footer=document.createElement('div');
    footer.style.cssText='font-family:monospace;font-size:9px;color:rgba(240,168,48,.3);padding-top:8px;border-top:1px solid rgba(255,255,255,.05);text-align:center';
    footer.textContent='@'+JOURNAL.github+' · YourMine Journal';
    container.appendChild(footer);
  };
})();
`;
}

// ── Open journal as panel ─────────────────────────────────────
async function openJournalPanel(url){
  const overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;z-index:600;background:rgba(0,0,0,.75);backdrop-filter:blur(12px);display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding:16px;overflow-y:auto';

  const panel=document.createElement('div');
  panel.style.cssText='width:100%;max-width:640px;background:#0a0a0f;border:1px solid rgba(255,255,255,.08);border-radius:16px;overflow:hidden;margin-top:8px';

  const closeBar=document.createElement('div');
  closeBar.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.06);background:#0a0a0f;position:sticky;top:0;z-index:2';
  closeBar.innerHTML='<div style="font-size:10px;font-family:monospace;color:rgba(255,255,255,.3)">'+esc(url.split('/').pop())+'</div>';
  const closeBtn=document.createElement('button');
  closeBtn.style.cssText='background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.5);font-size:13px;width:32px;height:32px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center';
  closeBtn.textContent='✕';
  closeBtn.addEventListener('click',()=>overlay.remove());
  closeBar.appendChild(closeBtn);
  panel.appendChild(closeBar);

  const target=document.createElement('div');
  target.style.cssText='min-height:200px';
  panel.appendChild(target);
  overlay.appendChild(panel);
  overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove();});
  document.body.appendChild(overlay);

  try{
    const r=await fetch(url+'?t='+Date.now(),{cache:'no-store'});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const code=await r.text();
    const script=document.createElement('script');
    script.textContent=code;
    document.head.appendChild(script);
    setTimeout(()=>{if(window.YM_renderJournal)window.YM_renderJournal(target);},100);
  }catch(e){
    target.innerHTML='<div style="padding:24px;color:rgba(255,69,96,.7);font-size:12px">Failed to load: '+esc(e.message)+'</div>';
  }
}

// ── Step card ─────────────────────────────────────────────────
function _step(label,status){
  const el=document.createElement('div');
  el.style.cssText='border:1px solid rgba(255,255,255,.07);border-radius:10px;overflow:hidden';
  el.innerHTML=
    '<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:rgba(255,255,255,.02);border-bottom:1px solid rgba(255,255,255,.06)">'+
      '<div style="font-family:var(--font-d,inherit);font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text2);flex:1">'+label+'</div>'+
      (status?'<div style="font-size:10px;color:var(--green,#22d98a);font-family:var(--font-m,monospace)">'+esc(status)+'</div>':'')+
    '</div>'+
    '<div class="step-body" style="padding:12px 14px"></div>';
  return{el,body:el.querySelector('.step-body')};
}

// ── Panel ─────────────────────────────────────────────────────
function renderPanel(container){
  container.innerHTML='';
  container.style.cssText='flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0';

  const tabs=document.createElement('div');
  tabs.style.cssText='display:flex;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0;background:rgba(0,0,0,.2)';
  [{id:'feed',label:'📡 Feed'},{id:'browse',label:'📖 Browse'},{id:'mine',label:'✏️ My Journal'},{id:'publish',label:'+ Publish'}].forEach(t=>{
    const tab=document.createElement('div');
    tab.style.cssText='flex:1;padding:11px 4px 9px;text-align:center;font-size:10px;font-family:var(--font-m,monospace);cursor:pointer;transition:all .15s;border-top:2px solid '+(_tab===t.id?'var(--gold,#f0a830)':'transparent')+';color:'+(_tab===t.id?'var(--gold,#f0a830)':'rgba(255,255,255,.35)');
    tab.textContent=t.label;
    tab.addEventListener('click',()=>{_tab=t.id;renderPanel(container);});
    tabs.appendChild(tab);
  });
  container.appendChild(tabs);

  const body=document.createElement('div');
  body.style.cssText='flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;min-height:0';
  container.appendChild(body);

  if(_tab==='feed') renderFeedTab(body);
  else if(_tab==='browse') renderBrowseTab(body);
  else if(_tab==='mine') renderMineTab(body,container);
  else renderPublishTab(body,container);
}

// ── Feed tab ─────────────────────────────────────────────────
function renderFeedTab(body){
  body.innerHTML='';
  const wrap=document.createElement('div');
  wrap.style.cssText='padding:12px;display:flex;flex-direction:column;gap:10px';
  body.appendChild(wrap);

  // Section builder
  function _section(label){
    const s=document.createElement('div');
    s.style.cssText='font-size:9px;color:var(--text3);font-family:var(--font-m,monospace);text-transform:uppercase;letter-spacing:1px;padding:4px 0 6px;border-bottom:1px solid rgba(255,255,255,.04);margin-bottom:4px';
    s.textContent=label;
    wrap.appendChild(s);
  }

  function _journalCard(bd,uuid){
    if(!bd?.journal_url)return null;
    const card=document.createElement('div');
    card.style.cssText='background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:10px 12px;display:flex;align-items:center;gap:10px;cursor:pointer;transition:border-color .15s';
    card.innerHTML=
      '<span style="font-size:24px;flex-shrink:0">'+(bd.journal_icon||'📖')+'</span>'+
      '<div style="flex:1;min-width:0">'+
        '<div style="font-size:12px;font-weight:600;color:var(--text,#e4e6f4)">'+esc(bd.journal_title||'Journal')+'</div>'+
        '<div style="font-size:10px;color:var(--text3);margin-top:1px">'+(bd.journal_entries||0)+' entries</div>'+
      '</div>'+
      (bd.journal_updated?'<div style="font-size:9px;color:var(--text3);font-family:var(--font-m,monospace);flex-shrink:0">'+new Date(bd.journal_updated).toLocaleDateString('en',{month:'short',day:'numeric'})+'</div>':'');
    card.addEventListener('click',()=>openJournalPanel(bd.journal_url));
    card.addEventListener('mouseenter',()=>card.style.borderColor='rgba(240,168,48,.3)');
    card.addEventListener('mouseleave',()=>card.style.borderColor='rgba(255,255,255,.06)');
    return card;
  }

  let hasContent=false;

  // Near — P2P connected peers
  const near=window.YM_Social&&window.YM_Social._nearUsers;
  const nearJournals=[];
  if(near&&near.size){
    near.forEach((u,uuid)=>{
      const bd=u.broadcastData&&u.broadcastData['journal.sphere.js'];
      if(bd?.journal_url)nearJournals.push({bd,uuid,name:u.profile?.name||uuid.slice(0,6)});
    });
  }
  if(nearJournals.length){
    hasContent=true;
    _section('📡 Near — '+nearJournals.length+' peer'+(nearJournals.length>1?'s':'')+' online');
    nearJournals.forEach(({bd,uuid})=>{
      const card=_journalCard(bd,uuid);
      if(card)wrap.appendChild(card);
    });
  }

  // Contacts — from Social sphere
  const contacts=window.YM_Social&&window.YM_Social._contacts||[];
  const contactJournals=[];
  if(contacts.length){
    contacts.forEach(c=>{
      const bd=c.broadcastData&&c.broadcastData['journal.sphere.js'];
      if(bd?.journal_url)contactJournals.push({bd,uuid:c.uuid});
    });
  }
  if(contactJournals.length){
    hasContent=true;
    _section('👥 Contacts');
    contactJournals.forEach(({bd,uuid})=>{
      const card=_journalCard(bd,uuid);
      if(card)wrap.appendChild(card);
    });
  }

  // Rank — top journals from registry
  loadJournals().then(journals=>{
    if(journals&&journals.length){
      hasContent=true;
      const rankSection=document.createElement('div');
      rankSection.style.cssText='font-size:9px;color:var(--text3);font-family:var(--font-m,monospace);text-transform:uppercase;letter-spacing:1px;padding:4px 0 6px;border-bottom:1px solid rgba(255,255,255,.04);margin-bottom:4px';
      rankSection.textContent='⭐ Top journals';
      wrap.appendChild(rankSection);
      journals.slice(0,5).forEach(j=>{
        const card=document.createElement('div');
        card.style.cssText='background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:10px 12px;display:flex;align-items:center;gap:10px;cursor:pointer;transition:border-color .15s';
        card.innerHTML=
          '<span style="font-size:24px;flex-shrink:0">'+(j.icon||'📖')+'</span>'+
          '<div style="flex:1;min-width:0">'+
            '<div style="font-size:12px;font-weight:600;color:var(--text,#e4e6f4)">'+esc(j.title||'Journal')+'</div>'+
            '<div style="font-size:10px;color:var(--text3)">@'+esc(j.github)+' · '+(j.entryCount||0)+' entries</div>'+
          '</div>';
        card.addEventListener('click',()=>openJournalPanel(j.codeUrl));
        card.addEventListener('mouseenter',()=>card.style.borderColor='rgba(240,168,48,.3)');
        card.addEventListener('mouseleave',()=>card.style.borderColor='rgba(255,255,255,.06)');
        wrap.appendChild(card);
      });
    }

    if(!hasContent&&!journals?.length){
      wrap.innerHTML='<div style="padding:32px;text-align:center;font-size:11px;color:var(--text3);line-height:1.8">No journals in your feed yet.<br>Publish yours or connect peers.</div>';
    }
  });
}

// ── Browse tab ─────────────────────────────────────────────────
async function renderBrowseTab(body){
  body.innerHTML='<div style="padding:16px;font-size:11px;color:var(--text3);font-family:var(--font-m,monospace)">Loading journals…</div>';
  const journals=await loadJournals();
  body.innerHTML='';

  const wrap=document.createElement('div');
  wrap.style.cssText='padding:12px;display:flex;flex-direction:column;gap:10px';
  body.appendChild(wrap);

  // Search
  const searchRow=document.createElement('div');
  searchRow.style.cssText='display:flex;gap:8px';
  searchRow.innerHTML='<input id="journal-search" class="ym-input" placeholder="Search journals…" style="flex:1;font-size:12px">';
  wrap.appendChild(searchRow);

  const results=document.createElement('div');
  results.style.cssText='display:flex;flex-direction:column;gap:8px';
  wrap.appendChild(results);

  function renderList(list){
    results.innerHTML='';
    if(!list.length){
      results.innerHTML='<div style="padding:24px;text-align:center;font-size:11px;color:var(--text3)">No journals published yet.</div>';
      return;
    }
    list.forEach(j=>{
      const card=document.createElement('div');
      card.style.cssText='background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:12px;cursor:pointer;transition:border-color .15s';
      card.innerHTML=
        '<div style="display:flex;align-items:center;gap:10px">'+
          '<span style="font-size:28px;flex-shrink:0">'+(j.icon||'📖')+'</span>'+
          '<div style="flex:1;min-width:0">'+
            '<div style="font-size:13px;font-weight:600;color:var(--text,#e4e6f4)">'+esc(j.title||'Journal')+'</div>'+
            '<div style="font-size:10px;color:var(--text3);margin-top:1px">by @'+esc(j.github)+'</div>'+
            (j.intro?'<div style="font-size:11px;color:var(--text2);margin-top:4px;line-height:1.5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(j.intro)+'</div>':'')+
          '</div>'+
          '<div style="font-size:9px;color:var(--text3);font-family:var(--font-m,monospace);flex-shrink:0;text-align:right">'+
            (j.entryCount?j.entryCount+' entries':'')+'<br>'+
            (j.updatedAt?new Date(j.updatedAt).toLocaleDateString('en',{month:'short',day:'numeric'}):'')+'</div>'+
        '</div>';
      card.addEventListener('click',()=>openJournalPanel(j.codeUrl));
      card.addEventListener('mouseenter',()=>card.style.borderColor='rgba(240,168,48,.3)');
      card.addEventListener('mouseleave',()=>card.style.borderColor='rgba(255,255,255,.06)');
      results.appendChild(card);
    });
  }

  renderList(journals);

  wrap.querySelector('#journal-search').addEventListener('input',e=>{
    const q=e.target.value.toLowerCase();
    if(!q){renderList(journals);return;}
    renderList(journals.filter(j=>(j.title+' '+j.github+' '+(j.intro||'')).toLowerCase().includes(q)));
  });
}

// ── My Journal tab ────────────────────────────────────────────
function renderMineTab(body,container){
  const myUrl=localStorage.getItem('journal_my_url');
  const myData=localStorage.getItem('journal_my_data');
  let journal=myData?JSON.parse(myData):null;

  const wrap=document.createElement('div');
  wrap.style.cssText='padding:14px;display:flex;flex-direction:column;gap:10px';
  body.appendChild(wrap);

  if(!myUrl){
    wrap.innerHTML='<div style="padding:24px;text-align:center;font-size:11px;color:var(--text3);line-height:1.8">No journal published yet.<br><button class="ym-btn ym-btn-ghost" onclick="" style="margin-top:10px;font-size:11px">→ Publish tab</button></div>';
    wrap.querySelector('button').addEventListener('click',()=>{_tab='publish';renderPanel(container);});
    return;
  }

  // Header
  const hd=document.createElement('div');
  hd.style.cssText='background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:12px;display:flex;align-items:center;gap:10px';
  hd.innerHTML=
    '<span style="font-size:28px">'+(journal?.icon||'📖')+'</span>'+
    '<div style="flex:1"><div style="font-size:13px;font-weight:600;color:var(--text,#e4e6f4)">'+(journal?.title||'My Journal')+'</div>'+
    '<div style="font-size:10px;color:var(--text3)">'+(journal?.entries?.length||0)+' entries</div></div>'+
    '<button id="journal-view-mine" class="ym-btn ym-btn-ghost" style="font-size:11px">View</button>';
  wrap.appendChild(hd);
  hd.querySelector('#journal-view-mine').addEventListener('click',()=>openJournalPanel(myUrl));

  // Add entry form
  const formLabel=document.createElement('div');
  formLabel.style.cssText='font-size:9px;color:var(--text3);font-family:var(--font-m,monospace);text-transform:uppercase;letter-spacing:1px';
  formLabel.textContent='Add new entry';
  wrap.appendChild(formLabel);

  const moodRow=document.createElement('div');
  moodRow.style.cssText='display:flex;gap:6px;flex-wrap:wrap';
  ['😊','😔','🔥','💭','🌱','⚡','🎯','✨'].forEach(m=>{
    const btn=document.createElement('button');
    btn.style.cssText='background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:6px;font-size:18px;padding:4px 8px;cursor:pointer;transition:border-color .15s';
    btn.textContent=m;
    btn.dataset.mood=m;
    btn.addEventListener('click',()=>{
      moodRow.querySelectorAll('button').forEach(b=>b.style.borderColor='rgba(255,255,255,.08)');
      btn.style.borderColor='rgba(240,168,48,.5)';
      btn.dataset.selected='1';
    });
    moodRow.appendChild(btn);
  });
  wrap.appendChild(moodRow);

  const titleInp=document.createElement('input');
  titleInp.className='ym-input';titleInp.placeholder='Entry title…';titleInp.style.cssText='font-size:12px';
  wrap.appendChild(titleInp);

  const contentArea=document.createElement('textarea');
  contentArea.className='ym-input';contentArea.rows=5;
  contentArea.placeholder='What happened today? What are you thinking about?';
  contentArea.style.cssText='font-size:12px;resize:vertical;line-height:1.7';
  wrap.appendChild(contentArea);

  const tagsInp=document.createElement('input');
  tagsInp.className='ym-input';tagsInp.placeholder='Tags (comma separated): life, work, idea…';tagsInp.style.cssText='font-size:11px';
  wrap.appendChild(tagsInp);

  const status=document.createElement('div');
  status.style.cssText='font-size:10px;min-height:14px';
  wrap.appendChild(status);

  const saveBtn=document.createElement('button');
  saveBtn.className='ym-btn ym-btn-accent';saveBtn.style.cssText='width:100%;font-size:13px;padding:12px';
  saveBtn.textContent='💾 Add entry & update (GitHub only)';
  saveBtn.addEventListener('click',async()=>{
    const title=titleInp.value.trim();
    const content=contentArea.value.trim();
    if(!title||!content){toast('Title and content required','warn');return;}
    if(!window._journal_token){toast('Connect GitHub in Publish tab first','warn');return;}

    saveBtn.disabled=true;saveBtn.textContent='⏳…';
    status.innerHTML='<span style="color:var(--text3)">Updating…</span>';

    try{
      const mood=moodRow.querySelector('[data-selected]')?.dataset.mood||'';
      const tags=(tagsInp.value||'').split(',').map(s=>s.trim()).filter(Boolean);
      const entry={title,content,mood,tags,date:Date.now()};

      if(!journal)journal={title:'My Journal',icon:'📖',intro:'',github:window._journal_token.username,wallet:'',entries:[],updatedAt:Date.now()};
      journal.entries.push(entry);
      journal.updatedAt=Date.now();

      const code=generateJournalFile(journal);
      const token=window._journal_token;
      const filePath='src/journals/'+token.username+'.journal.js';
      await ensureFork(token.value,token.username);
      await ghPush(token.value,token.username,filePath,code,'update: journal entry - '+title);

      localStorage.setItem('journal_my_data',JSON.stringify(journal));
      status.innerHTML='<span style="color:var(--green,#22d98a)">✓ Entry added</span>';
      toast('Journal updated','success');
      titleInp.value='';contentArea.value='';tagsInp.value='';
      moodRow.querySelectorAll('button').forEach(b=>{b.style.borderColor='rgba(255,255,255,.08)';delete b.dataset.selected;});
      renderMineTab(body,container);
    }catch(e){
      status.innerHTML='<span style="color:var(--red,#ff4560)">✗ '+esc(e.message)+'</span>';
    }finally{saveBtn.disabled=false;saveBtn.textContent='💾 Add entry & update';}
  });
  wrap.appendChild(saveBtn);
}

// ── Publish tab ───────────────────────────────────────────────
function renderPublishTab(body,container){
  body.innerHTML='';
  const wrap=document.createElement('div');
  wrap.style.cssText='padding:14px;display:flex;flex-direction:column;gap:8px';
  body.appendChild(wrap);

  // GitHub step
  const ghStep=_step('GitHub',window._journal_token?'✓ @'+window._journal_token.username:null);
  wrap.appendChild(ghStep.el);
  if(window._journal_token){
    ghStep.body.innerHTML=
      '<div class="ym-notice success" style="font-size:11px;margin-bottom:6px">@<b>'+esc(window._journal_token.username)+'</b></div>'+
      '<button id="journal-disc" class="ym-btn ym-btn-ghost" style="font-size:11px;width:100%">Disconnect</button>';
    ghStep.body.querySelector('#journal-disc').addEventListener('click',()=>{window._journal_token=null;renderPublishTab(body,container);});
  }else{
    ghStep.body.innerHTML=
      '<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">'+
        '<input id="journal-tok" class="ym-input" type="password" placeholder="ghp_… (scope: repo)" style="flex:1;font-size:11px">'+
        '<button id="journal-tok-ok" class="ym-btn ym-btn-accent" style="padding:8px 14px">→</button>'+
      '</div>'+
      '<a href="https://github.com/settings/tokens/new?scopes=repo" target="_blank" rel="noopener" style="font-size:10px;color:var(--cyan,#08e0f8)">↗ Create token</a>';
    ghStep.body.querySelector('#journal-tok-ok').addEventListener('click',async()=>{
      const tok=ghStep.body.querySelector('#journal-tok').value.trim();if(!tok)return;
      try{
        const r=await fetch('https://api.github.com/user',{headers:{'Authorization':'token '+tok}});
        if(!r.ok)throw new Error('Invalid token');
        const u=await r.json();
        window._journal_token={value:tok,username:u.login};
        toast('Connected @'+u.login,'success');
        renderPublishTab(body,container);
      }catch(e){toast(e.message,'error');}
    });
    ghStep.body.querySelector('#journal-tok').addEventListener('keydown',e=>{if(e.key==='Enter')ghStep.body.querySelector('#journal-tok-ok').click();});
  }

  // Wallet step — only for first publish
  const pk=pubkey();
  const existing=localStorage.getItem('journal_my_url');
  const walletStepWrap=document.createElement('div');
  walletStepWrap.style.display=existing?'none':'block';
  const walletStep=_step('Wallet',pk?'✓ '+pk.slice(0,8)+'...':null);
  walletStepWrap.appendChild(walletStep.el);
  if(pk){
    walletStep.body.innerHTML='<div class="ym-notice success" style="font-size:10px;margin:0">🔓 '+esc(pk.slice(0,12)+'...'+pk.slice(-8))+'</div>';
  }else{
    walletStep.body.innerHTML='<div class="ym-notice warn" style="font-size:11px">Connect wallet in Wallet tab.<br><span style="font-size:10px;color:var(--text3)">Required for first publish only.</span></div>';
  }
  wrap.appendChild(walletStepWrap);

  // Journal setup
  const setupStep=_step('Journal','');
  wrap.appendChild(setupStep.el);

  const existingData=localStorage.getItem('journal_my_data');
  const journal=existingData?JSON.parse(existingData):null;

  if(existing){
    setupStep.body.innerHTML='<div style="font-size:11px;color:var(--text2);margin-bottom:8px">Journal already published. Edit in <b>My Journal</b> tab.</div>'+
      '<div style="font-size:10px;color:var(--text3);font-family:var(--font-m,monospace);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(existing.split('/').pop())+'</div>';
    return;
  }

  setupStep.body.innerHTML='';

  const iconRow=document.createElement('div');
  iconRow.style.cssText='display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap';
  ['📖','✍️','🌿','🔥','💭','🎯','⚡','🌊'].forEach(ic=>{
    const btn=document.createElement('button');
    btn.style.cssText='background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:6px;font-size:20px;padding:4px 8px;cursor:pointer;transition:border-color .15s';
    btn.textContent=ic;
    btn.addEventListener('click',()=>{
      iconRow.querySelectorAll('button').forEach(b=>b.style.borderColor='rgba(255,255,255,.08)');
      btn.style.borderColor='rgba(240,168,48,.5)';btn.dataset.selected='1';
    });
    iconRow.appendChild(btn);
  });
  iconRow.querySelector('button').click();
  setupStep.body.appendChild(iconRow);

  const titleInp=document.createElement('input');
  titleInp.className='ym-input';titleInp.placeholder='Journal title…';titleInp.style.cssText='font-size:12px;width:100%;margin-bottom:8px;display:block';
  setupStep.body.appendChild(titleInp);

  const introArea=document.createElement('textarea');
  introArea.className='ym-input';introArea.rows=3;
  introArea.placeholder='Short intro — who you are, what this journal is about…';
  introArea.style.cssText='font-size:12px;resize:vertical;width:100%;margin-bottom:8px;display:block';
  setupStep.body.appendChild(introArea);

  const status=document.createElement('div');
  status.style.cssText='font-size:10px;min-height:14px;margin-bottom:8px';
  setupStep.body.appendChild(status);

  const pubBtn=document.createElement('button');
  pubBtn.className='ym-btn ym-btn-accent';
  pubBtn.style.cssText='width:100%;font-size:13px;padding:12px';
  pubBtn.textContent='🚀 Publish journal (wallet + GitHub)';
  pubBtn.addEventListener('click',async()=>{
    if(!window._journal_token){toast('Connect GitHub first','warn');return;}
    if(!pk){toast('Connect wallet to publish','warn');return;}
    const title=titleInp.value.trim();
    if(!title){toast('Give your journal a title','warn');return;}

    pubBtn.disabled=true;pubBtn.textContent='⏳…';
    status.innerHTML='<span style="color:var(--text3)">Signing…</span>';

    try{
      const sig=await window.YM_Mine_sign?.('journal:publish:'+pk+':'+Date.now());
      if(!sig)throw new Error('Wallet signature required');

      const token=window._journal_token;
      const icon=iconRow.querySelector('[data-selected]')?.textContent||'📖';
      const journalData={
        title,icon,
        intro:introArea.value.trim(),
        github:token.username,
        wallet:pk,
        entries:[],
        updatedAt:Date.now(),
        publishedAt:Date.now(),
      };
      const code=generateJournalFile(journalData);
      const filePath='src/journals/'+token.username+'.journal.js';
      const rawUrl='https://raw.githubusercontent.com/'+token.username+'/'+GH_REPO+'/'+GH_BRANCH+'/'+filePath;

      status.innerHTML='<span style="color:var(--text3)">Publishing…</span>';
      await ensureFork(token.value,token.username);
      await ghPush(token.value,token.username,filePath,code,'feat: journal @'+token.username);

      // Update journals.json
      let list=[];
      try{const rr=await fetch(JOURNAL_JSON+'?t='+Date.now(),{cache:'no-store'});if(rr.ok)list=await rr.json();}catch{}
      list=list.filter(j=>j.github!==token.username);
      list.push({title,icon,intro:journalData.intro,github:token.username,wallet:pk,entryCount:0,codeUrl:rawUrl,updatedAt:journalData.updatedAt});
      await ghPush(token.value,token.username,'journals.json',JSON.stringify(list,null,2),'feat: journals registry @'+token.username);
      await openPR(token.value,token.username,'Journal: '+title+' (@'+token.username+')');

      localStorage.setItem('journal_my_url',rawUrl);
      localStorage.setItem('journal_my_data',JSON.stringify(journalData));
      _journals=null;
      status.innerHTML='<span style="color:var(--green,#22d98a)">✓ Published — PR submitted</span>';
      toast('Journal published!','success');
      renderPublishTab(body,container);
    }catch(e){
      status.innerHTML='<span style="color:var(--red,#ff4560)">✗ '+esc(e.message)+'</span>';
    }finally{pubBtn.disabled=false;pubBtn.textContent='🚀 Publish journal';}
  });
  setupStep.body.appendChild(pubBtn);
}

// ── Sphere object ─────────────────────────────────────────────
window.YM_S[SPHERE_ID]={
  name:'Journal',
  icon:'📖',
  category:'Social',
  description:'A living social journal. One file, evolving over time. Browse others, publish yours via GitHub + wallet.',

  activate(ctx){_ctx=ctx;},
  deactivate(){_ctx=null;_journals=null;},

  renderPanel,

  broadcastData(){
    const url=localStorage.getItem('journal_my_url');
    const data=localStorage.getItem('journal_my_data');
    const j=data?JSON.parse(data):null;
    if(!url||!j)return{};
    return{
      journal_title:j.title||'',
      journal_icon:j.icon||'📖',
      journal_entries:j.entries?.length||0,
      journal_url:url,
      journal_updated:j.updatedAt||0,
    };
  },

  profileSection(container){
    const data=localStorage.getItem('journal_my_data');
    const j=data?JSON.parse(data):null;
    if(!j){container.innerHTML='<div style="font-size:10px;color:var(--text3)">No journal published</div>';return;}
    container.innerHTML=
      '<div style="display:flex;align-items:center;gap:8px">'+
        '<span style="font-size:20px">'+(j.icon||'📖')+'</span>'+
        '<div>'+
          '<div style="font-size:13px;font-weight:600;color:var(--text,#e4e6f4)">'+(j.title||'Journal')+'</div>'+
          '<div style="font-size:10px;color:var(--text3)">'+(j.entries?.length||0)+' entries</div>'+
        '</div>'+
      '</div>';
  },

  peerSection(container,peerCtx){
    const bd=peerCtx?.profile?.broadcastData?.['journal.sphere.js'];
    if(!bd?.journal_url){container.innerHTML='<div style="font-size:10px;color:var(--text3)">No journal</div>';return;}
    const el=document.createElement('div');
    el.style.cssText='display:flex;align-items:center;gap:8px;cursor:pointer';
    el.innerHTML=
      '<span style="font-size:18px">'+(bd.journal_icon||'📖')+'</span>'+
      '<div>'+
        '<div style="font-size:12px;font-weight:600;color:var(--text,#e4e6f4)">'+(bd.journal_title||'Journal')+'</div>'+
        '<div style="font-size:10px;color:var(--text3)">'+(bd.journal_entries||0)+' entries</div>'+
      '</div>';
    el.addEventListener('click',()=>openJournalPanel(bd.journal_url));
    container.appendChild(el);
  },
};
})();
