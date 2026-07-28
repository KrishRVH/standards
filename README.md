# Standards

Standards is a copy-from catalog for formatting, linting, static analysis,
tests, dependency hygiene, and repeatable CI gates. It is not an installable
package. Root files maintain the catalog; `shared/`, `Mise/`, `Dagger/`, and the
language folders contain the files meant for downstream projects.

The templates deliberately start strict and stay close to their ecosystems.
Treat them as high-signal baselines, then narrow or remove rules that do not fit
the project's risk, lifecycle, domain, or team tolerance. Their conventional
layouts, nearby contracts, explicit side effects, actionable failures, and
deterministic commands also give agents enough local evidence to make and verify
changes without relying on unwritten knowledge.

## What Lives Where

- `shared/` contains generic top-level project files: `AGENTS.md`, `CLAUDE.md`,
  `.gitattributes`, `.gitleaks.toml`, and `.gitignore`.
- `extras/workstation/` contains optional personal workstation bootstrap
  scripts.
- `Mise/` contains the `.config/mise` templates that define the developer
  command surface.
- `Dagger/` contains the optional Dagger module used by the explicit
  `dagger:standards:check` mise task.
- `C/`, `C#/`, `C++/`, `Elixir/`, `Fortran/`, `GDScript/`, `Go/`, `Haskell/`,
  `Kotlin/`, `Lua/`, `Markdown/`, `Odin/`, `PHP/`, `Python/`, `Roc/`, `Rust/`,
  `Shell/`, `SPARK/`, `TS/`, and `Zig/` contain the language and tooling
  templates.
- `testers/` contains small, standalone fixtures that prove every language
  template through the documented mise layout. Each fixture commits its
  `.config/mise/mise.lock` so Linux tool resolution remains deterministic.
- Root `AGENTS.md`, `.gitignore`, `.gitattributes`, and `.config/mise/` govern
  this repository; they are not defaults to copy into a new project. The root
  is an explicit mise monorepo over `testers/*`, keeps separate fixture
  lockfiles, and limits the monorepo scheduler to two top-level fixture jobs.
  Its `.config/mise/mise.lock` pins the Biome alternative verifier, gitleaks,
  Python, and the root Markdown and Shell tools. `bun.lock` pins the Markdown
  JavaScript dependencies.
- `standards.manifest.toml` is the profile map agents and the root gate use to
  locate canonical templates, tester fixtures, task fragments, and exact mirror
  files.

## Copying a Baseline

Start with the shared files:

```sh
cp shared/AGENTS.md /path/to/project/AGENTS.md
cp shared/CLAUDE.md /path/to/project/CLAUDE.md
cp shared/.gitattributes /path/to/project/.gitattributes
cp shared/.gitleaks.toml /path/to/project/.gitleaks.toml
cp shared/.gitignore /path/to/project/.gitignore
```

The scripts at `extras/workstation/macbook-setup.sh` and
`extras/workstation/wsl-setup.sh` are optional personal workstation bootstraps.
They install mise, so they are the explicit exception to the mise-only project
command surface. Read the relevant script before running it directly on the
target machine.

Copy the mise baseline next:

```text
Mise/config.toml   -> .config/mise/config.toml
Mise/conf.d/*.toml -> .config/mise/conf.d/
```

Keep only the language `conf.d` files the project needs. A PHP and TypeScript
project, for example, would keep `20-php.toml` and `20-ts.toml`.

Projects that need isolated Dagger checks should also copy the task fragment
and module:

```text
Mise/conf.d/10-dagger.toml -> .config/mise/conf.d/10-dagger.toml
Dagger/dagger.json          -> dagger.json
Dagger/dagger/              -> dagger/
```

Finally, copy the matching language templates:

- `C/`: CMake presets, Clang formatting and static-analysis configuration, and
  helper scripts.
- `C#/`: strict .NET formatting, analyzer and central package configuration,
  locked restore, and Release build and test defaults.
- `C++/`: an idiomatic C++20 CMake library, CLI, and test template with Clang
  format and tidy configuration, sanitizer presets, and an opt-in GCC/MinGW
  portability lane.
