import { Effect } from 'effect';

export const invalid = Effect.gen(function* () {
  const value = Math.random();
  return value;
});
