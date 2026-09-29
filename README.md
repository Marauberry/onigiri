# Onigiri

A local scene editor and Director chat for MiniMax H3 and ComfyUI. Plain Node.js, no accounts or hosted service. Your scenes, references, conversation history and snapshots stay on your computer.

## Quick Windows setup

```powershell
git clone https://github.com/Marauberry/onigiri.git
cd onigiri
powershell -ExecutionPolicy Bypass -File scripts/bootstrap.ps1 -ComfyRoot "D:\ComfyUI"
```

Bootstrap installs missing Node.js and FFmpeg through Windows Package Manager, sets up the pinned llama.cpp runtime, and copies the custom nodes into ComfyUI. Installer prompts may appear. Omit `-ComfyRoot` for the standalone app. Restart ComfyUI after installation. No npm dependencies are needed.

## Existing dependencies / manual setup

Install Node.js 22+ and FFmpeg (including ffprobe). Double-click **Start Prompt Helper.cmd**. On first launch, setup downloads the pinned Prism llama.cpp Windows CUDA 12.4 runtime and its CUDA libraries, verifies SHA-256 checksums, then starts the app at http://127.0.0.1:47831.

The first-run guide walks through model setup, scene creation and sending to ComfyUI. Reopen it from **Settings → Setup guide**.

You supply your Bonsai Q2/PQ2 GGUF and matching mmproj. Open **Settings**, paste the model folder or full GGUF path, then save. Quoted paths are accepted. A single mmproj beside the model is selected automatically; confirm it is the correct projector. Keep just the matching projector in that folder; ambiguous matches remain text-only. Weights are never included in Git. You may instead use **Settings → Optional model download**: choose a folder and Official or Hikari07jp Abliterated Bonsai PQ2. Both use the official Prism Q8 projector. Downloads are pinned to known revisions, SHA-256 verified, resumable, and do not replace a conflicting existing file. Expect about 7.84 GB.

Model sources: [Prism Bonsai 2](https://huggingface.co/prism-ml/Ternary-Bonsai-2-27B-gguf) and [Hikari07jp Bonsai 2 Abliterated](https://huggingface.co/Hikari07jp/Ternary-Bonsai-2-27B-Abliterated-GGUF). Optional command-line download:

```powershell
.\scripts\download-model.ps1 -ModelDirectory "D:\Models\Bonsai" -Variant official
```

Use `-Variant abliterated` for the alternative weights, or pass `-DownloadModel official -ModelDirectory "D:\Models\Bonsai"` to bootstrap. An existing folder can be scanned without downloading anything.

For explicit setup, including CPU or Vulkan systems:

```powershell
.\scripts\setup.ps1 -ModelDirectory 'D:\Models\Bonsai' -FfmpegExecutable 'D:\FFmpeg\bin\ffmpeg.exe' -Backend cuda-12.4
```

Use `-Backend cpu` or `-Backend vulkan` for a fresh installation without NVIDIA CUDA. Existing working runtime settings are preserved. `-LlamaDirectory` imports a locally supplied compatible Prism build. Downloads come from the [official Prism release](https://github.com/PrismML-Eng/llama.cpp/releases/tag/prism-b10743-adfffbe), not generic llama.cpp builds that may lack PQ2 support. Download failures do not activate a partial installation.

## ComfyUI

```powershell
.\scripts\install-comfy.ps1 -ComfyRoot 'D:\ComfyUI'
```

Use a ComfyUI version with native MiniMax H3 support. Restart ComfyUI, then add **Onigiri** and **Onigiri conditioning**. The optional third node, **Onigiri 2nd Pass**, accepts a guide and changes only its resolution in MP; it outputs the new guide plus width and height. Keep your existing H3 loaders, sampling and decoding workflow. Open editor → Send to ComfyUI → queue. Sending creates an immutable snapshot; later Director edits affect the working scene, and you send again to use them in the next generation. Two example graphs ship in [`workflows/`](workflows/README.md). ComfyUI core is never modified.

## Creating a scene

- Automatic: upload references, discuss the intent with Director, then **Arrange everything** to update the Prompt tab. A picture can supply appearance while a video supplies motion for the same subject. Ambiguous assignments should be clarified before arrangement.
- Manual: use Draft for notes and reference connections. In Prompt, **Insert structure** creates empty headings; drag subjects and references from the asset sidebar and write the content.
- Director keeps the full chat locally. Older turns are compacted when needed; recent turns remain verbatim. Later client corrections override older choices. Compact memory is invalidated when its source turns change. Suggestions are not approved decisions.
- Each local model request runs sequentially. Reference observations are reused until the source, trim or model changes, or you choose Reinspect. The runtime unloads after each request. No parallel inference or persistent GPU allocation is introduced.

Video inspection samples frames and does not hear audio. Prompt checks validate structure and reference integrity, not rendered quality. Review generated text before sending. There is no AnimaDex integration; upload reference files directly.

## Development and publishing

Run `npm test`. Worker changes also require a real model smoke test. Native node contract tests use ComfyUI's `.venv` Python. UI changes require browser inspection.

`config.local.json`, `runtime/`, `data/`, and `test-results/` are gitignored. Do not publish model weights, local paths/configuration, imported media or private scenes. The repository contains app code and setup instructions, not a preconfigured personal installation.

The helper binds to loopback only. Keep its project storage available while saved ComfyUI workflows refer to local snapshots. Export portable scene packages when sharing media and scenes intentionally.

History shows the active branch and revision. Restoring a revision or snapshot creates a named branch and retains the previous state. Later edits remain on the new branch, and existing sent snapshots stay immutable. The history dialog stays open after restoration so you can see where you are.

### Resolution and LBH upscaling

The canvas menu includes **Official H3, 768p short edge**, MP presets through 2 MP, standard heights through 1080p, and Custom resolution. Enter width and height as multiples of 32, up to 2048 per side, then Apply. MP is estimated from actual dimensions for custom sizes.

For LBH, connect the width and height from Onigiri 2nd Pass to the upscaler’s **Target dimensions** inputs and use 32-pixel alignment. Connect the resulting guide to Onigiri conditioning. LBH’s own megapixel mode uses a different area base; explicit dimensions keep both paths aligned. This node does not upscale an existing latent: feed that latent through LBH separately. Timing, reference identity and the sent snapshot are preserved. Native contracts were tested; a full LBH/H3 render was not queued.

### Workspace

Settings contains model setup, optional downloads, performance, setup guide, appearance and project storage. Drag image/video/audio files or a local ComfyUI preview onto either chat composer. An identical current reference is reused by file content; an edited crop/grid remains a different reference. Mention chips explain which sources are linked.

Project Gallery keeps its title and filters fixed while the cards scroll. Folder covers are automatic or selected by right-clicking a project inside the folder. Sidebar ordering uses creation date and folder collapse state persists. Trash opens as a grid; Empty Trash asks for confirmation.

Prompt section headings are recommendations: a nonempty manual prompt can be sent without them. Missing reference links and invalid native media/dimension contracts still need fixing. History highlights additions in green and removals in red; each automatic arrangement is tied to its client message.
