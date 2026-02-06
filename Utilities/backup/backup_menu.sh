#!/usr/bin/env bash
set -e
( set -o pipefail ) 2>/dev/null && set -o pipefail || true

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib_backup.sh
source "$SCRIPT_DIR/lib_backup.sh"

menu(){
  ui ""
  ui "==== LingoCard Backup Menu ===="
  ui "1) Create backup (ZIP)"
  ui "2) Verify backup (unzip -t)"
  ui "3) List backups"
  ui "4) Restore backup (submenu)"
  ui "5) Prune backups (keep last N)"
  ui "H) Help"
  ui "0) Back"
}

main(){
  while true; do
    menu
    printf "Choose (0-5, H): " >&2
    IFS= read -r ch || ch=""
    ch="$(trim_cr "$ch")"
    ch_lc="$(echo "$ch" | tr '[:upper:]' '[:lower:]')"
    case "$ch_lc" in
      1) create_backup ;;
      2) verify_backup || true ;;
      3) list_backups || true ;;
      4) bash "$SCRIPT_DIR/restore_menu.sh" || true ;;
      5) prune_menu || true ;;
      h|help|\?) show_help || true ;;
      0|q|quit|exit|"") return 0 ;;
      *) warn "Unknown option." ;;
    esac
  done
}

main
