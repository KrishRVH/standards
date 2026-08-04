import { expect, test } from 'bun:test';
import {
  Cause,
  Context,
  Data,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Layer,
  ManagedRuntime,
  Option,
  Ref,
  TestClock,
  TestContext,
} from 'effect';

class UseFailure extends Data.TaggedError('UseFailure') {}

interface BaseService {
  readonly source: string;
}

class Base extends Context.Tag('@standards/tests/Base')<Base, BaseService>() {}

interface DependentService {
  readonly baseSource: string;
}

class Dependent extends Context.Tag('@standards/tests/Dependent')<Dependent, DependentService>() {}

interface LeftService {
  readonly value: string;
}

class Left extends Context.Tag('@standards/tests/Left')<Left, LeftService>() {}

interface RightService {
  readonly value: string;
}

class Right extends Context.Tag('@standards/tests/Right')<Right, RightService>() {}

class DuplicateKeyA extends Context.Tag('@standards/tests/Duplicate')<DuplicateKeyA, LeftService>() {}

class DuplicateKeyB extends Context.Tag('@standards/tests/Duplicate')<DuplicateKeyB, RightService>() {}

test('duplicate service identifiers alias the same runtime Context entry', () => {
  const context = Context.make(DuplicateKeyA, { value: 'from-a' });

  // unsafeGet deliberately bypasses the distinct static tag identities to
  // expose the runtime string-key collision this contract guards against.
  expect(Context.unsafeGet(context, DuplicateKeyB)).toEqual({ value: 'from-a' });
});

test('acquireRelease finalizes after success', async () => {
  let releases = 0;
  const result = await Effect.runPromise(
    Effect.acquireRelease(Effect.succeed('resource'), () =>
      Effect.sync(() => {
        releases += 1;
      }),
    ).pipe(
      Effect.map((resource) => `${resource}-used`),
      Effect.scoped,
    ),
  );

  expect(result).toBe('resource-used');
  expect(releases).toBe(1);
});

test('acquireRelease finalizes after typed failure', async () => {
  let releases = 0;
  const exit = await Effect.runPromiseExit(
    Effect.acquireRelease(Effect.succeed('resource'), () =>
      Effect.sync(() => {
        releases += 1;
      }),
    ).pipe(
      Effect.flatMap(() => Effect.fail(new UseFailure())),
      Effect.scoped,
    ),
  );

  expect(releases).toBe(1);
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    expect(Option.getOrThrow(Cause.failureOption(exit.cause))._tag).toBe('UseFailure');
    expect(Array.from(Cause.defects(exit.cause))).toEqual([]);
  }
});

test('acquireRelease finalizes after interruption', async () => {
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const acquired = yield* Deferred.make<undefined>();
      const releases = yield* Ref.make(0);
      const resource = Effect.acquireRelease(Deferred.succeed(acquired, undefined).pipe(Effect.as('resource')), () =>
        Ref.update(releases, (count) => count + 1),
      ).pipe(
        Effect.flatMap(() => Effect.never),
        Effect.scoped,
      );
      const fiber = yield* Effect.fork(resource);

      yield* Deferred.await(acquired);

      return {
        exit: yield* Fiber.interrupt(fiber),
        releases: yield* Ref.get(releases),
      };
    }),
  );

  expect(result.releases).toBe(1);
  expect(Exit.isFailure(result.exit)).toBe(true);
  if (Exit.isFailure(result.exit)) {
    expect(Cause.isInterruptedOnly(result.exit.cause)).toBe(true);
  }
});

test('a slow finalizer delays the interrupted Exit until release completes', async () => {
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const acquired = yield* Deferred.make<undefined>();
      const finalizerStarted = yield* Deferred.make<undefined>();
      const releases = yield* Ref.make(0);
      const resource = Effect.acquireRelease(Deferred.succeed(acquired, undefined).pipe(Effect.as('resource')), () =>
        Deferred.succeed(finalizerStarted, undefined).pipe(
          Effect.zipRight(Effect.sleep('5 seconds')),
          Effect.zipRight(Ref.update(releases, (count) => count + 1)),
        ),
      ).pipe(
        Effect.flatMap(() => Effect.never),
        Effect.scoped,
      );
      const resourceFiber = yield* Effect.fork(resource);

      yield* Deferred.await(acquired);

      const interruptFiber = yield* Effect.fork(Fiber.interrupt(resourceFiber));

      yield* Deferred.await(finalizerStarted);
      yield* TestClock.adjust('4 seconds');

      const beforeDeadline = yield* Fiber.poll(interruptFiber);

      yield* TestClock.adjust('1 second');

      return {
        beforeDeadline,
        exit: yield* Fiber.join(interruptFiber),
        releases: yield* Ref.get(releases),
      };
    }).pipe(Effect.provide(TestContext.TestContext)),
  );

  expect(Option.isNone(result.beforeDeadline)).toBe(true);
  expect(result.releases).toBe(1);
  expect(Exit.isFailure(result.exit)).toBe(true);
  if (Exit.isFailure(result.exit)) {
    expect(Cause.isInterruptedOnly(result.exit.cause)).toBe(true);
  }
});

