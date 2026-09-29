import {ModelDownload} from './model-download.mjs';
import {modelFolders,reconcileProfiles} from './model-paths.mjs';
import {checkLocalModel} from './local-inference.mjs';
import {browseComfyOutput,resolveOutput} from './output-browser.mjs';
import {modelMetadata,modelLabels} from './model-metadata.mjs';
import {prepareAudio} from './audio-edit.mjs';
import http from 'node:http';

import path from 'node:path';

import {fileURLToPath} from 'node:url';

import {mkdir, readFile, writeFile, rename, readdir, stat, unlink,copyFile} from 'node:fs/promises';
import {createReadStream, createWriteStream, existsSync} from 'node:fs';

import {pipeline} from 'node:stream/promises';

import {Transform} from 'node:stream';

import {randomUUID, randomBytes} from 'node:crypto';

import {execFile} from 'node:child_process';

import {promisify} from 'node:util';

import {newProject, referenceMap, validate} from './public/domain.mjs';

import {Inference} from './worker.mjs';

import {retainRevision,historyEntries} from './history.mjs';
import {memoryEstimate,comfyQueues} from './memory.mjs';
import {digestFile,mediaName,portableDocument} from './bundles.mjs';
import {coverId,duplicateProject,starterTemplates,normalizeHomeFolders} from './public/projects.mjs';
import {copyStorage,contained} from './storage.mjs';

export const ROOT = path.dirname(fileURLToPath(import.meta.url));
const modelDownload=new ModelDownload(ROOT);
const CONFIG=path.resolve(process.env.H3_CONFIG_PATH||path.join(ROOT,'config.local.json'));

const exec = promisify(execFile);

let DATA = path.resolve(process.env.H3_DATA_DIR || path.join(ROOT, 'data')),movingStorage=false,activeRequests=0;

// Reading every snapshot file to rebuild send versions is expensive (hundreds of files).
// Snapshots are immutable, so the map is cached until the snapshots folder itself changes.
let snapshotVersionCache={dir:null,stamp:null,map:null};
async function snapshotVersions(){

  const dir=path.join(DATA,'snapshots');

  let stamp='missing';

  try{const info=await stat(dir);stamp=info.mtimeMs+':'+info.size;}catch{}

  if(snapshotVersionCache.dir===dir&&snapshotVersionCache.stamp===stamp&&snapshotVersionCache.map)return snapshotVersionCache.map;

  const versions=new Map();

  try{

    for(const file of (await readdir(dir)).filter(f=>f.endsWith('.json'))){const snapshot=JSON.parse(await readFile(path.join(dir,file),'utf8'));versions.set(snapshot.id,Math.max(versions.get(snapshot.id)||0,snapshot.sendVersion||0));}

  }catch{}

  snapshotVersionCache={dir,stamp,map:versions};

  return versions;

}

const port = Number(process.env.H3_PORT ||  47831);

const csrf = randomBytes(24).toString('hex');

const sessions = new Map();

const projectLocks = new Map();
const comfyOrigins=new Set(['http://127.0.0.1:8188','http://127.0.0.1:8189']);
function withProjectLock(key, action) {

  const next=(projectLocks.get(key) || Promise.resolve()).catch(()=>{}).then(action);

  projectLocks.set(key,next);

  next.finally(()=>{if(projectLocks.get(key)===next)projectLocks.delete(key);}).catch(()=>{});

  return next;

}

let modelCache = [];
let config = {modelDirs: [], runtimeDir: path.join(ROOT, 'runtime'), ffmpeg: 'ffmpeg', profiles: {}, detailEnhancement: true, reviewDraft: true, notifySound: true, notifyVisual: true};

try { config = {...config, ...JSON.parse((await readFile(CONFIG, 'utf8')).replace(/^\uFEFF/,''))}; } catch (e) { if (e.code !== 'ENOENT') throw e; }
delete config.characterLibrary;
delete config.connectors;
for(const profile of Object.values(config.profiles))delete profile.launcher;
config.modelDirs=config.modelDirs.slice(0,1);
if(!process.env.H3_DATA_DIR&&config.dataDir)DATA=path.resolve(config.dataDir);

await Promise.all(['projects', 'assets', 'snapshots', 'jobs','history','trash'].map(d => mkdir(path.join(DATA,d), {recursive:true})));

const worker = new Inference(ROOT, DATA);


const json = (res, value, code=200) => { res.writeHead(code, {'Content-Type':'application/json', 'Cache-Control':'no-store'}); res.end(JSON.stringify(value)); };

const idPattern = /^[a-zA-Z0-9_-]{1,100}$/;

function id(value) { if (!idPattern.test(value || '')) throw new Error('Invalid identifier.'); return value; }

async function body(req, max = 2 * 1024 * 1024) {

  let size=0; const chunks=[];

  for await (const c of req) { size += c.length; if (size > max) throw new Error('Request is too large.'); chunks.push(c); }

  return JSON.parse(Buffer.concat(chunks).toString() || '{}');

}

async function atomic(file, data) { const temp = file + '.' + randomUUID() + '.tmp'; await writeFile(temp, JSON.stringify(data,null,2)); for(let attempt=0;;attempt++){try{await rename(temp,file);break;}catch(error){if(!['EPERM','EACCES','EBUSY'].includes(error.code)||attempt===5)throw error;await new Promise(resolve=>setTimeout(resolve,50*(attempt+1)));}} }

async function loadProject(key) { return JSON.parse(await readFile(path.join(DATA,'projects',id(key)+'.json'),'utf8')); }

function projectShape(p) {

  if (p.schema !== 1 || p.mode !== 'ref2va' || typeof p.prompt !== 'string' || !Array.isArray(p.references) || !Array.isArray(p.subjects)) throw new Error('Unsupported project format.');

  id(p.id);

  if (p.prompt.length > 100000 || p.references.length > 100 || p.subjects.length > 100) throw new Error('Project is too large.');

  if (new Set(p.references.map(r => r.id)).size !== p.references.length) throw new Error('Duplicate reference identity.');

}

async function hydrate(p) {

  projectShape(p);
  if(p.coverAssetId)await readFile(path.join(DATA,'assets',id(p.coverAssetId)+'.json'),'utf8');

  const refs = [];

  for (const r of p.references) {

    const saved = JSON.parse(await readFile(path.join(DATA,'assets',id(r.id)+'.json'),'utf8'));

    refs.push({...saved,tags:Array.isArray(r.tags)?r.tags.filter(t=>typeof t==='string').slice(0,8):[],autoCarry:r.autoCarry===true,observationKey:typeof r.observationKey==='string'?r.observationKey:undefined,directorObservation:typeof r.directorObservation==='string'?r.directorObservation.slice(0,2400):'',provenance:r.provenance||saved.provenance,roleSelections:r.roleSelections,savedDescription:r.savedDescription,rolePath:r.rolePath,roleDetail:r.roleDetail,roleLabel:r.roleLabel, name:String(r.name || saved.name), description:String(r.description || ''), trimStart:Number(r.trimStart || 0), trimEnd:Number(r.trimEnd || saved.duration || 0), withAudio:r.withAudio === true});

  }

  return {...p, references:refs};

}

