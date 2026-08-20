# Standards

Copy only the parts your project needs. This repository is a catalog, not an
installable package. Its templates cover formatting, linting, static analysis,
tests, dependency hygiene, and repeatable CI gates.

Each template starts strict but stays close to its ecosystem. Use it as a
high-signal baseline. Then narrow or remove rules that do not fit the project's
risk, lifecycle, domain, or team tolerance.

The copied baseline should also give agents enough local evidence to work
without unwritten instructions. It favors conventional layouts, nearby
contracts, explicit side effects, actionable failures, and deterministic
commands.

## Adoption Model

Treat this repository as a source catalog. Do not copy it wholesale or keep a
permanent dependency on it. An agent that adopts these standards must:

1. Inspect the target repository and identify its actual languages, tools,
   workflows, and release surfaces.
2. Copy the shared baseline and only the language or tooling profiles that
   match those surfaces.
3. Merge the relevant language-specific `AGENTS.md` fragments into the copied
   `shared/AGENTS.md`.
4. Review every copied file line by line. Keep each rule, pattern, task, tool,
   dependency, detector, and instruction only when it applies to the target
   repository.
5. Remove unused ecosystem coverage wherever it appears. Check agent guides,
   attributes, ignore rules, mise configuration and task fragments, workflows,
   documentation, and tool configuration. This list is illustrative, not
   exhaustive.
6. Adapt paths, package metadata, policies, and verification tasks to the
   target repository, then run its copied mise gates.

The finished baseline must describe the target repository, not the full
catalog. `shared` means broadly reusable, not universally applicable. For
example, a TypeScript-only repository must remove Haskell patterns, tasks,
outputs, tools, and guidance from every copied file that contains them. Apply
the same test to every language, tool, workflow, and policy outside the target
repository's surface. Keep cross-cutting rules such as secret scanning and Git
guidance when they still apply.

## What to Copy

- `shared/` provides generic top-level project files: `AGENTS.md`, `CLAUDE.md`,
  `.gitattributes`, `.gitleaks.toml`, and `.gitignore`.
- `Mise/` provides the `.config/mise` templates and the developer command
  surface.
- `Dagger/` provides the optional module behind the explicit
  `dagger:standards:check` mise task.
- Each language or tooling folder contains one of the profiles listed below.
- `extras/workstation/` holds optional personal workstation bootstrap scripts.

The root files maintain the catalog. The small standalone projects under
`testers/` prove each language template through the documented mise layout.
Each fixture commits `.config/mise/mise.lock` for deterministic Linux tool
resolution. `standards.manifest.toml` maps profiles to their canonical
templates, tester fixtures, task fragments, and exact mirror files.

Root `AGENTS.md`, `.gitignore`, `.gitattributes`, and `.config/mise/` govern
this repository; they are not project defaults.

## Create a Project Baseline

### 1. Copy the shared files

Start with the files shared across ecosystems:

```sh
cp shared/AGENTS.md /path/to/project/AGENTS.md
cp shared/CLAUDE.md /path/to/project/CLAUDE.md
cp shared/.gitattributes /path/to/project/.gitattributes
cp shared/.gitleaks.toml /path/to/project/.gitleaks.toml
cp shared/.gitignore /path/to/project/.gitignore
```

### 2. Add the mise tasks

Copy the mise configuration into its conventional location:

```text
Mise/config.toml   -> .config/mise/config.toml
Mise/conf.d/*.toml -> .config/mise/conf.d/
```

Keep only the language fragments from `conf.d` that the project uses. For
example, a PHP and JavaScript project would retain `20-php.toml` and
`20-js.toml`.

The copyable configuration requires mise `2026.6.12` or newer for structured
task references and checksum-backed HTTP tool locks. This is a minimum
version, not a pin on the mise executable.

### 3. Add Dagger isolation if needed

Projects that need isolated Dagger checks should also copy the task fragment
and module:

