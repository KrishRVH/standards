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

Run the isolated gate through its task, which selects the pinned Dagger
version:

```sh
mise run dagger:standards:check
```

Run other Dagger commands with the pinned version through `mise exec`, for
example `mise exec -- dagger develop` after you change the module.

The module starts from the official mise image at the tag and immutable
multi-architecture digest pinned in `dagger/src/index.ts`. It enables strict
lockfile mode, then runs `mise install` and `mise run standards:check`. The
companion mise fragment pins the Dagger CLI. Task definitions therefore stay in mise while Dagger supplies
an isolated environment without live operating-system package resolution.

Known generated and dependency paths, secret-bearing `.env` files, `.git`, and
local mise overrides are filtered before the source crosses into the Dagger
engine; example, sample, and template environment files remain available. The
container copy also honors the project's `.gitignore`. Without `.git`, the
`hygiene` task reports that it skipped; the local `standards:check` runs it.

This is the isolated runner for the strict starting baseline. Downstream
projects should still trim or relax the underlying mise and language checks
when the generic gate is broader than they need.
