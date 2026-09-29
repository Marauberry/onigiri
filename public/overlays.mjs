// A shared backdrop policy for static and dynamically mounted floating menus.
export function installOverlays(){
 const installed=new WeakSet();
 const prepare=d=>{
  for(const b of d.querySelectorAll('button')){
   const label=b.getAttribute('aria-label')||b.textContent.trim();
   if(/^close(?:\s|$)/i.test(label)||/^(×|✕|x)$/i.test(label)||b.hasAttribute('data-done'))b.hidden=true;
  }
  if(installed.has(d))return;installed.add(d);let outside=false;
  const beyond=e=>{const r=d.getBoundingClientRect();return e.target===d&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom);};
  d.addEventListener('pointerdown',e=>outside=beyond(e));
  d.addEventListener('click',e=>{if(outside&&beyond(e)&&!d.querySelector('[data-save]:disabled,[data-confirm]:disabled'))d.close();outside=false;});
  d.addEventListener('cancel',e=>e.preventDefault());
 };
 const scan=()=>document.querySelectorAll('dialog').forEach(prepare);
 new MutationObserver(scan).observe(document.body,{childList:true,subtree:true});scan();
}
