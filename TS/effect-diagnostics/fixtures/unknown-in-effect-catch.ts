import { Effect } from 'effect';

export const invalid = Effect.tryPromise({
  try: async () => 1,
  catch: (error) => error,
});
