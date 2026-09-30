#!/bin/sh
# Format project-owned Odin source with odinfmt. odinfmt has no check mode, so
# odin:fmt:check validates style with the compiler instead.
set -eu

usage() {
  echo "Usage: $0 write" >&2
  exit 2
}

# Replaces one file atomically with its odinfmt output. It runs in its own
# process per file, so its cleanup trap covers only that file's candidate.
format_file() {
  file="$1"
  case "$file" in
    *.odin) ;;
    *) exit 0 ;;
  esac

  if [ -L "$file" ]; then
    echo "Refusing to replace Odin symlink: $file" >&2
    exit 1
  fi
  if [ ! -e "$file" ]; then
    exit 0
  fi
  if [ ! -f "$file" ]; then
    echo "Odin source is not a regular file: $file" >&2
    exit 1
  fi

  candidate="$(mktemp "${file}.odinfmt.XXXXXX")"
  trap 'if [ -n "$candidate" ]; then rm -f "$candidate"; fi' EXIT
  trap "exit 1" HUP INT TERM

  cp -p "$file" "$candidate"
  if ! formatted="$(odinfmt -stdin -config:odinfmt.json < "$file")"; then
    echo "odinfmt failed: $file" >&2
    exit 1
  fi
  if ! printf "%s\n" "$formatted" > "$candidate"; then
    echo "Could not write formatted candidate: $file" >&2
    exit 1
  fi

  if cmp -s "$file" "$candidate"; then
    rm -f "$candidate"
  else
    compare_status="$?"
    if [ "$compare_status" -ne 1 ]; then
      echo "Could not compare formatted candidate: $file" >&2
      exit 1
    fi
    if ! mv -f "$candidate" "$file"; then
      echo "Could not replace formatted source: $file" >&2
      exit 1
    fi
  fi
  candidate=""
  trap - EXIT HUP INT TERM
}

case "${1:-}" in
  write) ;;
  write-file)
    [ "$#" -eq 2 ] || usage
    format_file "$2"
    exit 0
    ;;
  *) usage ;;
esac

list="$(mktemp)"
trap 'rm -f "$list"' EXIT
trap 'exit 1' HUP INT TERM

if command -v git > /dev/null 2>&1 && git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
  git ls-files --cached --others --exclude-standard -z -- src/project_name tests > "$list"
else
  find src/project_name tests \( -type f -o -type l \) -name '*.odin' -print0 > "$list"
fi

if [ -s "$list" ]; then
  xargs -0 -n 1 sh "$0" write-file < "$list"
fi
