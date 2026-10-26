# Rust agent guide

Use this fragment with the project's shared agent guide. `Cargo.toml`,
`clippy.toml`, and `deny.toml` own executable policy; the mise fragment owns
commands. Read [setup, scanner limits, and mutation operation](README.md) when
adopting the profile or changing its enforcement.

## Work and verification

Use `mise run rust:...` for development. Run `rust:lint` and `rust:test` for
source changes; add `rust:doc` for public API changes.
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
  ownership justification. Before using one that `clippy.toml` does not list,
  from `std` or a dependency, add it to `disallowed-types` in the same change,
  then justify the use site with the reasoned expectation.
- Immutable `Arc` snapshots and configuration are permitted. `OnceLock` and
  `LazyLock` are permitted for compute-once immutable constants independent of
  runtime state and configuration. External APIs that require restricted
  primitives still need a reasoned exception at the use site.
- Prefer borrows, moves, and shorter borrows over clones made only to satisfy
  the borrow checker. Deliberate copies of small immutable data and permitted
  snapshot sharing are fine.
- In async code, move blocking work off executor threads and bound CPU work
  between yield points.

## Invariants and errors

Carry invariants in types: newtypes at trust boundaries, enums for variants,
and narrow inputs instead of unreachable match arms. An always-present value
has a non-optional type. A function you own returns `T` rather than
`Result<T, Infallible>`; retain `Infallible` when an external trait requires it.
Use an enum for a parameter that selects a mode or strategy; keep boolean
data, including setter values, as `bool`.

Represent filesystem paths with `Path` and `PathBuf`; convert them to text
explicitly at presentation boundaries. Keep custom equality, ordering, and
hashing consistent, and test their laws. Redact secrets in `Debug` and
`Display`, and test the redaction. Omit `get_` on simple getters. Name `as_`,
`to_`, and `into_` conversions by cost and ownership, as the
[Rust API Guidelines](https://rust-lang.github.io/api-guidelines/naming.html#ad-hoc-conversions-follow-as_-to_-into_-conventions-c-conv)
define them.

Handle external failures with typed errors or explicit failure events.
Discard a `#[must_use]` value only with `let _ =` under a reasoned
`clippy::let_underscore_must_use` expectation; `_ =`, `drop(...)`, an unused
`_name` binding, and an empty error arm are discards the gate cannot see.
Implement `std::error::Error` for custom error types, preserve wrapped causes
through `source()`, and attach the operation and non-sensitive path or value
context. Use iterators or checked access for indexing. Choose `checked_`,
`saturating_`, or `wrapping_` arithmetic according to the domain.

Write program output through fallible I/O, such as `writeln!` on a locked
handle. Propagate or explicitly handle write and flush errors, and return
failures from `main`. Establish intentional ordering at the output boundary;
hash iteration order must not reach output.

Outside test code, never call `assert!`, `assert_eq!`, or `assert_ne!`; a
`# Panics` section documents the panic but does not remove it, and
`tests/allow_policy.rs` rejects the calls. Return a typed error instead,
including where `manual_assert` suggests `assert!`; a justified panic uses
`expect` as described under exceptions. An assertion in a `const` or `static`
initializer or an inline `const` block runs at compile time and is allowed,
unless a closure, function, `async` block, or macro definition there holds it.
Reserve `debug_assert!` for internal contracts whose removal cannot make
release behavior incorrect. Never let a panic cross an FFI boundary.

Put teardown that flushes, sends, syncs, commits, or waits for other work in a
consuming method that returns `Result`, such as `close`, `finish`, or `join`,
and call it on every success path. `Drop` is only the fallback: it never
panics and never waits on another thread, task, process, or peer, so it does
not join, receive from a channel, wait on a lock or child process, call
`block_on`, sleep, retry, or do network I/O, even with a timeout. It may
release what the value owns, including best-effort removal of local files as
`tempfile::TempDir` does; nothing bounds how long that takes.

## Exceptions and workspace policy

`#[allow]` is forbidden. Use one lint in a reasoned
`#[expect(lint, reason = "...")]` on the smallest enclosing statement or item.
Name the invariant that holds and why restructuring would be worse.
Expectations on lint groups or several lints, crate-level expectations
outside test targets, and module-wide expectations of a panic lint such as
`clippy::unwrap_used` outside test code silence too much;
`tests/allow_policy.rs` rejects them.
Stale expectations fail the lint gate. Lint levels come only from
`[workspace.lints]` and reasoned expectations; `rust:policy` rejects inherited
compiler flags and Cargo configuration that lower them.

For a justified panic assertion, use `expect` with a message naming the
invariant. Clippy's test exemptions cover `#[test]` functions and items under
a `#[cfg(test)]` attribute: they may print, and may unwrap, expect, panic, and
index on invariants they establish. Other test code, such as a top-level
integration-test helper, has no exemption. There, a fallible helper returns
`Result`. No test exemption covers arithmetic, and test code takes no
arithmetic expectation. Prefer literal expected values. Where Clippy reports
test arithmetic, use `checked_` methods, with `expect` naming the invariant
where a test exemption applies and `?` in a `Result`-returning helper
elsewhere. Only a test of an operator implementation itself takes a reasoned
expectation, on the item Clippy reports. Doc examples use `?`, not
`unwrap()`, because Clippy does not lint doctests.

`unsafe_code = "forbid"` has no local escape. Work requiring unsafe needs
explicit human authorization to change the profile to `deny`; in that change,
also set `undocumented_unsafe_blocks = "deny"` in `[workspace.lints.clippy]`.
Each unsafe block then carries a reasoned expectation and a `SAFETY` comment.

Every workspace package, including the root package, declares
`[lints] workspace = true`. Release profiles belong in the root manifest;
keep overflow checks enabled. `tests/allow_policy.rs` checks first-party
source inputs, and `rust:policy` checks configured policy probes. Read their
[scope and limitations](README.md)
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
can distinguish it. The first skip adds `mutants = "0.0.4"` as a regular
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
