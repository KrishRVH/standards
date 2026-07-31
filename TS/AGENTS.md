## Where Effect belongs

Effect earns its place at boundaries: schemas, service wiring, typed failures,
resource lifetimes, deadlines, cancellation, and concurrency. Keep pure
calculation and presentation logic as plain TypeScript. Do not use Effect to
decorate work that plain TypeScript already does well.

Do not introduce `any`. Narrow an unknown value at the boundary that receives
it. Prefer `??` when only `null` or `undefined` must trigger a fallback.
Comments record constraints and security assumptions, not what the code says.

## Effect shape

- Read `Effect<A, E, R>` as success `A`, expected failure `E`, and required
  context `R`. Keep the three channels precise enough that a caller sees what
  can succeed, what can fail, and what must be provided. A function that
  performs I/O declares its failure in `E` instead of throwing.
- Effects are lazy descriptions, not running work. Build and return them from
  services, handlers, and clients; run them only at an application edge, such
  as a server entry point, a test, or an intentional user action. Do not put
  `Effect.runPromise`, `Effect.runSync`, or `Effect.runFork` inside a reusable
  domain or service helper.
- Use `Effect.gen` for sequential work and `pipe` for local transformation.
  Prefer direct composition over a helper that hides the error or context
  channel.
- Use `Effect.succeed` or `Effect.sync` for a value or side effect that is
  truly synchronous. Do not wrap a pure calculation in Effect when it needs no
  typed failure, context, resource scope, or interruption.
- A fork needs an intentional lifetime and an owner that can say what happens
  at shutdown. Do not use `Effect.forkDaemon` for request or screen work; a
  daemon fiber outlives its parent and runs until the global scope closes.

## Services and layers

- Define a service as three parts: an interface, a `Context.Tag` class, and a
  `Live` layer. Prefer this explicit form over `Effect.Service`. It keeps the
  wiring readable at the composition root and lets a test layer replace any
  service.
- Keep a service's own requirements in its layer, not in its interface. The
  public interface describes behavior; the layer holds the wiring.
- Use `Layer.effect` for a service an Effect constructs, `Layer.succeed` for a
  value that already exists, and `Layer.scoped` when acquisition and release
  belong to a resource lifetime. `Layer.effect` is not a substitute for a
  scoped resource: it does not tie a release action to the scope.
- Build the implementation as a plain `make*` function when a test benefits
  from calling it without a layer.
- Register a new service at the composition root and in the test layers
  together. A service that exists in only one of them is a broken test seam.
- Compose the layers once, at the composition root. Review the whole assembled
  layer after changing either list.

## Failures

- Model a failure as `Data.TaggedError`. Recover with `Effect.catchTag` or
  `Effect.catchTags`, not `Effect.either` and an `instanceof` chain. Use
  `Effect.either` only to materialize both outcomes as data at a boundary on
  purpose, and say why in a comment.
- Never silently discard a failure. Log the cause; do not replace it with a
  fixed message.
- Interruption is cancellation, not a typed failure. Do not catch it and turn a
  canceled operation into a user-visible error, and do not retry it as if the
  provider failed. Preserve an interruption-only `Cause` when you inspect one.
- Keep provider, driver, and stack text in `cause`. It must never reach a
  response body, a log a user can read, or an analytics event.
- Classify a failure the caller can act on where the context still exists, and
  answer it there. A single generic catch at the edge relabels every new
  failure mode as the same outage.

## Calls that leave the process

- Give every call that leaves the process a deadline. `fetch` and most vendor
  SDKs apply none, or apply one far longer than a request can wait.
- Pass the `AbortSignal` that `Effect.tryPromise` supplies to `try` on to the
  client. Interruption then cancels the real request instead of abandoning it.
  This is what makes a deadline stop the work, not only stop the wait.
- A signal accepted by one call does not make the whole exchange interruptible.
  A request body, a response body, or a token getter is a separate boundary:
  pass the signal if its API accepts one, and otherwise record the dependency
  behavior instead of claiming cancellation the code does not have.
- When a vendor SDK accepts no signal, keep a caller-side deadline but make its
  timeout failure non-retryable. The abandoned request may still be in flight,
  and a retry duplicates it. Recheck the exception when you upgrade the SDK.
- Put the timeout inside the retry, so each attempt gets a full budget. Piping
  them the other way round shares one budget across all attempts.
- Use `Effect.timeoutFail` at a service boundary, so the failure stays inside
  the error type the service declares.
- `Effect.retry({ times: n })` means `n` retries after the first attempt, so
  the maximum attempt count is `n + 1`. Size a backstop from the real count.
- Retry only a failure that another attempt can change: a timeout, a socket
  error, or a provider 5xx. Never retry a decision the provider already made.
  Express this as the `while` predicate of the retry.
- Retry only where the caller cannot. A visible "Try again" beats a hidden
  second attempt that doubles the wait.
