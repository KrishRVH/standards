#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JOBS="${JOBS:-$(getconf _NPROCESSORS_ONLN 2>/dev/null || nproc 2>/dev/null || echo 4)}"

run_preset() {
  local preset="$1"
  echo "----------------------------------------------------"
  echo "Running preset: $preset"
  echo "----------------------------------------------------"

  cmake --preset "$preset"
  cmake --build --preset "$preset" --parallel "$JOBS"

  if [[ "$preset" != "mingw" ]]; then
    ctest --preset "$preset"
  fi
}

presets=(clang release)

if [[ "${PROJECT_RUN_AMBIENT_GCC:-0}" = "1" ]]; then
  presets+=(gcc)
else
  echo "[INFO] PROJECT_RUN_AMBIENT_GCC=1 not set; skipping ambient GCC preset."
fi

if command -v x86_64-w64-mingw32-g++ >/dev/null 2>&1; then
  presets+=(mingw)
else
  echo "[INFO] x86_64-w64-mingw32-g++ not found; skipping MinGW preset."
fi

for p in "${presets[@]}"; do
  run_preset "$p"
done

echo "----------------------------------------------------"
echo "Running quality checks"
echo "----------------------------------------------------"
if [[ -f "$ROOT/build/clang/compile_commands.json" ]]; then
  "$ROOT/cpp-quality.sh" "$ROOT" "$ROOT/build/clang"
else
  "$ROOT/cpp-quality.sh" "$ROOT"
fi

echo "Quality checks complete"
