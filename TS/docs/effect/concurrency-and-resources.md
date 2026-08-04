# Concurrency and resources

The [enforcement map](enforcement.md) owns mandatory wording. This guide covers
structured concurrency, outcome collection, and Scope in Effect 3.22.1.

## Every child has an owner

`Effect.fork` links a child to its parent fiber. `Effect.forkScoped` links it to
the current Scope. `Effect.forkIn(scope)` transfers it to a supplied Scope.
`forkDaemon` uses the global scope and is inappropriate for request, component,
or ordinary application work.

Lifetime linkage alone does not report an unjoined child failure. Record the
failure observer and shutdown policy. A scoped application task service can
accept transferred work, observe non-interruption failure, and interrupt all
tasks when its own layer closes. `Effect.disconnect` also permits work/cleanup
to continue after the caller; use it only with a real continuing owner and a
bounded operation.

## Bound work and choose collection semantics

Numeric concurrency and bounded queues/PubSub are the baseline. Unbounded
capacity requires a proven finite producer and resource bound at the decision.
Cap input item count as well as worker concurrency; otherwise a bounded worker
pool can still retain an unbounded queue of work.

Default concurrent `all`/`forEach` is fail-fast and interrupts siblings after a
typed failure. `mode: "either"` runs all items and retains each expected
outcome. `mode: "validate"` accumulates typed validation failures. Defects and
interruption still fail outcome-collecting modes.

An endpoint-health batch normally materializes endpoint-local outcomes and
keeps workflow-wide initialization/deadline failures in `E`. Test input-order
preservation, whether all items run, sibling interruption, partial-result
policy at a total deadline, and maximum observed concurrency.

Fibers provide cooperative JavaScript concurrency, not CPU parallelism. Long
CPU work may need yielding, workers, native code, or process isolation.

## Resource scopes

Choose the shortest owner that encloses every use:

- `Effect.acquireRelease` exposes a scoped resource and leaves `Scope` in `R`;
- `Effect.acquireUseRelease` owns the whole use in one operation;
- `Effect.addFinalizer` adds cleanup to an already-owned Scope;
- `Effect.scoped` closes a local Scope around a complete use; and
- `Layer.scoped` ties lifetime to a layer/runtime.

A public `Scope` requirement can be the honest lifetime contract. Eliminate it
only at a boundary that owns the complete use.

Pinned behavior: acquisition plus finalizer registration is uninterruptible;
added finalizers run with interruption disabled; default Scope close is reverse
order and sequential; a finalizer defect remains in Cause and can combine
sequentially with a use failure.

Potentially blocking close operations need an owner policy. A timeout outside a
Scope is not a hard wall because interruption waits for finalizers. Preserve
critical cleanup; for genuinely best-effort close, bound and observe the
internal close operation rather than detaching it.

Use `ensuring` for local Effect-owned cleanup on every exit. Framework state
mutation is host publication, not resource finalization.
