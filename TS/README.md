# TypeScript Standards

Copy these files into a Bun-backed TypeScript project and replace
`project-name`, source paths, and test commands with the real project shape.

`package.json` is the executable source of truth for scripts and dependencies.
The baseline combines TypeScript strict mode, a type-aware ESLint flat config,
Effect, Effect Schema, Effect-aware diagnostics, and Prettier. Pure functions
stay plain TypeScript; introduce Effect at validation, failure, async, resource,
concurrency, and service boundaries. Use Effect Schema as the default boundary
schema authority instead of adding a second schema system.

The committed default is Option A: ESLint plus Prettier. `biome.jsonc` is
Option B for projects that intentionally replace both tools with Biome 2.5.5.
The catalog validates that alternative separately; it is not installed or run
by the default project workflow.

Effect includes its own TypeScript declarations, so there is no
`@types/effect` dependency. `@effect/language-service` supplies the
Effect-specific editor feedback, CI diagnostics, and project overview. Configure
editors to use the workspace TypeScript version. The CI task uses the standalone
diagnostics command; do not patch the installed TypeScript compiler.

The language-service configuration expands its official `effect-native` preset
at warning severity; the CI command's `--strict` flag makes every emitted
warning blocking while preserving useful editor severity. The
`anyUnknownInErrorContext` and `unsafeEffectTypeAssertion` correctness checks
are promoted to errors.

`package.json` records the latest mutually compatible stable set. TypeScript is
constrained by stable `typescript-eslint`'s peer range. Projects moving to
TypeScript 7 must re-evaluate the lint stack and use the separate
`@effect/tsgo` integration instead of assuming this language-service setup
carries forward unchanged.

The standards workflow is:

```sh
mise run ts:standards
mise run ts:fmt:check
mise run ts:lint
mise run ts:type
mise run ts:effect:check
mise run ts:effect:overview
mise run ts:test
mise run ts:lock
mise run ts:lock:check
mise run ts:audit
mise run ts:standards:check
```

The default `standards` package script runs Prettier and ESLint autofix;
`standards:check` runs ESLint, `tsc`, strict Effect diagnostics, Prettier, Bun
tests, and `bun audit --audit-level=low`. `effect:overview` gives agents a
compact map of exported Effect services, layers, and errors. This profile is
Bun-only. The committed `bunfig.toml` makes Bun the default runtime for package
scripts and executables, equivalent to `bun --bun <script>`: calls to `node`,
including `#!/usr/bin/env node` shebangs, resolve to Bun recursively. Override
that default only for a dependency that demonstrably requires Node. Do not add
pnpm/yarn/npm fallback branches to the shared task file.
If a project chooses Option B, remove the ESLint and Prettier dependencies and
config files. Remove `@eslint/js`, `eslint`, `eslint-config-prettier`, `globals`,
`eslint-plugin-regexp`, `prettier`, and `typescript-eslint`; add the exact dev
dependency `"@biomejs/biome": "2.5.5"`. Keep Effect, its language service,
TypeScript, and the Bun types.

Remap the existing package scripts without changing the mise task names:

| Script            | Option B value                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------------------- |
| `format`          | `biome format --write .`                                                                                       |
| `format:check`    | `biome format .`                                                                                               |
| `lint`            | `biome lint --error-on-warnings .`                                                                             |
| `lint:fix`        | `biome lint --write --error-on-warnings .`                                                                     |
| `standards`       | `biome check --write --error-on-warnings .`                                                                    |
| `standards:check` | `biome ci --error-on-warnings . && bun run typecheck && bun run effect:check && bun run test && bun run audit` |

Then run `mise run ts:lock`. Do not keep both formatter/linter stacks active.

The Biome baseline enables every stable rule, excludes the semver-unstable
nursery group, and keeps only ecosystem-shaped exceptions. TypeScript remains
the authority for module resolution, `.js` specifiers remain valid for emitted
ES modules, Node built-ins remain valid under Bun, declaration files may use
namespaces, config loaders may require default exports, and test data may use
literal numbers.

Generate and commit `bun.lock` before relying on `ts:standards:check`; the CI
gate fails when the lockfile is missing.
