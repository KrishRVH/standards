# TypeScript, Effect v3, and Bun hardening report

This report covers the patch based on standards commit
`215ffabfa4cc97e8cd86db5d9f86a7a4c90fb476` and the writable Starbabe downstream
case at commit `c61d5ac6d0b1f7e73379b0170b42b72033768e84`. The complete concern record is
the [finding ledger](typescript-effect-bun-hardening-ledger.md); the normative
result is the [enforcement map](../../TS/docs/effect/enforcement.md).

## Executive verdict

The starting profile was already selective and substantially idiomatic: total
calculations stayed plain TypeScript; Schema guarded trust/protocol boundaries;
expected failures, defects, and interruption were distinct; explicit services,
layers, `Scope`, `ManagedRuntime`, a scoped `FiberSet` task owner, BunRuntime,
and exact-version language-service diagnostics were used deliberately.

The unsafe parts were concrete rather than architectural. Raw duration inputs
were checked after lossy normalization, endpoint identity collapsed to origin,
redirect rejection was indistinguishable from transport failure, batch
fail-fast behavior was accidental, error projections and HTTP/client contracts
were too lossy, stream/UI ownership had untested races, CI was not automatic,
and the always-loaded guide diluted its high-frequency rules.

The patch corrects those boundaries, adds static and deterministic contracts,
and keeps the example small. **PROJECT PREFERENCE:** explicit interface plus
namespaced `Context.Tag` plus named layer remains the legibility default, not a
claim that it is the only valid Effect style. **REASONED INFERENCE:** with the
repository host configured to require the committed `quality` job, the final
profile is suitable as an autonomous Bun application baseline. Production
attacker-controlled destinations still need resolver/connect-time policy at the
real network boundary.

Scores are a review rubric out of 10, not measurements:

| Dimension                      | Before | After |
| ------------------------------ | -----: | ----: |
| Effect idiomaticity            |    8.0 |   9.2 |
| Runtime and fiber ownership    |    7.5 |   9.4 |
| Error and HTTP contract safety |    6.0 |   9.3 |
| Semantic test coverage         |    6.5 |   9.6 |
| Static enforcement             |    7.5 |   8.8 |
| Agent-context efficiency       |    4.0 |   9.2 |
| Downstream usability           |    8.0 |   9.1 |

## Version and evidence inventory

No dependency or lockfile changed.

| Component                  | Exact version |
| -------------------------- | ------------- |
| Effect                     | 3.22.1        |
| `@effect/platform`         | 0.97.1        |
| `@effect/platform-bun`     | 0.91.0        |
| `@effect/language-service` | 0.87.1        |
| TypeScript                 | 6.0.3         |
| Bun and Bun types          | 1.3.14        |

**VERIFIED FACT:** versions were resolved from both repositories' lockfiles and
frozen installs, not copied from the earlier review. Installed evidence was
read under:

- `testers/ts/node_modules/effect/src`, especially `Duration.ts`, `Effect.ts`,
  `Schedule.ts`, `Layer.ts`, `ManagedRuntime.ts`, `FiberSet.ts`, and Schema;
- `testers/ts/node_modules/@effect/platform-bun/src/BunRuntime.ts`;
- `testers/ts/node_modules/@effect/platform-node-shared/src/NodeRuntime.ts`;
- `testers/ts/node_modules/@effect/language-service`, including `schema.json`,
  `cli.js`, bundled rule metadata, and source maps;
- `testers/ts/node_modules/typescript` and the pinned Bun/WHATWG declarations.

Primary upstream evidence consulted:

