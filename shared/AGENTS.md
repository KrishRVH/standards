# Agent Guide

Read `CONTEXT.md` first if it exists. Then read the docs that own the change
before changing architecture or domain language. Use this file for agent
working rules.

## Design Target

Optimize for agent-driven delivery: the human owns product intent, constraints,
and acceptance; agents discover, implement, diagnose, and verify bounded work.
A fresh agent should find the repository's workflows, contracts, and current
state from local files. Report what changed, which checks ran, and their
results, so the human can judge the outcome without reconstructing
implementation details.

Keep ecosystem-idiomatic strictness where it prevents concrete failures. Judge
each tool, rule, test, and abstraction by the uncertainty, defects, or manual
work it removes, including its runtime and maintenance cost. Remove ceremony
that cannot justify that cost.

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
  replacing it; once it serves no current contract, delete it.
- Add structure after the shape is visible. Small duplication beats premature
  indirection.
- Build deep modules with small interfaces. Change a feature's behavior,
  state, and tests together, and put tests where the ecosystem expects them.
  Split a module when it holds more than one cohesive responsibility. Fold
  shallow wrappers and forwarding helpers into their callers.
- Import through the owning module's intended interface. Delete re-exports
  that only preserve obsolete paths.
- Name things for what they do in the domain, in `CONTEXT.md` vocabulary.
- Comments explain a current invariant, a non-obvious algorithm, a trust
  boundary, or a public interface. Delete prose that retells an old
  implementation or narrates what names and types already say.
- Do not prematurely optimize; good-enough easy to reason about idiomatic code
  is best. Measure before a choice that is expensive to reverse. Put the
  hardware, inputs, and measurements in the commit message, including the
  options you measured and rejected. Never discard a sample for being slow.

## Leave It Current

The repository holds current contracts: the code, the tests that defend it, and
the docs that explain it. Git holds history. Unless the project has released
users or a documented external contract, it makes no compatibility promise: no
shims, aliases, deprecations, dual code paths, format migrations, or
version-numbered names.

- Supersede rather than accumulate. Rename in place, replace a format, and
  delete the old reader with its fixtures and tests in the same change.
- A change that makes something obsolete removes it: functions and exports
  nothing calls, config keys nothing reads, tests of retired behavior, and docs
  that describe it. Finishing a feature includes removing the scaffolding that
  built it.
- Shipped code has no test-only branches, alternate rules, or test-only
  diagnostic surfaces. Narrow test-build instrumentation and fault injection,
  such as `#[cfg(test)]` code, are fine when they leave production semantics
  unchanged, and so is a seam that production also uses, such as a seed or an
  event log that feeds replays.
- Proof lives in the gate. Back each lasting claim with a test in
  `standards:check` or a task that checks a stated target. A one-off
  diagnostic leaves with the question it answered, and its result goes in the
  commit message. Do not build evidence scaffolding, such as bundles,
  manifests, or checks that repeat a guarantee the gate or toolchain already
  gives. Keep focused tests for the scripts and measurements the workflow
  relies on.
- Prefer native toolchain guarantees, remove duplicate checks, and measure the
  gate's routine cost before you add verification.
- Keep task notes in `.scratch/` and run output in `artifacts/`. Both stay
  untracked and never become a second policy source. Do not commit briefs,
  plans, handoffs, research, reports, or dated audits.
- `mise run hygiene` enforces the mechanical part and prints the tree's size by
  category, so growth shows in every handoff. Explain growth that the change
  does not account for.
- Run a repository-wide polish pass at each milestone rather than letting
  sediment build up until it slows work.

## Commands

Use `mise run ...` as the default entry point for project workflows such as
build, format, test, and CI. Tasks hide the project-specific toolchain.
On entry, read the applicable agent guide and inspect `mise tasks` and task
definitions. Use the existing workflow and its arguments before adding a task.

- `mise tasks`: list available tasks.
- `mise install`: install pinned tools.
- `mise run fmt`: format.
- `mise run fmt:check`: verify formatting.
- `mise run lint`: lint/static analysis.
- `mise run test`: tests.
- `mise run hygiene`: tree size by category and repository hygiene rules.
- `mise run standards`: local standards workflow and available autofixes before
  `standards:check`.
- `mise run standards:check`: full CI gate.
- `mise run secrets`: scan the working tree for secrets.
- `mise run sbom`: generate a CycloneDX JSON SBOM under `sbom/`.
- `dagger:standards:check`: optional isolated CI gate, run through `mise run`
  when the project keeps the Dagger fragment.

Run ordinary utilities such as `git`, `rg`, and `tokei`, and standalone scripts,
directly. Use native commands for focused diagnosis; run the relevant mise gate for final project
verification. Use `mise exec -- <command>` only when that invocation needs a
project-pinned tool or environment and no suitable task exists.

Workstation tools and shell configuration follow host conventions. Keep prompt,
history, navigation, and completion setup independent of mise. Shell activation
and shims are optional choices for a concrete tool-version need, never a
prerequisite for `mise run`. Measure startup and repeated prompt latency when
changing shell integration.

## Editing

- Make the smallest coherent change that solves the task.
- Follow existing language/tool config instead of restating it here.
- Keep strict type modes and static analysis passing. Repair the cause of a
  failure; a retry does not turn an unexplained divergence into a pass.
- Suppress a lint only on the smallest item, with a stated reason. If the
  language supports it, use a suppression that fails when it becomes
  unnecessary.
- Prefer boring modules with clear inputs/outputs.
- Avoid global state, hidden I/O, and action at a distance.
- Put code near the thing it affects when that improves readability.
- Do not hand-edit generated files.
- Do not commit secrets. Use local env files for machine-specific values.

## Documentation

- Docs explain current behavior and design constraints. Update the owning page
  when the contract changes. State each policy once and link to it elsewhere.
- Write in the present tense. Do not date text or narrate history, as in "now
  uses", "no longer", "previously", or "the new parser".
- `docs/` holds current pages and their images. Record owner decisions on one
  current page and replace a decision when it changes.

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

- A test earns its place by defending behavior, an invariant, a failure mode,
  or a trust boundary that types and the gate do not already enforce. Do not
  test trivial getters, constructors, enum declarations, framework behavior,
  config values copied onto objects, or incidental numbers.
- A meaningful assertion fails for a concrete production defect and stays
  valid through behavior-preserving refactors. Show that a new or changed
  assertion can fail: a regression test that failed before the fix counts;
  otherwise inject a fault for its claim. Mechanical moves need no new
  evidence.
- Prefer one focused test at the narrowest stable interface over duplicated
  examples. Keep test setup smaller than the behavior it protects.
- For a deterministic system, pin end-to-end behavior with committed baselines
  that the gate verifies, such as golden logs or replays, and a task that
  re-authors them after an intended change. Review the baseline diff like code.
- Remove obsolete tests with the obsolete behavior. Test counts and coverage
  percentages are not goals.
- For bugs, reproduce with a failing regression test before fixing when
  practical.
- Keep E2E coverage small, important, and reliable.
- Run focused checks while iterating and one `mise run standards:check` for
  the coherent batch before handoff. Report any skipped verification and why.

## Review and Concurrency

- Scale process to risk. Ordinary work needs the request, a short task note,
  and the decisive checks, not a tracked brief.
- Get an independent agent review of the actual diff for non-trivial behavior
  and architecture changes. The author does not approve their own change.
  Verify material findings before acting on them.
- One writer owns one worktree, and reviewers stay read-only. Serialize
  lockfiles, shared configuration, formatters, and integration. Give each
  worktree its own build directory.

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
