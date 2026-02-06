param([Parameter(Mandatory=$true)][string]$Root)
. "$PSScriptRoot\_lib\common.ps1"

$exclude = Get-ExcludedRegex
$mapPath = Join-Path $Root "FILEMAP.md"

if (-not (Test-Path -LiteralPath $mapPath)) {
  Write-Err "FILEMAP.md not found in project root."
  Write-Info "Run: 1) Create FILEMAP"
  exit 2
}

$expected = @(
  Get-Content -LiteralPath $mapPath -Encoding UTF8 |
    Where-Object { $_ -match "^\.\\" } |
    ForEach-Object { $_.Trim() } |
    Where-Object { $_ -ne "" }
)

$actual = @(
  Get-ChildItem -LiteralPath $Root -Recurse -Force -File |
    Where-Object { $_.FullName -notmatch $exclude } |
    Sort-Object FullName |
    ForEach-Object { Get-RelativePath -BasePath $Root -TargetPath $_.FullName }
)

$missing = @(
  Compare-Object -ReferenceObject $expected -DifferenceObject $actual -PassThru |
    Where-Object { $_.SideIndicator -eq "<=" }
)

$extra = @(
  Compare-Object -ReferenceObject $expected -DifferenceObject $actual -PassThru |
    Where-Object { $_.SideIndicator -eq "=>" }
)

if (($missing.Count -eq 0) -and ($extra.Count -eq 0)) {
  Write-Ok "FILEMAP check OK. No differences."
  exit 0
}

Write-Warn "FILEMAP check FAILED."
if ($missing.Count -gt 0) {
  Write-Err "Missing files (in FILEMAP but not on disk):"
  $missing | ForEach-Object { "  $_" } | Write-Host
}
if ($extra.Count -gt 0) {
  Write-Err "Extra files (on disk but not in FILEMAP):"
  $extra | ForEach-Object { "  $_" } | Write-Host
}

exit 3
