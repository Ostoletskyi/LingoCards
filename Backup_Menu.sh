#!/usr/bin/env bash
set -e
( set -o pipefail ) 2>/dev/null && set -o pipefail || true

# -----------------------------------------------------------------------------
# LingoCard Backup Menu (ZIP snapshots + safe restore)
# - UI output goes to STDERR
# - Functions that return a value output ONLY that value to STDOUT
# - Designed to work well on Git-Bash / Windows too
# -----------------------------------------------------------------------------

BACKUP_DIR="${BACKUP_DIR:-_backups}"
RESTORE_DIR="${RESTORE_DIR:-_restore}"
PROJECT_NAME="${PROJECT_NAME:-lingocard-next}"

# Resolve project root = folder where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ROOT="$SCRIPT_DIR"
cd "$PROJECT_ROOT" || exit 1

mkdir -p "$BACKUP_DIR" "$RESTORE_DIR"

EXCLUDES=(
  ".git/*"
  "node_modules/*"
  "${BACKUP_DIR}/*"
  "${RESTORE_DIR}/*"
  "*.zip"
  "*.log"
  ".DS_Store"
  "Thumbs.db"
)

ts_now() { date +"%Y-%m-%d_%H-%M-%S"; }

# UI output (menus, lists, prompts) -> STDERR
ui()   { printf "%s\n" "$*" >&2; }
say()  { ui ""; ui "$*"; }
warn() { ui ""; ui "[WARN] $*"; }
die()  { ui ""; ui "[ERROR] $*"; exit 1; }

have_cmd() { command -v "$1" >/dev/null 2>&1; }

trim_cr() { printf "%s" "${1%$'\r'}"; }

abs_path() {
  local p; p="$(trim_cr "$1")"
  if [ -d "$p" ]; then (cd "$p" && pwd -P); return; fi
  local d b
  d="$(dirname "$p")"; b="$(basename "$p")"
  (cd "$d" 2>/dev/null && printf "%s/%s" "$(pwd -P)" "$b") || printf "%s" "$p"
}

require_zip_tools() {
  have_cmd zip   || die "zip is not installed or not in PATH."
  have_cmd unzip || die "unzip is not installed or not in PATH."
}

have_git_repo() {
  have_cmd git && git rev-parse --is-inside-work-tree >/dev/null 2>&1
}

# -----------------------------------------------------------------------------
# Meta helpers
# -----------------------------------------------------------------------------

human_size() {
  local b="$1"
  if [ -z "$b" ] || ! echo "$b" | grep -Eq '^[0-9]+$'; then echo "?B"; return; fi
  if [ "$b" -lt 1024 ]; then echo "${b}B"; return; fi
  local kb=$((b/1024))
  if [ "$kb" -lt 1024 ]; then echo "${kb}KB"; return; fi
  local mb=$((kb/1024))
  if [ "$mb" -lt 1024 ]; then echo "${mb}MB"; return; fi
  local gb=$((mb/1024))
  echo "${gb}GB"
}

zip_bytes() {
  local f="$1"
  if have_cmd stat; then
    stat -c%s "$f" 2>/dev/null || stat -f%z "$f" 2>/dev/null || echo ""
  else
    echo ""
  fi
}

zip_has_manifest() {
  local z="$1"
  unzip -Z1 "$z" 2>/dev/null | grep -Fxq "__MANIFEST__.txt"
}

zip_manifest_get() {
  local z="$1" k="$2"
  unzip -p "$z" "__MANIFEST__.txt" 2>/dev/null | grep -E "^${k}=" | head -n 1 | sed -E "s/^${k}=//"
}

zip_manifest_tag()    { zip_manifest_get "$1" "tag"; }
zip_manifest_build()  { zip_manifest_get "$1" "build"; }
zip_manifest_commit() {
  local s
  s="$(zip_manifest_get "$1" "commit_short")"
  [ -n "$s" ] && { echo "$s"; return; }
  s="$(zip_manifest_get "$1" "commit")"
  [ -n "$s" ] && echo "$s" | cut -c1-8
}

