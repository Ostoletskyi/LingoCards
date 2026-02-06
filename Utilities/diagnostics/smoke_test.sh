#!/usr/bin/env bash
set -u
( set -o pipefail ) 2>/dev/null && set -o pipefail || true

# -----------------------------------------------------------------------------
# Smoke test (Normal / Full / Paranoid)
#
# Philosophy:
# - NORMAL: fast, most useful checks, skips heavy folders.
# - FULL: deep scan of project (still skips truly heavy folders by default).
# - PARANOID: scans *everything* (including node_modules) and tries hard to find
#   broken references. Allows cancel (Ctrl+C).
#
# Notes:
# - UI output -> STDERR (so it plays nice in menus/pipes)
# - Exit code 0 = pass, 1 = fail, 130 = cancelled
# -----------------------------------------------------------------------------

# Resolve project root (two levels up from Utilities/diagnostics)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd -P)"
cd "$PROJECT_ROOT" || exit 1

ui()   { printf "%s\n" "$*" >&2; }
say()  { ui ""; ui "$*"; }
warn() { ui "[WARN] $*"; }
fail() { ui "[FAIL] $*"; }

# --------------------------- timers ------------------------------------------
_now_s() { date +%s 2>/dev/null || echo 0; }
_now_ms() {
  # GNU date supports %3N, MSYS2 does too; fallback to seconds*1000
  local ms
  ms="$(date +%s%3N 2>/dev/null || true)"
  if [ -n "$ms" ] && echo "$ms" | grep -Eq '^[0-9]+$'; then echo "$ms"; return; fi
  local s; s="$(_now_s)"
  echo "$((s*1000))"
}
fmt_ms() {
  local ms="$1"
  if ! echo "$ms" | grep -Eq '^[0-9]+$'; then echo "?"; return; fi
  if [ "$ms" -lt 1000 ]; then echo "${ms}ms"; return; fi
  local s=$((ms/1000))
  local r=$((ms%1000))
  printf "%ss %03dms" "$s" "$r"
}
t_start=0
t_mark() { t_start="$(_now_ms)"; }
t_end() {
  local end; end="$(_now_ms)"
  local dur=$((end - t_start))
  echo "$dur"
}

# --------------------------- mode selection ----------------------------------
MODE="${1:-${SMOKE_MODE:-}}"

choose_mode() {
  ui ""
  ui "Smoke test mode:"
  ui "  1) Normal      (fast, most useful checks)"
  ui "  2) Full        (deep scan, slower)"
  ui "  3) Paranoid    (everything + can cancel, slowest)"
  printf "Choose (1-3, Enter=2): " >&2
  local ch=""
  IFS= read -r ch || ch=""
  ch="${ch%$'\r'}"
  case "$ch" in
    1) MODE="normal" ;;
    3) MODE="paranoid" ;;
    ""|2) MODE="full" ;;
    *) MODE="full" ;;
  esac
}

case "${MODE,,}" in
  normal|full|paranoid) ;;
  "") choose_mode ;;
  1) MODE="normal" ;;
  2) MODE="full" ;;
  3) MODE="paranoid" ;;
  *) MODE="full" ;;
esac

# --------------------------- cancel handling ---------------------------------
CANCELLED=0
on_int() { CANCELLED=1; }
if [ "$MODE" = "paranoid" ]; then
  trap on_int INT
fi
check_cancel() {
  if [ "$CANCELLED" = "1" ]; then
    ui ""
    warn "Cancelled by user (Ctrl+C)."
    exit 130
  fi
}

# --------------------------- excludes ----------------------------------------
# NORMAL / FULL skip heavy dirs. PARANOID scans almost all.
EXCLUDES_NORMAL=(
  "./.git/*"
  "./node_modules/*"
  "./_backups/*"
  "./_restore/*"
  "./dist/*"
  "./build/*"
  "./.cache/*"
  "./.next/*"
  "./out/*"
  "./coverage/*"
)
EXCLUDES_FULL=("${EXCLUDES_NORMAL[@]}")
EXCLUDES_PARANOID=(
  "./_backups/*"
  "./_restore/*"
)

