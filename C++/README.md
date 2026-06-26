# C++ Standards

Copy these files into a C++ project that uses CMake 3.30+ as its build authority.
Replace the neutral project names and source lists in `CMakeLists.txt` with the
project's real library, executable, and test targets.

This is a strict, systems-level generic starting template. Keep the checks that
match the project and shave down presets, warnings, or optional tools when they
do not fit the actual target platform or team tolerance.

The baseline is intentionally dependency-manager agnostic. Use Conan, vcpkg,
FetchContent, or system packages only after the project has a concrete
dependency policy.

The standard is intentionally C++20: targets require `cxx_std_20`, compiler
extensions are disabled, and the presets do not provide newer-language opt-ins.

The standards workflow is:

```sh
mise run cpp:standards
mise run cpp:fmt:check
mise run cpp:lint
mise run cpp:test
mise run cpp:standards:check
```

`cpp:lint` runs compiler warnings, `clangd --check --clang-tidy`, and optional
`cppcheck` when it is installed. Debug presets enable ASan/UBSan for the pinned
LLVM `clang++` build from mise's `pkgx:llvm.org` backend. Set
`PROJECT_RUN_AMBIENT_GCC=1` to also run the optional host `g++` preset. The
ASan/UBSan debug presets use default leak detection on supported hosts. The test
script also installs the CMake package config and verifies that a tiny external
CMake consumer can link `cpp_project::library`.
