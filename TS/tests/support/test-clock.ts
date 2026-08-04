import { Effect, TestClock } from 'effect';

/** Wait until the virtual clock records the exact sleep the test intends to control. */
export const waitForScheduledSleep = (wakeTimeMillis: number): Effect.Effect<void> =>
  Effect.gen(function* () {
    for (;;) {
      const sleeps = yield* TestClock.sleeps();
      if (Array.from(sleeps).includes(wakeTimeMillis)) {
        return;
      }
      yield* Effect.yieldNow();
    }
  });
