param([Parameter(Mandatory=$true)][string]$Root)
. "$PSScriptRoot\_lib\common.ps1"

$required = @(
  "index.html",
  "js\contract.js",
  "js\app\app.js",
  "js\app\state.js",
  "js\main.js",
  "styles\base.css"
)

$missing = @()
foreach ($p in $required) {
  if (-not (Test-Path -LiteralPath (Join-Path $Root $p))) { $missing += $p }
}

if ($missing.Count -gt 0) {
  Write-Err "Missing critical files:"
  $missing | ForEach-Object { "  $_" } | Write-Host
  exit 4
}

$contractPath = Join-Path $Root "js\contract.js"
$txt = Get-Content -LiteralPath $contractPath -Raw -Encoding UTF8

if ($txt -notmatch "contract") {
  Write-Warn "contract.js: keyword 'contract' not found (best-effort check)."
} else {
  Write-Ok "contract.js basic presence: OK"
}

Write-Ok "Integrity check: OK"
exit 0