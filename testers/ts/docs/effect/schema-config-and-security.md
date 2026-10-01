# Schema, configuration, and security

The [enforcement map](enforcement.md) owns mandatory wording. This guide covers
Effect Schema and Config at untrusted boundaries.

## Decode external, keep internal checked

Use one Schema as the runtime authority for a wire/config/form/provider
contract. Derive `typeof Contract.Type` and `typeof Contract.Encoded`; do not
copy parallel interfaces or cast parsed JSON.

Inside an Effect workflow, use `Schema.decodeUnknownEffect` and
`Schema.encodeEffect` so `SchemaError` and Schema requirements remain visible
in `E` and `R`; a `*Sync` decoder there throws a defect instead. Build the
decoder once at module scope and call it per input. Outside an Effect workflow,
sync, `Exit`, `Result`, or Promise forms are reasonable when their
throw/error contract is explicit and tested.

Refine a schema with `.check(...)` and the `is*` filters, and express a custom
rule with `Schema.makeFilter`, whose predicate returns `true` or a failure
message:

```ts
const Port = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65_535 }));
const Targets = Schema.NonEmptyArray(Target).check(
  Schema.isMaxLength(16),
  Schema.makeFilter((targets) => new Set(targets.map(({ id }) => id)).size === targets.length || 'ids must be unique'),
);
```

`Schema.fromJsonString` composes JSON text with another Schema:

```ts
const PayloadJson = Schema.fromJsonString(Payload);
const decoded = Schema.decodeUnknownEffect(PayloadJson)(jsonText);
const encoded = Schema.encodeEffect(PayloadJson)(domainValue);
```

Choose excess-property behavior, optional versus nullable, defaults, and
encoded transformations deliberately. The pinned version strips excess object
keys by default; pass `{ onExcessProperty: 'error' }` where an unknown key is a
likely mistake. `SchemaError` issues omit the rejected input while the
`reportInput` parse option keeps its default `false`, but filter messages and
annotations can still embed values, and `SchemaError.message` renders them.
Public projection exposes only safe field/code information.

When a constructor normalizes values, validate the external representation
first. A policy boundary should decode finite bounded integer milliseconds and
then construct normalized `Duration.Duration`. Its internal checked policy no
longer contains `Duration.Input` or unchecked strings.

## Configuration and secrets

Load and validate Effect `Config` while building the application layer. Dynamic
refresh is a separate service contract. Config constructors are PascalCase
(`Config.String`, `Config.Int`, `Config.URL`, `Config.Duration`,
`Config.Redacted`). Tests build a provider with `ConfigProvider.fromUnknown`
from a nested object and provide it explicitly with
`Effect.provideService(ConfigProvider.ConfigProvider, provider)`.

Represent secrets with `Config.Redacted`/`Redacted`. Reveal a secret with
`Redacted.value` only inside the smallest provider adapter. Keep it out of
errors, public Schemas, parse details, logs, metrics, traces, snapshots, and
object inspection.

Direct environment access belongs only in a narrow non-Effect bootstrap/tooling
adapter. Effect application code uses `Config`, keeping requirements and test
providers visible.

## URL and origin authorization

An endpoint target has three distinct values:

- a stable caller-provided logical ID;
- a URL used only for transport; and
- a normalized safe origin used for authorization/diagnostics.

Decode configured origins as HTTPS origin-only values: valid URL, no
credentials, no meaningful path, no query, no fragment. Normalize with the
same `URL.origin` representation used for a target and reject duplicate origins
after normalization. Reject duplicate target IDs and reject unauthorized targets
before adapter invocation. Public results retain the logical ID, not arbitrary
path/query detail.

Reject redirects when a target set is fixed. Do not expose `Location` or claim
redirect authorization when the adapter rejects every redirect.

Exact-origin authorization does not defeat DNS rebinding, public hostnames that
resolve to private addresses, proxy changes, or connect-time address
substitution. Attacker-influenced production destinations may require resolver
and connect-time IP policy plus network egress enforcement. That belongs in a
production adapter/integration contract, not the small fake-fetch fixture.
