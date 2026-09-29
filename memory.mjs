import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile),GB=1024**3;
export function classifyMemory(model,profile,gpuFree,ramFree){
  if(!model||gpuFree===null)return {state:'unknown',required:null};
  const overhead=2*GB+(Number(profile.context||8192)/8192)*GB,required=model.bytes+overhead;
  const gpuBudget=Math.max(0,gpuFree-GB),ramBudget=Math.max(0,ramFree-2*GB);
  const cpuOnly=String(profile.gpuLayers)==='0';
  // A hybrid model can use both memory pools. This is a capacity estimate, not measured placement.
  const capacity=ramBudget+(cpuOnly?0:gpuBudget);
  const state=!cpuOnly&&!profile.cpuMoe&&gpuBudget>=required?'vram':capacity>=required?'ram':'risk';
  return {state,required};
}
export async function comfyQueues(origins) {
  return (await Promise.all(origins.map(async origin=>{try{const response=await fetch(origin+'/queue',{signal:AbortSignal.timeout(1500)});if(!response.ok)return null;const q=await response.json();if(!Array.isArray(q.queue_running)||!Array.isArray(q.queue_pending))return null;return {origin,busy:q.queue_running.length+q.queue_pending.length>0};}catch{return null;}}))).filter(Boolean);
}
export async function memoryEstimate(model,profile={}) {
  let gpuFree=null;
  try{const {stdout}=await exec('nvidia-smi',['--query-gpu=memory.free','--format=csv,noheader,nounits'],{windowsHide:true,timeout:3000});gpuFree=Number(stdout.trim().split('\n')[0])*1024**2;}catch{}
  const ramFree=os.freemem(),{state,required}=classifyMemory(model,profile,gpuFree,ramFree);
  return {state,gpuFree,ramFree,ramTotal:os.totalmem(),required,estimated:true,label:{unknown:'Memory estimate unavailable',vram:'Estimated to fit in VRAM',ram:'Estimated hybrid / RAM placement',risk:'Estimated low capacity · paging possible'}[state]};
}
