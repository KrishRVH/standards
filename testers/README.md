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

Or run one fixture directly:

```sh
cd testers/ts
MISE_TRUSTED_CONFIG_PATHS="$PWD/../.." mise run standards:check
```

Use `mise run standards:check` inside a Dagger-backed fixture when you want the
same host-local gate used by the repository aggregate task.

The fixtures cover C, C#, C++, Elixir, Fortran, Go, Haskell, Kotlin, Lua,
Markdown/MDX, PHP, Python, Rust, Shell, SPARK/Ada, TypeScript, and Zig.

The fixture list comes from `standards.manifest.toml`, not a hand-maintained
shell loop. Declared mirror files must stay byte-for-byte aligned with their
template source. Undeclared fixture source and tests are intentionally
fixture-owned.

After changing a pinned tool version or fixture mise config, refresh the
affected fixture lockfile from that fixture directory:

```sh
MISE_TRUSTED_CONFIG_PATHS="$PWD/../.." mise lock --platform linux-x64
```
