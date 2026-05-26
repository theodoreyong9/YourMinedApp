/* career.sphere.js — CV & Job board for YourMine
   Publish CVs and job offers via GitHub + Solana wallet.
   cv.json / jobs.json in theo's repo.
   cv.js / job.js files in user's repo.
*/
(function(){
'use strict';
window.YM_S = window.YM_S || {};

const SPHERE_ID   = 'career.sphere.js';
const GH_OWNER    = 'theodoreyong9';
const GH_REPO     = 'YourMinedApp';
const GH_BRANCH   = 'main';
const RAW_BASE    = 'https://raw.githubusercontent.com/'+GH_OWNER+'/'+GH_REPO+'/'+GH_BRANCH+'/';
const CV_JSON     = RAW_BASE+'cv.json'; // at repo root
const JOBS_JSON   = RAW_BASE+'jobs.json'; // at repo root

let _ctx  = null;
let _tab  = 'cvs'; // cvs | jobs
let _cvs  = null;
let _jobs = null;

// ── Helpers ───────────────────────────────────────────────────
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function toast(m,t){_ctx&&_ctx.toast(m,t);}
function pubkey(){return window.YM_Mine_pubkey?window.YM_Mine_pubkey():null;}
function ghToken(){
  // Reuse token from build.js if available
  if(window._career_token)return window._career_token;
  return null;
}

// ── GitHub API ────────────────────────────────────────────────
async function ghAPI(token,path,method,body){
  const r=await fetch('https://api.github.com'+path,{
    method:method||'GET',
    headers:{'Authorization':'token '+token,'Content-Type':'application/json','Accept':'application/vnd.github.v3+json'},
    body:body?JSON.stringify(body):undefined
  });
  if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.message||'GitHub API '+r.status);}
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
    title:title||'Career submission from @'+username,
    body:'Automated career submission.',
    head:username+':'+GH_BRANCH,
    base:GH_BRANCH
  });
}

// ── Load registries ───────────────────────────────────────────
async function loadCVs(force){
  if(_cvs&&!force)return _cvs;
  try{const r=await fetch(CV_JSON+'?t='+Date.now(),{cache:'no-store'});_cvs=r.ok?await r.json():[];}
  catch{_cvs=[];}
  return _cvs;
}

async function loadJobs(force){
  if(_jobs&&!force)return _jobs;
  try{const r=await fetch(JOBS_JSON+'?t='+Date.now(),{cache:'no-store'});_jobs=r.ok?await r.json():[];}
  catch{_jobs=[];}
  return _jobs;
}

// ── AI ────────────────────────────────────────────────────────
async function callAI(systemPrompt,userPrompt){
  const r=await fetch('https://api.anthropic.com/v1/messages',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      model:'claude-sonnet-4-20250514',
      max_tokens:1000,
      system:systemPrompt,
      messages:[{role:'user',content:userPrompt}]
    })
  });
  const d=await r.json();
  return d.content?.map(i=>i.text||'').join('')||'';
}

// ── Generate cv.js file ───────────────────────────────────────
function generateCVFile(data){
  return `/* cv.js — CV published on YourMine
   Author: @${data.github}
   Wallet: ${data.wallet}
*/
(function(){
  var CV = ${JSON.stringify(data,null,2)};

  if(typeof window!=='undefined'){
    window.YM_CV_DATA = CV;

    // Auto-render if loaded as a panel
    document.addEventListener('DOMContentLoaded',function(){
      var target=document.getElementById('cv-render-target');
      if(target)renderCV(target);
    });
  }

  function renderCV(container){
    container.innerHTML='';
    container.style.cssText='padding:20px;display:flex;flex-direction:column;gap:14px;font-family:Inter,sans-serif;color:#e4e6f4;max-width:600px;margin:0 auto';

    // Header
    var hd=document.createElement('div');
    hd.style.cssText='display:flex;align-items:flex-start;gap:14px';
    hd.innerHTML=
      '<div style="flex:1">'+
        '<h1 style="font-size:22px;font-weight:700;color:#f0f0f8;margin-bottom:4px">'+CV.name+'</h1>'+
        '<div style="font-size:14px;color:rgba(240,240,248,.55);margin-bottom:8px">'+CV.title+'</div>'+
        (CV.location?'<div style="font-size:12px;color:rgba(240,240,248,.35)">📍 '+CV.location+'</div>':'')+
      '</div>'+
      '<div style="font-family:monospace;font-size:9px;color:rgba(240,168,48,.4);text-align:right;padding-top:4px">'+
        '@'+CV.github+'<br>'+CV.wallet.slice(0,8)+'…'+
      '</div>';
    container.appendChild(hd);

    // Separator
    var sep=document.createElement('div');
    sep.style.cssText='height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.08),transparent)';
    container.appendChild(sep);

    // Summary
    if(CV.summary){
      var sum=document.createElement('div');
      sum.style.cssText='font-size:13px;color:rgba(240,240,248,.6);line-height:1.7';
      sum.textContent=CV.summary;
      container.appendChild(sum);
    }

    // Skills
    if(CV.skills&&CV.skills.length){
      var skillsWrap=document.createElement('div');
      skillsWrap.innerHTML='<div style="font-size:9px;color:rgba(240,168,48,.55);font-family:monospace;letter-spacing:.2em;text-transform:uppercase;margin-bottom:8px">Skills</div>';
      var tags=document.createElement('div');
      tags.style.cssText='display:flex;flex-wrap:wrap;gap:6px';
      CV.skills.forEach(function(s){
        var tag=document.createElement('span');
        tag.style.cssText='font-size:11px;padding:3px 10px;border-radius:4px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);color:rgba(240,240,248,.65)';
        tag.textContent=s;
        tags.appendChild(tag);
      });
      skillsWrap.appendChild(tags);
      container.appendChild(skillsWrap);
    }

    // Experience
    if(CV.experience&&CV.experience.length){
      var expWrap=document.createElement('div');
      expWrap.innerHTML='<div style="font-size:9px;color:rgba(240,168,48,.55);font-family:monospace;letter-spacing:.2em;text-transform:uppercase;margin-bottom:10px">Experience</div>';
      CV.experience.forEach(function(e){
        var item=document.createElement('div');
        item.style.cssText='margin-bottom:12px;padding-left:12px;border-left:2px solid rgba(255,255,255,.06)';
        item.innerHTML=
          '<div style="font-size:13px;font-weight:600;color:#f0f0f8">'+e.role+'</div>'+
          '<div style="font-size:11px;color:rgba(240,240,248,.4);margin-bottom:4px">'+e.company+(e.period?' · '+e.period:'')+'</div>'+
          (e.description?'<div style="font-size:12px;color:rgba(240,240,248,.5);line-height:1.6">'+e.description+'</div>':'');
        expWrap.appendChild(item);
      });
      container.appendChild(expWrap);
    }

    // Education
    if(CV.education&&CV.education.length){
      var eduWrap=document.createElement('div');
      eduWrap.innerHTML='<div style="font-size:9px;color:rgba(240,168,48,.55);font-family:monospace;letter-spacing:.2em;text-transform:uppercase;margin-bottom:10px">Education</div>';
      CV.education.forEach(function(e){
        var item=document.createElement('div');
        item.style.cssText='margin-bottom:8px';
        item.innerHTML=
          '<div style="font-size:13px;color:#f0f0f8">'+e.degree+'</div>'+
          '<div style="font-size:11px;color:rgba(240,240,248,.4)">'+e.school+(e.year?' · '+e.year:'')+'</div>';
        eduWrap.appendChild(item);
      });
      container.appendChild(eduWrap);
    }

    // Contact
    if(CV.email||CV.linkedin||CV.github_url){
      var contact=document.createElement('div');
      contact.style.cssText='display:flex;gap:12px;flex-wrap:wrap;padding-top:8px;border-top:1px solid rgba(255,255,255,.05)';
      if(CV.email)contact.innerHTML+='<a href="mailto:'+CV.email+'" style="font-size:11px;color:rgba(240,168,48,.6);text-decoration:none">✉ '+CV.email+'</a>';
      if(CV.linkedin)contact.innerHTML+='<a href="'+CV.linkedin+'" target="_blank" style="font-size:11px;color:rgba(34,211,238,.6);text-decoration:none">in '+CV.linkedin.split('/').pop()+'</a>';
      container.appendChild(contact);
    }
  }

  window.YM_renderCV=renderCV;
})();
`;
}

