# Fortran Standards

Copy these files into a modern Fortran project and run the tasks through
`mise`.

This is a strict, systems-level generic starting template. It assumes new
free-form Fortran, not fixed-form legacy maintenance. Relax checks only when a
project has a clear compiler, platform, or dependency reason.

## Tooling

```sh
mise run fortran:standards
mise run fortran:fmt:check
mise run fortran:manifest
mise run fortran:lint
mise run fortran:test
mise run fortran:doc
mise run fortran:standards:check
```

The baseline pins `fpm`, GNU Fortran, Findent, fortls, and FORD through mise.
`fpm.toml` disables implicit typing and implicit external interfaces, uses
free-form source, and pins the test framework to an immutable Git revision
because fpm does not provide a project lockfile equivalent to Cargo or Composer.

The standards check verifies Findent formatting for Git-tracked and non-ignored
`.f90` and `.F90` sources, rejects fixed-form source extensions, rejects
wildcard and branch dependencies, builds and tests with GNU Fortran warnings
promoted to errors, parses source through fortls debug diagnostics, and
generates API documentation with FORD.

## Policy

- Prefer Fortran 2018-compatible code until a project deliberately requires
  newer compiler support.
- Use `implicit none`, `private` module defaults, explicit `public` exports, and
  `use, intrinsic :: iso_fortran_env` for portable kinds and units.
- Keep source in `src/`, applications in `app/`, tests in `test/`, and generated
  output in `build/`.
- Use `.f90` for ordinary free-form source and `.F90` only when preprocessing is
  intentional.
- Avoid fixed-form `.f`, `.for`, `.ftn`, and implicit-interface-era style in new
  code.
- Prefer small explicit modules over global state. Keep procedures pure or
  elemental when the contract is naturally side-effect-free.
- Pin fpm Git dependencies by `tag` or `rev`; do not use wildcard registry
  versions or moving branches in reusable baselines.
- Put public API documentation in FORD comments near the symbol being
  documented, and keep `mise run fortran:doc` in the standards check.

## Copy Notes

Rename `project_name` in `fpm.toml`, module names, test names, and docs before
using this as a real project. Add project-specific compiler flags, preprocessors,
OpenMP/MPI metapackages, BLAS/LAPACK, or additional compilers deliberately in
the project copy rather than in this generic standard.
