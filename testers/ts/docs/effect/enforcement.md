# Effect v3 enforcement map

This is the single normative owner for the TypeScript/Effect mandatory rules.
The [agent guide](../../AGENTS.md) is a compact decision and routing index; the
other Effect documents provide rationale and examples without restating these
rules. Stable IDs are never reused.

Rule levels and the exception process are defined in the agent guide. In the
entries below, **TS** means TypeScript, **LS** the pinned Effect language
service, **Neg** an isolated negative fixture, **Sem** a deterministic semantic
test, and **Int** an integration test. `Partial` is not presented as complete
enforcement. `Manual` names the remaining prose-only review obligation; each
row flags it explicitly and it is never claimed as mechanical enforcement.

## Coverage summary

This profile defines 29 mandatory rules. Twenty-five have at least one static
compiler, language-service, linter, or negative-fixture check; 28 have an
executable unit, semantic, integration, or diagnostic contract. EFF-001 remains
the only wholly non-blocking rule: the language service can advise against some
ceremonial Effect use, but selective adoption is ultimately an architecture
review. Every row also names its narrower manual remainder; most mechanical
checks prove a local shape and cannot establish cross-service ownership,
provider guarantees, production DNS/connect-time policy, diagnostic vocabulary,
or repository-host branch protection.

## EFF-001 — Selective Effect adoption

- **Rule — MUST:** Keep total, synchronous, dependency-free calculations plain
  TypeScript. Do not add Effect, Schema, a service, or a layer for uniformity.
- **Rationale:** **PROJECT PREFERENCE.** Ceremonial operational structure makes
  generated code harder to navigate without adding a failure or lifetime
  contract.
- **Minimum / prohibited:** A pure function and trusted internal type / an
  `Effect.sync`, service, or Schema wrapper with no operational benefit.
- **Exception:** Document the concrete operational capability the wrapper adds.
- **Enforcement:** TS partial; LS advisory; ESLint —; Biome —; Neg —; Unit —;
  Sem —; Int —; CI —; Manual yes.
- **Version:** Project architecture rule; not Effect-version-specific.

## EFF-002 — Precise application channels

- **Rule — MUST:** Receive foreign data as `unknown`, narrow it at its adapter,
  keep `A`, `E`, and `R` accurate, and keep `any` out of application channels.
- **Rationale:** Erased channels hide failure and dependency obligations from
  both the compiler and an autonomous caller.
- **Minimum / prohibited:** Decode or narrow `unknown` / casts to `any` or a
  narrowed Effect type that erases `E` or `R`.
- **Exception:** One line in an adapter for a named untyped dependency, with an
  owner and removal condition.
- **Enforcement:** TS blocking; LS blocking; ESLint blocking; Biome blocking;
  Neg diagnostic fixture; Unit partial; Sem —; Int —; CI yes; Manual residual.
- **Version:** TS 6.0.3, LS 0.87.1, Biome 2.5.5.

## EFF-003 — Accurate exported Effect contracts

- **Rule — MUST:** Export the real `Effect<A, E, R>` contract. Expected
  recoverable failures remain in `E`; required capabilities remain in `R`;
  defects and interruption do not become expected failures.
- **Rationale:** The signature is the discoverable recovery and provisioning
  contract.
- **Minimum / prohibited:** Inferred or explicit complete channels / assertions,
  hidden provisioning, or `orDie` used only to satisfy a narrower signature.
- **Exception:** A documented impossible invariant or explicit startup-defect
  policy with a test.
- **Enforcement:** TS blocking; LS blocking; ESLint —; Biome —; Neg diagnostic
  fixture; Unit typed exits; Sem partial; Int —; CI yes; Manual residual.
- **Version:** Effect 3.22.1, LS 0.87.1, TS 6.0.3.

## EFF-004 — Lazy side effects

- **Rule — MUST:** Construct side effects lazily and use the constructor that
  represents its throw/rejection contract. Never return a Promise from
  `Effect.sync`.
