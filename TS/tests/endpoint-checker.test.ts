import { expect, test } from 'bun:test';
import { Cause, Deferred, Effect, Exit, Fiber, Layer, Option } from 'effect';

import {
  EndpointProbe,
  TransientProbeError,
  checkEndpoints,
  decodeCheckRequest,
  defaultCheckPolicy,
  encodeEndpointResults,
  makeEndpointProbe,
  projectCheckFailure,
} from '../src/endpoint-checker.js';

test('reports invalid external input as ParseError without a defect or interruption', async () => {
  const exit = await Effect.runPromiseExit(decodeCheckRequest({ endpoints: ['not a URL'] }));

  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    const failure = Option.getOrThrow(Cause.failureOption(exit.cause));

    expect(failure._tag).toBe('ParseError');
    expect(Cause.defects(exit.cause)).toHaveLength(0);
    expect(Cause.isInterruptedOnly(exit.cause)).toBe(false);
  }
});

test('rejects endpoint collections above the fixed resource limit', async () => {
  const exit = await Effect.runPromiseExit(
    decodeCheckRequest({
      endpoints: Array.from({ length: 17 }, (_, index) => `https://example.com/${String(index)}`),
    }),
  );

  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    expect(Option.getOrThrow(Cause.failureOption(exit.cause))._tag).toBe('ParseError');
  }
});

test('forwards interruption to the signal-aware promise adapter', async () => {
  let adapterSignal: AbortSignal | undefined;
  let redirect: RequestInit['redirect'];
  const started = Promise.withResolvers<undefined>();
  const probe = makeEndpointProbe((_input, init) => {
    adapterSignal = init?.signal ?? undefined;
    redirect = init?.redirect;
    started.resolve(undefined);

    return new Promise<Response>((_resolve, reject) => {
      adapterSignal?.addEventListener(
        'abort',
        () => {
          reject(new DOMException('aborted', 'AbortError'));
        },
        { once: true },
      );
    });
  });
  const controller = new AbortController();
  const pending = Effect.runPromiseExit(probe.head(new URL('https://example.com/')), {
    signal: controller.signal,
  });

  await started.promise;
  controller.abort();
  const exit = await pending;

  expect(adapterSignal?.aborted).toBe(true);
  expect(redirect).toBe('error');
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    expect(Cause.isInterruptedOnly(exit.cause)).toBe(true);
  }
});

test('rejects an unauthorized destination before invoking the adapter', async () => {
  let attempts = 0;
  const probe = Layer.succeed(EndpointProbe, {
    head: () => {
      attempts += 1;
      return Effect.die('unauthorized endpoint reached the adapter');
    },
  });
  const exit = await Effect.runPromiseExit(
    checkEndpoints({ endpoints: ['https://169.254.169.254/latest/meta-data/'] }, defaultCheckPolicy).pipe(
      Effect.provide(probe),
    ),
  );

  expect(attempts).toBe(0);
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    const failure = Option.getOrThrow(Cause.failureOption(exit.cause));

    expect(failure._tag).toBe('EndpointNotAllowed');
    if (failure._tag === 'EndpointNotAllowed') {
      expect(failure.target).toBe('https://169.254.169.254');
    }
    expect(Cause.defects(exit.cause)).toHaveLength(0);
    expect(Cause.isInterruptedOnly(exit.cause)).toBe(false);
  }
});

test('rejects URL credentials without exposing them in the typed error', async () => {
  const credential = ['private', 'value'].join('-');
  const credentialedEndpoint = new URL('https://example.com/private');

  credentialedEndpoint.username = 'user';
  credentialedEndpoint.password = credential;

  let attempts = 0;
  const probe = Layer.succeed(EndpointProbe, {
    head: () => {
      attempts += 1;
      return Effect.die('credentialed endpoint reached the adapter');
    },
  });
  const exit = await Effect.runPromiseExit(
    checkEndpoints({ endpoints: [credentialedEndpoint.toString()] }, defaultCheckPolicy).pipe(Effect.provide(probe)),
  );

  expect(attempts).toBe(0);
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    const failure = Option.getOrThrow(Cause.failureOption(exit.cause));

    expect(failure._tag).toBe('EndpointNotAllowed');
    if (failure._tag === 'EndpointNotAllowed') {
      expect(failure.target).toBe('https://example.com');
      expect(JSON.stringify(failure)).not.toContain(credential);
    }
  }
});

