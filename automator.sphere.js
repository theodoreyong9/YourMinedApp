/* jshint esversion:11, browser:true */
// automator.sphere.js — YM Automation Builder
// Prompt → workflow Pipedream généré par Claude → exécution → outputs
(function(){
'use strict';
window.YM_S=window.YM_S||{};

const CFG_KEY  ='ym_automator_cfg_v1';
const AUTO_KEY ='ym_automator_list_v1';

function loadCfg(){try{return JSON.parse(localStorage.getItem(CFG_KEY)||'{}');}catch(e){return{};}}
function saveCfg(d){localStorage.setItem(CFG_KEY,JSON.stringify(d));}
function loadAutomations(){try{return JSON.parse(localStorage.getItem(AUTO_KEY)||'[]');}catch(e){return[];}}
function saveAutomations(d){localStorage.setItem(AUTO_KEY,JSON.stringify(d));}
function gid(){return 'a'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

// ── WORKER API ─────────────────────────────────────────────────────────────────
async function workerFetch(endpoint, payload){
  const cfg = loadCfg();
  if(!cfg.workerUrl) throw new Error('Worker URL not configured');
  const r = await fetch(cfg.workerUrl.replace(/\/$/,'')+endpoint, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(payload),
  });
  const data = await r.json();
  if(!r.ok) throw new Error(data.error || 'Request failed '+r.status);
  return data;
}

async function workerGet(endpoint){
  const cfg = loadCfg();
  if(!cfg.workerUrl) throw new Error('Worker URL not configured');
  const r = await fetch(cfg.workerUrl.replace(/\/$/,'')+endpoint);
  const data = await r.json();
  if(!r.ok) throw new Error(data.error || 'Request failed '+r.status);
  return data;
}

// ── CLAUDE — génère le workflow ───────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an expert at building Pipedream workflows.
Given a user's automation description, generate a complete Pipedream workflow as JSON.

Output ONLY valid JSON in this exact format:
{
  "name": "Workflow name",
  "description": "What this workflow does",
  "trigger": {
    "type": "http",
    "http": { "response_timeout_ms": 30000 }
  },
  "steps": [
    {
      "namespace": "step_name",
      "lang": "nodejs20.x",
      "code": "// Complete Node.js code for this step\\nimport axios from 'axios';\\nexport default defineComponent({\\n  async run({ steps, $ }) {\\n    // step code here\\n    return { result: 'done' };\\n  }\\n});",
      "description": "What this step does",
      "requiredSecrets": ["API_KEY_NAME"]
    }
  ],
  "requiredSecrets": ["API_KEY_1", "API_KEY_2"]
}

Rules:
- Use Pipedream's defineComponent() pattern for each step
- Reference secrets as process.env.SECRET_NAME
- Each step returns data accessible in next steps via steps.step_name.$return_value
- For HTTP requests use axios or node-fetch
- Be specific and production-ready
- requiredSecrets lists the env vars the user needs to configure`;

async function generateWorkflow(prompt, anthropicKey){
  const data = await workerFetch('/anthropic', {
    anthropicKey,
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = (data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('');
  // Extrait le JSON
  const match = text.match(/\{[\s\S]*\}/);
  if(!match) throw new Error('Claude did not return valid JSON');
  try{ return JSON.parse(match[0]); }
  catch(e){ throw new Error('Invalid JSON from Claude: '+e.message); }
}

// ── PANEL ─────────────────────────────────────────────────────────────────────
let _tab = 'automations';

function renderPanel(container){
  container.style.cssText='display:flex;flex-direction:column;height:100%;overflow:hidden;background:#0d0d1a;font-family:-apple-system,BlinkMacSystemFont,sans-serif';
  container.innerHTML='';

  const cfg = loadCfg();
  if(!cfg.workerUrl){renderSetup(container);return;}

  // ── Header avec prompt bar ──────────────────────────────────────────────────
  const header = document.createElement('div');
  header.style.cssText='flex-shrink:0;padding:12px 14px;background:#0d0d1a;border-bottom:1px solid rgba(255,255,255,.06)';

  const promptRow = document.createElement('div');
  promptRow.style.cssText='display:flex;gap:8px;align-items:flex-start';

  const ta = document.createElement('textarea');
  ta.style.cssText='flex:1;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:10px 12px;color:#fff;font-size:13px;resize:none;outline:none;line-height:1.5;min-height:44px;max-height:120px;transition:border-color .2s;font-family:inherit';
  ta.placeholder='Describe your automation… (e.g. "When I receive an email with attachment, extract text and send summary to Slack")';
  ta.addEventListener('focus',()=>ta.style.borderColor='rgba(99,102,241,.6)');
  ta.addEventListener('blur',()=>ta.style.borderColor='rgba(255,255,255,.1)');
  ta.addEventListener('input',()=>{ta.style.height='auto';ta.style.height=Math.min(ta.scrollHeight,120)+'px';});

  const genBtn = document.createElement('button');
  genBtn.style.cssText='background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;color:#fff;font-weight:700;font-size:13px;padding:10px 16px;border-radius:12px;cursor:pointer;white-space:nowrap;flex-shrink:0;transition:opacity .15s;align-self:flex-end';
  genBtn.innerHTML='⚡ Generate';
  genBtn.addEventListener('click',()=>handleGenerate(ta.value.trim(), container, ta, genBtn));

  ta.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();genBtn.click();}});

  promptRow.appendChild(ta);promptRow.appendChild(genBtn);
  header.appendChild(promptRow);
  container.appendChild(header);

  // ── Tabs ───────────────────────────────────────────────────────────────────
  const tabs = document.createElement('div');
  tabs.style.cssText='flex-shrink:0;display:flex;border-bottom:1px solid rgba(255,255,255,.06)';
  [['automations','⚡ Automations'],['outputs','📊 Outputs']].forEach(([id,label])=>{
    const t = document.createElement('button');
    const active = _tab===id;
    t.style.cssText=`flex:1;background:transparent;border:none;border-bottom:2px solid ${active?'#6366f1':'transparent'};color:${active?'#a5b4fc':'rgba(255,255,255,.4)'};font-size:13px;padding:10px;cursor:pointer;font-weight:${active?600:400};transition:all .15s`;
    t.textContent=label;
    t.addEventListener('click',()=>{_tab=id;renderPanel(container);});
    tabs.appendChild(t);
  });
  container.appendChild(tabs);

  // ── Body ───────────────────────────────────────────────────────────────────
  const body = document.createElement('div');
  body.style.cssText='flex:1;overflow-y:auto;padding:14px';
  container.appendChild(body);

  if(_tab==='automations') renderAutomationsTab(body, container);
  else renderOutputsTab(body);
}

// ── SETUP ─────────────────────────────────────────────────────────────────────
function renderSetup(container){
  container.style.cssText='display:flex;flex-direction:column;height:100%;background:#0d0d1a;justify-content:center;align-items:center;padding:32px;font-family:-apple-system,sans-serif';

  const logo = document.createElement('div');
  logo.style.cssText='text-align:center;margin-bottom:32px';
  logo.innerHTML=`
    <div style="width:68px;height:68px;border-radius:20px;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;font-size:32px;margin:0 auto 14px">⚡</div>
    <div style="font-size:24px;font-weight:800;color:#fff;letter-spacing:-.5px;margin-bottom:6px">Automator</div>
    <div style="font-size:13px;color:rgba(255,255,255,.4);line-height:1.5">AI-powered automation builder<br>Pipedream · Claude · Your APIs</div>`;
  container.appendChild(logo);

  const card = document.createElement('div');
  card.style.cssText='background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:20px;padding:24px;width:100%;max-width:340px';

  const lbl = document.createElement('div');
  lbl.style.cssText='font-size:11px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px';
  lbl.textContent='Worker URL';
  card.appendChild(lbl);

  const inp = document.createElement('input');
  inp.type='text';inp.placeholder='https://pipedream-proxy.xxx.workers.dev';
  const cfg=loadCfg();inp.value=cfg.workerUrl||'';
  inp.style.cssText='width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:14px;color:#fff;font-size:14px;outline:none;box-sizing:border-box;margin-bottom:12px;transition:border-color .2s';
  inp.addEventListener('focus',()=>inp.style.borderColor='rgba(99,102,241,.6)');
  inp.addEventListener('blur',()=>inp.style.borderColor='rgba(255,255,255,.1)');
  card.appendChild(inp);

  const status = document.createElement('div');status.style.cssText='margin-bottom:12px;min-height:20px';card.appendChild(status);

  const connectBtn = document.createElement('button');
  connectBtn.style.cssText='width:100%;background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;color:#fff;font-weight:700;font-size:15px;padding:14px;border-radius:12px;cursor:pointer;transition:opacity .15s';
  connectBtn.textContent='Connect Worker →';
  connectBtn.addEventListener('click',async()=>{
    const url=inp.value.trim();
    if(!url){inp.style.borderColor='rgba(239,68,68,.6)';return;}
    connectBtn.textContent='Testing…';connectBtn.disabled=true;connectBtn.style.opacity='.6';
    saveCfg({...loadCfg(),workerUrl:url});
    try{
      await workerGet('/workflow/list');
      window.YM_toast?.('Connected ✓','success');
      renderPanel(container);
    }catch(e){
      status.innerHTML=`<div style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.4);border-radius:8px;padding:10px;font-size:12px;color:#f87171">${esc(e.message)}</div>`;
      connectBtn.textContent='Connect Worker →';connectBtn.disabled=false;connectBtn.style.opacity='1';
    }
  });
  card.appendChild(connectBtn);
  container.appendChild(card);

  const hint=document.createElement('div');
  hint.style.cssText='margin-top:16px;font-size:11px;color:rgba(255,255,255,.25);text-align:center';
  hint.textContent='Deploy pipedream-worker.js on Cloudflare Workers first';
  container.appendChild(hint);
}