- **Rationale:** Eager or nested work escapes interruption, retry, and runtime
  ownership.
- **Minimum / prohibited:** `tryPromise({ try: signal => ... })` or a suitable
  lazy constructor / `Effect.succeed(io())` or `Effect.sync(() => promise)`.
- **Exception:** A Promise intentionally treated as inert data, narrowly
  suppressed and tested.
- **Enforcement:** TS partial; LS blocking; ESLint floating-Promise check;
  Biome partial; Neg diagnostic fixture; Unit laziness test; Sem adapter test;
  Int —; CI yes; Manual residual.
- **Version:** Effect 3.22.1, LS 0.87.1.

## EFF-005 — Expected failure, defect, and interruption

- **Rule — MUST:** Preserve these three Cause classes. Recover only expected
  failures with typed operators; do not relabel interruption or defects as a
  provider/application error.
- **Rationale:** Recovery, retry, shutdown, and incident handling differ by
  Cause class.
- **Minimum / prohibited:** Tagged recovery and full `Exit` inspection at an
  owner / broad Cause catch returning one generic typed error.
- **Exception:** The outer sole observer may inspect full Cause when it
  preserves or rethrows unhandled defects and interruption.
- **Enforcement:** TS partial; LS partial; ESLint —; Biome —; Neg diagnostic
  fixture; Unit exact Cause tests; Sem finalizer/interruption tests; Int partial;
  CI yes; Manual residual.
- **Version:** Effect 3.22.1.

## EFF-006 — Separate error representations

- **Rule — MUST:** Keep the internal operational algebra, public wire/user
  projection, and safe telemetry diagnostic separate. Public fields and
  diagnostics are allowlisted and redaction-safe.
- **Rationale:** Recovery detail, caller action, and operational classification
  have different stability and secrecy contracts.
- **Minimum / prohibited:** Exhaustive projectors with stable public code and
  safe `failureKind` / raw SDK objects, messages, stacks, headers, SQL, payloads,
  URL details, prompts, credentials, or PII.
- **Exception:** Restricted technical detail may remain `unknown` outside the
  public protocol and is redacted before observation.
- **Enforcement:** TS exhaustive matches; LS —; ESLint partial; Biome partial;
  Neg partial; Unit projection/redaction; Sem captured logs; Int boundary test;
  CI yes; Manual vocabulary review.
- **Version:** Project contract; tagged forms use Effect 3.22.1.

## EFF-007 — Runtime and protocol identifier stability

- **Rule — MUST:** Namespace service/context identifiers and keep them
  deterministic and process-wide unique. Give externally observed protocol IDs
  an explicit compatibility policy. Private tags need local consistency, not
  permanent compatibility.
- **Rationale:** Runtime tag collisions alias capabilities; compatibility only
  follows observability.
- **Minimum / prohibited:** `@org/package/Capability` and stable wire
  discriminants / ambiguous service keys or accidental serialization of private
  tags.
- **Exception:** None for two distinct service identities in one process;
  internal identifiers may change when no external consumer observes them.
- **Enforcement:** TS partial; LS partial; ESLint —; Biome —; Neg —; Unit
  duplicate-key and wire tests; Sem context probe; Int consumer test; CI yes;
  Manual scope review.
- **Version:** Effect 3.22.1 Context behavior; compatibility is project-specific.

## EFF-008 — Non-generic runtime service identity

- **Rule — MUST:** Do not use erased type parameters as runtime service
  identity. Put generic operations on a non-generic capability or declare
  explicit concrete tags.
- **Rationale:** Runtime Context cannot distinguish erased type arguments.
- **Minimum / prohibited:** One stable tag with a generic method / `Tag<A>` used
  as distinct runtime identities.
- **Exception:** Explicit concrete identifiers and service types.
- **Enforcement:** TS partial; LS blocking; ESLint —; Biome —; Neg diagnostic
  fixture; Unit —; Sem —; Int —; CI yes; Manual residual.
- **Version:** Effect 3.22.1, LS 0.87.1.

## EFF-009 — Scoped layer construction

