param(
  [Parameter(Mandatory=$true)][string]$Root
)

. "$PSScriptRoot\_lib\common.ps1"

$ROOT = Resolve-ProjectRoot -Root $Root
$script = Join-Path $ROOT "Utilities\diagnostics\i18n_audit.py"

if (-not (Test-Path $script)) {
  Write-Error "Missing: $script"
  exit 1
}

# Prefer 'python' because the project uses it for local server. Fall back to 'python3'.
$py = "python"
if (-not (Get-Command $py -ErrorAction SilentlyContinue)) {
  $py = "python3"
}
if (-not (Get-Command $py -ErrorAction SilentlyContinue)) {
  Write-Error "Python not found in PATH. Install Python or add it to PATH."
  exit 1
}

Write-Info "Running i18n audit..."
& $py $script
$code = $LASTEXITCODE

if ($code -eq 0) {
  Write-Ok "i18n audit: PASSED"
} else {
  Write-Warn "i18n audit: FAILED (exit code $code)"
}
exit $code
