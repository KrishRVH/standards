# C Standards

Copy these files into a C project that uses CMake as its build authority.
Replace the neutral target names and source lists in `CMakeLists.txt` with the
project's real library, executable, and test targets.

This is a strict, systems-level generic starting template. Keep the compiler,
formatting, static-analysis, sanitizer, and cross-build checks that match the
project; relax presets or optional tools when they do not fit the real target
platform.

The standard gate is:

```sh
mise run c:fmt:check
mise run c:lint
mise run c:test
mise run c:check
```

`c:lint` runs the Clang preset, then `c-quality.sh` checks `clang-format`,
`clangd --check`, and optional `cppcheck`. `c:test` runs Clang and GCC presets,
optionally CompCert when `ccomp` is available, and optionally MinGW when the
cross compiler is available.
