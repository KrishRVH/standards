import { expect, test } from 'bun:test';
import { Cause, Data, Effect } from 'effect';

import { makeOperationController } from './support/operation-controller.js';
import { makeRuntimeLeaseOwner } from './support/runtime-lease.js';

class OperationRejected extends Data.TaggedError('OperationRejected') {}

const makeController = () => {
  const failures: Cause.Cause<unknown>[] = [];

  return {
    controller: makeOperationController((cause) => failures.push(cause)),
    failures,
  };
};

test('interrupt revokes publication even when underlying work ignores cancellation', async () => {
  const started = Promise.withResolvers<undefined>();
  const completion = Promise.withResolvers<string>();
  const underlyingFinished = Promise.withResolvers<undefined>();
  const published: string[] = [];
  const { controller, failures } = makeController();

  controller.start(
    Effect.tryPromise(() => {
      started.resolve(undefined);

      return completion.promise.then((value) => {
        underlyingFinished.resolve(undefined);
        return value;
      });
    }),
    (value) => {
      published.push(value);
    },
  );

  await started.promise;
  controller.interrupt();
  completion.resolve('stale-result');
  await underlyingFinished.promise;
  await controller.interruptAndWait();

  expect(published).toEqual([]);
  expect(failures).toEqual([]);
});

test('replaceWith waits for the previous finalizer before starting replacement work', async () => {
  const acquired = Promise.withResolvers<undefined>();
  const finalizerStarted = Promise.withResolvers<undefined>();
  const releaseFinalizer = Promise.withResolvers<undefined>();
  const replacementStarted = Promise.withResolvers<undefined>();
  let replacementHasStarted = false;
  const { controller } = makeController();
  const previous = Effect.acquireRelease(
    Effect.sync(() => {
      acquired.resolve(undefined);
    }),
    () =>
      Effect.promise(() => {
        finalizerStarted.resolve(undefined);
        return releaseFinalizer.promise;
      }),
  ).pipe(Effect.zipRight(Effect.never), Effect.scoped);

  controller.start(previous, () => undefined);
  await acquired.promise;

  const replacement = controller.replaceWith(
    Effect.sync(() => {
      replacementHasStarted = true;
      replacementStarted.resolve(undefined);
      return 'replacement-result';
    }),
    () => undefined,
  );

  await finalizerStarted.promise;
  expect(replacementHasStarted).toBe(false);

  releaseFinalizer.resolve(undefined);
  await replacement;
  await replacementStarted.promise;

  expect(replacementHasStarted).toBe(true);
  await controller.interruptAndWait();
});

test('a nearly completed old operation cannot publish after replacement revokes it', async () => {
  const oldStarted = Promise.withResolvers<undefined>();
  const oldCompletion = Promise.withResolvers<string>();
  const oldFinished = Promise.withResolvers<undefined>();
  const replacementStarted = Promise.withResolvers<undefined>();
  const published: string[] = [];
  const { controller } = makeController();

  controller.start(
    Effect.tryPromise(() => {
      oldStarted.resolve(undefined);

      return oldCompletion.promise.finally(() => oldFinished.resolve(undefined));
    }),
    (value) => published.push(value),
  );
  await oldStarted.promise;

  const replacement = controller.replaceWith(
    Effect.sync(() => {
      replacementStarted.resolve(undefined);
      return 'new-result';
    }),
    (value) => published.push(value),
  );
  oldCompletion.resolve('old-result');

  await replacement;
  await oldFinished.promise;
  await replacementStarted.promise;
  await controller.interruptAndWait();

  expect(published).not.toContain('old-result');
});

test('the operation owner observes expected failures and defects but not interruption', async () => {
  const firstFailure = Promise.withResolvers<Cause.Cause<unknown>>();
  const secondFailure = Promise.withResolvers<Cause.Cause<unknown>>();
  const observed: Cause.Cause<unknown>[] = [];
  const controller = makeOperationController((cause) => {
    observed.push(cause);
    (observed.length === 1 ? firstFailure : secondFailure).resolve(cause);
  });

  controller.start(Effect.fail(new OperationRejected()), () => undefined);
  const expectedCause = await firstFailure.promise;
  expect(Array.from(Cause.failures(expectedCause))).toEqual([new OperationRejected()]);

  controller.start(Effect.die('defect-sentinel'), () => undefined);
  const defectCause = await secondFailure.promise;
  expect(Array.from(Cause.defects(defectCause))).toEqual(['defect-sentinel']);

  controller.start(Effect.never, () => undefined);
  await controller.interruptAndWait();
  expect(observed).toHaveLength(2);
});

test('Strict Mode retain-release-remount reuses and does not prematurely dispose the runtime', async () => {
  const created: object[] = [];
  const disposed: object[] = [];
  const owner = makeRuntimeLeaseOwner(
    () => {
      const runtime = {};
      created.push(runtime);
      return runtime;
    },
    (runtime) => {
      disposed.push(runtime);
      return Promise.resolve();
    },
    () => {
      throw new Error('Runtime disposal unexpectedly failed.');
    },
  );

  const firstMount = owner.retain();
  firstMount.release();
  const strictModeRemount = owner.retain();
  await Promise.resolve();

  expect(strictModeRemount.value).toBe(firstMount.value);
  expect(created).toHaveLength(1);
  expect(disposed).toEqual([]);

  strictModeRemount.release();
  await Promise.resolve();
  await owner.shutdown();

  expect(disposed).toEqual([firstMount.value]);
});

test('application shutdown waits for asynchronous runtime disposal and observes safe failure', async () => {
  const allowDisposal = Promise.withResolvers<undefined>();
  let disposalCompleted = false;
  let disposalFailures = 0;
  const owner = makeRuntimeLeaseOwner(
    () => ({ name: 'runtime' }),
    () =>
      allowDisposal.promise.then(() => {
        disposalCompleted = true;
      }),
    () => {
      disposalFailures += 1;
    },
  );
  owner.retain();

  const shutdown = owner.shutdown();
  await Promise.resolve();
  expect(disposalCompleted).toBe(false);

  allowDisposal.resolve(undefined);
  await shutdown;
  expect(disposalCompleted).toBe(true);
  expect(disposalFailures).toBe(0);

  const failingOwner = makeRuntimeLeaseOwner(
    () => ({ name: 'failing-runtime' }),
    () => Promise.reject(new Error('unsafe-disposal-detail')),
    () => {
      disposalFailures += 1;
    },
  );
  failingOwner.retain();
  await failingOwner.shutdown();

  expect(disposalFailures).toBe(1);
});
