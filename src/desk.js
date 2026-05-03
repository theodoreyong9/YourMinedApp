// ============================================================
// YOURMINE — DESK.JS v2
// ============================================================
/* jshint esversion:11 */
'use strict';

const DK='ym_desktop_v1', WK='ym_wallpaper', PGSK='ym_pages';
const isPC=()=>window.matchMedia('(hover:hover) and (pointer:fine)').matches;
const GRID=()=>isPC()?{cols:8,rows:5}:{cols:4,rows:6};

function LD(){return JSON.parse(localStorage.getItem(DK)||'[]');}
function SD(d){localStorage.setItem(DK,JSON.stringify(d));}
function getPgCount(){return Math.max(1,parseInt(localStorage.getItem(PGSK)||'1'));}
function setPgCount(n){localStorage.setItem(PGSK,String(Math.max(1,n)));}
function toast(msg,type){if(window.YM_toast)window.YM_toast(msg,type);}

let curPg=0,editMode=false,isDragging=false,_lastDragEnd=0;
const folderStack=[];
function enterEdit(){editMode=true;document.body.classList.add('edit-mode');}
function exitEdit(){editMode=false;document.body.classList.remove('edit-mode');}

function isImageURL(s){
  if(!s)return false;
  return s.startsWith('http')||s.startsWith('//')||s.startsWith('data:')||s.startsWith('/')||/\.(png|jpg|jpeg|svg|webp|gif)$/i.test(s);
}
function renderIconContent(icon){
  if(isImageURL(icon)){
    const img=document.createElement('img');
    img.src=icon;img.alt='';
    img.style.cssText='width:36px;height:36px;object-fit:contain;border-radius:8px;display:block';
    return img;
  }
  const span=document.createElement('span');span.textContent=icon||'⬡';return span;
}
function deepCopyFolderItems(items){
  if(!items)return undefined;
  return JSON.parse(JSON.stringify(items));
}

function rmEl(id){
  const el=document.getElementById(id);
  if(el)el.classList.remove('open');
}

function applyWP(){
  const wp=localStorage.getItem(WK),el=document.getElementById('ym-wp');if(!el)return;
  if(wp){
    el.style.backgroundImage="url('"+wp+"')";
    // backgroundSize/Position/Repeat gérés par CSS (pour permettre l'animation)
    document.body.classList.add('has-wallpaper');
  }else{
    el.style.backgroundImage='';
    document.body.classList.remove('has-wallpaper');
  }
}
function pickWP(){
  const inp=document.createElement('input');inp.type='file';inp.accept='image/*';
  inp.onchange=()=>{
    const file=inp.files[0];if(!file)return;
    const processFile=(dataUrl)=>{
      try{localStorage.setItem(WK,dataUrl);}catch(e){toast('Image too large','error');return;}
      applyWP();toast('Wallpaper updated','success');
    };
    if(file.size>2*1024*1024){
      const img=new Image(),url=URL.createObjectURL(file);
      img.onload=()=>{
        URL.revokeObjectURL(url);
        const c=document.createElement('canvas');
        const sc=Math.min(1,1200/Math.max(img.width,img.height));
        c.width=Math.round(img.width*sc);c.height=Math.round(img.height*sc);
        c.getContext('2d').drawImage(img,0,0,c.width,c.height);
        processFile(c.toDataURL('image/jpeg',0.82));
      };
      img.src=url;
    }else{
      const r=new FileReader();
      r.onload=(e)=>processFile(e.target.result);
      r.readAsDataURL(file);
    }
  };inp.click();
}

function findIconParent(id,items){
  for(const ic of items){
    if(ic.id===id)return{parent:items,item:ic};
    if(ic.folder&&ic.folderItems){
      const f=findIconParent(id,ic.folderItems);
      if(f)return f;
    }
  }
  return null;
}
function findEmptyIn(items,page){
  page=page||0;const g=GRID();
  const used=new Set(items.filter(i=>i.page===page).map(i=>i.col+','+i.row));
  for(let r=g.rows-1;r>=0;r--)for(let c=g.cols-1;c>=0;c--)if(!used.has(c+','+r))return{col:c,row:r};
  return null;
}
function findEmptyInFolder(folderItems){
  const g=GRID();
  const used=new Set(folderItems.filter(i=>i.page===0).map(i=>i.col+','+i.row));
  const maxRow=folderItems.length>0?Math.max(...folderItems.map(i=>i.row||0)):0;
  for(let r=0;r<=maxRow+1;r++)for(let c=0;c<g.cols;c++)if(!used.has(c+','+r))return{col:c,row:r};
  return{col:0,row:maxRow+1};
}

function addIcon(id,icon,label,page){
  page=page!==undefined?page:curPg;
  const d=LD();if(findIconParent(id,d))return;
  let pg=page;
  while(!findEmptyIn(d,pg)){pg++;if(pg>=getPgCount()){setPgCount(pg+1);buildSlider();}}
  const pos=findEmptyIn(d,pg);
  d.push({id,icon,label,page:pg,col:pos.col,row:pos.row,notif:0});SD(d);renderDesk();
}
function removeIcon(id){
  const d=LD();
  function removeFrom(items){
    const idx=items.findIndex(i=>i.id===id);
    if(idx>=0){items.splice(idx,1);return true;}
    for(const ic of items){if(ic.folder&&ic.folderItems&&removeFrom(ic.folderItems))return true;}
    return false;
  }
  removeFrom(d);SD(d);renderDesk();setTimeout(autoCleanPages,50);
}
// Calcule la somme des notifs de tous les descendants d'un folder
function sumFolderNotifs(items){
  let s=0;
  for(const it of (items||[])){
    if(it.folder)s+=sumFolderNotifs(it.folderItems);
    else s+=(it.notif||0);
  }
  return s;
}
// Met à jour le badge visible d'une icône (icône simple ou folder)
function _updateBadgeEl(id,n){
  const wrap=document.querySelector('[data-id="'+id+'"]');if(!wrap)return;
  const body=wrap.querySelector('.icon-body');if(!body)return;
  let el=body.querySelector('.icon-notif');
  if(n>0){
    if(!el){el=document.createElement('div');el.className='icon-notif';body.appendChild(el);}
    el.textContent=n;el.style.display='flex';
  }else if(el){
    el.style.display='none';
  }
}
// Remonte l'arbre pour rafraîchir les badges des folders parents
function _refreshParentFolderBadges(d){
  for(const ic of d){
    if(ic.folder){
      const total=sumFolderNotifs(ic.folderItems);
      _updateBadgeEl(ic.id,total);
      // Récursif si dossiers imbriqués
      if(ic.folderItems)_refreshParentFolderBadges(ic.folderItems);
    }
  }
}
function setNotif(id,n){
  const d=LD(),found=findIconParent(id,d);
  if(found){found.item.notif=n;SD(d);}
  // Met à jour l'icône directe
  _updateBadgeEl(id,n);
  // Recalcule les badges de tous les folders (parents inclus)
  _refreshParentFolderBadges(LD());
}

