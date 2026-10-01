# Concurrency and resources

The [enforcement map](enforcement.md) owns mandatory wording. This guide covers
structured concurrency, outcome collection, and Scope in the pinned Effect v4
release.

## Every child has an owner

`Effect.forkChild` links a child to its parent fiber. `Effect.forkScoped` links
it to the current Scope. `Effect.forkIn(scope)` transfers it to a supplied
Scope. `Effect.forkDetach` outlives its parent and is inappropriate for request,
component, or ordinary application work; a detached fiber needs a real
continuing owner and a bounded operation.

A fiber is a handle, not an Effect. `Fiber.join` resumes with its result,
`Fiber.await` returns its `Exit`, and `Fiber.interrupt` waits for interruption
and finalizers before returning `void`; read the interrupted `Exit` with
`Fiber.await`. `fiber.pollUnsafe()` returns the `Exit` or `undefined`
synchronously at a host edge.

Lifetime linkage alone does not report an unjoined child failure. Record the
failure observer and shutdown policy. A scoped application task service can
accept transferred work, observe non-interruption failure, and interrupt all
tasks when its own layer closes.

## Bound work and choose collection semantics

Numeric concurrency and bounded queues/PubSub are the baseline. Unbounded
capacity requires a proven finite producer and resource bound at the decision.
Cap input item count as well as worker concurrency; otherwise a bounded worker
pool can still retain an unbounded queue of work.

Default concurrent `all`/`forEach` is fail-fast and interrupts siblings after a
typed failure. `Effect.all(items, { mode: "result" })` runs all items and
retains each expected outcome as a `Result`. `Effect.validate` accumulates
typed validation failures. Defects and interruption still fail
outcome-collecting combinators.

An endpoint-health batch normally materializes endpoint-local outcomes and
keeps workflow-wide initialization/deadline failures in `E`. Test input-order
preservation, whether all items run, sibling interruption, partial-result
policy at a total deadline, and maximum observed concurrency.

The canonical endpoint checker deliberately uses all-or-nothing publication at
its total deadline: it interrupts remaining work and returns
`WorkflowDeadlineExceeded` without completed outcomes. Policy decoding precedes
that deadline because the checked policy supplies its duration; the deadline
then covers request decoding and the concurrent batch.

Fibers provide cooperative JavaScript concurrency, not CPU parallelism. Long
CPU work may need yielding, workers, native code, or process isolation.

## Resource scopes

Choose the shortest owner that encloses every use:

- `Effect.acquireRelease` exposes a scoped resource and leaves `Scope` in `R`;
- `Effect.acquireUseRelease` owns the whole use in one operation;
- `Effect.addFinalizer` adds cleanup to an already-owned Scope;
- `Effect.scoped` closes a local Scope around a complete use; and
- `Layer.effect` ties an acquisition inside it to the layer/runtime lifetime.

A public `Scope` requirement can be the honest lifetime contract. Eliminate it
only at a boundary that owns the complete use.

Pinned behavior: acquisition plus finalizer registration is uninterruptible;
added finalizers run with interruption disabled; default Scope close is reverse
order and sequential; a finalizer defect stays in the Cause, after the use
failure in its `reasons`.

Potentially blocking close operations need an owner policy. A timeout outside a
Scope is not a hard wall because interruption waits for finalizers. Preserve
critical cleanup; for genuinely best-effort close, bound and observe the
internal close operation rather than detaching it.

Use `ensuring` for local Effect-owned cleanup on every exit. Framework state
mutation is host publication, not resource finalization.
