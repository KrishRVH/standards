#!/usr/bin/env bash
set -euo pipefail

JOBS="${JOBS:-$(getconf _NPROCESSORS_ONLN 2>/dev/null || nproc 2>/dev/null || echo 4)}"

for preset in clang release; do
  cmake --preset "$preset"
  cmake --build --preset "$preset" --parallel "$JOBS"
  ctest --preset "$preset"
done

./cpp-quality.sh . build/clang
