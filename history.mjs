import path from 'node:path';
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';

export async function retainRevision(data,project) {
  const dir=path.join(data,'history',project.id);await mkdir(dir,{recursive:true});
  try {await writeFile(path.join(dir,`${project.revision}.json`),JSON.stringify(project,null,2),{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}
}
export async function historyEntries(data,key) {
  const entries=[];
  for(const [kind,dir] of [['revision',path.join(data,'history',key)],['snapshot',path.join(data,'snapshots')]]) {
    for(const file of await readdir(dir).catch(e=>{if(e.code==='ENOENT')return [];throw e;})) {
      if(!file.endsWith('.json'))continue;
      const p=JSON.parse(await readFile(path.join(dir,file),'utf8'));
      if(p.id===key)entries.push({kind,key:file.slice(0,-5),revision:p.revision,sendVersion:p.sendVersion,branchId:p.branchId||'main',branchName:p.branchName||(p.branchId&&p.branchId!=='main'?'Branch '+p.branchId.slice(0,8):'Main'),restoredAt:p.restoredAt,restoredRevision:p.restoredRevision,parentSnapshotId:p.parentSnapshotId,branchedFrom:p.branchedFrom,date:p.savedAt||p.updated||'',title:p.title,prompt:p.prompt,references:p.references.length,referenceItems:p.references.map(r=>({id:r.id,name:r.name,type:r.type,description:r.description,trimStart:r.trimStart,trimEnd:r.trimEnd})),width:p.width,height:p.height,length:p.length,subjects:p.subjects,brief:p.brief});
    }
  }
  try{
    const p=JSON.parse(await readFile(path.join(data,'projects',key+'.json'),'utf8'));
    entries.push({kind:'current',key:String(p.revision),revision:p.revision,sendVersion:p.sendVersion,branchId:p.branchId||'main',branchName:p.branchName||(p.branchId&&p.branchId!=='main'?'Branch '+p.branchId.slice(0,8):'Main'),restoredAt:p.restoredAt,restoredRevision:p.restoredRevision,parentSnapshotId:p.parentSnapshotId,branchedFrom:p.branchedFrom,date:p.updated||'',title:p.title,prompt:p.prompt,references:p.references.length,referenceItems:p.references.map(r=>({id:r.id,name:r.name,type:r.type,description:r.description,trimStart:r.trimStart,trimEnd:r.trimEnd})),width:p.width,height:p.height,length:p.length,subjects:p.subjects,brief:p.brief});
  }catch(e){if(e.code!=='ENOENT')throw e;}
  const chronological=[...entries].sort((a,b)=>a.revision-b.revision||a.date.localeCompare(b.date));
  for(let i=0;i<chronological.length;i++) {
    const current=chronological[i],previous=chronological.slice(0,i).reverse().find(x=>x.revision<current.revision&&x.branchId===current.branchId)||chronological.find(x=>current.branchedFrom&&x.kind===current.branchedFrom.kind&&x.key===current.branchedFrom.key);
    current.activeBranch=current.branchId===entries.find(x=>x.kind==='current')?.branchId;
    current.changes=[];
    if(previous){
      if(current.prompt!==previous.prompt)current.changes.push(current.prompt.replace(/\s/g,'')===previous.prompt.replace(/\s/g,'')?'Prompt spacing':'Edited prompt');
      if(current.brief!==previous.brief)current.changes.push('Changed idea');
      if(JSON.stringify(current.subjects)!==JSON.stringify(previous.subjects))current.changes.push('Changed subjects');
      if(current.width!==previous.width||current.height!==previous.height)current.changes.push(`Canvas ${previous.width}×${previous.height} → ${current.width}×${current.height}`);
      if(current.length!==previous.length)current.changes.push(`Duration ${previous.length} → ${current.length} frames`);
      for(const r of current.referenceItems){const old=previous.referenceItems.find(x=>x.id===r.id);if(!old)current.changes.push('Added '+r.name);else if(JSON.stringify(old)!==JSON.stringify(r))current.changes.push('Edited '+r.name);}
      for(const r of previous.referenceItems)if(!current.referenceItems.some(x=>x.id===r.id))current.changes.push('Removed '+r.name);
      current.previousPrompt=previous.prompt;
    }else current.changes.push('Initial saved state');
  }
  return entries.sort((a,b)=>b.date.localeCompare(a.date)||b.revision-a.revision);
}
