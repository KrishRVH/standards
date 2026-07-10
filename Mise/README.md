# mise Standards

Copy `config.toml` to `.config/mise/config.toml` and copy the selected
`conf.d/*.toml` files to `.config/mise/conf.d/`.

The copyable configuration requires mise `2026.3.11` or newer. That is the
first release supporting the structured task references with arguments used by
the aggregate entrypoints; it is a minimum, not an executable pin.

The defaults assume this rule: every developer command goes through `mise run`.
Dagger is optional. If a project keeps `conf.d/10-dagger.toml`, Dagger is
pinned and invoked by mise; developers should not call `dagger` directly.

Treat this as a strict, systems-level starting command surface. Keep the
language tasks that fit the project, and relax or remove checks that do not
match the project's risk, lifecycle, or team tolerance.

The optional Dagger fragment pins Dagger `v0.21.7`, and the corresponding
Dagger module uses the digest-pinned mise `v2026.6.12` image in strict lockfile
mode.

Recommended project entrypoints:

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
mise run dagger:standards:check
```

`standards` runs mutating formatter/fixer workflows for detected languages.
`standards:check` runs the CI-grade aggregate task and the shared secret scan
through the project's `.gitleaks.toml`. `sbom` writes a fresh CycloneDX JSON
SBOM under `sbom/` for release and audit workflows. Set `SYFT_SOURCE_NAME` and
`SYFT_SOURCE_VERSION` to control SBOM source metadata. If `10-dagger.toml` and
the Dagger module are copied, `dagger:standards:check` runs `standards:check`
inside an official, digest-pinned `mise` Linux reference container.

Commit the lockfile generated for the chosen config layout. With this template's
`.config/mise/config.toml` layout, mise writes `.config/mise/mise.lock`. Use
`mise.local.toml` for machine-local overrides.

For CI, prefer an invocation-scoped strict check such as `MISE_LOCKED=1 mise
run standards:check` instead of project-wide `locked = true`, which can also
constrain tools from a developer's global mise configuration.

Language task files are additive. Keep only the `conf.d/20-*.toml` files that
match the project languages; the aggregate `fmt`, `fmt:check`, `lint`, `test`,
`standards`, and `standards:check` tasks dispatch to C, C#, C++, Elixir,
Fortran, Go, Haskell, Kotlin, Lua, Markdown/MDX, PHP, Python, Rust, Shell,
SPARK/Ada, Bun-backed TypeScript/JavaScript, and Zig when their project files
are detected. Markdown/MDX dispatch requires `.markdownlint-cli2.jsonc`;
TypeScript dispatch requires both `package.json` and `tsconfig.json`.

Each language fragment expresses static workflow composition with native mise
dependencies and structured task references. Shared install, restore,
manifest, component, and lock prerequisites therefore execute once per
top-level language graph. Read-only independent checks may run concurrently;
formatters and tools that share mutable build state remain sequenced.

The generic aggregate dispatcher is intentionally dynamic because selected
language fragments are optional. It runs detected language graphs one at a
time so mixed-language projects cannot race over shared package files or build
state. Its remaining nested `mise run` is the boundary that selects a task
whose name is only known after marker detection. In a project with a fixed
stack, replace the generic aggregate tasks with explicit native dependencies.

The TypeScript task file is intentionally Bun-only. If a project uses pnpm,
yarn, or npm, replace the TypeScript task file with a project-specific one
instead of keeping multiple unpinned package-manager branches in the shared
standard.

The Markdown/MDX task file is Bun-backed for Prettier, markdownlint, and MDX
compiler dependencies. Local link and typo checks use pinned mise tools. The
default gate runs lychee offline so CI does not depend on external websites;
use `md:standards:check:deep` for external link checks and package audit.

The C# template enables locked package restore in project MSBuild properties:
package locks are created by default, and CI restore runs in locked mode. Lint
and test run Release builds with analyzer warnings promoted to failures.

The Rust task file runs Cargo in workspace and locked modes, generates a local
`Cargo.lock` only when missing outside CI, builds docs with rustdoc warnings
denied, runs doctests, and installs pinned `cargo-deny` into `.cargo-tools` for
dependency policy checks.

The Lua task file pins Lua 5.4, runs StyLua, installs pinned Luacheck/Busted
rocks into `.lua_modules`, and runs both Luacheck and LuaLS diagnostics. It
requires `luarocks` on PATH for lint/test tooling.
