# Python agent guide

Use this fragment with the project's shared agent guide. `pyproject.toml`
owns lint, type, security, dependency, coverage, and test settings. The mise
fragment owns commands. Read [setup and gate details](README.md) when adopting
the profile, changing tools, or working on mutation infrastructure.

## Work and verification

Use `mise run py:...` for development. Run `py:lint` and `py:test` for source
changes; `py:standards` applies Ruff fixes and formatting. Keep `uv.lock`
committed and refresh it through `py:lock` after dependency changes.

Run `mise run py:standards:check` before handoff. `py:deep` adds optional
dependency-sensitive analyzers; `py:standards:check:deep` runs both lanes.
Report skipped checks and their reasons. Fix diagnostics at their cause.

## State and boundaries

Keep state on its owner and pass values explicitly. Read configuration and
acquire clocks or random generators at the composition root, then inject them.
The Ruff banned-API messages identify the supported replacements; equivalent
ambient APIs remain subject to the same design rule. Prefer typed inputs,
outputs, and errors at boundaries over hidden I/O or global mutation.

## Local exceptions

Use the smallest site and name the invariant that holds and why restructuring
would be worse:

- Types: `# pyright: ignore[rule] -- reason`. Basedpyright rejects rule-less
  and stale ignores. `# type: ignore` is forbidden.
- Lint: `# noqa: CODE -- reason`. Ruff rejects unknown codes and stale
  suppressions. Ruff security rules and Bandit run independently; an exception
  must satisfy each diagnostic that fires.
- Bandit: `# nosec B123 -- reason`.
- Coverage: `# pragma: no cover -- reason` or `# pragma: no branch -- reason`.
- Mutation: `# pragma: no mutate -- reason`, explaining why no test can
  distinguish the equivalent mutant.

`py:suppressions` checks source comments, including root modules, tests, and
scripts. File-level tool configuration, formatting/import-order directives,
and ranged mutation exclusions are forbidden. Keep analyzer configuration
exceptions narrow and explained beside the setting. The sole accepted mypy
file directive is the fixture's two-rule Hypothesis integration exception.
Read the [scanner scope](README.md) when adding unusual source layouts or
symlinks.

## Tests and mutation

A behavior change needs a test that fails without it. Tests may assert
invariants they establish. Use Hypothesis at trust boundaries and preserve
triaged counterexamples with `@example`; `.hypothesis/` remains a local cache.

Use `py:mutants:incremental` for cached feedback and `py:mutants` for fresh
handoff evidence. A survivor needs a test that kills it, removal of code with
no reachable behavior, or a reasoned per-site classification. The mutation
floor and coverage floor are regression alarms, not proof about each branch.
Raising them is normal work; lowering them or classifying a mutant requires
human approval. Carry survivors and classification reasons into the handoff.

Read [mutation setup and lock recovery](README.md) before initializing
`.mutmut-floor` or clearing `.mutmut-run.lock/`. Confirm that the runner and its
descendants have stopped before removing a stale lock.

## Review and handoff

For a non-trivial change, obtain an independent read-only review of tests,
changed code, and affected contracts. Add focused reviewers when the risk or
breadth warrants them. Verify material findings with source evidence or a
regression test, and record unresolved design questions.

Explain enforcement changes and get human approval for relaxations. Report
the checked revision, behavior proved, commands run, and remaining findings;
recheck affected evidence after further edits. Bots advise, gates block, and
humans merge.