async function scanModels() {

  const found=[]; const scanErrors=[];

  async function walk(dir, depth=0) {

    if (depth > 5) return;

    let entries; try { entries = await readdir(dir,{withFileTypes:true}); } catch(e) { scanErrors.push(`${dir}: ${e.code}`); return; }

    for (const e of entries) {

      const file = path.join(dir,e.name);

      if (e.isDirectory()) await walk(file,depth+1);

      else if (e.isFile() && e.name.toLowerCase().endsWith('.gguf')) found.push({path:file, name:e.name, bytes:(await stat(file)).size, projector:/mmproj/i.test(e.name)});

    }

  }

  for (const dir of config.modelDirs) await walk(dir);

  modelCache = found.filter((m,i,a) => a.findIndex(x => x.path === m.path) === i);

  for(const m of modelCache){const result=await modelMetadata(m.path);Object.assign(m,result,modelLabels(m.name,result.metadata));}
  config.profiles=reconcileProfiles(modelCache,config.profiles);
  return {models:modelCache, errors:scanErrors,profiles:config.profiles};

}

async function mediaProbe(file) {

  const ffprobe = path.join(path.dirname(config.ffmpeg), process.platform === 'win32' ? 'ffprobe.exe':'ffprobe');

  const {stdout} = await exec(ffprobe,['-v','error','-show_format','-show_streams','-of','json',file], {windowsHide:true,maxBuffer:1024*1024});

  return JSON.parse(stdout);

}

async function upload(req,url) {

  const original = path.basename(url.searchParams.get('name') || '');

  const ext=path.extname(original).toLowerCase();

  const type = ['.png','.jpg','.jpeg','.webp','.bmp'].includes(ext) ? 'image' : ['.mp4','.mov','.webm','.mkv'].includes(ext) ? 'video' : ['.wav','.mp3','.flac','.ogg','.m4a'].includes(ext) ? 'audio' : null;

  if (!type) throw new Error('Choose a PNG, JPEG, WebP, BMP, video, or audio file.');

  const key=randomUUID(), file=path.join(DATA,'assets',key+ext);

  let bytes=0;

  try {

    await pipeline(req,new Transform({transform(chunk,enc,cb) {bytes+=chunk.length; cb(bytes > 1024**3 ? new Error('Maximum file size is 1 GB.') : null,chunk);}}),createWriteStream(file,{flags:'wx'}));

    const probe=await mediaProbe(file), visual=probe.streams.find(s => s.codec_type === 'video');

    if (type !== 'audio' && !visual) throw new Error('No readable visual stream in this file.');

    if (type === 'audio' && !probe.streams.some(s => s.codec_type === 'audio')) throw new Error('No readable audio stream.');

    const asset={id:key,type,name:original,path:file,contentHash:await digestFile(file),bytes,description:'',duration:Number(probe.format.duration || visual?.duration || 0),hasAudio:probe.streams.some(s => s.codec_type === 'audio'),width:visual?.width,height:visual?.height,trimStart:0,trimEnd:0,withAudio:false};

    if (type !== 'image') asset.trimEnd=Math.min(asset.duration,15);
    if(type==='video'){const [n,d]=String(visual.avg_frame_rate||visual.r_frame_rate||'24/1').split('/').map(Number);asset.fps=n>0&&d>0?n/d:24;}

    if (type !== 'audio') {

      const thumb=path.join(DATA,'assets',key+'.thumb.jpg');

      await exec(config.ffmpeg,['-v','error','-i',file,'-frames:v','1','-vf','scale=480:320:force_original_aspect_ratio=decrease','-y',thumb],{windowsHide:true,maxBuffer:1024*1024});

      asset.thumbnail=thumb;

    } else {

      const thumb=path.join(DATA,'assets',key+'.thumb.png');

      await exec(config.ffmpeg,['-v','error','-i',file,'-filter_complex','aformat=channel_layouts=mono,showwavespic=s=480x110:colors=0x8d9f7d','-frames:v','1','-y',thumb],{windowsHide:true,maxBuffer:1024*1024});

      asset.thumbnail=thumb;

    }

    await atomic(path.join(DATA,'assets',key+'.json'),asset);

    return asset;

  } catch(e) { await unlink(file).catch(()=>{}); throw e; }

}

async function serveFile(req,res,file) {

  const st=await stat(file), ext=path.extname(file).toLowerCase();

  const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.mp4':'video/mp4','.webm':'video/webm','.mov':'video/quicktime','.wav':'audio/wav','.mp3':'audio/mpeg','.flac':'audio/flac','.m4a':'audio/mp4','.ogg':'audio/ogg'}[ext] || 'application/octet-stream';

  const headers={'Content-Type':mime,'Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'};

  const range=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);

  if (range) {

    const start=+range[1], end=Math.min(range[2] ? +range[2] : st.size-1,st.size-1);

    if (start>end) {res.writeHead(416,{'Content-Range':`bytes */${st.size}`});res.end();return;}

    res.writeHead(206,{...headers,'Content-Range':`bytes ${start}-${end}/${st.size}`,'Content-Length':end-start+1});

    createReadStream(file,{start,end}).pipe(res);

  } else {res.writeHead(200,{...headers,'Content-Length':st.size});createReadStream(file).pipe(res);}

}

function localOrigin(origin) {try {const u=new URL(origin);return ['http:','https:'].includes(u.protocol) && ['localhost','127.0.0.1','[::1]'].includes(u.hostname);}catch{return false;}}

