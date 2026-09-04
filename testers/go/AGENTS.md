# Go Changes

## Workflow

- Use the `go:*` mise tasks. Run `go:standards` for formatting and module
  tidiness, then `go:standards:check` before handoff.
- Keep the module language version, toolchain, and tool pins aligned. After
  changing dependencies, run `go:mod:tidy` and commit `go.mod` and `go.sum`.
- Read `.golangci.yml` for enforced diagnostics and `README.md` for the
  restricted dialect. Fix the cause before adding a specific, reasoned
  `nolint` comment.

## Code and ownership

- Prefer concrete types and direct calls. Define small interfaces where a
  consumer needs substitution; avoid interfaces that only mirror a struct.
- Pass dependencies explicitly. Keep I/O at boundaries and avoid mutable
  package state, hidden initialization, and context values used as services.
- Take `context.Context` first for cancellable operations and pass it through
  to downstream calls. Every goroutine needs an owner, a stopping condition,
  and a way for its owner to wait for completion.
- Return errors with useful operation context. Preserve wrapped error identity
  for `errors.Is` and `errors.As`; handle errors once at the appropriate boundary.
- Keep resource cleanup next to acquisition. Check errors from writes and
  closes when they can affect correctness.
- The profile forbids range-over-function iterators and generic methods through
  BoringLint. Package-level generic functions and receiver type parameters are
  allowed. Materialize dependency iterators at the boundary.

## Evidence

- Test observable behavior with table-driven cases where inputs are peers.
  Prefer real boundaries and narrow fakes over mocks of internal call order.
- Reproduce a fixed defect with a failing test where practical. Run race tests
  for concurrency changes; use fuzzing for parsing and other untrusted inputs.
- Treat a green gate as necessary evidence. Review ownership, cancellation,
  error handling, and newly added suppressions separately.