// ── Generate job.js file ──────────────────────────────────────
function generateJobFile(data){
  return `/* job.js — Job offer published on YourMine
   Author: @${data.github}
   Wallet: ${data.wallet}
*/
(function(){
  var JOB = ${JSON.stringify(data,null,2)};
  if(typeof window!=='undefined') window.YM_JOB_DATA = JOB;

  function renderJob(container){
    container.innerHTML='';
    container.style.cssText='padding:20px;display:flex;flex-direction:column;gap:14px;font-family:Inter,sans-serif;color:#e4e6f4;max-width:600px;margin:0 auto';

    var hd=document.createElement('div');
    hd.innerHTML=
      '<h1 style="font-size:22px;font-weight:700;color:#f0f0f8;margin-bottom:4px">'+JOB.title+'</h1>'+
      '<div style="font-size:14px;color:rgba(240,240,248,.55);margin-bottom:6px">'+JOB.company+(JOB.location?' · 📍'+JOB.location:'')+'</div>'+
      (JOB.type?'<span style="font-size:11px;padding:3px 10px;border-radius:4px;background:rgba(34,211,238,.08);border:1px solid rgba(34,211,238,.18);color:rgba(34,211,238,.7)">'+JOB.type+'</span>':'')+
      (JOB.salary?' <span style="font-size:11px;padding:3px 10px;border-radius:4px;background:rgba(240,168,48,.08);border:1px solid rgba(240,168,48,.18);color:rgba(240,168,48,.7)">'+JOB.salary+'</span>':'');
    container.appendChild(hd);

    var sep=document.createElement('div');
    sep.style.cssText='height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.08),transparent)';
    container.appendChild(sep);

    if(JOB.description){
      var desc=document.createElement('div');
      desc.innerHTML='<div style="font-size:9px;color:rgba(240,168,48,.55);font-family:monospace;letter-spacing:.2em;text-transform:uppercase;margin-bottom:8px">Description</div>'+
        '<div style="font-size:13px;color:rgba(240,240,248,.65);line-height:1.8;white-space:pre-wrap">'+JOB.description+'</div>';
      container.appendChild(desc);
    }

    if(JOB.requirements){
      var req=document.createElement('div');
      req.innerHTML='<div style="font-size:9px;color:rgba(240,168,48,.55);font-family:monospace;letter-spacing:.2em;text-transform:uppercase;margin-bottom:8px">Requirements</div>'+
        '<div style="font-size:13px;color:rgba(240,240,248,.65);line-height:1.8;white-space:pre-wrap">'+JOB.requirements+'</div>';
      container.appendChild(req);
    }

    if(JOB.weights){
      var wWrap=document.createElement('div');
      wWrap.innerHTML='<div style="font-size:9px;color:rgba(240,168,48,.55);font-family:monospace;letter-spacing:.2em;text-transform:uppercase;margin-bottom:8px">Scoring priorities</div>';
      var grid=document.createElement('div');
      grid.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:6px';
      Object.entries(JOB.weights).forEach(function(kv){
        if(!kv[1])return;
        var item=document.createElement('div');
        item.style.cssText='display:flex;justify-content:space-between;padding:6px 10px;background:rgba(255,255,255,.03);border-radius:6px;font-size:11px;font-family:monospace';
        item.innerHTML='<span style="color:rgba(240,240,248,.5);text-transform:capitalize">'+kv[0]+'</span><span style="color:rgba(34,211,238,.7)">'+kv[1]+'%</span>';
        grid.appendChild(item);
      });
      wWrap.appendChild(grid);
      container.appendChild(wWrap);
    }

    var footer=document.createElement('div');
    footer.style.cssText='font-family:monospace;font-size:9px;color:rgba(240,168,48,.3);padding-top:8px;border-top:1px solid rgba(255,255,255,.05)';
    footer.textContent='Published by @'+JOB.github+' · YourMine Career';
    container.appendChild(footer);
  }

  window.YM_renderJob=renderJob;
})();
`;
}

// ── Token input UI ────────────────────────────────────────────
function renderTokenStep(wrap,onDone){
  if(ghToken()){onDone(ghToken());return;}
  const card=document.createElement('div');
  card.style.cssText='background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:10px';
  card.innerHTML=
    '<div style="font-size:12px;color:var(--text2)">GitHub token required to publish</div>'+
    '<input id="career-gh-token" class="ym-input" type="password" placeholder="ghp_…" style="font-size:12px;font-family:var(--font-m,monospace)">'+
    '<div style="font-size:10px;color:var(--text3)">Needs <code>repo</code> scope. <a href="https://github.com/settings/tokens/new?scopes=repo" target="_blank" style="color:rgba(240,168,48,.6)">Generate one</a></div>';
  const btn=document.createElement('button');
  btn.className='ym-btn ym-btn-accent';btn.textContent='Continue';btn.style.cssText='font-size:12px';
  btn.addEventListener('click',async()=>{
    const val=card.querySelector('#career-gh-token').value.trim();
    if(!val){toast('Enter token','warn');return;}
    btn.disabled=true;btn.textContent='Verifying…';
    try{
      const user=await ghAPI(val,'/user');
      window._career_token={value:val,username:user.login};
      card.remove();
      onDone(window._career_token);
    }catch(e){
      btn.disabled=false;btn.textContent='Continue';
      toast('Invalid token: '+e.message,'error');
    }
  });
  card.appendChild(btn);
  wrap.appendChild(card);
}