```text
Mise/conf.d/10-dagger.toml -> .config/mise/conf.d/10-dagger.toml
Dagger/dagger.json          -> dagger.json
Dagger/dagger/              -> dagger/
```

### 4. Choose the profiles

Copy each language or tooling folder that the project needs:

- `C/` — CMake presets, Clang formatting and static-analysis configuration,
  and helper scripts.
- `C#/` — pinned .NET and Microsoft Testing Platform configuration, strict
  compiler and analyzer policy, central package management, locked restore,
  application-boundary guidance, Release build and test defaults, a banned-API
  wall, mutation testing, and the agent-driven doctrine shared with the Rust,
  TS, and Python profiles ([research record](docs/research/agent-swarms.md)).
- `C++/` — an idiomatic C++20 CMake library, CLI, and test template with Clang
  format and tidy configuration, sanitizer presets, and an opt-in GCC/MinGW
  portability lane.
- `Elixir/` — a Mix baseline with formatter, Credo, optional Dialyzer, xref
  cycle checks, docs, coverage, dependency audits, and project-specific
  Phoenix/Sobelow overlays.
- `Fortran/` — an fpm baseline with free-form source, implicit typing and
  implicit external disabled, Findent formatting, strict GNU Fortran warning
  gates, fortls parser diagnostics, test-drive tests, FORD docs, and an fpm
  dependency pin policy.
- `GDScript/` — a Godot 4.7 baseline with typed GDScript warnings, GDToolkit
  formatting and linting, native headless import, parse/type and resource-load
  checks, and a small dependency-free test entrypoint.
- `Go/` — a Go module baseline with gofumpt, module hygiene, `go vet`, a custom
  restricted-dialect analyzer, golangci-lint, govulncheck, tests, race,
  coverage, and benchmark tasks.
- `Haskell/` — a Cabal/GHCup baseline with GHC2024, Ormolu, HLint, warnings as
  errors in the local gate, named Haddock/source-distribution tasks, and
  optional freeze support.
- `JS/` — Bun-backed JavaScript with first-class Biome formatting and linting,
  strict compiler analysis through `checkJs` in `jsconfig.json`, dependency
  auditing, and Bun tests.
- `Kotlin/` — a Gradle Kotlin/JVM baseline with ktlint, Detekt, warnings as
  errors, dependency locking, and dependency-verification generation tasks.
- `Lua/` — a Lua 5.4 baseline with StyLua, Luacheck, LuaLS, and optional Busted
  tests.
- `Markdown/` — a Bun-backed Markdown/MDX baseline with Prettier formatting,
  markdownlint structure checks, semantic YAML frontmatter validation, MDX
  compile checks through remark/rehype and Shiki, offline local link checks
  with lychee, and low-noise typo checks with typos.
- `Odin/` — OLS `odinfmt` nightly with fail-closed, project-scoped writes,
  strict compiler style and vet checks, an external consumer test package,
  native tests with reported reproduction seeds, and debug AddressSanitizer
  plus optimized test lanes. Its [decision record](docs/research/odin.md)
  explains the checksum-locked mutable formatter channel and compiler-owned CI
  contract.
- `PHP/` — PHP 8.5 Composer and quality-tool configuration for PHPUnit,
  PHPStan, Rector, PHPCS/Slevomat, PHPMD, ShipMonk dependency analysis,
  Composer audit, and Roave security advisories.
- `Python/` — `pyproject` and uv-based configuration for Ruff, basedpyright,
  Bandit, pytest/coverage, deptry, Hypothesis property tests, mutmut mutation
  testing, a banned-API wall, wheel and source builds, plus optional deeper
  mypy, documentation, complexity, slots, and dead-code checks. Shares the
  agent-driven doctrine and
  [research record](docs/research/agent-swarms.md) with Rust, TS, and C#.
