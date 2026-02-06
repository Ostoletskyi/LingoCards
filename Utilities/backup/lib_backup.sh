#!/usr/bin/env bash
set -e
( set -o pipefail ) 2>/dev/null && set -o pipefail || true

# -----------------------------------------------------------------------------
# Shared helpers for Utilities/backup
# -----------------------------------------------------------------------------

BACKUP_DIR="${BACKUP_DIR:-_backups}"
RESTORE_DIR="${RESTORE_DIR:-_restore}"
PROJECT_NAME="${PROJECT_NAME:-lingocard-next}"

# UI output -> STDERR
ui()   { printf "%s\n" "$*" >&2; }
say()  { ui ""; ui "$*"; }
warn() { ui ""; ui "[WARN] $*"; }
die()  { ui ""; ui "[ERROR] $*"; exit 1; }

trim_cr() { printf "%s" "${1%$'\r'}"; }

have_cmd() { command -v "$1" >/dev/null 2>&1; }

require_zip_tools() {
  have_cmd zip   || die "zip is not installed or not in PATH."
  have_cmd unzip || die "unzip is not installed or not in PATH."
}

have_git_repo() {
  have_cmd git && git rev-parse --is-inside-work-tree >/dev/null 2>&1
}

ts_now() { date +"%Y-%m-%d_%H-%M-%S"; }

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

abs_path() {
  local p; p="$(trim_cr "$1")"
  if [ -d "$p" ]; then (cd "$p" && pwd -P); return; fi
  local d b
  d="$(dirname "$p")"; b="$(basename "$p")"
  (cd "$d" 2>/dev/null && printf "%s/%s" "$(pwd -P)" "$b") || printf "%s" "$p"
}

spinner_run() {
  # spinner_run "Message..." command arg...
  local msg="$1"; shift
  local tmp="${RESTORE_DIR}/._cmd_$$.log"
  local start_ts end_ts elapsed
  start_ts="$(date +%s 2>/dev/null || echo 0)"

  ( "$@" ) >"$tmp" 2>&1 &
  local pid=$!

  local spin='|/-\\'
  local i=0

  ui ""
  printf "%s " "$msg" >&2
  while kill -0 "$pid" 2>/dev/null; do
    i=$(( (i + 1) % 4 ))
    printf "\b%s" "${spin:$i:1}" >&2
    sleep 0.12
  done

  wait "$pid"; local rc=$?

  end_ts="$(date +%s 2>/dev/null || echo 0)"
  if [ "$start_ts" != "0" ] && [ "$end_ts" != "0" ]; then elapsed=$(( end_ts - start_ts )); else elapsed="?"; fi

  if [ $rc -eq 0 ]; then
    printf "\bOK (%ss)\n" "$elapsed" >&2
  else
    printf "\bFAILED (%ss, code=%s)\n" "$elapsed" "$rc" >&2
    ui "---- command output (tail) ----"
    sed 's/^/  /' "$tmp" | tail -n 80 >&2
    ui "-------------------------------"
  fi
  rm -f "$tmp"
  return $rc
}

# -----------------------------------------------------------------------------
# Manifest helpers
# -----------------------------------------------------------------------------

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
  local z="$1" note
  note="$(zip_manifest_get "$z" "note")"
  [ -z "$note" ] && note="$(zip_manifest_get "$z" "message")"
  echo "$note" | sed -E 's/[[:space:]]+/ /g' | cut -c1-44
}

make_manifest_file() {
  mkdir -p "$RESTORE_DIR" "$BACKUP_DIR"

  local manifest_path="${RESTORE_DIR}/.__MANIFEST__.$$.$RANDOM.txt"
  local root; root="$(pwd -P)"

  local branch="unknown" commit="unknown" commit_short=""
  local tag="dev" build
  build="$(date -Iseconds 2>/dev/null || date)"

  if have_git_repo; then
    branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
    commit="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
    commit_short="$(git rev-parse --short HEAD 2>/dev/null || true)"
  fi

  # Best-effort: read js/version.js
  if [ -f "js/version.js" ]; then
    local t b c
    t="$(grep -E 'tag:\s*"' js/version.js 2>/dev/null | head -n1 | sed -E 's/.*tag:\s*"([^"]+)".*/\1/')"
    b="$(grep -E 'build:\s*"' js/version.js 2>/dev/null | head -n1 | sed -E 's/.*build:\s*"([^"]+)".*/\1/')"
    c="$(grep -E 'commit:\s*"' js/version.js 2>/dev/null | head -n1 | sed -E 's/.*commit:\s*"([^"]+)".*/\1/')"
    [ -n "$t" ] && tag="$t"
    [ -n "$b" ] && build="$b"
    if [ -n "$c" ]; then
      commit="$c"; commit_short="$(echo "$c" | cut -c1-8)"
    fi
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
    echo "note=Backup created by Utilities/backup"
  } > "$manifest_path"

  printf "%s" "$manifest_path"
}

# -----------------------------------------------------------------------------
# Backup list / picker
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
    f="$(trim_cr "$f")"
    [ -z "$f" ] && continue
    i=$((i+1))

    local base bytes size tag commit note
    base="$(basename "$f")"
    bytes="$(zip_bytes "$f")"
    size="$(human_size "$bytes")"

    if zip_has_manifest "$f"; then
      tag="$(zip_manifest_tag "$f")"; [ -z "$tag" ] && tag="no-tag"
      commit="$(zip_manifest_commit "$f")"; [ -z "$commit" ] && commit="--------"
      note="$(zip_manifest_note_short "$f")"
    else
      tag="no-manifest"; commit="--------"; note=""
    fi

    printf "%2d. %-45s %8s  %-18s %-8s  %s\n" "$i" "$base" "$size" "$tag" "$commit" "$note" >&2
  done <<< "$files"

  return 0
}

