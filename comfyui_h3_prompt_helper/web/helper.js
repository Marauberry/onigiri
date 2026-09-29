import {sceneCard} from './scene-card.js';
import {floatingEditor} from './centered-editor.js';
import {app} from '../../../scripts/app.js';
import {api} from '../../../scripts/api.js';

app.registerExtension({
 name:'Onigiri.Editor',
 async beforeRegisterNodeDef(nodeType,nodeData){
  if(nodeData.name!=='H3SceneGuideV3')return;
  const created=nodeType.prototype.onNodeCreated;
  nodeType.prototype.onNodeCreated=function(){
   created?.apply(this,arguments);
   const node=this;
   this.addWidget('button','Open Onigiri ↗',null,async()=>{
    if(node._h3Opening)return;
    node._h3Opening=true;
    try{
     if(node._h3Floating&&node._h3Session){
      const live=await fetch(node._h3Origin+'/api/bridge/session/'+node._h3Session.token).catch(()=>null);
      if(live?.ok){node._h3Floating.show();return;}
     }
     const launch=await api.fetchApi('/h3-helper/launch',{method:'POST'});
     if(!launch.ok)throw Error(await launch.text());
     const {url}=await launch.json();
     const registered=await fetch(url+'/api/bridge/sessions',{method:'POST',headers:{'Content-Type':'application/json','X-H3-Bridge':'1'},body:JSON.stringify({target:`${node.title} · node ${node.id}`,projectId:node._h3EditingProjectId||node.properties.h3EditorProjectId||node.properties.h3ProjectId||''})});
     if(!registered.ok)throw Error('Could not connect to Onigiri.');
     const session=await registered.json();
     // Removed nodes and switched graphs cannot attach an editor after an async launch.
     if(!node.graph||node.graph!==app.graph||node.graph.getNodeById(node.id)!==node)return;
     node._h3Session=session;node._h3Origin=url;
     if(node._h3Floating){node._h3Floating.frame.contentWindow?.postMessage({type:'h3-session',token:session.token},url);node._h3Floating.show();}
     else node._h3Floating=floatingEditor(session.url+(node._h3ReferenceToOpen?'&reference='+encodeURIComponent(node._h3ReferenceToOpen):''),`${node.title} · Scene editor`);
     clearInterval(node._h3Poll);
     node._h3Poll=setInterval(async()=>{
      if(node._h3Polling)return;node._h3Polling=true;
      try{
       const response=await fetch(url+'/api/bridge/session/'+session.token);
       if(!response.ok){clearInterval(node._h3Poll);return;}
       const state=await response.json();
       if(!state.pending||node._h3Session?.token!==session.token||!node.graph||node.graph!==app.graph||node.graph.getNodeById(node.id)!==node)return;
       const item=state.pending,widget=node.widgets.find(w=>w.name==='snapshot_path'),prompt=node.widgets.find(w=>w.name==='prompt_override');
       widget.value=item.path;prompt.value=item.prompt||'';prompt.callback?.(prompt.value);
       Object.assign(node.properties,{h3References:item.references||[],h3SentCanvas:item.canvas,h3TargetMP:item.canvas?.targetMP,h3AspectRatio:item.canvas?.aspectRatio,h3SizeMode:item.canvas?.sizeMode,h3CanvasSignature:`${item.canvas?.width}:${item.canvas?.height}`,h3ProjectId:item.projectId,h3EditorProjectId:item.projectId,h3Cover:item.coverAssetId,h3SentPrompt:item.prompt,h3Summary:`${item.title} · Send ${item.sendVersion||item.revision} · ${item.summary}`});
       node._h3RefreshPreview?.();widget.callback?.(widget.value);app.graph.setDirtyCanvas(true,true);
       const ack=await fetch(url+'/api/bridge/session/'+session.token,{method:'POST',headers:{'Content-Type':'application/json','X-H3-Bridge':'1'},body:JSON.stringify({action:'ack',id:item.id})});
       if(!ack.ok)console.warn('Onigiri delivery applied; acknowledgement will retry.');
      }catch(error){console.warn('Onigiri connection:',error.message);}finally{node._h3Polling=false;}
     },1000);
    }catch(error){alert('Onigiri: '+error.message);}finally{node._h3Opening=false;}
   },{serialize:false});
   sceneCard(this,app);
  };
  const removed=nodeType.prototype.onRemoved;
  nodeType.prototype.onRemoved=function(){this._h3Session=null;this._h3DisposeCanvasSync?.();this._h3Floating?.destroy();this._h3Floating=null;clearInterval(this._h3Poll);removed?.apply(this,arguments);};
 }
});
