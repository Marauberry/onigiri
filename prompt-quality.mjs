import {SECTIONS} from './public/domain.mjs';
// Accept the official plain six-section form as well as JSON; never extract
// partial fields out of commentary or repair a truncated JSON object.
export function parseDraft(raw){
  if(raw.trimStart().startsWith('{'))return JSON.parse(raw);
  const headings=[...raw.matchAll(/^(subject_definitions|summary|retention_analysis|detailed_description|overall_soundscape|non_diegetic_music):[ \t]*/gm)];
  if(headings.length!==SECTIONS.length||headings.some((h,i)=>h[1]!==SECTIONS[i])||raw.slice(0,headings[0].index).trim())throw Error('Return the complete six-field JSON or six ordered H3 sections, without commentary.');
  return Object.fromEntries(headings.map((h,i)=>[h[1],raw.slice(h.index+h[0].length,headings[i+1]?.index??raw.length).trim()]));
}
export function structureIssues(draft,project){
 const issues=[];
 if(!/^\[[^\]]+\]\s+\S/.test(draft.summary||''))issues.push('summary needs a task type and a scene sentence.');
 if(!project.references?.length){if(!/^\[text generation\]/i.test(draft.summary||''))issues.push('No references are attached: use [text generation]. Written draft notes are not reference media.');if(draft.retention_analysis?.trim()!=='N/A')issues.push('No references are attached: retention_analysis must be N/A.');}
 return issues;
}
// Syntax-only cleanup: do not alter action prose, source claims or dialogue.
export function normalizeDraft(draft,project){
  if(typeof draft.detailed_description!=='string')return draft;
  let detail=draft.detailed_description.replace(/\bShot (\d+):/g,'[Shot $1]')
    .replace(/\[Shot 1\]\s*At\s+00:00(?:\.0+)?\s*,?\s*/i,'[Shot 1] ')
    .replace(/At (\d{2}:\d{2}\.\d{3}),?\s+(?:cut to\s+)?\[Shot ([2-9]\d*)\]\s*/gi,'[Shot $2] At $1, ');
  for(const subject of project.subjects||[]){
    if(!subject.name)continue;
    const escaped=subject.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    detail=detail.replace(new RegExp('(<Subject \\d+>)\\s*\\('+escaped+'\\)','g'),'$1');
  }
  return {...draft,detailed_description:detail};
}
// Objective output-contract checks; semantic fidelity still needs grounded review.
export function draftIssues(draft,project){
  const issues=[],detail=draft.detailed_description||'',definitions=draft.subject_definitions||'',retention=draft.retention_analysis||'';
  if(/\[Shot 1\]\s*At\s+\d/i.test(detail))issues.push('Remove the opening timestamp immediately after [Shot 1]; describe its initial composition directly.');
  const shotMatches=[...detail.matchAll(/\[Shot (\d+)\]/g)],shots=shotMatches.map(m=>Number(m[1]));
  if(shots.some((n,i)=>n!==i+1))issues.push('Number actual shots consecutively starting at [Shot 1], without repeating shot markers in the description.');
  const clientIntent=[project.brief||'',...(project.directorMessages||[]).filter(m=>m.role==='user').map(m=>m.text)].join('\n');
  const exact=[...clientIntent.matchAll(/\bexactly\s+(one|two|three|four|five|\d+)\s+shots?\b/gi)].at(-1),counts={one:1,two:2,three:3,four:4,five:5};
  if(exact){const count=counts[exact[1].toLowerCase()]||Number(exact[1]);if(shots.length!==count)issues.push(`The brief requires exactly ${count} shots; include each numbered shot and its requested cut time.`);}
  for(const shot of shotMatches.slice(1))if(!/^\s+At \d{2}:\d{2}\.\d{3},/.test(detail.slice(shot.index+shot[0].length)))issues.push(`Put the cut time immediately after ${shot[0]} as At MM:SS.mmm, then describe the shot.`);
  for(const token of new Set(((project.brief+'\n'+Object.values(draft).join('\n')).match(/<Subject \d+>/g)||[]))){
    if(!definitions.includes(token))issues.push(`Define ${token} in subject_definitions using only supplied subject/source notes.`);
    if(project.brief.includes(token)&&!detail.includes(token))issues.push(`Use literal ${token} in detailed_description for the requested subject, not its name alone.`);
  }
  const summary=draft.summary||'';
  if(Array.isArray(project.references)&&project.references.length===0){
    if(!/^\[text generation\]/i.test(summary))issues.push('No references are attached: use [text generation] as the summary task type.');
    if(retention.trim()!=='N/A')issues.push('No references are attached: retention_analysis must be N/A, not retention claims about ordinary scene objects.');
  }
  if(!/^\[[^\]]+\]\s+\S/.test(summary))issues.push('summary needs a bracketed task type followed by a real one-sentence scene summary.');
  if(!project.references?.some(r=>r.type==='video')&&/^\[[^\]]*video (?:editing|continuation)/i.test(summary))issues.push('No source video exists: summary must not claim video editing or continuation. Use reference generation for identity pictures.');
  if(/<d>(?!\[[^\]]+\])/.test(detail))issues.push('Every dialogue tag needs its actual language: <d>[Language]spoken words</d>.');
  for(const speech of (project.brief||'').matchAll(/\b(?:says?|whispers?|shouts?)\s+(?:exactly\s+)?[「“"]([^」”"\n]+)[」”"]/gi)){
    if(!/<d>/.test(detail))issues.push('Include the explicitly requested spoken line in detailed_description with speaker and language tags.');
    else if(project.dialogueMode==='preserve'&&![...detail.matchAll(/<d>\[[^\]]+\]([\s\S]*?)<\/d>/g)].some(m=>m[1].includes(speech[1])))issues.push('Preserve the requested spoken words exactly: '+speech[1]);
  }
  for(const subject of project.subjects||[]){if(subject.name&&detail.includes('('+subject.name+')'))issues.push(`In detailed_description remove the repeated name (${subject.name}); use the subject label directly. Keep actual (S1) speaker markers.`);}
  for(const line of retention.split('\n')){
    if(/<(?:Subject|Picture|Video) \d+>/.test(line)&&!/<Audio \d+>/.test(line)&&/\b(?:fully_copy|partially_copy)\b/.test(line))issues.push('Visual retention must use visual markers, never fully_copy or partially_copy.');
  }
  if(/\b(?:static|locked)\s+or\s+(?:handheld|tracking|moving)/i.test(detail))issues.push('Choose the single camera behavior requested by the brief, not alternatives.');
  return issues;
}