- **Rule — MUST:** Use `Layer.scoped` when layer construction owns a resource or
  requires `Scope`; use `Layer.effect` only when no owned release exists.
- **Rationale:** The constructor states and enforces resource lifetime.
- **Minimum / prohibited:** Scoped acquire/release tied to the layer / hiding a
  Scope requirement inside `Layer.effect`.
- **Exception:** An externally owned Scope with one owner, a lifetime test, and
  a narrow diagnostic suppression.
- **Enforcement:** TS partial; LS blocking; ESLint —; Biome —; Neg diagnostic
  fixture; Unit finalization; Sem lifecycle test; Int —; CI yes; Manual residual.
- **Version:** Effect 3.22.1, LS 0.87.1.

## EFF-010 — Deliberate layer and runtime roots

- **Rule — MUST:** Build feature/application/request roots deliberately. Do not
  create a long-lived layer or `ManagedRuntime` in a loop, render, or ordinary
  request, and do not use `Layer.mergeAll` to wire a dependency between siblings.
- **Rationale:** Accidental roots duplicate resources and break visible graph
  ownership.
- **Minimum / prohibited:** `provide`/`provideMerge` and one named owner / hot-path
  runtime construction or dependent siblings in `mergeAll`.
- **Exception:** A request/iteration that intentionally owns the complete
  acquire-use-release lifetime, with counts tested.
- **Enforcement:** TS partial; LS blocking for graph shapes; ESLint —; Biome —;
  Neg diagnostic fixture; Unit acquisition counts; Sem layer topology; Int —;
  CI yes; Manual hot-path review.
- **Version:** Effect 3.22.1, LS 0.87.1.

## EFF-011 — Named runtime edges

- **Rule — MUST:** Execute Effects only at a named host/runtime edge that states
  runtime/layer, operation owner, interruption source, full-Exit observer, host
  projection, and disposal.
- **Rationale:** Running an Effect transfers ownership to the host and must not
  be hidden in domain/service code.
- **Minimum / prohibited:** One explicit process/framework/test adapter / runners
  inside services or `void runtime.runPromise(...)` fire-and-forget.
- **Exception:** A test is a runtime edge; another adapter needs the same six
  ownership answers.
- **Enforcement:** TS partial; LS blocking; ESLint floating-Promise check; Biome
  partial; Neg diagnostic fixture; Unit adapter exits; Sem runtime disposal; Int
  host test; CI yes; Manual owner review.
- **Version:** Effect 3.22.1; Bun edge also uses platform-bun 0.91.0.

## EFF-012 — Async cancellation contracts

- **Rule — MUST:** Define and test what cancellation does for every async
  adapter. A signal-aware `tryPromise` callback accepts and forwards its supplied
  `AbortSignal`; a signal-ignorant adapter states that work may continue.
- **Rationale:** A timed-out caller does not prove transmission, body work, or
  remote commit stopped.
- **Minimum / prohibited:** Abort/unregister/iterator/stream/process behavior and
  race winner tested / claiming cancellation because the wrapper returned.
- **Exception:** Signal-ignorant work with an explicit continuing owner and
  independent publication guard.
- **Enforcement:** TS partial; LS —; ESLint —; Biome —; Neg —; Unit adapter
  tests; Sem interruption/continuation tests; Int native API test; CI yes; Manual
  remote-commit analysis.
- **Version:** Effect 3.22.1 and the pinned host API.

## EFF-013 — Attempt and workflow budgets

- **Rule — MUST:** Give bounded external work an explicit liveness budget. Put
  timeout inside retry for per-attempt time and total deadline outside retry,
  delays, queues, body processing, and finalizers.
- **Rationale:** Attempt timeout and caller deadline answer different questions.
- **Minimum / prohibited:** Smallest attempt → timeout → retry → total deadline /
  validating or planning from `timeout × attempts` folklore.
- **Exception:** Long-lived streams use connection, idle, heartbeat, and shutdown
  policies instead of a request deadline.
