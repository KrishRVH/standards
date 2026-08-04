# TypeScript, Effect v3, and Bun agent guide

This fragment is tested with `effect` 3.22.1, `@effect/platform` 0.97.1,
`@effect/platform-bun` 0.91.0, `@effect/language-service` 0.87.1,
TypeScript 6.0.3, and Bun 1.3.14. Only those pinned declarations, sources, and
behaviors are evidence for this profile; do not add unpinned APIs or silently
upgrade the lock.

The formal mandatory rules, exceptions, exact-version scope, and enforcement
status have one normative owner: [the enforcement map](docs/effect/enforcement.md).
The tables below are a quick index, not a second rule source. In this profile:

- **MUST** protects correctness, security, ownership, or a deliberate
  architecture constraint whose violation materially increases agent ambiguity
  and maintenance risk. Exceptions name an owner and reason, stay narrow, and
  add a semantic test when behavior is involved.
- **SHOULD** is the copyable default. Depart when local evidence makes another
  choice clearer or safer, and record the decision near the boundary.
- **MAY** is optional.
- **PROJECT PREFERENCE** labels a legibility choice rather than an Effect law.

Keep total calculations plain TypeScript. Use Effect for typed operational
failure, dependencies, time, interruption, concurrency, and resource lifetime.
Use Schema at untrusted and protocol boundaries, not for every internal type.

## Read before changing a boundary

- Pure functions or Effect function shape: [adoption and functions](docs/effect/adoption-and-functions.md).
- Errors, Cause, public HTTP/client errors, or failure projection:
  [errors, Cause, and projection](docs/effect/errors-cause-and-projection.md).
- A service, layer, runtime, or runtime-owned task:
  [services, layers, and runtime](docs/effect/services-layers-and-runtime.md).
- An async adapter, timeout, deadline, retry, or cancellation policy:
  [time, retry, and cancellation](docs/effect/time-retry-and-cancellation.md).
- A fork, batch, queue, scoped resource, finalizer, or concurrency limit:
  [concurrency and resources](docs/effect/concurrency-and-resources.md).
- A Schema, configuration value, secret, URL, or destination policy:
  [Schema, config, and security](docs/effect/schema-config-and-security.md).
- A test involving time, interruption, retry, finalization, diagnostics, or a
  negative type contract: [testing and diagnostics](docs/effect/testing-and-diagnostics.md).
- A long-running Bun process, HTTP route, native fetch, redirect, or request
  body stream: [Bun server overlay](docs/effect/overlays/bun-server.md).
- A browser/component runtime or result-publication controller:
  [framework UI overlay](docs/effect/overlays/framework-ui.md).
- A published package: [published-library overlay](docs/effect/overlays/published-library.md).
- Telemetry export or production logging:
  [production-observability overlay](docs/effect/overlays/production-observability.md).

## Decision 1: value model

| Need                                                                 | Use                 |
| -------------------------------------------------------------------- | ------------------- |
| Total synchronous calculation                                        | Plain TypeScript    |
| Optional/validation result consumed as data                          | `Option` / `Either` |
| Operational failure, dependency, interruption, concurrency, lifetime | `Effect`            |
| Async values with pull, backpressure, or stream lifetime             | `Stream`            |

## Decision 2: Effect function shape

| Situation                                        | Use                                |
| ------------------------------------------------ | ---------------------------------- |
| Local multi-step orchestration                   | `Effect.gen`                       |
| Named service/workflow boundary useful in traces | `Effect.fn("package.operation")`   |
| Short transformation                             | `pipe` and combinators             |
| Measured hot path where tracing is too costly    | `Effect.fnUntraced`, with evidence |

## Decision 3: service declaration

| Form                                               | Use                                                                      |
| -------------------------------------------------- | ------------------------------------------------------------------------ |
| Interface + namespaced `Context.Tag` + named layer | Default legible separation (**PROJECT PREFERENCE**)                      |
| `Effect.Tag`                                       | Stable v3 proxy accessors reduce useful boilerplate                      |
| `Effect.Service`                                   | Only after accepting its experimental 3.22.1 status and bundled concerns |

## Decision 4: layer constructor

| Construction                            | Use             |
| --------------------------------------- | --------------- |
| Service value already exists            | `Layer.succeed` |
| Effect builds service; no owned release | `Layer.effect`  |
| Layer owns acquisition and release      | `Layer.scoped`  |

## Decision 5: failure class

| Event                                  | Model                   |
| -------------------------------------- | ----------------------- |
| Expected recoverable operation outcome | Tagged `E`              |
| Violated invariant/programmer failure  | Defect in `Cause`       |
| Cancellation or owner shutdown         | Interruption in `Cause` |

