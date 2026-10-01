# Time, retry, and cancellation

The [enforcement map](enforcement.md) owns mandatory wording. This guide
explains the pinned Effect v4 ordering contracts.

## Adapter cancellation is concrete

`Effect.tryPromise` supplies an `AbortSignal`. Forward it when the underlying
API accepts one:

```ts
const load = Effect.tryPromise({
  try: (signal) => client.load({ signal }),
  catch: classifyClientFailure,
});
```

For every adapter, identify whether abort stops local waiting, transmission,
request or response body work, the actual upstream operation, listener
registration, iterator, stream, or child process. Test the behavior. A
signal-ignorant Promise may complete underlying work after its Effect was
interrupted or timed out. Cancellation support does not prove mutation retry
safety, and an `AbortSignal` does not prove a remote commit did not happen.

## Attempt timeout and total deadline

Apply policies in this order:

```text
smallest duplicate-safe attempt
  -> per-attempt timeout
  -> retry predicate and schedule
  -> total workflow deadline
```

The total deadline includes attempt execution, schedule delay, queue/token
wait, body processing, and finalizers. It may intentionally prevent configured
later attempts or interrupt retry sleep. Do not reject a caller deadline merely
because it is shorter than the theoretical maximum attempts.

`Effect.timeoutOrElse({ duration, orElse })` maps a timeout to a typed failure
or fallback; `Effect.timeout` fails with `Cause.TimeoutError`, and
`Effect.timeoutOption` returns `Option`. Each interrupts the losing fiber and
waits for its termination, so uninterruptible work or slow finalizers delay the
timeout result. A timeout result is a caller budget outcome, not proof that
signal-ignorant work stopped.

Decode policy from a narrow external representation before constructing
`Duration.Duration`. Finite bounded integer milliseconds are easier to validate
than the complete `Duration.Input` union, which also admits negative values.
Never validate a distinction after a constructor that normalizes negative,
`NaN`, or infinite input.

## Retry safety and ownership

Inspect SDK, transport, service, orchestration, queue, and UI layers, then choose
one automatic retry owner. Retry only the smallest duplicate-safe unit with an
operation-specific predicate and bounded attempts. In the pinned version,
`Effect.retry({ schedule, times: n, while })` makes at most `n + 1` attempts.

Do not infer retry from a generic “transient” label. Transmission phase, commit
ambiguity, provider contract, overload response, authentication, validation,
conflict, and partial batch outcome matter. There is no universal HTTP retry
table.

A per-attempt timeout is not a transient classification by default.
Interrupting the Effect attempt does not prove the underlying operation
stopped, so retrying a timed-out attempt can overlap signal-ignorant work and
exceed the apparent concurrency bound. Retry a timeout only when the repeat is
duplicate-safe, the adapter contract proves prompt underlying cancellation or
the application independently bounds overlapping underlying operations, a
semantic test measures actual underlying in-flight work rather than active
Effect fibers, and the attempts stay inside the total budget. The canonical
checker therefore retries only its explicitly transient 503 classification and
reports a timed-out attempt as its endpoint-local timeout outcome.

Keep one idempotency key outside the retry loop when provider deduplication is
the safety mechanism. An ambiguous non-idempotent mutation returns an
outcome-unknown/reconcile result. Public `caller-may-retry` guidance is not the
same policy as internal automatic retry.

Production clients often need exponential backoff and jitter to avoid
synchronization: jitter `Schedule.exponential` with `Schedule.jittered`, then
cap it with `Schedule.min`, because jitter scales each delay by 0.8–1.2×. Jitter
draws from the `Random` service, so tests provide a deterministic one. The tiny canonical fixture omits jitter. Server delay
guidance is bounded and still capped by the total deadline.

## Cancellation and publication

Operation cancellation and permission to publish a normal result are separate.
Revoke publication synchronously at a host owner when a signal-ignorant adapter
or completion race can outlive cancellation. If replacement requires mutual
exclusion, wait for prior interruption and finalizers before starting it. The
[framework UI overlay](overlays/framework-ui.md) defines the controller forms.
