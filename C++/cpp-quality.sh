#!/usr/bin/env bash
set -euo pipefail

SRC_ROOT="$(cd "${1:-.}" && pwd)"
readonly SRC_ROOT
readonly BUILD_DIR="${2:-$SRC_ROOT/build/clang}"
readonly CDB="$BUILD_DIR/compile_commands.json"
readonly CONFIG="$SRC_ROOT/.clang-tidy"
readonly JOBS="${JOBS:-$(getconf _NPROCESSORS_ONLN 2> /dev/null || nproc 2> /dev/null || echo 4)}"

note() { printf '\033[0;34m[INFO]\033[0m %s\n' "$*"; }
fail() {
  printf '\033[0;31m[FAIL]\033[0m %s\n' "$*" >&2
  exit 1
}

for tool in clang-tidy run-clang-tidy clangd; do
  command -v "$tool" > /dev/null 2>&1 || fail "Missing tool: $tool"
done
[[ -s "$CDB" ]] || fail "No $CDB found; configure a C++ build before running semantic checks."

list_headers() {
  if command -v git > /dev/null 2>&1 && git -C "$SRC_ROOT" rev-parse --is-inside-work-tree > /dev/null 2>&1; then
    git -C "$SRC_ROOT" ls-files --cached --others --exclude-standard -z -- \
      '*.h' '*.hh' '*.hpp' '*.hxx' ':(exclude)build/**' ':(exclude)build-*/**' |
      while IFS= read -r -d '' file; do
        [[ -f "$SRC_ROOT/$file" ]] || continue
        printf '%s/%s\0' "$SRC_ROOT" "$file"
      done
  else
    find "$SRC_ROOT" -type d \( -name .git -o -name build -o -name 'build-*' -o -name vendor \) -prune \
      -o -type f \( -name '*.h' -o -name '*.hh' -o -name '*.hpp' -o -name '*.hxx' \) -print0
  fi
}

clang-tidy --verify-config --config-file="$CONFIG" > /dev/null
note "clang-tidy: $(clang-tidy --version | grep -m 1 'LLVM version' | sed 's/^ *//')"

log_file="$(mktemp "${TMPDIR:-/tmp}/cpp-quality.XXXXXX")"
trap 'rm -f "$log_file"' EXIT

# clangd skips some clang-tidy checks, including the analyzer, so every
# translation unit in the database runs through clang-tidy itself.
analysis_status=0
run-clang-tidy -quiet -j "$JOBS" \
  -clang-tidy-binary "$(command -v clang-tidy)" \
  -config-file "$CONFIG" -p "$BUILD_DIR" 2>&1 |
  tee "$log_file" || analysis_status=$?

translation_units="$(sed -nE 's/^Running clang-tidy in [0-9]+ threads for ([0-9]+) files .*/\1/p' "$log_file")"
((${translation_units:-0} > 0)) || fail "clang-tidy analyzed no translation units from $CDB."
((analysis_status == 0)) || fail "clang-tidy reported findings across $translation_units translation units."
note "clang-tidy passed on $translation_units translation units."

# clangd parses each header on its own with interpolated compile flags, so a
# header that is not self-contained fails at its own declarations.
headers=()
while IFS= read -r -d '' header; do
  headers+=("$header")
done < <(list_headers)
note "clangd: $(clangd --version | head -n 1)"
for header in "${headers[@]}"; do
  clangd --background-index=false --clang-tidy --enable-config --log=error \
    --compile-commands-dir="$BUILD_DIR" --check="$header"
done
note "clangd parsed ${#headers[@]} headers."