// ── WIDGET PAGE REGISTRY ──────────────────────────────────────
const _widgetPages=new Map();

// FIX: garantit que le slider a bien la page du widget au redémarrage
function registerWidgetPage(widgetId,page){
  _widgetPages.set(widgetId,page);
  if(page>=getPgCount()){
    setPgCount(page+1);
    buildSlider();
    goPage(curPg,false);
  }
}
function unregisterWidget(widgetId){_widgetPages.delete(widgetId);}
function isPageOccupiedByWidget(page){
  for(const p of _widgetPages.values()){if(p===page)return true;}
  return false;
}

// FIX: expose la hauteur de la zone sûre pour les widgets qui font leur propre drag
function getDeskSafeBottom(){
  const nb=document.getElementById('nav-bar');
  if(nb)return window.innerHeight-nb.getBoundingClientRect().top;
  return isPC()?0:76;
}

function buildSlider(){
  const slider=document.getElementById('desktop-slider'),n=getPgCount();
  const unit=isPC()?'calc(100vw - 64px)':'100vw';
  slider.innerHTML='';slider.style.width='calc('+n+' * '+unit+')';
  for(let i=0;i<n;i++){
    const pg=document.createElement('div');pg.className='desktop-page';pg.id='page-'+i;pg.dataset.page=i;
    slider.appendChild(pg);
  }
  updateDots();renderDesk();
}
function updateDots(){
  const dots=document.getElementById('page-dots'),n=getPgCount();
  if(!dots)return;dots.innerHTML='';
  for(let i=0;i<n;i++){const d=document.createElement('div');d.className='pdot'+(i===curPg?' active':'');dots.appendChild(d);}
}
function goPage(n,anim){
  anim=anim!==false;curPg=Math.max(0,Math.min(getPgCount()-1,n));
  const s=document.getElementById('desktop-slider');
  if(!anim){s.style.transition='none';requestAnimationFrame(()=>{s.style.transition='';});}
  const unit=isPC()?'calc(100vw - 64px)':'100vw';
  s.style.transform='translateX(calc('+(-curPg)+' * '+unit+'))';
  updateDots();window.dispatchEvent(new CustomEvent('ym:page-change',{detail:{page:curPg}}));
}
function autoCleanPages(){
  const icons=LD();
  let n=getPgCount();
  while(n>1){
    const p=n-1;
    if(icons.some(i=>i.page===p))break;
    if(isPageOccupiedByWidget(p))break;
    n--;
  }
  if(n!==getPgCount()){setPgCount(n);if(curPg>=n)curPg=n-1;buildSlider();goPage(curPg,false);}
}

function iconsForPage(arr,p){return arr.filter(i=>i.page===p);}
function renderPageInto(el,icons,isFolder){
  el.innerHTML='';const g=GRID();
  for(const ic of icons){
    // FIX: clamp col ET row dans les bornes strictes de la grille
    const col=Math.max(0,Math.min(g.cols-1,ic.col));
    const row=Math.max(0,Math.min(g.rows-1,ic.row||0));
    const w=mkIcon(ic,isFolder);w.style.gridColumn=col+1;w.style.gridRow=row+1;el.appendChild(w);
  }
}
function renderDesk(){
  const n=getPgCount(),icons=LD();
  for(let p=0;p<n;p++){const el=document.getElementById('page-'+p);if(!el)continue;renderPageInto(el,iconsForPage(icons,p),false);}
  if(folderStack.length){
    const top=folderStack[folderStack.length-1];
    const found=findIconParent(top.ic.id,LD());
    if(found){top.ic=found.item;renderFolderPanel(top.ic);}
  }
}

// ── FOLDER PANEL ──────────────────────────────────────────────
function openFolderPanel(ic){
  if(folderStack.length>0&&folderStack[folderStack.length-1].ic.id===ic.id)return;
  let panel=document.getElementById('panel-folder');
  if(!panel){
    panel=document.createElement('div');panel.id='panel-folder';panel.className='ym-panel';
    panel.style.cssText='z-index:299;backdrop-filter:none;-webkit-backdrop-filter:none;background:rgba(8,8,15,.95)';
    panel.innerHTML=
      '<div class="panel-handle"></div>'+
      '<div class="panel-head" id="folder-panel-head"><div id="folder-panel-breadcrumb" style="display:flex;align-items:center;gap:6px;flex:1;overflow:hidden;min-width:0;padding:0 4px"></div></div>'+
      '<div id="folder-drop-zone" style="display:none;flex-shrink:0;padding:8px 16px;border-bottom:2px dashed rgba(232,160,32,.4);font-size:11px;color:var(--gold);text-align:center;background:rgba(232,160,32,.06)">↓ Drop here to eject from folder</div>'+
      '<div class="panel-body" style="padding:0;overflow:hidden;display:flex;flex-direction:column"><div id="folder-content" style="flex:1;overflow-y:auto;overflow-x:hidden;"><div id="folder-page-0" class="desktop-page" data-page="0" style="height:auto;min-height:100%;background:transparent;"></div></div></div>';
    document.body.appendChild(panel);
    let sy=0;
    panel.querySelector('.panel-handle').addEventListener('pointerdown',e=>{sy=e.clientY;});
    panel.querySelector('.panel-handle').addEventListener('pointerup',e=>{if(e.clientY-sy>40)closeFolderPanel();});
    panel.querySelector('#folder-panel-head').addEventListener('click',e=>{
      if(!e.target.closest('#folder-panel-breadcrumb')&&!e.target.closest('button'))closeFolderPanel();
    });
    panel.querySelector('.panel-body').addEventListener('pointerup',e=>{if(editMode&&!e.target.closest('.icon-wrap'))exitEdit();});
  }
  const spherePanel=document.getElementById('panel-sphere');
  if(spherePanel&&spherePanel.classList.contains('open')){
    spherePanel.classList.remove('open');
    rmEl('panel-overlay');
  }
  history.pushState({folderOpen:true},'');
  folderStack.push({ic});renderFolderPanel(ic);
  panel.style.background='rgba(8,8,15,'+Math.min(0.92+folderStack.length*0.02,0.97)+')';
  panel.classList.add('open');
}
function closeFolderPanel(){
  const panel=document.getElementById('panel-folder');
  if(folderStack.length>1){folderStack.pop();renderFolderPanel(folderStack[folderStack.length-1].ic);return;}
  folderStack.length=0;if(panel)panel.classList.remove('open');
  rmEl('panel-overlay');
}
window.addEventListener('popstate',e=>{
  if(!folderStack.length)return;
  e.stopImmediatePropagation();
  if(folderStack.length>1){folderStack.pop();renderFolderPanel(folderStack[folderStack.length-1].ic);}
  else{folderStack.length=0;rmEl('panel-folder');rmEl('panel-overlay');}
},true);

