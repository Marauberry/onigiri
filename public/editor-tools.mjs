import {missingAt} from './mentions.mjs';
import {referenceMap} from './domain.mjs';
export function timestamp(seconds){return `At ${String(Math.floor(seconds/60)).padStart(2,'0')}:${(seconds%60).toFixed(3).padStart(6,'0')}, `;}
let closeMenu=()=>{};
export function contextMenu(event,items,onError){
  event.preventDefault();closeMenu();const menu=document.createElement('div');menu.className='editor-context-menu';menu.setAttribute('role','menu');
  const outside=e=>{if(!menu.contains(e.target))closeMenu();},key=e=>{if(e.key==='Escape')closeMenu();};closeMenu=()=>{menu.remove();document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',key);};
  const render=entries=>{menu.replaceChildren();for(const item of entries){const button=document.createElement('button');button.textContent=item.label+(item.children?' ›':'');button.setAttribute('role','menuitem');button.onclick=()=>{if(item.children){render([{label:'← Back',children:items},...item.children]);return;}closeMenu();Promise.resolve().then(item.run).catch(onError);};menu.append(button);}};render(items);(event.target.closest?.('dialog')||document.body).append(menu);menu.style.left=Math.max(8,Math.min(event.clientX,innerWidth-menu.offsetWidth-8))+'px';menu.style.top=Math.max(8,Math.min(event.clientY,innerHeight-menu.offsetHeight-8))+'px';document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',key);menu.querySelector('button')?.focus();
}
export function timelinePicker(host,{prefix,length,onApply}){
  const parts=prefix.slice(3).split(':').map(Number),raw=parts.length===2?parts[0]*60+parts[1]:parts[0];
  host.replaceChildren();const label=document.createElement('label');label.textContent='Scene time';const range=document.createElement('input');range.type='range';range.min=0;range.max=Math.max(0,length-1);range.step=1;range.value=Math.max(0,Math.min(length-1,Math.round((raw||0)*24)));range.setAttribute('aria-label','Scene timestamp');const output=document.createElement('output'),apply=document.createElement('button');apply.textContent='Insert time';const update=()=>output.textContent=timestamp(Number(range.value)/24)+' · frame '+range.value;range.oninput=update;apply.onclick=()=>onApply(timestamp(Number(range.value)/24));host.append(label,range,output,apply);host.hidden=false;update();
}

// Keep the native textarea for editing, IME and selection. Decorations never intercept input.
export function decorateEditor(textarea,getProject,getSelection){
  const layer=document.createElement('div');layer.className='prompt-decorations';layer.setAttribute('aria-hidden','true');textarea.before(layer);
  const preview=document.createElement('div');preview.className='mention-preview';preview.hidden=true;document.body.append(preview);
  let spans=[];
  function refresh(){
    const style=getComputedStyle(textarea);for(const k of ['font','lineHeight','letterSpacing','wordSpacing','padding','tabSize'])layer.style[k]=style[k];
    layer.style.width=textarea.clientWidth+'px';layer.style.height=textarea.clientHeight+'px';layer.hidden=textarea.hidden;
    const text=textarea.value,selection=getSelection(),matches=[...text.matchAll(/<(?:Picture|Video|Audio|Subject) \d+>|\(S\d+\)|\[Shot \d+\]|At \d{2}:\d{2}\.\d{3},?|; use for [^\n.]+/g)];
    const points=new Set([0,text.length]);for(const m of matches){points.add(m.index);points.add(m.index+m[0].length);}if(selection){points.add(selection.start);points.add(selection.end);}
    const offsets=[...points].filter(n=>n>=0&&n<=text.length).sort((a,b)=>a-b);layer.replaceChildren();spans=[];
    const p=getProject(),known=new Set([...Object.values(referenceMap(p?.references||[])),...(p?.subjects||[]).map((_,i)=>'<Subject '+(i+1)+'>')]);
    for(let i=0;i<offsets.length-1;i++){const a=offsets[i],b=offsets[i+1],token=matches.find(m=>a>=m.index&&b<=m.index+m[0].length),span=document.createElement('span');span.textContent=text.slice(a,b);if(token){span.className=token[0].startsWith('; use for')?'prompt-token prompt-function':'prompt-token';span.dataset.token=token[0];span.dataset.start=token.index;if(token[0].startsWith('<')&&(!known.has(token[0])||missingAt(p,'prompt',token.index,token[0])))span.classList.add('missing-token');spans.push(span);}if(selection&&a>=selection.start&&b<=selection.end)span.classList.add('pending-selection');layer.append(span);}layer.append(document.createTextNode('\n'));layer.scrollTop=textarea.scrollTop;layer.scrollLeft=textarea.scrollLeft;
  }
  textarea.addEventListener('scroll',refresh);new ResizeObserver(refresh).observe(textarea);
  textarea.addEventListener('mousemove',e=>{
    const span=spans.find(s=>[...s.getClientRects()].some(r=>e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom));if(!span||span.dataset.token.startsWith('; use for')||span.dataset.token.startsWith('At ')){preview.hidden=true;return;}
    const token=span.dataset.token,p=getProject(),n=Number(token.match(/\d+/)?.[0]),kind=token.match(/<(\w+)/)?.[1];let ref,detail=token;
    if(kind==='Subject'){const subject=p.subjects[n-1];ref=p.references.find(r=>r.id===subject?.sourceId);detail=subject?.name||token;}
    else if(kind){const refs=kind==='Picture'?p.references.filter(r=>r.type==='image'):kind==='Video'?p.references.filter(r=>r.type==='video'):[...p.references.filter(r=>r.type==='video'&&r.withAudio),...p.references.filter(r=>r.type==='audio')];ref=refs[n-1];detail=ref?.name||token;}
    else if(token.startsWith('(S'))detail=p.speakers?.[n-1]?.name||token;
    preview.replaceChildren();if(ref?.thumbnail){const img=document.createElement('img');img.src='/api/asset/'+ref.id+'?thumb';preview.append(img);}const label=document.createElement('div');label.textContent=token+' · '+detail;preview.append(label);preview.hidden=false;preview.style.left=Math.min(e.clientX+12,innerWidth-230)+'px';preview.style.top=Math.max(8,Math.min(e.clientY+18,innerHeight-200))+'px';
  });textarea.addEventListener('mouseleave',()=>preview.hidden=true);return refresh;
}
