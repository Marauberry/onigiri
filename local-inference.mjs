import path from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';

export async function checkLocalModel(profile,model){
 const url=new URL(profile.serverUrl);
 if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.protocol!=='http:'||url.username||url.password||url.pathname!=='/')throw Error('The model server must be a local HTTP origin.');
 const response=await fetch(new URL('/props',url),{signal:AbortSignal.timeout(5000)});
 if(!response.ok)throw Error('The configured local model server is unavailable.');
 const props=await response.json();
 if(path.resolve(props.model_path||'').toLowerCase()!==path.resolve(model).toLowerCase())throw Error('The local server is running a different model. Check Model settings.');
 return {url,props};
}
export async function generateLocal(profile,args,folder,pass,attempt,active){
 const value=flag=>args[args.indexOf(flag)+1];
 const {url}=await checkLocalModel(profile,value('-m'));
 const prompt=await readFile(value('-f'),'utf8'),messages=[];
 if(args.includes('--system-prompt-file'))messages.push({role:'system',content:await readFile(value('--system-prompt-file'),'utf8')});
 let content=prompt;
 if(args.includes('--image'))content=[{type:'text',text:prompt},{type:'image_url',image_url:{url:'data:image/jpeg;base64,'+(await readFile(value('--image'))).toString('base64')}}];
 messages.push({role:'user',content});
 const controller=new AbortController();active.controller=controller;
 if(active.cancelled)controller.abort();
 const timer=setTimeout(()=>controller.abort(),600000);
 try{
  const response=await fetch(new URL('/v1/chat/completions',url),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages,max_tokens:Number(value('-n')),temperature:Number(value('--temp')),stream:false,cache_prompt:false,chat_template_kwargs:{enable_thinking:false}}),signal:controller.signal});
  const result=await response.json();
  await writeFile(path.join(folder,`${pass}runtime${attempt||''}.json`),JSON.stringify(result,null,2));
  if(!response.ok)throw Error(result.error?.message||'Local model request failed.');
  const answer=result.choices?.[0];
  if(answer?.finish_reason==='length')throw Error('The model response reached its token limit. Increase output tokens or simplify the request.');
  return '> '+prompt+'\n'+(answer?.message?.content||'')+'\n[ Prompt: local server ]';
 }finally{clearTimeout(timer);active.controller=null;}
}