- Keep an attempt budget and its backstop timeout together. The backstop must
  stay above `attempt timeout * attempts`.

## Resources and shutdown

- Use `Effect.acquireRelease`, or a `Layer.scoped` that wraps it, for a value
  with a matching close operation: a server, a database client, a socket, or a
  subscription. Acquisition and release belong to the same `Scope`.
- Use `Effect.ensuring` for local cleanup that must run after success, failure,
  or interruption. Do not use a detached fiber to make cleanup happen later.
- Keep shutdown and request cancellation separate. A request effect is
  interrupted by its own signal; shutdown interrupts the scope that owns the
  server and its resources.
- A resource a caller must remember to close is a design failure. Give the
  service the scope instead, so the requirement does not leak into `R`.

## Effects in a UI framework

The framework owns component state and lifecycle. Effect owns what happens
between a screen asking for data and the answer arriving.

- Interrupt a read when navigation, unmount, or a newer request supersedes it.
  Interruption stops `Effect.match` from running, so a stale response cannot
  write state.
- Run a write with `Effect.runFork`. A save, a sign-out, or a delete must
  survive the screen that started it. Reads cancel, writes do not.
- Do not add a generation counter or an `isCurrent` flag. Interruption already
  removes the guard those imitate.
- Put cleanup in `Effect.ensuring`. A finalizer also runs on interruption, so
  it is the right place to clear a spinner.
- Use `DateTime.unsafeNow()` outside an Effect, not
  `Effect.runSync(DateTime.now)`.

## Schema

- Use Effect Schema as the single runtime schema system. Do not add a second
  one.
- Validate every external input and every encoded output. A malformed response
  body is a failure, not a partly populated screen.
- Decode and encode are different directions. Use `Schema.decodeUnknown` for an
  untrusted value: an HTTP body, a parsed environment value, or form input. Use
  `Schema.encode` for an outgoing value whose wire form differs from the domain
  form. Use `Schema.parseJson` instead of an unchecked `JSON.parse`.
- Use a synchronous variant such as `decodeUnknownSync` only at a startup or
  configuration boundary that must fail immediately. Inside an Effect, use the
  Effect-returning operation so a parse failure stays in the failure channel.
- Put a schema in a shared package only when more than one runtime consumes it.
  Group exports by feature; do not create a generic barrel.

## Runtime behavior that is not visible in the code

Keep an `effect-semantics.test.ts` beside each runtime that pins the Effect
behaviors the code depends on and that the published documentation does not
state. Read it before changing a retry, a timeout, or an interruption path, and
add a case when you start to depend on a new one. Do not add cases that restate
documented API shapes; the compiler already covers those.

Prove a timeout with `TestClock.adjust` inside `TestContext`, never a real
wait. Assert that the caller's `AbortSignal` aborted, because that is the
behavior a deadline exists for.

Test the side effect of a boundary as well as its typed outcome: the aborted
signal, the attempt count, the value the provider received, or the released
resource. A compile pass proves none of these. Inject the fetcher, the provider
client, the clock, or the service layer, and test the real boundary rather than
mocking the Effect runtime.

Prove a new test goes red for the fault it claims to catch before you trust it.
Inject the fault, run, and revert.

Pin the installed `effect` and `@effect/language-service` versions and prefer
the declarations under `node_modules/effect/dist/dts` over an example from a
newer website. Language-service diagnostics are useful feedback, not proof of
runtime behavior; a non-obvious Effect contract still needs a deterministic
test. Keep a diagnostic suppression narrow, on the single line that needs it,
with a comment that says which dependency forces it.

## Bun as the script runtime

`bunfig.toml` sets:

```toml
[run]
bun = true
```

This makes Bun the runtime for package scripts and executables, the same as
`bun --bun <script>` or `bunx --bun <binary>`. It applies recursively: Bun
prepends a shim directory to `PATH`, so any `node` subprocess a script spawns,
including a `#!/usr/bin/env node` shebang inside a dependency, resolves to Bun
instead of Node.

That default is correct for project code and wrong for a tool that needs real
Node. Playwright is the known case: it must transform a spec file with Node,
and Bun cannot build a Playwright spec, so the run fails with the shim in
place. Expo and Metro tooling that invokes Node internally is the same shape.

Do not remove the setting for the whole project. Resolve past the shim in the
one runner that needs Node:

```ts
// `bunfig.toml` sets `[run] bun = true`, which prepends a shim directory so a
// `node` subprocess is redirected back to Bun. Playwright needs real Node.
const node = Bun.which('node', {
  PATH: (Bun.env['PATH'] ?? '')
    .split(':')
    .filter((entry) => !entry.startsWith('/tmp/bun-node-'))
    .join(':'),
});
if (node === null) {
  throw new Error('Node is required to run Playwright. Run `mise install`.');
}
```

Then spawn the tool's CLI with that `node` binary rather than through its
wrapper script. Keep a comment at the site that says why the shim is removed.
