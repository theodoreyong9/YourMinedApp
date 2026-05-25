/* finance.sphere.js — Finance sphere for YourMine
   Uses CoinGecko API (no key) for crypto + exchangerate-api for forex
*/
(function(){
'use strict';
window.YM_S = window.YM_S || {};

const SPHERE_ID = 'finance.sphere.js';
let _ctx = null;
let _timer = null;
let _prices = null;
let _forex = null;
let _watchlist = [];
let _tab = 'crypto'; // crypto | forex | portfolio

const DEFAULT_CRYPTO = ['bitcoin','ethereum','solana','sui','avalanche-2'];
const FOREX_PAIRS = ['USD','EUR','GBP','JPY','CHF','CAD','AUD','SGD'];

function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

function loadWatchlist(){
  try{return JSON.parse(localStorage.getItem('finance_watchlist')||'null')||DEFAULT_CRYPTO.slice();}
  catch{return DEFAULT_CRYPTO.slice();}
}
function saveWatchlist(){localStorage.setItem('finance_watchlist',JSON.stringify(_watchlist));}

function formatPrice(n){
  if(n>=1000)return n.toLocaleString('en',{maximumFractionDigits:0});
  if(n>=1)return n.toLocaleString('en',{maximumFractionDigits:2});
  if(n>=0.01)return n.toFixed(4);
  return n.toFixed(6);
}
function formatChange(n){
  const sign=n>=0?'+':'';
  return sign+n.toFixed(2)+'%';
}
function changeColor(n){return n>=0?'var(--green,#22d98a)':'var(--red,#ff4560)';}

// ── Fetch ──
async function fetchCrypto(){
  const ids=_watchlist.join(',');
  const url=`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&price_change_percentage=1h,24h,7d&sparkline=false`;
  const r=await fetch(url);
  if(!r.ok)throw new Error('CoinGecko error '+r.status);
  return r.json();
}

async function fetchForex(){
  const r=await fetch('https://open.er-api.com/v6/latest/USD');
  if(!r.ok)throw new Error('Forex API error');
  const d=await r.json();
  return d.rates;
}

async function refresh(){
  try{
    const [crypto,forex]=await Promise.allSettled([fetchCrypto(),fetchForex()]);
    if(crypto.status==='fulfilled')_prices=crypto.value;
    if(forex.status==='fulfilled')_forex=forex.value;
    // Badge = number of assets with >5% 24h change
    if(_prices&&_ctx){
      const alerts=_prices.filter(p=>Math.abs(p.price_change_percentage_24h)>5).length;
      _ctx.setNotification(alerts);
    }
  }catch(e){
    if(_ctx)_ctx.toast(e.message,'error');
  }
}

// ── Portfolio ──
function loadPortfolio(){try{return JSON.parse(localStorage.getItem('finance_portfolio')||'{}');}catch{return{};}}
function savePortfolio(p){localStorage.setItem('finance_portfolio',JSON.stringify(p));}

// ── Render ──
function renderPanel(container){
  container.innerHTML='';
  container.style.cssText='flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0';

  // Tab bar
  const tabs=document.createElement('div');
  tabs.style.cssText='display:flex;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0;background:rgba(0,0,0,.2)';
  [{id:'crypto',label:'⬡ Crypto'},{id:'forex',label:'💱 Forex'},{id:'portfolio',label:'💼 Portfolio'}].forEach(t=>{
    const tab=document.createElement('div');
    tab.style.cssText='flex:1;padding:12px 4px 10px;text-align:center;font-size:10px;font-family:var(--font-m,monospace);cursor:pointer;transition:all .15s;border-top:2px solid '+(t.id===_tab?'var(--gold,#f0a830)':'transparent')+';color:'+(_tab===t.id?'var(--gold,#f0a830)':'rgba(255,255,255,.35)');
    tab.textContent=t.label;
    tab.addEventListener('click',()=>{_tab=t.id;renderPanel(container);});
    tabs.appendChild(tab);
  });
  container.appendChild(tabs);

  const body=document.createElement('div');
  body.style.cssText='flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;min-height:0';
  container.appendChild(body);

  if(_tab==='crypto') renderCrypto(body);
  else if(_tab==='forex') renderForex(body);
  else renderPortfolio(body);
}

function renderCrypto(body){
  // Header toolbar
  const toolbar=document.createElement('div');
  toolbar.style.cssText='display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.04)';
  toolbar.innerHTML=
    '<input id="fin-search" placeholder="Add coin (e.g. cardano)…" style="flex:1;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:7px 10px;color:var(--text,#e4e6f4);font-size:11px;outline:none;font-family:var(--font-m,monospace)">'+
    '<button id="fin-add" style="background:rgba(240,168,48,.1);border:1px solid rgba(240,168,48,.3);border-radius:8px;color:var(--gold,#f0a830);font-size:13px;padding:6px 12px;cursor:pointer">+</button>'+
    '<button id="fin-refresh" style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:8px;color:var(--text2);font-size:14px;padding:6px 10px;cursor:pointer">⟳</button>';
  body.appendChild(toolbar);

  toolbar.querySelector('#fin-add').addEventListener('click',async()=>{
    const inp=toolbar.querySelector('#fin-search');
    const val=inp.value.trim().toLowerCase().replace(/\s+/g,'-');
    if(!val)return;
    if(_watchlist.indexOf(val)===-1){_watchlist.push(val);saveWatchlist();}
    inp.value='';
    await refresh();renderPanel(body.parentElement);
  });
  toolbar.querySelector('#fin-search').addEventListener('keydown',e=>{if(e.key==='Enter')toolbar.querySelector('#fin-add').click();});
  toolbar.querySelector('#fin-refresh').addEventListener('click',async()=>{await refresh();renderPanel(body.parentElement);});

  if(!_prices){
    body.innerHTML+='<div style="padding:32px;text-align:center;font-size:11px;color:var(--text3);font-family:var(--font-m,monospace)">Loading prices…</div>';
    refresh().then(()=>renderPanel(body.parentElement));
    return;
  }

  // Price list
  const list=document.createElement('div');
  body.appendChild(list);
  _prices.forEach(coin=>{
    const row=document.createElement('div');
    row.style.cssText='display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.04);cursor:pointer;transition:background .15s';
    row.innerHTML=
      '<img src="'+esc(coin.image)+'" style="width:32px;height:32px;border-radius:50%;flex-shrink:0" alt="">'+
      '<div style="flex:1;min-width:0">'+
        '<div style="font-size:13px;font-weight:600;color:var(--text)">'+esc(coin.symbol.toUpperCase())+'</div>'+
        '<div style="font-size:10px;color:var(--text3)">'+esc(coin.name)+'</div>'+
      '</div>'+
      '<div style="text-align:right;flex-shrink:0">'+
        '<div style="font-size:13px;font-family:var(--font-m,monospace);color:var(--text)">$'+formatPrice(coin.current_price)+'</div>'+
        '<div style="font-size:10px;font-family:var(--font-m,monospace);color:'+changeColor(coin.price_change_percentage_24h)+'">'+formatChange(coin.price_change_percentage_24h||0)+' 24h</div>'+
      '</div>'+
      '<button data-remove="'+esc(coin.id)+'" style="background:none;border:none;color:rgba(255,69,96,.4);font-size:14px;cursor:pointer;padding:4px;flex-shrink:0">✕</button>';
    row.querySelector('[data-remove]').addEventListener('click',e=>{
      e.stopPropagation();
      _watchlist=_watchlist.filter(id=>id!==coin.id);
      saveWatchlist();
      refresh().then(()=>renderPanel(body.parentElement));
    });
    // Click to expand
    row.addEventListener('click',()=>toggleExpand(row,coin));
    list.appendChild(row);
  });
}

function toggleExpand(row,coin){
  const existing=row.nextElementSibling;
  if(existing&&existing.dataset.expand){existing.remove();return;}
  const detail=document.createElement('div');
  detail.dataset.expand='1';
  detail.style.cssText='padding:10px 14px 12px;background:rgba(240,168,48,.03);border-bottom:1px solid rgba(255,255,255,.04);display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px';
  [
    {label:'Market Cap',val:'$'+((coin.market_cap||0)/1e9).toFixed(2)+'B'},
    {label:'Volume 24h',val:'$'+((coin.total_volume||0)/1e6).toFixed(0)+'M'},
    {label:'7d Change',val:formatChange(coin.price_change_percentage_7d_in_currency||0),color:changeColor(coin.price_change_percentage_7d_in_currency||0)},
    {label:'High 24h',val:'$'+formatPrice(coin.high_24h||0)},
    {label:'Low 24h',val:'$'+formatPrice(coin.low_24h||0)},
    {label:'Rank',val:'#'+(coin.market_cap_rank||'—')},
  ].forEach(item=>{
    const cell=document.createElement('div');
    cell.innerHTML='<div style="font-size:8px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;font-family:var(--font-m,monospace);margin-bottom:3px">'+item.label+'</div>'+
      '<div style="font-size:11px;font-family:var(--font-m,monospace);color:'+(item.color||'var(--text)')+'">'+item.val+'</div>';
    detail.appendChild(cell);
  });
  row.after(detail);
}

function renderForex(body){
  if(!_forex){
    body.innerHTML='<div style="padding:32px;text-align:center;font-size:11px;color:var(--text3);font-family:var(--font-m,monospace)">Loading rates…</div>';
    refresh().then(()=>renderPanel(body.parentElement));
    return;
  }
  const title=document.createElement('div');
  title.style.cssText='font-family:var(--font-d,inherit);font-size:8px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(240,168,48,.55);padding:12px 14px 6px';
  title.textContent='Exchange rates (base: USD)';
  body.appendChild(title);

  FOREX_PAIRS.forEach(currency=>{
    if(currency==='USD')return;
    const rate=_forex[currency];
    if(!rate)return;
    const row=document.createElement('div');
    row.style.cssText='display:flex;align-items:center;padding:11px 14px;border-bottom:1px solid rgba(255,255,255,.04)';
    row.innerHTML=
      '<div style="flex:1;font-size:13px;font-weight:600;color:var(--text)">USD / '+currency+'</div>'+
      '<div style="font-size:14px;font-family:var(--font-m,monospace);color:var(--text)">'+rate.toFixed(4)+'</div>';
    body.appendChild(row);
  });

  const note=document.createElement('div');
  note.style.cssText='padding:10px 14px;font-size:9px;color:var(--text3);font-family:var(--font-m,monospace)';
  note.textContent='Rates from open.er-api.com · Updated daily';
  body.appendChild(note);
}

function renderPortfolio(body){
  const portfolio=loadPortfolio();
  const header=document.createElement('div');
  header.style.cssText='font-family:var(--font-d,inherit);font-size:8px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(240,168,48,.55);padding:12px 14px 6px';
  header.textContent='My portfolio';
  body.appendChild(header);

  // Add position
  const addRow=document.createElement('div');
  addRow.style.cssText='display:flex;gap:6px;padding:8px 14px;border-bottom:1px solid rgba(255,255,255,.06)';
  addRow.innerHTML=
    '<input id="port-coin" placeholder="coin id (e.g. bitcoin)" style="flex:2;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:6px;padding:6px 8px;color:var(--text);font-size:10px;outline:none;font-family:var(--font-m,monospace)">'+
    '<input id="port-amount" type="number" placeholder="amount" style="flex:1;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:6px;padding:6px 8px;color:var(--text);font-size:10px;outline:none;font-family:var(--font-m,monospace)">'+
    '<button id="port-add" style="background:rgba(240,168,48,.1);border:1px solid rgba(240,168,48,.3);border-radius:6px;color:var(--gold,#f0a830);font-size:13px;padding:6px 10px;cursor:pointer">+</button>';
  body.appendChild(addRow);

  addRow.querySelector('#port-add').addEventListener('click',()=>{
    const coin=addRow.querySelector('#port-coin').value.trim().toLowerCase().replace(/\s+/g,'-');
    const amount=parseFloat(addRow.querySelector('#port-amount').value);
    if(!coin||isNaN(amount)||amount<=0)return;
    if(_watchlist.indexOf(coin)===-1){_watchlist.push(coin);saveWatchlist();}
    portfolio[coin]=(portfolio[coin]||0)+amount;
    savePortfolio(portfolio);
    addRow.querySelector('#port-coin').value='';
    addRow.querySelector('#port-amount').value='';
    refresh().then(()=>renderPanel(body.parentElement));
  });

  // Portfolio value
  let totalUSD=0;
  Object.entries(portfolio).forEach(([id,amount])=>{
    const coin=_prices&&_prices.find(c=>c.id===id);
    const price=coin?coin.current_price:0;
    const value=price*amount;
    totalUSD+=value;
    const row=document.createElement('div');
    row.style.cssText='display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.04)';
    row.innerHTML=
      (coin?'<img src="'+esc(coin.image)+'" style="width:28px;height:28px;border-radius:50%;flex-shrink:0" alt="">':'<div style="width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,.1);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:12px">⬡</div>')+
      '<div style="flex:1;min-width:0">'+
        '<div style="font-size:12px;font-weight:600;color:var(--text)">'+esc(id.toUpperCase())+'</div>'+
        '<div style="font-size:10px;color:var(--text3)">'+amount+' × $'+formatPrice(price)+'</div>'+
      '</div>'+
      '<div style="text-align:right">'+
        '<div style="font-size:13px;font-family:var(--font-m,monospace);color:var(--text)">$'+formatPrice(value)+'</div>'+
        (coin?'<div style="font-size:10px;font-family:var(--font-m,monospace);color:'+changeColor(coin.price_change_percentage_24h)+'">'+formatChange(coin.price_change_percentage_24h||0)+'</div>':'') +
      '</div>'+
      '<button data-del="'+esc(id)+'" style="background:none;border:none;color:rgba(255,69,96,.4);font-size:14px;cursor:pointer;padding:4px">✕</button>';
    row.querySelector('[data-del]').addEventListener('click',e=>{
      e.stopPropagation();
      delete portfolio[id];
      savePortfolio(portfolio);
      renderPanel(body.parentElement);
    });
    body.appendChild(row);
  });

  if(Object.keys(portfolio).length){
    const total=document.createElement('div');
    total.style.cssText='padding:14px;text-align:center;background:rgba(240,168,48,.04);border-top:1px solid rgba(240,168,48,.1)';
    total.innerHTML='<div style="font-size:9px;color:var(--text3);font-family:var(--font-m,monospace);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Total value</div>'+
      '<div style="font-size:24px;font-family:var(--font-m,monospace);font-weight:300;color:var(--gold,#f0a830)">$'+totalUSD.toLocaleString('en',{maximumFractionDigits:2})+'</div>';
    body.appendChild(total);
  } else {
    const empty=document.createElement('div');
    empty.style.cssText='padding:32px;text-align:center;font-size:11px;color:var(--text3);font-family:var(--font-m,monospace)';
    empty.textContent='Add positions above to track your portfolio';
    body.appendChild(empty);
  }
}

// ── broadcastData ──
function broadcastData(){
  if(!_prices||!_prices.length)return{};
  const btc=_prices.find(p=>p.id==='bitcoin');
  const sol=_prices.find(p=>p.id==='solana');
  return{
    btc_price:btc?'$'+formatPrice(btc.current_price):null,
    btc_24h:btc?formatChange(btc.price_change_percentage_24h):null,
    sol_price:sol?'$'+formatPrice(sol.current_price):null,
  };
}

window.YM_S[SPHERE_ID]={
  name:'Finance',
  icon:'📈',
  category:'Finance',
  description:'Crypto prices, forex rates and portfolio tracker. Powered by CoinGecko and open.er-api. No API key needed.',

  activate(ctx){
    _ctx=ctx;
    _watchlist=loadWatchlist();
    refresh();
    _timer=setInterval(()=>refresh(),5*60*1000); // every 5min
  },

  deactivate(){
    if(_timer){clearInterval(_timer);_timer=null;}
    _ctx=null;
  },

  renderPanel,
  broadcastData,

  profileSection(container){
    if(!_prices){container.innerHTML='<div style="font-size:10px;color:var(--text3)">Loading…</div>';return;}
    const btc=_prices.find(p=>p.id==='bitcoin');
    const sol=_prices.find(p=>p.id==='solana');
    if(!btc&&!sol){container.innerHTML='';return;}
    container.innerHTML=
      '<div style="display:flex;gap:12px;flex-wrap:wrap">'+
        (btc?'<div style="font-size:11px;font-family:var(--font-m,monospace)"><span style="color:var(--gold,#f0a830)">BTC</span> $'+formatPrice(btc.current_price)+'</div>':'')+
        (sol?'<div style="font-size:11px;font-family:var(--font-m,monospace)"><span style="color:var(--cyan,#08e0f8)">SOL</span> $'+formatPrice(sol.current_price)+'</div>':'')+
      '</div>';
  },

  peerSection(container,peerCtx){
    const bd=peerCtx&&peerCtx.profile&&peerCtx.profile.broadcastData;
    const fin=bd&&bd['finance.sphere.js'];
    if(!fin){container.innerHTML='<div style="font-size:10px;color:var(--text3)">No finance data</div>';return;}
    container.innerHTML=
      '<div style="font-size:11px;font-family:var(--font-m,monospace);display:flex;gap:10px;flex-wrap:wrap">'+
        (fin.btc_price?'<span><span style="color:var(--gold,#f0a830)">BTC</span> '+esc(fin.btc_price)+'</span>':'')+
        (fin.sol_price?'<span><span style="color:var(--cyan,#08e0f8)">SOL</span> '+esc(fin.sol_price)+'</span>':'')+
      '</div>';
  },
};
})();
