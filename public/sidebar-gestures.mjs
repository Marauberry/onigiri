export function textOffsetAt(textarea,x,y){
 const rect=textarea.getBoundingClientRect(),style=getComputedStyle(textarea),mirror=document.createElement('div');
 for(const key of ['font','padding','border','boxSizing','lineHeight','letterSpacing','wordSpacing','tabSize'])mirror.style[key]=style[key];
 Object.assign(mirror.style,{position:'fixed',left:rect.left+'px',top:rect.top+'px',width:(textarea.clientWidth+parseFloat(style.borderLeftWidth)+parseFloat(style.borderRightWidth))+'px',height:rect.height+'px',whiteSpace:'pre-wrap',overflowWrap:'break-word',overflow:'hidden',zIndex:100000,opacity:'.001',pointerEvents:'auto'});
 const text=document.createTextNode(textarea.value);mirror.append(text);document.body.append(mirror);mirror.scrollTop=textarea.scrollTop;mirror.scrollLeft=textarea.scrollLeft;
 const caret=document.caretPositionFromPoint?.(x,y),range=!caret&&document.caretRangeFromPoint?.(x,y);const node=caret?.offsetNode||range?.startContainer,offset=caret?.offset??range?.startOffset;mirror.remove();return node===text?offset:textarea.value.length;
}

export const SIDEBAR_MIME='application/x-h3-items';
export function readSidebarPayload(raw,kind) {
 try{const value=JSON.parse(raw);if(!value||typeof value.kind!=='string'||kind&&value.kind!==kind||!Array.isArray(value.ids)||!value.ids.length||value.ids.some(id=>typeof id!=='string'||!id))return null;return {kind:value.kind,ids:[...new Set(value.ids)]};}catch{return null;}
}
export function orderedSelection(items,selection,getId=item=>item.id){return items.map(getId).filter(id=>selection.has(id));}
export function sidebarGestures(host,{kind,selector,handleSelector,getId=item=>item.id,getItems,selection=new Set(),onClick,onContext,onReorder,token,textarea,onInsert}) {
 host._sidebarGestureAbort?.abort();const controller=new AbortController();host._sidebarGestureAbort=controller;const signal=controller.signal;
 const items=getItems(),ids=items.map(getId);for(const id of selection)if(!ids.includes(id))selection.delete(id);
 const rows=[...host.querySelectorAll(selector)];
 const draw=()=>rows.forEach((row,index)=>{row.classList.toggle('sidebar-selected',selection.has(ids[index]));row.setAttribute('aria-selected',String(selection.has(ids[index])));});
 const selected=(id)=>{if(!selection.has(id)){selection.clear();selection.add(id);}draw();return orderedSelection(getItems(),selection,getId);};
 const clearTargets=()=>{rows.forEach(row=>row.classList.remove('sidebar-drop-target'));textarea?.classList.remove('sidebar-drop-target');};
 for(const [index,row] of rows.entries()){
  const id=ids[index];if(!id)continue;const handle=handleSelector?row.querySelector(handleSelector):row;if(!handle)continue;handle.draggable=true;
  handle.addEventListener('click',event=>{if(event.ctrlKey||event.metaKey){event.preventDefault();event.stopImmediatePropagation();selection.has(id)?selection.delete(id):selection.add(id);draw();return;}selection.clear();selection.add(id);draw();onClick?.(event,id);},{signal,capture:true});
  handle.addEventListener('contextmenu',event=>{event.preventDefault();event.stopPropagation();onContext?.(event,selected(id));},{signal});
  handle.addEventListener('dragstart',event=>{if(event.target.closest('input,textarea,select,button')&&event.target!==handle){event.preventDefault();return;}event.dataTransfer.setData(SIDEBAR_MIME,JSON.stringify({kind,ids:selected(id)}));event.dataTransfer.effectAllowed='copyMove';row.classList.add('sidebar-dragging');},{signal});
  handle.addEventListener('dragend',()=>{row.classList.remove('sidebar-dragging');clearTargets();},{signal});
  row.addEventListener('dragover',event=>{if(!event.dataTransfer.types.includes(SIDEBAR_MIME))return;event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect='move';clearTargets();row.classList.add('sidebar-drop-target');},{signal});
  row.addEventListener('dragleave',event=>{if(!row.contains(event.relatedTarget))row.classList.remove('sidebar-drop-target');},{signal});
  row.addEventListener('drop',event=>{const payload=readSidebarPayload(event.dataTransfer.getData(SIDEBAR_MIME),kind);if(!payload)return;event.preventDefault();event.stopImmediatePropagation();clearTargets();const live=new Set(getItems().map(getId)),valid=payload.ids.filter(id=>live.has(id));if(valid.length)onReorder?.(valid,index);},{signal});
 }
 if(textarea){textarea.addEventListener('dragover',event=>{if(!event.dataTransfer.types.includes(SIDEBAR_MIME))return;event.preventDefault();event.dataTransfer.dropEffect='copy';textarea.classList.add('sidebar-drop-target');},{signal});textarea.addEventListener('dragleave',()=>textarea.classList.remove('sidebar-drop-target'),{signal});textarea.addEventListener('drop',event=>{const payload=readSidebarPayload(event.dataTransfer.getData(SIDEBAR_MIME),kind);if(!payload)return;event.preventDefault();event.stopImmediatePropagation();clearTargets();const live=new Set(getItems().map(getId)),text=payload.ids.filter(id=>live.has(id)).map(id=>token(id)).filter(Boolean).join(' ');if(!text)return;const offset=textOffsetAt(textarea,event.clientX,event.clientY);onInsert?.(text,offset);},{signal});}
 draw();return {destroy:()=>{controller.abort();clearTargets();},refresh:draw};
}
export function reorderSidebarItems(items,ids,toIndex,getId=item=>item.id) {
 const selected=new Set(ids),moving=items.filter(item=>selected.has(getId(item))),remaining=items.filter(item=>!selected.has(getId(item)));
 const index=Math.max(0,Math.min(remaining.length,Math.trunc(Number(toIndex)||0)));
 return [...remaining.slice(0,index),...moving,...remaining.slice(index)];
}

