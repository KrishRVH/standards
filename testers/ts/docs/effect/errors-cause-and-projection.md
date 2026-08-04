# Errors, Cause, and projection

The [enforcement map](enforcement.md) owns mandatory wording. This guide keeps
recovery, public protocol, and telemetry contracts distinct.

## Preserve Cause classes

An expected failure is a recoverable operation outcome in `E`. A defect is a
programmer error or violated invariant in `Cause`. Interruption records owner
cancellation or shutdown in `Cause`. Typed `catchTag`/`catchTags` and exhaustive
matches recover expected failures; they do not catch defects or relabel
interruption.

Inspect full `Exit`/`Cause` at the handling owner when parallel branches or
finalizers can contribute more than one failure. `catchAllCause`, `sandbox`,
`unsandbox`, `die`, and `orDie` are narrow tools, not ways to make channels look
clean.

Use `Data.TaggedError` for a runtime-only algebra. Use `Schema.TaggedError` for
serialized RPC, event, persisted, or wire errors. A private tag can change with
an internal refactor; an observed wire discriminant follows an explicit
compatibility policy.

## Three projections

Internal operational errors retain only fields needed for recovery and policy.
Even internal public fields should be redaction-safe; do not store a raw SDK
object in an enumerable `cause` field.

Public errors describe a stable caller action:

```ts
type RetryDisposition = 'never' | 'caller-may-retry' | 'reconcile-first';

interface PublicFailure {
  readonly code: string;
  readonly message: string;
  readonly retryDisposition: RetryDisposition;
  readonly retryAfterMillis?: number;
}
```

This disposition does not authorize an internal automatic retry. Internal
retry remains an operation-specific implementation policy.

Telemetry uses an application-owned allowlist:

```ts
interface SafeFailureDiagnostic {
  readonly failureKind:
    | 'authentication-failure'
    | 'provider-timeout'
    | 'provider-invalid-response'
    | 'database-timeout'
    | 'retry-exhausted'
    | 'rate-limited'
    | 'protocol-failure'
    | 'internal-defect';
  readonly operation: string;
  readonly resource?: string;
  readonly attempts?: number;
  readonly statusClass?: '4xx' | '5xx';
}
```

The vocabulary is application-specific. Project owned tags/reasons feed the
projector; arbitrary third-party `constructor.name` does not. Provider text,
stack content, SQL, headers, payloads, URL query/fragment, prompts,
credentials, and PII are never telemetry classification.

## HTTP server projection

Prefer route-completed projection. Authentication absence, authorization,
rate limit, validation, conflict, and domain rejection become their intended
`Response` before entering a protected infrastructure wrapper:

```ts
const executeProtectedRequest = <R>(handler: Effect.Effect<Response, never, R>): Effect.Effect<Response, never, R> =>
  handler;
```

Adding a route error then fails TypeScript until the route maps it. Reserve
`503` for an explicitly classified temporary service/dependency failure.
Defects stay with the outer server/runtime observer. Request interruption
follows cancellation semantics and is not converted to `500` or `503`.

An exhaustive projector argument is a valid alternative when it remains
legible, but an unconstrained `E` plus generic `catchAll` fallback is not.

## HTTP client projection

Preserve distinctions that change authentication flow, presentation, retry or
reconciliation, or telemetry. A compact client algebra commonly includes:

- session required/expired and forbidden;
- rate limited with a parsed, bounded `Retry-After`;
- temporary service unavailable;
- caller/total timeout;
- local transport failure;
- malformed/incompatible successful response;
- malformed error response; and
- application domain response such as validation or profile incompleteness.

A compact application-specific boundary can preserve those actions without one
class per HTTP status:

```ts
type ClientApiFailure =
  | { _tag: 'SessionRequired'; action: 'reauthenticate'; retryDisposition: 'never' }
  | { _tag: 'Forbidden'; retryDisposition: 'never' }
  | { _tag: 'RateLimited'; retryAfterMillis?: number; retryDisposition: 'caller-may-retry' }
  | { _tag: 'ServiceUnavailable'; failureKind: 'service-unavailable'; retryDisposition: 'caller-may-retry' }
  | { _tag: 'RequestTimedOut'; retryDisposition: RetryDisposition }
  | { _tag: 'TransportFailure'; retryDisposition: RetryDisposition }
  | { _tag: 'ProtocolFailure'; responseKind: 'error' | 'success'; retryDisposition: 'never' }
  | { _tag: 'DomainRejected'; action: string; code: string; retryDisposition: 'never' };
```

Parse and cap numeric `Retry-After` guidance before exposing it. This union
describes what the caller may do; it does not cause the client to retry.

Do not create one class per status. Decode a shared Schema-defined wire error
when server and client share a monorepo. Keep provider/internal errors separate
from that contract. External cancellation remains interruption rather than a
client request error.

## Observation ownership

Every layer either propagates, transforms, counts, or handles a failure.
Propagating layers may attach safe structured context but do not log it again.
The handling owner records one event at the appropriate level. Expected domain
rejection is not automatically a server error; cancellation is not an error by
default; defects remain distinguishable from exhausted expected failures.
