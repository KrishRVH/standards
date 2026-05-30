# mise Standards

Copy `config.toml` to `.config/mise/config.toml` and copy the selected
`conf.d/*.toml` files to `.config/mise/conf.d/`.

The defaults assume this rule: every developer command goes through `mise run`.
Dagger is pinned and invoked by mise; developers should not call `dagger`
directly.

These templates were written against mise `v2026.5.16` and Dagger `v0.21.3`.

Recommended project entrypoints:

```sh
mise run install
mise run fmt
mise run lint
mise run test
mise run check
mise run ci
```

`check`, `ci`, and other Dagger-backed commands call the Dagger module. The
module then runs `mise run check:local` inside an isolated container.

Commit `mise.lock`. Use `mise.local.toml` for machine-local overrides.
