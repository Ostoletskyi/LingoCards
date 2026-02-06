param([Parameter(Mandatory=$true)][string]$Root)
. "$PSScriptRoot\_lib\common.ps1"

$git = Get-Command git -ErrorAction SilentlyContinue
if (-not $git) {
  Write-Err "git not found in PATH. Install Git for Windows first."
  exit 6
}

$gitDir = Join-Path $Root ".git"
if (Test-Path -LiteralPath $gitDir) {
  Write-Warn "Repository already exists (.git folder found)."
} else {
  Write-Info "Initializing git repository..."
  & git -C $Root init | Out-Null
  Write-Ok "git init done."
}

$ignore = Join-Path $Root ".gitignore"
if (-not (Test-Path -LiteralPath $ignore)) {
@"
# LingoCard вЂ“ ignores
_utilities/_backups/
_utilities/_restore/
_utilities/_runtime/
_restore/
_backups/
._tools/server.pid
node_modules/
dist/
build/
coverage/
.vscode/
.idea/
.DS_Store
Thumbs.db
"@ | Set-Content -LiteralPath $ignore -Encoding UTF8
  Write-Ok ".gitignore created."
} else {
  Write-Info ".gitignore already exists (not modified)."
}

Write-Info "Next steps (manual):"
Write-Host '  git add .'
Write-Host '  git commit -m "Initial commit"'
exit 0