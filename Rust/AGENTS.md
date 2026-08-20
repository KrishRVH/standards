# Rust agent guide

This profile assumes the agent is the author and the first adversary: code is
written, verified, and reviewed hands-off, and humans audit reports rather
than diffs. Three consequences shape every rule:

- If a machine can check a rule, the machine owns it. The rule lives in
  `Cargo.toml` lints, `clippy.toml`, `deny.toml`, or a mise gate, and it
  fails the build. Prose in this file covers only what machines cannot
  check, and each prose rule names how it is verified.
- Severity has one level. `mise run rust:lint` promotes every warning to a
  failure and forces the two attribute-policy lints at the command line; a
  diagnostic an agent can ignore does not exist.
- Exceptions are per-site, reasoned, and self-expiring. `#[allow]` is banned
  (`clippy::allow_attributes`). The only escape is
  `#[expect(lint, reason = "...")]`, which itself fails the build when the
  lint stops firing, so stale exceptions cannot accumulate.

## Exception protocol

An `#[expect]` reason is a review artifact with a required shape: name the
invariant that holds, then why the structural fix (types, restructuring)
loses. "Clippy is wrong" is not a reason; neither is restating the lint
name. The adversarial reviewer's first duty is refuting these reasons.
`mise run rust:policy` enforces the source-visible part of this contract with a
syntax-aware scan of first-party Rust files. It catches outer, crate-inner,
multiline, `cfg_attr`-nested, and raw-identifier attributes, including literal
attributes inside macro bodies. It also rejects direct `#[$attribute]`,
repeated, and `cfg_attr` attribute-metavariable emission. Stable source
tokenization cannot reconstruct arbitrary declarative- or procedural-macro
expansions: a macro that synthesizes an `allow` from separately forwarded or
generated tokens is still a prohibited wall bypass and an explicit review
finding, not a supported exception. Attribute-shaped text in comments and
strings is deliberately accepted. The scanner recursively follows literal
`include!` inputs, in-project source-file and directory symlinks, and explicit
Cargo target and build-script paths, including files without an `.rs`
extension. Opaque `include!` expressions, enumerated first-party inputs outside
the canonical project root, and custom `#[path]` modules are rejected because
they make complete policy discovery unprovable. A real Clippy negative probe
separately proves the configured `std::sync::Mutex` state wall still emits
`clippy::disallowed_types`. Generated/dependency roots such as `target/` and
`vendor/` are pruned at each accepted workspace package root; the same
directory names below first-party source remain in scope.

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
  notice if this code were wrong? The gate fails on any survivor, and a
  survivor has exactly three exits: kill — the suite gains a test that
  observes the difference; delete — the code loses the branch the suite
  cannot reach; or classify — a per-site `#[mutants::skip]` whose reason
  names why no test can observe the mutant (equivalent mutants exist; the
  tool's own docs say so). The skip attribute resolves against the
  `mutants` crate, so the first classify also adds `mutants = "0.0.3"` to
  `[dependencies]` — regular, not dev: skips sit on non-test code — and
  the last one removes it (`rust:machete` flags the crate once no skip
  remains). Classify is a wall edit: a review finding by default,
  countersigned like any loosening, never a shortcut past writing the
  test. Config-level mutants exclusions are coarser than per-site
  skips and are findings for the same reason. Never special-case code to
  satisfy a mutant. `mise run rust:mutants:diff` scopes the inner loop to
  the change. An explicit `MUTANTS_BASE_REF` resolves exactly as supplied;
  otherwise the task prefers `origin/main` over local `main`, then computes an
  exact merge-base commit. The diff lane rejects untracked files with
  `git add -N` guidance. Both mutation tasks run all workspace tests for every
  mutant, force the report under the project root so local configuration
  cannot redirect verification to stale evidence, and share a project-local
  transaction lock through report verification. The gate runs the full sweep
  and rejects empty or all-unviable runs after validating cargo-mutants' native
  outcome evidence.

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
  smuggling skips), or a macro expansion that synthesizes `allow`, is a wall
  bypass, full stop.

Review is a fleet, not a bigger reviewer. A non-trivial change gets exactly
three cheap reviewers: one reads the test diff only, one the full diff, and
one the code with no change narrative. Beyond three, correlated errors make
extra judges nearly worthless. Model diversity is layered on top of the input
views, not relied on alone. Findings collect on the union after dedup — most
flagged locations in the measured four-tool run surfaced from exactly one
reviewer, so majority and unanimity rules discard signal — and severity
triage decides what blocks: a claim of observable
wrongness blocks until dispositioned, a judgment call becomes a design
note. Scores aggregate by median, never mean, so one degenerate verdict
cannot swing the panel. Cheap reviewers flag and never rewrite; a weaker
model with write-back authority degrades a stronger author's work, so
fixes come from the author or a stronger arbiter, spent only on disputed
or high-severity findings. And the cheapest reviewer is not a model:
triage on metadata — files touched, diff size, whether the wall was edited —
may fast-track a trivial change to fewer or no model reviewers only when the
handoff records that classification and reason.

A disputed finding is settled by writing the failing test, not by argument;
a finding no test can express is recorded as a design note with a named
owner, not silently dropped; a finding that turns on what the software is
meant to do escalates to the human who owns intent. Findings return as
code or test changes — a reviewer proposes, never auto-applies. The author
does not merge over an undispositioned blocking finding.

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
Enforcement: `rust:deny` fails on advisories (unmaintained crates
included), yanked crates, disallowed licenses, wildcard requirements, and
unknown registries; `rust:machete` fails on `[dependencies]` entries no
code uses — dev- and build-dependencies are not checked — after an
all-feature, locked Cargo metadata preflight and metadata-aware offline scan;
`Cargo.lock` is exact and committed. `rust:deny` includes development
dependencies. Duplicate versions surface as `rust:deny` warnings and do not
fail the gate — the handoff report carries them forward verbatim so an
ignorable diagnostic still cannot vanish.

## Workflow

Use `mise run ...`; do not call cargo or rustup directly. Repair loop:

```sh
mise run rust:fmt:check
mise run rust:policy
mise run rust:lint
mise run rust:test
mise run rust:test:doc
mise run rust:doc
mise run rust:package
mise run rust:mutants:diff
mise run rust:machete
mise run rust:deny
```

`mise run rust:standards` applies autofixes. Before handoff run
`mise run rust:standards:check`; report every skipped command and why.
The report states only what a command proved and never overstates: "CI
green on the substantive change" and "done" are different claims — make
the one the evidence supports.
