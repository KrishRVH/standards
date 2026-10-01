# Adoption and Effect function shape

The [enforcement map](enforcement.md) owns mandatory wording. This guide
explains the selective adoption model for the pinned Effect v4 release.

## Start from the operational contract

Keep a calculation plain when it is synchronous, total, dependency-free, and
has no interruption or lifetime concern:

```ts
export const subtotal = (prices: ReadonlyArray<number>): number => prices.reduce((sum, price) => sum + price, 0);
```

Use `Option` or `Result` when absence or validation is data rather than an
operation. Use `Effect` when the signature benefits from typed operational
failure, required capabilities, time, interruption, concurrency, or resource
lifetime. Use `Stream` for multiple asynchronous values with pull,
backpressure, or stream lifetime. The baseline ships no canonical Effect
`Stream` fixture — the Bun server overlay covers Web `ReadableStream`
ownership; a project that adopts `Stream` adds its patterns and semantic tests
as a project overlay.

Do not turn trusted internal interfaces into Schemas, make every module a
service, or wrap a pure loop in `Effect.sync`. Add an operational abstraction
only when it owns a real contract.

## Choose the constructor by what can happen

- `Effect.succeed(value)` receives an already computed value.
- `Effect.sync(() => value)` defers synchronous work documented not to throw.
- `Effect.try({ try, catch })` maps an expected synchronous throw.
- `Effect.suspend(() => effect)` defers construction of another Effect.
- `Effect.fromNullishOr(value)` turns a nullable value into a
  `NoSuchElementError` failure; map it to the domain error.
- `Effect.promise(signal => promise)` is for a Promise documented not to reject.
- `Effect.tryPromise({ try: signal => promise, catch })` maps expected rejection
  and exposes cancellation.
- `Effect.callback((resume, signal) => cleanup)` adapts callback or listener
  registration; return a cleanup Effect when the host API can unregister.

`Effect.succeed(client.load())` starts work before Effect owns it.
`Effect.sync(() => client.load())` creates `Effect<Promise<A>>`; it does not
adapt the Promise.

## `Effect.gen`, `Effect.fn`, and combinators

Use `Effect.gen` for a local orchestration value whose sequencing is clearer as
statements. Write a reusable Effect-returning function with
`Effect.fn("package.operation")` when it is a stable, low-cardinality trace
boundary, such as an exported service or workflow operation, and with
`Effect.fnUntraced` when it is an internal helper or a measured hot path. A
function that only returns `Effect.gen` is the long form of either. Keep IDs,
URLs, payloads, and user text out of span names.

Give `Effect.fn` a generator body and pass whole-operation combinators as
further arguments rather than piping its result:

```ts
export const loadProfile = Effect.fn('profiles.load')(
  function* (id: ProfileId): Effect.fn.Return<Profile, ProfileNotFound, ProfileStore> {
    const store = yield* ProfileStore;
    const profile = yield* store.find(id);
    if (Option.isNone(profile)) {
      return yield* new ProfileNotFound({ id });
    }
    return profile.value;
  },
  Effect.annotateLogs({ operation: 'profiles.load' }),
);
```

Tagged errors are yieldable; `return yield* new ProfileNotFound(...)` ends the
generator with a typed failure and lets TypeScript narrow what follows. Use
`pipe` and combinators for a short transformation. Pin a public contract with
`Effect.fn.Return<A, E, R>` only when inference exposes implementation detail.

Read `Effect<A, E, R>` as success, expected failure, and required capability.
Do not narrow exported channels with an assertion or by hiding provisioning.
Static construction dependencies may be captured by a layer; a genuinely
caller-owned `Scope`, transaction, request capability, or polymorphic
capability can honestly remain in `R`.

## Effects, data, and handles

Service keys and `Config` values are Effects: yield them or pass them to
combinators. In the pinned release `Option` and `Result` are data: branch on
them, or lift them with `Effect.fromOption` or `Effect.fromResult`. `Ref`,
`Deferred`, and `Fiber` are handles: read them with `Ref.get`,
`Deferred.await`, `Fiber.join`, or `Fiber.await`.

## Locality for agents

Keep pure functions beside the operation that uses them when this makes the
contract obvious. Give adapters and workflows precise names. Comments explain
ownership, protocol/security constraints, suppressions, or pinned behavior;
they do not narrate syntax.
