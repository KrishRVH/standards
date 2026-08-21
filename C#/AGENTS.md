## C# Changes

- Treat compiler, analyzer, formatting, lock-file, and test failures as defects
  in the proposed change. Do not suppress a diagnostic merely to make the gate
  pass.
- Keep dependencies explicit through constructors, parameters, and direct
  calls. Avoid service location, nested service providers, assembly scanning,
  and runtime discovery unless the workload genuinely requires them.
- Keep asynchronous work owned and cancellable. Avoid sync-over-async,
  `async void`, detached `Task.Run`, `Thread.Sleep`, and ambient time; use
  `TimeProvider` where behavior depends on the clock.
- Keep using directives file-local and avoid `dynamic` so dependencies and type
  contracts remain visible to the compiler and reader.
- Keep package versions in `Directory.Packages.props` and commit project lock
  files. Do not add project-local versions or warning overrides.
- Prefer built-in .NET facilities and direct mapping over framework layers,
  mediator pipelines, reflection mapping, or generic repositories.
- Do not suppress by reflex. The only sanctioned form is a per-site
  `[SuppressMessage]` with a real justification; bare `#pragma warning`,
  `NoWarn`, `WarningsNotAsErrors`, and global suppression files are wall
  edits, not exceptions. See the hands-off doctrine below.
- Run `mise run csharp:standards:check` before handoff.

## Hands-off development doctrine

This profile assumes the agent is the author and the first adversary; humans
audit reports rather than diffs. The machine owns every checkable rule:
compiler, analyzer, formatting, banned-API, unused-reference, audit, and
mutation failures all fail the build. A diagnostic an agent can ignore does
not exist.

Exceptions are per-site, reasoned, and machine-checked where the toolchain
allows:

- Suppress through `[SuppressMessage]` with a real `Justification`, never a
  bare pragma: SA1404 rejects a missing, blank, or `<Pending>` justification.
  Review rejects other placeholders because no analyzer can judge a reason's
  substance. The justification names the invariant that holds, then why the
  structural fix loses; the adversarial reviewer's first duty is refuting it.
- Stale suppressions do not self-expire in CI: IDE0079 surfaces them only in
  the IDE, so removing dead suppressions is an explicit review duty on every
  diff that touches one.

Shared and ambient state is banned by symbol (`BannedSymbols.txt`, RS0030):
cross-process and reader-writer locks, `[ThreadStatic]`, `AsyncLocal<T>`,
ambient wall-clock time, blocking sleeps, and process exit each carry a
remediation message naming the replacement. Public mutable statics fail
separately (CA2211, MA0069). Routing around a banned symbol through an
equivalent API the list misses violates the doctrine, not just the rule —
the list gives examples.

Semantic verification — the gate proves form, and wrong logic compiles:

- Done, for a behavior change, means at least one test fails without the
  change; the handoff report says which.
- Trust boundaries get CsCheck property tests. CsCheck keeps no regression
  corpus, so a counterexample found by a property run is pinned as a
  deterministic example test.
- `mise run csharp:mutants` is the mechanical adversary: would the tests
  notice if this code were wrong? It runs Stryker.NET on the
  Microsoft.Testing.Platform runner (preview status; verify surprising
  results). A surviving mutant is a finding with exactly three exits:
  kill — the suite gains a test that observes the difference; delete — the
  code loses the branch the suite cannot reach; or classify — a
  `// Stryker disable once all: <reason>` comment whose reason names why no
  test can observe the mutant (equivalent mutants exist). The `all` or mutator
  label is required syntax. Stryker 4.16 logs a malformed label but can still
  treat its enum default as `Statement`, so the post-run verifier rejects the
  parser error instead of trusting the score. Classify is a wall edit requiring
  human countersign. The
  `thresholds.break` value is pinned at the measured floor. At this
  project's floor of 100 every survivor fails the gate — a deliberate
  per-mutant guarantee at fixture size; a lower measured floor behaves as a
  coarse regression alarm instead. Raising it is normal work; lowering it
  requires human countersign, and survivors in changed code are
  dispositioned in review.
  The full gate verifies Stryker's JSON and log, rejects malformed directives
  and unfinished or unknown statuses, and requires the report's mutated-source
  payload to use only the one-shot comment above. Ranged `disable`/`restore`
  comments and block-comment directives fail. Directive-shaped text is
  conservatively reserved for this policy even inside a string. The full gate
  also requires at least one `Killed`,
  `Survived`, or `Timeout` outcome; empty and all-`NoCoverage` runs fail.
  `mise run csharp:mutants:diff` scopes the inner loop. An explicit
  `MUTANTS_BASE_REF` resolves exactly as supplied; otherwise it prefers
  `origin/main` over local `main` and passes the exact merge-base SHA. It fails
  closed if Stryker could confuse that SHA with a containing branch or tag
  name, or if the worktree contains untracked files that Git's diff cannot
  include.
  Mutation requires the src/tests project split; a project whose tests live
  beside its sources cannot be mutated.
- ReferenceTrimmer fails the build on analyzable direct compile references
  reported unused as RT0001-RT0003. SDK, transitive, and build-asset references
  are conservatively outside its scope.

Adversarial self-review and merge shape follow the catalog doctrine: a green
gate is necessary, never sufficient. Every non-trivial diff gets three
fresh-context reviewers, one per input view: test diff only, full diff, and
code without the change narrative. They flag and never rewrite;
findings collect on the union after dedup, and severity triage decides what
blocks. Any edit to the enforcement surface — `Directory.Build.props`,
`.editorconfig`, `BannedSymbols.txt`, `stryker-config.json`, the mise
tasks — is a finding by default, and loosening requires human countersign.
A disputed finding is settled by writing the failing test; a finding no
test can express is recorded as a design note with a named owner, and a
question of intent escalates to the human who owns it. Metadata triage may
fast-track a trivial diff to fewer or no model reviewers only when the handoff
records that classification and reason. Model-review verdicts pin the commit
they judged; bots advise, gates block, humans merge.

## .NET Applications

Applications also follow `APPLICATION.md`. Public libraries, plugin hosts,
interop, source generators, Native AOT experiments, and other specialized
workloads should document why an application rule does not fit instead of
weakening the shared compiler and test contract.
