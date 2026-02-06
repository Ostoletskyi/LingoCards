Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-ProjectRoot {
  param([Parameter(Mandatory=$true)][string]$Root)
  (Resolve-Path -LiteralPath $Root).Path
}

function Write-Info([string]$msg){ Write-Host $msg -ForegroundColor Cyan }
function Write-Ok([string]$msg){ Write-Host $msg -ForegroundColor Green }
function Write-Warn([string]$msg){ Write-Host $msg -ForegroundColor Yellow }
function Write-Err([string]$msg){ Write-Host $msg -ForegroundColor Red }

function Ensure-Dir([string]$path){
  if (-not (Test-Path -LiteralPath $path)) { New-Item -ItemType Directory -Path $path | Out-Null }
}

function Get-RelativePath {
  # PS 5 compatible relative path (no System.IO.Path.GetRelativePath)
  param(
    [Parameter(Mandatory=$true)][string]$BasePath,
    [Parameter(Mandatory=$true)][string]$TargetPath
  )
  $base = (Resolve-Path -LiteralPath $BasePath).Path
  $target = (Resolve-Path -LiteralPath $TargetPath).Path
  if (-not $base.EndsWith([IO.Path]::DirectorySeparatorChar)) { $base += [IO.Path]::DirectorySeparatorChar }
  $uBase = New-Object System.Uri($base)
  $uTarget = New-Object System.Uri($target)
  $rel = $uBase.MakeRelativeUri($uTarget).ToString()
  $rel = [System.Uri]::UnescapeDataString($rel)
  $rel = $rel -replace '/', [IO.Path]::DirectorySeparatorChar
  return ".{0}{1}" -f [IO.Path]::DirectorySeparatorChar, $rel
}

function Get-ExcludedRegex {
  # One canonical exclude list for filemap/backup/diagnostics.
  $parts = @(
    "\\\.git(\\|$)",
    "\\node_modules(\\|$)",
    "\\_utilities\\_backups(\\|$)",
    "\\_utilities\\_restore(\\|$)",
    "\\_utilities\\_runtime(\\|$)",
    "\\_restore(\\|$)",
    "\\_backups(\\|$)",
    "\\dist(\\|$)",
    "\\build(\\|$)",
    "\\coverage(\\|$)",
    "\\\.vscode(\\|$)",
    "\\\.idea(\\|$)",
    "\\Thumbs\.db$",
    "\\\.DS_Store$"
  )
  ($parts -join '|')
}