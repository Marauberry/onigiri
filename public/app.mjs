import {applyArrangement} from './arrangement-state.mjs';
import {promptDiff} from './prompt-diff.mjs';
import {installOverlays} from './overlays.mjs';
import {studioShell} from './studio-shell.mjs';
import {ping,glow,unlockAudio} from './notify.mjs';
import {draftBoard} from './draft-board.mjs';
import {sidebarGestures,reorderSidebarItems} from './sidebar-gestures.mjs';
import {canvasPicker,durationPicker} from '/canvas-picker.mjs';
import {shortTitle,folderChildren,labelText,labelColors} from './project-labels.mjs';
import {projectLabelDialog} from './project-label-dialog.mjs';
import {modelDashboard} from './model-dashboard.mjs';
import {subjectGestures} from './subject-drag.mjs';
import {sequenceTimeline} from './sequence-timeline.mjs';
import {askDialog} from './dialogs.mjs';
import {rolePicker,speakerPanel,speakerToken,inspectionRolePicker} from './role-picker.mjs';
import {homeFoldersView} from './home-folders.mjs';
import {tokenMenus} from './token-menu.mjs';
import {mediaChrome} from './media-chrome.mjs';
import {trackMentionEdits,clearMissingAt,textFields} from './mentions.mjs';
import {visualTrim} from './visual-trim.mjs';
import {contextMenu,timelinePicker,decorateEditor} from './editor-tools.mjs';
import {imageViewer} from './media-viewer.mjs';
import {coverId,starterTemplates} from './projects.mjs';
import {replaceDefinition} from './domain.mjs';
import {renumberShots,referenceMap,changeReferences,changeSubjects,dimensions,suggestions,validate,template,manualStructure} from './domain.mjs';

const $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const inspectionSettings=document.createElement('fieldset');inspectionSettings.className='inspection-settings';inspectionSettings.innerHTML='<legend>Video inspection</legend><label>Coverage<select id="inspectionAccuracy"><option value="high">High · 24 frames</option><option value="medium">Medium · 12 frames</option><option value="low">Low · 6 frames</option><option value="custom">Custom</option></select></label><label>Custom frames<input id="inspectionFrames" type="number" min="4" max="48" value="24"></label><small>Samples span the selected video range. Brief motion between samples and audio are not inspected.</small>';$('saveProfile').before(inspectionSettings);
const draftPane=document.createElement('section');draftPane.id='draftPane';draftPane.hidden=true;draftPane.innerHTML='<div id="draftBlocks"></div><label for="draftText">Draft notes</label><textarea id="draftText" rows="16" placeholder="Write freely. Soy Bean and Onigiri inputs above will join your idea when you compile."></textarea>';$('prompt').before(draftPane);const draftTab=document.createElement('button');draftTab.id='draftTab';draftTab.textContent='Draft';$('writeTab').before(draftTab);$('writeTab').textContent='Prompt';draftTab.onclick=showDraft;$('draftText').oninput=e=>{project.draftText=e.target.value;changed();};
document.querySelector('.brief-block').hidden=true;
// Writing direction and detail toggles are global settings, saved with the model configuration.
async function saveWritingSetting(field,value){status.config={...status.config,[field]:value};await api('/api/settings',status.config);}
$('detailEnhancement').onchange=()=>saveWritingSetting('detailEnhancement',$('detailEnhancement').checked).catch(error=>{toast(error.message);$('detailEnhancement').checked=!$('detailEnhancement').checked;});
$('reviewDraft').onchange=()=>saveWritingSetting('reviewDraft',$('reviewDraft').checked).catch(error=>{toast(error.message);$('reviewDraft').checked=!$('reviewDraft').checked;});
$('notifySound').onchange=()=>saveWritingSetting('notifySound',$('notifySound').checked).catch(error=>{toast(error.message);$('notifySound').checked=!$('notifySound').checked;});
$('notifyVisual').onchange=()=>saveWritingSetting('notifyVisual',$('notifyVisual').checked).catch(error=>{toast(error.message);$('notifyVisual').checked=!$('notifyVisual').checked;});
const workflowSwitch=document.createElement('div');workflowSwitch.className='workflow-switch';workflowSwitch.innerHTML='<button data-auto>Automatic</button><button data-manual>Manual</button>';document.querySelector('.editor-toolbar').prepend(workflowSwitch);
workflowSwitch.querySelector('[data-auto]').onclick=()=>{showDraft();openDirector(true);toast('Automatic: chat with the Director, then press Arrange everything.');};
workflowSwitch.querySelector('[data-manual]').onclick=()=>{showWrite();toast('Manual: references and subjects are in the left sidebar; Insert structure starts the sections.');};
const serverLabel=document.createElement('label');serverLabel.textContent='Existing local model server (optional)';const serverInput=document.createElement('input');serverInput.id='localModelServer';serverInput.placeholder='http://127.0.0.1:8080';serverLabel.append(serverInput);$('saveProfile').before(serverLabel);
let shell,boardUI;let modelUI;let lastCanvasSent='';let project, status, models=[], selected=null, saveTimer, saving=Promise.resolve(), editSerial=0, persistedSerial=0, completions=[], completionIndex=0, completionStart=0,completionTarget='prompt', aiBusy=false, session=null;

let snapshotSending=false,projectLoadGeneration=0;
let sessionToken=new URLSearchParams(location.hash.slice(1)).get('session');

