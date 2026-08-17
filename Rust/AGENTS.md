# Rust agent guide

This profile assumes the agent is the author and the first adversary: code is
written, verified, and reviewed hands-off, and humans audit reports rather
than diffs. Three consequences shape every rule:

- If a machine can check a rule, the machine owns it. The rule lives in
  `Cargo.toml` lints, `clippy.toml`, `deny.toml`, or a mise gate, and it
  fails the build. Prose in this file covers only what machines cannot
  check, and each prose rule names how it is verified.
- Severity has one level. `mise run rust:lint` promotes every warning to a
  failure; a diagnostic an agent can ignore does not exist.
- Exceptions are per-site, reasoned, and self-expiring. `#[allow]` is banned
  (`clippy::allow_attributes`). The only escape is
  `#[expect(lint, reason = "...")]`, which itself fails the build when the
  lint stops firing, so stale exceptions cannot accumulate.

## Exception protocol

An `#[expect]` reason is a review artifact with a required shape: name the
invariant that holds, then why the structural fix (types, restructuring)
loses. "Clippy is wrong" is not a reason; neither is restating the lint
name. The adversarial reviewer's first duty is refuting these reasons.

An `#[expect]` names a single lint and sits on the smallest enclosing item.
A lint-group name, or a crate-level `#![expect]` outside a test crate, is a
silenced wall, not an exception — and a group expectation never self-expires
(it is fulfilled if any member lint fires). Treat any occurrence as a review
finding.

When the escape is a panic assertion, use `expect`, never `unwrap`: the
attribute reason says why the types cannot carry the invariant; the `expect`
message names the invariant for the panic report. `expect("failed")` is a
bug.

Tests may unwrap, expect, panic, and index on invariants the test itself
established (`clippy.toml` `allow-*-in-tests`). Production code is not a
test fixture. A test file that needs plain arithmetic takes one file-level
`#![expect(clippy::arithmetic_side_effects, reason = "...")]`.

## Shared mutable state

The model is a pure function of (state, event) on one thread. State lives in
one place; a handler that needs a value already holds it.

`Arc`, `Rc`, `Mutex`, `RwLock`, `Cell`, `RefCell`, `thread_local!`, statics,
and atomics are design smells here, not tools. Before using one, you must be
able to state in one sentence what value is being shared and why it cannot
live on the root struct or arrive as an event. If you cannot write that
sentence, the design is wrong — restructure instead of reaching for the
primitive.

- Cross-thread data moves over channels: sender `Send` (cloneable for
  fan-in; a oneshot reply sender is fine), receiver pinned to the thread
  that owns the state. Send the event to the owner; never reach into state
  through a lock. For any proposed `Arc<Mutex<_>>`, first answer: what
  channel carries this instead?
- Ambient state the program mints (counters, id sources, anything a dispatch
  reads or advances) is a field on the root model, threaded to its use
  sites. `static NEXT: AtomicU64` is the canonical wrong shape: ambient,
  impure, and `Sync` only to satisfy `static`.
- State the outside world owns is external truth mirrored into the model:
  seeded at construction, kept current by events. The test is who mints the
  value. Program mints it → root field. OS owns it → event.
- Async runtimes' locks and cells inherit the doctrine unchanged; a task is
  a thread for these purposes.

Enforcement: the primitives that hide mutation or ownership — the locks,
cells, atomics, `Rc`, and their common ecosystem equivalents (`tokio`,
`parking_lot`, `dashmap`, and friends) — are `disallowed-types` in
`clippy.toml`. The escape is
`#[expect(clippy::disallowed_types, reason = "...")]` carrying the
one-sentence justification. Routing around a disallowed primitive through a
dependency the list misses is a violation of the doctrine, not an escape —
the list is examples, not the rule. Two deliberate boundaries: `Arc` of
immutable data is legal (sharing snapshots and config is not shared mutable
state; the mutable shapes are caught through the inner type), and `OnceLock`
stays legal for compute-once immutable constants independent of state and
config (compiled regexes, lookup tables), as do primitives an external API's
signature forces on you — still justified at the use site.

## Panics and infallibility claims

A reachable panic in production code asserts an invariant the types failed
to express. Fix the types, not the assertion:

