param(
  [string]$Tag = "v1.0.8-commercial",
  [string]$Message = "",
  [switch]$NoZip,
  [switch]$NoTag,
  [switch]$NoBranch,
  [switch]$NoCommit,
  [switch]$NoAdd,
  [switch]$LocalIdentityOnly,  # if set: config identity only for this repo (no --global)
  [switch]$SkipSmoke,          # if set: skip smoke test before creating archive
  [ValidateSet("Normal","Full","Paranoid")]
  [string]$SmokeMode = "Normal"
)

$ErrorActionPreference = "Stop"

function Say($t){ Write-Host $t -ForegroundColor Cyan }
function Warn($t){ Write-Host $t -ForegroundColor Yellow }
function Die($t){ Write-Host $t -ForegroundColor Red; exit 1 }

function Have-Cmd($name){
  return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

function New-AlphaHash {
  # Short human-friendly hash derived from current date/time.
  # Output: 8 chars, base32 (A-Z2-7).
  $stamp = (Get-Date).ToString('yyyyMMddHHmmssfff')
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($stamp)
  $sha1  = [System.Security.Cryptography.SHA1]::Create()
  $hash  = $sha1.ComputeHash($bytes)

  $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  $val = [System.Numerics.BigInteger]::new(@(0) + $hash[0..7]) # 8 bytes -> BigInteger (unsigned via leading 0)
  if ($val -lt 0) { $val = -$val }

  $out = ""
  for ($i = 0; $i -lt 8; $i++) {
    $idx = [int]($val % 32)
    $out = $alphabet[$idx] + $out
    $val = [System.Numerics.BigInteger]::op_Division($val, 32)
  }
  return $out
}

function Resolve-ScriptDir {
  $scriptDir = $PSScriptRoot
  if ([string]::IsNullOrWhiteSpace($scriptDir)) {
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
  }
  if ([string]::IsNullOrWhiteSpace($scriptDir)) {
    $scriptDir = (Get-Location).Path
  }
  return $scriptDir
}

function Find-ProjectRoot {
  param([string]$StartDir)

  # 1) If git exists and repo, use git top-level (works even if script is in subfolder)
  if (Have-Cmd git) {
    try {
      $top = (git -C $StartDir rev-parse --show-toplevel 2>$null).Trim()
      if ($top -and (Test-Path $top)) { return $top }
    } catch {}
  }

  # 2) Fallback: walk up and search for "project markers"
  # IMPORTANT: do NOT depend on deprecated files like js\contract.js
  $dir = (Resolve-Path -LiteralPath $StartDir).Path
  while ($true) {
    $m1 = Join-Path $dir "index.html"
    $m2 = Join-Path $dir "js\main.js"
    $m3 = Join-Path $dir "js\app\app.js"
    $m4 = Join-Path $dir "js\app\state.js"
    if ((Test-Path $m1) -and (Test-Path $m2) -and (Test-Path $m3)) {
      return $dir
    }
    # allow older variants that still have app.js but not state.js
    if ((Test-Path $m1) -and (Test-Path $m3) -and (Test-Path (Join-Path $dir "js\utils.js"))) {
      return $dir
    }

    $parent = Split-Path -Parent $dir
    if ([string]::IsNullOrWhiteSpace($parent) -or $parent -eq $dir) { break }
    $dir = $parent
  }

  Die "Cannot locate project root. Put this script inside the project or run inside the repo."
}

function In-Console {
  try { return [Environment]::UserInteractive -and $Host -and $Host.UI -and $Host.UI.RawUI } catch { return $false }
}

function Maybe-Abort {
  param([string]$Hint = "Press Q to abort Paranoid smoke-test...")

  if ($SmokeMode -ne "Paranoid") { return }
  if (-not (In-Console)) { return }

  Write-Host ("  [Paranoid] " + $Hint) -ForegroundColor DarkYellow
  Write-Host "  Continuing in 2s (or press Q now)..." -ForegroundColor DarkYellow

  $deadline = (Get-Date).AddSeconds(2)
  while ((Get-Date) -lt $deadline) {
    try {
      if ([Console]::KeyAvailable) {
        $k = [Console]::ReadKey($true)
        if ($k.Key -eq "Q") { Die "Aborted by user (Paranoid smoke-test)." }
      }
    } catch { break }
    Start-Sleep -Milliseconds 50
  }
}

function Require-Files {
  param([string]$RepoRoot, [string[]]$RelPaths)
  foreach ($rel in $RelPaths) {
    $p = Join-Path $RepoRoot $rel
    if (-not (Test-Path $p)) {
      Die ("Smoke-test failed: missing required file: " + $rel)
    }
  }
}

function Run-SmokeTest {
  param([string]$RepoRoot)

  if ($SkipSmoke) {
    Warn "SkipSmoke: smoke test skipped."
    return
  }

  Say ("Smoke-test: starting (" + $SmokeMode + ")...")

  Maybe-Abort "Before custom smoke command."

  # 1) Optional override via environment (advanced users)
  $custom = $env:LC_SMOKE_CMD
  if (-not [string]::IsNullOrWhiteSpace($custom)) {
    Say ("Smoke-test: custom command -> " + $custom)
    cmd /c $custom
    if ($LASTEXITCODE -ne 0) { Die ("Smoke-test failed (LC_SMOKE_CMD). ExitCode=" + $LASTEXITCODE) }
    Say "Smoke-test: OK"
    return
  }

  Maybe-Abort "Before node preflight."

  # 2) Preferred: Node preflight/smoke script if present
  $preflight = Join-Path $RepoRoot "js\preflight.js"
  if ((Test-Path $preflight) -and (Have-Cmd node)) {
    Say "Smoke-test: node js/preflight.js"
    node $preflight
    if ($LASTEXITCODE -ne 0) { Die ("Smoke-test failed (preflight.js). ExitCode=" + $LASTEXITCODE) }
    Say "Smoke-test: OK"
    return
  }

  Maybe-Abort "Before filemap check."

  # 3) Optional: filemap check if present
  $checkFilemap = Join-Path $RepoRoot "1_check-filemap.bat"
  if (($SmokeMode -ne "Normal") -and (Test-Path $checkFilemap)) {
    Say "Smoke-test: 1_check-filemap.bat"
    cmd /c "`"$checkFilemap`""
    if ($LASTEXITCODE -ne 0) { Die ("Smoke-test failed (1_check-filemap.bat). ExitCode=" + $LASTEXITCODE) }
    Say "Smoke-test: OK"
    return
  }

  Maybe-Abort "Before minimal structural checks."

  # 4) Minimal structural smoke (never depends on external tools)
  $mustNormal = @(
    "index.html",
    "js\main.js",
    "js\app\app.js"
  )

  # If you have stable CSS path, include it only when present.
  # We do not hard-fail on styles\base.css because many branches move CSS.
  Require-Files -RepoRoot $RepoRoot -RelPaths $mustNormal

  if ($SmokeMode -ne "Normal") {
    $should = @(
      "js\app\state.js",
      "js\utils.js",
      "js\renderCard.js"
    )
    foreach ($rel in $should) {
      $p = Join-Path $RepoRoot $rel
      if (-not (Test-Path $p)) { Warn ("Smoke-test (Full): expected (non-fatal) missing: " + $rel) }
    }
  }

  if ($SmokeMode -eq "Paranoid") {
    Maybe-Abort "Before repo hygiene scan."

    # Paranoid: quick hygiene scan (fast, not insane)
    $badDirs = @("node_modules", ".git", "_release", "_backups", "_restore")
    $tooBigMB = 50

    # Fail if there are giant files inside source tree (except in excluded dirs)
    $all = Get-ChildItem -Path $RepoRoot -Recurse -Force -File -ErrorAction SilentlyContinue
    foreach ($f in $all) {
      # skip excluded dirs
      $skip = $false
      foreach ($d in $badDirs) {
        if ($f.FullName -like (Join-Path $RepoRoot ($d + "\*"))) { $skip = $true; break }
      }
      if ($skip) { continue }

      $mb = [math]::Round(($f.Length / 1MB), 2)
      if ($mb -ge $tooBigMB) {
        Die ("Smoke-test (Paranoid) failed: suspicious huge file " + $mb + " MB -> " + ($f.FullName.Substring($RepoRoot.Length).TrimStart('\')))
      }
    }

    Maybe-Abort "Before counting files."

    # sanity: absurd file counts usually indicate a disaster
    $count = ($all | Measure-Object).Count
    if ($count -gt 20000) {
      Die ("Smoke-test (Paranoid) failed: file count is too high (" + $count + "). This looks like a runaway generation incident.")
    }
  }

  Say "Smoke-test: OK"
}

function Ensure-GitIdentity {
  param([switch]$LocalOnly)

  $name  = (git config user.name 2>$null)
  $email = (git config user.email 2>$null)

  if ([string]::IsNullOrWhiteSpace($name))  { $name  = (git config --global user.name 2>$null) }
  if ([string]::IsNullOrWhiteSpace($email)) { $email = (git config --global user.email 2>$null) }

  if (-not [string]::IsNullOrWhiteSpace($name) -and -not [string]::IsNullOrWhiteSpace($email)) {
    Say ("Git identity: OK (" + $name + " <" + $email + ">)")
    return
  }

  Warn "Git identity is not configured (user.name / user.email). Commits will fail."
  Warn "Setting default identity now..."

  $defaultName  = "Oleksii Ostoletskyi"
  $defaultEmail = "ostoletskyi.oleksii@gmail.com"

  if ($LocalOnly) {
    git config user.name  $defaultName | Out-Null
    git config user.email $defaultEmail | Out-Null
    Say "Configured identity for THIS repository only."
  } else {
    git config --global user.name  $defaultName | Out-Null
    git config --global user.email $defaultEmail | Out-Null
    Say "Configured GLOBAL identity."
  }

  $name2  = (git config user.name 2>$null)
  $email2 = (git config user.email 2>$null)
  if ([string]::IsNullOrWhiteSpace($name2) -or [string]::IsNullOrWhiteSpace($email2)) {
    Die "Failed to set git identity. Please set it manually: git config --global user.name / user.email"
  }

  Say ("Git identity: OK (" + $name2 + " <" + $email2 + ">)")
}

function Ensure-ReleaseBranch {
  param([string]$Branch)

  $exists = $false
  try { git show-ref --verify --quiet ("refs/heads/" + $Branch); $exists = $true } catch { $exists = $false }

  if ($exists) {
    Warn ("Branch already exists, switching to: " + $Branch)
    git checkout $Branch | Out-Null
  } else {
    Say ("Creating branch: " + $Branch)
    git checkout -b $Branch | Out-Null
  }
}

function Ensure-Tag-AtHead {
  param([string]$TagName)

  $tagExists = $false
  try { git show-ref --tags --verify --quiet ("refs/tags/" + $TagName); $tagExists = $true } catch { $tagExists = $false }

  if ($tagExists) {
    Warn ("Tag already exists, skipping: " + $TagName)
    return
  }

  Say ("Creating tag (final HEAD): " + $TagName)
  git tag -a $TagName -m ("Release " + $TagName) | Out-Null
}

function Write-VersionFile {
  param(
    [string]$RepoRoot,
    [string]$Tag,
    [string]$Commit
  )

  $build = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
  $verPath = Join-Path $RepoRoot "js\version.js"

  $TagEsc = $Tag.Replace('\','\\').Replace('"','\"')
  $BuildEsc = $build.Replace('\','\\').Replace('"','\"')
  $CommitEsc = $Commit.Replace('\','\\').Replace('"','\"')

  $content = @"
// js/version.js
// Auto-updated by fix-release.ps1 on release.
// Single source of truth for UI / backups / diagnostics.

export const APP_VERSION = Object.freeze({
  app: "LingoCard Editor",
  tag: "$TagEsc",
  build: "$BuildEsc",
  commit: "$CommitEsc",
  note: "release: $TagEsc",
});

export function formatVersionLine(v = APP_VERSION) {
  const tag = v && v.tag ? String(v.tag) : "dev";
  const build = v && v.build ? String(v.build) : "local";
  const commit = v && v.commit ? String(v.commit) : "";
  const shortCommit = commit ? commit.slice(0, 8) : "";
  const dot = " · ";
  return shortCommit
    ? "LingoCard " + tag + dot + shortCommit + dot + build
    : "LingoCard " + tag + dot + build;
}
"@

  Say ("Writing: " + $verPath)

  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($verPath, $content, $utf8NoBom)
}

function Copy-Snapshot {
  param(
    [string]$RepoRoot,
    [string]$SnapRoot
  )

  if (Test-Path $SnapRoot) { Remove-Item $SnapRoot -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $SnapRoot | Out-Null

  $excludeDirs = @(".git", "node_modules", "_release", "_backups", "_restore")
  $excludeFiles = @("*.zip", "*.log", ".DS_Store", "Thumbs.db")

  Say ("Creating temp snapshot: " + $SnapRoot)

  if (Have-Cmd robocopy) {
    $args = @(
      $RepoRoot, $SnapRoot,
      "/MIR",
      "/R:1", "/W:1",
      "/NFL", "/NDL", "/NJH", "/NJS", "/NP"
    )

    foreach($d in $excludeDirs){ $args += @("/XD", $d) }
    foreach($f in $excludeFiles){ $args += @("/XF", $f) }

    & robocopy @args | Out-Null
    $rc = $LASTEXITCODE
    if ($rc -ge 8) {
      Die ("robocopy failed with exit code " + $rc)
    }
    return
  }

  Warn "robocopy not found. Using Copy-Item fallback (slower, but reliable)."

  $topItems = Get-ChildItem -Path $RepoRoot -Force
  foreach ($it in $topItems) {
    if ($excludeDirs -contains $it.Name) { continue }
    $skip = $false
    foreach ($g in $excludeFiles) {
      if ($it.Name -like $g) { $skip = $true; break }
    }
    if ($skip) { continue }

    $dst = Join-Path $SnapRoot $it.Name
    if ($it.PSIsContainer) {
      Copy-Item -Path $it.FullName -Destination $dst -Recurse -Force
    } else {
      Copy-Item -Path $it.FullName -Destination $dst -Force
    }
  }
}

function Write-Manifest {
  param(
    [string]$SnapRoot,
    [string]$ProjectName,
    [string]$Tag,
    [string]$GitTop
  )

  $created = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
  $branch = ""
  $hash = ""
  try { $branch = (git rev-parse --abbrev-ref HEAD).Trim() } catch { $branch = "unknown" }
  try { $hash = (git rev-parse HEAD).Trim() } catch { $hash = "unknown" }

  $manifest = @"
project=$ProjectName
tag=$Tag
created_at=$created
repo_root=$GitTop
git_branch=$branch
git_commit=$hash
note=Snapshot created by fix-release.ps1
"@

  $path = Join-Path $SnapRoot "__MANIFEST__.txt"
  $manifest | Out-File -Encoding UTF8 $path
}

function Zip-FromSnapshotTar {
  param(
    [string]$SnapRoot,
    [string]$ZipPath
  )

  if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }

  $files = Get-ChildItem -Path $SnapRoot -Recurse -File
  if (-not $files -or $files.Count -eq 0) {
    Die "Snapshot folder is empty. Cannot build ZIP."
  }

  if (-not (Have-Cmd tar)) { return $false }

  Say ("Building ZIP via tar (keeps folder structure): " + $ZipPath)
  Push-Location $SnapRoot
  try {
    tar -a -c -f $ZipPath .
  } finally {
    Pop-Location
  }
  return $true
}

function Zip-FromSnapshotCompressArchive {
  param(
    [string]$SnapRoot,
    [string]$ZipPath
  )

  if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }

  $files = Get-ChildItem -Path $SnapRoot -Recurse -File
  if (-not $files -or $files.Count -eq 0) {
    Die "Snapshot folder is empty. Cannot build ZIP."
  }

  Say ("Building ZIP via Compress-Archive (fallback): " + $ZipPath)
  Push-Location $SnapRoot
  try {
    Compress-Archive -Path @(".") -DestinationPath $ZipPath -Force -CompressionLevel Optimal
  } finally {
    Pop-Location
  }
}

function Git-IsRepo {
  if (-not (Have-Cmd git)) { return $false }
  try {
    git rev-parse --is-inside-work-tree 1>$null 2>$null
    return $true
  } catch { return $false }
}

# --- Resolve repo root (script may be in subfolder) ---------------------------
$scriptDir = Resolve-ScriptDir
$gitTop = Find-ProjectRoot -StartDir $scriptDir
Set-Location $gitTop
Say ("Root: " + $gitTop)

$gitMode = (Git-IsRepo)

if ([string]::IsNullOrWhiteSpace($Message)) { $Message = "release: $Tag" }

# --- Git identity -------------------------------------------------------------
if ($gitMode) {
  Ensure-GitIdentity -LocalOnly:$LocalIdentityOnly
} else {
  Warn "git not available or not a repo -> BACKUP-ONLY mode (no commit/tag/branch)."
}

# --- Status ------------------------------------------------------------------
if ($gitMode) {
  Say "Git status:"
  $st = git status --porcelain
  if ($st) { $st | ForEach-Object { "  $_" } | Write-Host } else { Write-Host "  (clean)" }
} else {
  Warn "Git status: skipped (backup-only mode)."
}

# --- Pre-release commit (whatever is pending) --------------------------------
if ($gitMode -and -not $NoCommit) {
  if (-not $NoAdd) {
    Say "Running: git add -A"
    git add -A | Out-Null
  }

  $pending = (git status --porcelain)
  if ($pending) {
    Say ("Running: git commit -m `"" + $Message + "`"")
    git commit -m $Message | Out-Null
  } else {
    Warn "Nothing to commit. Skipping commit."
  }
} elseif (-not $gitMode) {
  Warn "NoCommit: skipped (backup-only mode)."
} else {
  Warn "NoCommit: skipping commit."
}

# --- Release branch (do it EARLY so all release commits land on it) ----------
if ($gitMode -and -not $NoBranch) {
  $branch = "release/$Tag"
  Ensure-ReleaseBranch -Branch $branch
} elseif (-not $gitMode) {
  Warn "NoBranch: skipped (backup-only mode)."
} else {
  Warn "NoBranch: skipping branch creation."
}

# --- Version file + commit ---------------------------------------------------
$commit = ""
if ($gitMode) {
  $commit = (git rev-parse HEAD).Trim()
  Write-VersionFile -RepoRoot $gitTop -Tag $Tag -Commit $commit

  if (-not $NoCommit) {
    git add "js/version.js" | Out-Null
    $pendingV = (git status --porcelain)
    if ($pendingV) {
      Say "Running: git commit -m `"chore: bump version file`""
      git commit -m "chore: bump version file" | Out-Null
      $commit = (git rev-parse HEAD).Trim()
    } else {
      Warn "Version file unchanged. Skipping version commit."
    }
  }
} else {
  Warn "Version file: skipped (backup-only mode)."
}

# --- Release notes (write BEFORE tag) ----------------------------------------
$dt = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

$notes = @"
# Release $Tag

Date: $dt
Commit: $commit

## What is included
- Stable canvas editor
- Inline text editing (Ctrl+Enter newline, Enter commit, Esc cancel)
- Drag with snap-to-grid
- No-overlap constraint
- Hard card bounds with margin
- Mouse wheel font size with clamp + autofit
- Rulers/grid overlay synced via computeCardGeom
"@

if ($gitMode) {
  $notesPath = Join-Path $gitTop "RELEASE_NOTES.md"
  Say ("Writing: " + $notesPath)
  $notes | Out-File -Encoding UTF8 $notesPath

  if (-not $NoCommit) {
    git add RELEASE_NOTES.md | Out-Null
    $pending2 = (git status --porcelain)
    if ($pending2) {
      Say ("Running: git commit -m `"docs: release notes " + $Tag + "`"")
      git commit -m ("docs: release notes " + $Tag) | Out-Null
      $commit = (git rev-parse HEAD).Trim()
    } else {
      Warn "Release notes unchanged. Skipping notes commit."
    }
  }
} else {
  Warn "Release notes: skipped (backup-only mode)."
}

# --- Tag (FINAL: after version + notes commits) ------------------------------
if ($gitMode -and -not $NoTag) {
  Ensure-Tag-AtHead -TagName $Tag
} elseif (-not $gitMode) {
  Warn "NoTag: skipped (backup-only mode)."
} else {
  Warn "NoTag: skipping tagging."
}

# --- Snapshot instructions ---------------------------------------------------
$snapDir = Join-Path $gitTop "_release"
if (-not (Test-Path $snapDir)) { New-Item -ItemType Directory -Path $snapDir | Out-Null }

$appJs = Join-Path $gitTop "js\app\app.js"
$autosaveKey = "LC_NEXT_STATE_V1"
if (Test-Path $appJs) {
  try {
    $txt = Get-Content $appJs -Raw
    $m = [regex]::Match($txt, 'AUTOSAVE_KEY\s*=\s*"([^"]+)"')
    if ($m.Success) { $autosaveKey = $m.Groups[1].Value }
  } catch {}
}

$snapInfo = @"
This is a release snapshot placeholder.

To export the real autosave from the browser:
1) Open DevTools Console on the running app
2) Run:
   copy(localStorage.getItem("$autosaveKey"))
