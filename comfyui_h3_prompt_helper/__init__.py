import uuid
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
import threading
import time
import urllib.request

import nodes
import numpy as np
from PIL import Image, ImageOps
import torch
from aiohttp import web
from server import PromptServer
from comfy_extras.nodes_minimax_h3 import MiniMaxH3ReferenceToVideo

WEB_DIRECTORY = './web'
CONFIG_FILE = Path(__file__).with_name('helper_config.json')


def configuration():
    if not CONFIG_FILE.is_file():
        raise ValueError('Run install-comfy.ps1 from H3 Prompt Helper first.')
    return json.loads(CONFIG_FILE.read_text(encoding='utf-8-sig'))


def inside(file, root):
    resolved = Path(file).resolve()
    if not resolved.is_relative_to(Path(root).resolve()):
        raise ValueError('The snapshot or reference is outside the helper data folder.')
    return resolved


def read_snapshot(snapshot_path):
    cfg = configuration()
    app_config = Path(cfg['helperRoot']) / 'config.local.json'
    settings = json.loads(app_config.read_text(encoding='utf-8-sig')) if app_config.exists() else {}
    roots = [Path(settings.get('dataDir') or Path(cfg['helperRoot'])/'data'), *[Path(p) for p in settings.get('previousDataDirs', [])]]
    data = next((root for root in roots if Path(snapshot_path).resolve().is_relative_to((root/'snapshots').resolve())), roots[0])
    cfg = {**cfg, 'snapshotDataDir': str(data)}
    snapshot = inside(snapshot_path, data / 'snapshots')
    item = json.loads(snapshot.read_text(encoding='utf-8'))
    if item.get('schema') != 1 or item.get('mode') != 'ref2va':
        raise ValueError('This bridge supports version 1 Ref2VA snapshots.')
    if not item.get('prompt', '').strip() or '<Missing reference' in item['prompt']:
        raise ValueError('The snapshot has an empty prompt or missing references.')
    for ref in item['references']:
        inside(ref['path'], data / 'assets')
        if ref['type'] not in ('image', 'video', 'audio'):
            raise ValueError('Unknown reference type.')
    for kind, limit in [('image', 9), ('video', 3), ('audio', 3)]:
        if sum(r['type'] == kind for r in item['references']) > limit:
            raise ValueError(f'Too many {kind} references for native H3.')
    if len(item['references']) > 12:
        raise ValueError('At most 12 reference files are supported.')
    return cfg, item


def ffmpeg_bytes(cfg, args):
    result = subprocess.run([cfg['ffmpeg'], '-v', 'error', *args], capture_output=True,
                            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0), timeout=120)
    if result.returncode:
        raise ValueError('Cannot decode reference: ' + result.stderr.decode('utf-8', errors='replace')[-2000:])
    return result.stdout


def trim(ref):
    start = float(ref.get('trimStart', 0))
    end = float(ref.get('trimEnd') or ref.get('duration', 0))
    if not (math.isfinite(start) and math.isfinite(end) and 0 <= start < end <= ref['duration'] + .05):
        raise ValueError('Invalid reference trim range.')
    if not 2 <= end - start <= 15.05:
        raise ValueError('Reference windows must be 2–15 seconds.')
    return start, end - start


def load_audio(cfg, ref, duration_cap=None):
    start, duration = trim(ref)
    if duration_cap is not None:
        duration = min(duration, duration_cap)
    raw = ffmpeg_bytes(cfg, ['-ss', str(start), '-i', ref['path'], '-t', str(duration),
                            '-vn', '-ac', '2', '-ar', '32000', '-f', 'f32le', 'pipe:1'])
    values = np.frombuffer(raw, dtype='<f4').copy()
    if values.size < 2:
        raise ValueError('Reference has no decodable audio.')
    return {'waveform': torch.from_numpy(values.reshape(-1, 2).T).unsqueeze(0), 'sample_rate': 32000}


def load_image(ref, width, height):
    with Image.open(ref['path']) as opened:
        img = ImageOps.exif_transpose(opened).convert('RGB')
        scale = min(1, math.sqrt(width * height / (img.width * img.height)))
        if scale < 1:
            img = img.resize((max(32, round(img.width * scale)), max(32, round(img.height * scale))), Image.Resampling.LANCZOS)
        return torch.from_numpy(np.asarray(img).copy()).float().div_(255).unsqueeze(0)


