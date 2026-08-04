# TypeScript and Effect v3 standards

Copy this profile into a private Bun TypeScript application, replace
`project-name`, and keep the generated `bun.lock`. Merge `TS/AGENTS.md` into
`shared/AGENTS.md`; it is an Effect v3 standards fragment, not a standalone
project guide.

The tested dependency set is exact:

| Package/runtime            | Version |
| -------------------------- | ------- |
| `effect`                   | 3.22.1  |
| `@effect/language-service` | 0.87.1  |
| TypeScript                 | 6.0.3   |
| Bun / `@types/bun`         | 1.3.14  |
| `@effect/platform`         | 0.97.1  |
| `@effect/platform-bun`     | 0.91.0  |

Application dependencies and development tools are exact and the lockfile is
mirrored because a copied private app must not install an untested version. Bun
records the platform package's broad cluster/RPC/SQL peer graph in the lock;
`bunfig.toml` disables automatic installation of those unused peers. Install a
peer explicitly when importing the corresponding platform adapter. The
published-library overlay in `AGENTS.md` defines the deliberate peer/range
alternative.

## Pinned baseline, not a freeze

The exact versions above are an evidence anchor, not a commitment to stay on
them. Pinning exists so every claim in this profile — diagnostic names,
retry/timeout ordering, redirect behavior, runtime ownership — is proven
against one reproducible dependency set, which is what gives an agent a
trustworthy repair loop. Most rules in the enforcement map are architectural
and survive version changes unchanged; each row records its version scope.

Upgrading is a supported, ordinary workflow, not an exception. For a routine
bump: change the declared version, run `mise run ts:lock`, run the full
`mise run ts:standards:check` gate, and re-audit the
[diagnostic inventory](docs/effect/diagnostic-inventory.md) whenever
`@effect/language-service` changes, because diagnostic names and severities
drift between releases. The executable contracts are the migration test: a
green gate on the new lock is the evidence the new versions are safe, and a
red gate points at exactly what changed. Downstream projects upgrade the same
way and do not need this catalog's permission to move.

A future Effect major (v4) is an intended path, not a foreclosed one. It is
handled as one separately scoped migration per EFF-028: update the inventory,
canonical examples, diagnostics configuration, semantic suites, and locks
together, so the profile lands on the new major with the same closed feedback
loop it has today. Until then, do not mix majors: v4 APIs and documentation
are not evidence for this v3 baseline.

## Profile boundary

This is a Bun application baseline, not one universal tsconfig for Bun servers,
browser bundles, React Native, and published libraries. The always-loaded agent
fragment is a compact routing and decision index. One normative enforcement map
owns every mandatory rule; routed guides hold rationale, exact-version notes,
and boundary patterns. Bun CLI/server, browser/framework UI,
published-library, and optional observability guidance are path-local overlays.

Pure synchronous calculations stay plain TypeScript. Use Effect where typed
operational failure, service requirements, interruption, concurrency, or
resource lifetime is useful. Use Effect Schema at untrusted/runtime contract
boundaries; internal trusted types do not require schemas.

The canonical endpoint checker is intentionally small:

- `src/endpoint-contracts.ts` decodes bounded unknown target input with stable
  IDs and owns the outcome wire Schema plus separate public and telemetry
  projections.
- `src/endpoint-policy.ts` validates finite millisecond/origin configuration
  before constructing the checked normalized policy.
- `src/endpoint-checker.ts` owns exact-origin authorization, explicit redirect
  rejection, the service/tag/live layer, signal-aware promise adapter,
  per-attempt timeout, narrowly classified duplicate-safe retry, total deadline,
  bounded concurrency, and deliberate ordered outcome collection.
- `src/main.ts` uses the narrow
  `@effect/platform-bun/BunRuntime` import and `BunRuntime.runMain`.
- `tests/endpoint-checker.test.ts` asserts exact policy and ParseError
  failures, target identity, normalized destination rejection, redirect
  classification, cancellation, attempts, non-retry, batch outcomes,
  concurrency, encoding, and redaction-safe projection behavior.
- The copyable profile includes the expected-diagnostic harness because it
  guards the configured language-service contract. The tester alone adds the
  larger fixture-owned semantic probes so the downstream seed remains readable.

Use the BunRuntime subpath rather than the `@effect/platform-bun` barrel.
With `skipLibCheck: false`, the barrel pulls unrelated HTTP/RPC/socket
declarations whose optional Bun/DOM/`ws` types are not part of this profile.
The narrow entrypoint declaration checks cleanly.

## Effect diagnostics

Effect includes its own declarations; there is no `@types/effect`.
`@effect/language-service` supplies editor diagnostics, standalone CI
diagnostics, and the architecture overview. Configure editors to use the
workspace TypeScript version; do not patch the installed compiler.

The config does not enable the blanket `effect-native` preset. Exact
correctness and ownership diagnostics are errors. Shape/style opportunities
are editor suggestions. Outside-Effect native APIs and native boundary
adapters remain allowed when their contract is explicit.

The standalone command omits `--strict`: in language service 0.87.1, strict
only makes warnings affect the exit code; it does not promote messages or
suggestions. The expected-diagnostic harness proves configured blockers fail
and catches silently ignored diagnostic-name drift.

Do not bulk-apply Effect quick fixes. Some exact-version fixes turn typed
failure into a defect, change layer dependency topology/lifetime, or change a
runtime/schema identifier.

