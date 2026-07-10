# TypeScript Standards

Copy these files into a Bun-backed TypeScript project and replace
`project-name`, source paths, and test commands with the real project shape.

This is a strict, systems-level generic starting template. `package.json` is the
executable source of truth for scripts and dependencies. It uses TypeScript
strict mode, type-aware ESLint flat config, and Prettier. Relax rules or package
scripts when the copied baseline is broader than the real project needs.

The committed default is Option A: ESLint plus Prettier. `biome.jsonc` is
Option B for projects that intentionally replace both tools with Biome 2.5.3.
The catalog validates that alternative separately; it is not installed or run
by the default project workflow.

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
If a project chooses Option B, remove the ESLint and Prettier dependencies and
config files. Remove `@eslint/js`, `eslint`, `eslint-config-prettier`, `globals`,
`prettier`, and `typescript-eslint`; add the exact dev dependency
`"@biomejs/biome": "2.5.3"`. Keep TypeScript and the Bun types.

Remap the existing package scripts without changing the mise task names:

| Script | Option B value |
| --- | --- |
| `format` | `biome format --write .` |
| `format:check` | `biome format .` |
| `lint` | `biome lint --error-on-warnings .` |
| `lint:fix` | `biome lint --write --error-on-warnings .` |
| `standards` | `biome check --write --error-on-warnings .` |
| `standards:check` | `biome ci --error-on-warnings . && bun run typecheck && bun run test && bun run audit` |

Then run `mise run ts:lock`. Do not keep both formatter/linter stacks active.

The Biome baseline enables every stable rule, excludes the semver-unstable
nursery group, and keeps only ecosystem-shaped exceptions. TypeScript remains
the authority for module resolution, `.js` specifiers remain valid for emitted
ES modules, Node built-ins remain valid under Bun, declaration files may use
namespaces, config loaders may require default exports, and test data may use
literal numbers.

Generate and commit `bun.lock` before relying on `ts:standards:check`; the CI
gate fails when the lockfile is missing.
