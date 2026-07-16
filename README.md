# Standards

Reusable project standards for formatting, linting, static analysis, tests,
dependency hygiene, and repeatable CI gates.

This repository is meant to be copied from, not installed as a package. The
root files maintain this standards repo itself. Files intended for downstream
projects live in `shared/`, `Mise/`, `Dagger/`, and the language-specific
folders.

These templates prioritize ecosystem-idiomatic, almost systems-like strictness
and elegance. They are meant to provide a high-signal generic baseline, not a
universal final shape. Copy them, then relax, remove, or narrow checks and files
based on the actual project's risk, lifecycle, team tolerance, and domain.
Their major secondary target is dependable agentic development: conventional
layouts, nearby contracts, explicit side effects, actionable failures, and
deterministic commands should let an agent make and prove a narrow change.

## Repository Layout

- `shared/`: generic top-level files for a project, including `AGENTS.md`,
  `CLAUDE.md`, `.gitattributes`, `.gitleaks.toml`, and `.gitignore`.
- `extras/workstation/`: optional personal workstation bootstrap scripts.
- `Mise/`: `.config/mise` templates. These define the developer command
  surface.
- `Dagger/`: optional Dagger module template used by the explicit
  `dagger:standards:check` mise task.
- `C/`, `C#/`, `C++/`, `Elixir/`, `Fortran/`, `GDScript/`, `Go/`, `Haskell/`,
  `Kotlin/`, `Lua/`, `Markdown/`, `Odin/`, `PHP/`, `Python/`, `Rust/`, `Shell/`,
  `SPARK/`, `TS/`:
  language/tooling templates.
- `testers/`: small standalone fixtures that prove every language template
  works through the documented mise layout. Each fixture commits its
  `.config/mise/mise.lock` for deterministic Linux tool resolution.
- Root `AGENTS.md`, `.gitignore`, `.gitattributes`, and `.config/mise/`: rules
  and tasks for maintaining this repository, not defaults to copy into a new
  project. The root is an explicit mise monorepo over `testers/*`, retains
  separate fixture lockfiles, and bounds the monorepo scheduler to two
  top-level fixture jobs. The root `.config/mise/mise.lock` pins the Biome
  alternative verifier, gitleaks, Python, and the root Markdown and Shell
  tools. The root `bun.lock` pins the Markdown JavaScript dependencies.
- `standards.manifest.toml`: the profile map used by agents and the root gate
  to find canonical templates, tester fixtures, task fragments, and exact
  mirror files.

## Using The Templates

Start with the shared files:

```sh
cp shared/AGENTS.md /path/to/project/AGENTS.md
cp shared/CLAUDE.md /path/to/project/CLAUDE.md
cp shared/.gitattributes /path/to/project/.gitattributes
cp shared/.gitleaks.toml /path/to/project/.gitleaks.toml
cp shared/.gitignore /path/to/project/.gitignore
```

`extras/workstation/macbook-setup.sh` and `extras/workstation/wsl-setup.sh` are
optional bootstrap scripts for personal workstation setup. They are the explicit
exception to the mise-only project command surface because they install mise
itself. Read them first, then run the relevant script directly from the target
machine.

Then copy the mise baseline:

```text
Mise/config.toml   -> .config/mise/config.toml
Mise/conf.d/*.toml -> .config/mise/conf.d/
```

Only keep the language `conf.d` files that apply to the project. For example, a
PHP and TypeScript project would keep `20-php.toml` and `20-ts.toml`.

If the project should use isolated Dagger checks, copy the Dagger task fragment
and module too:

```text
Mise/conf.d/10-dagger.toml -> .config/mise/conf.d/10-dagger.toml
Dagger/dagger.json          -> dagger.json
Dagger/dagger/              -> dagger/
```

Finally, copy the language template files that match the project:

- `C/`: CMake presets, Clang formatting/static-analysis config, and helper
  scripts.