// ── GENERATE WORKFLOW ─────────────────────────────────────────────────────────
async function handleGenerate(prompt, container, ta, genBtn){
  if(!prompt){ta.style.borderColor='rgba(239,68,68,.5)';setTimeout(()=>ta.style.borderColor='rgba(255,255,255,.1)',1000);return;}
  const cfg=loadCfg();
  if(!cfg.anthropicKey){
    // Demande la clé Anthropic
    showKeyPrompt(container,'anthropicKey','Anthropic API Key','sk-ant-…','Your key is sent directly to Anthropic, never stored on our servers.',key=>{
      saveCfg({...loadCfg(),anthropicKey:key});
      handleGenerate(prompt,container,ta,genBtn);
    });
    return;
  }

  genBtn.textContent='⏳ Generating…';genBtn.disabled=true;ta.disabled=true;

  // Notification de progression
  const prog=document.createElement('div');
  prog.style.cssText='position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#6366f1;color:#fff;padding:10px 18px;border-radius:12px;font-size:13px;z-index:999;white-space:nowrap';
  prog.textContent='⚡ Claude is building your automation…';
  document.body.appendChild(prog);

  try{
    // 1. Génère le workflow avec Claude
    const workflow = await generateWorkflow(prompt, cfg.anthropicKey);

    // 2. Crée le workflow sur Pipedream
    prog.textContent='🚀 Deploying to Pipedream…';
    const result = await workerFetch('/workflow/create', workflow);
    const workflowId = result?.data?.id || result?.id;
    const workflowUrl = result?.data?.url || `https://pipedream.com/workflows/${workflowId}`;

    // 3. Sauvegarde localement
    const automation = {
      id: gid(),
      workflowId,
      workflowUrl,
      name: workflow.name,
      description: workflow.description,
      prompt,
      steps: workflow.steps,
      requiredSecrets: workflow.requiredSecrets||[],
      secretsConfigured: {},
      outputs: [],
      createdAt: Date.now(),
      status: 'active',
    };
    const list=loadAutomations();
    list.unshift(automation);
    saveAutomations(list);

    prog.remove();genBtn.textContent='⚡ Generate';genBtn.disabled=false;ta.disabled=false;ta.value='';
    ta.style.height='44px';
    window.YM_toast?.('Automation created! ✓','success');
    _tab='automations';renderPanel(container);

  }catch(e){
    prog.remove();genBtn.textContent='⚡ Generate';genBtn.disabled=false;ta.disabled=false;
    window.YM_toast?.(e.message,'error');
  }
}

