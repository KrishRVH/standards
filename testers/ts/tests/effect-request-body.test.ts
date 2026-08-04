import { expect, test } from 'bun:test';
import { Cause, Effect, Exit, Fiber, Option } from 'effect';

import {
  type BodyCleanupFailureDiagnostic,
  BodyReadFailed,
  type BodyRequest,
  BodyTooLarge,
  DeclaredBodyTooLarge,
  InvalidDeclaredContentLength,
  readBoundedBody,
} from './support/bounded-body-reader.js';

const ignoreCleanupFailure = (_diagnostic: BodyCleanupFailureDiagnostic): void => undefined;

const makeOptions = (
  maximumBytes: number,
  observeCleanupFailure: (diagnostic: BodyCleanupFailureDiagnostic) => void = ignoreCleanupFailure,
) => ({ maximumBytes, observeCleanupFailure });

const makeBodyRequest = (
  body: ReadableStream<Uint8Array> | null,
  options: {
    readonly contentLength?: string;
    readonly signal?: AbortSignal;
  } = {},
): BodyRequest => {
  const headers = new Headers();
  if (options.contentLength !== undefined) {
    headers.set('content-length', options.contentLength);
  }

  return {
    body,
    headers,
    signal: options.signal ?? new AbortController().signal,
  };
};

test('a successful bounded body read returns the bytes and releases stream ownership', async () => {
  let cancellations = 0;
  const body = new ReadableStream<Uint8Array>({
    cancel() {
      cancellations += 1;
    },
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2]));
      controller.enqueue(new Uint8Array([3]));
      controller.close();
    },
  });

  const bytes = await Effect.runPromise(readBoundedBody(makeBodyRequest(body), makeOptions(3)));

  expect(Array.from(bytes)).toEqual([1, 2, 3]);
  expect(body.locked).toBe(false);
  expect(cancellations).toBe(0);
});

test('a declared oversize body is rejected before acquiring its stream reader', async () => {
  let readerAcquisitions = 0;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3, 4]));
      controller.close();
    },
  });
  const getReader = body.getReader.bind(body);
  Object.defineProperty(body, 'getReader', {
    value(this: ReadableStream<Uint8Array>) {
      readerAcquisitions += 1;
      return getReader();
    },
  });

  const exit = await Effect.runPromiseExit(
    readBoundedBody(makeBodyRequest(body, { contentLength: '4' }), makeOptions(3)),
  );

  expect(readerAcquisitions).toBe(0);
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    expect(Option.getOrThrow(Cause.failureOption(exit.cause))).toEqual(new DeclaredBodyTooLarge({ maximumBytes: 3 }));
  }
});

test('an invalid declared content length is rejected before acquiring its stream reader', async () => {
  let readerAcquisitions = 0;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]));
      controller.close();
    },
  });
  const getReader = body.getReader.bind(body);
  Object.defineProperty(body, 'getReader', {
    value(this: ReadableStream<Uint8Array>) {
      readerAcquisitions += 1;
      return getReader();
    },
  });

  const exit = await Effect.runPromiseExit(
    readBoundedBody(makeBodyRequest(body, { contentLength: '+3' }), makeOptions(3)),
  );

  expect(readerAcquisitions).toBe(0);
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    expect(Option.getOrThrow(Cause.failureOption(exit.cause))).toEqual(new InvalidDeclaredContentLength());
  }
});

test('actual oversize attempts cancellation and returns the exact safe failure', async () => {
  let cancellations = 0;
  const body = new ReadableStream<Uint8Array>(
    {
      cancel() {
        cancellations += 1;
      },
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3, 4]));
      },
    },
    { highWaterMark: 0 },
  );

  const exit = await Effect.runPromiseExit(readBoundedBody(makeBodyRequest(body), makeOptions(3)));

  expect(cancellations).toBe(1);
  expect(body.locked).toBe(false);
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    expect(Option.getOrThrow(Cause.failureOption(exit.cause))).toEqual(new BodyTooLarge({ maximumBytes: 3 }));
  }
});

test('a stream read rejection maps to BodyReadFailed without unsafe detail', async () => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.error(new Error('unsafe-read-detail'));
    },
  });

  const exit = await Effect.runPromiseExit(readBoundedBody(makeBodyRequest(body), makeOptions(3)));

  expect(body.locked).toBe(false);
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    expect(Option.getOrThrow(Cause.failureOption(exit.cause))).toEqual(new BodyReadFailed());
    expect(Array.from(Cause.defects(exit.cause))).toEqual([]);
    expect(JSON.stringify(Cause.failures(exit.cause))).not.toContain('unsafe-read-detail');
  }
});

