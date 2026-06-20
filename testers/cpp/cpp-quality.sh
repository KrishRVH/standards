#!/usr/bin/env bash
set -euo pipefail

readonly JOBS="${JOBS:-$(getconf _NPROCESSORS_ONLN 2>/dev/null || nproc 2>/dev/null || echo 4)}"
readonly SRC_ROOT="${1:-.}"
readonly BUILD_HINT="${2:-}"

files=()
while IFS= read -r -d '' file; do
  files+=("$file")
done < <(git -C "$SRC_ROOT" ls-files --cached --others --exclude-standard -z -- '*.cc' '*.cpp' '*.cxx' '*.h' '*.hh' '*.hpp' '*.hxx')

if ((${#files[@]} > 0)); then
  printf '%s\0' "${files[@]}" | xargs -0 -P "$JOBS" clang-format --dry-run --Werror
fi

if [[ -f "$BUILD_HINT/compile_commands.json" ]]; then
  sources=()
  while IFS= read -r -d '' file; do
    sources+=("$file")
  done < <(git -C "$SRC_ROOT" ls-files --cached --others --exclude-standard -z -- '*.cc' '*.cpp' '*.cxx')
  if ((${#sources[@]} > 0)); then
    for source in "${sources[@]}"; do
      clangd --background-index=false --clang-tidy --enable-config --log=error \
        --compile-commands-dir="$BUILD_HINT" --check="$source"
    done
  fi
fi
