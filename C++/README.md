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

## Source conventions

`.clang-format` is the formatting authority. Its layout is a deliberate
readability choice, not a claim that one C++ house style is universal.

`.clang-tidy` enforces this hybrid convention for language identifiers:

- Types, concepts, and template parameters use `UpperCamelCase`.
- Namespaces, functions, methods, variables, parameters, constants, and
  enumerators use `lower_snake_case`.
- Private and protected data members have a trailing underscore.

Keep macros `UPPER_SNAKE_CASE`, give them a project-specific prefix, and reserve
them for header guards and unavoidable platform or build boundaries.

Use `.cpp` for implementations and `.h` for interfaces. Public headers are
self-contained, include what they use, and use a deterministic guard derived
from their installed include path. An implementation includes its own header
first. The semantic check parses sources and headers so missing header
dependencies and semantic diagnostics fail close to their declarations.

## API contracts

- Prefer values and RAII. Use `std::unique_ptr` for transferred exclusive
  ownership and `std::shared_ptr` only for a genuinely shared lifetime. Raw
  pointers and references are non-owning.
- Prefer return values to output parameters. For multiple results, use a small
  named result type unless a conventional pair is immediately clear. Use output
  or in/out parameters only when identity, buffer reuse, interop, or measured
  performance justifies them.
- Use values for cheap independent inputs, `const T&` for required call-scoped
  borrows, and `T&` for required mutation. Use pointers for optional values,
  retained aliases, or interop boundaries; document nullability, direction,
  lifetime, and failure-state behavior.
- Prefer `std::string_view` and `std::span` for call-scoped borrowed input when
  they clarify the interface or avoid copying or pointer/count pairs. Retained
  borrows must make the owner's lifetime visible in the type or nearby
  documentation. Copy when lifetime safety is uncertain.
- Document the concurrency model of public stateful types when concurrent use
  is plausible. State whether distinct instances or one shared instance may be
  used concurrently, which operations synchronize, and whether callers must
  provide external synchronization. Do not infer thread safety from `const`.
- Use `[[nodiscard]]` for status/result values and other results whose discard
  is likely a bug, not as blanket decoration.
- Keep public APIs small, explicit, and strongly typed. Use comments for
  contracts, ownership, units, lifetime, and non-obvious decisions rather than
  narrating the implementation.

## Errors and assertions

- Choose and document the failure model for each API. Do not represent the same
  failure inconsistently through sentinels, output flags, status values, and
  exceptions. Use `std::optional` when absence is the only expected non-success
  result, a project result/status type for expected failures requiring
  diagnostics, and exceptions for exceptional failures where the surrounding
  code is exception-safe. Do not add a universal result dependency before a
  real API needs one.
- Assertions enforce programmer preconditions and internal invariants. They
  never validate untrusted input and contain no required side effects.
- Keep exceptions available, preserve invariants when they escape, and write
  `noexcept` only when correct and when termination is the intended response to
  an escaping exception. Use an explicit error model at no-exception, C ABI,
  hard-real-time, or similar boundaries.
- Reusable libraries do not terminate, log, or print for recoverable external
  failures. Reserve process termination for a documented process policy or an
  invariant breach from which continuing would be unsafe.

## Abstraction and low-level boundaries

- Start with concrete types and direct functions. Introduce templates only for
  real compile-time variation, and constrain public templates when constraints
  express a useful contract or improve diagnostics. Use virtual dispatch for an
  open runtime family and `std::variant` for a small closed family. Use type
  erasure only at a justified compile-time, binary-size, ABI, or dependency
  seam. Do not add generic or polymorphic machinery for one concrete case. RTTI
  remains available when runtime hierarchy navigation is the clearest design.
- Prefer `std::array`, `std::span`, iterators, variadic templates, and
  `std::bit_cast` over C arrays, unchecked pointer arithmetic, C varargs, and
  union punning. When representation work, C/ABI interoperability, or measured
  constraints require lower-level operations, confine them to a small boundary,
  encode bounds, lifetime, and alignment nearby, and cover the boundary with
  focused tests and sanitizers.
- Avoid casts. When conversion is necessary, use the narrowest named C++ cast
  and isolate and explain `reinterpret_cast`. Never cast away `const` to mutate
  an originally const object. A const-incorrect C API may be wrapped with a
  localized, documented `const_cast` only when the API guarantees no mutation.
- Use `auto` when the initializer makes the type obvious or spelling the type
  adds noise. Spell the type when it communicates intent, ownership, precision,
  or a required conversion, and preserve `const`, `&`, and `*` deliberately.
- Avoid mutable global state and non-trivial static initialization. Keep
  unavoidable process-wide state behind a narrow interface.
- Make single-argument constructors and conversion operators `explicit` unless
  implicit conversion is a deliberate part of the type's contract. Do not use
  using-directives; keep using-declarations out of header namespace scope.
- Omit `default` when a switch intentionally handles every value of a closed
  enum so newly added enumerators trigger compiler diagnostics. Keep an explicit
  unknown-value path for open integer, serialized, protocol, or externally
  supplied values.

## Performance and validation

- Start with standard containers and straightforward data layouts. Choose a
  specialized container, allocator, or representation when its semantics are
  required.
  Performance-driven deviations require representative optimized profiling or
  benchmarks against the current implementation. Evaluate allocations, memory
  footprint, invalidation guarantees, worst-case inputs, and relevant
  architectures. Keep a benchmark only when the performance property is an
  ongoing contract.
- Fuzz parsers, decoders, protocol handlers, and other untrusted-byte boundaries
  with appropriate sanitizers; retain minimized failures as regression tests or
  corpus inputs. Run TSan separately for code with shared mutable state, atomics,
  locks, or concurrent data structures. Add neither workflow until the
  corresponding boundary exists.

The standards workflow is:

```sh
mise run cpp:standards
mise run cpp:fmt:check
mise run cpp:lint
mise run cpp:test
mise run cpp:portability
mise run cpp:standards:check
```

`cpp:lint` runs compiler warnings and `clangd --check --clang-tidy`. The
clang-tidy profile curates bugprone, CERT, C++ Core Guidelines, modernize,
performance, portability, and readability checks, removes known noisy rules,
and blocks on every remaining finding. `cpp:test` runs pinned LLVM `clang++`
Debug with ASan/UBSan and an optimized Release build. `cpp:portability` is an
explicit opt-in for available GCC and MinGW compilers. The test script also
installs the CMake package config and verifies that a tiny external CMake
consumer can link `cpp_project::library`.

The provided checks exercise Clang, GCC, and MinGW. The MSVC configuration is
not exercised; a project claiming native MSVC support must add a native Windows
build, test, install, and consumer gate.