// ── Open file as panel ────────────────────────────────────────
async function openFilePanel(url,type){
  // Fetch the js file, execute it, render in a modal panel
  const overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;z-index:600;background:rgba(0,0,0,.75);backdrop-filter:blur(12px);display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding:16px;overflow-y:auto';

  const panel=document.createElement('div');
  panel.style.cssText='width:100%;max-width:640px;background:#0a0a0f;border:1px solid rgba(255,255,255,.08);border-radius:16px;overflow:hidden;margin-top:8px';

  // Close button — always visible at top
  const closeBar=document.createElement('div');
  closeBar.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.06);background:#0a0a0f;position:sticky;top:0;z-index:2';
  closeBar.innerHTML='<div style="font-size:10px;font-family:monospace;color:rgba(255,255,255,.3)">'+esc(url.split('/').pop())+'</div>';
  const closeBtn=document.createElement('button');
  closeBtn.style.cssText='background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.5);font-size:13px;width:32px;height:32px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center';
  closeBtn.textContent='✕';
  closeBtn.addEventListener('click',()=>overlay.remove());
  closeBar.appendChild(closeBtn);
  panel.appendChild(closeBar);

  const renderTarget=document.createElement('div');
  renderTarget.id='cv-render-target';
  renderTarget.style.cssText='min-height:200px';
  panel.appendChild(renderTarget);
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
    setTimeout(()=>{
      if(type==='cv'&&window.YM_renderCV)window.YM_renderCV(renderTarget);
      else if(type==='job'&&window.YM_renderJob)window.YM_renderJob(renderTarget);
    },100);
  }catch(e){
    renderTarget.innerHTML='<div style="padding:24px;color:rgba(255,69,96,.7);font-size:12px">Failed to load: '+esc(e.message)+'</div>';
  }
}

