# Production observability overlay

Read this overlay before adding logging, metrics, tracing, incident metadata, or
an observability exporter. The [enforcement map](../enforcement.md) owns
mandatory wording. The copyable core intentionally has no OpenTelemetry or
logging-stack dependency.

## Projection before emission

Project an internal failure to an application-owned, allowlisted diagnostic
before giving it to a logger, metric, or tracer. A useful diagnostic commonly
contains a low-cardinality `failureKind`, stable operation name, safe resource
ID, bounded attempt count, and coarse status class. The union remains
application-specific.

Do not build classification from a foreign `constructor.name` or arbitrary
message. Do not emit raw provider objects, messages, stack traces as fields,
headers, SQL, payloads, URL path/query/fragment, prompts, credentials, or PII.
If stack capture is required for defect investigation, keep it in a restricted
defect channel with its own access and retention policy.

## One handling owner

Every failure is propagated, transformed, counted, or observed by the boundary
that owns handling it. Propagating layers may attach safe structured context but
do not repeatedly log the same failure. Public projection and telemetry
projection are separate operations.

Expected domain rejection is not automatically a server error. Interruption is
ordinary cancellation/shutdown telemetry when useful, not a provider failure.
An exhausted expected failure and a defect remain distinguishable.

Attempt counts and `retry-exhausted` classification must originate from the
automatic retry owner or from structured metadata produced by that owner. A
raw optional integer passed to a projector must not manufacture retry
exhaustion.

## Cardinality and exporter lifetime

Use stable operation and resource names, coarse status classes, and bounded
attempt values. User IDs, raw URLs, request IDs used as metric labels, and
provider messages create high-cardinality or sensitive telemetry.
Event/log/span context and metric dimensions are not interchangeable: a
resource identifier that is safe in an event can still be too high-cardinality
as a metric label.

When an exporter is adopted, acquire it in a scoped layer, make propagation
explicit, bound its queues, and give shutdown flushing a liveness budget. A
failed exporter must not recursively generate unbounded telemetry. Tests capture
the safe projection before the real exporter and assert both retained
classification and forbidden substrings.
