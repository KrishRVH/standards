# TypeScript Standards

Copy these files into a Bun-backed TypeScript project and replace
`project-name`, source paths, and test commands with the real project shape.

This is a strict, systems-level generic starting template. `package.json` is the
executable source of truth for scripts and dependencies. It uses TypeScript
strict mode, type-aware ESLint flat config, and Prettier. Relax rules or package
scripts when the copied baseline is broader than the real project needs.

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
Bun-only. Do not add pnpm/yarn/npm fallback branches to the shared task file.
Generate and commit `bun.lock` before relying on `ts:standards:check`; the CI
gate fails when the lockfile is missing.
