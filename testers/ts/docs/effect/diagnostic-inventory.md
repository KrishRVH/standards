# Effect language-service diagnostic inventory

This inventory is specific to `@effect/language-service` 0.87.3 running against
Effect v4 and the profile configuration in `TS/tsconfig.json`. Re-audit the
installed source, editor behavior, standalone output, and every fix before
changing either version.

The pinned package source map is the evidence for diagnostic name, supported
Effect generation, and `fixable` metadata. The repository's expected-
diagnostic harness is the executable CI contract for blocking diagnostics.
The table below catalogs explicitly configured rules. The harness also pins
error diagnostics that version 0.87.3 enables by default; their emitted names
and locations live in `scripts/check-effect-diagnostics.mjs`.

## Behavior key

| Profile value        | Editor     | Standalone command                     | Gate          |
| -------------------- | ---------- | -------------------------------------- | ------------- |
| **E** (`error`)      | Error      | Included by `--severity error,warning` | Exits nonzero |
| **S** (`suggestion`) | Suggestion | Excluded by the severity filter        | Nonblocking   |
| **Off**              | Disabled   | Disabled                               | No finding    |

The standalone CLI only makes warnings fail with `--strict`; this profile does
not use `--strict` and configures no warning-level override. Thus blocking
editor and CI severity agree for every **E** row. **S** rows are deliberately
editor-only. “Fix” means the installed rule advertises a quick fix; never apply
one without reviewing the listed semantic effect and running the boundary test.

## Configured diagnostics

| Exact name                      | Profile | Fix                               | Contract, fix effect, and false-positive risk                                                 |
| ------------------------------- | ------- | --------------------------------- | --------------------------------------------------------------------------------------------- |
| `anyUnknownInErrorContext`      | E       | No                                | Rejects erased `E`/`R`; a named untyped adapter is the narrow suppression case.               |
| `asyncFunction`                 | Off     | No                                | Too broad for framework and host adapters; async alone is not an Effect defect.               |
| `cryptoRandomUUID`              | Off     | No                                | Pure and adapter code outside Effect may own native identifier generation.                    |
| `cryptoRandomUUIDInEffect`      | E       | No                                | Requires the injectable `Random` service for identifiers in workflows and tests.              |
| `effectFnIife`                  | S       | Yes: convert to `Effect.gen`      | Useful ceremony hint; inspect trace/span preservation.                                        |
| `effectGenUsesAdapter`          | E       | No                                | Rejects the removed generator adapter parameter; low ambiguity.                               |
| `effectInFailure`               | E       | No                                | Prevents nested Effect values in `E`; inspect complex aliases before suppression.             |
| `effectInVoidSuccess`           | E       | No                                | Prevents an Effect value hidden in a void success union.                                      |
| `extendsNativeError`            | Off     | No                                | Native Error subclasses remain legitimate at host/library boundaries.                         |
| `genericEffectServices`         | E       | No                                | Runtime keys cannot distinguish erased type arguments; concrete keys are the exception.       |
| `globalConsole`                 | Off     | No                                | Plain tooling and host adapters may use console intentionally.                                |
| `globalConsoleInEffect`         | S       | No                                | Prefer Effect logging at owned boundaries; direct host logging can be deliberate.             |
| `globalDate`                    | Off     | No                                | Pure TypeScript and adapters may use native time outside Effect.                              |
| `globalDateInEffect`            | E       | No                                | Requires testable Effect time inside workflows; suppress only at a named host adapter.        |
| `globalFetch`                   | Off     | No                                | Native fetch is a valid Bun adapter outside an Effect workflow.                               |
| `globalFetchInEffect`           | Off     | No                                | No universal platform replacement is imposed; the typed native adapter is tested instead.     |
| `globalRandom`                  | Off     | No                                | Pure/adaptor code may intentionally own native randomness.                                    |
| `globalRandomInEffect`          | E       | No                                | Requires injectable Effect randomness in workflows and deterministic tests.                   |
| `globalTimers`                  | Off     | No                                | Host/framework adapters may own native timers.                                                |
| `globalTimersInEffect`          | E       | No                                | Requires Effect time/scheduling in workflows; adapter exceptions are narrow.                  |
| `instanceOfSchema`              | Off     | Yes: replace with `Schema.is`     | Too broad for native/class checks; replacement changes the recognition contract.              |
| `layerMergeAllWithDependencies` | E       | Yes: move to `Layer.provideMerge` | Fix changes graph topology and memoization; verify acquisition/finalization counts.           |
| `lazyPromiseInEffectSync`       | E       | No                                | Rejects Promise-producing `Effect.sync`; inert Promise-as-data is a rare exception.           |
| `leakingRequirements`           | S       | No                                | Flags service requirements that may leak; intentional higher-order capabilities can be valid. |
| `multipleEffectProvide`         | E       | Yes: combine provides             | Fix can alter layer sharing/lifetime; verify the deliberate root.                             |
| `newPromise`                    | Off     | No                                | Promise construction is valid inside a signal-aware native adapter.                           |
| `nodeBuiltinImport`             | Off     | No                                | Bun supports required Node built-ins; portability belongs to an overlay.                      |
| `outdatedApi`                   | E       | No                                | Names a removed or renamed v3 API; translate it with the upstream migration guide.            |
| `preferSchemaOverJson`          | S       | No                                | Useful at untrusted boundaries; trusted JSON/tooling need not adopt Schema.                   |
| `processEnv`                    | Off     | No                                | Bootstrap/tooling adapters may own environment access.                                        |
| `processEnvInEffect`            | E       | No                                | Workflow configuration uses Effect Config/Redacted; bootstrap exceptions stay outside.        |
| `returnEffectInGen`             | E       | Yes: add `yield*`                 | Fix flattens a nested Effect and changes execution; inspect intent.                           |
| `runEffectInsideEffect`         | E       | Yes: use a runtime                | Fix changes runtime requirements/ownership; move execution to a named edge when possible.     |
| `strictEffectProvide`           | Off     | No                                | Legitimate feature/request roots make the heuristic too broad.                                |
| `unknownInEffectCatch`          | E       | No                                | Requires narrowing unknown catches; owned untyped adapters may classify once.                 |
| `unsafeEffectTypeAssertion`     | E       | Yes: remove assertion             | Removal exposes the honest `E`/`R`; repair callers rather than reasserting.                   |

`schemaSyncInEffect`, `scopeInLayerEffect`, `missingEffectServiceDependency`,
and `nonObjectEffectServiceType` analyze only Effect v3 code in 0.87.3, so this
profile leaves them unconfigured. `Layer.effect` excludes `Scope` from its
requirements by construction; a synchronous Schema decode inside a workflow is
a review item under EFF-020.

## Exact harness facts

The normal editor and CI project must report zero configured error/warning
diagnostics. The isolated invalid project proves 37 error locations and a
nonzero standalone exit; every fixture file must produce at least one.

One pinned discrepancy is intentional evidence: 0.87.3 reports the
`missingEffectError` fixture under the name `missingEffectContext`. The
harness preserves that observed name until a separately reviewed upgrade.
`outdatedApi` reports twice per offending file: once at the v3 API and once at
the start of the file.

The package artifact contains bundled JavaScript, source maps, and
`schema.json`, not upstream TypeScript tests. The locally installed source map
and repository fixtures therefore remain the exact-version evidence. Quick
fixes are editor transformations, not CI autofixes, and are never bulk-applied.
