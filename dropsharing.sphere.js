/* jshint esversion:11, browser:true */
// dropsharing.sphere.js — Affiliate link generator + product list + QR sharing
// Flow : paste product URL → affiliate link generated instantly → share → earn
(function(){
'use strict';
window.YM_S = window.YM_S || {};

const SETTINGS_KEY = 'ym_drop_settings_v1';
const PRODUCTS_KEY = 'ym_drop_products_v1';

function loadSettings(){try{return JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}');}catch(e){return{};}}
function saveSettings(d){localStorage.setItem(SETTINGS_KEY,JSON.stringify(d));}
function loadProducts(){try{return JSON.parse(localStorage.getItem(PRODUCTS_KEY)||'[]');}catch(e){return[];}}
function saveProducts(d){localStorage.setItem(PRODUCTS_KEY,JSON.stringify(d));}
function gid(){return 'p'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function _addProduct(p){
  var prods=loadProducts();
  prods.unshift({id:gid(),name:p.name||'Product',price:p.price||'',affLink:p.affLink||'',origUrl:p.origUrl||'',
    imageUrl:p.imageUrl||'',desc:p.desc||'',program:p.program||'',programIcon:p.programIcon||'🔗',folderId:p.folderId||null,createdAt:Date.now()});
  saveProducts(prods);
}

// ── AFFILIATE PROGRAMS ────────────────────────────────────────────────────────
// detect(url) → true si cette URL appartient au programme
// buildLink(url, cfg) → URL affiliée
// Pour chaque programme : champs de config + instructions signup
const PROGRAMS = [

  // ── GÉNÉRALISTES ─────────────────────────────────────────────────────────
  {
    id:'amazon', name:'Amazon Associates', icon:'🛒', category:'General',
    commission:'1–10%', signup:'https://affiliate-program.amazon.com',
    fields:[{key:'tag',label:'Associate Tag',placeholder:'yourname-20',tip:'Found in your Associates dashboard'}],
    detect: url => /amazon\.(com|fr|de|co\.uk|it|es|ca|co\.jp|com\.au|in|com\.br|com\.mx|nl|se|sg|com\.tr|ae|sa)/i.test(url),
    buildLink(url, cfg){
      try{const u=new URL(url);u.searchParams.set('tag',cfg.tag);u.searchParams.delete('ref');return u.toString();}
      catch(e){return url+(url.includes('?')?'&':'?')+'tag='+cfg.tag;}
    }
  },
  {
    id:'ebay', name:'eBay Partner Network', icon:'🔨', category:'General',
    commission:'1–4%', signup:'https://partnernetwork.ebay.com',
    fields:[{key:'campid',label:'Campaign ID',placeholder:'5338xxxxxx'},{key:'customid',label:'Custom ID',placeholder:'optional'}],
    detect: url => /ebay\.(com|fr|de|co\.uk|it|es|ca|com\.au|at|be|ch|ie|nl|ph|pl|vn)/i.test(url),
    buildLink(url, cfg){
      return 'https://rover.ebay.com/rover/1/711-53200-19255-0/1?mpre='+encodeURIComponent(url)+'&campid='+cfg.campid+'&customid='+(cfg.customid||'');
    }
  },
  {
    id:'aliexpress', name:'AliExpress Portals', icon:'🏮', category:'General',
    commission:'4–8%', signup:'https://portals.aliexpress.com',
    fields:[{key:'pid',label:'Publisher ID',placeholder:'your_pid'},{key:'uid',label:'App ID',placeholder:'your_uid'}],
    detect: url => /aliexpress\.com/i.test(url),
    buildLink(url, cfg){
      return 'https://s.click.aliexpress.com/e/_EyJxyz?pid='+cfg.pid+'&uid='+cfg.uid+'&url='+encodeURIComponent(url);
    }
  },
  {
    id:'walmart', name:'Walmart Affiliates', icon:'🔵', category:'General',
    commission:'1–4%', signup:'https://affiliates.walmart.com',
    fields:[{key:'wmlspartner',label:'Partner ID',placeholder:'your_partner_id'}],
    detect: url => /walmart\.com/i.test(url),
    buildLink(url, cfg){
      try{const u=new URL(url);u.searchParams.set('wmlspartner',cfg.wmlspartner);return u.toString();}
      catch(e){return url;}
    }
  },
  {
    id:'bestbuy', name:'Best Buy Affiliate', icon:'💙', category:'General',
    commission:'0.5–1%', signup:'https://www.bestbuy.com/site/affiliate-program',
    fields:[{key:'lid',label:'Link ID',placeholder:'your_lid'}],
    detect: url => /bestbuy\.com/i.test(url),
    buildLink(url, cfg){
      return 'https://bestbuy.7eer.net/c/'+cfg.lid+'/614286/10014?u='+encodeURIComponent(url);
    }
  },
  {
    id:'target', name:'Target Affiliates', icon:'🎯', category:'General',
    commission:'1–8%', signup:'https://affiliate.target.com',
    fields:[{key:'afid',label:'Affiliate ID',placeholder:'your_afid'}],
    detect: url => /target\.com/i.test(url),
    buildLink(url, cfg){
      try{const u=new URL(url);u.searchParams.set('afid',cfg.afid);return u.toString();}
      catch(e){return url;}
    }
  },

  // ── RÉSEAUX D'AFFILIATION ─────────────────────────────────────────────────
  {
    id:'cj', name:'CJ Affiliate', icon:'📦', category:'Network',
    commission:'Variable', signup:'https://www.cj.com',
    fields:[{key:'pid',label:'Publisher ID',placeholder:'your_pid'}],
    detect: url => /anrdoezrs\.net|dpbolvw\.net|jdoqocy\.com|kqzyfj\.com|lduhtrp\.net|tkqlhce\.com|awltovhc\.com/i.test(url),
    buildLink(url, cfg){
      return 'https://www.anrdoezrs.net/click-'+cfg.pid+'-10000000?url='+encodeURIComponent(url);
    }
  },
  {
    id:'shareasale', name:'ShareASale', icon:'🤝', category:'Network',
    commission:'Variable', signup:'https://www.shareasale.com',
    fields:[{key:'affid',label:'Affiliate ID',placeholder:'123456'},{key:'merchantid',label:'Merchant ID',placeholder:'12345'}],
    detect: url => /shareasale\.com/i.test(url),
    buildLink(url, cfg){
      return 'https://www.shareasale.com/r.cfm?u='+cfg.affid+'&b=0&m='+cfg.merchantid+'&urllink='+encodeURIComponent(url);
    }
  },
  {
    id:'awin', name:'Awin', icon:'🌍', category:'Network',
    commission:'Variable', signup:'https://www.awin.com',
    fields:[{key:'awid',label:'Publisher ID',placeholder:'123456'},{key:'awmid',label:'Advertiser ID',placeholder:'12345'}],
    detect: url => /awin1\.com|awinmid/i.test(url),
    buildLink(url, cfg){
      return 'https://www.awin1.com/cread.php?awinmid='+cfg.awmid+'&awinaffid='+cfg.awid+'&p='+encodeURIComponent(url);
    }
  },
  {
    id:'rakuten', name:'Rakuten Advertising', icon:'🛍', category:'Network',
    commission:'Variable', signup:'https://rakutenadvertising.com/publishers',
    fields:[{key:'mid',label:'Member ID',placeholder:'your_mid'}],
    detect: url => /linksynergy\.com|rakutenadvertising\.com/i.test(url),
    buildLink(url, cfg){
      return 'https://click.linksynergy.com/deeplink?id='+cfg.mid+'&mid=0&murl='+encodeURIComponent(url);
    }
  },
  {
    id:'impact', name:'Impact', icon:'💥', category:'Network',
    commission:'Variable', signup:'https://app.impact.com',
    fields:[{key:'affid',label:'Affiliate ID',placeholder:'your_affid'},{key:'offerid',label:'Offer ID',placeholder:'1'}],
    detect: url => /impact\.go2cloud\.org|ojrq\.net|impactradius/i.test(url),
    buildLink(url, cfg){
      return 'https://impact.go2cloud.org/aff_c?offer_id='+cfg.offerid+'&aff_id='+cfg.affid+'&url='+encodeURIComponent(url);
    }
  },
  {
    id:'clickbank', name:'ClickBank', icon:'💰', category:'Network',
    commission:'50–75%', signup:'https://www.clickbank.com',
    fields:[{key:'nickname',label:'Account Nickname',placeholder:'yournick'}],
    detect: url => /clickbank\.net|hop\.clickbank\.net/i.test(url),
    buildLink(url, cfg){
      const match=url.match(/(\w+)\.hop\.clickbank\.net/)||url.match(/clickbank\.net\/(\w+)/);
      const vendor=match?match[1]:'vendor';
      return 'https://'+cfg.nickname+'.'+vendor+'.hop.clickbank.net';
    }
  },
  {
    id:'flexoffers', name:'FlexOffers', icon:'🔀', category:'Network',
    commission:'Variable', signup:'https://www.flexoffers.com',
    fields:[{key:'foid',label:'Publisher ID',placeholder:'your_foid'}],
    detect: url => /flexoffers\.com/i.test(url),
    buildLink(url, cfg){
      return 'https://track.flexlinkspro.com/a.ashx?foid='+cfg.foid+'&foc=1&fot=9999&fos=1&url='+encodeURIComponent(url);
    }
  },
  {
    id:'partnerstack', name:'PartnerStack', icon:'🥞', category:'Network',
    commission:'Variable', signup:'https://partnerstack.com',
    fields:[{key:'key',label:'Referral Key',placeholder:'your_key'}],
    detect: url => /partnerstack\.com|gr8\.com/i.test(url),
    buildLink(url, cfg){
      try{const u=new URL(url);u.searchParams.set('via',cfg.key);return u.toString();}
      catch(e){return url;}
    }
  },

  // ── MODE / LIFESTYLE ─────────────────────────────────────────────────────
  {
    id:'etsy', name:'Etsy (via Awin)', icon:'🎨', category:'Fashion',
    commission:'4%', signup:'https://www.awin.com/us/advertiser/etsy',
    fields:[{key:'awid',label:'Awin Publisher ID',placeholder:'123456'}],
    detect: url => /etsy\.com/i.test(url),
    buildLink(url, cfg){
      return 'https://www.awin1.com/cread.php?awinmid=6220&awinaffid='+cfg.awid+'&p='+encodeURIComponent(url);
    }
  },
  {
    id:'nordstrom', name:'Nordstrom', icon:'👗', category:'Fashion',
    commission:'2–20%', signup:'https://www.rakutenadvertising.com',
    fields:[{key:'mid',label:'Rakuten Member ID',placeholder:'your_mid'}],
    detect: url => /nordstrom\.com/i.test(url),
    buildLink(url, cfg){
      return 'https://click.linksynergy.com/deeplink?id='+cfg.mid+'&mid=0&murl='+encodeURIComponent(url);
    }
  },
  {
    id:'farfetch', name:'Farfetch', icon:'👜', category:'Fashion',
    commission:'5–8%', signup:'https://www.awin.com',
    fields:[{key:'awid',label:'Awin Publisher ID',placeholder:'123456'},{key:'awmid',label:'Farfetch Awin ID',placeholder:'14775'}],
    detect: url => /farfetch\.com/i.test(url),
    buildLink(url, cfg){
      return 'https://www.awin1.com/cread.php?awinmid='+(cfg.awmid||'14775')+'&awinaffid='+cfg.awid+'&p='+encodeURIComponent(url);
    }
  },
  {
    id:'ssense', name:'SSENSE', icon:'🖤', category:'Fashion',
    commission:'3–5%', signup:'https://www.shareasale.com',
    fields:[{key:'affid',label:'ShareASale Affiliate ID',placeholder:'123456'}],
    detect: url => /ssense\.com/i.test(url),
    buildLink(url, cfg){
      return 'https://www.shareasale.com/r.cfm?u='+cfg.affid+'&b=0&m=70522&urllink='+encodeURIComponent(url);
    }
  },

  // ── TECH ─────────────────────────────────────────────────────────────────
  {
    id:'apple', name:'Apple Services', icon:'🍎', category:'Tech',
    commission:'2.5–7%', signup:'https://affiliate.itunes.apple.com',
    fields:[{key:'at',label:'Affiliate Token',placeholder:'your_token'}],
    detect: url => /apple\.com|apps\.apple\.com|music\.apple\.com/i.test(url),
    buildLink(url, cfg){
      try{const u=new URL(url);u.searchParams.set('at',cfg.at);return u.toString();}
      catch(e){return url;}
    }
  },
  {
    id:'microsoft', name:'Microsoft Store', icon:'🪟', category:'Tech',
    commission:'2–10%', signup:'https://www.microsoft.com/en-us/store/b/affiliate',
    fields:[{key:'ocid',label:'Affiliate OCID',placeholder:'your_ocid'}],
    detect: url => /microsoft\.com|xbox\.com/i.test(url),
    buildLink(url, cfg){
      try{const u=new URL(url);u.searchParams.set('ocid',cfg.ocid);return u.toString();}
      catch(e){return url;}
    }
  },
  {
    id:'newegg', name:'Newegg', icon:'🖥', category:'Tech',
    commission:'0.5–1%', signup:'https://www.newegg.com/affiliate',
    fields:[{key:'cm_mmc',label:'Campaign Code',placeholder:'affiliate-xxx'}],
    detect: url => /newegg\.com/i.test(url),
    buildLink(url, cfg){
      try{const u=new URL(url);u.searchParams.set('cm_mmc',cfg.cm_mmc);return u.toString();}
      catch(e){return url;}
    }
  },

  // ── VOYAGE ──────────────────────────────────────────────────────────────
  {
    id:'booking', name:'Booking.com', icon:'🏨', category:'Travel',
    commission:'25–40%', signup:'https://www.booking.com/affiliate-program.html',
    fields:[{key:'aid',label:'Affiliate ID',placeholder:'123456'}],
    detect: url => /booking\.com/i.test(url),
    buildLink(url, cfg){
      try{const u=new URL(url);u.searchParams.set('aid',cfg.aid);return u.toString();}
      catch(e){return url;}
    }
  },
  {
    id:'airbnb', name:'Airbnb', icon:'🏠', category:'Travel',
    commission:'Variable', signup:'https://www.airbnb.com/associates',
    fields:[{key:'r',label:'Referral Code',placeholder:'your_code'}],
    detect: url => /airbnb\./i.test(url),
    buildLink(url, cfg){
      try{const u=new URL(url);u.searchParams.set('af',cfg.r);return u.toString();}
      catch(e){return url;}
    }
  },
  {
    id:'tripadvisor', name:'TripAdvisor', icon:'🦉', category:'Travel',
    commission:'50% of TA revenue', signup:'https://www.tripadvisor.com/affiliates',
    fields:[{key:'asrc',label:'Affiliate Source',placeholder:'your_source'}],
    detect: url => /tripadvisor\./i.test(url),
    buildLink(url, cfg){
      try{const u=new URL(url);u.searchParams.set('asrc',cfg.asrc);return u.toString();}
      catch(e){return url;}
    }
  },
  {
    id:'skyscanner', name:'Skyscanner', icon:'✈️', category:'Travel',
    commission:'Variable', signup:'https://www.partners.skyscanner.net',
    fields:[{key:'associateid',label:'Associate ID',placeholder:'your_id'}],
    detect: url => /skyscanner\./i.test(url),
    buildLink(url, cfg){
      try{const u=new URL(url);u.searchParams.set('associateid',cfg.associateid);return u.toString();}
      catch(e){return url;}
    }
  },

  // ── DIGITAL / SaaS ───────────────────────────────────────────────────────
  {
    id:'fiverr', name:'Fiverr', icon:'🟢', category:'Digital',
    commission:'$15–150 CPA', signup:'https://affiliates.fiverr.com',
    fields:[{key:'affid',label:'Affiliate ID',placeholder:'your_id'}],
    detect: url => /fiverr\.com/i.test(url),
    buildLink(url, cfg){
      return 'https://go.fiverr.com/visit/?bta='+cfg.affid+'&brand=fiverrcpa&landingPage='+encodeURIComponent(url);
    }
  },
  {
    id:'envato', name:'Envato Market', icon:'🎵', category:'Digital',
    commission:'30%', signup:'https://affiliates.envato.com',
    fields:[{key:'affid',label:'Affiliate ID',placeholder:'your_id'}],
    detect: url => /envato\.com|themeforest\.net|codecanyon\.net|graphicriver\.net/i.test(url),
    buildLink(url, cfg){
      return 'https://1.envato.market/c/'+cfg.affid+'/0/0/0/?u='+encodeURIComponent(url);
    }
  },
  {
    id:'shopify', name:'Shopify Partners', icon:'🛍', category:'Digital',
    commission:'$58–2000', signup:'https://www.shopify.com/affiliates',
    fields:[{key:'ref',label:'Referral Handle',placeholder:'your_handle'}],
    detect: url => /shopify\.com/i.test(url),
    buildLink(url, cfg){
      return 'https://shopify.com/'+cfg.ref+'?ref='+cfg.ref;
    }
  },
  {
    id:'canva', name:'Canva', icon:'🎨', category:'Digital',
    commission:'$36 CPA', signup:'https://www.canva.com/affiliates',
    fields:[{key:'ref',label:'Referral Code',placeholder:'your_code'}],
    detect: url => /canva\.com/i.test(url),
    buildLink(url, cfg){
      return 'https://www.canva.com/join/'+cfg.ref;
    }
  },

  // ── BEAUTÉ / SANTÉ ───────────────────────────────────────────────────────
  {
    id:'sephora', name:'Sephora', icon:'💄', category:'Beauty',
    commission:'5–10%', signup:'https://www.rakutenadvertising.com',
    fields:[{key:'mid',label:'Rakuten Member ID',placeholder:'your_mid'}],
    detect: url => /sephora\.com/i.test(url),
    buildLink(url, cfg){
      return 'https://click.linksynergy.com/deeplink?id='+cfg.mid+'&mid=44257&murl='+encodeURIComponent(url);
    }
  },
  {
    id:'lookfantastic', name:'Lookfantastic', icon:'🌸', category:'Beauty',
    commission:'8–12%', signup:'https://www.awin.com',
    fields:[{key:'awid',label:'Awin Publisher ID',placeholder:'123456'}],
    detect: url => /lookfantastic\.com/i.test(url),
    buildLink(url, cfg){
      return 'https://www.awin1.com/cread.php?awinmid=5043&awinaffid='+cfg.awid+'&p='+encodeURIComponent(url);
    }
  },

  // ── GÉNÉRIQUE (URL quelconque) ───────────────────────────────────────────
  {
    id:'generic', name:'Custom / Other', icon:'🔗', category:'Other',
    commission:'—', signup:'',
    fields:[{key:'ref',label:'Ref param name',placeholder:'ref'},{key:'val',label:'Your ref value',placeholder:'yourname'}],
    detect: () => true, // fallback pour toute URL
    buildLink(url, cfg){
      if(!cfg.ref||!cfg.val)return url;
      try{const u=new URL(url);u.searchParams.set(cfg.ref,cfg.val);return u.toString();}
      catch(e){return url+(url.includes('?')?'&':'?')+cfg.ref+'='+cfg.val;}
    }
  },
];

// ── DETECT PROGRAM FROM URL ───────────────────────────────────────────────────
function detectPrograms(url){
  const settings=loadSettings();
  // Programmes configurés qui matchent l'URL, generic en dernier recours
  const matched=PROGRAMS.filter(p=>p.id!=='generic'&&p.detect(url)&&settings[p.id]&&Object.values(settings[p.id]).some(v=>v));
  if(!matched.length){
    const gen=PROGRAMS.find(p=>p.id==='generic');
    if(settings.generic&&Object.values(settings.generic).some(v=>v))return[gen];
    return[];
  }
  return matched;
}

// ── PANEL ────────────────────────────────────────────────────────────────────
let _activeTab='add';
function renderPanel(container){
  container.style.cssText='display:flex;flex-direction:column;height:100%;overflow:hidden';
  container.innerHTML='';
  const track=document.createElement('div');
  track.style.cssText='flex:1;overflow:hidden;min-height:0;display:flex;flex-direction:column';
  container.appendChild(track);
  const tabs=document.createElement('div');
  tabs.className='ym-tabs';
  tabs.style.cssText='border-top:1px solid rgba(232,160,32,.12);margin:0;flex-shrink:0';
  [['add','➕ Add'],['list','📋 List']].forEach(([id,label])=>{
    const t=document.createElement('div');
    t.className='ym-tab'+(_activeTab===id?' active':'');
    t.dataset.tab=id;t.textContent=label;
    t.addEventListener('click',()=>{
      _activeTab=id;
      tabs.querySelectorAll('.ym-tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===id));
      track.innerHTML='';
      if(id==='add')renderAdd(track);
      else renderList(track);
    });
    tabs.appendChild(t);
  });
  container.appendChild(tabs);
  if(_activeTab==='add')renderAdd(track);
  else renderList(track);
}

// ── ADD TAB ───────────────────────────────────────────────────────────────────
function renderAdd(container){
  container.innerHTML='';
  container.style.cssText='flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px';

  const settings=loadSettings();
  const activeProgs=PROGRAMS.filter(p=>p.id!=='generic'&&settings[p.id]&&Object.values(settings[p.id]).some(v=>v));

  if(activeProgs.length===0){
    const notice=document.createElement('div');notice.className='ym-notice info';
    notice.innerHTML='<b>No programs configured yet.</b><br>Go to your Profile → Dropsharing to add your affiliate IDs.';
    container.appendChild(notice);
  }

  // Input : URL ou référence produit
  const inputCard=document.createElement('div');inputCard.className='ym-card';
  inputCard.innerHTML=
    '<div class="ym-card-title">Product reference or URL</div>'+
    '<div style="display:flex;gap:8px;margin-bottom:8px">'+
      '<input id="ds-url" class="ym-input" placeholder="ASIN, model ref, product name, or paste URL…" style="flex:1;font-size:12px">'+
      '<button id="ds-detect" class="ym-btn ym-btn-accent" style="padding:8px 14px">→</button>'+
    '</div>'+
    '<div id="ds-url-hint" style="font-size:10px;color:var(--text3)">'+
      'Paste a product URL (auto-detects program) or type a reference to search across all configured affiliates.'+
    '</div>';
  container.appendChild(inputCard);

  const preview=document.createElement('div');
  preview.style.cssText='display:flex;flex-direction:column;gap:8px';
  container.appendChild(preview);

  function handleInput(input){
    input=input.trim();
    if(!input){inputCard.querySelector('#ds-url-hint').textContent='Enter a product URL or reference.';return;}
    preview.innerHTML='';

    // Cas 1 : URL → détecte le programme
    if(input.startsWith('http')){
      const progs=detectPrograms(input);
      if(!progs.length){
        const msg=document.createElement('div');msg.className='ym-notice info';
        msg.innerHTML='No configured program matches this URL.<br>Configure programs in your Profile → Dropsharing.';
        preview.appendChild(msg);return;
      }
      progs.forEach(prog=>{
        const cfg=settings[prog.id]||{};
        let affLink=input;
        try{affLink=prog.buildLink(input,cfg);}catch(e){}
        preview.appendChild(_renderLinkCard(prog,input,affLink,()=>{_activeTab='list';renderPanel(container.closest('[id]')||container.parentElement);}));
      });
      return;
    }

    // Cas 2 : Référence → génère des liens de recherche sur tous les affiliés configurés
    if(!activeProgs.length){
      const msg=document.createElement('div');msg.className='ym-notice info';
      msg.textContent='Configure at least one affiliate program in your Profile → Dropsharing.';
      preview.appendChild(msg);return;
    }
    inputCard.querySelector('#ds-url-hint').textContent='Generating search links for "'+input+'" across '+activeProgs.length+' program(s)…';
    activeProgs.forEach(prog=>{
      const cfg=settings[prog.id]||{};
      const searchBase={amazon:'https://www.amazon.com/s?k=',aliexpress:'https://www.aliexpress.com/wholesale?SearchText=',walmart:'https://www.walmart.com/search?q=',bestbuy:'https://www.bestbuy.com/site/searchpage.jsp?st=',target:'https://www.target.com/s?searchTerm=',etsy:'https://www.etsy.com/search?q=',sephora:'https://www.sephora.com/search?keyword=',newegg:'https://www.newegg.com/p/pl?d=',fiverr:'https://www.fiverr.com/search/gigs?query='};
      const baseQ=(searchBase[prog.id]||'https://www.google.com/search?q=')+encodeURIComponent(input);
      const searchUrl=prog.searchUrl?prog.searchUrl(input):baseQ;
      let affSearchLink=searchUrl;
      try{affSearchLink=prog.buildLink(searchUrl,cfg);}catch(e){}
      // eBay Finding API si App ID configuré
      if(prog.id==='ebay'&&cfg.appid){
        const ebayUrl='https://svcs.ebay.com/services/search/FindingService/v1'+
          '?OPERATION-NAME=findItemsByKeywords&SERVICE-VERSION=1.0.0'+
          '&SECURITY-APPNAME='+encodeURIComponent(cfg.appid)+
          '&RESPONSE-DATA-FORMAT=JSON&keywords='+encodeURIComponent(input)+
          '&paginationInput.entriesPerPage=3&sortOrder=BestMatch';
        const row=document.createElement('div');row.className='ym-card';row.style.cssText='padding:10px';
        row.innerHTML='<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span style="font-size:18px">'+prog.icon+'</span><b style="font-size:12px">'+esc(prog.name)+'</b><span style="font-size:10px;color:var(--text3);margin-left:auto">Loading…</span></div><div class="ebay-results"></div>';
        preview.appendChild(row);
        fetch(ebayUrl,{headers:{'Accept':'application/json'}}).then(r=>r.json()).then(d=>{
          const items=(d.findItemsByKeywordsResponse?.[0]?.searchResult?.[0]?.item)||[];
          row.querySelector('.ebay-results').innerHTML='';
          items.forEach(it=>{
            const url=it.viewItemURL?.[0]||'';
            const price=it.sellingStatus?.[0]?.currentPrice?.[0]?.['__value__']||'';
            const cur=it.sellingStatus?.[0]?.currentPrice?.[0]?.['@currencyId']||'';
            const affLink=cfg.campid?'https://rover.ebay.com/rover/1/711-53200-19255-0/1?mpre='+encodeURIComponent(url)+'&campid='+cfg.campid:url;
            const itEl=document.createElement('div');itEl.style.cssText='display:flex;align-items:center;gap:8px;padding:5px 0;border-top:1px solid rgba(255,255,255,.05)';
            itEl.innerHTML='<div style="flex:1;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(it.title?.[0]||'')+'</div><span style="color:#30e880;font-size:11px;flex-shrink:0">'+(price?cur+' '+price:'')+'</span>';
            const addB=document.createElement('button');addB.className='ym-btn ym-btn-accent';addB.style.cssText='font-size:10px;padding:3px 8px;flex-shrink:0';addB.textContent='+';
            addB.addEventListener('click',()=>{
              _addProduct({name:it.title?.[0]||prog.name+' product',price:price?cur+' '+price:'',affLink,origUrl:url,imageUrl:it.galleryURL?.[0]||'',program:prog.name,programIcon:prog.icon});
              window.YM_toast?.('Added!','success');addB.textContent='✓';addB.disabled=true;
            });
            itEl.appendChild(addB);row.querySelector('.ebay-results').appendChild(itEl);
          });
          row.querySelector('span[style*="Loading"]').textContent=items.length+' results';
          if(!items.length){
            const sl=document.createElement('a');sl.href=affSearchLink;sl.target='_blank';sl.className='ym-btn ym-btn-ghost';sl.style.cssText='font-size:11px;text-decoration:none;display:block;text-align:center;margin-top:4px';sl.textContent='→ Search on eBay';
            row.querySelector('.ebay-results').appendChild(sl);
          }
        }).catch(()=>{
          row.querySelector('span[style*="Loading"]').textContent='';
          const sl=document.createElement('a');sl.href=affSearchLink;sl.target='_blank';sl.className='ym-btn ym-btn-ghost';sl.style.cssText='font-size:11px;text-decoration:none;display:block;text-align:center';sl.textContent='→ Search on '+prog.name;
          row.querySelector('.ebay-results').appendChild(sl);
        });
        return;
      }
      // Autres programmes : lien de recherche affilié
      const row=document.createElement('div');row.className='ym-card';row.style.cssText='padding:10px;display:flex;align-items:center;gap:10px';
      row.innerHTML=
        '<span style="font-size:20px;flex-shrink:0">'+prog.icon+'</span>'+
        '<div style="flex:1;min-width:0">'+
          '<div style="font-size:12px;font-weight:600">'+esc(prog.name)+'</div>'+
          '<div style="font-size:10px;color:var(--text3)">Search "'+esc(input)+'" with your affiliate tag</div>'+
        '</div>'+
        '<a href="'+esc(affSearchLink)+'" target="_blank" class="ym-btn ym-btn-accent" style="font-size:11px;text-decoration:none;flex-shrink:0">→ Open</a>';
      preview.appendChild(row);
    });
  }

  inputCard.querySelector('#ds-detect').addEventListener('click',()=>handleInput(inputCard.querySelector('#ds-url').value));
  inputCard.querySelector('#ds-url').addEventListener('keydown',e=>{if(e.key==='Enter')handleInput(inputCard.querySelector('#ds-url').value);});
  inputCard.querySelector('#ds-url').addEventListener('paste',e=>{setTimeout(()=>handleInput(e.target.value.trim()),50);});
}

function _renderLinkCard(prog,origUrl,affLink,onAdded){
  const card=document.createElement('div');card.className='ym-card';
  const qrId='qr-'+gid();
  card.innerHTML=
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">'+
      '<span style="font-size:20px">'+prog.icon+'</span>'+
      '<div style="flex:1">'+
        '<div style="font-size:13px;font-weight:600">'+esc(prog.name)+'</div>'+
        '<div style="font-size:10px;color:var(--accent)">'+esc(prog.commission)+'</div>'+
      '</div>'+
    '</div>'+
    '<div style="font-size:10px;color:var(--text3);margin-bottom:6px;word-break:break-all;padding:6px;background:rgba(255,255,255,.04);border-radius:6px">'+esc(affLink)+'</div>'+
    '<div id="'+qrId+'" style="display:none;text-align:center;padding:8px 0"></div>'+
    '<div style="display:flex;gap:6px;flex-wrap:wrap">'+
      '<button class="lc-copy ym-btn ym-btn-ghost" style="font-size:11px;flex:1">⧉ Copy link</button>'+
      '<button class="lc-qr ym-btn ym-btn-ghost" style="font-size:11px">QR</button>'+
      '<button class="lc-add ym-btn ym-btn-accent" style="font-size:11px;flex:1">+ Add to list</button>'+
    '</div>'+
    '<div style="margin-top:8px;display:flex;flex-direction:column;gap:4px">'+
      '<input class="lc-name ym-input" placeholder="Product name (optional)" style="font-size:11px">'+
      '<input class="lc-price ym-input" placeholder="Price (optional, e.g. $29.99)" style="font-size:11px">'+
      '<input class="lc-img ym-input" placeholder="Image URL (optional)" style="font-size:11px">'+
      '<textarea class="lc-desc ym-input" placeholder="Description (optional)" style="font-size:11px;height:50px;resize:none"></textarea>'+
    '</div>';

  card.querySelector('.lc-copy').addEventListener('click',()=>{
    navigator.clipboard?.writeText(affLink);window.YM_toast?.('Link copied!','success');
  });
  let qrShown=false;
  card.querySelector('.lc-qr').addEventListener('click',()=>{
    const qrEl=card.querySelector('#'+qrId);
    if(qrShown){qrEl.style.display='none';qrShown=false;return;}
    qrEl.style.display='block';qrEl.innerHTML='';
    _generateQR(qrEl,affLink);qrShown=true;
  });
  card.querySelector('.lc-add').addEventListener('click',()=>{
    const name=card.querySelector('.lc-name').value.trim()||prog.name+' product';
    const products=loadProducts();
    products.unshift({
      id:gid(),name,
      price:card.querySelector('.lc-price').value.trim(),
      affLink,origUrl,
      imageUrl:card.querySelector('.lc-img').value.trim(),
      desc:card.querySelector('.lc-desc').value.trim(),
      program:prog.name,programIcon:prog.icon,
      createdAt:Date.now()
    });
    saveProducts(products);
    window.YM_toast?.('Added to your list!','success');
    card.querySelector('.lc-add').textContent='✓ Added';
    card.querySelector('.lc-add').disabled=true;
    onAdded&&onAdded();
  });
  return card;
}

// ── LIST TAB ──────────────────────────────────────────────────────────────────
function renderList(container){
  container.innerHTML='';
  container.style.cssText='flex:1;display:flex;flex-direction:column;overflow:hidden';
  const hdr=document.createElement('div');
  hdr.style.cssText='flex-shrink:0;display:flex;align-items:center;gap:6px;padding:10px 14px;border-bottom:1px solid var(--border)';
  hdr.innerHTML=
    '<input id="ds-filter" class="ym-input" placeholder="Filter…" style="flex:1;font-size:12px">'+
    '<button id="ds-folder-btn" class="ym-btn ym-btn-ghost" style="font-size:11px;padding:4px 8px" title="Manage folders">📁</button>'+
    '<button id="ds-manual" class="ym-btn ym-btn-ghost" style="font-size:11px;padding:4px 10px">+ Manual</button>';
  container.appendChild(hdr);
  const list=document.createElement('div');
  list.style.cssText='flex:1;overflow-y:auto;padding:8px 14px;display:flex;flex-direction:column;gap:8px';
  container.appendChild(list);

  hdr.querySelector('#ds-folder-btn').addEventListener('click',()=>{
    _showFolderManager(()=>render(hdr.querySelector('#ds-filter').value));
  });

  function render(filter){
    list.innerHTML='';
    var products=loadProducts();
    if(filter)products=products.filter(p=>(p.name+p.program+p.desc).toLowerCase().includes(filter.toLowerCase()));
    if(!products.length){
      list.innerHTML='<div style="color:var(--text3);font-size:12px;padding:16px;text-align:center">'+(filter?'No results.':'No products yet.<br>Go to ➕ Add to generate your first affiliate link.')+'</div>';
      return;
    }
    products.forEach(p=>{
      const card=document.createElement('div');card.className='ym-card';card.style.cssText='padding:10px';
      const qrId='qr-l-'+p.id;
      card.innerHTML=
        '<div style="display:flex;gap:10px">'+
          (p.imageUrl&&p.imageUrl.startsWith('http')
            ?'<img src="'+esc(p.imageUrl)+'" style="width:52px;height:52px;object-fit:cover;border-radius:8px;flex-shrink:0" onerror="this.style.display=\'none\'">'
            :'<div style="width:52px;height:52px;border-radius:8px;background:var(--surface3);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">'+esc(p.programIcon||'🔗')+'</div>')+
          '<div style="flex:1;min-width:0">'+
            '<div style="font-size:10px;color:var(--accent)">'+esc(p.programIcon||'')+'  '+esc(p.program||'')+'</div>'+
            '<div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(p.name)+'</div>'+
            (p.price?'<div style="font-size:12px;color:#30e880">'+esc(p.price)+'</div>':'')+
          '</div>'+
        '</div>'+
        '<div id="'+qrId+'" style="display:none;margin:8px 0;text-align:center"></div>'+
        '<div style="display:flex;gap:5px;margin-top:8px;flex-wrap:wrap">'+
          '<a href="'+esc(p.affLink)+'" target="_blank" class="ym-btn ym-btn-accent" style="font-size:11px;padding:4px 12px;text-decoration:none;flex:1;text-align:center">↗ My link</a>'+
          '<button class="pl-copy ym-btn ym-btn-ghost" style="font-size:11px;padding:4px 8px">⧉</button>'+
          '<button class="pl-qr ym-btn ym-btn-ghost" style="font-size:11px;padding:4px 8px">QR</button>'+
          '<button class="pl-share ym-btn ym-btn-ghost" style="font-size:11px;padding:4px 8px">Share</button>'+
          '<button class="pl-del ym-btn ym-btn-ghost" style="font-size:11px;padding:4px 8px;color:#e84040">×</button>'+
        '</div>';

      card.querySelector('.pl-copy').addEventListener('click',()=>{
        navigator.clipboard?.writeText(p.affLink);window.YM_toast?.('Copied!','success');
      });
      let qrShown=false;
      card.querySelector('.pl-qr').addEventListener('click',()=>{
        const qrEl=card.querySelector('#'+qrId);
        if(qrShown){qrEl.style.display='none';qrShown=false;return;}
        qrEl.style.display='block';qrEl.innerHTML='';
        _generateQR(qrEl,p.affLink);qrShown=true;
      });
      card.querySelector('.pl-share').addEventListener('click',()=>{
        if(navigator.share){navigator.share({title:p.name,text:p.desc||p.name,url:p.affLink}).catch(()=>{});}
        else{navigator.clipboard?.writeText(p.affLink);window.YM_toast?.('Link copied!','success');}
      });
      card.querySelector('.pl-del').addEventListener('click',()=>{
        if(!confirm('Remove "'+p.name+'"?'))return;
        saveProducts(loadProducts().filter(x=>x.id!==p.id));render(hdr.querySelector('#ds-filter').value);
      });
      list.appendChild(card);
    });
  }

  hdr.querySelector('#ds-filter').addEventListener('input',e=>render(e.target.value));
  hdr.querySelector('#ds-manual').addEventListener('click',()=>{
    _showManualForm(()=>render(''));
  });
  render('');
}

function _showManualForm(onDone){
  const overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;z-index:9990;background:rgba(0,0,0,.75);display:flex;align-items:flex-end;justify-content:center';
  const box=document.createElement('div');
  box.style.cssText='background:var(--surface2);border-radius:var(--r-lg) var(--r-lg) 0 0;padding:20px;width:100%;max-width:500px;max-height:85vh;overflow-y:auto';
  box.innerHTML=
    '<div style="font-size:14px;font-weight:600;margin-bottom:14px">Add Manually</div>'+
    '<div style="display:flex;flex-direction:column;gap:8px">'+
      '<input id="mf-name" class="ym-input" placeholder="Product name *" style="font-size:13px">'+
      '<input id="mf-url" class="ym-input" placeholder="Affiliate link URL *" style="font-size:13px">'+
      '<input id="mf-price" class="ym-input" placeholder="Price" style="font-size:13px">'+
      '<input id="mf-img" class="ym-input" placeholder="Image URL" style="font-size:13px">'+
      '<textarea id="mf-desc" class="ym-input" placeholder="Description" style="height:60px;resize:none;font-size:13px"></textarea>'+
      '<input id="mf-prog" class="ym-input" placeholder="Program name (e.g. Amazon)" style="font-size:13px">'+
    '</div>'+
    '<div style="display:flex;gap:8px;margin-top:14px">'+
      '<button id="mf-cancel" class="ym-btn ym-btn-ghost" style="flex:1">Cancel</button>'+
      '<button id="mf-save" class="ym-btn ym-btn-accent" style="flex:1">Save</button>'+
    '</div>';
  overlay.appendChild(box);document.body.appendChild(overlay);
  overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove();});
  box.querySelector('#mf-cancel').addEventListener('click',()=>overlay.remove());
  box.querySelector('#mf-save').addEventListener('click',()=>{
    const name=box.querySelector('#mf-name').value.trim();
    const affLink=box.querySelector('#mf-url').value.trim();
    if(!name||!affLink){window.YM_toast?.('Name and URL required','error');return;}
    const products=loadProducts();
    products.unshift({id:gid(),name,affLink,origUrl:affLink,
      price:box.querySelector('#mf-price').value.trim(),
      imageUrl:box.querySelector('#mf-img').value.trim(),
      desc:box.querySelector('#mf-desc').value.trim(),
      program:box.querySelector('#mf-prog').value.trim(),
      programIcon:'🔗',createdAt:Date.now()});
    saveProducts(products);
    overlay.remove();onDone&&onDone();
    window.YM_toast?.('Saved','success');
  });
}

// ── QR CODE ───────────────────────────────────────────────────────────────────
function _generateQR(container,url){
  if(window.QRCode){new window.QRCode(container,{text:url,width:140,height:140,correctLevel:QRCode.CorrectLevel.M});return;}
  const s=document.createElement('script');
  s.src='https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
  s.onload=()=>new window.QRCode(container,{text:url,width:140,height:140,correctLevel:QRCode.CorrectLevel.M});
  document.head.appendChild(s);
}

// ── SETTINGS TAB ──────────────────────────────────────────────────────────────
function renderSettings(container){
  container.innerHTML='';
  container.style.cssText='flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px';
  const settings=loadSettings();

  // Filtre par catégorie
  const cats=[...new Set(PROGRAMS.map(p=>p.category))];
  let activeCat='All';
  const catBar=document.createElement('div');
  catBar.style.cssText='display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px';
  function renderCats(){
    catBar.innerHTML='';
    ['All',...cats].forEach(cat=>{
      const btn=document.createElement('button');
      btn.className='ym-btn ym-btn-ghost';
      btn.style.cssText='font-size:10px;padding:3px 8px'+(cat===activeCat?';background:var(--accent);color:#000':'');
      btn.textContent=cat;
      btn.addEventListener('click',()=>{activeCat=cat;renderCats();renderPrograms();});
      catBar.appendChild(btn);
    });
  }
  container.appendChild(catBar);
  renderCats();

  const progList=document.createElement('div');
  progList.style.cssText='display:flex;flex-direction:column;gap:10px';
  container.appendChild(progList);

  function renderPrograms(){
    progList.innerHTML='';
    const filtered=PROGRAMS.filter(p=>activeCat==='All'||p.category===activeCat);
    filtered.forEach(prog=>{
      const cfg=settings[prog.id]||{};
      const isActive=Object.values(cfg).some(v=>v);
      const card=document.createElement('div');card.className='ym-card';card.style.cssText='padding:12px';
      card.innerHTML=
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">'+
          '<span style="font-size:20px">'+prog.icon+'</span>'+
          '<div style="flex:1">'+
            '<div style="font-size:13px;font-weight:600">'+esc(prog.name)+'</div>'+
            '<div style="font-size:10px;color:var(--text3)">'+esc(prog.category)+' · '+esc(prog.commission)+'</div>'+
          '</div>'+
          '<div style="width:8px;height:8px;border-radius:50%;background:'+(isActive?'#30e880':'var(--surface3)')+';flex-shrink:0"></div>'+
        '</div>'+
        prog.fields.map(f=>
          '<div style="margin-bottom:6px">'+
            '<label style="font-size:10px;color:var(--text3);display:block;margin-bottom:3px">'+esc(f.label)+(f.tip?'<span style="color:var(--text3)"> — '+esc(f.tip)+'</span>':'')+'</label>'+
            '<input class="pf-field ym-input" data-key="'+f.key+'" placeholder="'+esc(f.placeholder)+'" value="'+esc(cfg[f.key]||'')+'" style="width:100%;font-size:12px;font-family:var(--font-m)">'+
          '</div>'
        ).join('')+
        '<div style="display:flex;gap:6px;margin-top:6px">'+
          (prog.signup?'<a href="'+esc(prog.signup)+'" target="_blank" class="ym-btn ym-btn-ghost" style="font-size:11px;text-decoration:none;padding:4px 10px">↗ Sign up</a>':'')+
          '<button class="pf-save ym-btn ym-btn-accent" style="font-size:11px;flex:1">Save</button>'+
          (isActive?'<button class="pf-clear ym-btn ym-btn-ghost" style="font-size:11px;color:#e84040">Clear</button>':'')+
        '</div>';

      card.querySelector('.pf-save').addEventListener('click',()=>{
        const updated={...settings};updated[prog.id]=updated[prog.id]||{};
        card.querySelectorAll('.pf-field').forEach(inp=>{updated[prog.id][inp.dataset.key]=inp.value.trim();});
        saveSettings(updated);
        window.YM_toast?.('Saved '+prog.name,'success');
        const dot=card.querySelector('div[style*="border-radius:50%"]');
        if(dot){dot.style.background=Object.values(updated[prog.id]).some(v=>v)?'#30e880':'var(--surface3)';}
      });
      card.querySelector('.pf-clear')?.addEventListener('click',()=>{
        const updated={...settings};delete updated[prog.id];saveSettings(updated);
        renderPrograms();
      });
      progList.appendChild(card);
    });
  }
  renderPrograms();
}

// ── LISTE CONFIG (titre + bandeau + dossiers) ─────────────────────────────
const LIST_META_KEY='ym_drop_listmeta_v1';
const FOLDERS_KEY='ym_drop_folders_v1';
function loadListMeta(){try{return JSON.parse(localStorage.getItem(LIST_META_KEY)||'{"title":"My Picks","banner":""}');}catch(e){return{title:'My Picks',banner:''};}}
function saveListMeta(d){localStorage.setItem(LIST_META_KEY,JSON.stringify(d));}
function loadFolders(){try{return JSON.parse(localStorage.getItem(FOLDERS_KEY)||'[]');}catch(e){return[];}}
function saveFolders(d){localStorage.setItem(FOLDERS_KEY,JSON.stringify(d));}

// Assigne un produit à un dossier
function setProductFolder(productId,folderId){
  var prods=loadProducts();
  var p=prods.find(function(x){return x.id===productId;});
  if(p){p.folderId=folderId;saveProducts(prods);}
}

// ── SPHERE ────────────────────────────────────────────────────────────────────
window.YM_S['dropsharing.sphere.js']={
  name:'Dropsharing',icon:'🔗',category:'Commerce',
  description:'Paste any product URL → instant affiliate link → share & earn',
  emit:[],receive:[],

  activate(ctx){
    const n=loadProducts().length;if(n>0)ctx.setNotification(n);
  },
  deactivate(){},
  renderPanel,

  // ── Config liste dans le profil ───────────────────────────────────────────
  profileSection(container){
    const meta=loadListMeta();
    const folders=loadFolders();
    const prods=loadProducts();
    const wrap=document.createElement('div');
    wrap.style.cssText='display:flex;flex-direction:column;gap:10px';

    // ── Bandeau + titre ───────────────────────────────────────────────────
    const header=document.createElement('div');
    header.style.cssText='position:relative;border-radius:10px;overflow:hidden;min-height:70px;background:var(--surface3);cursor:pointer';
    if(meta.banner){
      header.style.backgroundImage='url('+meta.banner+')';
      header.style.backgroundSize='cover';header.style.backgroundPosition='center';
    }
    header.innerHTML=
      '<div style="position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,.1),rgba(0,0,0,.65))"></div>'+
      '<div style="position:relative;padding:12px;display:flex;align-items:flex-end;justify-content:space-between;min-height:70px">'+
        '<div style="font-size:15px;font-weight:700;color:#fff;text-shadow:0 1px 4px rgba(0,0,0,.5)">'+esc(meta.title||'My Picks')+'</div>'+
        '<div style="display:flex;gap:6px">'+
          '<button id="ds-ps-banner" class="ym-btn ym-btn-ghost" style="font-size:10px;padding:3px 8px;background:rgba(0,0,0,.4);border-color:rgba(255,255,255,.3)">🖼 Banner</button>'+
          '<button id="ds-ps-edit" class="ym-btn ym-btn-ghost" style="font-size:10px;padding:3px 8px;background:rgba(0,0,0,.4);border-color:rgba(255,255,255,.3)">✏ Edit</button>'+
        '</div>'+
      '</div>';
    wrap.appendChild(header);

    // Upload bannière
    header.querySelector('#ds-ps-banner').addEventListener('click',function(e){
      e.stopPropagation();
      const inp=document.createElement('input');inp.type='file';inp.accept='image/*';
      inp.addEventListener('change',function(){
        const file=inp.files[0];if(!file)return;
        const reader=new FileReader();
        reader.onload=function(ev){
          saveListMeta({...loadListMeta(),banner:ev.target.result});
          header.style.backgroundImage='url('+ev.target.result+')';
          window.YM_toast&&window.YM_toast('Banner updated','success');
        };
        reader.readAsDataURL(file);
      });
      inp.click();
    });

    // Edit titre
    header.querySelector('#ds-ps-edit').addEventListener('click',function(e){
      e.stopPropagation();
      var overlay=document.createElement('div');
      overlay.style.cssText='position:fixed;inset:0;z-index:9990;background:rgba(0,0,0,.75);display:flex;align-items:flex-end;justify-content:center';
      var box=document.createElement('div');
      box.style.cssText='background:var(--surface2);border-radius:var(--r-lg) var(--r-lg) 0 0;padding:20px;width:100%;max-width:500px';
      var m=loadListMeta();
      box.innerHTML=
        '<div style="font-size:14px;font-weight:600;margin-bottom:12px">List title</div>'+
        '<input id="ds-meta-title" class="ym-input" style="width:100%;font-size:13px;margin-bottom:14px" value="'+esc(m.title||'My Picks')+'">'+
        '<div style="display:flex;gap:8px">'+
          '<button id="ds-meta-cancel" class="ym-btn ym-btn-ghost" style="flex:1">Cancel</button>'+
          '<button id="ds-meta-save" class="ym-btn ym-btn-accent" style="flex:1">Save</button>'+
        '</div>';
      overlay.appendChild(box);document.body.appendChild(overlay);
      overlay.addEventListener('click',function(ev){if(ev.target===overlay)overlay.remove();});
      box.querySelector('#ds-meta-cancel').addEventListener('click',function(){overlay.remove();});
      box.querySelector('#ds-meta-save').addEventListener('click',function(){
        saveListMeta({...loadListMeta(),title:box.querySelector('#ds-meta-title').value.trim()||'My Picks'});
        overlay.remove();
        wrap.remove();var nw=document.createElement('div');container.appendChild(nw);
        window.YM_S['dropsharing.sphere.js'].profileSection(nw);
      });
    });

    // ── Config comptes affiliés ────────────────────────────────────────────
    const cfgBtn=document.createElement('button');
    cfgBtn.className='ym-btn ym-btn-ghost';cfgBtn.style.cssText='width:100%;font-size:12px';
    cfgBtn.textContent='⚙ Configure affiliate accounts ('+Object.keys(loadSettings()).filter(k=>Object.values(loadSettings()[k]||{}).some(v=>v)).length+' active)';
    cfgBtn.addEventListener('click',function(){_showAffiliateConfig(function(){
      cfgBtn.textContent='⚙ Configure affiliate accounts ('+Object.keys(loadSettings()).filter(k=>Object.values(loadSettings()[k]||{}).some(v=>v)).length+' active)';
    });});
    wrap.appendChild(cfgBtn);

    // ── Produits + dossiers ────────────────────────────────────────────────
    if(!prods.length){
      var empty=document.createElement('div');empty.style.cssText='font-size:11px;color:var(--text3)';
      empty.textContent='No affiliate products yet. Open 🔗 Dropsharing → ➕ Add.';
      wrap.appendChild(empty);
    }else{
      var unfoldered=prods.filter(function(p){return !p.folderId;});
      if(unfoldered.length)_renderProductsMini(wrap,unfoldered,null);
      folders.forEach(function(f){
        var fp=prods.filter(function(p){return p.folderId===f.id;});
        if(!fp.length)return;
        var fWrap=document.createElement('div');
        fWrap.style.cssText='border:1px solid var(--border);border-radius:8px;overflow:hidden';
        var fHdr=document.createElement('div');
        fHdr.style.cssText='display:flex;align-items:center;gap:8px;padding:7px 10px;background:rgba(255,255,255,.03);cursor:pointer';
        fHdr.innerHTML='<span>📁</span><span style="font-size:12px;font-weight:600;flex:1">'+esc(f.name)+'</span><span style="font-size:10px;color:var(--text3)">'+fp.length+'</span><span class="fa" style="font-size:10px;color:var(--text3)">›</span>';
        var fBody=document.createElement('div');fBody.style.cssText='display:none;padding:0 8px 8px';
        _renderProductsMini(fBody,fp,f.id);
        fHdr.addEventListener('click',function(){var open=fBody.style.display!=='none';fBody.style.display=open?'none':'block';fHdr.querySelector('.fa').textContent=open?'›':'⌄';});
        fWrap.appendChild(fHdr);fWrap.appendChild(fBody);wrap.appendChild(fWrap);
      });

      var folderBtn=document.createElement('button');
      folderBtn.className='ym-btn ym-btn-ghost';folderBtn.style.cssText='font-size:11px;width:100%';
      folderBtn.textContent='📁 Manage folders';
      folderBtn.addEventListener('click',function(){_showFolderManager(function(){
        wrap.remove();var nw=document.createElement('div');container.appendChild(nw);
        window.YM_S['dropsharing.sphere.js'].profileSection(nw);
      });});
      wrap.appendChild(folderBtn);
    }

    container.appendChild(wrap);
  },

  peerSection(container,ctx){
    // Vue visiteur : bannière + liste produits
    const meta=loadListMeta();
    const prods=loadProducts();
    const folders=loadFolders();
    if(!prods.length){
      var el=document.createElement('div');el.style.cssText='font-size:11px;color:var(--text3)';el.textContent='🔗 No products shared yet.';container.appendChild(el);return;
    }
    const wrap=document.createElement('div');wrap.style.cssText='display:flex;flex-direction:column;gap:6px';
    // Mini bannière
    const hdr=document.createElement('div');
    hdr.style.cssText='border-radius:8px;overflow:hidden;min-height:48px;background:var(--surface3);position:relative';
    if(meta.banner){hdr.style.backgroundImage='url('+meta.banner+')';hdr.style.backgroundSize='cover';hdr.style.backgroundPosition='center';}
    hdr.innerHTML='<div style="position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,.1),rgba(0,0,0,.6))"></div>'+
      '<div style="position:relative;padding:8px 10px;font-size:13px;font-weight:700;color:#fff">'+esc(meta.title||'My Picks')+'</div>';
    wrap.appendChild(hdr);
    var unfoldered=prods.filter(function(p){return !p.folderId;});
    if(unfoldered.length)_renderProductsMini(wrap,unfoldered,null);
    folders.forEach(function(f){
      var fp=prods.filter(function(p){return p.folderId===f.id;});
      if(!fp.length)return;
      var row=document.createElement('div');row.style.cssText='font-size:11px;color:var(--text3);padding:4px 0';row.textContent='📁 '+f.name+' ('+fp.length+')';
      wrap.appendChild(row);
      _renderProductsMini(wrap,fp,f.id);
    });
    container.appendChild(wrap);
  }
};

function _showAffiliateConfig(onDone){
  var overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;z-index:9990;background:rgba(0,0,0,.8);display:flex;align-items:flex-end;justify-content:center';
  var box=document.createElement('div');
  box.style.cssText='background:var(--surface2);border-radius:var(--r-lg) var(--r-lg) 0 0;width:100%;max-width:500px;max-height:90vh;display:flex;flex-direction:column';
  overlay.appendChild(box);document.body.appendChild(overlay);
  overlay.addEventListener('click',function(e){if(e.target===overlay){overlay.remove();if(onDone)onDone();}});

  var inner=document.createElement('div');
  inner.style.cssText='flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px';
  box.innerHTML=
    '<div style="display:flex;align-items:center;padding:16px 16px 0">'+
      '<div style="font-size:14px;font-weight:600;flex:1">Affiliate Accounts</div>'+
      '<button id="aff-close" style="background:none;border:none;color:var(--text3);font-size:20px;cursor:pointer;padding:0">✕</button>'+
    '</div>';
  box.querySelector('#aff-close').addEventListener('click',function(){overlay.remove();if(onDone)onDone();});
  box.appendChild(inner);

  var settings=loadSettings();
  var cats=[...new Set(PROGRAMS.map(function(p){return p.category;}))];
  var activeCat='All';

  function renderCats(){
    var catBar=inner.querySelector('#aff-catbar')||document.createElement('div');
    catBar.id='aff-catbar';catBar.style.cssText='display:flex;gap:4px;flex-wrap:wrap;margin-bottom:4px;flex-shrink:0';
    catBar.innerHTML='';
    ['All',...cats].forEach(function(cat){
      var btn=document.createElement('button');btn.className='ym-btn ym-btn-ghost';
      btn.style.cssText='font-size:10px;padding:2px 8px'+(cat===activeCat?';background:var(--accent);color:#000':'');
      btn.textContent=cat;
      btn.addEventListener('click',function(){activeCat=cat;renderProgs();});
      catBar.appendChild(btn);
    });
    if(!inner.querySelector('#aff-catbar'))inner.appendChild(catBar);
  }

  var progContainer=document.createElement('div');progContainer.style.cssText='display:flex;flex-direction:column;gap:8px';
  inner.appendChild(progContainer);

  function renderProgs(){
    renderCats();
    progContainer.innerHTML='';
    PROGRAMS.filter(function(p){return activeCat==='All'||p.category===activeCat;}).forEach(function(prog){
      var cfg=settings[prog.id]||{};
      var isActive=Object.values(cfg).some(function(v){return v;});
      var card=document.createElement('div');card.className='ym-card';card.style.cssText='padding:10px';
      card.innerHTML=
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">'+
          '<span style="font-size:18px">'+prog.icon+'</span>'+
          '<div style="flex:1"><div style="font-size:12px;font-weight:600">'+esc(prog.name)+'</div>'+
          '<div style="font-size:10px;color:var(--text3)">'+esc(prog.category)+' · '+esc(prog.commission)+'</div></div>'+
          '<div style="width:7px;height:7px;border-radius:50%;background:'+(isActive?'#30e880':'var(--surface3)')+'"></div>'+
        '</div>'+
        prog.fields.map(function(f){return '<div style="margin-bottom:5px"><label style="font-size:10px;color:var(--text3);display:block;margin-bottom:2px">'+esc(f.label)+'</label>'+
          '<input class="pf-field ym-input" data-key="'+f.key+'" placeholder="'+esc(f.placeholder)+'" value="'+esc(cfg[f.key]||'')+'" style="width:100%;font-size:11px;font-family:var(--font-m)"></div>';}).join('')+
        '<div style="display:flex;gap:5px;margin-top:4px">'+
          (prog.signup?'<a href="'+esc(prog.signup)+'" target="_blank" class="ym-btn ym-btn-ghost" style="font-size:10px;text-decoration:none;padding:3px 8px">↗ Sign up</a>':'')+
          '<button class="pf-save ym-btn ym-btn-accent" style="font-size:11px;flex:1">Save</button>'+
          (isActive?'<button class="pf-clear ym-btn ym-btn-ghost" style="font-size:10px;color:#e84040;padding:3px 8px">×</button>':'')+
        '</div>';
      card.querySelector('.pf-save').addEventListener('click',function(){
        settings=loadSettings();settings[prog.id]=settings[prog.id]||{};
        card.querySelectorAll('.pf-field').forEach(function(inp){settings[prog.id][inp.dataset.key]=inp.value.trim();});
        saveSettings(settings);
        window.YM_toast&&window.YM_toast('Saved '+prog.name,'success');
        renderProgs();
      });
      card.querySelector('.pf-clear')&&card.querySelector('.pf-clear').addEventListener('click',function(){
        settings=loadSettings();delete settings[prog.id];saveSettings(settings);renderProgs();
      });
      progContainer.appendChild(card);
    });
  }
  renderProgs();
}

function _renderProductsMini(container,prods,folderId){
  prods.slice(0,6).forEach(function(p){
    var a=document.createElement('a');a.href=p.affLink;a.target='_blank';
    a.style.cssText='display:flex;align-items:center;gap:8px;padding:6px 4px;border-bottom:1px solid rgba(255,255,255,.04);text-decoration:none;cursor:pointer';
    a.innerHTML=
      (p.imageUrl&&p.imageUrl.startsWith('http')
        ?'<img src="'+esc(p.imageUrl)+'" style="width:32px;height:32px;object-fit:cover;border-radius:5px;flex-shrink:0" onerror="this.style.display=\'none\'">'
        :'<div style="width:32px;height:32px;border-radius:5px;background:var(--surface3);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">'+esc(p.programIcon||'🔗')+'</div>')+
      '<div style="flex:1;min-width:0">'+
        '<div style="font-size:12px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(p.name)+'</div>'+
        (p.price?'<div style="font-size:10px;color:#30e880">'+esc(p.price)+'</div>':'')+
      '</div>'+
      '<span style="font-size:10px;color:var(--accent)">→</span>';
    container.appendChild(a);
  });
  if(prods.length>6){
    var more=document.createElement('div');
    more.style.cssText='font-size:10px;color:var(--text3);padding:4px';
    more.textContent='+'+(prods.length-6)+' more';
    container.appendChild(more);
  }
}

function _showFolderManager(onDone){
  var overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;z-index:9990;background:rgba(0,0,0,.75);display:flex;align-items:flex-end;justify-content:center';
  var box=document.createElement('div');
  box.style.cssText='background:var(--surface2);border-radius:var(--r-lg) var(--r-lg) 0 0;padding:20px;width:100%;max-width:500px;max-height:85vh;overflow-y:auto';
  overlay.appendChild(box);document.body.appendChild(overlay);
  overlay.addEventListener('click',function(e){if(e.target===overlay){overlay.remove();onDone&&onDone();}});

  function renderMgr(){
    box.innerHTML='<div style="font-size:14px;font-weight:600;margin-bottom:12px">Manage Folders</div>';
    var folders=loadFolders();
    var prods=loadProducts();

    // Nouvelle dossier
    var addRow=document.createElement('div');
    addRow.style.cssText='display:flex;gap:6px;margin-bottom:12px';
    addRow.innerHTML=
      '<input id="fm-new" class="ym-input" placeholder="New folder name…" style="flex:1;font-size:12px">'+
      '<button id="fm-add" class="ym-btn ym-btn-accent" style="font-size:12px">+ Add</button>';
    addRow.querySelector('#fm-add').addEventListener('click',function(){
      var name=addRow.querySelector('#fm-new').value.trim();
      if(!name)return;
      var f=loadFolders();f.push({id:gid(),name:name});saveFolders(f);
      addRow.querySelector('#fm-new').value='';renderMgr();
    });
    box.appendChild(addRow);

    // Liste dossiers avec leurs produits
    folders.forEach(function(f){
      var fCard=document.createElement('div');fCard.className='ym-card';fCard.style.cssText='margin-bottom:8px;padding:10px';
      fCard.innerHTML=
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">'+
          '<span>📁</span>'+
          '<span style="font-size:13px;font-weight:600;flex:1">'+esc(f.name)+'</span>'+
          '<button data-delf="'+f.id+'" class="ym-btn ym-btn-ghost" style="font-size:11px;color:#e84040;padding:2px 8px">Delete</button>'+
        '</div>';
      var folderProds=prods.filter(function(p){return p.folderId===f.id;});
      var unfoldered=prods.filter(function(p){return !p.folderId;});
      // Produits dans ce dossier
      folderProds.forEach(function(p){
        var row=document.createElement('div');
        row.style.cssText='display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.04)';
        row.innerHTML=
          '<span style="font-size:12px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(p.name)+'</span>'+
          '<button data-remove="'+p.id+'" class="ym-btn ym-btn-ghost" style="font-size:10px;padding:2px 6px">↑ Remove</button>';
        row.querySelector('[data-remove]').addEventListener('click',function(){setProductFolder(p.id,null);renderMgr();});
        fCard.appendChild(row);
      });
      // Ajouter produit non assigné
      if(unfoldered.length){
        var sel=document.createElement('select');
        sel.className='ym-input';sel.style.cssText='width:100%;font-size:11px;margin-top:6px';
        sel.innerHTML='<option value="">+ Add product to this folder…</option>'+
          unfoldered.map(function(p){return '<option value="'+p.id+'">'+esc(p.name)+'</option>';}).join('');
        sel.addEventListener('change',function(){
          if(!sel.value)return;setProductFolder(sel.value,f.id);renderMgr();
        });
        fCard.appendChild(sel);
      }
      fCard.querySelector('[data-delf]').addEventListener('click',function(){
        // Désassigne les produits du dossier supprimé
        var ps=loadProducts();ps.forEach(function(p){if(p.folderId===f.id)p.folderId=null;});saveProducts(ps);
        var fs=loadFolders().filter(function(x){return x.id!==f.id;});saveFolders(fs);renderMgr();
      });
      box.appendChild(fCard);
    });

    var closeBtn=document.createElement('button');
    closeBtn.className='ym-btn ym-btn-ghost';closeBtn.style.cssText='width:100%;margin-top:8px';closeBtn.textContent='Done';
    closeBtn.addEventListener('click',function(){overlay.remove();onDone&&onDone();});
    box.appendChild(closeBtn);
  }
  renderMgr();
}
})();
