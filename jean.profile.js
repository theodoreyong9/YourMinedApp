// jean.profile.js — Custom profile sphere body
// Paste this in the Custom JS field of the Profile Sphere editor

var profile = window.YM && window.YM.getProfile ? window.YM.getProfile() : {};
var accent = cfg.accent || '#f0a830';
var dim = 'rgba(240,168,48,.12)';

container.innerHTML = '';
container.style.cssText = 'overflow-y:auto;background:var(--bg,#08080f)';

// ── Animated hero background ────────────────────────────────────────────────
var heroBg = document.createElement('canvas');
heroBg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:220px;pointer-events:none;z-index:0;opacity:.4';
heroBg.width = 400; heroBg.height = 220;
var ctx2 = heroBg.getContext('2d');
var particles = Array.from({length:28},function(){return{
  x:Math.random()*400, y:Math.random()*220,
  r:Math.random()*1.5+.5, vx:(Math.random()-.5)*.4, vy:(Math.random()-.5)*.4, o:Math.random()
};});
function drawParticles(){
  ctx2.clearRect(0,0,400,220);
  particles.forEach(function(p){
    p.x+=p.vx; p.y+=p.vy;
    if(p.x<0||p.x>400) p.vx*=-1;
    if(p.y<0||p.y>220) p.vy*=-1;
    ctx2.beginPath();ctx2.arc(p.x,p.y,p.r,0,Math.PI*2);
    ctx2.fillStyle='rgba(240,168,48,'+p.o+')';ctx2.fill();
  });
  // Connect nearby particles
  particles.forEach(function(a,i){particles.slice(i+1).forEach(function(b){
    var d=Math.hypot(a.x-b.x,a.y-b.y);
    if(d<60){ctx2.beginPath();ctx2.moveTo(a.x,a.y);ctx2.lineTo(b.x,b.y);
      ctx2.strokeStyle='rgba(240,168,48,'+(1-d/60)*.15+')';ctx2.lineWidth=.5;ctx2.stroke();}
  });});
  requestAnimationFrame(drawParticles);
}
drawParticles();

// ── Hero ────────────────────────────────────────────────────────────────────
var hero = document.createElement('div');
hero.style.cssText = 'position:relative;padding:32px 20px 28px;text-align:center;overflow:hidden';
hero.appendChild(heroBg);

var heroContent = document.createElement('div');
heroContent.style.cssText = 'position:relative;z-index:1';

var avHtml = profile.avatar
  ? '<img src="'+profile.avatar+'" style="width:84px;height:84px;border-radius:50%;object-fit:cover;border:2px solid '+accent+';box-shadow:0 0 20px rgba(240,168,48,.3);margin-bottom:14px">'
  : '<div style="width:84px;height:84px;border-radius:50%;background:linear-gradient(135deg,rgba(240,168,48,.2),rgba(240,168,48,.05));border:2px solid '+accent+';display:inline-flex;align-items:center;justify-content:center;font-size:36px;margin-bottom:14px;box-shadow:0 0 20px rgba(240,168,48,.2);color:'+accent+'">'+profile.name.charAt(0)+'</div>';

heroContent.innerHTML = avHtml
  + '<div style="font-size:24px;font-weight:800;letter-spacing:.06em;color:'+accent+';text-shadow:0 0 24px rgba(240,168,48,.4)">'+profile.name+'</div>'
  + '<div style="font-size:11px;color:rgba(255,255,255,.35);letter-spacing:.2em;text-transform:uppercase;margin-top:4px">Operations Architect · Open Web Activist</div>'
  + (profile.site ? '<div style="font-size:11px;color:rgba(255,255,255,.3);margin-top:6px"><a href="'+profile.site+'" target="_blank" style="color:'+accent+';opacity:.7;text-decoration:none">'+profile.site.replace('https://','')+'</a></div>' : '');
hero.appendChild(heroContent);
container.appendChild(hero);

// ── Bio ──────────────────────────────────────────────────────────────────────
if(profile.bio){
  var bioEl = document.createElement('div');
  bioEl.style.cssText = 'padding:16px 20px;border-top:1px solid rgba(240,168,48,.08);border-bottom:1px solid rgba(255,255,255,.04);background:linear-gradient(90deg,rgba(240,168,48,.04),transparent)';
  bioEl.innerHTML = '<div style="font-size:13px;color:rgba(255,255,255,.65);line-height:1.7;font-style:italic">"'+profile.bio+'"</div>';
  container.appendChild(bioEl);
}

// ── Manifesto line ───────────────────────────────────────────────────────────
var mani = document.createElement('div');
mani.style.cssText = 'padding:14px 20px;border-bottom:1px solid rgba(255,255,255,.04);display:flex;align-items:center;gap:10px';
mani.innerHTML = '<div style="width:3px;height:36px;background:linear-gradient('+accent+',transparent);border-radius:2px;flex-shrink:0"></div>'
  + '<div style="font-size:12px;color:rgba(255,255,255,.45);line-height:1.6;font-style:italic">'
  + '"Value lies in structural distinctiveness and integration."'
  + '</div>';
container.appendChild(mani);

// ── Keywords ─────────────────────────────────────────────────────────────────
if(cfg.keywords && cfg.keywords.length){
  var kw = document.createElement('div');
  kw.style.cssText = 'padding:16px 20px;border-bottom:1px solid rgba(255,255,255,.04)';
  kw.innerHTML = '<div style="font-size:9px;text-transform:uppercase;letter-spacing:.2em;color:rgba(255,255,255,.25);margin-bottom:10px">Topics</div>'
    + '<div style="display:flex;flex-wrap:wrap;gap:8px">'
    + cfg.keywords.map(function(k,i){
        var delay = i * 60;
        return '<span style="font-size:12px;padding:5px 14px;border-radius:20px;border:1px solid rgba(240,168,48,'+(0.3+i*.05)+');color:'+accent+';background:rgba(240,168,48,.04);letter-spacing:.02em">'+k+'</span>';
      }).join('')
    + '</div>';
  container.appendChild(kw);
}

// ── Stats bar ────────────────────────────────────────────────────────────────
var stats = document.createElement('div');
stats.style.cssText = 'padding:14px 20px;border-bottom:1px solid rgba(255,255,255,.04);display:flex;gap:0';
var statsData = [
  {label:'Spheres', val: (profile.spheres||[]).length},
  {label:'Soulnet', val:'Beta'},
  {label:'Web', val:'4.0'},
];
statsData.forEach(function(s,i){
  var col = document.createElement('div');
  col.style.cssText = 'flex:1;text-align:center'+(i<statsData.length-1?';border-right:1px solid rgba(255,255,255,.06)':'');
  col.innerHTML = '<div style="font-size:18px;font-weight:700;color:'+accent+'">'+s.val+'</div>'
    + '<div style="font-size:9px;text-transform:uppercase;letter-spacing:.12em;color:rgba(255,255,255,.3);margin-top:2px">'+s.label+'</div>';
  stats.appendChild(col);
});
container.appendChild(stats);
