import { Effect } from 'effect';

// @ts-expect-error -- this fixture deliberately calls the removed v3 catchAll.
export const invalid = Effect.fail('boom').pipe(Effect.catchAll(() => Effect.succeed(1)));
