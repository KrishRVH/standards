# C++ Standards

Copy these files into a C++ project that uses CMake 3.30+ as its build authority.
Replace the neutral project names and source lists in `CMakeLists.txt` with the
project's real library, executable, and test targets.

The baseline is intentionally dependency-manager agnostic. Use Conan, vcpkg,
FetchContent, or system packages only after the project has a concrete
dependency policy.

The standard gate is:

```sh
mise run cpp:fmt:check
mise run cpp:lint
mise run cpp:test
```

`cpp:lint` runs compiler warnings, `clangd --check --clang-tidy`, and optional
`cppcheck` when it is installed. Debug presets enable ASan/UBSan for the pinned
LLVM `clang++` build from mise's `pkgx:llvm.org` backend. Set
`PROJECT_RUN_AMBIENT_GCC=1` to also run the optional host `g++` preset.
