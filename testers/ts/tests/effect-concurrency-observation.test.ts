import { expect, test } from 'bun:test';
import { Cause, Data, Deferred, Effect, Exit, Option, Ref, Result } from 'effect';

class ParallelFailure extends Data.TaggedError('ParallelFailure') {}

test('fail-fast parallel execution interrupts a blocked sibling', async () => {
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const siblingStarted = yield* Deferred.make<undefined>();
      const siblingInterrupted = yield* Ref.make(false);
      const sibling = Deferred.succeed(siblingStarted, undefined).pipe(
        Effect.andThen(Effect.never),
        Effect.onInterrupt(() => Ref.set(siblingInterrupted, true)),
      );
      const failure = Deferred.await(siblingStarted).pipe(Effect.andThen(Effect.fail(new ParallelFailure())));
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
    expect(Option.getOrThrow(Cause.findErrorOption(result.exit.cause))._tag).toBe('ParallelFailure');
  }
});

test('result outcome mode runs every task and preserves input order', async () => {
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const ran = yield* Ref.make<readonly number[]>([]);
      const outcomes = yield* Effect.all(
        [0, 1, 2].map((index) =>
          Ref.update(ran, (values) => [...values, index]).pipe(
            Effect.andThen(index % 2 === 0 ? Effect.fail(`rejected-${index}`) : Effect.succeed(`accepted-${index}`)),
          ),
        ),
        { concurrency: 2, mode: 'result' },
      );

      return { outcomes, ran: yield* Ref.get(ran) };
    }),
  );
  const projected = result.outcomes.map((outcome) =>
    Result.isFailure(outcome) ? { failure: outcome.failure } : { success: outcome.success },
  );

  expect([...result.ran].sort()).toEqual([0, 1, 2]);
  expect(projected).toEqual([{ failure: 'rejected-0' }, { success: 'accepted-1' }, { failure: 'rejected-2' }]);
});
