import {sidebarGestures} from './sidebar-gestures.mjs';
export {textOffsetAt} from './sidebar-gestures.mjs';
export function subjectGestures(host,{getProject,reorder,remove,insert,textarea,menu}) {
 const selection=host._subjectSelection||(host._subjectSelection=new Set());
 return sidebarGestures(host,{kind:'subject',selector:'.subject-item',handleSelector:'summary',getItems:()=>getProject().subjects,selection,
  onReorder:(ids,index)=>{for(const id of ids)reorder(id,index++);},
  token:id=>{const index=getProject().subjects.findIndex(item=>item.id===id);return index>=0?'<Subject '+(index+1)+'>':'';},textarea,onInsert:insert,
  onContext:(event,ids)=>menu(event,[{label:ids.length>1?'Remove selected subjects…':'Remove subject…',run:()=>{const indices=ids.map(id=>getProject().subjects.findIndex(s=>s.id===id)).filter(i=>i>=0).sort((a,b)=>b-a);return (async()=>{for(const index of indices)await remove(index);})();}}])});
}

