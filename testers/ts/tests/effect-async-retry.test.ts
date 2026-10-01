import { expect, test } from 'bun:test';
import { Cause, Clock, Data, Deferred, Effect, Exit, Fiber, Option, Ref, Schedule } from 'effect';
import { TestClock } from 'effect/testing';

import { testClockLayer, waitForScheduledSleep } from './support/test-clock.js';

class AttemptBudgetExceeded extends Data.TaggedError('AttemptBudgetExceeded') {}

class OverallDeadlineExceeded extends Data.TaggedError('OverallDeadlineExceeded') {}

class TransientFailure extends Data.TaggedError('TransientFailure') {}

class AmbiguousCommit extends Data.TaggedError('AmbiguousCommit') {}

type OperationFailure = AmbiguousCommit | TransientFailure;

function retryDuplicateSafe<A, R>(
  effect: Effect.Effect<A, OperationFailure, R>,
): Effect.Effect<A, OperationFailure, R> {
  return effect.pipe(
    Effect.retry({
      times: 4,
      while: (failure) => failure._tag === 'TransientFailure',
    }),
  );
}

test('a signal-ignorant promise continues after its Effect times out', async () => {
  const underlying = Promise.withResolvers<undefined>();
  const completed = Promise.withResolvers<undefined>();
  let completionCount = 0;
  const program = Effect.gen(function* () {
    const started = yield* Deferred.make<undefined>();
    const operation = Deferred.succeed(started, undefined).pipe(
      Effect.andThen(
        Effect.tryPromise(() =>
          underlying.promise.then(() => {
            completionCount += 1;
            completed.resolve(undefined);
          }),
        ),
      ),
      Effect.timeoutOrElse({
        duration: '1 second',
        orElse: () => Effect.fail(new AttemptBudgetExceeded()),
      }),
    );
    const fiber = yield* Effect.forkChild(operation);

    yield* Deferred.await(started);
    yield* waitForScheduledSleep(1_000);
    yield* TestClock.adjust('1 second');

    return yield* Fiber.await(fiber);
  }).pipe(Effect.provide(testClockLayer));

  const exit = await Effect.runPromise(program);

  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    expect(Option.getOrThrow(Cause.findErrorOption(exit.cause))._tag).toBe('AttemptBudgetExceeded');
  }
  expect(completionCount).toBe(0);

  underlying.resolve(undefined);
  await completed.promise;

  expect(completionCount).toBe(1);
});

test('timeout inside retry gives every attempt a budget and includes backoff', async () => {
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const attempts = yield* Ref.make(0);
      const starts = yield* Ref.make<readonly number[]>([]);
      const firstAttemptStarted = yield* Deferred.make<undefined>();
      const attempt = Effect.gen(function* () {
        const attemptNumber = yield* Ref.updateAndGet(attempts, (count) => count + 1);
        const now = yield* Clock.currentTimeMillis;

        yield* Ref.update(starts, (values) => [...values, now]);
        if (attemptNumber === 1) {
          yield* Deferred.succeed(firstAttemptStarted, undefined);
        }

        return yield* Effect.never;
      }).pipe(
        Effect.timeoutOrElse({
          duration: '1 second',
          orElse: () => Effect.fail(new AttemptBudgetExceeded()),
        }),
      );
      const fiber = yield* Effect.forkChild(
        attempt.pipe(
          Effect.retry({
            schedule: Schedule.spaced('500 millis'),
            times: 2,
          }),
        ),
      );

      yield* Deferred.await(firstAttemptStarted);
      yield* waitForScheduledSleep(1_000);
      yield* TestClock.adjust('4 seconds');

      return {
        attempts: yield* Ref.get(attempts),
        exit: yield* Fiber.await(fiber),
        starts: yield* Ref.get(starts),
      };
    }).pipe(Effect.provide(testClockLayer)),
  );

  expect(result.attempts).toBe(3);
  expect(result.starts).toEqual([0, 1_500, 3_000]);
  expect(Exit.isFailure(result.exit)).toBe(true);
  if (Exit.isFailure(result.exit)) {
    expect(Option.getOrThrow(Cause.findErrorOption(result.exit.cause))._tag).toBe('AttemptBudgetExceeded');
  }
});

test('timeout outside retry caps the workflow and interrupts retry sleep', async () => {
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const starts = yield* Ref.make<readonly number[]>([]);
      const firstAttemptStarted = yield* Deferred.make<undefined>();
      const retryInterrupted = yield* Ref.make(false);
      const attempt = Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;

        yield* Ref.update(starts, (values) => [...values, now]);
        yield* Deferred.succeed(firstAttemptStarted, undefined);

        return yield* new TransientFailure();
      });
      const retrying = attempt.pipe(
        Effect.retry({
          schedule: Schedule.spaced('1 second'),
          times: 10,
        }),
        Effect.onInterrupt(() => Ref.set(retryInterrupted, true)),
      );
      const workflow = retrying.pipe(
        Effect.timeoutOrElse({
          duration: '2500 millis',
          orElse: () => Effect.fail(new OverallDeadlineExceeded()),
        }),
      );
      const fiber = yield* Effect.forkChild(workflow);

      yield* Deferred.await(firstAttemptStarted);
      yield* waitForScheduledSleep(1_000);
      yield* TestClock.adjust('2500 millis');

      return {
        exit: yield* Fiber.await(fiber),
        retryInterrupted: yield* Ref.get(retryInterrupted),
        starts: yield* Ref.get(starts),
      };
    }).pipe(Effect.provide(testClockLayer)),
  );

  expect(result.starts).toEqual([0, 1_000, 2_000]);
  expect(result.retryInterrupted).toBe(true);
  expect(Exit.isFailure(result.exit)).toBe(true);
  if (Exit.isFailure(result.exit)) {
    expect(Option.getOrThrow(Cause.findErrorOption(result.exit.cause))._tag).toBe('OverallDeadlineExceeded');
  }
});

test('an ambiguous non-idempotent mutation is not retried automatically', async () => {
  let attempts = 0;
  const exit = await Effect.runPromiseExit(
    retryDuplicateSafe(
      Effect.suspend(() => {
        attempts += 1;
        return Effect.fail(new AmbiguousCommit());
      }),
    ),
  );

  expect(attempts).toBe(1);
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    expect(Option.getOrThrow(Cause.findErrorOption(exit.cause))._tag).toBe('AmbiguousCommit');
  }
});

test('duplicate-safe retries reuse one logical-operation idempotency key', async () => {
  const idempotencyKey = 'order-123/charge';
  const observedKeys: string[] = [];
  let attempts = 0;
  const result = await Effect.runPromise(
    retryDuplicateSafe(
      Effect.suspend(() => {
        attempts += 1;
        observedKeys.push(idempotencyKey);

        return attempts < 3 ? Effect.fail(new TransientFailure()) : Effect.succeed('accepted');
      }),
    ),
  );

  expect(result).toBe('accepted');
  expect(attempts).toBe(3);
  expect(observedKeys).toEqual([idempotencyKey, idempotencyKey, idempotencyKey]);
});