function renderFolderPanel(ic){
  const items=ic.folderItems||[];
  const pg=document.getElementById('folder-page-0');if(!pg)return;
  const g=GRID();
  pg.style.cssText='background:transparent;display:grid;grid-template-columns:repeat('+g.cols+',1fr);grid-auto-rows:1fr;min-height:100%;padding:6px 12px 10px;gap:6px;position:relative;';
  renderPageInto(pg,iconsForPage(items,0),true);
  const bc=document.getElementById('folder-panel-breadcrumb');
  if(bc){
    bc.innerHTML='';
    folderStack.forEach((entry,i)=>{
      if(i>0){const sep=document.createElement('span');sep.textContent='›';sep.style.cssText='color:var(--text3);font-size:14px';bc.appendChild(sep);}
      const lbl=document.createElement('span');
      lbl.textContent=entry.ic.label||'Folder';
      lbl.style.cssText='font-size:12px;color:'+(i===folderStack.length-1?'var(--text)':'var(--text3)')+';cursor:pointer;padding:2px 4px;border-radius:4px';
      if(i<folderStack.length-1){
        const capturedI=i;
        lbl.addEventListener('click',()=>{while(folderStack.length>capturedI+1)folderStack.pop();renderFolderPanel(folderStack[folderStack.length-1].ic);});
      }
      if(i===folderStack.length-1){
        lbl.style.fontWeight='600';
        let renameT=null;
        const startRename=(ev)=>{
          if(ev)ev.stopPropagation();
          lbl.contentEditable='true';lbl.style.background='rgba(232,160,32,.18)';lbl.style.outline='1px solid var(--gold)';lbl.focus();
          const sel=window.getSelection(),range=document.createRange();range.selectNodeContents(lbl);sel.removeAllRanges();sel.addRange(range);
        };
        const saveRename=()=>{
          lbl.contentEditable='false';lbl.style.background='';lbl.style.outline='';
          const name=lbl.textContent.trim()||'Folder';lbl.textContent=name;entry.ic.label=name;
          const d=LD(),found=findIconParent(entry.ic.id,d);if(found){found.item.label=name;SD(d);}renderDesk();
        };
        lbl.addEventListener('dblclick',e=>{e.stopPropagation();startRename(e);});
        lbl.addEventListener('pointerdown',e=>{e.stopPropagation();renameT=setTimeout(()=>{renameT=null;startRename(e);},650);},{passive:false});
        lbl.addEventListener('pointerup',()=>{clearTimeout(renameT);renameT=null;},{passive:true});
        lbl.addEventListener('pointercancel',()=>{clearTimeout(renameT);renameT=null;},{passive:true});
        lbl.addEventListener('blur',saveRename);
        lbl.addEventListener('keydown',e=>{
          if(e.key==='Enter'){e.preventDefault();lbl.blur();}
          if(e.key==='Escape'){lbl.textContent=entry.ic.label||'Folder';lbl.contentEditable='false';lbl.style.background='';lbl.style.outline='';}
        });
      }
      bc.appendChild(lbl);
    });
  }
  const dz=document.getElementById('folder-drop-zone');
  if(dz){
    dz.style.display=editMode?'block':'none';
    if(!dz._obs){
      dz._obs=new MutationObserver(()=>{dz.style.display=document.body.classList.contains('edit-mode')?'block':'none';});
      dz._obs.observe(document.body,{attributes:true,attributeFilter:['class']});
    }
  }
}

function addToFolder(icSrc,folderIc,fromFolder){
  const d=LD();
  // Lire les données fraîches depuis le storage pour avoir le bon notif
  const freshSrcFound=findIconParent(icSrc.id,d);
  const freshNotif=freshSrcFound?freshSrcFound.item.notif:(icSrc.notif||0);
  const folderFound=findIconParent(folderIc.id,d);if(!folderFound)return;
  const fi=folderFound.item.folderItems||[];
  const pos=findEmptyInFolder(fi);
  fi.push({
    id:icSrc.id,icon:icSrc.icon,label:icSrc.label,page:0,col:pos.col,row:pos.row,
    notif:freshNotif,folder:icSrc.folder||false,
    folderItems:deepCopyFolderItems(icSrc.folderItems)
  });
  folderFound.item.folderItems=fi;
  if(fromFolder){
    const topIc=folderStack[folderStack.length-1]&&folderStack[folderStack.length-1].ic;
    if(topIc){
      const topFound=findIconParent(topIc.id,d);
      if(topFound)topFound.item.folderItems=topFound.item.folderItems.filter(x=>x.id!==icSrc.id);
    }
  }else{
    const idx=d.findIndex(x=>x.id===icSrc.id);if(idx>=0)d.splice(idx,1);
  }
  SD(d);renderDesk();if(fromFolder)refreshFolderPanel();
}

function deactivateAll(items){
  for(const it of items){
    if(it.folder)deactivateAll(it.folderItems||[]);
    else if(window.YM)window.YM.deactivateSphere(it.id);
  }
}
function flatIcons(items,max){
  const out=[];
  for(const it of items){
    if(out.length>=max)break;
    if(it.folder)out.push(...flatIcons(it.folderItems||[],max-out.length));
    else out.push(it);
  }
  return out;
}

