# Odin Standards Research

Research date: 2026-07-12 (America/Chicago)

This note records the durable decisions behind the Odin profile. Executable
configuration in `Mise/conf.d/20-odin.toml` remains the source of truth.
Primary sources are the official Odin documentation and creator-maintained
repositories, plus mise documentation for installation and task behavior.

## Decision

Use the version-matched Odin compiler as the parser, style checker, vet tool,
and test runner. Pin the latest reviewed official release and its mise lock
data. Pin Clang only on Linux, where the official prebuilt compiler uses it for
linking.

Do not add a package manager, build framework, coverage shim, editor service, or
third-party formatter to the generic baseline. None removes enough real
complexity to justify another moving part.

## Toolchain

The profile pins:

```toml
[tools]
clang = { version = "22.1.8", os = ["linux"] }
odin = "dev-2026-07a"
```

`dev-2026-07a` was the latest official release on the research date. It
resolves to commit `819fdc7a80667498b8b365999f1475a66c358640`. The committed
fixture lock records the exact Linux x64 release URL and SHA-256 digest; it does
not claim independent provenance beyond the lock data.

The official installation contract is host-specific:

- Linux and other supported Unix releases require Clang for linking.
- macOS requires the Xcode command-line tools.
- Windows requires MSVC and the Windows SDK.
- The tagged release has no FreeBSD asset even though the compiler supports
  FreeBSD targets and AddressSanitizer.

This repository verifies the Linux x64 fixture. Other hosts require their own
end-to-end verification.

Sources:

