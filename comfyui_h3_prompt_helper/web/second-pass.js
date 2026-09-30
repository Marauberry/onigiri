import {app} from '../../../scripts/app.js';
import {canvasDimensions,resolutionPicker} from './canvas-panel.js';

const linkInfo=(graph,link)=>{
  if(link==null)return null;
  if(typeof link==='object')return link;
  const links=graph?.links;
  if(!links)return null;
  return typeof links.get==='function'?links.get(link):links[link];
};

// The 2nd Pass node derives its size from the incoming guide, so the picker follows the upstream canvas.
function guideCanvas(node){
  const seen=new Set();
  const visit=current=>{
    if(!current||seen.has(current.id))return null;
    seen.add(current.id);
    const widgets=current.widgets||[];
    const override=widgets.find(w=>w.name==='override_canvas'),width=widgets.find(w=>w.name==='width'),height=widgets.find(w=>w.name==='height');
    if(override&&width&&height&&override.value&&width.value>0&&height.value>0)return {ratio:width.value/height.value,source:current.title||'Onigiri',size:[width.value,height.value]};
    const sent=current.properties?.h3SentCanvas;
    if(sent?.width>0&&sent?.height>0)return {ratio:sent.width/sent.height,source:current.title||'Onigiri',size:[sent.width,sent.height],sent:true};
    for(const input of current.inputs||[]){
      const info=linkInfo(app.graph,input.link);
      const origin=info?.origin_id!=null?app.graph.getNodeById(info.origin_id):null;
      const found=visit(origin);
      if(found)return found;
    }
    return null;
  };
  const guide=node.inputs?.find(input=>input.name==='guide');
  const info=linkInfo(app.graph,guide?.link);
  return visit(info?.origin_id!=null?app.graph.getNodeById(info.origin_id):null);
}

app.registerExtension({
 name:'Onigiri.SecondPass',
 async beforeRegisterNodeDef(nodeType,nodeData){
  if(nodeData.name!=='OnigiriGuideResolution')return;
  // Shows the new name in the node menu on the next browser refresh, before a backend restart.
  nodeData.display_name='Onigiri 2nd Pass';
  const created=nodeType.prototype.onNodeCreated;
  nodeType.prototype.onNodeCreated=function(){
   created?.apply(this,arguments);
   if(!this.title||this.title==='Onigiri resolution')this.title='Onigiri 2nd Pass';
   const node=this,megapixels=node.widgets?.find(w=>w.name==='megapixels');
   if(!megapixels)return;
   megapixels.hidden=true;(megapixels.options||={}).hidden=true;megapixels.type='converted-widget';megapixels.computeSize=()=>[0,-4];megapixels.draw=()=>{};
   if(megapixels.element)megapixels.element.style.display='none';
   node.color='#44444d';node.bgcolor='#28282c';
   if(!document.getElementById('h3-second-pass-style')){
    const style=document.createElement('style');style.id='h3-second-pass-style';
    style.textContent=`
.h3-second-pass{box-sizing:border-box;padding:12px;background:linear-gradient(150deg,#303034,#242426 65%);color:#f2f2f7;font:12px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;border-radius:13px;overflow:auto}
.h3-second-pass *{box-sizing:border-box}.h3-second-pass .h3-canvas-picker{max-width:none}
.h3-second-pass .h3-second-pass-result{margin-top:10px;padding:9px 11px;border:1px solid #ffffff1c;border-radius:10px;background:#1c1c20;font-size:11px;line-height:1.6}
.h3-second-pass .h3-second-pass-result b{font-size:13px;font-weight:650}
.h3-second-pass .h3-second-pass-aspect{color:#a9a9b6}
`;
    document.head.append(style);
   }
   const host=document.createElement('div');host.className='h3-second-pass';
   const result=document.createElement('div');result.className='h3-second-pass-result';
   const sizeLine=document.createElement('div'),aspectLine=document.createElement('div');aspectLine.className='h3-second-pass-aspect';
   result.append(sizeLine,aspectLine);host.append(result);
   const current=()=>{const guide=guideCanvas(node),aspectRatio=guide?.ratio||16/9;return {aspectRatio,guide};};
   const refreshResult=()=>{
    const {aspectRatio,guide}=current(),dimensions=canvasDimensions(aspectRatio,megapixels.value);
    sizeLine.innerHTML=dimensions?`2nd pass <b>${dimensions.width} × ${dimensions.height}</b> · ${Number(megapixels.value.toFixed(3))} MP`:'Choose a valid canvas size.';
    aspectLine.textContent=guide?`Aspect ${aspectRatio.toFixed(3)} from ${guide.source}${guide.sent?' (last sent canvas)':''}${guide.size?` · ${guide.size[0]} × ${guide.size[1]}`:''}`:'Aspect follows the connected guide (16:9 assumed until one is connected).';
   };
   const refreshPicker=resolutionPicker(host,{
    getValue:()=>({aspectRatio:current().aspectRatio,targetMP:Number(megapixels.value)||1,sizeMode:node.properties.h3SecondPassSizeMode||'mp'}),
    onChange:value=>{
     megapixels.value=value.targetMP;megapixels.callback?.(value.targetMP);
     node.properties.h3SecondPassSizeMode=value.sizeMode;
     node.properties.h3SecondPassTargetMP=value.targetMP;
     node.properties.h3SecondPassSize=`${value.width} × ${value.height}`;
     refreshResult();app.graph.setDirtyCanvas(true,true);
    }
   });
   const refresh=()=>{refreshPicker();refreshResult();};
   node._h3RefreshSecondPass=refresh;
   node.addDOMWidget('second_pass_panel','div',host,{serialize:false,getMinHeight:()=>186,getMaxHeight:()=>620});
   node.setSize([Math.max(330,node.size?.[0]||330),Math.max(250,node.size?.[1]||250)]);
   refresh();
   const configured=node.onConfigure;
   node.onConfigure=function(){configured?.apply(this,arguments);refresh();};
   const connections=node.onConnectionsChange;
   node.onConnectionsChange=function(){connections?.apply(this,arguments);refresh();};
   app.graph.setDirtyCanvas(true,true);
  };
 }
});
