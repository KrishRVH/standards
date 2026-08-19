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

Exceptions are per-site, reasoned, and self-expiring:

- Type suppressions are `# pyright: ignore[rule]`; basedpyright rejects an
  ignore without a rule name and fails the build when the ignore stops
  matching a real diagnostic, so stale type suppressions cannot accumulate.
- Lint suppressions are `# noqa: CODE` with the specific code; blanket
  `# noqa` and blanket `# type: ignore` fail (PGH004, PGH003), and a noqa
  whose diagnostic no longer fires fails via RUF100 and is removed by the
  `py:standards` autofix.
- Security findings ride the same channel: ruff's S rules mirror bandit, so
  their suppressions are policed noqa comments. A standalone-bandit `# nosec`
  must carry the rule id and a reason — no tool enforces that, so it is an
  explicit review duty, stated here rather than papered over.
- No Python tool can require a reason string beside a suppression. The
  reason is still required — by review, with the same shape as the other
  profiles: name the invariant that holds, then why the structural fix
  loses.

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
  delete — the code loses the branch the suite cannot reach; or classify —
  a `# pragma: no mutate` whose neighboring comment names why no test can
  observe the mutant (equivalent mutants exist). Classify is a wall edit
  requiring human countersign. mutmut has no native break threshold, so the
  task gates on the committed `.mutmut-floor` ratchet — a coarse regression
  alarm, not a per-mutant guarantee; survivors in changed code are
  dispositioned in review. Raising the floor is normal work; lowering it
  requires human countersign, and a missing floor fails rather than
  passing vacuously. mutmut caches per-function results in `mutants/`,
  which is its incremental inner loop.
- Coverage gates at the `fail_under` ratchet in `[tool.coverage.report]`,
  under the same raise-freely, lower-with-countersign rule.

Adversarial self-review and merge shape follow the catalog doctrine: a green
gate is necessary, never sufficient; the diff gets a fresh-context pass from
up to three cheap reviewers decorrelated by input view (test diff only, full
diff, code without the change narrative) who flag and never rewrite;
findings collect on the union after dedup, and severity triage decides what
blocks. Any edit to the enforcement surface — `pyproject.toml` tool
sections, `.mutmut-floor`, the mise tasks — is a finding by default, and
loosening requires human countersign. A disputed finding is settled by
writing the failing test; a finding no test can express is recorded as a
design note with a named owner, and a question of intent escalates to the
human who owns it. Verdicts pin the commit they judged; bots advise, gates
block, humans merge.