// ── Panel ─────────────────────────────────────────────────────
function renderPanel(container){
  container.innerHTML='';
  container.style.cssText='flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0';

  // Tabs
  const tabs=document.createElement('div');
  tabs.style.cssText='display:flex;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0;background:rgba(0,0,0,.2)';
  [{id:'cvs',label:'📄 CVs'},{id:'jobs',label:'💼 Jobs'},{id:'publish',label:'+ Publish'}].forEach(t=>{
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

  if(_tab==='cvs') renderCVsTab(body,container);
  else if(_tab==='jobs') renderJobsTab(body,container);
  else renderPublishTab(body,container);
}

// ── CVs tab ───────────────────────────────────────────────────
async function renderCVsTab(body,container){
  body.innerHTML='<div style="padding:16px;font-size:11px;color:var(--text3);font-family:var(--font-m,monospace)">Loading CVs…</div>';
  const cvs=await loadCVs();
  body.innerHTML='';

  const wrap=document.createElement('div');
  wrap.style.cssText='padding:12px;display:flex;flex-direction:column;gap:10px';
  body.appendChild(wrap);

  // Search
  const searchRow=document.createElement('div');
  searchRow.style.cssText='display:flex;gap:8px';
  searchRow.innerHTML=
    '<input id="cv-search" class="ym-input" placeholder="Search by name, skill, title…" style="flex:1;font-size:12px">'+
    '<button id="cv-search-ai" class="ym-btn ym-btn-ghost" style="font-size:11px;flex-shrink:0">✦ AI</button>';
  wrap.appendChild(searchRow);

  const results=document.createElement('div');
  results.style.cssText='display:flex;flex-direction:column;gap:8px';
  wrap.appendChild(results);

  function renderCVList(list){
    results.innerHTML='';
    if(!list.length){
      results.innerHTML='<div style="padding:24px;text-align:center;font-size:11px;color:var(--text3)">No CVs found.</div>';
      return;
    }
    list.forEach(cv=>{
      const card=document.createElement('div');
      card.style.cssText='background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:12px;display:flex;align-items:center;gap:10px;cursor:pointer;transition:border-color .15s';
      card.innerHTML=
        '<span style="font-size:22px;flex-shrink:0">📄</span>'+
        '<div style="flex:1;min-width:0">'+
          '<div style="font-size:13px;font-weight:600;color:var(--text,#e4e6f4)">'+esc(cv.name||'Anonymous')+'</div>'+
          '<div style="font-size:10px;color:var(--text3);margin-top:1px">'+esc(cv.title||'')+'</div>'+
          (cv.skills?.length?'<div style="font-size:9px;color:rgba(240,168,48,.5);margin-top:3px;font-family:var(--font-m,monospace)">'+cv.skills.slice(0,4).join(' · ')+'</div>':'')+
        '</div>'+
        '<div style="font-size:9px;color:var(--text3);font-family:var(--font-m,monospace);text-align:right;flex-shrink:0">@'+esc(cv.github)+'</div>';
      card.addEventListener('click',()=>openFilePanel(cv.codeUrl,'cv'));
      card.addEventListener('mouseenter',()=>card.style.borderColor='rgba(240,168,48,.3)');
      card.addEventListener('mouseleave',()=>card.style.borderColor='rgba(255,255,255,.06)');
      results.appendChild(card);
    });
  }

  renderCVList(cvs);

  // Keyword search
  wrap.querySelector('#cv-search').addEventListener('input',e=>{
    const q=e.target.value.toLowerCase();
    if(!q){renderCVList(cvs);return;}
    renderCVList(cvs.filter(cv=>{
      return (cv.name+' '+cv.title+' '+(cv.skills||[]).join(' ')).toLowerCase().includes(q);
    }));
  });

  // AI search
  wrap.querySelector('#cv-search-ai').addEventListener('click',async()=>{
    const q=wrap.querySelector('#cv-search').value.trim();
    if(!q){toast('Enter a search query first','warn');return;}
    const btn=wrap.querySelector('#cv-search-ai');
    btn.disabled=true;btn.textContent='⏳…';

    try{
      const cvsText=cvs.map((cv,i)=>`${i}. ${cv.name} | ${cv.title} | skills: ${(cv.skills||[]).join(',')} | summary: ${cv.summary||''}`).join('\n');
      const response=await callAI(
        'You are an expert recruiter. Rank candidates by relevance to a query. Return ONLY a JSON array of indices in order of relevance, e.g. [2,0,1]. No other text.',
        'Query: "'+q+'"\n\nCandidates:\n'+cvsText
      );
      const clean=response.replace(/```json|```/g,'').trim();
      const indices=JSON.parse(clean);
      const ranked=indices.map(i=>cvs[i]).filter(Boolean);
      renderCVList(ranked.length?ranked:cvs);
      toast('Ranked by AI relevance','success');
    }catch(e){
      toast('AI search failed: '+e.message,'error');
    }finally{
      btn.disabled=false;btn.textContent='✦ AI';
    }
  });
}

// ── Jobs tab ──────────────────────────────────────────────────
async function renderJobsTab(body,container){
  body.innerHTML='<div style="padding:16px;font-size:11px;color:var(--text3);font-family:var(--font-m,monospace)">Loading jobs…</div>';
  const jobs=await loadJobs();
  body.innerHTML='';

  const wrap=document.createElement('div');
  wrap.style.cssText='padding:12px;display:flex;flex-direction:column;gap:10px';
  body.appendChild(wrap);

  // Search
  const searchRow=document.createElement('div');
  searchRow.style.cssText='display:flex;gap:8px';
  searchRow.innerHTML=
    '<input id="job-search" class="ym-input" placeholder="Search jobs…" style="flex:1;font-size:12px">'+
    '<button id="job-search-ai" class="ym-btn ym-btn-ghost" style="font-size:11px;flex-shrink:0">✦ AI</button>';
  wrap.appendChild(searchRow);

  const results=document.createElement('div');
  results.style.cssText='display:flex;flex-direction:column;gap:8px';
  wrap.appendChild(results);

  function renderJobList(list){
    results.innerHTML='';
    if(!list.length){
      results.innerHTML='<div style="padding:24px;text-align:center;font-size:11px;color:var(--text3)">No jobs found.</div>';
      return;
    }
    list.forEach(job=>{
      const card=document.createElement('div');
      card.style.cssText='background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:12px;cursor:pointer;transition:border-color .15s';
      card.innerHTML=
        '<div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:8px">'+
          '<span style="font-size:22px;flex-shrink:0">💼</span>'+
          '<div style="flex:1;min-width:0">'+
            '<div style="font-size:13px;font-weight:600;color:var(--text,#e4e6f4)">'+esc(job.title)+'</div>'+
            '<div style="font-size:10px;color:var(--text3);margin-top:1px">'+esc(job.company||'')+(job.location?' · '+job.location:'')+'</div>'+
          '</div>'+
          (job.salary?'<div style="font-size:10px;color:rgba(240,168,48,.6);font-family:var(--font-m,monospace);flex-shrink:0">'+esc(job.salary)+'</div>':'')+
        '</div>'+
        '<div style="font-size:11px;color:var(--text2);line-height:1.5">'+esc((job.description||'').slice(0,100))+(job.description?.length>100?'…':'')+'</div>'+
        '<div style="display:flex;gap:6px;margin-top:10px">'+
          '<button class="open-job ym-btn ym-btn-ghost" style="flex:1;font-size:11px">View offer</button>'+
          '<button class="adapt-cv ym-btn ym-btn-ghost" style="font-size:11px;color:rgba(240,168,48,.7)">✨ Adapt my CV</button>'+
          '<button class="best-cvs ym-btn ym-btn-ghost" style="font-size:11px;color:rgba(34,211,238,.7)">✦ Best CVs</button>'+
        '</div>';

      card.querySelector('.open-job').addEventListener('click',e=>{
        e.stopPropagation();openFilePanel(job.codeUrl,'job');
      });

      card.querySelector('.adapt-cv').addEventListener('click',async e=>{
        e.stopPropagation();
        const btn=e.target;btn.disabled=true;btn.textContent='⏳…';
        await renderAdaptCV(job,container);
        btn.disabled=false;btn.textContent='✨ Adapt my CV';
      });

      card.querySelector('.best-cvs').addEventListener('click',async e=>{
        e.stopPropagation();
        const btn=e.target;btn.disabled=true;btn.textContent='⏳…';
        await renderBestCVs(job,body,wrap);
        btn.disabled=false;btn.textContent='✦ Best CVs';
      });

      card.addEventListener('mouseenter',()=>card.style.borderColor='rgba(34,211,238,.25)');
      card.addEventListener('mouseleave',()=>card.style.borderColor='rgba(255,255,255,.06)');
      results.appendChild(card);
    });
  }

  renderJobList(jobs);

  wrap.querySelector('#job-search').addEventListener('input',e=>{
    const q=e.target.value.toLowerCase();
    if(!q){renderJobList(jobs);return;}
    renderJobList(jobs.filter(j=>(j.title+' '+j.company+' '+j.description).toLowerCase().includes(q)));
  });

  wrap.querySelector('#job-search-ai').addEventListener('click',async()=>{
    const q=wrap.querySelector('#job-search').value.trim();
    if(!q){toast('Enter a query first','warn');return;}
    const btn=wrap.querySelector('#job-search-ai');
    btn.disabled=true;btn.textContent='⏳…';
    try{
      const jobsText=jobs.map((j,i)=>`${i}. ${j.title} | ${j.company} | ${(j.description||'').slice(0,100)}`).join('\n');
      const response=await callAI(
        'Rank job offers by relevance to a query. Return ONLY a JSON array of indices in order of relevance. No other text.',
        'Query: "'+q+'"\n\nJobs:\n'+jobsText
      );
      const indices=JSON.parse(response.replace(/```json|```/g,'').trim());
      const ranked=indices.map(i=>jobs[i]).filter(Boolean);
      renderJobList(ranked.length?ranked:jobs);
      toast('Ranked by AI','success');
    }catch(e){toast('AI search failed','error');}
    finally{btn.disabled=false;btn.textContent='✦ AI';}
  });
}

// ── Adapt CV with AI ──────────────────────────────────────────
async function renderAdaptCV(job,container){
  // Get stored CV data
  const myCVUrl=localStorage.getItem('career_my_cv_url');
  if(!myCVUrl){toast('Publish your CV first in the Publish tab','warn');return;}

  const overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;z-index:600;background:rgba(0,0,0,.8);backdrop-filter:blur(12px);display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding:16px;overflow-y:auto';

  const panel=document.createElement('div');
  panel.style.cssText='width:100%;max-width:640px;background:#0a0a0f;border:1px solid rgba(255,255,255,.08);border-radius:16px;overflow:hidden;margin-top:8px';

  const closeBar=document.createElement('div');
  closeBar.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.06);background:#0a0a0f;position:sticky;top:0;z-index:2';
  closeBar.innerHTML='<div style="font-size:13px;font-weight:600;color:#f0f0f8">✨ Adapt CV for: '+esc(job.title)+'</div>';
  const closeBtn=document.createElement('button');
  closeBtn.style.cssText='background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.5);font-size:13px;width:32px;height:32px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center';
  closeBtn.textContent='✕';closeBtn.addEventListener('click',()=>overlay.remove());
  closeBar.appendChild(closeBtn);
  panel.appendChild(closeBar);

  const body2=document.createElement('div');
  body2.style.cssText='padding:16px;display:flex;flex-direction:column;gap:12px';
  panel.appendChild(body2);
  overlay.appendChild(panel);
  overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove();});
  document.body.appendChild(overlay);

  body2.innerHTML='<div style="font-size:11px;color:var(--text3);font-family:var(--font-m,monospace)">Loading your CV…</div>';

  try{
    // Load CV
    const cvResp=await fetch(myCVUrl+'?t='+Date.now(),{cache:'no-store'});
    const cvCode=await cvResp.text();
    // Extract data (eval the file to get YM_CV_DATA)
    const tmpScript=document.createElement('script');
    tmpScript.textContent=cvCode;document.head.appendChild(tmpScript);
    const cvData=window.YM_CV_DATA;

    body2.innerHTML='';

    // Prompt input
    const promptLabel=document.createElement('div');
    promptLabel.style.cssText='font-size:11px;color:var(--text2);line-height:1.5';
    promptLabel.innerHTML='Tell the AI what to focus on when adapting your CV for <strong style="color:rgba(240,168,48,.8)">'+esc(job.title)+' at '+esc(job.company||'this company')+'</strong>';
    body2.appendChild(promptLabel);

    const promptArea=document.createElement('textarea');
    promptArea.className='ym-input';
    promptArea.rows=3;
    promptArea.placeholder='e.g. Highlight my React experience and remote work skills. Downplay my gap year.';
    promptArea.style.cssText='font-size:12px;line-height:1.6;resize:vertical';
    body2.appendChild(promptArea);

    const result=document.createElement('div');
    body2.appendChild(result);

    const btn=document.createElement('button');
    btn.className='ym-btn ym-btn-accent';
    btn.style.cssText='width:100%;font-size:13px;padding:12px';
    btn.textContent='✨ Generate adapted CV suggestions';
    btn.addEventListener('click',async()=>{
      btn.disabled=true;btn.textContent='⏳ Analysing…';
      result.innerHTML='';
      try{
        const suggestions=await callAI(
          'You are an expert CV coach. Given a CV and a job offer, provide specific, actionable suggestions to adapt the CV for this offer. Be concrete and precise.',
          `JOB OFFER:
Title: ${job.title}
Company: ${job.company||''}
Description: ${job.description||''}
Requirements: ${job.requirements||''}

CURRENT CV:
Name: ${cvData?.name||''}
Title: ${cvData?.title||''}
Summary: ${cvData?.summary||''}
Skills: ${(cvData?.skills||[]).join(', ')}
Experience: ${JSON.stringify(cvData?.experience||[])}

USER INSTRUCTIONS: ${promptArea.value||'Adapt the CV to best match this offer.'}

Provide:
1. A rewritten summary tailored to this offer
2. Skills to highlight (reorder/add)
3. How to reframe each experience entry
4. What to remove or downplay
Be specific and actionable.`
        );

        const sugDiv=document.createElement('div');
        sugDiv.style.cssText='background:rgba(240,168,48,.04);border:1px solid rgba(240,168,48,.15);border-radius:10px;padding:14px';
        sugDiv.innerHTML=
          '<div style="font-size:9px;color:rgba(240,168,48,.6);font-family:var(--font-m,monospace);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">✨ AI Suggestions</div>'+
          '<div style="font-size:12px;color:var(--text2);line-height:1.8;white-space:pre-wrap">'+esc(suggestions)+'</div>';
        result.appendChild(sugDiv);

        // Update CV button (no wallet needed)
        const updateBtn=document.createElement('button');
        updateBtn.className='ym-btn ym-btn-ghost';
        updateBtn.style.cssText='width:100%;font-size:12px;margin-top:8px';
        updateBtn.textContent='💾 Update my published CV (GitHub only)';
        updateBtn.addEventListener('click',async()=>{
          await renderUpdateCV(cvData,suggestions,overlay);
        });
        result.appendChild(updateBtn);

      }catch(e){
        result.innerHTML='<div style="color:var(--red,#ff4560);font-size:11px;padding:8px">'+esc(e.message)+'</div>';
      }finally{
        btn.disabled=false;btn.textContent='✨ Generate adapted CV suggestions';
      }
    });
    body2.appendChild(btn);

  }catch(e){
    body2.innerHTML='<div style="color:var(--red,#ff4560);font-size:12px;padding:8px">'+esc(e.message)+'</div>';
  }
}

