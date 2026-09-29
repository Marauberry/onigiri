import {open} from 'node:fs/promises';
// Read bounded GGUF metadata only; never load tensor weights into Node memory.
export async function modelMetadata(file){
 const f=await open(file,'r');let offset=0;const limit=32*1024*1024;
 const buffer=Buffer.alloc(Math.min(limit,(await f.stat()).size));const read=await f.read(buffer,0,buffer.length,0);
 async function bytes(n){if(n<0||offset+n>limit)throw Error('Metadata exceeds scan limit');if(offset+n>read.bytesRead)throw Error('Truncated GGUF');const b=buffer.subarray(offset,offset+n);offset+=n;return b;}
 const u32=async()=> (await bytes(4)).readUInt32LE(),u64=async()=>{const n=Number((await bytes(8)).readBigUInt64LE());if(!Number.isSafeInteger(n))throw Error('Invalid GGUF length');return n;};
 const str=async()=>{const n=await u64();return (await bytes(n)).toString('utf8');};
 async function value(t,keep=true,depth=0){if(depth>4)throw Error('Invalid metadata nesting');if(t===8)return str();if(t===9){const type=await u32(),n=await u64();if(n>2000000)throw Error('Invalid array');for(let i=0;i<n;i++)await value(type,false,depth+1);return null;}const sizes={0:1,1:1,2:2,3:2,4:4,5:4,6:4,7:1,10:8,11:8,12:8};if(!sizes[t])throw Error('Unknown metadata type');const b=await bytes(sizes[t]);if(!keep)return null;return t===4?b.readUInt32LE():t===5?b.readInt32LE():t===10?Number(b.readBigUInt64LE()):t===7?!!b[0]:null;}
 try{if((await bytes(4)).toString()!=='GGUF')throw Error('Not GGUF');const version=await u32();if(version<2||version>3)throw Error('Unsupported GGUF');await u64();const count=await u64();if(count>100000)throw Error('Invalid metadata count');const metadata={};for(let i=0;i<count;i++){const key=await str(),type=await u32(),keep=/^general\.(architecture|name|basename|finetune|file_type)$|nextn|mtp/i.test(key);const v=await value(type,keep);if(keep)metadata[key]=v;}return {metadata,metadataState:'read'};}catch(e){return {metadata:{},metadataState:e.message};}finally{await f.close();}
}
export function modelLabels(name,metadata={}){
 const labels=[],architecture=metadata['general.architecture'],rawFamily=architecture||name.match(/qwen|gemma|llama|mistral|deepseek|phi/i)?.[0],family=rawFamily?.replace(/^qwen.*/i,'Qwen').replace(/^gemma.*/i,'Gemma').replace(/^llama.*/i,'Llama');
 if(family)labels.push({text:family,source:metadata['general.architecture']?'GGUF architecture':'Filename'});
 const types={0:'F32',1:'F16',2:'Q4_0',3:'Q4_1',7:'Q8_0',8:'Q5_0',9:'Q5_1',10:'Q2_K',11:'Q3_K_S',12:'Q3_K_M',13:'Q3_K_L',14:'Q4_K_S',15:'Q4_K_M',16:'Q5_K_S',17:'Q5_K_M',18:'Q6_K',19:'IQ2_XXS',20:'IQ2_XS',21:'Q2_K_S',22:'IQ3_XS',23:'IQ3_XXS',24:'IQ1_S',25:'IQ4_NL',26:'IQ3_S',27:'IQ3_M',28:'IQ2_S',29:'IQ2_M',30:'IQ4_XS',31:'IQ1_M',32:'BF16'};
 const fileType=types[metadata['general.file_type']],quant=fileType||name.match(/(?:IQ|Q)\d+(?:_[A-Z0-9]+)+|BF16|F16|F32/i)?.[0];if(quant)labels.push({text:quant.toUpperCase(),source:fileType?'GGUF general.file_type (predominant tensor format)':'Filename quantization label'});
 if(/uncensored/i.test(name+' '+(metadata['general.finetune']||'')))labels.push({text:'Uncensored',source:'Publisher label; not a behavior guarantee'});
 const mtp=Object.entries(metadata).some(([k,v])=>/nextn_predict_layers|mtp.*(count|layers)/i.test(k)&&Number(v)>0);
 if(mtp)labels.push({text:'MTP head',source:'GGUF head metadata; runtime pairing still requires testing'});
 else if(/mtp/i.test(name))labels.push({text:'MTP · unverified',source:'Filename only'});
 return {labels,mtpDetected:mtp};
}
