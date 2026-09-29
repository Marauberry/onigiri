import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Inference} from '../worker.mjs';
import {newProject} from '../public/domain.mjs';

const answer='subject_definitions:\nN/A\n\nsummary:\n[text generation] A blue ball rests on a table.\n\nretention_analysis:\nN/A\n\ndetailed_description:\nNaturalistic lighting.\n[Shot 1] A fixed camera frames a blue ball resting on a table.\n\noverall_soundscape:\nN/A\n\nnon_diegetic_music:\nN/A';
test('empty and rejected reviewer responses retry and deliver a corrected draft',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'h3-review-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 class Fixture extends Inference{
  responses=[answer,'','Rejected: rewrite the candidate.',answer];calls=0;
  async generate(config,args){const prompt=await readFile(args[args.indexOf('-f')+1],'utf8');return '> '+prompt+'\n'+this.responses[this.calls++]+'\n[ Prompt: 1 t/s ]';}
 }
 const worker=new Fixture(process.cwd(),dir),project=newProject();project.brief='A blue ball rests on a table, no sound.';
 const {id}=worker.start({action:'draft',project,model:'fixture',review:true},{profiles:{fixture:{}}});
 while(worker.status().busy)await new Promise(resolve=>setTimeout(resolve,10));
 const job=worker.job(id);assert.equal(job.state,'done',job.error);assert.equal(job.reviewed,true);assert.equal(worker.calls,4);assert.match(job.output,/A blue ball/);
});

test('repeated unusable responses stop after bounded retries',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'h3-review-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 class Fixture extends Inference{calls=0;async generate(config,args){this.calls++;return '> '+await readFile(args[args.indexOf('-f')+1],'utf8')+'\n\n[ Prompt: 1 t/s ]';}}
 const worker=new Fixture(process.cwd(),dir),{id}=worker.start({action:'draft',project:newProject(),model:'fixture',review:true},{profiles:{fixture:{}}});
 while(worker.status().busy)await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(worker.job(id).state,'failed');assert.equal(worker.calls,3);
});