test('a finalizer defect is retained sequentially with the use failure', async () => {
  const exit = await Effect.runPromiseExit(
    Effect.acquireRelease(Effect.succeed('resource'), () => Effect.die('release-defect')).pipe(
      Effect.flatMap(() => Effect.fail(new UseFailure())),
      Effect.scoped,
    ),
  );

  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    expect(Cause.isSequentialType(exit.cause)).toBe(true);
    expect(Array.from(Cause.failures(exit.cause), (failure) => failure._tag)).toEqual(['UseFailure']);
    expect(Array.from(Cause.defects(exit.cause))).toEqual(['release-defect']);
  }
});

test('mergeAll sibling output does not satisfy a sibling dependency', async () => {
  const siblingBase = Layer.succeed(Base, { source: 'sibling' });
  const dependentLive = Layer.effect(
    Dependent,
    Effect.map(Base, ({ source }) => ({ baseSource: source })),
  );
  // Deliberately wrong topology: this probe proves why the sibling layers cannot
  // be treated as provider and consumer. The outer Base is the actual provider.
  // @effect-diagnostics-next-line layerMergeAllWithDependencies:off
  const incorrectlyMerged = Layer.mergeAll(siblingBase, dependentLive);
  const context = await Effect.runPromise(
    Layer.build(incorrectlyMerged).pipe(Effect.provideService(Base, { source: 'outer' }), Effect.scoped),
  );

  expect(Context.get(context, Base).source).toBe('sibling');
  expect(Context.get(context, Dependent).baseSource).toBe('outer');
});

test('a shared root layer acquires once and ManagedRuntime disposes it once', async () => {
  let acquisitions = 0;
  let releases = 0;
  const baseLive = Layer.scoped(
    Base,
    Effect.acquireRelease(
      Effect.sync(() => {
        acquisitions += 1;
        return { source: 'shared' };
      }),
      () =>
        Effect.sync(() => {
          releases += 1;
        }),
    ),
  );
  const leftLive = Layer.effect(
    Left,
    Effect.map(Base, ({ source }) => ({ value: `${source}-left` })),
  );
  const rightLive = Layer.effect(
    Right,
    Effect.map(Base, ({ source }) => ({ value: `${source}-right` })),
  );
  const appLive = Layer.mergeAll(leftLive, rightLive).pipe(Layer.provideMerge(baseLive));
  const runtime = ManagedRuntime.make(appLive);

  try {
    const first = await runtime.runPromise(Effect.all({ base: Base, left: Left, right: Right }));
    const second = await runtime.runPromise(Base);

    expect(first).toEqual({
      base: { source: 'shared' },
      left: { value: 'shared-left' },
      right: { value: 'shared-right' },
    });
    expect(second).toEqual({ source: 'shared' });
    expect(acquisitions).toBe(1);
    expect(releases).toBe(0);
  } finally {
    await runtime.dispose();
  }

  expect(releases).toBe(1);
});

test('ManagedRuntime AbortSignal interrupts a runtime-run Effect', async () => {
  const runtime = ManagedRuntime.make(Layer.empty);
  const started = Promise.withResolvers<undefined>();
  let interruptions = 0;
  const controller = new AbortController();

  try {
    const pending = runtime.runPromiseExit(
      Effect.sync(() => {
        started.resolve(undefined);
      }).pipe(
        Effect.zipRight(Effect.never),
        Effect.onInterrupt(() =>
          Effect.sync(() => {
            interruptions += 1;
          }),
        ),
      ),
      { signal: controller.signal },
    );

    await started.promise;
    controller.abort();

    const exit = await pending;

    expect(interruptions).toBe(1);
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(Cause.isInterruptedOnly(exit.cause)).toBe(true);
    }
  } finally {
    await runtime.dispose();
  }
});

test('disposing ManagedRuntime does not supervise a runFork fiber', async () => {
  const runtime = ManagedRuntime.make(Layer.empty);
  const started = Promise.withResolvers<undefined>();
  let interruptions = 0;
  const fiber = runtime.runFork(
    Effect.sync(() => {
      started.resolve(undefined);
    }).pipe(
      Effect.zipRight(Effect.never),
      Effect.onInterrupt(() =>
        Effect.sync(() => {
          interruptions += 1;
        }),
      ),
    ),
  );

  await started.promise;
  await runtime.dispose();

  try {
    const afterDispose = await Effect.runPromise(Fiber.poll(fiber));

    expect(Option.isNone(afterDispose)).toBe(true);
    expect(interruptions).toBe(0);
  } finally {
    await Effect.runPromise(Fiber.interrupt(fiber));
  }

  expect(interruptions).toBe(1);
});

test('top-level runFork remains live until its returned fiber is interrupted', async () => {
  const started = Promise.withResolvers<undefined>();
  let interruptions = 0;
  const fiber = Effect.runFork(
    Effect.sync(() => {
      started.resolve(undefined);
    }).pipe(
      Effect.zipRight(Effect.never),
      Effect.onInterrupt(() =>
        Effect.sync(() => {
          interruptions += 1;
        }),
      ),
    ),
  );

  await started.promise;

  try {
    const beforeInterrupt = await Effect.runPromise(Fiber.poll(fiber));

    expect(Option.isNone(beforeInterrupt)).toBe(true);
    expect(interruptions).toBe(0);
  } finally {
    await Effect.runPromise(Fiber.interrupt(fiber));
  }

  expect(interruptions).toBe(1);
});