// ── Update CV (no wallet) ─────────────────────────────────────
async function renderUpdateCV(cvData,suggestions,parentOverlay){
  renderTokenStep(parentOverlay,async(token)=>{
    try{
      const updated={...cvData,aiSuggestions:suggestions,updatedAt:Date.now()};
      const code=generateCVFile(updated);
      await ensureFork(token.value,token.username);
      await ghPush(token.value,token.username,'src/cv/'+token.username+'.cv.js',code,'update: CV updated with AI suggestions');
      toast('CV updated on GitHub','success');
    }catch(e){toast('Update failed: '+e.message,'error');}
  });
}

// ── Best CVs for a job ────────────────────────────────────────
async function renderBestCVs(job,body,wrap){
  const cvs=await loadCVs();
  if(!cvs.length){toast('No CVs in registry yet','info');return;}

  // Scroll to top of results
  const existingRanked=wrap.querySelector('#ranked-cvs');
  if(existingRanked)existingRanked.remove();

  const rankedSection=document.createElement('div');
  rankedSection.id='ranked-cvs';
  rankedSection.style.cssText='display:flex;flex-direction:column;gap:8px;margin-top:8px';
  rankedSection.innerHTML='<div style="font-size:9px;color:rgba(34,211,238,.6);font-family:var(--font-m,monospace);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">✦ Best CVs for: '+esc(job.title)+'</div>'+
    '<div style="font-size:11px;color:var(--text3)">Ranking '+cvs.length+' candidates with AI…</div>';
  wrap.appendChild(rankedSection);
  body.scrollTop=body.scrollHeight;

  try{
    const cvsText=cvs.map((cv,i)=>`${i}. Name: ${cv.name} | Title: ${cv.title} | Skills: ${(cv.skills||[]).join(',')} | Summary: ${cv.summary||''}`).join('\n');
    const response=await callAI(
      'You are an expert recruiter. Rank candidates by relevance to a job offer. Return ONLY valid JSON: {"ranking":[{"index":0,"score":85,"reason":"..."},...]}. No other text.',
      `JOB: ${job.title} at ${job.company||''}\nDescription: ${(job.description||'').slice(0,300)}\nRequirements: ${(job.requirements||'').slice(0,200)}\n\nCANDIDATES:\n${cvsText}`
    );

    const clean=response.replace(/```json|```/g,'').trim();
    const data=JSON.parse(clean);
    rankedSection.innerHTML='<div style="font-size:9px;color:rgba(34,211,238,.6);font-family:var(--font-m,monospace);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">✦ Best CVs for: '+esc(job.title)+'</div>';

    data.ranking.slice(0,10).forEach((item,rank)=>{
      const cv=cvs[item.index];
      if(!cv)return;
      const scoreCol=item.score>=70?'var(--green,#22d98a)':item.score>=40?'var(--gold,#f0a830)':'rgba(255,69,96,.7)';
      const card=document.createElement('div');
      card.style.cssText='background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:8px;padding:10px 12px;display:flex;align-items:center;gap:10px;cursor:pointer;transition:border-color .15s';
      card.innerHTML=
        '<div style="font-family:var(--font-m,monospace);font-size:11px;color:var(--text3);flex-shrink:0;width:16px">'+(rank+1)+'</div>'+
        '<div style="flex:1;min-width:0">'+
          '<div style="font-size:12px;font-weight:600;color:var(--text,#e4e6f4)">'+esc(cv.name||'Anonymous')+'</div>'+
          '<div style="font-size:10px;color:var(--text3)">'+esc(cv.title||'')+'</div>'+
          '<div style="font-size:10px;color:var(--text2);margin-top:3px;line-height:1.4">'+esc(item.reason||'')+'</div>'+
        '</div>'+
        '<div style="font-family:var(--font-m,monospace);font-size:16px;font-weight:700;color:'+scoreCol+';flex-shrink:0">'+item.score+'%</div>';
      card.addEventListener('click',()=>openFilePanel(cv.codeUrl,'cv'));
      card.addEventListener('mouseenter',()=>card.style.borderColor='rgba(34,211,238,.25)');
      card.addEventListener('mouseleave',()=>card.style.borderColor='rgba(255,255,255,.06)');
      rankedSection.appendChild(card);
    });

  }catch(e){
    rankedSection.innerHTML+='<div style="color:var(--red,#ff4560);font-size:11px;padding:8px">'+esc(e.message)+'</div>';
  }
}

