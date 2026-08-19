# Python Standards

Copy `pyproject.toml` and `.github/` (workflow, CODEOWNERS, PR template) into
a Python project and replace the placeholder package names:

- `project-name`: the distribution name.
- `project_name`: the import package under `src/`.

Merge `AGENTS.md` into the repository's agent guide; it holds the agent-driven
doctrine the enforcement below mechanizes. Copy the catalog's
`shared/.gitignore` too (or fold it into the repo's own): it keeps `mutants/`,
`.hypothesis/`, and the other tool outputs out of version control. For the
property-testing posture `AGENTS.md` describes, register the Hypothesis `ci`
profile in `tests/conftest.py`:

```python
from hypothesis import settings

settings.register_profile("ci", derandomize=False, print_blob=True)
settings.load_profile("ci")
```

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
and `pickle` (TID251, remediation-shaped messages), a `global` ban
(PLW0603), and async/datetime hygiene for blocking sleeps and naive
datetimes (ASYNC, DTZ). Basedpyright runs in `all` mode and rejects rule-less or stale
`# pyright: ignore` comments. Bandit checks source security, tests collect
branch coverage against the `fail_under` ratchet, Hypothesis carries property
tests (pin triaged counterexamples as `@example`; `.hypothesis/` stays
untracked), `py:deps` fails on unused or missing dependencies (deptry),
`py:audit` checks locked dependencies, `py:mutants` runs the mutmut mutation
sweep against the committed `.mutmut-floor` ratchet (a coarse regression
alarm, not a per-mutant guarantee; a missing floor fails rather than
passing vacuously; survivors in changed code are dispositioned in review),
and `py:build` verifies wheel and source distributions. Projects that want a
heavier analysis profile can use
`py:deep` for mypy, documentation coverage (gating at 100 when run),
complexity, dataclass slots, and high-confidence dead-code checks.
`py:standards:check:deep` runs the standard CI gate, including the dependency
audit, before the optional deep analyzers. Generate and commit `uv.lock` before
relying on `py:standards:check`; the CI gate fails when the lockfile is missing
or stale. Bootstrap the mutation floor the same way: run
`MUTMUT_FLOOR=0 mise run py:mutants` once and commit the measured score it
reports as `.mutmut-floor`.

Strictness is the starting point, not an obligation. Relax or remove checks
that do not fit the project's risk, lifecycle, typing surface, or migration
state.

`.github/CODEOWNERS` lists the enforcement surface: point its placeholder
at a real owner and require code-owner review on the protected branch, and
every wall edit mechanically needs a named human's approval — that host
setting is what turns "loosening requires human countersign" from an
instruction into a gate. Without it, countersign is a review duty the PR
template reminds humans to perform.

The aggregate `mise run fmt`, `mise run lint`, `mise run test`, and
`mise run standards:check` commands also dispatch to these Python tasks when
`pyproject.toml` is present.