- [Official release](https://github.com/odin-lang/Odin/releases/tag/dev-2026-07a)
- [Official installation guide](https://odin-lang.org/docs/install/)
- [mise lockfiles](https://mise.jdx.dev/dev-tools/mise-lock.html)
- [mise OS-scoped tools](https://mise.jdx.dev/dev-tools/#os-specific-tools)

## Compiler policy

Odin's own check script and CI use:

```text
-vet
-vet-tabs
-strict-style
-vet-style
-warnings-as-errors
-disallow-do
```

The profile preserves that set and adds `-vet-using-param`. The extra flag is
a repository house rule, not part of Odin's canonical strict set. Compiler help
describes `using` parameters as bad practice outside immediate refactoring,
which matches this catalog's preference for visible data flow.

`-vet-cast` is not repeated because `-vet` already includes cast checks.
`-vet-unused-procedures` is not generic because a reusable library can export
procedures that it does not call internally.

Sources:

- [Odin `check_all.sh`](https://github.com/odin-lang/Odin/blob/819fdc7a80667498b8b365999f1475a66c358640/check_all.sh)
- [Vet flag composition](https://github.com/odin-lang/Odin/blob/819fdc7a80667498b8b365999f1475a66c358640/src/build_settings.cpp#L305-L361)
- [`using` parameter help](https://github.com/odin-lang/Odin/blob/819fdc7a80667498b8b365999f1475a66c358640/src/main.cpp#L3315-L3318)

## Formatting

The compiler has no `fmt` command. Its native `strip-semicolon` command
traverses every parsed package and can rewrite imported collection files, so it
is unsafe as a generic project-scoped formatter.

The released `odinfmt` considered during research lagged current compiler
syntax, had no stable check-only contract, and made broader policy choices than
this catalog could safely adopt. A floating nightly would weaken the exact
toolchain pin.

Therefore `odin:fmt` and `odin:fmt:check` are non-mutating aliases of the
strict compiler check. Formatting remains manual until a versioned formatter
can reliably limit writes to project-owned files.

Sources:

- [Compiler command list](https://github.com/odin-lang/Odin/blob/819fdc7a80667498b8b365999f1475a66c358640/src/main.cpp#L303-L316)
- [`strip-semicolon` implementation](https://github.com/odin-lang/Odin/blob/819fdc7a80667498b8b365999f1475a66c358640/src/main.cpp#L3460-L3635)

## Tests and assurance

Tests use an external package under `tests/` and import the library through a
named `project:` collection. This exercises the public package boundary while
keeping the fixture small.

The required lanes are:

1. Strict checks for the library and test packages.
2. Native tests with `-debug` and `-sanitize:address`.
3. The same tests under `-o:speed`.

Both test lanes use `ODIN_TEST_FANCY=false` for CI-safe output and
`ODIN_TEST_FAIL_ON_BAD_MEMORY=true` so the runner's tracked leaks and invalid
frees fail the test. This matches Odin's own CI.

The profile deliberately retains the runner's default parallelism and fresh
per-run random seed. Odin reports the seed, so a failure remains reproducible
without giving up concurrency and randomized coverage in every normal run.

AddressSanitizer is the only generic sanitizer lane. MemorySanitizer and
ThreadSanitizer have narrower platform and instrumentation requirements.
Coverage is omitted because Odin has no native compiler or runner coverage
contract.

Sources:

- [Official testing guide](https://odin-lang.org/docs/testing/)
- [Odin CI](https://github.com/odin-lang/Odin/blob/819fdc7a80667498b8b365999f1475a66c358640/.github/workflows/ci.yml)
- [Testing controls](https://github.com/odin-lang/Odin/blob/819fdc7a80667498b8b365999f1475a66c358640/core/testing/doc.odin)
- [Sanitizer validation](https://github.com/odin-lang/Odin/blob/819fdc7a80667498b8b365999f1475a66c358640/src/build_settings.cpp#L2579-L2613)

## Package shape

Odin packages are directories. The template uses:

```text
src/project_name/
tests/
```

One flat external test package is enough for the current graph. When a project
gains multiple test packages, use Odin's documented root `@require import`
aggregator and `-all-packages`; adding it before that boundary exists would be
speculative structure.

Odin intentionally has no official package manager. Projects should prefer
`core:` and `vendor:`, then vendor reviewed third-party source at a fixed
revision when needed. The generic template therefore invents no manifest,
dependency audit, or update service.

Sources:

- [Packages](https://odin-lang.org/docs/overview/#packages)
- [Multiple-package tests](https://odin-lang.org/docs/testing/#multiple-packages)
- [Official package-manager position](https://odin-lang.org/docs/faq/#is-there-an-official-odin-package-manager)

## Rejected generic defaults

| Candidate                           | Reason                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Floating latest/nightly compiler    | Dated releases contain breaking changes; exact releases and lock data exist.                           |
| Required `ols` or `odinfmt`         | Early or release-lagging tools add a second parser without a safe stable formatting contract.          |
| `strip-semicolon` in `fmt`          | It can rewrite files outside the requested package.                                                    |
| Fixed test thread count or seed     | It removes parallel and randomized coverage already made reproducible by the reported seed.            |
| `ODIN_TEST_SHORT_LOGS=true`         | Optional house output policy; upstream CI does not need it.                                            |
| MemorySanitizer or ThreadSanitizer  | Host and instrumentation requirements are not generic.                                                 |
| Coverage threshold                  | No native Odin coverage surface owns the result.                                                       |
| Stack protector on test executables | It hardens a disposable runner, not a shipped artifact. Add it to real build tasks.                    |
| Documentation smoke task            | `odin doc` cannot deny missing documentation, and the template has no documentation artifact consumer. |
| 100-column editor hint              | Neither the compiler nor official editor configuration enforces it.                                    |
| Multi-package test aggregator       | The template has only one test package.                                                                |

## Verification record

The implementation was exercised through repository-owned mise tasks on Linux
x64 with the pinned compiler and Clang:

- Strict source and external-test package checks passed.
- Debug AddressSanitizer tests passed with bad-memory failure tracking.
- Optimized tests passed.
- Manifest drift proved task and source mirrors byte-for-byte equal.
- Scratch research confirmed that `strip-semicolon` rewrites an imported
  sibling package, which is the safety boundary behind the non-mutating format
  task.

Re-run `mise run standards:check` after every toolchain or policy change.
