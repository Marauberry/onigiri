import {askDialog} from './dialogs.mjs';
import {contextMenu} from './editor-tools.mjs';

export function homeFoldersView(host,{folders,projects,folderCovers={},onChange,onOpen,onMove,onError,parent='',canUnpin=true,onUnpin,onTrash,onPin,onRename,addHost=null}){
  host.replaceChildren();
  addHost?.replaceChildren();
  const heading=document.createElement('div');heading.className='section-heading';
  const title=document.createElement('h3');title.textContent='';
  const add=document.createElement('button');add.textContent='＋ Add folder';add.className='quiet';
  const pin=async name=>{if(name&&!folders.includes(name))await onChange([...folders,name]);};
  const create=async()=>{const name=await askDialog({title:'New folder',message:'Folder name',value:'',confirm:'Add folder'});if(name?.trim())await pin(name.trim());};
  add.onclick=e=>{const available=parent?[]:[...new Set(projects.map(p=>p.folder).filter(f=>f&&!folders.includes(f)))].sort();if(!available.length){create().catch(onError);return;}contextMenu(e,[...available.map(name=>({label:name,run:()=>pin(name)})),{label:'New folder…',run:create}],onError);};
  if(!parent){if(addHost)addHost.append(add);else heading.append(add);}if(heading.childElementCount)host.append(heading);
  const grid=document.createElement('div');grid.className='home-folder-grid';host.append(grid);
  for(const name of folders){
    const card=document.createElement('button');card.className='home-folder';card.dataset.homeFolder=name;
    const icon=document.createElement('span');icon.className='folder-stack';const available=projects.filter(p=>p.folder===name&&!p.isTemplate);const covers=[available.find(p=>p.id===folderCovers[name])||available.find(p=>p.coverAssetId)||available[0]].filter(Boolean);for(let i=Math.max(1,covers.length)-1;i>=0;i--){const sheet=document.createElement('span');sheet.className='folder-sheet';sheet.style.setProperty('--sheet',i);const cover=covers[i]||covers[0];if(cover?.coverAssetId){const img=document.createElement('img');img.src='/api/asset/'+encodeURIComponent(cover.coverAssetId)+'?thumb';img.alt='';sheet.append(img);}else sheet.classList.add('folder-sheet--empty');icon.append(sheet);}
    const label=document.createElement('strong');label.textContent=name;
    const count=document.createElement('small');const total=projects.filter(p=>p.folder===name&&!p.isTemplate).length;count.textContent=total+' '+(total===1?'scene':'scenes');
    card.append(icon,label,count);card.onclick=()=>onOpen(name);
    card.oncontextmenu=e=>contextMenu(e,[...(onRename?[{label:'Rename folder…',run:()=>onRename(name)}]:[]),{label:'Open folder',run:()=>onOpen(name)},...(onPin?[{label:'Show on Home',run:()=>onPin(name)}]:[]),...(onTrash?[{label:'Move folder to Trash',run:()=>onTrash(name)}]:[]),...(canUnpin?[{label:'Remove from Home',run:()=>onUnpin?onUnpin(name):onChange(folders.filter(f=>f!==name))}]:[])],onError);
    card.ondragover=e=>{if(e.dataTransfer.types.includes('application/x-h3-projects')){e.preventDefault();e.stopPropagation();card.classList.add('drop-target');}};
    card.ondragleave=()=>card.classList.remove('drop-target');
    card.ondrop=e=>{const raw=e.dataTransfer.getData('application/x-h3-projects');if(!raw)return;e.preventDefault();e.stopPropagation();card.classList.remove('drop-target');try{const ids=JSON.parse(raw);if(Array.isArray(ids)&&ids.every(x=>typeof x==='string'))Promise.resolve(onMove(ids,name)).catch(onError);}catch{onError(Error('Could not read the dragged projects.'));}};
    grid.append(card);
  }
  if(false){const hint=document.createElement('p');hint.className='hint';hint.textContent='Keep whole project folders on Home, including folders you are starting.';grid.append(hint);}
}
