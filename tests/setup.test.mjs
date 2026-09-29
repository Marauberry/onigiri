import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

test('Comfy installer can run twice and preserves local bridge settings and files', {skip:process.platform!=='win32'},()=>{
 const root=mkdtempSync(join(tmpdir(),'onigiri-install-'));
 const app=join(root,'app'),comfy=join(root,'ComfyUI');
 for(const p of ['scripts','comfyui_h3_prompt_helper/web'])mkdirSync(join(app,p),{recursive:true});
 mkdirSync(join(comfy,'comfy_extras'),{recursive:true});
 writeFileSync(join(comfy,'comfy_extras/nodes_minimax_h3.py'),'');
 copyFileSync('scripts/install-comfy.ps1',join(app,'scripts/install-comfy.ps1'));
 writeFileSync(join(app,'config.local.json'),JSON.stringify({ffmpeg:'ffmpeg',modelDirs:['keep']}));
 const source=join(app,'comfyui_h3_prompt_helper/__init__.py');writeFileSync(source,'version1');
 const run=()=>{const r=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',join(app,'scripts/install-comfy.ps1'),'-ComfyRoot',comfy],{encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);};
 run();
 const dest=join(comfy,'custom_nodes/comfyui_h3_prompt_helper');
 writeFileSync(join(dest,'helper_config.json'),JSON.stringify({port:47899,custom:'preserve'}));
 writeFileSync(join(dest,'local.txt'),'keep');writeFileSync(source,'version2');run();
 assert.equal(readFileSync(join(dest,'__init__.py'),'utf8'),'version2');
 const config=JSON.parse(readFileSync(join(dest,'helper_config.json'),'utf8').replace(/^\uFEFF/,''));
 assert.equal(config.port,47899);assert.equal(config.custom,'preserve');assert.equal(config.helperRoot,app);
 assert.equal(readFileSync(join(dest,'local.txt'),'utf8'),'keep');
 assert.deepEqual(JSON.parse(readFileSync(join(app,'config.local.json'))).modelDirs,['keep']);
});

test('starter has only native/Onigiri nodes and every link is reciprocal',()=>{
 const w=JSON.parse(readFileSync('workflows/Onigiri Starter.json'));
 const allowed=new Set(['BasicGuider','KSamplerSelect','UNETLoader','CLIPLoader','VAELoader','BasicScheduler','VAEDecode','VAEDecodeAudio','SamplerCustomAdvanced','CreateVideo','RandomNoise','H3GuideConditioningV2','H3SceneGuideV3','SaveVideo']);
 const nodes=new Map(w.nodes.map(n=>[n.id,n]));
 for(const n of w.nodes)assert.ok(allowed.has(n.type),n.type);
 for(const [id,from,out,to,input,type] of w.links){assert.ok(nodes.get(from).outputs[out].links.includes(id));assert.equal(nodes.get(to).inputs[input].link,id);assert.equal(nodes.get(from).outputs[out].type,type);assert.equal(nodes.get(to).inputs[input].type,type);}
 for(const n of w.nodes){for(const input of n.inputs||[])if(input.link!==null)assert.ok(w.links.some(l=>l[0]===input.link));}
 const guide=w.nodes.find(n=>n.type==='H3SceneGuideV3');assert.equal(guide.widgets_values[0],'');assert.equal(guide.widgets_values[1],'');
});
