param([Parameter(Mandatory=$true)][string]$Root)
. "$PSScriptRoot\_lib\common.ps1"

$runBat = Join-Path $Root "Run-Server.bat"
$runPs  = Join-Path $Root "start_ps_server.ps1"

if (Test-Path -LiteralPath $runBat) {
  Write-Info "Starting server via Run-Server.bat"
  Start-Process -FilePath $runBat -WorkingDirectory $Root | Out-Null
  # Auto-open browser (default) to the local address.
  try {
    Start-Sleep -Milliseconds 250
    Start-Process "http://127.0.0.1:8080/" | Out-Null
  } catch {}
  Write-Ok "Server start requested."
  exit 0
}

if (Test-Path -LiteralPath $runPs) {
  Write-Info "Starting server via start_ps_server.ps1"
  Start-Process -FilePath "powershell" -ArgumentList @("-NoProfile","-ExecutionPolicy","Bypass","-File",$runPs) -WorkingDirectory $Root | Out-Null
  try {
    Start-Sleep -Milliseconds 250
    Start-Process "http://127.0.0.1:8080/" | Out-Null
  } catch {}
  Write-Ok "Server start requested."
  exit 0
}

$port = 5173
$py = Get-Command python -ErrorAction SilentlyContinue
if (-not $py) { $py = Get-Command py -ErrorAction SilentlyContinue }

if (-not $py) {
  Write-Err "No server script found and Python is not available."
  Write-Warn "Add Run-Server.bat or start_ps_server.ps1 to project root, or install Python."
  exit 5
}

Write-Info "Starting fallback Python http.server on port $port"
Start-Process -FilePath $py.Source -ArgumentList @("-m","http.server",$port) -WorkingDirectory $Root | Out-Null
try {
  Start-Sleep -Milliseconds 250
  Start-Process "http://127.0.0.1:$port/" | Out-Null
} catch {}
Write-Ok "Server start requested. Open: http://127.0.0.1:$port/"
exit 0