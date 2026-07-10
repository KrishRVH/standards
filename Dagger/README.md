# Dagger Standards

Copy these files into a project as:

```text
Mise/conf.d/10-dagger.toml -> .config/mise/conf.d/10-dagger.toml
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
mise run dagger:standards:check
```

The module starts from the official mise `v2026.6.12` image at an immutable
multi-architecture digest, enables mise's strict lockfile mode, runs `mise run
install`, then runs `mise run standards:check`. The companion mise fragment
pins Dagger `v0.21.7`. That keeps task definitions in mise while Dagger provides
the isolated execution environment without live operating-system package
resolution.

Known generated and dependency paths, secret-bearing `.env` files, and local
mise overrides are filtered before the source crosses into the Dagger engine;
example, sample, and template environment files remain available. The container
copy also honors the project's `.gitignore`.

Use this as the isolated runner for the strict starting baseline. Downstream
projects should still trim or relax the underlying mise/language checks when
the generic gate is broader than the project needs.
