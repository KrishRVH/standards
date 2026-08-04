# Schema, configuration, and security

The [enforcement map](enforcement.md) owns mandatory wording. This guide covers
Effect Schema and Config at untrusted boundaries.

## Decode external, keep internal checked

Use one Schema as the runtime authority for a wire/config/form/provider
contract. Derive `Schema.Schema.Type` and `Schema.Schema.Encoded`; do not copy
parallel interfaces or cast parsed JSON.

Inside an Effect workflow, use Effect-returning decode and encode so
`ParseError` and Schema requirements remain visible in `E` and `R`. Outside an
Effect workflow, sync, `Either`, or Promise forms are reasonable when their
throw/error contract is explicit and tested.

`Schema.parseJson` composes JSON text with another Schema:

```ts
const PayloadJson = Schema.parseJson(Payload);
const decoded = Schema.decodeUnknown(PayloadJson)(jsonText);
const encoded = Schema.encode(PayloadJson)(domainValue);
```

Choose excess-property behavior, optional versus nullable, defaults, and
encoded transformations deliberately. Effect 3.22.1 strips excess object keys
by default. Raw ParseError trees may contain input; public projection exposes
only safe field/code information.

When a constructor normalizes values, validate the external representation
first. A policy boundary should decode finite bounded integer milliseconds and
then construct normalized `Duration.Duration`. Its internal checked policy no
longer contains `DurationInput` or unchecked strings.

## Configuration and secrets

Load and validate Effect `Config` while building the application layer. Dynamic
refresh is a separate service contract. Tests use `ConfigProvider.fromMap` and
provide it explicitly.

Represent secrets with `Config.redacted`/`Redacted`. Reveal a secret only inside
the smallest provider adapter. Keep it out of errors, public Schemas, parse
details, logs, metrics, traces, snapshots, and object inspection.

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
same `URL.origin` representation used for a target and deduplicate after
normalization. Reject duplicate target IDs and reject unauthorized targets
before adapter invocation. Public results retain the logical ID, not arbitrary
path/query detail.

Reject redirects when a target set is fixed. Do not expose `Location` or claim
redirect authorization when the adapter rejects every redirect.

Exact-origin authorization does not defeat DNS rebinding, public hostnames that
resolve to private addresses, proxy changes, or connect-time address
substitution. Attacker-influenced production destinations may require resolver
and connect-time IP policy plus network egress enforcement. That belongs in a
production adapter/integration contract, not the small fake-fetch fixture.
