/* status.sphere.js — Battery & Network status widget */
(function(){
'use strict';
window.YM_S = window.YM_S || {};

const SPHERE_ID = 'status.sphere.js';
const WIDGET_ID = 'ym-status-widget';
const POS_KEY   = 'status_widget_pos';

let _ctx = null;
let _battery = null;
let _timer = null;
let _widgetEl = null;

function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

// ── Battery ───────────────────────────────────────────────────
async function getBattery(){
  if(!navigator.getBattery)return null;
  try{return await navigator.getBattery();}catch{return null;}
}

function getBatteryIcon(level,charging){
  if(charging)return '⚡';
  if(level>0.75)return '🔋';
  if(level>0.4)return '🪫';
  return '🪫';
}

function getBatteryColor(level,charging){
  if(charging)return '#22d98a';
  if(level>0.5)return '#22d98a';
  if(level>0.2)return '#f0a830';
  return '#ff4560';
}

// ── Network ───────────────────────────────────────────────────
function getNetworkInfo(){
  const conn=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
  if(!conn)return{type:'unknown',speed:null,online:navigator.onLine};
  return{
    type:conn.effectiveType||conn.type||'unknown',
    speed:conn.downlink||null,
    saveData:conn.saveData||false,
    online:navigator.onLine,
  };
}

function getNetworkIcon(info){
  if(!info.online)return '📵';
  const t=info.type;
  if(t==='wifi'||t==='4g'||t==='5g')return '📶';
  if(t==='3g'||t==='2g')return '📶';
  return '🌐';
}

function getNetworkLabel(info){
  if(!info.online)return 'Offline';
  const t=info.type.toUpperCase();
  if(info.speed)return t+' · '+info.speed+'Mbps';
  return t;
}

// ── Widget ────────────────────────────────────────────────────
function createWidget(){
  const el=document.createElement('div');
  el.id=WIDGET_ID;
  el.style.cssText=
    'position:fixed;z-index:200;'+
    'background:rgba(10,10,15,.82);'+
    'border:1px solid rgba(255,255,255,.1);'+
    'border-radius:20px;'+
    'padding:6px 12px;'+
    'display:flex;align-items:center;gap:8px;'+
    'font-family:var(--font-m,monospace);'+
    'font-size:11px;'+
    'color:#e4e6f4;'+
    'backdrop-filter:blur(12px);'+
    '-webkit-backdrop-filter:blur(12px);'+
    'cursor:pointer;'+
    'touch-action:none;'+
    'user-select:none;-webkit-user-select:none;'+
    'box-shadow:0 2px 12px rgba(0,0,0,.3);'+
    'transition:opacity .2s';

  // Restore position
  try{
    const p=JSON.parse(localStorage.getItem(POS_KEY)||'{}');
    el.style.top=(p.top||'20')+'px';
    el.style.right=(p.right||'16')+'px';
  }catch{
    el.style.top='20px';el.style.right='16px';
  }

  updateWidget(el);
  document.body.appendChild(el);
  _widgetEl=el;

  // Drag
  let dragging=false,startX,startY,startTop,startRight;
  el.addEventListener('pointerdown',e=>{
    dragging=true;
    startX=e.clientX;startY=e.clientY;
    const r=el.getBoundingClientRect();
    startTop=r.top;startRight=window.innerWidth-r.right;
    el.setPointerCapture(e.pointerId);
    e.stopPropagation();
  });
  el.addEventListener('pointermove',e=>{
    if(!dragging)return;
    const dx=e.clientX-startX,dy=e.clientY-startY;
    const newTop=Math.max(0,Math.min(window.innerHeight-el.offsetHeight,startTop+dy));
    const newRight=Math.max(0,Math.min(window.innerWidth-el.offsetWidth,startRight-dx));
    el.style.top=newTop+'px';el.style.right=newRight+'px';el.style.left='auto';
  });
  el.addEventListener('pointerup',()=>{
    if(!dragging)return;dragging=false;
    try{localStorage.setItem(POS_KEY,JSON.stringify({top:parseInt(el.style.top),right:parseInt(el.style.right)}));}catch{}
  });

  // Click — open panel
  el.addEventListener('click',e=>{
    if(!dragging&&_ctx)_ctx.openPanel();
  });

  return el;
}

async function updateWidget(el){
  if(!el)return;
  const bat=await getBattery();
  const net=getNetworkInfo();

  const batLevel=bat?Math.round(bat.level*100):null;
  const batCharg=bat?bat.charging:false;
  const batColor=bat?getBatteryColor(bat.level,batCharg):'rgba(255,255,255,.4)';

  el.innerHTML=
    // Battery
    (batLevel!==null?
      '<span style="color:'+batColor+';font-size:13px">'+(batCharg?'⚡':'🔋')+'</span>'+
      '<span style="color:'+batColor+';font-weight:600">'+batLevel+'%</span>'+
      '<span style="color:rgba(255,255,255,.2)">·</span>'
    :'')+
    // Network
    '<span style="font-size:13px">'+getNetworkIcon(net)+'</span>'+
    '<span style="color:rgba(255,255,255,.6)">'+esc(getNetworkLabel(net))+'</span>';
}

// ── Panel ─────────────────────────────────────────────────────
async function renderPanel(container){
  container.innerHTML='';
  container.style.cssText='padding:16px;display:flex;flex-direction:column;gap:12px';

  const bat=await getBattery();
  const net=getNetworkInfo();

  // Battery card
  if(bat){
    const level=Math.round(bat.level*100);
    const color=getBatteryColor(bat.level,bat.charging);
    const card=document.createElement('div');
    card.style.cssText='background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:16px';
    card.innerHTML=
      '<div style="font-size:9px;color:var(--text3);font-family:var(--font-m,monospace);text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">Battery</div>'+
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">'+
        '<span style="font-size:32px">'+(bat.charging?'⚡':'🔋')+'</span>'+
        '<div>'+
          '<div style="font-size:28px;font-weight:700;color:'+color+';font-family:var(--font-m,monospace)">'+level+'%</div>'+
          '<div style="font-size:11px;color:var(--text3)">'+(bat.charging?'Charging':'Discharging')+'</div>'+
        '</div>'+
      '</div>'+
      // Progress bar
      '<div style="height:6px;background:rgba(255,255,255,.06);border-radius:3px;overflow:hidden">'+
        '<div style="height:100%;width:'+level+'%;background:'+color+';border-radius:3px;transition:width .3s"></div>'+
      '</div>'+
      (bat.chargingTime&&bat.chargingTime!==Infinity?'<div style="font-size:10px;color:var(--text3);margin-top:6px">Full in ~'+Math.round(bat.chargingTime/60)+' min</div>':'')+
      (bat.dischargingTime&&bat.dischargingTime!==Infinity?'<div style="font-size:10px;color:var(--text3);margin-top:6px">~'+Math.round(bat.dischargingTime/60)+' min remaining</div>':'');
    container.appendChild(card);
  }else{
    const noCard=document.createElement('div');
    noCard.style.cssText='background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:16px;font-size:12px;color:var(--text3)';
    noCard.textContent='Battery API not available on this device.';
    container.appendChild(noCard);
  }

  // Network card
  const netCard=document.createElement('div');
  netCard.style.cssText='background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:16px';
  const conn=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
  netCard.innerHTML=
    '<div style="font-size:9px;color:var(--text3);font-family:var(--font-m,monospace);text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">Network</div>'+
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">'+
      '<span style="font-size:28px">'+getNetworkIcon(net)+'</span>'+
      '<div>'+
        '<div style="font-size:16px;font-weight:600;color:'+(net.online?'#22d98a':'#ff4560')+'">'+(net.online?'Online':'Offline')+'</div>'+
        '<div style="font-size:11px;color:var(--text3)">'+esc(net.type.toUpperCase())+'</div>'+
      '</div>'+
    '</div>'+
    (net.speed?'<div style="display:flex;justify-content:space-between;font-size:11px;padding:8px 0;border-top:1px solid rgba(255,255,255,.05)"><span style="color:var(--text3)">Downlink</span><span style="color:var(--text2)">'+net.speed+' Mbps</span></div>':'')+
    (conn?.rtt?'<div style="display:flex;justify-content:space-between;font-size:11px;padding:8px 0;border-top:1px solid rgba(255,255,255,.05)"><span style="color:var(--text3)">RTT</span><span style="color:var(--text2)">'+conn.rtt+' ms</span></div>':'')+
    (net.saveData?'<div style="font-size:10px;color:#f0a830;margin-top:6px">⚠ Data saver active</div>':'');
  container.appendChild(netCard);

  // Refresh button
  const btn=document.createElement('button');
  btn.className='ym-btn ym-btn-ghost';
  btn.style.cssText='font-size:11px;width:100%';
  btn.textContent='↺ Refresh';
  btn.addEventListener('click',async()=>{
    await renderPanel(container);
    if(_widgetEl)await updateWidget(_widgetEl);
  });
  container.appendChild(btn);
}

// ── Sphere ────────────────────────────────────────────────────
window.YM_S[SPHERE_ID]={
  name:'Status',
  icon:'📡',
  category:'Tools',
  description:'Battery level and network status widget. Drag anywhere on screen.',

  activate(ctx){
    _ctx=ctx;
    // Create widget
    if(!document.getElementById(WIDGET_ID))createWidget();
    // Register widget page
    if(ctx.registerWidgetPage){
      const saved=JSON.parse(localStorage.getItem('status_widget_page')||'null');
      ctx.registerWidgetPage(WIDGET_ID,saved??ctx.getCurrentPage?.()??0,POS_KEY);
    }
    // Poll updates
    getBattery().then(bat=>{
      _battery=bat;
      if(bat){
        bat.addEventListener('levelchange',()=>updateWidget(_widgetEl));
        bat.addEventListener('chargingchange',()=>updateWidget(_widgetEl));
      }
    });
    _timer=setInterval(()=>updateWidget(_widgetEl),30000);
    // Network events
    window.addEventListener('online',()=>updateWidget(_widgetEl));
    window.addEventListener('offline',()=>updateWidget(_widgetEl));
    if(navigator.connection)navigator.connection.addEventListener('change',()=>updateWidget(_widgetEl));
  },

  deactivate(){
    _ctx=null;
    clearInterval(_timer);_timer=null;
    const el=document.getElementById(WIDGET_ID);
    if(el)el.remove();
    _widgetEl=null;
    window.removeEventListener('online',()=>updateWidget(_widgetEl));
    window.removeEventListener('offline',()=>updateWidget(_widgetEl));
  },

  renderPanel,

  broadcastData(){
    const net=getNetworkInfo();
    return{online:net.online,network:net.type};
  },
};
})();
