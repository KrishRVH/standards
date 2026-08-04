import { Effect } from 'effect';

export const invalid = Effect.try({
  try: () => JSON.parse('{'),
  catch: (error) => Effect.logError(error),
});
