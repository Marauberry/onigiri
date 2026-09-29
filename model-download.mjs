import {spawn} from 'node:child_process';
import path from 'node:path';
export class ModelDownload {
 constructor(root){this.root=root;this.state={state:'idle'};}
 start({folder,variant}){
  if(this.state.state==='running')throw Error('A model download is already running.');
  if(process.platform!=='win32')throw Error('The built-in downloader currently supports Windows. Use the model links in README on other systems.');
  if(typeof folder!=='string'||!path.isAbsolute(folder)||/[\x00-\x1f]/.test(folder))throw Error('Choose an absolute model folder.');
  if(!['official','abliterated'].includes(variant))throw Error('Choose an available Bonsai variant.');
  this.state={state:'running',folder,variant,log:'Starting download…'};
  const child=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(this.root,'scripts','download-model.ps1'),'-ModelDirectory',folder,'-Variant',variant],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{this.state.log=(this.state.log+'\n'+chunk.toString()).slice(-1600);});
  child.on('error',error=>{this.state.state='failed';this.state.log=error.message;});child.on('exit',code=>{this.state.state=code===0?'done':'failed';});return this.state;
 }
}
