# Odin Standards Research

Research date: 2026-07-12 (America/Chicago)

This note records the durable decisions behind the Odin profile. Executable
configuration in `Mise/conf.d/20-odin.toml` remains the source of truth.
Primary sources are the official Odin documentation, the relevant maintainers'
repositories, and mise documentation for installation and task behavior.

## Decision

Use the version-matched Odin compiler as the assurance authority: parser, style
checker, vet tool, and test runner. Pin the latest reviewed official release and
its mise lock data. Pin Clang only on Linux, where the official prebuilt
compiler uses it for linking.

Use the reviewed OLS `odinfmt` nightly as a mutating developer formatter. Keep
strict compiler checks as the non-mutating format-check and CI contract; the
formatter does not replace them. Do not add a package manager, build framework,
coverage shim, or editor service to the generic baseline.

## Toolchain

The profile pins the compiler and declares the reviewed formatter channel:

```toml
[tools]
clang = { version = "22.1.8", os = ["linux"] }
odin = "dev-2026-07a"

[tools."http:odinfmt"]
version = "nightly"
url = 'https://github.com/DanielGavin/ols/releases/download/{{ version }}/ols-{{ arch(x64="x86_64") }}-{{ os(macos="darwin", linux="unknown-linux-gnu", windows="pc-windows-msvc") }}.zip'
checksum_url = "https://api.github.com/repos/DanielGavin/ols/releases/tags/{{ version }}"
checksum_expr = 'filter(fromJSON(body).assets, { #.name == filename })[0].digest'
rename_exe = "odinfmt"
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

`odinfmt` is maintained in Daniel Gavin's OLS repository. It is not part of the
Odin compiler repository or authored by the language creator, but the official
Odin site showcases OLS under Daniel's authorship and OLS enables `odinfmt`
formatting by default. This makes it first-class ecosystem tooling rather than
an arbitrary formatter.

The latest versioned OLS release was older than the pinned compiler during this
review. OLS describes itself as early-development software that tracks Odin
`master`, and its nightly workflow builds against `master`. Adopt the reviewed
nightly for DevEx while retaining the released compiler as the sole assurance
authority.

### Reviewed nightly snapshot

The 2026-07-12 nightly is release `352679484`, published from OLS commit
`caa4450400cc0380e15a20732945f8462b0ccc31` by successful workflow run
`29181151314`. Its uploaded assets and GitHub-provided SHA-256 digests were:

| Asset                              | SHA-256                                                            |
| ---------------------------------- | ------------------------------------------------------------------ |
| `ols-arm64-darwin.zip`             | `b6f454fc35be737eccd2d1116223a35acf9b5ea0fb84cb3e3f6bcaa7dd01354a` |
| `ols-arm64-unknown-linux-gnu.zip`  | `92c07aec7bfcaac5d9b0b24b9ebe2522a6124b6407d2d05c969cedc2dd36bfdf` |
| `ols-x86_64-darwin.zip`            | `1adc40829b41af29dd9083d4cc2d7c43da5d9f92b89ec642c447b4d61a49e324` |
| `ols-x86_64-pc-windows-msvc.zip`   | `f660cd8423eaca4c0c54e64fbe11feee5deaf1a48784bc5784346c9fe5227627` |
| `ols-x86_64-unknown-linux-gnu.zip` | `c28838ffa636586d610faf5dd1ba6290fc9317e1045067c6709c6a43eb7d63b1` |

OLS publishes GNU Linux archives, not musl or FreeBSD archives. Do not infer
support for those targets from mise asset autodetection.

Each platform archive bundles both `ols` and `odinfmt` under target-qualified
names. The semantic `http:odinfmt` backend keeps `odinfmt` as mise's executable
selection hint, while `rename_exe = "odinfmt"` normalizes the selected binary.
The release API expression imports GitHub's published asset digest into the
lock. These HTTP lock features require mise 2026.6.12, which is therefore the
copyable configuration's minimum.

The more obvious GitHub-backend alias works before a lock is present. Once the
lock records the explicit `github:DanielGavin/ols` backend, a cold locked
install can lose the alias selection hint and rename the OLS server itself to
`odinfmt`. That warm-versus-cold identity failure rejects the GitHub backend for
this archive shape. The older `ubi` backend selects the right member but is
deprecated for removal in mise 2027.1.0. The HTTP archive leaves the remaining
target-qualified OLS executable on `PATH`; that low-risk extra surface is
preferable to installing the wrong program under the formatter name.

The `nightly` name is deliberately mutable. OLS runs the workflow weekly and on
manual dispatch, deletes the previous release, force-moves the `nightly` tag,
and uploads replacements at the same browser URLs. The committed mise lock
captures the reviewed asset URL and SHA-256 digest. This fails closed against
silent replacement, but it cannot keep a deleted asset available: after
rotation, a cold install can fail with a missing asset or
checksum mismatch until `mise run lock` reviews and records the new nightly.
That availability cost is the explicit tradeoff for tracking current syntax.
Because mise installs this HTTP channel under the literal `nightly` version,
relocking does not replace a warm cached install. `odin:fmt:update` couples the
reviewed relock with `mise install --force --locked http:odinfmt@nightly` so
warm and cold machines converge on the newly locked bytes.

OLS nightlies clone the moving Odin `master` separately in each platform job
and do not record that Odin commit in the release metadata. They therefore do
not provide the compiler/formatter source correspondence of matched immutable
tags. Compiler-owned style checks and gates remain authoritative.

### CLI contract and limits

- `odinfmt -w PATH` rewrites one file or recursively rewrites every `.odin`
  file under one directory. The profile does not use this write path.
- Without `-w`, one file or `-stdin` prints formatted source plus one newline
  beyond the printer output. Directory output also contains path, timing, and
  memory messages, so it is not a check mode.
- Missing paths, invalid path kinds, stdin parse failures, and directory
  read/parse failures exit nonzero. A single-file read/parse failure without
  `-w` currently falls through with exit zero, so output comparison is not a
  dependable CI contract.
- Writes rename the original to `<path>_bk`, write the replacement, and remove
  the backup after success. Rename and write errors are not propagated into the
  final status. The operation is not atomic, does not preserve Unix file modes,
  and may leave a backup while returning success.

The `odin:fmt` adapter therefore does not call `-w`. It enumerates only
Git-tracked or unignored `.odin` files under `src/project_name/` and `tests/`,
rejects symlinks, and feeds each file through `-stdin` so parser failures are
observable. It removes the CLI-only extra newline, preserves ordinary modes in
an adjacent candidate, leaves unchanged inodes alone, and atomically replaces
changed files on the same filesystem. This is intentionally POSIX-only; native
Windows remains unverified.

Keep `odin:fmt:check`, `odin:lint`, and `odin:standards:check` compiler-owned and
non-mutating because `odinfmt` has no convergence check. `odin:standards`
formats first and then runs compiler lint; the CI gate owns the test lanes.

Sources:

- [Official OLS showcase](https://odin-lang.org/showcase/ols/)
- [OLS authorship metadata](https://github.com/odin-lang/odin-lang.org/blob/master/content/showcase/ols.md#L1-L8)
- [OLS status and Odin compatibility policy](https://github.com/DanielGavin/ols/blob/caa4450400cc0380e15a20732945f8462b0ccc31/README.md#L1-L5)
- [`odinfmt` configuration](https://github.com/DanielGavin/ols/blob/caa4450400cc0380e15a20732945f8462b0ccc31/README.md#L139-L178)
- [`odinfmt` CLI and write implementation](https://github.com/DanielGavin/ols/blob/caa4450400cc0380e15a20732945f8462b0ccc31/tools/odinfmt/main.odin#L14-L170)
- [Current nightly release](https://github.com/DanielGavin/ols/releases/tag/nightly)
- [Current nightly API metadata and digests](https://api.github.com/repos/DanielGavin/ols/releases/352679484)
- [Successful nightly workflow run](https://github.com/DanielGavin/ols/actions/runs/29181151314)
- [Nightly build and packaging workflow](https://github.com/DanielGavin/ols/blob/caa4450400cc0380e15a20732945f8462b0ccc31/.github/workflows/release.yml#L1-L264)
- [Mutable release implementation](https://github.com/DanielGavin/ols/blob/caa4450400cc0380e15a20732945f8462b0ccc31/.github/actions/github-release/main.js#L32-L103)
- [mise HTTP backend](https://mise.jdx.dev/dev-tools/backends/http.html)
- [mise GitHub backend](https://mise.jdx.dev/dev-tools/backends/github.html)
- [mise lockfiles](https://mise.jdx.dev/dev-tools/mise-lock.html)
- [mise 2026.6.12 release](https://github.com/jdx/mise/releases/tag/v2026.6.12)
- [Deprecated mise `ubi` backend](https://mise.jdx.dev/dev-tools/backends/ubi.html)
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
| `odinfmt` as a CI/style authority   | It has no check mode, can return success after some failures, and tracks a different parser snapshot.  |
| `strip-semicolon` in `fmt`          | It can rewrite files outside the requested package.                                                    |
| Fixed test thread count or seed     | It removes parallel and randomized coverage already made reproducible by the reported seed.            |
| `ODIN_TEST_SHORT_LOGS=true`         | Optional house output policy; upstream CI does not need it.                                            |
| MemorySanitizer or ThreadSanitizer  | Host and instrumentation requirements are not generic.                                                 |
| Coverage threshold                  | No native Odin coverage surface owns the result.                                                       |
| Stack protector on test executables | It hardens a disposable runner, not a shipped artifact. Add it to real build tasks.                    |
| Documentation smoke task            | `odin doc` cannot deny missing documentation, and the template has no documentation artifact consumer. |
| Multi-package test aggregator       | The template has only one test package.                                                                |

## Verification record

The implementation was exercised through repository-owned mise tasks on Linux
x64 with the pinned compiler and Clang:

- Strict source and external-test package checks passed.
- Debug AddressSanitizer tests passed with bad-memory failure tracking.
- Optimized tests passed.
- Manifest drift proved task and source mirrors byte-for-byte equal.
- Scratch research confirmed that `strip-semicolon` rewrites an imported
  sibling package, which is why the formatting task does not invoke it.
- Isolated mise 2026.6.12 and 2026.7.5 probes proved that the semantic HTTP
  declaration locks GitHub's SHA-256 digests, installs without live resolution
  under strict lock mode, and exposes the archive's actual formatter as
  `odinfmt`. No provenance record is available, so the published checksum is the
  committed integrity boundary.
- A cold locked GitHub-alias probe exposed the OLS server under the `odinfmt`
  name, which is the installer failure behind the HTTP declaration. Generic
  cross-platform locking also mapped GNU archives onto musl entries; those
  entries do not establish musl compatibility, so the fixture lock targets only
  verified Linux x64.
- Write-path probes confirmed that formatting changed a file mode from `0755`
  to `0644`, and that failed rename and write operations on a read-only path
  produced no diagnostic and exited zero.
- Adapter fault injection proved real reformatting preserved mode `0755`, a
  second run left the formatted inode unchanged, and malformed, read-only, and
  symlink inputs failed without changing the original or leaving candidates.

Re-run `mise run standards:check` after every toolchain or policy change.
