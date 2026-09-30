#!/bin/sh
# Check or format project-owned Roc source with the compiler's formatter.
set -eu

usage() {
  echo "Usage: $0 [check|write]" >&2
  exit 2
}

# Checks or rewrites one file. It runs in its own process per file, so its
# cleanup trap covers only that file's staged copy.
format_file() {
  mode="$1"
  task="roc:fmt"
  if [ "$mode" = check ]; then
    task="roc:fmt:check"
  fi
  path="$2"
  case "$path" in
    /* | ./*) ;;
    *) path="./$path" ;;
  esac
  if [ -L "$path" ]; then
    printf "%s refuses non-regular source: %s\n" "$task" "$2" >&2
    exit 1
  fi
  if [ ! -e "$path" ]; then
    exit 0
  fi
  if [ ! -f "$path" ]; then
    printf "%s refuses non-regular source: %s\n" "$task" "$2" >&2
    exit 1
  fi

  if [ "$mode" = check ]; then
    roc fmt --check "$path"
    exit 0
  fi

  tmp="$(mktemp "${path}.roc-fmt.XXXXXX")"
  trap 'rm -f "$tmp"' 0
  trap 'exit 1' 1 2 15
  cp -p "$path" "$tmp"
  roc fmt --stdin < "$path" > "$tmp"
  if cmp -s "$path" "$tmp"; then
    rm -f "$tmp"
  else
    compare_status=$?
    if [ "$compare_status" -ne 1 ]; then
      printf "roc:fmt could not compare staged source: %s\n" "$2" >&2
      exit 1
    fi
    if ! mv -f "$tmp" "$path"; then
      printf "roc:fmt could not replace source: %s\n" "$2" >&2
      exit 1
    fi
  fi
  trap - 0 1 2 15
}

case "${1:-check}" in
  check | write) mode="${1:-check}" ;;
  check-file | write-file)
    [ "$#" -eq 2 ] || usage
    format_file "${1%-file}" "$2"
    exit 0
    ;;
  *) usage ;;
esac

list="$(mktemp)"
trap 'rm -f "$list"' EXIT
if command -v git > /dev/null 2>&1 && git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
  git ls-files --cached --others --exclude-standard -z -- '*.roc' > "$list"
else
  find . -type d -name .git -prune -o \( -type f -o -type l \) -name '*.roc' -print0 > "$list"
fi
if [ -s "$list" ]; then
  xargs -0 -n 1 sh "$0" "$mode-file" < "$list"
fi
