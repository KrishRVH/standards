import { Effect } from 'effect';

export const invalid = Effect.gen(function* () {
  const run = () => Effect.runSync(Effect.succeed(1));
  return run();
});