- **Enforcement:** TS —; LS —; ESLint —; Biome —; Neg —; Unit policy decode;
  Sem `TestClock` ordering/sleep tests; Int provider boundary; CI yes; Manual
  budget ownership.
- **Version:** Effect 3.22.1 timeout waits for loser termination/finalizers.

## EFF-014 — One retry owner

- **Rule — MUST:** Declare one automatic retry owner and wrap only the smallest
  explicitly classified duplicate-safe unit with bounded attempts.
- **Rationale:** Layered retries amplify load and ambiguous mutations can commit
  more than once.
- **Minimum / prohibited:** Operation-specific predicate and attempt limit / SDK,
  transport, service, workflow, and UI retrying the same logical operation.
- **Exception:** None without changing the operation contract; hedging is a
  separate concurrent-duplication policy.
- **Enforcement:** TS partial; LS —; ESLint —; Biome —; Neg —; Unit classifier;
  Sem exact attempts/non-retry/reconcile tests; Int provider test; CI yes; Manual
  cross-layer audit.
- **Version:** Effect 3.22.1: `{ times: n }` permits at most `n + 1` attempts.

## EFF-015 — Stable mutation idempotency identity

- **Rule — MUST:** When deduplication makes mutation retry safe, reuse one
  idempotency key for every attempt of the same logical operation. Return an
  outcome-unknown/reconcile result for ambiguous unsafe commits.
- **Rationale:** A new key per attempt defeats deduplication.
- **Minimum / prohibited:** Caller/logical-operation key outside retry / generate
  a key inside the attempted mutation.
- **Exception:** A proven naturally idempotent or commutative operation with no
  deduplication key requirement.
- **Enforcement:** TS partial; LS —; ESLint —; Biome —; Neg —; Unit adapter test;
  Sem mutation attempts; Int provider contract required; CI project-specific;
  Manual yes.
- **Version:** Project/provider contract, not Effect-version-specific.

## EFF-016 — Fiber and task ownership

- **Rule — MUST:** For every fork, name owner, failure observer, interruption
  trigger, resource scope, permission to outlive the caller, publication rights,
  and shutdown behavior. Ordinary application work is never an unobserved daemon.
- **Rationale:** Lifetime linkage does not automatically observe child failure,
  and `ManagedRuntime.runFork` alone is not a task supervisor.
- **Minimum / prohibited:** Scoped fork or supervised application task / raw
  component/request daemon or transferred work with no failure observer.
- **Exception:** Reviewed process-lifetime daemon with bounded cleanup and sole
  observer.
- **Enforcement:** TS partial; LS —; ESLint blocks `runFork` in component
  JSX/TSX; Biome partial; Neg —; Unit linter/controller; Sem task
  shutdown/failure/publication; Int framework lifecycle; CI yes; Manual owner
  review.
- **Version:** Effect 3.22.1 ManagedRuntime and FiberSet behavior.

## EFF-017 — Bounded concurrency and capacity

- **Rule — MUST:** Bound concurrency, endpoint/item count, queues, PubSub, and
  other attacker- or producer-controlled capacity by default; choose fail-fast
  or outcome collection deliberately.
- **Rationale:** Convenient unbounded work converts input volume and retries into
  overload.
- **Minimum / prohibited:** Numeric concurrency and bounded storage / `unbounded`
  or omitted limits without a proven finite producer/resource bound.
- **Exception:** Record the finite bound and resource analysis at the decision.
- **Enforcement:** TS partial; LS —; ESLint —; Biome —; Neg —; Unit limit decode;
  Sem maximum-concurrency/order/sibling tests; Int overload test; CI yes; Manual
  capacity review.
- **Version:** Effect 3.22.1 collection semantics.

## EFF-018 — Resource scope and release

- **Rule — MUST:** Acquire a resource in the shortest Scope that owns all uses,
  pair it with release, and keep a caller-owned `Scope` in `R` when that lifetime
  is the honest public contract.
- **Rationale:** Hidden or promoted lifetime creates leaks and action at a
  distance.
