import * as Effect from 'effect/Effect';

export const invalid = Effect.gen(function* (_) {
  return yield* Effect.succeed(1);
});
