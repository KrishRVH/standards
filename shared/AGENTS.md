# Agent Guide

Read `CONTEXT.md` first if it exists. Then read relevant ADRs/docs before
changing architecture or domain language. Use this file for agent working rules.

## Principles

- Complexity is the enemy. Prefer obvious code, local state, and direct data
  flow over clever abstractions.
- Say no to abstractions, frameworks, services, config layers, and docs that do
  not remove real complexity.
- Respect Chesterton fences. Understand why code exists before deleting or
  replacing it.
- Keep one source of truth. Do not create doc twins for executable config.
- Add structure after the shape is visible. Small duplication beats premature
  indirection.
- Optimize only with evidence from real profiles or failing user experience.

## Commands

Everything a developer does goes through mise.

- `mise run tasks`: list available tasks.
- `mise run install`: install pinned tools/dependencies.
- `mise run fmt`: format.
- `mise run fmt:check`: verify formatting.
- `mise run lint`: lint/static analysis.
- `mise run test`: tests.
- `mise run check`: standard local gate through Dagger.
- `mise run ci`: full CI gate through Dagger.

Do not call `dagger`, package managers, compilers, or test runners directly
unless you are fixing the mise task itself. Dagger is invoked through mise only.

## Editing

- Make the smallest coherent change that solves the task.
- Follow existing language/tool config instead of restating it here.
- Keep strict type modes and static analysis passing.
- Prefer boring modules with clear inputs/outputs.
- Avoid global state, hidden I/O, and action at a distance.
- Put code near the thing it affects when that improves readability.
- Do not hand-edit generated files.
- Do not commit secrets. Use local env files for machine-specific values.

## Generated Output

Treat these as generated unless the task is specifically about them:

- dependency dirs: `node_modules/`, `vendor/`
- build/cache dirs: `build/`, `dist/`, `out/`, `coverage/`, `.cache/`
- framework/tool dirs: `.next/`, `.nuxt/`, `.turbo/`, `.vite/`, `.svelte-kit/`
- language outputs: `target/`, `bin/Debug/`, `bin/Release/`, `obj/`,
  `.gradle/`, `.kotlin/`, `_build/`, `deps/`, `dist-newstyle/`,
  `.stack-work/`, `.zig-cache/`, `zig-cache/`, `zig-out/`, `zig-pkg/`
- tool caches: `.phpunit.cache/`, `.psalm-cache/`, `.rector-cache/`,
  `.infection/`, `.lua-language-server/`, `*.tsbuildinfo`, `.elixir_ls/`

If generated output is stale, fix the generator or mise task and regenerate.

## Context Hygiene

- Use `rg`/targeted reads before opening large trees.
- Do not read vendored, generated, minified, lock, corpus, or asset files
  wholesale unless their contents are the task.
- Prefer catalogs, schemas, tests, and public interfaces for orientation.

## Testing

- For bugs, reproduce with a failing regression test before fixing when
  practical.
- Prefer stable behavior/integration tests around real cut points.
- Keep E2E coverage small, important, and reliable.
- Do not chase coverage numbers for their own sake.
- Before handoff, run `mise run check` unless blocked; report any skipped
  verification and why.

## Git

- Do not revert user changes unless explicitly asked.
- Keep generated and local-only files out of commits.
- Commit messages should be short, imperative, and specific.
