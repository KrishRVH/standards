## Python Changes

- Treat formatter, lint, type, security, coverage, audit, dependency, and
  mutation failures as defects in the proposed change. Do not suppress a
  diagnostic merely to make the gate pass.
- Keep state owned and explicit: no `global` (PLW0603), no ambient clocks,
  RNGs, or environment reads (the banned-API wall in `pyproject.toml`); the
  composition root reads the outside world and passes values in.
- Use `mise run py:...`; do not call uv, ruff, pytest, or the analyzers
  directly. Keep `uv.lock` committed and current.
- Run `mise run py:standards:check` before handoff; report every skipped
  command and why.

## Hands-off development doctrine

This profile assumes the agent is the author and the first adversary; humans
audit reports rather than diffs. The machine owns every checkable rule, and
a diagnostic an agent can ignore does not exist. The optional deep lane
(`py:deep`) is the one sanctioned exception: opt-in analyzers whose findings
gate only when the lane runs.

Exceptions are per-site and reasoned. The accepted forms are:

- Type suppressions are `# pyright: ignore[rule] -- reason`; basedpyright
  rejects an ignore without a rule name and fails the build when the ignore
  stops matching a real diagnostic. `# type: ignore` is forbidden so there is
  only one local type-suppression channel. Keep analyzer-specific config
  exceptions scoped to the smallest file, as the Hypothesis fixture does for
  mypy, and explain them next to the setting.
- Lint suppressions are `# noqa: CODE -- reason` with every specific code.
  RUF102 rejects unknown codes, RUF100 expires comments whose diagnostics no
  longer fire, and `py:standards` removes stale comments.
- Security findings ride the same channel: ruff's S rules mirror bandit, so
  their suppressions are policed noqa comments. A standalone Bandit escape is
  `# nosec B123 -- reason`. Coverage exclusions use
  `# pragma: no cover -- reason` or `# pragma: no branch -- reason`.
- `py:suppressions` tokenizes source comments and enforces these forms plus
  the mutation form below across root modules, packages, tests, and scripts;
  directive-shaped text inside strings is ignored. Ignored dependency and
  generated trees are pruned, while a nested first-party `mutants/` package
  remains in scope. Ruff/Flake8 file directives, local Pyright configuration,
  every formatter/import-order directive, and ranged mutation exclusions are
  forbidden. A reason names the invariant that holds, then why the structural
  fix loses. The only accepted mypy file configuration is the two-rule
  Hypothesis integration exception named above; broad forms such as
  `ignore-errors` fail. Python-named file symlinks are inspected, while
  non-pruned first-party directory symlinks fail because the Python tools
  disagree about whether to inspect and package them. Dependency/cache trees
  named in the scanner remain deliberately outside this policy.

The banned-API wall (`[tool.ruff.lint.flake8-tidy-imports.banned-api]`,
TID251) bans ambient state by symbol with remediation-shaped messages:
clocks, global RNGs, environment reads outside the composition root,
`os._exit`, and `pickle`. The wall sees qualified names, not instances —
routing around it through an equivalent API violates the doctrine, not just
the lint.

Semantic verification — the gate proves form, and wrong logic type-checks:

- Done, for a behavior change, means at least one test fails without the
  change; the handoff report says which. Tests may assert freely
  (`tests/**` is exempt from S101).
- Trust boundaries get Hypothesis property tests. `.hypothesis/` is a local
  cache and stays out of version control; every triaged counterexample is
  pinned as a durable `@example` on the test (`print_blob=True` in the `ci`
  profile the README ships emits the reproduction line).
- `mise run py:mutants` is the mechanical adversary: would the tests notice
  if this code were wrong? A surviving mutant is a finding with exactly
  three exits: kill — the suite gains a test that observes the difference;
  delete — the code loses the branch the suite cannot reach; or classify — a
  `# pragma: no mutate -- reason` that explains why no test can observe the
  equivalent mutant. Classify is a wall edit requiring human countersign.
  mutmut has no native break threshold, so the task gates on the committed
  `.mutmut-floor` ratchet — a coarse regression alarm, not a per-mutant
  guarantee; survivors in changed code are dispositioned in review. Raising
  the floor is normal work; lowering it requires human countersign, and a
  missing floor fails rather than passing vacuously. The mandatory
  `py:mutants` gate deletes `mutants/` before running, validates the exact
  terminal-status totals, and requires at least one mutant to reach an
  executed status; skipped and no-test results do not count.
  `py:mutants:incremental` is the explicit cached inner loop; it never replaces
  the cold handoff gate. The reported floor candidate is safe to copy back
  verbatim without binary-float rounding. Both tasks hold the same project
  lock for deletion, execution, export, and validation. Normal exit, SIGINT,
  and SIGTERM release it only after the complete command process group exits;
  a TERM-resistant descendant is killed before cleanup. If descendant shutdown
  cannot be confirmed, or a hard kill bypasses cleanup,
  `.mutmut-run.lock/` remains fail closed. Check for live `mutmut`, mutation
  subprocess descendants, or `run-mutation-transaction.py` processes, then
  remove the stale lock only when none remain.
- Coverage gates at the `fail_under` ratchet in `[tool.coverage.report]`,
  under the same raise-freely, lower-with-countersign rule.

Adversarial self-review and merge shape follow the catalog doctrine: a green
gate is necessary, never sufficient. Every non-trivial diff gets three
fresh-context reviewers, one per input view: test diff only, full diff, and
code without the change narrative. They flag and never rewrite;
findings collect on the union after dedup, and severity triage decides what
blocks. Any edit to the enforcement surface — `pyproject.toml` tool
sections, `.mutmut-floor`, the mise tasks — is a finding by default, and
loosening requires human countersign. A disputed finding is settled by
writing the failing test; a finding no test can express is recorded as a
design note with a named owner, and a question of intent escalates to the
human who owns it. Metadata triage may fast-track a trivial diff to fewer or
no model reviewers only when the handoff records that classification and
reason. Model-review verdicts pin the commit they judged; bots advise, gates
block, humans merge.