// ── AUTOMATIONS TAB ───────────────────────────────────────────────────────────
function renderAutomationsTab(container, panelRoot){
  container.innerHTML='';
  const automations=loadAutomations();

  if(!automations.length){
    container.innerHTML=`
      <div style="text-align:center;padding:40px 20px;color:rgba(255,255,255,.3)">
        <div style="font-size:40px;margin-bottom:12px">⚡</div>
        <div style="font-size:14px;font-weight:600;color:rgba(255,255,255,.5);margin-bottom:6px">No automations yet</div>
        <div style="font-size:12px">Describe your automation above and press Generate</div>
      </div>`;
    return;
  }

  automations.forEach(auto=>{
    const card=document.createElement('div');
    card.style.cssText='background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:16px;margin-bottom:12px;transition:border-color .15s';
    card.addEventListener('mouseenter',()=>card.style.borderColor='rgba(99,102,241,.3)');
    card.addEventListener('mouseleave',()=>card.style.borderColor='rgba(255,255,255,.08)');

    // Header
    card.innerHTML=`
      <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px">
        <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">⚡</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:600;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(auto.name)}</div>
          <div style="font-size:11px;color:rgba(255,255,255,.4);margin-top:2px">${esc(auto.description||'')}</div>
        </div>
        <div style="flex-shrink:0;display:flex;gap:6px">
          <span style="font-size:10px;padding:3px 8px;border-radius:999px;background:rgba(34,197,94,.15);color:#4ade80">${esc(auto.status||'active')}</span>
        </div>
      </div>`;

    // Steps
    if(auto.steps?.length){
      const stepsEl=document.createElement('div');
      stepsEl.style.cssText='display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px';
      auto.steps.forEach(s=>{
        const chip=document.createElement('div');
        chip.style.cssText='font-size:10px;background:rgba(255,255,255,.06);border-radius:6px;padding:3px 8px;color:rgba(255,255,255,.5)';
        chip.textContent=s.namespace||s.name||'step';
        stepsEl.appendChild(chip);
      });
      card.appendChild(stepsEl);
    }

    // Required secrets
    if(auto.requiredSecrets?.length){
      const secretsEl=document.createElement('div');
      secretsEl.style.cssText='margin-bottom:10px;padding:10px;background:rgba(251,191,36,.06);border:1px solid rgba(251,191,36,.15);border-radius:10px';
      secretsEl.innerHTML=`<div style="font-size:10px;color:rgba(251,191,36,.8);margin-bottom:6px;font-weight:600;text-transform:uppercase;letter-spacing:.8px">🔑 API Keys Required</div>`;
      auto.requiredSecrets.forEach(secretName=>{
        const configured=auto.secretsConfigured?.[secretName];
        const row=document.createElement('div');
        row.style.cssText='display:flex;align-items:center;gap:8px;margin-bottom:4px';
        row.innerHTML=`
          <span style="font-size:11px;color:rgba(255,255,255,.6);font-family:monospace;flex:1">${esc(secretName)}</span>
          <span style="font-size:10px;color:${configured?'#4ade80':'rgba(251,191,36,.7)'}">${configured?'✓ Set':'Not set'}</span>
          <button data-secret="${esc(secretName)}" data-auto="${auto.id}" style="background:rgba(99,102,241,.2);border:1px solid rgba(99,102,241,.3);color:#a5b4fc;font-size:10px;padding:3px 8px;border-radius:6px;cursor:pointer">${configured?'Update':'Set'}</button>`;
        secretsEl.appendChild(row);
      });
      card.appendChild(secretsEl);

      card.querySelectorAll('[data-secret]').forEach(btn=>{
        btn.addEventListener('click',()=>{
          const secretName=btn.dataset.secret;
          const autoId=btn.dataset.auto;
          showKeyPrompt(panelRoot, secretName, secretName, 'API key…', `This key will be stored securely in your Worker KV and used by "${auto.name}"`,
          async key=>{
            try{
              await workerFetch('/secret/set',{key:secretName,value:key});
              // Met à jour localement
              const list=loadAutomations();
              const a=list.find(x=>x.id===autoId);
              if(a){a.secretsConfigured=a.secretsConfigured||{};a.secretsConfigured[secretName]=true;saveAutomations(list);}
              window.YM_toast?.(secretName+' saved ✓','success');
              renderPanel(panelRoot);
            }catch(e){window.YM_toast?.(e.message,'error');}
          });
        });
      });
    }

    // Actions
    const actionsEl=document.createElement('div');
    actionsEl.style.cssText='display:flex;gap:6px;flex-wrap:wrap;margin-top:6px';

    // Trigger
    const triggerBtn=document.createElement('button');
    triggerBtn.style.cssText='background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;color:#fff;font-size:11px;font-weight:600;padding:7px 14px;border-radius:8px;cursor:pointer';
    triggerBtn.textContent='▶ Run';
    triggerBtn.addEventListener('click',async()=>{
      triggerBtn.textContent='Running…';triggerBtn.disabled=true;
      try{
        const r=await workerFetch('/workflow/trigger',{workflowId:auto.workflowId,payload:{source:'YourMine',automationId:auto.id}});
        // Sauvegarde l'output
        const list=loadAutomations();const a=list.find(x=>x.id===auto.id);
        if(a){a.outputs=a.outputs||[];a.outputs.unshift({ts:Date.now(),status:r.status,response:r.response});saveAutomations(list);}
        window.YM_toast?.('Workflow triggered ✓','success');
        triggerBtn.textContent='▶ Run';triggerBtn.disabled=false;
      }catch(e){window.YM_toast?.(e.message,'error');triggerBtn.textContent='▶ Run';triggerBtn.disabled=false;}
    });
    actionsEl.appendChild(triggerBtn);

    // Refresh logs
    const logsBtn=document.createElement('button');
    logsBtn.style.cssText='background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.6);font-size:11px;padding:7px 12px;border-radius:8px;cursor:pointer';
    logsBtn.textContent='🔄 Logs';
    logsBtn.addEventListener('click',async()=>{
      logsBtn.textContent='Loading…';logsBtn.disabled=true;
      try{
        const r=await workerFetch('/workflow/runs',{workflowId:auto.workflowId});
        const runs=r?.data||[];
        const list=loadAutomations();const a=list.find(x=>x.id===auto.id);
        if(a){a.runs=runs;saveAutomations(list);}
        renderPanel(panelRoot);
      }catch(e){window.YM_toast?.(e.message,'error');}
      logsBtn.textContent='🔄 Logs';logsBtn.disabled=false;
    });
    actionsEl.appendChild(logsBtn);

    // Pipedream link
    if(auto.workflowUrl){
      const pdLink=document.createElement('a');
      pdLink.href=auto.workflowUrl;pdLink.target='_blank';
      pdLink.style.cssText='background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.5);font-size:11px;padding:7px 12px;border-radius:8px;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:4px';
      pdLink.innerHTML='<span>↗</span><span>Pipedream</span>';
      actionsEl.appendChild(pdLink);
    }

    // Re-prompt (modifier le workflow)
    const reproBtn=document.createElement('button');
    reproBtn.style.cssText='background:rgba(139,92,246,.1);border:1px solid rgba(139,92,246,.2);color:#a78bfa;font-size:11px;padding:7px 12px;border-radius:8px;cursor:pointer';
    reproBtn.textContent='✏ Re-prompt';
    reproBtn.addEventListener('click',()=>showReprompt(auto, panelRoot));
    actionsEl.appendChild(reproBtn);

    // Delete
    const delBtn=document.createElement('button');
    delBtn.style.cssText='background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);color:rgba(239,68,68,.7);font-size:11px;padding:7px 12px;border-radius:8px;cursor:pointer;margin-left:auto';
    delBtn.textContent='🗑';
    delBtn.addEventListener('click',async()=>{
      if(!confirm('Delete "'+auto.name+'"?'))return;
      try{
        await workerFetch('/workflow/delete',{workflowId:auto.workflowId});
      }catch(e){}
      saveAutomations(loadAutomations().filter(a=>a.id!==auto.id));
      renderPanel(panelRoot);
    });
    actionsEl.appendChild(delBtn);

    card.appendChild(actionsEl);

    // Recent runs (si chargés)
    if(auto.runs?.length){
      const runsEl=document.createElement('div');
      runsEl.style.cssText='margin-top:10px;border-top:1px solid rgba(255,255,255,.05);padding-top:8px';
      runsEl.innerHTML='<div style="font-size:10px;color:rgba(255,255,255,.3);margin-bottom:6px;text-transform:uppercase;letter-spacing:.8px">Recent Runs</div>';
      auto.runs.slice(0,3).forEach(run=>{
        const ok=run.status==='completed';
        const runRow=document.createElement('div');
        runRow.style.cssText='display:flex;align-items:center;gap:6px;margin-bottom:4px';
        runRow.innerHTML=`
          <span style="width:6px;height:6px;border-radius:50%;background:${ok?'#4ade80':'#f87171'};flex-shrink:0"></span>
          <span style="font-size:11px;color:rgba(255,255,255,.5);flex:1">${new Date(run.created_at||run.ts||0).toLocaleString([], {dateStyle:'short',timeStyle:'short'})}</span>
          <span style="font-size:10px;color:${ok?'#4ade80':'#f87171'}">${esc(run.status||'')}</span>`;
        runsEl.appendChild(runRow);
      });
      card.appendChild(runsEl);
    }

    container.appendChild(card);
  });

  // Bouton settings (clé Anthropic + worker)
  const settingsBtn=document.createElement('button');
  settingsBtn.style.cssText='width:100%;background:transparent;border:1px solid rgba(255,255,255,.08);color:rgba(255,255,255,.3);font-size:12px;padding:10px;border-radius:12px;cursor:pointer;margin-top:4px';
  settingsBtn.textContent='⚙ Configuration';
  settingsBtn.addEventListener('click',()=>showSettings(panelRoot));
  container.appendChild(settingsBtn);
}

