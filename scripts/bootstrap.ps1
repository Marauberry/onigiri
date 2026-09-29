param([string]$ComfyRoot,[string]$ModelDirectory,[ValidateSet('none','official','abliterated')][string]$DownloadModel='none',[ValidateSet('cuda-12.4','cpu','vulkan')][string]$Backend)
$ErrorActionPreference='Stop'
foreach($dependency in @(@{command='node';id='OpenJS.NodeJS.LTS'},@{command='ffmpeg';id='Gyan.FFmpeg'})){
 $missing=-not(Get-Command $dependency.command -ErrorAction SilentlyContinue)
 if($dependency.command -eq 'node' -and -not $missing){$missing=[int]((& node --version).TrimStart('v').Split('.')[0]) -lt 22}
 if($dependency.command -eq 'ffmpeg' -and -not(Get-Command ffprobe -ErrorAction SilentlyContinue)){$missing=$true}
 if($missing){
  if(-not(Get-Command winget -ErrorAction SilentlyContinue)){throw ('Install '+$dependency.command+' and retry; winget is unavailable.')}
  & winget install --exact --id $dependency.id --source winget
  if($LASTEXITCODE -ne 0){throw ('Could not install '+$dependency.command)}
  $env:PATH=[Environment]::GetEnvironmentVariable('Path','Machine')+';'+[Environment]::GetEnvironmentVariable('Path','User')
 }
}
if($DownloadModel -ne 'none'){
 if(-not $ModelDirectory){$ModelDirectory=Join-Path (Split-Path $PSScriptRoot) 'models'}
 & (Join-Path $PSScriptRoot 'download-model.ps1') -ModelDirectory $ModelDirectory -Variant $DownloadModel
}
$argsForSetup=@{}
if(-not $Backend -and -not(Test-Path (Join-Path (Split-Path $PSScriptRoot) 'config.local.json'))){
 Write-Host 'Director runtime: 1 = NVIDIA CUDA, 2 = Vulkan (AMD/Intel), 3 = CPU (slower)'
 $choice=Read-Host 'Choose 1, 2 or 3'
 $Backend=switch($choice){'1'{'cuda-12.4'} '2'{'vulkan'} '3'{'cpu'} default{throw 'Choose 1, 2 or 3, or pass -Backend cuda-12.4, vulkan or cpu.'}}
}
if($Backend){$argsForSetup.Backend=$Backend}
if($ModelDirectory){$argsForSetup.ModelDirectory=$ModelDirectory}
& (Join-Path $PSScriptRoot 'setup.ps1') @argsForSetup
if($ComfyRoot){& (Join-Path $PSScriptRoot 'install-comfy.ps1') -ComfyRoot $ComfyRoot}
Write-Host 'Ready. Run Start Onigiri.cmd, or open Onigiri from ComfyUI.'
