import { expect, test } from 'bun:test';
import { Cause, Duration, Effect, Exit, Fiber, Option, TestClock, TestContext } from 'effect';

import { type ClientApiFailure, executeClientRequest } from './support/client-api-boundary.js';
import { waitForScheduledSleep } from './support/test-clock.js';

const defaultOptions = {
  callerRetryDisposition: 'caller-may-retry' as const,
  timeout: Duration.seconds(1),
};

const jsonResponse = (status: number, body: unknown, headers?: Readonly<Record<string, string>>): Response =>
  new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    status,
  });

const failureOf = async (effect: Effect.Effect<unknown, ClientApiFailure>): Promise<ClientApiFailure> => {
  const exit = await Effect.runPromiseExit(effect);

  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isSuccess(exit)) {
    throw new Error('Expected the client boundary to fail.');
  }

  expect(Cause.isInterruptedOnly(exit.cause)).toBe(false);
  return Option.getOrThrow(Cause.failureOption(exit.cause));
};

test('401 requests session handling instead of reporting a network failure', async () => {
  const failure = await failureOf(
    executeClientRequest({
      ...defaultOptions,
      fetch: () => Promise.resolve(jsonResponse(401, { code: 'session-expired' })),
    }),
  );

  expect(failure).toEqual({
    _tag: 'SessionRequired',
    action: 'reauthenticate',
    retryDisposition: 'never',
  });
});

test('403 remains a forbidden caller-actionable failure', async () => {
  const failure = await failureOf(
    executeClientRequest({
      ...defaultOptions,
      fetch: () => Promise.resolve(jsonResponse(403, { code: 'forbidden' })),
    }),
  );

  expect(failure).toEqual({
    _tag: 'Forbidden',
    retryDisposition: 'never',
  });
});

test('429 preserves bounded Retry-After guidance without enabling an automatic retry', async () => {
  let attempts = 0;
  const failure = await failureOf(
    executeClientRequest({
      ...defaultOptions,
      fetch: () => {
        attempts += 1;
        return Promise.resolve(jsonResponse(429, { code: 'rate-limited' }, { 'retry-after': '999999999999999999999' }));
      },
    }),
  );

  expect(failure).toEqual({
    _tag: 'RateLimited',
    retryAfterMillis: 300_000,
    retryDisposition: 'caller-may-retry',
  });
  expect(attempts).toBe(1);
});

test('503 keeps a safe service-unavailable classification without provider detail', async () => {
  const failure = await failureOf(
    executeClientRequest({
      ...defaultOptions,
      fetch: () =>
        Promise.resolve(
          jsonResponse(503, {
            code: 'service-unavailable',
            providerMessage: 'database password=unsafe-provider-detail',
          }),
        ),
    }),
  );

  expect(failure).toEqual({
    _tag: 'ServiceUnavailable',
    failureKind: 'service-unavailable',
    retryDisposition: 'caller-may-retry',
  });
  expect(JSON.stringify(failure)).not.toContain('unsafe-provider-detail');
});

test('timeout remains distinct from local transport failure', async () => {
  let timedOutSignal: AbortSignal | undefined;
  const started = Promise.withResolvers<undefined>();
  const timeoutExit = await Effect.runPromise(
    Effect.gen(function* () {
      const fiber = yield* Effect.fork(
        executeClientRequest({
          ...defaultOptions,
          fetch: (signal) => {
            timedOutSignal = signal;
            started.resolve(undefined);
            return new Promise<Response>((_resolve, reject) => {
              signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), {
                once: true,
              });
            });
          },
        }),
      );

      yield* Effect.promise(() => started.promise);
      yield* waitForScheduledSleep(1_000);
      yield* TestClock.adjust(Duration.seconds(1));
      return yield* Fiber.await(fiber);
    }).pipe(Effect.provide(TestContext.TestContext)),
  );

  expect(Exit.isFailure(timeoutExit)).toBe(true);
  if (Exit.isFailure(timeoutExit)) {
    expect(Option.getOrThrow(Cause.failureOption(timeoutExit.cause))).toEqual({
      _tag: 'RequestTimedOut',
      retryDisposition: 'caller-may-retry',
    });
  }
  expect(timedOutSignal?.aborted).toBe(true);

  const transportFailure = await failureOf(
    executeClientRequest({
      ...defaultOptions,
      callerRetryDisposition: 'reconcile-first',
      fetch: () => Promise.reject(new Error('socket error with credential-value')),
    }),
  );
  expect(transportFailure).toEqual({
    _tag: 'TransportFailure',
    retryDisposition: 'reconcile-first',
  });
  expect(JSON.stringify(transportFailure)).not.toContain('credential-value');
});

test('malformed successful JSON is a protocol failure', async () => {
  const failure = await failureOf(
    executeClientRequest({
      ...defaultOptions,
      fetch: () => Promise.resolve(new Response('{', { status: 200 })),
    }),
  );

  expect(failure).toEqual({
    _tag: 'MalformedSuccessResponse',
    failureKind: 'protocol-failure',
    retryDisposition: 'never',
  });
});

test('a malformed error response is distinct from transport and service availability', async () => {
  const failure = await failureOf(
    executeClientRequest({
      ...defaultOptions,
      fetch: () => Promise.resolve(new Response('{', { status: 503 })),
    }),
  );

  expect(failure).toEqual({
    _tag: 'MalformedErrorResponse',
    retryDisposition: 'never',
  });
});

test('a 422 domain response remains typed and gives the caller an action', async () => {
  const failure = await failureOf(
    executeClientRequest({
      ...defaultOptions,
      fetch: () => Promise.resolve(jsonResponse(422, { code: 'profile-incomplete' })),
    }),
  );

  expect(failure).toEqual({
    _tag: 'DomainRejected',
    action: 'complete-profile',
    code: 'profile-incomplete',
    retryDisposition: 'never',
  });
});

test('external Effect interruption stays interruption instead of becoming a client error', async () => {
  let interruptedSignal: AbortSignal | undefined;
  const started = Promise.withResolvers<undefined>();
  const fiber = Effect.runFork(
    executeClientRequest({
      ...defaultOptions,
      fetch: (signal) => {
        interruptedSignal = signal;
        started.resolve(undefined);
        return new Promise<Response>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), {
            once: true,
          });
        });
      },
    }),
  );

  await started.promise;
  const exit = await Effect.runPromise(Fiber.interrupt(fiber));

  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    expect(Cause.isInterruptedOnly(exit.cause)).toBe(true);
    expect(Option.isNone(Cause.failureOption(exit.cause))).toBe(true);
  }
  expect(interruptedSignal?.aborted).toBe(true);
});
