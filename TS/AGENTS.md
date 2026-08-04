## Effect v3 scope and rule levels

This profile is tested with `effect` 3.22.1,
`@effect/language-service` 0.87.1, TypeScript 6.0.3, Bun 1.3.14,
`@effect/platform` 0.97.1, and `@effect/platform-bun` 0.91.0. The Effect
`main` branch is v4 and is not evidence for this profile.

- **MUST** protects correctness, security, or an ownership contract. A genuine
  exception needs a narrow comment or diagnostic suppression, the owner, and a
  test when runtime behavior is involved.
- **SHOULD** is the copyable default. Depart when local evidence makes the
  alternative clearer or safer.
- **MAY** is an optional technique, not a requirement.

Use these terms consistently:

| Term             | Meaning                                                                             |
| ---------------- | ----------------------------------------------------------------------------------- |
| boundary         | Code translating between trust, protocol, runtime, or ownership domains             |
| expected failure | Recoverable operation outcome represented in `E`                                    |
| defect           | Programmer error or violated internal invariant in `Cause`, not `E`                 |
| runtime edge     | The named adapter that executes an Effect and owns its result                       |
| owner            | The scope/component/service responsible for observation, interruption, and shutdown |
| attempt timeout  | Limit for one external attempt                                                      |
| total deadline   | Limit for the complete caller workflow, including retry delays                      |
| duplicate-safe   | Repeating the operation cannot apply an unacceptable duplicate effect               |
| scoped resource  | Value whose validity and release are tied to a `Scope`                              |
| safe projection  | Explicit redacted mapping from internal failure to a public protocol/user result    |

## 1. Effect adoption boundary

Effect is for operational semantics, not decoration.

| Need                                                                                             | Default              |
| ------------------------------------------------------------------------------------------------ | -------------------- |
| Total synchronous calculation with no runtime dependency                                         | Plain TypeScript     |
| Optional value or validation outcomes consumed as data                                           | `Option` or `Either` |
| Typed operational failure, service requirements, interruption, concurrency, or resource lifetime | `Effect`             |
| Multiple asynchronous values with pull, backpressure, or stream lifetime                         | `Stream`             |

**EFF-001 — MUST** keep total, synchronous, dependency-free calculations plain
TypeScript. Do not create an Effect, service, layer, or schema merely for
uniformity. Ordinary trusted internal types need no runtime schema.

**EFF-002 — MUST** keep `any` out of application channels. Receive foreign data
as `unknown`, narrow it at the adapter, and keep `A`, `E`, and `R` precise. A
line-level exception is allowed only for an untyped dependency adapter and must
name that dependency.

```ts
const subtotal = (prices: ReadonlyArray<number>): number => prices.reduce((sum, price) => sum + price, 0); // compliant

const ceremonial = (prices: ReadonlyArray<number>) => Effect.sync(() => subtotal(prices)); // prohibited: no operational benefit
```

Use `??`, rather than `||`, when valid falsy values must survive. Comments
should explain ownership, protocol/security constraints, suppressions, or
version-sensitive behavior; do not narrate syntax.

## 2. Effect function shape and laziness

Read `Effect<A, E, R>` as success `A`, expected failure `E`, and required
capabilities `R`.

**EFF-003 — MUST** expose accurate channels from exported workflows. Expected,
recoverable I/O failures belong in `E`; interruption and violated invariants do
not. Do not erase `E` or `R` with assertions, `orDie`, or hidden provisioning
just to satisfy a signature.

Choose constructors by contract:

| Source                                                | Constructor                                                    |
| ----------------------------------------------------- | -------------------------------------------------------------- |
| Already computed value                                | `Effect.succeed(value)`                                        |
| Lazy synchronous work that does not throw             | `Effect.sync(() => value)`                                     |
| Lazy synchronous work with an expected thrown failure | `Effect.try({ try, catch })`                                   |
| Lazy Effect construction                              | `Effect.suspend(() => effect)`                                 |
| Promise documented not to reject                      | `Effect.promise(signal => promise)`                            |
| Promise with expected rejection                       | `Effect.tryPromise({ try: signal => promise, catch })`         |
| Callback/listener registration                        | `Effect.async` with an unregister/cancel Effect when available |

**EFF-004 — MUST** keep side effects lazy. Never evaluate I/O before Effect
construction and never return a Promise from `Effect.sync`.

```ts
const load = Effect.tryPromise({
  try: (signal) => sdk.load({ signal }),
  catch: classifySdkFailure,
}); // compliant

const eager = Effect.succeed(sdk.load()); // prohibited: starts now
const nestedPromise = Effect.sync(() => sdk.load()); // prohibited: Effect<Promise<A>>
```

Use a stable, low-cardinality named `Effect.fn("package.operation")` for an
exported service/workflow operation when its trace boundary is useful. Use
`Effect.gen` for a local orchestration value and `pipe`/combinators for short
transformations. `Effect.fn.Return<A, E, R>` MAY pin a public channel contract
when inference exposes implementation detail. `Effect.fnUntraced` needs a
measured hot-path reason; do not put user IDs, URLs, or payloads in function
names.

## 3. Expected failures, defects, interruption, Exit, and Cause

**EFF-005 — MUST** preserve the three Cause classes:

- recover tagged expected failures with `catchTag`, `catchTags`, `match`, or
  another typed operator;
- do not turn interruption into a provider error or retry input;
- do not catch defects merely to make `E` look clean.

