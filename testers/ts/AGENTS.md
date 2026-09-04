# TypeScript, Effect v3, and Bun agent guide

Use this fragment with the project's shared agent guide. `package.json`,
`bun.lock`, and the mise tasks own the tested versions and commands. Inspect
the exact installed declaration/source before using a non-obvious Effect API.
Read [the upgrade workflow](README.md#pinned-baseline-not-a-freeze) when changing
dependencies; update the diagnostic inventory when the language service changes.

The [enforcement map](docs/effect/enforcement.md) owns mandatory rules, narrow
exceptions, version scope, and the distinction between executable checks and
manual review. **MUST** is a contract; **SHOULD** is the default unless local
evidence supports a clearer or safer choice; **MAY** is optional. **PROJECT
PREFERENCE** identifies a local design choice.

## Work and verification

Use `mise run ...` for development. Run `mise run ts:effect:overview` when
orienting to services, layers, and errors. Select checks for the change:

| Change                         | First checks                                     |
| ------------------------------ | ------------------------------------------------ |
| Source or tests                | `ts:lint`, `ts:type`, `ts:test`                  |
| Effect contract                | `ts:effect:check`, `ts:type-tests:check`         |
| Language-service configuration | `ts:effect:diagnostics:check`                    |
| Dependencies or exports        | `ts:audit`, `ts:knip`                            |
| Formatting                     | `ts:fmt:check`; `ts:standards` applies autofixes |

`mise run ts:preflight` runs all non-mutation checks. Use
`mise run ts:mutants:diff` for incremental feedback. Before handoff, run the
project's aggregate `mise run standards:check`, which includes
`ts:standards:check`; report skipped checks and their reasons.
Run `mise run ts:lock` after changing declared dependencies and commit the lock.
Select one lint/format workflow; the [secondary workflow](README.md#tooling-choices)
has its own repair tasks.

## Read when changing a boundary

| Boundary                                                 | Guide                                                                        |
| -------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Pure calculation or Effect function                      | [Adoption and functions](docs/effect/adoption-and-functions.md)              |
| Domain type, variant, brand, or assertion                | [Type discipline](docs/effect/type-discipline.md)                            |
| Error, Cause, HTTP/client response, or projection        | [Errors, Cause, and projection](docs/effect/errors-cause-and-projection.md)  |
| Service, layer, runtime, or application task             | [Services, layers, and runtime](docs/effect/services-layers-and-runtime.md)  |
| Async adapter, timeout, deadline, retry, or cancellation | [Time, retry, and cancellation](docs/effect/time-retry-and-cancellation.md)  |
| Fork, batch, queue, resource, or finalizer               | [Concurrency and resources](docs/effect/concurrency-and-resources.md)        |
| Schema, config, secret, URL, or destination policy       | [Schema, config, and security](docs/effect/schema-config-and-security.md)    |
| Time, interruption, resource, or negative-contract test  | [Testing and diagnostics](docs/effect/testing-and-diagnostics.md)            |
| Bun process, HTTP route, fetch, redirect, or body stream | [Bun server](docs/effect/overlays/bun-server.md)                             |
| Component runtime or result publication                  | [Framework UI](docs/effect/overlays/framework-ui.md)                         |
| Published package                                        | [Published library](docs/effect/overlays/published-library.md)               |
| Telemetry export or production logging                   | [Production observability](docs/effect/overlays/production-observability.md) |

## Design defaults

Keep total synchronous calculations plain TypeScript. Use `Option`/`Either`
for absence or validation as data; use Effect for operational failure,
dependencies, time, interruption, concurrency, and resource lifetime. Use
Schema at untrusted and protocol boundaries.

Use `Effect.gen` for local orchestration, `Effect.fn("package.operation")` for
a useful named trace boundary, and combinators for short transformations.
Prefer an interface, namespaced `Context.Tag`, and named layer when declaring
a service. Choose `Layer.succeed`, `Layer.effect`, or `Layer.scoped` according
to construction and release ownership.

State belongs to a service, layer, or root model. Keep module bindings
immutable; pass ambient capabilities through owned boundaries. Source uses
`.cts`, `.mts`, `.ts`, or `.tsx` so type, lint, Effect, knip, and mutation checks
cover the same files. Local lint rules catch common ambient-state forms;
review aliases and indirection that exceed their documented analysis.

## Exceptions and evidence

- Lint exceptions use `// eslint-disable-next-line <rule> -- <reason>`.
  Type exceptions use `// @ts-expect-error -- <reason>`. The independent
  directive check enforces the forms; the relevant analyzer rejects stale
  exceptions. A reason names the invariant and why restructuring loses.
- Read [testing and diagnostics](docs/effect/testing-and-diagnostics.md) before
  adding Effect suppressions or changing a diagnostic. Inspect each quick fix
  and verify its semantics.
- A behavior change needs a test that fails without it. Trust boundaries get
  properties imported from `fast-check` directly; preserve discovered
  counterexamples as deterministic example tests.
- A surviving mutant needs a test that kills it, removal of unreachable code,
  or a reasoned `// Stryker disable next-line all: <reason>` classification.
  Classification and weakened gates require human approval; raising the
  measured floor is normal work. Carry survivors, classifications with source
  reasons, and timeouts into the handoff. Read [mutation operation and recovery](README.md#developer-api)
  before changing mutation settings or clearing a stale lock.

## Review and handoff

For a non-trivial change, obtain an independent read-only review of the tests,
changed code, and affected contracts. Use additional focused reviewers when
the risk or breadth warrants them. Challenge material findings with source
evidence or a regression test; record unresolved design questions explicitly.

Review enforcement changes for lost coverage and justify every relaxation.
Report the checked revision, behavior proved, commands run, and remaining
findings. Recheck affected evidence after further edits. Bots advise, gates
block, and humans merge.
