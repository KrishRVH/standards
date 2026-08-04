#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly PROJECT_ROOT
readonly PROFILE_ROOT="${PROJECT_ROOT}/TS"
SCRATCH_ROOT="$(mktemp -d)"
readonly SCRATCH_ROOT
readonly GENERATED_EXCLUSION_LOG="${SCRATCH_ROOT}/generated-exclusion.log"

cleanup() {
  rm -rf -- "${SCRATCH_ROOT}"
}
trap cleanup EXIT

# The committed fixture uses Option A, so validate Option B's lint contract
# without imposing its formatter or import organizer on the same project.
(
  cd "${PROFILE_ROOT}"
  biome lint --error-on-warnings --reporter=concise --vcs-root=.. \
    biome.jsonc package.json src tests tsconfig.json
)

# Measure the generated-file policy explicitly. Biome must reject the explicit
# path because the file is excluded, not silently analyze or repair it.
if (
  cd "${PROFILE_ROOT}"
  biome lint --error-on-warnings --reporter=concise --vcs-root=.. \
    tests/fixtures/biome/generated-client.generated.ts
) > "${GENERATED_EXCLUSION_LOG}" 2>&1; then
  echo "Biome unexpectedly processed the generated-file exclusion fixture." >&2
  exit 1
fi

if ! grep -Fq "provided but ignored" "${GENERATED_EXCLUSION_LOG}" ||
  ! grep -Fq "generated-client.generated.ts" "${GENERATED_EXCLUSION_LOG}"; then
  cat "${GENERATED_EXCLUSION_LOG}" >&2
  echo "Biome did not report the generated fixture as excluded." >&2
  exit 1
fi

# Exercise the complete Biome repair and check loop on an isolated copy. This
# proves the alternative is internally convergent without mutating Option A.
cp -R \
  "${PROFILE_ROOT}/biome.jsonc" \
  "${PROFILE_ROOT}/package.json" \
  "${PROFILE_ROOT}/src" \
  "${PROFILE_ROOT}/tests" \
  "${PROFILE_ROOT}/tsconfig.json" \
  "${SCRATCH_ROOT}/"

(
  cd "${SCRATCH_ROOT}"
  biome check --write --error-on-warnings --vcs-enabled=false \
    biome.jsonc package.json src tests tsconfig.json
  biome ci --error-on-warnings --reporter=concise --vcs-enabled=false \
    biome.jsonc package.json src tests tsconfig.json
)
