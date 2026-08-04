import { Effect } from 'effect';

export const invalid = Effect.gen(function* () {
  setTimeout(() => {}, 100);
});
