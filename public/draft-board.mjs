import {referenceMap} from './domain.mjs';

import {mediaBox,resolveCollisions,boardConnections} from './board-logic.mjs';
const NODE_W=272,GAP=28,PAD=26;

export function draftBoard(host,{getProject,changed,editSubject,editReference,editIntent,showPrompt,referenceActions,removeSubject,dropMedia}){
 host.classList.add('draft-board');
 host.innerHTML='<svg class="board-wires" aria-hidden="true"></svg><div class="board-world"></div><div class="board-help">Space: pan · Scroll: zoom</div><div class="board-tools"><button data-add>＋ Note</button><button data-home>Fit all</button><button data-tidy>Tidy</button><button data-out aria-label="Zoom out">−</button><output></output><button data-in aria-label="Zoom in">＋</button></div>';
 const world=host.querySelector('.board-world'),wires=host.querySelector('.board-wires'),out=host.querySelector('output');
 let space=false,drag=null,lastRects=[];
 const board=()=>{const p=getProject();return p.board||=( {positions:{},notes:[],view:{x:24,y:30,zoom:1}});};
 const view=()=>board().view||=( {x:24,y:30,zoom:1});
 const transform=()=>{const v=view();world.style.transform=`translate(${v.x}px,${v.y}px) scale(${v.zoom})`;host.style.backgroundSize=24*v.zoom+'px '+24*v.zoom+'px';host.style.backgroundPosition=v.x+'px '+v.y+'px';host.classList.toggle('board-plain',v.zoom<=.5);out.value=Math.round(v.zoom*100)+'%';wires.style.transform=world.style.transform;};
 const addNote=(x=40,y=40)=>{const n={id:crypto.randomUUID(),title:'Note',text:''};board().notes.push(n);board().positions['note:'+n.id]={x:Math.round(x),y:Math.round(y)};changed();render();host.querySelector(`[data-note="${n.id}"]`)?.focus();};
 host.querySelector('[data-add]').onclick=()=>{const v=view();addNote((80-v.x)/v.zoom,(80-v.y)/v.zoom);};
 const fit=()=>{if(!lastRects.length||!host.clientWidth)return;const left=Math.min(...lastRects.map(r=>r.x)),top=Math.min(...lastRects.map(r=>r.y)),right=Math.max(...lastRects.map(r=>r.x+r.w)),bottom=Math.max(...lastRects.map(r=>r.y+r.h));const z=Math.max(.15,Math.min(1,(host.clientWidth-48)/(right-left),(host.clientHeight-110)/(bottom-top)));board().view={x:24-left*z,y:24-top*z,zoom:z};board().fitted=true;transform();};host.querySelector('[data-home]').onclick=()=>{fit();changed();};
 host.querySelector('[data-tidy]').onclick=()=>{board().positions={};changed();render();toastHint('Cards rearranged.');};
 const toastHint=text=>{const help=host.querySelector('.board-help');const previous=help.textContent;help.textContent=text;setTimeout(()=>{if(help.textContent===text)help.textContent=previous;},1800);};
 const zoom=(factor,x=host.clientWidth/2,y=host.clientHeight/2)=>{const v=view(),next=Math.max(.3,Math.min(2,v.zoom*factor));v.x=x-(x-v.x)*next/v.zoom;v.y=y-(y-v.y)*next/v.zoom;v.zoom=next;transform();changed();};
 host.querySelector('[data-out]').onclick=()=>zoom(1/1.15);host.querySelector('[data-in]').onclick=()=>zoom(1.15);
 host.addEventListener('wheel',e=>{if(e.target.closest('textarea'))return;e.preventDefault();const r=host.getBoundingClientRect();zoom(e.deltaY<0?1.1:1/1.1,e.clientX-r.left,e.clientY-r.top);},{passive:false});
 window.addEventListener('keydown',e=>{if(e.code==='Space'&&!/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)&&!host.closest('[hidden]')){space=true;e.preventDefault();host.classList.add('panning');}});
 window.addEventListener('keyup',e=>{if(e.code==='Space'){space=false;host.classList.remove('panning');}});window.addEventListener('blur',()=>{space=false;drag=null;host.classList.remove('panning');});
 host.onpointerdown=e=>{if(e.button===2)return;const head=e.target.closest('[data-drag]');if(e.target.closest('button,input,textarea')&&!head)return;if(head&&!space){const id=head.dataset.drag,el=head.closest('.board-node'),p={x:parseFloat(el.style.left),y:parseFloat(el.style.top)};drag={id,el,p,startX:e.clientX,startY:e.clientY};}else if(space||e.button===1||e.target===host||e.target===world){drag={p:{...view()},startX:e.clientX,startY:e.clientY};}else return;e.preventDefault();host.setPointerCapture(e.pointerId);};
 host.onpointermove=e=>{if(!drag)return;const v=view(),dx=e.clientX-drag.startX,dy=e.clientY-drag.startY;if(drag.id){const p={x:Math.round(drag.p.x+dx/v.zoom),y:Math.round(drag.p.y+dy/v.zoom)};board().positions[drag.id]=p;drag.el.style.left=p.x+'px';drag.el.style.top=p.y+'px';lastRects=lastRects.map(rect=>rect.id===drag.id?{...rect,x:p.x,y:p.y}:rect);drawWires();}else{v.x=drag.p.x+dx;v.y=drag.p.y+dy;transform();}};
 const end=()=>{if(drag){const moved=!!drag.id;drag=null;if(moved){const rects=layout(nodes());for(const rect of rects)board().positions[rect.id]={x:rect.x,y:rect.y};render();}changed();}};
 host.onpointerup=end;host.onpointercancel=end;

 const typing=e=>!!e.target.closest?.('textarea,input,select');
 if(dropMedia){let depth=0;const mediaOnly=e=>{const types=[...(e.dataTransfer?.types||[])];return types.includes('Files')||types.some(type=>type.startsWith('application/x-h3-'));};const ignore=e=>typing(e)||!mediaOnly(e);host.addEventListener('dragenter',e=>{if(ignore(e))return;e.preventDefault();depth++;host.classList.add('board-dropping');});host.addEventListener('dragover',e=>{if(ignore(e))return;e.preventDefault();e.dataTransfer.dropEffect='copy';});host.addEventListener('dragleave',e=>{if(ignore(e))return;if(--depth<=0)host.classList.remove('board-dropping');});host.addEventListener('drop',async e=>{if(ignore(e))return;e.preventDefault();e.stopPropagation();depth=0;host.classList.remove('board-dropping');host.animate([{opacity:.85,transform:'scale(.995)'},{opacity:1,transform:'none'}],{duration:240,easing:'ease-out'});const values=new Map([...e.dataTransfer.types].map(type=>[type,e.dataTransfer.getData(type)]));try{const ids=await dropMedia({files:[...(e.dataTransfer.files||[])],getData:type=>values.get(type)||''});if(ids?.length)render();}catch(error){toastHint(error.message);}});}
 function nodes(){
  const p=getProject(),labels=referenceMap(p.references);
  return [
   {id:'intent',column:0,kind:'Direction',title:'Director intent',text:p.brief||'Discuss your idea with the Director.',edit:editIntent},
   ...p.references.map(r=>({id:'reference:'+r.id,column:1,kind:'Onigiri',title:labels[r.id],text:[r.tags?.length?'Tags: '+r.tags.join(' · '):'',r.description||'Carry this reference as a whole'].filter(Boolean).join('\n'),reference:r,edit:()=>editReference(r)})),
   ...p.subjects.map((s,i)=>({id:'subject:'+s.id,column:2,kind:'Soy Bean',title:`<Subject ${i+1}> · ${s.name}`,text:s.description||(s.sources||[]).map(r=>r.label).filter(Boolean).join(' + ')||'Define this subject',edit:()=>editSubject(i)})),
   {id:'draft',column:3,kind:'Writing',title:'Draft notes',field:'draftText'},
   ...(board().notes||[]).map(n=>({id:'note:'+n.id,column:3,kind:'Note',title:n.title,note:n})),
   {id:'compiled',column:4,kind:'Output',title:'Compiled prompt',text:p.prompt?p.prompt.slice(0,240):'Compile your direction into the Prompt tab.',edit:showPrompt},
  ];
 }
 function measure(node){
  if(node.reference&&node.reference.type!=='audio'){const box=mediaBox(node.reference);node.media=box;return {width:Math.max(180,box.width+26),height:box.height+156};}
  if(node.reference)return {height:170};
  if(node.field||node.note)return {height:225};
  return {height:180};
 }
 function layout(list){
  const columns={},rects=list.map(node=>{
    const size=measure(node),saved=board().positions[node.id],column=node.column??0;
    const x=saved?Math.round(saved.x):PAD+column*(326+GAP);
    const y=saved?Math.round(saved.y):(columns[column]??PAD);
    if(!saved)columns[column]=y+size.height+GAP;
    return {id:node.id,x,y,w:size.width||NODE_W,h:size.height};
  });
  return resolveCollisions(rects);
 }
 function drawWires(){
  const at=Object.fromEntries(lastRects.map(r=>[r.id,r]));
  const edge=(from,to)=>{const a=at[from],b=at[to];if(!a||!b)return '';const x1=a.x+a.w,y1=a.y+a.h/2,x2=b.x,y2=b.y+b.h/2,dx=Math.max(36,Math.abs(x2-x1)/2);return `M ${x1} ${y1} C ${x1+dx} ${y1} ${x2-dx} ${y2} ${x2} ${y2}`;};
  const pairs=boardConnections(getProject()).map(([a,b])=>edge(a,b));
  const width=Math.max(1,host.clientWidth),height=Math.max(1,host.clientHeight);
  wires.setAttribute('viewBox',`0 0 ${width} ${height}`);wires.setAttribute('width',width);wires.setAttribute('height',height);
  wires.style.transform=world.style.transform;
  wires.innerHTML=pairs.filter(Boolean).map(d=>`<path d="${d}"/>`).join('');
 }
 function render(){
  if(!getProject())return;world.replaceChildren();board().positions||={};board().notes||=[];
  const list=nodes(),rects=layout(list);lastRects=rects;
  list.forEach((n,i)=>{
   const rect=rects[i],el=document.createElement('article');el.className='board-node board-node--'+(n.kind||'').toLowerCase().replace(/\W+/g,'');
   el.dataset.nodeId=n.id;el.style.left=rect.x+'px';el.style.top=rect.y+'px';el.style.width=rect.w+'px';el.style.height=rect.h+'px';
   const h=document.createElement('header');h.dataset.drag=n.id;h.tabIndex=0;h.title='Drag to arrange; arrow keys move';h.textContent=n.kind+' · '+n.title;
   h.onkeydown=e=>{if(!e.key.startsWith('Arrow'))return;e.preventDefault();const step=e.shiftKey?40:10;board().positions[n.id]={x:rect.x+(e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0),y:rect.y+(e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0)};render();changed();};
   if(n.reference||n.id.startsWith('subject:'))el.oncontextmenu=e=>{e.preventDefault();e.stopPropagation();document.querySelector('.board-actions')?.remove();const actions=document.createElement('div');actions.className='board-actions';actions.setAttribute('role','menu');const choices=n.reference?referenceActions(n.reference):[{label:'Remove subject',run:()=>removeSubject(n.id.slice(8))}];for(const action of choices){const b=document.createElement('button');b.textContent=action.label;b.setAttribute('role','menuitem');b.onclick=()=>{actions.remove();action.run();};actions.append(b);}document.body.append(actions);actions.style.left=Math.min(e.clientX,innerWidth-actions.offsetWidth-10)+'px';actions.style.top=Math.min(e.clientY,innerHeight-actions.offsetHeight-10)+'px';const dismiss=event=>{if(!actions.contains(event.target)){actions.remove();document.removeEventListener('pointerdown',dismiss,true);}};document.addEventListener('pointerdown',dismiss,true);};
   el.append(h);
   if(n.reference&&n.media){const img=document.createElement('img');img.src='/api/asset/'+n.reference.id+'?thumb';img.alt=n.title;img.loading='lazy';img.style.width=n.media.width+'px';img.style.height=n.media.height+'px';img.style.margin='0 auto';img.style.flexShrink='0';el.append(img);}
   else if(n.reference)el.append(Object.assign(document.createElement('div'),{className:'audio-art',textContent:'♫'}));
   if(n.field||n.note){const input=document.createElement('textarea');input.rows=5;input.setAttribute('aria-label',n.title);input.placeholder='Write an action, sound, dialogue or constraint…';input.value=n.note?.text||getProject()[n.field]||'';if(n.note)input.dataset.note=n.note.id;input.oninput=()=>{if(n.note)n.note.text=input.value;else getProject()[n.field]=input.value;changed();};el.append(input);if(n.note){const remove=document.createElement('button');remove.textContent='Remove note';remove.onclick=()=>{board().notes=board().notes.filter(x=>x.id!==n.note.id);delete board().positions[n.id];changed();render();};el.append(remove);}}
   else{const text=document.createElement('p');text.textContent=n.text;const edit=document.createElement('button');edit.textContent='Open';edit.onclick=n.edit;el.append(text,edit);}
   world.append(el);
  });
  if(!board().fitted&&host.clientWidth)fit();transform();drawWires();
  // Persist the resolved rectangles so later renders and reloads stay identical.
  for(const rect of rects){const saved=board().positions[rect.id];if(!saved){board().positions[rect.id]={x:rect.x,y:rect.y};continue;}if(saved.x!==rect.x||saved.y!==rect.y){saved.x=rect.x;saved.y=rect.y;}}
  lastRects=rects.map(rect=>({...rect}));
 }
 return {render};
}
