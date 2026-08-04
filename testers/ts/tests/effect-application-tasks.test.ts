import { expect, test } from 'bun:test';
import { Cause, Data, Deferred, Effect, Option, Ref } from 'effect';

import { makeApplicationTaskService } from './support/application-task-service.js';

class BackgroundTaskFailure extends Data.TaggedError('BackgroundTaskFailure')<{
  readonly operation: string;
}> {}

test('application work survives component navigation and is interrupted on application shutdown', async () => {
  const result = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const started = yield* Deferred.make<undefined>();
        const interrupted = yield* Ref.make(false);
        const tasks = yield* makeApplicationTaskService(() => Effect.void);

        yield* tasks.start(
          Deferred.succeed(started, undefined).pipe(
            Effect.zipRight(Effect.never),
            Effect.onInterrupt(() => Ref.set(interrupted, true)),
          ),
        );
        yield* Deferred.await(started);

        // A component/request scope may end while the application task owner
        // remains alive. Closing this nested scope must not stop the task.
        yield* Effect.scoped(Effect.void);

        return {
          interrupted,
          interruptedBeforeApplicationShutdown: yield* Ref.get(interrupted),
        };
      }),
    ),
  );

  expect(result.interruptedBeforeApplicationShutdown).toBe(false);
  expect(await Effect.runPromise(Ref.get(result.interrupted))).toBe(true);
});

test('a non-interruption application task failure is observed exactly once', async () => {
  const result = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const observed = yield* Deferred.make<Cause.Cause<unknown>>();
        const observations = yield* Ref.make(0);
        const tasks = yield* makeApplicationTaskService((cause) =>
          Ref.update(observations, (count) => count + 1).pipe(
            Effect.zipRight(Deferred.succeed(observed, cause)),
            Effect.asVoid,
          ),
        );

        yield* tasks.start(Effect.fail(new BackgroundTaskFailure({ operation: 'refresh-cache' })));

        return {
          cause: yield* Deferred.await(observed),
          observations: yield* Ref.get(observations),
        };
      }),
    ),
  );

  expect(result.observations).toBe(1);
  expect(Option.getOrThrow(Cause.failureOption(result.cause))).toEqual(
    new BackgroundTaskFailure({ operation: 'refresh-cache' }),
  );
});
