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

@test "rejects executable glue without a shebang" {
  # shellcheck disable=SC2154 # Bats defines BATS_TEST_TMPDIR at runtime.
  local workspace="${BATS_TEST_TMPDIR}/missing-shebang"
  mkdir -p "${workspace}/scripts"
  printf 'printf "deploy\\n"\n' > "${workspace}/scripts/deploy"
  chmod +x "${workspace}/scripts/deploy"

  run bash -c 'cd "$1" && "$2" policy' -- \
    "${workspace}" "${PROJECT_ROOT}/scripts/shell-standards.sh"

  [[ "${status}" -ne 0 ]]
  [[ "${output}" == *"scripts/deploy: project glue scripts need a recognized shell shebang."* ]]
}
