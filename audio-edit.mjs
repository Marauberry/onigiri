import path from 'node:path';import {readFile,mkdir,writeFile,unlink} from 'node:fs/promises';import {createReadStream} from 'node:fs';import {randomUUID} from 'node:crypto';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
const exec=promisify(execFile);
export async function prepareAudio(request,{data,ffmpeg,upload,url}){
  const cuts=request.cuts;if(!Array.isArray(cuts)||cuts.length<1||cuts.length>12)throw Error('Choose one to twelve audio ranges.');
  const keys=[...new Set([request.id,...cuts.map(c=>c.sourceId||request.id)])],sources=[];
  for(const key of keys){if(!/^[a-f0-9-]{36}$/i.test(key))throw Error('Invalid audio source.');const r=JSON.parse(await readFile(path.join(data,'assets',key+'.json'),'utf8'));if(r.type!=='audio')throw Error('Choose audio clips for an audio sequence.');sources.push(r);}
  let duration=0;for(const c of cuts){const src=sources.find(s=>s.id===(c.sourceId||request.id));if(!Number.isFinite(c.start)||!Number.isFinite(c.end)||c.start<0||c.end<=c.start||c.end>src.duration+.001)throw Error('Keep the range inside its audio source.');duration+=c.end-c.start;}
  const target=request.targetDuration===undefined?duration:Number(request.targetDuration);if(duration<2||duration>15.05||!Number.isFinite(target)||target<2||target>15.05)throw Error('Combined and output audio must be 2–15 seconds.');
  const filters=cuts.map((c,i)=>`[${sources.findIndex(s=>s.id===(c.sourceId||request.id))}:a]atrim=start=${c.start}:end=${c.end},asetpts=PTS-STARTPTS,aresample=32000,aformat=channel_layouts=stereo[a${i}]`);
  filters.push(cuts.map((_,i)=>`[a${i}]`).join('')+`concat=n=${cuts.length}:v=0:a=1[joined]`);let remaining=duration/target,tempos=[];while(remaining>2){tempos.push('atempo=2');remaining/=2;}while(remaining<.5){tempos.push('atempo=0.5');remaining/=.5;}tempos.push('atempo='+remaining);filters.push('[joined]'+tempos.join(',')+'[out]');
  const folder=path.join(data,'jobs',randomUUID());await mkdir(folder,{recursive:true});const output=path.join(folder,'audio.wav');
  await exec(ffmpeg,['-v','error',...sources.flatMap(s=>['-i',s.path]),'-filter_complex',filters.join(';'),'-map','[out]','-c:a','pcm_s16le','-y',output],{windowsHide:true,timeout:300000,maxBuffer:1024*1024});
  try{const targetUrl=new URL('/api/assets',url);targetUrl.searchParams.set('name',path.parse(sources[0].name).name+'-edited.wav');const asset=await upload(createReadStream(output),targetUrl);asset.provenance={sourceAssetId:request.id,sourceAssetIds:keys,cuts,speed:duration/target,outputDuration:target};asset.description=String(request.description||'');await writeFile(path.join(data,'assets',asset.id+'.json'),JSON.stringify(asset));return asset;}finally{await unlink(output).catch(()=>{});}
}
