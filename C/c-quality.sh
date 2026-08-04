#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly ROOT
readonly PROFILE="${1:-hard}"
SOURCE_ROOT="$(cd "${2:-$ROOT}" && pwd)"
readonly SOURCE_ROOT
readonly BUILD_DIR="${3:-$SOURCE_ROOT/build/clang-fast}"
readonly JOBS="${JOBS:-$(getconf _NPROCESSORS_ONLN 2> /dev/null || nproc 2> /dev/null || echo 4)}"
readonly CLANG="${C_CLANG:-clang}"
readonly CLANG_TIDY="${C_CLANG_TIDY:-clang-tidy}"
readonly RUN_CLANG_TIDY="${C_RUN_CLANG_TIDY:-run-clang-tidy}"
readonly REQUIRED_VERSION="22.1.8"

fail() {
  printf '[FAIL] %s\n' "$*" >&2
  exit 1
}

require_tool() {
  command -v "$1" > /dev/null 2>&1 || fail "required tool is unavailable: $1"
}

case "$PROFILE" in
  hard)
    readonly CONFIG="$SOURCE_ROOT/.clang-tidy"
    ;;
  advisory)
    readonly CONFIG="$SOURCE_ROOT/.clang-tidy-advisory"
    ;;
  *) fail "usage: $0 [hard|advisory] [source-root] [build-dir]" ;;
esac

require_tool "$CLANG"
require_tool "$CLANG_TIDY"
require_tool "$RUN_CLANG_TIDY"

[[ -f "$CONFIG" ]] || fail "analysis configuration is missing: $CONFIG"
[[ -d "$BUILD_DIR" ]] || fail "analysis build directory is missing: $BUILD_DIR"
readonly CDB="$BUILD_DIR/compile_commands.json"
[[ -s "$CDB" ]] ||
  fail "mandatory analysis requires $CDB; run the clang-fast configure preset"

clang_version="$($CLANG --version | head -n 1)"
tidy_version="$($CLANG_TIDY --version 2>&1)"
clang_reported_version="$(awk '{for (i = 1; i < NF; i++) if ($i == "version") {print $(i + 1); exit}}' <<< "$clang_version")"
tidy_reported_version="$(awk '$1 == "LLVM" && $2 == "version" {print $3; exit}' <<< "$tidy_version")"
[[ "$clang_reported_version" == "$REQUIRED_VERSION" ]] ||
  fail "Clang $REQUIRED_VERSION is required; parsed version: ${clang_reported_version:-<none>}"
[[ "$tidy_reported_version" == "$REQUIRED_VERSION" ]] ||
  fail "clang-tidy $REQUIRED_VERSION is required; parsed version: ${tidy_reported_version:-<none>}"

resource_dir="$($CLANG -print-resource-dir)"
[[ -f "$resource_dir/include/stddef.h" ]] ||
  fail "Clang resource headers are missing from $resource_dir"

$CLANG_TIDY --verify-config --config-file="$CONFIG" > /dev/null

scratch_dir="$(mktemp -d "${TMPDIR:-/tmp}/c-quality.XXXXXX")"
trap 'rm -rf "$scratch_dir"' EXIT

