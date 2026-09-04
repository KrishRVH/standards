# Language standards audit

Reviewed September 4, 2026, from commit
`c23c72da3581e329a257cd4ef8b1bb3c99f1360f`. The main audit covers Rust,
TypeScript, Shell, Python, Go, and C#: copyable configuration, agent guidance,
mise tasks, dependency locks, tester behavior, and workflow governance.
Repo-wide Polish and OCD finishing passes follow the repairs.

Three independent `gpt-6-astra` reviewers at `max` reasoning worked read-only.
Material findings were challenged against source and executable probes before
repair. The starting grade was **B**: broad gates passed while several
suppression, discovery, and resource-lifetime contracts remained unproved.
No Critical defect was established.

## Findings and action

| Severity | Finding                                                                                                                                                  | Repair and discriminating evidence                                                                                                                                                                                                                 |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High     | Cargo workspace members could omit lint inheritance and lose the profile's restrictions.                                                                 | The [policy scanner](../../Rust/tests/allow_policy.rs) reads every actual workspace member's manifest. Root and nested packages fail without `[lints] workspace = true` and pass after inheriting.                                                 |
| Medium   | Rust's scanner rejected fixed documentation attributes containing macro values.                                                                          | Accept `#[doc = $description]`; continue rejecting forwarded attribute names and conditional suppression emission. Acceptance and rejection cases exercise the same token parser.                                                                  |
| Medium   | Rust's library-adaptation instructions left its mandatory Mutex probe broken.                                                                            | Change the ownership doctrine, disallowed types, and negative probe together. Document the Linux process-group prerequisites.                                                                                                                      |
| Medium   | TS's raw scanner lost comments after interpolated templates, backtick-containing regexes, and JSX; ranged line ESLint directives also escaped detection. | Use the already installed TypeScript ESLint parser's comment ranges. Real comments fail while directive-shaped template and JSX text pass. Batch the CLI cases to avoid repeated parser startup.                                                   |
| Medium   | A queued UI replacement could start after its owner cancelled during the old finalizer.                                                                  | An identity token revokes pending replacement synchronously. [Tests](../../testers/ts/tests/effect-publication-controller.test.ts) cover cancellation, awaited interruption, finalizer ordering, and overlapping replacements.                     |
| Medium   | The client helper stopped owning cancellation after fetch headers arrived.                                                                               | One AbortController spans fetch and body consumption. [Tests](../../testers/ts/tests/effect-client-api-boundary.test.ts) verify timeout and interruption after headers for success and error responses, underlying abort, and exact failure class. |
| Medium   | Python missed prefixed/stacked suppressions, alternate Coverage spellings, and compact or disguised mutmut ranges.                                       | Validate each comment fragment and mutmut's first effective marker. Native consumer probes established the bypasses; canonical reasoned forms and whitespace variants remain accepted.                                                             |
| Medium   | Shell discovery mishandled quoted/newline filenames, hid enumeration errors, and passed leading-dash paths as options.                                   | Capture one successful NUL-delimited snapshot and prefix tool-facing paths with `./`. Bats regressions cover Git/non-Git names, corrupt indexes, and leading-dash scripts and test files.                                                          |
| Medium   | Go's explicit file lists bypassed gofumpt's native exclusions.                                                                                           | Use directory traversal. The regression preserves vendor/testdata and gofmt-clean generated source while still detecting and repairing first-party formatting. Generated files retain base gofmt checks.                                           |
| Medium   | Go's module check downloaded dependencies first, repairing missing checksums before validation.                                                          | Check tidiness before downloads. A real missing-checksum probe fails without changing `go.sum`; explicit tidy repairs it and the graph then passes.                                                                                                |
| Medium   | C#'s verifier missed compact Stryker directives that disabled a range.                                                                                   | Detect the native parser's broader forms, then require the canonical reasoned one-shot form. New negative self-tests fail before repair; a canonical spacing variation remains accepted.                                                           |
| Low      | Always-loaded guides repeated scanner internals, exact settings, and fixed review-panel rituals.                                                         | Shorten Rust, TS, Python, and C# guidance; add local Go and Shell fragments. Keep detailed contracts in existing code and references, and size independent review to risk. All twelve TS boundary routes remain.                                   |

The regression cases above were observed failing before their production
repairs. Existing scanner, policy, transaction, and mutation tests remain.
Go's fixture uses three specific gosec exceptions for fixed temporary-file
paths and fixed mise tasks; it accepts no external paths or shell command text.
Its disposable project includes the committed tool lock and forces locked
resolution, so the regression exercises the CI installation contract locally.

