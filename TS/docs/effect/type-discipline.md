# Type discipline

The [enforcement map](enforcement.md) owns mandatory wording (EFF-030, with
EFF-002 and EFF-020 at the data boundaries). This guide covers modeling
domain types so an illegal state cannot be constructed and a cast never
substitutes for evidence. The signature is the first contract an autonomous
agent reads; an invariant kept in a runtime check or a review comment is
invisible at every other call site.

## Tagged unions for variant state

When a bug forces the question "can this combination actually happen?", the
type is too loose. Model variants as a union with a shared `_tag` literal
discriminant — the discriminant Effect itself uses for `Option`, `Exit`, and
`Data.TaggedError` — so a contradictory state cannot be represented and
narrowing is automatic:

```ts
// A boolean plus optional fields admits contradictory states.
type CheckState = { checking: boolean; outcome?: EndpointOutcome; error?: string };

// Only valid states exist, and each arm carries exactly its data.
type CheckState =
  | { readonly _tag: 'Checking' }
  | { readonly _tag: 'Checked'; readonly outcome: EndpointOutcome }
  | { readonly _tag: 'CheckFailed'; readonly error: PublicCheckError };
```

`Data.taggedEnum` can generate constructors and matchers when a union has
many variants; a plain union type needs no ceremony.

Handle every variant exhaustively. In a `switch`, the terminal arm returns
`value satisfies never` — the pattern `src/endpoint-contracts.ts` uses — so
adding a variant breaks compilation at every unhandled site;
`typescript/switch-exhaustiveness-check` and a negative type fixture
guard the pattern. Inside Effect matching, `Match.exhaustive` is the
equivalent terminal.

## Branded identities

Brand a primitive when two values of the same primitive type cross one
signature and swapping them would still compile. Use `effect/Brand` from the
pinned dependency set rather than a hand-rolled `__brand` intersection, and
validate once at the constructor so downstream code trusts the type:

```ts
import { Brand } from 'effect';

type EndpointId = string & Brand.Brand<'EndpointId'>;
const EndpointId = Brand.refined<EndpointId>(
  (candidate) => /^[a-z][a-z0-9-]{0,63}$/.test(candidate),
  (candidate) => Brand.error(`invalid endpoint id: ${candidate}`),
);
```

At an untrusted boundary, `Schema.brand` composes the same brand into the
decode step (EFF-020), keeping creation and validation one act. Brand on
evidence of a real mix-up risk, not by reflex; a locally scoped number needs
no brand.

## Constructive invariants

Build the shape from parts that are all legal instead of policing a loose
type with repeated runtime checks. A collection that must not be empty is
`Array.NonEmptyReadonlyArray<A>`; a time range is a start plus a
non-negative duration, so a negative range cannot be written; a
pair-structured list is `ReadonlyArray<readonly [A, A]>`. Where a loose
value arrives, narrow once with a guard — `Array.isNonEmptyReadonlyArray` —
and the fact travels in the type from then on.

Strengthen only under pressure. Keep `ReadonlyArray<A>` while every
operation on it is total: `reduce` with an initial value treats empty as its
identity. The tells that a type is too loose appear at use sites — a
non-null assertion (lint-banned in `src/`), a narrowing cast, or a
"should never happen" throw. Either strengthen the input so the assertion
disappears, or weaken the result to `Option` so the empty case lands at the
call site, the one place that knows what empty means.

## Narrowing and earned casts

Prefer, in order: the discriminant `switch` or `Match`, the `in` operator,
`typeof`/`instanceof`, then a named guard (`isX`/`hasX`) whose body actually
verifies the claim — a guard that lies is worse than a cast because its name
asserts safety. A type assertion comes last and must be earned by validation
the compiler cannot see. In this profile that validation normally lives in a
Schema decode adapter (EFF-020), so a narrowing `as` surviving in
application code marks a modeling defect:
`typescript/no-unsafe-type-assertion` blocks it, and the exception
path is the standard per-site suppression whose reason names the validation
that earns the cast.

For conformance, use `satisfies`: it checks a value against a type without
widening literal inference, where an object-literal `as` silences
excess-property checking and admits missing fields
(`objectLiteralTypeAssertions: 'never'` blocks that form).

## Derived shapes

Every shape has one authority. Boundary contracts derive
`Schema.Schema.Type` and `Schema.Schema.Encoded` from their schema
(EFF-020). Interior reuse derives with `Pick`, `Omit`, `Parameters`,
`ReturnType`, `Awaited`, and `typeof` before declaring a new parallel
interface that can drift.

## Object arguments

An exported operation taking several same-typed positional parameters
invites a silently compiling swap. Pass one options object so call sites are
order-independent and self-labeling. Positional parameters remain fine for
one or two obviously distinct arguments and for measured hot paths where the
allocation shows up.