3) Paste into a file named:
   snapshot_autosave_$Tag.json
4) Put it into this folder: _release\
"@

$snapInfoPath = Join-Path $snapDir ("snapshot_instructions_" + $Tag + ".txt")
Say ("Writing: " + $snapInfoPath)
$snapInfo | Out-File -Encoding UTF8 $snapInfoPath

# --- ZIP -> ALWAYS into root\_backups ----------------------------------------
if (-not $NoZip) {
  $uniq = New-AlphaHash
  $zipName = "lingocard-next_${Tag}-${uniq}.zip"

  $backupsDir = Join-Path $gitTop "_backups"
  if (-not (Test-Path $backupsDir)) {
    Say ("Creating: " + $backupsDir)
    New-Item -ItemType Directory -Path $backupsDir | Out-Null
  }

  $zipPath = Join-Path $backupsDir $zipName

  # temp snapshot inside _release (OK), but archive goes into _backups
  $tmpSnap = Join-Path $snapDir ("_tmp_snapshot_" + $Tag)

  try {
    Run-SmokeTest -RepoRoot $gitTop
    Copy-Snapshot -RepoRoot $gitTop -SnapRoot $tmpSnap
    Write-Manifest -SnapRoot $tmpSnap -ProjectName "lingocard-next" -Tag $Tag -GitTop $gitTop

    $ok = Zip-FromSnapshotTar -SnapRoot $tmpSnap -ZipPath $zipPath
    if (-not $ok) {
      Warn "tar not found. Using Compress-Archive fallback."
      Zip-FromSnapshotCompressArchive -SnapRoot $tmpSnap -ZipPath $zipPath
    }

    Say ("Zip ready: " + $zipPath)
  } finally {
    if (Test-Path $tmpSnap) {
      Remove-Item $tmpSnap -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
} else {
  Warn "NoZip: skipping zip build."
}

Say ""
Say "Done."
Say ("Tag: " + $Tag)
Say ("Commit: " + $commit)
if (-not $NoZip) { Say ("Archive: " + $zipName) }