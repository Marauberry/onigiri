param(
 [Parameter(Mandatory=$true)][string]$ModelDirectory,
 [ValidateSet('official','abliterated')][string]$Variant='official',
 [switch]$ManifestOnly
)
$ErrorActionPreference='Stop'
$official='prism-ml/Ternary-Bonsai-2-27B-gguf'
$revision='b072e1d3b35a0a630cece372c2127528e0994386'
$model=@{repo=$official;revision=$revision;name='Ternary-Bonsai-2-27B-PQ2_0.gguf';sha='3907dc1658db1f78a9826bf8d5bcb8dc65db0d466388937af57f2294fae62ec1';bytes=7206168928}
if($Variant -eq 'abliterated'){$model=@{repo='Hikari07jp/Ternary-Bonsai-2-27B-Abliterated-GGUF';revision='e7f6daf95ab820ef8de7d8f5e883d95d546ab02c';name='Ternary-Bonsai-2-27B-Abliterated-PQ2_0.gguf';sha='41a362f422b70a8c2dc74a3cc14447ad0ea702c440f0dbe41dc1796da7b7e342';bytes=7206168928}}
$files=@($model,@{repo=$official;revision=$revision;name='Ternary-Bonsai-2-27B-mmproj-Q8_0.gguf';sha='6807ede61d570bb86ba34b756a0fa109edc33668604de867c6ea6d8f1d631903';bytes=629246976})
if($ManifestOnly){$files|ConvertTo-Json;exit 0}
$ModelDirectory=[IO.Path]::GetFullPath($ModelDirectory)
New-Item -ItemType Directory -Force -Path $ModelDirectory | Out-Null
foreach($file in $files){
 $target=Join-Path $ModelDirectory $file.name
 if(Test-Path -LiteralPath $target){if((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLower() -eq $file.sha){Write-Output ('Verified '+$file.name);continue};throw ('An existing file has a different checksum: '+$file.name+'. Move it aside before retrying; it was not overwritten.')}
 $partial=$target+'.partial'
 Write-Output ('Downloading '+$file.name)
 & curl.exe --fail --location --retry 3 --continue-at - --output $partial ('https://huggingface.co/'+$file.repo+'/resolve/'+$file.revision+'/'+$file.name)
 if($LASTEXITCODE -ne 0){throw 'Download interrupted. Retry to resume the partial file.'}
 if((Get-Item -LiteralPath $partial).Length -ne $file.bytes -or (Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash.ToLower() -ne $file.sha){throw 'Checksum mismatch. The partial file was not activated; remove that partial download before retrying.'}
 Move-Item -LiteralPath $partial -Destination $target
 Write-Output ('Verified '+$file.name)
}
Write-Output 'Model and official projector are ready.'