function mkIcon(ic,isFolder){
  const w=document.createElement('div');w.className='icon-wrap';w.dataset.id=ic.id;
  const MANDATORY=['social.sphere.js'];
  const del=document.createElement('div');del.className='icon-del';del.innerHTML='&times;';
  // Masque définitivement le bouton supprimer pour les spheres obligatoires
  if(MANDATORY.includes(ic.id))del.className='icon-del icon-del-hidden';
  del.addEventListener('pointerdown',e=>{e.stopImmediatePropagation();e.stopPropagation();});
  del.addEventListener('click',e=>{
    e.stopPropagation();e.preventDefault();
    if(ic.folder){deactivateAll(ic.folderItems||[]);removeIcon(ic.id);}
    else if(window.YM)window.YM.deactivateSphere(ic.id);
  });
  if(ic.folder){
    const body=document.createElement('div');body.className='icon-body folder-body';body.appendChild(del);
    const grid=document.createElement('div');grid.className='folder-grid';
    for(const it of flatIcons(ic.folderItems||[],4)){
      const m=document.createElement('div');m.className='fi';
      if(isImageURL(it.icon)){
        const img=document.createElement('img');img.src=it.icon;img.style.cssText='width:16px;height:16px;object-fit:contain;border-radius:3px';
        m.appendChild(img);
      }else m.textContent=it.icon||'*';
      grid.appendChild(m);
    }
    body.appendChild(grid);
    // Badge folder = somme des notifs enfants
    const folderNotifTotal=sumFolderNotifs(ic.folderItems);
    if(folderNotifTotal>0){
      const fn=document.createElement('div');fn.className='icon-notif';fn.textContent=folderNotifTotal;body.appendChild(fn);
    }
    w.appendChild(body);
    const lbl=document.createElement('div');lbl.className='icon-label';lbl.textContent=ic.label;w.appendChild(lbl);
    w.addEventListener('click',()=>{if(!editMode&&!isDragging)openFolderPanel(ic);});
  }else{
    const body=document.createElement('div');body.className='icon-body';body.appendChild(del);
    body.appendChild(renderIconContent(ic.icon));
    w.appendChild(body);
    const lbl=document.createElement('div');lbl.className='icon-label';lbl.textContent=ic.label;w.appendChild(lbl);
    if(ic.notif){const n=document.createElement('div');n.className='icon-notif';n.textContent=ic.notif;body.appendChild(n);}
    w.addEventListener('click',()=>{if(!editMode&&!isDragging&&window.YM)window.YM.openSpherePanel(ic.id);});
  }
  setupDrag(w,ic,isFolder);return w;
}

let _hl=null,_hlPg=-1;
function showHL(col,row,pgEl,pg){
  if(_hlPg!==pg)removeHL();
  if(!_hl){_hl=document.createElement('div');_hl.className='cell-hl';pgEl.appendChild(_hl);}
  _hlPg=pg;const g=GRID(),cw=pgEl.clientWidth/g.cols,ch=pgEl.clientHeight/g.rows,size=Math.min(cw,ch)-8;
  Object.assign(_hl.style,{left:col*cw+(cw-size)/2+'px',top:row*ch+(ch-size)/2+'px',width:size+'px',height:size+'px'});
}
function removeHL(){if(_hl){_hl.remove();_hl=null;_hlPg=-1;}}

// FIX: clamp col ET row dans les bornes strictes de la grille
function getCellFromPt(x,y,pgEl){
  const g=GRID(),r=pgEl.getBoundingClientRect();
  return{
    col:Math.min(g.cols-1,Math.max(0,Math.floor((x-r.left)/(r.width/g.cols)))),
    row:Math.min(g.rows-1,Math.max(0,Math.floor((y-r.top)/(r.height/g.rows))))
  };
}

function cascadeNext(c,r,goRight,cols){
  if(goRight){c++;if(c>=cols){c=0;r++;}}else{c--;if(c<0){c=cols-1;r--;}}
  if(r<0)return null;return{col:c,row:r};
}
function computeLiveLayout(srcData,ic,col,row,pg){
  const d=srcData.map(x=>Object.assign({},x,{folderItems:x.folderItems?x.folderItems.slice():undefined}));
  const me=d.find(x=>x.id===ic.id);
  const existing=d.find(x=>x.page===pg&&x.col===col&&x.row===row&&x.id!==ic.id);
  if(!existing){if(me){me.col=col;me.row=row;me.page=pg;}return d;}
  if(existing.folder){if(me){me.col=col;me.row=row;me.page=pg;}return d;}
  const g=GRID();
  let goRight=true;
  if(me){const dcol=col-me.col,drow=row-me.row;if(dcol>0||(dcol===0&&drow>0))goRight=false;}
  const meOrig=me?{col:me.col,row:me.row}:null;
  if(me){me.col=-1;me.row=-1;}
  const nextCell=(c,r)=>cascadeNext(c,r,goRight,g.cols);
  const cellOcc=(c,r)=>d.find(x=>x.page===pg&&x.col===c&&x.row===r);
  const chain=[existing];
  let cur={col:existing.col,row:existing.row},next=nextCell(cur.col,cur.row);
  while(next){const occ=cellOcc(next.col,next.row);if(!occ)break;chain.push(occ);cur=next;next=nextCell(cur.col,cur.row);}
  if(!next){if(me&&meOrig){me.col=meOrig.col;me.row=meOrig.row;}return srcData;}
  let freeCell=next;
  for(let ci=chain.length-1;ci>=0;ci--){const ic2=chain[ci],tmp={col:ic2.col,row:ic2.row};ic2.col=freeCell.col;ic2.row=freeCell.row;freeCell=tmp;}
  if(me){me.col=freeCell.col;me.row=freeCell.row;me.page=pg;}
  return d;
}
function renderDeskFromData(data,skipId){
  const g=GRID(),n=getPgCount();
  for(let p=0;p<n;p++){
    const el=document.getElementById('page-'+p);if(!el)continue;
    for(const ic of iconsForPage(data,p)){
      if(ic.id===skipId)continue;
      const col=Math.max(0,Math.min(g.cols-1,ic.col)),row=Math.max(0,Math.min(g.rows-1,ic.row||0));
      const w=el.querySelector('[data-id="'+ic.id+'"]');
      if(w){w.style.gridColumn=col+1;w.style.gridRow=row+1;}
    }
  }
}
function renderDeskFromDataCtx(data,skipId,isFolder){
  if(isFolder){
    const pg=document.getElementById('folder-page-0');if(!pg)return;
    const g=GRID();
    for(const ic of data){
      if(ic.id===skipId)continue;
      const col=Math.max(0,Math.min(g.cols-1,ic.col)),row=Math.max(0,Math.min(g.rows-1,ic.row||0));
      const w=pg.querySelector('[data-id="'+ic.id+'"]');
      if(w){w.style.gridColumn=col+1;w.style.gridRow=row+1;}
    }
  }else renderDeskFromData(data,skipId);
}