zip_manifest_note_short() {
  local z="$1"
  local note
  note="$(zip_manifest_get "$z" "note")"
  [ -z "$note" ] && note="$(zip_manifest_get "$z" "message")"
  echo "$note" | sed -E 's/[[:space:]]+/ /g' | cut -c1-44
}

# -----------------------------------------------------------------------------
# Progress indicator (spinner + elapsed) for LONG operations
# -----------------------------------------------------------------------------

spinner_run() {
  # Usage: spinner_run "Message..." command arg...
  local msg="$1"; shift

  local tmp="${RESTORE_DIR}/._cmd_$$.log"
  local start_ts end_ts elapsed
  start_ts="$(date +%s 2>/dev/null || echo 0)"

  ( "$@" ) >"$tmp" 2>&1 &
  local pid=$!

  local spin='|/-\'
  local i=0

  ui ""
  printf "%s " "$msg" >&2
  while kill -0 "$pid" 2>/dev/null; do
    i=$(( (i + 1) % 4 ))
    printf "\b%s" "${spin:$i:1}" >&2
    sleep 0.12
  done

  wait "$pid"
  local rc=$?

  end_ts="$(date +%s 2>/dev/null || echo 0)"
  if [ "$start_ts" != "0" ] && [ "$end_ts" != "0" ]; then elapsed=$(( end_ts - start_ts )); else elapsed="?"; fi

  if [ $rc -eq 0 ]; then
    printf "\bOK (%ss)\n" "$elapsed" >&2
  else
    printf "\bFAILED (%ss, code=%s)\n" "$elapsed" "$rc" >&2
    ui "---- command output ----"
    sed 's/^/  /' "$tmp" | tail -n 80 >&2
    ui "------------------------"
  fi

  rm -f "$tmp"
  return $rc
}

# -----------------------------------------------------------------------------
# Manifest creation
# -----------------------------------------------------------------------------

make_manifest_file() {
  local manifest_path="${RESTORE_DIR}/.__MANIFEST__.$$.$RANDOM.txt"
  local root; root="$(pwd -P)"

  local branch="unknown" commit="unknown" commit_short=""
  local tag="dev" build
  build="$(date -Iseconds 2>/dev/null || date)"

  if have_git_repo; then
    branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")"
    commit="$(git rev-parse HEAD 2>/dev/null || echo "unknown")"
    commit_short="$(git rev-parse --short HEAD 2>/dev/null || true)"
  fi

  # Best-effort read from js/version.js if present
  if [ -f "js/version.js" ]; then
    local t b c
    t="$(grep -E 'tag:\s*"' js/version.js 2>/dev/null | head -n1 | sed -E 's/.*tag:\s*"([^"]+)".*/\1/')"
    b="$(grep -E 'build:\s*"' js/version.js 2>/dev/null | head -n1 | sed -E 's/.*build:\s*"([^"]+)".*/\1/')"
    c="$(grep -E 'commit:\s*"' js/version.js 2>/dev/null | head -n1 | sed -E 's/.*commit:\s*"([^"]+)".*/\1/')"
    [ -n "$t" ] && tag="$t"
    [ -n "$b" ] && build="$b"
    [ -n "$c" ] && { commit="$c"; commit_short="$(echo "$c" | cut -c1-8)"; }
  fi

  local message=""
  [ -n "${BACKUP_NOTE:-}" ] && message="$BACKUP_NOTE"

  {
    echo "project=${PROJECT_NAME}"
    echo "created_at=${build}"
    echo "path=${root}"
    echo "tag=${tag}"
    echo "build=${build}"
    echo "branch=${branch}"
    echo "commit=${commit}"
    echo "commit_short=${commit_short}"
    echo "message=${message}"
    echo "note=Backup created by 4_Backup_Menu.sh"
  } > "$manifest_path"

  printf "%s" "$manifest_path"
}

