param([Parameter(Mandatory=$true)][string]$Root)
. "$PSScriptRoot\_lib\common.ps1"

$exclude = Get-ExcludedRegex
$out = Join-Path $Root "FILEMAP.md"

$files = @(
  Get-ChildItem -LiteralPath $Root -Recurse -Force -File |
    Where-Object { $_.FullName -notmatch $exclude } |
    Sort-Object FullName
)

$stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
"# FILEMAP" | Set-Content -LiteralPath $out -Encoding UTF8
"Generated: $stamp" | Add-Content -LiteralPath $out -Encoding UTF8
"Root: $Root" | Add-Content -LiteralPath $out -Encoding UTF8
"" | Add-Content -LiteralPath $out -Encoding UTF8

foreach ($f in $files) {
  $rel = Get-RelativePath -BasePath $Root -TargetPath $f.FullName
  Add-Content -LiteralPath $out -Value $rel -Encoding UTF8
}

Write-Ok "FILEMAP created: $out"
Write-Info ("Files listed: {0}" -f $files.Count)
