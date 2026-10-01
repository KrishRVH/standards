import { Context, Effect, Layer } from 'effect';

class A extends Context.Service<A, { readonly value: number }>()('@effect-diagnostics/A') {}

class B extends Context.Service<B, { readonly value: number }>()('@effect-diagnostics/B') {}

const ALive = Layer.succeed(A, { value: 1 });
const BLive = Layer.effect(
  B,
  Effect.map(A, ({ value }) => ({ value })),
);

export const invalid = Layer.mergeAll(ALive, BLive);
