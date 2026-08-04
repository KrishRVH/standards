import { Effect } from 'effect';

export const invalid = Effect.gen(function* () {
  const now = Date.now();
  return now;
});
