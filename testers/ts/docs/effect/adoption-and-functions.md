# Adoption and Effect function shape

The [enforcement map](enforcement.md) owns mandatory wording. This guide
explains the selective adoption model for Effect 3.22.1.

## Start from the operational contract

Keep a calculation plain when it is synchronous, total, dependency-free, and
has no interruption or lifetime concern:

```ts
export const subtotal = (prices: ReadonlyArray<number>): number => prices.reduce((sum, price) => sum + price, 0);
```

Use `Option` or `Either` when absence or validation is data rather than an
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
- `Effect.promise(signal => promise)` is for a Promise documented not to reject.
- `Effect.tryPromise({ try: signal => promise, catch })` maps expected rejection
  and exposes cancellation.
- `Effect.async` adapts callback/listener registration and returns an
  unregister/cancel Effect when the host API supports one.

`Effect.succeed(client.load())` starts work before Effect owns it.
`Effect.sync(() => client.load())` creates `Effect<Promise<A>>`; it does not
adapt the Promise.

## `Effect.gen`, `Effect.fn`, and combinators

Use `Effect.gen` for a local orchestration value whose sequencing is clearer as
statements. Use `Effect.fn("package.operation")` for an exported service or
workflow operation when a stable, low-cardinality trace boundary is useful.
Keep IDs, URLs, payloads, and user text out of function names.

Use `pipe` and combinators for a short transformation. Pin a public contract
with `Effect.fn.Return<A, E, R>` only when inference exposes implementation
detail. Use `Effect.fnUntraced` only after measuring a hot path.

Read `Effect<A, E, R>` as success, expected failure, and required capability.
Do not narrow exported channels with an assertion or by hiding provisioning.
Static construction dependencies may be captured by a layer; a genuinely
caller-owned `Scope`, transaction, request capability, or polymorphic
capability can honestly remain in `R`.

## Locality for agents

Keep pure functions beside the operation that uses them when this makes the
contract obvious. Give adapters and workflows precise names. Comments explain
ownership, protocol/security constraints, suppressions, or pinned behavior;
they do not narrate syntax.
