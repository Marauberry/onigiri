param([Parameter(Mandatory=$true)][string]$ComfyRoot)
$ErrorActionPreference = 'Stop'
$helperRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$comfyResolved = (Resolve-Path -LiteralPath $ComfyRoot).Path
if (-not (Test-Path (Join-Path $comfyResolved 'comfy_extras\nodes_minimax_h3.py'))) { throw 'Choose the ComfyUI folder containing native MiniMax H3 support.' }
if (-not (Test-Path (Join-Path $helperRoot 'config.local.json'))) { & (Join-Path $PSScriptRoot 'setup.ps1') }
$destination = Join-Path $comfyResolved 'custom_nodes\comfyui_h3_prompt_helper'
# Merge only shipped files. Preserve helper configuration, projects and unrelated local files.
$source=Join-Path $helperRoot 'comfyui_h3_prompt_helper'
if ([IO.Path]::GetFullPath($source) -eq [IO.Path]::GetFullPath($destination)) { throw 'Clone Onigiri outside its installed custom-node folder.' }
New-Item -ItemType Directory -Force -Path $destination | Out-Null
Get-ChildItem -LiteralPath $source -Recurse -File | Where-Object { $_.Name -ne 'helper_config.json' -and $_.Extension -ne '.pyc' -and $_.FullName -notmatch '[\\/]__pycache__[\\/]' } | ForEach-Object {
 $relative=$_.FullName.Substring($source.Length).TrimStart('\','/')
 $target=Join-Path $destination $relative
 New-Item -ItemType Directory -Force -Path (Split-Path $target) | Out-Null
 Copy-Item -LiteralPath $_.FullName -Destination $target -Force
}
$localConfig = Get-Content (Join-Path $helperRoot 'config.local.json') -Raw | ConvertFrom-Json
$bridge=@{}
$bridgePath=Join-Path $destination 'helper_config.json'
if(Test-Path -LiteralPath $bridgePath){
 $saved=Get-Content -LiteralPath $bridgePath -Raw | ConvertFrom-Json
 foreach($property in $saved.PSObject.Properties){$bridge[$property.Name]=$property.Value}
}
$bridge.helperRoot=$helperRoot;$bridge.node=(Get-Command node.exe).Source;$bridge.ffmpeg=$localConfig.ffmpeg
$bridge | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath ($bridgePath+'.tmp') -Encoding utf8
Move-Item -LiteralPath ($bridgePath+'.tmp') -Destination $bridgePath -Force
Write-Output "Installed/updated Onigiri in $destination. Restart ComfyUI to load the node."
