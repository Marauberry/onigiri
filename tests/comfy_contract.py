"""Run with ComfyUI's Python. Real native H3 routing with lightweight encoder doubles."""
import importlib.util
import json
from pathlib import Path
import sys
import types

ROOT = Path(__file__).resolve().parents[1]
COMFY = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(COMFY))
sys.argv = [sys.argv[0], '--cpu']
import torch
import server
from aiohttp import web
server.PromptServer.instance = types.SimpleNamespace(routes=web.RouteTableDef())
spec = importlib.util.spec_from_file_location('helper_test', ROOT/'comfyui_h3_prompt_helper'/'__init__.py')
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
helper.configuration = lambda: {'helperRoot': str(ROOT), 'ffmpeg': 'C:/ffmpeg/ffmpeg.exe'}

class Clip:
    def tokenize(self, prompt, **kw):
        self.items = kw['minimax_ref_items']
        return prompt
    def encode_from_tokens_scheduled(self, tokens):
        return [[torch.zeros(1,1,4), {}]]

class VisualVAE:
    def encode(self, images):
        # Native H3 requires B,C,T,H,W latents. No actual model weights loaded.
        return torch.zeros(1,24,2,max(1,images.shape[1]//16),max(1,images.shape[2]//16))

class AudioVAE:
    audio_sample_rate = 32000
    def encode(self, waveform):
        return torch.zeros(1,32,2,max(1,round(waveform.shape[1]/32000*40)))

snapshot=json.loads((ROOT/'test-results'/'smoke-snapshot.json').read_text())['path']
clip=Clip()
positive, latent, prompt=helper.H3PromptHelper().condition(clip, VisualVAE(), AudioVAE(), snapshot)
assert [x['type'] for x in clip.items] == ['image','audio','video','audio']
assert len(positive[0][1]['minimax_refs']) == 3
assert [x['kind'] for x in positive[0][1]['minimax_refs']] == ['image','video_audio','audio']
assert latent['samples'].tensors[0].shape == (1,24,37,32,48)
assert '<Audio 2>' in prompt
cfg,item=helper.read_snapshot(snapshot)
video=next(r for r in item['references'] if r['type']=='video')
frames=helper.load_video(cfg,video,768,512,124)
assert frames.shape[0] == 39, frames.shape
audio=helper.load_audio(cfg,video,frames.shape[0]/24)
assert audio['waveform'].shape[-1] == 52000
try:
    helper.inside(ROOT/'config.local.json',ROOT/'data'/'snapshots')
    raise AssertionError('Outside path accepted')
except ValueError:
    pass
print('PASS: native H3 delegation, media decoding, 30 to 24 fps, trim alignment, reference ordering, containment.')

# Metadata captures the queued snapshot, including for the embedded node.
meta = helper.snapshot_metadata({'prompt': {'42': {'class_type': 'H3PromptHelperEmbedded', 'inputs': {'snapshot_path': snapshot}}, 'output': {'class_type': 'SaveImage', 'inputs': {'images': ['42', 0]}}}})

assert meta['extra_data']['extra_pnginfo']['h3_prompt_helper']['snapshots'][0]['snapshot_id'] == item['snapshotId']
print('Queue-time snapshot metadata passed.')
# The new Guide delegates to the same native conditioning path.
guide = helper.H3SceneGuide().guide(snapshot, '')[0]
guide_result = helper.H3GuideConditioning().condition(guide, Clip(), VisualVAE(), AudioVAE())
positive2, latent2, text2 = guide_result[:3]
assert guide_result[3:8] == (item["width"], item["height"], item["length"], item["length"]/24, 24.0)
assert text2 == prompt
queued = {'prompt': {'1': {'class_type': 'H3SceneGuide', 'inputs': {'snapshot_path': snapshot, 'prompt_override': prompt+'\nA gentle camera move.'}}}}
queued['prompt']['output'] = {'class_type': 'SaveImage', 'inputs': {'images': ['1', 0]}}
queued['prompt']['unused'] = {'class_type': 'H3SceneGuide', 'inputs': {'snapshot_path': snapshot, 'prompt_override': ''}}
queued = helper.snapshot_metadata(queued)
assert len(queued['extra_data']['extra_pnginfo']['h3_prompt_helper']['snapshots']) == 1
entry = queued['extra_data']['extra_pnginfo']['h3_prompt_helper']['snapshots'][0]
assert entry['snapshot']['prompt'].endswith('A gentle camera move.')
assert entry['snapshot_id'] != item['snapshotId']
assert queued['prompt']['1']['inputs']['prompt_override'] == ''
assert json.loads(Path(snapshot).read_text())['prompt'] == prompt
print('Guide native delegation and immutable queue override passed.')
# V2 outputs retain the exact native conditioning result and expose seconds on the Guide.
guide_v2 = helper.H3SceneGuideV2().guide(snapshot, '')
assert len(guide_v2) == 4
assert guide_v2[1:] == (item['width'], item['height'], item['length']/24)
assert helper.H3GuideConditioningV2.RETURN_NAMES == ('positive', 'latent')
assert len(helper.H3GuideConditioningV2().condition(guide_v2[0], Clip(), VisualVAE(), AudioVAE())) == 2
print('V2 Guide width/height/seconds and compact conditioning passed.')
guide_v3 = helper.H3SceneGuideV3().guide(snapshot, '', True, 832, 480, 124)
assert guide_v3[1:] == (832, 480, 124, 124/24)
assert helper.H3SceneGuideV3.RETURN_TYPES[3] == 'INT'
assert guide_v3[0]['canvas_override'] == {'width':832,'height':480,'length':124}
v3_condition = helper.H3GuideConditioningV2().condition(guide_v3[0], Clip(), VisualVAE(), AudioVAE())
assert tuple(v3_condition[1]['samples'].tensors[0].shape[-2:]) == (30, 52)
try:
    helper.H3SceneGuideV3().guide(snapshot, '', True, 833, 480, 124)
    raise AssertionError('Invalid canvas accepted')
except ValueError:
    pass
print('V3 frame output, canvas overrides and invalid geometry rejection passed.')
from comfy.nested_tensor import NestedTensor
# Constant-per-frame values detect accidental temporal mixing during spatial resizing.
v, a = latent['samples'].tensors
v = torch.arange(v.shape[2], dtype=torch.float32).view(1,1,-1,1,1).expand_as(v).clone()
a = torch.randn_like(a)
refined = helper.H3RefinePass().prepare(guide, {'samples': NestedTensor((v,a))}, Clip(), VisualVAE(), AudioVAE(), 1.5)
out_v, out_a = refined[1]['samples'].tensors
assert refined[2:] == (1152,768)
assert out_v.shape == (1,24,v.shape[2],48,72)
assert torch.equal(out_a,a)
assert torch.allclose(out_v[:,:,5],torch.full_like(out_v[:,:,5],5))
assert out_a.data_ptr() != a.data_ptr()
print('Experimental Refine Pass: native conditioning, spatial resize, temporal values and audio preservation passed; no full H3 render.')

small = v[..., :16, :16].clone()
for mode, multiplier, size in [('2x dimensions', 2, 512), ('3x dimensions', 2, 768), ('4x dimensions', 2, 1024), ('Megapixel multiplier', 4, 512)]:
    result = helper.H3RefineCanvas().prepare_canvas(guide, {'samples': NestedTensor((small,a))}, Clip(), VisualVAE(), AudioVAE(), mode, multiplier)
    assert result[2:4] == (size, size)
    assert result[4] == size * size / 1e6
    assert torch.equal(result[1]['samples'].tensors[1], a)
    assert torch.allclose(result[1]['samples'].tensors[0][:,:,5], torch.full_like(result[1]['samples'].tensors[0][:,:,5], 5))
try:
    helper.H3RefineCanvas().prepare_canvas(guide, {'samples': NestedTensor((v,a))}, Clip(), VisualVAE(), AudioVAE(), '4x dimensions', 2)
    raise AssertionError('Over-limit upscale accepted')
except ValueError:
    pass
print('PASS: 2x/3x/4x dimensions, area multiplier, MP output, unchanged timing/audio and 2048 limit.')

for frames in (719, 957, 3592):
    long_guide = helper.H3SceneGuideV3().guide(snapshot, '', True, 832, 480, frames)
    assert long_guide[3:] == (frames, frames/24)
print('PASS: extended duration guide contract at 719, 957 and 3592 frames; no long render claimed.')

assert set(helper.NODE_CLASS_MAPPINGS) == {'H3SceneGuideV3', 'H3GuideConditioningV2', 'OnigiriGuideResolution'}
assert set(helper.NODE_DISPLAY_NAME_MAPPINGS.values()) == {'Onigiri', 'Onigiri conditioning', 'Onigiri 2nd Pass'}
print('PASS: only the three Onigiri nodes are registered.')

original = helper.H3SceneGuideV3().guide(snapshot, 'Preserved prompt', True, 832, 480, 124)[0]
original_canvas = dict(original['canvas_override'])
resized, width, height = helper.OnigiriGuideResolution().resize(original, 0.98)
assert original['canvas_override'] == original_canvas
assert resized['canvas_override']['length'] == 124
assert resized['prompt_override'] == 'Preserved prompt'
assert resized['snapshot_path'] == original['snapshot_path']
assert width % 32 == height % 32 == 0
assert (width, height) == (1312, 736)
# LBH Target dimensions, align 32, H3 spatial downsample 16 yields these exact pixels.
assert round(width / 32) * 32 // 16 * 16 == width
assert round(height / 32) * 32 // 16 * 16 == height
for invalid in (0, 2.1, float('nan')):
    try:
        helper.OnigiriGuideResolution().resize(original, invalid)
        raise AssertionError('Invalid MP accepted')
    except ValueError:
        pass
print('PASS: resolution-only guide preserves source, prompt and frames; exact LBH target-dimension alignment.')