| Situation                                    | Representation                                                  |
| -------------------------------------------- | --------------------------------------------------------------- |
| Stable in-process public failure             | Small `Data.TaggedError` algebra                                |
| Serialized RPC/event/persisted failure       | `Schema.TaggedError`                                            |
| Existing stable platform failure             | Preserve it or map once at the public seam                      |
| Expected absence/validation consumed as data | `Option`, `Either`, or validation mode                          |
| Violated internal invariant                  | Defect, usually an assertion or narrowly justified `Effect.die` |

`Effect.either`, `option`, `exit`, `match`, `matchEffect`, and collection
`"either"`/`"validate"` modes are legitimate when the consumer intentionally
needs outcomes as data. Do not replace a tagged public algebra with ad hoc
`instanceof` chains.

**EFF-006 — MUST** keep public errors stable and redaction-safe. Do not store a
raw provider/driver object, headers, SQL, payload, stack text, credentials, or
PII in a public error field named `cause`. That field is enumerable and
serializable in `Data.TaggedError`; it is also not Effect's `Cause<E>`.
Restricted technical detail, if genuinely needed, stays `unknown`, outside the
public protocol, and is redacted before telemetry.

`Effect.die`, `orDie`, `catchAllDefect`, `catchAllCause`, `sandbox`, and
`unsandbox` MAY appear only with a narrow reason:

- `die`/`orDie`: an impossible invariant or an explicit startup-failure policy;
- Cause-wide catches: an outer observer that preserves or rethrows unhandled
  defects/interruption;
- sandboxing: code that deliberately transforms the full Cause structure.

Tests and telemetry boundaries SHOULD inspect `Exit`/`Cause` when parallel
branches or finalizers can contribute multiple failures. A first typed failure
alone may omit defects, interruption, or sequential/parallel Cause structure.

## 4. Services and public capability contracts

Create a service for a substitutable operational capability or owned resource,
not for every module.

| Form                                             | Use                                                                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Explicit interface + `Context.Tag` + named layer | Default when API, construction, and dependencies should be visibly separate                                         |
| `Effect.Tag`                                     | Stable v3 option when generated proxy accessors materially reduce boilerplate                                       |
| `Effect.Service`                                 | MAY be used only after accepting that it is experimental in Effect 3.22.1 and bundles tag/layer/dependency behavior |

The explicit form is this profile's legibility preference, not a claim that
other forms are inherently non-idiomatic.

**EFF-007 — MUST** give every service tag a deterministic, process-wide unique
identifier such as `@org/package/Capability`. Two distinct tags with the same
key can silently resolve to the same Context entry. Public error and Schema
identifiers must also remain stable protocol identities.

**EFF-008 — MUST** not use erased type parameters as runtime service identity.
Put generic operations on a non-generic capability or define explicit concrete
tags.

```ts
interface MailerService {
  readonly send: (message: Message) => Effect.Effect<void, SendError>;
}

class Mailer extends Context.Tag('@acme/orders/Mailer')<Mailer, MailerService>() {}
```

Public service operations SHOULD return `Effect<A, E, never>` after static
implementation dependencies are captured by the constructor/layer. A
caller-owned `Scope`, transaction, session, request capability, or genuinely
polymorphic capability MAY remain in `R`; name that lifetime/capability and
suppress `leakingRequirements` narrowly if necessary.

A plain `make*` constructor MAY support unit tests. Test through the layer when
acquisition, dependency wiring, memoization, or finalization is the property
under test. Prefer an explicit complete test service when behavior/state
matters; `Layer.mock` is useful when an unexpected method call should defect.

## 5. Layers and dependency graph construction

| Constructor/operator  | Contract                                                                |
| --------------------- | ----------------------------------------------------------------------- |
| `Layer.succeed`       | Service value already exists                                            |
| `Layer.effect`        | Effect constructs a service; no owned scoped release                    |
| `Layer.scoped`        | Construction acquires a resource released with the layer scope          |
| `Layer.effectDiscard` | Startup effect whose output is not a service                            |
| `Layer.provide`       | Feed dependencies and expose only the outer output                      |
| `Layer.provideMerge`  | Feed dependencies and retain both outputs                               |
| `Layer.mergeAll`      | Combine independent siblings; it does not wire one sibling into another |
| `Layer.launch`        | Run a layer as a scoped long-lived application effect                   |

**EFF-009 — MUST** use `Layer.scoped`, not `Layer.effect`, when construction
requires `Scope` because the layer owns acquisition and release. An
externally-owned Scope is a reviewed exception with a lifetime test and a
single diagnostic suppression.

Compose feature layers near the feature, then assemble application, request,
framework, and test roots explicitly. Tests provide only capabilities they
exercise; a global test registry is not required.

**EFF-010 — MUST** not construct a `ManagedRuntime` or a long-lived/service
resource layer in a loop, component render, or request hot path unless that
iteration/request deliberately owns the complete lifetime. `Layer.mergeAll(A,
B)` is prohibited when `B` requires `A`; use `provide`/`provideMerge`.

Layer memoization is scoped to a build memo map. Reusing the same layer identity
inside one root can share acquisition; `Layer.fresh`, separate builds, and
separate runtimes reacquire. A critical shared client SHOULD have a test proving
acquisition and finalization counts.

## 6. Runtime edges and runtime ownership

**EFF-011 — MUST** execute Effects only at a named runtime edge. Domain and
service code returns Effects and never calls `runPromise`, `runSync`, `runFork`,
or another runner.

A runtime edge states:

1. which Runtime and application layer it uses;
2. who owns the running operation;
3. what signal/scope interrupts it;
4. who observes the complete `Exit`;
5. how errors become a safe host result; and
6. when runtime resources are disposed.