## Decision 6: tagged error form

| Error boundary                              | Use                  |
| ------------------------------------------- | -------------------- |
| Runtime-only internal algebra               | `Data.TaggedError`   |
| Serialized, persisted, RPC, or wire algebra | `Schema.TaggedError` |

## Decision 7: error projection

| Representation             | Contains                                               |
| -------------------------- | ------------------------------------------------------ |
| Internal operational error | Recovery-relevant, redaction-safe fields               |
| Public wire/user error     | Stable code, caller action, status; no provider detail |
| Safe telemetry diagnostic  | Allowlisted low-cardinality kind and safe context      |

## Decision 8: time budget

| Budget                | Placement                                             |
| --------------------- | ----------------------------------------------------- |
| One attempt           | Timeout around the smallest duplicate-safe attempt    |
| Whole caller workflow | Deadline outside retry, delays, queues, and body work |

## Decision 9: repeat policy

| State                                     | Action                        |
| ----------------------------------------- | ----------------------------- |
| Explicit duplicate-safe transient failure | Retry within one owning layer |
| Permanent rejection or prohibited repeat  | Do not retry                  |
| Commit outcome ambiguous                  | Reconcile first               |

## Decision 10: work lifetime

| Lifetime                                  | Owner                         |
| ----------------------------------------- | ----------------------------- |
| Invalid when component/request ends       | Component/request operation   |
| Survives navigation, not runtime disposal | Supervised application task   |
| Survives process termination              | Durable external job/workflow |

## Decision 11: fork API

| Need                              | Use                                     |
| --------------------------------- | --------------------------------------- |
| Child tied to parent fiber        | `Effect.fork`                           |
| Child tied to current `Scope`     | `Effect.forkScoped`                     |
| Application-owned background work | Scoped task service, such as `FiberSet` |

## Decision 12: parallel batch

| Contract                                 | Pattern                                      |
| ---------------------------------------- | -------------------------------------------- |
| First failure interrupts siblings        | Default concurrent collection                |
| Run all and retain each expected outcome | `mode: "either"` or explicit materialization |
| Accumulate validation failures           | `mode: "validate"`                           |

## Decision 13: promise cancellation

| Adapter         | Contract                                                          |
| --------------- | ----------------------------------------------------------------- |
| Signal-aware    | Forward `tryPromise`'s signal and test underlying abort           |
| Signal-ignorant | Document continuing work and revoke result publication separately |

## Decision 14: runtime owner

| Host                          | Runtime edge                                                 |
| ----------------------------- | ------------------------------------------------------------ |
| Long-running Bun process      | `@effect/platform-bun/BunRuntime.runMain`                    |
| Framework/browser application | One application-owned `ManagedRuntime`, disposed at teardown |

## Decision 15: platform boundary

| Need                                                 | Choice                             |
| ---------------------------------------------------- | ---------------------------------- |
| Small stable native Bun/Web API                      | Typed, signal-aware native adapter |
| Stable platform capability with useful lifecycle/API | Matching Effect platform package   |

## Decision 16: Schema execution

| Context                                            | Decode/encode form                                             |
| -------------------------------------------------- | -------------------------------------------------------------- |
| Outside Effect with explicit throw/Either contract | Sync or `Either` form                                          |
| Inside an Effect workflow                          | Effect-returning form preserving `ParseError` and requirements |

## Decision 17: HTTP projection

| Boundary                         | Contract                                           |
| -------------------------------- | -------------------------------------------------- |
| Route-local expected errors      | Exhaustively map to `Response`                     |
| Protected infrastructure wrapper | Accept `Effect<Response, never, R>`                |
| Unexpected defect/interruption   | Outer server/runtime boundary, never generic `503` |

## Agent workflow

Use `mise run ...`; do not call Bun, package managers, TypeScript, test runners,
or Dagger directly. Before using a non-obvious Effect API, inspect the exact
installed declaration/source and the routed local guide.

Run `mise run ts:effect:overview` during orientation. Use this repair loop:

```sh
mise run ts:fmt:check
mise run ts:lint
mise run ts:type
mise run ts:type-tests:check
mise run ts:effect:check
mise run ts:effect:diagnostics:check
mise run ts:test
mise run ts:audit
mise run ts:standards:check
```

Use `mise run ts:standards` for autofixes. Run `mise run ts:lock` only after a
declared dependency changes, and keep `bun.lock` exact and committed. Before
handoff, run the full `mise run standards:check` gate unless blocked; report
every skipped command and why.

Do not bulk-apply Effect quick fixes. Inspect each semantic change, compile, and
run the boundary contract. A failure report names the violated invariant,
operation, local rule, repair pattern, and narrow exception process.