// ── OUTPUTS TAB ───────────────────────────────────────────────────────────────
function renderOutputsTab(container){
  container.innerHTML='';
  const automations=loadAutomations();
  const allOutputs=[];
  automations.forEach(auto=>{
    (auto.outputs||[]).forEach(o=>{allOutputs.push({...o,autoName:auto.name,autoId:auto.id});});
    (auto.runs||[]).forEach(r=>{allOutputs.push({ts:new Date(r.created_at||0).getTime(),status:r.status,autoName:auto.name,response:JSON.stringify(r),isRun:true});});
  });
  allOutputs.sort((a,b)=>b.ts-a.ts);

  if(!allOutputs.length){
    container.innerHTML=`
      <div style="text-align:center;padding:40px 20px;color:rgba(255,255,255,.3)">
        <div style="font-size:40px;margin-bottom:12px">📊</div>
        <div style="font-size:14px;font-weight:600;color:rgba(255,255,255,.5);margin-bottom:6px">No outputs yet</div>
        <div style="font-size:12px">Run an automation to see results here</div>
      </div>`;
    return;
  }

  allOutputs.forEach(o=>{
    const ok=o.status===200||o.status==='completed';
    const card=document.createElement('div');
    card.style.cssText='background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:12px;margin-bottom:8px';

    // Header
    const hdr=document.createElement('div');
    hdr.style.cssText='display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:pointer';
    hdr.innerHTML=`
      <span style="width:8px;height:8px;border-radius:50%;background:${ok?'#4ade80':'#f87171'};flex-shrink:0"></span>
      <span style="font-size:13px;font-weight:600;color:#fff;flex:1">${esc(o.autoName)}</span>
      <span style="font-size:10px;color:rgba(255,255,255,.3)">${new Date(o.ts).toLocaleString([],{dateStyle:'short',timeStyle:'short'})}</span>
      <span style="font-size:12px;color:rgba(255,255,255,.3)">▾</span>`;

    // Body (collapsible)
    const body=document.createElement('div');
    body.style.cssText='display:none';
    if(o.response){
      // Format JSON si possible
      let formatted=o.response;
      try{formatted=JSON.stringify(JSON.parse(o.response),null,2);}catch(e){}
      body.innerHTML=`<pre style="background:rgba(0,0,0,.4);border-radius:8px;padding:10px;font-size:10px;color:#a5b4fc;overflow-x:auto;white-space:pre-wrap;word-break:break-all">${esc(formatted)}</pre>`;
    }

    hdr.addEventListener('click',()=>{
      const open=body.style.display!=='none';
      body.style.display=open?'none':'block';
      hdr.querySelector('span:last-child').textContent=open?'▾':'▴';
    });
    card.appendChild(hdr);card.appendChild(body);
    container.appendChild(card);
  });
}

