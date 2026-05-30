# Agent Guide

This repository maintains reusable standards templates. The root files are for
maintaining this repository; copyable consumer defaults live in `shared/` and
the language-specific folders.

## Repository Shape

- `shared/`: generic files intended to be copied into other repositories.
- `Mise/`, `Dagger/`, `C/`, `C#/`, `Lua/`, `PHP/`, `Rust/`, `TS/`: copyable
  standards templates.
- `testers/`: small standalone projects that prove copied standards work
  through the documented `.config/mise` layout. C# and Rust testers are
  intentionally absent.
- `.config/mise/config.toml`: maintenance entrypoint for this repository.

## Commands

Everything goes through mise.

- `mise run tasks`: list maintenance tasks.
- `mise run check`: run all tester mini projects.

Do not call package managers, compilers, test runners, or Dagger directly unless
you are fixing the mise task or investigating a failing task. If a tool install
needs network access, run it through mise and report that requirement.

## Editing Rules

- Keep template files copyable and boring. Avoid repo-local assumptions in
  `shared/` and language template folders unless they are clearly part of the
  standard.
- Keep repo-maintenance behavior in root files and `testers/`.
- When changing a language stack that has a tester, update the matching tester
  project and verify it through `mise run check`.
- Keep tester projects smoke-test sized. They should prove install, format,
  lint/static analysis, and tests work; they are not example applications.
- Commit tester lockfiles when they make installs deterministic. Do not commit
  generated dependency, build, cache, or coverage output.
- Do not hand-edit generated output. Fix the template/task and regenerate when
  needed.
- Use `rg` and targeted reads. Do not inspect generated/vendor trees wholesale.

## Verification

Before handoff, run `mise run check` unless blocked. If only one stack changed,
you may run that fixture first, but finish with the root check before claiming
the repository is green.

## Git

- Do not revert user changes unless explicitly asked.
- Keep generated and local-only files out of commits.
- Commit messages should be short, imperative, and specific.
