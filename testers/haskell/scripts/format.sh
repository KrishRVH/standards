#!/bin/sh
# Check or format Git-tracked and unignored Haskell sources with Ormolu.
set -eu

case "${1:-check}" in
  check) ormolu_mode=check ;;
  write) ormolu_mode=inplace ;;
  *)
    echo "Usage: $0 [check|write]" >&2
    exit 2
    ;;
esac

tmp="$(mktemp)"
raw="$(mktemp)"
trap 'rm -f "$tmp" "$raw"' EXIT
if command -v git > /dev/null 2>&1 && git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
  git ls-files --cached --others --exclude-standard -z -- '*.hs' '*.lhs' > "$raw"
  # Keep only listed files that still exist; the loop runs in the child shell.
  # shellcheck disable=SC2016
  xargs -0 sh -c 'for file do [ ! -f "$file" ] || printf "%s\0" "$file"; done' sh < "$raw" > "$tmp"
else
  find . -type d \( -name .git -o -name dist-newstyle -o -name .stack-work -o -name vendor \) -prune \
    -o -type f \( -name '*.hs' -o -name '*.lhs' \) -print0 > "$tmp"
fi
if [ -s "$tmp" ]; then
  xargs -0 ormolu --mode "$ormolu_mode" < "$tmp"
fi
