# Tester Mini Projects

These fixtures are intentionally small standalone projects that exercise the
copyable standards through the documented `.config/mise` layout.

Run all non-C#/Rust tester projects from the repository root:

```sh
MISE_TRUSTED_CONFIG_PATHS="$PWD" mise run testers:check
```

Or run one fixture directly:

```sh
cd testers/ts
MISE_TRUSTED_CONFIG_PATHS="$PWD" mise run check:local
```

The fixtures cover C, Lua, PHP, Python, and TypeScript. C# and Rust are
intentionally omitted.
