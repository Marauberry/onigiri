import {createHash} from 'node:crypto';

export const memoryHash = messages => createHash('sha256').update(JSON.stringify(messages.map(({id,role,text,referenceIds})=>({id,role,text,referenceIds})))).digest('hex');
export function rememberedConversation(project){
  const messages=project.directorMessages||[],memory=project.directorMemory;
  const end=memory?messages.findIndex(m=>m.id===memory.throughId):-1;
  if(end<0||memory.sourceHash!==memoryHash(messages.slice(0,end+1)))return messages;
  return [{role:'memory',text:memory.text},...messages.slice(end+1)];
}
export function memoryBatch(project){
  const messages=rememberedConversation(project);
  if(JSON.stringify(messages).length<10000||messages.length<8)return null;
  // Keep the most recent exchange verbatim, including the complete newest client turn.
  const older=[];let size=0;for(const message of messages.slice(0,-4)){const length=JSON.stringify(message).length;if(older.length&&size+length>11000)break;older.push(message);size+=length;}const last=older.at(-1);
  if(!last?.id)return null;
  const original=project.directorMessages,through=original.findIndex(m=>m.id===last.id);
  return {messages:older,throughId:last.id,sourceHash:memoryHash(original.slice(0,through+1))};
}
