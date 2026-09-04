# Rust agent guide

Use this fragment with the project's shared agent guide. `Cargo.toml`,
`clippy.toml`, and `deny.toml` own executable policy; the mise fragment owns
commands. Read [setup, scanner limits, and mutation operation](README.md) when
adopting the profile or changing its enforcement.

## Work and verification

Use `mise run rust:...` for development. Run `rust:lint` and `rust:test` for
source changes; add `rust:test:doc` and `rust:doc` for public API changes.
`rust:standards` formats code. Refresh `Cargo.lock` through `rust:lock` after
dependency changes and commit it.

Use `rust:mutants:diff` for changed-code feedback; its base defaults to
`origin/main`, then local `main`, and can be set with `MUTANTS_BASE_REF`.
Include new files in the Git diff before running it. Before handoff, run
`mise run rust:standards:check`; report skipped checks and their reasons.

## Ownership and state

This application profile favors one owner for state, pure `(state, event)`
transitions, and messages to the owner. Libraries, runtimes, and concurrency
primitives need a deliberate profile adaptation; see [the profile boundary](README.md).

- Keep program-owned counters, IDs, and dispatch state on the root model.
  Mirror external state through construction and events.
- Move cross-thread work over channels; the receiving thread or task owns the
  state. Before proposing a shared lock, name the value and explain why it
  cannot live on the owner or arrive as an event.
- Locks, cells, atomics, `Rc`, and their ecosystem equivalents require the same
  ownership justification. Routing through an unlisted dependency does not
  change that obligation.
- Immutable `Arc` snapshots and configuration are permitted. `OnceLock` is
  permitted for compute-once immutable constants independent of runtime state
  and configuration. External APIs that require restricted primitives still
  need a reasoned exception at the use site.

## Invariants and errors

Carry invariants in types: newtypes at trust boundaries, enums for variants,
and narrow inputs instead of unreachable match arms. An always-present value
has a non-optional type. A function you own returns `T` rather than
`Result<T, Infallible>`; retain `Infallible` when an external trait requires it.

Handle external failures with typed errors or explicit failure events.
Use iterators or checked access for indexing. Choose `checked_`,
`saturating_`, or `wrapping_` arithmetic according to the domain.

Production assertions are panic sites too. Use a typed error for a reachable
failure; reserve `debug_assert!` for internal contracts whose removal cannot
make release behavior incorrect. Never let a panic cross an FFI boundary.

## Exceptions and workspace policy

`#[allow]` is forbidden. Use one lint in a reasoned
`#[expect(lint, reason = "...")]` on the smallest enclosing item. Name the
invariant that holds and why restructuring would be worse. Lint groups and
crate-level expectations outside test crates silence too much; review them as
policy violations. Stale expectations fail the lint gate.

For a justified panic assertion, use `expect` with a message naming the
invariant. Tests may unwrap, expect, panic, and index on invariants they
establish; test arithmetic still needs a reasoned expectation.

`unsafe_code = "forbid"` has no local escape. Work requiring unsafe needs
explicit human authorization to change the profile to `deny`; each unsafe
block then carries a reasoned expectation and a `SAFETY` comment.

Every workspace package, including the root package, declares
`[lints] workspace = true`. Release profiles belong in the root manifest;
keep overflow checks enabled. `rust:policy` checks first-party source inputs
and configured policy probes. Read its [scope and limitations](README.md)
before adding macros, custom target paths, includes, or symlinks.
Checker-specific production behavior and synthesized suppression attributes
are prohibited even when static analysis cannot detect them.

## Tests and mutation

A behavior change needs a test that fails without it. At trust boundaries,
use `proptest` for invariants and round trips; commit `proptest-regressions/`.
A property must test the contract rather than reimplement the function.
Pin any intermittently killed mutant with a deterministic example test.

A surviving mutant needs a test that kills it, removal of unreachable code,
or a per-site `#[mutants::skip]` with a source reason explaining why no test
can distinguish it. The first skip adds `mutants = "0.0.3"` as a regular
dependency; remove it when the last skip disappears. Classification and
coarser configuration exclusions require human approval. Carry classifications
and their reasons into the handoff.

The full gate requires executed mutation evidence. Read [mutation operation
and stale-lock recovery](README.md) before changing report paths, mutation
selection, or transaction handling. Confirm no run is active before clearing
a stale lock.

## Dependencies and review

Prefer the standard library. For each added dependency, state the complexity
it removes. `rust:deny` checks dependency policy including development
dependencies; `rust:machete` checks unused regular dependencies. Review
dev/build dependency use separately and report duplicate-version warnings.

For a non-trivial change, obtain an independent read-only review of tests,
changed code, exceptions, and affected contracts. Add focused reviewers when
risk or breadth warrants them. Verify material findings with source evidence
or a regression test; record unresolved design questions explicitly.

Explain enforcement changes and get human approval for relaxations. Report
the checked revision, behavior proved, commands run, and remaining findings.
Recheck affected evidence after further edits. Bots advise, gates block, and
humans merge.
