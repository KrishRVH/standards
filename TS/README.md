# TypeScript Standards

Copy these files into a Bun-backed TypeScript project and replace
`project-name`, source paths, and test commands with the real project shape.

This is a strict, systems-level generic starting template. `package.json` is the
executable source of truth for scripts and dependencies. It uses TypeScript
strict mode, type-aware ESLint flat config, and Prettier. Relax rules or package
scripts when the copied baseline is broader than the real project needs.
`biome.jsonc` is kept as a one-file alternative for projects that intentionally
replace the ESLint plus Prettier stack with Biome.

The standard gate is:

```sh
mise run ts:fmt:check
mise run ts:lint
mise run ts:type
mise run ts:test
mise run ts:check
```

The default `standards:check` script runs ESLint, `tsc`, and Prettier through
Bun; the mise gate requires that script and then runs the package test script.
This profile is intentionally Bun-only. Do not add pnpm/yarn/npm fallback
branches to the shared task file. If a project chooses Biome, replace the
package scripts and mise task wiring deliberately instead of running both
formatter/linter stacks by accident.