- An `Option` that is always `Some` at a call site is a non-optional field
  or a narrower type.
- A match arm that cannot run is a state the handler should never be handed
  — narrow the enum before the call, not inside it.
- A `Result<T, Infallible>` you control returns `T` directly. `Infallible`
  is only correct when a trait you don't own dictates the error slot.
- An index that is always in bounds is an iterator, a `get` with a handled
  `None`, or a type that carries the bound.
- Arithmetic states its overflow policy: `checked_`, `saturating_`, or
  `wrapping_`, chosen to match the domain, not to silence the lint.

Failures the outside world owns — OS callbacks, user paths, socket reads —
get a typed error, a skip, or a failure-reporting event. Never unwrap a
value the OS controls.

Production `assert!` and `assert_eq!` are panic sites and fall under this
doctrine even though no lint catches them: state the invariant as a typed
error or a `debug_assert!` contract instead. The same goes for any panic
path a lint misses — the doctrine is the rule; the lints are its enforcers,
not its boundary.

Enforcement: `unwrap_used`, `expect_used`, `panic`, `todo`, `unimplemented`,
`unreachable`, `indexing_slicing`, `string_slice`,
`arithmetic_side_effects`, `exit`, and `mem_forget` are denied;
`std::process::abort`, `Box::leak`, and `ManuallyDrop::new` are
`disallowed-methods`; `overflow-checks` stays on in release. The escape for
a genuinely inexpressible invariant is `#[expect]` plus `expect` per the
exception protocol.

## Unsafe code

`unsafe_code = "forbid"` is the one rule with no `#[expect]` escape, by
design: unsafe is a capability grant, not a lint exception, and granting it
is a human decision, not an agent judgment call. A task that genuinely needs
unsafe (FFI, embedded register access) stops and reports; if the human
approves, the profile change is explicit — `unsafe_code` moves to `deny` and
each block carries `#[expect(unsafe_code, reason = "...")]` plus a `SAFETY`
comment. Panics must not cross FFI boundaries in such code.

## Workspace shape

The lint wall lives in `[workspace.lints]`; Cargo does not inherit lints
into member crates automatically. Every member manifest — including the root
package — carries `[lints] workspace = true`; a member without it has no
wall and a green gate, so its absence is a review finding, checked whenever
a crate is added. Profiles (`overflow-checks`) are honored only in the root
manifest; never add them to members.

## Semantic verification

The gate proves form; wrong logic type-checks. These rules exist because no
machine fully owns them — the mutation gate audits the tests, and the
adversarial reviewer audits the rest.

- Types before tests: unrepresentable beats checked-at-runtime beats tested.
  Newtypes at trust boundaries, enums over boolean flags, parse — don't
  validate.
- Definition of done for a behavior change: at least one test fails without
  the change. If no such test can be produced, either it is not a behavior
  change or the tests cannot reach it — the handoff report says which.
- Trust boundaries get property tests (`proptest`, in dev-dependencies)
  stating invariants and roundtrips. A property that re-implements the
  function under test proves nothing and kills no mutants. Commit
  `proptest-regressions/` — it is the accumulated counterexample corpus,
  not noise.
- Property tests are the one sanctioned nondeterminism in the suite. If a
  mutant is killed only by a property run (flaky red/green in
  `rust:mutants`), pin the kill with a deterministic example test — random
  search found the case; the suite keeps it.
- Internal invariants at trust boundaries are `debug_assert!` contracts:
  free in release, exercised by every test and property run.
- `mise run rust:mutants` is the mechanical adversary: would the tests
  notice if this code were wrong? A surviving mutant is a finding with
  exactly two exits — the suite gains a test that kills it, or the code
  loses the branch the suite cannot reach. Never special-case code to
  satisfy a mutant. `#[mutants::skip]` and mutants exclusion config are
  wall edits, not fixes: each needs a use-site reason and lands as a review
  finding by default. `mise run rust:mutants:diff` scopes the inner loop to
  the change (set `MUTANTS_BASE_REF`, default `main`); the gate runs the
  full sweep.

## Adversarial self-review