// ── RE-PROMPT ─────────────────────────────────────────────────────────────────
function showReprompt(auto, panelRoot){
  const overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;z-index:9990;background:rgba(0,0,0,.8);display:flex;align-items:flex-end;justify-content:center';
  const box=document.createElement('div');
  box.style.cssText='background:#1a1a2e;border-radius:20px 20px 0 0;padding:20px;width:100%;max-width:500px;max-height:70vh;display:flex;flex-direction:column;gap:10px';
  box.innerHTML=`
    <div style="font-size:15px;font-weight:700;color:#fff;margin-bottom:4px">✏ Modify automation</div>
    <div style="font-size:12px;color:rgba(255,255,255,.4);margin-bottom:4px">Original: "${esc(auto.prompt)}"</div>`;
  const ta=document.createElement('textarea');
  ta.style.cssText='background:rgba(255,255,255,.06);border:1px solid rgba(99,102,241,.3);border-radius:12px;padding:12px;color:#fff;font-size:13px;resize:none;outline:none;min-height:80px;font-family:inherit;line-height:1.5';
  ta.placeholder='Describe what you want to change…';box.appendChild(ta);
  const row=document.createElement('div');row.style.cssText='display:flex;gap:8px';
  const cancelBtn=document.createElement('button');cancelBtn.style.cssText='flex:1;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.6);padding:12px;border-radius:12px;cursor:pointer;font-size:13px';cancelBtn.textContent='Cancel';
  const updateBtn=document.createElement('button');updateBtn.style.cssText='flex:1;background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;color:#fff;padding:12px;border-radius:12px;cursor:pointer;font-size:13px;font-weight:700';updateBtn.textContent='⚡ Update';
  row.appendChild(cancelBtn);row.appendChild(updateBtn);box.appendChild(row);
  overlay.appendChild(box);document.body.appendChild(overlay);
  overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove();});
  cancelBtn.addEventListener('click',()=>overlay.remove());
  updateBtn.addEventListener('click',async()=>{
    const newPrompt=ta.value.trim();if(!newPrompt)return;
    const cfg=loadCfg();
    if(!cfg.anthropicKey){overlay.remove();showKeyPrompt(panelRoot,'anthropicKey','Anthropic API Key','sk-ant-…','',k=>{saveCfg({...loadCfg(),anthropicKey:k});showReprompt(auto,panelRoot);});return;}
    updateBtn.textContent='Generating…';updateBtn.disabled=true;
    try{
      const fullPrompt=`Existing automation: "${auto.prompt}"\nModification requested: "${newPrompt}"\nGenerate the complete updated workflow.`;
      const workflow=await generateWorkflow(fullPrompt,cfg.anthropicKey);
      await workerFetch('/workflow/update',{workflowId:auto.workflowId,...workflow});
      const list=loadAutomations();const a=list.find(x=>x.id===auto.id);
      if(a){a.name=workflow.name;a.description=workflow.description;a.steps=workflow.steps;a.requiredSecrets=workflow.requiredSecrets||[];a.prompt=fullPrompt;saveAutomations(list);}
      overlay.remove();window.YM_toast?.('Automation updated ✓','success');renderPanel(panelRoot);
    }catch(e){window.YM_toast?.(e.message,'error');updateBtn.textContent='⚡ Update';updateBtn.disabled=false;}
  });
  setTimeout(()=>ta.focus(),100);
}

