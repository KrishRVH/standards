import * as Effect from 'effect/Effect';

export const invalid = Effect.gen(function* () {
  yield* Effect.log('before');
  yield* Effect.fail('boom');
});
