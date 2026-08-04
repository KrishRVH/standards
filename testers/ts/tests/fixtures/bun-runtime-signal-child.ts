import * as BunRuntime from '@effect/platform-bun/BunRuntime';
import { Effect } from 'effect';

const main = Effect.acquireRelease(
  Effect.sync(() => {
    process.stdout.write('ACQUIRED\n');
  }),
  () =>
    Effect.sync(() => {
      process.stdout.write('FINALIZED\n');
    }),
).pipe(Effect.zipRight(Effect.never), Effect.scoped);

BunRuntime.runMain(main, {
  disableErrorReporting: true,
  disablePrettyLogger: true,
});

// `runMain` registers SIGINT/SIGTERM handlers before it returns. The parent
// waits for this marker so it cannot signal during synchronous acquisition.
process.stdout.write('HANDLERS_READY\n');
