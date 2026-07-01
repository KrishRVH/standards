#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

main() {
  local name="${1:-world}"
  printf 'Hello, %s!\n' "${name}"
}

main "$@"
