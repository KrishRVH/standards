#!/usr/bin/env bash
set -euo pipefail

readonly MODE="${1:-check}"
readonly SRC_ROOT="${2:-.}"
readonly JOBS="${JOBS:-$(getconf _NPROCESSORS_ONLN 2> /dev/null || nproc 2> /dev/null || echo 4)}"

case "$MODE" in
  check) readonly FORMAT_ARGS=(--dry-run --Werror) ;;
  write) readonly FORMAT_ARGS=(-i) ;;
  *)
    echo "Usage: $0 [check|write] [source-root]" >&2
    exit 2
    ;;
esac

list_files() {
  if command -v git > /dev/null 2>&1 && git -C "$SRC_ROOT" rev-parse --is-inside-work-tree > /dev/null 2>&1; then
    git -C "$SRC_ROOT" ls-files --cached --others --exclude-standard -z -- \
      '*.cc' '*.cpp' '*.cxx' '*.h' '*.hh' '*.hpp' '*.hxx' '*.inl' '*.ipp' '*.tpp' \
      ':(exclude)build/**' ':(exclude)build-*/**' |
      while IFS= read -r -d '' file; do
        [[ -f "$SRC_ROOT/$file" ]] || continue
        printf '%s/%s\0' "$SRC_ROOT" "$file"
      done
  else
    find "$SRC_ROOT" -type d \( -name .git -o -name build -o -name 'build-*' -o -name vendor \) -prune \
      -o -type f \( -name '*.cc' -o -name '*.cpp' -o -name '*.cxx' -o -name '*.h' -o -name '*.hh' -o -name '*.hpp' -o -name '*.hxx' -o -name '*.inl' -o -name '*.ipp' -o -name '*.tpp' \) -print0
  fi
}

files=()
while IFS= read -r -d '' file; do
  files+=("$file")
done < <(list_files)

if ((${#files[@]} > 0)); then
  printf '%s\0' "${files[@]}" | xargs -0 -P "$JOBS" -n 16 clang-format "${FORMAT_ARGS[@]}"
fi