# -----------------------------------------------------------------------------
# Backup listing / picking
# -----------------------------------------------------------------------------

list_backups() {
  ui ""
  ui "Available backups in ./${BACKUP_DIR}:"
  local files
  files="$(ls -1t "${BACKUP_DIR}"/*.zip 2>/dev/null || true)"
  if [ -z "$files" ]; then
    ui "  (none)"
    return 1
  fi

  local i=0
  while IFS= read -r f; do
    i=$((i+1))
    local base bytes size tag commit note
    base="$(basename "$f")"
    bytes="$(zip_bytes "$f")"
    size="$(human_size "$bytes")"

    if zip_has_manifest "$f"; then
      tag="$(zip_manifest_tag "$f")"
      commit="$(zip_manifest_commit "$f")"
      note="$(zip_manifest_note_short "$f")"
      [ -z "$tag" ] && tag="no-tag"
      [ -z "$commit" ] && commit="--------"
      [ -z "$note" ] && note=""
    else
      tag="no-manifest"
      commit="--------"
      note=""
    fi

    printf "%2d. %-45s %8s  %-18s %-8s  %s\n" "$i" "$base" "$size" "$tag" "$commit" "$note" >&2
  done <<< "$files"

  return 0
}

pick_backup() {
  # UI: list first
  if ! list_backups; then
    warn "No backups found. Create one first (option 1)."
    return 1
  fi

  while true; do
    printf "\nChoose backup number (Enter = back): " >&2
    IFS= read -r num || num=""
    num="$(trim_cr "$num")"

    [ -z "$num" ] && return 1
    echo "$num" | grep -Eq '^[0-9]+$' || { warn "Not a number."; continue; }

    local file
    file="$(ls -1t "${BACKUP_DIR}"/*.zip 2>/dev/null | sed -n "${num}p" || true)"
    file="$(trim_cr "$file")"

    [ -z "$file" ] && { warn "No such backup number."; continue; }

    # STDOUT ONLY path
    printf "%s" "$file"
    return 0
  done
}

show_manifest_preview() {
  local file="$1"
  ui ""
  ui "---- Manifest preview ----"
  if unzip -p "$file" "__MANIFEST__.txt" >/dev/null 2>&1; then
    unzip -p "$file" "__MANIFEST__.txt" 2>/dev/null | head -n 12 | sed 's/^/  /' >&2
  else
    ui "  (no __MANIFEST__.txt in archive)"
  fi
  ui "--------------------------"
}

# -----------------------------------------------------------------------------
# Create backup
# -----------------------------------------------------------------------------

backup_filename() {
  local hash=""
  if have_git_repo; then
    hash="$(git rev-parse --short HEAD 2>/dev/null || true)"
  fi
  local ts; ts="$(ts_now)"
  if [ -n "$hash" ]; then
    echo "${PROJECT_NAME}_${ts}_${hash}.zip"
  else
    echo "${PROJECT_NAME}_${ts}.zip"
  fi
}

create_backup() {
  require_zip_tools

  local zip_name zip_path
  zip_name="$(backup_filename)"
  zip_path="${BACKUP_DIR}/${zip_name}"

  say "Creating backup:"
  ui "  project root: $PROJECT_ROOT"
  ui "  -> $zip_path"

  local manifest_tmp manifest_name
  manifest_tmp="$(make_manifest_file)"
  manifest_name="__MANIFEST__.txt"

  # Put manifest in project root temporarily so it's guaranteed to be included
  cp "$manifest_tmp" "./$manifest_name"

  local exargs=()
  local ex
  for ex in "${EXCLUDES[@]}"; do
    exargs+=("-x" "$ex")
  done

  spinner_run "Creating ZIP backup..." zip -qr "$zip_path" . "${exargs[@]}"
  rm -f "./$manifest_name" "$manifest_tmp"

  if zip_has_manifest "$zip_path"; then
    say "Backup created successfully (manifest included)."
  else
    warn "Backup created but manifest not found inside zip."
    warn "Make sure you run this script from the project root (it auto-cd's to script folder)."
  fi
}