pick_backup() {
  if ! list_backups; then
    warn "No backups found. Create one first."
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

    printf "%s" "$file"
    return 0
  done
}

show_manifest_preview() {
  local file="$1"
  ui ""
  ui "---- Manifest preview ----"
  if unzip -p "$file" "__MANIFEST__.txt" >/dev/null 2>&1; then
    unzip -p "$file" "__MANIFEST__.txt" 2>/dev/null | head -n 14 | sed 's/^/  /' >&2
  else
    ui "  (no __MANIFEST__.txt in archive)"
  fi
  ui "--------------------------"
}

# -----------------------------------------------------------------------------
# Backup create/verify/restore/prune
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
  mkdir -p "$BACKUP_DIR" "$RESTORE_DIR"

  local zip_name zip_path
  zip_name="$(backup_filename)"
  zip_path="${BACKUP_DIR}/${zip_name}"

  say "Creating backup:"
  ui "  -> $zip_path"

  local manifest_tmp manifest_name
  manifest_tmp="$(make_manifest_file)"
  manifest_name="__MANIFEST__.txt"
  cp "$manifest_tmp" "./$manifest_name"

  local exargs=(
    "-x" ".git/*"
    "-x" "node_modules/*"
    "-x" "${BACKUP_DIR}/*"
    "-x" "${RESTORE_DIR}/*"
    "-x" "_release/*"
    "-x" "*.zip"
    "-x" "*.log"
    "-x" ".DS_Store"
    "-x" "Thumbs.db"
  )

  spinner_run "Creating ZIP backup..." zip -qr "$zip_path" . "${exargs[@]}"

  rm -f "./$manifest_name" "$manifest_tmp"

  if zip_has_manifest "$zip_path"; then
    say "Backup created successfully (manifest included)."
  else
    warn "Backup created but manifest not found inside zip."
  fi
}

verify_backup() {
  require_zip_tools
  say "Verify backup: choose archive"
  local file
  file="$(pick_backup)" || return 0

  ui ""; ui "Selected: $file"
  spinner_run "Verifying ZIP integrity (unzip -t)..." unzip -t "$file"
  show_manifest_preview "$file"

  ui ""; ui "Press Enter to return..."
  IFS= read -r _ || true
}

restore_full() {
  require_zip_tools
  local file="$1"
  file="$(trim_cr "$file")"

  local base dest
  base="$(basename "$file" .zip)"
  dest="${RESTORE_DIR}/${base}"

  if [ -e "$dest" ]; then
    warn "Restore destination exists: $dest"
    printf "Delete and restore again? (y/N): " >&2
    IFS= read -r ans || ans=""
    ans="$(echo "$(trim_cr "$ans")" | tr '[:upper:]' '[:lower:]')"
    [ "$ans" = "y" ] || { say "Restore cancelled."; return 0; }
    rm -rf "$dest"
  fi

  mkdir -p "$dest"

  local file_abs dest_abs
  file_abs="$(abs_path "$file")"
  dest_abs="$(abs_path "$dest")"

  say "Restoring FULL backup:"
  ui "  from: $file_abs"
  ui "  to:   $dest_abs"

  spinner_run "Extracting archive..." bash -c "cd \"${dest_abs}\" && unzip -o \"${file_abs}\""

  local files_count
  files_count="$(find "$dest_abs" -type f 2>/dev/null | wc -l | tr -d ' ')"
  ui ""; ui "Extracted files: $files_count"
  ui "Restored folder: $dest_abs"
}

restore_percent() {
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

  say "Restoring with percent (slower):"
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
  ui ""; ui "Extracted files: $files_count"
  ui "Restored folder: $dest_abs"
}

list_backup_contents() {
  require_zip_tools
  local file="$1"
  say "Archive contents (top):"
  unzip -Z1 "$file" 2>/dev/null | head -n 120 | sed 's/^/  /' >&2 || true
  local total
  total="$(unzip -Z1 "$file" 2>/dev/null | wc -l | tr -d ' ' || echo 0)"
  if [ "${total:-0}" -gt 120 ]; then ui "  ... (${total} total entries)"; fi
}

prune_backups_keep() {
  # prune_backups_keep 20
  local keep="$1"
  mkdir -p "$BACKUP_DIR"
  echo "$keep" | grep -Eq '^[0-9]+$' || { warn "Keep must be number."; return 0; }

  local files
  files="$(ls -1t "${BACKUP_DIR}"/*.zip 2>/dev/null || true)"
  [ -z "$files" ] && { warn "No backups to prune."; return 0; }

  local total
  total="$(echo "$files" | wc -l | tr -d ' ')"
  if [ "$total" -le "$keep" ]; then
    say "Prune: nothing to delete (total=$total, keep=$keep)."
    return 0
  fi

  say "Prune backups: keeping newest $keep of $total"
  local to_delete
  to_delete="$(echo "$files" | tail -n +$((keep+1)))"

  ui "Will delete:"; echo "$to_delete" | sed 's/^/  /' >&2
  printf "Proceed? (y/N): " >&2
  IFS= read -r ans || ans=""
  ans="$(echo "$(trim_cr "$ans")" | tr '[:upper:]' '[:lower:]')"
  [ "$ans" = "y" ] || { say "Cancelled."; return 0; }

  while IFS= read -r f; do
    f="$(trim_cr "$f")"; [ -z "$f" ] && continue
    rm -f "$f"
  done <<< "$to_delete"

  say "Prune done."
}
