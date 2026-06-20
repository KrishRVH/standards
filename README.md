# Standards

Reusable project standards for formatting, linting, static analysis, tests,
dependency hygiene, and repeatable CI gates.

This repository is meant to be copied from, not installed as a package. The
root files maintain this standards repo itself. Files intended for downstream
projects live in `shared/`, `Mise/`, `Dagger/`, and the language-specific
folders.

These templates are explicitly systems-level, strict, generic starting points
for each language. They are meant to provide a high-signal baseline, not a
universal final shape. Copy them, then relax, remove, or narrow checks and files
based on the actual project's risk, lifecycle, team tolerance, and domain.

## Repository Layout

- `shared/`: generic top-level files for a project, including `AGENTS.md`,
  `CLAUDE.md`, `.gitattributes`, and `.gitignore`.
- `Mise/`: `.config/mise` templates. These define the developer command
  surface and pin Dagger.
- `Dagger/`: Dagger module template used by the mise `check` and `ci` tasks.
- `C/`, `C#/`, `C++/`, `Elixir/`, `Go/`, `Haskell/`, `Kotlin/`, `Lua/`,
  `PHP/`, `Python/`, `Rust/`, `TS/`, `Zig/`: language/tooling templates.
- `testers/`: small standalone fixtures that prove every language template
  works through the documented mise layout. Each fixture commits its
  `.config/mise/mise.lock` for deterministic Linux tool resolution.
- Root `AGENTS.md`, `.gitignore`, `.gitattributes`, and `.config/mise/`: rules
  and tasks for maintaining this repository, not defaults to copy into a new
  project.

## Using The Templates

Start with the shared files:

```sh
cp shared/AGENTS.md /path/to/project/AGENTS.md
cp shared/CLAUDE.md /path/to/project/CLAUDE.md
cp shared/.gitattributes /path/to/project/.gitattributes
cp shared/.gitignore /path/to/project/.gitignore
```

Then copy the mise baseline:

```text
Mise/config.toml        -> .config/mise/config.toml
Mise/conf.d/*.toml     -> .config/mise/conf.d/
```

Only keep the language `conf.d` files that apply to the project. For example, a
PHP and TypeScript project would keep `10-dagger.toml`, `20-php.toml`, and
`20-ts.toml`.

If the project should use isolated CI checks, copy the Dagger template too:

```text
Dagger/dagger.json     -> dagger.json
Dagger/dagger/         -> dagger/
```

Finally, copy the language template files that match the project:

- `C/`: CMake presets, Clang formatting/static-analysis config, and helper
  scripts.
- `C#/`: strict .NET formatting, analyzer, central package, locked restore, and
  Release build/test defaults.
- `C++/`: CMake C++26 library/CLI/test template, Clang format/tidy config,
  sanitizer presets, optional `cppcheck`, and MinGW cross-toolchain support.
- `Elixir/`: Mix project baseline with formatter, Credo, Dialyzer, xref cycle
  checks, docs, coverage, dependency audits, and Phoenix-detected Sobelow.
- `Go/`: Go module baseline with gofumpt, module hygiene, `go vet`,
  golangci-lint, govulncheck, tests, race, coverage, and benchmark tasks.
- `Haskell/`: Cabal/GHCup baseline with GHC2024, Ormolu, HLint, warnings as
  errors in the local gate, Cabal check/build/test/haddock/sdist, and optional
  freeze support.
- `Kotlin/`: Gradle Kotlin/JVM baseline with ktlint, Detekt, warnings as
  errors, dependency locking, and dependency-verification generation tasks.
- `Lua/`: Lua 5.4 baseline with StyLua, Luacheck, LuaLS, and optional Busted
  tests.
- `PHP/`: Composer and quality-tool config for PHPUnit, PHPStan, Psalm, Rector,
  PHPCS, PHPMD, Deptrac, PHPBench, and Infection.
- `Python/`: pyproject and uv-based quality-tool config for Ruff, basedpyright,
  mypy, pytest/coverage, dependency hygiene, docs, complexity, slots, security,
  and dead-code checks.
- `Rust/`: Cargo, rustfmt, Clippy, rustdoc/doctest, locked workspace, and
  cargo-deny dependency-policy defaults.
- `TS/`: TypeScript, ESLint, Prettier, and Biome config; the default gate uses
  ESLint, `tsc`, and Prettier.
- `Zig/`: `build.zig` and `build.zig.zon` baseline with `zig fmt`, strict
  Debug/ReleaseSafe compile checks, tests, and release-variant tasks.

The files intentionally use neutral project names, conventional `src` and
`tests` directories, and generic package namespaces. Replace those placeholders
when a project uses a different layout or architectural boundary.

## Command Model

Developer and CI entrypoints go through mise:

```sh
mise run install
mise run fmt
mise run fmt:check
mise run lint
mise run test
mise run check
mise run ci
```

`mise run check` and `mise run ci` invoke Dagger through mise. The Dagger module
then runs `mise run check:local` or `mise run ci:local` inside an isolated
container, keeping task definitions in one place while still giving CI a clean
environment.

After copying templates into a project:

1. Remove language task files that do not apply.
2. Adjust package names, namespaces, source directories, and test directories.
3. Run `mise run install`.
4. Run `mise run check`.
5. Commit the resulting lockfiles, including the mise lockfile written for the
   chosen config layout, such as `.config/mise/mise.lock`, and any
   package-manager lockfiles used by the project.

## Maintaining These Standards

Use the repo-local maintenance gate:

```sh
mise run check
```

That runs the tester fixtures for C, C#, C++, Elixir, Go, Haskell, Kotlin, Lua,
PHP, Python, Rust, TypeScript, and Zig. When changing a template, update the
matching fixture and refresh its `.config/mise/mise.lock` so future changes
prove the copied layout still works.
