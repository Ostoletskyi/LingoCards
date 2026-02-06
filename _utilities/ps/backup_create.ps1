param([Parameter(Mandatory=$true)][string]$Root)
. "$PSScriptRoot\_lib\common.ps1"

$exclude = Get-ExcludedRegex

$utilRoot = Join-Path $Root "_utilities"
$backups = Join-Path $utilRoot "_backups"
Ensure-Dir $backups

$ts = Get-Date -Format "yyyyMMdd_HHmmss"
$zipPath = Join-Path $backups ("lingocard_release_$ts.zip")

$files = Get-ChildItem -LiteralPath $Root -Recurse -Force -File |
  Where-Object { $_.FullName -notmatch $exclude }

$tmp = Join-Path (Join-Path $utilRoot "_runtime") ("stage_$ts")
Ensure-Dir $tmp

try {
  foreach ($f in $files) {
    $rel = Get-RelativePath -BasePath $Root -TargetPath $f.FullName
    $dest = Join-Path $tmp $rel.TrimStart(".\")
    Ensure-Dir (Split-Path -Parent $dest)
    Copy-Item -LiteralPath $f.FullName -Destination $dest -Force
  }

  Compress-Archive -Path (Join-Path $tmp "*") -DestinationPath $zipPath -Force
  Write-Ok "Backup created: $zipPath"
} finally {
  if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Recurse -Force }
}

exit 0