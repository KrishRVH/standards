# mise Standards

Copy `config.toml` to `.config/mise/config.toml` and copy the selected
`conf.d/*.toml` files to `.config/mise/conf.d/`.

The defaults assume this rule: every developer command goes through `mise run`.
Dagger is pinned and invoked by mise; developers should not call `dagger`
directly.

Treat this as a strict, systems-level starting command surface. Keep the
language tasks that fit the project, and relax or remove checks that do not
match the project's risk, lifecycle, or team tolerance.

These templates were written against mise `v2026.6.11` and Dagger `v0.21.7`.

Recommended project entrypoints:

```sh
mise run install
mise run fmt
mise run lint
mise run test
mise run check
mise run ci:local
mise run ci
```

`check`, `ci`, and other Dagger-backed commands call the Dagger module. The
module then runs `mise run check:local` or `mise run ci:local` inside an
isolated container.

Commit the lockfile generated for the chosen config layout. With this template's
`.config/mise/config.toml` layout, mise writes `.config/mise/mise.lock`. Use
`mise.local.toml` for machine-local overrides.

Language task files are additive. Keep only the `conf.d/20-*.toml` files that
match the project languages; the aggregate `fmt`, `fmt:check`, `lint`, and
`test`, and `ci:local` tasks dispatch to PHP, Python, TypeScript/JavaScript,
Rust, Go, Elixir, Haskell, Kotlin, Zig, C++, C, C#, and Lua when their project
files are detected.
