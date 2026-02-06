#!/usr/bin/env bash
set -e
( set -o pipefail ) 2>/dev/null && set -o pipefail || true

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
exec bash "$SCRIPT_DIR/backup_menu.sh"
