#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if command -v node >/dev/null 2>&1; then
  node "Utilities/diagnostics/ai_contract_rentgen.js"
else
  echo "Node.js not found. Install Node.js (LTS) to run this diagnostic."
  exit 2
fi
