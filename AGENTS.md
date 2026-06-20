# Agent Guide

Copy-from standards catalog. Canonical consumer templates: `shared/`, `Mise/`,
`Dagger/`, `C/`, `C#/`, `C++/`, `Elixir/`, `Go/`, `Haskell/`, `Kotlin/`,
`Lua/`, `PHP/`, `Python/`, `Rust/`, `TS/`, `Zig/`. Root docs/config maintain
this repo. `testers/` smoke-test copied standards for every language template.

## Philosophy

- Boring, strict, portable defaults beat clever local machinery.
- `mise run ...` is the developer API; package managers, compilers, test
  runners, and Dagger stay behind mise tasks.
- Prefer executable config as source of truth; docs should point at it, not
  duplicate it.
- Add abstraction only when it clarifies the reusable standard.
- Copyable files need neutral names, conventional `src`/`tests`, no machine
  paths, no repo-only assumptions.
- Bootstrap scripts stay idempotent, convergent, and cautious with unmanaged
  files.

## Commands

- `mise run tasks`: list tasks.
- `mise run check`: root gate, all fixtures.

Do not call package managers, compilers, test runners, or Dagger directly unless
fixing/investigating the relevant mise task. If install needs network, run it
through mise and report that.

## Editing

- Root files and `.config/mise/`: repo maintenance.
- `shared/`, `Mise/`, `Dagger/`, and stack folders are copyable templates.
- Changing `Mise/`, `Dagger/`, or a tested stack means updating the matching
  fixture when applicable.
- Fixtures prove install, format, lint/static analysis, and tests. Keep them
  tiny, not example apps.
- Commit deterministic tester `.config/mise/mise.lock` files; never commit
  dependencies, build output, caches, coverage, or local state.
- Do not hand-edit generated output. Fix the source template/task and
  regenerate.
- Use `rg` and targeted reads. Skip generated/vendor trees wholesale.

## Verification

Run `mise run check` before handoff unless blocked. One fixture first is fine;
finish with the root gate before calling the repo green.

## Git

- Do not revert user changes unless asked.
- Keep generated/local files out of commits.
- Use short, imperative, specific commit messages.
