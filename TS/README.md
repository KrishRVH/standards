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

## Profile boundary

This is a Bun application baseline, not one universal tsconfig for Bun servers,
browser bundles, React Native, and published libraries. Universal Effect rules
stay in the core; Bun CLI/server, browser/framework UI, published-library, and
optional observability guidance are explicit overlays.

Pure synchronous calculations stay plain TypeScript. Use Effect where typed
operational failure, service requirements, interruption, concurrency, or
resource lifetime is useful. Use Effect Schema at untrusted/runtime contract
boundaries; internal trusted types do not require schemas.

The canonical endpoint checker is intentionally small:

- `src/endpoint-checker.ts` shows bounded unknown decoding, exact-origin and
  redirect authorization, wire encoding, a public error algebra, explicit
  service/tag/live layer, signal-aware promise adapter, per-attempt timeout,
  narrowly classified duplicate-safe retry with jitter, overall deadline,
  bounded concurrency, and safe error projection.
- `src/main.ts` uses the narrow
  `@effect/platform-bun/BunRuntime` import and `BunRuntime.runMain`.
- `tests/endpoint-checker.test.ts` asserts exact ParseError, limits,
  destination rejection, cancellation, attempts, non-retry, encoding, and
  projection behavior.
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
Effect diagnostics, expected diagnostics, formatting, deterministic tests, and
`bun audit --audit-level=low`.

The recommended fast repair loop is format check, lint, TypeScript, Effect
diagnostics, semantic tests, audit, then the aggregate gate. `AGENTS.md`
contains the full verification and upgrade protocols.

## Tooling choices

The committed default is Option A: type-aware ESLint plus Prettier. The config
sets `@typescript-eslint/no-floating-promises` with `ignoreVoid: false`; writing
`void runtime.runPromise(...)` is not accepted as background-task ownership.

`skipLibCheck` is false. This costs some feedback time but catches incompatible
dependency declarations, as the platform-bun barrel probe demonstrated.
Re-enable it only after measuring a material project-specific cost and record
which declaration mismatch becomes invisible.

`moduleResolution: "bundler"`, Bun types, and the Bun package manager are
application-profile choices. Browser, React Native, and published-library
projects need their own runtime/module/declaration overlay rather than
weakening this one.

`biome.jsonc` is Option B for projects that deliberately replace both ESLint
and Prettier with Biome 2.5.5. The catalog validates that alternative
separately; it is not installed or run by the default project.

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
The Biome baseline enables stable rules, excludes the semver-unstable nursery
group, and leaves TypeScript responsible for module resolution and Effect
channel correctness.

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
