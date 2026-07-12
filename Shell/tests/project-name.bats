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

@test "accepts a shebang without a trailing newline" {
  # shellcheck disable=SC2154 # Bats defines BATS_TEST_TMPDIR at runtime.
  local workspace="${BATS_TEST_TMPDIR}/unterminated-shebang"
  mkdir -p "${workspace}/scripts"
  printf '#!/usr/bin/env bash' > "${workspace}/scripts/deploy"
  chmod +x "${workspace}/scripts/deploy"

  run bash -c 'cd "$1" && "$2" policy' -- \
    "${workspace}" "${PROJECT_ROOT}/scripts/shell-standards.sh"

  [[ "${status}" -eq 0 ]]
  [[ -z "${output}" ]]
}

@test "ignores non-shell shebangs containing a shell name" {
  # shellcheck disable=SC2154 # Bats defines BATS_TEST_TMPDIR at runtime.
  local workspace="${BATS_TEST_TMPDIR}/lookalike-shebang"
  mkdir -p "${workspace}/scripts"
  printf '#!/usr/bin/bashful\nif\n' > "${workspace}/scripts/deploy"
  chmod +x "${workspace}/scripts/deploy"

  run bash -c 'cd "$1" && "$2" lint' -- \
    "${workspace}" "${PROJECT_ROOT}/scripts/shell-standards.sh"

  [[ "${status}" -eq 0 ]]
}

@test "ignores shell files in nested generated directories outside Git" {
  # shellcheck disable=SC2154 # Bats defines BATS_TEST_TMPDIR at runtime.
  local workspace="${BATS_TEST_TMPDIR}/nested-generated"
  local directory
  local -a generated_directories=(
    "${workspace}/project/.godot/generated"
    "${workspace}/project/.lua_modules/share"
    "${workspace}/project/.venv/bin"
    "${workspace}/project/packages/app/node_modules/package"
    "${workspace}/project/pkg/__pycache__"
    "${workspace}/project/sbom/generated"
  )
  for directory in "${generated_directories[@]}"; do
    mkdir -p "${directory}"
    printf '#!/usr/bin/env bash\nif\n' > "${directory}/broken.sh"
  done
  export GIT_CEILING_DIRECTORIES="${workspace}"

  run bash -c 'cd "$1" && "$2" syntax' -- \
    "${workspace}/project" "${PROJECT_ROOT}/scripts/shell-standards.sh"

  [[ "${status}" -eq 0 ]]
  [[ "${output}" = "No standalone shell scripts found for syntax checks." ]]
}
