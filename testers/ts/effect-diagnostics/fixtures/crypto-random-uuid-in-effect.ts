import { Effect } from 'effect';

export const invalid = Effect.gen(function* () {
  const id = crypto.randomUUID();
  return id;
});