const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function api(url,data) {

  const res=await fetch(url,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-H3-Token':status?.csrf || ''},body:JSON.stringify(data)});

  const result=await res.json();if(!res.ok) throw new Error(result.error||'Request failed.');return result;

}

let toastTimer;

function toast(message) {clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;$('toast').setAttribute('popover','manual');try{$('toast').hidePopover();document.body.append($('toast'));$('toast').showPopover();}catch{};toastTimer=setTimeout(()=>{$('toast').hidePopover?.();$('toast').hidden=true;},7000);}

const on=(id,fn,event='click')=>$(id).addEventListener(event,e=>Promise.resolve(fn(e)).catch(err=>toast(err.message)));

let mentionTexts={};function resetMentionTracking(){mentionTexts=Object.fromEntries(textFields(project).map(f=>[f.key,String(f.object[f.property]||'')]));}
let boardTimer;
// The first open of a browser session gets the onigiri entrance; later loads only get a quiet cover
// so the legacy shell never flashes before the studio layout is ready.
const splash=(()=>{
 const element=()=>document.getElementById('splash');
 const decorate=()=>{try{sessionStorage.setItem('onigiri-splash','1');}catch{}};
 const first=!document.documentElement.classList.contains('splash-quiet');
 const started=performance.now();let step=0,done=false,hurry=false;
 const finish=()=>{
  if(done)return;done=true;const el=element();if(!el){decorate();window.dispatchEvent(new Event('h3-splash-done'));return;}
  const wait=first&&!hurry?Math.max(0,900-(performance.now()-started)):0;
  setTimeout(()=>{el.classList.add('splash-done');setTimeout(()=>{el.remove();decorate();window.dispatchEvent(new Event('h3-splash-done'));},420);},wait);
 };
 const advance=next=>{
  step=Math.max(step,next);const logos=[...(element()?.querySelectorAll('.splash-logos img')||[])];
  logos.forEach((img,index)=>{img.classList.toggle('done',index<step);img.classList.toggle('active',index===step);});
  if(step>=logos.length)finish();
 };
 const el=element();
 el?.querySelector('.splash-skip')?.addEventListener('click',()=>{hurry=true;finish();});
 window.addEventListener('keydown',event=>{if(event.key==='Escape'&&!done){hurry=true;finish();}},{once:true});
 return {first,step:advance,finish};
})();

// Notifications: a low bass ping and a light spill around the Director housing.
function notify(kind){
 const sound=status?.config?.notifySound!==false,visual=status?.config?.notifyVisual!==false;
 if(sound)ping();
 if(visual)glow(document.querySelector('.director-room'),kind);
}

// New references, subjects and notes must reach the Draft board immediately.
function scheduleBoard(){if(!boardUI)return;clearTimeout(boardTimer);boardTimer=setTimeout(()=>{const active=document.activeElement;if(active?.closest?.('.draft-board'))return;boardUI.render();},80);}
function changed() {notifyCanvas();trackMentionEdits(project,mentionTexts);captureWriting();editSerial++;$('saveStatus').textContent='Unsaved changes';clearTimeout(saveTimer);saveTimer=setTimeout(()=>save().catch(e=>toast(e.message)),650);updateCount();scheduleBoard();}

async function save() {

  clearTimeout(saveTimer);

  saving=saving.catch(()=>{}).then(async()=>{

    if(persistedSerial===editSerial) return;

    const serial=editSerial, key=project.id;

    $('saveStatus').textContent='Saving…';

    let saved;try{saved=await api('/api/project/'+key,project);}catch(error){$('saveStatus').textContent='Not saved · '+error.message;throw error;}

    if(project.id===key) {project.revision=saved.revision;project.updated=saved.updated;persistedSerial=serial;$('saveStatus').textContent=serial===editSerial?'Saved locally':'Unsaved changes';const option=[...$('projectSelect').options].find(o=>o.value===key);if(option)option.textContent=project.title;}

  });

  return saving;

}

const refreshDecorations=decorateEditor($('prompt'),()=>project,()=>null);
tokenMenus($('prompt'),()=>project,(start,end,text)=>{clearMissingAt(project,'prompt',start);$('prompt').setSelectionRange(start,end);insert(text);},message=>toast(message),start=>{const before=$('prompt').value.slice(0,start),mention=[...before.matchAll(/<Subject (\d+)>/g)].at(-1),subject=project.subjects[Number(mention?.[1])-1];if(!subject){toast('Select a subject source in the sidebar to edit this role.');return;}const source=subjectSources(subject)[0];if(!source)return;rolePicker(source.path,result=>{for(const value of result.roles||[result]){const target=subject.sources.find(s=>s.sourceId===value.sourceId);if(target)Object.assign(target,value,{roleCleared:value.selections?.length===0});}subject.manualDescription=false;syncSubjectDefinition(subject);changed();renderSubjects();},{detail:source.detail||'',references:subject.sources.map(s=>project.references.find(r=>r.id===s.sourceId)).filter(Boolean),sourceId:source.sourceId,roles:subject.sources,title:'Soy Bean · <Subject '+(project.subjects.indexOf(subject)+1)+'>',flavor:'soybean',onNotify:toast,inspection:subjectInspection(subject)});});
const speakersHost=document.createElement('section');speakersHost.id='speakerList';document.querySelector('.library-footer').before(speakersHost);
const sidebarSelection={reference:new Set(),subject:new Set(),speaker:new Set()};
const insertAt=(text,at)=>{$('prompt').setSelectionRange(at,at);insert(text);};
function speakerChange(next){const old=project.speakers||[],map=Object.fromEntries(old.map((x,i)=>[i+1,next.findIndex(n=>n.id===x.id)+1]));for(const f of textFields(project))f.object[f.property]=String(f.object[f.property]||'').replace(/\(S(\d+)\)/g,(m,n)=>map[n]?'(S'+map[n]+')':'');project.speakers=next;$('prompt').value=project.prompt;changed();renderSpeakers();}
function renderSpeakers(){speakerPanel(speakersHost,project,()=>{$('prompt').value=project.prompt;changed();renderSpeakers();},text=>insert(text));speakersHost.querySelectorAll('.speaker-token').forEach(b=>{for(const k of ['onpointerdown','onpointermove','onpointerup','onpointercancel','onclick'])b[k]=null;});sidebarGestures(speakersHost,{kind:'speaker',selector:'.speaker-row',handleSelector:'.speaker-token',getItems:()=>project.speakers||[],selection:sidebarSelection.speaker,token:id=>speakerToken(project,id),textarea:$('prompt'),onInsert:insertAt,onClick:(e,id)=>insert(speakerToken(project,id)),onReorder:(ids,to)=>speakerChange(reorderSidebarItems(project.speakers,ids,to)),onContext:(e,ids)=>contextMenu(e,[{label:'Remove speakers',run:()=>speakerChange(project.speakers.filter(s=>!ids.includes(s.id)))}],err=>toast(err.message))});}

function updateCount() {refreshDecorations();$('charCount').textContent=project.prompt.length.toLocaleString()+' characters';const checks=validate(project);$('issueCount').textContent=checks.errors.length || '';}

async function listProjects() {const list=await api('/api/projects');$('projectSelect').innerHTML=list.map(p=>`<option value="${p.id}">${esc(p.title)}</option>`).join('');if(project) $('projectSelect').value=project.id;shell?.refreshProjects(list);}

async function loadProject(key,{navigate=true}={}) {if(aiBusy||snapshotSending)throw Error('Wait for the current request before switching scenes.');stopMedia();const generation=++projectLoadGeneration;await saving.catch(()=>{});const loaded=await api('/api/project/'+key);if(generation!==projectLoadGeneration)return;project=loaded;$('historyButton').textContent='History'+(project.branchName?' · '+project.branchName:'');if(sessionToken)sessionStorage.setItem('h3-node:'+sessionToken,project.id);resetMentionTracking();selected=null;editSerial=0;persistedSerial=0;resetWriting();render();notifyCanvas(true);localStorage.setItem('h3-project',project.id);if(shell){if(navigate)await shell.navigate('scene');shell.refreshProjects().catch(e=>toast(e.message));}}

function render() {

  $('projectSelect').value=project.id;$('projectDashboard').textContent=project.title;$('projectTitle').value=project.title;$('brief').value=project.brief;$('prompt').value=project.prompt;

  for(const k of ['width','height','length']) $(k).value=project[k];

  $('dialogueLanguage').value=project.dialogueLanguage||'Auto';$('dialogueMode').value=project.dialogueMode||'translate';$('detail').value=project.detail||'balanced';

  if($('draftText'))$('draftText').value=project.draftText||'';$('detailEnhancement').checked=status?.config?.detailEnhancement!==false;$('reviewDraft').checked=status?.config?.reviewDraft!==false;$('notifySound').checked=status?.config?.notifySound!==false;$('notifyVisual').checked=status?.config?.notifyVisual!==false;renderDraft();$('saveStatus').textContent='Saved locally';renderReferences();renderSubjects();renderSpeakers();renderDetails();updateCount();canvas();renderSceneTags().catch(e=>toast(e.message));

}

let refreshCanvasPicker;
function canvas(){if(!refreshCanvasPicker){document.querySelector('.canvas-simple').replaceChildren();refreshCanvasPicker=canvasPicker(document.querySelector('.canvas-simple'),{getValue:()=>({key:project.id,width:project.width,height:project.height,targetMP:project.targetMegapixels,aspectRatio:project.aspectRatio,sizeMode:project.canvasSizeMode}),onChange:c=>{Object.assign(project,{width:c.width,height:c.height,targetMegapixels:c.targetMP,aspectRatio:c.aspectRatio,canvasSizeMode:c.sizeMode});$('width').value=c.width;$('height').value=c.height;changed();}});}refreshCanvasPicker();syncDuration();}

function renderReferences() {

  renderDraft();const labels=referenceMap(project.references);$('refCount').textContent=project.references.length;

  $('dropzone').hidden=project.references.length>0;

  $('referenceList').innerHTML=project.references.map(r=>`<button class="ref-card ${r.id===selected?'selected':''}" draggable="true" data-id="${r.id}" title="Inspect ${esc(r.name)}">${r.thumbnail?`<img draggable="false" ${r.type==='audio'?'style="height:63px;object-fit:contain;background:#f1f4ed"':''} src="/api/asset/${r.id}?thumb" alt="${esc(r.name)}${r.type==='audio'?' waveform':''}">`:'<div class="audio-art">♫</div>'}<div class="ref-caption"><b>${esc(labels[r.id].slice(1,-1))}</b><span>${esc(r.name)}</span></div>${r.withAudio?`<div class="hint" style="margin:0 10px 8px">Linked ${esc(labels[r.id+':audio'])}</div>`:''}</button>`).join('');

  $('referenceList').querySelectorAll('[data-id]').forEach(el=>{el.oncontextmenu=e=>contextMenu(e,[{label:'Edit media',run:()=>el.openMedia()},{label:'Remove reference',run:()=>{selected=null;refChange(project.references.filter(r=>r.id!==el.dataset.id));toast('Reference removed. Original media remains in history.');}}],err=>toast(err.message));el.ondragstart=e=>{e.dataTransfer.setData('application/x-h3-reference',el.dataset.id);e.dataTransfer.effectAllowed='move';};el.ondragover=e=>{if(!e.dataTransfer.types.includes('application/x-h3-reference'))return;e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect='move';el.classList.add('drop-target');};el.ondragleave=()=>el.classList.remove('drop-target');el.ondrop=e=>{const id=e.dataTransfer.getData('application/x-h3-reference');if(!id)return;e.preventDefault();e.stopPropagation();el.classList.remove('drop-target');const refs=[...project.references],from=refs.findIndex(r=>r.id===id),to=refs.findIndex(r=>r.id===el.dataset.id);if(from<0||to<0||from===to)return;const [ref]=refs.splice(from,1);refs.splice(to,0,ref);refChange(refs);toast('References reordered. Prompt mentions updated.');};el.onclick=()=>{selected=el.dataset.id;$('referenceList').querySelectorAll('[data-id]').forEach(card=>card.classList.toggle('selected',card.dataset.id===selected));renderDetails();};el.openMedia=()=>{const r=project.references.find(r=>r.id===el.dataset.id);if(r.type==='video'||r.type==='audio')openVideoEditor(r).catch(e=>toast(e.message));if(r.type==='image'){const key=project.id;imageViewer(r,{toast,references:project.references,upload:async(blob,name)=>{const response=await fetch('/api/assets?name='+encodeURIComponent(name),{method:'POST',headers:{'X-H3-Token':status.csrf},body:blob}),asset=await response.json();if(!response.ok)throw Error(asset.error);return asset;},onSave:async asset=>{if(project.id!==key)throw Error('Project changed. The edited image remains in local assets.');const oldId=r.id;project.directorLinks=(project.directorLinks||[]).map(id=>id===oldId?asset.id:id);for(const m of project.directorMessages||[]){m.referenceIds=(m.referenceIds||[]).map(id=>id===oldId?asset.id:id);m.observations=(m.observations||[]).filter(o=>o.referenceId!==oldId);}project.references=project.references.map(x=>x.id===oldId?{...x,...asset,description:x.description}:x);for(const subject of project.subjects){if(subject.inspectionReferenceId===oldId)subject.inspectionReferenceId=asset.id;if(subject.sourceId===oldId)subject.sourceId=asset.id;for(const source of subject.sources||[])if(source.sourceId===oldId)source.sourceId=asset.id;}selected=asset.id;renderDraft();document.querySelector('.reference-hub')?.close();changed();renderReferences();renderSubjects();renderDetails();await save();}});}};});

 $('referenceList').querySelectorAll('[data-id]').forEach(el=>{for(const k of ['oncontextmenu','ondragstart','ondragover','ondragleave','ondrop','onclick'])el[k]=null;});
 $('referenceList').querySelectorAll('[data-id]').forEach(el=>{const edit=el.openMedia;el.openMedia=()=>openReferenceHub(project.references.find(r=>r.id===el.dataset.id),edit);el.ondblclick=el.openMedia;});
 sidebarGestures($('referenceList'),{kind:'reference',selector:'.ref-card',getItems:()=>project.references,selection:sidebarSelection.reference,token:id=>referenceMap(project.references)[id],textarea:$('prompt'),onInsert:insertAt,onClick:(e,id)=>{selected=id;renderDetails();},onReorder:(ids,to)=>refChange(reorderSidebarItems(project.references,ids,to)),onContext:(e,ids)=>{const refs=project.references.filter(r=>ids.includes(r.id));contextMenu(e,[...(new Set(refs.map(r=>r.type)).size===1?[{label:'Edit media',run:async()=>{for(const ref of refs){const el=$('referenceList').querySelector('[data-id="'+ref.id+'"]');el?.openMedia();if(refs.length>1)await new Promise(resolve=>{const wait=setInterval(()=>{if(!document.querySelector('dialog[open]:not(#resultsDialog)')){clearInterval(wait);resolve();}},200);});}}}]:[]),{label:'Duplicate',run:async()=>{const copies=[];for(const ref of refs){const copy=await api('/api/duplicate-reference',{id:ref.id});copies.push({...copy,description:ref.description,trimStart:ref.trimStart,trimEnd:ref.trimEnd,withAudio:ref.withAudio});}refChange([...project.references,...copies]);}},{label:'Remove references',run:()=>{selected=null;refChange(project.references.filter(r=>!ids.includes(r.id)));}}],err=>toast(err.message));}});
}

let subjectUndo=null;

function subjectSources(subject){if(!subject.sources)subject.sources=subject.sourceId?[{sourceId:subject.sourceId,path:subject.rolePath||[],detail:subject.roleDetail||'',label:subject.roleLabel||''}]:[];return subject.sources;}
function renderSubjects(){const expanded=new Set([...$('subjectList').querySelectorAll('details[open]')].map(el=>el.dataset.subjectId)),labels=referenceMap(project.references);
 $('subjectList').innerHTML=project.subjects.map((s,i)=>'<details class="subject-item" data-subject-id="'+s.id+'" '+(expanded.has(s.id)?'open':'')+'><summary><span class="subject-avatar">'+(i+1)+'</span><span class="subject-name">'+esc(s.name)+'</span><span class="disclosure">Edit</span></summary><input data-subject="'+i+'" aria-label="Subject '+(i+1)+' name" value="'+esc(s.name)+'"><div data-sources="'+i+'"></div><button data-add-source="'+i+'" class="quiet">＋ Source reference</button></details>').join('');
 for(const [i,subject] of project.subjects.entries()){
 const name=$('subjectList').querySelector('[data-subject="'+i+'"]');name.onchange=()=>{subject.name=name.value;syncSubjectDefinition(subject);changed();renderSubjects();};const descriptionLabel=document.createElement('label');descriptionLabel.textContent='Subject definition';const description=document.createElement('textarea');description.rows=3;description.setAttribute('aria-label','Subject '+(i+1)+' definition');description.value=subject.description||'';description.placeholder='Brief identity, appearance, object or setting.';description.onchange=()=>{subject.description=description.value;subject.manualDescription=true;const label='<Subject '+(i+1)+'>';if(project.prompt.includes(label))setDefinition(label,description.value.trim()?label+' is '+description.value.trim():'');renderDraft();changed();};descriptionLabel.append(description);name.after(descriptionLabel);
 const host=$('subjectList').querySelector('[data-sources="'+i+'"]');
 for(const source of subjectSources(subject)){const row=document.createElement('div');row.className='subject-source-row';const choose=document.createElement('select');choose.setAttribute('aria-label','Source for subject '+(i+1));choose.add(new Option('Choose reference',''));project.references.forEach(r=>choose.add(new Option(labels[r.id]+' · '+r.name,r.id)));choose.value=source.sourceId;choose.onchange=()=>{source.sourceId=choose.value;subject.sourceId=subject.sources[0]?.sourceId;syncSubjectDefinition(subject);changed();renderSubjects();};const role=document.createElement('button');role.className='role-choice';role.textContent='Soy Bean'+(source.label?' · '+source.label:'');role.onclick=()=>rolePicker(source.path,result=>{for(const value of result.roles||[result]){const target=subject.sources.find(s=>s.sourceId===value.sourceId);if(target)Object.assign(target,value,{roleCleared:value.selections?.length===0});}subject.manualDescription=false;syncSubjectDefinition(subject);changed();renderSubjects();},{detail:source.detail||'',references:subject.sources.map(s=>project.references.find(r=>r.id===s.sourceId)).filter(Boolean).map(r=>({...r,label:labels[r.id]})),sourceId:source.sourceId,roles:subject.sources,title:'Soy Bean · <Subject '+(i+1)+'>',flavor:'soybean',onNotify:toast,inspection:subjectInspection(subject)});const remove=document.createElement('button');remove.textContent='×';remove.setAttribute('aria-label','Remove subject source');remove.onclick=()=>{subject.sources=subject.sources.filter(s=>s!==source);subject.sourceId=subject.sources[0]?.sourceId||null;subject.manualDescription=false;syncSubjectDefinition(subject);changed();renderSubjects();};row.append(choose,role,remove);host.append(row);}
 $('subjectList').querySelector('[data-add-source="'+i+'"]').onclick=()=>{subject.sources.push({sourceId:project.references.find(r=>!subject.sources.some(s=>s.sourceId===r.id))?.id||'',path:[],detail:'',label:''});subject.sourceId=subject.sources[0]?.sourceId;syncSubjectDefinition(subject);changed();renderSubjects();};}
 sidebarGestures($('subjectList'),{kind:'subject',selector:'.subject-item',handleSelector:'summary',getItems:()=>project.subjects,selection:sidebarSelection.subject,token:id=>'<Subject '+(project.subjects.findIndex(s=>s.id===id)+1)+'>',textarea:$('prompt'),onInsert:insertAt,onReorder:(ids,to)=>applySubjects(reorderSidebarItems(project.subjects,ids,to)),onContext:(e,ids)=>contextMenu(e,[{label:'Remove subjects',run:()=>applySubjects(project.subjects.filter(s=>!ids.includes(s.id)))}],err=>toast(err.message))});renderSpeakers();}

function applySubjects(subjects){project=changeSubjects(project,subjects);resetMentionTracking();$('prompt').value=project.prompt;$('brief').value=project.brief;changed();renderSubjects();renderDetails();}

function stopMedia() {document.querySelectorAll('video,audio').forEach(el=>{el.pause();el.removeAttribute('src');el.load();});}

function refChange(refs) {project=changeReferences(project,refs);resetMentionTracking();$('prompt').value=project.prompt;changed();renderReferences();renderSubjects();renderDetails();}

function renderDetails() {

  const r=project.references.find(r=>r.id===selected), host=$('referenceDetails');stopMedia();host.replaceChildren();host.hidden=!r;if(!r)return;

  host.innerHTML=`<div class="section-heading"><h2>${esc(referenceMap(project.references)[r.id])}</h2><button id="insertRef" class="quiet">Insert ↗</button></div>${r.type==='image'?`<img class="media-preview" src="/api/asset/${r.id}" alt="${esc(r.name)}">`:`<${r.type} class="media-preview" controls src="/api/asset/${r.id}"></${r.type}>`}<label for="refName">NAME</label><input id="refName" type="text" value="${esc(r.name)}"><label for="refDescription" style="margin-top:15px">REFERENCE NOTES</label><textarea id="refDescription" rows="4" placeholder="What should carry into the scene?">${esc(r.description)}</textarea>${r.type!=='audio'?'<button id="inspectRef" class="full">✧ Describe reference</button>':''}${r.type!=='image'?`<div class="dimensions" style="margin-top:16px"><label>Start (s)<input id="trimStart" type="number" min="0" step="0.1" value="${r.trimStart}"></label><label>End (s)<input id="trimEnd" type="number" min="0" step="0.1" value="${r.trimEnd}"></label></div>`:''}${r.type==='video'&&r.hasAudio?`<label class="checkbox"><input id="withAudio" role="switch" type="checkbox" ${r.withAudio?'checked':''}> Include its audio</label>`:''}<div class="detail-actions"><div><button id="refUp" class="quiet" title="Move earlier">↑</button><button id="refDown" class="quiet" title="Move later">↓</button></div><button id="removeRef" class="quiet danger">Remove reference</button></div>`;

  mediaChrome(host,()=>document.querySelector('#referenceList [data-id="'+r.id+'"]').openMedia());
  on('insertRef',()=>insert(referenceMap(project.references)[r.id]));

  on('refName',e=>{r.name=e.target.value;changed();renderReferences();},'input');

  $('refDescription').hidden=true;host.querySelector('label[for=refDescription]')?.remove();on('refDescription',e=>{const previous=r.description;r.description=e.target.value;r.autoCarry=false;if(!r.description.trim())clearReferenceDefinition(r,previous);changed();},'input');

  $('inspectRef')?.remove();const roleButton=document.createElement('button');roleButton.className='role-choice';roleButton.textContent='Onigiri';host.querySelector('.detail-actions').before(roleButton);roleButton.onclick=()=>openReferenceStudio(r);
  if(r.type!=='image') for(const k of ['trimStart','trimEnd']) on(k,e=>{r[k]=Number(e.target.value);changed();},'input');

  if($('withAudio')) on('withAudio',e=>{const next=changeReferences(project,project.references.map(x=>x.id===r.id?{...x,withAudio:e.target.checked}:x));Object.assign(r,next.references.find(x=>x.id===r.id));next.references=next.references.map(x=>x.id===r.id?r:x);project=next;resetMentionTracking();$('prompt').value=project.prompt;changed();renderReferences();renderSubjects();},'change');

  on('removeRef',()=>{const refs=project.references.filter(x=>x.id!==r.id);selected=null;refChange(refs);toast('Reference removed. Existing snapshots keep their media.');});

  const move=delta=>{const refs=[...project.references],i=refs.findIndex(x=>x.id===r.id),j=i+delta;if(j<0||j>=refs.length)return;[refs[i],refs[j]]=[refs[j],refs[i]];refChange(refs);};

  on('refUp',()=>move(-1));on('refDown',()=>move(1));host.querySelector('.detail-actions').remove();host.querySelector('#trimStart')?.closest('.dimensions').remove();

}

function openReferenceStudio(r){rolePicker(r.rolePath||[],role=>{Object.assign(r,{rolePath:role.path,roleDetail:role.detail,roleLabel:role.label,roleSelections:role.selections});changed();},{reference:{...r,label:referenceMap(project.references)[r.id]},detail:r.roleDetail||'',selections:r.roleSelections||[],title:'Onigiri · '+referenceMap(project.references)[r.id],flavor:'onigiri',onNotify:toast,inspection:{tags:r.tags||[],allowEmpty:true,output:r.description||'',closeOnSave:true,onSave:async({text,role})=>{r.description=text;r.autoCarry=false;Object.assign(r,{rolePath:role.path,roleDetail:role.detail,roleLabel:role.label,roleSelections:role.selections});if(!text.trim())clearReferenceDefinition(r,r.savedDescription);r.savedDescription=text;renderDraft();changed();renderDetails();await save();}}});}

// duplicating keeps the previous entry and appends a new one, matching a repeated drop.
let pickerSink=null;

function openReferenceBrowser(sink=null){pickerSink=sink;return showOutputBrowser('',sink);}

async function uploadAsset(file){const response=await fetch('/api/assets?name='+encodeURIComponent(file.name),{method:'POST',headers:{'X-H3-Token':status?.csrf||''},body:file});const asset=await response.json();if(!response.ok)throw Error(asset.error||'Could not add that file.');return asset;}

async function addFiles(files,{duplicates=false}={}) {

  const owner=project,added=[];for(const file of files) {

    $('saveStatus').textContent=`Importing ${file.name}…`;

    const res=await fetch('/api/assets?project='+encodeURIComponent(project.id)+'&name='+encodeURIComponent(file.name),{method:'POST',headers:{'X-H3-Token':status.csrf},body:file});

    const result=await res.json();if(!res.ok) {toast(result.error);continue;}

    if(project.id!==owner.id)throw Error('Scene changed during import; imported media remains saved.');

    let asset=result;
    if(project.references.some(r=>r.id===result.id)){if(!duplicates)continue;asset={...result,...await api('/api/duplicate-reference',{id:result.id})};}
    project.references.push(asset);added.push(asset.id);selected=asset.id;changed();renderReferences();renderDetails();

  }

  await save();return added;

}

// A drop is an import only: media joins References & subjects and never writes a prompt token.
// Reference cards dragged from the library already exist, so they are linked instead of duplicated.
async function addDroppedMedia(transfer,{duplicates=true}={}) {
  const rawId=transfer.getData('application/x-h3-reference');
  let payload;try{payload=JSON.parse(transfer.getData('application/x-h3-items'));}catch{}
  const dragged=payload?.kind==='reference'&&Array.isArray(payload.ids)?payload.ids.filter(id=>project.references.some(r=>r.id===id)):rawId&&project.references.some(r=>r.id===rawId)?[rawId]:null;
  const ids=dragged?.length?dragged:await addFiles(transfer.files,{duplicates});
  if(ids.length)project.directorLinks=[...new Set([...(project.directorLinks||[]),...ids])];
  return ids;
}


let writingHistory={},restoringWriting=false;
function resetWriting(){writingHistory=Object.fromEntries(['prompt','brief'].map(k=>[k,{items:[project[k]],at:0}]));}
function captureWriting(){if(restoringWriting)return;for(const k of ['prompt','brief']){const h=writingHistory[k];if(!h)continue;if(h.items[h.at]!==project[k]){h.items.splice(h.at+1);h.items.push(project[k]);if(h.items.length>200)h.items.shift();h.at=h.items.length-1;}}}
for(const k of ['prompt','brief'])$(k).addEventListener('keydown',e=>{if(!(e.ctrlKey||e.metaKey)||e.key.toLowerCase()!=='z')return;e.preventDefault();e.stopImmediatePropagation();const h=writingHistory[k],next=h.at+(e.shiftKey?1:-1);if(next<0||next>=h.items.length)return;h.at=next;project[k]=h.items[next];$(k).value=project[k];restoringWriting=true;changed();restoringWriting=false;hideComplete();},true);
function positionCompletion(){const el=$(completionTarget),style=getComputedStyle(el),mirror=document.createElement('div');for(const k of ['font','padding','border','boxSizing','lineHeight','letterSpacing','wordSpacing','tabSize'])mirror.style[k]=style[k];Object.assign(mirror.style,{position:'fixed',visibility:'hidden',whiteSpace:'pre-wrap',overflowWrap:'break-word',width:el.clientWidth+'px',left:'0',top:'0'});mirror.textContent=el.value.slice(0,el.selectionStart);const caret=document.createElement('span');caret.textContent='|';mirror.append(caret);document.body.append(mirror);const rect=el.getBoundingClientRect(),x=rect.left+caret.offsetLeft-el.scrollLeft,y=rect.top+caret.offsetTop-el.scrollTop+parseFloat(style.lineHeight||20);const host=$('autocomplete');Object.assign(host.style,{position:'fixed',left:Math.max(8,Math.min(x,innerWidth-330))+'px',top:Math.max(8,Math.min(y,innerHeight-240))+'px',bottom:'auto',width:'320px',maxHeight:'220px',overflowY:'auto',zIndex:'100'});mirror.remove();}

function insert(text,back=0,target='prompt') {

  const el=$(target);el.focus();el.setRangeText(text,el.selectionStart,el.selectionEnd,'end');el.selectionStart=el.selectionEnd=el.selectionEnd-back;project[target]=el.value;changed();hideComplete();

}

function hideComplete() {$('autocomplete').hidden=true;completions=[];}

function complete(target='prompt') {
  completionTarget=target;

  const el=$(target), before=el.value.slice(0,el.selectionStart), match=before.match(/(?:<[^<>\n]*|\[[^\[\]\n]*|\([^()\n]*|At \d[\d:.]*)$/);

  if(!match||match[0].length>45) return hideComplete();

  completionStart=el.selectionStart-match[0].length;if(/^At \d/.test(match[0])){completions=[];const end=el.selectionStart;timelinePicker($('autocomplete'),{prefix:match[0],length:project.length,onApply:text=>{el.setSelectionRange(completionStart,end);insert(text,0,target);}});positionCompletion();return;}completions=suggestions(project,match[0]);completionIndex=0;renderCompletions();

}

function renderCompletions() {

  const host=$('autocomplete');host.hidden=!completions.length;if(completions.length)positionCompletion();

  host.innerHTML=completions.map((s,i)=>`<button role="option" aria-selected="${i===completionIndex}" class="${i===completionIndex?'active':''}" data-index="${i}"><span>${esc(s.value)}</span><small>${esc(s.detail)}</small></button>`).join('');

  host.querySelectorAll('button').forEach(el=>el.onmousedown=e=>{e.preventDefault();chooseCompletion(+el.dataset.index);});

}

function chooseCompletion(i) {const s=completions[i],el=$(completionTarget);el.setSelectionRange(completionStart,el.selectionStart);if(s.subjectId){project.speakers||=[];const subject=project.subjects.find(x=>x.id===s.subjectId);let index=project.speakers.findIndex(x=>x.subjectId===s.subjectId);if(index<0){index=project.speakers.length;project.speakers.push({id:crypto.randomUUID(),subjectId:s.subjectId,name:subject.name});}insert('<Subject '+(project.subjects.indexOf(subject)+1)+'> (S'+(index+1)+')',0,completionTarget);return;}insert(s.value,s.caretBack||0,completionTarget);if(completionTarget==='prompt'&&s.value.startsWith('[Shot '))normalizeShotOrder();}

function showChecks() {sessionStorage.setItem('onigiri-view:'+project.id,'check');$('draftPane').hidden=true;$('draftTab').classList.remove('active');const {errors,warnings}=validate(project);$('checks').hidden=false;$('prompt').hidden=true;refreshDecorations();$('writeTab').classList.remove('active');$('checkButton').classList.add('active');hideComplete();promptTools(false);shell?.showAssets(false);$('checks').innerHTML=[...errors.map(x=>`<div class="issue error">${esc(x)}</div>`),...warnings.map(x=>`<div class="issue">${esc(x)}</div>`)].join('')||'<div class="issue ok">Ready to send. References and prompt syntax are consistent.</div>';}

function promptTools(visible){$('templateButton').hidden=!visible;$('copyButton').hidden=!visible;}
function showWrite() {sessionStorage.setItem('onigiri-view:'+project.id,'prompt');$('draftPane').hidden=true;$('draftTab').classList.remove('active');$('checks').hidden=true;$('prompt').hidden=false;refreshDecorations();$('writeTab').classList.add('active');$('checkButton').classList.remove('active');promptTools(true);shell?.showAssets(true);}

async function refreshModels() {

  const scan=await api('/api/models');models=scan.models;if(scan.profiles)status.config.profiles=scan.profiles;

  const saved=localStorage.getItem('h3-model'),llms=models.filter(m=>!m.projector&&/bonsai/i.test(m.name+' '+m.path));

  $('modelSelect').innerHTML=llms.map(m=>`<option value="${esc(m.path)}">${esc(m.name.replace(/\.gguf$/i,''))}</option>`).join('')||'<option value="">No GGUF models found</option>';

  $('modelSelect').value=llms.find(m=>m.path===saved)?.path || llms.find(m=>/bonsai/i.test(m.name))?.path || llms[0]?.path || '';

  $('projectorSelect').innerHTML='<option value="">Text only / no projector</option>'+models.filter(m=>m.projector).map(m=>`<option value="${esc(m.path)}">${esc(m.name)}</option>`).join('');

  if(scan.errors.length)toast(scan.errors.join('\n'));loadProfile();modelUI?.drawModels();

}

function loadProfile() {

  const model=$('modelSelect').value,p=status.config.profiles[model]||{};

  $('localModelServer').value=p.serverUrl||'';$('inspectionAccuracy').value=p.inspectionAccuracy||'high';$('inspectionFrames').value=p.inspectionFrames||24;$('projectorSelect').value=p.projector||'';$('gpuLayers').value=p.gpuLayers??'auto';$('contextSize').value=p.context||8192;$('outputTokens').value=p.tokens||1800;$('cpuMoe').checked=!!p.cpuMoe;

  const m=models.find(m=>m.path===model);$('modelHint').textContent=m?`${(m.bytes/1024**3).toFixed(1)} GB on disk · ${p.serverUrl?'using existing local server':'unloads after each request'} · ${p.projector?'Image input configured. Video inspection uses configurable sampled frames, without audio.':'Text only. Add a matching mmproj for image inspection.'}`:'Add your model folder in settings.';

  localStorage.setItem('h3-model',model);modelUI?.drawModels();

}

async function saveSettings() {await api('/api/settings',status.config);}

async function sendSnapshot() {
  if(snapshotSending)return;
  if(aiBusy)throw Error('Finish the Director request before saving a snapshot.');
  const report=validate(project);if(report.errors.length){showChecks();throw Error('Resolve the highlighted issues before sending.');}
  snapshotSending=true;const button=$('sendButton'),label=button.innerHTML;button.disabled=true;button.textContent='Saving snapshot…';
  const owner=project;
  try{
    await save();
    if(project!==owner)throw Error('The scene changed. Save a snapshot from the intended scene.');
    const frozen=structuredClone(owner);
    const snapshot=await api('/api/snapshots',frozen);
    if(!sessionToken){toast('Snapshot saved locally. Open Onigiri from a ComfyUI node to send it directly.');return;}
    try{await api('/api/bridge/session/'+sessionToken,{action:'send',snapshot});}
    catch(error){$('connection').textContent='Snapshot saved · connection unavailable';throw Error('Your snapshot was saved. Reopen the editor from its ComfyUI node to reconnect. '+error.message);}
    $('connection').textContent='Sending snapshot…';button.textContent='Waiting for ComfyUI…';
    for(let i=0;i<20;i++){await sleep(500);const state=await api('/api/bridge/session/'+sessionToken);if(state.ack===snapshot.id){$('connection').textContent=`Sent to ${state.target}`;toast('Sent. Queue your workflow in ComfyUI when ready.');return;}}
    $('connection').textContent='Snapshot saved · awaiting ComfyUI';toast('Snapshot saved; delivery is pending. Keep the target workflow open.');
  }finally{snapshotSending=false;button.disabled=false;button.innerHTML=label;}
}

async function init() {

  splash.step(0);

  status=await api('/api/status');
  splash.step(1);

  let recoveredProject=null;
  if(sessionToken){try{session=await api('/api/bridge/session/'+sessionToken);$('connection').textContent='Connected · '+session.target;$('connection').classList.add('connected');$('sendButton').innerHTML='Send to ComfyUI <span>↗</span>';}catch{recoveredProject=sessionStorage.getItem('h3-node:'+sessionToken);sessionToken=null;toast('The node connection expired. Your saved scene is available; reopen Onigiri from its node to reconnect.');}}

  await listProjects();let key=session?session.projectId:recoveredProject||localStorage.getItem('h3-project');
  if(session&&(!key||![...$('projectSelect').options].some(o=>o.value===key))){const fresh=await api('/api/projects',{});key=fresh.id;await listProjects();}

  const options=[...$('projectSelect').options];if(!options.some(o=>o.value===key))key=options[0]?.value;

  if(!key){project=await api('/api/projects',{});key=project.id;await listProjects();}

  await loadProject(key);if(sessionToken)await api('/api/bridge/session/'+sessionToken,{action:'bind',projectId:project.id});const requestedReference=new URLSearchParams(location.hash.slice(1)).get('reference');if(project.references.some(r=>r.id===requestedReference)){selected=requestedReference;renderReferences();renderDetails();}

  modelUI=modelDashboard({api,getModels:()=>models,getStatus:()=>status,toast,select:path=>{$('modelSelect').value=path;loadProfile();refreshMemory();},saveFolders:async paths=>{const next={...status.config,modelDirs:paths};await api('/api/settings',next);status=await api('/api/status');await refreshModels();toast('Model folders saved and scanned.');}});modelUI.drawModels();
  $('modelDirs').value=status.config.modelDirs.join('\n');$('runtimeInfo').textContent=status.runtimeReady?'Local llama.cpp · one request at a time. Optional existing local server in the profile.':'Runtime is missing. Run the project setup script.';
  shell=studioShell({getProject:()=>project,api,save,loadProject,createScene,showDashboard:()=>{dashboardHome=false;return showDashboard();},showDraft,restoreView,openDirector,changed,toast,isBusy:()=>aiBusy||snapshotSending,session,renameFolder,openFolder:async name=>{if(![...$('projectFolder').options].some(o=>o.value===name))$('projectFolder').add(new Option(name,name));$('projectFolder').value=name;await showDashboard();},projectContext:(e,id,title)=>{dashboardTrashMode=false;selectedProjects.clear();selectedProjects.add(id);contextMenu(e,[{label:"Rename scene…",run:()=>renameProject(id,title)},{label:"Project details",run:()=>manageProject(id)},{label:"Show on Home",run:()=>projectBatch("showHome")},{label:"Move to folder…",run:()=>projectBatch("folder")},{label:"Duplicate",run:()=>projectBatch("duplicate")},{label:"Move to Trash",run:()=>projectBatch("trash")}],error=>toast(error.message));},chatDrop:bindChatDrop,uploadAsset,renderReferences,openReferenceBrowser,addDroppedMedia});
  $('draftPane').replaceChildren();boardUI=draftBoard($('draftPane'),{getProject:()=>project,changed,editIntent:openDirector,editSubject:i=>{const row=$('subjectList').querySelectorAll('.subject-item')[i];if(row){row.open=true;row.querySelector('.role-choice')?.click();}},editReference:openReferenceStudio,showPrompt:showWrite,dropMedia:async transfer=>{const owner=project,ids=await addDroppedMedia(transfer);if(project.id!==owner.id)throw Error('Scene changed during import.');return ids;},referenceActions:ref=>[{label:'Edit reference…',run:()=>document.querySelector('#referenceList [data-id="'+ref.id+'"]').openMedia()},{label:'Duplicate reference',run:async()=>{try{const copy=await api('/api/duplicate-reference',{id:ref.id});refChange([...project.references,{...ref,...copy}]);}catch(e){toast(e.message);}}},{label:'Remove reference',run:()=>refChange(project.references.filter(r=>r.id!==ref.id))}],removeSubject:id=>{project=changeSubjects(project,project.subjects.filter(s=>s.id!==id));$('prompt').value=project.prompt;changed();renderSubjects();renderDraft();}});boardUI.render();await shell.start();splash.step(2);await Promise.race([refreshModels().catch(e=>toast(e.message)),new Promise(resolve=>setTimeout(resolve,2500))]);splash.step(3);unlockAudio();

}

on('projectTitle',e=>{project.title=e.target.value;project.manualTitle=true;$('projectDashboard').textContent=project.title;changed();},'input');

on('projectTitle',()=>listProjects(),'blur');on('brief',e=>{project.brief=e.target.value;changed();complete('brief');},'input');

on('prompt',e=>{project.prompt=e.target.value;changed();complete();},'input');

for(const field of ['prompt','brief'])$(field).addEventListener('keydown',e=>{if(!completions.length)return;if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();completionIndex=(completionIndex+(e.key==='ArrowDown'?1:-1)+completions.length)%completions.length;renderCompletions();}else if(['Tab','Enter'].includes(e.key)){e.preventDefault();chooseCompletion(completionIndex);}else if(e.key==='Escape'){e.preventDefault();hideComplete();}});

for(const field of ['prompt','brief'])$(field).addEventListener('blur',()=>setTimeout(()=>{if(document.activeElement!==$(completionTarget)&&!$('autocomplete').matches(':hover')&&!$('autocomplete').contains(document.activeElement))hideComplete();},150));

for(const k of ['width','height','length'])on(k,e=>{const ratio=project.width/project.height;project[k]=Number(e.target.value);if(k!=='length'&&$('lockAspect').checked){const other=k==='width'?'height':'width';project[other]=Math.max(32,Math.round((k==='width'?project.width/ratio:project.height*ratio)/32)*32);$(other).value=project[other];}if(k!=='length'){delete project.aspectRatio;delete project.targetMegapixels;};changed();canvas();},'change');

function normalizeShotOrder(){const el=$('prompt'),at=el.selectionStart,next=renumberShots(el.value),caret=renumberShots(el.value.slice(0,at)).length;project.prompt=next;el.value=next;el.setSelectionRange(caret,caret);changed();}
on('addShot',()=>{insert('\n[Shot 1] ');normalizeShotOrder();});

on('templateButton',()=>{insert(manualStructure());showWrite();toast('Empty section headings inserted. Fill the six sections manually; detailed_description holds integrated action, camera and sound.');});

on('copyButton',async()=>{await navigator.clipboard.writeText(project.prompt);toast('Prompt copied.');});

on('writeTab',showWrite);on('checkButton',showChecks);

on('addFiles',()=>openReferenceBrowser(null));on('browseFiles',()=>openReferenceBrowser(null));

on('fileInput',async e=>{const files=[...(e.target.files||[])];e.target.value='';if(!files.length)return;if(pickerSink){const sink=pickerSink;pickerSink=null;await sink.files(files);}else await addFiles(files);},'change');

const library=document.querySelector('.library');const libraryIgnore=e=>textSelectionDrag||[...e.dataTransfer.types].some(t=>t.startsWith('application/x-h3-'))||!couldCarryMedia(e);library.addEventListener('dragover',e=>{if(libraryIgnore(e))return;e.preventDefault();library.classList.add('dragging');});library.addEventListener('dragleave',()=>library.classList.remove('dragging'));library.addEventListener('drop',e=>{if(libraryIgnore(e))return;e.preventDefault();library.classList.remove('dragging');importDrop(e.dataTransfer,{duplicates:true}).catch(e=>toast(e.message));});

document.addEventListener('paste',e=>{if(e.clipboardData.files.length){e.preventDefault();addFiles(e.clipboardData.files).catch(e=>toast(e.message));}});

// Ctrl/Cmd+A in the Project Gallery selects every visible scene card instead of the page text.
document.addEventListener('keydown',event=>{
 if(!(event.ctrlKey||event.metaKey)||String(event.key).toLowerCase()!=='a')return;
 if(document.body.dataset.studioPage!=='gallery'||!$('projectDialog').open)return;
 if(event.target.closest?.('input,textarea,select,[contenteditable]'))return;
 event.preventDefault();selectedProjects.clear();
 $('projectCards').querySelectorAll('[data-open]').forEach(button=>selectedProjects.add(button.dataset.open));
 renderDashboard();
});

on('addSubject',()=>{const pictures=project.references.filter(r=>r.type==='image'),s={id:crypto.randomUUID(),name:`Subject ${project.subjects.length+1}`,description:'',sourceId:pictures.length===1?pictures[0].id:null};project.subjects.push(s);syncSubjectDefinition(s);changed();renderSubjects();});

on('projectSelect',async e=>{const key=e.target.value;await save();await loadProject(key);},'change');

on('newProject',()=>createScene({}));

on('settingsButton',()=>{$('settings').showModal();});on('modelSelect',loadProfile,'change');

on('scanModels',async()=>{status.config.modelDirs=$('modelDirs').value.split('\n').map(x=>x.trim()).filter(Boolean);await saveSettings();await refreshModels();toast('Model folders scanned.');});

on('saveProfile',async()=>{const key=$('modelSelect').value;if(!key)throw new Error('Choose a model first.');status.config.profiles[key]={...status.config.profiles[key],serverUrl:$('localModelServer').value.trim(),projector:$('projectorSelect').value,gpuLayers:$('gpuLayers').value,context:+$('contextSize').value,tokens:+$('outputTokens').value,cpuMoe:$('cpuMoe').checked,inspectionAccuracy:$('inspectionAccuracy').value,inspectionFrames:+$('inspectionFrames').value};await saveSettings();$('settings').close();toast('Model settings saved.');});

on('sendButton',sendSnapshot);

document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();save().then(()=>toast('Saved locally.')).catch(e=>toast(e.message));}});

