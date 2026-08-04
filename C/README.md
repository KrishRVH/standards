# C99 Standards Template

This is a strict hosted C99 template for small CMake projects. It separates the
language dialect, operating-system API, and enforcement gate instead of using
“C99” as a portability claim. Its hard policy is deliberately smaller than the
set of warnings and analyzer checks the tools happen to provide.

Copy the template, replace the neutral target names and source lists, and keep
the nearby regression suite. `mise run ...` is the developer API; direct
compiler, package-manager, and analyzer invocations are diagnostic tools, not
the normal workflow.

## Profiles

Language is target-scoped with `C_STANDARD 99`, `C_STANDARD_REQUIRED YES`,
`C_EXTENSIONS NO`, and `c_std_99`. The default execution contract is hosted.
Freestanding targets need a separate project-defined profile and runtime tests.

Select one target API contract with `PROJECT_PLATFORM_PROFILE`:

| Profile      | Available API contract                           | Build definitions                                 |
| ------------ | ------------------------------------------------ | ------------------------------------------------- |
| `iso-hosted` | Hosted ISO C99 library                           | none                                              |
| `posix-2008` | Hosted C99 plus the POSIX.1-2008 namespace       | `_POSIX_C_SOURCE=200809L`, `_FILE_OFFSET_BITS=64` |
| `win32`      | Microsoft CRT and Windows 10-or-newer Win32 APIs | `_WIN32_WINNT=0x0A00`, `WINVER=0x0A00`            |

The platform definitions are private to each target by default and therefore do
not leak into dependencies. If a public header exposes `off_t` or another type
whose declaration depends on a feature macro, remove that type from the public
interface or deliberately propagate the exact macro/ABI contract to consumers.
`_FILE_OFFSET_BITS=64` is libc/ABI-specific, not ISO C or POSIX itself. Override
`PROJECT_WIN32_WINNT` only when the project deliberately changes its minimum
Windows API and runtime contract.

The gate profiles are:

| Gate                         | Status                        | Contents                                                                                                                                  |
| ---------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `mise run c:standards:check` | mandatory native              | pinned formatting, Clang warnings, direct clang-tidy, native tests, ASan/UBSan, optimized tests, package consumers, standards regressions |
| `mise run c:portability`     | mandatory when explicitly run | pinned GCC build/tests and GCC/A-B warning regressions                                                                                    |
| `mise run c:advisory`        | reviewed ratchet              | named context-sensitive clang-tidy checks; no automatic source rewrites                                                                   |
| `mise run c:mingw`           | exploratory, explicit         | MinGW-w64 compile/link only; fails if tools are absent; never runs target                                                                 |

A mandatory command never prints “skipping” and succeeds. An explicitly
invoked profile fails with a remediation message when a required compiler,
analyzer, formatter, or compilation database is missing.

## Support matrix

| Combination                                 | Claim                                                                               |
| ------------------------------------------- | ----------------------------------------------------------------------------------- |
| Linux x86-64, hosted ISO C99, Clang 22.1.8  | Native mandatory build, test, ASan/UBSan, analyzer, install, static/shared consumer |
| Linux x86-64, hosted ISO C99, GCC 15.2.0    | Extended compiler build and native tests                                            |
| Linux/glibc, POSIX.1-2008, Clang 22.1.8     | Compile/link plus regular-file and monotonic-clock runtime regressions              |
| MinGW-w64 GCC 13.0.0/MSVCRT, `win32`        | Exploratory Win32 API compile/link only; not native Windows support                 |
| MSVC, clang-cl, AppleClang, CompCert        | Unsupported by strict profiles; no C99/support claim                                |
| musl, 32-bit ABIs, freestanding, other OSes | Unverified until a named profile and continuously run fixtures are added            |

`PROJECT_ALLOW_UNVERIFIED_COMPILER=ON` permits exploratory CMake configuration
without this template's private warning policy. It does not make the compiler
supported and is never used by a mandatory preset. Unknown compilers are not
routed through GCC/Clang flags.

The MinGW profile uses its toolchain's default runtime linkage. It does not
force `-static`: CRT/runtime packaging is a deployment contract and needs a
named package plus native execution test before this template can standardize
it.

## Commands

Before a C change:

```sh
mise run c:lint
mise run c:test
```

After a C change:

```sh
mise run c:standards
mise run c:standards:check
mise run c:portability
```

Run `mise run c:advisory` when reviewing heuristic leads. Run
`mise run c:mingw` only when the MinGW-w64 cross tools are installed and the
project actually maintains that compile-only profile.

Individual gates are available for focused work:

