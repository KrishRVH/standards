#!/usr/bin/env bash
set -euo pipefail

readonly SRC_ROOT="${1:-.}"
readonly BUILD_DIR="${2:-$SRC_ROOT/build/clang}"
readonly CDB="$BUILD_DIR/compile_commands.json"

note() { printf '\033[0;34m[INFO]\033[0m %s\n' "$*"; }
fail() {
  printf '\033[0;31m[FAIL]\033[0m %s\n' "$*" >&2
  exit 1
}

command -v clangd > /dev/null 2>&1 || fail "Missing tool: clangd"
[[ -f "$CDB" ]] || fail "No $CDB found; configure a C++ build before running semantic checks."

list_semantic_files() {
  if command -v git > /dev/null 2>&1 && git -C "$SRC_ROOT" rev-parse --is-inside-work-tree > /dev/null 2>&1; then
    git -C "$SRC_ROOT" ls-files --cached --others --exclude-standard -z -- \
      '*.cc' '*.cpp' '*.cxx' '*.h' '*.hh' '*.hpp' '*.hxx' \
      ':(exclude)build/**' ':(exclude)build-*/**' |
      while IFS= read -r -d '' file; do
        [[ -f "$SRC_ROOT/$file" ]] || continue
        printf '%s/%s\0' "$SRC_ROOT" "$file"
      done
  else
    find "$SRC_ROOT" -type d \( -name .git -o -name build -o -name 'build-*' -o -name vendor \) -prune \
      -o -type f \( -name '*.cc' -o -name '*.cpp' -o -name '*.cxx' -o -name '*.h' \
      -o -name '*.hh' -o -name '*.hpp' -o -name '*.hxx' \) -print0
  fi
}

semantic_files=()
while IFS= read -r -d '' file; do
  semantic_files+=("$file")
done < <(list_semantic_files)
((${#semantic_files[@]} > 0)) || fail "No C++ sources or headers found under $SRC_ROOT."

note "clangd: $(clangd --version | head -n 1)"
note "Running clangd semantic checks on ${#semantic_files[@]} files..."
for source in "${semantic_files[@]}"; do
  clangd --background-index=false --clang-tidy --enable-config --log=error \
    --compile-commands-dir="$BUILD_DIR" --check="$source"
done

note "All semantic checks passed."
