import { expect, test } from 'bun:test';
import { Cause, Context, Data, Deferred, Effect, Exit, Fiber, Layer, ManagedRuntime, Option, Ref } from 'effect';

class UseFailure extends Data.TaggedError('UseFailure') {}

interface BaseService {
  readonly source: string;
}

class Base extends Context.Service<Base, BaseService>()('@standards/tests/Base') {}

interface DependentService {
  readonly baseSource: string;
}

class Dependent extends Context.Service<Dependent, DependentService>()('@standards/tests/Dependent') {}

interface LeftService {
  readonly value: string;
}

class Left extends Context.Service<Left, LeftService>()('@standards/tests/Left') {}

interface RightService {
  readonly value: string;
}

class Right extends Context.Service<Right, RightService>()('@standards/tests/Right') {}

class DuplicateKeyA extends Context.Service<DuplicateKeyA, LeftService>()('@standards/tests/Duplicate') {}

class DuplicateKeyB extends Context.Service<DuplicateKeyB, RightService>()('@standards/tests/Duplicate') {}

test('duplicate service identifiers alias the same runtime Context entry', () => {
  const context = Context.make(DuplicateKeyA, { value: 'from-a' });

  // getUnsafe deliberately bypasses the distinct static service identities to
  // expose the runtime string-key collision this contract guards against.
  expect(Context.getUnsafe(context, DuplicateKeyB)).toEqual({ value: 'from-a' });
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
    expect(Option.getOrThrow(Cause.findErrorOption(exit.cause))._tag).toBe('UseFailure');
    expect(Cause.hasDies(exit.cause)).toBe(false);
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
      const fiber = yield* Effect.forkChild(resource);

      yield* Deferred.await(acquired);

      yield* Fiber.interrupt(fiber);

      return {
        exit: yield* Fiber.await(fiber),
        releases: yield* Ref.get(releases),
      };
    }),
  );

  expect(result.releases).toBe(1);
  expect(Exit.isFailure(result.exit)).toBe(true);
  if (Exit.isFailure(result.exit)) {
    expect(Cause.hasInterruptsOnly(result.exit.cause)).toBe(true);
  }
});

// The finalizer waits on a gate instead of virtual time: the pinned TestClock
// forks its warning fiber interruptibly, so a pending interrupt can end a
// virtual sleep inside an otherwise uninterruptible finalizer.
test('a slow finalizer delays the interrupted Exit until release completes', async () => {
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const acquired = yield* Deferred.make<undefined>();
      const finalizerStarted = yield* Deferred.make<undefined>();
      const finishRelease = yield* Deferred.make<undefined>();
      const releases = yield* Ref.make(0);
      const resource = Effect.acquireRelease(Deferred.succeed(acquired, undefined).pipe(Effect.as('resource')), () =>
        Deferred.succeed(finalizerStarted, undefined).pipe(
          Effect.andThen(Deferred.await(finishRelease)),
          Effect.andThen(Ref.update(releases, (count) => count + 1)),
        ),
      ).pipe(
        Effect.flatMap(() => Effect.never),
        Effect.scoped,
      );
      const resourceFiber = yield* Effect.forkChild(resource);

      yield* Deferred.await(acquired);

      const interruptFiber = yield* Effect.forkChild(Fiber.interrupt(resourceFiber));

      yield* Deferred.await(finalizerStarted);
      yield* Effect.yieldNow;

      const beforeRelease = {
        interruption: interruptFiber.pollUnsafe(),
        resource: resourceFiber.pollUnsafe(),
      };

      yield* Deferred.succeed(finishRelease, undefined);
      yield* Fiber.join(interruptFiber);

      return {
        beforeRelease,
        exit: yield* Fiber.await(resourceFiber),
        releases: yield* Ref.get(releases),
      };
    }),
  );

  expect(result.beforeRelease).toEqual({ interruption: undefined, resource: undefined });
  expect(result.releases).toBe(1);
  expect(Exit.isFailure(result.exit)).toBe(true);
  if (Exit.isFailure(result.exit)) {
    expect(Cause.hasInterruptsOnly(result.exit.cause)).toBe(true);
  }
});

test('a finalizer defect is retained after the use failure', async () => {
  const exit = await Effect.runPromiseExit(
    Effect.acquireRelease(Effect.succeed('resource'), () => Effect.die('release-defect')).pipe(
      Effect.flatMap(() => Effect.fail(new UseFailure())),
      Effect.scoped,
    ),
  );

  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    expect(exit.cause.reasons.map(({ _tag }) => _tag)).toEqual(['Fail', 'Die']);
    expect(exit.cause.reasons.filter(Cause.isFailReason).map(({ error }) => error._tag)).toEqual(['UseFailure']);
    expect(exit.cause.reasons.filter(Cause.isDieReason).map(({ defect }) => defect)).toEqual(['release-defect']);
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
  const baseLive = Layer.effect(
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
        Effect.andThen(Effect.never),
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
      expect(Cause.hasInterruptsOnly(exit.cause)).toBe(true);
    }
  } finally {
    await runtime.dispose();
  }
});

test('disposing ManagedRuntime interrupts a fiber it forked without observing its result', async () => {
  const runtime = ManagedRuntime.make(Layer.empty);
  const started = Promise.withResolvers<undefined>();
  let interruptions = 0;
  const fiber = runtime.runFork(
    Effect.sync(() => {
      started.resolve(undefined);
    }).pipe(
      Effect.andThen(Effect.never),
      Effect.onInterrupt(() =>
        Effect.sync(() => {
          interruptions += 1;
        }),
      ),
    ),
  );

  await started.promise;
  expect(fiber.pollUnsafe()).toBeUndefined();

  await runtime.dispose();

  const exit = fiber.pollUnsafe();

  expect(interruptions).toBe(1);
  expect(exit).toBeDefined();
  if (exit !== undefined) {
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(Cause.hasInterruptsOnly(exit.cause)).toBe(true);
    }
  }
});

test('top-level runFork remains live until its returned fiber is interrupted', async () => {
  const started = Promise.withResolvers<undefined>();
  let interruptions = 0;
  const fiber = Effect.runFork(
    Effect.sync(() => {
      started.resolve(undefined);
    }).pipe(
      Effect.andThen(Effect.never),
      Effect.onInterrupt(() =>
        Effect.sync(() => {
          interruptions += 1;
        }),
      ),
    ),
  );

  await started.promise;

  try {
    expect(fiber.pollUnsafe()).toBeUndefined();
    expect(interruptions).toBe(0);
  } finally {
    await Effect.runPromise(Fiber.interrupt(fiber));
  }

  expect(interruptions).toBe(1);
});
