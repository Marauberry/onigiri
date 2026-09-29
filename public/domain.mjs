import {remapMentions} from './mentions.mjs';
export const SECTIONS = ['subject_definitions', 'summary', 'retention_analysis', 'detailed_description', 'overall_soundscape', 'non_diegetic_music'];
export function renumberShots(text){let n=0;return text.replace(/\[Shot \d+\]/g,()=>`[Shot ${++n}]`);}
export function newProject() {
  return { schema: 1, id: crypto.randomUUID(), created:new Date().toISOString(), title: 'Untitled scene', mode: 'ref2va', prompt: '', brief: '', references: [], subjects: [], speakers: [], dialogueLanguage:'Auto', dialogueMode:'translate', detail:'balanced', triggers:'', width: 832, height: 480, aspectRatio:'16:9', targetMegapixels:0.4, length: 124, revision: 0 };
}
export function changeSubjects(project, subjects) {
  const replacements=Object.fromEntries(project.subjects.map((s,i)=>{const next=subjects.findIndex(n=>n.id===s.id);return [`<Subject ${i+1}>`,next<0?null:`<Subject ${next+1}>`];}));
  const p=structuredClone({...project,subjects,speakers:(project.speakers||[]).map(s=>({...s,subjectId:subjects.some(x=>x.id===s.subjectId)?s.subjectId:null}))});return remapMentions(p,replacements);
}
export function dimensions(aspect, megapixels) {
  const [a,b]=aspect.split(':').map(Number);if(![a,b,megapixels].every(Number.isFinite)||!(a>0&&b>0&&megapixels>=.05&&megapixels<=4))throw new Error('Choose a valid ratio and 0.05–4 megapixels.');
  const h=Math.sqrt(megapixels*1e6*b/a);
  return {width:Math.max(32,Math.round(h*a/b/32)*32),height:Math.max(32,Math.round(h/32)*32)};
}
export function dialogueIssues(text) {
  const errors=[];
  for(const m of text.matchAll(/<d>\[([^\]]+)\]([\s\S]*?)<\/d>/g)) {
    if(/japanese|日本語/i.test(m[1]) && !/[\u3040-\u30ff\u3400-\u9fff]/u.test(m[2])) errors.push('Japanese dialogue still appears to be untranslated. Use Japanese characters inside <d>.');
    if(/chinese|中文/i.test(m[1]) && !/[\u3400-\u9fff]/u.test(m[2])) errors.push('Chinese dialogue appears to be untranslated.');
    if(/korean|한국어/i.test(m[1]) && !/[\uac00-\ud7af]/u.test(m[2])) errors.push('Korean dialogue appears to be untranslated.');
  }
  return errors;
}
export const DRAFT_SCHEMA={type:'object',properties:Object.fromEntries(SECTIONS.map(s=>[s,{type:'string',minLength:1}])),required:SECTIONS,additionalProperties:false};
export function compileDraft(fields,{partial=false}={}) {
  for(const s of SECTIONS)if(typeof fields[s]!=='string'||(!fields[s].trim()&&!(partial&&['detailed_description','overall_soundscape'].includes(s))))throw new Error(`The model left ${s} empty.`);
  fields={...fields,detailed_description:fields.detailed_description.replace(/\bShot (\d+):/g,'[Shot $1]')};
  // Global speaker numbering follows first speech in the actual scene, not subject order.
  const order=[...new Set(fields.detailed_description.match(/\(S\d+\)/g)||[])];
  const mapping=Object.fromEntries(order.map((id,i)=>[id,`(S${i+1})`]));
  return SECTIONS.map(s=>`${s}:\n${fields[s].trim().replace(/\(S\d+\)/g,m=>mapping[m]||m)}`).join('\n\n');
}
// Audio from videos precedes standalone audio in ComfyUI's native presentation.
export function referenceMap(refs) {
  const map = {}; let picture = 0, video = 0, audio = 0;
  for (const r of refs.filter(r => r.type === 'image')) map[r.id] = `<Picture ${++picture}>`;
  for (const r of refs.filter(r => r.type === 'video')) {
    map[r.id] = `<Video ${++video}>`;
    if (r.withAudio) map[r.id + ':audio'] = `<Audio ${++audio}>`;
  }
  for (const r of refs.filter(r => r.type === 'audio')) map[r.id] = `<Audio ${++audio}>`;
  return map;
}
export function remapReferences(text, before, after) {
  const old = referenceMap(before), next = referenceMap(after);
  const replacements = Object.fromEntries(Object.entries(old).map(([id, label]) => [label, next[id] || `<Missing reference ${id}>`]));
  return text.replace(/<(?:Picture|Video|Audio) \d+>/g, label => replacements[label] || label);
}
export function changeReferences(project, refs) {
  const before=referenceMap(project.references),after=referenceMap(refs),replacements=Object.fromEntries(Object.entries(before).map(([id,label])=>[label,after[id]||null]));
  return remapMentions(structuredClone({...project,references:refs}),replacements);
}
export function suggestions(project, prefix) {
  if(prefix.startsWith('/'))return [];
  if(/^At \d/.test(prefix)){
    const raw=prefix.slice(3).split(':').map(Number),seconds=raw.length===2?raw[0]*60+raw[1]:raw[0];
    if(!Number.isFinite(seconds))return [];
    return [seconds,seconds+.5,seconds+1].filter(t=>t<=project.length/24).map(t=>({value:`At ${String(Math.floor(t/60)).padStart(2,'0')}:${(t%60).toFixed(3).padStart(6,'0')}, `,detail:'Scene time'}));
  }
  if(prefix.startsWith('(')){
    const speakers=project.speakers||[],unused=project.subjects.filter(s=>!speakers.some(v=>v.subjectId===s.id));
    return [...speakers.map((s,i)=>({value:`(S${i+1})`,detail:project.subjects.find(x=>x.id===s.subjectId)?.name||s.name||'Speaker'})),...unused.map((s,i)=>({value:`(S${speakers.length+i+1})`,detail:s.name+' · assign voice',subjectId:s.id}))].filter(s=>s.value.toLowerCase().startsWith(prefix.toLowerCase()));
  }
  if (prefix.startsWith('[')) {
    const n = Math.max(0, ...[...project.prompt.matchAll(/\[Shot (\d+)\]/g)].map(m => +m[1]));
    return Array.from({length: Math.min(n + 1, 100)}, (_, i) => ({value: `[Shot ${i + 1}]`, detail: i === n ? 'Insert next shot' : 'Existing shot'})).filter(x => x.value.toLowerCase().startsWith(prefix.toLowerCase()));
  }
  const refs = referenceMap(project.references);
  return [
    ...project.subjects.map((s, i) => ({value: `<Subject ${i + 1}>`, detail: s.name})),
    ...Object.entries(refs).map(([id, value]) => ({value, detail: project.references.find(r => r.id === id.replace(':audio', ''))?.name + (id.endsWith(':audio') ? ' · soundtrack' : '')})),
    {value: '<d>[English] </d>', detail: 'Dialogue / lyrics', caretBack: 4},
    {value: '<scenetrans>', detail: 'Speech across a cut'}, {value: '<cutoff>', detail: 'Truncated speech'},
  ].filter(x => x.value.toLowerCase().startsWith(prefix.toLowerCase()));
}
export function validate(project) {
  const errors = [], warnings = [], refs = project.references;if((project.missingMentions||[]).some(m=>m.field==='prompt'&&project.prompt.slice(m.start,m.start+m.token.length)===m.token))errors.push('Replace the red missing mentions or ask the writing partner to repair the prompt.');
  if (!project.prompt.trim()) errors.push('Write a prompt before sending.');
  const known = new Set([...Object.values(referenceMap(refs)), ...project.subjects.map((_, i) => `<Subject ${i + 1}>`)]);
  for (const tag of new Set(project.prompt.match(/<(?:Picture|Video|Audio|Subject) \d+>/g) || [])) if (!known.has(tag)) errors.push(`${tag} has no matching reference or subject.`);
  if (/<Missing (reference|subject)/.test(project.prompt)) errors.push('Replace the missing reference or subject mentions before sending.');
  errors.push(...dialogueIssues(project.prompt));
  if(/<d>/.test(project.prompt)&&!(/\(S\d+\)/.test(project.prompt)))errors.push('Dialogue needs a speaker marker: <Subject 1> (S1) says <d>[Japanese] …</d>, or (S1) for narration.');
  let depth = 0;
  for (const m of project.prompt.matchAll(/<\/?d>/g)) { depth += m[0] === '<d>' ? 1 : -1; if (depth < 0 || depth > 1) break; }
  if (depth !== 0 || project.prompt.includes('<\\d>')) errors.push('Dialogue must use a matching <d> and </d> pair.');
  for (const [type, max] of [['image',9], ['video',3], ['audio',3]]) if (refs.filter(r => r.type === type).length > max) errors.push(`This ComfyUI adapter supports at most ${max} ${type} references.`);
  if (refs.length > 12) errors.push('Use at most 12 reference files in this snapshot.');
  for (const r of refs.filter(r => r.type !== 'image')) {
    const end = r.trimEnd || r.duration;
    if (!Number.isFinite(end) || !Number.isFinite(r.trimStart) || r.trimStart < 0 || end <= r.trimStart || end > r.duration + .05) errors.push(`${r.name}: invalid trim range.`);
    else if (end - r.trimStart < 2 || end - r.trimStart > 15.05) errors.push(`${r.name}: select a reference window of 2–15 seconds.`);
    if (r.type === 'video' && end - r.trimStart > project.length / 24) warnings.push(`${r.name} exceeds the output length; native H3 will shorten it.`);
    if (r.withAudio && !r.hasAudio) errors.push(`${r.name} has no embedded audio track.`);
  }
  for (const kind of ['video', 'audio']) {
    const seconds = refs.filter(r => r.type === kind || (kind === 'audio' && r.withAudio)).reduce((s,r) => s + (r.trimEnd || r.duration) - r.trimStart, 0);
    if (seconds > 15.05) errors.push(`Combined ${kind} reference duration exceeds 15 seconds.`);
  }
  if (![project.width, project.height].every(n => Number.isInteger(n) && n >= 32 && n <= 2048 && n % 32 === 0)) errors.push('Width and height must be multiples of 32, up to 2048.');
  if (!Number.isInteger(project.length) || project.length < 5 || project.length > 3592 || (project.length - 5) % 17 !== 0) errors.push('Frame count must use H3’s 17n+5 grid, up to 3592 frames.');
  for (const section of SECTIONS) {
    const match=project.prompt.match(new RegExp(`^${section}:([\\s\\S]*?)(?=^(?:${SECTIONS.join('|')}):|$(?![\\s\\S]))`,'m'));
    if(!match) warnings.push(`Missing recommended section: ${section}.`);
    else if(!match[1].trim()) warnings.push(`Fill ${section}, or use N/A when it does not apply.`);
  }
  if (project.prompt.length > 7000) warnings.push('Prompt exceeds 7,000 characters. Consider shortening it.');
  const shots = [...project.prompt.matchAll(/\[Shot (\d+)\]/g)].map(m => +m[1]);
  if (!shots.length) warnings.push('Add a [Shot 1] marker to the scene description.');
  return {errors: [...new Set(errors)], warnings: [...new Set(warnings)]};
}
export function template(project) {
  const labels = referenceMap(project.references);
  const definitions = [...project.subjects.map((s,i) => `<Subject ${i+1}> is ${s.description || s.name}.`), ...project.references.flatMap(r => [`${labels[r.id]}: ${r.description || r.name}.`, ...(labels[r.id+':audio']?[`${labels[r.id+':audio']}: Soundtrack from ${labels[r.id]}.`]:[])])];
  return `subject_definitions:\n${definitions.join('\n') || 'N/A'}\n\nsummary:\n\n\nretention_analysis:\n\n\ndetailed_description:\n[Shot 1] \n\noverall_soundscape:\n\n\nnon_diegetic_music:\nN/A`;
}
// Manual workflow: empty section headings only, so the writer fills them by hand.
export const MANUAL_SECTIONS = SECTIONS;
export function manualStructure(){return MANUAL_SECTIONS.map(s=>`${s}:`).join('\n\n')+'\n';}

