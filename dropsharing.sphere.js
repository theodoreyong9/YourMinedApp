/* jshint esversion:11, browser:true */
// dropsharing.sphere.js — Affiliate link finder + product list + QR sharing
(function(){
'use strict';
window.YM_S = window.YM_S || {};

const SETTINGS_KEY = 'ym_drop_settings_v1';
const PRODUCTS_KEY = 'ym_drop_products_v1';

// ── STORAGE ─────────────────────────────────────────────────────────────────
function loadSettings(){try{return JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}');}catch(e){return{};}}
function saveSettings(d){localStorage.setItem(SETTINGS_KEY,JSON.stringify(d));}
function loadProducts(){try{return JSON.parse(localStorage.getItem(PRODUCTS_KEY)||'[]');}catch(e){return[];}}
function saveProducts(d){localStorage.setItem(PRODUCTS_KEY,JSON.stringify(d));}
function gid(){return 'p'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

// ── AFFILIATE PROGRAMS ───────────────────────────────────────────────────────
const PROGRAMS = [
  {
    id:'amazon', name:'Amazon Associates', icon:'🛒',
    categories:'Everything', commission:'1–10%',
    signup:'https://affiliate-program.amazon.com',
    fields:[{key:'tag',label:'Associate Tag',placeholder:'yourname-20'}],
    buildLink:(url,cfg)=>{
      try{
        const u=new URL(url);
        u.searchParams.set('tag',cfg.tag);
        return u.toString();
      }catch(e){return url+'?tag='+cfg.tag;}
    },
    searchUrl:(q)=>`https://www.amazon.com/s?k=${encodeURIComponent(q)}`,
  },
  {
    id:'aliexpress', name:'AliExpress Portals', icon:'🏮',
    categories:'Everything', commission:'4–8%',
    signup:'https://portals.aliexpress.com',
    fields:[{key:'pid',label:'Publisher ID',placeholder:'your_pid'},{key:'uid',label:'App ID (optional)',placeholder:''}],
    buildLink:(url,cfg)=>`https://s.click.aliexpress.com/e/${encodeURIComponent(url)}&pid=${cfg.pid}`,
    searchUrl:(q)=>`https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(q)}`,
  },
  {
    id:'ebay', name:'eBay Partner Network', icon:'🔨',
    categories:'Everything', commission:'1–4%',
    signup:'https://partnernetwork.ebay.com',
    fields:[{key:'campid',label:'Campaign ID',placeholder:'5338xxxxxx'},{key:'customid',label:'Custom ID (optional)',placeholder:''}],
    buildLink:(url,cfg)=>`https://rover.ebay.com/rover/1/711-53200-19255-0/1?mpre=${encodeURIComponent(url)}&campid=${cfg.campid}&customid=${cfg.customid||''}`,
    searchUrl:(q)=>`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}`,
  },
  {
    id:'cj', name:'CJ Affiliate', icon:'📦',
    categories:'Everything', commission:'Variable',
    signup:'https://www.cj.com',
    fields:[{key:'pid',label:'Publisher ID',placeholder:'your_pid'}],
    buildLink:(url,cfg)=>`https://www.anrdoezrs.net/click-${cfg.pid}-${gid()}?url=${encodeURIComponent(url)}`,
    searchUrl:(q)=>`https://www.cj.com/search?query=${encodeURIComponent(q)}`,
  },
  {
    id:'shareasale', name:'ShareASale', icon:'🤝',
    categories:'Niche/Fashion', commission:'Variable',
    signup:'https://www.shareasale.com',
    fields:[{key:'affid',label:'Affiliate ID',placeholder:'123456'}],
    buildLink:(url,cfg)=>`https://www.shareasale.com/r.cfm?u=${cfg.affid}&b=0&m=0&urllink=${encodeURIComponent(url)}`,
    searchUrl:(q)=>`https://www.shareasale.com/market.cfm?q=${encodeURIComponent(q)}`,
  },
  {
    id:'awin', name:'Awin', icon:'🌍',
    categories:'Europe/Fashion', commission:'Variable',
    signup:'https://www.awin.com',
    fields:[{key:'awid',label:'Publisher ID',placeholder:'123456'}],
    buildLink:(url,cfg)=>`https://aw.app/${cfg.awid}/?url=${encodeURIComponent(url)}`,
    searchUrl:(q)=>`https://www.awin.com/us/find-advertisers?q=${encodeURIComponent(q)}`,
  },
  {
    id:'impact', name:'Impact', icon:'💥',
    categories:'Premium brands', commission:'Variable',
    signup:'https://impact.com',
    fields:[{key:'subid',label:'SubID / Media ID',placeholder:'your_mediaid'}],
    buildLink:(url,cfg)=>`https://impact.go2cloud.org/aff_c?offer_id=1&aff_id=${cfg.subid}&url=${encodeURIComponent(url)}`,
    searchUrl:(q)=>`https://app.impact.com/brand-discovery/home.user?q=${encodeURIComponent(q)}`,
  },
  {
    id:'clickbank', name:'ClickBank', icon:'💰',
    categories:'Digital products', commission:'50–75%',
    signup:'https://www.clickbank.com',
    fields:[{key:'nickname',label:'Account Nickname',placeholder:'yournick'}],
    buildLink:(url,cfg)=>{
      // ClickBank vendor link format: http://nickname.vendor.hop.clickbank.net
      const match=url.match(/clickbank\.net\/(\w+)/);
      const vendor=match?match[1]:'vendor';
      return `https://${cfg.nickname}.${vendor}.hop.clickbank.net`;
    },
    searchUrl:(q)=>`https://www.clickbank.com/search?q=${encodeURIComponent(q)}`,
  },
  {
    id:'rakuten', name:'Rakuten Advertising', icon:'🛍',
    categories:'Fashion/Lifestyle', commission:'Variable',
    signup:'https://rakutenadvertising.com',
    fields:[{key:'mid',label:'Member ID',placeholder:'your_mid'}],
    buildLink:(url,cfg)=>`https://click.linksynergy.com/deeplink?id=${cfg.mid}&mid=0&murl=${encodeURIComponent(url)}`,
    searchUrl:(q)=>`https://rakutenadvertising.com/publishers/?q=${encodeURIComponent(q)}`,
  },
  {
    id:'etsy', name:'Etsy (via Awin)', icon:'🎨',
    categories:'Handmade/Art', commission:'4%',
    signup:'https://www.awin.com/us/advertiser/etsy',
    fields:[{key:'awid',label:'Awin Publisher ID',placeholder:'123456'}],
    buildLink:(url,cfg)=>`https://www.awin1.com/cread.php?awinmid=6220&awinaffid=${cfg.awid}&clickref=&p=${encodeURIComponent(url)}`,
    searchUrl:(q)=>`https://www.etsy.com/search?q=${encodeURIComponent(q)}`,
  },
];

// ── PANEL ────────────────────────────────────────────────────────────────────
let _activeTab='search';
function renderPanel(container){
  container.style.cssText='display:flex;flex-direction:column;height:100%;overflow:hidden';
  container.innerHTML='';

  const track=document.createElement('div');
  track.style.cssText='flex:1;overflow:hidden;min-height:0;display:flex;flex-direction:column';
  container.appendChild(track);

  const tabs=document.createElement('div');
  tabs.className='ym-tabs';
  tabs.style.cssText='border-top:1px solid rgba(232,160,32,.12);margin:0;flex-shrink:0';
  [['search','🔍 Find'],['list','📋 My List'],['settings','⚙ Settings']].forEach(([id,label])=>{
    const t=document.createElement('div');
    t.className='ym-tab'+(_activeTab===id?' active':'');
    t.dataset.tab=id;t.textContent=label;
    t.addEventListener('click',()=>{
      _activeTab=id;
      tabs.querySelectorAll('.ym-tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===id));
      track.innerHTML='';
      if(id==='search')renderSearch(track);
      else if(id==='list')renderList(track);
      else renderSettings(track);
    });
    tabs.appendChild(t);
  });
  container.appendChild(tabs);

  if(_activeTab==='search')renderSearch(track);
  else if(_activeTab==='list')renderList(track);
  else renderSettings(track);
}

// ── SEARCH TAB ───────────────────────────────────────────────────────────────
function renderSearch(container){
  container.innerHTML='';
  container.style.cssText='flex:1;display:flex;flex-direction:column;overflow:hidden';

  const settings=loadSettings();
  const activePrograms=PROGRAMS.filter(p=>settings[p.id]&&Object.values(settings[p.id]).some(v=>v));

  // Search bar
  const searchBar=document.createElement('div');
  searchBar.style.cssText='flex-shrink:0;padding:12px 14px;border-bottom:1px solid var(--border)';
  searchBar.innerHTML=
    '<div style="display:flex;gap:8px;margin-bottom:8px">'+
      '<input id="ds-query" class="ym-input" placeholder="Product name, reference, ASIN, URL…" style="flex:1;font-size:13px">'+
      '<button id="ds-search" class="ym-btn ym-btn-accent" style="padding:8px 14px;font-size:14px">🔍</button>'+
    '</div>'+
    (activePrograms.length===0
      ? '<div class="ym-notice info" style="font-size:11px">Configure your affiliate accounts in ⚙ Settings first.</div>'
      : '<div style="font-size:10px;color:var(--text3)">Searching on: '+activePrograms.map(p=>p.icon+' '+p.name).join(' · ')+'</div>');
  container.appendChild(searchBar);

  const results=document.createElement('div');
  results.style.cssText='flex:1;overflow-y:auto;padding:0';
  container.appendChild(results);

  if(activePrograms.length===0){
    results.innerHTML='<div style="padding:24px;text-align:center;color:var(--text3);font-size:12px">No affiliate programs configured.<br>Go to ⚙ Settings to add your accounts.</div>';
    return;
  }

  async function doSearch(){
    const q=searchBar.querySelector('#ds-query').value.trim();
    if(!q)return;
    results.innerHTML='<div style="color:var(--text3);font-size:11px;padding:12px;text-align:center">Searching across '+activePrograms.length+' programs…</div>';

    // Claude cherche les produits correspondants sur chaque programme actif
    const programList=activePrograms.map(p=>`${p.name} (${p.commission} commission)`).join(', ');
    const prompt=
      'Find affiliate products matching "'+q+'" on these programs: '+programList+'.\n'+
      'For each result return exactly:\n'+
      'PROGRAM | PRODUCT_NAME | PRICE | URL | IMAGE_URL (or empty) | DESCRIPTION (max 60 chars)\n'+
      'Return 2-3 results per program when available. Only real products with real URLs.';

    try{
      const resp=await fetch('https://api.anthropic.com/v1/messages',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          model:'claude-sonnet-4-20250514',max_tokens:1500,
          tools:[{type:'web_search_20250305',name:'web_search'}],
          messages:[{role:'user',content:prompt}]
        })
      });
      const data=await resp.json();
      const text=(data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('\n');

      results.innerHTML='';
      const lines=text.split('\n').filter(l=>l.includes('|'));

      if(!lines.length){
        results.innerHTML='<div style="color:var(--text3);font-size:12px;padding:16px;text-align:center">No results found. Try a different query.</div>';
        return;
      }

      lines.forEach(line=>{
        const parts=line.split('|').map(s=>s.trim());
        if(parts.length<4)return;
        const [progName,productName,price,url,imageUrl,desc]=parts;
        if(!url||!url.startsWith('http'))return;

        // Trouve le programme correspondant
        const prog=activePrograms.find(p=>
          progName.toLowerCase().includes(p.name.toLowerCase().split(' ')[0]) ||
          p.name.toLowerCase().includes(progName.toLowerCase().split(' ')[0])
        )||activePrograms[0];

        // Génère le lien affilié
        let affLink=url;
        try{affLink=prog.buildLink(url,settings[prog.id]||{});}catch(e){}

        const card=document.createElement('div');
        card.style.cssText='display:flex;gap:10px;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.05)';
        card.innerHTML=
          (imageUrl&&imageUrl.startsWith('http')
            ?'<img src="'+esc(imageUrl)+'" style="width:64px;height:64px;object-fit:cover;border-radius:8px;flex-shrink:0" onerror="this.style.display=\'none\'">'
            :'<div style="width:64px;height:64px;border-radius:8px;background:var(--surface3);display:flex;align-items:center;justify-content:center;font-size:28px;flex-shrink:0">'+prog.icon+'</div>')+
          '<div style="flex:1;min-width:0">'+
            '<div style="font-size:10px;color:var(--accent);font-weight:700;margin-bottom:2px">'+prog.icon+' '+esc(prog.name)+' · '+esc(prog.commission)+'</div>'+
            '<div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(productName)+'</div>'+
            (price?'<div style="font-size:12px;color:#30e880;margin-bottom:2px">'+esc(price)+'</div>':'')+
            (desc?'<div style="font-size:11px;color:var(--text3);margin-bottom:6px">'+esc(desc)+'</div>':'')+
            '<div style="display:flex;gap:6px">'+
              '<a href="'+esc(affLink)+'" target="_blank" class="ym-btn ym-btn-ghost" style="font-size:11px;padding:4px 10px;text-decoration:none">↗ View</a>'+
              '<button class="ds-add-btn ym-btn ym-btn-accent" style="font-size:11px;padding:4px 10px">+ Add to list</button>'+
            '</div>'+
          '</div>';

        card.querySelector('.ds-add-btn').addEventListener('click',()=>{
          _addProduct({name:productName,price,affLink,imageUrl,desc,program:prog.name,programIcon:prog.icon,origUrl:url});
          window.YM_toast?.('Added to your list!','success');
          card.querySelector('.ds-add-btn').textContent='✓ Added';
          card.querySelector('.ds-add-btn').disabled=true;
        });
        results.appendChild(card);
      });

    }catch(e){
      results.innerHTML='<div style="color:#e84040;font-size:12px;padding:16px">Error: '+esc(e.message)+'</div>';
    }
  }

  searchBar.querySelector('#ds-search').addEventListener('click',doSearch);
  searchBar.querySelector('#ds-query').addEventListener('keydown',e=>{if(e.key==='Enter')doSearch();});
}

function _addProduct(data){
  const products=loadProducts();
  products.unshift({
    id:gid(),
    name:data.name||'Product',
    price:data.price||'',
    affLink:data.affLink,
    imageUrl:data.imageUrl||'',
    desc:data.desc||'',
    program:data.program||'',
    programIcon:data.programIcon||'🛒',
    origUrl:data.origUrl||'',
    createdAt:Date.now(),
    clicks:0,
    tags:[]
  });
  saveProducts(products);
}

// ── LIST TAB ─────────────────────────────────────────────────────────────────
function renderList(container){
  container.innerHTML='';
  container.style.cssText='flex:1;display:flex;flex-direction:column;overflow:hidden';

  const hdr=document.createElement('div');
  hdr.style.cssText='flex-shrink:0;display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--border)';
  hdr.innerHTML=
    '<input id="ds-list-search" class="ym-input" placeholder="Filter…" style="flex:1;font-size:12px">'+
    '<button id="ds-add-manual" class="ym-btn ym-btn-ghost" style="font-size:11px;padding:4px 10px">+ Manual</button>';
  container.appendChild(hdr);

  const list=document.createElement('div');
  list.style.cssText='flex:1;overflow-y:auto;padding:8px 14px;display:flex;flex-direction:column;gap:8px';
  container.appendChild(list);

  function renderProducts(filter){
    list.innerHTML='';
    var products=loadProducts();
    if(filter)products=products.filter(p=>(p.name+p.desc+p.program).toLowerCase().includes(filter.toLowerCase()));
    if(!products.length){
      list.innerHTML='<div style="color:var(--text3);font-size:12px;padding:16px;text-align:center">'+(filter?'No results.':'No products yet.<br>Search for products in 🔍 Find.')+'</div>';
      return;
    }
    products.forEach(p=>_renderProductCard(list,p,()=>renderProducts(hdr.querySelector('#ds-list-search').value)));
  }

  hdr.querySelector('#ds-list-search').addEventListener('input',e=>renderProducts(e.target.value));
  hdr.querySelector('#ds-add-manual').addEventListener('click',()=>_showAddManual(()=>renderProducts('')));
  renderProducts('');
}

function _renderProductCard(container,p,onUpdate){
  const card=document.createElement('div');
  card.className='ym-card';
  card.style.cssText='padding:10px';

  // QR code URL
  const shareUrl=p.affLink;

  card.innerHTML=
    '<div style="display:flex;gap:10px">'+
      (p.imageUrl&&p.imageUrl.startsWith('http')
        ?'<img src="'+esc(p.imageUrl)+'" style="width:56px;height:56px;object-fit:cover;border-radius:8px;flex-shrink:0" onerror="this.style.display=\'none\'">'
        :'<div style="width:56px;height:56px;border-radius:8px;background:var(--surface3);display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0">'+esc(p.programIcon||'🛒')+'</div>')+
      '<div style="flex:1;min-width:0">'+
        '<div style="font-size:10px;color:var(--accent);margin-bottom:1px">'+esc(p.programIcon||'')+'  '+esc(p.program||'')+'</div>'+
        '<div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(p.name)+'</div>'+
        (p.price?'<div style="font-size:12px;color:#30e880">'+esc(p.price)+'</div>':'')+
        (p.desc?'<div style="font-size:11px;color:var(--text3);margin-top:2px">'+esc(p.desc)+'</div>':'')+
      '</div>'+
    '</div>'+
    '<div id="ds-qr-'+p.id+'" style="display:none;margin-top:8px;text-align:center"></div>'+
    '<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">'+
      '<a href="'+esc(shareUrl)+'" target="_blank" class="ym-btn ym-btn-accent" style="font-size:11px;padding:4px 12px;text-decoration:none;flex:1;text-align:center">↗ My link</a>'+
      '<button class="ds-qr-btn ym-btn ym-btn-ghost" style="font-size:11px;padding:4px 10px">QR</button>'+
      '<button class="ds-share-btn ym-btn ym-btn-ghost" style="font-size:11px;padding:4px 10px">Share</button>'+
      '<button class="ds-edit-btn ym-btn ym-btn-ghost" style="font-size:11px;padding:4px 10px">✏</button>'+
      '<button class="ds-del-btn ym-btn ym-btn-ghost" style="font-size:11px;padding:4px 10px;color:#e84040">×</button>'+
    '</div>';

  // QR toggle
  let qrShown=false;
  card.querySelector('.ds-qr-btn').addEventListener('click',()=>{
    const qrEl=card.querySelector('#ds-qr-'+p.id);
    if(qrShown){qrEl.style.display='none';qrShown=false;return;}
    qrEl.style.display='block';qrEl.innerHTML='';
    _generateQR(qrEl,shareUrl);
    qrShown=true;
  });

  // Share
  card.querySelector('.ds-share-btn').addEventListener('click',()=>{
    if(navigator.share){navigator.share({title:p.name,text:p.desc||p.name,url:shareUrl}).catch(()=>{});}
    else{navigator.clipboard?.writeText(shareUrl);window.YM_toast?.('Link copied!','success');}
  });

  // Edit
  card.querySelector('.ds-edit-btn').addEventListener('click',()=>_showEditProduct(p,onUpdate));

  // Delete
  card.querySelector('.ds-del-btn').addEventListener('click',()=>{
    if(!confirm('Remove "'+p.name+'"?'))return;
    const prods=loadProducts().filter(x=>x.id!==p.id);
    saveProducts(prods);
    onUpdate();
  });

  container.appendChild(card);
}

function _generateQR(container,url){
  if(window.QRCode){
    new window.QRCode(container,{text:url,width:140,height:140,correctLevel:QRCode.CorrectLevel.M});
    return;
  }
  const s=document.createElement('script');
  s.src='https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
  s.onload=()=>{new window.QRCode(container,{text:url,width:140,height:140,correctLevel:QRCode.CorrectLevel.M});};
  document.head.appendChild(s);
}

function _showAddManual(onDone){
  _showProductForm(null,onDone);
}

function _showEditProduct(p,onDone){
  _showProductForm(p,onDone);
}

function _showProductForm(existing,onDone){
  const overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;z-index:9990;background:rgba(0,0,0,.75);display:flex;align-items:flex-end;justify-content:center';
  const box=document.createElement('div');
  box.style.cssText='background:var(--surface2);border-radius:var(--r-lg) var(--r-lg) 0 0;padding:20px;width:100%;max-width:500px;max-height:85vh;overflow-y:auto';
  box.innerHTML=
    '<div style="font-size:14px;font-weight:600;margin-bottom:14px">'+(existing?'Edit Product':'Add Product Manually')+'</div>'+
    '<div style="display:flex;flex-direction:column;gap:8px">'+
      '<input id="pf-name" class="ym-input" placeholder="Product name *" style="font-size:13px" value="'+esc(existing?existing.name:'')+'">'+
      '<input id="pf-url" class="ym-input" placeholder="Affiliate link URL *" style="font-size:13px" value="'+esc(existing?existing.affLink:'')+'">'+
      '<input id="pf-price" class="ym-input" placeholder="Price (e.g. $29.99)" style="font-size:13px" value="'+esc(existing?existing.price:'')+'">'+
      '<input id="pf-img" class="ym-input" placeholder="Image URL (optional)" style="font-size:13px" value="'+esc(existing?existing.imageUrl:'')+'">'+
      '<textarea id="pf-desc" class="ym-input" placeholder="Description (optional)" style="height:60px;resize:none;font-size:13px">'+esc(existing?existing.desc:'')+'</textarea>'+
      '<input id="pf-prog" class="ym-input" placeholder="Program (e.g. Amazon)" style="font-size:13px" value="'+esc(existing?existing.program:'')+'">'+
    '</div>'+
    '<div style="display:flex;gap:8px;margin-top:14px">'+
      '<button id="pf-cancel" class="ym-btn ym-btn-ghost" style="flex:1">Cancel</button>'+
      '<button id="pf-save" class="ym-btn ym-btn-accent" style="flex:1">Save</button>'+
    '</div>';
  overlay.appendChild(box);document.body.appendChild(overlay);

  box.querySelector('#pf-cancel').addEventListener('click',()=>overlay.remove());
  overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove();});
  box.querySelector('#pf-save').addEventListener('click',()=>{
    const name=box.querySelector('#pf-name').value.trim();
    const affLink=box.querySelector('#pf-url').value.trim();
    if(!name||!affLink){window.YM_toast?.('Name and URL are required','error');return;}
    if(existing){
      const prods=loadProducts();
      const idx=prods.findIndex(x=>x.id===existing.id);
      if(idx>=0){
        prods[idx]={...prods[idx],
          name,affLink,
          price:box.querySelector('#pf-price').value.trim(),
          imageUrl:box.querySelector('#pf-img').value.trim(),
          desc:box.querySelector('#pf-desc').value.trim(),
          program:box.querySelector('#pf-prog').value.trim()};
        saveProducts(prods);
      }
    }else{
      _addProduct({
        name,affLink,
        price:box.querySelector('#pf-price').value.trim(),
        imageUrl:box.querySelector('#pf-img').value.trim(),
        desc:box.querySelector('#pf-desc').value.trim(),
        program:box.querySelector('#pf-prog').value.trim(),
        programIcon:'🛒'
      });
    }
    overlay.remove();
    onDone&&onDone();
    window.YM_toast?.('Saved','success');
  });
}

// ── SETTINGS TAB ─────────────────────────────────────────────────────────────
function renderSettings(container){
  container.innerHTML='';
  container.style.cssText='flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:14px';

  const settings=loadSettings();

  // Intro
  const intro=document.createElement('div');
  intro.className='ym-notice info';
  intro.style.cssText='font-size:11px';
  intro.innerHTML=
    'Configure your affiliate accounts below. Each program needs your unique ID/tag to track commissions.<br>'+
    '<b>No account yet?</b> Click "Sign up" to create one — it\'s free.';
  container.appendChild(intro);

  PROGRAMS.forEach(prog=>{
    const cfg=settings[prog.id]||{};
    const isActive=Object.values(cfg).some(v=>v);

    const card=document.createElement('div');
    card.className='ym-card';
    card.style.cssText='padding:12px';

    let fieldsHtml=prog.fields.map(f=>
      '<div style="margin-bottom:6px">'+
        '<label style="font-size:10px;color:var(--text3);display:block;margin-bottom:3px">'+esc(f.label)+'</label>'+
        '<input class="ym-input prog-field" data-key="'+f.key+'" placeholder="'+esc(f.placeholder)+'" value="'+esc(cfg[f.key]||'')+'" style="width:100%;font-size:12px;font-family:var(--font-m)">'+
      '</div>'
    ).join('');

    card.innerHTML=
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">'+
        '<span style="font-size:20px">'+prog.icon+'</span>'+
        '<div style="flex:1">'+
          '<div style="font-size:13px;font-weight:600">'+esc(prog.name)+'</div>'+
          '<div style="font-size:10px;color:var(--text3)">'+esc(prog.categories)+' · '+esc(prog.commission)+'</div>'+
        '</div>'+
        '<div style="width:8px;height:8px;border-radius:50%;background:'+(isActive?'#30e880':'var(--surface3)')+';flex-shrink:0"></div>'+
      '</div>'+
      fieldsHtml+
      '<div style="display:flex;gap:6px;margin-top:6px">'+
        '<a href="'+esc(prog.signup)+'" target="_blank" class="ym-btn ym-btn-ghost" style="font-size:11px;text-decoration:none;padding:4px 10px">↗ Sign up</a>'+
        '<button class="prog-save ym-btn ym-btn-accent" style="font-size:11px;flex:1">Save</button>'+
        (isActive?'<button class="prog-clear ym-btn ym-btn-ghost" style="font-size:11px;color:#e84040">Clear</button>':'')+
      '</div>';

    card.querySelector('.prog-save').addEventListener('click',()=>{
      const updated={...settings};
      updated[prog.id]=updated[prog.id]||{};
      card.querySelectorAll('.prog-field').forEach(input=>{
        updated[prog.id][input.dataset.key]=input.value.trim();
      });
      saveSettings(updated);
      window.YM_toast?.('Saved '+prog.name,'success');
      // Refresh badge
      const dot=card.querySelector('div[style*="border-radius:50%"]');
      if(dot){const hasVal=Object.values(updated[prog.id]).some(v=>v);dot.style.background=hasVal?'#30e880':'var(--surface3)';}
    });

    card.querySelector('.prog-clear')?.addEventListener('click',()=>{
      const updated={...settings};delete updated[prog.id];saveSettings(updated);
      renderSettings(container);
    });

    container.appendChild(card);
  });

  // Stats
  const products=loadProducts();
  if(products.length){
    const stats=document.createElement('div');
    stats.className='ym-card';
    stats.innerHTML=
      '<div class="ym-card-title">My Stats</div>'+
      '<div style="display:flex;gap:16px;flex-wrap:wrap">'+
        '<div style="text-align:center"><div style="font-size:22px;font-weight:700;color:var(--accent)">'+products.length+'</div><div style="font-size:10px;color:var(--text3)">Products</div></div>'+
        '<div style="text-align:center"><div style="font-size:22px;font-weight:700;color:var(--accent)">'+[...new Set(products.map(p=>p.program).filter(Boolean))].length+'</div><div style="font-size:10px;color:var(--text3)">Programs</div></div>'+
      '</div>';
    container.appendChild(stats);
  }
}

// ── SPHERE ────────────────────────────────────────────────────────────────────
window.YM_S['dropsharing.sphere.js']={
  name:'Dropsharing',
  icon:'🔗',
  category:'Commerce',
  description:'Find affiliate products, build your list, share & earn commissions',
  emit:[],receive:[],

  activate(ctx){
    const prods=loadProducts();
    if(prods.length)ctx.setNotification(prods.length);
  },
  deactivate(){},
  renderPanel,

  profileSection(container){
    const prods=loadProducts();
    if(!prods.length)return;
    const el=document.createElement('div');
    el.style.cssText='display:flex;flex-direction:column;gap:4px';
    el.innerHTML='<div style="font-size:10px;color:var(--text3);margin-bottom:2px">My affiliate picks</div>';
    prods.slice(0,3).forEach(p=>{
      const row=document.createElement('a');
      row.href=p.affLink;row.target='_blank';
      row.style.cssText='display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text);text-decoration:none;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.04)';
      row.innerHTML='<span>'+esc(p.programIcon||'🛒')+'</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(p.name)+'</span>'+(p.price?'<span style="color:#30e880;font-size:11px">'+esc(p.price)+'</span>':'');
      el.appendChild(row);
    });
    if(prods.length>3){
      const more=document.createElement('div');
      more.style.cssText='font-size:10px;color:var(--text3);margin-top:2px';
      more.textContent='+ '+(prods.length-3)+' more';
      el.appendChild(more);
    }
    container.appendChild(el);
  },

  peerSection(container,ctx){
    const el=document.createElement('div');
    el.style.cssText='font-size:11px;color:var(--text3)';
    el.textContent='🔗 Uses Dropsharing';
    container.appendChild(el);
  }
};
})();