# -----------------------------------------------------------------------------
# Verify backup
# -----------------------------------------------------------------------------

verify_backup() {
  require_zip_tools
  say "Verify backup: choose archive"
  local file
  file="$(pick_backup)" || return 0

  ui ""
  ui "Selected:"
  ui "  -> $file"

  spinner_run "Verifying ZIP integrity (unzip -t)..." unzip -t "$file"
  show_manifest_preview "$file"

  ui ""
  ui "Press Enter to return to menu..."
  IFS= read -r _ || true
  return 0
}

# -----------------------------------------------------------------------------
# Restore
# -----------------------------------------------------------------------------

list_backup_contents() {
  require_zip_tools
  local file="$1"
  say "Archive contents (top):"
  unzip -Z1 "$file" 2>/dev/null | head -n 120 | sed 's/^/  /' >&2 || true
  local total
  total="$(unzip -Z1 "$file" 2>/dev/null | wc -l | tr -d ' ' || echo 0)"
  if [ "${total:-0}" -gt 120 ]; then
    ui "  ... (${total} total entries)"
  fi
}

restore_all() {
  require_zip_tools
  local file="$1"
  file="$(trim_cr "$file")"

  local base dest
  base="$(basename "$file" .zip)"
  dest="${RESTORE_DIR}/${base}"

  if [ -e "$dest" ]; then
    warn "Restore destination already exists:"
    ui "  -> $dest"
    printf "Delete it and restore again? (y/N): " >&2
    IFS= read -r ans || ans=""
    ans="$(echo "$(trim_cr "$ans")" | tr '[:upper:]' '[:lower:]')"
    if [ "$ans" = "y" ]; then
      rm -rf "$dest"
    else
      say "Restore cancelled."
      return 0
    fi
  fi

  mkdir -p "$dest"

  local file_abs dest_abs
  file_abs="$(abs_path "$file")"
  dest_abs="$(abs_path "$dest")"

  say "Restoring FULL backup:"
  ui "  from: $file_abs"
  ui "  to:   $dest_abs"

  # Most compatible: cd into dest and unzip there
  spinner_run "Extracting archive..." bash -c "cd \"${dest_abs}\" && unzip -o \"${file_abs}\""

  # Count extracted files
  local files_count
  files_count="$(find "$dest_abs" -type f 2>/dev/null | wc -l | tr -d ' ')"
  ui ""
  ui "Extracted files: $files_count"

  if [ "${files_count:-0}" -eq 0 ]; then
    warn "Destination is empty after unzip."
    warn "Showing archive contents (top) to confirm archive has files:"
    unzip -Z1 "$file_abs" 2>/dev/null | head -n 80 | sed 's/^/  /' >&2 || true
    warn "If files are listed above, unzip extraction is failing in your environment."
    warn "Try 'percent mode' restore (slower) OR we can add a 7-Zip fallback."
  else
    ui "Restore result (top):"
    ls -la "$dest_abs" | sed 's/^/  /' >&2 || true
    say "Restore complete."
    ui "Restored folder: $dest_abs"
  fi
}

