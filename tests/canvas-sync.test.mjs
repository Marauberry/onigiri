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

test('legacy nested names remain distinct flat folders with no child folders',()=>{
 assert.deepEqual(folderChildren(['A','A/B','A/B']),['A','A/B']);
 assert.deepEqual(folderChildren(['A','A/B'],'A'),[]);
});

import {heightDimensions,canvasDimensions} from '../comfyui_h3_prompt_helper/web/canvas-panel.js';
test('standard-height sizing follows aspect ratio after 32-pixel alignment',()=>{assert.deepEqual(heightDimensions(16/9,720),{width:1312,height:736});assert.deepEqual(heightDimensions(9/16,1080),{width:608,height:1088});assert.equal(heightDimensions(21/9,1080),null);assert.deepEqual(canvasDimensions(832/480,.98),{width:1312,height:736});});