- **Minimum / prohibited:** `acquireRelease`, `acquireUseRelease`, or
  `Layer.scoped` at the owner / returning an open handle with an unwritten close
  obligation.
- **Exception:** A wider owner with an explicit lifecycle and count/finalizer
  tests.
- **Enforcement:** TS partial; LS blocking for common Scope leak; ESLint —; Biome
  —; Neg diagnostic fixture; Unit releases; Sem success/failure/interruption;
  Int host resource; CI yes; Manual lifetime review.
- **Version:** Effect 3.22.1 finalizer ordering and Cause behavior.

## EFF-019 — Shutdown policy for blocking close

- **Rule — MUST:** Give potentially blocking close operations a policy at their
  owner. Preserve critical cleanup as an awaited finalizer. Bound genuinely
  best-effort close work, or use an explicit zero-wait host-cancellation policy
  only when waiting can stall the owner; attach a redaction-safe rejection
  observer before returning.
- **Rationale:** Timeout outside a Scope waits for interruption and finalizers;
  silently detached cleanup abandons both ownership and failure observation.
- **Minimum / prohibited:** Tested awaited close budget, or a documented
  zero-wait cancellation with an attached fixed-diagnostic observer and an
  immediate release attempt / `void close().catch(() => undefined)`,
  `disconnect`, or daemon cleanup with no owner.
- **Exception:** A reviewed zero-wait release is allowed only when unfinished
  cleanup is safe, waiting can be unbounded, and rejection is still observed
  without replacing the primary Exit.
- **Enforcement:** TS —; LS —; ESLint —; Biome —; Neg —; Unit close policy;
  Sem slow/failing finalizer plus rejected/stalled body cancellation; Int
  process shutdown; CI yes; Manual criticality review.
- **Version:** Effect 3.22.1 timeout/finalizer semantics.

## EFF-020 — Schema trust and wire boundaries

- **Rule — MUST:** Decode `unknown` at trust boundaries and Schema-encode public
  wire output. Derive decoded/encoded types from one Schema and validate an
  external representation before any lossy normalization.
- **Rationale:** Casts and post-normalization validation can silently admit
  invalid protocol/config states.
- **Minimum / prohibited:** Effect-returning decode/encode in workflows and
  checked internal domain values / casting parsed JSON or retaining unchecked
  `DurationInput` in policy.
- **Exception:** Trusted internal values; sync/Either forms outside Effect when
  their throw/error contract is explicit and tested.
- **Enforcement:** TS blocking; LS blocking in workflows; ESLint partial; Biome
  partial; Neg diagnostic fixture; Unit ParseError/policy/encoding; Sem boundary
  tests; Int protocol test; CI yes; Manual schema-domain review.
- **Version:** Effect Schema 3.22.1, LS 0.87.1.

## EFF-021 — Secret containment

- **Rule — MUST:** Represent secrets with `Config.redacted`/`Redacted`, reveal
  them only in the smallest provider adapter, and exclude them from errors,
  logs, traces, metrics, snapshots, inspection, and parse details.
- **Rationale:** A typed secret is still exposed if copied into observable data.
- **Minimum / prohibited:** Redacted config and sentinel tests / plain secret
  strings in application state or diagnostics.
- **Exception:** Narrow non-Effect bootstrap/tooling adapter with no observable
  secret copy.
- **Enforcement:** TS partial; LS blocking for Effect environment access;
  ESLint partial; Biome partial; Neg diagnostic fixture; Unit redaction; Sem
  captured diagnostics; Int provider adapter; CI secret scan; Manual residual.
- **Version:** Effect 3.22.1 Config/Redacted; LS 0.87.1.

## EFF-022 — Exhaustive handling and one observer

- **Rule — MUST:** Every failure is propagated, transformed, counted, or
  observed by the boundary that owns handling it. Propagating layers add only
  safe context and do not repeatedly log. HTTP routes exhaustively project all
  expected errors before an infrastructure wrapper accepting
  `Effect<Response, never, R>`.
