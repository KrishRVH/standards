# Python Standards

Copy `pyproject.toml` into a Python project and replace the placeholder package
names:

- `project-name`: the distribution name.
- `project_name`: the import package under `src/`.

Merge `AGENTS.md` into the repository's agent guide; it holds the agent-driven
doctrine the enforcement below mechanizes.

Use this with the shared mise template:

```text
.config/mise/config.toml
.config/mise/conf.d/20-python.toml
```

Day-to-day commands should go through mise:

```sh
mise run py:fmt:check
mise run py:lint
mise run py:test
mise run py:mutants
mise run py:build
mise run py:lock
mise run py:lock:check
mise run py:audit
mise run py:standards
mise run py:standards:check
mise run py:deep
mise run py:standards:check:deep
```

The default gate is strict. Ruff runs a high-signal core (Pyflakes,
pycodestyle errors, isort, Bugbear, pyupgrade) plus the agent-driven walls:
blanket-suppression bans (PGH), self-expiring noqa comments (RUF100, fixed by
`py:standards`), security rules (S, mirroring bandit through the policed noqa
channel), the banned-API wall for ambient clocks, RNGs, environment reads,
and `pickle` (TID251, remediation-shaped messages), and a `global` ban
(PLW0603). Basedpyright runs in `all` mode and rejects rule-less or stale
`# pyright: ignore` comments. Bandit checks source security, tests collect
branch coverage against the `fail_under` ratchet, Hypothesis carries property
tests (pin triaged counterexamples as `@example`; `.hypothesis/` stays
untracked), `py:deps` fails on unused or missing dependencies (deptry),
`py:audit` checks locked dependencies, `py:mutants` runs the mutmut mutation
sweep against the committed `.mutmut-floor` ratchet (a missing floor fails
rather than passing vacuously), and `py:build` verifies wheel and source
distributions. Projects that want a heavier analysis profile can use
`py:deep` for mypy, documentation coverage (gating at 100 when run),
complexity, dataclass slots, and high-confidence dead-code checks.
`py:standards:check:deep` runs the standard CI gate, including the dependency
audit, before the optional deep analyzers. Generate and commit `uv.lock` before
relying on `py:standards:check`; the CI gate fails when the lockfile is missing
or stale.

Strictness is the starting point, not an obligation. Relax or remove checks
that do not fit the project's risk, lifecycle, typing surface, or migration
state.

The aggregate `mise run fmt`, `mise run lint`, `mise run test`, and
`mise run standards:check` commands also dispatch to these Python tasks when
`pyproject.toml` is present.