A test is a runtime edge. An arbitrary helper, render, or click callback is not
one without this contract. Never use `void runtime.runPromise(...)` as
fire-and-forget.

`ManagedRuntime.make(AppLive)` is appropriate for a framework/application
adapter that needs application services. Build it once and call `dispose` at
application teardown. Its disposal closes the managed layer, but
`ManagedRuntime.runFork` still uses a global fiber scope unless an explicit
scope is supplied: it is not a background-task supervisor.

Transfer background work to a scoped application task service (for example a
scoped `FiberSet`) that observes failures and interrupts tasks on shutdown.
Work that must survive process termination belongs in a durable queue/workflow,
not an Effect fiber.

## 7. Async interop and cancellation

**EFF-012 — MUST** define and test the cancellation contract of every async
adapter. A signal-aware `tryPromise` callback must syntactically accept and
forward its `AbortSignal`.

```ts
Effect.tryPromise({
  try: (signal) => client.get(id, { signal }),
  catch: classifyClientFailure,
}); // compliant

Effect.tryPromise({
  try: () => client.get(id),
  catch: classifyClientFailure,
}); // signal-ignorant; document the continuing work
```

For each adapter answer:

- Does abort stop local waiting, request transmission, request-body production,
  response-body consumption, or the real upstream operation?
- Does it unregister callbacks/listeners, call iterator `return`, close a
  stream, terminate a child process, and release associated resources?
- Can the remote side still commit?
- Which result wins when cancellation races completion?

`Effect.async` registration SHOULD return an unregister/cancel Effect when the
API supports one. Async iterables, streams, callbacks, child processes, and SDK
timeout/retry systems need adapter-specific tests. A typed timeout result alone
does not prove underlying cancellation. A signal-ignorant promise may continue
after the caller has timed out.

Cancellation support and retry safety are independent. Aborting a mutation
does not prove it failed to commit; inability to abort an idempotent read does
not make a retry inherently unsafe.

## 8. Deadlines, retries, idempotency, and overload

| Operation shape            | Required liveness policy                         |
| -------------------------- | ------------------------------------------------ |
| Bounded request/response   | Attempt timeout and/or total caller deadline     |
| Stream/socket/subscription | Connection, idle, heartbeat, and shutdown policy |
| Durable background job     | Lease/heartbeat or workflow deadline             |
| Child process/local IPC    | Operation-specific termination and reap policy   |

**EFF-013 — MUST** give each bounded external operation an explicit budget
owned by the service or caller. Put timeout inside retry for a per-attempt cap;
put a deadline outside retry for a total cap. When both apply, order them as:
smallest duplicate-safe attempt → attempt timeout → retry schedule → total
deadline.

A planning bound is:

`attempt execution + schedule delay/jitter + queue/token wait + body processing + finalizers <= caller budget`

It is not a requirement to let every configured attempt run. The total
deadline MAY intentionally interrupt retry sleep or later attempts. In Effect
3.22.1, timeout interrupts the loser and waits for its termination, so
uninterruptible work or slow finalizers can delay the timeout result.

**EFF-014 — MUST** declare exactly one automatic retry owner after inspecting
SDK, transport, service, orchestration, queue, and UI layers. Retry only the
smallest duplicate-safe unit, with an operation-specific predicate and maximum
attempt count. In Effect 3.22.1, `{ times: n }` means at most `n + 1` attempts.

A transport label is not enough. Classification considers transmission phase,
commit ambiguity, DNS/connect/TLS, 408/409/425/429, specific 5xx/provider
overload, `Retry-After`, authentication/authorization/validation, optimistic
conflict, and partial batch outcome in the context of this operation. There is
no universal HTTP retry table.

**EFF-015 — MUST** keep one idempotency key stable across every attempt of the
same logical mutation when deduplication is the safety mechanism. An ambiguous
non-idempotent commit is not automatically retried; return an
outcome-unknown/reconciliation result.

Use exponential backoff and jitter when clients can synchronize. Treat a
server-provided delay according to the provider contract, normally as a
minimum combined with local delay, while the total deadline remains the cap.
Record attempt count, total elapsed budget, classification, and final failure;
do not log every attempt as an error. Back off under overload rather than
amplifying it.

Hedging/racing is a separate concurrent-duplication policy. It requires an
explicit duplicate-safety and loser-cancellation analysis even when sequential
retry is allowed.

## 9. Structured concurrency and background task ownership

**EFF-016 — MUST** answer for every fork: owner, failure observer, interruption
trigger, resource scope, permission to outlive the caller, and shutdown
behavior. Lifetime linkage does not automatically propagate an unjoined child
failure.

| API                              | Owner/lifetime                                            |
| -------------------------------- | --------------------------------------------------------- |
| `Effect.fork`                    | Parent fiber; child is interrupted when parent scope ends |
| `Effect.forkScoped`              | Current local Scope                                       |
| `Effect.forkIn(scope)`           | Supplied Scope                                            |
| `Effect.forkDaemon`              | Effect global scope; only reviewed process-lifetime work  |
| Scoped task service / `FiberSet` | Application owner with failure and shutdown policy        |

`forkDaemon` is prohibited for request, component, or ordinary application
work. `Effect.disconnect` also permits the caller to return while cleanup/work
continues in a daemon; use it only with an explicit continuing owner and a
bounded operation.

**EFF-017 — MUST** bound concurrency and queue capacity by default. Numeric
`concurrency` and `Queue.bounded`/bounded PubSub are the baseline. Unbounded
concurrency or storage requires a proven finite producer/resource bound and a
comment at the decision.

