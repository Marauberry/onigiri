$ErrorActionPreference = 'Stop'
$helperRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not (Test-Path (Join-Path $helperRoot 'config.local.json'))) { & (Join-Path $PSScriptRoot 'setup.ps1') }
$url = 'http://127.0.0.1:47831'
$ready = $false
try { $ready = (Invoke-RestMethod "$url/api/status" -TimeoutSec 1).app -eq 'h3-prompt-helper' } catch {}
if (-not $ready) {
    New-Item -ItemType Directory -Force (Join-Path $helperRoot 'data') | Out-Null
    Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList @("`"$(Join-Path $helperRoot 'server.mjs')`"") -WorkingDirectory $helperRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $helperRoot 'data\server.log') -RedirectStandardError (Join-Path $helperRoot 'data\server-error.log')
    for ($i=0; $i -lt 30; $i++) {
        Start-Sleep -Milliseconds 200
        try { if ((Invoke-RestMethod "$url/api/status" -TimeoutSec 1).app -eq 'h3-prompt-helper') { $ready = $true; break } } catch {}
    }
}
if (-not $ready) { throw 'Helper failed to start. Check data/server-error.log.' }
Start-Process $url
