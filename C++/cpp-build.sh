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

run_install_check() {
  echo "----------------------------------------------------"
  echo "Running install/package consumer check"
  echo "----------------------------------------------------"

  local install_prefix="$ROOT/build/install"

  cmake --preset release \
    -DPROJECT_INSTALL=ON \
    -DCMAKE_INSTALL_LIBDIR=lib
  cmake --build --preset release --parallel "$JOBS"
  rm -rf "$install_prefix"
  cmake --install "$ROOT/build/release" --prefix "$install_prefix"

  local consumer="$ROOT/build/install-consumer"
  rm -rf "$consumer"
  mkdir -p "$consumer"

  cat > "$consumer/CMakeLists.txt" <<'EOF'
cmake_minimum_required(VERSION 3.30)
project(cpp_project_consumer LANGUAGES CXX)

set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_CXX_SCAN_FOR_MODULES OFF)

find_package(cpp_project CONFIG REQUIRED)

add_executable(consumer main.cpp)
target_link_libraries(consumer PRIVATE cpp_project::library)
EOF

  cat > "$consumer/main.cpp" <<'EOF'
#include <project/library.h>

int main() {
    return project::double_value(21) == 42 ? 0 : 1;
}
EOF

  cmake -S "$consumer" -B "$consumer/build" -G Ninja \
    -DCMAKE_PREFIX_PATH="$install_prefix" \
    -DCMAKE_CXX_SCAN_FOR_MODULES=OFF
  cmake --build "$consumer/build" --parallel "$JOBS"
  "$consumer/build/consumer"
}

compiler_major_version() {
  "$1" -dumpfullversion -dumpversion | sed -E 's/^([0-9]+).*/\1/'
}

presets=(clang)

if [[ "${PROJECT_RUN_AMBIENT_GCC:-0}" = "1" ]]; then
  presets+=(gcc)
else
  echo "[INFO] PROJECT_RUN_AMBIENT_GCC=1 not set; skipping ambient GCC preset."
fi

if command -v x86_64-w64-mingw32-g++ >/dev/null 2>&1 \
  && (( $(compiler_major_version x86_64-w64-mingw32-g++) >= 15 )); then
  presets+=(mingw)
else
  echo "[INFO] x86_64-w64-mingw32-g++ with C++26 support not found; skipping MinGW preset."
fi

presets+=(release)

for p in "${presets[@]}"; do
  run_preset "$p"
done

run_install_check

echo "Build, test, and package consumer checks complete"
