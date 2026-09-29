param(
  [string]$LlamaDirectory,
  [string]$ModelDirectory,
  [string]$FfmpegExecutable,
  [ValidateSet('cuda-12.4','cpu','vulkan')][string]$Backend='cuda-12.4',
  [string]$Destination
)
$ErrorActionPreference='Stop'
$helperRoot=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $Destination) { $Destination=$helperRoot }
$Destination=[IO.Path]::GetFullPath($Destination)
New-Item -ItemType Directory -Force -Path $Destination | Out-Null
$configPath=Join-Path $Destination 'config.local.json'
$config=@{modelDirs=@();profiles=@{};ffmpeg='ffmpeg'}
if (Test-Path -LiteralPath $configPath) {
  $saved=Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
  foreach($property in $saved.PSObject.Properties){$config[$property.Name]=$property.Value}
}
$config.Remove('characterLibrary')
if($ModelDirectory){
  $modelItem=Get-Item -LiteralPath $ModelDirectory.Trim('"')
  if(-not $modelItem.PSIsContainer){
    if($modelItem.Extension -ne '.gguf'){throw 'Choose a GGUF file or its folder.'}
    $ModelDirectory=$modelItem.DirectoryName
  }else{$ModelDirectory=$modelItem.FullName}
  $config.modelDirs=@($ModelDirectory)
}
if($FfmpegExecutable){$config.ffmpeg=(Get-Item -LiteralPath $FfmpegExecutable.Trim('"')).FullName}
if(-not (Get-Command node.exe -ErrorAction SilentlyContinue)){throw 'Install Node.js 22 or newer, then run setup again.'}
if ([int]((& node.exe --version).TrimStart('v').Split('.')[0]) -lt 22) { throw 'Node.js 22 or newer is required. Upgrade Node.js and reopen PowerShell.' }
& $config.ffmpeg -version | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'FFmpeg failed to launch.' }
$probe=if($config.ffmpeg -eq 'ffmpeg'){'ffprobe'}else{Join-Path (Split-Path $config.ffmpeg) 'ffprobe.exe'}
& $probe -version | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'FFprobe failed to launch. Install the complete FFmpeg package.' }
$runtime=$config.runtimeDir
$backendChanged=$PSBoundParameters.ContainsKey('Backend') -and ($config.runtimeBackend -ne $Backend)
if($backendChanged -or $LlamaDirectory -or -not $runtime -or -not (Test-Path (Join-Path $runtime 'llama-cli.exe'))){
  # Versioned folders preserve existing builds. Downloads are pinned and verified before extraction.
  $tag='prism-b10743-adfffbe'
  $runtime=Join-Path $Destination ('runtime\'+$tag+'-'+$Backend)
  if($LlamaDirectory){
    $source=(Resolve-Path -LiteralPath $LlamaDirectory).Path
    if(-not(Test-Path (Join-Path $source 'llama-cli.exe'))){throw 'llama-cli.exe is missing from the supplied runtime.'}
    $runtime=Join-Path $Destination ('runtime\local-'+[guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $runtime -Force | Out-Null
    Get-ChildItem -LiteralPath $source -File | Where-Object {$_.Extension -in '.dll','.exe'} | Copy-Item -Destination $runtime
  }else{
    $hashes=@{
      'cuda-12.4'='1b849f713bee42fda258de83770cd422e8f48dd631ce370eb0641f6458c69d87'
      'cpu'='d0b3016c9cc4bc1385de68be034adee570277ba952dd94292ba3888b7f18cc44'
      'vulkan'='d66e0c4d11ea937c8cb197d6c59ffc8c41599bd30ea58057e7e6a4d5a3ced466'
    }
    $assets=@(@{name="llama-$tag-bin-win-$Backend-x64.zip";hash=$hashes[$Backend]})
    if($Backend -eq 'cuda-12.4'){$assets+=@{name='cudart-llama-bin-win-cuda-12.4-x64.zip';hash='8c79a9b226de4b3cacfd1f83d24f962d0773be79f1e7b75c6af4ded7e32ae1d6'}}
    $stage=Join-Path $Destination ('runtime\download-'+$tag+'-'+$Backend)
    New-Item -ItemType Directory -Path $stage -Force | Out-Null
    foreach($asset in $assets){
      $archive=Join-Path $stage $asset.name
      Write-Host "Downloading $($asset.name)..."
      $downloadUrl="https://github.com/PrismML-Eng/llama.cpp/releases/download/$tag/$($asset.name)"
      if((Test-Path -LiteralPath $archive) -and (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLower() -eq $asset.hash){Write-Host 'Using verified cached download.'}
      elseif(Get-Command curl.exe -ErrorAction SilentlyContinue){
        & curl.exe --fail --location --silent --show-error --connect-timeout 20 --max-time 1800 --continue-at - --output $archive $downloadUrl
        if($LASTEXITCODE -ne 0){throw 'Runtime download failed. Retry setup; existing configuration is unchanged.'}
      }else{Invoke-WebRequest -UseBasicParsing -Uri $downloadUrl -OutFile $archive -TimeoutSec 1800}
      if((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLower() -ne $asset.hash){throw 'Runtime checksum mismatch. Nothing was activated.'}
      Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $stage 'unpacked') -Force
    }
    New-Item -ItemType Directory -Path $runtime -Force | Out-Null
    Get-ChildItem (Join-Path $stage 'unpacked') -Recurse -File | Where-Object {$_.Extension -in '.exe','.dll'} | Copy-Item -Destination $runtime
  }
  $config.runtimeDir=$runtime
  if(-not $LlamaDirectory){$config.runtimeLibraryDirs=@();$config.runtimeBackend=$Backend}else{$config.Remove('runtimeBackend')}
}
$env:PATH=(@($config.runtimeLibraryDirs)+@($env:PATH) -join ';')
& (Join-Path $runtime 'llama-cli.exe') --version
if($LASTEXITCODE -ne 0){throw 'Runtime failed to launch; existing configuration was preserved.'}
$tempConfig=$configPath+'.tmp'
$config | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $tempConfig -Encoding utf8
Move-Item -LiteralPath $tempConfig -Destination $configPath -Force
Write-Host 'Onigiri is ready. Select your Bonsai GGUF folder and matching mmproj in Settings. Models are not downloaded.'
