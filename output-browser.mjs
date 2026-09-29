import path from 'node:path';
import {realpath,readdir,stat} from 'node:fs/promises';

const extensions={image:['.png','.jpg','.jpeg','.webp','.gif','.bmp'],video:['.mp4','.webm','.mov','.mkv','.avi'],audio:['.wav','.mp3','.flac','.ogg','.m4a','.aac']};
const mediaType=name=>Object.keys(extensions).find(type=>extensions[type].includes(path.extname(name).toLowerCase()));
const inside=(root,target)=>{const rel=path.relative(root,target);return rel===''||(!path.isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+path.sep));};
const portable=relative=>relative.split(path.sep).join('/');

/** Resolve an untrusted relative browser path against the canonical output root. */
export async function resolveOutput(root,relative=''){
  if(typeof relative!=='string'||relative.includes('\0')||path.isAbsolute(relative)||path.win32.isAbsolute(relative)||relative.split(/[\\/]/).includes('..'))throw new Error('Output path must stay inside the output folder.');
  const canonicalRoot=await realpath(root),candidate=path.resolve(canonicalRoot,relative.replace(/[\\/]/g,path.sep));
  if(!inside(canonicalRoot,candidate))throw new Error('Output path must stay inside the output folder.');
  const resolved=await realpath(candidate);
  if(!inside(canonicalRoot,resolved))throw new Error('Output link points outside the output folder.');
  return resolved;
}

export async function browseComfyOutput({root,folder=''}){
  const canonicalRoot=await realpath(root),directory=await resolveOutput(canonicalRoot,folder);
  if(!(await stat(directory)).isDirectory())throw new Error('Select an output folder.');
  const entries=await readdir(directory,{withFileTypes:true}),items=[];
  let eligible=0,skipped=0;
  // Bound entries examined as well as results returned; very large directories
  // disclose the scan cap instead of pretending the response is complete.
  const scanLimit=2000,visible=entries.filter(e=>!e.name.startsWith('.')).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
  for(const entry of visible.slice(0,scanLimit)){
    try{
      const lexical=path.join(directory,entry.name),relative=portable(path.relative(canonicalRoot,lexical));
      const resolved=await resolveOutput(canonicalRoot,relative),info=await stat(resolved);
      const kind=info.isDirectory()?'folder':info.isFile()&&mediaType(entry.name)?'file':null;
      if(!kind)continue;
      eligible++;
      items.push({kind,name:entry.name,path:relative,...(kind==='file'?{type:mediaType(entry.name)}:{})});
    }catch{skipped++;}
  }
  items.sort((a,b)=>(a.kind==='folder'?0:1)-(b.kind==='folder'?0:1)||a.name.localeCompare(b.name,undefined,{numeric:true}));
  const listed=items.slice(0,250);
  // At most five folders get covers, sharing a bounded traversal budget. Each
  // preview is a relative media path, never an unrestricted filesystem URL.
  const budget={remaining:300};
  async function covers(relative,depth=0,seen=new Set()){
    const found=[];
    if(depth>2||budget.remaining<=0)return found;
    let dir;try{dir=await resolveOutput(canonicalRoot,relative);}catch{return found;}
    if(seen.has(dir))return found;seen.add(dir);
    const children=await readdir(dir,{withFileTypes:true}).catch(()=>[]);
    const nested=[];
    for(const child of children){
      if(budget.remaining--<=0)break;if(child.name.startsWith('.'))continue;
      const childPath=portable(path.join(relative,child.name));
      try{
        const resolved=await resolveOutput(canonicalRoot,childPath),info=await stat(resolved),type=mediaType(child.name);
        if(info.isFile()&&type){found.push({path:childPath,type});if(found.length===5)return found;}
        else if(info.isDirectory())nested.push(childPath);
      }catch{}
    }
    for(const child of nested){found.push(...await covers(child,depth+1,seen));if(found.length>=5)break;}
    return found.slice(0,5);
  }
  for(const item of listed.filter(i=>i.kind==='folder').slice(0,5))item.preview=await covers(item.path);
  return {folder:portable(path.relative(canonicalRoot,directory)),items:listed,truncated:eligible>250||visible.length>scanLimit,limit:250,scanLimit,skipped};
}
