import { expect, test } from 'bun:test';
import { Cause, Data, Deferred, Effect, Either, Exit, Fiber, Logger, Option, Ref } from 'effect';

class ParallelFailure extends Data.TaggedError('ParallelFailure') {}

class ObservedFailure extends Data.TaggedError('ObservedFailure') {}

test('bounded forEach never exceeds its configured concurrency', async () => {
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const active = yield* Ref.make(0);
      const maximum = yield* Ref.make(0);
      const twoStarted = yield* Deferred.make<undefined>();
      const release = yield* Deferred.make<undefined>();
      const workflow = Effect.forEach(
        [1, 2, 3, 4, 5],
        (value) =>
          Effect.gen(function* () {
            const nowActive = yield* Ref.updateAndGet(active, (count) => count + 1);

            yield* Ref.update(maximum, (current) => Math.max(current, nowActive));
            if (nowActive === 2) {
              yield* Deferred.succeed(twoStarted, undefined);
            }

            yield* Deferred.await(release);

            return value;
          }).pipe(Effect.ensuring(Ref.update(active, (count) => count - 1))),
        { concurrency: 2 },
      );
      const fiber = yield* Effect.fork(workflow);

      yield* Deferred.await(twoStarted);

      const maximumBeforeRelease = yield* Ref.get(maximum);

      yield* Deferred.succeed(release, undefined);

      const values = yield* Fiber.join(fiber);

      return {
        activeAfter: yield* Ref.get(active),
        maximum: yield* Ref.get(maximum),
        maximumBeforeRelease,
        values,
      };
    }),
  );

  expect(result.maximumBeforeRelease).toBe(2);
  expect(result.maximum).toBe(2);
  expect(result.activeAfter).toBe(0);
  expect(result.values).toEqual([1, 2, 3, 4, 5]);
});

test('fail-fast parallel execution interrupts a blocked sibling', async () => {
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const siblingStarted = yield* Deferred.make<undefined>();
      const siblingInterrupted = yield* Ref.make(false);
      const sibling = Deferred.succeed(siblingStarted, undefined).pipe(
        Effect.zipRight(Effect.never),
        Effect.onInterrupt(() => Ref.set(siblingInterrupted, true)),
      );
      const failure = Deferred.await(siblingStarted).pipe(Effect.zipRight(Effect.fail(new ParallelFailure())));
      const exit = yield* Effect.exit(Effect.all([sibling, failure], { concurrency: 2 }));

      return {
        exit,
        siblingInterrupted: yield* Ref.get(siblingInterrupted),
      };
    }),
  );

  expect(result.siblingInterrupted).toBe(true);
  expect(Exit.isFailure(result.exit)).toBe(true);
  if (Exit.isFailure(result.exit)) {
    expect(Option.getOrThrow(Cause.failureOption(result.exit.cause))._tag).toBe('ParallelFailure');
  }
});

test('either outcome mode runs every task and preserves input order', async () => {
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const ran = yield* Ref.make<readonly number[]>([]);
      const outcomes = yield* Effect.all(
        [0, 1, 2].map((index) =>
          Ref.update(ran, (values) => [...values, index]).pipe(
            Effect.zipRight(index % 2 === 0 ? Effect.fail(`rejected-${index}`) : Effect.succeed(`accepted-${index}`)),
          ),
        ),
        { concurrency: 2, mode: 'either' },
      );

      return { outcomes, ran: yield* Ref.get(ran) };
    }),
  );
  const projected = result.outcomes.map((outcome) =>
    Either.isLeft(outcome) ? { left: outcome.left } : { right: outcome.right },
  );

  expect([...result.ran].sort()).toEqual([0, 1, 2]);
  expect(projected).toEqual([{ left: 'rejected-0' }, { right: 'accepted-1' }, { left: 'rejected-2' }]);
});

test('observing the same propagated failure at two layers duplicates logging', async () => {
  const entries: unknown[] = [];
  const logger = Logger.make<unknown, undefined>(({ message }) => {
    entries.push(message);
    return undefined;
  });
  const lowerLayer = Effect.fail(new ObservedFailure()).pipe(Effect.tapErrorCause((cause) => Effect.logError(cause)));
  const upperLayer = lowerLayer.pipe(Effect.tapErrorCause((cause) => Effect.logError(cause)));
  const exit = await Effect.runPromiseExit(
    upperLayer.pipe(Effect.provide(Logger.replace(Logger.defaultLogger, logger))),
  );

  expect(entries).toHaveLength(2);
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    expect(Option.getOrThrow(Cause.failureOption(exit.cause))._tag).toBe('ObservedFailure');
  }
});