- `Elixir/`: a Mix baseline with formatter, Credo, optional Dialyzer, xref
  cycle checks, docs, coverage, dependency audits, and project-specific
  Phoenix/Sobelow overlays.
- `Fortran/`: an fpm baseline with free-form source, implicit typing and
  implicit external disabled, Findent formatting, strict GNU Fortran warning
  gates, fortls parser diagnostics, test-drive tests, FORD docs, and an fpm
  dependency pin policy.
- `GDScript/`: a Godot 4.7 baseline with typed GDScript warnings, GDToolkit
  formatting and linting, native headless import, parse/type and resource-load
  checks, and a small dependency-free test entrypoint.
- `Go/`: a Go module baseline with gofumpt, module hygiene, `go vet`, a custom
  restricted-dialect analyzer, golangci-lint, govulncheck, tests, race,
  coverage, and benchmark tasks.
- `Haskell/`: a Cabal/GHCup baseline with GHC2024, Ormolu, HLint, warnings as
  errors in the local gate, named Haddock/source-distribution tasks, and
  optional freeze support.
- `Kotlin/`: a Gradle Kotlin/JVM baseline with ktlint, Detekt, warnings as
  errors, dependency locking, and dependency-verification generation tasks.
- `Lua/`: a Lua 5.4 baseline with StyLua, Luacheck, LuaLS, and optional Busted
  tests.
- `Markdown/`: a Bun-backed Markdown/MDX baseline with Prettier formatting,
  markdownlint structure checks, semantic YAML frontmatter validation, MDX
  compile checks through remark/rehype and Shiki, offline local link checks with
  lychee, and low-noise typo checks with typos.
- `Odin/`: OLS `odinfmt` nightly with fail-closed, project-scoped writes,
  strict compiler style and vet checks, an external consumer test package,
  native tests with reported reproduction seeds, and debug AddressSanitizer
  plus optimized test lanes.
- `PHP/`: PHP 8.5 Composer and quality-tool configuration for PHPUnit, PHPStan,
  Rector, PHPCS/Slevomat, PHPMD, ShipMonk dependency analysis, Composer audit,
  and Roave security advisories.
- `Python/`: `pyproject` and uv-based configuration for Ruff, basedpyright,
  Bandit, pytest/coverage, wheel and source builds, plus optional deeper mypy,
  dependency, documentation, complexity, slots, and dead-code checks.
- `Roc/`: an immutable new-compiler nightly with official checksum-backed host
  assets, native formatting, warning-failing checks, and top-level `expect`
  tests through the development backend.
- `Rust/`: Cargo, rustfmt, Clippy, rustdoc/doctest, locked workspace, and
  `cargo package` and `cargo-deny` dependency-policy defaults.
- `Shell/`: a Bash-first glue-code baseline with shfmt, ShellCheck, parser
  checks, Bats tests, and a shebang policy for project-owned scripts.
- `SPARK/`: an Alire-backed SPARK/Ada baseline with exact GNAT/GPRbuild,
  GNATprove, and GNATformat tool dependencies, warning-as-error builds, proof
  warnings and unproved checks treated as failures, and tiny executable tests.
- `TS/`: Effect-first, Bun-backed TypeScript with strict `tsc`, Effect Schema
  boundaries and diagnostics, tests, ESLint plus Prettier as Option A, and a
  pinned one-file Biome configuration as Option B.
- `Zig/`: `build.zig` and `build.zig.zon` with `zig fmt`, strict
  Debug/ReleaseSafe compile checks, tests, and release-variant tasks.

The copyable files use neutral project names, conventional `src` and `tests`
directories, and generic package namespaces. Replace those placeholders when a
project uses a different layout or architectural boundary. Package identity,
author, maintainer, copyright, license, and publication metadata must match the
project's actual legal and release posture.

## Deciding What to Keep

A template is a strict seed, not a finished architecture. Begin with the
ecosystem-native formatter, compiler or type checker, test runner, and lockfile
policy. Keep a dependency advisory gate when the ecosystem has a dependable,
high-signal native option. Otherwise, retain the native integrity controls and
choose project-specific auditing after adoption. Style-only rules, coverage
policy, release profiles, and heavier optional analyzers can wait until the
project has taken shape.