window.addEventListener('beforeunload',e=>{if(editSerial!==persistedSerial){e.preventDefault();e.returnValue='';}});

installOverlays();init().catch(e=>toast(e.message));

on('undoSubject',()=>{if(!subjectUndo||project.id!==subjectUndo.project.id||editSerial!==subjectUndo.serial)throw new Error('Use History to restore the version before deletion; other edits were made.');const revision=project.revision;project={...subjectUndo.project,revision};subjectUndo=null;$('undoSubject').hidden=true;changed();render();});
for(const k of ['dialogueLanguage','dialogueMode','detail'])on(k,e=>{project[k]=e.target.value;changed();},'change');

const mediaTheme=matchMedia('(prefers-color-scheme: dark)');
function applyTheme(){const choice=localStorage.getItem('h3-theme')||'system';$('theme').value=choice;document.documentElement.dataset.theme=choice==='system'?(mediaTheme.matches?'dark':'light'):choice;}
on('theme',e=>{localStorage.setItem('h3-theme',e.target.value);applyTheme();},'change');mediaTheme.addEventListener('change',applyTheme);applyTheme();
function diffMarkup(before,after){if(before===after)return '<p class=hint>No prompt changes.</p><pre>'+esc(after)+'</pre>';return promptDiff(before,after).map(x=>x.kind==='same'?esc(x.text):'<'+(x.kind==='added'?'ins':'del')+'>'+esc(x.text)+'</'+(x.kind==='added'?'ins':'del')+'>').join('');}
async function showHistory(trash=false){
  await save();const historyProjectId=project.id;$('historyTitle').textContent=trash?'Trash':'History · '+(project.branchName||'Main');
  if(!$('historyDialog').open){$('historyList').textContent='Loading saved versions…';$('historyDialog').showModal();}const entries=await api(trash?'/api/trash':'/api/history/'+project.id);const outputs=[];
  $('historyList').innerHTML=(trash?'':`<p class="history-location">You are on <strong>${esc(project.branchName||'Main')}</strong> · revision ${project.revision}.${project.branchedFrom?` Restored from ${esc(project.branchedFrom.kind)} ${esc(project.branchedFrom.key)}. Edits continue on this branch; other versions are preserved.`:' Restoring a version starts a new branch.'}</p>`)+entries.map((x,i)=>`${x.kind==='revision'?`<details class="autosave-entry"><summary>Autosave · revision ${x.revision} · ${esc((x.changes||[]).join(' · '))}</summary>`:''}<article class="history-entry"><div class="section-heading"><h2>${esc(trash?x.title:(x.kind==='current'?'Current':x.kind==='snapshot'?'Send '+(x.sendVersion||'snapshot'):'Edit')+' · revision '+x.revision)}</h2><button data-restore="${i}" ${x.kind==='current'?'disabled aria-current="true"':''}>${x.kind==='current'?'You are here':'Restore as new branch'}</button></div>${trash?'':`<p class="hint">${esc(x.date?new Date(x.date).toLocaleString():'Initial version')} · ${x.references} references${' · '+esc(x.branchName||'Main')}${x.activeBranch?' · Active branch':''}${x.restoredAt&&x.revision===x.restoredRevision?' · Restored here':''}${x.kind==='snapshot'?' · '+esc(x.key):''}</p><p class="history-changes">${esc((x.changes||[]).join(' · '))}</p><div class="history-thumbs">${(x.referenceItems||[]).map(r=>`<img src="/api/asset/${r.id}?thumb" title="${esc(r.name)}" alt="${esc(r.name)}">`).join('')}</div><details><summary>Compare prompt</summary><p class=hint>Green = added · Red = removed. Compared with previous revision.</p><div class="history-diff">${diffMarkup(x.previousPrompt||'',x.prompt)}</div><details><summary>Compare this version with current prompt</summary><div class="history-diff">${diffMarkup(x.prompt,project.prompt)}</div></details></details>${x.kind==='snapshot'?`<button data-history-results="${i}">Show generated results</button><div data-result-list="${i}"></div>`:''}${outputs.filter(r=>r.snapshotIds?.includes(x.key)).map(r=>`<details><summary>Result · ${esc(r.name)}</summary>${r.type==='video'?`<video controls preload="none" src="${esc(r.url)}" style="width:100%"></video>`:r.type==='audio'?`<audio controls preload="none" src="${esc(r.url)}"></audio>`:`<img src="/api/comfy-preview?url=${encodeURIComponent(r.url)}" alt="${esc(r.name)}" style="width:100%">`}</details>`).join('')}`}</article>${x.kind==='revision'?'</details>':''}`).join('')||'<p class="muted">Nothing here yet.</p>';
  let historyOutputs;
  $('historyList').querySelectorAll('[data-history-results]').forEach(button=>button.onclick=async()=>{button.disabled=true;button.textContent='Loading results…';try{historyOutputs||=api('/api/recent-results');const results=(await historyOutputs).filter(r=>r.snapshotIds?.includes(entries[+button.dataset.historyResults].key)),host=$('historyList').querySelector('[data-result-list="'+button.dataset.historyResults+'"]');if(!host)return;host.replaceChildren();for(const result of results){const item=document.createElement('p');item.textContent=result.name;host.append(item);const media=document.createElement(result.type==='video'?'video':result.type==='audio'?'audio':'img');media.src=result.type==='image'?'/api/comfy-preview?url='+encodeURIComponent(result.url):result.url;media.controls=true;media.preload='none';media.style.maxWidth='100%';host.append(media);}button.textContent=results.length?'Results loaded':'No linked generated results';}catch(e){historyOutputs=null;button.disabled=false;button.textContent='Retry loading results';toast(e.message);}});
  $('historyList').querySelectorAll('[data-restore]').forEach(el=>el.onclick=async()=>{try{const x=entries[+el.dataset.restore];if(project.id!==historyProjectId)throw Error('Scene changed. Reopen History.');el.disabled=true;el.textContent='Restoring…';await save();if(trash){await api('/api/trash/'+x.id,{restore:true});await listProjects();await loadProject(x.id);}else{await api('/api/history/'+project.id,{...x,revision:project.revision});await loadProject(project.id);}if(trash){$('historyDialog').close();toast('Restored.');}else{await showHistory();toast('Restored on '+project.branchName+'. Your previous versions are preserved.');}}catch(e){el.disabled=false;el.textContent='Restore as new branch';toast(e.message);}});
  if(!$('historyDialog').open)$('historyDialog').showModal();
}
on('historyButton',()=>showHistory());on('trashButton',openTrash);
on('deleteProject',async()=>{await save();await api('/api/trash/'+project.id,{revision:project.revision});await listProjects();let key=$('projectSelect').options[0]?.value;if(!key){const next=await api('/api/projects',{});key=next.id;await listProjects();}await loadProject(key);toast('Moved to Trash. Snapshots and media are kept.');});
window.addEventListener('pagehide',stopMedia);

