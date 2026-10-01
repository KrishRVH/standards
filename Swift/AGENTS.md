# Swift Changes

## Workflow

- Use the `swift:*` mise tasks. Run `swift:standards` for formatting and
  dependency resolution, then `swift:standards:check` before handoff.
- Keep every first-party target in Swift 6 mode with the strict settings in
  `Package.swift`, including test targets. Read `README.md` when changing the
  toolchain, target layout, dependency policy, or Apple-platform integration.
- Keep public APIs small and document their contracts. Prefer native package
  settings to `unsafeFlags`, which can prevent downstream packages from using
  a library product.

## Values and boundaries

- Prefer structs, enums, immutable values, and concrete dependencies. Introduce
  a protocol where a consumer needs substitution; use classes for identity or
  shared lifecycle and actors for isolated mutable state.
- Validate untrusted input at the boundary. Model expected absence with
  optionals and failures with errors; use `guard`, optional binding, and
  throwing functions to make handling visible. Use `try?` only when discarding
  the error is part of the contract.
- Pass clocks, randomness, environment, storage, and network access explicitly.
  Keep I/O at the application boundary and avoid mutable globals and singleton
  services. Return errors with useful context and handle them at their owner.
- Use `defer` for cleanup near acquisition. Keep checked arithmetic and bounds
  handling; choose wrapping arithmetic only when the domain requires it.

## Concurrency and exceptions

- Prefer structured concurrency with `async let` and task groups. An
  unstructured task needs an owner, cancellation, and a way to await completion.
  Preserve cancellation through error handling and downstream operations.
- Make actor isolation explicit at boundaries. Use `@MainActor` for UI state;
  audit invariants across each `await`, where actor state can change. Use
  `Sendable` values to cross isolation domains.
- Keep `@unchecked Sendable`, `nonisolated(unsafe)`, `@preconcurrency`, memory
  safety annotations, and diagnostic suppressions at the smallest boundary
  with a source reason explaining the invariant. Treat these as review findings;
  compiler acceptance does not prove the invariant.
- Formatter ignores need a named rule and an adjacent source reason. Review
  stale ignores and `@diagnose` overrides; the native tools do not require
  reasons or detect every obsolete exception. Explain enforcement relaxations
  and get human approval before making them.

## Evidence

- Use Swift Testing for package behavior, with parameterized cases for peer
  inputs and `#require` for test prerequisites. Use XCTest where a platform
  framework requires it, such as UI or performance testing.
- Test through the owning module's interface; use `@testable` only when the
  behavior cannot be observed through that interface. Keep test state local:
  Swift Testing runs tests concurrently by default.
- Cover malformed inputs, error propagation, and cancellation where relevant.
  A coverage report identifies untested paths; it does not prove assertions are
  meaningful. Pin any discovered counterexample as a deterministic test.
- Review newly added dependencies, public API, safety escapes, suppressions,
  task ownership, and platform-specific branches alongside the green gate.
