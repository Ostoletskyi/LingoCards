Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Say($t){ Write-Host $t -ForegroundColor Cyan }
function Warn($t){ Write-Host $t -ForegroundColor Yellow }
function Die($t){ Write-Host $t -ForegroundColor Red; exit 1 }

function Have-Cmd($name){
  return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

function Find-ProjectRoot {
  param([string]$StartDir)

  # 1) Prefer git top-level if available (script may be in subfolder)
  if (Have-Cmd git) {
    try {
      $top = (git -C $StartDir rev-parse --show-toplevel 2>$null).Trim()
      if ($top -and (Test-Path -LiteralPath $top)) { return $top }
    } catch {}
  }

  # 2) Fallback: walk up and search for project markers
  $dir = (Resolve-Path -LiteralPath $StartDir).Path
  while ($true) {
    $m1 = Join-Path $dir "index.html"
    $m2 = Join-Path $dir "js\main.js"
    $m3 = Join-Path $dir "js\contract.js"
    if ((Test-Path -LiteralPath $m1) -and (Test-Path -LiteralPath $m2) -and (Test-Path -LiteralPath $m3)) {
      return $dir
    }

    $parent = Split-Path -Parent $dir
    if ([string]::IsNullOrWhiteSpace($parent) -or $parent -eq $dir) { break }
    $dir = $parent
  }

  Die "Cannot locate project root. Put this script inside the project or run from the repo."
}

# --- Resolve project root (script may be in subfolder) ------------------------
$scriptDir = $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($scriptDir)) {
  $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
}

$ROOT = Find-ProjectRoot -StartDir $scriptDir
Set-Location -LiteralPath $ROOT
Say ("Root: " + $ROOT)

# --- Where to search for backups --------------------------------------------
$paths = @(
  (Join-Path $ROOT "_backups"), # main place
  $ROOT                        # optional: still support zips in root
)

$items = foreach ($p in $paths) {
  if (Test-Path -LiteralPath $p) {
    Get-ChildItem -LiteralPath $p -Filter "*.zip" -File -ErrorAction SilentlyContinue
  }
}

$items = $items | Sort-Object CreationTime -Descending | Select-Object -First 9
if (-not $items -or $items.Count -eq 0) {
  Warn "No backup archives found."
  exit 2
}

Write-Host ""
Write-Host "Available backup archives (latest first):"
for ($i = 0; $i -lt $items.Count; $i++) {
  $n = $i + 1
  $t = $items[$i].CreationTime.ToString("dd.MM.yyyy HH:mm")
  Write-Host ("{0}) {1} - {2}" -f $n, $t, $items[$i].Name)
}

$sel = Read-Host ("Select archive number (1-{0})" -f $items.Count)
if ($sel -notmatch "^\d+$") { Die "Invalid selection." }

$idx = [int]$sel
if ($idx -lt 1 -or $idx -gt $items.Count) { Die "Out of range." }

$archive = $items[$idx - 1].FullName

Write-Host ""
Write-Host "Selected archive:"
Write-Host $archive

if (-not (Test-Path -LiteralPath $archive)) {
  Die "Archive not found on disk (path broken?)."
}

# --- Restore destination: ROOT\_restore\backups ------------------------------
$restoreBase = Join-Path $ROOT "_restore\backups"
New-Item -ItemType Directory -Path $restoreBase -Force | Out-Null

$baseName = [IO.Path]::GetFileNameWithoutExtension($archive)
if ($baseName.Length -gt 80) { $baseName = $baseName.Substring($baseName.Length - 80) }

$dest = Join-Path $restoreBase ("test-" + $baseName)
$k = 1
while (Test-Path -LiteralPath $dest) {
  $k++
  $dest = Join-Path $restoreBase ("test-" + $baseName + "_" + $k)
}

Write-Host ""
Write-Host "Restoring to:"
Write-Host $dest

New-Item -ItemType Directory -Path $dest -Force | Out-Null

Write-Host ""
Write-Host "Restoring archive..."
Expand-Archive -LiteralPath $archive -DestinationPath $dest -Force

Write-Host ""
Write-Host "OK: Restore completed." -ForegroundColor Green
exit 0
