// search.sphere.js — YourMine P2P Search Sphere
(function(){
'use strict';
window.YM_S=window.YM_S||{};

let _ctx=null;
let _index=[];   // {id,title,url,snippet,owner,ts}
let _results=[];
let _searchBody=null;

window.YM_S['search.sphere.js']={
  name:'Search',icon:'◌',category:'autres',
  author:'theodoreyong9',
  description:'P2P full-text index — share and discover content',

  activate(ctx){
    _ctx=ctx;
    ctx.addPill('◌ Search',body=>renderSearch(body));
    ctx.p2p.onReceive((data,peerId)=>{
      if(!data||data.type!=='search_index')return;  // ignore non-search data
      if(!Array.isArray(data.items)||data.items.length===0)return;
      // Merge items (deduplicate by id)
      const existing=new Set(_index.map(i=>i.id));
      let added=0;
      for(const item of data.items){
        if(!item.id||!item.title)continue;  // skip malformed
        if(!existing.has(item.id)){_index.push({...item,owner:peerId,ts:Date.now()});added++}
      }
      if(added>0&&_searchBody&&document.getElementById('search-q')?.value?.trim()){
        _doSearch(document.getElementById('search-q').value);
      }
    });
    // Only broadcast if we have actual items
    setInterval(()=>{
      if(_index.filter(i=>i.mine).length===0)return;
      ctx.p2p.send({type:'search_index',items:_index.filter(i=>i.mine).slice(0,50)});
    },12000);
  },

  deactivate(){_index=[];_results=[];_searchBody=null},
  getBroadcastData(){return null},
};

function renderSearch(body){
  _searchBody=body;
  body.innerHTML=`<div style="padding:16px;display:flex;flex-direction:column;gap:12px">
    <div style="position:relative">
      <input class="ym-input" id="search-q" placeholder="Search the P2P index…" style="padding-right:40px"/>
      <button id="search-btn" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text3);cursor:pointer;font-size:1.1rem">🔍</button>
    </div>
    <div class="ym-panel">
      <div class="ym-panel-title">Add to Index</div>
      <input class="ym-input" id="search-add-title" placeholder="Title" style="margin-bottom:8px"/>
      <input class="ym-input" id="search-add-url" placeholder="URL (optional)" style="margin-bottom:8px"/>
      <textarea class="ym-input" id="search-add-snippet" placeholder="Content snippet…" style="resize:vertical;min-height:60px;font-size:12px;margin-bottom:8px"></textarea>
      <button class="ym-btn ym-btn-accent" id="search-add-btn" style="width:100%">Add to Index</button>
    </div>
    <div class="ym-panel">
      <div class="ym-panel-title">Index — <span id="search-idx-count">${_index.length}</span> entries · <span id="search-peer-count">0</span> peers</div>
      <div id="search-results" style="display:flex;flex-direction:column;gap:6px">
        ${_index.length===0?'<div style="font-size:11px;color:var(--text3)">Empty index. Add entries or connect with peers who have Search active.</div>':''}
      </div>
    </div>
  </div>`;

  body.querySelector('#search-q')?.addEventListener('input',e=>{
    const q=e.target.value.trim();
    if(q.length>=2)_doSearch(q);
    else{const r=body.querySelector('#search-results');if(r)r.innerHTML='<div style="font-size:11px;color:var(--text3)">Type at least 2 characters…</div>'}
  });
  body.querySelector('#search-btn')?.addEventListener('click',()=>{
    const q=body.querySelector('#search-q')?.value?.trim();
    if(q)_doSearch(q);
  });
  body.querySelector('#search-add-btn')?.addEventListener('click',()=>{
    const title=(body.querySelector('#search-add-title')?.value||'').trim();
    const url=(body.querySelector('#search-add-url')?.value||'').trim();
    const snippet=(body.querySelector('#search-add-snippet')?.value||'').trim();
    if(!title)return;
    const id=Date.now().toString(36)+Math.random().toString(36).slice(2,6);
    _index.push({id,title,url,snippet,mine:true,ts:Date.now()});
    body.querySelector('#search-add-title').value='';
    body.querySelector('#search-add-url').value='';
    body.querySelector('#search-add-snippet').value='';
    const cnt=body.querySelector('#search-idx-count');if(cnt)cnt.textContent=_index.length;
    const r=body.querySelector('#search-results');if(r)r.innerHTML='<div class="ym-notice success">Added ✓</div>';
    setTimeout(()=>{if(r)r.innerHTML=''},2000);
  });
}

function _doSearch(q){
  const terms=q.toLowerCase().split(/\s+/).filter(Boolean);
  if(!terms.length)return;
  _results=_index.filter(item=>{
    const haystack=`${item.title} ${item.snippet||''} ${item.url||''}`.toLowerCase();
    return terms.every(t=>haystack.includes(t));
  }).sort((a,b)=>b.ts-a.ts).slice(0,20);
  _renderResults();
}

function _renderResults(){
  const el=document.getElementById('search-results');if(!el)return;
  if(!_results.length){el.innerHTML='<div style="font-size:11px;color:var(--text3);padding:8px 0">No results.</div>';return}
  el.innerHTML=_results.map(item=>`
    <div class="ym-list-item" ${item.url?`onclick="window.open('${item.url}','_blank')"`:''}
         style="flex-direction:column;align-items:flex-start;gap:4px">
      <div style="font-family:var(--font-display);font-size:13px;font-weight:600;color:${item.url?'var(--accent2)':'var(--text)'}">${item.title}</div>
      ${item.snippet?`<div style="font-size:10px;color:var(--text3);line-height:1.5">${item.snippet.slice(0,120)}${item.snippet.length>120?'…':''}</div>`:''}
      ${item.url?`<div style="font-family:var(--font-mono);font-size:9px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%">${item.url}</div>`:''}
      <div style="font-size:9px;color:var(--text3)">${item.mine?'You':'Peer'}</div>
    </div>`).join('');
}

})();
