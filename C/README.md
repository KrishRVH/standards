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
mise run c:portability
mise run c:standards:check
```

`c:lint` runs the Clang preset, then `c-quality.sh` checks `clang-format`,
`clangd --check` with bugprone, CERT, analyzer, portability, performance, and
focused readability checks. Compiler warnings and clang-tidy's bugprone and
analyzer findings block the gate; the broader CERT, portability, performance,
and readability findings remain advisory. `c:test` runs pinned Clang Debug with
ASan/UBSan and an optimized Release build. `c:portability` is an explicit
opt-in for available GCC, CompCert, and MinGW compilers. The test gate also
installs the package config and verifies that a tiny external CMake consumer can
link both `c_project::library` and `c_project::library_shared`.
