export function floatingEditor(url, title) {
  const host=document.createElement('section');host.setAttribute('aria-label',title);
  host.style.cssText='position:fixed;z-index:1100;left:4vw;top:6vh;width:90vw;height:86vh;min-width:480px;min-height:240px;max-width:100vw;max-height:96vh;resize:both;overflow:hidden;border:1px solid #626866;border-radius:16px;background:#222625;box-shadow:0 18px 70px #0007;display:flex;flex-direction:column';
  try{const box=JSON.parse(localStorage.getItem('h3-window'));if(box){host.style.width=Math.min(box.w,innerWidth)+'px';host.style.height=Math.min(box.h,innerHeight*.96)+'px';host.style.left=Math.max(0,Math.min(box.x,innerWidth-200))+'px';host.style.top=Math.max(0,Math.min(box.y,innerHeight-50))+'px';}}catch{}
  const bar=document.createElement('header');bar.style.cssText='display:flex;align-items:center;gap:12px;padding:8px 14px;color:#eee;font:12px system-ui;cursor:move;touch-action:none;flex-shrink:0';
  const label=document.createElement('span');label.textContent=title;label.style.flex='1';
  const minimize=document.createElement('button'),close=document.createElement('button');minimize.textContent='Minimize';close.textContent='Hide';
  for(const b of [minimize,close])b.style.cssText='border:0;background:transparent;color:#ddd;cursor:pointer;font:12px system-ui;padding:4px';
  bar.append(label,minimize,close);
  const frame=document.createElement('iframe');frame.src=url;frame.title='H3 floating editor';frame.style.cssText='width:100%;flex:1;min-height:0;border:0;background:#202223';host.append(bar,frame);document.body.append(host);
  const pause=()=>frame.contentWindow?.postMessage({type:'h3-pause'},new URL(url).origin);
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;let closing=null;
  const reveal=()=>{closing?.cancel();closing=null;host.hidden=false;host.style.display='flex';if(!reduced())host.animate([{opacity:0,transform:'translateY(8px) scale(.99)'},{opacity:1,transform:'none'}],{duration:180,easing:'ease-out'});};
  reveal();close.onclick=()=>{pause();if(reduced()){host.hidden=true;host.style.display='none';return;}closing=host.animate([{opacity:1},{opacity:0,transform:'translateY(6px) scale(.99)'}],{duration:140,easing:'ease-in'});closing.onfinish=()=>{host.hidden=true;host.style.display='none';closing=null;};};
  let fullHeight='';minimize.onclick=()=>{pause();if(!fullHeight){fullHeight=host.style.height;host.style.height='44px';host.style.minHeight='44px';frame.hidden=true;minimize.textContent='Expand';}else{host.style.height=fullHeight;host.style.minHeight='240px';frame.hidden=false;fullHeight='';minimize.textContent='Minimize';}};
  bar.onpointerdown=e=>{if(e.target.closest('button'))return;const box=host.getBoundingClientRect(),x=e.clientX,y=e.clientY;bar.setPointerCapture(e.pointerId);frame.style.pointerEvents='none';bar.onpointermove=m=>{host.style.left=Math.max(0,Math.min(innerWidth-160,box.x+m.clientX-x))+'px';host.style.top=Math.max(0,Math.min(innerHeight-44,box.y+m.clientY-y))+'px';};bar.onpointerup=()=>{bar.onpointermove=null;frame.style.pointerEvents='';save();};};
  const save=()=>{if(fullHeight||host.hidden)return;const b=host.getBoundingClientRect();localStorage.setItem('h3-window',JSON.stringify({x:b.x,y:b.y,w:b.width,h:b.height}));};
  const observer=new ResizeObserver(save);observer.observe(host);
  return {show:reveal,destroy(){closing?.cancel();observer.disconnect();frame.src='about:blank';host.remove();},frame};
}
