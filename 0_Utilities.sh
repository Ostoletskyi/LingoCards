#!/usr/bin/env bash
set -e
( set -o pipefail ) 2>/dev/null && set -o pipefail || true

# Root launcher for LingoCard Utilities
# Run from project root: bash ./0_Utilities.sh

trim_cr(){ printf "%s" "${1%$'\r'}"; }
ui(){ printf "%s\n" "$*" >&2; }
warn(){ ui "[WARN] $*"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ROOT="$SCRIPT_DIR"
UTIL_DIR="$PROJECT_ROOT/Utilities"

[ -d "$UTIL_DIR" ] || { ui "[ERROR] Utilities folder not found next to this launcher."; exit 1; }

run_bash(){
  local f="$1"
  if [ ! -f "$f" ]; then
    ui "[ERROR] Missing script: $f"
    return 1
  fi
  ui ""
  ui "--- Running: ${f#$PROJECT_ROOT/} ---"
  bash "$f"
}

menu(){
  ui ""
  ui "========== LingoCard Utilities =========="
  ui "1) Backup menu"
  ui "2) Smoke test (project diagnostics)"
  ui "3) Git tools"
  ui "6) i18n audit (RU/DE/EN)"
  ui "4) Open Utilities folder"
  ui "5) Exit"
  ui "-----------------------------------------"
}

open_folder(){
  # Best effort for Windows Git-Bash + Linux
  if command -v explorer.exe >/dev/null 2>&1; then
    explorer.exe "$(cygpath -w "$UTIL_DIR" 2>/dev/null || echo "$UTIL_DIR")" >/dev/null 2>&1 || true
    ui "Opened in Explorer.";
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$UTIL_DIR" >/dev/null 2>&1 || true
    ui "Opened.";
  else
    ui "Utilities folder: $UTIL_DIR"
  fi
}

while true; do
  menu
  printf "Choose option (1-6): " >&2
  IFS= read -r choice || choice=""
  choice="$(trim_cr "$choice")"

  case "$choice" in
    1) run_bash "$UTIL_DIR/backup/backup_menu.sh" || true ;;
    2) run_bash "$UTIL_DIR/diagnostics/smoke_test.sh" || true ;;
    3) run_bash "$UTIL_DIR/diagnostics/git_tools.sh" || true ;;
    6) run_bash "$UTIL_DIR/diagnostics/i18n_audit.sh" || true ;;
    4) open_folder ;;
    5) ui "Bye."; exit 0 ;;
    *) warn "Unknown option." ;;
  esac
done