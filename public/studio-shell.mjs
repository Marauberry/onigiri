

import {makeSortable,readSidebarOrder,writeSidebarOrder,applySidebarOrder,orderKey,SIDEBAR_ORDER_KEYS} from './sidebar-gestures.mjs';
import {referenceMap} from './domain.mjs';

export function studioShell({getProject,api,save,loadProject,createScene,showDashboard,showDraft,restoreView,openDirector,changed,toast,isBusy,session,projectContext,chatDrop,uploadAsset,renderReferences,openReferenceBrowser,addDroppedMedia}){
 const $=id=>document.getElementById(id),workspace=document.querySelector('.workspace'),main=workspace.querySelector('main'),inspector=document.querySelector('.inspector'),library=document.querySelector('.library');
 const nav=document.createElement('aside');nav.className='studio-nav';nav.innerHTML='<div class="studio-wordmark"><img src="/onigiri.svg" alt=""><b>Onigiri</b><button data-collapse aria-label="Collapse sidebar" title="Collapse sidebar">◧</button></div><nav aria-label="Studio navigation"><button data-route="start" aria-label="Start Creating" title="Start Creating"><span class="nav-icon">＋</span><span class="nav-label">Start Creating</span></button><button data-route="gallery" aria-label="Project Gallery" title="Project Gallery"><span class="nav-icon">▧</span><span class="nav-label">Project Gallery</span></button></nav><div class="nav-projects"><p class="eyebrow">PROJECTS</p><div data-tree></div></div><footer>● Local workspace</footer>';workspace.prepend(nav);const collapse=nav.querySelector('[data-collapse]');const setCollapsed=value=>{workspace.classList.toggle('sidebar-collapsed',value);document.body.classList.toggle('rail-collapsed',value);collapse.setAttribute('aria-label',value?'Expand sidebar':'Collapse sidebar');collapse.title=value?'Expand sidebar':'Collapse sidebar';collapse.setAttribute('aria-expanded',String(!value));localStorage.setItem('onigiri-sidebar-collapsed',String(value));};setCollapsed(localStorage.getItem('onigiri-sidebar-collapsed')==='true');collapse.onclick=()=>setCollapsed(!workspace.classList.contains('sidebar-collapsed'));
 // Minimised rail: the collapse control disappears and the logo itself reopens the sidebar.
 const wordmark=nav.querySelector('.studio-wordmark');
 const expandSidebar=()=>{if(workspace.classList.contains('sidebar-collapsed'))nav.querySelector('[data-collapse]').click();};
 const syncWordmark=()=>{const collapsed=workspace.classList.contains('sidebar-collapsed');wordmark.tabIndex=collapsed?0:-1;wordmark.title=collapsed?'Expand sidebar':'';if(collapsed){wordmark.setAttribute('role','button');wordmark.setAttribute('aria-label','Expand sidebar');}else{wordmark.removeAttribute('role');wordmark.setAttribute('aria-label','Onigiri');}};
 wordmark.addEventListener('click',event=>{if(event.target.closest('[data-collapse]'))return;expandSidebar();});
 wordmark.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();expandSidebar();}});
 new MutationObserver(syncWordmark).observe(workspace,{attributes:true,attributeFilter:['class']});syncWordmark();
 const rail=document.createElement('div');rail.className='asset-rail';workspace.append(rail);
 const pages=document.createElement('section');pages.id='studioPages';workspace.append(pages);
 const assetDialog=document.createElement('dialog');assetDialog.className='assets-drawer';assetDialog.innerHTML='<header class="section-heading"><h2>Scene assets</h2><button data-close>Close</button></header>';assetDialog.querySelector('button').onclick=()=>assetDialog.close();assetDialog.append(library,$('referenceDetails'));document.body.append(assetDialog);library.querySelector('.project-picker').hidden=true;
 const assets=()=>{assetDialog.append(library);assetDialog.showModal();};assetDialog.addEventListener('close',()=>{if(workspace.classList.contains('prompt-assets'))rail.append(library);});const showAssets=on=>{on=!!on;workspace.classList.toggle('prompt-assets',on);(on?rail:assetDialog).append(library);};const assetsButton=document.createElement('button');assetsButton.textContent='References & subjects';assetsButton.onclick=assets;main.querySelector('.editor-toolbar .row').prepend(assetsButton);
 const sceneDialog=document.createElement('dialog');sceneDialog.className='scene-settings';sceneDialog.innerHTML='<header class="section-heading"><h2>Scene settings</h2><button>Close</button></header>';sceneDialog.querySelector('button').onclick=()=>sceneDialog.close();sceneDialog.append(inspector.querySelector('.output-card'),inspector.querySelector('.duration-card'));document.body.append(sceneDialog);const sceneButton=document.createElement('button');sceneButton.textContent='Canvas & duration';sceneButton.onclick=()=>sceneDialog.showModal();main.querySelector('.editor-toolbar .row').append(sceneButton);
 // The old drafting panel is gone: writing direction and detail live in Settings, and the Director owns drafting.
 const health=document.createElement('div');health.className='runtime-health';health.append($('memoryStatus'),$('unloadComfy'));document.querySelector('.topbar').prepend(health);$('unloadComfy').textContent='Unload ComfyUI';inspector.querySelector('.assistant-card')?.remove();
 const gallery=$('projectDialog');gallery.classList.add('gallery-page');pages.append(gallery);const galleryHeading=document.createElement('header');galleryHeading.className='page-heading';galleryHeading.innerHTML='<h1>Project Gallery</h1>';gallery.prepend(galleryHeading);const sort=document.createElement('select');sort.id='gallerySort';sort.setAttribute('aria-label','Sort scenes');sort.innerHTML='<option value=updated>Recently updated</option><option value=name>Name</option><option value=created>Date created</option>';$('projectSearch').after(sort);sort.onchange=()=>$('projectSearch').dispatchEvent(new Event('input'));const order=document.createElement('button');order.id='galleryOrder';order.textContent='↓↑';order.title='Reverse sorting';order.setAttribute('aria-label','Reverse sorting');order.dataset.direction='desc';sort.after(order);order.onclick=()=>{order.dataset.direction=order.dataset.direction==='desc'?'asc':'desc';order.setAttribute('aria-pressed',String(order.dataset.direction==='asc'));$('projectSearch').dispatchEvent(new Event('input'));};$('dashboardNew').after($('importPackage'));const addFolderHost=document.createElement('span');addFolderHost.id='galleryAddFolder';addFolderHost.className='gallery-add-folder';$('importPackage').after(addFolderHost);const scroller=document.createElement('div');scroller.className='gallery-scroll';scroller.append($('homeIntro'),$('homeFolders'),$('projectCards'));gallery.append(scroller);gallery.querySelector('.project-views').append($('dashboardTrash'));$('dashboardTrash').innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg> Trash';gallery.addEventListener('close',()=>{if(document.body.dataset.studioPage==='gallery')navigate('scene');});
 let page='start',refreshLanding=null;const selectedProjects=new Set();let projectAnchor=null;new MutationObserver(()=>{if(page==='scene'&&!isBusy())openDirector(false);if(page==='start')refreshLanding?.();}).observe($('referenceList'),{childList:true});
 const safe=fn=>async(...args)=>{try{await fn(...args);}catch(e){toast(e.message);}};
 let galleryTimer=0;
 const revealGallery=()=>{clearTimeout(galleryTimer);gallery.hidden=false;gallery.classList.remove('gallery-page--leave');gallery.classList.add('gallery-page--enter');galleryTimer=setTimeout(()=>gallery.classList.remove('gallery-page--enter'),300);};
 // The gallery leaves instantly: its page is transparent, so fading it out while the next page
 // animates in showed both at once. The incoming page carries the transition instead.
 const retireGallery=()=>{clearTimeout(galleryTimer);gallery.hidden=true;gallery.classList.remove('gallery-page--enter','gallery-page--leave');};
 // Leaving and entering a studio page animates, so Start Creating never snaps in or out.
 function dismissPages(instant=false){
  const leaving=[...pages.querySelectorAll('.studio-page')];if(!leaving.length)return;
  if(instant||matchMedia('(prefers-reduced-motion: reduce)').matches){for(const el of leaving)el.remove();return;}
  for(const el of leaving){el.classList.add('studio-page--leaving');el.animate([{opacity:1,transform:'none'},{opacity:0,transform:'translateY(-10px) scale(.99)'}],{duration:170,easing:'ease-in'});}
  setTimeout(()=>{for(const el of leaving)el.remove();},190);
 }
 async function navigate(next){if(isBusy()&&next!==page){toast('Wait for the current request or cancel it first.');return;}page=next;refreshLanding=null;document.body.dataset.studioPage=next;nav.querySelectorAll('[data-route]').forEach(b=>b.classList.toggle('active',b.dataset.route===next));main.hidden=next!=='scene';inspector.hidden=next!=='scene';pages.hidden=next==='scene';if(next==='gallery')revealGallery();else retireGallery();if(next==='scene'){dismissPages(next==='gallery');showAssets(false);restoreView?.();openDirector();if(!matchMedia('(prefers-reduced-motion: reduce)').matches){for(const el of [main,inspector])el.animate([{opacity:0,transform:'translateY(14px) scale(.98)'},{opacity:1,transform:'none'}],{duration:240,easing:'ease-out'});}return;}if(next!=='scene')dismissPages(next==='gallery');if(next!=='scene')showAssets(false);if(next==='start')await landing();}
 for(const b of nav.querySelectorAll('[data-route]'))b.onclick=safe(async()=>{if(b.dataset.route==='gallery')await showDashboard();else await navigate(b.dataset.route);});
 const pageHost=()=>{const el=document.createElement('div');el.className='studio-page';pages.append(el);return el;};
 function card(title,text,action,tag='BUILT IN'){const b=document.createElement('button');b.className='studio-card';const art=document.createElement('div');art.className='studio-card-art';art.textContent=title.slice(0,1);const badge=document.createElement('small');badge.textContent=tag;const h=document.createElement('h3');h.textContent=title;const p=document.createElement('p');p.textContent=text;b.append(art,badge,h,p);b.onclick=safe(action);return b;}
 async function landing(){
  const host=pageHost();host.classList.add('start-page','studio-page--enter');
  host.innerHTML='<section class="start-hero"><span class="local-pill">LOCAL MODELS · YOUR CREATIVE WORKSPACE</span><h1>What will you create?</h1><p>One conversation. A scene you can shape.</p><div class="start-composer"><div class="start-references" aria-label="Pending references"></div><textarea aria-label="Describe your creation" rows="4" placeholder="Describe what you want to create. Use @ to link scene assets."></textarea><div class="row"><button data-assets>＋ Assets</button><button data-model>Models</button><button data-create class="primary">Start creating ↑</button></div></div><div class="start-target"><span class="start-target-label">Select scene</span><div class="scene-picker"><button type="button" class="scene-picker-toggle" aria-haspopup="listbox" aria-expanded="false"><span data-scene-label>New scene</span><i aria-hidden="true">⌄</i></button><div class="scene-menu" hidden><div class="scene-menu-list" role="listbox" aria-label="Scene destination"></div><label class="scene-menu-search"><input type="search" placeholder="Search projects" aria-label="Search projects"></label></div></div></div></section>';
  const items=await api('/api/projects'),input=host.querySelector('textarea'),startButton=host.querySelector('[data-create]'),previews=host.querySelector('.start-references');
  const menu=host.querySelector('.scene-menu'),list=host.querySelector('.scene-menu-list'),toggle=host.querySelector('.scene-picker-toggle'),label=host.querySelector('[data-scene-label]'),search=host.querySelector('.scene-menu-search input');
  let draft={};try{draft=JSON.parse(sessionStorage.getItem('onigiri-start')||'{}');}catch{}
  // The landing keeps its own pending house: text, dropped files, picked assets and @ links wait here
  // until Start Creating. Nothing is created or edited in the meantime, and the Director is untouched.
  let target=items.some(p=>p.id===draft.target)?draft.target:'',starting=false,menuOpen=false;
  let staged=(Array.isArray(draft.pending)?draft.pending:[]).filter(item=>item&&typeof item.id==='string');
  const linked=new Set();
  input.value=draft.text||'';
  const remember=()=>{try{sessionStorage.setItem('onigiri-start',JSON.stringify({text:input.value,target,pending:staged}));}catch{}};
  const sink={files:async files=>{await stageFiles(files);},asset:asset=>{if(asset&&!staged.some(r=>r.id===asset.id)){staged.push(asset);refresh();}}};
  async function stageFiles(files){const queue=[...files];if(!queue.length)return;startButton.disabled=true;$('saveStatus').textContent='Adding references…';try{for(const file of queue)staged.push(await uploadAsset(file));refresh();}catch(error){toast(error.message);}finally{startButton.disabled=false;$('saveStatus').textContent='Saved locally';}}
  const projectRefs=()=>target&&getProject()?.id===target?getProject().references:[];
  const allRefs=()=>[...projectRefs(),...staged];
  const isPending=id=>staged.some(r=>r.id===id);
  const map=()=>referenceMap(allRefs());
  function renderMenu(){
   list.replaceChildren();
   const fresh=document.createElement('button');fresh.type='button';fresh.className='scene-menu-item';fresh.dataset.sceneValue='';fresh.dataset.title='new scene';fresh.setAttribute('role','option');fresh.innerHTML='<b>New scene</b><small>Start a fresh scene</small>';fresh.onclick=()=>choose('');list.append(fresh);
   const projects=items.filter(p=>!p.isTemplate);
   if(projects.length){const separator=document.createElement('div');separator.className='scene-menu-sep';separator.setAttribute('role','separator');list.append(separator);}
   for(const p of projects){const option=document.createElement('button');option.type='button';option.className='scene-menu-item';option.dataset.sceneValue=p.id;option.dataset.title=p.title.toLowerCase();option.setAttribute('role','option');option.textContent=p.title;option.onclick=()=>choose(p.id);list.append(option);}
   applyFilter();
  }
  function applyFilter(){
   const query=search.value.trim().toLowerCase(),options=[...list.querySelectorAll('.scene-menu-item')];
   let visible=0;for(const option of options){const keep=!query||option.dataset.title.includes(query);option.hidden=!keep;if(keep)visible++;}
   const separator=list.querySelector('.scene-menu-sep');if(separator)separator.hidden=options.every(option=>option.hidden);
   let empty=list.querySelector('.scene-menu-empty');
   if(!visible){if(!empty){empty=document.createElement('p');empty.className='scene-menu-empty';empty.textContent='No matching projects.';list.append(empty);}}
   else empty?.remove();
  }
  function openMenu(){
   if(menuOpen)return;menuOpen=true;menu.hidden=false;toggle.setAttribute('aria-expanded','true');
   const rect=toggle.getBoundingClientRect();menu.classList.toggle('scene-menu--up',window.innerHeight-rect.bottom<340);
   menu.animate([{opacity:0,transform:'translateY(-6px) scale(.98)'},{opacity:1,transform:'none'}],{duration:180,easing:'cubic-bezier(.2,.7,.3,1)'});
  }
  function closeMenu(){
   if(!menuOpen)return;menuOpen=false;toggle.setAttribute('aria-expanded','false');
   const done=()=>{if(!menuOpen)menu.hidden=true;};
   if(matchMedia('(prefers-reduced-motion: reduce)').matches)done();
   else menu.animate([{opacity:1,transform:'none'},{opacity:0,transform:'translateY(-5px) scale(.99)'}],{duration:140,easing:'ease-in'}).finished.then(done).catch(done);
   search.value='';applyFilter();
  }
  toggle.onclick=event=>{event.stopPropagation();menuOpen?closeMenu():openMenu();};
  document.addEventListener('pointerdown',event=>{if(menuOpen&&!event.target.closest('.scene-picker'))closeMenu();});
  search.oninput=applyFilter;
  const choose=safe(async value=>{
   target=value;closeMenu();refresh();remember();
   if(value&&getProject()?.id!==value){await save();await loadProject(value,{navigate:false});refresh();}
  });
  refreshLanding=()=>{refresh();};
  function refresh(){
   label.textContent=target?(items.find(p=>p.id===target)?.title||'Scene'):'New scene';
   const refs=allRefs(),labels=map();
   previews.replaceChildren();
   for(const ref of refs){
    const chip=document.createElement('button');chip.type='button';chip.className='start-reference'+(isPending(ref.id)?' start-reference--pending':'');chip.title=ref.name;
    if(ref.thumbnail){const img=document.createElement('img');img.src='/api/asset/'+encodeURIComponent(ref.id)+'?thumb';img.alt='';chip.append(img);}
    const text=document.createElement('span');text.textContent=[labels[ref.id],ref.name].filter(Boolean).join(' ');chip.append(text);
    if(isPending(ref.id)){const remove=document.createElement('i');remove.className='start-reference-remove';remove.textContent='×';remove.title='Remove';remove.onclick=event=>{event.stopPropagation();staged=staged.filter(r=>r.id!==ref.id);linked.delete(ref.id);refresh();remember();};chip.append(remove);}
    previews.append(chip);
   }
   renderMenu();remember();
  }
  renderMenu();refresh();
  host.querySelector('[data-assets]').onclick=()=>openReferenceBrowser(sink);
  host.querySelector('[data-model]').onclick=()=>$('settings').showModal();
  chatDrop(host.querySelector('.start-composer'),input,async()=>null,()=>{refresh();remember();},async transfer=>{
   if(!target){await sink.files(transfer.files||[]);return staged.map(r=>r.id);}
   const owner=getProject(),ids=await addDroppedMedia(transfer);
   if(getProject().id!==owner.id)throw Error('Scene changed during import.');
   return ids;
  });
  input.oninput=()=>{remember();if(input.value.endsWith('@'))linkMenu();};
  function linkMenu(){
   const refs=allRefs();if(!refs.length){toast('Add a reference first, then use @ to describe it.');return;}
   const labels=map();
   choiceDialog('Link a pending reference',refs.map(ref=>[[labels[ref.id],ref.name].filter(Boolean).join(' · '),ref]),ref=>{
    input.value=input.value.replace(/@$/,'')+[labels[ref.id],ref.name].filter(Boolean).join(' ')+' ';
    linked.add(ref.id);refresh();remember();input.dispatchEvent(new Event('input'));input.focus();
   });
  }
  startButton.onclick=safe(async()=>{
   if(starting||isBusy())return;
   const text=input.value.trim();
   if(!text&&!staged.length){toast('Describe what you want to create first.');input.focus();return;}
   starting=true;startButton.disabled=true;
   try{
    await save();
    let p;
    if(target){
     if(target!==getProject()?.id)await loadProject(target,{navigate:false});
     p=getProject();
     const known=new Set(p.references.map(r=>r.id));
     for(const ref of staged)if(!known.has(ref.id))p.references.push(ref);
    }else{
     await createScene({folder:''},{navigate:false});
     p=getProject();
     p.references=[...staged];
     p.title=text.slice(0,60)||'New creation';p.autoTitle=true;
     $('projectTitle').value=p.title;$('projectDashboard').textContent=p.title;
    }
    p.directorInput=[p.directorInput?.trim(),text].filter((value,index,all)=>value&&all.indexOf(value)===index).join('\n\n');
    p.directorLinks=[...new Set([...(p.directorLinks||[]),...p.references.map(r=>r.id),...linked])];
    changed();if(renderReferences)renderReferences();await save();
    try{sessionStorage.removeItem('onigiri-start');}catch{}
    staged=[];linked.clear();
    await navigate('scene');showDraft();openDirector();await refreshProjects();
   }finally{starting=false;startButton.disabled=false;refresh();}
  });
  input.onkeydown=event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();startButton.click();}};
 }
 function choiceDialog(title,items,onSelect){const d=document.createElement('dialog');d.className='studio-choices';const h=document.createElement('h2');h.textContent=title;d.append(h);for(const [name,value]of items){const b=document.createElement('button');b.textContent=name;b.onclick=()=>{onSelect(value);d.close();};d.append(b);}const close=document.createElement('button');close.textContent='Close';close.onclick=()=>d.close();d.append(close);d.onclose=()=>d.remove();document.body.append(d);d.showModal();}
 function showLinks(input){const p=getProject();choiceDialog('Link a scene asset',[...p.references.map((r,i)=>[r.name,{kind:'reference',id:r.id,name:r.name}]),...p.subjects.map((s,i)=>[`<Subject ${i+1}> · ${s.name}`,{kind:'subject',id:s.id,name:`<Subject ${i+1}>`}])],item=>{input.value=input.value.replace(/@$/,'')+item.name+' ';if(item.kind==='reference')p.directorLinks=[...new Set([...(p.directorLinks||[]),item.id])];changed();input.dispatchEvent(new Event('input'));input.focus();});}

 // The project tree remembers a manual order for groups and for the scenes inside each group.
 let projectItems=[],sortablesReady=false;
 function groupFor(element){return element?.closest?.('details.nav-group')||null;}
 async function commitProjectOrder(){
  const tree=nav.querySelector('[data-tree]'),moved=[];
  for(const group of tree.querySelectorAll('details.nav-group')){
   const folder=group.dataset.folder,ids=[...group.querySelectorAll('[data-project]')].map(b=>b.dataset.project);
   writeSidebarOrder(orderKey(folder),ids);
   for(const id of ids){const item=projectItems.find(p=>p.id===id);if(item&&(item.folder||'')!==folder)moved.push({id,folder});}
  }
  if(!moved.length)return;
  try{
   await save();
   for(const entry of moved){const p=await api('/api/project/'+entry.id);p.folder=entry.folder;await api('/api/project/'+entry.id,p);}
   const current=getProject();
   await refreshProjects(await api('/api/projects'));
   if(current&&moved.some(entry=>entry.id===current.id))await loadProject(current.id,{navigate:false});
   toast(moved.length===1?'Scene moved to another group.':moved.length+' scenes moved to other groups.');
  }catch(error){toast(error.message);}
 }
 const FOLDER_COLORS=['rose','peach','butter','mint','sky','lilac','blush','stone'];
 let folderColors=(()=>{try{const value=JSON.parse(localStorage.getItem('onigiri-folder-colors')||'{}');return value&&typeof value==='object'?value:{};}catch{return {};}})();
 const saveFolderColors=()=>{try{localStorage.setItem('onigiri-folder-colors',JSON.stringify(folderColors));}catch{}};
 function folderColorMenu(event,name){
  document.querySelector('.folder-colors')?.remove();
  const panel=document.createElement('div');panel.className='folder-colors';panel.setAttribute('role','menu');
  const title=document.createElement('small');title.textContent=name;panel.append(title);
  const grid=document.createElement('div');grid.className='folder-color-grid';
  const close=()=>{panel.remove();document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',onKey);};
  const outside=event2=>{if(!panel.contains(event2.target))close();};
  const onKey=event2=>{if(event2.key==='Escape')close();};
  for(const key of FOLDER_COLORS){
   const swatch=document.createElement('button');swatch.type='button';swatch.className='folder-color';swatch.title=key;swatch.setAttribute('aria-label',name+' '+key);
   swatch.style.setProperty('--swatch','var(--folder-pastel-'+key+')');
   swatch.setAttribute('aria-checked',String(folderColors[name]===key));
   swatch.onclick=()=>{folderColors[name]=key;saveFolderColors();close();refreshProjects();};
   grid.append(swatch);
  }
  const clear=document.createElement('button');clear.type='button';clear.className='quiet';clear.textContent='No colour';clear.onclick=()=>{delete folderColors[name];saveFolderColors();close();refreshProjects();};
  panel.append(grid,clear);document.body.append(panel);
  const rect=panel.getBoundingClientRect();
  panel.style.left=Math.max(8,Math.min(event.clientX,innerWidth-rect.width-8))+'px';
  panel.style.top=Math.max(8,Math.min(event.clientY,innerHeight-rect.height-8))+'px';
  document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',onKey);
 }
 function enableSortables(){
  if(sortablesReady)return;sortablesReady=true;const tree=nav.querySelector('[data-tree]');
  // A slot is only defined while the pointer is over the rail; anywhere else the drop is undone.
  const insideRail=pointer=>{const rect=tree.getBoundingClientRect();return pointer.clientX>=rect.left-6&&pointer.clientX<=rect.right+6&&pointer.clientY>=rect.top-6&&pointer.clientY<=rect.bottom+6;};
  const nearestGroup=pointer=>{let best=null;for(const group of tree.querySelectorAll('details.nav-group')){const rect=group.getBoundingClientRect();const distance=pointer.clientY<rect.top?rect.top-pointer.clientY:pointer.clientY>rect.bottom?pointer.clientY-rect.bottom:0;if(!best||distance<best.distance)best={distance,group};}return best?.group||null;};
  const nearestRow=(list,pointer)=>{let best=null;for(const candidate of list.querySelectorAll('[data-project]')){if(candidate.classList.contains('sortable-dragging'))continue;const rect=candidate.getBoundingClientRect();const distance=pointer.clientY<rect.top?rect.top-pointer.clientY:pointer.clientY>rect.bottom?pointer.clientY-rect.bottom:0;if(!best||distance<best.distance)best={distance,row:candidate};}return best?.row||null;};
  const placeFor=(row,pointer)=>{const rect=row.getBoundingClientRect();return pointer.clientY>rect.top+rect.height/2?'after':'before';};
  makeSortable(tree,{selector:'details.nav-group',canStart:(group,event)=>!group.open&&!!event.target.closest('.nav-group-summary'),resolve:(element,pointer)=>{if(!insideRail(pointer))return null;const group=groupFor(element)||nearestGroup(pointer);if(!group)return null;return {list:tree,row:group,place:placeFor(group,pointer)};},onDrop:()=>{writeSidebarOrder(SIDEBAR_ORDER_KEYS.folders,[...tree.querySelectorAll('details.nav-group')].map(group=>group.dataset.folder));}});
  makeSortable(tree,{selector:'[data-project]',resolve:(element,pointer)=>{if(!insideRail(pointer))return null;const group=groupFor(element)||nearestGroup(pointer);if(!group)return null;const list=group.querySelector('.nav-group-list');if(!list)return null;const under=element.closest?.('[data-project]');const row=under&&!under.classList.contains('sortable-dragging')?under:nearestRow(list,pointer);return row?{list,row,place:placeFor(row,pointer)}:{list,row:null};},onDrop:commitProjectOrder});
 }
 async function refreshProjects(items){
  items||=await api('/api/projects');projectItems=items;const tree=nav.querySelector('[data-tree]');tree.replaceChildren();
  for(const id of selectedProjects)if(!items.some(p=>p.id===id))selectedProjects.delete(id);
  const tools=document.createElement('div');tools.className='project-selection-tools';tree.append(tools);
  const selection=()=>{tree.querySelectorAll('[data-project]').forEach(b=>{const picked=selectedProjects.has(b.dataset.project);b.classList.toggle('picked',picked);b.setAttribute('aria-pressed',String(picked));});tools.replaceChildren();tools.hidden=!selectedProjects.size;if(!selectedProjects.size)return;const label=document.createElement('small');label.textContent=selectedProjects.size+' selected';const move=document.createElement('button');move.textContent='Move to folder';move.onclick=safe(async()=>{if(isBusy())throw Error('Wait for the current request.');const d=document.createElement('dialog');d.className='studio-choices';const title=document.createElement('h2');title.textContent='Move '+selectedProjects.size+' scenes';const input=document.createElement('input');input.placeholder='Folder name, or empty for Ungrouped';input.setAttribute('aria-label','Destination folder');const apply=document.createElement('button');apply.textContent='Move scenes';const cancel=document.createElement('button');cancel.textContent='Cancel';cancel.onclick=()=>d.close();const ids=[...selectedProjects];apply.onclick=safe(async()=>{apply.disabled=true;try{await save();for(const id of ids){const p=await api('/api/project/'+id);p.folder=input.value.trim();await api('/api/project/'+id,p);if(id===getProject().id)await loadProject(id,{navigate:false});}selectedProjects.clear();d.close();await refreshProjects();toast('Scenes moved.');}finally{apply.disabled=false;}});d.append(title,input,apply,cancel);d.onclose=()=>d.remove();document.body.append(d);d.showModal();input.focus();});const clear=document.createElement('button');clear.textContent='Clear';clear.onclick=()=>{selectedProjects.clear();selection();};tools.append(label,move,clear);};
  const base=[...items].sort((a,b)=>String(b.created||'').localeCompare(String(a.created||''))||a.id.localeCompare(b.id));
  const folders=applySidebarOrder([...new Set(base.map(p=>p.folder||''))],readSidebarOrder(SIDEBAR_ORDER_KEYS.folders));
  const orderIn=folder=>applySidebarOrder(base.filter(p=>(p.folder||'')===folder).map(p=>p.id),readSidebarOrder(orderKey(folder)));
  for(const folder of folders){
   const group=document.createElement('details');group.className='nav-group';group.dataset.folder=folder;group.dataset.sortKey='folder:'+folder;
   let folded=[];try{folded=JSON.parse(localStorage.getItem('onigiri-folded-folders')||'[]');}catch{}group.open=!folded.includes(folder);
   group.addEventListener('toggle',()=>{let saved=[];try{saved=JSON.parse(localStorage.getItem('onigiri-folded-folders')||'[]');}catch{}localStorage.setItem('onigiri-folded-folders',JSON.stringify(group.open?saved.filter(x=>x!==folder):[...new Set([...saved,folder])]));});
   const summary=document.createElement('summary');summary.className='nav-group-summary';const folderName=folder||'Ungrouped';
   const initial=document.createElement('span');initial.className='nav-group-initial';initial.textContent=(folderName.trim()[0]||'?').toUpperCase();
   const folderLabel=document.createElement('span');folderLabel.className='nav-group-name';folderLabel.textContent=folderName;
   summary.append(initial,folderLabel);
   const color=folderColors[folderName];
   if(color){summary.style.setProperty('--folder-color','var(--folder-pastel-'+color+')');summary.dataset.folderColor=color;summary.classList.add('has-color');}
   summary.title=folderName+' · Right-click to set a colour';
   summary.oncontextmenu=event=>{event.preventDefault();event.stopPropagation();folderColorMenu(event,folderName);};
   group.append(summary);
   const list=document.createElement('div');list.className='nav-group-list';group.append(list);
   for(const id of orderIn(folder)){
    const p=base.find(x=>x.id===id);if(!p)continue;
    const b=document.createElement('button');b.dataset.project=p.id;b.dataset.sortKey=p.id;b.oncontextmenu=e=>projectContext(e,p.id);const thumb=document.createElement('span');thumb.className='nav-thumbnail';if(p.coverAssetId){const img=document.createElement('img');img.src='/api/asset/'+encodeURIComponent(p.coverAssetId)+'?thumb';img.alt='';thumb.append(img);}else thumb.textContent=(p.title||'Scene').slice(0,1);const name=document.createElement('span');name.className='nav-label';name.textContent=p.title;b.append(thumb,name);b.setAttribute('aria-label',p.title);b.title=p.title+' · Ctrl/Cmd-click to select; Shift-click for a range; drag to reorder';b.classList.toggle('active',p.id===getProject()?.id);
    b.onclick=safe(async e=>{if(e.ctrlKey||e.metaKey){if(selectedProjects.has(p.id))selectedProjects.delete(p.id);else selectedProjects.add(p.id);projectAnchor=p.id;selection();return;}if(e.shiftKey&&projectAnchor){const all=[...tree.querySelectorAll('[data-project]')].map(x=>x.dataset.project),from=all.indexOf(projectAnchor),to=all.indexOf(p.id);if(from>=0&&to>=0)for(const id of all.slice(Math.min(from,to),Math.max(from,to)+1))selectedProjects.add(id);selection();return;}if(isBusy())throw Error('Wait for the current request.');selectedProjects.clear();projectAnchor=p.id;selection();await save();await loadProject(p.id);await navigate('scene');});
    list.append(b);
   }
   tree.append(group);
  }
  enableSortables();selection();
 }

 return {navigate,assets,showAssets,showLinks,refreshProjects,showGallery:async()=>{if(isBusy())return;await navigate('gallery');if(!gallery.open)gallery.show();},sceneChanged:()=>{if(page==='scene')openDirector(false);},start:async()=>{await refreshProjects();await navigate(session?'scene':'start');if(session)restoreView?.();}};
}