// A removed source must not appear to the writing model as an attached reference.
// This changes only the request context; the user's editable prompt stays intact.
export function modelInputPrompt(project){const known=new Set([...Object.values(referenceMap(project.references)),...project.subjects.map((_,i)=>'<Subject '+(i+1)+'>')]);return project.prompt.replace(/<(?:Subject|Picture|Video|Audio) \d+>/g,(token,start)=>known.has(token)&&!(project.missingMentions||[]).some(m=>m.field==='prompt'&&m.start===start&&m.token===token)?token:'[source removed; rewrite without a source claim]');}

// Match a definition by its leading label, independently of writer wording.
export function replaceDefinition(prompt,label,text=''){
 const section=/^subject_definitions:[ \t]*\n?([\s\S]*?)(?=^(?:summary|retention_analysis|detailed_description|overall_soundscape|non_diegetic_music):|$(?![\s\S]))/m;
 const match=section.exec(prompt);
 if(!match)return text?'subject_definitions:\n'+text+'\n\n'+prompt:prompt;
 const entries=match[1].trim().split(/\n(?=<(?:Subject|Picture|Video|Audio) \d+>)/);
 const keep=entries.filter(entry=>entry.trim()!=='N/A'&&!entry.trim().startsWith(label));
 if(text)keep.push(text);
 return prompt.slice(0,match.index)+'subject_definitions:\n'+(keep.filter(Boolean).join('\n')||'N/A')+'\n\n'+prompt.slice(match.index+match[0].length);
}

export function bindKnownSpeakers(fields,project){if(typeof fields.detailed_description!=='string')return fields;return {...fields,detailed_description:fields.detailed_description.replace(/<Subject (\d+)>([^<\n]*?)(?=<d>)/g,(match,n,action)=>{if(/\(S\d+\)/.test(action))return match;const subject=project.subjects[Number(n)-1],index=(project.speakers||[]).findIndex(s=>subject&&s.subjectId===subject.id);return index<0?match:'<Subject '+n+'> (S'+(index+1)+')'+action;})};}
