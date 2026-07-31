## Where Effect belongs

Effect earns its place at boundaries: schemas, service wiring, typed failures,
resource lifetimes, deadlines, cancellation, and concurrency. Keep pure
calculation and presentation logic as plain TypeScript. Do not use Effect to
decorate work that plain TypeScript already does well.

Do not introduce `any`. Narrow an unknown value at the boundary that receives
it. Prefer `??` when only `null` or `undefined` must trigger a fallback.
Comments record constraints and security assumptions, not what the code says.

## Services and layers

- Define a service as three parts: an interface, a `Context.Tag` class, and a
  `Live` layer. Prefer this explicit form over `Effect.Service`. It keeps the
  wiring readable at the composition root and lets a test layer replace any
  service.
- Keep a service's own requirements in its layer, not in its interface.
- Build the implementation as a plain `make*` function when a test benefits
  from calling it without a layer.
- Register a new service at the composition root and in the test layers
  together. A service that exists in only one of them is a broken test seam.

## Failures

- Model a failure as `Data.TaggedError`. Recover with `Effect.catchTag` or
  `Effect.catchTags`, not `Effect.either` and an `instanceof` chain.
- Never silently discard a failure. Log the cause; do not replace it with a
  fixed message.
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
- Put the timeout inside the retry, so each attempt gets a full budget. Piping
  them the other way round shares one budget across all attempts.
- Use `Effect.timeoutFail` at a service boundary, so the failure stays inside
  the error type the service declares.
- Retry only a failure that another attempt can change: a timeout, a socket
  error, or a provider 5xx. Never retry a decision the provider already made.
  Express this as the `while` predicate of the retry.
- Retry only where the caller cannot. A visible "Try again" beats a hidden
  second attempt that doubles the wait.
- Keep an attempt budget and its backstop timeout together. The backstop must
  stay above `attempt timeout * attempts`.

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

Prove a new test goes red for the fault it claims to catch before you trust it.
Inject the fault, run, and revert.

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
