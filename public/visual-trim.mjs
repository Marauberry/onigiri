// All coordinates stay in source seconds. Each selected segment keeps its own source.
export function visualTrim({video,source,read,write,seek}) {
  const strip=document.querySelector('#filmstrip');
  let host=strip.parentElement;
  if(!host.classList.contains('trim-track')){host=document.createElement('div');host.className='trim-track';strip.before(host);host.append(strip);}
  host.querySelectorAll(':scope > :not(img)').forEach(el=>el.remove());
  const left=document.createElement('div'),right=document.createElement('div'),range=document.createElement('div'),playhead=document.createElement('div');
  left.className='trim-shade before';right.className='trim-shade after';range.className='trim-kept';playhead.className='trim-playhead';host.append(left,right,range,playhead);
  const handles=['start','end'].map(key=>{const b=document.createElement('button');b.className='trim-grip';b.dataset.trim=key;b.textContent=key==='start'?'IN':'OUT';b.setAttribute('aria-label','Trim '+key);host.append(b);b.onkeydown=e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();adjust(key,read()[key]+(e.key==='ArrowRight'?1:-1)*(e.shiftKey?10:1)/(source().fps||24));};return b;});
  const at=e=>Math.max(0,Math.min(source().duration,(e.clientX-host.getBoundingClientRect().left)/host.clientWidth*source().duration));
  function adjust(key,value){const c=read(),fps=source().fps||24,step=1/fps;value=Math.round(value*fps)/fps;value=key==='start'?Math.max(0,Math.min(c.end-step,value)):Math.min(source().duration,Math.max(c.start+step,value));write({...c,[key]:value});seek(value);draw();}
  let dragging=null;
  host.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();video.pause();dragging=e.target.dataset.trim||'seek';host.setPointerCapture(e.pointerId);if(dragging==='seek')seek(at(e));else adjust(dragging,at(e));};
  host.onpointermove=e=>{if(!dragging)return;if(dragging==='seek'){seek(at(e));draw();}else adjust(dragging,at(e));};
  host.onpointerup=host.onpointercancel=()=>dragging=null;
  function draw(){const c=read(),duration=source().duration||1,a=100*c.start/duration,b=100*c.end/duration;left.style.width=a+'%';right.style.width=(100-b)+'%';range.style.left=a+'%';range.style.width=(b-a)+'%';handles[0].style.left=a+'%';handles[1].style.left=b+'%';playhead.style.left=Math.min(100,100*video.currentTime/duration)+'%';handles.forEach((h,i)=>h.title=(i?'Out: ':'In: ')+(i?c.end:c.start).toFixed(2)+' seconds · arrow keys adjust one frame');}
  draw();return {draw};
}
