import { Effect } from 'effect';

export const invalid = Effect.gen(function* () {
  yield* Effect.context<unknown>();
  return yield* Effect.fail<any>('boom');
});