test('interrupting a stalled read attempts cancellation and releases ownership', async () => {
  const readStarted = Promise.withResolvers<undefined>();
  let cancellations = 0;
  const body = new ReadableStream<Uint8Array>(
    {
      cancel() {
        cancellations += 1;
      },
      pull() {
        readStarted.resolve(undefined);
        return new Promise<undefined>(() => undefined);
      },
    },
    { highWaterMark: 0 },
  );
  const fiber = Effect.runFork(readBoundedBody(makeBodyRequest(body), makeOptions(3)));

  await readStarted.promise;
  const exit = await Effect.runPromise(Fiber.interrupt(fiber));

  expect(cancellations).toBe(1);
  expect(body.locked).toBe(false);
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    expect(Cause.isInterruptedOnly(exit.cause)).toBe(true);
  }
});

test('cleanup rejection is observed safely without replacing the primary failure', async () => {
  const cleanupDiagnostics: BodyCleanupFailureDiagnostic[] = [];
  const body = new ReadableStream<Uint8Array>(
    {
      cancel() {
        return Promise.reject(new Error('unsafe-cleanup-detail'));
      },
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3, 4]));
      },
    },
    { highWaterMark: 0 },
  );

  const exit = await Effect.runPromiseExit(
    readBoundedBody(
      makeBodyRequest(body),
      makeOptions(3, (diagnostic) => {
        cleanupDiagnostics.push(diagnostic);
      }),
    ),
  );
  await Promise.resolve();

  expect(body.locked).toBe(false);
  expect(cleanupDiagnostics).toEqual([
    {
      failureKind: 'request-body-cleanup-failure',
      operation: 'cancel',
    },
  ]);
  expect(JSON.stringify(cleanupDiagnostics)).not.toContain('unsafe-cleanup-detail');
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    expect(Option.getOrThrow(Cause.failureOption(exit.cause))).toEqual(new BodyTooLarge({ maximumBytes: 3 }));
    expect(Array.from(Cause.defects(exit.cause))).toEqual([]);
    expect(JSON.stringify(exit.cause)).not.toContain('unsafe-cleanup-detail');
  }
});

test('a stalled cancellation uses the explicit zero-wait cleanup policy', async () => {
  const cancellationStarted = Promise.withResolvers<undefined>();
  const body = new ReadableStream<Uint8Array>(
    {
      cancel() {
        cancellationStarted.resolve(undefined);
        return new Promise<void>(() => undefined);
      },
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3, 4]));
      },
    },
    { highWaterMark: 0 },
  );
  const fiber = Effect.runFork(readBoundedBody(makeBodyRequest(body), makeOptions(3)));

  await cancellationStarted.promise;
  const completed = await Effect.runPromise(Fiber.poll(fiber));

  expect(Option.isSome(completed)).toBe(true);
  if (Option.isSome(completed)) {
    expect(Exit.isFailure(completed.value)).toBe(true);
    if (Exit.isFailure(completed.value)) {
      expect(Option.getOrThrow(Cause.failureOption(completed.value.cause))).toEqual(
        new BodyTooLarge({ maximumBytes: 3 }),
      );
    }
  }
  expect(body.locked).toBe(false);
});

test('request abort remains interruption rather than an ordinary body failure', async () => {
  const readStarted = Promise.withResolvers<undefined>();
  const requestController = new AbortController();
  let cancellations = 0;
  const body = new ReadableStream<Uint8Array>(
    {
      cancel() {
        cancellations += 1;
      },
      pull() {
        readStarted.resolve(undefined);
        return new Promise<undefined>(() => undefined);
      },
    },
    { highWaterMark: 0 },
  );
  const fiber = Effect.runFork(
    readBoundedBody(makeBodyRequest(body, { signal: requestController.signal }), makeOptions(3)),
  );

  await readStarted.promise;
  requestController.abort();
  const exit = await Effect.runPromise(Fiber.await(fiber));

  expect(cancellations).toBe(1);
  expect(body.locked).toBe(false);
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    expect(Cause.isInterruptedOnly(exit.cause)).toBe(true);
    expect(Option.isNone(Cause.failureOption(exit.cause))).toBe(true);
  }
});