const ghost=document.getElementById('drag-ghost');
let _edgeT=null,_liveLayout=null,_livePrevCell=null,_folderT=null,_folderPending=false,_baseLayout=null;

function setupDrag(wrap,ic,isFolder){
  let sx=0,sy=0,pDown=false,longT=null,dragStarted=false,hasMoved=false;
  wrap.addEventListener('pointerdown',e=>{
    if(e.button>0||e.target.classList.contains('icon-del'))return;
    pDown=true;dragStarted=false;hasMoved=false;sx=e.clientX;sy=e.clientY;
    // Longpress → edit/delete mode SEULEMENT si on ne bouge pas
    longT=setTimeout(()=>{longT=null;if(!hasMoved)enterEdit();},440);
  });
  wrap.addEventListener('pointermove',e=>{
    if(!pDown||e.buttons===0)return;
    const dx=e.clientX-sx,dy=e.clientY-sy,dist=Math.hypot(dx,dy);
    if(dist<5)return;
    // Si mouvement détecté : annule le longpress (pas de mode delete au drag)
    if(!hasMoved){hasMoved=true;clearTimeout(longT);longT=null;}
    if(!isPC()&&!dragStarted&&Math.abs(dx)>Math.abs(dy)*1.4&&dist>12){pDown=false;return;}
    if(!dragStarted&&dist>8){
      dragStarted=true;isDragging=true;
      _baseLayout=isFolder ?
        (folderStack[folderStack.length-1]&&folderStack[folderStack.length-1].ic&&folderStack[folderStack.length-1].ic.folderItems||[]).map(x=>Object.assign({},x)) :
        LD();
      _liveLayout=null;_livePrevCell=null;_folderT=null;_folderPending=false;
      try{wrap.setPointerCapture(e.pointerId);}catch(ex){}
      const gContent=isImageURL(ic.icon) ?
        '<img src="'+ic.icon+'" style="width:36px;height:36px;object-fit:contain;border-radius:8px">' :
        '<span style="font-size:25px">'+ic.icon+'</span>';
      ghost.innerHTML='<div class="icon-body" style="width:52px;height:52px;border-radius:50%;display:flex;align-items:center;justify-content:center">'+gContent+'</div>';
      ghost.style.display='block';wrap.style.opacity='0';
    }
    if(!dragStarted)return;
    ghost.style.left=e.clientX-26+'px';ghost.style.top=e.clientY-33+'px';
    if(!isFolder){
      const vw=window.innerWidth,ew=vw*0.14;
      if(e.clientX<ew&&curPg>0){
        if(!_edgeT)_edgeT=setTimeout(()=>{_edgeT=null;goPage(curPg-1,true);},550);
      }else if(e.clientX>vw-ew-(isPC()?64:0)){
        if(!_edgeT)_edgeT=setTimeout(()=>{
          _edgeT=null;
          if(curPg>=getPgCount()-1){
            const nn=getPgCount()+1;setPgCount(nn);
            const slider=document.getElementById('desktop-slider');
            const unit=isPC()?'calc(100vw - 64px)':'100vw';
            slider.style.width='calc('+nn+' * '+unit+')';
            const newpg=document.createElement('div');newpg.className='desktop-page';newpg.id='page-'+(nn-1);newpg.dataset.page=nn-1;
            slider.appendChild(newpg);updateDots();
          }
          goPage(curPg+1,true);
        },1000);
      }else{clearTimeout(_edgeT);_edgeT=null;}
    }
    const activePg=isFolder?0:curPg;
    const pgEl=document.getElementById(isFolder?'folder-page-0':'page-'+curPg);if(!pgEl)return;
    const c=getCellFromPt(e.clientX,e.clientY,pgEl);
    showHL(c.col,c.row,pgEl,activePg);
    const base=_baseLayout||[];
    const existing=base.find(x=>x.page===activePg&&x.col===c.col&&x.row===c.row&&x.id!==ic.id);
    const pgRect=pgEl.getBoundingClientRect();const g=GRID();
    const cellW=pgRect.width/g.cols,cellH=pgRect.height/g.rows;
    const relX=(e.clientX-(pgRect.left+c.col*cellW))/cellW,relY=(e.clientY-(pgRect.top+c.row*cellH))/cellH;
    const atCenter=relX>0.3&&relX<0.7&&relY>0.3&&relY<0.7;
    const cellKey=c.col+','+c.row+','+activePg;
    if(cellKey!==_livePrevCell){
      _livePrevCell=cellKey;clearTimeout(_folderT);_folderT=null;_folderPending=false;
      renderDeskFromDataCtx(_baseLayout,ic.id,isFolder);_liveLayout=null;
      if(existing&&!existing.folder&&!ic.folder){
        _folderT=setTimeout(()=>{_folderT=null;if(!_folderPending){_liveLayout=computeLiveLayout(_baseLayout,ic,c.col,c.row,activePg);renderDeskFromDataCtx(_liveLayout,ic.id,isFolder);}},500);
      }else{
        _liveLayout=computeLiveLayout(_baseLayout,ic,c.col,c.row,activePg);
        renderDeskFromDataCtx(_liveLayout,ic.id,isFolder);
      }
    }else if(existing&&!existing.folder&&!ic.folder&&!_liveLayout){
      if(atCenter&&_folderT){clearTimeout(_folderT);_folderT=null;_folderPending=true;}
      else if(!atCenter&&_folderPending){
        _folderPending=false;
        _folderT=setTimeout(()=>{_folderT=null;_liveLayout=computeLiveLayout(_baseLayout,ic,c.col,c.row,activePg);renderDeskFromDataCtx(_liveLayout,ic.id,isFolder);},300);
      }
    }
  },{passive:true});

  wrap.addEventListener('pointerup',e=>{
    clearTimeout(longT);longT=null;clearTimeout(_edgeT);_edgeT=null;clearTimeout(_folderT);_folderT=null;
    if(!pDown)return;pDown=false;
    if(dragStarted){
      dragStarted=false;ghost.style.display='none';removeHL();wrap.style.opacity='';
      const cx=e.clientX,cy=e.clientY;
      requestAnimationFrame(()=>{
        const activePg=isFolder?0:curPg;
        if(isFolder){
          const folderPanel=document.getElementById('panel-folder');
          const fpRect=folderPanel&&folderPanel.getBoundingClientRect();
          const dropZone=document.getElementById('folder-drop-zone');
          const dzRect=dropZone&&dropZone.getBoundingClientRect();
          const onDZ=dzRect&&cx>=dzRect.left&&cx<=dzRect.right&&cy>=dzRect.top&&cy<=dzRect.bottom;
          const outside=!fpRect||(cx<fpRect.left||cx>fpRect.right||cy<fpRect.top||cy>fpRect.bottom);
          if(outside||onDZ){ejectFromFolder(ic);return;}
        }
        const pgEl=document.getElementById(isFolder?'folder-page-0':'page-'+curPg);
        if(pgEl){
          const c2=getCellFromPt(cx,cy,pgEl);
          const base=_baseLayout||[];
          const freshD=LD();
          const existingFresh=freshD.find(x=>x.page===activePg&&x.col===c2.col&&x.row===c2.row&&x.id!==ic.id);
          let existing2=null;
          if(isFolder){
            const topIc=folderStack[folderStack.length-1]&&folderStack[folderStack.length-1].ic;
            const topFound=topIc?findIconParent(topIc.id,freshD):null;
            if(topFound){existing2=(topFound.item.folderItems||[]).find(x=>x.page===0&&x.col===c2.col&&x.row===c2.row&&x.id!==ic.id)||null;}
          }else{
            existing2=existingFresh;
          }
          if(existing2&&existing2.folder){
            _liveLayout=null;_baseLayout=null;_livePrevCell=null;
            addToFolder(ic,existing2,isFolder);
          }else if(existing2&&!existing2.folder&&!ic.folder&&!_liveLayout){
            if(isFolder)saveFolderItems(_baseLayout);else SD(_baseLayout);
            _liveLayout=null;_baseLayout=null;_livePrevCell=null;
            createFolder(ic,existing2,isFolder);
          }else{
            if(_liveLayout){if(isFolder)saveFolderItems(_liveLayout);else SD(_liveLayout);}
            else{
              const me=base.find(x=>x.id===ic.id);
              if(me){me.col=c2.col;me.row=c2.row;if(!isFolder)me.page=curPg;if(isFolder)saveFolderItems(base);else SD(base);}
            }
            _liveLayout=null;_baseLayout=null;_livePrevCell=null;
            if(isFolder)refreshFolderPanel();else{renderDesk();autoCleanPages();}
          }
        }else{
          _liveLayout=null;_baseLayout=null;_livePrevCell=null;
          if(isFolder)refreshFolderPanel();else{renderDesk();autoCleanPages();}
        }
      });
    }
    setTimeout(()=>{isDragging=false;_lastDragEnd=Date.now();},80);
  });
  wrap.addEventListener('pointercancel',()=>{
    clearTimeout(longT);longT=null;clearTimeout(_edgeT);_edgeT=null;clearTimeout(_folderT);_folderT=null;
    pDown=false;dragStarted=false;isDragging=false;_folderPending=false;
    ghost.style.display='none';removeHL();wrap.style.opacity='';
    if(_baseLayout){
      if(isFolder)saveFolderItems(_baseLayout);else SD(_baseLayout);
      _baseLayout=null;_liveLayout=null;_livePrevCell=null;
      if(isFolder)refreshFolderPanel();else{renderDesk();autoCleanPages();}
    }
  });
}

