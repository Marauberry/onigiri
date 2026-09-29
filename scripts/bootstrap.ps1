param([string]$ComfyRoot,[string]$ModelDirectory,[ValidateSet('none','official','abliterated')][string]$DownloadModel='none')
$ErrorActionPreference='Stop'
foreach($dependency in @(@{command='node';id='OpenJS.NodeJS.LTS'},@{command='ffmpeg';id='Gyan.FFmpeg'})){
 if(-not(Get-Command $dependency.command -ErrorAction SilentlyContinue)){
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
$argsForSetup=@{};if($ModelDirectory){$argsForSetup.ModelDirectory=$ModelDirectory}
& (Join-Path $PSScriptRoot 'setup.ps1') @argsForSetup
if($ComfyRoot){& (Join-Path $PSScriptRoot 'install-comfy.ps1') -ComfyRoot $ComfyRoot}
Write-Host 'Ready. Run Start Prompt Helper.cmd, or open Onigiri from ComfyUI.'