let memoryRefreshing=false;
async function refreshMemory(){if(!status||memoryRefreshing)return;memoryRefreshing=true;try{const m=await api('/api/memory?model='+encodeURIComponent($('modelSelect').value));const ramUsed=Math.round((1-m.ramFree/m.ramTotal)*100);$('memoryStatus').dataset.state=ramUsed>=90?'risk':m.state;$('memoryStatus').textContent=`RAM ${ramUsed}% · ${(m.ramFree/1024**3).toFixed(1)} GB free · GPU ${m.gpuFree===null?'unknown':(m.gpuFree/1024**3).toFixed(1)+' GB free'}`;$('memoryStatus').title=m.label+'. Capacity estimate; high RAM use does not by itself prove paging.';}catch{$('memoryStatus').dataset.state='unknown';$('memoryStatus').textContent='Memory status unavailable';}finally{memoryRefreshing=false;}}

setInterval(refreshMemory,10000);$('modelSelect').addEventListener('change',refreshMemory);setTimeout(refreshMemory,1500);

async function importDrop(data,{duplicates=false}={}){
  if(data.files.length)return addFiles(data.files,{duplicates});
  const html=new DOMParser().parseFromString(data.getData('text/html'),'text/html');
  const candidates=[data.getData('text/uri-list').split('\n').find(s=>s&&!s.startsWith('#')),data.getData('text/plain'),...Array.from(html.querySelectorAll('img,video,audio')).map(el=>el.getAttribute('src'))];
  const source=candidates.find(s=>{try{const u=new URL(s);return ['localhost','127.0.0.1','[::1]'].includes(u.hostname)&&u.pathname==='/view';}catch{return false;}});
  if(!source)return [];
  let asset=await api('/api/import-comfy',{url:source,projectId:project.id});
  if(project.references.some(r=>r.id===asset.id)){if(!duplicates)return [asset.id];asset={...asset,...await api('/api/duplicate-reference',{id:asset.id})};}
  project.references.push(asset);selected=asset.id;changed();renderReferences();renderDetails();await save();return [asset.id];
}

function insertDialogue(subject=null){
  project.speakers ||= [];let index=project.speakers.findIndex(s=>s.subjectId===(subject?.id||null));
  if(index<0){index=project.speakers.length;project.speakers.push({id:crypto.randomUUID(),subjectId:subject?.id||null,name:subject?.name||'Narrator'});}
  const lang=project.dialogueLanguage&&project.dialogueLanguage!=='Auto'?project.dialogueLanguage:'English';
  insert((subject?'<Subject '+(project.subjects.indexOf(subject)+1)+'> ':'')+'(S'+(index+1)+') <d>['+lang+'] </d>',4);
}
on('addDialogue',()=>insertDialogue());
on('unloadComfy',async()=>{const button=$('unloadComfy');button.disabled=true;button.textContent='Requesting release…';try{await api('/api/unload-comfy',{});toast('Unload requested for idle ComfyUI. Memory readings will update as models are released.');await refreshMemory();setTimeout(refreshMemory,2000);setTimeout(refreshMemory,6000);}finally{button.disabled=false;button.textContent='Unload ComfyUI';}});

let durationRefresh;
function syncDuration(){if(!project)return;if(!durationRefresh){const host=document.createElement('div');document.querySelector('.duration-card').prepend(host);durationRefresh=durationPicker(host,{getValue:()=>project,onChange:v=>{Object.assign(project,v);changed();syncDuration();}});document.querySelector('.duration-card').querySelectorAll(':scope > label,:scope > input,:scope > .dimensions,:scope > p').forEach(e=>e.hidden=true);}durationRefresh();$('durationFrames').value=project.length;$('durationSeconds').value=(project.length/24).toFixed(2);$('length').value=project.length;$('durationActual').textContent=project.length+' frames · '+(project.length/24).toFixed(2)+' seconds at 24 fps';}
for(const key of ['durationFrames','durationSeconds'])on(key,e=>{const requested=Number(e.target.value)*(key==='durationSeconds'?24:1);if(!Number.isFinite(requested))return;project.length=Math.max(5,Math.min(3592,5+17*Math.round((requested-5)/17)));changed();syncDuration();if(project.length!==requested)toast('Adjusted to '+project.length+' frames to fit H3’s temporal grid.');},'change');
$('length').addEventListener('input',e=>{project.length=Number(e.target.value);changed();syncDuration();});
for(const dialog of document.querySelectorAll('dialog')){dialog.addEventListener('close',()=>dialog.querySelectorAll('video,audio').forEach(el=>el.pause()));dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();});for(const b of dialog.querySelectorAll('form[method=dialog] button')){b.textContent='Close';b.classList.remove('icon-button');}}
window.addEventListener('message',e=>{if(e.source!==parent||!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(e.origin))return;if(e.data?.type==='h3-pause'){document.querySelectorAll('video,audio').forEach(el=>el.pause());save().catch(error=>toast(error.message));}if(e.data?.type==='h3-reference'&&project?.references.some(r=>r.id===e.data.id)){selected=e.data.id;renderReferences();renderDetails();}});
async function showOutputBrowser(folder='',sink=null){comfyFolder=folder;const [recent,browse]=await Promise.all([folder?[]:api('/api/recent-results').catch(()=>[]),api('/api/output-browser?folder='+encodeURIComponent(folder)).catch(e=>({items:[],error:e.message}))]);const host=$('resultsList');host.replaceChildren();$('resultsDialog').querySelector('h2').textContent=folder?folder.split('/').at(-1):'Add reference';if(folder){const back=document.createElement('button');back.textContent='← Output folder';back.onclick=()=>showOutputBrowser(folder.split('/').slice(0,-1).join('/'));host.append(back);}const art=(type,url)=>{const media=document.createElement(type==='image'?'img':type==='video'?'video':'span');if(type==='image'||type==='video'){media.src=url;if(type==='video'){media.muted=true;media.preload='metadata';}}else{media.className='audio-art';media.textContent='♫';}return media;};const addFile=(item,isRecent=false)=>{const button=document.createElement('button');button.className='output-file';const url=isRecent?'/api/comfy-preview?url='+encodeURIComponent(item.url):'/api/output-file?path='+encodeURIComponent(item.path);button.append(art(item.type,url));const title=document.createElement('small');title.textContent=item.name;button.append(title);button.onclick=async()=>{try{const asset=await api(isRecent?'/api/import-comfy':'/api/import-output',isRecent?{url:item.url}:{path:item.path});if(sink){sink.asset(asset);$('resultsDialog').close();return;}project.references.push(asset);selected=asset.id;changed();renderReferences();renderDetails();await save();$('resultsDialog').close();}catch(e){toast(e.message);}};host.append(button);};if(recent.length){const heading=document.createElement('h3');heading.textContent='Recent generations';heading.className='output-section';host.append(heading);recent.forEach(item=>addFile(item,true));}if(browse.items.length){const heading=document.createElement('h3');heading.className='output-section';heading.textContent='Output folder';host.append(heading);for(const item of browse.items){if(item.kind==='file'){addFile(item);continue;}const button=document.createElement('button');button.className='home-folder';const stack=document.createElement('span');stack.className='folder-stack';const previews=(item.preview||[]).slice(0,1);for(let i=Math.max(1,previews.length)-1;i>=0;i--){const sheet=document.createElement('span');sheet.className='folder-sheet';sheet.style.setProperty('--sheet',i);if(previews[i])sheet.append(art(previews[i].type,'/api/output-file?path='+encodeURIComponent(previews[i].path)));else sheet.classList.add('folder-sheet--empty');stack.append(sheet);}const name=document.createElement('strong');name.textContent=item.name;button.append(stack,name);button.onclick=()=>showOutputBrowser(item.path,sink);host.append(button);}}$('comfyStatus').textContent=status?.config?.comfyOutputDir?('Using '+status.config.comfyOutputDir):('Auto-detected: '+(browse.root||'not found'));
if(!recent.length&&!browse.items.length){const empty=document.createElement('p');empty.textContent=browse.error||'No media in this folder.';host.append(empty);}if(browse.truncated){const note=document.createElement('p');note.textContent='Showing the first '+browse.limit+' items. Open a folder to narrow the list.';host.append(note);}if(!$('resultsDialog').open)$('resultsDialog').showModal();}
on('recentFiles',()=>{$('resultsDialog').close();$('fileInput').click();});

// ComfyUI output folder override for machines with more than one install.
let comfyFolder='';
function drawComfyPanel(){const current=status?.config?.comfyOutputDir||'';$('comfyPath').value=current;$('comfyStatus').textContent=current?'Using '+current:'Auto-detecting from ComfyUI.';}
async function saveComfyFolder(value){const next={...status.config,comfyOutputDir:value};await api('/api/settings',next);status=await api('/api/status');drawComfyPanel();toast(value?'ComfyUI output folder saved.':'ComfyUI output folder set back to automatic.');await showOutputBrowser(comfyFolder);}
on('comfyMenu',()=>{const panel=$('comfyPanel');panel.hidden=!panel.hidden;$('comfyMenu').setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden)drawComfyPanel();});
on('comfySave',()=>saveComfyFolder($('comfyPath').value.trim()));
on('comfyClear',()=>saveComfyFolder(''));