Choose parallel outcome semantics deliberately:

| Need                                    | Pattern                                       |
| --------------------------------------- | --------------------------------------------- |
| First typed failure, interrupt siblings | Default concurrent `all`/`forEach`            |
| Run all and retain each typed outcome   | `{ mode: "either", concurrency: n }`          |
| Accumulate typed validation failures    | `{ mode: "validate", concurrency: n }`        |
| First success/race                      | Race API plus explicit loser/duplicate policy |

Defects and interruption still fail outcome-collecting modes. Use full
`Exit`/`Cause` when finalizers or parallel branches can add failures. Fibers
provide cooperative JavaScript concurrency, not CPU parallelism; long CPU work
may need yielding, workers, native code, or process isolation.

## 10. Resource scopes and shutdown

Resource lifetimes include process, application runtime, server, tenant,
feature/session, request, operation, and stream/subscription. Do not silently
promote a short-lived resource to a longer scope.

**EFF-018 — MUST** acquire a resource in the shortest scope that owns all uses
and pair acquisition with release.

| API                        | Use                                                          |
| -------------------------- | ------------------------------------------------------------ |
| `Effect.acquireRelease`    | Caller owns a scoped resource; `Scope` in `R` is intentional |
| `Effect.acquireUseRelease` | One operation owns complete acquire/use/release              |
| `Effect.addFinalizer`      | Add cleanup to an already-owned Scope                        |
| `Effect.scoped`            | Close a Scope around a complete use                          |
| `Layer.scoped`             | Resource lifetime equals layer/runtime lifetime              |

A public `Scope` requirement is not automatically leakage. Eliminate it only at
the boundary that truly owns the complete use.

Pinned Effect 3.22.1 behavior: acquisition plus finalizer registration is
uninterruptible; added finalizers run with interruption disabled; default Scope
close is reverse-order and sequential; finalizer defects are retained in Cause
and can combine sequentially with a use failure.

**EFF-019 — MUST** give potentially blocking close operations a shutdown policy
at their owner. Critical cleanup remains a finalizer; a best-effort close may
make its internal operation interruptible/bounded and observe its `Exit`.
Putting a timeout outside a Scope is not a hard wall because timeout waits for
interruption/finalization. Do not detach cleanup to “finish later.”

Use `ensuring` for local Effect-owned cleanup valid on every exit. Framework
state mutation, such as clearing a spinner, is not resource cleanup and does
not belong in an Effect finalizer.

## 11. Schema and domain boundaries

Effect Schema SHOULD be the one runtime schema authority for a given wire
contract. Do not duplicate that contract in competing schema systems. Internal
trusted types and pure constructors remain plain TypeScript.

| Boundary artifact                         | Default                                          |
| ----------------------------------------- | ------------------------------------------------ |
| Untrusted wire/config/form/provider input | Schema decode                                    |
| Domain model with useful invariant        | Schema-derived type, optional brand/refinement   |
| Persisted/public/RPC representation       | Explicit encoded schema and compatibility policy |
| Internal-only value                       | Plain type                                       |
| Serializable public failure               | `Schema.TaggedError`                             |
| Runtime-only typed failure                | `Data.TaggedError`                               |

**EFF-020 — MUST** decode `unknown` at trust boundaries and encode public wire
output through its declared schema. Derive `Schema.Schema.Type`,
`Schema.Schema.Encoded`, and Schema requirements rather than duplicating
interfaces. Never cast unknown input to its encoded type.

Inside an Effect workflow, use Effect-returning decode/encode so `ParseError`
and Schema requirements remain in `E`/`R`. Outside Effect, sync/Either/Promise
forms MAY be used when the throw/error contract is explicit and tested.

`Schema.parseJson` is a bidirectional Schema transformation, not a direct
replacement call:

```ts
const PayloadJson = Schema.parseJson(Payload);
const decoded = Schema.decodeUnknown(PayloadJson)(jsonText);
const encoded = Schema.encode(PayloadJson)(domainValue);
```

Choose excess-property behavior per boundary. Effect 3.22.1 strips excess
object keys by default; use `{ onExcessProperty: "error" }` or `"preserve"`
deliberately. Define optional versus nullable, missing versus defaulted, and
encoded versus transformed fields explicitly.

Raw ParseError trees can contain input values. Project them to safe field/code
information for users and keep redacted structured detail internally. Decide
whether an encode failure is a typed boundary failure or an invariant defect.
Property-based tests are useful only when generated values prove a meaningful
invariant. Construct reusable complex schemas/decoders once rather than in hot
loops. Schema annotations, JSON Schema, and Standard Schema outputs MAY make
machine-readable contracts more discoverable.

## 12. Configuration and secrets

Use Effect `Config` inside Effect application construction. The default is to
load and validate once while building the application layer; dynamic refresh
requires an explicit service contract.

```ts
const RawSettings = Config.all({
  baseUrl: Config.url('BASE_URL'),
  port: Config.integer('PORT').pipe(Config.withDefault(8080)),
  requestTimeout: Config.duration('REQUEST_TIMEOUT').pipe(Config.withDefault(Duration.seconds(2))),
  region: Config.option(Config.string('REGION')),
  token: Config.redacted('TOKEN'),
}).pipe(Config.nested('APP'));

interface SettingsService {
  readonly value: Config.Config.Success<typeof RawSettings>;
}

class Settings extends Context.Tag('@acme/app/Settings')<Settings, SettingsService>() {}

const SettingsLive = Layer.effect(Settings, RawSettings.pipe(Effect.map((value) => ({ value }))));
```

