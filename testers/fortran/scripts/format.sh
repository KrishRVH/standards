#!/usr/bin/env bash
set -euo pipefail

readonly MODE="${1:-check}"
case "$MODE" in
  check | write) ;;
  *)
    echo "Usage: $0 [check|write]" >&2
    exit 2
    ;;
esac

list_sources() {
  if git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
    git ls-files --cached --others --exclude-standard -z -- '*.f90' '*.F90' |
      while IFS= read -r -d '' file; do
        if [[ -f "$file" ]]; then
          printf '%s\0' "$file"
        fi
      done
  else
    find . -type d \( -name .git -o -name build -o -name .fpm -o -name vendor \) -prune \
      -o -type f \( -name '*.f90' -o -name '*.F90' \) -print0
  fi
}

formatted="$(mktemp)"
trap 'rm -f "$formatted"' EXIT
status=0
while IFS= read -r -d '' file; do
  findent -ifree -ofree -i3 -Rr < "$file" > "$formatted"
  if [[ "$MODE" == "write" ]]; then
    cat "$formatted" > "$file"
  elif ! cmp -s "$file" "$formatted"; then
    echo "Fortran source is not formatted: $file" >&2
    status=1
  fi
done < <(list_sources)
exit "$status"