Applications and CLIs should usually commit lockfiles, pin toolchains exactly,
and run audits in CI. Libraries may need wider runtime version ranges, different
release profiles, and narrower public API gates. Existing projects should adopt
strict checks through reviewed suppressions or CI ratchets instead of broadly
disabling rules to get a green build.

The aggregate mise tasks detect marker files to keep the defaults copyable.
Monorepos and mixed-tooling repositories should replace that generic dispatcher
with explicit, project-specific task dependencies or narrower markers.

The copyable configuration requires mise `2026.6.12` or newer for structured
task references and checksum-backed HTTP tool locks. This repository's root
requires `2026.7.0` or newer for the explicit monorepo per-project lockfile
policy. Both are minimum versions, not pins on the mise executable.

## One Command Surface

Developer and CI entrypoints go through mise:

```sh
mise run install
mise run fmt
mise run fmt:check
mise run lint
mise run test
mise run standards
mise run standards:check
mise run secrets
mise run sbom
```

`mise run standards` applies available safe autofixes, then runs each detected
language's local workflow. `mise run standards:check` runs the CI-grade
aggregate gate and the shared `.gitleaks.toml` secret scan. The catalog does not
include a hosted workflow or impose its runner costs; downstream projects can
attach the same command to their chosen provider.

`mise run sbom` writes an optional CycloneDX JSON SBOM under `sbom/`. Set
`SYFT_SOURCE_NAME` and `SYFT_SOURCE_VERSION` when its release metadata should
differ from the directory name and default `0.0.0` version. With the Dagger
template installed, `mise run dagger:standards:check` runs `standards:check` in
an official, digest-pinned `mise` Linux reference container while keeping task
definitions in mise.

After copying the templates:

1. Remove language task files that do not apply.
2. Adjust package names, namespaces, source directories, and test directories.
3. Run `mise run install`.
4. Run `mise run standards`.
5. Run `mise run standards:check`.
6. Commit the resulting lockfiles, including the mise lockfile written for the
   chosen configuration layout, such as `.config/mise/mise.lock`, and any
   package-manager lockfiles the project uses.

## Maintaining the Catalog

Run the repository's full local gate before handing off a change:

```sh
mise run standards:check
```

The gate scans the repository for secrets; checks the pinned Biome alternative,
drift, Markdown, and Shell; and runs every tester fixture for C, C#, C++,
Elixir, Fortran, GDScript, Go, Haskell, Kotlin, Lua, Markdown/MDX, Odin, PHP,
Python, Roc, Rust, Shell, SPARK/Ada, TypeScript, and Zig through
`standards:check`. These include audits, proof, package, and slower quality
gates. When a template changes, update its fixture and refresh the affected
lockfiles so the copied layout remains proven.

Root mise discovers fixture tasks through the explicit `testers/*` monorepo
configuration roots and schedules two top-level fixture jobs at a time.
`[monorepo] lockfile = false` keeps each committed fixture lockfile beside its
standalone configuration. The root runner uses one child mise process for the
path wildcard because the current stable validator does not resolve monorepo
paths in native task relationships; that child still uses mise's scheduler and
project-attributed output.

For an opt-in isolated proof without a hosted workflow, run the representative
Python fixture through its existing Dagger entrypoint:

```sh
mise run testers:standards:check:isolated
```

The drift portion of the root gate runs `scripts/check-standards-drift.py`. It
keeps shared task fragments, aggregate task dispatch, fixture configurations,
Dagger fragments, full-configuration shared files, and declared mirror files in
sync. Undeclared fixture source and tests remain free to stay tiny.

When adding or changing a standards profile:

1. Update `standards.manifest.toml`.
2. Add or update the matching `testers/<profile>` fixture.
3. Keep every declared mirror path byte-for-byte aligned.
4. Refresh the affected fixture lockfiles.
5. Run `mise run standards:drift` and `mise run standards:check`.
