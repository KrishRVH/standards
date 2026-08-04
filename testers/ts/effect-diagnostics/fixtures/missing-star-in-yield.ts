import * as Effect from 'effect/Effect';

export const invalid = Effect.gen(function* () {
  const value = yield Effect.succeed(1);
  return value;
});
