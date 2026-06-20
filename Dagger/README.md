# Dagger Standards

Copy these files into a project as:

```text
dagger.json
dagger/
  package.json
  tsconfig.json
  src/index.ts
```

Do not call Dagger directly in day-to-day use. Dagger is pinned and invoked by
mise:

```sh
mise run dagger:develop
mise run check
mise run ci
```

The module downloads pinned `mise` inside the Dagger container, runs
`mise run install`, then runs `mise run check:local` for `check` or
`mise run ci:local` for `ci`. That keeps task definitions in mise while Dagger
provides the isolated CI execution environment.

Use this as the isolated runner for the strict starting baseline. Downstream
projects should still trim or relax the underlying mise/language checks when
the generic gate is broader than the project needs.

These templates were written against mise `v2026.6.11` and Dagger `v0.21.7`.