restore_all_with_percent() {
  require_zip_tools
  local file="$1"
  file="$(trim_cr "$file")"

  local base dest
  base="$(basename "$file" .zip)"
  dest="${RESTORE_DIR}/${base}__percent"

  if [ -e "$dest" ]; then
    warn "Destination exists: $dest"
    printf "Delete and restore? (y/N): " >&2
    IFS= read -r ans || ans=""
    ans="$(echo "$(trim_cr "$ans")" | tr '[:upper:]' '[:lower:]')"
    [ "$ans" = "y" ] || { say "Cancelled."; return 0; }
    rm -rf "$dest"
  fi
  mkdir -p "$dest"

  local file_abs dest_abs
  file_abs="$(abs_path "$file")"
  dest_abs="$(abs_path "$dest")"

  say "Restoring with percent (file-by-file, slower):"
  ui "  from: $file_abs"
  ui "  to:   $dest_abs"

  local list_file="${RESTORE_DIR}/.all_$$.txt"
  unzip -Z1 "$file_abs" > "$list_file" 2>/dev/null || true

  local total
  total="$(wc -l < "$list_file" | tr -d ' ' || echo 0)"
  [ "${total:-0}" -gt 0 ] || { rm -f "$list_file"; warn "Archive list is empty?"; return 0; }

  local n=0
  while IFS= read -r item; do
    item="$(trim_cr "$item")"
    n=$((n+1))
    local pct=$(( (n*100)/total ))
    printf "\rProgress: %3d%%  (%d/%d) " "$pct" "$n" "$total" >&2
    ( cd "$dest_abs" && unzip -o "$file_abs" "$item" >/dev/null 2>&1 ) || true
  done < "$list_file"

  printf "\n" >&2
  rm -f "$list_file"

  local files_count
  files_count="$(find "$dest_abs" -type f 2>/dev/null | wc -l | tr -d ' ')"
  say "Percent restore done. Extracted files: $files_count"
  ui "Restored folder: $dest_abs"
}

restore_menu() {
  require_zip_tools

  say "Restore: choose archive"
  local file
  file="$(pick_backup)" || return 0

  show_manifest_preview "$file"

  while true; do
    ui ""
    ui "==== Restore Menu ===="
    ui "Selected backup: $file"
    ui "1) Restore FULL into _restore/"
    ui "2) Restore FULL (percent, slow)"
    ui "3) Show archive contents (top)"
    ui "4) Show FULL manifest"
    ui "5) Choose another backup"
    ui "6) Back"
    printf "Choose (1-6): " >&2
    IFS= read -r ch || ch=""
    ch="$(trim_cr "$ch")"
    case "$ch" in
      1) restore_all "$file" ;;
      2) restore_all_with_percent "$file" ;;
      3) list_backup_contents "$file" ;;
      4)
        ui ""
        ui "---- Manifest (full) ----"
        if unzip -p "$file" "__MANIFEST__.txt" >/dev/null 2>&1; then
          unzip -p "$file" "__MANIFEST__.txt" 2>/dev/null | sed 's/^/  /' >&2
        else
          ui "  (no __MANIFEST__.txt in archive)"
        fi
        ui "-------------------------"
        ;;
      5)
        file="$(pick_backup)" || return 0
        show_manifest_preview "$file"
        ;;
      6) return 0 ;;
      *) warn "Unknown option. Choose 1-6." ;;
    esac
  done
}

# -----------------------------------------------------------------------------
# Git helpers (optional)
# -----------------------------------------------------------------------------

ensure_gitignore() {
  [ -f .gitignore ] && return 0
  say "Creating .gitignore"
  cat > .gitignore <<'EOF'
node_modules/
dist/
build/
_backups/
_restore/
.DS_Store
Thumbs.db
*.log
.env
EOF
}

git_init_and_initial_commit() {
  have_cmd git || die "git is not installed."
  if [ -d .git ]; then
    warn "This folder already has .git. Skipping init."
    return 0
  fi

  say "Initializing git repository..."
  git init
  git branch -M main >/dev/null 2>&1 || true

  ensure_gitignore

  say "Creating initial commit..."
  git add -A
  if git diff --cached --quiet; then
    warn "Nothing to commit."
  else
    git commit -m "chore: initial snapshot" || true
  fi

  say "Git repo initialized."
  git status -sb || true
}

