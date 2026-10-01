#!/bin/sh
# Check or format Git-tracked and unignored Zig sources.
set -eu

case "${1:-check}" in
  check) set -- --check ;;
  write) set -- ;;
  *)
    echo "Usage: $0 [check|write]" >&2
    exit 2
    ;;
esac

tmp="$(mktemp)"
raw="$(mktemp)"
trap 'rm -f "$tmp" "$raw"' EXIT
if command -v git > /dev/null 2>&1 && git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
  git ls-files --cached --others --exclude-standard -z -- '*.zig' '*.zon' > "$raw"
  # Keep only listed files that still exist; the loop runs in the child shell.
  # shellcheck disable=SC2016
  xargs -0 sh -c 'for file do [ ! -f "$file" ] || printf "%s\0" "$file"; done' sh < "$raw" > "$tmp"
else
  find . -type d \( -name .git -o -name .zig-cache -o -name zig-out -o -name zig-pkg \) -prune \
    -o -type f \( -name '*.zig' -o -name '*.zon' \) -print0 > "$tmp"
fi
if [ -s "$tmp" ]; then
  xargs -0 zig fmt "$@" < "$tmp"
fi
