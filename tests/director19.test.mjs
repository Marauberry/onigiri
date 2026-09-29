import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {memoryBatch,rememberedConversation} from '../director-memory.mjs';
import {applyOrganization} from '../organization.mjs';
import {modelFolders} from '../model-paths.mjs';
import {newProject} from '../public/domain.mjs';

test('memory preserves recent corrections and invalidates after editing older decisions',()=>{
 const p=newProject();p.directorMessages=Array.from({length:14},(_,i)=>({id:String(i),role:i%2?'assistant':'user',text:'Keep the red coat. '.repeat(70)}));
 p.directorMessages.push({id:'latest',role:'user',text:'Actually use a blue coat. No music.'});
 const batch=memoryBatch(p);assert.ok(batch);
 p.directorMemory={...batch,text:'Client requested a red coat.'};
 const context=rememberedConversation(p);assert.equal(context[0].role,'memory');assert.equal(context.at(-1).text,'Actually use a blue coat. No music.');assert.equal(p.directorMessages.length,15);
 p.directorMessages[0].text='Keep green instead.';assert.equal(rememberedConversation(p).length,15);
});
test('organizer attaches motion and appearance to the same existing subject',()=>{
 const p=newProject();p.references=[{id:'pic',type:'image'},{id:'vid',type:'video'}];p.subjects=[{id:'person',name:'Person',sources:[{sourceId:'pic'}],description:'A person'}];
 const result=applyOrganization(p,JSON.stringify({references:[{reference:'<Picture 1>',tags:['appearance'],carry:'Identity only'},{reference:'<Video 1>',tags:['motion'],carry:'Movement only'}],subjects:[{subject:'<Subject 1>',name:'Person',definition:'Person from the picture',references:['<Picture 1>','<Video 1>']}]}));
 assert.equal(result.subjects.length,1);assert.deepEqual(result.subjects[0].sources.map(s=>s.sourceId),['pic','vid']);assert.equal(result.subjects[0].id,'person');
 assert.throws(()=>applyOrganization(p,JSON.stringify({clarification:'Which person should follow the motion?'})),/Before arranging/);
});
test('organizer label alias updates an identity rather than duplicating prior revisions',()=>{
 const p=newProject();p.subjects=[{id:'ball',name:'Blue ball',description:'Blue',sources:[]}];
 for(const color of ['green','red','yellow']){
  const result=applyOrganization(p,JSON.stringify({references:[],subjects:[{label:'<Subject 1>',name:color+' ball',definition:color,references:[]}]}));
  p.subjects=result.subjects;assert.equal(p.subjects.length,1);assert.equal(p.subjects[0].id,'ball');assert.equal(p.subjects[0].description,color);assert.equal(p.subjects[0].name,color+' ball');
 }
 assert.throws(()=>applyOrganization(p,JSON.stringify({references:[],subjects:[{subject:'<Subject 9>',name:'Ghost',definition:'Unknown',references:[]}]})),/Unknown existing subject/);
});
test('model folder input accepts quoted GGUF file paths and deduplicates folders',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'onigiri-path-'));try{const file=path.join(dir,'Bonsai.gguf');await writeFile(file,'fixture');assert.deepEqual(await modelFolders(['"'+file+'"',dir]),[dir]);await assert.rejects(()=>modelFolders([path.join(dir,'missing')]),/not accessible/);}finally{await rm(dir,{recursive:true,force:true});}
});
import {reconcileProfiles} from '../model-paths.mjs';
test('moved model profiles follow exact filenames and repair projector paths without ambiguous matching',()=>{
 const model=path.resolve('new/Bonsai.gguf'),projector=path.resolve('new/mmproj.gguf');
 const old={[path.resolve('old/Bonsai.gguf')]:{context:8192,projector:path.resolve('old/mmproj.gguf')}};
 const migrated=reconcileProfiles([{path:model},{path:projector,projector:true}],old);assert.equal(migrated[model].context,8192);assert.equal(migrated[model].projector,projector);
 const ambiguous=reconcileProfiles([{path:model},{path:projector,projector:true},{path:path.resolve('new/mmproj2.gguf'),projector:true}],old);assert.equal(ambiguous[model].projector,'');
});
