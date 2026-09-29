import path from 'node:path';
import {mkdir,readdir,cp,readFile,writeFile} from 'node:fs/promises';
export function contained(root,target){const r=path.relative(path.resolve(root),path.resolve(target));return !r||(!r.startsWith('..'+path.sep)&&r!=='..'&&!path.isAbsolute(r));}
export async function copyStorage(source,destination){
  if(!path.isAbsolute(destination)||contained(source,destination)||contained(destination,source))throw Error('Choose an absolute folder separate from the current storage folder.');
  await mkdir(destination,{recursive:true});if((await readdir(destination)).length)throw Error('Choose an empty destination folder. Existing files will not be overwritten.');
  async function rejectLinks(folder){for(const entry of await readdir(folder,{withFileTypes:true})){if(entry.isSymbolicLink())throw Error('Storage contains a symbolic link. Use portable export instead.');if(entry.isDirectory())await rejectLinks(path.join(folder,entry.name));}}
  await rejectLinks(source);await cp(source,destination,{recursive:true,force:false,errorOnExist:true});
  const rewrite=value=>{if(Array.isArray(value))return value.map(rewrite);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,(['path','thumbnail'].includes(k)&&typeof v==='string'&&contained(source,v))?path.join(destination,path.relative(source,v)):rewrite(v)]));return value;};
  async function walk(folder){for(const entry of await readdir(folder,{withFileTypes:true})){const file=path.join(folder,entry.name);if(entry.isDirectory())await walk(file);else if(entry.name.endsWith('.json')){const text=await readFile(file,'utf8');let doc;try{doc=JSON.parse(text);}catch{continue;}await writeFile(file,JSON.stringify(rewrite(doc),null,2));}}}
  for(const folder of ['projects','snapshots','history','trash','assets'])await walk(path.join(destination,folder));
}