async function openVideoEditor(reference){
  const audioMode=reference.type==='audio';if(!reference.fps)reference.fps=(await api('/api/media-info/'+reference.id)).fps;
  const sources=new Map([[reference.id,reference]]);let activeSource=reference,selectedCut=0,trim,sequence;const dialog=$('videoEditor'),video=$('cutPreview');video.src='/api/asset/'+reference.id;video.classList.toggle('audio-mode',audioMode);dialog.classList.toggle('audio-editor',audioMode);dialog.querySelector('h2').textContent=audioMode?'Audio studio':'Video studio';$('videoAddSource').textContent=audioMode?'＋ Add audio':'＋ Add video';$('videoSourceFile').accept=audioMode?'audio/*':'video/*';$('cutOutput').disabled=audioMode;let cuts=[{sourceId:reference.id,start:reference.trimStart||0,end:reference.trimEnd||Math.min(reference.duration,15),initial:true}];
  $('filmstrip').src='/api/video-strip/'+reference.id;$('waveform').hidden=audioMode||!reference.hasAudio;if(reference.hasAudio)$('waveform').src='/api/video-strip/'+reference.id+'?waveform';for(const k of ['inHandle','outHandle']){$(k).max=reference.duration;$(k).step=1/reference.fps;} $('inHandle').value=cuts[0].start;$('outHandle').value=cuts[0].end; $('inHandle').oninput=e=>{$('cutStart').value=(+e.target.value).toFixed(2);video.currentTime=+e.target.value;};$('outHandle').oninput=e=>{$('cutEnd').value=(+e.target.value).toFixed(2);video.currentTime=+e.target.value;};$('frameBack').onclick=()=>{video.pause();video.currentTime=Math.max(0,video.currentTime-1/(activeSource.fps||24));};$('frameForward').onclick=()=>{video.pause();video.currentTime=Math.min(activeSource.duration,video.currentTime+1/(activeSource.fps||24));};
  $('cutTiming').value='keep';$('cutOutput').value=audioMode?'audio':'video';$('cutStart').value=cuts[0].start;$('cutEnd').value=cuts[0].end;$('cutHeight').value=audioMode?0:reference.height;$('cutHeight').closest('label').hidden=audioMode;$('cutAudio').checked=reference.withAudio;$('cutAudio').disabled=!reference.hasAudio;
  document.querySelector('#resolutionChoices')?.remove();const resolution=document.createElement('select');resolution.id='resolutionChoices';resolution.setAttribute('aria-label','Video output resolution');for(const factor of [1,2,3,4]){const height=Math.max(64,2*Math.floor(reference.height/factor/2));if(height>reference.height)continue;resolution.add(new Option((factor===1?'Original':'1/'+factor+' resolution')+' · '+Math.round(reference.width*height/reference.height)+' × '+height,String(height)));}resolution.onchange=()=>$('cutHeight').value=resolution.value;$('cutHeight').hidden=true;$('cutHeight').before(resolution);resolution.hidden=audioMode;
  const render=()=>{$('cutList').innerHTML=cuts.map((c,i)=>'<div draggable="true" data-clip="'+i+'" class="row cut-row '+(i===selectedCut?'selected':'')+'"><button data-edit-cut="'+i+'" aria-label="Edit segment '+(i+1)+'">'+(i===selectedCut?'Editing':'Edit')+'</button><img style="width:70px;height:44px;object-fit:cover;border-radius:6px" src="/api/asset/'+(c.sourceId||reference.id)+'?thumb" alt=""><span>'+esc(sources.get(c.sourceId||reference.id)?.name||'Video')+'</span><input aria-label="Segment start" data-cut-start="'+i+'" type="number" min="0" step="0.01" value="'+Number(c.start.toFixed(3))+'" style="width:70px"><input aria-label="Segment end" data-cut-end="'+i+'" type="number" step="0.01" value="'+Number(c.end.toFixed(3))+'" style="width:70px"><button data-up="'+i+'" aria-label="Move segment earlier">↑</button><button data-remove="'+i+'" aria-label="Remove segment">Remove</button></div>').join('');$('cutTotal').textContent=cuts.reduce((n,c)=>n+c.end-c.start,0).toFixed(2)+' seconds kept · original stays unchanged';for(const [selector,key] of [['data-cut-start','start'],['data-cut-end','end']])$('cutList').querySelectorAll('['+selector+']').forEach(el=>el.onchange=()=>{const i=+el.getAttribute(selector),c=cuts[i],value=+el.value,src=sources.get(c.sourceId);if(!Number.isFinite(value)||value<0||(key==='start'?value>=c.end:value<=c.start||value>src.duration)){toast('Keep the range inside its source, with Out after In.');render();return;}c[key]=value;selectCut(i);});$('cutList').querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{const i=+b.dataset.remove;cuts.splice(i,1);selectedCut=Math.min(selectedCut-(i<selectedCut?1:0),cuts.length-1);if(cuts.length)selectCut(Math.max(0,selectedCut));else{selectedCut=-1;render();}});$('cutList').querySelectorAll('[data-up]').forEach(b=>b.onclick=()=>{const i=+b.dataset.up;if(i>0){[cuts[i-1],cuts[i]]=[cuts[i],cuts[i-1]];if(selectedCut===i)selectedCut--;else if(selectedCut===i-1)selectedCut++;}render();});;$('cutList').querySelectorAll('[data-clip]').forEach(el=>{el.ondragstart=e=>e.dataTransfer.setData('application/x-clip',el.dataset.clip);el.ondragover=e=>e.preventDefault();el.ondrop=e=>{e.preventDefault();const raw=e.dataTransfer.getData('application/x-clip');if(raw==='')return;const selected=cuts[selectedCut],from=+raw,to=+el.dataset.clip;cuts.splice(to,0,cuts.splice(from,1)[0]);selectedCut=cuts.indexOf(selected);render();};});$('cutList').querySelectorAll('[data-edit-cut]').forEach(b=>b.onclick=()=>selectCut(+b.dataset.editCut));trim?.draw();sequence?.draw();};
  function readRange(){return {start:+$('cutStart').value,end:+$('cutEnd').value};}
  function writeRange(c){$('cutStart').value=Number(c.start.toFixed(3));$('cutEnd').value=Number(c.end.toFixed(3));$('inHandle').value=c.start;$('outHandle').value=c.end;if(cuts[selectedCut])Object.assign(cuts[selectedCut],c,{initial:false});render();}
  function selectCut(i){video.pause();video.ontimeupdate=null;selectedCut=i;const c=cuts[i];if(!c)return;activeSource=sources.get(c.sourceId);const src='/api/asset/'+activeSource.id;if(!video.src.endsWith(src))video.src=src;$('filmstrip').src='/api/video-strip/'+activeSource.id;$('waveform').hidden=audioMode||!activeSource.hasAudio;if(activeSource.hasAudio)$('waveform').src='/api/video-strip/'+activeSource.id+'?waveform';for(const k of ['inHandle','outHandle','videoSeek']){$(k).max=activeSource.duration;$(k).step=1/(activeSource.fps||24);}$('cutStart').value=Number(c.start.toFixed(3));$('cutEnd').value=Number(c.end.toFixed(3));$('inHandle').value=c.start;$('outHandle').value=c.end;video.currentTime=c.start;render();}
  trim=visualTrim({video,source:()=>activeSource,read:readRange,write:writeRange,seek:t=>{video.currentTime=t;}});
  sequence=sequenceTimeline($('cutList'),{getCuts:()=>cuts,getSelected:()=>selectedCut,select:selectCut,reorder:(from,to)=>{const current=cuts[selectedCut];cuts.splice(to,0,cuts.splice(from,1)[0]);selectedCut=cuts.indexOf(current);render();},seek:t=>{video.currentTime=t;},video,sources});
  const changeRange=(key,value)=>{const c=readRange(),step=1/(activeSource.fps||24);if(!Number.isFinite(value))return;value=key==='start'?Math.max(0,Math.min(c.end-step,value)):Math.min(activeSource.duration,Math.max(c.start+step,value));writeRange({...c,[key]:value});video.currentTime=value;};
  $('markStart').onclick=()=>changeRange('start',video.currentTime);$('markEnd').onclick=()=>changeRange('end',video.currentTime);
  for(const [id,key] of [['inHandle','start'],['outHandle','end']])$(id).oninput=e=>changeRange(key,+e.target.value);
  for(const [id,key] of [['cutStart','start'],['cutEnd','end']])$(id).onchange=e=>changeRange(key,+e.target.value);
  $('addCut').textContent='Add another range';$('addCut').onclick=()=>{cuts.push({sourceId:activeSource.id,start:0,end:activeSource.duration});selectCut(cuts.length-1);};
  $('videoSeek').max=reference.duration;$('videoSeek').value=0;$('videoPlay').onclick=()=>video.paused?video.play():video.pause();video.onplay=()=>$('videoPlay').textContent='Ⅱ';video.onpause=()=>$('videoPlay').textContent='▶';$('videoSeek').oninput=e=>video.currentTime=+e.target.value;video.addEventListener('timeupdate',()=>{$('videoSeek').value=video.currentTime;$('videoClock').textContent=video.currentTime.toFixed(2)+' s';trim.draw();sequence?.update();},{signal:(dialog._mediaAbort?.abort(),dialog._mediaAbort=new AbortController()).signal});
  let clipTools=$('clipTools');if(!clipTools){clipTools=document.createElement('div');clipTools.id='clipTools';clipTools.className='clip-tools';$('cutList').before(clipTools);}
  const fileButton=$('videoAddSource'),clipButton=$('addCut'),existingButton=document.createElement('button');existingButton.id='videoExistingSource';existingButton.textContent='Use existing reference…';
  clipButton.textContent='＋ Add clip from current '+(audioMode?'audio':'video');fileButton.textContent=audioMode?'＋ Add audio files':'＋ Add video files';
  clipTools.replaceChildren(fileButton,existingButton,clipButton);
  const appendSource=async asset=>{if(asset.type!==reference.type)throw Error('Choose '+reference.type+' to match this sequence.');if(!asset.fps)asset={...asset,fps:(await api('/api/media-info/'+asset.id)).fps};sources.set(asset.id,asset);cuts.push({sourceId:asset.id,start:0,end:asset.duration});if(asset.hasAudio)$('cutAudio').disabled=false;selectCut(cuts.length-1);};
  const importClips=async files=>{fileButton.disabled=true;try{for(const file of files){const response=await fetch('/api/assets?name='+encodeURIComponent(file.name),{method:'POST',headers:{'X-H3-Token':status.csrf},body:file}),asset=await response.json();if(!response.ok)throw Error(asset.error);await appendSource(asset);}}finally{fileButton.disabled=false;}};
  existingButton.onclick=e=>{const available=[...new Map([...project.references,...sources.values()].filter(r=>r.type===reference.type).map(r=>[r.id,r])).values()];contextMenu(e,available.map(asset=>({label:asset.name,run:()=>appendSource(asset)})),e=>toast(e.message));};
  $('videoSourceFile').multiple=true;fileButton.onclick=()=>$('videoSourceFile').click();$('videoSourceFile').onchange=async e=>{try{await importClips([...e.target.files]);}catch(e){toast(e.message);}finally{e.target.value='';}};
  dialog.ondragover=e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();e.stopPropagation();}};
  dialog.ondrop=e=>{if(!e.dataTransfer.files.length)return;e.preventDefault();e.stopPropagation();importClips([...e.dataTransfer.files]).catch(e=>toast(e.message));};
  $('previewCuts').onclick=()=>{if(!cuts.length)return;let index=0;const play=()=>{selectedCut=index;const cut=cuts[index],src='/api/asset/'+(cut.sourceId||reference.id);activeSource=sources.get(cut.sourceId||reference.id);if(!video.src.endsWith(src)){video.src=src;$('filmstrip').src='/api/video-strip/'+activeSource.id;for(const k of ['inHandle','outHandle']){$(k).max=activeSource.duration;$(k).step=1/(activeSource.fps||24);}}$('cutStart').value=cut.start;$('cutEnd').value=cut.end;$('waveform').hidden=audioMode||!activeSource.hasAudio;if(activeSource.hasAudio)$('waveform').src='/api/video-strip/'+activeSource.id+'?waveform';render();video.currentTime=cut.start;$('videoSeek').max=sources.get(cut.sourceId||reference.id).duration;video.play();};play();video.ontimeupdate=()=>{if(video.currentTime>=cuts[index].end){index++;if(index>=cuts.length){video.pause();video.ontimeupdate=null;}else play();}};};
  $('createVideoReference').onclick=async()=>{const button=$('createVideoReference'),projectId=project.id;button.disabled=true;button.textContent='Preparing video…';try{await save();const asset=await api('/api/prepare-video',{id:reference.id,cuts,output:$('cutOutput').value,targetDuration:$('cutTiming').value==='retime'?project.length/24:undefined,height:audioMode?undefined:+$('cutHeight').value,audio:$('cutAudio').checked,description:reference.description});if(project.id!==projectId)throw new Error('Project changed; the prepared asset was retained locally.');const index=project.references.findIndex(r=>r.id===reference.id);if(index<0)throw new Error('Original reference was removed.');if(asset.type==='audio'&&!audioMode){project.references.push(asset);}else{project=changeReferences(project,project.references.map((r,i)=>i===index?{...asset,id:r.id}:r));project.references[index]=asset;for(const s of project.subjects){if(s.sourceId===reference.id)s.sourceId=asset.id;if(s.inspectionReferenceId===reference.id)s.inspectionReferenceId=asset.id;for(const source of s.sources||[])if(source.sourceId===reference.id)source.sourceId=asset.id;}project.directorLinks=(project.directorLinks||[]).map(id=>id===reference.id?asset.id:id);for(const m of project.directorMessages||[]){m.referenceIds=(m.referenceIds||[]).map(id=>id===reference.id?asset.id:id);m.observations=(m.observations||[]).filter(o=>o.referenceId!==reference.id);}}if($('cutTiming').value==='match'){project.length=Math.max(5,Math.min(3592,5+17*Math.round((asset.duration*24-5)/17)));syncDuration();}selected=asset.id;$('prompt').value=project.prompt;changed();renderReferences();renderSubjects();renderDetails();await save();dialog.close();toast('Prepared reference added. Original media remains in history.');}catch(e){toast(e.message);}finally{button.disabled=false;button.textContent='Create reference';}};
  dialog.onclose=()=>{sequence?.destroy();dialog._mediaAbort?.abort();video.pause();video.ontimeupdate=null;video.removeAttribute('src');video.load();};render();dialog.showModal();
}