function ejectFromFolder(ic){
  if(!folderStack.length)return;
  const d=LD();
  const topIc=folderStack[folderStack.length-1].ic;
  const found=findIconParent(topIc.id,d);
  if(!found){_liveLayout=null;_baseLayout=null;_livePrevCell=null;return;}

  const newFI=(found.item.folderItems||[]).filter(x=>x.id!==ic.id);
  const inSubFolder=folderStack.length>1;

  if(newFI.length===0){
    // Dossier vide → supprime-le
    const idx=found.parent.findIndex(x=>x.id===topIc.id);
    if(idx>=0)found.parent.splice(idx,1);
    SD(d);
    if(inSubFolder){
      folderStack.pop();
      const parentEntry=folderStack[folderStack.length-1];
      const pFound=findIconParent(parentEntry.ic.id,LD());
      if(pFound){parentEntry.ic=pFound.item;renderFolderPanel(pFound.item);}
    }else{
      folderStack.length=0;rmEl('panel-folder');rmEl('panel-overlay');
    }
    toast('Folder removed','info');
  }else if(newFI.length===1){
    // 1 item restant → dissolution du dossier
    const solo=newFI[0];
    const idx=found.parent.findIndex(x=>x.id===topIc.id);
    if(idx>=0)found.parent.splice(idx,1);
    // Le solo reprend la position du dossier dissous
    found.parent.push({id:solo.id,icon:solo.icon,label:solo.label,
      page:topIc.page||0,col:topIc.col||0,row:topIc.row||0,
      notif:solo.notif||0,folder:solo.folder||false,
      folderItems:deepCopyFolderItems(solo.folderItems)});
    SD(d);
    toast('Folder dissolved','info');
    if(inSubFolder){
      folderStack.pop();
      const parentEntry=folderStack[folderStack.length-1];
      const pFound=findIconParent(parentEntry.ic.id,LD());
      if(pFound){parentEntry.ic=pFound.item;renderFolderPanel(pFound.item);}
    }else{
      folderStack.length=0;rmEl('panel-folder');rmEl('panel-overlay');
    }
  }else{
    // Plusieurs items → met à jour normalement
    found.item.folderItems=newFI;topIc.folderItems=newFI;SD(d);
  }

  _liveLayout=null;_baseLayout=null;_livePrevCell=null;

  // L'icône éjectée va dans le dossier PARENT si on est dans un sous-dossier,
  // sinon elle va sur le bureau
  const d2=LD();
  if(!findIconParent(ic.id,d2)){
    if(inSubFolder&&folderStack.length>0){
      // Place dans le dossier parent courant
      const parentEntry=folderStack[folderStack.length-1];
      const parentFound=findIconParent(parentEntry.ic.id,d2);
      if(parentFound){
        const pFI=parentFound.item.folderItems||[];
        const pos=findEmptyInFolder(pFI);
        pFI.push({id:ic.id,icon:ic.icon,label:ic.label,page:0,col:pos.col,row:pos.row,
          notif:ic.notif||0,folder:ic.folder||false,
          folderItems:deepCopyFolderItems(ic.folderItems)});
        parentFound.item.folderItems=pFI;
        parentEntry.ic=parentFound.item;
        SD(d2);
      }
    }else{
      // Place sur le bureau
      const empty=findEmptyIn(d2,curPg);
      d2.push({id:ic.id,icon:ic.icon,label:ic.label,page:curPg,
        col:empty?empty.col:0,row:empty?empty.row:0,
        notif:ic.notif||0,folder:ic.folder||false,
        folderItems:deepCopyFolderItems(ic.folderItems)});
      SD(d2);
    }
  }

  renderDesk();
  if(folderStack.length)refreshFolderPanel();
}

