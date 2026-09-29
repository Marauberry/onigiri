import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {checkLocalModel,generateLocal} from '../local-inference.mjs';
test('local server adapter verifies identity and sends independent, non-cached conversations',async t=>{
 const folder=await mkdtemp(path.join(os.tmpdir(),'h3-local-'));t.after(()=>rm(folder,{recursive:true,force:true}));
 const model=path.join(folder,'model.gguf'),calls=[];
 const server=createServer(async(req,res)=>{res.setHeader('Content-Type','application/json');if(req.url==='/props')return res.end(JSON.stringify({model_path:model}));let body='';for await(const part of req)body+=part;calls.push(JSON.parse(body));res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'A useful answer.'}}]}));});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
 const profile={serverUrl:'http://127.0.0.1:'+server.address().port};await assert.rejects(checkLocalModel(profile,path.join(folder,'other.gguf')),/different model/);await assert.rejects(checkLocalModel({serverUrl:'https://example.com'},model),/local HTTP/);
 const promptFile=path.join(folder,'prompt.txt');const args=['-m',model,'-f',promptFile,'-n','900','--temp','0.3'];
 for(const prompt of ['First request','Second fresh request']){await writeFile(promptFile,prompt);const result=await generateLocal(profile,args,folder,'',0,{cancelled:false});assert.match(result,/A useful answer/);}
 assert.equal(calls.length,2);assert.deepEqual(calls[1].messages,[{role:'user',content:'Second fresh request'}]);assert.equal(calls[1].cache_prompt,false);assert.equal(calls[1].chat_template_kwargs.enable_thinking,false);
});
