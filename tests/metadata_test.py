import ast
import json
import tempfile
from pathlib import Path
from types import SimpleNamespace
import uuid
from datetime import datetime, timezone
source=Path('comfyui_h3_prompt_helper/__init__.py').read_text(encoding='utf-8')
function=next(n for n in ast.parse(source).body if isinstance(n,ast.FunctionDef) and n.name=='snapshot_metadata')
root=Path(tempfile.mkdtemp(prefix='h3-metadata-'));(root/'data'/'snapshots').mkdir(parents=True)
base={'id':'project','revision':1,'snapshotId':'base','prompt':'Original','references':[]}
def read_snapshot(value):
 return {'helperRoot':str(root)},dict(base)
context={'nodes':SimpleNamespace(NODE_CLASS_MAPPINGS={'Save':SimpleNamespace(OUTPUT_NODE=True)}),'read_snapshot':read_snapshot,'Path':Path,'uuid':uuid,'datetime':datetime,'timezone':timezone,'json':json}
exec(compile(ast.Module(body=[function],type_ignores=[]),'<metadata>','exec'),context)
graph={'a':{'class_type':'H3SceneGuide','inputs':{'snapshot_path':'a','prompt_override':'Scene A'}},'b':{'class_type':'H3SceneGuide','inputs':{'snapshot_path':'b','prompt_override':'Scene B'}},'unused':{'class_type':'H3SceneGuide','inputs':{'snapshot_path':'x','prompt_override':'Unused'}},'outA':{'class_type':'Save','inputs':{'guide':['a',0]}},'outB':{'class_type':'Save','inputs':{'guide':['b',0]}}}
result=context['snapshot_metadata']({'prompt':graph})['extra_data']['extra_pnginfo']['h3_prompt_helper']
assert len(result['snapshots'])==2
assert len(result['output_snapshots']['outA'])==1
assert len(result['output_snapshots']['outB'])==1
assert result['output_snapshots']['outA']!=result['output_snapshots']['outB']
assert len(list((root/'data'/'snapshots').glob('*.json')))==2
print('PASS: distinct output provenance, unused Guide exclusion, immutable prompt overrides.')
canvas_graph={'a':{'class_type':'H3SceneGuideV3','inputs':{'snapshot_path':'a','prompt_override':'','override_canvas':True,'width':832,'height':480,'length':124}},'out':{'class_type':'Save','inputs':{'guide':['a',0]}}}
canvas=context['snapshot_metadata']({'prompt':canvas_graph})['extra_data']['extra_pnginfo']['h3_prompt_helper']['snapshots'][0]['snapshot']
assert (canvas['width'],canvas['height'],canvas['length'])==(832,480,124)
assert canvas['parentSnapshotId']=='base'
print('PASS: V3 canvas overrides retained in immutable output provenance.')
refine_graph={'a':{'class_type':'H3SceneGuideV2','inputs':{'snapshot_path':'a','prompt_override':''}},'refine':{'class_type':'H3RefinePass','inputs':{'guide':['a',0],'scale':1.5}},'outRefine':{'class_type':'Save','inputs':{'latent':['refine',1]}}}
result=context['snapshot_metadata']({'prompt':refine_graph})
assert result['extra_data']['extra_pnginfo']['h3_prompt_helper']['refinement_passes']==[{'node_id':'refine','scale_input':1.5,'outputs':['outRefine']}]
print('Refinement queue metadata attribution passed.')