def load_video(cfg, ref, width, height, length):
    start, duration = trim(ref)
    scale = min(1, math.sqrt(width * height / (ref['width'] * ref['height'])))
    w = max(32, round(ref['width'] * scale / 32) * 32)
    h = max(32, round(ref['height'] * scale / 32) * 32)
    raw = ffmpeg_bytes(cfg, ['-ss', str(start), '-i', ref['path'], '-t', str(min(duration, length / 24)),
                            '-an', '-vf', f'fps=24,scale={w}:{h}', '-frames:v', str(length),
                            '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'])
    frames = len(raw) // (w * h * 3)
    frames = ((frames - 5) // 17) * 17 + 5
    if frames < 5:
        raise ValueError('Video reference has fewer than 5 usable frames.')
    return torch.from_numpy(np.frombuffer(raw, dtype=np.uint8, count=frames*w*h*3).copy().reshape(frames,h,w,3)).float().div_(255)


class H3PromptHelper:
    @classmethod
    def INPUT_TYPES(cls):
        return {'required': {
            'clip': ('CLIP',), 'vae': ('VAE',), 'audio_vae': ('VAE',),
            'snapshot_path': ('STRING', {'default': '', 'multiline': False}),
        }}

    RETURN_TYPES = ('CONDITIONING', 'LATENT', 'STRING')
    RETURN_NAMES = ('positive', 'latent', 'prompt')
    FUNCTION = 'condition'
    CATEGORY = 'H3 Prompt Helper/Legacy'
    DESCRIPTION = 'Open the browser helper, send a snapshot, then queue native H3 conditioning.'

    @classmethod
    def IS_CHANGED(cls, snapshot_path, **kwargs):
        if not snapshot_path:
            return ''
        cfg, item = read_snapshot(snapshot_path)
        return hashlib.sha256(json.dumps(item, sort_keys=True).encode()).hexdigest()

    def condition(self, clip, vae, audio_vae, snapshot_path):
        if not snapshot_path:
            raise ValueError('Open Prompt Helper and send a snapshot before queuing.')
        cfg, item = read_snapshot(snapshot_path)
        return self.condition_item(clip, vae, audio_vae, cfg, item)

    def condition_item(self, clip, vae, audio_vae, cfg, item):
        w, h, length = item['width'], item['height'], item['length']
        if any(not isinstance(n, int) or n < 32 or n > 2048 or n % 32 for n in [w,h]):
            raise ValueError('Canvas dimensions must be multiples of 32, up to 2048.')
        if not isinstance(length, int) or length < 5 or length > 3592 or (length - 5) % 17:
            raise ValueError('Invalid H3 frame count.')
        images, videos, audios, soundtracks = {}, {}, {}, {}
        for ref in item['references']:
            if ref['type'] == 'image':
                images[f'ref_image_{len(images)+1}'] = load_image(ref,w,h)
        for ref in item['references']:
            if ref['type'] == 'video':
                index = len(videos)+1
                frames = load_video(cfg,ref,w,h,length)
                videos[f'ref_video_{index}'] = frames
                if ref.get('withAudio'):
                    soundtracks[f'ref_video_audio_{index}'] = load_audio(cfg,ref,frames.shape[0]/24)
        for ref in item['references']:
            if ref['type'] == 'audio':
                audios[f'ref_audio_{len(audios)+1}'] = load_audio(cfg,ref)
        result = MiniMaxH3ReferenceToVideo.execute(clip=clip,vae=vae,audio_vae=audio_vae,
                    prompt=item['prompt'],width=w,height=h,length=length,ref_image_size='match',
                    ref_images=images,ref_videos=videos,ref_video_audios=soundtracks,ref_audios=audios)
        positive, latent = result.result
        return positive, latent, item['prompt']


class H3PromptHelperEmbedded(H3PromptHelper):
    pass

class H3SceneGuide:
    @classmethod
    def INPUT_TYPES(cls):
        return {'required': {'snapshot_path': ('STRING', {'default': ''}),
                             'prompt_override': ('STRING', {'default': '', 'multiline': True})}}
    RETURN_TYPES = ('H3_SCENE_GUIDE',)
    RETURN_NAMES = ('guide',)
    FUNCTION = 'guide'
    CATEGORY = 'H3 Prompt Helper'
    DESCRIPTION = 'Edit your scene in the floating workspace. Send, then queue.'

    @classmethod
    def IS_CHANGED(cls, snapshot_path, **kwargs):
        if not snapshot_path:
            return ''
        _, item = read_snapshot(snapshot_path)
        digest = hashlib.sha256(json.dumps(item, sort_keys=True).encode())
        for ref in item['references']:
            with open(ref['path'], 'rb') as media:
                for block in iter(lambda: media.read(1024 * 1024), b''):
                    digest.update(block)
        return digest.hexdigest()

    def guide(self, snapshot_path, prompt_override):
        read_snapshot(snapshot_path)
        return ({'snapshot_path': snapshot_path, 'prompt_override': prompt_override,
                 'fingerprint': self.IS_CHANGED(snapshot_path)},)


class H3GuideConditioning:
    @classmethod
    def INPUT_TYPES(cls):
        return {'required': {'guide': ('H3_SCENE_GUIDE',), 'clip': ('CLIP',),
                             'vae': ('VAE',), 'audio_vae': ('VAE',)}}
    RETURN_TYPES = ('CONDITIONING', 'LATENT', 'STRING', 'INT', 'INT', 'INT', 'FLOAT', 'FLOAT', 'STRING')
    RETURN_NAMES = ('positive', 'latent', 'prompt', 'width', 'height', 'frames', 'seconds', 'fps', 'aspect_ratio')
    FUNCTION = 'condition'
    CATEGORY = 'H3 Prompt Helper'

    def condition(self, guide, clip, vae, audio_vae):
        cfg, item = read_snapshot(guide['snapshot_path'])
        item.update(guide.get('canvas_override', {}))
        if guide.get('prompt_override', '').strip():
            item['prompt'] = guide['prompt_override']
        result = H3PromptHelper().condition_item(clip, vae, audio_vae, cfg, item)
        divisor = math.gcd(item['width'], item['height'])
        ratio = f"{item['width']//divisor}:{item['height']//divisor}"
        return (*result, item['width'], item['height'], item['length'], item['length']/24, 24.0, ratio)


class H3SceneGuideV2(H3SceneGuide):
    RETURN_TYPES = ('H3_SCENE_GUIDE', 'INT', 'INT', 'FLOAT')
    RETURN_NAMES = ('guide', 'width', 'height', 'Length')
    DESCRIPTION = 'Visual scene card. Length is the actual duration in seconds at 24 FPS.'

    def guide(self, snapshot_path, prompt_override):
        guide = super().guide(snapshot_path, prompt_override)[0]
        _, item = read_snapshot(snapshot_path)
        return guide, item['width'], item['height'], item['length']/24


class H3GuideConditioningV2(H3GuideConditioning):
    RETURN_TYPES = ('CONDITIONING', 'LATENT')
    RETURN_NAMES = ('positive', 'latent')

    def condition(self, guide, clip, vae, audio_vae):
        return super().condition(guide, clip, vae, audio_vae)[:2]


class H3SceneGuideV3(H3SceneGuide):
    RETURN_TYPES = ('H3_SCENE_GUIDE', 'INT', 'INT', 'INT', 'FLOAT')
    RETURN_NAMES = ('guide', 'width', 'height', 'Length', 'seconds')
    DESCRIPTION = 'Length is an integer frame count at 24 FPS. Optional canvas overrides apply to this queued scene.'

    @classmethod
    def INPUT_TYPES(cls):
        inputs = super().INPUT_TYPES()
        inputs['required'].update({'override_canvas': ('BOOLEAN', {'default': False}),
            'width': ('INT', {'default': 832, 'min': 32, 'max': 2048, 'step': 32}),
            'height': ('INT', {'default': 480, 'min': 32, 'max': 2048, 'step': 32}),
            'length': ('INT', {'default': 124, 'min': 5, 'max': 3592, 'step': 17})})
        return inputs

    def guide(self, snapshot_path, prompt_override, override_canvas=False, width=832, height=480, length=124):
        guide = super().guide(snapshot_path, prompt_override)[0]
        _, item = read_snapshot(snapshot_path)
        if override_canvas:
            if width % 32 or height % 32 or not 32 <= width <= 2048 or not 32 <= height <= 2048 or not 5 <= length <= 3592 or (length-5) % 17:
                raise ValueError('Use dimensions aligned to 32 pixels and an H3 frame count of 5 + 17n.')
            guide['canvas_override'] = {'width': width, 'height': height, 'length': length}
            item.update(guide['canvas_override'])
        return guide, item['width'], item['height'], item['length'], item['length']/24


class OnigiriGuideResolution:
    @classmethod
    def INPUT_TYPES(cls):
        return {'required': {'guide': ('H3_SCENE_GUIDE',),
                             'megapixels': ('FLOAT', {'default': 1.0, 'min': 0.01, 'max': 2.0, 'step': 0.01})}}
    RETURN_TYPES = ('H3_SCENE_GUIDE', 'INT', 'INT')
    RETURN_NAMES = ('guide', 'width', 'height')
    FUNCTION = 'resize'
    CATEGORY = 'H3 Prompt Helper'
    DESCRIPTION = 'Changes guide resolution only. Connect width/height to LBH Target dimensions (align 32); connect guide to Onigiri conditioning. Does not upscale the sampled latent.'

    def resize(self, guide, megapixels):
        if not isinstance(megapixels, (int, float)) or not math.isfinite(megapixels) or not 0.01 <= megapixels <= 2:
            raise ValueError('Choose a resolution from 0.01 to 2 MP.')
        _, item = read_snapshot(guide['snapshot_path'])
        canvas = {**item, **guide.get('canvas_override', {})}
        ratio = canvas['width'] / canvas['height']
        # Same decimal MP and half-up, 32-pixel alignment as the editor.
        width = max(32, math.floor(math.sqrt(megapixels * 1_000_000 * ratio) / 32 + 0.5) * 32)
        height = max(32, math.floor(math.sqrt(megapixels * 1_000_000 / ratio) / 32 + 0.5) * 32)
        if width > 2048 or height > 2048:
            raise ValueError('This aspect ratio exceeds the 2048-pixel side limit at the selected MP.')
        result = {**guide, 'canvas_override': {**guide.get('canvas_override', {}), 'width': width, 'height': height}}
        return result, width, height


class H3RefinePass:
    """Prepare an AV latent for a separate sampler; does not itself generate detail."""
    @classmethod
    def INPUT_TYPES(cls):
        return {'required': {'guide': ('H3_SCENE_GUIDE',), 'latent': ('LATENT',),
            'clip': ('CLIP',), 'vae': ('VAE',), 'audio_vae': ('VAE',),
            'scale': ('FLOAT', {'default': 1.5, 'min': 1.0, 'max': 4.0, 'step': 0.25})}}
    RETURN_TYPES = ('CONDITIONING', 'LATENT', 'INT', 'INT')
    RETURN_NAMES = ('positive', 'latent', 'width', 'height')
    FUNCTION = 'prepare'
    CATEGORY = 'H3 Prompt Helper/Experimental'
    DESCRIPTION = 'Spatially resize only the video latent, retain audio and timing, and rebuild reference conditioning. Connect to a second sampler with a deliberate denoise setting. Full-render quality is not validated.'

    def prepare(self, guide, latent, clip, vae, audio_vae, scale):
        from comfy.nested_tensor import NestedTensor
        from comfy_extras.nodes_minimax_h3 import temporal_shape
        samples = latent.get('samples')
        if not isinstance(samples, NestedTensor) or len(samples.tensors) != 2:
            raise ValueError('Refine Pass requires a MiniMax H3 audio/video latent.')
        if 'noise_mask' in latent:
            raise ValueError('Masked latents are not supported by this experimental refinement pass.')
        video, audio = samples.tensors
        if video.ndim != 5 or video.shape[1] != 24 or audio.ndim != 4 or audio.shape[1:3] != (32, 2):
            raise ValueError('Unexpected H3 latent channel layout.')
        cfg, item = read_snapshot(guide['snapshot_path'])
        item.update(guide.get('canvas_override', {}))
        _, video_t, audio_t = temporal_shape(item['length'])
        if video.shape[2] != video_t or audio.shape[-1] != audio_t:
            raise ValueError('The input latent duration does not match this scene guide.')
        if not math.isfinite(scale) or not 1 <= scale <= 4:
            raise ValueError('Choose a scale between 1 and 4.')
        width = max(32, round(video.shape[-1]*16*scale/32)*32)
        height = max(32, round(video.shape[-2]*16*scale/32)*32)
        if max(width, height) > 2048:
            raise ValueError('The target exceeds the helper 2048-pixel canvas limit.')
        batch, channels, frames, old_h, old_w = video.shape
        flat = video.permute(0,2,1,3,4).reshape(batch*frames,channels,old_h,old_w)
        scaled = torch.nn.functional.interpolate(flat, size=(height//16,width//16), mode='bilinear', align_corners=False)
        scaled = scaled.reshape(batch,frames,channels,height//16,width//16).permute(0,2,1,3,4).contiguous()
        item = {**item, 'width': width, 'height': height}
        if guide.get('prompt_override', '').strip():
            item['prompt'] = guide['prompt_override']
        positive = H3PromptHelper().condition_item(clip,vae,audio_vae,cfg,item)[0]
        return positive, {**latent, 'samples': NestedTensor((scaled,audio.clone()))}, width, height


class H3RefineCanvas(H3RefinePass):
    @classmethod
    def INPUT_TYPES(cls):
        fields = super().INPUT_TYPES()['required']
        del fields['scale']
        fields['size_mode'] = (['2x dimensions', '3x dimensions', '4x dimensions', 'Megapixel multiplier'],)
        fields['megapixel_multiplier'] = ('FLOAT', {'default': 2.0, 'min': 1.0, 'max': 16.0, 'step': 0.25})
        return {'required': fields}
    RETURN_TYPES = ('CONDITIONING', 'LATENT', 'INT', 'INT', 'FLOAT')
    RETURN_NAMES = ('positive', 'latent', 'width', 'height', 'megapixels')
    FUNCTION = 'prepare_canvas'
    DESCRIPTION = '2x dimensions gives about 4x pixel area; 3x gives 9x; 4x gives 16x. Megapixel multiplier scales pixel area instead. Rounded to 32 pixels, maximum 2048 per side. Audio and timing remain unchanged. Use a separate sampler to refine.'

    def prepare_canvas(self, guide, latent, clip, vae, audio_vae, size_mode, megapixel_multiplier):
        modes = {'2x dimensions': 2.0, '3x dimensions': 3.0, '4x dimensions': 4.0}
        if size_mode == 'Megapixel multiplier':
            if not math.isfinite(megapixel_multiplier) or not 1 <= megapixel_multiplier <= 16:
                raise ValueError('Choose a megapixel multiplier between 1 and 16.')
            scale = math.sqrt(megapixel_multiplier)
        elif size_mode in modes:
            scale = modes[size_mode]
        else:
            raise ValueError('Unknown refinement size mode.')
        result = super().prepare(guide, latent, clip, vae, audio_vae, scale)
        return (*result, result[2] * result[3] / 1e6)


# Stable IDs keep current frame-based workflows connected; only these two are exposed.
H3SceneGuideV3.CATEGORY = H3GuideConditioningV2.CATEGORY = OnigiriGuideResolution.CATEGORY = 'Onigiri'
NODE_CLASS_MAPPINGS = {'H3SceneGuideV3': H3SceneGuideV3, 'H3GuideConditioningV2': H3GuideConditioningV2, 'OnigiriGuideResolution': OnigiriGuideResolution}
NODE_DISPLAY_NAME_MAPPINGS = {'H3SceneGuideV3': 'Onigiri', 'H3GuideConditioningV2': 'Onigiri conditioning', 'OnigiriGuideResolution': 'Onigiri 2nd Pass'}
_launch_lock = threading.Lock()
_helper_process = None


def ensure_helper():
    global _helper_process
    cfg = configuration()
    url = 'http://127.0.0.1:47831'
    def ready():
        try:
            with urllib.request.urlopen(url + '/api/status', timeout=1) as response:
                return json.load(response).get('app') == 'h3-prompt-helper'
        except (OSError, ValueError):
            return False
    with _launch_lock:
        if not ready():
            root = Path(cfg['helperRoot'])
            log = open(root / 'data' / 'helper.log', 'ab')
            try:
                _helper_process = subprocess.Popen([cfg['node'], str(root/'server.mjs')], cwd=root,
                    stdin=subprocess.DEVNULL, stdout=log, stderr=log,
                    creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            finally:
                log.close()
            for _ in range(30):
                if ready():
                    break
                time.sleep(.1)
            else:
                raise RuntimeError('Helper did not start. Check data/helper.log in the helper folder.')
    return {'url': url}


@PromptServer.instance.routes.post('/h3-helper/launch')
async def launch_helper(request):
    import asyncio
    if request.remote not in ('127.0.0.1', '::1'):
        raise web.HTTPForbidden(text='Local ComfyUI only.')
    result = await asyncio.to_thread(ensure_helper)
    return web.json_response(result)


def snapshot_metadata(json_data):
    """Bind saver metadata to immutable snapshots at queue time, including cache hits."""
    captured = []
    graph = json_data.get('prompt', {})
    reachable = set()
    output_reach = {}
    def visit(node_id, found):
        if node_id in found or node_id not in graph:
            return
        found.add(node_id)
        for value in graph[node_id].get('inputs', {}).values():
            if isinstance(value, list) and len(value) == 2 and isinstance(value[0], str) and isinstance(value[1], int):
                visit(value[0], found)
    for node_id, node in graph.items():
        node_class = nodes.NODE_CLASS_MAPPINGS.get(node.get('class_type'))
        if node_class is not None and hasattr(node_class, 'OUTPUT_NODE') and node_class.OUTPUT_NODE is True:
            used = set()
            visit(node_id, used)
            output_reach[node_id] = used
            reachable.update(used)
    for node_id, node in graph.items():
        if node_id not in reachable:
            continue
        if node.get('class_type') not in ('H3PromptHelper', 'H3PromptHelperEmbedded', 'H3SceneGuide', 'H3SceneGuideV2', 'H3SceneGuideV3'):
            continue
        value = node.get('inputs', {}).get('snapshot_path')
        if not isinstance(value, str):
            continue
        try:
            cfg, snapshot = read_snapshot(value)
            override = node.get('inputs', {}).get('prompt_override', '')
            canvas_override = {}
            if node.get('class_type') == 'H3SceneGuideV3' and isinstance(node['inputs'].get('override_canvas'), list):
                raise RuntimeError('Set canvas overrides on the Scene Guide card; linked controls cannot be captured before execution.')
            if node.get('class_type') == 'H3SceneGuideV3' and node['inputs'].get('override_canvas') is True:
                canvas_override = {key: node['inputs'].get(key) for key in ('width', 'height', 'length')}
                if not all(type(v) is int for v in canvas_override.values()):
                    raise RuntimeError('Set canvas overrides on the Scene Guide card; linked controls cannot be captured before execution.')
            prompt_changed = isinstance(override, str) and override.strip() and override != snapshot['prompt']
            if prompt_changed or canvas_override:
                import uuid
                from datetime import datetime, timezone
                snapshot['parentSnapshotId'] = snapshot.get('snapshotId')
                snapshot['snapshotId'] = str(uuid.uuid4())
                snapshot['savedAt'] = datetime.now(timezone.utc).isoformat()
                if prompt_changed:
                    snapshot['prompt'] = override
                snapshot.update(canvas_override)
                target = Path(cfg.get('snapshotDataDir', str(Path(cfg['helperRoot'])/'data')))/'snapshots'/(snapshot['snapshotId']+'.json')
                with target.open('x', encoding='utf-8') as file:
                    json.dump(snapshot, file, ensure_ascii=False)
                node['inputs']['snapshot_path'] = str(target)
                node['inputs']['prompt_override'] = '' 
            captured.append({'node_id': node_id, 'snapshot_id': snapshot.get('snapshotId'),
                             'project_id': snapshot['id'], 'revision': snapshot['revision'],
                             'snapshot': snapshot})
        except (OSError, ValueError, KeyError):
            # Native node validation reports an invalid snapshot during execution.
            continue
    if captured:
        json_data.setdefault('extra_data', {}).setdefault('extra_pnginfo', {})['h3_prompt_helper'] = {
            'schema': 1, 'snapshots': captured,
            'resolution_adjustments': [{'node_id': key, 'megapixels': node.get('inputs', {}).get('megapixels'), 'outputs': [out for out, used in output_reach.items() if key in used]} for key, node in graph.items() if key in reachable and node.get('class_type') == 'OnigiriGuideResolution'],
            'refinement_passes': [{'node_id': key, 'scale_input': node.get('inputs', {}).get('scale'),
                                  **({'size_mode': node.get('inputs', {}).get('size_mode'), 'megapixel_multiplier': node.get('inputs', {}).get('megapixel_multiplier')} if node.get('class_type') == 'H3RefineCanvas' else {}),
                                  'outputs': [out for out, used in output_reach.items() if key in used]}
                                 for key, node in graph.items() if key in reachable and node.get('class_type') in ('H3RefinePass', 'H3RefineCanvas')],
            'output_snapshots': {output_id: [entry['snapshot_id'] for entry in captured if entry['node_id'] in used]
                                 for output_id, used in output_reach.items()}}
    return json_data


if hasattr(PromptServer.instance, 'add_on_prompt_handler'):
    PromptServer.instance.add_on_prompt_handler(snapshot_metadata)
