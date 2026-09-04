# TypeScript and Effect v3 standards

Copy this profile into a private Bun TypeScript application, replace
`project-name`, and keep the generated `bun.lock`. Merge `TS/AGENTS.md` into
`shared/AGENTS.md`; it is an Effect v3 standards fragment, not a standalone
project guide.

The tested dependency set is exact:

| Package/runtime            | Version |
| -------------------------- | ------- |
| `effect`                   | 3.22.1  |
| `@effect/language-service` | 0.87.2  |
| TypeScript                 | 6.0.3   |
| Bun                        | 1.4.1   |
| `@types/bun`               | 1.4.1   |
| `@effect/platform`         | 0.97.1  |
| `@effect/platform-bun`     | 0.91.2  |

Application dependencies and development tools are exact and the lockfile is
mirrored because a copied private app must not install an untested version. Bun
records the platform package's broad cluster/RPC/SQL peer graph in the lock;
`bunfig.toml` disables automatic installation of those unused peers. Install a
peer explicitly when importing the corresponding platform adapter. The
published-library overlay in `AGENTS.md` defines the deliberate peer/range
alternative.

## Pinned baseline, not a freeze

The exact versions above are an evidence anchor, not a commitment to stay on
them. Pinning proves version-sensitive executable behavior such as diagnostic
names, retry/timeout ordering, redirect behavior, and runtime ownership against
one reproducible dependency set. This gives an agent a trustworthy repair loop
without claiming that tests prove every architectural obligation. Most rules
in the enforcement map are architectural and survive version changes
unchanged; each row records its version scope.

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

TypeScript remains at 6.0.3 because the current Effect language service and
`typescript-eslint` parser reject TypeScript 7. Upgrade the compiler when those
consumers support it and the full gate passes; do not add a second compiler to
work around their version contracts.

## Integrating into an existing project

The copy steps above assume a fresh application. For a project that already
has TypeScript tooling:

- Merge `TS/AGENTS.md` into the project's existing agent guide instead of
  replacing it; it stays a routed fragment either way.
- Adopt configuration additively. Where an existing setting conflicts with
  this profile, prefer the stricter one and record any deliberate exception
  next to it.
- Never downgrade an existing dependency to match this profile's pins. Keep
  the project's newer version, run the full `ts:standards:check` gate against
  it, and treat any red result as the concrete migration work list. The pins
  are the catalog's tested evidence floor, not a ceiling.
- Conformance is the green gate, not visual similarity to this catalog.

## Profile boundary

This is a Bun application baseline, not one universal tsconfig for Bun servers,
browser bundles, React Native, and published libraries. The always-loaded agent
fragment routes agents to the checks and boundary guides needed for a change. One normative enforcement map
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
- `tests/endpoint-properties.test.ts` holds the trust-boundary property
  tests; a counterexample found by a run is pinned there as a deterministic
  example.
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

