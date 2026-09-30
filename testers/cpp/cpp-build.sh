#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JOBS="${JOBS:-$(getconf _NPROCESSORS_ONLN 2> /dev/null || nproc 2> /dev/null || echo 4)}"
readonly XWIN_CRT_VERSION="14.44.17.14"
readonly XWIN_SDK_VERSION="10.0.26100"
readonly MSVC_FLAGS=(/W4 /permissive- /EHsc /Zc:__cplusplus /WX)

fail() {
  echo "$*" >&2
  exit 1
}

compiler_major_version() {
  "$1" -dumpfullversion -dumpversion | sed -E 's/^([0-9]+).*/\1/'
}

# Configures and builds a preset from a clean directory; cross presets skip CTest
# because their executables cannot run here.
run_preset() {
  local preset="$1"
  shift
  echo "----------------------------------------------------"
  echo "Running preset: $preset"
  echo "----------------------------------------------------"

  cmake -E remove_directory "$ROOT/build/$preset"
  cmake --preset "$preset" "$@"
  cmake --build --preset "$preset" --parallel "$JOBS"

  if [[ "$preset" != "mingw" && "$preset" != "msvc" ]]; then
    ctest --preset "$preset" --no-tests=error
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

  cat > "$consumer/CMakeLists.txt" << 'CMAKE'
cmake_minimum_required(VERSION 3.30)
project(cpp_project_consumer LANGUAGES CXX)

set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_CXX_SCAN_FOR_MODULES OFF)

find_package(cpp_project CONFIG REQUIRED)

add_executable(consumer main.cpp)
target_link_libraries(consumer PRIVATE cpp_project::library)
CMAKE

  cat > "$consumer/main.cpp" << 'CPP'
#include <project/library.h>

int main() {
    return project::double_value(21) == 42 ? 0 : 1;
}
CPP

  cmake -S "$consumer" -B "$consumer/build" -G Ninja \
    -DCMAKE_PREFIX_PATH="$install_prefix" \
    -DCMAKE_CXX_SCAN_FOR_MODULES=OFF
  cmake --build "$consumer/build" --parallel "$JOBS"
  "$consumer/build/consumer"
}

# Splats the pinned MSVC CRT and Windows SDK into the user cache once, shared by
# every checkout, and prints the sysroot path. Runs in a command substitution,
# so every failure exits explicitly.
msvc_sysroot() {
  local sysroot="${XDG_CACHE_HOME:-$HOME/.cache}/xwin/crt-$XWIN_CRT_VERSION-sdk-$XWIN_SDK_VERSION"

  if [[ ! -d "$sysroot" ]]; then
    [[ "${XWIN_ACCEPT_LICENSE:-}" == "true" ]] ||
      fail "cpp:msvc downloads the MSVC CRT and Windows SDK; set XWIN_ACCEPT_LICENSE=true to accept Microsoft's license (https://go.microsoft.com/fwlink/?LinkId=2086102)."
    # Download, unpack, and splat beside the final directory: xwin moves files
    # between them, which fails across filesystems such as a tmpfs /tmp.
    msvc_work="$sysroot.partial.$$"
    trap 'rm -rf -- "$msvc_work"' EXIT
    mkdir -p "$msvc_work"
    xwin --cache-dir "$msvc_work/download" --log-level warn \
      --crt-version "$XWIN_CRT_VERSION" --sdk-version "$XWIN_SDK_VERSION" \
      splat --use-winsysroot-style --preserve-ms-arch-notation --output "$msvc_work/splat" >&2 ||
      fail "xwin could not splat the MSVC CRT and Windows SDK into $msvc_work"
    # Publish only a complete splat; a concurrent run may have published first.
    mv -T "$msvc_work/splat" "$sysroot" 2> /dev/null || [[ -d "$sysroot" ]] ||
      fail "could not publish the splat to $sysroot"
  fi
  printf '%s\n' "$sysroot"
}

run_msvc() {
  local compile_database="$ROOT/build/msvc/compile_commands.json"
  local sysroot
  local flag

  sysroot="$(msvc_sysroot)"
  run_preset msvc -DPROJECT_MSVC_SYSROOT="$sysroot"
  for flag in "${MSVC_FLAGS[@]}"; do
    if grep -F '"command"' "$compile_database" | grep -Fv -- " $flag " > /dev/null; then
      fail "$compile_database has a command without the MSVC branch flag $flag"
    fi
  done
}

mode="${1:-default}"
case "$mode" in
  default)
    run_preset clang
    run_preset release
    run_install_check
    ;;
  portability)
    presets=()
    command -v g++ > /dev/null 2>&1 && presets+=(gcc)
    if command -v x86_64-w64-mingw32-g++ > /dev/null 2>&1 &&
      (($(compiler_major_version x86_64-w64-mingw32-g++) >= 10)); then
      presets+=(mingw)
    fi
    ((${#presets[@]} > 0)) || fail "No GCC or C++20-capable MinGW compiler found."
    for preset in "${presets[@]}"; do
      run_preset "$preset"
    done
    ;;
  msvc)
    run_msvc
    ;;
  *)
    echo "Usage: $0 [default|portability|msvc]" >&2
    exit 2
    ;;
esac

echo "C++ $mode checks complete"
