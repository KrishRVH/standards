# Swift Changes

## Workflow

- Use the `swift:*` mise tasks. Run `swift:standards` for formatting and
  dependency resolution, then `swift:standards:check` before handoff.
- Keep every first-party target in Swift 6 mode with `strictSettings` from
  `Package.swift`, including test targets; `swift:policy` rejects a target
  without them. Read `README.md` when changing the toolchain, target layout,
  dependency policy, or Apple-platform integration.
- Keep public APIs small and document their contracts. Run `swift:api:diff`
  before handoff when a change touches public API, and report what it finds.
  `unsafeFlags` fail the policy because they can prevent downstream packages
  from using a library product.

## Values and boundaries

- Prefer structs, enums, immutable values, and concrete dependencies. Introduce
  a protocol where a consumer needs substitution; use classes for identity or
  shared lifecycle and actors for isolated mutable state.
- Validate untrusted input at the boundary. Model expected absence with
  optionals and failures with errors; use `guard`, optional binding, and
  throwing functions to make handling visible. Use `try?` only when discarding
  the error is part of the contract.
- Pass clocks, randomness, environment, storage, and network access explicitly.
  `swift:policy` rejects the ambient clocks, environment reads, randomness,
  unowned tasks, and shared singletons that `README.md` lists in library
  targets; executables and tests are composition roots. Return errors with
  useful context and handle them at their owner.
- Use `defer` for cleanup near acquisition. Keep checked arithmetic and bounds
  handling; choose wrapping arithmetic only when the domain requires it.

## Concurrency and exceptions

- Prefer structured concurrency with `async let` and task groups. An
  unstructured task needs an owner, cancellation, and a way to await completion.
  Preserve cancellation through error handling and downstream operations.
- Make actor isolation explicit at boundaries. Use `@MainActor` for UI state;
  audit invariants across each `await`, where actor state can change. Use
  `Sendable` values to cross isolation domains.
- Keep `@unchecked Sendable`, `nonisolated(unsafe)`, `@preconcurrency`,
  `unsafe` acknowledgments, and `// swift-format-ignore: Rule` at the smallest
  boundary, each with its own `//` comment on that line or above it that names
  the invariant. `swift:policy` rejects one without it. Treat each as a review
  finding; compiler acceptance does not prove the invariant, and Thread
  Sanitizer only catches races the tests exercise.
- `@diagnose`, file-wide formatter ignores, `treatWarning`, and language modes
  below Swift 6 fail the policy. Fix the warning instead. Remove an exception when
  its reason no longer holds; the tools do not detect stale ones. Explain
  enforcement relaxations and get human approval before making them.

## Evidence

- Use Swift Testing for package behavior, with parameterized cases for peer
  inputs and `#require` for test prerequisites. Use XCTest where a platform
  framework requires it, such as UI or performance testing.
- Test through the owning module's interface; use `@testable` only when the
  behavior cannot be observed through that interface. Keep test state local:
  Swift Testing runs tests concurrently by default.
- Cover malformed inputs, error propagation, and cancellation where relevant.
  The gate prints line coverage to show untested paths; coverage does not prove
  assertions are meaningful. When a fuzzer, sanitizer, or bug report finds a
  failing input, add it as a deterministic case.
- Review newly added dependencies, `swift:audit` findings, public API, safety
  escapes, task ownership, and platform-specific branches alongside the green
  gate.