## Developer API

All project development goes through mise:

```sh
mise run ts:fmt
mise run ts:fmt:check
mise run ts:lint
mise run ts:type
mise run ts:type-tests:check
mise run ts:effect:check
mise run ts:effect:diagnostics:check
mise run ts:effect:overview
mise run ts:test
mise run ts:audit
mise run ts:lock
mise run ts:lock:check
mise run ts:standards
mise run ts:standards:check
```

`ts:effect:overview` is an orientation command; it should show the exported
service, live layer, and errors from the canonical fixture. Its output is
generated and is not committed.

`ts:standards` runs ESLint autofix before the final Prettier pass so a lint fix
cannot leave formatting stale. `ts:standards:check` runs lint, TypeScript,
Effect diagnostics, expected diagnostics, formatting, deterministic
unit/semantic/type-negative tests, and `bun audit --audit-level=low`.

The recommended fast repair loop is format check, lint, TypeScript, Effect
diagnostics, semantic tests, audit, then the aggregate gate. `AGENTS.md`
contains the full verification and upgrade protocols.

## Automatic quality gate

Copy `.github/workflows/quality.yml` with the profile. It runs the pinned,
locked `mise run standards:check` gate for every pull request, every push to
`main`, and manual dispatch. The mandatory job is named `quality`.
Pull-request runs cancel superseded work; main-branch runs do not, so a later
push cannot hide an earlier main failure.

The workflow pins mise 2026.7.15. The configuration's 2026.6.12 minimum is the
documented compatibility floor, not an instruction for CI to float.

Repository host settings must require the `quality` job before merge. Committed
workflow YAML cannot configure branch protection. Project-specific database,
device, deployment, or other expensive integration checks may be separate
required jobs, but they do not replace this static and deterministic gate.

## Tooling choices

The committed default is Option A: type-aware ESLint plus Prettier. The config
sets `@typescript-eslint/no-floating-promises` with `ignoreVoid: false`; writing
`void runtime.runPromise(...)` is not accepted as background-task ownership.

`skipLibCheck` is false. This costs some feedback time but checks dependency
declarations. Re-enable it only after measuring a material project-specific
cost and record which declaration mismatch becomes invisible.

`moduleResolution: "bundler"`, Bun types, and the Bun package manager are
application-profile choices. Browser, React Native, and published-library
projects need their own runtime/module/declaration overlay rather than
weakening this one.

`biome.jsonc` is Option B for projects that deliberately replace both ESLint
and Prettier with Biome 2.5.5. It uses the stable recommended preset plus two
targeted agent-legibility rules (`noDefaultExport` and
`noParameterProperties`), not the high-churn stable `all` preset. The catalog
validates this alternative separately against pure TypeScript, Effect
services/layers/errors, Schema boundaries, a Bun entrypoint, tests, config,
and declaration inputs. It separately asserts that the representative
generated file is excluded from Biome processing. Option B is not claimed to
be rule-equivalent to the curated ESLint profile.

The catalog checks Option B's linter against the canonical Option A source,
then runs Biome's full repair and CI loop on an isolated copy. This proves the
alternative converges without making both formatter/linter stacks active in one
generated project or forcing their different formatting/import repairs onto
the same files.

If a project chooses Option B, remove `@eslint/js`, `eslint`,
`eslint-config-prettier`, `eslint-plugin-regexp`, `globals`, `prettier`, and
`typescript-eslint`; add exact dev dependency
`"@biomejs/biome": "2.5.5"`. Keep Effect, platform packages, the language
service, TypeScript, Bun types, and the lock policy.

Remap package scripts without changing mise task names:

| Script            | Option B value                                                                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `format`          | `biome format --write .`                                                                                                                           |
| `format:check`    | `biome format .`                                                                                                                                   |
| `lint`            | `biome lint --error-on-warnings .`                                                                                                                 |
| `lint:fix`        | `biome lint --write --error-on-warnings .`                                                                                                         |
| `standards`       | `biome check --write --error-on-warnings .`                                                                                                        |
| `standards:check` | `biome ci --error-on-warnings . && bun run typecheck && bun run effect:check && bun run effect:diagnostics:check && bun run test && bun run audit` |

Then run `mise run ts:lock`. Do not keep both formatter/linter stacks active.
The Biome baseline enables recommended stable rules, explicitly excludes the
semver-unstable nursery group, and leaves TypeScript and Effect diagnostics
responsible for module resolution and Effect channel correctness. The broader
`all` preset is not part of this profile because it produces framework-specific
false positives and assertion/style churn without an additional actionable
correctness finding on the representative fixture. Generated files are excluded
from Biome's formatter, linter, and project analysis in this optional profile;
the conformance gate verifies that exclusion explicitly.

## Runtime note

`bunfig.toml` sets `[run] bun = true`, so package scripts and `node` shebang
subprocesses resolve through Bun's PATH shim. A pinned tool that demonstrably
requires real Node gets one narrow, tested runner override; do not add
pnpm/yarn/npm/runtime fallback branches to the shared task fragment.

Long-running Bun programs use `BunRuntime.runMain`. Framework applications
instead build one application-owned `ManagedRuntime`, dispose it at application
teardown, and supervise background work separately: disposing a ManagedRuntime
closes its layer but does not automatically own fibers launched by
`runFork`.
