# JavaScript Standards

Copy these files into a Bun-backed JavaScript project and replace
`project-name`, source paths, and test commands with the real project shape.

`package.json` is the executable source of truth for scripts and dependencies.
The baseline combines Biome formatting and linting with strict TypeScript
compiler analysis through `checkJs` in `jsconfig.json`. Use JSDoc where
exported boundaries or ambiguous structures need an explicit contract; rely on
inference for implementation details. Do not add a parallel TypeScript source
tree merely to make the checker happy.

This profile is Bun-first: `packageManager`, `@types/bun`, `bun test`, and
TypeScript's `bundler` module resolution model Bun's runtime. Keep native ESM
explicit with `"type": "module"`. Use runtime-valid relative imports or
`package.json` imports rather than TypeScript-only path aliases. Switch to
`NodeNext` and `@types/node` only when Node, rather than Bun, is the runtime.
`bunfig.toml` routes package scripts and `node` shebang subprocesses through
Bun and disables automatic peer installation; declare every peer the project
actually imports.

Copy the shared `.gitignore` into the project before running Biome. The
configuration deliberately reads the VCS ignore file and fails when that
project boundary is missing.

The standards workflow is:

```sh
mise run js:lock
mise run js:lock:check
mise run js:standards
mise run js:fmt:check
mise run js:lint
mise run js:type
mise run js:test
mise run js:audit
mise run js:standards:check
```

The default `standards` package script applies Biome's safe formatter, linter,
and import-organizer fixes. `standards:check` runs Biome, `tsc` against
`jsconfig.json`, Bun tests, and `bun audit --audit-level=low`.

This profile is Bun-first. Do not add pnpm, Yarn, or npm fallback branches to
the shared task file. Generate and commit `bun.lock` before relying on
`js:standards:check`; the CI gate fails when the lockfile is missing.