The standalone command omits `--strict`: in language service 0.87.2, strict
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
mise run ts:knip
mise run ts:preflight
mise run ts:mutants
mise run ts:mutants:diff
mise run ts:lock
mise run ts:lock:check
mise run ts:standards
mise run ts:standards:check
mise run ts:lint:secondary
mise run ts:standards:secondary
mise run ts:standards:secondary:check
```

`ts:effect:overview` is an orientation command; it should show the exported
service, live layer, and errors from the canonical fixture. Its output is
generated and is not committed.

`ts:standards` runs the out-of-band directive check and Oxlint autofix before
the final Oxfmt pass, so neither an exception bypass nor a lint fix can leave
the tree green incorrectly. `ts:standards:check` runs lint, TypeScript,
Effect diagnostics, expected diagnostics, formatting, deterministic
unit/semantic/type-negative tests, randomized fast-check property tests,
`bun audit --audit-level=low`, knip, and the full Stryker mutation sweep.

Application source is compiler-owned and uses `.cts`, `.mts`, `.ts`, or `.tsx`;
`jsx: preserve` keeps TSX inside the strict type gate. Oxlint state walls, knip,
and Stryker use that same suffix set. First-party `.cjs`, `.js`, `.jsx`, and
`.mjs` files under `src/` fail lint instead of silently escaping typechecking.
The directive scanner still covers all eight JavaScript-like suffixes so
tooling and configuration files cannot bypass the exception protocol.
The audit gate covers dev-only subtrees too — Stryker's legacy
`typed-rest-client` tree has already tripped it once (the `qs` override in
`package.json` is the patch). The countersigned escape for an advisory with
no fixed release is a `--ignore <advisory-id>` flag added to the `audit`
script, removed once the fix ships.

`ts:knip` fails on declared dependencies, files, and unused exports from both
entry and non-entry modules. The directive checker uses the existing TypeScript
ESLint parser to identify comments outside the linter, including after template
interpolation and inside JSX expressions. A lint directive cannot disable the
exception protocol itself.
`ts:preflight` runs every non-mutation gate before Stryker can touch source.
`ts:mutants` then audits whether the tests would notice wrong code in Stryker's
isolated sandbox. Stryker runs only the test files that import `src/` directly,
because every static mutant reruns that whole list; tooling and contract tests
belong to the preflight gate, and a unit test must import source itself to
count toward the score. Its `break`
threshold is a coarse regression alarm pinned at the measured floor, not a
per-mutant guarantee — survivors in changed code are dispositioned in
review. Both mutation tasks pass `stryker.config.mjs` explicitly and acquire
the project-scoped `reports/.stryker-mutation.lock` before replacing the
machine report. The lock is held while Stryker and the report checker access
the shared report and incremental state; a second run fails immediately
instead of racing. The full task bypasses cached outcomes, requires
`force=true` in the report, and requires at least one killed or surviving
mutant with a positive completed-test count; timeouts alone are not fresh-test
evidence. Because Stryker scores timeouts as detected, the report gate permits
at most one percent (with a one-mutant minimum allowance); every remaining
timeout needs investigation and a handoff explanation. Stryker core receives
30 seconds of absolute timeout deviation under the Bun runner's 60-second hard
child timeout. Mutation concurrency is fixed at two so Bun children and a
parallel aggregate fixture retain CPU capacity; ordinary host load must not
cheaply improve the score.
`ts:mutants:diff` requires `force=false` and `incremental=true`; its evidence
may be newly tested or compatibly reused from Stryker's incremental state. A
stale lock fails closed: first verify that no mutation process is running,
then remove `reports/.stryker-mutation.lock` manually and rerun. Property tests
use `fast-check`; a counterexample
found by a property run is pinned as a deterministic example test because
fast-check keeps no regression corpus. On large projects, swap `ts:mutants`
for `ts:mutants:diff` in the PR gate and move the full sweep to a scheduled
job; the shipped workflow restores and saves only
`reports/stryker-incremental.json`, fingerprints the tool and configuration
inputs, and saves structurally usable state after successful or failed gates but not
cancelled runs. Without that cache, a fresh CI checkout makes
`ts:mutants:diff` a cold full sweep.

The recommended fast repair loop is format check, lint, TypeScript, Effect
diagnostics, semantic tests, audit, knip, incremental mutants, then the
aggregate gate. `AGENTS.md` routes changes to the relevant boundary guides;
this README owns the verification and upgrade workflow.

## Automatic quality gate

Copy `.github/workflows/quality.yml` with the profile. It runs the pinned,
locked `mise run standards:check` gate for every pull request, every push to
`main`, merge-queue groups, and manual dispatch. The mandatory job is named
`quality`.
Pull-request runs cancel superseded work; main-branch runs do not, so a later
push cannot hide an earlier main failure.

The workflow pins mise 2026.9.1. The configuration's 2026.6.12 minimum is the
documented compatibility floor, not an instruction for CI to float.

`.github/CODEOWNERS` deliberately assigns every path to the placeholder owner
because source files can carry mutation classifications and diagnostic
suppressions. Point the placeholder at a real human, require the `quality` job
and Code Owner review, dismiss stale approvals on every new commit, and
disallow protection bypass. The latest-push approval option is not a substitute
for stale dismissal: its approver need not be the code owner. These host
settings turn "loosening requires human countersign" from an instruction into
a gate. Committed workflow YAML cannot configure them. Project-specific
database, device, deployment, or other expensive checks may be separate
required jobs, but they do not replace this static and deterministic gate.

## Tooling choices

The committed primary workflow is typed Oxlint plus Oxfmt. Oxlint uses the
`oxlint-tsgolint` TypeScript 7 backend for type-aware lint rules while the
project remains on TypeScript 6.0.3, the tested version supported by
`@effect/language-service`. `tsc` stays authoritative for compilation and the
Effect language service keeps its own diagnostics gate.

The primary lint config keeps `typescript/no-floating-promises` at
`ignoreVoid: false`; writing `void runtime.runPromise(...)` is not accepted as
background-task ownership. It also blocks narrowing and object-literal type
assertions (`no-unsafe-type-assertion`, `consistent-type-assertions`): a value
proves conformance with `satisfies`, and a cast is earned only inside a
validated boundary adapter per EFF-030 and the
[type discipline guide](docs/effect/type-discipline.md). Project-local rules
preserve the state, ambient-runtime, ESM-only, TypeScript-source-only, default
export, and TypeScript emit-syntax walls that are part of this profile.

`skipLibCheck` is false. This costs some feedback time but checks dependency
declarations. Re-enable it only after measuring a material project-specific
cost and record which declaration mismatch becomes invisible.

`moduleResolution: "bundler"`, Bun types, and the Bun package manager are
application-profile choices. Browser, React Native, and published-library
projects need their own runtime/module/declaration overlay rather than
weakening this one.

ESLint plus Prettier remains a pinned secondary workflow for projects that need
its ecosystem or editor compatibility. It shares the local semantic rules and
the canonical `eslint-disable-next-line <rule> -- <reason>` exception syntax.
Use `mise run ts:standards:secondary` and
`mise run ts:standards:secondary:check` only after deliberately selecting that
workflow. The catalog runs its repair and check loop on an isolated copy so
formatter differences never rewrite the canonical Oxc fixture.

The catalog maintains and validates both lint-and-format workflows, but a
copied profile's default gate runs only the primary workflow. The primary
standards gate also owns type checks, tests, audits, knip, and mutation testing.
Do not run both repair loops over one working tree. The root
`mise run standards:eslint-prettier:check` task proves that the secondary
workflow still accepts the canonical source, converges in scratch space, and
then checks its own output. After any tool-version change, run
`mise run ts:lock` and the relevant standards gate.

## Runtime note

`bunfig.toml` sets `[run] bun = true`, so package scripts and `node` shebang
subprocesses resolve through Bun's PATH shim. Mutation orchestration and tests
also run under Bun. Stryker core 10.0.0 and Bun runner 1.3.8 pass the full
fixture together; the runner's declared core peer range still names version 9.
Keep this pairing covered by the full mutation gate when upgrading either tool.

`bunfig.toml` also pins install posture: new dependencies land exact, and
`minimumReleaseAge` delays newly resolved versions for three days. OpenSSF
reports that most malicious packages are classified by OSV.dev within that
window; the delay does not revalidate locked versions or guarantee registry
removal. The emergency path for a critical patch younger than the window is a
per-package entry in `minimumReleaseAgeExcludes` — a wall edit that
requires human countersign and gets removed once the window passes.

Long-running Bun programs use `BunRuntime.runMain`. Framework applications
instead build one application-owned `ManagedRuntime`, dispose it at application
teardown, and supervise background work separately: disposing a ManagedRuntime
closes its layer but does not automatically own fibers launched by
`runFork`.