on('exportButton',()=>{$('exportFolder').value=localStorage.getItem('h3-export-folder')||'';$('exportSize').textContent='Current references: approximately '+(project.references.reduce((sum,r)=>sum+(r.bytes||0),0)/1024**2).toFixed(1)+' MB. History and original sources can increase this.';$('exportDialog').showModal();});
on('saveExport',async()=>{const media=$('exportMedia').checked,folder=$('exportFolder').value.trim();localStorage.setItem('h3-export-folder',folder);let handle;if(!folder&&window.showSaveFilePicker){try{handle=await window.showSaveFilePicker({id:'h3-scene-export',suggestedName:(project.title||'Scene').replace(/[<>:"/\\|?*]/g,'_')+(media?'.h3.zip':'.h3.json')});}catch(e){if(e.name==='AbortError')return;if(e.name!=='SecurityError')throw e;}}
  const button=$('saveExport');button.disabled=true;button.textContent='Preparing export…';try{await save();const result=await api('/api/export',{project,media,folder,history:$('exportHistory').checked,sources:$('exportSources').checked});if(result.savedPath){toast('Export saved to '+result.savedPath);}else if(handle){const writer=await handle.createWritable();if(media){const response=await fetch(result.download);if(!response.ok){await writer.abort();throw new Error('Export download failed.');}await response.body.pipeTo(writer);}else{await writer.write(JSON.stringify(result,null,2));await writer.close();}}else{const a=document.createElement('a');a.download='scene'+(media?'.h3.zip':'.h3.json');a.href=media?result.download:URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));a.click();if(!media)setTimeout(()=>URL.revokeObjectURL(a.href),10000);toast('Export sent to browser downloads. Enable “Ask where to save” to choose its folder.');}$('exportDialog').close();}finally{button.disabled=false;button.textContent='Save as…';}});
on('importPackage',()=>$('packageInput').click());on('packageInput',async e=>{const file=e.target.files[0];if(!file)return;await save();if(file.name.toLowerCase().endsWith('.json')){const result=await api('/api/import-metadata',JSON.parse(await file.text()));await listProjects();await loadProject(result.id);e.target.value='';toast('Metadata imported using the available local media.');return;}const response=await fetch('/api/import-package',{method:'POST',headers:{'X-H3-Token':status.csrf},body:file});const result=await response.json();if(!response.ok)throw new Error(result.error);await listProjects();await loadProject(result.id);e.target.value='';toast('Portable scene imported with its reference files.');},'change');

on('recentFiles',()=>{$('resultsDialog').close();$('fileInput').click();});



const selectedProjects=new Set();
let dashboardPrefs={revision:0,homeFolders:[]};
let dashboardHome=true;let dashboardItems=[],dashboardTemplates=false,dashboardTrashMode=false,managedProject=null,projectClipboard=[];
async function showDashboard(templates=false,trash=false){
  selectedProjects.clear();dashboardTemplates=templates;dashboardTrashMode=trash;
  refreshStorageSettings();
  // Paint the gallery first, then load its data once: listing every snapshot made this feel slow.
  if(shell)await shell.showGallery();else if(!$('projectDialog').open)$('projectDialog').showModal();
  await save().catch(error=>toast(error.message));
  const [items,prefs]=await Promise.all([api(trash?'/api/trash':'/api/projects'),api('/api/dashboard')]);dashboardItems=items;dashboardPrefs=prefs;await shell?.refreshProjects(items);
  $('dashboardNew').hidden=trash;$('showTemplates').hidden=true;
  const folders=[...new Set([...(dashboardPrefs.folders||[]),...dashboardPrefs.homeFolders,...dashboardItems.map(p=>p.folder).filter(Boolean)])].sort(),selected=$('projectFolder').value;
  $('projectFolder').innerHTML='<option value="">All folders</option>'+folders.map(f=>'<option>'+esc(f)+'</option>').join('');$('projectFolder').value=selected;
  $('knownFolders').innerHTML=folders.map(f=>'<option>'+esc(f)+'</option>').join('');renderDashboard();


}
async function saveHomeFolders(folders){dashboardPrefs=await api('/api/dashboard',{...dashboardPrefs,homeFolders:folders});renderDashboard();}
function renderDashboard(){
  const q=$('projectSearch').value.toLowerCase(),folder=$('projectFolder').value,home=dashboardHome&&!folder&&!dashboardTemplates&&!dashboardTrashMode;
  $('homeIntro').hidden=true;$('homeFolders').hidden=dashboardTemplates;if(dashboardTrashMode)$('homeFolders').replaceChildren();$('projectFolder').hidden=true;$('projectSearch').hidden=false;document.querySelector('.storage-settings').hidden=false;
  $('projectDialog').querySelector('h2').textContent=dashboardTrashMode?'Trash':home?'Home':folder||'Your scenes';
  document.querySelectorAll('[data-project-view]').forEach(b=>b.setAttribute('aria-pressed',String((b.dataset.projectView==='home')===dashboardHome)));
  const items=dashboardItems.filter(p=>(!home||p.showOnHome)&&(dashboardTrashMode||!!p.isTemplate===dashboardTemplates)&&(home?p.title.toLowerCase().includes(q):(folder?p.folder===folder:dashboardTemplates||dashboardTrashMode||q||!p.folder)&&p.title.toLowerCase().includes(q))).sort((a,b)=>($('galleryOrder')?.dataset.direction==='asc'?-1:1)*($('gallerySort')?.value==='name'?a.title.localeCompare(b.title):String(b[$('gallerySort')?.value==='created'?'created':'updated']||'').localeCompare(String(a[$('gallerySort')?.value==='created'?'created':'updated']||''))));
  $('trashSelected').hidden=true;$('trashSelected').textContent='Move '+selectedProjects.size+' to Trash';$('showTemplates').hidden=true;renderProjectPath(folder);
  $('projectDialog').querySelector('form').hidden=true;$('projectCards').innerHTML=(dashboardTemplates?'<button class="starter" data-starter=""><strong>Blank scene</strong><small>Start with your own idea</small></button>'+starterTemplates.filter(t=>t.title.toLowerCase().includes(q)).map(t=>'<button class="starter" data-starter="'+t.key+'"><span class="starter-art">✧</span><strong>'+esc(t.title)+'</strong><small>'+esc(t.subtitle)+'</small></button>').join(''):'')+items.map(p=>'<article class="project-card '+(selectedProjects.has(p.id)?'project-selected':'')+'"><button draggable="'+!dashboardTrashMode+'" class="project-open" data-open="'+p.id+'">'+(p.coverAssetId?'<img src="/api/asset/'+p.coverAssetId+'?thumb" alt="" loading="lazy">':'<div class="project-placeholder">h3</div>')+'<strong>'+esc(p.title)+'</strong><div class="project-labels">'+(p.projectLabels||[]).map(l=>'<span data-label-id="'+esc(l.id)+'" class="scene-label" style="--label-color:'+safeLabelColor(l.color)+'">'+esc(labelText(l,p,dashboardItems))+'</span>').join('')+'</div><small>'+esc(p.folder||'Unfiled')+' · '+(p.sendVersion?'Send '+p.sendVersion:'Not sent')+' · '+(p.updated?new Date(p.updated).toLocaleDateString():'')+'</small></button><button class="project-more" data-manage="'+p.id+'" aria-label="Manage '+esc(p.title)+'">•••</button></article>').join('');
  for(const b of $('projectCards').querySelectorAll('[data-open]')){
    b.onclick=async e=>{try{if(e.ctrlKey||e.metaKey){selectedProjects.has(b.dataset.open)?selectedProjects.delete(b.dataset.open):selectedProjects.add(b.dataset.open);renderDashboard();return;}if(dashboardTrashMode){selectedProjects.clear();selectedProjects.add(b.dataset.open);renderDashboard();return;}if(dashboardTemplates)await createScene({sourceId:b.dataset.open,fromTemplate:true});else{await loadProject(b.dataset.open);$('projectDialog').close();}}catch(e){toast(e.message);}};
    b.oncontextmenu=e=>{if(!selectedProjects.has(b.dataset.open)){selectedProjects.clear();selectedProjects.add(b.dataset.open);}renderDashboard();dashboardContext(e);};
    b.ondragstart=e=>{e.stopPropagation();e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('application/x-h3-projects',JSON.stringify(selectedProjects.has(b.dataset.open)?[...selectedProjects]:[b.dataset.open]));};
  }
  $('projectCards').querySelectorAll('[data-label-id]').forEach(el=>el.oncontextmenu=async e=>{e.preventDefault();e.stopPropagation();const item=await api('/api/project/'+el.closest('[data-open]').dataset.open);editProjectLabel(item,item.projectLabels.find(l=>l.id===el.dataset.labelId));});
  for(const b of $('projectCards').querySelectorAll('[data-starter]'))b.onclick=()=>createScene(b.dataset.starter?{template:b.dataset.starter}:{}).catch(e=>toast(e.message));
  for(const b of $('projectCards').querySelectorAll('[data-manage]')){b.hidden=dashboardTrashMode;b.onclick=()=>manageProject(b.dataset.manage).catch(e=>toast(e.message));}
  if(dashboardTrashMode){for(const name of dashboardPrefs.trashFolders||[]){const b=document.createElement('button');b.className='home-folder';b.textContent='▱ '+name+' · Restore folder';b.onclick=async()=>{for(const item of dashboardItems.filter(p=>p.folder===name))await api('/api/trash/'+item.id,{restore:true});dashboardPrefs.trashFolders=dashboardPrefs.trashFolders.filter(f=>f!==name);await saveHomeFolders([...dashboardPrefs.homeFolders,name]);await showDashboard(false,true);};$('homeFolders').append(b);}}
  if(!dashboardTemplates&&!dashboardTrashMode)homeFoldersView($('homeFolders'),{addHost:$('galleryAddFolder'),folders:folderChildren(home?dashboardPrefs.homeFolders:[...new Set([...(dashboardPrefs.folders||[]),...dashboardPrefs.homeFolders,...dashboardItems.map(p=>p.folder).filter(Boolean)])],folder).filter(f=>f.toLowerCase().includes(q)),parent:folder,onPin:!home?name=>saveHomeFolders([...new Set([...dashboardPrefs.homeFolders,name])]):null,canUnpin:home&&!folder,onTrash:trashFolder,onUnpin:name=>saveHomeFolders(dashboardPrefs.homeFolders.filter(f=>f!==name)),projects:dashboardItems,folderCovers:dashboardPrefs.folderCovers||{},onChange:folders=>saveHomeFolders([...new Set([...dashboardPrefs.homeFolders,...folders])]),onOpen:name=>{if(![...$('projectFolder').options].some(o=>o.value===name))$('projectFolder').add(new Option(name,name));$('projectFolder').value=name;renderDashboard();},onRename:name=>renameFolder(name),onMove:async(ids,name)=>{for(const id of ids){if(!dashboardItems.some(p=>p.id===id))continue;const item=await api('/api/project/'+id);await api('/api/project/'+id,{...item,folder:name});if(project.id===id)await loadProject(id);}await showDashboard();},onError:e=>toast(e.message)});else $('galleryAddFolder')?.replaceChildren();
}
async function createScene(options,{navigate=true}={}){if(aiBusy||snapshotSending)throw Error('Wait for the current request before creating a scene.');await save();
  const folder=options.folder??(!dashboardTrashMode?$('projectFolder').value:'');
  const p=await api('/api/projects',{...options,...(folder?{folder}:{})});await listProjects();await loadProject(p.id,{navigate});if(navigate)$('projectDialog').close();return project;
}
async function manageProject(key){managedProject=await api('/api/project/'+key);$('manageTitle').value=managedProject.title;$('manageFolder').value=managedProject.folder||'';$('manageCover').innerHTML='<option value="">Automatic · first reference</option>'+[...new Set([managedProject.coverAssetId,...managedProject.references.map(r=>r.id)].filter(Boolean))].map(id=>'<option value="'+id+'">'+esc(managedProject.references.find(r=>r.id===id)?.name||'Custom cover')+'</option>').join('');$('manageCover').value=managedProject.coverAssetId||'';$('projectActions').showModal();}
on('projectDashboard',()=>{dashboardHome=true;$('projectSearch').value='';$('projectFolder').value='';showDashboard();});on('dashboardNew',()=>createScene({}));on('showTemplates',()=>{dashboardTemplates=!dashboardTemplates;renderDashboard();});on('projectSearch',renderDashboard,'input');on('projectFolder',renderDashboard,'change');on('dashboardTrash',openTrash);
on('saveProjectDetails',async()=>{Object.assign(managedProject,{title:$('manageTitle').value.trim()||'Untitled scene',manualTitle:true,folder:$('manageFolder').value.trim(),coverAssetId:$('manageCover').value||null});const saved=await api('/api/project/'+managedProject.id,managedProject);$('projectActions').close();if(project.id===saved.id)await loadProject(saved.id);await listProjects();await showDashboard(dashboardTemplates);});
for(const [button,asTemplate] of [['duplicateProject',false],['saveAsTemplate',true]])on(button,async()=>{await api('/api/projects',{sourceId:managedProject.id,asTemplate});$('projectActions').close();await listProjects();await showDashboard(asTemplate);});
on('trashManagedProject',async()=>{const p=managedProject;await api('/api/trash/'+p.id,{revision:p.revision});$('projectActions').close();if(project.id===p.id){await listProjects();const first=$('projectSelect').options[0]?.value;if(first)await loadProject(first);else await createScene({});}await showDashboard(dashboardTemplates);toast('Moved to Trash. Restore it from the dashboard Trash menu.');});
on('uploadCover',()=>$('coverFile').click());on('coverFile',async e=>{const file=e.target.files[0];if(!file)return;const res=await fetch('/api/assets?name='+encodeURIComponent(file.name),{method:'POST',headers:{'X-H3-Token':status.csrf},body:file}),asset=await res.json();if(!res.ok)throw Error(asset.error);if(asset.type!=='image')throw Error('Choose an image cover.');const option=new Option(file.name,asset.id);$('manageCover').add(option);$('manageCover').value=asset.id;e.target.value='';},'change');

function syncSubjectDefinition(s){if(s.manualDescription)return;const labels=referenceMap(project.references),sources=subjectSources(s).filter(source=>labels[source.sourceId]&&!source.roleCleared);s.sourceId=sources[0]?.sourceId||null;const label='<Subject '+(project.subjects.indexOf(s)+1)+'>';if(!sources.length){setDefinition(label,'');s.description='';s.generatedDefinition='';renderDraft();return;}s.description=s.name+' from '+sources.map(source=>labels[source.sourceId]+(source.label?'; use for '+source.label.toLowerCase():'')).join(' and ');const text=label+' is '+s.description+'.';if(project.prompt.includes(label))setDefinition(label,text);s.generatedDefinition=text;renderDraft();}

on('moveStorage',async()=>{await save();const button=$('moveStorage');button.disabled=true;button.textContent='Copying…';try{const result=await api('/api/storage',{folder:$('storageFolder').value.trim()});status=await api('/api/status');await loadProject(project.id);await showDashboard(dashboardTemplates);toast('Storage copied. Original preserved at '+result.originalPreserved);}finally{button.disabled=false;button.textContent='Copy and use folder';}});

on('trashSelected',async()=>{const removed=[],failed=[];for(const key of selectedProjects){try{const current=await api('/api/project/'+key);await api('/api/trash/'+key,{revision:current.revision});removed.push(key);}catch(e){failed.push(e.message);}}await listProjects();if(removed.includes(project.id)){const first=$('projectSelect').options[0]?.value;if(first)await loadProject(first);else await createScene({});}await showDashboard(dashboardTemplates);toast(removed.length+' moved to Trash. Restore them from Trash.'+(failed.length?' '+failed.join(' '):''));});

function fitWriting(el){if(el.id==='prompt'||el.id==='suggestion'&&el.hidden)return;el.style.height='auto';el.style.height=Math.min(600,Math.max(60,el.scrollHeight+2))+'px';}document.addEventListener('input',e=>{if(e.target.tagName==='TEXTAREA')fitWriting(e.target);});new MutationObserver(()=>document.querySelectorAll('textarea:not(#prompt)').forEach(fitWriting)).observe(document.body,{childList:true,subtree:true});


async function refreshAfterRename(){
  [dashboardItems,dashboardPrefs]=await Promise.all([api('/api/projects'),api('/api/dashboard')]);
  await listProjects();
  if(shell)await shell.refreshProjects(dashboardItems);
  if($('projectDialog').open)renderDashboard();
}
async function renameProject(key,current=''){
  const item=dashboardItems.find(p=>p.id===key),title=await askDialog({title:'Rename scene',message:'Scene name',value:current||item?.title||'',confirm:'Rename'});
  if(title===null)return;
  const next=title.trim();
  if(!next||next===current)return;
  const document=await api('/api/project/'+key);
  document.title=next;document.manualTitle=true;
  const saved=await api('/api/project/'+key,document);
  if(key===project?.id){
    // The server bumped the revision, so keep the open editor in step instead of saving a stale copy.
    Object.assign(project,{title:next,manualTitle:true,revision:saved.revision,updated:saved.updated});
    $('projectTitle').value=next;$('projectDashboard').textContent=next;$('saveStatus').textContent='Saved locally';
    persistedSerial=editSerial;notifyCanvas();
  }
  await refreshAfterRename();
  toast('Scene renamed to "'+next+'".');
}
async function renameFolder(oldName){
  const name=await askDialog({title:'Rename folder',message:'Folder name. Leave empty to move its scenes to Unfiled.',value:oldName,confirm:'Rename'});
  if(name===null)return;
  const next=name.trim();
  if(next===oldName.trim())return;
  const result=await api('/api/folder/rename',{from:oldName,to:next});
  try{
    const stored=localStorage.getItem('onigiri-order-projects::'+oldName);
    if(stored!==null){localStorage.setItem('onigiri-order-projects::'+next,stored);localStorage.removeItem('onigiri-order-projects::'+oldName);}
    const folderOrder=JSON.parse(localStorage.getItem('onigiri-order-folders')||'[]');
    if(folderOrder.includes(oldName))localStorage.setItem('onigiri-order-folders',JSON.stringify(folderOrder.map(folder=>folder===oldName?next:folder)));
    const colors=JSON.parse(localStorage.getItem('onigiri-folder-colors')||'{}');
    if(colors[oldName]!==undefined){colors[next]=colors[oldName];delete colors[oldName];localStorage.setItem('onigiri-folder-colors',JSON.stringify(colors));}
  }catch{}
  if($('projectFolder').value===oldName)$('projectFolder').value=next;
  // Keep a pending editor save from writing the old folder name back, then reload the renamed scene.
  if(project){project.folder=next;await loadProject(project.id,{navigate:false});}
  await refreshAfterRename();
  toast(result.changed+' scene'+(result.changed===1?'':'s')+' renamed with "'+(next||'Unfiled')+'".');
}
async function projectBatch(action){await save();const keys=[...selectedProjects];let folder;if(action==='folder'){folder=await askDialog({title:'Move to folder',message:'Leave empty for Unfiled.',value:'',confirm:'Move'});if(folder===null)return;}
if(action==='permanent'&&!await askDialog({title:'Delete '+keys.length+' project(s) permanently?',message:'These projects will leave Trash and cannot be restored here. Shared media and immutable output snapshots are retained.',confirm:'Delete permanently',danger:true}))return;
if(action==='copy'){projectClipboard=keys;toast(keys.length+' project(s) copied. Right-click a scene to paste copies.');return;}
const targets=action==='paste'?projectClipboard:keys,errors=[];
for(const key of targets){try{if(action==='restore'){await api('/api/trash/'+key,{restore:true});continue;}if(action==='permanent'){const item=dashboardItems.find(x=>x.id===key);await api('/api/trash/'+key,{permanent:true,confirm:key,revision:item.revision});continue;}const p=await api('/api/project/'+key);if(action==='showHome'||action==='hideHome')await api('/api/project/'+key,{...p,showOnHome:action==='showHome'});if(action==='folder')await api('/api/project/'+key,{...p,folder:folder.trim()});if(action==='duplicate'||action==='paste')await api('/api/projects',{sourceId:key});if(action==='trash')await api('/api/trash/'+key,{revision:p.revision});}catch(e){errors.push(e.message);}}
await listProjects();if(action==='trash'&&targets.includes(project.id)){const first=$('projectSelect').options[0]?.value;if(first)await loadProject(first);else await createScene({});}else if(['folder','showHome','hideHome'].includes(action)&&targets.includes(project.id))await loadProject(project.id);await showDashboard(dashboardTemplates,dashboardTrashMode);if(errors.length)toast(errors.join(' '));}
function safeLabelColor(color){return labelColors.includes(color)?color:labelColors[0];}
async function editProjectLabel(item,label){const catalog=await api('/api/projects');projectLabelDialog(item,catalog,{label,onSave:async value=>{item.projectLabels=[...(item.projectLabels||[]).filter(l=>l.id!==value.id),value];await api('/api/project/'+item.id,item);if(project.id===item.id)await loadProject(item.id);if($('projectDialog').open)await showDashboard();},onRemove:async()=>{item.projectLabels=(item.projectLabels||[]).filter(l=>l.id!==label.id);await api('/api/project/'+item.id,item);if(project.id===item.id)await loadProject(item.id);if($('projectDialog').open)await showDashboard();}});}
function renderProjectPath(folder){const nav=document.querySelector('.project-views'),trash=$('dashboardTrash');nav.replaceChildren();for(const [origin,title] of [['home','Home'],['all','All Projects']]){const button=document.createElement('button');button.textContent=title;button.setAttribute('aria-pressed',String(dashboardHome===(origin==='home')));button.onclick=()=>{dashboardHome=origin==='home';$('projectFolder').value='';$('projectSearch').value='';showDashboard();};nav.append(button);if(dashboardHome===(origin==='home')&&folder){const parts=[folder];parts.forEach((name,i)=>{const line=document.createElement('span');line.textContent='—';const crumb=document.createElement('button');crumb.className='crumb';crumb.textContent=name;crumb.onclick=()=>{const path=parts.slice(0,i+1).join('/');if(![...$('projectFolder').options].some(o=>o.value===path))$('projectFolder').add(new Option(path,path));$('projectFolder').value=path;renderDashboard();};nav.append(line,crumb);});}}if(trash)nav.append(trash);}
async function renderSceneTags(){const key=project.id,catalog=await api('/api/projects');if(project.id!==key)return;const host=document.querySelector('.scene-editor .eyebrow')||document.querySelector('.editor .eyebrow')||$('projectTitle').parentElement.querySelector('.eyebrow');if(host){host.replaceChildren();host.classList.add('folder-tag-row');(project.folder||'').split('/').filter(Boolean).forEach((part,i)=>{const tag=document.createElement('span');tag.className='folder-tag';tag.style.setProperty('--label-color',labelColors[i%labelColors.length]);tag.textContent=part;host.append(tag);});}let labels=document.getElementById('sceneLabels');if(!labels){labels=document.createElement('div');labels.id='sceneLabels';labels.className='project-labels';$('projectTitle').after(labels);}labels.replaceChildren();for(const label of project.projectLabels||[]){const tag=document.createElement('button');tag.className='scene-label';tag.style.setProperty('--label-color',safeLabelColor(label.color));tag.textContent=labelText(label,project,catalog);tag.oncontextmenu=e=>contextMenu(e,[{label:'Edit label',run:()=>editProjectLabel(project,label)},{label:'More',children:[{label:'Remove label',run:async()=>{project.projectLabels=project.projectLabels.filter(l=>l.id!==label.id);changed();await save();renderSceneTags();}}]}],err=>toast(err.message));labels.append(tag);}}
function dashboardContext(e){const only=[...selectedProjects][0],items=dashboardTrashMode?[{label:'Restore',run:()=>projectBatch('restore')},{label:'Delete permanently…',run:()=>projectBatch('permanent')} ]:[...(selectedProjects.size===1?[{label:'Rename scene…',run:()=>renameProject(only,dashboardItems.find(p=>p.id===only)?.title||'')}]:[]),...($('projectFolder').value&&selectedProjects.size===1?[{label:'Set as thumbnail for this folder',run:async()=>{dashboardPrefs.folderCovers={...dashboardPrefs.folderCovers,[$('projectFolder').value]:[...selectedProjects][0]};await saveHomeFolders(dashboardPrefs.homeFolders);}}]:[]),{label:'Show on Home',run:()=>projectBatch('showHome')},...(dashboardHome&&!$('projectFolder').value?[{label:'Remove from Home',run:()=>projectBatch('hideHome')}]:[]),{label:'Move to folder…',run:()=>projectBatch('folder')},{label:'Select all',run:()=>{document.querySelectorAll('#projectCards [data-open]').forEach(b=>selectedProjects.add(b.dataset.open));renderDashboard();}},{label:'Invert selection',run:()=>{document.querySelectorAll('#projectCards [data-open]').forEach(b=>selectedProjects.has(b.dataset.open)?selectedProjects.delete(b.dataset.open):selectedProjects.add(b.dataset.open));renderDashboard();}},{label:'Duplicate',run:()=>projectBatch('duplicate')},{label:'Copy',run:()=>projectBatch('copy')},{label:'Paste'+(projectClipboard.length?' ('+projectClipboard.length+')':''),run:()=>projectBatch('paste')},{label:'More actions',children:[{label:'Move to Trash',run:()=>projectBatch('trash')}]}];contextMenu({clientX:e.clientX,clientY:e.clientY,target:$('projectDialog'),preventDefault:()=>e.preventDefault()},items,err=>toast(err.message));}


function saveReferenceDefinition(reference,text){
 reference.savedDescription=text;
 const linked=project.subjects.filter(s=>s.sourceId===reference.id||(s.sources||[]).some(source=>source.sourceId===reference.id));
 let subject=linked.length===1?linked[0]:project.subjects.find(s=>s.inspectionReferenceId===reference.id);
 if(!subject){subject={id:crypto.randomUUID(),name:reference.roleLabel||reference.name,sourceId:reference.id,inspectionReferenceId:reference.id};project.subjects.push(subject);}
 subject.description=text;subject.manualDescription=true;subject.inspectionReferenceId=reference.id;
 const label='<Subject '+(project.subjects.indexOf(subject)+1)+'>',definition=label+' is '+text.trim()+' Source: '+referenceMap(project.references)[reference.id]+'.';
 const section=/^subject_definitions:[ \t]*\n?([\s\S]*?)(?=^(?:summary|retention_analysis|detailed_description|overall_soundscape|non_diegetic_music):|$(?![\s\S]))/m;
 const match=section.exec(project.prompt);
 if(match){const lines=match[1].trim().split('\n').filter(line=>line.trim()!=='N/A'&&!line.trim().startsWith(label+' '));lines.push(definition);project.prompt=project.prompt.slice(0,match.index)+'subject_definitions:\n'+lines.filter(Boolean).join('\n')+'\n\n'+project.prompt.slice(match.index+match[0].length);}
 else project.prompt='subject_definitions:\n'+definition+'\n\n'+project.prompt;
 subject.generatedDefinition=definition;$('prompt').value=project.prompt;
}
let reopeningScene=false;
async function refreshOpenScene(){
 if(reopeningScene||!project||aiBusy||snapshotSending)return;reopeningScene=true;
 try{await save();const owner=project,current=await api('/api/project/'+owner.id);if(owner===project&&editSerial===persistedSerial&&current.revision!==owner.revision)await loadProject(owner.id);notifyCanvas(true);await refreshMemory();}finally{reopeningScene=false;}
}
function notifyCanvas(ready=false){if(!project||parent===window)return;const canvas={width:project.width,height:project.height,length:project.length,targetMP:project.targetMegapixels,aspectRatio:project.aspectRatio,sizeMode:project.canvasSizeMode},signature=JSON.stringify([project.id,canvas]);if(!ready&&signature===lastCanvasSent)return;lastCanvasSent=signature;parent.postMessage({type:ready?'h3-editor-ready':'h3-editor-canvas',projectId:project.id,canvas},'*');}
window.addEventListener('message',e=>{if(e.source!==parent||!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(e.origin))return;if(e.data?.type==='h3-editor-open'){refreshOpenScene().catch(error=>toast(error.message));return;}if(e.data?.type!=='h3-node-canvas'||e.data.projectId!==project?.id)return;const c=e.data.canvas;if(!c||!['width','height'].every(k=>Number.isInteger(c[k])&&c[k]>=32&&c[k]%32===0)||!Number.isInteger(c.length)||c.length<5||c.length>3592||(c.length-5)%17)return;if(project.width===c.width&&project.height===c.height&&project.length===c.length&&(!Number.isFinite(c.targetMP)||project.targetMegapixels===c.targetMP)&&(!c.aspectRatio||project.aspectRatio===c.aspectRatio))return;const same=project.width===c.width&&project.height===c.height;Object.assign(project,{width:c.width,height:c.height,length:c.length});if(Number.isFinite(c.targetMP)&&c.targetMP>0&&c.aspectRatio){project.targetMegapixels=c.targetMP;project.aspectRatio=c.aspectRatio;project.canvasSizeMode=c.sizeMode||'mp';}else if(!same){project.aspectRatio=c.width+':'+c.height;project.targetMegapixels=c.width*c.height/1e6;}lastCanvasSent=JSON.stringify([project.id,c]);for(const k of ['width','height','length'])$(k).value=project[k];canvas();changed();});



document.querySelectorAll('[data-project-view]').forEach(b=>b.onclick=()=>{dashboardHome=b.dataset.projectView==='home';dashboardTemplates=false;dashboardTrashMode=false;$('projectSearch').value='';$('projectFolder').value='';showDashboard();});


$('projectDialog').append(document.querySelector('.storage-settings'));document.querySelector('.storage-settings').hidden=false;

const dashboardFooter=document.createElement('footer');dashboardFooter.className='dashboard-footer';$('projectDialog').append(dashboardFooter);dashboardFooter.append(document.querySelector('.storage-settings'),$('dashboardTrash'));$('dashboardTrash').textContent='♲';$('dashboardTrash').setAttribute('aria-label','Trash');$('projectDialog').append(dashboardFooter);



async function trashFolder(name){dashboardPrefs.trashFolders=[...new Set([...(dashboardPrefs.trashFolders||[]),name])];const targets=dashboardItems.filter(p=>p.folder===name);for(const p of targets){const current=await api('/api/project/'+p.id);await api('/api/trash/'+p.id,{revision:current.revision});}await saveHomeFolders(dashboardPrefs.homeFolders.filter(f=>f!==name));if(targets.some(p=>p.id===project.id)){await listProjects();const first=$('projectSelect').options[0]?.value;if(first)await loadProject(first);else await createScene({});}await showDashboard();toast('Folder scenes moved to Trash; their folder paths are retained for restore.');}

function setDefinition(label,text){project.prompt=replaceDefinition(project.prompt,label,text);$('prompt').value=project.prompt;}
function openDirector(focus=true){
 const existing=document.querySelector('.director-room');if(existing?.dataset.projectId===project.id&&existing.dataset.referenceSignature===JSON.stringify(project.references.map(r=>[r.id,r.name]))){existing.querySelector('[data-message]').value=project.directorInput||'';existing._refreshLinks?.(project.directorLinks||[]);if(focus)existing.querySelector('[data-message]').focus();return;}existing?.remove();let owner=project;const d=document.createElement('section');d.dataset.projectId=project.id;d.dataset.referenceSignature=JSON.stringify(project.references.map(r=>[r.id,r.name]));d.className='director-room';
 d.innerHTML='<header class="section-heading"><div><h2>Director</h2><small>Your scene, in conversation</small></div><button data-close aria-label="Close Director">×</button></header><div class="director-messages" role="log" aria-label="Director conversation"></div><section class="director-proposal" hidden><label>Arranged intent<textarea data-plan rows="7"></textarea></label><button data-apply>Use in Draft</button></section><div class="director-composer"><div class="director-links"></div><details class="director-attachments"><summary>＋ References & inspection</summary><label>Link reference<select data-reference aria-label="Link reference to Director"></select></label><label class=checkbox><input type=checkbox data-reinspect> Reinspect linked references</label></details><textarea data-message rows="3" aria-label="Message Director" placeholder="Tell me what you want to make…"></textarea><div class="row"><span class="hint">Local model · one pass at a time</span><button data-arrange>Arrange intent</button><button data-send class="primary">Send</button></div></div><div data-status role="status"></div><button data-retry hidden>Retry reply</button><button data-cancel hidden>Cancel request</button>';
 const history=d.querySelector('[role=log]'),input=d.querySelector('[data-message]'),plan=d.querySelector('[data-plan]');bindChatDrop(d.querySelector('.director-composer'),input,async()=>project,()=>openDirector(false));
 owner.directorMessages||=[];let linked=(owner.directorLinks||[]).filter(id=>owner.references.some(r=>r.id===id));let linksExpanded=false;try{linksExpanded=sessionStorage.getItem('onigiri-links:'+project.id)==='1';}catch{}const refSelect=d.querySelector('[data-reference]');refSelect.add(new Option('＋ Choose a reference',''));for(const ref of owner.references)refSelect.add(new Option(referenceMap(owner.references)[ref.id]+' · '+ref.name,ref.id));const drawLinks=()=>{const host=d.querySelector('.director-links');host.replaceChildren();const collapsed=linked.length>6&&!linksExpanded;host.classList.toggle('director-links--collapsed',collapsed);let bar=host.nextElementSibling?.classList?.contains('director-links-bar')?host.nextElementSibling:null;if(!bar){bar=document.createElement('div');bar.className='director-links-bar';host.after(bar);}bar.replaceChildren();if(linked.length>6){const toggle=document.createElement('button');toggle.type='button';toggle.className='director-links-toggle';toggle.textContent=linksExpanded?'Collapse references':('Show all '+linked.length+' references');toggle.setAttribute('aria-expanded',String(linksExpanded));toggle.onclick=()=>{linksExpanded=!linksExpanded;try{sessionStorage.setItem('onigiri-links:'+project.id,linksExpanded?'1':'0');}catch{}drawLinks();};bar.append(toggle);}for(const id of linked){const ref=owner.references.find(r=>r.id===id);if(!ref)continue;const chip=document.createElement('button');if(ref.thumbnail){const img=document.createElement('img');img.src='/api/asset/'+encodeURIComponent(ref.id)+'?thumb';img.alt='';chip.append(img);}chip.append(document.createTextNode(referenceMap(owner.references)[id]+' ×'));chip.setAttribute('aria-label','Unlink '+referenceMap(owner.references)[id]);chip.onclick=()=>{linked=linked.filter(x=>x!==id);owner.directorLinks=linked;drawLinks();changed();};host.append(chip);}};refSelect.onchange=()=>{if(refSelect.value&&!linked.includes(refSelect.value))linked.push(refSelect.value);owner.directorLinks=linked;refSelect.value='';drawLinks();changed();};drawLinks();d._refreshLinks=ids=>{linked=[...new Set(ids||[])].filter(id=>owner.references.some(r=>r.id===id));owner.directorLinks=linked;drawLinks();};
 const draw=()=>{history.replaceChildren();const entries=owner.directorMessages.length?owner.directorMessages:[{role:'assistant',text:owner.brief?'Your previous idea is preserved: '+owner.brief:'Describe your scene. We can work out the subjects, references, action and sound together.'}];for(const m of entries){const article=document.createElement('article');article.className='director-message '+m.role;const label=document.createElement('b');label.textContent=m.role==='user'?'You':'Director';const text=document.createElement('p');text.textContent=m.text;article.append(label,text);for(const id of m.referenceIds||[]){const ref=owner.references.find(r=>r.id===id),chip=document.createElement('button');chip.className='director-reference';chip.textContent=ref?referenceMap(owner.references)[id]+' · '+ref.name:'Removed reference';chip.disabled=!ref;chip.onclick=()=>openReferenceStudio(ref);article.append(chip);}history.append(article);}history.scrollTop=history.scrollHeight;};
 plan.value=owner.directorPlan||'';d.querySelector('.director-proposal').hidden=!plan.value;
 input.value=owner.directorInput||'';input.oninput=()=>{if(project.id===d.dataset.projectId)owner=project;linked=(owner.directorLinks||[]).filter(id=>owner.references.some(r=>r.id===id));drawLinks();owner.directorInput=input.value;changed();if(input.value.endsWith('@')&&shell)shell.showLinks(input);};
 plan.oninput=()=>{owner.directorPlan=plan.value;changed();};
 let busy=false;
 const run=async (action,retry=false)=>{
  if(project.id!==d.dataset.projectId){toast('Reopen Director for the current scene.');return;}owner=project;
  if(busy||aiBusy){toast('One local request is already running.');return;}if(!models.some(m=>m.path===$('modelSelect').value&&!m.projector)){toast('Bonsai is being discovered. Try again when model setup finishes.');return;}
  if(action==='director'&&!retry&&!input.value.trim())return;
  if(!retry&&(action==='director'||action==='assemble')&&input.value.trim()){linked=[...new Set([...linked,...(owner.directorLinks||[])])].filter(id=>owner.references.some(r=>r.id===id));owner.directorMessages.push({id:crypto.randomUUID(),role:'user',text:input.value.trim(),referenceIds:[...linked]});input.value='';owner.directorInput='';draw();changed();}
  if(action==='assemble'&&!owner.brief?.trim()&&!owner.draftText?.trim()&&!owner.directorMessages.some(m=>m.role==='user')){toast('Tell the Director what you want to create first.');return;}
  const requestSignature=JSON.stringify([owner.prompt,owner.references,owner.subjects,owner.board?.notes,owner.draftText]);busy=true;aiBusy=true;d.querySelectorAll('button,textarea,select').forEach(el=>el.disabled=true);d.querySelector('[data-cancel]').hidden=false;d.querySelector('[data-cancel]').disabled=false;
  d.querySelector('[data-retry]').hidden=true;const message=d.querySelector('[data-status]');message.textContent='Loading local model…';
  try{await save();const model=$('modelSelect').value;const job=await api('/api/ai',{action,project:structuredClone(owner),model,projector:status.config.profiles[model]?.projector||'',detailEnhancement:owner.detailEnhancement!==false,forceInspect:d.querySelector('[data-reinspect]').checked});let result;do{await sleep(600);result=await api('/api/job/'+job.id);message.textContent=(result.phase?({organize:'Assigning references and subjects',reviewing:'Reviewing draft',repairing:'Correcting draft',writing:'Writing draft',director:'Director is replying'}[result.phase]||result.phase):action==='director'?'Director is replying':action==='assemble'?'Arranging the whole scene':'Arranging reference concept')+' · '+Math.floor((Date.now()-result.started)/1000)+'s';}while(['preparing','running'].includes(result.state));if(result.state!=='done')throw Error(result.error||'Request cancelled.');if(project.id!==owner.id)throw Error('Scene changed. Reopen Director.');owner=project;if(result.directorMemory)owner.directorMemory=result.directorMemory;if(action==='director'){owner.directorMessages.push({id:crypto.randomUUID(),role:'assistant',text:result.output,observations:result.observations||[]});draw();notify('ok');}else if(action==='assemble'){if(requestSignature!==JSON.stringify([owner.prompt,owner.references,owner.subjects,owner.board?.notes,owner.draftText]))throw Error('Scene inputs changed during drafting. The result remains in job history; arrange again to use your edits.');const applied=applyArrangement(owner,result);if(result.scenePlan){owner.references=result.scenePlan.references;owner.subjects=result.scenePlan.subjects;}for(const tag of result.tags||[]){const ref=owner.references.find(r=>r.id===tag.referenceId);if(ref){ref.directorObservation=tag.text;ref.observationKey=tag.key;if(!ref.description)ref.description=tag.carry||'Carry this reference as a whole.';}}if(result.arrangedIntent)owner.brief=result.arrangedIntent;resetWriting();$('prompt').value=owner.prompt;$('brief').value=owner.brief||'';owner.directorMessages.push({id:crypto.randomUUID(),role:'assistant',text:'Arrangement '+applied.number+' is in Prompt. '+(applied.unchanged?'No prompt change.':'Prompt updated from the current conversation. Compare the changes in History before sending.')});renderReferences();renderSubjects();renderDraft();draw();changed();await save();showDraft();message.textContent='Arrangement '+applied.number+' saved · '+new Date().toLocaleTimeString()+'. Open Prompt or compare in History.';notify('ok');return;}else{owner.directorPlan=result.output;plan.value=result.output;d.querySelector('.director-proposal').hidden=false;}changed();await save();message.textContent='Ready'+(result.cachedReferences?' · reused '+result.cachedReferences+' reference analysis':'')+'.';d.querySelector('[data-reinspect]').checked=false;}catch(error){message.textContent=error.message;if(!/cancel/i.test(error.message))notify('error');if(error.message.startsWith('Before arranging: ')){owner.directorMessages.push({id:crypto.randomUUID(),role:'assistant',text:error.message.slice(18)});changed();await save();}d.querySelector('[data-retry]').hidden=action!=='director';}finally{busy=false;aiBusy=false;d.querySelectorAll('button,textarea,select').forEach(el=>el.disabled=false);draw();d.querySelector('[data-cancel]').hidden=true;}
 };
 d.querySelector('[data-send]').onclick=()=>run('director');d.querySelector('[data-arrange]').hidden=true;
 const assembleAction=document.createElement('button');assembleAction.className='quiet';assembleAction.textContent='Arrange everything';assembleAction.title='Automatic workflow: tag every reference, write the subject definitions and compile the draft in the Prompt tab.';assembleAction.onclick=()=>run('assemble');d.querySelector('header').append(assembleAction);
 d.querySelector('.director-composer .row .hint').textContent='Ctrl + Enter to send';
 input.onkeydown=e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();run('director');}};
 d.querySelector('[data-apply]').onclick=()=>{owner.brief=plan.value;owner.directorPlan=plan.value;$('brief').value=owner.brief;changed();showDraft();toast('Arranged intent saved in Draft.');};
 d.querySelector('[data-retry]').onclick=()=>run('director',true);
 d.querySelector('[data-cancel]').onclick=()=>api('/api/ai/cancel',{}).catch(e=>d.querySelector('[data-status]').textContent=e.message);
 d.querySelector('[data-close]').onclick=()=>d.remove();d.oncancel=e=>{if(busy)e.preventDefault();};d.onclose=()=>d.remove();document.querySelector('.inspector').append(d);draw();
}
function clearReferenceDefinition(ref,previous=''){const label=referenceMap(project.references)[ref.id];setDefinition(label,'');for(const [i,s] of project.subjects.entries()){if(s.inspectionReferenceId===ref.id||(s.sourceId===ref.id&&s.manualDescription&&(s.description===ref.savedDescription||s.description===previous))){setDefinition('<Subject '+(i+1)+'>','');s.description='';s.generatedDefinition='';}}ref.savedDescription='';}

function subjectInspection(subject){return {output:subject.description||'',allowEmpty:true,closeOnSave:true,onSave:async({text,role})=>{const source=subject.sources.find(s=>s.sourceId===role.sourceId);if(source)Object.assign(source,role,{roleCleared:role.selections?.length===0});subject.description=text;subject.manualDescription=true;const label='<Subject '+(project.subjects.indexOf(subject)+1)+'>';if(project.prompt.includes(label))setDefinition(label,label+' is '+text);renderDraft();changed();renderSubjects();await save();}};}

function renderDraft(){if(boardUI){boardUI.render();return;}const host=$('draftBlocks');if(!host||!project)return;host.replaceChildren();if(project.brief){const intent=document.createElement('button');intent.className='draft-block';intent.textContent='Director intent — '+project.brief;intent.onclick=openDirector;host.append(intent);}for(const [i,s] of project.subjects.entries()){const text=s.description||subjectSources(s).map(r=>r.label).filter(Boolean).join(' + ');if(!text)continue;const b=document.createElement('button');b.className='draft-block';b.textContent='Soy Bean · <Subject '+(i+1)+'> — '+text;b.onclick=()=>{const row=$('subjectList').querySelectorAll('.subject-item')[i];if(row){row.open=true;row.querySelector('.role-choice')?.click();}};host.append(b);}for(const ref of project.references){const b=document.createElement('button');b.className='draft-block';b.textContent='Onigiri · '+referenceMap(project.references)[ref.id]+' — '+(ref.description||'Carry the reference as a whole');b.onclick=()=>openReferenceStudio(ref);host.append(b);}}
function restoreView(){const view=sessionStorage.getItem('onigiri-view:'+project.id);if(view==='prompt')showWrite();else if(view==='check')showChecks();else showDraft();}
function showDraft(){sessionStorage.setItem('onigiri-view:'+project.id,'draft');$('draftPane').hidden=false;$('prompt').hidden=true;$('checks').hidden=true;$('writeTab').classList.remove('active');$('checkButton').classList.remove('active');$('draftTab').classList.add('active');refreshDecorations();promptTools(false);shell?.showAssets(false);renderDraft();}
function openReferenceHub(ref,edit){const d=document.createElement('dialog');d.className='reference-hub';const header=document.createElement('div');header.className='section-heading';const title=document.createElement('h2');title.textContent=referenceMap(project.references)[ref.id];const close=document.createElement('button');close.textContent='Close';close.onclick=()=>d.close();header.append(title,close);const media=document.createElement(ref.type==='image'?'img':ref.type);media.src='/api/asset/'+ref.id;if(ref.type!=='image')media.controls=true;media.style.cssText='width:100%;max-height:65vh;object-fit:contain';const actions=document.createElement('div');actions.className='row';const editor=document.createElement('button');editor.textContent=ref.type==='image'?'Image Studio':ref.type==='video'?'Video Editor':'Sound Studio';editor.onclick=()=>edit();const carry=document.createElement('button');carry.textContent='Onigiri · Reference data';carry.onclick=()=>openReferenceStudio(ref);actions.append(editor,carry);d.append(header,media,actions);d.onclose=()=>{if(ref.type!=='image'){media.pause();media.removeAttribute('src');media.load();}d.remove();};document.body.append(d);d.showModal();}

// Reconnect a retained editor after a helper restart without discarding its draft.
window.addEventListener('message',async e=>{
 if(e.source!==parent||!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(e.origin)||e.data?.type!=='h3-session'||!/^[a-f0-9]{48}$/.test(e.data.token||''))return;
 try{status=await api('/api/status');const next=await api('/api/bridge/session/'+e.data.token);sessionToken=e.data.token;session=next;const hash=new URLSearchParams(location.hash.slice(1));hash.set('session',sessionToken);history.replaceState(null,'','#'+hash);if(project)await api('/api/bridge/session/'+sessionToken,{action:'bind',projectId:project.id});$('connection').textContent='Connected · '+next.target;$('connection').classList.add('connected');notifyCanvas(true);}catch(error){toast('Could not reconnect: '+error.message);}
});

async function openTrash(){
 await save();const d=document.createElement('dialog');d.className='trash-gallery';d.innerHTML='<h2>Trash</h2><div class="trash-toolbar"><input aria-label="Search trash" placeholder="Search trashed scenes"><button class="danger" data-empty>Empty trash</button></div><div class="trash-grid"></div><p role="status"></p>';document.body.append(d);d.onclose=()=>d.remove();d.showModal();let items=await api('/api/trash');const grid=d.querySelector('.trash-grid');
 const draw=()=>{grid.replaceChildren();d.querySelector('[data-empty]').disabled=!items.length;for(const item of items.filter(x=>x.title.toLowerCase().includes(d.querySelector('input').value.toLowerCase()))){const card=document.createElement('article');if(item.coverAssetId){const img=document.createElement('img');img.src='/api/asset/'+encodeURIComponent(item.coverAssetId)+'?thumb';img.alt='';card.append(img);}const title=document.createElement('h3');title.textContent=item.title;const restore=document.createElement('button');restore.textContent='Restore';restore.onclick=async()=>{try{restore.disabled=true;await api('/api/trash/'+item.id,{restore:true});items=items.filter(x=>x.id!==item.id);draw();await listProjects();await shell.refreshProjects();[dashboardItems,dashboardPrefs]=await Promise.all([api('/api/projects'),api('/api/dashboard')]);if($('projectDialog').open)renderDashboard();}catch(e){restore.disabled=false;toast(e.message);}};card.append(title,restore);grid.append(card);}if(!items.length)grid.textContent='Trash is empty.';};d.querySelector('input').oninput=draw;
 d.querySelector('[data-empty]').onclick=async()=>{if(!items.length)return;const answer=await askDialog({title:'Empty trash?',message:'Permanently delete '+items.length+' trashed scenes? Saved snapshots and original media are retained. Type EMPTY to confirm.',value:'',confirm:'Empty trash'});if(answer!=='EMPTY')return;try{d.querySelector('[data-empty]').disabled=true;for(const item of [...items]){await api('/api/trash/'+item.id,{permanent:true,confirm:item.id,revision:item.revision});items=items.filter(x=>x.id!==item.id);}const prefs=await api('/api/dashboard');await api('/api/dashboard',{...prefs,trashFolders:[]});draw();d.querySelector('[role=status]').textContent='Trash emptied. Snapshots and media retained.';}catch(e){d.querySelector('[role=status]').textContent=e.message;draw();}};draw();
}

let textSelectionDrag=false;
document.addEventListener('dragstart',event=>{textSelectionDrag=!!event.target.closest?.('textarea,input,select,[contenteditable]');},true);
document.addEventListener('dragend',()=>{textSelectionDrag=false;},true);
document.addEventListener('drop',()=>{textSelectionDrag=false;},true);
const couldCarryMedia=event=>{const types=[...(event.dataTransfer?.types||[])];return types.includes('Files')||types.some(type=>type.startsWith('application/x-h3-'))||types.includes('text/html')||types.includes('text/uri-list');};

function bindChatDrop(host,input,prepare,refresh,dropper){
 let depth=0;
 const ignore=event=>textSelectionDrag||!couldCarryMedia(event);
 host.addEventListener('dragenter',e=>{if(ignore(e))return;e.preventDefault();depth++;host.classList.add('chat-dropping');});host.addEventListener('dragover',e=>{if(ignore(e))return;e.preventDefault();e.dataTransfer.dropEffect='copy';});host.addEventListener('dragleave',e=>{if(ignore(e))return;if(--depth<=0)host.classList.remove('chat-dropping');});
 host.addEventListener('drop',async e=>{if(ignore(e))return;e.preventDefault();e.stopPropagation();depth=0;host.classList.remove('chat-dropping');const values=new Map([...e.dataTransfer.types].map(type=>[type,e.dataTransfer.getData(type)])),transfer={files:[...(e.dataTransfer.files||[])],getData:type=>values.get(type)||''};try{if(aiBusy)throw Error('Wait for the current Director request.');await prepare();let ids;if(dropper){ids=await dropper(transfer);}else{await save();const owner=project;ids=await addDroppedMedia(transfer);if(project.id!==owner.id)throw Error('Scene changed during import.');if(!ids.length)return;changed();renderReferences();renderDraft();input.dispatchEvent(new Event('input',{bubbles:true}));await save();}if(!ids||!ids.length)return;refresh();host.animate([{opacity:.7},{opacity:1}],{duration:220});}catch(error){toast(error.message);}});
}

function refreshStorageSettings(){  $('storageCurrent').textContent='Current: '+status.dataDir;let locations=document.getElementById('storageLocations');if(!locations){locations=document.createElement('div');locations.id='storageLocations';document.querySelector('.storage-settings summary').after(locations);}locations.replaceChildren();for(const folder of [...new Set([status.dataDir,...(status.config.previousDataDirs||[])])]){const button=document.createElement('button');button.textContent=folder;button.disabled=folder===status.dataDir;button.onclick=async()=>{await save();await api('/api/storage-location',{folder});status=await api('/api/status');const scenes=await api('/api/projects');if(scenes.length)await loadProject(scenes[0].id);else await createScene({});await showDashboard();};locations.append(button);}}
$('settings').addEventListener('toggle',()=>{if($('settings').open)refreshStorageSettings();});