function saveFolderItems(newItems){
  if(!folderStack.length)return;
  const topIc=folderStack[folderStack.length-1].ic;
  const d=LD(),found=findIconParent(topIc.id,d);if(!found)return;
  const idx=found.parent.findIndex(x=>x.id===topIc.id);
  const closeFolder=()=>{folderStack.length=0;rmEl('panel-folder');rmEl('panel-overlay');};
  if(!newItems||newItems.length===0){
    if(idx>=0)found.parent.splice(idx,1);SD(d);closeFolder();renderDesk();toast('Folder removed','info');return;
  }
  if(newItems.length===1&&folderStack.length===1){
    const solo=newItems[0];if(idx>=0)found.parent.splice(idx,1);
    found.parent.push({id:solo.id,icon:solo.icon,label:solo.label,page:topIc.page||0,col:topIc.col||0,row:topIc.row||0,notif:solo.notif||0,folder:solo.folder||false,folderItems:deepCopyFolderItems(solo.folderItems)});
    SD(d);closeFolder();renderDesk();toast('Folder dissolved','info');return;
  }
  if(newItems.length===1&&folderStack.length>1){
    const solo=newItems[0];if(idx>=0)found.parent.splice(idx,1);
    found.parent.push({id:solo.id,icon:solo.icon,label:solo.label,page:topIc.page||0,col:topIc.col||0,row:topIc.row||0,notif:solo.notif||0,folder:solo.folder||false,folderItems:deepCopyFolderItems(solo.folderItems)});
    SD(d);folderStack.pop();
    const pFound=findIconParent(folderStack[folderStack.length-1].ic.id,LD());
    if(pFound){folderStack[folderStack.length-1].ic=pFound.item;renderFolderPanel(pFound.item);}
    toast('Folder dissolved','info');return;
  }
  found.item.folderItems=newItems;topIc.folderItems=newItems;SD(d);
}
function refreshFolderPanel(){
  if(!folderStack.length)return;
  const top=folderStack[folderStack.length-1];
  const found=findIconParent(top.ic.id,LD());
  if(found){top.ic=found.item;renderFolderPanel(top.ic);}
  else{folderStack.length=0;rmEl('panel-folder');rmEl('panel-overlay');renderDesk();}
}
function createFolder(src,tgt,isFolder){
  // Lire les notifs fraîches depuis le storage
  const freshD=LD();
  const freshSrc=findIconParent(src.id,freshD);
  const freshTgt=findIconParent(tgt.id,freshD);
  const srcNotif=freshSrc?freshSrc.item.notif:(src.notif||0);
  const tgtNotif=freshTgt?freshTgt.item.notif:(tgt.notif||0);
  const newFolder={id:'f_'+Date.now(),icon:'📁',label:'Folder',page:tgt.page,col:tgt.col,row:tgt.row,notif:0,folder:true,
    folderItems:[
      {id:tgt.id,icon:tgt.icon,label:tgt.label,page:0,col:0,row:0,notif:tgtNotif,folder:tgt.folder||false,folderItems:deepCopyFolderItems(tgt.folderItems)},
      {id:src.id,icon:src.icon,label:src.label,page:0,col:1,row:0,notif:srcNotif,folder:src.folder||false,folderItems:deepCopyFolderItems(src.folderItems)}
    ]};
  if(isFolder){
    const d=LD(),topIc=folderStack[folderStack.length-1]&&folderStack[folderStack.length-1].ic;
    const found=topIc?findIconParent(topIc.id,d):null;
    if(found){
      const items=found.item.folderItems||[];
      const ti=items.findIndex(i=>i.id===tgt.id);if(ti>=0)items[ti]=newFolder;
      const si=items.findIndex(i=>i.id===src.id);if(si>=0)items.splice(si,1);
      found.item.folderItems=items;topIc.folderItems=items;SD(d);refreshFolderPanel();
    }
  }else{
    let d=LD();
    const ti=d.findIndex(i=>i.id===tgt.id);if(ti>=0)d[ti]=newFolder;
    d=d.filter(i=>i.id!==src.id);SD(d);renderDesk();
  }
}

const deskEl=document.getElementById('desktop');
let bgLT=null,bgSX=0,bgSY=0,bgMoved=false,_bgActive=false;
const isInteractive=t=>!!(t.closest('.icon-wrap')||t.closest('.page-plus'));
const isRealPage=p=>p>=0&&p<getPgCount();
const pageOf=el=>{const pg=el&&el.closest&&el.closest('.desktop-page');return parseInt(pg&&pg.dataset&&pg.dataset.page||curPg)||0;};

(()=>{
  let sx=0,sy=0,active=false,lt=null,startT=0;
  deskEl.addEventListener('touchstart',e=>{
    if(e.touches.length!==1)return;
    const t=e.touches[0];sx=t.clientX;sy=t.clientY;active=true;startT=Date.now();clearTimeout(lt);lt=null;
    if(isInteractive(t.target))return;
    const pg=pageOf(t.target);if(!isRealPage(pg))return;
    lt=setTimeout(()=>{lt=null;active=false;showBgDlg(pg);},1000);
  },{passive:true});
  deskEl.addEventListener('touchmove',e=>{
    if(!active)return;const dx=e.touches[0].clientX-sx,dy=e.touches[0].clientY-sy;
    if(Math.abs(dx)>20||Math.abs(dy)>8){clearTimeout(lt);lt=null;}
  },{passive:true});
  deskEl.addEventListener('touchend',e=>{
    clearTimeout(lt);lt=null;if(!active)return;active=false;
    if(isDragging||Date.now()-_lastDragEnd<300)return;
    if(isInteractive(e.target))return;
    const dx=e.changedTouches[0].clientX-sx,dy=e.changedTouches[0].clientY-sy;
    const elapsed=Date.now()-startT,vx=Math.abs(dx)/elapsed,vy=Math.abs(dy)/elapsed;
    if(Math.abs(dy)>50&&Math.abs(dy)>Math.abs(dx)*1.5&&vy>0.2){if(dy<0&&window.YM)window.YM.openSwitcher();return;}
    if(Math.abs(dx)>40&&Math.abs(dx)>Math.abs(dy)*1.5&&vx>0.2){if(editMode){exitEdit();return;}goPage(dx<0?curPg+1:curPg-1,true);}
  },{passive:true});
})();

