# Agent Guide

Read `CONTEXT.md` first if it exists. Then read relevant ADRs/docs before
changing architecture or domain language. Use this file for agent working rules.

## Design Target

Prioritize ecosystem-idiomatic, systems-like strictness and elegance. Agentic
development is central: an agent should be able to discover the intended workflow,
understand contracts from nearby code, config, and tests, make a narrow change,
and prove it through deterministic commands without relying on tribal
knowledge.

## Principles

- Prefer ASD-STE100 Simplified Technical English for user communications. No dead prose.
- When writing technical documentation, follow the
  [Google Developer Docs Style Guide](https://developers.google.com/style).
- Complexity is the enemy. Prefer obvious code, local state, and direct data
  flow over clever abstractions. See [grugbrain.dev](https://grugbrain.dev/).
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
- Do not prematurely optimize; good-enough easy to reason about idiomatic code
  is best.

## Commands

Everything a developer does goes through mise.

- `mise run tasks`: list available tasks.
- `mise run install`: install pinned tools.
- `mise run fmt`: format.
- `mise run fmt:check`: verify formatting.
- `mise run lint`: lint/static analysis.
- `mise run test`: tests.
- `mise run standards`: local standards workflow and available autofixes before
  `standards:check`.
- `mise run standards:check`: full CI gate.
- `mise run secrets`: scan the working tree for secrets.
- `mise run sbom`: generate a CycloneDX JSON SBOM under `sbom/`.
- `mise run dagger:standards:check`: optional isolated CI gate when Dagger is
  configured.

Do not call package managers, compilers, test runners, or Dagger directly
unless working on the mise task itself.

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
- release output: `sbom/`
- framework/tool dirs: `.next/`, `.nuxt/`, `.turbo/`, `.vite/`, `.svelte-kit/`
- Godot output: `.godot/`, `*.translation`
- language outputs: `target/`, `bin/Debug/`, `bin/Release/`, `obj/`,
  `.gradle/`, `.kotlin/`, `_build/`, `deps/`, `dist-newstyle/`,
  `.stack-work/`, `.zig-cache/`, `zig-cache/`, `zig-out/`, `zig-pkg/`
- tool caches: `.phpunit.cache/`, `.phpstan.cache/`,
  `.lua-language-server/`, `*.tsbuildinfo`, `.elixir_ls/`

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
- Before handoff, run `mise run standards:check` unless blocked; report any skipped
  verification and why.

## Git

- Do not revert user changes unless explicitly asked.
- Keep generated and local-only files out of commits.
- Follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/#specification)
  for all git commit messages.
- Write commit messages for future maintainers. Use
  [Tim Pope's note](https://tbaggery.com/2008/04/19/a-note-about-git-commit-messages.html)
  and [Chris Beams' guide](https://cbea.ms/git-commit/) as the Git-specific
  references. Use [ASD-STE100 Simplified Technical English](https://www.asd-ste100.org/)
  and the [Google developer documentation style guide](https://developers.google.com/style)
  for clear, consistent prose.
- Keep the Conventional Commit subject concise. Write its description in the
  imperative mood, use the repository's lowercase style, and omit ending
  punctuation. Aim for 50 characters and do not exceed 72 characters.
- Add a body only when it provides useful context. Separate it from the subject
  with a blank line, wrap it at 72 characters, and explain the problem, the
  reason for the change, and material consequences. Let the diff explain the
  implementation.
- Use short, direct sentences, active voice, and consistent terminology. Avoid
  idioms, filler, vague wording, and unnecessary jargon.
