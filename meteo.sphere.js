/* meteo.sphere.js — Weather sphere for YourMine
   Uses Open-Meteo API (no key required) + ip-api for geolocation
*/
(function(){
'use strict';
window.YM_S = window.YM_S || {};

const SPHERE_ID = 'meteo.sphere.js';
let _ctx = null;
let _timer = null;
let _weather = null;
let _location = null;
let _unit = 'celsius'; // celsius | fahrenheit
let _widget = null;
let _widgetEnabled = localStorage.getItem('meteo_widget') !== 'false';
const WIDGET_ID = 'meteo';
const POS_KEY = 'ym_meteo_widget_pos';
function _loadPos(){try{return JSON.parse(localStorage.getItem(POS_KEY)||'{}');}catch{return{};}}
function _savePos(p){localStorage.setItem(POS_KEY,JSON.stringify(p));}
function _registerPage(page){if(window.YM_Desk&&window.YM_Desk.registerWidgetPage)window.YM_Desk.registerWidgetPage(WIDGET_ID,page);}
function _unregisterPage(){if(window.YM_Desk&&window.YM_Desk.unregisterWidget)window.YM_Desk.unregisterWidget(WIDGET_ID);}
const _onPageChange=()=>_syncWidgetPage();
function _syncWidgetPage(){
  if(!_widget||!document.body.contains(_widget))return;
  if(window.YM_Desk&&window.YM_Desk.registeredWidgetPage){
    const rp=window.YM_Desk.registeredWidgetPage(WIDGET_ID);
    if(rp!==null&&rp!==undefined){
      const cur=window._deskCurPage||0;
      _widget.style.display=rp===cur?'flex':'none';
      return;
    }
  }
  _widget.style.display='flex';
}

// ── API ──────────────────────────────────────────────────────
async function getLocation(){
  // Try ip geolocation first (HTTPS, no permission needed)
  async function ipGeo(){
    try{
      const r=await fetch('https://ipapi.co/json/',{signal:AbortSignal.timeout(4000)});
      if(!r.ok)throw new Error();
      const d=await r.json();
      if(!d.latitude)throw new Error();
      return {lat:d.latitude,lon:d.longitude,name:(d.city||d.region||'Unknown')+', '+(d.country_name||'')};
    }catch{return null;}
  }
  // Try browser geolocation (more accurate)
  return new Promise((resolve)=>{
    if(!navigator.geolocation){ipGeo().then(resolve);return;}
    navigator.geolocation.getCurrentPosition(
      async pos=>{
        // Get city name from coordinates via reverse geocoding
        try{
          const r=await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`,{signal:AbortSignal.timeout(3000)});
          const d=await r.json();
          const city=d.address?.city||d.address?.town||d.address?.village||d.address?.county||'';
          const country=d.address?.country||'';
          resolve({lat:pos.coords.latitude,lon:pos.coords.longitude,name:city+(country?', '+country:'')});
        }catch{
          resolve({lat:pos.coords.latitude,lon:pos.coords.longitude,name:'GPS location'});
        }
      },
      async ()=>{ resolve(await ipGeo()); },
      {timeout:5000}
    );
  });
}

async function fetchWeather(lat,lon){
  const url=`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`+
    `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m,precipitation`+
    `&hourly=temperature_2m,weather_code,precipitation_probability&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,sunrise,sunset`+
    `&timezone=auto&forecast_days=5&wind_speed_unit=ms`;
  const r=await fetch(url);
  if(!r.ok)throw new Error('Weather API error '+r.status);
  return r.json();
}

function weatherCode(code){
  const map={
    0:'☀️',1:'🌤',2:'⛅',3:'☁️',
    45:'🌫',48:'🌫',
    51:'🌦',53:'🌦',55:'🌧',
    61:'🌧',63:'🌧',65:'🌧',
    71:'🌨',73:'🌨',75:'❄️',
    77:'🌨',
    80:'🌦',81:'🌧',82:'⛈',
    85:'🌨',86:'❄️',
    95:'⛈',96:'⛈',99:'⛈'
  };
  return map[code]||'🌡';
}

function weatherDesc(code){
  if(code===0)return'Clear sky';
  if(code<=2)return'Partly cloudy';
  if(code===3)return'Overcast';
  if(code<=48)return'Foggy';
  if(code<=55)return'Drizzle';
  if(code<=65)return'Rain';
  if(code<=75)return'Snow';
  if(code<=82)return'Rain showers';
  if(code<=86)return'Snow showers';
  return'Thunderstorm';
}

function tempStr(c){
  if(_unit==='fahrenheit')return Math.round(c*9/5+32)+'°F';
  return Math.round(c)+'°C';
}

function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

// ── Main fetch ──
async function refresh(){
  try{
    if(!_location){
      _location=await getLocation();
      if(!_location)throw new Error('Location unavailable');
    }
    _weather=await fetchWeather(_location.lat,_location.lon);
    const cur=_weather.current;
    const code=cur.weather_code;
    const badge=cur.precipitation>0?1:0;
    if(_ctx)_ctx.setNotification(badge);
    return _weather;
  }catch(e){
    if(_ctx)_ctx.toast(e.message,'error');
    return null;
  }
}

// ── Render ──
function renderPanel(container){
  container.innerHTML='';
  container.style.cssText='flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;display:flex;flex-direction:column;min-height:0';

  if(!_weather||!_location){
    const loading=document.createElement('div');
    loading.style.cssText='flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;color:var(--text3);font-family:var(--font-m,monospace);font-size:11px';
    loading.innerHTML='<div style="font-size:32px;animation:spin 2s linear infinite">🌡</div>Loading weather…';
    container.appendChild(loading);
    refresh().then(()=>renderPanel(container));
    return;
  }

  const cur=_weather.current;
  const daily=_weather.daily;
  const hourly=_weather.hourly;
  const now=new Date();

  // Header
  const header=document.createElement('div');
  header.style.cssText='padding:20px 16px 14px;text-align:center;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0;position:relative';
  header.innerHTML=
    '<div style="font-size:64px;line-height:1;margin-bottom:8px">'+weatherCode(cur.weather_code)+'</div>'+
    '<div style="font-family:var(--font-d,inherit);font-size:48px;font-weight:300;color:var(--text);line-height:1;margin-bottom:6px">'+tempStr(cur.temperature_2m)+'</div>'+
    '<div style="font-size:13px;color:var(--text2);margin-bottom:4px">'+weatherDesc(cur.weather_code)+'</div>'+
    '<div style="font-size:11px;color:var(--text3);font-family:var(--font-m,monospace)">'+esc(_location.name)+'</div>'+
    '<div style="position:absolute;top:12px;right:12px;display:flex;gap:6px">'+
      '<button id="meteo-widget-toggle" title="'+('' )+(_widgetEnabled?'Hide':'Show')+' widget" style="background:'+(_widgetEnabled?'rgba(240,168,48,.15)':'rgba(255,255,255,.06)')+';border:1px solid '+(_widgetEnabled?'rgba(240,168,48,.3)':'rgba(255,255,255,.1)')+';border-radius:6px;color:'+(_widgetEnabled?'var(--gold,#f0a830)':'rgba(228,230,244,.4)')+';font-size:12px;padding:3px 8px;cursor:pointer">🪟</button>'+
      '<button id="meteo-unit-toggle" style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:6px;color:var(--text2);font-size:10px;padding:3px 8px;cursor:pointer;font-family:var(--font-m,monospace)">'+(_unit==='celsius'?'°F':'°C')+'</button>'+
      '<button id="meteo-refresh" style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:6px;color:var(--text2);font-size:14px;padding:3px 8px;cursor:pointer">⟳</button>'+
    '</div>';
  container.appendChild(header);

  header.querySelector('#meteo-widget-toggle').addEventListener('click',()=>{
    _widgetEnabled=!_widgetEnabled;
    localStorage.setItem('meteo_widget',_widgetEnabled?'true':'false');
    if(_widgetEnabled)_buildWidget();else _destroyWidget();
    renderPanel(container);
  });
  header.querySelector('#meteo-unit-toggle').addEventListener('click',()=>{
    _unit=_unit==='celsius'?'fahrenheit':'celsius';
    renderPanel(container);
  });
  header.querySelector('#meteo-refresh').addEventListener('click',()=>{
    _weather=null;renderPanel(container);
  });

  // Current details
  const details=document.createElement('div');
  details.style.cssText='display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:rgba(255,255,255,.04);border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0';
  [
    {icon:'💨',label:'Wind',val:Math.round(cur.wind_speed_10m)+' m/s'},
    {icon:'💧',label:'Humidity',val:cur.relative_humidity_2m+'%'},
    {icon:'🌡',label:'Feels like',val:tempStr(cur.apparent_temperature)},
  ].forEach(item=>{
    const cell=document.createElement('div');
    cell.style.cssText='padding:10px 8px;text-align:center;background:var(--bg,#06060e)';
    cell.innerHTML='<div style="font-size:18px;margin-bottom:4px">'+item.icon+'</div>'+
      '<div style="font-size:12px;font-family:var(--font-m,monospace);color:var(--text)">'+item.val+'</div>'+
      '<div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-top:2px">'+item.label+'</div>';
    details.appendChild(cell);
  });
  container.appendChild(details);

  // Hourly (next 24h)
  const hourlyWrap=document.createElement('div');
  hourlyWrap.style.cssText='flex-shrink:0;border-bottom:1px solid rgba(255,255,255,.06)';
  const hourlyTitle=document.createElement('div');
  hourlyTitle.style.cssText='font-family:var(--font-d,inherit);font-size:8px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(240,168,48,.55);padding:10px 16px 6px';
  hourlyTitle.textContent='Next 24 hours';
  hourlyWrap.appendChild(hourlyTitle);
  const hourlyScroll=document.createElement('div');
  hourlyScroll.style.cssText='display:flex;gap:2px;overflow-x:auto;padding:0 12px 10px;-webkit-overflow-scrolling:touch;scrollbar-width:none';
  const nowHour=now.getHours();
  const startIdx=_weather.hourly.time.findIndex(t=>new Date(t).getHours()===nowHour&&new Date(t).toDateString()===now.toDateString());
  const slice=hourly.time.slice(startIdx>=0?startIdx:0,(startIdx>=0?startIdx:0)+24);
  slice.forEach((t,i)=>{
    const idx=(startIdx>=0?startIdx:0)+i;
    const h=new Date(t);
    const cell=document.createElement('div');
    cell.style.cssText='display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 10px;border-radius:8px;flex-shrink:0;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);min-width:52px';
    cell.innerHTML=
      '<div style="font-size:9px;color:var(--text3);font-family:var(--font-m,monospace)">'+h.getHours()+'h</div>'+
      '<div style="font-size:18px">'+weatherCode(hourly.weather_code[idx])+'</div>'+
      '<div style="font-size:11px;color:var(--text);font-family:var(--font-m,monospace)">'+tempStr(hourly.temperature_2m[idx])+'</div>'+
      '<div style="font-size:9px;color:var(--cyan,#08e0f8)">'+hourly.precipitation_probability[idx]+'%</div>';
    hourlyScroll.appendChild(cell);
  });
  hourlyWrap.appendChild(hourlyScroll);
  container.appendChild(hourlyWrap);

  // 5-day forecast
  const forecastWrap=document.createElement('div');
  forecastWrap.style.cssText='flex:1;overflow-y:auto;padding:0 0 8px';
  const forecastTitle=document.createElement('div');
  forecastTitle.style.cssText='font-family:var(--font-d,inherit);font-size:8px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(240,168,48,.55);padding:10px 16px 6px';
  forecastTitle.textContent='5-day forecast';
  forecastWrap.appendChild(forecastTitle);
  daily.time.forEach((t,i)=>{
    const d=new Date(t);
    const isToday=d.toDateString()===now.toDateString();
    const row=document.createElement('div');
    row.style.cssText='display:flex;align-items:center;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.04)';
    const sunrise=new Date(daily.sunrise[i]);
    const sunset=new Date(daily.sunset[i]);
    row.innerHTML=
      '<div style="width:60px;font-size:11px;color:'+(isToday?'var(--gold,#f0a830)':'var(--text2)')+'">'+
        (isToday?'Today':d.toLocaleDateString('en',{weekday:'short'}))+
      '</div>'+
      '<div style="font-size:22px;margin:0 10px">'+weatherCode(daily.weather_code[i])+'</div>'+
      '<div style="flex:1;font-size:10px;color:var(--text3)">'+weatherDesc(daily.weather_code[i])+'</div>'+
      '<div style="font-size:11px;font-family:var(--font-m,monospace);color:var(--text);white-space:nowrap">'+
        '<span style="color:var(--red,#ff4560)">↓'+tempStr(daily.temperature_2m_min[i])+'</span>'+
        ' <span style="color:var(--gold,#f0a830)">↑'+tempStr(daily.temperature_2m_max[i])+'</span>'+
      '</div>';
    forecastWrap.appendChild(row);
  });
  container.appendChild(forecastWrap);
}

// ── Widget ──────────────────────────────────────────────────
function _refreshWidget(){
  if(!_widget)return;
  if(!_weather||!_location){_widget.style.display='none';return;}
  const c=_weather.current;
  _widget.innerHTML=
    '<div style="font-size:26px;flex-shrink:0">'+weatherCode(c.weather_code)+'</div>'+
    '<div>'+
      '<div style="font-size:14px;font-weight:600;color:#e4e6f4;font-family:var(--font-m,monospace)">'+tempStr(c.temperature_2m)+'</div>'+
      '<div style="font-size:9px;color:rgba(228,230,244,.4);margin-top:1px">'+_location.name.split(',')[0]+'</div>'+
    '</div>';
}

function _buildWidget(){
  if(!_widgetEnabled){_destroyWidget();return;}
  if(_widget&&document.body.contains(_widget)){_refreshWidget();_syncWidgetPage();return;}
  if(!_weather||!_location)return;
  _widget=null;

  const spawnPage=window._deskCurPage||0;
  const pos=_loadPos();
  const savedPage=pos.page||0;
  const targetPage=localStorage.getItem(POS_KEY)?savedPage:spawnPage;

  _widget=document.createElement('div');
  _widget.id='ym-meteo-widget';
  _widget.style.cssText=
    'position:fixed;z-index:250;'+
    'background:rgba(6,6,18,.92);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);'+
    'border:1px solid rgba(255,255,255,.12);border-radius:14px;'+
    'padding:10px 14px;touch-action:none;user-select:none;-webkit-user-select:none;'+
    'display:flex;align-items:center;gap:10px;min-width:140px;'+
    'box-shadow:0 4px 24px rgba(0,0,0,.5);'+
    'right:'+(pos.right||12)+'px;bottom:'+(pos.bottom||96)+'px';

  _refreshWidget();
  document.body.appendChild(_widget);

  _registerPage(targetPage);
  _syncWidgetPage();

  if(!localStorage.getItem(POS_KEY)){
    const navH=window.YM_Desk&&window.YM_Desk.safeBottom||90;
    _savePos({right:12,bottom:navH+14,page:targetPage});
  }

  window.addEventListener('ym:page-change',_onPageChange);

  // Drag with edge-scroll page change (same as radio widget)
  let dragging=false,ox=0,oy=0,wx=0,wy=0,_edgeT=null;
  const _isPC=()=>window.matchMedia('(hover:hover) and (pointer:fine)').matches;

  const onMove=(cx,cy)=>{
    if(!dragging||!_widget)return;
    const ww=_widget.offsetWidth,wh=_widget.offsetHeight;
    const rawX=wx+(cx-ox);const rawY=wy+(cy-oy);
    ox=cx;oy=cy;
    wx=Math.max(0,Math.min(window.innerWidth-ww,rawX));
    wy=Math.max(0,Math.min(window.innerHeight-wh,rawY));
    _widget.style.left=wx+'px';_widget.style.top=wy+'px';
    _widget.style.right='';_widget.style.bottom='';

    // Edge scroll
    const vw=_isPC()?window.innerWidth-72:window.innerWidth;
    const ew=vw*0.15;
    const curPage=window._deskCurPage||0;
    if(cx<ew&&curPage>0){
      if(!_edgeT)_edgeT=setTimeout(()=>{
        _edgeT=null;
        const tp=curPage-1;
        if(window.YM_Desk)window.YM_Desk.goPage(tp);
        _registerPage(tp);
        const p=_loadPos();_savePos(Object.assign({},p,{page:tp}));
      },500);
    }else if(cx>vw-ew){
      if(!_edgeT)_edgeT=setTimeout(()=>{
        _edgeT=null;
        const tp=(window._deskCurPage||0)+1;
        if(window.YM_Desk)window.YM_Desk.goPageOrCreate(tp);
        _registerPage(tp);
        const p=_loadPos();_savePos(Object.assign({},p,{page:tp}));
      },500);
    }else{clearTimeout(_edgeT);_edgeT=null;}
  };

  const onEnd=()=>{
    if(!dragging)return;
    dragging=false;
    clearTimeout(_edgeT);_edgeT=null;
    document.removeEventListener('mousemove',onMouseMove);
    document.removeEventListener('mouseup',onEnd);
    document.removeEventListener('touchmove',onTouchMove);
    document.removeEventListener('touchend',onEnd);
    if(_widget){
      const ww=_widget.offsetWidth,wh=_widget.offsetHeight;
      const r=Math.max(0,window.innerWidth-wx-ww);
      const b=Math.max(0,window.innerHeight-wy-wh);
      const page=window._deskCurPage||0;
      _registerPage(page);
      _savePos({right:r,bottom:b,page});
      _syncWidgetPage();
      setTimeout(()=>{if(window.YM_Desk)window.YM_Desk.autoCleanPages();},100);
    }
  };

  const onMouseMove=e=>onMove(e.clientX,e.clientY);
  const onTouchMove=e=>{e.preventDefault();onMove(e.touches[0].clientX,e.touches[0].clientY);};

  _widget.addEventListener('mousedown',e=>{
    if(e.button!==0)return;
    dragging=true;
    const r=_widget.getBoundingClientRect();
    ox=e.clientX;oy=e.clientY;wx=r.left;wy=r.top;
    document.addEventListener('mousemove',onMouseMove);
    document.addEventListener('mouseup',onEnd);
  });
  _widget.addEventListener('touchstart',e=>{
    dragging=true;
    const t=e.touches[0];const r=_widget.getBoundingClientRect();
    ox=t.clientX;oy=t.clientY;wx=r.left;wy=r.top;
    document.addEventListener('touchmove',onTouchMove,{passive:false});
    document.addEventListener('touchend',onEnd);
  },{passive:true});
}

function _destroyWidget(){
  window.removeEventListener('ym:page-change',_onPageChange);
  _unregisterPage();
  if(_widget&&document.body.contains(_widget))document.body.removeChild(_widget);
  _widget=null;
}

// ── broadcastData ──
function broadcastData(){
  if(!_weather||!_location)return{};
  const cur=_weather.current;
  return{
    weather:weatherCode(cur.weather_code)+' '+weatherDesc(cur.weather_code),
    temp:tempStr(cur.temperature_2m),
    city:_location.name.split(',')[0],
  };
}

window.YM_S[SPHERE_ID]={
  name:'Météo',
  icon:'🌤',
  category:'Tools',
  description:'Local weather — current conditions, hourly and 5-day forecast. No API key needed.',

  activate(ctx){
    _ctx=ctx;
    refresh().then(()=>_buildWidget());
    _timer=setInterval(()=>{refresh().then(()=>{if(_widgetEnabled&&(!_widget||!document.body.contains(_widget)))_buildWidget();});},10*60*1000);
  },

  deactivate(){
    if(_timer){clearInterval(_timer);_timer=null;}
    _destroyWidget();
    _ctx=null;
  },

  renderPanel,
  broadcastData,

  profileSection(container){
    if(!_weather||!_location){container.innerHTML='<div style="font-size:10px;color:var(--text3)">Loading…</div>';return;}
    const cur=_weather.current;
    container.innerHTML=
      '<div style="display:flex;align-items:center;gap:8px">'+
        '<span style="font-size:24px">'+weatherCode(cur.weather_code)+'</span>'+
        '<div>'+
          '<div style="font-size:14px;font-weight:600;color:var(--text)">'+tempStr(cur.temperature_2m)+'</div>'+
          '<div style="font-size:10px;color:var(--text3)">'+esc(_location.name)+'</div>'+
        '</div>'+
      '</div>';
  },

  peerSection(container,peerCtx){
    const bd=peerCtx&&peerCtx.profile&&peerCtx.profile.broadcastData;
    const weather=bd&&bd['meteo.sphere.js'];
    if(!weather){container.innerHTML='<div style="font-size:10px;color:var(--text3)">No weather data</div>';return;}
    container.innerHTML=
      '<div style="font-size:11px;color:var(--text2)">'+
        esc(weather.weather||'')+'  '+esc(weather.temp||'')+
        (weather.city?'<span style="font-size:9px;color:var(--text3);margin-left:6px">'+esc(weather.city)+'</span>':'')+
      '</div>';
  },
};
})();
