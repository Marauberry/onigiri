export const latestClientId=p=>(p.directorMessages||[]).filter(m=>m.role==='user').at(-1)?.id||null;
export function revisionRequests(p){
 const messages=p.directorMessages||[],last=p.lastArrangement?.messageId;
 const at=last?messages.findIndex(m=>m.id===last):-1;
 return messages.slice(at+1).filter(m=>m.role==='user').map(m=>m.text);
}
export function applyArrangement(p,result){
 if(result.sourceMessageId!==latestClientId(p))throw Error('This draft belongs to an older message. Arrange again with the current conversation.');
 if(!result.output?.trim())throw Error('The Director returned an empty draft. Your previous prompt is preserved.');
 const unchanged=result.output.trim()===p.prompt.trim();
 if(unchanged&&revisionRequests(p).length)throw Error('The model returned the same prompt despite new direction. No revision was applied. Clarify the change or arrange again.');
 const previous=p.prompt;
 p.prompt=result.output;
 p.lastArrangement={jobId:result.id,messageId:result.sourceMessageId,number:(p.lastArrangement?.number||0)+1,at:new Date().toISOString(),changed:!unchanged};
 return {previous,unchanged,number:p.lastArrangement.number};
}
