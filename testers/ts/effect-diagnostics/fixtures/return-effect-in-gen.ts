import * as Effect from 'effect/Effect';

export const invalid = Effect.gen(function* () {
  return Effect.succeed(1);
});
