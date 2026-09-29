export function mediaBox(ref){
 const ratio=Number(ref?.width)>0&&Number(ref?.height)>0?ref.width/ref.height:16/9;
 const width=Math.min(300,220*ratio);return {width:Math.round(width),height:Math.round(width/ratio)};
}
export function resolveCollisions(rects,gap=24){
 const placed=[];
 for(const source of rects){const r={...source};
  for(let i=0;i<=placed.length;i++){const hit=placed.find(p=>r.x<p.x+p.w+gap&&p.x<r.x+r.w+gap&&r.y<p.y+p.h+gap&&p.y<r.y+r.h+gap);if(!hit)break;r.y=hit.y+hit.h+gap;}
  placed.push(r);
 }return placed;
}
export function boardConnections(project){
 const edges=[['intent','draft'],['draft','compiled']],refs=new Set(project.references.map(r=>r.id));
 for(const r of project.references)edges.push(['reference:'+r.id,'draft']);
 for(const s of project.subjects){for(const id of new Set([s.sourceId,...(s.sources||[]).map(x=>x.sourceId)].filter(id=>refs.has(id))))edges.push(['reference:'+id,'subject:'+s.id]);edges.push(['subject:'+s.id,'draft']);}
 for(const n of project.board?.notes||[])edges.push(['note:'+n.id,'draft']);
 return edges;
}