- [Effect 3.22.1 Duration source](https://github.com/Effect-TS/effect/blob/effect%403.22.1/packages/effect/src/Duration.ts)
- [Effect 3.22.1 Effect source](https://github.com/Effect-TS/effect/blob/effect%403.22.1/packages/effect/src/Effect.ts)
- [Bun 1.3.14 redirect tests](https://github.com/oven-sh/bun/blob/bun-v1.3.14/test/js/web/fetch/fetch-redirect.test.ts)
- [Bun 1.3.14 queued-abort tests](https://github.com/oven-sh/bun/blob/bun-v1.3.14/test/js/web/fetch/fetch-abort-queued.test.ts)
- [Bun fetch documentation](https://bun.com/docs/runtime/networking/fetch)
- [WHATWG Streams standard](https://streams.spec.whatwg.org/)
- [GitHub Actions workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)

Empirical probes against the pins established:

- **EMPIRICAL RESULT:** negative numbers/strings, `NaN`, negative infinity, and
  negative zero can lose their original distinction during Duration
  normalization; positive infinity becomes an infinite duration.
- **EMPIRICAL RESULT:** `{ times: n }` permits `n` retries, hence at most
  `n + 1` attempts.
- **EMPIRICAL RESULT:** concurrent `forEach` is fail-fast by default; explicit
  item materialization preserves input order while defects/interruption remain
  Cause.
- **EMPIRICAL RESULT:** timeout interrupts and waits for the losing fiber, but
  a signal-ignorant Promise can continue underlying work.
- **EMPIRICAL RESULT:** a local Bun 1.3.14 server returned the original
  301/302/303/307/308 for `redirect: "manual"` without contacting the target;
  `"error"` rejected and could expose the original URL in its message; `"follow"`
  contacted the target. A tester-owned readiness-controlled probe also held a
  manual-redirect response pending, aborted the request without sleeps, observed
  `AbortError`, and confirmed that the redirect target was never contacted.
- **EMPIRICAL RESULT:** Bun stream cancellation settles a pending read, while
  cancellation/release rejection details are host-specific and unsafe to expose.
- **VERIFIED FACT:** BunRuntime delegates SIGINT/SIGTERM handling to the pinned
  node-shared runtime and interrupts/finalizes the application scope.

The material discrepancies were the lossy Duration constructor, the difference
between fetch `manual` and `error` classification, host-specific stream cleanup
errors, and one language-service 0.87.1 diagnostic named
`missingEffectContext` for the `missingEffectError` fixture. The
[diagnostic inventory](../../TS/docs/effect/diagnostic-inventory.md) records every configured rule's
severity, standalone/editor behavior, quick-fix effect, risk, and applicability.

## Implemented standards and fixture

The always-loaded [agent guide](../../TS/AGENTS.md) now contains rule levels,
routing, required commands, and 17 decision tables. Detailed guides and
path-local server, UI, library, and observability overlays live under this
directory. Each of the 29 mandatory rules has one normative record with a
rationale, minimum/prohibited shape, exception, version, mechanical mapping, and
manual remainder.

The canonical fixture is split by visible responsibility:

- `src/endpoint-contracts.ts`: external target Schema, stable outcome wire
  Schema, precise operational errors, public projection, and separate safe
  telemetry projection;
- `src/endpoint-policy.ts`: narrow external millisecond/origin policy and
  checked normalized domain policy;
- `src/endpoint-checker.ts`: 165-line service/adapter/workflow with manual
  redirects, exact-origin authorization, per-attempt timeout, one retry owner,
  total deadline, bounded ordered outcome collection, and no unsafe transport
  detail;
- `src/main.ts`: a narrow BunRuntime edge and sole failure observer.

The tester owns larger runtime probes, including resources/finalizers,
ManagedRuntime/FiberSet, signal-aware and signal-ignorant promises, virtual time,
batch semantics, publication/finalization controllers, Strict Mode leases,
bounded body streams, safe observation, HTTP client projection, CI events, and
agent-document drift. The isolated type project proves a protected wrapper
cannot accept `Effect<Response, E, R>` until `E` is exhaustively projected.

## Red-green evidence

Temporary mutations were removed after each green result.

| Concern                    | Red evidence                                                                                                        | Green contract                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Raw policy normalization   | Negative retry delay decoded and invoked the adapter                                                                | All negative/string/`NaN`/infinite/zero cases fail before I/O; valid values normalize exactly               |
| Stable identity            | Two same-origin paths collapsed into one origin identity                                                            | Distinct IDs and ordered outcomes survive URL/path changes                                                  |
| Batch semantics            | One bad item failed the whole batch and prevented complete output                                                   | Every expected item outcome is collected; deadline yields no misleading partial batch                       |
| Redirects                  | A 3xx response became generic rejection/transport failure                                                           | Manual 3xx is `EndpointRedirectRejected`, not followed or retried                                           |
| Origin policy              | A path-valued policy string passed decoding                                                                         | HTTPS origin-only values normalize and deduplicate before authorization                                     |
| Protected route            | The old generic wrapper compiled with a residual `RateLimited` error                                                | Raw TS 2379 is required at the isolated fixture's exact location                                            |
| Task/publication ownership | Duplicate observation, stale publication, and replacement-before-finalizer mutations passed                         | Scoped task observer, immediate publication revocation, and finalizer-aware replacement tests pass          |
| Body ownership             | Declared oversize acquired a reader; actual oversize did not cancel; interruption/cleanup produced defects or hangs | Declared/running limits, best-effort cancel, lock release, and preserved failure/interruption pass          |
| Failure observation        | Unsafe provider data and layered duplicate logging reached the observer                                             | One owner and allowlisted diagnostic tests reject provider text, credentials, SQL, body, query, and headers |
| Automatic CI               | No generated workflow existed                                                                                       | Root and generated workflows pass PR/main/manual, locking, cancellation, and command tests                  |
| Client boundary            | A deliberately collapsed implementation mapped six HTTP/protocol cases to transport failure                         | 401/403/429/503/422, timeout, transport, malformed success/error, and interruption retain their contract    |

## Independent two-axis review

The first green patch received independent Standards and Spec reviews. The
worst severity was P1; all eleven material findings were repaired before the
final gate. Findings remain separated by review axis rather than merged or
reranked.

### Standards

| Severity | Finding                                                           | Disposition                                                                  |
| -------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| P1       | Repository-history ledger/report had entered the copyable profile | Moved to root research docs; removed from mirrors and consumer routing       |
| P1       | UI operation controller discarded expected failures and defects   | Added one explicit non-interruption Cause observer and exact tests           |
| P1       | Body cancellation rejection was silently detached                 | Added fixed safe cleanup observation and an explicit tested zero-wait policy |
| P1       | Runtime lease did not await or observe asynchronous disposal      | Added awaitable shutdown, serialized disposal, and failure observation tests |
| P2       | Canonical README routed contracts and policy to the wrong file    | Corrected responsibility-level links                                         |

No additional abstraction or duplication smell warranted a patch.

### Spec

| Severity | Finding                                                        | Disposition                                                                        |
| -------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| P1       | Retry/deadline tests had not proved the schedule entered sleep | Added exact `TestClock.sleeps` readiness probes before adjustment                  |
| P1       | Raw component `runFork` remained prose-only                    | Added scoped ESLint rejection plus core/downstream executable contracts            |
| P1       | Starbabe accepted noncanonical numeric `Content-Length` forms  | Added decimal grammar validation before conversion/acquisition and red-green tests |
| P1       | Starbabe collapsed actual database timeout telemetry           | Added an owned safe reason and distinct `database-timeout` projection/test         |
| P2       | Redirect-specific abort evidence was absent                    | Added a readiness-controlled local Bun server probe with zero target hits          |
| P2       | Biome generated-file evidence overstated analysis              | Recorded exclusion honestly and made the pinned ignored-path result executable     |

## Agent-context architecture

| Always-loaded material              | Lines before/after | Words before/after | Bytes before/after |
| ----------------------------------- | -----------------: | -----------------: | -----------------: |
| `TS/AGENTS.md`                      |          854 / 208 |      6,304 / 1,230 |    54,079 / 11,644 |
| `shared/AGENTS.md` + `TS/AGENTS.md` |          961 / 315 |      6,935 / 1,861 |    58,597 / 16,162 |

High-frequency choices remain loaded because they determine whether an agent
must read a routed document before editing a boundary. Rationale, examples, and
runtime-specific policy move on demand. The manifest mirrors every normative
document byte-for-byte; the tester asserts the 2,500-word budget, 17 decisions,
29 unique complete rule records, route existence, and absence of duplicate
normative entries.

## Enforcement map

At baseline, 27 mandatory rules existed: 21 had some static/compiler/LS
coverage, 25 had an executable local contract, and the selective-adoption and
stable-idempotency obligations lacked a blocking in-profile behavioral check.
Every rule also retained some manual judgment.

After hardening, 29 rules exist. Twenty-five have at least one static compiler,
language-service, linter, or negative-fixture mechanism; 28 have an executable
unit, semantic, integration, or diagnostic contract. EFF-001 remains the one
wholly non-blocking architecture rule. All rows explicitly flag narrower manual
residuals such as cross-layer ownership, provider commit guarantees,
production DNS/connect-time controls, safe vocabulary selection, and branch
protection. The complete per-rule mapping is in the
[enforcement map](../../TS/docs/effect/enforcement.md).

## CI result

The root and copyable workflows run on pull request, `main` push, and manual
dispatch. They use immutable action revisions, mise 2026.7.15, locked tool mode,
frozen dependency installation through mise, PR-only cancellation, and the
stable `quality` job. The generated fast job includes formatting, ESLint,
TypeScript, type-negative projection, Effect diagnostics and expected
diagnostics, deterministic tests, audit, lock, secret, and applicable aggregate
checks. Project database/device/build/deployment checks remain separable.

**VERIFIED FACT:** committed YAML cannot configure repository branch
protection. The host must require `quality`; that remains a manual/host setting,
not a claimed repository enforcement.

## Starbabe downstream validation

The downstream HEAD remained
`c61d5ac6d0b1f7e73379b0170b42b72033768e84`; changes are an uncommitted adopter
patch because that repository forbids agent commits. Its pre-existing untracked
`REVIEW.md` was preserved byte-for-byte (SHA-256
`d8a48d85af4d5c8d0dfef837d2478bb3d23c360092455a4779993f7216fc7cf3`).

| Revised rule      | Original failure mode                                                                 | Downstream patch and evidence                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Automatic CI      | Manual dispatch only                                                                  | Pinned PR/main/manual workflow; local YAML contract passes                                                                             |
| Safe diagnostics  | Constructor/message/stack projection was either unsafe or too lossy                   | Explicit low-cardinality auth/provider/calculation/database-timeout/protocol/defect allowlists; redaction and one-owner tests pass     |
| Exhaustive routes | Arbitrary residual `E` could silently become generic `503`                            | Pattern A wrapper accepts only `Effect<Response, never, R>`; all routes project locally; negative fixture fails until complete         |
| Actionable client | One message-bearing request error erased session/rate/timeout/protocol/domain actions | Tagged client algebra, bounded `Retry-After`, retry disposition, account-deletion contract, and API tests                              |
| UI ownership      | `interrupt`/replacement/publication timing and delayed host callbacks were ambiguous  | `interrupt`, `interruptAndWait`, `replaceWith`, publisher leases, four guarded auth call sites, stale-navigation and finalizer tests   |
| Body ownership    | Pending/failed reads and never-settling cancel could retain the lock                  | Scoped bounded reader validates decimal length, releases immediately, emits only fixed cleanup diagnostics, and preserves interruption |

Starbabe's final `mise run standards:check` passed in 41.47 seconds with 212
tests, 738 assertions, 38 expected diagnostic locations, zero normal Effect
findings, clean secrets, and a clean audit. `mise run test:db`, `mise run
db:check`, `mise run api:build`, `mise run app:export`, and Chromium `mise run
app:e2e` also passed.

The only unresolved downstream check is pre-existing: `mise run expo:deps`
requires four patch-level Expo dependency/lock upgrades, and `mise run
expo:doctor` reports 19/20 for the same alignment. Those upgrades were excluded
because this task forbids silent dependency upgrades.

## Verification record

Baseline commands actually executed:

| Command                                                                                                | Result                                              |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| `mise run //testers/ts:ts:install`                                                                     | Frozen install passed                               |
| `mise run //testers/ts:ts:lock:check`                                                                  | Lock present                                        |
| TypeScript format, lint, type, Effect check, 38 expected diagnostics, overview, tests, and audit tasks | Passed; 33 tests / 116 assertions                   |
| Baseline TypeScript fast loop                                                                          | 7.55 seconds                                        |
| `mise run standards:check`                                                                             | Passed in 117.51 seconds                            |
| Starbabe `mise run standards:check`                                                                    | Passed in 44.55 seconds; 188 tests / 657 assertions |
| Starbabe Effect overview                                                                               | Passed in 7.28 seconds                              |

Final commands actually executed:

| Command                                                | Result                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------ |
| `mise run //testers/ts:ts:install` and `ts:lock:check` | Frozen/no lock change                                              |
| `ts:fmt:check`, `ts:lint`, `ts:type`                   | Passed                                                             |
| `mise run //testers/ts:ts:type-tests:check`            | Passed; exact TS 2379 negative contract                            |
| `mise run //testers/ts:ts:effect:check`                | Passed; 30 files, zero findings                                    |
| `mise run //testers/ts:ts:effect:diagnostics:check`    | Passed; 38 exact blocking locations                                |
| `mise run //testers/ts:ts:effect:overview`             | Passed; 12 errors, one service, one layer discovered               |
| `mise run //testers/ts:ts:test`                        | Passed; 100 tests / 549 assertions                                 |
| `mise run //testers/ts:ts:audit`                       | Passed; no vulnerabilities                                         |
| `mise run //testers/ts:ts:standards:check`             | Passed inside the final repair loop                                |
| Final sequential fast repair loop                      | Passed in 25.38 seconds                                            |
| `mise run standards:biome:check`                       | Canonical lint clean; isolated repair converged; isolated CI clean |
| `mise run standards:drift`                             | Passed; 20 profiles                                                |
| Generated/root workflow semantic tests                 | Passed inside the 100-test suite                                   |
| `mise run md:standards:check`                          | Passed; 74 files, 5 tests / 14 assertions                          |
| Final `mise run standards:check`                       | Passed in 112.33 seconds across all 20 profiles                    |
| Final Starbabe `mise run standards:check`              | Passed in 41.47 seconds; 212 tests / 738 assertions                |

Three patch-introduced presentation failures were observed and fixed before the
green repository gate: `shfmt` changed the new Biome probe, ShellCheck rejected
two combined `readonly` command substitutions, and Markdown lint rejected three
unaligned ledger rows. A deliberately parallel early TypeScript check also made
two concurrent frozen installs contend with `EEXIST`; the sequential rerun and
all final installs passed. None was classified as a pre-existing baseline
failure.

## Rejected recommendations

- Rejected any API or behavior not established by the pinned v3 declarations,
  installed source, tests, or version-matched upstream evidence.
- Rejected new LLM, database, framework, React, or telemetry dependencies in
  the copyable fixture.
- Rejected universal HTTP retry/status tables, automatic retry based only on a
  “transient” name, and the claim that `AbortSignal` proves a mutation did not
  commit.
- Rejected universal services or Schema for trusted internal values as
  ceremonial and disproportionate.
- Rejected jitter in the tiny fixture because no deterministic random contract
  was needed; production guidance retains it behind injected/tested randomness.
- Rejected Biome stable `all`: representative measurement found framework/style
  churn and no additional actionable defect. Recommended plus two targeted
  rules is separately tested, not called ESLint-equivalent. Config and
  declaration inputs remain in the corpus; the generated-file fixture is
  deliberately excluded from all Biome processing, and the gate asserts that
  exclusion instead of claiming it was analyzed or indexed.
- Rejected raw provider objects/messages for observability and rejected deleting
  all classification; the allowlisted diagnostic is both useful and safe.
- Rejected a framework/database/general task system in the canonical endpoint
  checker and retained server/UI/observability concerns in overlays and
  tester-owned probes.

## Future migration note

Effect v4 evaluation is a separate future migration. It requires its own lock
update, declaration/source inventory, diagnostic audit, behavior probes,
migration notes, and complete gates; no v4 API or current-branch behavior is
used by this profile.