deskEl.addEventListener('pointerdown',e=>{
  _bgActive=false;if(isInteractive(e.target))return;
  bgSX=e.clientX;bgSY=e.clientY;bgMoved=false;_bgActive=true;
  const pg=pageOf(e.target);if(!isRealPage(pg)){_bgActive=false;return;}
  bgLT=setTimeout(()=>{bgLT=null;if(!bgMoved)showBgDlg(pg);},1000);
},{passive:true});
deskEl.addEventListener('pointermove',e=>{
  if(bgLT&&(Math.abs(e.clientX-bgSX)>20||Math.abs(e.clientY-bgSY)>8)){bgMoved=true;clearTimeout(bgLT);bgLT=null;}
},{passive:true});
deskEl.addEventListener('pointerup',e=>{
  clearTimeout(bgLT);bgLT=null;
  if(editMode&&!isDragging&&!e.target.closest('.icon-wrap')){exitEdit();return;}
  if(e.pointerType==='mouse'&&_bgActive){
    const dx=e.clientX-bgSX,dy=e.clientY-bgSY;_bgActive=false;
    if(!isDragging&&Date.now()-_lastDragEnd>200){
      if(Math.abs(dy)>60&&Math.abs(dy)>Math.abs(dx)*1.5&&dy<0&&window.YM)window.YM.openSwitcher();
      else if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.1)goPage(dx<0?curPg+1:curPg-1,true);
    }
  }else _bgActive=false;
},{passive:true});
deskEl.addEventListener('dblclick',e=>{if(navigator.maxTouchPoints>0||isInteractive(e.target))return;showBgDlg(pageOf(e.target));});

function showBgDlg(p){
  if(!isRealPage(p))return;
  document.getElementById('bg-dlg-title').textContent='Background';
  const del=document.getElementById('bg-del');if(del)del.style.display='none';
  document.getElementById('bg-wp').onclick=()=>{document.getElementById('bg-dlg').classList.remove('open');pickWP();};
  document.getElementById('bg-remove').onclick=()=>{localStorage.removeItem(WK);applyWP();document.getElementById('bg-dlg').classList.remove('open');toast('Wallpaper removed','info');};
  const bgSph=document.getElementById('bg-spheres');
  if(bgSph)bgSph.onclick=()=>{document.getElementById('bg-dlg').classList.remove('open');if(window.YM){window.YM.openPanel('panel-spheres');if(window.YM_Liste)window.YM_Liste.render();}};
  const PRESETS=[
    {label:'Night City',url:'https://images.unsplash.com/photo-1518098268026-4e89f1a2cd8e?w=1400&q=80'},
    {label:'Tokyo Night',url:'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=1400&q=80'},
    {label:'Aurora',url:'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=1400&q=80'},
    {label:'Mountains',url:'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1400&q=80'},
    {label:'Galaxy',url:'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=1400&q=80'},
    {label:'Nebula',url:'https://images.unsplash.com/photo-1543722530-d2c3201371e7?w=1400&q=80'},
    {label:'Dark Gradient',url:'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=1400&q=80'},
    {label:'Lava Flow',url:'https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=1400&q=80'},
    {label:'City Aerial',url:'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=1400&q=80'},
    {label:'Geometric',url:'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1400&q=80'},
    {label:'Milky Way',url:'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=1400&q=80'},
  ];
  const grid=document.getElementById('bg-presets');
  if(grid&&!grid.children.length){
    PRESETS.forEach(pr=>{
      const btn=document.createElement('button');
      btn.style.cssText='border:none;cursor:pointer;border-radius:6px;overflow:hidden;padding:0;aspect-ratio:16/9;background:#111;transition:transform .15s';
      btn.innerHTML='<img src="'+pr.url+'&w=200" alt="'+pr.label+'" style="width:100%;height:100%;object-fit:cover;display:block" loading="lazy">';
      btn.title=pr.label;
      btn.addEventListener('mouseenter',()=>{btn.style.transform='scale(1.04)';});
      btn.addEventListener('mouseleave',()=>{btn.style.transform='';});
      btn.addEventListener('click',()=>{
        toast('Loading…','info');
        const img=new Image();img.crossOrigin='anonymous';
        img.onload=()=>{
          const c=document.createElement('canvas');c.width=1200;c.height=750;
          c.getContext('2d').drawImage(img,0,0,1200,750);
          try{localStorage.setItem(WK,c.toDataURL('image/jpeg',0.85));}catch(err){localStorage.setItem(WK,pr.url);}
          applyWP();document.getElementById('bg-dlg').classList.remove('open');toast('Wallpaper: '+pr.label,'success');
        };
        img.onerror=()=>{
          localStorage.setItem(WK,pr.url);applyWP();
          document.getElementById('bg-dlg').classList.remove('open');toast('Wallpaper set','success');
        };
        img.src=pr.url;
      });
      grid.appendChild(btn);
    });
  }
  document.getElementById('bg-dlg').classList.add('open');
}
document.getElementById('bg-dlg').addEventListener('click',e=>{if(e.target===document.getElementById('bg-dlg'))document.getElementById('bg-dlg').classList.remove('open');});

function deskInit(){
  applyWP();
  const icons=LD();
  const maxPage=icons.length?Math.max(...icons.map(i=>i.page)):0;
  setPgCount(maxPage+1);buildSlider();goPage(0,false);
}
window.YM_Desk={addIcon,removeIcon,setNotif,renderDesk,goPage,getPgCount,buildSlider,autoCleanPages,enterEdit,exitEdit,
  registerWidgetPage,unregisterWidget,
  get safeBottom(){return getDeskSafeBottom();},
  get curPg(){return curPg;},
  get isDragging(){return isDragging;},
  get editMode(){return editMode;},
  goPageOrCreate(n){if(n>=getPgCount()){setPgCount(n+1);buildSlider();}goPage(n,true);},
  deskInit};
window.YM_closeFolderPanel=closeFolderPanel;
Object.defineProperty(window,'_deskFolderStack',{get:()=>folderStack,configurable:true});
Object.defineProperty(window,'_deskCurPage',{get:()=>curPg,configurable:true});
Object.defineProperty(window,'_deskPageCount',{get:()=>getPgCount(),configurable:true});