**EFF-021 — MUST** represent secrets with `Config.redacted`/`Redacted` and keep
`Redacted.value` inside the smallest provider adapter. Do not put secrets in
errors, logs, traces, metrics, snapshots, object inspection, Schema parse
details, or provider-response dumps.

Tests SHOULD use `ConfigProvider.fromMap` with
`Effect.withConfigProvider(provider)` or `Layer.setConfigProvider(provider)`.
Direct environment access is allowed in a narrow non-Effect bootstrap/tooling
adapter; inside Effect application code, use `Config`.

## 13. Observability and safe error projection

**EFF-022 — MUST** propagate, transform, count, or observe every failure at the
boundary that owns handling it. Propagating layers attach redaction-safe typed
context and do not log the same failure. The handling boundary records it once
and maps it exhaustively to:

- public message/code and HTTP/RPC status when applicable;
- retryability or outcome-unknown semantics;
- stable low-cardinality telemetry attributes; and
- separately redacted restricted diagnostic detail.

Expected domain rejection is normally debug/info or no log; transient attempts
are metrics/events, not per-attempt errors; exhausted retry, startup, and
shutdown failures are warning/error by operational impact; cancellation is not
an error by default; defects are error/fatal at the owning boundary.

Use stable named `Effect.fn` operations and `Effect.withSpan` only where the
trace boundary is useful. Do not put IDs, prompts, raw URLs/query strings,
errors, SQL, payloads, headers, secrets, or PII in span names or metric labels.
Correlation IDs may be log/span annotations when they are sanitized and not
metric dimensions.

OpenTelemetry dependencies are an optional production overlay. The core
baseline requires correct naming/projection and deterministic captured log
tests only where logging is a contract.

## 14. Testing and deterministic semantic contracts

**EFF-023 — MUST** assert the exact property protected by a boundary test:
tagged failure/ParseError fields, absence of defects/interruption when typed
failure is expected, AbortSignal or unregister behavior, attempt count,
provider input, maximum concurrency, acquisition/release count, or full Cause
shape. `Exit.isFailure` alone is insufficient.

**EFF-024 — MUST** use deterministic synchronization before advancing virtual
time. Fork the workflow, use `Deferred`, latches, `Ref`, or a state probe to
prove it reached the attempt/sleep, then use `TestClock.adjust`. Real sleeps are
prohibited except a bounded isolated subprocess test whose subject is OS signal
or process behavior.

Keep boundary/workflow tests beside the code they protect and a small
upgrade-contract suite for cross-cutting Effect assumptions. Test documented
runtime behavior when correct application use depends on it; the compiler
proves types, not attempts, cancellation, finalizers, memoization, or Cause.

Use a complete explicit test service by default. `Layer.mock` is appropriate
when an unexpected call should defect. Call `make*` directly only when doing so
does not bypass the lifecycle/wiring property under test. Expensive shared
layers need an explicit test scope and reset/isolation policy.

New regression and semantic-contract tests SHOULD be observed failing under the
exact fault before the fix; record the fault in the change report and remove
mutation scaffolding. Intentionally invalid language-service fixtures stay
outside normal TypeScript compilation and assert diagnostic name, file/line,
and nonzero CLI exit.

## 15. Performance and security guardrails

**EFF-025 — MUST** define limits where untrusted input can consume resources:
body/stream size, pagination/count/depth, time, concurrency, queue capacity, and
retry amplification. Schema-valid URL syntax does not authorize a destination;
outbound URLs derived from input need a DNS/IP/redirect-aware SSRF policy.

For a fixed upstream set, require configured exact HTTPS origins, reject URL
credentials, and reject redirects. If an attacker can influence DNS or the
allowed host can resolve inside a protected network, validate every resolved
address at connection time and revalidate every permitted redirect, preferably
with network egress enforcement. A hostname string allowlist alone is not
DNS-rebinding protection.

Do not build layers/runtimes per render or ordinary request, create one Effect
per element in a hot pure loop, use unbounded queues/collections by convenience,
rebuild complex schema transformations repeatedly, or emit high-cardinality
telemetry. Benchmark before caching/batching and before replacing tracing with
`fnUntraced`.

Keep a logical mutation's idempotency key stable; distinguish retry, cache,
request deduplication, and batching because their consistency/failure
semantics differ. Enforce overload/rate limits so retries cannot amplify an
unhealthy dependency.

## 16. Runtime-specific overlays

### Bun CLI/server

This copied profile is a Bun application baseline. Long-running programs
**EFF-026 — MUST** use `BunRuntime.runMain` from
`@effect/platform-bun/BunRuntime` so SIGINT/SIGTERM
interrupt the main fiber and application layer resources can finalize.

```ts
const main = program.pipe(Effect.provide(AppLive));
BunRuntime.runMain(main);
```

Pinned 0.91.0 behavior installs signal handlers once `runMain` registration
completes, interrupts the main fiber, and exits 0 for pure interruption. A tiny
startup registration race still exists. The default runner reports
non-interruption Cause once; if an application supplies its own sole observer,
pass `{ disableErrorReporting: true }` to prevent duplicate reporting.

Short one-shot scripts MAY use another explicit scoped runtime edge when OS
signal integration is irrelevant. Server/request resources still use their
actual application/server/request scopes; do not build the application layer
per request.

