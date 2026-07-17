# Roc Standards Research

Research date: 2026-07-17 (America/Chicago)

This note records the durable decisions behind the Roc profile. Executable
configuration in `Mise/conf.d/20-roc.toml` remains the source of truth. Sources
are limited to the official Roc website and repositories and the release
metadata published by the `roc-lang` GitHub organization.

## Decision

Pin the new Roc compiler release `nightly-2026-July-15-c2d30e8`, built from
source commit `c2d30e8a076ca44fd2d98be93f63f43d7898415d`. It was the latest
packaged compiler on the research date, both official installers selected it,
and GitHub marks its release immutable. Pin each host archive through its exact
release URL and GitHub-published SHA-256 digest.

This is not a stable-version claim. Roc says it is not ready for a 0.1 release.
The nightly release notes still recommend the old compiler for compatibility,
while the current installation flow and new-compiler tutorial use the nightly
compiler. This profile deliberately serves the latter: current syntax, current
CLI behavior, and an immutable reviewed artifact.

- [Roc project status](https://github.com/roc-lang/roc/blob/c2d30e8a076ca44fd2d98be93f63f43d7898415d/README.md#L1-L11)
- [Immutable nightly release](https://github.com/roc-lang/nightlies/releases/tag/nightly-2026-July-15-c2d30e8)
- [Nightly release metadata](https://api.github.com/repos/roc-lang/nightlies/releases/tags/nightly-2026-July-15-c2d30e8)

## Toolchain artifacts

The release was published on 2026-07-15 at 10:02 UTC. The native compiler
artifacts selected by the official installers are:

| Host                | Asset                                                       | SHA-256                                                            |
| ------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------ |
| Linux ARM64         | `roc_nightly-linux_arm64-2026-07-15-c2d30e8.tar.gz`         | `294a467db4b74658b301bf7371d38e0baddc4b63a5d773bbf9540fe4f850bd19` |
| Linux x86_64        | `roc_nightly-linux_x86_64-2026-07-15-c2d30e8.tar.gz`        | `28e0869ef8c5086c24894f6e42bf7927651422736e0602d72152dbdc20cf1ea6` |
| macOS Apple Silicon | `roc_nightly-macos_apple_silicon-2026-07-15-c2d30e8.tar.gz` | `cdac850d701e75a6ae26dff86d49e6e0fe430fb07ee9892d13e63569c51b8162` |
| macOS x86_64        | `roc_nightly-macos_x86_64-2026-07-15-c2d30e8.tar.gz`        | `4d8d7e934b41c3cb1720218077fbd2acade27c7f218cc6f1530d9f03caf24aa8` |
| Windows x86_64      | `roc_nightly-windows_x86_64-2026-07-15-c2d30e8.zip`         | `6ad02fa5afb2a812658e0b09abf287acab0d7d40700dbfb244bda51350d19377` |

Every asset URL has the immutable prefix
`https://github.com/roc-lang/nightlies/releases/download/nightly-2026-July-15-c2d30e8/`.

The Unix installer supports Linux and macOS on x86_64 and ARM64, verifies the
selected archive with `sha256sum` or `shasum`, extracts it, and optionally
copies the `roc` executable into `ROC_INSTALL_DIR`. The Windows installer uses
`Get-FileHash` and `Expand-Archive`. It explicitly rejects Windows ARM64 because
that build is temporarily unavailable. Roc classifies other systems as
untested and directs them to build from source if Zig works there.

The profile declares all five published native hosts. Repository runtime
verification is scoped to Linux x64; the other declarations come from official
artifact and installer metadata and do not imply end-to-end testing here.

Sources:

- [Release assets and digests](https://api.github.com/repos/roc-lang/nightlies/releases/tags/nightly-2026-July-15-c2d30e8)
- [Unix host selection and verification](https://github.com/roc-lang/www.roc-lang.org/blob/75eff4bac26f403736235468480109b238639a26/website/public/install_roc.sh#L47-L126)
- [Windows host selection and verification](https://github.com/roc-lang/www.roc-lang.org/blob/75eff4bac26f403736235468480109b238639a26/website/public/install_roc.ps1#L65-L109)
- [Other-system support boundary](https://github.com/roc-lang/www.roc-lang.org/blob/75eff4bac26f403736235468480109b238639a26/website/content/install/other.md#L1-L12)

## Release-channel transition

`alpha4-rolling` is the latest release in the old Rust-compiler repository. Its
own notes say that most of the community uses the new-compiler nightlies, but
each new nightly still recommends the old compiler for now. This reflects a
real ecosystem transition: many published platforms still target alpha4.

The old release is a poor standards pin for this profile because it is mutable,
has different language syntax, uses `roc format` rather than `roc fmt`, and
publishes only Linux and macOS compiler archives. An exact checksum would fail
closed after replacement, but it would not make the rolling release immutable.
Projects that depend on alpha4-only platforms need a separate compatibility
decision rather than an implicit downgrade of this template.

Sources:

- [Old compiler `alpha4-rolling`](https://github.com/roc-lang/roc/releases/tag/alpha4-rolling)
- [New nightly compatibility notice](https://github.com/roc-lang/nightlies/releases/tag/nightly-2026-July-15-c2d30e8)
- [New tutorial platform status](https://github.com/roc-lang/roc/blob/c2d30e8a076ca44fd2d98be93f63f43d7898415d/docs/mini-tutorial-new-compiler.md#L696-L719)

## Compiler, formatting, and tests

The new compiler owns all generic assurance tasks:

```text
roc fmt --stdin
roc fmt --check <FILES...>
roc check main.roc --no-cache
roc test main.roc --no-cache --verbose
```

`roc fmt` applies Roc's standard formatting. The formatter intentionally has no
style configuration. `--check` is non-mutating and exits nonzero when a file
needs formatting. The mutating adapter rejects symlinks, formats each regular
source through standard input into a sibling staging file, and atomically
replaces the source only after success. The check adapter passes the same
validated project-owned paths instead of depending on the CLI's default path.

`roc check` reports problems without building or running the program. The
reviewed implementation fails on errors and exits nonzero when it finds only
warnings, so it already provides the strict warning policy wanted by this
catalog. `--no-cache` makes the gate exercise the source rather than accept a
cached result.

`roc test` runs top-level `expect` declarations in the selected module and the
modules it imports. The default execution mode is the native development
backend; `--verbose` reports individual results, and `--no-cache` forces all
tests to run again. No external formatter, linter, or test framework is needed.

- [`roc fmt` contract](https://github.com/roc-lang/roc/blob/c2d30e8a076ca44fd2d98be93f63f43d7898415d/src/cli/cli_args.zig#L687-L720)
- [`roc check` contract](https://github.com/roc-lang/roc/blob/c2d30e8a076ca44fd2d98be93f63f43d7898415d/src/cli/cli_args.zig#L344-L374)
- [`roc check` diagnostic exit behavior](https://github.com/roc-lang/roc/blob/c2d30e8a076ca44fd2d98be93f63f43d7898415d/src/cli/main.zig#L13667-L13704)
- [`roc test` contract](https://github.com/roc-lang/roc/blob/c2d30e8a076ca44fd2d98be93f63f43d7898415d/src/cli/cli_args.zig#L730-L766)
- [Formatter and `expect` tutorial](https://github.com/roc-lang/roc/blob/c2d30e8a076ca44fd2d98be93f63f43d7898415d/docs/mini-tutorial-new-compiler.md#L156-L168)

## Package shape

The template is a package root plus one exposed type module:

```text
main.roc
Project.roc
```

`main.roc` declares `package [Project] {}`. `Project.roc` follows Roc's type
module rule: a capitalized filename contains the same-named top-level nominal
type, and public operations are associated items on that type. Top-level
`expect` declarations stay beside the behavior they verify. Roc's own simple
package fixture uses this exact package-root, type-module, and inline-test
shape.

A headerless file is not the generic package baseline. The compiler turns it
into an application backed by its embedded Echo platform. That platform only
exposes `Echo.line!` and requires a `main!` accepting `List(Str)`; it is useful
for tutorials and compiler smoke tests, not a neutral reusable-library or
production-application contract. A real executable should add an application
header and an explicitly reviewed, content-addressed platform when its I/O
requirements are known.

Sources:

- [Type and package module rules](https://github.com/roc-lang/roc/blob/c2d30e8a076ca44fd2d98be93f63f43d7898415d/docs/langref/modules.md)
- [Official simple package root](https://github.com/roc-lang/roc/blob/c2d30e8a076ca44fd2d98be93f63f43d7898415d/test/package_simple_parser/main.roc)
- [Official type module with inline `expect`s](https://github.com/roc-lang/roc/blob/c2d30e8a076ca44fd2d98be93f63f43d7898415d/test/package_simple_parser/Parser.roc)
- [Embedded Echo platform contract](https://github.com/roc-lang/roc/blob/c2d30e8a076ca44fd2d98be93f63f43d7898415d/src/echo_platform/platform/main.roc)
- [Only exposed Echo operation](https://github.com/roc-lang/roc/blob/c2d30e8a076ca44fd2d98be93f63f43d7898415d/src/echo_platform/platform/Echo.roc)

## Rejected generic defaults

| Candidate                                  | Reason                                                                                         |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Stable-version claim                       | Roc explicitly has no 0.1 release yet.                                                         |
| Floating installer or `latest` URL         | It can change without a reviewed configuration diff; an exact immutable tag and digests exist. |
| `alpha4-rolling`                           | Mutable old compiler with different syntax, CLI, and host assets.                              |
| `roc format`                               | Old-compiler command; the reviewed new compiler uses `roc fmt`.                                |
| Headerless Echo app                        | Compiler convenience platform with only one output operation, not a reusable package boundary. |
| External platform                          | I/O requirements are project-specific; add one when an executable needs it.                    |
| External formatter, linter, or test runner | The compiler already owns all three contracts.                                                 |
| Windows ARM64 or unlisted hosts            | No current official Windows ARM64 asset; other systems are explicitly untested.                |

## Verification record

Research on 2026-07-17 established the following from primary sources:

- The official nightlies `latest` release and both installation scripts selected
  `nightly-2026-July-15-c2d30e8`.
- The release page marked it immutable and identified source commit `c2d30e8`.
- The release API and installer scripts agreed on all five native artifact names
  and SHA-256 digests recorded above.
- The compiler source established the `fmt`, `fmt --check`, `check`, and `test`
  command contracts and the nonzero warning behavior.
- The language reference, compiler package fixtures, and embedded Echo source
  established the package-template and headerless-app decisions.

This research did not execute the compiler archives or test non-Linux hosts.
Runtime installation, fixture behavior, lock resolution, mirror drift, and the
repository-wide gate must be reported from their actual mise command results;
they are not inferred from release metadata.
