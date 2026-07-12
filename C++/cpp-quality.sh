#!/usr/bin/env bash
set -euo pipefail

readonly JOBS="${JOBS:-$(getconf _NPROCESSORS_ONLN 2> /dev/null || nproc 2> /dev/null || echo 4)}"
readonly SRC_ROOT="${1:-.}"
readonly BUILD_HINT="${2:-}"
readonly CDB="compile_commands.json"

note() { printf '\033[0;34m[INFO]\033[0m %s\n' "$*"; }
fail() {
  printf '\033[0;31m[FAIL]\033[0m %s\n' "$*" >&2
  exit 1
}

for tool in clang-format clangd; do
  command -v "$tool" > /dev/null 2>&1 || fail "Missing tool: $tool"
done

list_files() {
  if command -v git > /dev/null 2>&1 && git -C "$SRC_ROOT" rev-parse --is-inside-work-tree > /dev/null 2>&1; then
    git -C "$SRC_ROOT" ls-files --cached --others --exclude-standard -z -- \
      '*.cc' '*.cpp' '*.cxx' '*.h' '*.hh' '*.hpp' '*.hxx' '*.ipp' '*.tpp' '*.inl' \
      ':(exclude)build/**' ':(exclude)build-*/**' |
      while IFS= read -r -d '' file; do
        printf '%s/%s\0' "$SRC_ROOT" "$file"
      done
  else
    find "$SRC_ROOT" -type d \( -name .git -o -name build -o -name 'build-*' \) -prune \
      -o -type f \( -name '*.cc' -o -name '*.cpp' -o -name '*.cxx' -o -name '*.h' -o -name '*.hh' -o -name '*.hpp' -o -name '*.hxx' -o -name '*.ipp' -o -name '*.tpp' -o -name '*.inl' \) -print0
  fi
}

list_semantic_files() {
  if command -v git > /dev/null 2>&1 && git -C "$SRC_ROOT" rev-parse --is-inside-work-tree > /dev/null 2>&1; then
    git -C "$SRC_ROOT" ls-files --cached --others --exclude-standard -z -- \
      '*.cc' '*.cpp' '*.cxx' '*.h' '*.hh' '*.hpp' '*.hxx' \
      ':(exclude)build/**' ':(exclude)build-*/**' |
      while IFS= read -r -d '' file; do
        printf '%s/%s\0' "$SRC_ROOT" "$file"
      done
  else
    find "$SRC_ROOT" -type d \( -name .git -o -name build -o -name 'build-*' \) -prune \
      -o -type f \( -name '*.cc' -o -name '*.cpp' -o -name '*.cxx' -o -name '*.h' \
      -o -name '*.hh' -o -name '*.hpp' -o -name '*.hxx' \) -print0
  fi
}

detect_cdb_dir() {
  if [[ -n "$BUILD_HINT" && -f "$BUILD_HINT/$CDB" ]]; then
    printf '%s\n' "$BUILD_HINT"
    return 0
  fi

  if [[ -f "$SRC_ROOT/$CDB" ]]; then
    printf '%s\n' "$SRC_ROOT"
    return 0
  fi

  if [[ -f "$SRC_ROOT/build/$CDB" ]]; then
    printf '%s\n' "$SRC_ROOT/build"
    return 0
  fi

  return 1
}

note "Tool versions:"
note "  clang-format: $(clang-format --version)"
note "  clangd:       $(clangd --version | head -n 1)"
note "Checking clang-format..."
files=()
while IFS= read -r -d '' f; do
  files+=("$f")
done < <(list_files)
if ((${#files[@]} == 0)); then
  note "No source files found; skipping clang-format."
else
  printf '%s\0' "${files[@]}" | xargs -0 -P "$JOBS" clang-format --dry-run --Werror
fi

note "Running clangd semantic checks..."
if cdb_dir="$(detect_cdb_dir)"; then
  semantic_files=()
  while IFS= read -r -d '' f; do
    semantic_files+=("$f")
  done < <(list_semantic_files)
  if ((${#semantic_files[@]} == 0)); then
    note "No C++ sources or headers found; skipping clangd."
  else
    for source in "${semantic_files[@]}"; do
      clangd --background-index=false --clang-tidy --enable-config --log=error \
        --compile-commands-dir="$cdb_dir" --check="$source"
    done
  fi
else
  note "No $CDB found (expected in repo root or build dir); skipping clangd."
fi

note "All quality checks passed (hard checks)."