Native Bun/Node APIs are allowed in small boundary adapters. The baseline does
not require unstable platform HTTP modules merely to avoid native `fetch`;
wrap native APIs behind a typed, signal-aware capability and test them.

`bunfig.toml` sets `[run] bun = true`, so scripts and `node` shebang
subprocesses run through Bun's PATH shim. If a pinned tool demonstrably requires
real Node, isolate and test the override in that runner using the platform path
delimiter. Do not add package-manager/runtime fallbacks to shared mise tasks.

### Browser or framework UI

Create one application-owned `ManagedRuntime` outside render from the
application layer. A lifecycle adapter calls
`runPromiseExit(effect, { signal })` or `runCallback`, observes the complete
Exit, guards framework state
publication, and disposes the runtime at application teardown. Never call the
default `Effect.runFork` from a component.

Classify operations by commit/ownership state:

| State                                      | Owner and cancellation                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| Not submitted/local                        | Component/request; cancel when owner ends                                 |
| Submitted, known not applied               | Caller may cancel/retry if classification permits                         |
| Commit ambiguous                           | Stop local waiting; return outcome unknown and reconcile; no unsafe retry |
| Must survive navigation, not process crash | Transfer to supervised application task service                           |
| Must survive process termination           | Durable queue/workflow                                                    |
| Invalid after identity/session change      | Session scope interrupts it                                               |

Cancellation and stale-result exclusion are separate. A generation/current
guard is appropriate when independent runs, concurrent rendering,
signal-ignorant callbacks, or completion races can publish stale state.
Framework loading state is changed only by the adapter while it still owns the
operation; Effect finalizers release Effect resources and must not mutate
unmounted component state.

Bundle size, React/React Native/SSR integration, native time/fetch/timers, and
framework-specific runtime adapters belong in the project overlay. Full Effect,
Micro, and platform packages have different bundle contracts; measure rather
than weakening the server profile.

### Published library

A library exports Effects/layers/schemas and never installs a global runtime or
process signal handler. Declare supported Effect versions deliberately (often a
peer/range) and test the minimum and selected latest supported versions; do not
copy the private-application exact dependency policy blindly.

A published library SHOULD use a library-specific tsconfig/module-resolution
and declaration-consumer test. Do not make Bun types or
`@effect/platform-bun` part of a browser/portable public API unless that is the
library's declared runtime. Native/platform integration belongs behind
consumer-provided capabilities.

### Optional production observability

Adopt the chosen OpenTelemetry/platform integration only in an application
overlay. Prove propagation at HTTP/RPC/provider boundaries and shutdown export
behavior. The core's projection, cardinality, ownership, and secret rules
remain mandatory.

## 17. Language-service diagnostics and suppressions

CI configures exact 0.87.1 correctness rules as `error` and runs the standalone
CLI without `--strict`; editor suggestions do not fail CI.
`--strict` only changes warning exit behavior and does not promote messages or
suggestions.

Do not enable the blanket `effect-native` preset. Outside-Effect native/global
rules are high-noise for pure TypeScript and adapters; `globalFetch` has no
prescribed platform replacement in this baseline. Inside-Effect time, random,
timer, and environment access has stable Effect replacements and is blocking.
Effect v4-only diagnostics remain off.

**EFF-027 — MUST** make a suppression the narrow
`@effect-diagnostics-next-line rule:off` form and include:

- why the operation is safe;
- the owning adapter/dependency and version; and
- the condition for removal.

Wildcard, section, and file-wide suppression require a runtime overlay owner.
Unused next-line suppressions are blocking. A configured diagnostic name may be
silently ignored when misspelled, so the expected-diagnostic harness is part of
the gate.

Never bulk-apply quick fixes. In 0.87.1, some fixes change typed failures to
defects, change layer topology/lifetime, or change Schema/runtime identifiers.
Apply one, inspect the semantic change, compile, and run the relevant contract
test.

TypeScript 7 and `@effect/tsgo` are a separate future migration. Do not mix
their configuration or Effect v4 APIs into this v3 profile.

## 18. Agent workflow and required verification

Use `mise run ...`; do not call Bun, package managers, TypeScript, test runners,
or Dagger directly.

During orientation:

1. read this file and the boundary/workflow tests;
2. run `mise run ts:effect:overview` to see exported services, layers, and
   errors; and
3. inspect the exact declarations/source under the installed lock before using
   a non-obvious Effect API.

Use the fast repair loop:

```sh
mise run ts:fmt:check
mise run ts:lint
mise run ts:type
mise run ts:effect:check
mise run ts:effect:diagnostics:check
mise run ts:test
mise run ts:audit
mise run ts:standards:check
```

Run `mise run ts:standards` for the stable autofix order: ESLint fix, then final
format. Run `mise run ts:lock` after declared dependency changes and
`mise run ts:lock:check` before handoff. The generated `bun.lock` is committed
and mirrored.

A failure report names the invariant, file/operation, expected repair pattern,
local example/test, and narrow suppression procedure when the rule does not
apply.

## 19. Effect upgrade protocol

Version-specific evidence expires on upgrade. For any Effect, platform,
language-service, TypeScript, or Bun candidate:

1. update exact candidates and inspect peer compatibility;
2. read installed declarations, implementation, matching v3 tests, and
   changelogs before newer website/main examples;
3. enumerate added/removed/default-changed diagnostics and rerun the severity
   and quick-fix matrix;
4. run expected-diagnostic and semantic contract suites, including attempts,
   timeouts, cancellation, finalizers, layers, runtime disposal, concurrency,
   and process signals;
5. update canonical examples and every changed assumption;
6. regenerate the lock through mise;
7. run the full project gate.

