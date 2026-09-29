export function floatingEditor(url,title){
  const backdrop=document.createElement('div');backdrop.className='h3-editor-backdrop';backdrop.style.cssText='position:fixed;inset:0;z-index:1100;background:#12121770;backdrop-filter:blur(12px);display:grid;place-items:center';
  const host=document.createElement('section');host.setAttribute('aria-label',title);host.style.cssText='width:94vw;height:92vh;max-width:1800px;display:flex;flex-direction:column;overflow:hidden;border:1px solid #7775;border-radius:18px;background:#222225;box-shadow:0 24px 100px #0008';
  const bar=document.createElement('header');bar.style.cssText='display:flex;align-items:center;padding:9px 18px;font:12px system-ui;color:#ddd';const label=document.createElement('span');label.textContent=title;label.style.flex='1';bar.append(label);
  const frame=document.createElement('iframe');frame.src=url;frame.title='Onigiri scene editor';frame.style.cssText='width:100%;flex:1;min-height:0;border:0';host.append(bar,frame);backdrop.append(host);document.body.append(backdrop);
  let animation;const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hide=()=>{frame.contentWindow?.postMessage({type:'h3-pause'},new URL(url).origin);animation?.cancel();const finish=()=>{backdrop.style.display='none';backdrop.hidden=true;};if(reduced())finish();else{animation=backdrop.animate([{opacity:1},{opacity:0}],{duration:140});animation.onfinish=finish;}};
  const show=()=>{animation?.cancel();backdrop.hidden=false;backdrop.style.display='grid';if(!reduced())host.animate([{opacity:0,transform:'translateY(10px) scale(.985)'},{opacity:1,transform:'none'}],{duration:190,easing:'ease-out'});frame.contentWindow?.postMessage({type:'h3-editor-open'},new URL(url).origin);};
  backdrop.onclick=e=>{if(e.target===backdrop)hide();};show();return {frame,show,destroy(){animation?.cancel();frame.src='about:blank';backdrop.remove();}};
}
