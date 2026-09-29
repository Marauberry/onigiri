// Local notifications: a synthesized low bass ping and a light spill around the Director housing.
let audio=null,unlocked=false;

export function unlockAudio(){
 if(unlocked)return;unlocked=true;
 const start=()=>{try{audio||=new (window.AudioContext||window.webkitAudioContext)();audio.resume?.();}catch{audio=null;}};
 start();
 for(const type of ['pointerdown','keydown'])window.addEventListener(type,()=>{start();},{once:false,passive:true});
}

export function ping(){
 try{
  if(!audio){audio=new (window.AudioContext||window.webkitAudioContext)();}
  if(audio.state==='suspended'){audio.resume();return;}
  const now=audio.currentTime,osc=audio.createOscillator(),gain=audio.createGain(),filter=audio.createBiquadFilter();
  osc.type='sine';
  osc.frequency.setValueAtTime(132,now);
  osc.frequency.exponentialRampToValueAtTime(56,now+0.55);
  filter.type='lowpass';filter.frequency.value=340;filter.Q.value=0.7;
  gain.gain.setValueAtTime(0.0001,now);
  gain.gain.linearRampToValueAtTime(0.42,now+0.02);
  gain.gain.exponentialRampToValueAtTime(0.0008,now+0.95);
  osc.connect(filter);filter.connect(gain);gain.connect(audio.destination);
  osc.start(now);osc.stop(now+1);
 }catch{}
}

// The glow is drawn once inside the housing and once in a fixed layer so it can spill onto the canvas.
export function glow(housing,kind='ok'){
 if(!housing)return;
 const error=kind==='error';
 housing.classList.remove('notify-glow','notify-glow--error');void housing.offsetWidth;
 housing.classList.add('notify-glow');if(error)housing.classList.add('notify-glow--error');
 const rect=housing.getBoundingClientRect(),layer=document.createElement('div');
 layer.className='notify-spill'+(error?' notify-spill--error':'');
 Object.assign(layer.style,{left:(rect.left-20)+'px',top:(rect.top-20)+'px',width:(rect.width+40)+'px',height:(rect.height+40)+'px'});
 document.body.append(layer);
 layer.animate([{opacity:0,transform:'scale(.985)'},{opacity:1,transform:'none'},{opacity:.6,transform:'none'},{opacity:1,transform:'none'},{opacity:0,transform:'none'}],{duration:2600,easing:'ease-in-out'}).finished.catch(()=>{}).then(()=>layer.remove());
 setTimeout(()=>layer.remove(),2800);
 setTimeout(()=>housing.classList.remove('notify-glow','notify-glow--error'),2650);
}
