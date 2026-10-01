import { Clock, Context, Duration, Effect, Layer } from 'effect';
import { TestClock } from 'effect/testing';

interface ScheduledSleepsService {
  readonly wakeTimes: Effect.Effect<readonly number[]>;
}

class ScheduledSleeps extends Context.Service<ScheduledSleeps, ScheduledSleepsService>()(
  '@standards/tests/ScheduledSleeps',
) {}

/**
 * Virtual time for one test. TestClock keeps its sleep queue private, so
 * this clock also records each requested wake time as the sleep registers.
 */
export const testClockLayer: Layer.Layer<ScheduledSleeps> = Layer.effectContext(
  Effect.gen(function* () {
    const clock = yield* TestClock.make();
    const wakeTimes: number[] = [];
    const probedClock: TestClock.TestClock = {
      ...clock,
      sleep: (duration) =>
        Effect.suspend(() => {
          wakeTimes.push(clock.currentTimeMillisUnsafe() + Duration.toMillis(duration));

          return clock.sleep(duration);
        }),
    };

    return Context.make(Clock.Clock, probedClock).pipe(
      Context.add(ScheduledSleeps, ScheduledSleeps.of({ wakeTimes: Effect.sync(() => [...wakeTimes]) })),
    );
  }),
);

/** Wait until the virtual clock records the exact sleep the test intends to control. */
export const waitForScheduledSleep = (wakeTimeMillis: number): Effect.Effect<void, never, ScheduledSleeps> =>
  Effect.gen(function* () {
    const sleeps = yield* ScheduledSleeps;
    for (;;) {
      const wakeTimes = yield* sleeps.wakeTimes;
      if (wakeTimes.includes(wakeTimeMillis)) {
        return;
      }
      yield* Effect.yieldNow;
    }
  });
