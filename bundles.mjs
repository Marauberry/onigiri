import path from 'node:path';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
export async function digestFile(file){const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');}
export function mediaName(ref,hash){return 'media/'+hash+path.extname(ref.path).toLowerCase();}
export function portableDocument(project,history,files){
  const convert=p=>({...p,references:p.references.map(r=>{const copy={...r,path:files[r.id]||r.path};delete copy.thumbnail;return copy;})});
  return {format:'h3-scene',version:1,project:convert(project),history:history.map(convert),mediaIncluded:Object.keys(files).length>0};
}
