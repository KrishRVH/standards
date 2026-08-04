# Bun server overlay

Read this overlay before changing a Bun process entrypoint, native `fetch`
adapter, HTTP route, request-body reader, or destination policy. The
[enforcement map](../enforcement.md) owns mandatory wording; this document owns
the Bun-specific implementation guidance.

## Process and request edges

Use `@effect/platform-bun/BunRuntime.runMain` at the narrow process edge. Build
the application layer once, pass it to the program deliberately, and let that
edge own termination-signal handling, the full `Exit`, and process status. A
framework callback is a different edge: it should run a prebuilt
`ManagedRuntime`, project every expected route error, and return a `Response`.

Prefer routes whose expected error algebra is exhausted before an
infrastructure wrapper:

```ts
declare const executeProtectedRequest: <R>(handler: Effect.Effect<Response, never, R>) => Promise<Response>;
```

The route maps authentication, authorization, validation, conflict, rate
limiting, domain rejection, and explicitly temporary service failures to their
intended response. An outer server boundary observes defects. Request
interruption remains interruption; it is not a synthetic `500` or `503`.

## Native fetch and redirects

Native Bun `fetch` is appropriate when its cancellation, redirect, response,
and error behavior are the required contract. Use `redirect: "manual"` when the
application must never follow redirects and classify every `300` through `399`
response as an explicit redirect rejection. Do not expose or automatically
authorize the `Location` value, and do not automatically retry the rejection.

`redirect: "error"` rejects the promise and can erase the distinction between a
redirect and a socket or DNS failure. It is therefore the wrong setting when
redirect rejection is part of the public or operational classification.

Use an Effect platform package when its stable API materially supplies the
portable request, server, filesystem, command, terminal, or path contract the
application needs. Do not add a platform wrapper merely to rename a small,
well-tested native boundary.

## Bounded request bodies

A bounded reader owns both the lock and cleanup:

1. Parse and validate `Content-Length` as a bounded non-negative integer. Reject
   a declared oversize body before acquiring the reader.
2. Acquire one `ReadableStreamDefaultReader` and accumulate only while a running
   byte count remains within the limit.
3. On success, release the lock after end-of-stream.
4. On oversize, interruption, or abandonment, attempt `reader.cancel()` when
   appropriate, attach a rejection observer, and always attempt
   `reader.releaseLock()`.
5. Preserve the primary typed failure or interruption if cleanup rejects. Never
   publish the cleanup message.

Stream abandonment uses EFF-019's explicit zero-wait exception when the host's
`cancel()` promise may never settle: start cancellation, attach a rejection
handler that emits only a fixed allowlisted cleanup diagnostic, then attempt
`releaseLock()` without awaiting cancellation. This is not permission to
silently detach arbitrary finalizers. A critical release remains awaited and
owned by its Scope.

The pending `read()` must participate in request cancellation or another
explicit liveness budget. A request object going out of scope does not prove
that the reader was cancelled or its lock released. Tests should use a
controlled stream to prove successful release, declared and actual oversize,
read rejection, a stalled read interrupted by the owner, safely observed cleanup
rejection, cancellation that never settles, and host request abort.

## Destination policy and SSRF boundary

Decode policy origins as HTTPS URLs with no credentials, path beyond `/`,
query, or fragment. Store their canonical `URL.origin` values and deduplicate
after normalization. For each target, keep the caller's stable target ID
separate from the transport URL and derive a safe origin for authorization and
diagnostics. Reject credentials, an unauthorized origin, excess target count,
and excess concurrency before native I/O.

Exact-origin authorization plus redirect rejection is useful but is not a
complete SSRF defense. An attacker-influenced destination can still be affected
by DNS rebinding, public names resolving to private addresses, proxy routing,
or connect-time address substitution. Production adapters that accept such
destinations need resolver and connect-time IP policy at their actual network
boundary.

## Verification

Keep native API probes deterministic and local. A redirect test uses a local
server or fake response; a stream test uses a controlled `ReadableStream`; a
process-signal test may use a local child process because the OS signal is the
behavior under test. No test needs an external service.
