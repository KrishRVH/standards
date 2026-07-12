# mise Standards

Copy `config.toml` to `.config/mise/config.toml` and copy the selected
`conf.d/*.toml` files to `.config/mise/conf.d/`.

The copyable configuration requires mise `2026.6.12` or newer. That is the
first release supporting the checksum-backed HTTP lock metadata used by the
Odin formatter; it is a minimum, not an executable pin.

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

`standards` runs each detected language's local workflow and applies available
safe autofixes. Some ecosystems expose validation only because they have no
safe formatter.
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
Fortran, GDScript, Go, Haskell, Kotlin, Lua, Markdown/MDX, Odin, PHP, Python,
Rust, Shell, SPARK/Ada, Bun-backed TypeScript/JavaScript, and Zig when their
project files are detected. Odin dispatch requires an owned source file under
`src/` or `tests/`; GDScript dispatch requires `project.godot` and an owned
script under `src/` or `tests/`; Markdown/MDX dispatch requires
`.markdownlint-cli2.jsonc`; TypeScript dispatch requires both `package.json`
and `tsconfig.json`.

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
The dispatcher is a POSIX shell template verified on Linux; Windows consumers
must replace it with explicit task relationships or a reviewed `run_windows`
implementation.

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

The Odin task file uses the OLS `odinfmt` nightly for project-scoped developer
formatting and the version-matched compiler as the style, vet, and test
authority. A fail-closed adapter avoids the formatter's unsafe in-place write
path; the non-mutating `fmt:check` remains compiler-owned because `odinfmt` has
no check mode. Its explicit update task relocks and force-reinstalls the mutable
nightly so warm and cold machines converge. The required tests retain native
parallelism and a fresh reported seed while enabling bad-memory failure
tracking, debug AddressSanitizer, and a separate optimized lane. The fixture is
verified on Linux x64 with pinned Clang. Official builds on macOS require the
Xcode command-line tools, and Windows requires MSVC and the Windows SDK; this
repository does not verify those hosts or FreeBSD. The formatter adapter
requires a POSIX shell.

The Lua task file pins Lua 5.4, runs StyLua, installs pinned Luacheck/Busted
rocks into `.lua_modules`, and runs both Luacheck and LuaLS diagnostics. It
requires `luarocks` on PATH for lint/test tooling.

The GDScript task file pins Godot 4.7 and a portable, hashed GDToolkit
environment. It formats and lints owned scripts, then uses headless Godot
import, per-script checks, and resource loading as the language-semantic gate
before running the project test entrypoint.
