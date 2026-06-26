# C Standards

Copy these files into a C project that uses CMake as its build authority.
Replace the neutral target names and source lists in `CMakeLists.txt` with the
project's real library, executable, and test targets.

This is a strict, systems-level generic starting template. Keep the compiler,
formatting, static-analysis, sanitizer, and cross-build checks that match the
project; relax presets or optional tools when they do not fit the real target
platform.

The standards workflow is:

```sh
mise run c:standards
mise run c:fmt:check
mise run c:lint
mise run c:test
mise run c:standards:check
```

`c:lint` runs the Clang preset, then `c-quality.sh` checks `clang-format`,
`clangd --check` with bugprone, CERT, analyzer, portability, and focused
readability checks, and optional `cppcheck`. `c:test` runs the pinned Clang
preset, optional ambient GCC when `PROJECT_RUN_AMBIENT_GCC=1`, optional CompCert
when `ccomp` is available, and optional MinGW when the cross compiler is
available. The ASan/UBSan debug presets use default leak detection on supported
hosts. The test gate also installs the package config and verifies that a tiny
external CMake consumer can link both `c_project::library` and
`c_project::library_shared`.
