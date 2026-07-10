# Tester Mini Projects

These fixtures are intentionally small standalone projects that exercise the
copyable standards through the documented `.config/mise` layout. Each fixture
commits `.config/mise/mise.lock` for the Linux tool assets used by the repo
verification gate.

They prove the strict generic starting templates run after copying; they do not
mean every downstream project should keep every check unchanged.

Run all tester projects from the repository root:

```sh
MISE_TRUSTED_CONFIG_PATHS="$PWD" mise run testers:standards:check
```

The root is an explicit mise monorepo with `testers/*` config roots,
per-fixture lockfiles, and two top-level fixture jobs per scheduler. The native
monorepo scheduler provides project-prefixed output and failure propagation
while every fixture continues to own its configuration and tools. Run one
fixture through the same root namespace with, for example:

```sh
mise run //testers/python:standards:check
```

The root aggregate keeps one small nested mise wrapper because mise `2026.7.x`
executes monorepo path wildcards but its validator does not resolve those paths
inside `depends` or structured `run` entries. The wrapper also preserves the
required `GOROOT` and `GOTOOLDIR` sanitization. It replaces the former
17-process serial loop with one bounded child scheduler.

Run one representative fixture in its Dagger reference container when isolated
proof is useful; this task is intentionally outside the default root gate:

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

The fixtures cover C, C#, C++, Elixir, Fortran, Go, Haskell, Kotlin, Lua,
Markdown/MDX, PHP, Python, Rust, Shell, SPARK/Ada, TypeScript, and Zig.

The fixture list comes from `standards.manifest.toml`, not a hand-maintained
list. The root's `testers/*` discovery pattern contains no duplicate profile
inventory; the drift checker proves that every discovered fixture is declared
and every declared fixture exists. Declared mirror files must stay
byte-for-byte aligned with their template source. Undeclared fixture source and
tests are intentionally fixture-owned.

After changing a pinned tool version or fixture mise config, refresh the
affected fixture lockfile from that fixture directory:

```sh
MISE_TRUSTED_CONFIG_PATHS="$PWD/../.." mise run lock -- --platform linux-x64
```
