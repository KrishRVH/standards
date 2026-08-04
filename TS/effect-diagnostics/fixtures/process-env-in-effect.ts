import { Effect } from 'effect';

export const invalid = Effect.gen(function* () {
  return process.env.PORT;
});
