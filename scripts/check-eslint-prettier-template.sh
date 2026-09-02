#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly PROJECT_ROOT
readonly PROFILE_ROOT="${PROJECT_ROOT}/TS"
SCRATCH_ROOT="$(mktemp -d)"
readonly SCRATCH_ROOT

cleanup() {
  rm -rf -- "${SCRATCH_ROOT}"
}
trap cleanup EXIT

# Exercise the retained ESLint and Prettier workflow away from the canonical
# Oxc-formatted template. A scratch-local frozen install prevents the aggregate
# gate from racing the live TypeScript fixture's negative lint probes.
cp -R \
  "${PROFILE_ROOT}/.github" \
  "${PROFILE_ROOT}/.oxfmtrc.json" \
  "${PROFILE_ROOT}/.oxlintrc.json" \
  "${PROFILE_ROOT}/.prettierignore" \
  "${PROFILE_ROOT}/AGENTS.md" \
  "${PROFILE_ROOT}/README.md" \
  "${PROFILE_ROOT}/bun.lock" \
  "${PROFILE_ROOT}/bunfig.toml" \
  "${PROFILE_ROOT}/docs" \
  "${PROFILE_ROOT}/effect-diagnostics" \
  "${PROFILE_ROOT}/eslint.config.mjs" \
  "${PROFILE_ROOT}/knip.jsonc" \
  "${PROFILE_ROOT}/package.json" \
  "${PROFILE_ROOT}/prettier.config.mjs" \
  "${PROFILE_ROOT}/scripts" \
  "${PROFILE_ROOT}/src" \
  "${PROFILE_ROOT}/stryker.config.mjs" \
  "${PROFILE_ROOT}/tests" \
  "${PROFILE_ROOT}/tsconfig.json" \
  "${PROFILE_ROOT}/type-tests" \
  "${SCRATCH_ROOT}/"

(
  cd "${SCRATCH_ROOT}"
  bun install --frozen-lockfile
  bun run lint:secondary
  bun run standards:secondary
  bun run standards:secondary:check
)