Do not retain compatibility fallback code by default. Change the baseline when
evidence changes, and label v4 migration notes separately.

## 20. Decision tables, layouts, and canonical example

Canonical layouts are intentionally different:

```text
small-cli/                 long-running-bun/
  src/main.ts                src/main.ts
  src/program.ts             src/app-layer.ts
                             src/features/...

framework-app/             published-library/
  src/effect/runtime.ts      src/index.ts
  src/features/...           src/services/...
  src/framework-adapters/    tests/consumer/...
```

The copied endpoint-checker example is deliberately narrow:

- `src/endpoint-checker.ts` demonstrates unknown Schema input, a stable public
  error algebra, bounded input and destination authorization, a signal-aware
  native adapter, an explicit service/tag/live layer, per-attempt timeout inside
  narrowly classified duplicate-safe retry, a total deadline, bounded
  concurrency, wire encoding, and safe error projection;
- `src/main.ts` demonstrates the Bun runtime edge;
- `tests/endpoint-checker.test.ts` proves the boundary rather than merely
  checking returned values;
- fixture-owned contract tests pin runtime, resource, retry, cancellation,
  layer, concurrency, diagnostic, and shutdown semantics without bloating a
  downstream seed.

Do not copy an abstraction from the example unless it protects the same
operational property.

### MUST enforcement map

`Manual` means the invariant is explicitly prose-only and must be reviewed; no
standard should pretend otherwise.

| ID      | Rationale / compliant and prohibited reference       | Compiler | Effect LS                                      | ESLint               | Unit/semantic/integration                                                    | Exception                                     | Manual |
| ------- | ---------------------------------------------------- | -------- | ---------------------------------------------- | -------------------- | ---------------------------------------------------------------------------- | --------------------------------------------- | ------ |
| EFF-001 | Adoption table; plain subtotal vs ceremonial wrapper | Partial  | `unnecessaryEffectGen` advisory                | —                    | Canonical pure function                                                      | Operational benefit documented                | Yes    |
| EFF-002 | Unknown narrowing; no erased channels                | Yes      | `anyUnknownInErrorContext`                     | `no-explicit-any`    | Negative diagnostics                                                         | Untyped adapter, one line                     | Yes    |
| EFF-003 | Accurate `A/E/R`; no assertion/orDie silencing       | Yes      | missing channel, unsafe assertion              | —                    | Exact typed-error tests                                                      | Documented invariant/startup defect           | Yes    |
| EFF-004 | Constructor table; no eager I/O/promise in `sync`    | Partial  | `lazyPromiseInEffectSync`, nested Effect rules | no-floating-promises | Laziness/adapter tests                                                       | Promise intentionally data, suppressed/tested | Yes    |
| EFF-005 | Preserve failure/defect/interruption                 | Partial  | Cause anti-pattern diagnostics                 | —                    | Exact Exit/Cause tests                                                       | Outer observer preserving Cause               | Yes    |
| EFF-006 | No serializable raw provider cause                   | Partial  | —                                              | —                    | Safe projection test; adopter serialization test required                    | Restricted redacted non-protocol detail       | Yes    |
| EFF-007 | Unique deterministic service identity                | Partial  | service diagnostics                            | —                    | Duplicate-key contract probe                                                 | None within one process                       | Yes    |
| EFF-008 | No generic runtime tag identity                      | Partial  | `genericEffectServices`                        | —                    | Negative diagnostic                                                          | Explicit concrete tag                         | Yes    |
| EFF-009 | Scoped construction owns release                     | Partial  | `scopeInLayerEffect`                           | —                    | Finalizer/lifetime tests                                                     | External Scope with suppression               | Yes    |
| EFF-010 | Correct graph and no accidental hot-path roots       | Partial  | layer merge/multiple provide                   | —                    | Acquisition-count tests                                                      | Deliberate request lifetime                   | Yes    |
| EFF-011 | Named runtime edge, observed result/disposal         | Partial  | `runEffectInsideEffect`                        | no-floating-promises | Runtime/disposal tests                                                       | Named adapter contract                        | Yes    |
| EFF-012 | Underlying cancellation contract                     | —        | —                                              | —                    | Adapter cancellation tests                                                   | Signal-ignorant behavior documented/tested    | Yes    |
| EFF-013 | Explicit attempt/total budgets                       | —        | —                                              | —                    | TestClock ordering/budget tests                                              | Long-lived policy table                       | Yes    |
| EFF-014 | One owner, smallest duplicate-safe retry             | —        | —                                              | —                    | Attempt/classification tests                                                 | None; change operation contract               | Yes    |
| EFF-015 | Stable logical-operation idempotency key             | Partial  | —                                              | —                    | Not in core; mutation adapter integration test required                      | Proven commutative/idempotent operation       | Yes    |
| EFF-016 | Fork owner/observer/shutdown                         | Partial  | —                                              | —                    | Parent/detached probes; task-service adopter test required                   | Reviewed process daemon                       | Yes    |
| EFF-017 | Bounded concurrency/capacity                         | Partial  | —                                              | —                    | Maximum-concurrency test; queue backpressure adopter test required           | Proven finite/resource bound                  | Yes    |
| EFF-018 | Shortest resource scope and paired release           | Partial  | `scopeInLayerEffect`                           | —                    | Success/failure/interruption release tests                                   | Caller-owned Scope remains explicit           | Yes    |
| EFF-019 | Shutdown policy for blocking close                   | —        | —                                              | —                    | Slow/failing finalizer and signal probes; close-budget adopter test required | Explicit best-effort policy                   | Yes    |
| EFF-020 | Decode unknown and encode public wire                | Yes      | Schema diagnostics                             | —                    | ParseError/encode tests                                                      | Trusted internal value                        | Yes    |
| EFF-021 | Redacted configuration secrets                       | Partial  | `processEnvInEffect`                           | —                    | Config/redaction tests                                                       | Narrow bootstrap adapter                      | Yes    |
| EFF-022 | One observation owner and safe projection            | Partial  | —                                              | —                    | Captured logger/projection tests                                             | Expected outcome intentionally unlogged       | Yes    |
| EFF-023 | Exact behavioral assertions                          | —        | —                                              | —                    | Required boundary suite                                                      | None for claimed contract                     | Yes    |
| EFF-024 | Deterministic timing synchronization                 | —        | —                                              | —                    | TestClock tests                                                              | Bounded OS-signal subprocess                  | Yes    |
| EFF-025 | Resource/security limits and SSRF authorization      | Partial  | —                                              | —                    | Count/origin/redirect tests; DNS/IP integration required                     | Explicit trusted finite source                | Yes    |
| EFF-026 | Bun signal-aware entrypoint and owned shutdown       | Partial  | —                                              | —                    | SIGTERM subprocess contract                                                  | Short-lived CLI where signals are irrelevant  | Yes    |
| EFF-027 | Narrow, owned, expiring diagnostic suppressions      | —        | Stale next-line suppression error              | —                    | Expected-diagnostic fixture                                                  | Generated/fixture overlay owner               | Yes    |

