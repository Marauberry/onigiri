export function coverId(project) {return project.coverAssetId || project.references?.[0]?.id || null;}
export const starterTemplates = [
  ['river','Reze · River scene','Character and environment','Reze stands beside a river. Preserve her appearance from the character reference and use the environment reference for the river setting.'],
  ['dance','Reze · Dance','Motion transfer','Transfer the selected dance reference to Reze. Preserve her appearance from the character reference. Match scene duration deliberately to the prepared motion reference.'],
  ['sheet','Character sheet','Multiple views','Use the different views in the sheet as one character. Preserve clothing, proportions and identity throughout a short scene.'],
  ['storyboard','Storyboard sequence','Ordered visual beats','Follow the storyboard panels in order. Describe each shot explicitly and preserve character identity across cuts.'],
  ['product','Product showcase','Appearance and camera','Present the referenced product with a slow camera move. Preserve its shape, material, label and proportions.'],
  ['dialogue','Dialogue scene','Speech and language','A referenced character speaks one short line. Specify the language and write the actual dialogue in its native script.'],
].map(([key,title,subtitle,brief])=>({key,title,subtitle,brief}));
export function duplicateProject(source,id,{template=false}={}) {
  const p=structuredClone(source);
  for(const key of ['snapshotId','savedAt','labels','sendVersion','parentSnapshotId','branchedFrom','branchId','updated'])delete p[key];
  return {...p,id,created:new Date().toISOString(),showOnHome:false,revision:0,isTemplate:template,manualTitle:true,title:source.title+(template?' · Template':''),projectLabels:(source.projectLabels||[]).map(l=>({...l,id:crypto.randomUUID(),createdAt:new Date().toISOString(),pattern:l.pattern.replace(/\s*\(n\)/g,'')+' copy (n)'})),updated:new Date().toISOString()};
}

// Home pins refer to virtual project folders; empty folders remain valid pins.
export function normalizeHomeFolders(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.filter(x => typeof x === 'string').map(x => x.trim()).filter(x => {
    if (!x || seen.has(x)) return false;
    seen.add(x); return true;
  });
}