git_push_origin() {
  have_cmd git || die "git is not installed."
  have_git_repo || die "Not a git repository. Use option 6 first."

  local branch
  branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")"

  if ! git remote get-url origin >/dev/null 2>&1; then
    warn "Remote 'origin' is not set."
    printf "Enter remote URL to add as origin (empty = cancel): " >&2
    IFS= read -r url || url=""
    url="$(trim_cr "$url")"
    [ -n "$url" ] || { say "Push cancelled."; return 0; }
    git remote add origin "$url"
    say "Origin set."
  fi

  spinner_run "git push..." git push -u origin "$branch" --follow-tags
  say "Push done."
}

# -----------------------------------------------------------------------------
# Auto smoke test (no Enter)
# -----------------------------------------------------------------------------

smoke_test_auto() {
  say "Auto smoke test (project scan):"

  local ok=1
  local root
  root="$(pwd)"

  # --- A) Baseline checks ----------------------------------------------------
  echo "== Baseline =="
  if [ -f "index.html" ]; then echo "  [OK] index.html"; else echo "  [FAIL] index.html missing"; ok=0; fi
  if [ -d "js" ]; then echo "  [OK] js/"; else echo "  [FAIL] js/ missing"; ok=0; fi
  if [ -d "styles" ]; then echo "  [OK] styles/"; else echo "  [WARN] styles/ missing"; fi
  if [ -f "js/version.js" ]; then echo "  [OK] js/version.js"; else echo "  [WARN] js/version.js missing"; fi

  # --- B) Pick file map source ----------------------------------------------
  local map=""
  if [ -f "__filemap_current.tmp" ]; then
    map="__filemap_current.tmp"
  elif [ -f "FILEMAP.md" ]; then
    map="FILEMAP.md"
  else
    map=""
  fi

  # --- C) Build expected list from map --------------------------------------
  local expected="${RESTORE_DIR}/._expected_$$.txt"
  local actual="${RESTORE_DIR}/._actual_$$.txt"
  local missing="${RESTORE_DIR}/._missing_$$.txt"
  local extra="${RESTORE_DIR}/._extra_$$.txt"

  : > "$expected"
  : > "$actual"
  : > "$missing"
  : > "$extra"

  echo ""
  echo "== File map =="
  if [ -n "$map" ]; then
    echo "  Using map: $map"

    if [ "$map" = "__filemap_current.tmp" ]; then
      # формат: строки путей (как у тебя)
      # выкидываем пустые, нормализуем слэши
      sed 's/\r$//' "$map" | sed '/^\s*$/d' | sed 's#\\#/#g' > "$expected"
    else
      # FILEMAP.md: берём строки, похожие на пути: содержат / или \
      # и не начинаются с '#'
      grep -v '^\s*#' "$map" | sed 's/\r$//' | sed '/^\s*$/d' | \
        grep -E '[/\\]' | sed 's#\\#/#g' > "$expected"
    fi

    # Убираем дубли
    sort -u "$expected" -o "$expected" 2>/dev/null || true

    local expCount
    expCount="$(wc -l < "$expected" | tr -d ' ')"
    echo "  Expected entries: $expCount"
  else
    echo "  [WARN] No __filemap_current.tmp or FILEMAP.md found -> skipping full file scan."
  fi

  # --- D) Build actual file list --------------------------------------------
  echo ""
  echo "== Scan actual files (excluding heavy dirs) =="
  # исключаем то, что не должно попадать в карту
  find . -type f \
    ! -path "./.git/*" \
    ! -path "./node_modules/*" \
    ! -path "./${BACKUP_DIR}/*" \
    ! -path "./${RESTORE_DIR}/*" \
    ! -path "./_release/*" \
    ! -name "*.zip" \
    ! -name "*.log" \
    | sed 's#^\./##' | sort > "$actual"

  local actCount
  actCount="$(wc -l < "$actual" | tr -d ' ')"
  echo "  Actual files: $actCount"

  # --- E) Compare expected vs actual ----------------------------------------
  if [ -n "$map" ]; then
    echo ""
    echo "== Compare =="
    # missing: expected - actual
    comm -23 "$expected" "$actual" > "$missing" 2>/dev/null || true
    # extra: actual - expected
    comm -13 "$expected" "$actual" > "$extra" 2>/dev/null || true

    local mCount eCount
    mCount="$(wc -l < "$missing" | tr -d ' ')"
    eCount="$(wc -l < "$extra" | tr -d ' ')"

    if [ "$mCount" -eq 0 ]; then
      echo "  [OK] Missing files: 0"
    else
      echo "  [FAIL] Missing files: $mCount"
      ok=0
      echo "  --- Missing (top 50) ---"
      head -n 50 "$missing" | sed 's/^/  /'
      [ "$mCount" -gt 50 ] && echo "  ... (+$((mCount-50)) more)"
    fi

    if [ "$eCount" -eq 0 ]; then
      echo "  [OK] Extra files: 0"
    else
      echo "  [WARN] Extra files not in map: $eCount"
      echo "  --- Extra (top 50) ---"
      head -n 50 "$extra" | sed 's/^/  /'
      [ "$eCount" -gt 50 ] && echo "  ... (+$((eCount-50)) more)"
    fi
  fi

  # --- F) Import sanity check (lightweight) ----------------------------------
  # Проверяем только относительные импорты с .js: import ... from "../x.js"
  echo ""
  echo "== Import sanity (light) =="
  local impBad=0
  local impList="${RESTORE_DIR}/._imports_$$.txt"
  : > "$impList"

  # Сканируем js/**/*.js
  find js -type f -name "*.js" 2>/dev/null | while IFS= read -r f; do
    # вытаскиваем строки import ... "./something.js"
    # поддержка: from "..." и import("...")
    grep -Eo 'from\s+"[^"]+\.js"|from\s+'\''[^'\'']+\.js'\''|import\(\s*"[^"]+\.js"\s*\)|import\(\s+'\''[^'\'']+\.js'\''\s*\)' "$f" 2>/dev/null \
      | sed -E 's/.*"([^"]+\.js)".*/\1/; s/.*'\''([^'\'']+\.js)'\''.*/\1/' \
      | while IFS= read -r p; do
          echo "$f|$p" >> "$impList"
        done
  done

  if [ -s "$impList" ]; then
    while IFS='|' read -r src rel; do
      # только относительные пути
      case "$rel" in
        ./*|../*)
          local dir target
          dir="$(dirname "$src")"
          target="$dir/$rel"
          # нормализация ../ и ./
          target="$(cd "$dir" 2>/dev/null && cd "$(dirname "$rel")" 2>/dev/null && pwd -P)/$(basename "$rel")" 2>/dev/null || echo ""
          if [ -z "$target" ] || [ ! -f "$target" ]; then
            impBad=$((impBad+1))
            echo "  [FAIL] $src imports missing: $rel"
          fi
        ;;
      esac
    done < "$impList"
  else
    echo "  (no imports found or scan skipped)"
  fi

  if [ "$impBad" -eq 0 ]; then
    echo "  [OK] Import sanity: OK"
  else
    echo "  [FAIL] Import sanity: $impBad broken imports"
    ok=0
  fi

  # --- G) zip/unzip smoke ----------------------------------------------------
  echo ""
  echo "== zip/unzip tools =="
  if have_cmd zip && have_cmd unzip; then
    echo "  [OK] zip + unzip available"
  else
    echo "  [FAIL] zip/unzip missing"
    ok=0
  fi

  # cleanup
  rm -f "$expected" "$actual" "$missing" "$extra" "$impList" 2>/dev/null || true

  echo ""
  if [ "$ok" = "1" ]; then
    say "Smoke test: PASSED"
  else
    warn "Smoke test: FAILED (see output above)"
  fi
}

# -----------------------------------------------------------------------------
# Help
# -----------------------------------------------------------------------------

help_ru() {
  cat <<'EOF' >&2

================= СПРАВКА (RU) =================
1) Create backup
   Делает ZIP в _backups/ и добавляет __MANIFEST__.txt внутрь архива.

2) Verify backup
   Сразу показывает список бэкапов, выбираешь номером.
   Делает unzip -t с индикацией (спиннер + время), затем показывает манифест.

3) List backups
   Список архивов в _backups/ (новые сверху).

4) Restore backup
   Сразу список → выбор по номеру → подменю.
   Распаковка идёт в _restore/<backupName>/ (текущий проект НЕ трогает).
   Есть режим с процентами (медленнее).

8) Smoke test
   Авто-проверка структуры проекта и работы zip/unzip (без Enter).
================================================

EOF
}

help_en() {
  cat <<'EOF' >&2

================= HELP (EN) =====================
1) Create backup
   Creates ZIP in _backups/ and includes __MANIFEST__.txt.

2) Verify backup
   Shows backup list first, choose by number.
   Runs unzip -t with progress (spinner + time), then shows manifest.

3) List backups
   Lists archives in _backups/ (newest first).

4) Restore backup
   List → choose → submenu.
   Extracts into _restore/<backupName>/ (does NOT overwrite current project).
   Has percent mode (slower).

8) Smoke test
   Automatic checks for key files and zip/unzip (no Enter).
=================================================

EOF
}

help_de() {
  cat <<'EOF' >&2

================= HILFE (DE) =====================
1) Create backup
   Erstellt ZIP in _backups/ und enthält __MANIFEST__.txt.

2) Verify backup
   Zeigt zuerst Backups, Auswahl per Nummer.
   unzip -t mit Anzeige (Spinner + Zeit), danach Manifest.

3) List backups
   Listet Archive in _backups/ (neueste zuerst).

4) Restore backup
   Liste → Auswahl → Untermenü.
   Entpackt nach _restore/<backupName>/ (überschreibt Projekt NICHT).
   Prozent-Modus vorhanden (langsamer).

8) Smoke test
   Automatische Checks für Dateien und zip/unzip (ohne Enter).
==================================================

EOF
}

show_help() {
  ui ""
  ui "Help / Hilfe / Справка"
  ui "Choose language: 1) RU  2) EN  3) DE  (Enter = EN)"
  printf "Lang (1-3): " >&2
  IFS= read -r lang || lang=""
  lang="$(trim_cr "$lang")"
  case "$lang" in
    1) help_ru ;;
    3) help_de ;;
    ""|2) help_en ;;
    *) help_en ;;
  esac
  printf "Press Enter to return to menu..." >&2
  IFS= read -r _ || true
}

menu() {
  cat <<'EOF' >&2

==== LingoCard Backup Menu ====
1) Create backup
2) Verify backup
3) List backups
4) Restore backup (submenu)
5) Exit
6) Init git repo + initial commit
7) Push to remote (origin + tags)
8) Smoke test (auto)
H) Help (F1)
EOF
}

main() {
  while true; do
    menu
    printf "Choose an option (1-8, H): " >&2
    IFS= read -r choice || true
    choice="$(trim_cr "$choice")"

    # F1 escape sequences (best-effort)
    if [ "$choice" = $'\eOP' ] || [ "$choice" = $'\e[11~' ]; then
      show_help
      continue
    fi

    local choice_lc
    choice_lc="$(echo "$choice" | tr '[:upper:]' '[:lower:]')"

    case "$choice_lc" in
      1) create_backup ;;
      2) verify_backup || true ;;
      3) list_backups || true ;;
      4) restore_menu || true ;;
      5) say "Bye."; exit 0 ;;
      6) git_init_and_initial_commit ;;
      7) git_push_origin ;;
      8) smoke_test_auto || true ;;
      h|help|\?) show_help ;;
      *) warn "Unknown option. Please choose 1-8 or H." ;;
    esac
  done
}

main