analysis_file_count() {
  local log_file="$1"
  local -a reported_lines=()
  local selected_count
  local database_count

  mapfile -t reported_lines < <(
    sed -nE \
      's/^Running clang-tidy in [0-9]+ threads for ([0-9]+) files out of ([0-9]+) in compilation database \.\.\.$/\1|\2/p' \
      "$log_file"
  )
  ((${#reported_lines[@]} == 1)) ||
    fail "run-clang-tidy did not report exactly one analyzed-file count"
  IFS='|' read -r selected_count database_count <<< "${reported_lines[0]}"
  [[ "$selected_count" =~ ^[0-9]+$ && "$database_count" =~ ^[0-9]+$ ]] ||
    fail "run-clang-tidy reported an invalid analyzed-file count"
  ((selected_count > 0)) ||
    fail "analysis selected no .c translation units from $CDB"
  if grep -F 'Processing file ' "$log_file" > /dev/null; then
    fail "analysis requires one unambiguous C command per source; run-clang-tidy found duplicate source commands in $CDB"
  fi
  ((selected_count == database_count)) ||
    fail "analysis requires every database entry to be one C source; selected $selected_count of $database_count"

  printf '%s\n' "$selected_count"
}

printf '[INFO] analysis profile: %s\n' "$PROFILE"
printf '[INFO] clang: %s\n' "$clang_version"
printf '[INFO] clang-tidy: LLVM %s\n' "$REQUIRED_VERSION"
printf '[INFO] compilation database: %s\n' "$CDB"

if [[ "$PROFILE" == "hard" ]]; then
  readonly EXPECTED_CHECKS="$SOURCE_ROOT/standards-tests/analyzer/hard-checks.txt"
  [[ -f "$EXPECTED_CHECKS" ]] ||
    fail "resolved-check contract is missing: $EXPECTED_CHECKS"
  $CLANG_TIDY --config-file="$CONFIG" --list-checks |
    sed -n 's/^    //p' > "$scratch_dir/resolved-checks.txt"
  if ! cmp -s "$EXPECTED_CHECKS" "$scratch_dir/resolved-checks.txt"; then
    diff -u "$EXPECTED_CHECKS" "$scratch_dir/resolved-checks.txt" >&2 || true
    fail "clang-tidy resolved check set drifted; review before updating the contract"
  fi
  printf '[INFO] resolved hard checks: %s\n' "$(wc -l < "$EXPECTED_CHECKS")"
  if [[ "${C_QUALITY_SHOW_CHECKS:-1}" == "1" ]]; then
    sed 's/^/  /' "$EXPECTED_CHECKS"
  fi

  analysis_status=0
  "$RUN_CLANG_TIDY" -quiet -j "$JOBS" \
    -clang-tidy-binary "$(command -v "$CLANG_TIDY")" \
    -config-file "$CONFIG" -p "$BUILD_DIR" \
    -source-filter '(?s:.*[.]c$)' \
    -extra-arg-before="-resource-dir=$resource_dir" 2>&1 |
    tee "$scratch_dir/hard.log" || analysis_status=$?
  translation_units="$(analysis_file_count "$scratch_dir/hard.log")"
  ((analysis_status == 0)) ||
    fail "hard analysis failed after inspecting $translation_units translation units"
  printf '[PASS] hard analysis inspected %s translation units\n' "$translation_units"
else
  readonly BASELINE="$SOURCE_ROOT/.clang-tidy-advisory-baseline"
  [[ -f "$BASELINE" ]] || fail "advisory baseline is missing: $BASELINE"
  baseline_count="$(sed -n '/^[0-9][0-9]*$/p' "$BASELINE")"
  [[ "$baseline_count" =~ ^[0-9]+$ ]] || fail "invalid advisory baseline: $BASELINE"

  analysis_status=0
  "$RUN_CLANG_TIDY" -quiet -j "$JOBS" \
    -clang-tidy-binary "$(command -v "$CLANG_TIDY")" \
    -config-file "$CONFIG" -p "$BUILD_DIR" \
    -source-filter '(?s:.*[.]c$)' \
    -extra-arg-before="-resource-dir=$resource_dir" 2>&1 |
    tee "$scratch_dir/advisory.log" || analysis_status=$?
  translation_units="$(analysis_file_count "$scratch_dir/advisory.log")"
  ((analysis_status == 0)) ||
    fail "advisory analysis failed after inspecting $translation_units translation units"
  finding_count="$(grep -c 'warning:.*\[[^][]*\]$' "$scratch_dir/advisory.log" || true)"
  if ((finding_count > baseline_count)); then
    fail "advisory findings increased from $baseline_count to $finding_count; review, then repair or explicitly update the baseline"
  fi
  printf '[ADVISORY] %s findings across %s translation units (ratchet maximum %s); findings are review inputs, not rewrite orders\n' \
    "$finding_count" "$translation_units" "$baseline_count"
fi
