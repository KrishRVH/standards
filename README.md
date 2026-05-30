# Standards

Reusable project standards for formatting, linting, static analysis, tests,
dependency hygiene, and repeatable CI gates.

This repository is meant to be copied from, not installed as a package. The
root files maintain this standards repo itself. Files intended for downstream
projects live in `shared/`, `Mise/`, `Dagger/`, and the language-specific
folders.

## Repository Layout

- `shared/`: generic top-level files for a project, including `AGENTS.md`,
  `CLAUDE.md`, `.gitattributes`, and `.gitignore`.
- `Mise/`: `.config/mise` templates. These define the developer command
  surface and pin Dagger.
- `Dagger/`: Dagger module template used by the mise `check` and `ci` tasks.
- `C/`, `C#/`, `Lua/`, `PHP/`, `Rust/`, `TS/`: language/tooling templates.
- `testers/`: small standalone fixtures that prove the copyable templates work
  through the documented mise layout. C# and Rust testers are intentionally
  absent.
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
- `C#/`: `.editorconfig` for .NET formatting/analyzers.
- `Lua/`: StyLua and Luacheck config.
- `PHP/`: Composer and quality-tool config for PHPUnit, PHPStan, Psalm, Rector,
  PHPCS, PHPMD, Deptrac, PHPBench, and Infection.
- `Rust/`: Cargo, rustfmt, and Clippy defaults.
- `TS/`: TypeScript, ESLint, Prettier, and Biome defaults.

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
then runs `mise run check:local` inside an isolated container, keeping task
definitions in one place while still giving CI a clean environment.

After copying templates into a project:

1. Remove language task files that do not apply.
2. Adjust package names, namespaces, source directories, and test directories.
3. Run `mise run install`.
4. Run `mise run check`.
5. Commit the resulting lockfiles, including `mise.lock` and any package-manager
   lockfiles used by the project.

## Maintaining These Standards

Use the repo-local maintenance gate:

```sh
mise run check
```

That runs the tester fixtures for C, Lua, PHP, and TypeScript. When changing a
template that has a tester, update the matching fixture so future changes prove
the copied layout still works.
