param([Parameter(Mandatory=$true)][string]$ComfyRoot)
$ErrorActionPreference = 'Stop'
$helperRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$comfyResolved = (Resolve-Path -LiteralPath $ComfyRoot).Path
if (-not (Test-Path (Join-Path $comfyResolved 'comfy_extras\nodes_minimax_h3.py'))) { throw 'Choose the ComfyUI folder containing native MiniMax H3 support.' }
if (-not (Test-Path (Join-Path $helperRoot 'config.local.json'))) { & (Join-Path $PSScriptRoot 'setup.ps1') }
$destination = Join-Path $comfyResolved 'custom_nodes\comfyui_h3_prompt_helper'
if (Test-Path -LiteralPath $destination) { throw 'The helper node already exists. Update it explicitly after reviewing changes.' }
Copy-Item -LiteralPath (Join-Path $helperRoot 'comfyui_h3_prompt_helper') -Destination $destination -Recurse
$localConfig = Get-Content (Join-Path $helperRoot 'config.local.json') -Raw | ConvertFrom-Json
@{helperRoot=$helperRoot;node=(Get-Command node.exe).Source;ffmpeg=$localConfig.ffmpeg} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $destination 'helper_config.json') -Encoding utf8
Write-Output "Installed H3 Prompt Helper in $destination. Restart ComfyUI to load the node."