// ── KEY PROMPT ────────────────────────────────────────────────────────────────
function showKeyPrompt(panelRoot, keyId, label, placeholder, hint, onSave){
  const overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;z-index:9990;background:rgba(0,0,0,.8);display:flex;align-items:flex-end;justify-content:center';
  const box=document.createElement('div');
  box.style.cssText='background:#1a1a2e;border-radius:20px 20px 0 0;padding:24px;width:100%;max-width:500px;gap:12px;display:flex;flex-direction:column';
  box.innerHTML=`
    <div style="font-size:15px;font-weight:700;color:#fff">🔑 ${esc(label)}</div>
    ${hint?`<div style="font-size:12px;color:rgba(255,255,255,.4)">${esc(hint)}</div>`:''}`;
  const inp=document.createElement('input');inp.type='password';inp.placeholder=placeholder;
  inp.style.cssText='background:rgba(255,255,255,.06);border:1px solid rgba(99,102,241,.3);border-radius:12px;padding:14px;color:#fff;font-size:14px;outline:none;width:100%;box-sizing:border-box;transition:border-color .2s';
  inp.addEventListener('focus',()=>inp.style.borderColor='rgba(99,102,241,.8)');
  inp.addEventListener('blur',()=>inp.style.borderColor='rgba(99,102,241,.3)');
  box.appendChild(inp);
  const row=document.createElement('div');row.style.cssText='display:flex;gap:8px';
  const cancelBtn=document.createElement('button');cancelBtn.style.cssText='flex:1;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.6);padding:12px;border-radius:12px;cursor:pointer;font-size:13px';cancelBtn.textContent='Cancel';
  const saveBtn=document.createElement('button');saveBtn.style.cssText='flex:1;background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;color:#fff;padding:12px;border-radius:12px;cursor:pointer;font-size:13px;font-weight:700';saveBtn.textContent='Save';
  row.appendChild(cancelBtn);row.appendChild(saveBtn);box.appendChild(row);
  overlay.appendChild(box);document.body.appendChild(overlay);
  overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove();});
  cancelBtn.addEventListener('click',()=>overlay.remove());
  saveBtn.addEventListener('click',()=>{const v=inp.value.trim();if(!v)return;overlay.remove();onSave(v);});
  inp.addEventListener('keydown',e=>{if(e.key==='Enter')saveBtn.click();});
  setTimeout(()=>inp.focus(),100);
}

