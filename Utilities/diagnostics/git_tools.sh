#!/usr/bin/env bash
set -e
( set -o pipefail ) 2>/dev/null && set -o pipefail || true

ui(){ printf "%s\n" "$*" >&2; }
warn(){ ui "[WARN] $*"; }
die(){ ui "[ERROR] $*"; exit 1; }

have_cmd(){ command -v "$1" >/dev/null 2>&1; }
trim_cr(){ printf "%s" "${1%$'\r'}"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd -P)"
cd "$PROJECT_ROOT" || exit 1

have_cmd git || die "git is not installed"

ensure_gitignore(){
  [ -f .gitignore ] && return 0
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

git_init_repo(){
  if [ -d .git ]; then warn "Already a git repo"; return 0; fi
  ensure_gitignore
  git init
  git branch -M main >/dev/null 2>&1 || true
  git add -A
  git commit -m "chore: initial snapshot" || true
  ui "OK: git initialized"
}

git_push_origin(){
  [ -d .git ] || die "Not a git repo. Init first."
  local branch
  branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)"
  if ! git remote get-url origin >/dev/null 2>&1; then
    printf "Enter remote URL for origin (empty=cancel): " >&2
    IFS= read -r url || url=""
    url="$(trim_cr "$url")"
    [ -n "$url" ] || { warn "Cancelled"; return 0; }
    git remote add origin "$url"
  fi
  git push -u origin "$branch" --follow-tags
  ui "OK: pushed"
}

menu(){
  ui ""
  ui "==== Git tools ===="
  ui "1) git init + initial commit"
  ui "2) git push (origin)"
  ui "3) status"
  ui "4) back"
}

while true; do
  menu
  printf "Choose (1-4): " >&2
  IFS= read -r ch || ch=""
  ch="$(trim_cr "$ch")"
  case "$ch" in
    1) git_init_repo ;;
    2) git_push_origin ;;
    3) git status -sb || true ;;
    4|"") exit 0 ;;
    *) warn "Unknown" ;;
  esac
done
