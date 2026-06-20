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

The module installs pinned `mise` inside the Dagger container and runs
`mise run check:local` for `check` or `mise run ci:local` for `ci`. That keeps
task definitions in mise while Dagger provides the isolated CI execution
environment.

These templates were written against mise `v2026.6.11` and Dagger `v0.21.7`.