All examples below apply to the exact versions at the top of this file unless
an overlay says otherwise. They complement each rule's rationale and the
exception/enforcement columns above.

| ID      | Compliant minimum                                                   | Prohibited shape                                                   |
| ------- | ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| EFF-001 | `const total = prices.reduce(add, 0)`                               | `Effect.sync(() => pureTotal(prices))`                             |
| EFF-002 | `Schema.decodeUnknown(Input)(foreign)`                              | `foreign as any`                                                   |
| EFF-003 | `Effect.Effect<Order, SaveError, Store>`                            | asserting `Effect.Effect<Order>` to erase channels                 |
| EFF-004 | `Effect.sync(() => readCache())`                                    | `Effect.succeed(readCache())` or `Effect.sync(() => promise)`      |
| EFF-005 | `catchTag` for expected failure; inspect `Exit` at the owner        | catch all Cause and return one generic typed error                 |
| EFF-006 | stable redacted public fields plus a safe projection                | enumerable raw SDK error, headers, payload, or SQL in public error |
| EFF-007 | `Context.Tag("project-name/Mailer")`                                | two capabilities using `"Mailer"` by accident                      |
| EFF-008 | non-generic tag with a generic method                               | `class Cache<A>` as runtime identity                               |
| EFF-009 | `Layer.scoped(Tag, acquireRelease(...))`                            | `Layer.effect(Tag, acquireRelease(...))`                           |
| EFF-010 | build one deliberate feature/application/request root               | construct a runtime or resource layer inside a hot handler         |
| EFF-011 | `BunRuntime.runMain(program)` at the entrypoint                     | `runPromise` inside a service method                               |
| EFF-012 | `Effect.tryPromise((signal) => sdk({ signal }))` with an abort test | claim cancellation while ignoring the supplied signal              |
| EFF-013 | attempt timeout, retry schedule, then total deadline                | infer total latency from timeout multiplied by attempts            |
| EFF-014 | one retry owner around the smallest duplicate-safe call             | SDK, service, workflow, and UI all retrying                        |
| EFF-015 | reuse one idempotency key for every logical-operation attempt       | generate a new key on each retry                                   |
| EFF-016 | `forkScoped` or a supervised application task service               | unobserved `forkDaemon` for request work                           |
| EFF-017 | `forEach(items, work, { concurrency: 4 })` and a bounded queue      | unbounded concurrency/capacity by convenience                      |
| EFF-018 | acquire/use/release in the shortest owning Scope                    | return an open handle with an unwritten close obligation           |
| EFF-019 | owner-tested close policy that preserves critical cleanup           | `disconnect` cleanup so shutdown merely appears bounded            |
| EFF-020 | decode unknown input and Schema-encode protocol output              | cast parsed JSON to the encoded type                               |
| EFF-021 | `Config.redacted("TOKEN")` and redaction tests                      | plain string secret in logs/snapshots                              |
| EFF-022 | contextualize below and observe once at the handling owner          | log the same propagating Cause in every layer                      |
| EFF-023 | assert tag, fields, defects/interruption, attempts, and release     | assert only `Exit.isFailure(exit)`                                 |
| EFF-024 | wait on `Deferred`, then adjust `TestClock`                         | advance before work sleeps or use real sleeps                      |
| EFF-025 | count limit, exact HTTPS origins, redirect rejection, DNS/IP policy | pass any decoded `Schema.URL` directly to `fetch`                  |
| EFF-026 | `BunRuntime.runMain(main)` for a long-running Bun process           | bare `runPromise(main)` with no signal shutdown                    |
| EFF-027 | one reasoned next-line suppression with owner/removal version       | wildcard, section, or file disable by convenience                  |

## Bun as the script runtime

The Bun overlay above owns the `[run] bun = true` behavior. A Node-only tool
override remains local to its runner and must preserve the original PATH,
remove only the verified Bun shim entry using the platform delimiter, fail
actionably when Node is absent, and carry a comment explaining the pinned tool
constraint.
