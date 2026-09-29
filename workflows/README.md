# Example ComfyUI workflows

A minimal starter and two advanced MiniMax H3 graphs built around the Onigiri nodes. All are plain ComfyUI workflow files: drag one onto the ComfyUI canvas, or use **Workflow → Open**.

| File | What it is |
| --- | --- |
| `Onigiri Starter.json` | Start here: native ComfyUI + Onigiri only, with no LoRAs or other node packs. |
| `Onigiri Minimax H3.json` | Single pass. Onigiri scene guide → native H3 sampling → video + audio decode → MP4. |
| `OMMH3 2nd Pass.json` | Two pass. The same first pass, then a latent upscale and a short second pass at the final size. |

## Before you load one

- ComfyUI with native MiniMax H3 support (`comfy_extras/nodes_minimax_h3.py`).
- The Onigiri custom node, installed with `scripts/install-comfy.ps1` or copied into `custom_nodes`.
- **Advanced graphs only:** the third-party nodes these examples use: **ModelPreviewOverrideKJ** from [ComfyUI-KJNodes](https://github.com/kijai/ComfyUI-KJNodes), **Label (rgthree)** from [rgthree-comfy](https://github.com/rgthree/rgthree-comfy), and **Lora Loader (LoraManager)** from [ComfyUI-Lora-Manager](https://github.com/willmiao/ComfyUI-Lora-Manager). The graphs also contain a **ModelAttentionBackend** node; bypass or delete it if no installed pack provides it.
- The model files listed below. The names come from the authoring machine, so point each loader at whatever you have and check the CLIP is loaded as type `minimax`.

## The Onigiri node starts empty on purpose

All examples ship with **snapshot_path blank**. Native H3 conditioning reads the references from the snapshot Onigiri writes, so a fresh copy of either graph will not queue until you either:

1. open the editor from the **Onigiri** node (**Open Onigiri ↗**), compose the scene, then **Send to ComfyUI** — that writes `data/snapshots/<id>.json` and fills the node in, or
2. paste the path of an existing snapshot into `snapshot_path`.

In the advanced examples, `prompt_override` is filled with a sample prompt so the node shows real content; sending from the editor replaces it. `width`, `height` and `length` follow the canvas you sent. Everything around the guide — loaders, samplers, decode — is a normal H3 graph.

## `Onigiri Starter.json`

Uses the four H3 loaders listed below (UNET, CLIP, video VAE and audio VAE), Onigiri, Onigiri conditioning, native sampling, decoding and SaveVideo. Select your installed files in the loaders; model subfolders may differ. No preview pack, attention override, LoRA or labels are required. Prompt and snapshot are blank until you send a scene. The 30-step Euler/simple settings are a starting point, not a tuned preset. A full render has not been performed for this starter.

## `Onigiri Minimax H3.json`

```
UNETLoader → ModelAttentionBackend → Turbo LoRA / LoraManager → BasicGuider
CLIPLoader ┐
video VAE  ├→ Onigiri conditioning → BasicGuider + BasicScheduler(8 steps, simple)
audio VAE  ┘                          + KSamplerSelect(euler) + RandomNoise → SamplerCustomAdvanced
Onigiri (guide) ──────────────────────┘
```

Decoding then runs `VAEDecode` and `VAEDecodeAudio` into `CreateVideo` at 24 fps, and `SaveVideo` writes MP4/H.264 under `Marau/Onigiri Minimax H3/`. A `ModelPreviewOverrideKJ` node draws cheap previews through the `taeh3` tiny VAE at 512 px. The example sampler is 8 steps with the hyperflow turbo LoRA at strength 1; if you are not using a turbo LoRA, raise the steps and drop that LoRA.

## `OMMH3 2nd Pass.json`

The first pass is the graph above. Then:

```
SamplerCustomAdvanced(1st pass) → LTXVSeparateAVLatent → MinimaxH3LatentUpscaler3D → LTXVConcatAVLatent
Onigiri 2nd Pass ── width/height ──┘      (target dimensions, align 32, fp16)
                                          → Onigiri conditioning → 3-step second pass → VAEDecode → CreateVideo → SaveVideo
```

The **Onigiri 2nd Pass** node (`OnigiriGuideResolution`) takes the guide, changes only the resolution in MP, and outputs the same guide plus width and height. Set it to the size you actually want; the example uses 0.8 MP, the upscaler is on **target dimensions** with 32-pixel alignment, and the second pass runs 3 steps with a 3-step LoRA. Decoding, `CreateVideo` and `SaveVideo` (`Marau/OMMH3 2nd Pass/`) happen once, after the second pass.

## Model files the loaders expect

| Loader | File |
| --- | --- |
| UNETLoader | `Minimax\dasiwa_minimax_h3_ref2va_v2_pruned_hybrid_int8_row-wise_convrot_runtime_mixed.safetensors` — a community int8 quant; the official Comfy-Org `minimax_h3_ref2va_pruned_int8_convrot.safetensors` works as well |
| CLIPLoader (type `minimax`) | `Minimax\qwen3vl_32b_minimax_h3_int8_convrot.safetensors` |
| VAELoader (video) | `Minimax\minimax_h3_video_vae_int8_convrot.safetensors` |
| VAELoader (audio) | `Minimax\minimax_h3_audio_vae_fp32.safetensors` |
| Tiny VAE for previews | `Minimax\taeh3.safetensors` |
| Latent upscaler (2nd pass only) | `Minimax\minimax_h3_latent_upscaler_3d_fp16.safetensors` |
| LoRA, 1st pass | `Turbo\minimax_h3_hyperflow_EMA600_pruned_r128_fro0995_turbo_lora.safetensors` |
| LoRA, 2nd pass | `Turbo\taomate_h3_3step_comfy.safetensors` |

The LoraManager loader in both graphs also references a personal style LoRA (`MysticXXX_MMH3-V4-ref2va`) at 0.90. Clear that field or swap in your own.

## Status

These are the working graphs from the machine this repository was built on, kept in step with the current Onigiri nodes. The native H3 contracts are covered by `tests/comfy_contract.py`; the example graphs themselves have not been re-rendered end to end here, so treat steps, LoRA strengths and sizes as a starting point rather than a tuned preset.