The [Cargo Book](https://doc.rust-lang.org/cargo/reference/workspaces.html#the-lints-table)
documents member opt-in. Suppression behavior was checked against installed
consumers and primary implementations, including
[Ruff's parser](https://github.com/astral-sh/ruff/blob/0.16.4/crates/ruff_linter/src/noqa.rs),
[Coverage defaults](https://github.com/nedbat/coveragepy/blob/7.15.4/coverage/config.py),
and [Stryker.NET's comment parser](https://github.com/stryker-mutator/stryker-net/blob/dotnet-stryker%404.16.0/src/Stryker.Core/Stryker.Core/Mutants/CsharpNodeOrchestrators/CommentParser.cs).

## Stable toolchain refresh

Latest releases were checked against official release APIs and package
registries on the audit date. Source pins and generated fixture locks move
together. Unchanged current versions are included to distinguish a verified
hold from a missed upgrade.

| Profile | Landed baseline                                                                                                                                                    | Source                                                                                                                                                                                                                                         |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rust    | Rust 1.98.1; syn 3.0.5; toml 1.1.5. Cargo-deny 0.20.2, cargo-machete 0.9.2, and cargo-mutants 27.1.0 remain current.                                               | [Rust 1.98.1](https://blog.rust-lang.org/2026/09/03/Rust-1.98.1/), [Cargo configuration](../../Rust/Cargo.toml), [tasks](../../Mise/conf.d/20-rust.toml)                                                                                       |
| TS      | Bun 1.4.1, Stryker core 10.0.0, Oxlint 1.81.0, Oxfmt 0.66.0, ESLint 10.10.0, typescript-eslint 8.69.0, Knip 6.34.0, and current compatible companion packages.     | [Bun release](https://github.com/oven-sh/bun/releases/tag/bun-v1.4.1), [Stryker release](https://github.com/stryker-mutator/stryker-js/releases/tag/v10.0.0), [exact manifest](../../TS/package.json)                                          |
| Python  | Python 3.14.7 remains current; uv 0.12.9, Ruff 0.16.6, Coverage 7.16.0, Hypothesis 6.167.1. The remaining declared tools were checked and remain current.          | [Python release](https://www.python.org/downloads/release/python-3147/), [uv release](https://github.com/astral-sh/uv/releases/tag/0.12.9), [project configuration](../../Python/pyproject.toml)                                               |
| Shell   | shfmt 3.14.0; ShellCheck 0.11.0 and Bats 1.14.0 remain current. Interpreter selection remains the script's declared host dialect.                                  | [shfmt release](https://github.com/mvdan/sh/releases/tag/v3.14.0), [tasks](../../Mise/conf.d/20-shell.toml)                                                                                                                                    |
| Go      | Go 1.27.1 with language level 1.27; golangci-lint 2.13.2 and govulncheck 1.7.0. gofumpt 0.11.0 and BoringLint v0.9.5 remain current.                               | [Go release](https://go.dev/doc/devel/release#go1.27.1), [BoringLint release](https://github.com/KrishRVH/boringlint/releases/tag/v0.9.5), [tasks](../../Mise/conf.d/20-go.toml)                                                               |
| C#      | .NET SDK 10.0.400 and C# 14 remain stable. MSTest.Sdk 4.4.0, Meziantou 3.0.203, Roslynator 5.0.0, and stable StyleCop 1.1.118. Stryker.NET 4.16.0 remains current. | [.NET release metadata](https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/10.0/releases.json), [package pins](../../C%23/Directory.Packages.props), [StyleCop stable](https://www.nuget.org/packages/StyleCop.Analyzers/1.1.118) |

The four automatic template workflows and the manual root workflow now pin
[mise 2026.9.1](https://github.com/jdx/mise/releases/tag/v2026.9.1). Configuration
minimums remain compatibility floors. The root workflow stays manual-only.

Compatibility decisions:

- **TypeScript stays on 6.0.3.** The current Effect language service 0.87.2 and
  typescript-eslint 8.69.0 reject TS 7. Disposable probes reproduced both
  failures. Adding a second compiler would complicate the profile; upgrade
  when those consumers support the compiler and the gate passes.
- **Stryker now runs entirely under Bun.** Core 10 fixes the earlier Babel
  interop failure. Its full fixture passes with Bun runner 1.3.8, although that
  runner's declared core peer range still names version 9. Keep the tested
  pairing covered during future upgrades. The separate Node tool pin is removed.
- **StyleCop uses its stable release.** The former 1.2 beta was unnecessary
  for the sole enabled SA1404 rule. Stable 1.1.118 passed real negative analyzer
  probes and the full .NET 10/C# 14 fixture.
- **BoringLint is already latest.** GitHub releases, tags, and the Go proxy
  agree on v0.9.5. Rebuilding it under Go 1.27.1 proves generic methods fail
  with the intended diagnostic while package-level generic functions pass.
  `mise run go:tools:rebuild` refreshes Go-built analyzers after compiler
  upgrades, including installations already present in a warm tool cache.
- **The Bun age gate remains three days.** The requested latest stable pins
  included packages younger than that window. One explicit mise lock-refresh
  task disabled the delay for this update; committed install policy has no
  exception or permanent relaxation. Frozen installs use the reviewed lock.

## Repo-wide finishing

Polish reads every active human-maintained path, with canonical files and
byte-verified mirrors accounted for separately. Generated locks and dependency,
build, cache, coverage, and release output are excluded from hand editing.
Historical research retains its date and attribution; the swarm record now
points to the current review-sizing decision.

Additional repairs found during finishing and validation:

- **High:** a failed Fortran formatter could erase source and report success.
  Inner shells now stop on failure. Fault injection proves source preservation,
  nonzero status, and a successful formatter control.
- **Medium:** C++, Haskell, Zig, and Fortran hid failed Git enumeration behind
  successful consumers. Direct capture now propagates failure, including the
  Fortran manifest's fixed-form check. C++ uses clang-format's native check;
  a formatter failure on empty source can no longer pass through `cmp`.
  Fault injection fails while healthy and deleted-file controls pass.
- **Medium:** the macOS bootstrap's Rust install command could update an
  existing compiler despite the update opt-out. Installation now uses
  `--no-update`; the explicit update step retains ownership. An isolated Bats
  regression checks installed/missing toolchains with the update flag on/off.
- **Medium:** MDX validation preloaded every Shiki grammar, causing two
  aggregate test timeouts. Load encountered grammars on demand and retain
  unknown labels as plain text. Known, aliased, unknown, and unlabeled fences
  remain accepted; malformed MDX still fails. The test timeout stays unchanged.
  An independent eleven-case comparison against Shiki's
  [default grammar loading](https://github.com/shikijs/shiki/blob/main/packages/rehype/src/index.ts)
  measured valid checks at 100-199 ms, down from 2.1-3.5 seconds on this host.
- **Low:** the secondary TS workflow's scratch project inherited the root's
  Markdown runtime. It now copies the TS mise configuration and tool lock, so
  ESLint and Prettier validation use the same Bun 1.4.1 as the primary profile.
- **Low:** Python's optional deep gate exposed an imprecise regex-group type.
  Annotating the required reason capture as `str` satisfies strict mypy
  without a cast or suppression; the complete deep gate passes.
- **Low:** correct C's `argc == 0` explanation: reading the guaranteed null
  `argv[0]` is valid; using it as a program-name string is not. Correct shfmt's
  zsh rationale to experimental/incomplete support, and remove stale guide
  routing and scheduler-count descriptions.

Both finishing ledgers account for all **827 active paths**: 783 maintained
files and 44 generated tool/dependency locks. Every maintained file received
an end-to-end read, or a canonical read followed by byte verification of its
mirror. Dependency, build, cache, coverage, and release output remain excluded.

OCD classified ordering regions across the same inventory. Manifest path
arrays now sort true peers; Python suppression cases group by their consumer;
normalizers own whitespace. Parsed manifest contracts and all 29 Python cases
are unchanged. Execution order, overrides, matching rules, narrative order,
and historical attribution remain intact. No unresolved scope mismatch or
placement decision was found. Correctness repairs above belong to the audit,
separate from these behavior-preserving organization changes.

## Verification and limits

All development checks use mise. Installation and advisory checks used network
access through mise tasks. The final locked aggregate passed in 91 seconds:
`MISE_LOCKED=1 mise run standards:check`.

| Check                                                          | Result                                 |
| -------------------------------------------------------------- | -------------------------------------- |
| Six audited fixture gates after upgrades                       | Passed                                 |
| Added scanner, lifecycle, discovery, and verifier regressions  | Failed before repair; passed afterward |
| Go checksum and BoringLint compatibility probes                | Passed negative and positive cases     |
| Additional C, C++, Fortran, Haskell, and Zig fixture gates     | Passed                                 |
| Python optional deep gate and root Shell checks                | Passed                                 |
| Drift, Markdown, secondary ESLint/Prettier, and aggregate gate | Passed; all 21 profiles                |
| Repo-wide Polish and OCD                                       | Complete; 827 paths accounted for      |

TS's full mutation score is 68.99 against its unchanged floor of 66. The sample
still has survivors and uncovered mutants; this audit does not claim every
mutant is killed. Rust, Python, and C# retain their complete fixture mutation
checks. Transaction locks, report validation, exact floor arithmetic, and
resource ownership remain because they protect demonstrated failure modes.

Verification is on Linux. Hosted CI, branch protection, production services,
non-Linux runtime behavior, and the optional Dagger lane were not exercised.
Static gates and independent review provide evidence, not a proof of every
architectural claim. Final grade: **A-**. The demonstrated defects are repaired,
all required checks pass, and the documented compiler/runner compatibility
holds remain explicit follow-up conditions.