A green gate is necessary, never sufficient: CI green is not a verdict, and
neither is the author's self-report. After the gate, the diff gets an
adversarial pass in a fresh context that did not write it — a subagent, a
second model, or a CI reviewer wired to this same file. The reviewer
receives the diff, this file, and the mutants report; reads the test diff
first (weakening a test to pass is the canonical reward hack); and attacks:

- Every `#[expect]` reason: is the invariant real, and is the structural
  fix genuinely worse?
- The wrongness classes lints cannot see: unit and ordering mismatches,
  truncation at boundaries, off-by-one at loop edges, error paths that drop
  state, cancellation and partial-failure handling, time-of-check versus
  time-of-use.
- The tests: would they fail if the change were subtly wrong? Surviving
  mutants are the mechanical form of this question.
- Wall integrity: any edit to the enforcement surface — `[workspace.lints]`,
  `clippy.toml`, `deny.toml`, mise tasks, mutants exclusions, cargo config —
  is a finding by default; the diff must justify it as loudly as it would a
  new `unsafe` block. Enforcement ratchets: tightening is normal work;
  loosening (a new allow, a removed gate, a raised threshold) requires
  human countersign. Conditional compilation keyed on the checker
  (`cfg(clippy)`, `cfg(test)` changing production behavior, `cfg_attr`
  smuggling skips) is a wall bypass, full stop.

Review is a fleet, not a bigger reviewer. Verifier tokens cost a tenth to
an eightieth of author tokens, so the pass defaults to up to three cheap
reviewers; beyond that, correlated errors make extra judges nearly
worthless. What decorrelates reviewers is input view, not model family:
one reads the test diff only, one the full diff, one the code with no
change narrative. Model diversity is layered on top of that, not relied on
alone. Findings gate on the union after dedup — most real findings surface
from exactly one reviewer, so majority and unanimity rules discard signal —
and scores aggregate by median, never mean, so one degenerate verdict
cannot swing the panel. Cheap reviewers flag and never rewrite; a weaker
model with write-back authority degrades a stronger author's work, so
fixes come from the author or a stronger arbiter, spent only on disputed
or high-severity findings. And the cheapest reviewer is not a model:
triage on metadata — files touched, diff size, whether the wall was
edited — decides which diffs deserve the fleet at all.

A disputed finding is settled by writing the failing test, not by argument;
a finding no test can express is recorded as a design note, not silently
dropped. Findings return as code or test changes — a reviewer proposes,
never auto-applies. The author does not merge over an unrefuted finding.

## Task and merge shape

One task, one branch, one PR, sized so a single session can carry it from
brief to verified; state the done predicate before writing code, and treat
scope that grows mid-task as a new task, not a longer one. The PR body is
the permanent squash-commit message and the handoff report in one — keep it
true. A review verdict pins the commit it judged; any new head voids every
prior verdict. Bots advise, gates block, humans merge.

When a correction recurs — from a reviewer, a human, or a failed merge — it
graduates along the gradient prose → config → gate: first a line here, then
a lint or `disallowed-types` entry, then a task the gate runs. Every rule
in this file should trace to a failure that actually happened; a rule that
never fires gets deleted. This file is the single contract — feed the same
file to authoring agents, review bots, and humans, and keep it short enough
to be read rather than skimmed.

## Dependencies

Standard library first. A new dependency is an architecture decision: one
sentence naming the complexity it removes, or it does not go in.
Enforcement: `rust:deny` fails on advisories, yanked crates, disallowed
licenses, wildcard requirements, and unknown registries; `rust:machete`
fails on declared dependencies no code uses; `Cargo.lock` is exact and
committed. Duplicate versions and unmaintained-crate advisories surface as
`rust:deny` warnings and do not fail the gate — the handoff report carries
them forward verbatim so an ignorable diagnostic still cannot vanish.

## Workflow

Use `mise run ...`; do not call cargo or rustup directly. Repair loop:

```sh
mise run rust:fmt:check
mise run rust:lint
mise run rust:test
mise run rust:test:doc
mise run rust:doc
mise run rust:mutants:diff
mise run rust:machete
mise run rust:deny
```

`mise run rust:standards` applies autofixes. Before handoff run
`mise run rust:standards:check`; report every skipped command and why.
The report states only what a command proved and never overstates: "CI
green on the substantive change" and "done" are different claims — make
the one the evidence supports.