export const server=http.createServer(async(req,res)=>{
  activeRequests++;

  try {

    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || '')) return json(res,{error:'Local connections only.'},403);

    const url=new URL(req.url,`http://127.0.0.1:${port}`), p=url.pathname, method=req.method;

    const bridge=p.startsWith('/api/bridge/');

    if (bridge && req.headers.origin) {

      if (!localOrigin(req.headers.origin)) return json(res,{error:'Local ComfyUI origins only.'},403);

      res.setHeader('Access-Control-Allow-Origin',req.headers.origin); res.setHeader('Vary','Origin');

      res.setHeader('Access-Control-Allow-Headers','Content-Type, X-H3-Bridge'); res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');

    }

    if (method === 'OPTIONS' && bridge) {res.writeHead(204);res.end();return;}

    if (method !== 'GET' && !bridge && req.headers['x-h3-token'] !== csrf) return json(res,{error:'Refresh the helper to reconnect.'},403);
    if(movingStorage&&p.startsWith('/api/')&&p!=='/api/status')return json(res,{error:'Storage is being copied. Retry after it finishes.'},409);
    if(p==='/api/storage'&&method==='POST'){
      if(process.env.H3_DATA_DIR)throw Error('Storage is controlled by H3_DATA_DIR for this service.');
      const request=await body(req),destination=String(request.folder||'');
      if(!destination||contained(ROOT,destination)||contained(destination,ROOT))throw Error('Choose an empty absolute folder outside the application folder.');
      if(worker.status().busy||(await comfyQueues([...comfyOrigins])).some(p=>p.busy))throw Error('Wait until the model and ComfyUI queues are idle.');
      if(activeRequests>1||worker.status().busy)throw Error('Another operation is in progress. Retry storage migration when it finishes.');movingStorage=true;try{await Promise.allSettled([...projectLocks.values()]);const previous=DATA;await copyStorage(previous,destination);const next={...config,dataDir:path.resolve(destination),previousDataDirs:[...new Set([...(config.previousDataDirs||[]),previous])]};await atomic(CONFIG,next);config=next;DATA=next.dataDir;worker.data=DATA;return json(res,{dataDir:DATA,originalPreserved:previous});}finally{movingStorage=false;}
    }

    if(p==='/api/storage-location'&&method==='POST'){if(process.env.H3_DATA_DIR)throw Error('This test service uses fixed storage.');if(worker.status().busy||activeRequests>1)throw Error('Wait for current operations to finish.');const request=await body(req),destination=path.resolve(String(request.folder||'')),known=[DATA,...(config.previousDataDirs||[])].map(x=>path.resolve(x));if(!known.includes(destination))throw Error('Choose a previously used project location, or copy storage to a new empty folder.');for(const part of ['projects','assets'])if(!(await stat(path.join(destination,part))).isDirectory())throw Error('Invalid project storage.');const previous=DATA;await Promise.allSettled([...projectLocks.values()]);const next={...config,dataDir:destination,previousDataDirs:[...new Set([previous,...(config.previousDataDirs||[])])].filter(x=>x!==destination)};await atomic(CONFIG,next);config=next;DATA=destination;worker.data=DATA;return json(res,{dataDir:DATA});}
    if (p === '/api/status') return json(res,{app:'h3-prompt-helper',version:'0.3.0',csrf,worker:worker.status(),config,dataDir:DATA,runtimeReady:existsSync(path.join(config.runtimeDir,'llama-cli.exe'))});

    if (p === '/api/settings' && method === 'POST') {

      if(worker.status().busy) throw new Error('Wait for the current model request before changing settings.');

      const update=await body(req);

      if(!Array.isArray(update.modelDirs)||update.modelDirs.length>1)throw Error('Choose one folder containing the model and mmproj.');
      const modelDirs=await modelFolders(update.modelDirs);
      for(const profile of Object.values(update.profiles||{}))delete profile.launcher;
      config={...config,modelDirs,profiles:update.profiles || config.profiles};
      for(const field of ['detailEnhancement','reviewDraft','notifySound','notifyVisual'])if(typeof update[field]==='boolean')config[field]=update[field];
      if(typeof update.comfyOutputDir==='string'){const value=update.comfyOutputDir.trim();if(value&&!path.isAbsolute(value))throw Error('Use an absolute folder path for the ComfyUI output folder.');if(value&&!(await stat(value).catch(()=>null))?.isDirectory())throw Error('That ComfyUI output folder does not exist.');config.comfyOutputDir=value?path.resolve(value):'';}

      await atomic(CONFIG,config); return json(res,{ok:true});

    }

    if (p === '/api/models') return json(res,await scanModels());
    if(p==='/api/export'&&method==='POST') {
      const request=await body(req),project=await hydrate(request.project),history=[];
      let destination=null;
      if(request.folder){if(typeof request.folder!=='string'||!path.isAbsolute(request.folder))throw new Error('Use an absolute export folder path.');const folder=path.resolve(request.folder);if(!(await stat(folder)).isDirectory())throw new Error('Choose an existing export folder.');const name=String(project.title||'Scene').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,80);destination=path.join(folder,name+'-'+randomUUID().slice(0,8)+(request.media?'.h3.zip':'.h3.json'));}
      if(request.history){for(const entry of (await historyEntries(DATA,project.id)).filter(e=>e.kind!=='current')){const file=entry.kind==='snapshot'?path.join(DATA,'snapshots',entry.key+'.json'):path.join(DATA,'history',project.id,entry.key+'.json');history.push(JSON.parse(await readFile(file,'utf8')));}}
      const files=[],mapping={},names=new Set();
      if(request.media){
        if(!config.python)throw new Error('Set python in config.local.json to your ComfyUI Python interpreter for ZIP export.');
        const refs=[project,...history].flatMap(p=>p.references);for(const doc of [project,...history])if(doc.coverAssetId)refs.push(JSON.parse(await readFile(path.join(DATA,'assets',id(doc.coverAssetId)+'.json'),'utf8')));
        if(request.sources){for(const ref of [...refs]){for(const key of new Set([ref.provenance?.sourceAssetId,...(ref.provenance?.sourceAssetIds||[])].filter(Boolean)))refs.push(JSON.parse(await readFile(path.join(DATA,'assets',id(key)+'.json'),'utf8')));}}
        for(const ref of refs){if(mapping[ref.id])continue;const saved=JSON.parse(await readFile(path.join(DATA,'assets',id(ref.id)+'.json'),'utf8')),name=mediaName(saved,await digestFile(saved.path));mapping[ref.id]=name;if(!names.has(name)){files.push({name,source:saved.path});names.add(name);}}
      }
      const manifest=portableDocument(project,history,mapping);manifest.sourceMedia=mapping;manifest.sources=[];if(request.media){const referenced=new Set([project,...history].flatMap(p=>p.references.map(r=>r.id)));for(const assetId of Object.keys(mapping)){if(!referenced.has(assetId)){const r=JSON.parse(await readFile(path.join(DATA,'assets',assetId+'.json'),'utf8'));manifest.sources.push({...r,path:mapping[assetId],thumbnail:undefined});}}}
      if(Buffer.byteLength(JSON.stringify(manifest))>10*1024*1024)throw new Error('This history is too large for a portable manifest. Export the current scene without history.');
      if(!request.media){if(destination){await writeFile(destination,JSON.stringify(manifest,null,2),{flag:'wx'});return json(res,{savedPath:destination});}return json(res,manifest);}
      const folder=path.join(DATA,'jobs',randomUUID());await mkdir(folder,{recursive:true});const output=path.join(folder,'scene.h3.zip'),task=path.join(folder,'export.json');
      await atomic(task,{manifest,files,output});await exec(config.python,[path.join(ROOT,'scripts','bundle.py'),'export',task],{windowsHide:true,timeout:300000,maxBuffer:1024*1024});
      if(destination){await copyFile(output,destination,1);return json(res,{savedPath:destination});}
      return json(res,{download:'/api/package/'+path.basename(folder)});
    }
    if(p.startsWith('/api/package/')){res.setHeader('Content-Disposition','attachment; filename=scene.h3.zip');return await serveFile(req,res,path.join(DATA,'jobs',id(p.split('/').at(-1)),'scene.h3.zip'));}
    if(p==='/api/import-metadata'&&method==='POST') {
      const manifest=await body(req,10*1024*1024);if(manifest.format!=='h3-scene'||manifest.version!==1)throw new Error('Choose an H3 scene metadata file.');
      const documents=[];try{for(const doc of [...(manifest.history||[]).reverse(),manifest.project])documents.push(await hydrate(doc));}catch(e){if(e.code==='ENOENT')throw new Error('These reference files are not available in this helper. Import a portable ZIP package that includes the media.');throw e;}
      const key=randomUUID();let revision=0;
      for(const doc of documents){const restored={...doc,id:key,revision:revision++,updated:new Date().toISOString()};delete restored.snapshotId;delete restored.savedAt;delete restored.labels;if(doc===documents.at(-1)){await atomic(path.join(DATA,'projects',key+'.json'),restored);return json(res,restored);}await retainRevision(DATA,restored);}
    }
    if(p==='/api/import-package'&&method==='POST') {
      if(!config.python)throw new Error('Configure the Python interpreter before importing portable packages.');
      const folder=path.join(DATA,'jobs',randomUUID());await mkdir(folder,{recursive:true});const input=path.join(folder,'input.zip');let bytes=0;
      await pipeline(req,new Transform({transform(c,e,cb){bytes+=c.length;cb(bytes>8*1024**3?new Error('Package exceeds 8 GB.'):null,c);}}),createWriteStream(input,{flags:'wx'}));
      const task=path.join(folder,'import.json');await atomic(task,{folder,input});await exec(config.python,[path.join(ROOT,'scripts','bundle.py'),'import',task],{windowsHide:true,timeout:300000,maxBuffer:1024*1024});
      const manifest=JSON.parse(await readFile(path.join(folder,'manifest.json'),'utf8'));
      if(manifest.format!=='h3-scene'||manifest.version!==1||!manifest.mediaIncluded)throw new Error('Choose a portable H3 scene package.');
      const documents=[manifest.project,...(manifest.history||[])],assets=new Map(),originalPaths=new Map();
      for(const doc of [...documents,{...newProject(),references:manifest.sources||[]}]){projectShape(doc);for(const ref of doc.references){if(assets.has(ref.id)){if(originalPaths.get(ref.id)!==ref.path)throw new Error('Conflicting reference identity in package.');continue;}originalPaths.set(ref.id,ref.path);
        if(!/^media\/[a-f0-9]{64}\.[a-z0-9]+$/.test(ref.path))throw new Error('Invalid media path in package.');
        const source=path.join(folder,path.basename(ref.path));if(await digestFile(source)!==path.basename(ref.path).split('.')[0])throw new Error('Media checksum mismatch.');
        const target=new URL('/api/assets',url);target.searchParams.set('name',path.parse(ref.name).name+path.extname(source));assets.set(ref.id,await upload(createReadStream(source),target));
      }}
      const key=randomUUID();let revision=0;
      for(const doc of [...documents.slice(1).reverse(),documents[0]]){
        const restored={...doc,id:key,directorLinks:(doc.directorLinks||[]).map(id=>assets.get(id)?.id).filter(Boolean),directorMessages:(doc.directorMessages||[]).map(m=>({...m,observations:(m.observations||[]).map(o=>({...o,referenceId:assets.get(o.referenceId)?.id||o.referenceId})),referenceIds:(m.referenceIds||[]).map(id=>assets.get(id)?.id||id)})),coverAssetId:doc.coverAssetId?assets.get(doc.coverAssetId)?.id:undefined,subjects:doc.subjects.map(s=>({...s,sourceId:s.sourceId?assets.get(s.sourceId)?.id:undefined,sources:(s.sources||[]).map(source=>({...source,sourceId:assets.get(source.sourceId)?.id||source.sourceId}))})),revision:revision++,updated:new Date().toISOString(),references:doc.references.map(r=>({...r,...assets.get(r.id),name:r.name,description:r.description,trimStart:r.trimStart,trimEnd:r.trimEnd,withAudio:r.withAudio,provenance:r.provenance?{...r.provenance,sourceAssetId:assets.get(r.provenance.sourceAssetId)?.id,sourceAssetIds:(r.provenance.sourceAssetIds||[]).map(id=>assets.get(id)?.id).filter(Boolean),cuts:(r.provenance.cuts||[]).map(c=>({...c,sourceId:c.sourceId?assets.get(c.sourceId)?.id:undefined}))}:undefined}))};restored.missingMentions=(restored.missingMentions||[]).map(m=>({...m,field:m.field.startsWith('reference:')?'reference:'+(assets.get(m.field.slice(10))?.id||m.field.slice(10)):m.field}));delete restored.snapshotId;delete restored.savedAt;delete restored.labels;
        if(doc===documents[0]){await atomic(path.join(DATA,'projects',key+'.json'),restored);return json(res,restored);}await retainRevision(DATA,restored);
      }
    }
    if(['/api/output-browser','/api/output-file','/api/import-output'].includes(p)){
      let root=config.comfyOutputDir;
      if(!root){try{const stats=await fetch('http://127.0.0.1:8188/system_stats',{signal:AbortSignal.timeout(1500)}).then(r=>r.json());const argv=stats.system?.argv||[];const index=argv.indexOf('--output-directory');if(index>=0&&path.isAbsolute(argv[index+1]||''))root=argv[index+1];}catch{}}
      if(!root){root=path.join(path.dirname(path.dirname(path.dirname(config.python||''))),'output');if(!existsSync(path.join(path.dirname(root),'comfy_extras','nodes_minimax_h3.py')))throw Error('Configure a ComfyUI output folder first.');}
      if(p==='/api/output-browser')return json(res,{...(await browseComfyOutput({root,folder:url.searchParams.get('folder')||''})),root});
      if(p==='/api/output-file'){const file=await resolveOutput(root,url.searchParams.get('path')||'');if(!/\.(png|jpe?g|webp|gif|bmp|mp4|webm|mov|mkv|avi|wav|mp3|flac|ogg|m4a|aac)$/i.test(file))throw Error('Unsupported media.');return await serveFile(req,res,file);}
      if(method!=='POST')throw Error('Use POST to import media.');const request=await body(req),file=await resolveOutput(root,request.path);const target=new URL('/api/assets',url);target.searchParams.set('name',path.basename(file));return json(res,await upload(createReadStream(file),target));
    }
    if(p==='/api/recent-results') {
      const results=[],seen=new Set();
      for(const origin of comfyOrigins){try{
        const response=await fetch(origin+'/history?max_items=40',{signal:AbortSignal.timeout(2500)});if(!response.ok)continue;
        const history=await response.json();
        for(const run of Object.values(history).reverse()){
          let outputSnapshotIds=[];const walk=value=>{if(!value||typeof value!=='object')return;
            if(typeof value.filename==='string'){
              const ext=path.extname(value.filename).toLowerCase(),type=['.png','.jpg','.jpeg','.webp'].includes(ext)?'image':['.mp4','.webm','.mov','.mkv'].includes(ext)?'video':['.wav','.mp3','.flac','.ogg'].includes(ext)?'audio':null;
              const url=new URL('/view',origin);for(const k of ['filename','subfolder','type'])if(value[k])url.searchParams.set(k,value[k]);
              if(type&&!seen.has(url.href)){seen.add(url.href);results.push({name:value.filename,type,url:url.href,snapshotIds:outputSnapshotIds});}return;
            }for(const child of Object.values(value))walk(child);
          };const provenance=run.prompt?.[3]?.extra_pnginfo?.h3_prompt_helper;for(const [outputId,output] of Object.entries(run.outputs||{})){outputSnapshotIds=provenance?.output_snapshots?provenance.output_snapshots[outputId]||[]:(provenance?.snapshots||[]).map(s=>s.snapshot_id);walk(output);}
        }
      }catch{}}
      return json(res,results.slice(0,80));
    }
    if(p==='/api/comfy-preview') {
      const source=new URL(url.searchParams.get('url'));
      if(!comfyOrigins.has(source.origin)||source.pathname!=='/view')throw new Error('Unknown ComfyUI preview.');
      const response=await fetch(source,{redirect:'error',headers:req.headers.range?{Range:req.headers.range}:{},signal:AbortSignal.timeout(30000)});
      if(!response.ok||!/^(image|video|audio)\//.test(response.headers.get('content-type')||''))throw new Error('Preview unavailable.');
      const headers={'Content-Type':response.headers.get('content-type'),'Cache-Control':'private, max-age=60'};
      for(const key of ['content-range','accept-ranges','content-length'])if(response.headers.has(key))headers[key]=response.headers.get(key);
      res.writeHead(response.status,headers);await pipeline(response.body,res);return;
    }
    if(p==='/api/memory') {const model=modelCache.find(m=>m.path===url.searchParams.get('model'));return json(res,await memoryEstimate(model,config.profiles[model?.path]));}
    if(p==='/api/unload-comfy'&&method==='POST') {
      if(worker.status().busy)throw new Error('Wait for the current writing request.');
      const peers=await comfyQueues([...comfyOrigins]);
      if(peers.some(p=>p.busy))throw new Error('ComfyUI has queued or running work. Finish it before unloading.');
      if(!peers.length)throw new Error('No local ComfyUI connection found.');
      for(const peer of peers){const q=await comfyQueues([peer.origin]);if(q.length!==1||q[0].busy)throw new Error('The ComfyUI queue changed. Try again when idle.');const r=await fetch(peer.origin+'/free',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({unload_models:true,free_memory:true}),signal:AbortSignal.timeout(5000)});if(!r.ok)throw new Error('ComfyUI could not unload its models.');}
      return json(res,{ok:true});
    }
    if(p==='/api/trash' && method==='GET') {

      const list=await Promise.all((await readdir(path.join(DATA,'trash'))).filter(f=>f.endsWith('.json')).map(async f=>{const x=JSON.parse(await readFile(path.join(DATA,'trash',f),'utf8'));return {id:x.id,title:x.title,revision:x.revision,folder:x.folder,coverAssetId:coverId(x),sendVersion:x.sendVersion};}));return json(res,list);

    }

    if(p.startsWith('/api/history/')) {

      const key=id(p.split('/').at(-1));

      if(method==='GET')return json(res,await historyEntries(DATA,key));

      const request=await body(req);

      return await withProjectLock(key,async()=>{

        const current=await loadProject(key);

        if(request.revision!==current.revision)return json(res,{error:'Project changed. Reload before restoring.'},409);

        if(!['snapshot','revision'].includes(request.kind))throw Error('Choose a saved revision or snapshot to restore.');
        const file=request.kind==='snapshot'?path.join(DATA,'snapshots',id(request.key)+'.json'):path.join(DATA,'history',key,id(request.key)+'.json');

        const restored=await hydrate(JSON.parse(await readFile(file,'utf8')));

        if(restored.id!==key)throw new Error('This history entry belongs to another project.');

        const sourceBranchId=restored.branchId||'main',parentSnapshotId=restored.snapshotId||restored.parentSnapshotId||null;
        await retainRevision(DATA,current);delete restored.snapshotId;delete restored.savedAt;delete restored.labels;delete restored.sendVersion;
        restored.branchId=randomUUID();restored.branchName='Branch '+(current.revision+1);restored.restoredAt=new Date().toISOString();restored.restoredRevision=current.revision+1;restored.parentSnapshotId=parentSnapshotId;restored.branchedFrom={kind:request.kind,key:request.key,revision:restored.revision,branchId:sourceBranchId};

        restored.revision=current.revision+1;restored.updated=new Date().toISOString();

        await atomic(path.join(DATA,'projects',key+'.json'),restored);return json(res,restored);

      });

    }

    if(p.startsWith('/api/trash/') && method==='POST') {

      const key=id(p.split('/').at(-1)),request=await body(req);

      return await withProjectLock(key,async()=>{

        const live=path.join(DATA,'projects',key+'.json'),trash=path.join(DATA,'trash',key+'.json');

        if(request.permanent){const current=JSON.parse(await readFile(trash,'utf8'));if(request.confirm!==key||current.revision!==request.revision)return json(res,{error:'Confirm the current trashed project before deleting.'},409);await unlink(trash);return json(res,{ok:true,preserved:'Media and immutable snapshots retained.'});}
        if(request.restore){if(existsSync(live))throw new Error('Project already exists.');await rename(trash,live);}

        else{const current=await loadProject(key);if(current.revision!==request.revision)return json(res,{error:'Project changed. Reload before deleting.'},409);await retainRevision(DATA,current);await rename(live,trash);}

        return json(res,{ok:true});

      });

    }

    if(p==='/api/model-download'){if(method==='GET')return json(res,modelDownload.state);if(method==='POST')return json(res,modelDownload.start(await body(req)));}
    if(p==='/api/dashboard'){
      const file=path.join(DATA,'dashboard.json');
      const read=async()=>{try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return {revision:0,homeFolders:[]};throw e;}};
      if(method==='GET')return json(res,await read());
      if(method==='POST'){const input=await body(req);return await withProjectLock('dashboard',async()=>{
        const current=await read();if(input.revision!==current.revision)return json(res,{error:'Home changed in another editor. Reopen Home and try again.'},409);
        if(!Array.isArray(input.homeFolders)||input.homeFolders.length>100||input.homeFolders.some(f=>typeof f!=='string'||f.length>160||/[\x00-\x1f]/.test(f)))throw Error('Choose up to 100 folder names, each at most 160 characters.');
        const extras={};for(const field of ['folderCovers','inspirations']){const value=input[field]??current[field];if(value!==undefined){if(field==='folderCovers'&&(!value||Array.isArray(value)||typeof value!=='object'||Object.keys(value).length>100||Object.entries(value).some(([k,v])=>k.length>160||typeof v!=='string'||!idPattern.test(v))))throw Error('Invalid folder covers.');if(field==='inspirations'&&(!Array.isArray(value)||value.length>100||value.some(x=>!x||!['scene','folder'].includes(x.kind)||typeof x.key!=='string'||x.key.length>160)))throw Error('Invalid inspirations.');extras[field]=value;}}
        const next={...extras,revision:current.revision+1,homeFolders:normalizeHomeFolders(input.homeFolders),folders:normalizeHomeFolders([...(current.folders||current.homeFolders||[]),...input.homeFolders]).filter(f=>!(input.trashFolders||[]).includes(f)), ...(input.trashFolders?{trashFolders:normalizeHomeFolders(input.trashFolders)}:{})};await atomic(file,next);return json(res,next);
      });}
      return json(res,{error:'Method not supported.'},405);
    }
    if (p === '/api/projects' && method === 'GET') {

      const versions=await snapshotVersions();
      const list=await Promise.all((await readdir(path.join(DATA,'projects'))).filter(f => f.endsWith('.json')).map(async f => {const x=JSON.parse(await readFile(path.join(DATA,'projects',f),'utf8'));return {id:x.id,title:x.title,created:x.created||(await stat(path.join(DATA,'projects',f))).birthtime.toISOString(),updated:x.updated,folder:x.folder||'',isTemplate:!!x.isTemplate,showOnHome:!!x.showOnHome,projectLabels:x.projectLabels||[],coverAssetId:coverId(x),sendVersion:versions.get(x.id)||0};}));

      return json(res,list.sort((a,b)=>(b.updated||'').localeCompare(a.updated||'')));

    }

    if(p==='/api/duplicate-reference'&&method==='POST'){const request=await body(req),source=JSON.parse(await readFile(path.join(DATA,'assets',id(request.id)+'.json'),'utf8')),asset={...source,id:randomUUID()};await atomic(path.join(DATA,'assets',asset.id+'.json'),asset);return json(res,asset);}
    if (p === '/api/projects' && method === 'POST') {const request=await body(req);let project=newProject();if(request.sourceId){const source=await loadProject(id(request.sourceId));project=duplicateProject(source,project.id,{template:request.asTemplate===true});if(request.fromTemplate){project.isTemplate=false;project.title=source.title.replace(/ · Template$/,'');}}else if(request.template){const t=starterTemplates.find(t=>t.key===request.template);if(!t)throw new Error('Unknown template.');project={...project,title:t.title,brief:t.brief};}if(request.folder!==undefined){if(typeof request.folder!=='string'||request.folder.length>160||/[\x00-\x1f]/.test(request.folder))throw Error('Invalid project folder name.');project.folder=request.folder.trim();}await atomic(path.join(DATA,'projects',project.id+'.json'),project);return json(res,project);}

    if (p.startsWith('/api/project/')) {

      const key=id(p.split('/').at(-1));

      if(method === 'GET') return json(res,await loadProject(key));

      if(method === 'POST') {

        const candidate=await hydrate(await body(req));

        return await withProjectLock(key,async()=>{

          const previous=await loadProject(key);

          if(candidate.id!==key || candidate.revision!==previous.revision) return json(res,{error:'This project changed in another window. Reload it before saving.'},409);

          await retainRevision(DATA,previous);

          candidate.created=previous.created||(await stat(path.join(DATA,'projects',key+'.json'))).birthtime.toISOString();candidate.revision++;candidate.updated=new Date().toISOString();

          await atomic(path.join(DATA,'projects',key+'.json'),candidate);return json(res,candidate);

        });

      }

    }

    if (p === '/api/assets' && method === 'POST') return json(res,await matchImportedReference(await upload(req,url),url.searchParams.get('project')));
    if(p==='/api/prepare-video'&&method==='POST') {
      const request=await body(req),source=JSON.parse(await readFile(path.join(DATA,'assets',id(request.id)+'.json'),'utf8'));
      if(source.type==='audio')return json(res,await prepareAudio(request,{data:DATA,ffmpeg:config.ffmpeg,upload,url}));
      if(source.type!=='video')throw new Error('Choose a video reference.');
      const cuts=request.cuts;
      if(!Array.isArray(cuts)||!cuts.length||cuts.length>12)throw new Error('Choose one to twelve keep ranges.');
      const sources=[source];for(const cut of cuts){if(cut.sourceId&&!sources.some(s=>s.id===cut.sourceId)){const asset=JSON.parse(await readFile(path.join(DATA,'assets',id(cut.sourceId)+'.json'),'utf8'));if(asset.type!=='video')throw Error('Stitch sources must be videos.');sources.push(asset);}}
      if(cuts.some(c=>!Number.isFinite(c.start)||!Number.isFinite(c.end)||c.start<0||c.end<=c.start||c.end>(sources.find(s=>s.id===(c.sourceId||source.id))).duration+.001))throw new Error('Choose valid keep ranges inside each source video.');
      const duration=cuts.reduce((sum,c)=>sum+c.end-c.start,0);if(duration<2||duration>15.05)throw new Error('The combined reference must be 2–15 seconds.');
      const outputDuration=request.targetDuration===undefined?duration:Number(request.targetDuration);
      if(!Number.isFinite(outputDuration)||outputDuration<2||outputDuration>15.05)throw new Error('Retimed duration must be 2–15 seconds.');
      const speed=duration/outputDuration;
      const audioOnly=request.output==='audio',hasAudio=sources.some(s=>s.hasAudio);if(audioOnly&&!hasAudio)throw new Error('These videos have no audio track.');
      const height=request.height===undefined?source.height:Number(request.height);if(!Number.isInteger(height)||height<64||height>source.height)throw new Error('Choose a height between 64 pixels and the original height.');
      const keepAudio=(!!request.audio||audioOnly)&&hasAudio,filters=[],inputs=[],outH=2*Math.floor(height/2),outW=2*Math.round(outH*source.width/source.height/2);
      cuts.forEach((c,i)=>{const sourceIndex=sources.findIndex(s=>s.id===(c.sourceId||source.id));filters.push(`[${sourceIndex}:v]trim=start=${c.start}:end=${c.end},setpts=PTS-STARTPTS,scale=${outW}:${outH}:force_original_aspect_ratio=decrease,pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24[v${i}]`);inputs.push(`[v${i}]`);if(keepAudio){filters.push(sources[sourceIndex].hasAudio?`[${sourceIndex}:a]atrim=start=${c.start}:end=${c.end},asetpts=PTS-STARTPTS,aresample=32000,aformat=channel_layouts=stereo,apad,atrim=duration=${c.end-c.start}[a${i}]`:`anullsrc=r=32000:cl=stereo,atrim=duration=${c.end-c.start}[a${i}]`);inputs.push(`[a${i}]`);}});
      filters.push(`${inputs.join('')}concat=n=${cuts.length}:v=1:a=${keepAudio?1:0}[v]${keepAudio?'[a]':''}`);
      let videoLabel='[v]',audioLabel='[a]';
      if(speed!==1){filters.push(`[v]setpts=PTS/${speed},fps=24[retimed]`);videoLabel='[retimed]';if(keepAudio){let remaining=speed;const tempos=[];while(remaining>2){tempos.push('atempo=2');remaining/=2;}while(remaining<.5){tempos.push('atempo=0.5');remaining/=.5;}tempos.push('atempo='+remaining);filters.push(`[a]${tempos.join(',')}[retimedAudio]`);audioLabel='[retimedAudio]';}}
      if(audioOnly)filters.push(`${videoLabel}nullsink`);
      const folder=path.join(DATA,'jobs',randomUUID());await mkdir(folder,{recursive:true});const output=path.join(folder,audioOnly?'prepared.wav':'prepared.mp4');
      const args=['-v','error',...sources.flatMap(s=>['-i',s.path]),'-filter_complex',filters.join(';')];if(!audioOnly)args.push('-map',videoLabel);if(keepAudio)args.push('-map',audioLabel,'-c:a',audioOnly?'pcm_s16le':'aac');
      if(!audioOnly)args.push('-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart');args.push('-y',output);
      await exec(config.ffmpeg,args,{windowsHide:true,timeout:300000,maxBuffer:1024*1024});
      const target=new URL('/api/assets',url);target.searchParams.set('name',path.parse(source.name).name+(audioOnly?'-audio.wav':'-prepared.mp4'));
      try{const asset=await upload(createReadStream(output),target);asset.provenance={sourceAssetId:source.id,sourceAssetIds:sources.map(s=>s.id),cuts,height,audio:keepAudio,speed,outputDuration};asset.description=String(request.description||'');asset.withAudio=audioOnly?false:keepAudio;await atomic(path.join(DATA,'assets',asset.id+'.json'),asset);return json(res,asset);}finally{await unlink(output).catch(()=>{});}
    }
    if(p==='/api/import-comfy' && method==='POST') {
      const request=await body(req),source=new URL(request.url);
      if(!localOrigin(source.origin)||source.pathname!=='/view'||source.username||source.password)throw new Error('Drop a local ComfyUI media preview.');
      const name=source.searchParams.get('filename');if(!name)throw new Error('The preview does not identify a media file.');
      const response=await fetch(source,{redirect:'error',signal:AbortSignal.timeout(30000)});
      if(!response.ok)throw new Error('ComfyUI could not supply that media.');
      const target=new URL('/api/assets',url);target.searchParams.set('name',name);
      return json(res,await matchImportedReference(await upload(response.body,target),request.projectId));
    }
    if (p.startsWith('/api/asset/')) {
      const asset=JSON.parse(await readFile(path.join(DATA,'assets',id(p.split('/').at(-1))+'.json'),'utf8'));

      return await serveFile(req,res,url.searchParams.has('thumb') ? asset.thumbnail : asset.path);
    }
    if(p.startsWith('/api/media-info/')){const key=id(p.split('/').at(-1)),file=path.join(DATA,'assets',key+'.json'),asset=JSON.parse(await readFile(file,'utf8'));if(asset.type==='video'&&!asset.fps){const probe=await mediaProbe(asset.path),visual=probe.streams.find(s=>s.codec_type==='video');const [n,d]=String(visual?.avg_frame_rate||'24/1').split('/').map(Number);asset.fps=n>0&&d>0?n/d:24;await atomic(file,asset);}return json(res,{fps:asset.fps||24});}
    if(p.startsWith('/api/video-strip/')) {
      const asset=JSON.parse(await readFile(path.join(DATA,'assets',id(p.split('/').at(-1))+'.json'),'utf8'));
      if(!['video','audio'].includes(asset.type))throw new Error('Video or audio required.');
      const waveform=asset.type==='audio'||url.searchParams.has('waveform'),file=path.join(DATA,'assets',asset.id+(waveform?'.wave.png':'.strip.jpg'));
      if(!existsSync(file)){
        const filter=waveform?'aformat=channel_layouts=mono,showwavespic=s=960x70:colors=0x86a78f':`fps=${6/Math.max(asset.duration,.1)},scale=160:90:force_original_aspect_ratio=decrease,pad=160:90:(ow-iw)/2:(oh-ih)/2,tile=6x1`;
        await exec(config.ffmpeg,['-v','error','-i',asset.path,waveform?'-filter_complex':'-vf',filter,'-frames:v','1','-y',file],{windowsHide:true,timeout:60000,maxBuffer:1024*1024});
      }
      return await serveFile(req,res,file);
    }
    if (p === '/api/snapshots' && method === 'POST') {

      if(worker.status().busy) throw new Error('Finish or cancel the AI request before sending to ComfyUI.');

      const project=await hydrate(await body(req)), report=validate(project);

      if(report.errors.length) return json(res,{error:report.errors.join('\n')},400);

      return await withProjectLock(project.id,async()=>{
        const current=await loadProject(project.id);if(current.revision!==project.revision)return json(res,{error:'This scene changed in another editor. Reload its latest saved version before creating a snapshot.'},409);
        const entries=(await historyEntries(DATA,project.id)).filter(x=>x.kind==='snapshot');
        const sendVersion=Math.max(0,...entries.map(x=>x.sendVersion||0))+1;
        const branchId=project.branchId||'main',previous=entries.find(x=>(x.branchId||'main')===branchId);
        const key=randomUUID();const snapshot={...project,branchId,sendVersion,parentSnapshotId:previous?.key||project.parentSnapshotId||null,snapshotId:key,savedAt:new Date().toISOString(),labels:referenceMap(project.references)};
        const file=path.join(DATA,'snapshots',key+'.json');await writeFile(file,JSON.stringify(snapshot,null,2),{flag:'wx'});
        return json(res,{path:file,id:key,title:project.title,revision:project.revision,sendVersion,summary:`${project.references.length} references · ${project.width}×${project.height} · ${(project.length/24).toFixed(2)}s`});
      });

    }

    if(p === '/api/ai' && method === 'POST') {

      const input=await body(req), project=await hydrate(input.project);

      if(!modelCache.length) await scanModels();

      // Writing direction and detail toggles are global settings, not per-scene values.
      input.detailEnhancement=config.detailEnhancement!==false;
      input.review=config.reviewDraft!==false;

      const model=modelCache.find(m=>m.path===input.model && !m.projector);

      if(!model) throw new Error('Select an available GGUF model.');

      const projector=input.projector ? modelCache.find(m=>m.path===input.projector && m.projector) : null;

      if(input.projector && !projector) throw new Error('Projector was not found in the configured model directories.');
      const peers=await comfyQueues([...comfyOrigins]);if(peers.some(p=>p.busy))throw new Error('ComfyUI is rendering or has queued work. Wait before loading the writing model.');
      const memory=await memoryEstimate(model,config.profiles[model.path]);
      if(memory.state==='risk')throw new Error('Low memory headroom. Unload idle ComfyUI models or select a smaller model before writing.');
      return json(res,worker.start({...input,project,model:model.path,projector:projector?.path},config));
    }

    if(p === '/api/ai/cancel' && method === 'POST') {worker.cancel();return json(res,{ok:true});}

    if(p.startsWith('/api/job/')) return json(res,worker.job(id(p.split('/').at(-1))));

    if (p === '/api/bridge/sessions' && method === 'POST') {

      if(req.headers['x-h3-bridge'] !== '1') return json(res,{error:'Bridge header required.'},403);

      const data=await body(req); const token=randomBytes(24).toString('hex');
      if(req.headers.origin&&localOrigin(req.headers.origin))comfyOrigins.add(req.headers.origin);
      for (const [k,s] of sessions) if(Date.now()-s.created>86400000) sessions.delete(k);

      if(sessions.size>100) throw new Error('Too many open editor sessions. Restart the helper.');

      sessions.set(token,{target:String(data.target || 'H3 Prompt Helper').slice(0,200),projectId:data.projectId || '',created:Date.now(),pending:null,ack:null});

      return json(res,{token,url:`http://127.0.0.1:${port}/#session=${token}`});

    }

    if(p.startsWith('/api/bridge/session/')) {

      const token=p.split('/').at(-1), s=sessions.get(token);

      if(!s) return json(res,{error:'This connection expired. Open the editor from the node again.'},404);

      if(method==='GET') return json(res,s);

      const b=await body(req);

      if(b.action==='bind'){await loadProject(id(b.projectId));s.projectId=b.projectId;return json(res,s);}
      if(b.action==='send') {

        const file=path.join(DATA,'snapshots',id(b.snapshot.id)+'.json');

        const snap=JSON.parse(await readFile(file,'utf8'));

        s.pending={canvas:{width:snap.width,height:snap.height,length:snap.length,targetMP:snap.targetMegapixels,aspectRatio:snap.aspectRatio,sizeMode:snap.canvasSizeMode},id:snap.snapshotId,path:file,title:snap.title,revision:snap.revision,sendVersion:snap.sendVersion,projectId:snap.id,coverAssetId:coverId(snap),summary:`${snap.width}×${snap.height} · ${(snap.length/24).toFixed(2)}s · ${snap.references.length} refs`,prompt:snap.prompt,references:snap.references.map(r=>({id:r.id,name:r.name,type:r.type}))};s.ack=null;s.projectId=snap.id;

      } else if(b.action==='ack' && s.ack===b.id){return json(res,s);}
      else if(b.action==='ack' && s.pending?.id===b.id) {s.ack=b.id;s.pending=null;}

      else throw new Error('Invalid bridge acknowledgement.');

      return json(res,s);

    }

    if(p==='/canvas-picker.mjs')return await serveFile(req,res,path.join(ROOT,'comfyui_h3_prompt_helper/web/canvas-panel.js'));
    if(p.startsWith('/api/workflow/')){const name=decodeURIComponent(p.slice('/api/workflow/'.length));if(!['Onigiri Minimax H3','OMMH3 2nd Pass'].includes(name))throw Error('Unknown workflow.');return await serveFile(req,res,path.join(ROOT,'workflows',name+'.json'));}
    const staticFiles={'/arrangement-state.mjs':'arrangement-state.mjs','/prompt-diff.mjs':'prompt-diff.mjs','/overlays.mjs':'overlays.mjs','/board-logic.mjs':'board-logic.mjs','/studio-shell.mjs':'studio-shell.mjs','/draft-board.mjs':'draft-board.mjs','/studio.css':'studio.css','/onigiri.svg':'onigiri.svg','/notify.mjs':'notify.mjs','/project-label-dialog.mjs':'project-label-dialog.mjs','/project-labels.mjs':'project-labels.mjs','/role-studio.css':'role-studio.css','/role-studio.mjs':'role-studio.mjs','/sidebar-gestures.mjs':'sidebar-gestures.mjs','/home-folders.mjs':'home-folders.mjs','/model-dashboard.mjs':'model-dashboard.mjs','/subject-drag.mjs':'subject-drag.mjs','/':'index.html','/app.mjs':'app.mjs','/domain.mjs':'domain.mjs','/projects.mjs':'projects.mjs','/media-viewer.mjs':'media-viewer.mjs','/visual-trim.mjs':'visual-trim.mjs','/mentions.mjs':'mentions.mjs','/editor-tools.mjs':'editor-tools.mjs','/image-grid.mjs':'image-grid.mjs','/media-chrome.mjs':'media-chrome.mjs','/role-picker.mjs':'role-picker.mjs','/token-menu.mjs':'token-menu.mjs','/shot-editor.mjs':'shot-editor.mjs','/dialogs.mjs':'dialogs.mjs','/sequence-timeline.mjs':'sequence-timeline.mjs','/style.css':'style.css'};

    if(staticFiles[p]) return await serveFile(req,res,path.join(ROOT,'public',staticFiles[p]));

    json(res,{error:'Not found.'},404);

  } catch(e) { if(!res.headersSent) json(res,{error:e.message},e.code==='ENOENT'?404:400); else res.destroy(); }finally{activeRequests--;}

});

server.listen(port,'127.0.0.1',()=>console.log(`H3 Prompt Helper · http://127.0.0.1:${port}`));

process.on('SIGINT',()=>{worker.cancel();server.close(()=>process.exit());});

process.on('SIGTERM',()=>{worker.cancel();server.close(()=>process.exit());});

async function matchImportedReference(asset,projectKey){if(!projectKey)return asset;const current=await loadProject(id(projectKey));for(const ref of current.references){const stored=JSON.parse(await readFile(path.join(DATA,'assets',id(ref.id)+'.json'),'utf8'));if(stored.bytes===asset.bytes&&(stored.contentHash||await digestFile(stored.path))===asset.contentHash)return {...stored,...ref};}return asset;}
