param([Parameter(Mandatory=$true)][string]$Root)
. "$PSScriptRoot\_lib\common.ps1"

$utilRoot = Join-Path $Root "_utilities"
$backups = Join-Path $utilRoot "_backups"
$restoreBase = Join-Path $utilRoot "_restore"
Ensure-Dir $restoreBase

if (-not (Test-Path -LiteralPath $backups)) {
  Write-Err "Backups folder not found: $backups"
  exit 2
}

$zips = @(Get-ChildItem -LiteralPath $backups -Filter "*.zip" -File | Sort-Object LastWriteTime -Descending)
if ($zips.Count -eq 0) {
  Write-Warn "No backups found in: $backups"
  exit 1
}

Write-Host "Available backups (latest first):" -ForegroundColor Cyan
$max = [Math]::Min(9, $zips.Count)
for ($i=0; $i -lt $max; $i++) {
  $n = $i + 1
  $z = $zips[$i]
  Write-Host (" {0}) {1}  [{2}]" -f $n, $z.Name, $z.LastWriteTime)
}

$choice = Read-Host "Select 1-$max"
if ($choice -notmatch "^\d+$") { Write-Err "Invalid choice."; exit 2 }
$idx = [int]$choice - 1
if ($idx -lt 0 -or $idx -ge $max) { Write-Err "Out of range."; exit 2 }

$zip = $zips[$idx]
$hash = (Get-FileHash -LiteralPath $zip.FullName -Algorithm SHA256).Hash.Substring(0,10)
$target = Join-Path $restoreBase ("restore_{0}_{1}" -f (Get-Date -Format "yyyyMMdd_HHmmss"), $hash)
Ensure-Dir $target

Expand-Archive -LiteralPath $zip.FullName -DestinationPath $target -Force
Write-Ok "Restored to: $target"
Write-Info "ZIP: $($zip.FullName)"
exit 0