- `Roc/` — an immutable new-compiler nightly with official checksum-backed
  host assets, native formatting, warning-failing checks, and top-level
  `expect` tests through the development backend. Its
  [decision record](docs/research/roc.md) explains the reviewed nightly and
  package-shape choices.
- `Rust/` — Cargo, rustfmt, Clippy, rustdoc/doctest, locked workspace,
  `cargo package` and `cargo-deny` dependency-policy defaults, mutation
  testing, and an agent-driven development doctrine grounded in the
  [agent-swarm research record](docs/research/agent-swarms.md).
- `Shell/` — a Bash-first glue-code baseline with shfmt, ShellCheck, parser
  checks, Bats tests, and a shebang policy for project-owned scripts.
- `SPARK/` — an Alire-backed SPARK/Ada baseline with exact GNAT/GPRbuild,
  GNATprove, and GNATformat tool dependencies, warning-as-error builds, proof
  warnings and unproved checks treated as failures, and tiny executable tests.
- `TS/` — selectively Effect-enabled, Bun-backed TypeScript with strict `tsc`,
  Effect Schema boundaries and diagnostics, semantic and negative tests,
  mutation testing and knip gates, automatic CI, ESLint plus Prettier as
  Option A, and a separately tested pinned Biome configuration as Option B.
  Shares the Rust profile's agent-driven doctrine and the
  [agent-swarm research record](docs/research/agent-swarms.md).
- `Zig/` — `build.zig` and `build.zig.zon` with `zig fmt`, strict
  Debug/ReleaseSafe compile checks, tests, and release-variant tasks.

A language folder may also contain an `AGENTS.md`. Those files are merge
fragments, not standalone guides: copy `shared/AGENTS.md` first, then merge the
language sections into it.

### 5. Adapt the baseline

The copyable files use neutral project names, conventional `src` and `tests`
directories, and generic package namespaces. Replace those placeholders when
the project uses a different layout or architectural boundary. Package
identity, author, maintainer, copyright, license, and publication metadata must
match the project's legal and release posture.

A template is a strict seed, not a finished architecture. Begin with the
ecosystem-native formatter, compiler or type checker, test runner, and lockfile
policy. Keep a dependency advisory gate when the ecosystem provides a
dependable, high-signal option. Otherwise, keep its native integrity controls
and choose project-specific auditing after adoption. Style-only rules,
coverage policy, release profiles, and heavier optional analyzers can wait
until the project has taken shape.

Applications and CLIs should usually commit lockfiles, pin toolchains exactly,
and run audits in CI. Libraries may need wider runtime version ranges,
different release profiles, and narrower public API gates. Existing projects
should adopt strict checks through reviewed suppressions or CI ratchets. Do not
broadly disable rules only to get a green build.

The aggregate mise tasks use marker files so the defaults remain copyable.
Monorepos and mixed-tooling repositories should replace this generic dispatcher
with explicit project-specific task dependencies or narrower markers.

### Optional: set up a workstation

The personal bootstrap scripts are at
`extras/workstation/macbook-setup.sh` and
`extras/workstation/wsl-setup.sh`. They install mise, so they are the explicit
exception to the mise-only project command surface. Read the relevant script
before you run it directly on the target machine.

### 6. Verify the copied baseline

1. Remove language task files that do not apply.
2. Adjust package names, namespaces, source directories, and test directories.
3. Run `mise run install`.
4. Run `mise run standards`.
5. Run `mise run standards:check`.
6. Commit the resulting lockfiles. These include the mise lockfile for the
   chosen configuration layout, such as `.config/mise/mise.lock`, and any
   package-manager lockfiles the project uses.

## Use Mise for Development and CI

Developers and CI use the same command surface:

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

`mise run standards` applies the available safe autofixes, then runs the local
workflow for each detected language. `mise run standards:check` runs the
CI-grade aggregate gate and scans for secrets with the shared
`.gitleaks.toml`.