- **Rationale:** Residual typed failures otherwise become misleading generic
  `503`, while repeated observation duplicates incidents and can leak detail.
- **Minimum / prohibited:** One handling owner, exhaustive route/client match,
  separate public/telemetry projection, and a fixed safe cleanup diagnostic /
  broad `catchAll` infrastructure fallback, logging the same Cause at every
  layer, or swallowing cleanup rejection with an empty `catch`.
- **Exception:** Expected domain outcomes may intentionally be unlogged; the
  outer runtime owns defects and interruption. A best-effort cleanup observer
  may omit the raw error and receive only an allowlisted diagnostic.
- **Enforcement:** TS exhaustive switch; LS partial; ESLint switch check; Biome
  partial; Neg HTTP fixture; Unit status/projector; Sem
  log-count/interruption/cleanup observation; Int server boundary; CI yes;
  Manual severity/vocabulary.
- **Version:** Effect 3.22.1, TS 6.0.3; HTTP vocabulary is application-specific.

## EFF-023 — Exact boundary assertions

- **Rule — MUST:** A test asserts the exact semantic property claimed: tag and
  fields, absence/presence of defect or interruption, signal behavior, attempt
  count, provider input, concurrency, publication, release count, or Cause shape.
- **Rationale:** `Exit.isFailure` alone allows the wrong failure and ownership
  behavior to pass.
- **Minimum / prohibited:** Assert the protected contract and unsafe sentinels /
  only checking success/failure shape.
- **Exception:** None for an advertised behavior.
- **Enforcement:** TS partial; LS —; ESLint —; Biome —; Neg —; Unit review;
  Sem required; Int required where host behavior matters; CI runs tests; Manual
  assertion-quality review.
- **Version:** Test-quality rule; exact runtime claims use pinned versions.

## EFF-024 — Deterministic synchronization

- **Rule — MUST:** Before advancing virtual time, prove the tested fiber reached
  its attempt or sleep with `Deferred`, `Ref`, a latch, or a state probe. Avoid
  real sleeps.
- **Rationale:** Advancing `TestClock` too early creates tests that pass or hang
  by scheduler accident.
- **Minimum / prohibited:** Explicit readiness then `TestClock.adjust` / racey
  adjustment or wall-clock delay.
- **Exception:** A bounded isolated subprocess test whose subject is OS process
  signaling or real host timing.
- **Enforcement:** TS —; LS —; ESLint —; Biome —; Neg —; Unit —; Sem test pattern;
  Int subprocess exception; CI yes; Manual readiness review.
- **Version:** Effect 3.22.1 TestClock.

## EFF-025 — Untrusted resource and destination limits

- **Rule — MUST:** Bound body/stream size, counts, depth, time, concurrency,
  queue capacity, and retry amplification. Normalize and authorize exact HTTPS
  origins, reject credentials and redirects, and state that origin syntax alone
  is not DNS/connect-time SSRF protection.
- **Rationale:** Valid syntax is not authorization, and unbounded input consumes
  finite process/network resources.
- **Minimum / prohibited:** Canonical origin policy, pre-I/O authorization,
  running byte limit, reader cleanup, redirect rejection / arbitrary decoded URL
  passed to fetch or implicit stream ownership.
- **Exception:** Explicit trusted finite source with its bound recorded; DNS/IP
  checks may live in a production network adapter.
- **Enforcement:** TS partial; LS —; ESLint —; Biome —; Neg —; Unit Schema/limits;
  Sem redirect/body/concurrency; Int resolver/connect policy; CI core tests;
  Manual production SSRF review.
- **Version:** Bun 1.3.14 Web APIs and Effect 3.22.1 adapters.

## EFF-026 — Bun process runtime

- **Rule — MUST:** A long-running Bun process uses
  `@effect/platform-bun/BunRuntime.runMain` so SIGINT/SIGTERM interrupts the main
  fiber and application resources can finalize. One owner reports non-interrupt
  Cause.