```sh
mise run c:fmt
mise run c:fmt:check
mise run c:lint
mise run c:test
mise run c:regression
mise run c:advisory
mise run c:portability
mise run c:mingw
```

`c:lint` creates a fresh `build/clang-fast/compile_commands.json`, compiles all
owned targets under the Clang-specific warning matrix, verifies the exact
resolved clang-tidy check set, and runs `run-clang-tidy` directly over every
database translation unit. `clangd` remains useful for editor navigation and
diagnostics, but official clangd documentation says not all clang-tidy checks
run there; it is not a gate.

Each owned compiled target must call `project_apply_common`. The final
`project_assert_c_standards_applied()` call recursively rejects omissions in
owned subdirectories, and only registered targets opt into the analyzer
compilation database. After adding a reviewed third-party directory, exclude
its source path with
`project_exclude_c_standards_directory(path, "reason and upstream policy")`;
the reason is mandatory, the caller cannot exempt itself, and the exception
must never hide an owned target.
`project_apply_common` rejects interface and other noncompiled targets because
the template defines no header-only warning or platform-macro propagation
contract.
The build verifier requires every configured
warning token on every compile command. The regression matrix also observes
each warning's unpromoted diagnostic, then proves the reviewed `-Werror`
behavior. Because several compiler flags are groups, pinned
Clang `diagtool` and GCC `-Q --help=warnings` resolutions are also checked
against committed counts and hashes; drift requires review before acceptance.

`c:test` uses distinct build directories for the fast, ASan+UBSan, optimized,
and package profiles. The sanitizer profile is nonrecovering. The package gate
installs static and shared targets, then configures, builds, and runs an external
consumer of each. Build directories are removed before compiler/profile changes
so a stale CMake compiler cache cannot contaminate evidence. Before building,
the script verifies the configured compiler path/family/version, build type,
platform macros, Werror state, and sanitizer instrumentation. CTest fails when
the selected configuration registers no tests.

## Policy files

- `.clang-format` is a presentation contract for clang-format 22.1.8. The
  golden fixture covers declarations, definitions, calls, nested expressions,
  conditions, initializers, casts, preprocessing, comments, macros, and C
  function pointers. The immutable A/B inputs are intentionally excluded from
  ordinary formatting so they remain valid historical regression evidence.
- `.clang-tidy` names only checks backed by direct positive and negative
  evidence. `hard-checks.txt` records the 25 checks resolved by clang-tidy
  22.1.8, including analyzer-engine dependencies; drift fails. Unseeded checks
  remain advisory even when their names sound security-related.
- `.clang-tidy-advisory` names context-sensitive checks and
  `.clang-tidy-advisory-baseline` ratchets their normalized finding count.
- `diagnostics.toml` classifies hard, ratcheted-advisory, informational, and
  disabled categories with repair and exception policies.
- `AGENTS.md` defines the agent correction protocol and concise C correctness
  policy.
- `docs/decisions.md` records normative/tool evidence, uncertainty, baseline
  failures, and the A/B change-by-change decision.

## Return values and suppressions

Return handling follows the operation contract, not one universal checker rule:

- required output is checked at the operation or owning flush/close boundary;
- stream and snapshot reads have distinct short-read behavior;
- cleanup after an earlier failure preserves the primary error;
- a fatal diagnostic may be one cohesive best-effort write when no useful
  recovery remains.

`cert-err33-c.AllowCastToVoid=false` prevents a cast from masquerading as
handling. A deliberate best-effort exception uses the exact checker and an
adjacent reason:

```c
fprintf(stderr, "fatal: %s\n", path); // NOLINT(cert-err33-c): best effort;
                                      // primary failure already selected.
```

Do not use bare/wildcard `NOLINT`, broad file suppressions, or split one
formatted diagnostic into several writes to appease analysis. Advisory findings
are review inputs and cannot autonomously justify source changes.

## CMake customization

The neutral cache source lists are intentionally simple:

```sh
cmake --preset clang-fast \
  -DPROJECT_LIBRARY_SOURCES='src/a.c;src/b.c' \
  -DPROJECT_CLI_SOURCES='src/main.c' \
  -DPROJECT_TEST_SOURCES='tests/a_test.c;tests/b_test.c'
```

Prefer replacing these with explicit target source lists once the project shape
is known. Keep warnings, profiles, sanitizers, include paths, and feature-test
definitions target-scoped. Do not compile dependencies under the project's
private warning policy.

These files enforce a project policy. Passing tools with names such as `cert`
does not establish CERT, MISRA, CWE, ISO, or POSIX conformance.
