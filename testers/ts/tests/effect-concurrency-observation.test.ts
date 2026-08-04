import { expect, test } from 'bun:test';
import { Cause, Data, Deferred, Effect, Either, Exit, Option, Ref } from 'effect';

class ParallelFailure extends Data.TaggedError('ParallelFailure') {}

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