# returns find args for -not -path
find_excludes_args() {
  local mode="$1"
  local -a ex
  case "$mode" in
    normal) ex=("${EXCLUDES_NORMAL[@]}") ;;
    full)   ex=("${EXCLUDES_FULL[@]}") ;;
    *)      ex=("${EXCLUDES_PARANOID[@]}") ;;
  esac
  local -a args=()
  for p in "${ex[@]}"; do
    args+=("!" "-path" "$p")
  done
  printf "%s\0" "${args[@]}"
}

# --------------------------- helpers -----------------------------------------
trim_cr() { printf "%s" "${1%$'\r'}"; }

strip_query_hash() {
  # strip ?query and #hash for path resolution
  local s="$1"
  s="${s%%\?*}"
  s="${s%%\#*}"
  printf "%s" "$s"
}

is_relative() {
  case "$1" in
    ./*|../*) return 0 ;;
    *) return 1 ;;
  esac
}

exists_rel() {
  # checks existence of a path relative to a base dir; tries common extensions
  local base="$1" rel="$2"
  rel="$(strip_query_hash "$rel")"
  [ -z "$rel" ] && return 1

  local target="$base/$rel"
  # normalize (best-effort)
  local dir; dir="$(dirname "$target")"
  local name; name="$(basename "$target")"

  # If rel contains backslashes (Windows), normalize
  target="$(printf "%s" "$target" | sed 's#\\#/#g')"

  if [ -f "$target" ] || [ -d "$target" ]; then return 0; fi

  # If no extension: try common
  if ! echo "$name" | grep -q '\.'; then
    for ext in .js .mjs .cjs .json .css .html .svg .png .jpg .jpeg .webp; do
      if [ -f "${target}${ext}" ]; then return 0; fi
    done
  fi

  # If ends with / : try index.*
  if echo "$target" | grep -q '/$'; then
    for ext in index.html index.js index.mjs index.json; do
      if [ -f "${target}${ext}" ]; then return 0; fi
    done
  fi

  return 1
}

# --------------------------- scan lists --------------------------------------
mktemp_dir() {
  mkdir -p "_restore" 2>/dev/null || true
  local d="_restore/.smoke_$$"
  rm -rf "$d" 2>/dev/null || true
  mkdir -p "$d"
  printf "%s" "$d"
}

TMP_DIR="$(mktemp_dir)"
cleanup() { rm -rf "$TMP_DIR" 2>/dev/null || true; }
trap cleanup EXIT

OK=1

# -----------------------------------------------------------------------------
# A) Baseline
# -----------------------------------------------------------------------------
say "== Smoke test =="
ui "Mode: ${MODE}"

t_mark
[ -f "index.html" ] && ui "[OK] index.html" || { fail "index.html missing"; OK=0; }
[ -d "js" ] && ui "[OK] js/" || { fail "js/ folder missing"; OK=0; }
[ -d "Utilities" ] && ui "[OK] Utilities/" || { fail "Utilities/ folder missing"; OK=0; }

# show minimal baseline time
dur="$(t_end)"; ui "Baseline time: $(fmt_ms "$dur")"
check_cancel

# -----------------------------------------------------------------------------
# B) Build actual file list (mode-dependent)
# -----------------------------------------------------------------------------
say "== Scan files =="

t_mark
# Find args with excludes (NUL-delimited for safety)
# Using mapfile/readarray keeps all tokens; `read -d ''` would stop at first NUL.
mapfile -d '' -t EXARGS < <(find_excludes_args "$MODE")

# NORMAL scans only relevant types. FULL/PARANOID scans all files.
case "$MODE" in
  normal)
    find . -type f "${EXARGS[@]}" \
      \( -name "*.js" -o -name "*.mjs" -o -name "*.cjs" -o -name "*.html" -o -name "*.css" \) \
      | sed 's#^\./##' > "${TMP_DIR}/files.txt"
    ;;
  *)
    find . -type f "${EXARGS[@]}" \
      | sed 's#^\./##' > "${TMP_DIR}/files.txt"
    ;;
esac

# sort for stable operations
sort "${TMP_DIR}/files.txt" -o "${TMP_DIR}/files.txt" 2>/dev/null || true
FILES_TOTAL="$(wc -l < "${TMP_DIR}/files.txt" 2>/dev/null | tr -d ' ' || echo 0)"
dur="$(t_end)"; ui "Files scanned: ${FILES_TOTAL} (time: $(fmt_ms "$dur"))"
check_cancel

# -----------------------------------------------------------------------------
# C) FILEMAP compare (FULL + PARANOID only)
# -----------------------------------------------------------------------------
if [ "$MODE" != "normal" ]; then
  say "== FILEMAP compare (optional) =="

  t_mark
  # Prefer canonical FILEMAP.md. __filemap_current.tmp is legacy and often stale.
  MAP=""
  if [ -f "FILEMAP.md" ]; then
    MAP="FILEMAP.md"
  elif [ -f "__filemap_current.tmp" ]; then
    MAP="__filemap_current.tmp"
  fi

  if [ -z "$MAP" ]; then
    ui "(no FILEMAP found; skipping)"
  else
    ui "Using map: $MAP"
    # Build expected list
    if [ "$MAP" = "__filemap_current.tmp" ]; then
      sed 's/\r$//' "$MAP" | sed '/^\s*$/d' | sed 's#\\#/#g' | sed 's#^\./##' > "${TMP_DIR}/expected.txt"
    else
      # FILEMAP.md format: header lines + one path per line (may have no slashes).
      # Keep everything that looks like a path line.
      grep -vE '^\s*#|^\s*Generated:|^\s*Root:|^\s*##' "$MAP" \
        | sed 's/\r$//' | sed '/^\s*$/d' \
        | sed 's#\\#/#g' | sed 's#^\./##' > "${TMP_DIR}/expected.txt"
    fi
    sort -u "${TMP_DIR}/expected.txt" -o "${TMP_DIR}/expected.txt" 2>/dev/null || true
    sort -u "${TMP_DIR}/files.txt" -o "${TMP_DIR}/actual.txt" 2>/dev/null || true

    comm -23 "${TMP_DIR}/expected.txt" "${TMP_DIR}/actual.txt" > "${TMP_DIR}/missing.txt" 2>/dev/null || true
    comm -13 "${TMP_DIR}/expected.txt" "${TMP_DIR}/actual.txt" > "${TMP_DIR}/extra.txt" 2>/dev/null || true

    MCOUNT="$(wc -l < "${TMP_DIR}/missing.txt" 2>/dev/null | tr -d ' ' || echo 0)"
    ECOUNT="$(wc -l < "${TMP_DIR}/extra.txt" 2>/dev/null | tr -d ' ' || echo 0)"

    if [ "$MCOUNT" -eq 0 ]; then ui "[OK] Missing from disk: 0"; else
      fail "Missing from disk: $MCOUNT"; OK=0
      ui "  Missing (top 50):"
      head -n 50 "${TMP_DIR}/missing.txt" | sed 's/^/  /' >&2
      [ "$MCOUNT" -gt 50 ] && ui "  ... (+$((MCOUNT-50)) more)"
    fi

    if [ "$ECOUNT" -eq 0 ]; then ui "[OK] Extra not in map: 0"; else
      warn "Extra not in map: $ECOUNT"
      ui "  Extra (top 30):"
      head -n 30 "${TMP_DIR}/extra.txt" | sed 's/^/  /' >&2
      [ "$ECOUNT" -gt 30 ] && ui "  ... (+$((ECOUNT-30)) more)"
    fi
  fi

  dur="$(t_end)"; ui "FILEMAP time: $(fmt_ms "$dur")"
  check_cancel
fi

# -----------------------------------------------------------------------------
# D) Reference sanity: JS imports / require / dynamic import
# -----------------------------------------------------------------------------
say "== Reference sanity: JS imports =="

t_mark
BROKEN=0
CHECKED=0

# Only JS-like files
grep -E '\.(js|mjs|cjs)$' "${TMP_DIR}/files.txt" > "${TMP_DIR}/jsfiles.txt" 2>/dev/null || true
JS_TOTAL="$(wc -l < "${TMP_DIR}/jsfiles.txt" 2>/dev/null | tr -d ' ' || echo 0)"
ui "JS files: $JS_TOTAL"

# Patterns:
#  - from "..."
#  - import("...")
#  - require("...")
while IFS= read -r f; do
  check_cancel
  base="$(dirname "$f")"

  # grep can be slow on huge files; in paranoid we accept it
  # Extract candidates; avoid >1k chars lines
  # shellcheck disable=SC2002
  refs="$(grep -Eo 'from[[:space:]]+("[^"]+"|'\''[^'\'']+'\'')|import\([[:space:]]*("[^"]+"|'\''[^'\'']+'\'')[[:space:]]*\)|require\([[:space:]]*("[^"]+"|'\''[^'\'']+'\'')[[:space:]]*\)' "$f" 2>/dev/null | head -n 2000 || true)"

  [ -z "$refs" ] && continue

  while IFS= read -r line; do
    check_cancel
    # pull the quoted string
    p="$(printf "%s" "$line" | sed -E 's/.*"(.*)".*/\1/; s/.*'\''(.*)'\''.*/\1/')"
    p="$(trim_cr "$p")"
    [ -z "$p" ] && continue

    # relative only
    if is_relative "$p"; then
      CHECKED=$((CHECKED+1))
      if ! exists_rel "$base" "$p"; then
        BROKEN=$((BROKEN+1))
        OK=0
        ui "  [FAIL] $f -> $p"
      fi
    fi
  done <<< "$refs"

done < "${TMP_DIR}/jsfiles.txt"

ui "Checked refs: $CHECKED, broken: $BROKEN"
dur="$(t_end)"; ui "JS reference time: $(fmt_ms "$dur")"
check_cancel

# -----------------------------------------------------------------------------
# E) Reference sanity: HTML (src/href)
# -----------------------------------------------------------------------------
say "== Reference sanity: HTML src/href =="

t_mark
BROKEN_HTML=0
CHECKED_HTML=0
grep -E '\.html$' "${TMP_DIR}/files.txt" > "${TMP_DIR}/htmlfiles.txt" 2>/dev/null || true
HTML_TOTAL="$(wc -l < "${TMP_DIR}/htmlfiles.txt" 2>/dev/null | tr -d ' ' || echo 0)"
ui "HTML files: $HTML_TOTAL"

while IFS= read -r f; do
  check_cancel
  base="$(dirname "$f")"
  # Extract src/href values (very simple, works for our static files)
  refs="$(grep -Eo '(src|href)=[[:space:]]*("[^"]+"|'\''[^'\'']+'\'')' "$f" 2>/dev/null | head -n 4000 || true)"
  [ -z "$refs" ] && continue
  while IFS= read -r line; do
    check_cancel
    p="$(printf "%s" "$line" | sed -E 's/.*"(.*)".*/\1/; s/.*'\''(.*)'\''.*/\1/')"
    p="$(trim_cr "$p")"
    p="$(strip_query_hash "$p")"
    [ -z "$p" ] && continue
    case "$p" in
      http:*|https:*|mailto:*|data:*|\#*|/*) continue ;;
    esac
    if is_relative "$p"; then
      CHECKED_HTML=$((CHECKED_HTML+1))
      if ! exists_rel "$base" "$p"; then
        BROKEN_HTML=$((BROKEN_HTML+1))
        OK=0
        ui "  [FAIL] $f -> $p"
      fi
    fi
  done <<< "$refs"
done < "${TMP_DIR}/htmlfiles.txt"

ui "Checked refs: $CHECKED_HTML, broken: $BROKEN_HTML"
dur="$(t_end)"; ui "HTML reference time: $(fmt_ms "$dur")"
check_cancel

# -----------------------------------------------------------------------------
# F) Reference sanity: CSS url(...)
# -----------------------------------------------------------------------------
say "== Reference sanity: CSS url() =="

t_mark
BROKEN_CSS=0
CHECKED_CSS=0
grep -E '\.css$' "${TMP_DIR}/files.txt" > "${TMP_DIR}/cssfiles.txt" 2>/dev/null || true
CSS_TOTAL="$(wc -l < "${TMP_DIR}/cssfiles.txt" 2>/dev/null | tr -d ' ' || echo 0)"
ui "CSS files: $CSS_TOTAL"

while IFS= read -r f; do
  check_cancel
  base="$(dirname "$f")"
  refs="$(grep -Eo 'url\([[:space:]]*[^)]+[[:space:]]*\)' "$f" 2>/dev/null | head -n 4000 || true)"
  [ -z "$refs" ] && continue
  while IFS= read -r u; do
    check_cancel
    p="$(printf "%s" "$u" | sed -E 's/^url\((.*)\)$/\1/; s/^[[:space:]]+|[[:space:]]+$//g')"
    p="${p%\"}"; p="${p#\"}"
    p="${p%\'}"; p="${p#\'}"
    p="$(trim_cr "$p")"
    p="$(strip_query_hash "$p")"
    [ -z "$p" ] && continue
    case "$p" in
      http:*|https:*|data:*|\#*|/*) continue ;;
    esac
    if is_relative "$p"; then
      CHECKED_CSS=$((CHECKED_CSS+1))
      if ! exists_rel "$base" "$p"; then
        BROKEN_CSS=$((BROKEN_CSS+1))
        OK=0
        ui "  [FAIL] $f -> $p"
      fi
    fi
  done <<< "$refs"
done < "${TMP_DIR}/cssfiles.txt"

ui "Checked refs: $CHECKED_CSS, broken: $BROKEN_CSS"
dur="$(t_end)"; ui "CSS reference time: $(fmt_ms "$dur")"
check_cancel


# -----------------------------------------------------------------------------
# (Extra) i18n audit (FULL / PARANOID)
# -----------------------------------------------------------------------------
if [[ "$MODE" != "normal" ]]; then
  say "== i18n audit (RU/DE/EN) =="
  if [[ -f "Utilities/diagnostics/i18n_audit.sh" ]]; then
    if ! bash "Utilities/diagnostics/i18n_audit.sh"; then
      warn "i18n audit failed (see output above)."
      OK=0
    fi
  else
    warn "Missing Utilities/diagnostics/i18n_audit.sh (patch not installed?)."
    OK=0
  fi
  say ""
fi


# -----------------------------------------------------------------------------
# (Extra) AI Contract Rentgen (FULL / PARANOID)
# -----------------------------------------------------------------------------
if [[ "$MODE" != "normal" ]]; then
  say "== AI Contract Rentgen (answers->boxes->template) =="
  if [[ -f "Utilities/diagnostics/ai_contract_rentgen.sh" ]]; then
    if ! bash "Utilities/diagnostics/ai_contract_rentgen.sh"; then
      warn "AI Contract Rentgen failed (see output above)."
      OK=0
    fi
  else
    warn "Missing Utilities/diagnostics/ai_contract_rentgen.sh (patch not installed?)."
    OK=0
  fi
  say ""
fi

# -----------------------------------------------------------------------------
# G) Tooling checks (zip/unzip) + permissions
# -----------------------------------------------------------------------------
say "== Tooling checks =="

t_mark
if command -v zip >/dev/null 2>&1 && command -v unzip >/dev/null 2>&1; then
  ui "[OK] zip + unzip"
else
  fail "zip/unzip missing in PATH"
  OK=0
fi

# Basic write check (needed for backups)
touch "${TMP_DIR}/._write_test" 2>/dev/null && ui "[OK] write permissions" || { fail "no write permissions"; OK=0; }
dur="$(t_end)"; ui "Tooling time: $(fmt_ms "$dur")"

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
ui ""
if [ "$OK" = "1" ]; then
  ui "Smoke test: PASSED"
  exit 0
else
  ui "Smoke test: FAILED"
  exit 1
fi