- **Rationale:** A bare Promise runner does not own process signals or shutdown.
- **Minimum / prohibited:** Narrow BunRuntime import and application layer at
  main / bare `runPromise` or duplicate runtime error reporters.
- **Exception:** Short one-shot CLI where OS signal integration is irrelevant,
  using another explicit scoped runtime edge.
- **Enforcement:** TS partial; LS —; ESLint partial; Biome partial; Neg —; Unit —;
  Sem —; Int SIGTERM subprocess; CI yes; Manual entrypoint review.
- **Version:** `@effect/platform-bun` 0.91.0 with Effect 3.22.1, Bun 1.3.14.

## EFF-027 — Narrow diagnostic suppressions

- **Rule — MUST:** Use the narrow next-line Effect diagnostic suppression with
  safety reason, owning adapter/dependency and version, and removal condition.
  Do not bulk-apply quick fixes.
- **Rationale:** Misspelled or broad suppressions silently erase architectural
  checks; some pinned quick fixes change failure or lifetime semantics.
- **Minimum / prohibited:** One owned next-line suppression / wildcard, section,
  or file disable by convenience.
- **Exception:** Generated/fixture overlay with an explicit owner; unused
  suppressions remain blocking.
- **Enforcement:** TS —; LS blocking for stale next-line suppression; ESLint —;
  Biome —; Neg exact diagnostic fixture; Unit harness; Sem —; Int —; CI yes;
  Manual reason/quick-fix review.
- **Version:** LS 0.87.1; re-audit all names, severities, exits, and fixes on upgrade.

## EFF-028 — Exact Effect v3 dependency evidence

- **Rule — MUST:** Keep the committed frozen lock and pinned Effect v3, platform,
  language-service, TypeScript, and Bun versions authoritative. Do not import
  APIs from another generation or use an unpinned branch as evidence, and do not
  silently upgrade while changing a behavioral contract.
- **Rationale:** Exact declarations and runtime behavior are the profile's
  evidence; a mixed-version rule can compile differently or change ownership
  semantics.
- **Minimum / prohibited:** Inspect installed 3.22.1 declarations/source and run
  frozen installation plus lock checks / range drift, copying an API from an
  unpinned generation or branch, or an unrelated lock refresh.
- **Exception:** A separately scoped upgrade proposal updates the inventory,
  probes, diagnostics, locks, migration notes, and complete gate together.
- **Enforcement:** TS partial; LS exact dependency; ESLint —; Biome —; Neg exact
  fixture; Unit version probes; Sem exact-version suite; Int —; CI frozen install
  and lock/drift checks; Manual source hierarchy review.
- **Version:** Effect 3.22.1, platform 0.97.1, platform-bun 0.91.0, LS 0.87.1,
  TypeScript 6.0.3, Bun 1.3.14.

## EFF-029 — Automatic mandatory quality gate

- **Rule — MUST:** Commit a `quality` workflow that runs for pull requests,
  pushes to `main`, and manual dispatch; installs with locked/frozen inputs; and
  runs format, lint, TypeScript, Effect and expected diagnostics, deterministic
  tests, audit, lock/drift checks, and the repository aggregate applicable to
  the project.
- **Rationale:** A high-signal gate protects autonomous changes only when the
  repository runs it without relying on agent memory.
- **Minimum / prohibited:** Immutable action revisions, locked install, the
  `mise run standards:check` surface, and host-required `quality` status / a
  manual-only workflow, floating action tag, unlocked install, or cancellation
  of main-branch failures.
- **Exception:** Another CI provider may express the same event, locking, and
  required-check contract; unavailable audits follow an explicit documented
  availability policy rather than silently passing.
- **Enforcement:** TS —; LS —; ESLint —; Biome —; Neg —; Unit workflow parser;
  Sem event/command contract; Int hosted run; CI self-executes; Manual branch
  protection and required-status configuration.
- **Version:** Workflows pin checkout v7.0.1, mise-action v4.2.4, and the locally
  tested mise 2026.7.15; the TypeScript gate uses the dependency versions above.