// ── SETTINGS ──────────────────────────────────────────────────────────────────
function showSettings(panelRoot){
  const overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;z-index:9990;background:rgba(0,0,0,.8);display:flex;align-items:flex-end;justify-content:center';
  const box=document.createElement('div');
  box.style.cssText='background:#1a1a2e;border-radius:20px 20px 0 0;padding:24px;width:100%;max-width:500px;max-height:70vh;overflow-y:auto;display:flex;flex-direction:column;gap:12px';
  const cfg=loadCfg();
  box.innerHTML=`<div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:4px">⚙ Configuration</div>`;

  function mkField(label,key,placeholder,isKey){
    const wrap=document.createElement('div');
    const val=cfg[key]||'';
    wrap.innerHTML=`<div style="font-size:11px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px">${esc(label)}</div>`;
    const inp=document.createElement('input');inp.type=isKey?'password':'text';inp.placeholder=placeholder;inp.value=isKey&&val?'•'.repeat(16):val;
    inp.style.cssText='width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:12px;color:#fff;font-size:13px;outline:none;box-sizing:border-box;margin-bottom:4px;transition:border-color .2s';
    inp.addEventListener('focus',()=>{if(isKey&&cfg[key])inp.value='';inp.style.borderColor='rgba(99,102,241,.6)';});
    inp.addEventListener('blur',()=>inp.style.borderColor='rgba(255,255,255,.1)');
    inp.dataset.key=key;
    wrap.appendChild(inp);box.appendChild(wrap);
  }

  mkField('Worker URL','workerUrl','https://pipedream-proxy.xxx.workers.dev',false);
  mkField('Anthropic API Key','anthropicKey','sk-ant-…',true);

  const saveBtn=document.createElement('button');
  saveBtn.style.cssText='width:100%;background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;color:#fff;padding:13px;border-radius:12px;cursor:pointer;font-size:14px;font-weight:700;margin-top:4px';
  saveBtn.textContent='Save';
  saveBtn.addEventListener('click',()=>{
    const updated={...cfg};
    box.querySelectorAll('[data-key]').forEach(inp=>{
      const v=inp.value.trim();
      if(v&&!v.startsWith('••'))updated[inp.dataset.key]=v;
    });
    saveCfg(updated);overlay.remove();
    window.YM_toast?.('Settings saved ✓','success');
    renderPanel(panelRoot);
  });
  box.appendChild(saveBtn);

  const closeBtn=document.createElement('button');
  closeBtn.style.cssText='width:100%;background:transparent;border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.4);padding:11px;border-radius:12px;cursor:pointer;font-size:13px';
  closeBtn.textContent='Close';closeBtn.addEventListener('click',()=>overlay.remove());
  box.appendChild(closeBtn);

  overlay.appendChild(box);document.body.appendChild(overlay);
  overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove();});
}

// ── SPHERE ─────────────────────────────────────────────────────────────────────
window.YM_S['automator.sphere.js']={
  name:'Automator',icon:'⚡',category:'Tools',
  description:'AI automation builder — prompt → Pipedream workflow → outputs',
  emit:[],receive:[],
  activate(ctx){_ctx=ctx;},
  deactivate(){},
  renderPanel,
  profileSection(container){
    const list=loadAutomations();if(!list.length)return;
    const el=document.createElement('div');
    el.style.cssText='display:flex;align-items:center;gap:10px;background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.2);border-radius:12px;padding:10px';
    el.innerHTML=`<span style="font-size:24px">⚡</span>
      <div style="flex:1"><div style="font-size:12px;font-weight:700;color:#a5b4fc">Automations</div>
      <div style="font-size:11px;color:rgba(255,255,255,.4)">${list.length} active</div></div>
      <div style="font-size:15px;font-weight:700;color:#a5b4fc">${list.length}</div>`;
    container.appendChild(el);
  }
};
})();