/* Manual project and group order for the navigation rail, kept across the whole system in local storage. */
export const SIDEBAR_ORDER_KEYS={projects:'onigiri-order-projects',folders:'onigiri-order-folders'};
export function orderKey(scope){return SIDEBAR_ORDER_KEYS.projects+'::'+scope;}
export function readSidebarOrder(key,storage=globalThis.localStorage){
 try{const value=JSON.parse(storage.getItem(key)||'[]');return Array.isArray(value)?value.filter(x=>typeof x==='string'):[];}catch{return [];}
}
export function writeSidebarOrder(key,ids,storage=globalThis.localStorage){
 try{storage.setItem(key,JSON.stringify([...new Set(ids.filter(id=>typeof id==='string'))]));}catch{}
}
// Unranked keys keep their previous relative position so new scenes stay at the end.
export function applySidebarOrder(ids,order){const rank=new Map(order.map((id,index)=>[id,index]));return [...ids].sort((a,b)=>(rank.has(a)?rank.get(a):Infinity)-(rank.has(b)?rank.get(b):Infinity));}

/* Rows follow the pointer immediately, but a slot is only taken after the pointer rests in it,
   so a single flick does not shuffle the whole list. Dropping outside the rail puts the row back. */
export function makeSortable(container,{selector,resolve,canStart=()=>true,onDrop,dwell=150}){
 const keyOf=el=>el.dataset.sortKey||el.dataset.project||'';
 const rows=()=>[...container.querySelectorAll(selector)].filter(el=>!el.classList.contains('sortable-dragging'));
 const snapshot=()=>new Map(rows().map(el=>[keyOf(el),el.getBoundingClientRect()]));
 const play=previous=>{for(const el of rows()){const before=previous.get(keyOf(el));if(!before)continue;const after=el.getBoundingClientRect(),dx=before.left-after.left,dy=before.top-after.top;if(Math.abs(dx)<1&&Math.abs(dy)<1)continue;el.animate([{transform:`translate(${dx}px,${dy}px)`},{transform:'none'}],{duration:190,easing:'cubic-bezier(.2,.7,.3,1)'});}};
 const listIds=new WeakMap();let listSeq=0;const idOf=el=>{if(!el)return 0;if(!listIds.has(el))listIds.set(el,++listSeq);return listIds.get(el);};
 // A slot is the pair (list, next row) so "before B" and "after A" describe the same place.
 const signature=spot=>{if(!spot||!spot.list)return '';let next=spot.row?(spot.place==='after'?spot.row.nextElementSibling:spot.row):null;while(next&&(next.classList.contains('sortable-dragging')||next.classList.contains('sortable-placeholder')))next=next.nextElementSibling;return `${idOf(spot.list)}|${next?keyOf(next):'end'}`;};
 let active=null,suppress=false,timer=0;
 const stopTimer=()=>{if(timer)clearTimeout(timer);timer=0;};
 const markOutside=on=>{if(!active||active.outside===on)return;active.outside=on;active.ghost.classList.toggle('sortable-outside',on);};
 const applySpot=spot=>{
  if(!active||!spot?.list)return;
  const {placeholder}=active,previous=snapshot();
  if(spot.row&&spot.row!==placeholder)spot.place==='after'?spot.row.after(placeholder):spot.row.before(placeholder);
  else spot.list.append(placeholder);
  active.spot=signature({list:placeholder.parentElement,row:placeholder.nextElementSibling,place:'before'});
  markOutside(false);play(previous);
 };
 const move=pointer=>{
  if(!active)return;
  const {ghost,offsetX,offsetY}=active;
  active.x=pointer.clientX;active.y=pointer.clientY;
  ghost.style.left=(pointer.clientX-offsetX)+'px';ghost.style.top=(pointer.clientY-offsetY)+'px';
  const spot=resolve(document.elementFromPoint(pointer.clientX,pointer.clientY),pointer);
  if(!spot||!spot.list){stopTimer();active.pending='';markOutside(true);return;}
  const wanted=signature(spot);
  if(wanted===active.spot){stopTimer();active.pending='';markOutside(false);return;}
  if(wanted===active.pending)return;
  stopTimer();active.pending=wanted;
  timer=setTimeout(()=>{
   timer=0;if(!active)return;
   const again=resolve(document.elementFromPoint(active.x,active.y),{clientX:active.x,clientY:active.y,pointerType:'mouse'});
   active.pending='';
   if(again&&signature(again)===wanted)applySpot(again);
  },dwell);
 };
 const finish=async()=>{
  const state=active;active=null;stopTimer();
  if(state){
   const {row,ghost,placeholder,outside}=state;
   if(outside)placeholder.remove();
   else placeholder.replaceWith(row);
   row.classList.remove('sortable-dragging');row.style.display='';
   const to=row.getBoundingClientRect(),from=ghost.getBoundingClientRect();
   ghost.animate([{transform:'none',opacity:.95},{transform:`translate(${to.left-from.left}px,${to.top-from.top}px)`,opacity:.9}],{duration:170,easing:'ease-out'});
   setTimeout(()=>ghost.remove(),260);
   container.classList.remove('sortable-active');
  }
  suppress=true;setTimeout(()=>{suppress=false;},60);
  if(state&&state.outside)return;
  try{await onDrop?.();}catch{}
 };
 container.addEventListener('click',event=>{if(suppress&&event.target.closest?.(selector)){event.preventDefault();event.stopImmediatePropagation();}},true);
 container.addEventListener('pointerdown',event=>{
  if(active||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey)return;
  const row=event.target.closest?.(selector);if(!row||!container.contains(row)||!canStart(row,event))return;
  const start={x:event.clientX,y:event.clientY};
  const onMove=pointer=>{
   if(!active){
    if(Math.hypot(pointer.clientX-start.x,pointer.clientY-start.y)<5)return;
    const rect=row.getBoundingClientRect(),ghost=row.cloneNode(true);
    ghost.classList.add('sortable-ghost');
    Object.assign(ghost.style,{position:'fixed',left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px',margin:'0',pointerEvents:'none',zIndex:'1200',boxSizing:'border-box'});
    const placeholder=document.createElement('div');
    placeholder.className='sortable-placeholder';placeholder.style.height=rect.height+'px';
    document.body.append(ghost);row.after(placeholder);row.classList.add('sortable-dragging');row.style.display='none';container.classList.add('sortable-active');
    active={row,ghost,placeholder,offsetX:pointer.clientX-rect.left,offsetY:pointer.clientY-rect.top,pending:'',outside:false,x:pointer.clientX,y:pointer.clientY};
    active.spot=signature({list:placeholder.parentElement,row:placeholder.nextElementSibling,place:'before'});
   }
   move(pointer);
  };
  const onUp=()=>{window.removeEventListener('pointermove',onMove);window.removeEventListener('pointerup',onUp);window.removeEventListener('pointercancel',onUp);if(active)finish();};
  window.addEventListener('pointermove',onMove);window.addEventListener('pointerup',onUp);window.addEventListener('pointercancel',onUp);
 });
 return {active:()=>!!active};
}