- `C#/`: strict .NET formatting, analyzer, central package, locked restore, and
  Release build/test defaults.
- `C++/`: idiomatic C++20 CMake library/CLI/test template with Clang
  format/tidy config, sanitizer presets, and an opt-in GCC/MinGW portability
  lane.
- `Elixir/`: Mix project baseline with formatter, Credo, optional Dialyzer,
  xref cycle checks, docs, coverage, dependency audits, and project-specific
  Phoenix/Sobelow overlays.
- `Fortran/`: fpm project baseline with free-form source, implicit typing and
  implicit external disabled, Findent formatting, strict GNU Fortran warning
  gates, fortls parser diagnostics, test-drive tests, FORD docs, and fpm
  dependency pin policy.
- `GDScript/`: Godot 4.7 baseline with typed GDScript warnings, GDToolkit
  formatting/linting, native headless import, parse/type and resource-load
  checks, and a small dependency-free test entrypoint.
- `Go/`: Go module baseline with gofumpt, module hygiene, `go vet`, a custom
  restricted-dialect analyzer, golangci-lint, govulncheck, tests, race,
  coverage, and benchmark tasks.
- `Haskell/`: Cabal/GHCup baseline with GHC2024, Ormolu, HLint, warnings as
  errors in the local gate, named Haddock/source-distribution tasks, and
  optional freeze support.
- `Kotlin/`: Gradle Kotlin/JVM baseline with ktlint, Detekt, warnings as
  errors, dependency locking, and dependency-verification generation tasks.
- `Lua/`: Lua 5.4 baseline with StyLua, Luacheck, LuaLS, and optional Busted
  tests.
- `Markdown/`: Bun-backed Markdown/MDX baseline with Prettier formatting,
  markdownlint structure checks, MDX compile checks through remark/rehype and
  Shiki, offline local link checks with lychee, and low-noise typo checks with
  typos.
- `Odin/`: OLS `odinfmt` nightly with fail-closed project-scoped writes, strict
  compiler style and vet checks, an external consumer test package, native tests
  with reported reproduction seeds, and debug AddressSanitizer plus optimized
  test lanes.
- `PHP/`: PHP 8.5 Composer and quality-tool config for PHPUnit, PHPStan,
  Rector, PHPCS/Slevomat, PHPMD, ShipMonk dependency analysis, Composer audit,
  and Roave security advisories.
- `Python/`: pyproject and uv-based quality-tool config for Ruff, basedpyright,
  Bandit, pytest/coverage, wheel/source builds, and optional deeper mypy,
  dependency, documentation, complexity, slots, and dead-code checks.
- `Rust/`: Cargo, rustfmt, Clippy, rustdoc/doctest, locked workspace, and
  cargo package/cargo-deny dependency-policy defaults.
- `Shell/`: Bash-first glue-code baseline with shfmt, ShellCheck, parser
  checks, Bats tests, and a shebang policy for project-owned scripts.
- `SPARK/`: Alire-backed SPARK/Ada baseline with exact GNAT/GPRbuild,
  GNATprove, and GNATformat tool dependencies, warning-as-error builds, proof
  warnings and unproved checks as failures, and tiny executable tests.
- `TS/`: Bun-backed TypeScript with strict `tsc`, tests, ESLint plus Prettier
  as Option A, and a pinned one-file Biome configuration as Option B.

The files intentionally use neutral project names, conventional `src` and
`tests` directories, and generic package namespaces. Replace those placeholders
when a project uses a different layout or architectural boundary. Replace
package identity, author, maintainer, copyright, license, and publication
metadata with the project's actual legal and release posture.

## Adoption Posture

Treat each template as a strict seed, not a finished architecture. Keep the
ecosystem-native formatter, compiler/type checker, test runner, and lockfile
policy first. Keep a dependency advisory gate when the ecosystem offers a
dependable, high-signal native option; otherwise retain its native integrity
controls and select project-specific auditing after adoption. Tune style-only
rules, coverage policy, release profiles, and heavier optional analyzers after
the project shape is known.

