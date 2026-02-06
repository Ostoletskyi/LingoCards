#!/usr/bin/env bash
set -euo pipefail

# Runs i18n audit using python (preferred, because project already uses python for local server).
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

PY=python
if command -v python3 >/dev/null 2>&1; then PY=python3; fi

"$PY" "$ROOT/Utilities/diagnostics/i18n_audit.py" "$@"
