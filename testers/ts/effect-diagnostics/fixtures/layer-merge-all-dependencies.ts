import { Context, Effect, Layer } from 'effect';

class A extends Context.Tag('@effect-diagnostics/A')<A, { readonly value: number }>() {}

class B extends Context.Tag('@effect-diagnostics/B')<B, { readonly value: number }>() {}

const ALive = Layer.succeed(A, { value: 1 });
const BLive = Layer.effect(
  B,
  Effect.map(A, ({ value }) => ({ value })),
);

export const invalid = Layer.mergeAll(ALive, BLive);
