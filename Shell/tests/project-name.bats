#!/usr/bin/env bats

setup() {
  # shellcheck disable=SC2154 # Bats defines BATS_TEST_DIRNAME at runtime.
  PROJECT_ROOT="$(cd "${BATS_TEST_DIRNAME}/.." && pwd)"
}

@test "greets the default subject" {
  run "${PROJECT_ROOT}/scripts/project-name.sh"
  [[ "${status}" -eq 0 ]]
  [[ "${output}" = "Hello, world!" ]]
}

@test "greets a supplied subject" {
  run "${PROJECT_ROOT}/scripts/project-name.sh" "standards"
  [[ "${status}" -eq 0 ]]
  [[ "${output}" = "Hello, standards!" ]]
}
