# TypeScript Standards

Copy these files into a Bun-backed TypeScript project and replace
`project-name`, source paths, and test commands with the real project shape.

This is a strict, systems-level generic starting template. `package.json` is the
executable source of truth for scripts and dependencies. It uses TypeScript
strict mode, type-aware ESLint flat config, and Prettier. Relax rules or package
scripts when the copied baseline is broader than the real project needs.
`biome.jsonc` is kept as a one-file alternative for projects that intentionally
replace the ESLint plus Prettier stack with Biome.

The standards workflow is:

```sh
mise run ts:standards
mise run ts:fmt:check
mise run ts:lint
mise run ts:type
mise run ts:test
mise run ts:lock
mise run ts:lock:check
mise run ts:audit
mise run ts:standards:check
```

The default `standards` package script runs Prettier and ESLint autofix. The
default `standards:check` package script runs ESLint, `tsc`, Prettier, Bun
tests, and `bun audit --audit-level=low`. This profile is intentionally
Bun-only. Do not add pnpm/yarn/npm fallback branches to the shared task file. If
a project chooses Biome, replace the package scripts and mise task wiring
deliberately instead of running both formatter/linter stacks by accident.
Generate and commit `bun.lock` before relying on `ts:standards:check`; the CI
gate fails when the lockfile is missing.
