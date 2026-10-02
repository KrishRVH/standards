# mise Standards

Copy `config.toml` to `.config/mise/config.toml`, `tasks/hygiene` to
`.config/mise/tasks/hygiene`, and the selected `conf.d/*.toml` files to
`.config/mise/conf.d/`.

The copyable configuration requires mise `2026.6.12` or newer for structured
task references and checksum-backed HTTP tool locks. It is a minimum, not an
executable pin. A language fragment that needs a later release sets its own
`min_version`.

Use `mise run` for project workflows so a developer can build, format, or test
without knowing the underlying toolchain. Dagger is optional; when a project
keeps `conf.d/10-dagger.toml`, the isolated check task pins and invokes it.

Run host utilities such as `git`, `rg`, and `tokei` directly. Native commands
remain available for focused diagnosis. Use `mise exec -- <command>` when a
specific invocation needs the project's pinned tool or environment and no
suitable task exists. Final verification uses the project's mise gates.

`mise run` supplies its own tool environment. Interactive activation and shims
are optional choices for automatic tool selection. The WSL bootstrap enables
cached interactive activation with shims disabled; macOS keeps native runtime
paths without activation. Prompt, history, navigation, and completion tools run
directly. See the [workstation guide](../extras/workstation/README.md) for shell
defaults and latency checks.

The command surface starts strict. Keep the language tasks that fit the project
and relax or remove checks that do not match its risk, lifecycle, or team
tolerance.

Recommended project entrypoints:

```sh
mise install
mise run fmt
mise run fmt:check
mise run lint
mise run test
mise run standards
mise run standards:check
mise run hygiene
mise run secrets
mise run sbom
mise run dagger:standards:check
```

Use mise's own commands, such as `mise install`, `mise tasks`, `mise doctor`,
and `mise lock`, directly; the template does not wrap them in tasks.

`hygiene` checks the tree as it would be committed: tracked and new, non-ignored
files, including sparse and symlinked entries by name. It prints a line
inventory by category with the largest source files, so growth shows in every
run. It fails on:

- history directories such as `briefs/`, `reports/`, or `research/` at the top
  level or under `docs/`;
- leftover file names such as `main.rs.orig`, and versioned ones such as
  `parser_v2.rs`;
- handoff notes such as `HANDOFF.md`, and dated names at the top level or
  directly under `docs/`;
- literal `mise run` invocations of tasks that do not exist, including
  `//project:task` references in a monorepo.

Outside a git work tree, such as the Dagger check's copied source, it reports
that it skipped. Paths in its constants are relative to the directory it runs
in. `ALLOWED_PATHS` names externally owned trees that every rule skips.
`CONTRACT_PATHS` names paths whose version or date names follow an external
contract, such as migrations, a versioned API, or published posts; leftover and
handoff rules still apply there.

The task does not parse source code. Add language-aware rules, such as
versioned identifiers or scripts that no task runs, at the end of its checks,
using a parser or linter where practical.

The task pins its own Python through a `# MISE tools=` header, so run
`mise lock` after copying it. Keep the file executable; mise does not list a
file task without the executable bit.

`standards` applies each detected language's safe autofixes. `standards:check`
runs the CI-grade aggregate task, the
project's shared `.gitleaks.toml` secret scan, and `hygiene`. `sbom` writes a
fresh CycloneDX JSON SBOM under `sbom/` for release and audit workflows;
`SYFT_SOURCE_NAME` and `SYFT_SOURCE_VERSION` control its source metadata. If
the project includes `10-dagger.toml` and the Dagger module,
`dagger:standards:check` runs `standards:check` inside an official,
digest-pinned `mise` Linux reference container; the
[Dagger guide](../Dagger/README.md) describes its pins and source filtering.

Commit the lockfile generated for the chosen config layout. With this template's
`.config/mise/config.toml` layout, mise writes `.config/mise/mise.lock`. Use
`mise.local.toml` for machine-local overrides.

For CI, prefer an invocation-scoped strict check such as `MISE_LOCKED=1 mise
run standards:check` instead of project-wide `locked = true`, which can also
constrain tools from a developer's global mise configuration.

Language task files are additive. Keep only the `conf.d/20-*.toml` files that
match the project languages; the aggregate `fmt`, `fmt:check`, `lint`, `test`,
`standards`, and `standards:check` tasks dispatch to C#, Go, Kotlin,
Markdown/MDX, Python, Rust, Shell, Swift, and TypeScript when their project files are
detected. Markdown/MDX dispatch requires `.markdownlint-cli2.jsonc`;
TypeScript dispatch requires `package.json` plus `tsconfig.json`.
Swift dispatch requires `Package.swift`; Xcode app gates need explicit
project-specific task relationships.

Each language fragment expresses static workflow composition with native mise
dependencies and structured task references. Shared install, restore,
manifest, component, and lock prerequisites therefore execute once per
top-level language graph. Read-only independent checks may run concurrently;
formatters and tools that share mutable build state remain sequenced.

Because language fragments are optional, the generic aggregate dispatcher
discovers them at runtime. It runs detected language graphs one at a time,
preventing mixed-language projects from racing over shared package files or
build state. Its one nested `mise run` selects a task whose name is known only
after marker detection. Projects with a fixed stack should replace the
generic aggregate tasks with explicit native dependencies. The dispatcher is a
POSIX shell template verified on Linux; Windows consumers need explicit task
relationships or a reviewed `run_windows` implementation.

The TypeScript task file is Bun-only. If a project uses pnpm, Yarn, or npm,
replace it with a project-specific task file. The workflow exposes separate
Effect diagnostics and agent-oriented overview tasks.

The Markdown/MDX task file is Bun-backed for Oxfmt, markdownlint, and MDX
compiler dependencies. Local link and typo checks use pinned mise tools. The
default gate runs lychee offline so CI does not depend on external websites;
use `md:standards:check:deep` for external link checks and package audit.

The C# template enables locked package restore in project MSBuild properties:
package locks are created by default, and CI restore runs in locked mode. Lint
and test run Release builds with analyzer warnings promoted to failures.

The Rust task file reads the compiler pin from `rust-toolchain.toml`, runs every
Cargo command in workspace and locked modes, builds docs with rustdoc warnings
denied, and runs the tests with cargo-nextest plus the doctests. Its
`[tools]` pin cargo-deny through aqua and cargo-machete, cargo-nextest, and
cargo-mutants through their GitHub release binaries.

The Swift task file uses the native Swift backend and requires mise 2026.9.18
or newer. The pinned toolchain includes SwiftPM, Swift Testing, and swift-format;
OSV-Scanner audits resolved dependencies. The gate serializes the policy check,
release compilation, and tests under Thread Sanitizer with coverage, using
locked dependency resolution. Read [the Swift profile](../Swift/README.md) for
distribution-specific Linux locks and Apple-platform adoption.