test('rejects invalid resource policy before invoking the adapter', async () => {
  let attempts = 0;
  const probe = Layer.succeed(EndpointProbe, {
    head: () => {
      attempts += 1;
      return Effect.die('invalid policy reached the adapter');
    },
  });
  const exit = await Effect.runPromiseExit(
    checkEndpoints(
      { endpoints: ['https://example.com/'] },
      {
        ...defaultCheckPolicy,
        concurrency: 0,
      },
    ).pipe(Effect.provide(probe)),
  );

  expect(attempts).toBe(0);
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    const failure = Option.getOrThrow(Cause.failureOption(exit.cause));

    expect(failure._tag).toBe('InvalidCheckPolicy');
    if (failure._tag === 'InvalidCheckPolicy') {
      expect(failure.reason).toBe('concurrency must be an integer from 1 through 16');
    }
    expect(Cause.defects(exit.cause)).toHaveLength(0);
  }
});

test('retries only the duplicate-safe transient endpoint attempt', async () => {
  let attempts = 0;
  const probe = Layer.succeed(EndpointProbe, {
    head: () =>
      Effect.suspend(() => {
        attempts += 1;
        if (attempts < 3) {
          return Effect.fail(new TransientProbeError({ target: 'https://example.com' }));
        }

        return Effect.succeed({
          status: 204,
          target: 'https://example.com',
        });
      }),
  });
  const result = await Effect.runPromise(
    checkEndpoints(
      { endpoints: ['https://example.com/'] },
      {
        ...defaultCheckPolicy,
        retryDelay: 0,
      },
    ).pipe(Effect.provide(probe)),
  );

  expect(attempts).toBe(3);
  expect(result).toEqual([{ status: 204, target: 'https://example.com' }]);
});

test('does not retry a non-retryable rejection', async () => {
  let attempts = 0;
  const probe = Layer.succeed(
    EndpointProbe,
    makeEndpointProbe(() => {
      attempts += 1;
      return Promise.resolve(new Response(null, { status: 429 }));
    }),
  );
  const exit = await Effect.runPromiseExit(
    checkEndpoints({ endpoints: ['https://example.com/'] }, defaultCheckPolicy).pipe(Effect.provide(probe)),
  );

  expect(attempts).toBe(1);
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    const failure = Option.getOrThrow(Cause.failureOption(exit.cause));

    expect(failure._tag).toBe('EndpointRejected');
    if (failure._tag === 'EndpointRejected') {
      expect(failure.status).toBe(429);
      expect(failure.target).toBe('https://example.com');
    }
    expect(Cause.defects(exit.cause)).toHaveLength(0);
    expect(Cause.isInterruptedOnly(exit.cause)).toBe(false);
  }
});

test('bounds endpoint probes to the configured concurrency', async () => {
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const twoStarted = yield* Deferred.make<undefined>();
      const release = yield* Deferred.make<undefined>();
      let active = 0;
      let maximum = 0;
      const probe = Layer.succeed(EndpointProbe, {
        head: (endpoint: URL) =>
          Effect.sync(() => {
            active += 1;
            maximum = Math.max(maximum, active);
          }).pipe(
            Effect.tap(() => {
              if (active === 2) {
                return Deferred.succeed(twoStarted, undefined);
              }

              return Effect.void;
            }),
            Effect.zipRight(Deferred.await(release)),
            Effect.as({ status: 204, target: endpoint.origin }),
            Effect.ensuring(
              Effect.sync(() => {
                active -= 1;
              }),
            ),
          ),
      });
      const fiber = yield* checkEndpoints(
        {
          endpoints: [
            'https://example.com/one',
            'https://example.com/two',
            'https://example.com/three',
            'https://example.com/four',
          ],
        },
        { ...defaultCheckPolicy, concurrency: 2 },
      ).pipe(Effect.provide(probe), Effect.fork);

      yield* Deferred.await(twoStarted);

      const maximumBeforeRelease = maximum;

      yield* Deferred.succeed(release, undefined);

      return {
        maximum,
        maximumBeforeRelease,
        results: yield* Fiber.join(fiber),
      };
    }),
  );

  expect(result.maximumBeforeRelease).toBe(2);
  expect(result.maximum).toBe(2);
  expect(result.results).toHaveLength(4);
});

test('projects internal failures without provider detail', () => {
  expect(projectCheckFailure(new TransientProbeError({ target: 'https://example.com' }))).toEqual({
    code: 'endpoint_unavailable',
    message: 'An endpoint is temporarily unavailable.',
    retryable: true,
  });
});

test('encodes the externally consumed result through its wire schema', async () => {
  const encoded = await Effect.runPromise(encodeEndpointResults([{ status: 204, target: 'https://example.com' }]));

  expect(encoded).toEqual([{ status: 204, target: 'https://example.com' }]);
});
