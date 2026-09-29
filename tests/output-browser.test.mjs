import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {mkdtemp,mkdir,writeFile,symlink,rm,realpath} from 'node:fs/promises';
import {browseComfyOutput,resolveOutput} from '../output-browser.mjs';

test('output browser lists immediate folders and media with bounded nested covers',async t=>{
  const temp=await mkdtemp(path.join(os.tmpdir(),'h3-output-'));t.after(()=>rm(temp,{recursive:true,force:true}));
  await mkdir(path.join(temp,'scene','takes'),{recursive:true});
  for(const name of ['scene/takes/clip.mp4','scene/still.png','voice.wav','ignore.txt','.hidden.png'])await writeFile(path.join(temp,name),'fixture');
  const result=await browseComfyOutput({root:temp});
  assert.deepEqual(result.items.map(x=>[x.kind,x.name]),[['folder','scene'],['file','voice.wav']]);
  assert.deepEqual(result.items[0].preview.map(x=>x.path),['scene/still.png','scene/takes/clip.mp4']);
  assert.equal(result.truncated,false);
  assert.equal((await browseComfyOutput({root:temp,folder:'scene/takes'})).items[0].type,'video');
  assert.equal(await resolveOutput(temp,'voice.wav'),await realpath(path.join(temp,'voice.wav')));
  for(const escape of ['../outside','scene/../../outside','C:\\outside','/outside','..\\outside'])await assert.rejects(resolveOutput(temp,escape));
  await assert.rejects(browseComfyOutput({root:temp,folder:'voice.wav'}));
});

test('output browser limits listings and refuses symlinks that leave root',async t=>{
  const temp=await mkdtemp(path.join(os.tmpdir(),'h3-output-bound-'));t.after(()=>rm(temp,{recursive:true,force:true}));
  const root=path.join(temp,'output'),outside=path.join(temp,'other');await mkdir(root);await mkdir(outside);
  await writeFile(path.join(outside,'secret.png'),'fixture');
  await Promise.all(Array.from({length:251},(_,i)=>writeFile(path.join(root,`${i}.png`),'fixture')));
  let linked=false;try{await symlink(outside,path.join(root,'outside'),'junction');linked=true;}catch(error){t.diagnostic(`Symlink creation unavailable: ${error.code}`);}
  const result=await browseComfyOutput({root});assert.equal(result.items.length,250);assert.equal(result.truncated,true);
  assert.ok(!result.items.some(x=>x.name==='outside'));
  if(linked){await assert.rejects(resolveOutput(root,'outside/secret.png'));assert.ok(result.skipped>=1);}
});
