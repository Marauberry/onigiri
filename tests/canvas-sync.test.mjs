import test from 'node:test';
import assert from 'node:assert/strict';
import {canvasSync} from '../comfyui_h3_prompt_helper/web/canvas-sync.js';
import {folderChildren} from '../public/project-labels.mjs';

test('editor target MP survives node synchronization and return message',async()=>{
 let receive,sent;
 globalThis.window={addEventListener:(type,fn)=>receive=fn,removeEventListener:()=>{}};
 const frame={postMessage:message=>sent=message};
 const node={properties:{},widgets:Object.entries({width:832,height:480,length:124,override_canvas:false}).map(([name,value])=>({name,value})),_h3Floating:{frame:{contentWindow:frame}}};
 const app={graph:{setDirtyCanvas:()=>{}}};
 try{
 canvasSync(node,app);
 receive({origin:'http://127.0.0.1:47831',source:frame,data:{type:'h3-editor-canvas',projectId:'fixture',canvas:{width:608,height:320,length:124,targetMP:.2,aspectRatio:'16:9',sizeMode:'mp'}}});
 assert.equal(node.properties.h3TargetMP,.2);
 node._h3PushCanvas();await new Promise(resolve=>queueMicrotask(resolve));
 assert.equal(sent.canvas.targetMP,.2);assert.equal(sent.canvas.aspectRatio,'16:9');assert.equal(sent.canvas.width,608);
 }finally{delete globalThis.window;}
});

test('a canvas above the old 2048 limit still reaches the node bridge',async()=>{
 let receive,sent;
 globalThis.window={addEventListener:(type,fn)=>receive=fn,removeEventListener:()=>{}};
 const frame={postMessage:message=>sent=message};
 const node={properties:{},widgets:Object.entries({width:832,height:480,length:124,override_canvas:false}).map(([name,value])=>({name,value})),_h3Floating:{frame:{contentWindow:frame}}};
 const app={graph:{setDirtyCanvas:()=>{}}};
 try{
 canvasSync(node,app);
 receive({origin:'http://127.0.0.1:47831',source:frame,data:{type:'h3-editor-canvas',projectId:'fixture',canvas:{width:2720,height:1536,length:124,targetMP:4.194304,aspectRatio:'16:9',sizeMode:'edge:1536'}}});
 assert.equal(node.widgets.find(w=>w.name==='width').value,2720);
 assert.equal(node.widgets.find(w=>w.name==='height').value,1536);
 assert.equal(node.properties.h3SizeMode,'edge:1536');
 node._h3PushCanvas();await new Promise(resolve=>queueMicrotask(resolve));
 assert.equal(sent.canvas.width,2720);assert.equal(sent.canvas.height,1536);
 }finally{delete globalThis.window;}
});

test('legacy nested names remain distinct flat folders with no child folders',()=>{
 assert.deepEqual(folderChildren(['A','A/B','A/B']),['A','A/B']);
 assert.deepEqual(folderChildren(['A','A/B'],'A'),[]);
});

import {heightDimensions,canvasDimensions,shortEdgeDimensions,shortEdgeMP,megapixelPresets,heightPresets,shortEdgePresets,heightLabel} from '../comfyui_h3_prompt_helper/web/canvas-panel.js';
test('resolution presets add the requested megapixels and the 1/2 and 2x official short edges',()=>{
 for(const mp of [.25,.35,.45,1.2,1.4,1.6,1.8])assert.ok(megapixelPresets.includes(mp),`missing ${mp} MP`);
 assert.deepEqual([...megapixelPresets].sort((a,b)=>a-b),megapixelPresets,'megapixel presets stay sorted');
 assert.equal(megapixelPresets.length,18);
 assert.deepEqual(heightPresets,[144,240,360,480,720,1080,1440,2160]);
 assert.equal(heightLabel(1440),'1440p · 2K');assert.equal(heightLabel(2160),'2160p · 4K');assert.equal(heightLabel(720),'720p');
 assert.deepEqual(heightDimensions(16/9,1440),{width:2560,height:1440});
 assert.deepEqual(heightDimensions(16/9,2160),{width:3872,height:2176});
 assert.deepEqual(shortEdgePresets.map(preset=>preset.edge),[384,768,1536]);
 assert.deepEqual(shortEdgeDimensions(1,1536),{width:1536,height:1536});
 assert.deepEqual(shortEdgeDimensions(16/9,384),{width:672,height:384});
 assert.deepEqual(shortEdgeDimensions(16/9,768),{width:1376,height:768});
 assert.deepEqual(shortEdgeDimensions(9/16,768),{width:768,height:1376});
 assert.deepEqual(shortEdgeDimensions(16/9,1536),{width:2720,height:1536});
 assert.equal(shortEdgeMP(16/9,768).toFixed(4),'1.0486');
});
test('standard-height sizing follows aspect ratio after 32-pixel alignment',()=>{assert.deepEqual(heightDimensions(16/9,720),{width:1312,height:736});assert.deepEqual(heightDimensions(9/16,1080),{width:608,height:1088});assert.deepEqual(heightDimensions(21/9,1080),{width:2528,height:1088});assert.deepEqual(canvasDimensions(832/480,.98),{width:1312,height:736});});
