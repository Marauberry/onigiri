import {canvasSync} from './canvas-sync.js';
import {canvasPanel} from './canvas-panel.js';
export function sceneCard(node,app){
  const prompt=node.widgets.find(w=>w.name==='prompt_override'),snapshot=node.widgets.find(w=>w.name==='snapshot_path'),launcher=node.widgets.find(w=>w.name.startsWith('Open Onigiri'));
  for(const widget of [snapshot,prompt,launcher]){widget.hidden=true;(widget.options||={}).hidden=true;widget.type='converted-widget';widget.computeSize=()=>[0,-4];widget.draw=()=>{};if(widget.element)widget.element.style.display='none';if(widget.inputEl)widget.inputEl.style.display='none';}
  if(!document.getElementById('h3-scene-card-style')){const style=document.createElement('style');style.id='h3-scene-card-style';style.textContent=`
.h3-scene-card{box-sizing:border-box;height:100%;padding:16px;background:linear-gradient(150deg,#303034,#242426 65%);color:#f2f2f7;font:12px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;border-radius:13px;overflow:auto;container-type:inline-size}
.h3-scene-card *{box-sizing:border-box}.h3-scene-card button{color:#eeeef4;background:linear-gradient(#55555d,#3a3a41);border:1px solid #ffffff20;border-radius:9px;box-shadow:inset 0 1px #ffffff17,0 2px 4px #0003;font:500 11px inherit;cursor:pointer;transition:filter .15s,transform .15s}.h3-scene-card button:hover{filter:brightness(1.16)}.h3-scene-card button:active{transform:translateY(1px)}.h3-scene-card :is(button,input,textarea,summary):focus-visible{outline:2px solid #99bbff;outline-offset:2px}
.h3-scene-header{display:grid;grid-template-columns:100px minmax(0,1fr);gap:14px;align-items:center}.h3-scene-cover{height:76px;overflow:hidden;border:1px solid #ffffff15;border-radius:10px;background:linear-gradient(135deg,#555561,#333339);display:grid;place-items:center;cursor:pointer}.h3-scene-cover img{width:100%;height:100%;object-fit:cover}.h3-scene-cover span{font:italic 18px Georgia;color:#c9c9d3;text-align:center}.h3-scene-title{color:#c7c7cf;font-size:11px;margin-bottom:9px;overflow-wrap:anywhere}.h3-scene-card .h3-open-editor{padding:9px 17px;color:#262630;background:linear-gradient(#fafaff,#c5c5d2);border-color:#ffffff55;box-shadow:inset 0 1px #fff,0 2px 5px #0004;font-weight:600;font-size:12px}
 .h3-canvas-panel{margin:14px 0 12px;padding:0;border:0;background:none}.h3-canvas-panel .h3-canvas-picker{max-width:none}


.h3-scene-refs{display:flex;gap:6px;overflow-x:auto;margin:10px 0}.h3-scene-refs:empty{display:none}.h3-scene-refs button{padding:0;overflow:hidden;flex-shrink:0}.h3-scene-refs img{display:block;width:48px;height:34px;object-fit:cover}.h3-prompt-caption{display:flex;justify-content:space-between;color:#bfbfcb;font-size:11px}.h3-prompt-caption span{color:#9292a0;font-size:10px}.h3-scene-card textarea{width:100%;height:122px;margin-top:7px;resize:vertical;background:#1b1b1f;color:#e9e9f2;border:1px solid #ffffff20;border-radius:9px;padding:10px;font:11px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:inset 0 1px 4px #0003}
@media(prefers-reduced-motion:reduce){.h3-scene-card button{transition:none}}
`;document.head.append(style);}
  node.color='#44444d';node.bgcolor='#28282c';
  const host=document.createElement('div');host.className='h3-scene-card';
  const header=document.createElement('div');header.className='h3-scene-header';
  const cover=document.createElement('div');cover.className='h3-scene-cover';cover.title='Double-click to open scene';cover.ondblclick=()=>launcher.callback();
  const heading=document.createElement('div'),title=document.createElement('div');title.className='h3-scene-title';
  const button=document.createElement('button');button.type='button';button.className='h3-open-editor';button.textContent='Open scene editor ↗';button.onclick=()=>launcher.callback();heading.append(title,button);header.append(cover,heading);host.append(header);
  const refreshCanvas=canvasPanel(node,app,host);canvasSync(node,app);
  const strip=document.createElement('div');strip.className='h3-scene-refs';
  const details=document.createElement('section'),summary=document.createElement('div');summary.className='h3-prompt-caption';summary.innerHTML='Prompt <span>Quick edit · saved in this node</span>';
  const text=document.createElement('textarea');text.setAttribute('aria-label','Scene prompt');text.spellcheck=false;text.oninput=()=>{prompt.value=text.value;prompt.callback?.(text.value);title.textContent=(node.properties.h3Summary||'Scene')+(text.value!==node.properties.h3SentPrompt?' · Edited since Send':'');app.graph.setDirtyCanvas(true,true);};details.append(summary,text);host.append(strip,details);
  node._h3RefreshPreview=()=>{refreshCanvas();cover.replaceChildren();const id=node.properties.h3Cover||node.properties.h3References?.[0]?.id;if(id){const img=document.createElement('img');img.src='http://127.0.0.1:47831/api/asset/'+encodeURIComponent(id)+'?thumb';img.alt='Scene cover';cover.append(img);}else{const empty=document.createElement('span');empty.textContent='Your next scene';cover.append(empty);}title.textContent=node.properties.h3Summary||'Add references and send your scene';text.value=prompt.value||'';strip.replaceChildren();for(const ref of node.properties.h3References||[]){const b=document.createElement('button');b.type='button';b.title=ref.name;const img=document.createElement('img');img.src='http://127.0.0.1:47831/api/asset/'+encodeURIComponent(ref.id)+'?thumb';img.alt=ref.name;b.append(img);b.onclick=()=>{node._h3ReferenceToOpen=ref.id;launcher.callback();node._h3Floating?.frame.contentWindow?.postMessage({type:'h3-reference',id:ref.id},'http://127.0.0.1:47831');};strip.append(b);}};
  const hasCanvas=node.widgets.some(w=>w.name==='override_canvas'),minHeight=hasCanvas?510:330;
  node.addDOMWidget('scene_card','div',host,{serialize:false,getMinHeight:()=>hasCanvas?390:220,getMaxHeight:()=>1100});node._h3RefreshPreview();node.setSize([600,minHeight]);
  const configured=node.onConfigure;node.onConfigure=function(){configured?.apply(this,arguments);this._h3RefreshPreview();this.setSize([Math.max(460,this.size[0]),Math.max(minHeight,this.size[1])]);};
}

