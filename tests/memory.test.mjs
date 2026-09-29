import test from 'node:test';import assert from 'node:assert/strict';import {classifyMemory,comfyQueues} from '../memory.mjs';import {createServer} from 'node:http';
const GB=1024**3;
test('hybrid capacity includes free GPU memory without treating it as available to CPU-only models',()=>{
 const model={bytes:20*GB};assert.equal(classifyMemory(model,{cpuMoe:true},11*GB,18*GB).state,'ram');assert.equal(classifyMemory(model,{gpuLayers:0},11*GB,18*GB).state,'risk');assert.equal(classifyMemory({bytes:3*GB},{},11*GB,18*GB).state,'vram');assert.equal(classifyMemory(model,{},null,18*GB).state,'unknown');
});
test('queue probe distinguishes active queues and unavailable servers',async()=>{
 let busy=true;const server=createServer((req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({queue_running:busy?[['job']]:[],queue_pending:[]}));});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 try{assert.equal((await comfyQueues([origin]))[0].busy,true);busy=false;assert.equal((await comfyQueues([origin]))[0].busy,false);}finally{await new Promise(resolve=>server.close(resolve));}assert.deepEqual(await comfyQueues([origin]),[]);
});
