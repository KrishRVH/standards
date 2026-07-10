#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JOBS="${JOBS:-$(getconf _NPROCESSORS_ONLN 2> /dev/null || nproc 2> /dev/null || echo 4)}"

run_preset() {
  local preset="$1"
  echo "----------------------------------------------------"
  echo "Running preset: $preset"
  echo "----------------------------------------------------"

  cmake --preset "$preset"
  cmake --build --preset "$preset" --parallel "$JOBS"

  # Skip running Windows binaries by default
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
    -DPROJECT_ENABLE_SANITIZERS=OFF \
    -DPROJECT_BUILD_SHARED=ON \
    -DPROJECT_INSTALL=ON \
    -DCMAKE_INSTALL_LIBDIR=lib
  cmake --build --preset release --parallel "$JOBS"
  rm -rf "$install_prefix"
  cmake --install "$ROOT/build/release" --prefix "$install_prefix"

  local consumer="$ROOT/build/install-consumer"
  rm -rf "$consumer"
  mkdir -p "$consumer"

  cat > "$consumer/CMakeLists.txt" << 'EOF'
cmake_minimum_required(VERSION 3.20)
project(c_project_consumer LANGUAGES C)

find_package(c_project CONFIG REQUIRED)

add_executable(consumer_static main.c)
target_link_libraries(consumer_static PRIVATE c_project::library)

add_executable(consumer_shared main.c)
target_link_libraries(consumer_shared PRIVATE c_project::library_shared)
set_target_properties(consumer_shared PROPERTIES
  BUILD_RPATH "$<TARGET_FILE_DIR:c_project::library_shared>"
)
EOF

  cat > "$consumer/main.c" << 'EOF'
#include <project/library.h>

int main(void)
{
    return project_add(2, 3) == 5 ? 0 : 1;
}
EOF

  cmake -S "$consumer" -B "$consumer/build" -G Ninja \
    -DCMAKE_PREFIX_PATH="$install_prefix"
  cmake --build "$consumer/build" --parallel "$JOBS"
  "$consumer/build/consumer_static"
  "$consumer/build/consumer_shared"
}

mode="${1:-default}"
case "$mode" in
  default)
    presets=(clang release)
    ;;
  portability)
    presets=()
    command -v ccomp > /dev/null 2>&1 && presets+=(compcert)
    command -v gcc > /dev/null 2>&1 && presets+=(gcc)
    command -v x86_64-w64-mingw32-gcc > /dev/null 2>&1 && presets+=(mingw)
    if ((${#presets[@]} == 0)); then
      echo "No CompCert, GCC, or MinGW C compiler found." >&2
      exit 1
    fi
    ;;
  *)
    echo "Usage: $0 [default|portability]" >&2
    exit 2
    ;;
esac

for p in "${presets[@]}"; do
  run_preset "$p"
done

if [[ "$mode" == "default" ]]; then
  run_install_check
fi

echo "C $mode checks complete"
