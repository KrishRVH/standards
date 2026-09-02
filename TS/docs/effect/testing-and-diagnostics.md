# Testing and diagnostics

The [enforcement map](enforcement.md) owns mandatory wording. This guide defines
the executable evidence expected from Effect 3.22.1 code.

## Red, then green

For a semantic correction, identify or add the exact regression test, observe
it fail under the faulty behavior, apply the fix, and observe it pass. Remove
temporary mutation scaffolding. Record the injected or retained fault and the
red and green commands in the change handoff.

Assert the property, not merely `Exit.isFailure`: expected tag and safe fields,
absence or presence of defects/interruption, forwarded signal, attempt count,
provider input, max concurrency, result order, publication permission,
acquisition/release counts, or full Cause shape.

## Virtual time and interruption

Fork timed work. Use `Deferred`, `Ref`, latches, or another explicit probe to
prove the fiber entered the attempt or sleep before calling `TestClock.adjust`.
Use real time only in a bounded isolated subprocess when process signals or real
host time are the subject.

Tests distinguish wrapper completion from underlying behavior. A timeout test
for a signal-aware adapter also proves abort; a signal-ignorant test proves the
underlying Promise can continue. Cancellation/publication tests prove handlers
do not publish a normal success or expected-failure result after interruption.

Resource tests cover success, typed failure, interruption, slow/failing
finalizers, shared layer acquisition, and runtime disposal. Batch tests cover
fail-fast sibling interruption and outcome collection. Task-service tests cover
shutdown and non-interruption failure observation.

The catalog's tester owns the reference suites for these contracts; the
enforcement map marks them `(catalog)`. A copied profile starts with only the
endpoint-checker suite and the diagnostics harness. When a project adds an
async adapter, fork, scoped resource, publication controller, or client
boundary, port the matching tester suite shape next to it in the same change.

## Static and negative contracts

Keep exact-version Effect language-service diagnostics. The normal project runs
the standalone CLI for configured errors/warnings. A separate expected-
diagnostic project contains intentionally invalid fixtures and asserts exact
diagnostic name, file, line, severity, and nonzero CLI exit. The valid sync
Schema fixture stays outside `schemaSyncInEffect` scope.

Do not put intentionally invalid HTTP/type examples in the normal compilation
unit. Use an isolated negative TypeScript project and `@ts-expect-error` or a
diagnostic harness so adding a residual route error fails until projected.

For each explicitly configured LS rule, retain the pinned severity, exit
behavior, editor/CI match, quick-fix meaning, and false-positive risk. Do not
bulk-apply quick fixes. A narrow suppression names safety reason, owner/version,
and removal condition; the harness rejects stale suppressions and
diagnostic-name drift. The exact per-configured-rule record lives in the
[0.87.2 diagnostic inventory](diagnostic-inventory.md).

## CI and documentation contracts

The copied workflow reacts to pull requests, merge-queue groups, pushes to
`main`, and manual dispatch; performs locked setup and frozen dependency
installation through the mise task graph; and runs `standards:check`. Local
contract tests validate these triggers, the required task, immutable action
references, and checkout credential hardening. Branch protection remains host
configuration and requires the workflow's `quality` job.

Documentation drift checks keep routed paths present, stable rule IDs unique,
and the always-loaded TypeScript fragment under the measured word budget. The
manifest keeps copied files byte-identical with the tester. Prose-only residuals
stay explicitly marked `Manual` in the enforcement map.

Run all development tools through mise. The local gate should include frozen
install, format, lint, TypeScript, Effect diagnostics, expected diagnostics,
deterministic unit/semantic/negative tests, property tests, audit, knip,
mutation testing, lock/drift checks, and the repository aggregate. Report every
unavailable external integration honestly.