// ── Step card helper ────────────────────────────────────────
function _careerStep(label,status){
  const el=document.createElement('div');
  el.style.cssText='border:1px solid rgba(255,255,255,.07);border-radius:10px;overflow:hidden';
  el.innerHTML=
    '<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:rgba(255,255,255,.02);border-bottom:1px solid rgba(255,255,255,.06)">'+
      '<div class="career-step-label" style="font-family:var(--font-d,inherit);font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--text2);flex:1">'+label+'</div>'+
      (status?'<div style="font-size:10px;color:var(--green,#22d98a);font-family:var(--font-m,monospace)">'+esc(status)+'</div>':'')+
    '</div>'+
    '<div class="career-step-body" style="padding:12px 14px"></div>';
  return{el,body:el.querySelector('.career-step-body')};
}

// ── Publish tab ─────────────────────────────────────────────
function renderPublishTab(body,container){
  body.innerHTML='';
  const wrap=document.createElement('div');
  wrap.style.cssText='padding:14px;display:flex;flex-direction:column;gap:10px';
  body.appendChild(wrap);

  // Type selector: CV or Job
  let _pubType='cv';
  const typeRow=document.createElement('div');
  typeRow.style.cssText='display:flex;gap:4px;border:1px solid rgba(255,255,255,.1);border-radius:8px;overflow:hidden;flex-shrink:0;align-self:flex-start';
  const btnCV=document.createElement('button');
  btnCV.style.cssText='background:rgba(240,168,48,.1);border:none;color:var(--gold,#f0a830);font-size:10px;padding:5px 14px;cursor:pointer';
  btnCV.textContent='📄 CV';
  const btnJob=document.createElement('button');
  btnJob.style.cssText='background:none;border:none;color:var(--text3);font-size:10px;padding:5px 14px;cursor:pointer';
  btnJob.textContent='💼 Job';
  typeRow.appendChild(btnCV);typeRow.appendChild(btnJob);
  wrap.appendChild(typeRow);

  // Step: GitHub token
  const ghStep=_careerStep('GitHub',window._career_token?'✓ @'+window._career_token.username:null);
  wrap.appendChild(ghStep.el);
  if(window._career_token){
    ghStep.body.innerHTML=
      '<div class="ym-notice success" style="font-size:11px;margin-bottom:6px">@<b>'+esc(window._career_token.username)+'</b></div>'+
      '<button id="career-disc" class="ym-btn ym-btn-ghost" style="font-size:11px;width:100%">Disconnect</button>';
    ghStep.body.querySelector('#career-disc').addEventListener('click',()=>{
      window._career_token=null;renderPublishTab(body,container);
    });
  }else{
    ghStep.body.innerHTML=
      '<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">'+
        '<input id="career-tok" class="ym-input" type="password" placeholder="ghp_… (scope: repo)" style="flex:1;font-size:11px">'+
        '<button id="career-tok-ok" class="ym-btn ym-btn-accent" style="padding:8px 14px">→</button>'+
      '</div>'+
      '<a href="https://github.com/settings/tokens/new?scopes=repo" target="_blank" rel="noopener" style="font-size:10px;color:var(--cyan,#08e0f8)">↗ Create token</a>';
    ghStep.body.querySelector('#career-tok-ok').addEventListener('click',async()=>{
      const tok=ghStep.body.querySelector('#career-tok').value.trim();if(!tok)return;
      try{
        const r=await fetch('https://api.github.com/user',{headers:{'Authorization':'token '+tok}});
        if(!r.ok)throw new Error('Invalid token');
        const u=await r.json();
        window._career_token={value:tok,username:u.login};
        toast('Connected @'+u.login,'success');
        renderPublishTab(body,container);
      }catch(e){toast(e.message,'error');}
    });
    ghStep.body.querySelector('#career-tok').addEventListener('keydown',e=>{if(e.key==='Enter')ghStep.body.querySelector('#career-tok-ok').click();});
  }

  // Step: Wallet (only for new publish, not update)
  const pk=pubkey();
  const walletStep=_careerStep('Wallet',pk?'✓ '+pk.slice(0,8)+'…':null);
  wrap.appendChild(walletStep.el);
  if(pk){
    walletStep.body.innerHTML='<div class="ym-notice success" style="font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0">🔓 '+esc(pk.slice(0,12)+'…'+pk.slice(-8))+'</div>';
    walletStep.el.querySelector('.career-step-label').innerHTML+=' <span style="font-size:9px;color:var(--text3)">(required for new publish)</span>';
  }else{
    walletStep.body.innerHTML=
      '<div class="ym-notice warn" style="font-size:11px">Connect your Solana wallet in the Wallet tab to publish.<br><span style="color:var(--text3)">Not needed for updates.</span></div>';
  }

  // Form container
  const formWrap=document.createElement('div');
  formWrap.style.cssText='display:flex;flex-direction:column;gap:10px';
  wrap.appendChild(formWrap);

  function switchType(t){
    _pubType=t;
    btnCV.style.cssText=t==='cv'?'background:rgba(240,168,48,.1);border:none;color:var(--gold,#f0a830);font-size:10px;padding:5px 14px;cursor:pointer':'background:none;border:none;color:var(--text3);font-size:10px;padding:5px 14px;cursor:pointer';
    btnJob.style.cssText=t==='job'?'background:rgba(8,224,248,.1);border:none;color:var(--cyan,#08e0f8);font-size:10px;padding:5px 14px;cursor:pointer':'background:none;border:none;color:var(--text3);font-size:10px;padding:5px 14px;cursor:pointer';
    formWrap.innerHTML='';
    if(t==='cv')_renderCVForm(formWrap);
    else _renderJobForm(formWrap);
  }

  btnCV.addEventListener('click',()=>switchType('cv'));
  btnJob.addEventListener('click',()=>switchType('job'));
  switchType('cv');

  function _renderCVForm(container){
    // Check if already published (update mode)
    const myCV=localStorage.getItem('career_my_cv_url');
    if(myCV){
      const updateBanner=document.createElement('div');
      updateBanner.style.cssText='background:rgba(34,217,138,.04);border:1px solid rgba(34,217,138,.15);border-radius:8px;padding:10px 12px;font-size:11px;color:var(--text2);display:flex;align-items:center;gap:8px';
      updateBanner.innerHTML=
        '<span style="font-size:16px">📄</span>'+
        '<div style="flex:1">CV already published. Update does not require wallet.<br><span style="font-size:10px;color:var(--text3)">'+esc(myCV.split('/').pop())+'</span></div>';
      container.appendChild(updateBanner);
    }

    const fields=[
      {id:'cv-pub-name',placeholder:'Full name *'},
      {id:'cv-pub-title',placeholder:'Job title *'},
      {id:'cv-pub-location',placeholder:'Location (optional)'},
      {id:'cv-pub-email',placeholder:'Email (optional)'},
    ];
    fields.forEach(f=>{
      const inp=document.createElement('input');
      inp.id=f.id;inp.className='ym-input';inp.placeholder=f.placeholder;inp.style.cssText='font-size:12px';
      container.appendChild(inp);
    });

    [{id:'cv-pub-summary',rows:3,placeholder:'Short professional summary…'},
     {id:'cv-pub-exp',rows:5,placeholder:'Experience (one per line): Senior Dev @ Acme · 2021-2024 · Led team of 5…'}
    ].forEach(f=>{
      const ta=document.createElement('textarea');
      ta.id=f.id;ta.className='ym-input';ta.rows=f.rows;ta.placeholder=f.placeholder;
      ta.style.cssText='font-size:11px;font-family:var(--font-m,monospace);resize:vertical;line-height:1.6';
      container.appendChild(ta);
    });

    const skillsInp=document.createElement('input');
    skillsInp.id='cv-pub-skills';skillsInp.className='ym-input';
    skillsInp.placeholder='Skills: React, Python, Design…';skillsInp.style.cssText='font-size:12px';
    container.appendChild(skillsInp);

    const status=document.createElement('div');status.style.cssText='font-size:10px;min-height:14px';
    container.appendChild(status);

    const btn=document.createElement('button');
    btn.className='ym-btn ym-btn-accent';btn.style.cssText='width:100%;font-size:13px;padding:12px';
    btn.textContent=myCV?'💾 Update CV (GitHub only)':'🚀 Publish CV (wallet + GitHub)';
    btn.addEventListener('click',async()=>{
      if(!window._career_token){toast('Connect GitHub first','warn');return;}
      const name=document.getElementById('cv-pub-name')?.value.trim();
      const title=document.getElementById('cv-pub-title')?.value.trim();
      if(!name||!title){toast('Name and title required','warn');return;}
      if(!myCV&&!pk){toast('Connect wallet to publish for the first time','warn');return;}

      btn.disabled=true;btn.textContent='⏳…';
      status.innerHTML='<span style="color:var(--text3)">Publishing…</span>';

      try{
        if(!myCV){
          // First publish — wallet signature required
          const sig=await window.YM_Mine_sign?.('career:publish:cv:'+pk+':'+Date.now());
          if(!sig)throw new Error('Wallet signature required');
        }

        const token=window._career_token;
        const username=token.username;
        const expLines=(document.getElementById('cv-pub-exp')?.value||'').split('\n').filter(Boolean);
        const experience=expLines.map(l=>{const p=l.split('@');return{role:(p[0]||'').trim(),company:(p[1]||'').split('·')[0].trim(),description:(p[1]||'').split('·').slice(2).join('·').trim()};});
        const cvData={name,title,
          location:document.getElementById('cv-pub-location')?.value.trim()||'',
          email:document.getElementById('cv-pub-email')?.value.trim()||'',
          summary:document.getElementById('cv-pub-summary')?.value.trim()||'',
          skills:(document.getElementById('cv-pub-skills')?.value||'').split(',').map(s=>s.trim()).filter(Boolean),
          experience,github:username,wallet:pk||'',publishedAt:Date.now()
        };
        const code=generateCVFile(cvData);
        const filePath='src/cv/'+username+'.cv.js';
        const rawUrl='https://raw.githubusercontent.com/'+username+'/'+GH_REPO+'/'+GH_BRANCH+'/'+filePath;

        await ensureFork(token.value,username);
        await ghPush(token.value,username,filePath,code,(myCV?'update':'feat')+': CV @'+username);

        if(!myCV){
          // New publish — update cv.json and open PR
          let cvList=[];
          try{const rr=await fetch(CV_JSON+'?t='+Date.now(),{cache:'no-store'});if(rr.ok)cvList=await rr.json();}catch{}
          cvList=cvList.filter(c=>c.github!==username);
          cvList.push({name,title,github:username,wallet:pk,skills:cvData.skills,summary:cvData.summary,codeUrl:rawUrl,publishedAt:cvData.publishedAt});
          await ghPush(token.value,username,'cv.json',JSON.stringify(cvList,null,2),'feat: CV registry - @'+username);
          await openPR(token.value,username,'CV: '+name+' (@'+username+')');
          localStorage.setItem('career_my_cv_url',rawUrl);
          status.innerHTML='<span style="color:var(--green,#22d98a)">✓ CV published — PR submitted</span>';
        }else{
          status.innerHTML='<span style="color:var(--green,#22d98a)">✓ CV updated on GitHub</span>';
        }
        toast(myCV?'CV updated':'CV published!','success');
        _cvs=null;
      }catch(e){
        status.innerHTML='<span style="color:var(--red,#ff4560)">✗ '+esc(e.message)+'</span>';
      }finally{btn.disabled=false;btn.textContent=myCV?'💾 Update CV':'🚀 Publish CV';}
    });
    container.appendChild(btn);
  }

  function _renderJobForm(container){
    const fields=[
      {id:'job-pub-title',placeholder:'Job title *'},
      {id:'job-pub-company',placeholder:'Company *'},
      {id:'job-pub-location',placeholder:'Location'},
      {id:'job-pub-salary',placeholder:'Salary (optional)'},
      {id:'job-pub-type',placeholder:'CDI / Freelance / CDD…'},
    ];
    fields.forEach(f=>{
      const inp=document.createElement('input');
      inp.id=f.id;inp.className='ym-input';inp.placeholder=f.placeholder;inp.style.cssText='font-size:12px';
      container.appendChild(inp);
    });

    [{id:'job-pub-desc',rows:4,placeholder:'Job description…'},{id:'job-pub-req',rows:3,placeholder:'Requirements…'}].forEach(f=>{
      const ta=document.createElement('textarea');ta.id=f.id;ta.className='ym-input';ta.rows=f.rows;ta.placeholder=f.placeholder;
      ta.style.cssText='font-size:12px;resize:vertical';container.appendChild(ta);
    });

    // Weights
    const wLabel=document.createElement('div');
    wLabel.style.cssText='font-size:9px;color:var(--text3);font-family:var(--font-m,monospace);text-transform:uppercase;letter-spacing:1px';
    wLabel.textContent='Scoring weights';container.appendChild(wLabel);
    const wGrid=document.createElement('div');wGrid.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:6px';
    const dw={skills:40,experience:30,education:15,culture:15};
    Object.entries(dw).forEach(([k,v])=>{
      const cell=document.createElement('div');
      cell.style.cssText='display:flex;align-items:center;gap:6px;background:rgba(255,255,255,.03);border-radius:6px;padding:6px 10px;border:1px solid rgba(255,255,255,.06)';
      cell.innerHTML='<div style="flex:1;font-size:11px;color:var(--text2);text-transform:capitalize">'+k+'</div>'+
        '<input type="number" id="jw-'+k+'" min="0" max="100" value="'+v+'" style="width:44px;background:transparent;border:none;color:var(--gold,#f0a830);font-family:var(--font-m,monospace);font-size:12px;text-align:right;outline:none">'+
        '<span style="font-size:10px;color:var(--text3)">%</span>';
      wGrid.appendChild(cell);
    });
    container.appendChild(wGrid);

    const status=document.createElement('div');status.style.cssText='font-size:10px;min-height:14px';container.appendChild(status);

    const btn=document.createElement('button');
    btn.className='ym-btn ym-btn-accent';
    btn.style.cssText='width:100%;font-size:13px;padding:12px;background:var(--cyan,#08e0f8);color:#06060e';
    btn.textContent='🚀 Publish job (wallet + GitHub)';
    btn.addEventListener('click',async()=>{
      if(!window._career_token){toast('Connect GitHub first','warn');return;}
      if(!pk){toast('Connect wallet to publish','warn');return;}
      const title=document.getElementById('job-pub-title')?.value.trim();
      const company=document.getElementById('job-pub-company')?.value.trim();
      const desc=document.getElementById('job-pub-desc')?.value.trim();
      if(!title||!desc){toast('Title and description required','warn');return;}
      btn.disabled=true;btn.textContent='⏳…';
      status.innerHTML='<span style="color:var(--text3)">Signing…</span>';
      try{
        const sig=await window.YM_Mine_sign?.('career:publish:job:'+pk+':'+Date.now());
        if(!sig)throw new Error('Wallet signature required');
        const token=window._career_token;const username=token.username;
        const w={};Object.keys(dw).forEach(k=>{const el=document.getElementById('jw-'+k);if(el)w[k]=parseInt(el.value)||0;});
        const jobData={title,company,
          location:document.getElementById('job-pub-location')?.value.trim()||'',
          salary:document.getElementById('job-pub-salary')?.value.trim()||'',
          type:document.getElementById('job-pub-type')?.value.trim()||'',
          description:desc,requirements:document.getElementById('job-pub-req')?.value.trim()||'',
          weights:w,github:username,wallet:pk,publishedAt:Date.now()
        };
        const slug=title.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,40);
        const filePath='src/jobs/'+username+'-'+slug+'.job.js';
        const rawUrl='https://raw.githubusercontent.com/'+username+'/'+GH_REPO+'/'+GH_BRANCH+'/'+filePath;
        const code=generateJobFile(jobData);
        await ensureFork(token.value,username);
        await ghPush(token.value,username,filePath,code,'feat: job offer - '+title);
        let jobList=[];
        try{const rr=await fetch(JOBS_JSON+'?t='+Date.now(),{cache:'no-store'});if(rr.ok)jobList=await rr.json();}catch{}
        jobList.push({title,company,location:jobData.location,salary:jobData.salary,description:desc.slice(0,200),github:username,wallet:pk,weights:w,codeUrl:rawUrl,publishedAt:jobData.publishedAt});
        await ghPush(token.value,username,'jobs.json',JSON.stringify(jobList,null,2),'feat: jobs registry - '+title);
        await openPR(token.value,username,'Job: '+title+' @ '+company);
        status.innerHTML='<span style="color:var(--green,#22d98a)">✓ Job published — PR submitted</span>';
        toast('Job published!','success');_jobs=null;
      }catch(e){
        status.innerHTML='<span style="color:var(--red,#ff4560)">✗ '+esc(e.message)+'</span>';
      }finally{btn.disabled=false;btn.textContent='🚀 Publish job';}
    });
    container.appendChild(btn);
  }
}

// ── Sphere object ─────────────────────────────────────────────
window.YM_S[SPHERE_ID]={
  name:'Career',
  icon:'🎯',
  category:'Career',
  description:'Publish your CV or job offers via GitHub + wallet. Browse candidates ranked by AI. Adapt your CV to any offer.',

  activate(ctx){_ctx=ctx;},
  deactivate(){_ctx=null;_cvs=null;_jobs=null;},
  renderPanel,

  broadcastData(){
    const myCV=localStorage.getItem('career_my_cv_url');
    return myCV?{has_cv:true,cv_url:myCV}:{};
  },

  profileSection(container){
    const myCV=localStorage.getItem('career_my_cv_url');
    container.innerHTML=myCV
      ?'<div style="display:flex;align-items:center;gap:6px"><span>🎯</span><span style="font-size:11px;color:var(--text2)">CV published</span></div>'
      :'<div style="font-size:10px;color:var(--text3)">No CV published</div>';
  },
};
})();
