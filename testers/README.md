# Tester Mini Projects

These small standalone projects exercise the copyable standards through the
documented `.config/mise` layout. Each fixture commits
`.config/mise/mise.lock` for the Linux tool assets used by the repository gate.
Their job is to prove that a strict template runs after copying, not to require
every downstream project to keep every check.

Run all tester projects from the repository root:

```sh
MISE_TRUSTED_CONFIG_PATHS="$PWD" mise run testers:standards:check
```

The root is an explicit mise monorepo with `testers/*` config roots,
per-fixture lockfiles, and a scheduler width sized for the maintainer workstation
in the root config. The native
monorepo scheduler provides project-prefixed output and failure propagation
while every fixture continues to own its configuration and tools. Run one
fixture through the same root namespace with, for example:

```sh
mise run //testers/python:standards:check
```

The root aggregate keeps one small nested mise wrapper because mise `2026.7.x`
executes monorepo path wildcards but its validator does not resolve those paths
inside `depends` or structured `run` entries. The wrapper also preserves the
required `GOROOT` and `GOTOOLDIR` sanitization.

For an isolated check, run one representative fixture in its Dagger reference
container. This task intentionally sits outside the default root gate:

```sh
MISE_TRUSTED_CONFIG_PATHS="$PWD" mise run testers:standards:check:isolated
```

Or run one fixture directly:

```sh
cd testers/ts
MISE_TRUSTED_CONFIG_PATHS="$PWD/../.." mise run standards:check
```

Use `mise run standards:check` inside any fixture when you want the same
host-local gate used by the repository aggregate task.

The fixture list comes from [`standards.manifest.toml`](../standards.manifest.toml).
The root's `testers/*` discovery pattern contains no duplicate profile
inventory; the drift checker proves that every discovered fixture is declared
and every declared fixture exists. Declared mirror files must stay
byte-for-byte aligned with their template source. Undeclared fixture source and
tests are intentionally fixture-owned.

Minimal fixture `config.toml` files define no `lock` task. After changing a
pinned tool version or fixture mise config, refresh the affected lockfile from
that fixture directory with mise's native command:

```sh
MISE_TRUSTED_CONFIG_PATHS="$PWD/../.." mise lock --platform linux-x64
```
