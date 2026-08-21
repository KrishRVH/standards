# Effect language-service diagnostic inventory

This inventory is specific to `@effect/language-service` 0.87.2 and the
profile configuration in `TS/tsconfig.json`. Re-audit the installed source,
editor behavior, standalone output, and every fix before changing that version.

The pinned package source map is the evidence for diagnostic name, supported
Effect generation, and `fixable` metadata. The repository's expected-
diagnostic harness is the executable CI contract for blocking diagnostics.

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

| Exact name                       | Profile | Pinned applicability | Fix                               | Contract, fix effect, and false-positive risk                                                  |
| -------------------------------- | ------- | -------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------- |
| `anyUnknownInErrorContext`       | E       | 3.22.1               | No                                | Rejects erased `E`/`R`; a named untyped adapter is the narrow suppression case.                |
| `asyncFunction`                  | Off     | 3.22.1               | No                                | Too broad for framework and host adapters; async alone is not an Effect defect.                |
| `cryptoRandomUUID`               | Off     | Not applicable       | No                                | Not emitted for the pinned Effect generation; it is not evidence for this profile.             |
| `cryptoRandomUUIDInEffect`       | Off     | Not applicable       | No                                | Not emitted for the pinned Effect generation; keep it disabled.                                |
| `effectFnIife`                   | S       | 3.22.1               | Yes: convert to `Effect.gen`      | Useful ceremony hint; inspect trace/span preservation.                                         |
| `effectGenUsesAdapter`           | E       | 3.22.1               | No                                | Rejects the obsolete generator adapter parameter; low ambiguity.                               |
| `effectInFailure`                | E       | 3.22.1               | No                                | Prevents nested Effect values in `E`; inspect complex aliases before suppression.              |
| `effectInVoidSuccess`            | E       | 3.22.1               | No                                | Prevents an Effect value hidden in a void success union.                                       |
| `extendsNativeError`             | Off     | 3.22.1               | No                                | Native Error subclasses remain legitimate at host/library boundaries.                          |
| `genericEffectServices`          | E       | 3.22.1               | No                                | Runtime tags cannot distinguish erased type arguments; concrete tags are the exception.        |
| `globalConsole`                  | Off     | 3.22.1               | No                                | Plain tooling and host adapters may use console intentionally.                                 |
| `globalConsoleInEffect`          | S       | 3.22.1               | No                                | Prefer Effect logging at owned boundaries; direct host logging can be deliberate.              |
| `globalDate`                     | Off     | 3.22.1               | No                                | Pure TypeScript and adapters may use native time outside Effect.                               |
| `globalDateInEffect`             | E       | 3.22.1               | No                                | Requires testable Effect time inside workflows; suppress only at a named host adapter.         |
| `globalFetch`                    | Off     | 3.22.1               | No                                | Native fetch is a valid Bun adapter outside an Effect workflow.                                |
| `globalFetchInEffect`            | Off     | 3.22.1               | No                                | No universal platform replacement is imposed; the typed native adapter is tested instead.      |
| `globalRandom`                   | Off     | 3.22.1               | No                                | Pure/adaptor code may intentionally own native randomness.                                     |
| `globalRandomInEffect`           | E       | 3.22.1               | No                                | Requires injectable Effect randomness in workflows and deterministic tests.                    |
| `globalTimers`                   | Off     | 3.22.1               | No                                | Host/framework adapters may own native timers.                                                 |
| `globalTimersInEffect`           | E       | 3.22.1               | No                                | Requires Effect time/scheduling in workflows; adapter exceptions are narrow.                   |
| `instanceOfSchema`               | Off     | 3.22.1               | Yes: replace with `Schema.is`     | Too broad for native/class checks; replacement changes the recognition contract.               |
| `layerMergeAllWithDependencies`  | E       | 3.22.1               | Yes: move to `Layer.provideMerge` | Fix changes graph topology and memoization; verify acquisition/finalization counts.            |
| `lazyPromiseInEffectSync`        | E       | 3.22.1               | No                                | Rejects Promise-producing `Effect.sync`; inert Promise-as-data is a rare exception.            |
| `leakingRequirements`            | S       | 3.22.1               | No                                | Flags service requirements that may leak; intentional higher-order capabilities can be valid.  |
| `missingEffectServiceDependency` | E       | 3.22.1               | No                                | Requires declared service dependencies for pinned service access; custom patterns need review. |
| `multipleEffectProvide`          | E       | 3.22.1               | Yes: combine provides             | Fix can alter layer sharing/lifetime; verify the deliberate root.                              |
| `newPromise`                     | Off     | 3.22.1               | No                                | Promise construction is valid inside a signal-aware native adapter.                            |
| `nodeBuiltinImport`              | Off     | 3.22.1               | No                                | Bun supports required Node built-ins; portability belongs to an overlay.                       |
| `preferSchemaOverJson`           | S       | 3.22.1               | No                                | Useful at untrusted boundaries; trusted JSON/tooling need not adopt Schema.                    |
| `processEnv`                     | Off     | 3.22.1               | No                                | Bootstrap/tooling adapters may own environment access.                                         |
| `processEnvInEffect`             | E       | 3.22.1               | No                                | Workflow configuration uses Effect Config/Redacted; bootstrap exceptions stay outside.         |
| `returnEffectInGen`              | E       | 3.22.1               | Yes: add `yield*`                 | Fix flattens a nested Effect and changes execution; inspect intent.                            |
| `runEffectInsideEffect`          | E       | 3.22.1               | Yes: use a runtime                | Fix changes runtime requirements/ownership; move execution to a named edge when possible.      |
| `schemaSyncInEffect`             | E       | 3.22.1               | No                                | Sync Schema inside Effect can throw; valid sync use outside Effect is explicitly tested.       |
| `scopeInLayerEffect`             | E       | 3.22.1               | Yes: use `Layer.scoped`           | Fix changes resource lifetime; verify finalization.                                            |
| `strictEffectProvide`            | Off     | 3.22.1               | No                                | Legitimate feature/request roots make the heuristic too broad.                                 |
| `unknownInEffectCatch`           | E       | 3.22.1               | No                                | Requires narrowing unknown catches; owned untyped adapters may classify once.                  |
| `unsafeEffectTypeAssertion`      | E       | 3.22.1               | Yes: remove assertion             | Removal exposes the honest `E`/`R`; repair callers rather than reasserting.                    |

## Exact harness facts

The normal editor and CI project must report zero configured error/warning
diagnostics. The isolated invalid project proves 38 error locations and a
nonzero standalone exit. It also keeps synchronous Schema use outside Effect
valid.

One pinned discrepancy is intentional evidence: 0.87.2 reports the
`missingEffectError` fixture under the name `missingEffectContext`. The
harness preserves that observed name until a separately reviewed upgrade.

The package artifact contains bundled JavaScript, source maps, and
`schema.json`, not upstream TypeScript tests. The locally installed source map
and repository fixtures therefore remain the exact-version evidence. Quick
fixes are editor transformations, not CI autofixes, and are never bulk-applied.
