import {referenceMap} from './public/domain.mjs';
import {randomUUID} from 'node:crypto';
export function applyOrganization(project,raw){
 const plan=JSON.parse(raw.replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));
 if(typeof plan.clarification==='string'&&plan.clarification.trim()){const error=Error('Before arranging: '+plan.clarification);error.clarification=true;throw error;}
 if(!Array.isArray(plan.references)||!Array.isArray(plan.subjects))throw Error('Organizer must return references and subjects arrays.');
 const labels=referenceMap(project.references),byLabel=new Map(project.references.map(r=>[labels[r.id],r]));
 const references=project.references.map(r=>({...r})),subjects=project.subjects.map(s=>({...s,sources:(s.sources||[]).map(x=>({...x}))}));
 for(const item of plan.references){const source=byLabel.get(item.reference);if(!source)throw Error('Organizer named an unavailable reference.');if(typeof item.carry!=='string'||!Array.isArray(item.tags))throw Error('Reference carry and tags are required.');const ref=references.find(r=>r.id===source.id);if(!ref.description||ref.autoCarry){ref.description=item.carry.slice(0,1600);ref.autoCarry=true;}ref.tags=item.tags.filter(t=>typeof t==='string').slice(0,8).map(t=>t.slice(0,80));}
 if(new Set(plan.references.map(r=>r.reference)).size!==references.length)throw Error('Organizer must tag every reference once.');
 for(const item of plan.subjects.slice(0,12)){item.subject??=item.label;if(item.subject&&project.subjects.length&&!subjects.some((s,i)=>item.subject===`<Subject ${i+1}>`)&&item.subject!==`<Subject ${subjects.length+1}>`)throw Error('Unknown existing subject label; omit subject for a new identity.');if(typeof item.name!=='string'||typeof item.definition!=='string'||!Array.isArray(item.references))throw Error('Invalid subject plan.');const sources=item.references.map(label=>{const ref=byLabel.get(label);if(!ref)throw Error('Subject source is unavailable.');return {sourceId:ref.id,label:'Director reference',selections:[]};});let subject=subjects.find((s,i)=>item.subject===`<Subject ${i+1}>`);if(!subject){subject={id:randomUUID(),name:item.name.slice(0,120),description:item.definition.slice(0,1400),sources,sourceId:sources[0]?.sourceId||''};subjects.push(subject);}else if(!subject.manualDescription){subject.name=item.name.slice(0,120);subject.description=item.definition.slice(0,1400);subject.sources=sources.map(source=>({...subject.sources.find(old=>old.sourceId===source.sourceId),...source}));subject.sourceId=sources[0]?.sourceId||'';}}
 return {...project,references,subjects};
}
