# Python Standards

Copy `pyproject.toml`, `scripts/`, and `.github/` (workflow, CODEOWNERS, PR
template) into a Python project and replace the placeholder package names:

- `project-name`: the distribution name.
- `project_name`: the import package under `src/`.

Merge `AGENTS.md` into the repository's agent guide; it holds the agent-driven
doctrine the enforcement below mechanizes. Copy the catalog's
`shared/.gitignore` too (or fold it into the repo's own): it keeps `mutants/`,
`.mutmut-run.lock/`, `.hypothesis/`, and the other tool outputs out of version
control. For the property-testing posture that `AGENTS.md` describes, register
the Hypothesis `ci` profile in `tests/conftest.py`:

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
mise run py:suppressions
mise run py:test
mise run py:mutants
mise run py:mutants:incremental
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
`py:standards`), and invalid noqa-code detection (RUF102). `py:suppressions`
tokenizes actual comments and requires rule-specific reasons for Ruff,
basedpyright, Bandit, coverage, and mutmut escapes; it rejects every
formatter/import-order directive, ranged mutation exclusions, and file-level
Ruff, Flake8, and Pyright configuration. Its no-argument scan includes
root-level `.py` and `.pyi` modules as well as packages, tests, and scripts;
it prunes ignored dependency and generated trees without excluding a nested
first-party `mutants/` or `vendor/` package. Python-named file symlinks remain
in scope; non-pruned first-party directory symlinks fail because the toolchain
does not consume and package them consistently. Named dependency/cache trees
remain deliberately outside this policy. The scanner also rejects broad mypy file
configuration, permitting only the documented two-rule Hypothesis exception.
The scanner also checks directives following earlier comment fragments and
the alternate spellings recognized by Coverage. Mutmut exclusions hidden in
another directive's reason fail too. Ruff security rules and Bandit run
independently: a Ruff `noqa` does not suppress Bandit's finding; a deliberate
exception must satisfy each tool's reasoned form. The
banned-API wall covers ambient clocks, RNGs, environment reads, and `pickle`
(TID251, remediation-shaped messages); PLW0603 bans `global`, and ASYNC/DTZ
catch blocking sleeps in async code and naive datetimes.
Basedpyright runs in `all` mode and rejects rule-less or stale
`# pyright: ignore` comments. Ruff skips only mutmut's generated root tree;
Ruff, Bandit, and Vulture still inspect legitimate nested `mutants/`
directories. Bandit checks source security, tests collect
branch coverage against the `fail_under` ratchet, Hypothesis carries property
tests (pin triaged counterexamples as `@example`; `.hypothesis/` stays
untracked), `py:deps` fails on unused or missing dependencies (deptry),
`py:audit` checks locked dependencies, and `py:mutants` runs a cold mutmut
sweep against the committed `.mutmut-floor` ratchet. Its report must have
internally consistent terminal counts and at least one executed mutant;
skipped and no-test results do not count. The explicit
`py:mutants:incremental` task reuses valid per-function results only for the
inner loop. Both tasks hold `.mutmut-run.lock/` across state preparation,
mutation, report export, and validation, so overlapping runs fail before they
touch shared state. Normal exit, SIGINT, and SIGTERM release the lock only after
the complete command process group exits; a TERM-resistant descendant is
killed before cleanup. If descendant shutdown cannot be confirmed, or a hard
kill bypasses cleanup, the lock remains fail closed. Check for live `mutmut`,
mutation subprocess descendants, or transaction-runner processes first, then
remove the lock only when none remain. The ratchet is a coarse regression
alarm, not a per-mutant guarantee; a missing floor fails, and survivors in
changed code are dispositioned in review. `py:build` verifies wheel and source
distributions.
Projects that want a heavier analysis profile can use `py:deep` for mypy,
exact zero-missing documentation coverage, complexity, dataclass slots, and
high-confidence dead-code checks.
`py:standards:check:deep` runs the standard CI gate, including the dependency
audit, before the optional deep analyzers. Generate and commit `uv.lock` before
relying on `py:standards:check`; the CI gate fails when the lockfile is missing
or stale. Bootstrap the mutation floor the same way: run
`MUTMUT_FLOOR=0 mise run py:mutants` once, copy the complete decimal from
`Ratchet floor candidate`, and commit it as `.mutmut-floor`.

Strictness is the starting point, not an obligation. Relax or remove checks
that do not fit the project's risk, lifecycle, typing surface, or migration
state.

`.github/CODEOWNERS` deliberately assigns every path to the placeholder owner
because source files can carry mutation classifications and diagnostic
suppressions. Point the placeholder at a real human, require the `quality` job
and Code Owner review, dismiss stale approvals on every new commit, and
disallow protection bypass. The latest-push approval option is not a substitute
for stale dismissal: its approver need not be the code owner. These host
settings turn "loosening requires human countersign" from an instruction into
a gate.

The aggregate `mise run fmt`, `mise run lint`, `mise run test`, and
`mise run standards:check` commands also dispatch to these Python tasks when
`pyproject.toml` is present.
