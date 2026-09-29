import {mountRoleStudio} from './role-studio.mjs';
import {textOffsetAt} from './subject-drag.mjs';

// One shared vocabulary for Subject roles and reference inspection.
export const referenceRoles = {
  Character: {
    'Character sheet': {},
    Identity: {'One person in a group': {}, 'Multiple views of one person': {}, 'Character sheet': {}},
    Expression: {Joyful: {}, Sad: {}, Angry: {}, Calm: {}, Surprised: {}, Afraid: {}, 'Subtle expression': {}, 'Expression change': {}, 'Eye direction': {}},
    Body: {Face: {}, Hair: {}, Silhouette: {}, Proportions: {}},
    Clothing: {Outfit: {}, Accessories: {}, 'Fabric and material': {}},
    Pose: {Standing: {}, Sitting: {}, Gesture: {}, 'Hand position': {}, 'Body orientation': {}},
  },
  Motion: {Choreography: {}, Locomotion: {Walk: {}, Run: {}, Jump: {}}, Gesture: {}, 'Facial performance': {}, 'Interaction between subjects': {}, 'Action timing': {}, 'Camera movement': {Pan: {}, Orbit: {}, Tracking: {}, 'Push in': {}, 'Pull back': {}}},
  Object: {Product: {}, Vehicle: {}, Prop: {}, Material: {}, Shape: {}, 'Distinctive markings': {}, 'Object in use': {}},
  Environment: {Location: {}, Background: {}, 'Spatial layout': {}, Lighting: {Daylight: {}, Night: {}, Studio: {}, 'Light direction': {}}, Weather: {}, 'Time of day': {}},
  Composition: {Framing: {}, 'Camera angle': {}, 'Subject placement': {}, 'Depth and perspective': {}, 'Storyboard panels': {}},
  Style: {'Color palette': {}, Texture: {}, 'Animation style': {}, 'Rendering style': {}},
  Audio: {Voice: {'Speaker identity': {}, Delivery: {}, Rhythm: {}}, Ambience: {}, Music: {}, 'Sound effect': {}},
};
export function validRolePath(current) {
  const result = []; let node = referenceRoles;
  for (const key of Array.isArray(current) ? current : []) {
    if (!Object.hasOwn(node, key)) break;
    result.push(key); node = node[key];
  }
  return result;
}
export function rolePicker(current,onConfirm,options={}) {
  return mountRoleStudio(current,onConfirm,options,referenceRoles,validRolePath);
}
export function inspectionRolePicker(textarea, options={}) {
  let {path=[],detail=''}=options;
  const button=document.createElement('button');button.type='button';button.className='role-choice inspection-role-choice';
  button.textContent=path.length?path.join(' / '):'Choose reference role…';
  button.onclick=()=>rolePicker(path,role=>{path=role.path;detail=role.detail;button.textContent=role.path.join(' / ')||'Custom direction';textarea.value=role.label;textarea.dispatchEvent(new Event('input',{bubbles:true}));return options.onConfirm?.(role);},{...options,title:options.title||'What should I describe?',detail});
  textarea.before(button);return button;
}
export function speakerToken(project, speakerId) {
  const index=(project.speakers||[]).findIndex(s=>s.id===speakerId); if(index<0)return '';
  const subject=(project.subjects||[]).findIndex(s=>s.id===project.speakers[index].subjectId);
  return (subject>=0?'<Subject '+(subject+1)+'> ':'')+'(S'+(index+1)+')';
}
function speakerGesture(handle, token, insert) {
  let gesture=null, suppressClick=false;
  handle.title='Drag into the prompt, or click to insert at the cursor';
  handle.onpointerdown=e=>{if(e.button!==0)return;gesture={x:e.clientX,y:e.clientY};handle.setPointerCapture(e.pointerId);};
  handle.onpointermove=e=>{if(!gesture||!gesture.moved&&Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)<7)return;gesture.moved=true;if(!gesture.ghost){gesture.ghost=document.createElement('div');gesture.ghost.className='subject-drag-ghost';gesture.ghost.textContent=token();document.body.append(gesture.ghost);}gesture.ghost.style.left=e.clientX+14+'px';gesture.ghost.style.top=e.clientY+14+'px';};
  handle.onpointerup=e=>{if(!gesture)return;const current=gesture;gesture=null;current.ghost?.remove();handle.releasePointerCapture(e.pointerId);if(!current.moved)return;suppressClick=true;setTimeout(()=>{suppressClick=false;},0);const textarea=document.getElementById('prompt');if(!textarea)return;const rect=textarea.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)return;const offset=textOffsetAt(textarea,e.clientX,e.clientY);textarea.focus();textarea.setSelectionRange(offset,offset);insert(token());};
  handle.onpointercancel=()=>{gesture?.ghost?.remove();gesture=null;};
  handle.onclick=()=>{if(!suppressClick)insert(token());};
}
export function speakerPanel(host,p,changed,insert) {
  host.replaceChildren(); const heading=document.createElement('div');heading.className='section-heading';heading.innerHTML='<h2>Speakers</h2>';
  const add=document.createElement('button');add.textContent='＋';add.setAttribute('aria-label','Add speaker');add.onclick=()=>{p.speakers||=[];p.speakers.push({id:crypto.randomUUID(),subjectId:null,name:'Narrator'});changed();};heading.append(add);host.append(heading);
  for(const [i,speaker] of (p.speakers||[]).entries()) {
    const row=document.createElement('div');row.className='speaker-row';
    const handle=document.createElement('button');handle.type='button';handle.className='speaker-token';handle.textContent=speakerToken(p,speaker.id);handle.setAttribute('aria-label','Insert or drag speaker '+(i+1));speakerGesture(handle,()=>speakerToken(p,speaker.id),insert);
    const select=document.createElement('select');select.setAttribute('aria-label','Subject for speaker '+(i+1));select.add(new Option('Narrator',''));p.subjects.forEach((subject,n)=>select.add(new Option('<Subject '+(n+1)+'> · '+subject.name,subject.id)));select.value=speaker.subjectId||'';
    select.onchange=()=>{speaker.subjectId=select.value||null;speaker.name=p.subjects.find(x=>x.id===speaker.subjectId)?.name||'Narrator';p.prompt=p.prompt.replace(/(?:<Subject \d+>\s*)?\(S(\d+)\)/g,(match,n)=>+n===i+1?speakerToken(p,speaker.id):match);handle.textContent=speakerToken(p,speaker.id);changed();};
    row.append(handle,select);host.append(row);
  }
}


