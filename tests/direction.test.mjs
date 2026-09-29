import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Inference} from '../worker.mjs';
import {newProject,replaceDefinition,changeReferences,compileDraft,SECTIONS} from '../public/domain.mjs';
import {directionPrompt} from '../direction.mjs';

test('partial structure leaves action and sound empty without relaxing full-draft requirements',()=>{
 const fields=Object.fromEntries(SECTIONS.map(s=>[s,'N/A']));fields.detailed_description='';fields.overall_soundscape='';
 assert.throws(()=>compileDraft(fields),/empty/);assert.match(compileDraft(fields,{partial:true}),/detailed_description:\n\n\noverall_soundscape:\n\n\nnon_diegetic_music:/);
 fields.summary='';assert.throws(()=>compileDraft(fields,{partial:true}),/summary empty/);
});

test('definition removal removes a multiline entry without touching another subject or sound',()=>{
 const prompt='subject_definitions:\n<Subject 1> is a person.\nTheir red coat is visible.\n<Subject 10> is a bench.\n\nsummary:\nA scene.\n\nnon_diegetic_music:\nNo music.';
 const next=replaceDefinition(prompt,'<Subject 1>','');
 assert.doesNotMatch(next,/red coat|is a person/);assert.match(next,/<Subject 10> is a bench/);assert.match(next,/No music\.$/);
});
test('Director links retain reference identity when references reorder and flag removed links',()=>{
 const p=newProject();p.references=[{id:'a',type:'image'},{id:'b',type:'image'}];p.directorMessages=[{id:'m',role:'user',text:'Use <Picture 1> for the setting.',referenceIds:['a']}];
 const next=changeReferences(p,[p.references[1],p.references[0]]);
 assert.match(next.directorMessages[0].text,/<Picture 2>/);
 assert.match(directionPrompt(next,'director'),/linkedReferences.*Picture 2/);
 const removed=changeReferences(next,[next.references[0]]);assert.match(directionPrompt(removed,'director'),/Removed reference/);
});
test('Standard specialists run sequentially with separate prompts and compact handoffs before compilation and review',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'h3-direction-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const answer='subject_definitions:\nN/A\n\nsummary:\n[text generation] A blue ball rests on a table.\n\nretention_analysis:\nN/A\n\ndetailed_description:\nNatural light.\n[Shot 1] A blue ball rests on a table, fixed camera.\n\noverall_soundscape:\nN/A\n\nnon_diegetic_music:\nN/A';
 class Fixture extends Inference{calls=[];running=false;async generate(config,args){assert.equal(this.running,false);this.running=true;const prompt=await readFile(args[args.indexOf('-f')+1],'utf8');this.calls.push(prompt);await new Promise(r=>setTimeout(r,2));this.running=false;return '> '+prompt+'\n'+(this.calls.length<4?'Plan '+this.calls.length:answer)+'\n[ Prompt: 1 t/s ]';}}
 const worker=new Fixture(process.cwd(),dir),project=newProject();project.brief='A blue ball rests on a table.';
 const {id}=worker.start({action:'draft',mode:'standard',project,model:'fixture'},{profiles:{fixture:{}}});
 while(worker.status().busy)await new Promise(r=>setTimeout(r,10));
 assert.equal(worker.job(id).state,'done',worker.job(id).error);assert.equal(worker.calls.length,5);assert.match(worker.calls[0],/arrange specialist/);assert.match(worker.calls[1],/visual specialist/);assert.match(worker.calls[1],/Plan 1/);assert.doesNotMatch(worker.calls[1],/You are the arrange specialist/);assert.match(worker.calls[2],/sound specialist/);assert.match(worker.calls[3],/SPECIALIST PLANS/);assert.equal(worker.job(id).reviewed,true);
});

import {structureIssues} from '../prompt-quality.mjs';
test('partial structure rejects invented references when the scene has none',()=>{
 const p=newProject();assert.ok(structureIssues({summary:'[reference generation] A ball.',retention_analysis:'Preserve the ball'},p).length);assert.deepEqual(structureIssues({summary:'[text generation] A ball.',retention_analysis:'N/A'},p),[]);
});
