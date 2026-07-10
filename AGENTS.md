# Agent Guide

Copy-from standards catalog. Canonical consumer templates: `shared/`, `Mise/`,
`Dagger/`, `C/`, `C#/`, `C++/`, `Elixir/`, `Fortran/`, `Go/`, `Haskell/`,
`Kotlin/`, `Lua/`, `Markdown/`, `PHP/`, `Python/`, `Rust/`, `Shell/`,
`SPARK/`, `TS/`, `Zig/`. Root docs/config maintain this repo. `testers/`
smoke-test copied standards for every language template.

Read `CONTEXT.md` first if it exists. Then read relevant ADRs/docs before
changing architecture or domain language. Use this file for agent working rules.

## Design Target

These standards primarily pursue ecosystem-idiomatic, almost systems-like
strictness and elegance. A major secondary goal is dependable agentic
development: an agent should be able to discover the intended workflow,
understand contracts from nearby code, config, and tests, make a narrow change,
and prove it through deterministic commands without relying on tribal
knowledge.

## Principles

- Complexity is the enemy. Prefer obvious files, direct data flow, and boring,
  strict, portable defaults over clever local machinery. See:
  https://grugbrain.dev/.
- `mise run ...` is the developer API; package managers, compilers, test
  runners, and Dagger stay behind mise tasks.
- Prefer executable config as source of truth; docs should point at it, not
  duplicate it.
- Design for agent legibility: conventional layouts, precise names and types,
  explicit inputs, outputs, and side effects, actionable failures, and stable
  tests at real boundaries.
- Say no to abstractions, frameworks, services, config layers, and docs that do
  not remove real complexity.
- Respect Chesterton fences. Understand why code exists before deleting or
  replacing it.
- By default, do not add backwards-compatibility fallback code/versioning unless
  the repo is Production-critical or the user specifically requests it.
- Add structure after the shape is visible. Small duplication beats premature
  indirection.
- Copyable files need neutral names, conventional `src`/`tests`, no machine
  paths, no repo-only assumptions.
- Bootstrap scripts stay idempotent, convergent, and cautious with unmanaged
  files.
- Do not prematurely optimize; good-enough easy to reason about idiomatic code
  is best.

## Commands

Everything a developer does goes through mise.

- `mise run tasks`: list tasks.
- `mise run lock`: refresh the root mise lockfile after tool-version changes.
- `mise run secrets`: scan the standards repository for secrets.
- `mise run standards`: root Shell and all-fixture autofix workflow.
- `mise run standards:biome:check`: validate the optional Biome TypeScript
  template with the pinned stable CLI.
- `mise run standards:drift`: manifest/drift check for profile fixtures.
- `mise run testers:standards`: run all tester mini projects through their
  standards autofixes.
- `mise run testers:standards:check`: run all tester mini projects through
  their standards CI gates.
- `mise run testers:standards:check:isolated`: run the representative Python
  fixture gate in Dagger.
- `mise run standards:check`: root secret scan, Biome template validation,
  drift and Shell checks, plus every fixture gate.

Do not call package managers, compilers, test runners, or Dagger directly unless
fixing the relevant mise task itself. If install needs network, run it through
mise and report that.

## Editing

- Make the smallest coherent change that solves the task.
- Root files and `.config/mise/`: repo maintenance.
- `shared/`, `Mise/`, `Dagger/`, and stack folders are copyable templates.
- Changing `Mise/`, `Dagger/`, or a tested stack means updating the matching
  fixture when applicable.
- Follow existing language/tool config instead of restating it here.
- Keep strict type modes and static analysis passing.
- Prefer boring modules with clear inputs/outputs.
- Avoid global state, hidden I/O, and action at a distance.
- Put code near the thing it affects when that improves readability.
- `standards.manifest.toml` is the profile source of truth. Add or remove
  tested profiles there, and let `scripts/check-standards-drift.py --list-testers`
  drive aggregate tester loops. Keep declared mirror paths byte-for-byte
  aligned, refresh affected fixture lockfiles, then run `mise run
  standards:drift` before the root gate.
- Fixtures prove install, format, lint/static analysis, and tests. Keep them
  tiny, not example apps.
- Commit the root `.config/mise/mise.lock` and deterministic tester
  `.config/mise/mise.lock` files; never commit dependencies, build output,
  caches, coverage, or local state.
- Do not hand-edit generated output. Fix the source template/task and
  regenerate.
- Do not commit secrets. Use local env files for machine-specific values.

## Generated Output

Treat these as generated unless the task is specifically about them:

- dependency dirs: `node_modules/`, `vendor/`
- build/cache dirs: `build/`, `dist/`, `out/`, `coverage/`, `.cache/`
- release output: `sbom/`
- framework/tool dirs: `.next/`, `.nuxt/`, `.turbo/`, `.vite/`, `.svelte-kit/`
- language outputs: `target/`, `bin/Debug/`, `bin/Release/`, `obj/`,
  `.gradle/`, `.kotlin/`, `_build/`, `deps/`, `dist-newstyle/`,
  `.stack-work/`, `.zig-cache/`, `zig-cache/`, `zig-out/`, `zig-pkg/`
- tool caches: `.phpunit.cache/`, `.phpstan.cache/`,
  `.lua-language-server/`, `*.tsbuildinfo`, `.elixir_ls/`

If generated output is stale, fix the source template/task and regenerate.

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
- Before handoff, run `mise run standards:check` unless blocked or the user asks
  to skip it; report any skipped verification and why.

## Git

- Do not revert user changes unless explicitly asked.
- Keep generated and local-only files out of commits.
- Follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/#specification)
  for all git commit messages.