Applications and CLIs should usually keep committed lockfiles, exact toolchain
pins, and CI-only audits. Libraries may need wider runtime version ranges,
different release profiles, and narrower public API gates. Existing projects
should adopt strict checks with reviewed suppressions or CI ratchets instead of
trying to become green by broad disabling.

The aggregate mise tasks use marker-file detection for copyable defaults. In
monorepos or mixed-tooling repositories, replace the generic dispatcher with
explicit project-specific task dependencies or narrower markers.

The copyable configuration requires mise `2026.6.12` or newer for structured
task references and checksum-backed HTTP tool locks. This repository's root
requires `2026.7.0` or newer for the explicit monorepo per-project lockfile
policy. Both declarations are minimums; developers are not pinned to one mise
executable.

## Command Model

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

`mise run standards` runs each detected language's local workflow and applies
available safe autofixes.
`mise run standards:check` runs the CI-grade aggregate gate and the shared
secret scan through `.gitleaks.toml`. This catalog intentionally omits a hosted
workflow to avoid runner costs; downstream projects can wire the same command
into their chosen provider when appropriate.
`mise run sbom` emits a fresh optional CycloneDX JSON SBOM under `sbom/`; set
`SYFT_SOURCE_NAME` and `SYFT_SOURCE_VERSION` when release metadata should differ
from the default directory name and `0.0.0` version. If the project copied the
Dagger template, `mise run dagger:standards:check` runs `standards:check`
inside an official, digest-pinned `mise` Linux reference container while
keeping task definitions in mise.

After copying templates into a project:

1. Remove language task files that do not apply.
2. Adjust package names, namespaces, source directories, and test directories.
3. Run `mise run install`.
4. Run `mise run standards`.
5. Run `mise run standards:check`.
6. Commit the resulting lockfiles, including the mise lockfile written for the
   chosen config layout, such as `.config/mise/mise.lock`, and any
   package-manager lockfiles used by the project.

## Maintaining These Standards

Use the repo-local maintenance gate for local fixture checks:

```sh
mise run standards:check
```

That runs a root-wide secret scan, the pinned Biome alternative check, drift,
Markdown, and Shell checks, and every tester fixture for C, C#, C++, Elixir,
Fortran, GDScript, Go, Haskell, Kotlin, Lua, Markdown/MDX, Odin, PHP, Python,
Rust, Shell, SPARK/Ada, and TypeScript through
`standards:check`, including audits, proof, package, and slower quality gates.
When changing a template, update the matching fixture and refresh affected
lockfiles so future changes prove the copied layout still works.

Fixture tasks are discovered through the root's explicit `testers/*` monorepo
config roots and execute with two top-level fixture jobs per scheduler.
`[monorepo] lockfile = false` keeps every committed fixture lockfile beside its
standalone configuration.
The root runner uses one child mise process for the path wildcard because the
current stable validator does not yet resolve monorepo paths in native task
relationships; the child itself uses mise's scheduler and project-attributed
output.

For an opt-in isolated proof without a hosted workflow, run the representative
Python fixture through its existing Dagger entrypoint:

```sh
mise run testers:standards:check:isolated
```

The root gate's drift component runs `scripts/check-standards-drift.py`. That
checker keeps shared task fragments, aggregate task dispatch, fixture configs,
Dagger fragments, full-config shared files, and declared mirror files in sync
while leaving undeclared fixture source and tests free to stay tiny.

When adding or changing a standards profile:

1. Update `standards.manifest.toml`.
2. Add or update the matching `testers/<profile>` fixture.
3. Keep every declared mirror path byte-for-byte aligned.
4. Refresh affected fixture lockfiles.
5. Run `mise run standards:drift` and `mise run standards:check`.