The root `.github/workflows/quality.yml` supports manual dispatch only. Use
targeted local gates for routine catalog maintenance. Use the aggregate gate
for releases, CI, and cross-cutting validation. Dispatch hosted runs on demand
to control CI spending.

The Rust, TypeScript, C#, and Python profiles each contain a copyable
workflow for downstream projects. Those run automatically for pull requests,
merge-queue groups, and pushes to `main`, and also support manual dispatch.
All the workflows use the same locked command surface and pin the locally
tested mise `2026.7.15`. The lower configuration minimums remain
compatibility floors.

The downstream repository host must protect merges with all of these settings:

- require the copied workflow's `quality` job;
- require review from Code Owners;
- dismiss stale approvals when new commits are pushed; and
- disallow bypass of the ruleset or branch protection.

The latest-push approval option is useful defense in depth, but it does not
replace stale-approval dismissal because that approver need not be the code
owner. Committed YAML cannot configure these host settings. Expensive
project-specific integration or deployment checks may remain separate, but
they do not replace the fast, static, deterministic gate.

`mise run sbom` writes an optional CycloneDX JSON SBOM under `sbom/`. Set
`SYFT_SOURCE_NAME` and `SYFT_SOURCE_VERSION` when its release metadata should
differ from the directory name and default `0.0.0` version.

If the Dagger template is installed, `mise run dagger:standards:check` runs
`standards:check` in an official, digest-pinned `mise` Linux reference
container. The task definitions remain in mise.

## Maintain the Catalog

The repository root requires mise `2026.7.0` or newer for its explicit
per-project lockfile policy in the monorepo. This is a minimum version, not a
pin on the mise executable. The root `.config/mise/mise.lock` pins the Biome
alternative verifier, gitleaks, Python, and the root Markdown and Shell tools.
`bun.lock` pins the Markdown JavaScript dependencies.

Before you hand off a change, check each surface that changed. For a changed
profile, read its `tester` and `task_prefix` from `standards.manifest.toml` and
run:

```sh
mise run //<tester>:<task-prefix>:standards:check
```

These fixture gates include audits, proof, package checks, and slower quality
checks. When you change a template, update its fixture and refresh the affected
lockfiles. This keeps the copied layout proven.

Run `mise run standards:drift` after you change a template, shared task,
manifest entry, or fixture configuration. For other root files, run the closest
root check. For example, use `mise run md:standards:check` for Markdown.

Use `mise run standards:check` for release or CI validation, when explicitly
requested, and after changes to shared or aggregate infrastructure that can
affect unrelated fixtures. The aggregate gate scans for secrets, checks the
optional TypeScript Biome configuration, drift, Markdown, and Shell, and runs
every tester fixture.

The root mise configuration discovers fixture tasks through the explicit
`testers/*` monorepo configuration roots. It schedules two top-level fixture
jobs at a time.

`[monorepo] lockfile = false` keeps each committed fixture lockfile beside its
standalone configuration. The root runner uses one child mise process for the
path wildcard because the current stable validator does not resolve monorepo
paths in native task relationships. That child still uses mise's scheduler and
project-attributed output.

To run an optional isolated proof outside the hosted runner, use the existing
Dagger entrypoint for the representative Python fixture:

```sh
mise run testers:standards:check:isolated
```

The drift portion of the root gate runs `scripts/check-standards-drift.py`.
This script keeps shared task fragments, aggregate task dispatch, fixture
configurations, Dagger fragments, full-configuration shared files, and declared
mirror files in sync. It also enforces mutation-output ignore scope and the
downstream workflow and Code Owners contracts. Undeclared fixture source and
tests can remain small.

When adding or changing a profile:

1. Update `standards.manifest.toml`.
2. Add or update the matching `testers/<profile>` fixture.
3. Keep every declared mirror path byte-for-byte aligned.
4. Refresh the affected fixture lockfiles.
5. Run `mise run standards:drift` and the affected fixture gate.
