#!/usr/bin/env bash
set -euo pipefail

readonly JOBS="${JOBS:-$(getconf _NPROCESSORS_ONLN 2>/dev/null || nproc 2>/dev/null || echo 4)}"
readonly SRC_ROOT="${1:-.}"
readonly BUILD_HINT="${2:-}"
readonly CDB="compile_commands.json"

note() { printf '\033[0;34m[INFO]\033[0m %s\n' "$*"; }
fail() { printf '\033[0;31m[FAIL]\033[0m %s\n' "$*" >&2; exit 1; }

for tool in clang-format clang-tidy; do
  command -v "$tool" >/dev/null 2>&1 || fail "Missing tool: $tool"
done

HAS_CPPCHECK=0
if command -v cppcheck >/dev/null 2>&1; then
  HAS_CPPCHECK=1
else
  note "cppcheck not found; skipping cppcheck checks."
fi

list_files() {
  if command -v git >/dev/null 2>&1 && git -C "$SRC_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git -C "$SRC_ROOT" ls-files --cached --others --exclude-standard -z -- \
      '*.cc' '*.cpp' '*.cxx' '*.h' '*.hh' '*.hpp' '*.hxx' '*.ipp' '*.tpp' '*.inl' '*.ixx' '*.cppm' '*.cxxm'
  else
    find "$SRC_ROOT" -type d \( -name .git -o -name build -o -name 'build-*' \) -prune \
      -o -type f \( -name '*.cc' -o -name '*.cpp' -o -name '*.cxx' -o -name '*.h' -o -name '*.hh' -o -name '*.hpp' -o -name '*.hxx' -o -name '*.ipp' -o -name '*.tpp' -o -name '*.inl' -o -name '*.ixx' -o -name '*.cppm' -o -name '*.cxxm' \) -print0
  fi
}

list_cpp_files() {
  if command -v git >/dev/null 2>&1 && git -C "$SRC_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git -C "$SRC_ROOT" ls-files --cached --others --exclude-standard -z -- '*.cc' '*.cpp' '*.cxx'
  else
    find "$SRC_ROOT" -type d \( -name .git -o -name build -o -name 'build-*' \) -prune \
      -o -type f \( -name '*.cc' -o -name '*.cpp' -o -name '*.cxx' \) -print0
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
note "  clang-tidy:   $(clang-tidy --version)"
if ((HAS_CPPCHECK)); then
  note "  cppcheck:     $(cppcheck --version)"
fi

note "Running clang-format..."
files=()
while IFS= read -r -d '' f; do
  files+=("$f")
done < <(list_files)
if ((${#files[@]} == 0)); then
  note "No source files found; skipping clang-format."
else
  printf '%s\0' "${files[@]}" | xargs -0 -P "$JOBS" clang-format -i
fi

note "Running clang-tidy..."
if cdb_dir="$(detect_cdb_dir)"; then
  cpp_files=()
  while IFS= read -r -d '' f; do
    cpp_files+=("$f")
  done < <(list_cpp_files)
  if ((${#cpp_files[@]} == 0)); then
    note "No C++ sources found; skipping clang-tidy."
  else
    printf '%s\0' "${cpp_files[@]}" | xargs -0 -P "$JOBS" -n 1 clang-tidy -p "$cdb_dir"
  fi
else
  note "No $CDB found (expected in repo root or build dir); skipping clang-tidy."
fi

if ((HAS_CPPCHECK)); then
  note "Running cppcheck (hard fail on warnings/perf/portability)..."
  cppcheck_extra_args=()
  if [[ -n "${CPPCHECK_EXTRA_ARGS:-}" ]]; then
    read -r -a cppcheck_extra_args <<< "$CPPCHECK_EXTRA_ARGS"
  fi
  hard_args=(
    --check-level=exhaustive
    --enable=warning,performance,portability
    --inconclusive --quiet --inline-suppr
    --suppress=missingIncludeSystem
    --suppress=unmatchedSuppression
    --error-exitcode=1 -j "$JOBS"
  )

  if cdb_dir="$(detect_cdb_dir)"; then
    cppcheck "${hard_args[@]}" "${cppcheck_extra_args[@]}" --project="$cdb_dir/$CDB"
  else
    if ((${#files[@]} == 0)); then
      note "No source files found; skipping cppcheck."
    else
      printf '%s\0' "${files[@]}" | xargs -0 cppcheck "${hard_args[@]}" "${cppcheck_extra_args[@]}" --language=c++ --std=c++26 -I"$SRC_ROOT"
    fi
  fi
fi

note "All quality checks passed (hard checks)."
