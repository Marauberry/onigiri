import path from 'node:path';
import {stat} from 'node:fs/promises';

export async function modelFolders(values){
  if(!Array.isArray(values))throw Error('Provide model folders.');
  const folders=[];
  for(const value of values){
    if(typeof value!=='string')throw Error('Use absolute model paths.');
    let folder=value.trim().replace(/^"(.*)"$/,'$1');
    if(!path.isAbsolute(folder))throw Error('Use absolute model paths.');
    let info;try{info=await stat(folder);}catch{throw Error('Model path is not accessible: '+folder);}
    if(info.isFile()&&/\.gguf$/i.test(folder)){folder=path.dirname(folder);info=await stat(folder);}
    if(!info.isDirectory())throw Error('Choose a folder or a GGUF model file: '+folder);
    folder=path.resolve(folder);
    if(!folders.some(f=>f.toLowerCase()===folder.toLowerCase()))folders.push(folder);
  }
  return folders;
}

export function reconcileProfiles(models,profiles={}){
  const next={...profiles};
  for(const model of models.filter(m=>!m.projector)){
    const matches=Object.entries(profiles).filter(([file])=>path.basename(file).toLowerCase()===path.basename(model.path).toLowerCase());
    const profile={...(profiles[model.path]||(matches.length===1?matches[0][1]:{}))};
    if(!profile.projector||!models.some(m=>m.projector&&m.path.toLowerCase()===profile.projector.toLowerCase())){
      const candidates=models.filter(m=>m.projector&&path.dirname(m.path).toLowerCase()===path.dirname(model.path).toLowerCase());
      profile.projector=candidates.length===1?candidates[0].path:'';
    }
    delete profile.launcher;
    next[model.path]=profile;
  }
  return next;
}
