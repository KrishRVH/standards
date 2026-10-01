# Agent Guide

Read `shared/AGENTS.md` first and follow it. This file adds the catalog's rules
and wins where the two differ.

Copy-from standards catalog. Canonical consumer templates: `shared/`, `Mise/`,
`Dagger/`, `C/`, `C#/`, `C++/`, `Elixir/`, `Fortran/`, `GDScript/`, `Go/`,
`Haskell/`, `JS/`, `Kotlin/`, `Lua/`, `Markdown/`, `Odin/`, `PHP/`, `Python/`,
`Roc/`, `Rust/`, `Shell/`, `SPARK/`, `TS/`, `Zig/`. Root docs/config maintain
this repo. `testers/` smoke-test copied standards for every language template.

## Principles

- Copyable files need neutral names, conventional `src`/`tests`, no machine
  paths, no repo-only assumptions.
- Bootstrap scripts stay idempotent, convergent, and cautious with unmanaged
  files.

## Commands

`mise tasks` lists only the root's tasks. These need more than the listing
says:

- `mise lock`: refresh the root mise lockfile after tool-version changes.
- `mise run //testers/...:standards:check`: run every tester mini project
  through its standards CI gate; `//testers/...:standards` applies autofixes.
- `mise run //testers/python:dagger:standards:check`: run the representative
  Python fixture gate in Dagger.
- `mise run standards:check`: root secret scan and hygiene, then ESLint and
  Prettier secondary validation, drift, Markdown, and Shell checks, plus every
  fixture gate.

Workstation tools and shell configuration follow host conventions. Keep prompt,
history, navigation, and completion setup independent of mise. Shell activation
and shims are optional choices for a concrete tool-version need, never a
prerequisite for `mise run`. The WSL bootstrap chooses cached interactive mise
activation for runtime selection, with shims disabled; macOS keeps native
runtime paths without activation. Measure startup and repeated prompt latency
when changing shell integration. For workstation changes, read
`extras/workstation/README.md` and test the generated configuration, including
startup from a parent environment with stale shims.

## CI

This repository's own CI is manual-only by budget constraint. The root
`.github/workflows/quality.yml` triggers on `workflow_dispatch` and nothing
else; do not add `push`, `pull_request`, `schedule`, or `merge_group` triggers
to it. Gates run locally before push, and hosted runs are dispatched on
demand.

Template workflows (`Rust/.github/`, `TS/.github/`, `C#/.github/`,
`Python/.github/`) ship automatic triggers for downstream copies only; they
are inert here because GitHub executes workflows only from the root
`.github/workflows/`. `scripts/check-profile-governance.mjs` validates workflow
YAML with actionlint, then parses it to enforce automatic triggers, one
`quality` job, hardened checkout, immutable action pins, CODEOWNERS, and related
host-setting and pull-request guidance across all four templates.
`testers/ts/tests/quality-workflow.test.ts` separately enforces the root
workflow's manual-only contract and the TypeScript-specific workflow behavior.

## Editing

- Record a catalog-wide proposal that is not worth its churn yet in
  `docs/IDEAS.md`.
- Root files and `.config/mise/`: repo maintenance.
- `shared/`, `Mise/`, `Dagger/`, and stack folders are copyable templates.
- Template ignore, attribute, and allowlist files carry broad, generally useful
  ecosystem coverage, including ecosystems without a profile here. Adopters
  copy the shared ones whole and prune profile ones to their project. Do not
  narrow them to this catalog's profiles.
- Put language-specific agent guidance in that language's `AGENTS.md`; reserve
  `shared/AGENTS.md` for guidance that applies across languages.
- Changing `Mise/`, `Dagger/`, or a tested stack means updating the matching
  fixture when applicable.
- `standards.manifest.toml` is the profile source of truth. Add or remove
  tested profiles there. The root monorepo discovers `testers/*`; keep the
  drift checker proving that every discovered fixture is declared and every
  declaration has a fixture. Keep declared mirror paths byte-for-byte aligned,
  refresh affected fixture lockfiles, then run `mise run standards:drift`
  before handoff.
- Fixtures prove install, format, lint/static analysis, and tests. Keep them
  tiny, not example apps.
- Commit the root `.config/mise/mise.lock` and deterministic tester
  `.config/mise/mise.lock` files; never commit dependencies, build output,
  caches, coverage, or local state.

## Testing

- Before handoff, use `standards.manifest.toml` to identify every changed
  profile's tester and task prefix, then run each affected fixture gate as
  `mise run //<tester>:<task-prefix>:standards:check`.
- Run `mise run standards:drift` after changing a template, shared task,
  manifest entry, or fixture configuration. Run the closest root check for
  other changed root files, such as `mise run md:standards:check` for Markdown.
- Run the aggregate `mise run standards:check` for release/CI validation,
  changes to shared or aggregate infrastructure that can affect unrelated
  fixtures, or when the user explicitly requests it.
