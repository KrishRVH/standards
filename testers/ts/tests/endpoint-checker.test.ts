import { expect, test } from 'bun:test';
import { Cause, Deferred, Duration, Effect, Exit, Fiber, Layer, Option, Ref, TestClock, TestContext } from 'effect';

import {
  type EndpointHealthy,
  EndpointNotAllowed,
  EndpointRejected,
  InvalidCheckPolicy,
  TransientProbeError,
  decodeCheckRequest,
  encodeEndpointResults,
  projectCheckDiagnostic,
  projectCheckFailure,
  projectDefectDiagnostic,
} from '../src/endpoint-contracts.js';
import {
  type CheckedEndpointTarget,
  EndpointProbe,
  checkEndpoint,
  checkEndpoints,
  makeEndpointProbe,
} from '../src/endpoint-checker.js';
import { decodeCheckPolicy, defaultCheckPolicy } from '../src/endpoint-policy.js';
import { waitForScheduledSleep } from './support/test-clock.js';

function checkedTarget(id: string, input: string): CheckedEndpointTarget {
  const url = new URL(input);

  return { id, origin: url.origin, url };
}

function healthy(target: CheckedEndpointTarget, status = 204): EndpointHealthy {
  return { _tag: 'EndpointHealthy', id: target.id, status };
}

function oneTarget(id = 'primary-api', url = 'https://example.com/health') {
  return { endpoints: [{ id, url }] };
}

test('reports invalid external input as ParseError without a defect or interruption', async () => {
  const exit = await Effect.runPromiseExit(decodeCheckRequest(oneTarget('primary-api', 'not a URL')));

  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    const failure = Option.getOrThrow(Cause.failureOption(exit.cause));

    expect(failure._tag).toBe('ParseError');
    expect(Cause.defects(exit.cause)).toHaveLength(0);
    expect(Cause.isInterruptedOnly(exit.cause)).toBe(false);
  }
});

test('rejects duplicate endpoint IDs at the external boundary', async () => {
  const exit = await Effect.runPromiseExit(
    decodeCheckRequest({
      endpoints: [
        { id: 'primary-api', url: 'https://example.com/one' },
        { id: 'primary-api', url: 'https://example.com/two' },
      ],
    }),
  );

  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    expect(Option.getOrThrow(Cause.failureOption(exit.cause))._tag).toBe('ParseError');
  }
});

test('rejects endpoint collections above the fixed resource limit', async () => {
  const exit = await Effect.runPromiseExit(
    decodeCheckRequest({
      endpoints: Array.from({ length: 17 }, (_, index) => ({
        id: `endpoint-${String(index)}`,
        url: `https://example.com/${String(index)}`,
      })),
    }),
  );

  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    expect(Option.getOrThrow(Cause.failureOption(exit.cause))._tag).toBe('ParseError');
  }
});

const invalidDurationPolicies: readonly {
  readonly name: string;
  readonly patch: Readonly<Record<string, unknown>>;
}[] = [
  { name: 'negative numeric attempt timeout', patch: { attemptTimeoutMilliseconds: -1 } },
  { name: 'negative string attempt timeout', patch: { attemptTimeoutMilliseconds: '-1' } },
  { name: 'negative retry delay', patch: { retryDelayMilliseconds: -1 } },
  { name: 'negative-zero retry delay', patch: { retryDelayMilliseconds: -0 } },
  { name: 'NaN attempt timeout', patch: { attemptTimeoutMilliseconds: Number.NaN } },
  { name: 'positive infinity attempt timeout', patch: { attemptTimeoutMilliseconds: Number.POSITIVE_INFINITY } },
  { name: 'negative infinity attempt timeout', patch: { attemptTimeoutMilliseconds: Number.NEGATIVE_INFINITY } },
  { name: 'zero attempt timeout', patch: { attemptTimeoutMilliseconds: 0 } },
  { name: 'zero total deadline', patch: { totalDeadlineMilliseconds: 0 } },
];

for (const invalidPolicy of invalidDurationPolicies) {
  test(`rejects ${invalidPolicy.name} before Duration normalization`, async () => {
    const exit = await Effect.runPromiseExit(decodeCheckPolicy({ ...defaultCheckPolicy, ...invalidPolicy.patch }));

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(Option.getOrThrow(Cause.failureOption(exit.cause))._tag).toBe('InvalidCheckPolicy');
      expect(Cause.defects(exit.cause)).toHaveLength(0);
      expect(Cause.isInterruptedOnly(exit.cause)).toBe(false);
    }
  });
}

test('accepts zero retry delay with exact immediate retry behavior', async () => {
  const policy = await Effect.runPromise(
    decodeCheckPolicy({ ...defaultCheckPolicy, retries: 2, retryDelayMilliseconds: 0 }),
  );
  let attempts = 0;
  const probe = {
    head: (target: CheckedEndpointTarget) =>
      Effect.suspend(() => {
        attempts += 1;

        return attempts < 3
          ? Effect.fail(new TransientProbeError({ targetId: target.id }))
          : Effect.succeed(healthy(target));
      }),
  };
  const result = await Effect.runPromise(
    checkEndpoint(probe, checkedTarget('primary-api', 'https://example.com'), policy),
  );

  expect(attempts).toBe(3);
  expect(result).toEqual({ _tag: 'EndpointHealthy', id: 'primary-api', status: 204 });
});

test('normalizes valid positive policy values only after decoding them', async () => {
  const policy = await Effect.runPromise(
    decodeCheckPolicy({
      allowedOrigins: ['https://EXAMPLE.com:443'],
      attemptTimeoutMilliseconds: 250,
      concurrency: 3,
      retries: 1,
      retryDelayMilliseconds: 0,
      totalDeadlineMilliseconds: 125,
    }),
  );

  expect([...policy.allowedOrigins]).toEqual(['https://example.com']);
  expect(Duration.toMillis(policy.attemptTimeout)).toBe(250);
  expect(Duration.toMillis(policy.retryDelay)).toBe(0);
  expect(Duration.toMillis(policy.totalDeadline)).toBe(125);
  expect(policy.concurrency).toBe(3);
  expect(policy.retries).toBe(1);
});

test('allows a caller total deadline shorter than the theoretical attempt budget', async () => {
  const exit = await Effect.runPromiseExit(
    decodeCheckPolicy({
      ...defaultCheckPolicy,
      attemptTimeoutMilliseconds: 1_000,
      retries: 5,
      retryDelayMilliseconds: 500,
      totalDeadlineMilliseconds: 100,
    }),
  );

  expect(Exit.isSuccess(exit)).toBe(true);
});

const invalidOrigins = [
  'http://example.com',
  'https://user:secret@example.com',
  'https://example.com/path',
  'https://example.com?query=secret',
  'https://example.com#fragment',
  'not-an-origin',
] as const;

for (const invalidOrigin of invalidOrigins) {
  test(`rejects non-origin policy value ${invalidOrigin}`, async () => {
    const exit = await Effect.runPromiseExit(
      decodeCheckPolicy({ ...defaultCheckPolicy, allowedOrigins: [invalidOrigin] }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(Option.getOrThrow(Cause.failureOption(exit.cause))._tag).toBe('InvalidCheckPolicy');
    }
  });
}

test('rejects duplicate allowed origins after URL normalization', async () => {
  const exit = await Effect.runPromiseExit(
    decodeCheckPolicy({
      ...defaultCheckPolicy,
      allowedOrigins: ['https://example.com', 'https://EXAMPLE.com:443/'],
    }),
  );

  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    const failure = Option.getOrThrow(Cause.failureOption(exit.cause));

    expect(failure._tag).toBe('InvalidCheckPolicy');
    expect(failure.reason).toBe('allowedOrigins must be unique after normalization');
  }
});

test('rejects invalid policy before invoking the adapter', async () => {
  let attempts = 0;
  const probe = Layer.succeed(EndpointProbe, {
    head: () => {
      attempts += 1;

      return Effect.die('invalid policy reached adapter');
    },
  });
  const exit = await Effect.runPromiseExit(
    checkEndpoints(oneTarget(), { ...defaultCheckPolicy, retryDelayMilliseconds: -1 }).pipe(Effect.provide(probe)),
  );

  expect(attempts).toBe(0);
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    expect(Option.getOrThrow(Cause.failureOption(exit.cause))._tag).toBe('InvalidCheckPolicy');
  }
});

test('returns a safe not-allowed outcome before invoking the adapter', async () => {
  let attempts = 0;
  const credential = ['credential', 'sentinel'].join('-');
  const probe = Layer.succeed(EndpointProbe, {
    head: () => {
      attempts += 1;

      return Effect.die('unauthorized target reached adapter');
    },
  });
  const unsafePath = ['unsafe-path', 'sentinel'].join('-');
  const results = await Effect.runPromise(
    checkEndpoints(
      oneTarget('credentialed-target', `https://user:${credential}@example.com/${unsafePath}?query=secret#fragment`),
    ).pipe(Effect.provide(probe)),
  );

  expect(attempts).toBe(0);
  expect(results).toEqual([{ _tag: 'EndpointNotAllowed', id: 'credentialed-target' }]);
  expect(JSON.stringify(results)).not.toContain(credential);
  expect(JSON.stringify(results)).not.toContain('query');
  expect(JSON.stringify(results)).not.toContain(unsafePath);
});

test('uses normalized origin authorization rather than the display ID', async () => {
  const seen: CheckedEndpointTarget[] = [];
  const probe = Layer.succeed(EndpointProbe, {
    head: (target) => {
      seen.push(target);

      return Effect.succeed(healthy(target));
    },
  });
  const results = await Effect.runPromise(
    checkEndpoints(oneTarget('logical-primary', 'https://EXAMPLE.com:443/health?query=secret#fragment')).pipe(
      Effect.provide(probe),
    ),
  );

  expect(seen).toHaveLength(1);
  expect(seen[0]?.origin).toBe('https://example.com');
  expect(results).toEqual([{ _tag: 'EndpointHealthy', id: 'logical-primary', status: 204 }]);
});

test('keeps two paths under one origin distinguishable and ordered', async () => {
  const probe = Layer.succeed(
    EndpointProbe,
    makeEndpointProbe(() => Promise.resolve(new Response(null, { status: 204 }))),
  );
  const results = await Effect.runPromise(
    checkEndpoints({
      endpoints: [
        { id: 'primary-api', url: 'https://example.com/health/primary' },
        { id: 'secondary-api', url: 'https://example.com/health/secondary' },
      ],
    }).pipe(Effect.provide(probe)),
  );

  expect(results).toEqual([
    { _tag: 'EndpointHealthy', id: 'primary-api', status: 204 },
    { _tag: 'EndpointHealthy', id: 'secondary-api', status: 204 },
  ]);
});

test('changing transport URL does not change the logical endpoint identity', async () => {
  const probe = Layer.succeed(
    EndpointProbe,
    makeEndpointProbe(() => Promise.resolve(new Response(null, { status: 204 }))),
  );
  const first = await Effect.runPromise(
    checkEndpoints(oneTarget('primary-api', 'https://example.com/health/old')).pipe(Effect.provide(probe)),
  );
  const second = await Effect.runPromise(
    checkEndpoints(oneTarget('primary-api', 'https://example.com/health/new')).pipe(Effect.provide(probe)),
  );

  expect(first[0].id).toBe('primary-api');
  expect(second[0].id).toBe('primary-api');
});

test('forwards external interruption to the signal-aware native adapter', async () => {
  let adapterSignal: AbortSignal | undefined;
  let redirect: RequestInit['redirect'];
  const started = Promise.withResolvers<undefined>();
  const probe = makeEndpointProbe((_input, init) => {
    if (init?.signal === null || init?.signal === undefined) {
      return Promise.reject(new Error('missing adapter signal'));
    }

    adapterSignal = init.signal;
    redirect = init.redirect;
    started.resolve(undefined);

    return new Promise<Response>((_resolve, reject) => {
      adapterSignal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), {
        once: true,
      });
    });
  });
  const controller = new AbortController();
  const pending = Effect.runPromiseExit(
    probe.head(checkedTarget('primary-api', 'https://example.com/health?query=secret')),
    { signal: controller.signal },
  );

  await started.promise;
  controller.abort();
  const exit = await pending;

  expect(adapterSignal?.aborted).toBe(true);
  expect(redirect).toBe('manual');
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    expect(Cause.isInterruptedOnly(exit.cause)).toBe(true);
  }
});

test('classifies redirect rejection without following or exposing Location', async () => {
  const query = ['query', 'sentinel'].join('-');
  const location = ['location', 'sentinel'].join('-');
  let redirect: RequestInit['redirect'];
  const probe = makeEndpointProbe((_input, init) => {
    redirect = init?.redirect;

    return Promise.resolve(
      new Response(null, { headers: { location: `https://other.example/${location}` }, status: 307 }),
    );
  });
  const exit = await Effect.runPromiseExit(
    probe.head(checkedTarget('primary-api', `https://example.com/source?${query}`)),
  );

  expect(redirect).toBe('manual');
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    const failure = Option.getOrThrow(Cause.failureOption(exit.cause));

    expect(failure._tag).toBe('EndpointRedirectRejected');
    if (failure._tag === 'EndpointRedirectRejected') {
      expect(failure.status).toBe(307);
      expect(failure.targetId).toBe('primary-api');
    }
    expect(JSON.stringify(failure)).not.toContain(query);
    expect(JSON.stringify(failure)).not.toContain(location);
  }
});

test('does not retry a redirect rejection', async () => {
  let attempts = 0;
  const probe = makeEndpointProbe(() => {
    attempts += 1;

    return Promise.resolve(new Response(null, { status: 302 }));
  });
  const policy = await Effect.runPromise(
    decodeCheckPolicy({ ...defaultCheckPolicy, retries: 5, retryDelayMilliseconds: 0 }),
  );
  const exit = await Effect.runPromiseExit(
    checkEndpoint(probe, checkedTarget('primary-api', 'https://example.com/source'), policy),
  );

  expect(attempts).toBe(1);
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    expect(Option.getOrThrow(Cause.failureOption(exit.cause))._tag).toBe('EndpointRedirectRejected');
  }
});

test('per-attempt timeout returns AttemptTimedOut and aborts the adapter signal', async () => {
  const started = Promise.withResolvers<undefined>();
  let adapterSignal: AbortSignal | undefined;
  let aborts = 0;
  const probe = makeEndpointProbe((_input, init) => {
    if (init?.signal === null || init?.signal === undefined) {
      return Promise.reject(new Error('missing adapter signal'));
    }

    adapterSignal = init.signal;
    started.resolve(undefined);

    return new Promise<Response>((_resolve, reject) => {
      adapterSignal?.addEventListener(
        'abort',
        () => {
          aborts += 1;
          reject(new DOMException('aborted', 'AbortError'));
        },
        { once: true },
      );
    });
  });
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const policy = yield* decodeCheckPolicy({
        ...defaultCheckPolicy,
        attemptTimeoutMilliseconds: 100,
        retries: 0,
      });
      const fiber = yield* checkEndpoint(probe, checkedTarget('primary-api', 'https://example.com'), policy).pipe(
        Effect.fork,
      );

      yield* Effect.promise(() => started.promise);
      yield* waitForScheduledSleep(100);
      yield* TestClock.adjust('100 millis');

      return yield* Fiber.await(fiber);
    }).pipe(Effect.provide(TestContext.TestContext)),
  );

  expect(aborts).toBe(1);
  expect(adapterSignal?.aborted).toBe(true);
  expect(Exit.isFailure(result)).toBe(true);
  if (Exit.isFailure(result)) {
    expect(Option.getOrThrow(Cause.failureOption(result.cause))._tag).toBe('AttemptTimedOut');
  }
});

test('configured retries do not retry a timed-out attempt into overlapping work', async () => {
  const started = Promise.withResolvers<undefined>();
  const underlying = Promise.withResolvers<Response>();
  let invocations = 0;
  let publications = 0;
  // The adapter deliberately ignores the supplied signal, so a retried timeout
  // would start a second attempt while the first one keeps running underneath.
  const probe = makeEndpointProbe(() => {
    invocations += 1;
    started.resolve(undefined);

    return underlying.promise;
  });
  const exit = await Effect.runPromise(
    Effect.gen(function* () {
      const policy = yield* decodeCheckPolicy({
        ...defaultCheckPolicy,
        attemptTimeoutMilliseconds: 100,
        retries: 3,
        retryDelayMilliseconds: 0,
      });
      const fiber = yield* checkEndpoint(probe, checkedTarget('primary-api', 'https://example.com'), policy).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            publications += 1;
          }),
        ),
        Effect.fork,
      );

      yield* Effect.promise(() => started.promise);
      yield* waitForScheduledSleep(100);
      yield* TestClock.adjust('100 millis');

      return yield* Fiber.await(fiber);
    }).pipe(Effect.provide(TestContext.TestContext)),
  );

  expect(invocations).toBe(1);
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    expect(Option.getOrThrow(Cause.failureOption(exit.cause))._tag).toBe('AttemptTimedOut');
  }

  underlying.resolve(new Response(null, { status: 204 }));
  await Promise.resolve();
  await Promise.resolve();

  expect(invocations).toBe(1);
  expect(publications).toBe(0);
});

test('a non-retryable status rejection executes once', async () => {
  let attempts = 0;
  const probe = makeEndpointProbe(() => {
    attempts += 1;

    return Promise.resolve(new Response(null, { status: 429 }));
  });
  const policy = await Effect.runPromise(
    decodeCheckPolicy({ ...defaultCheckPolicy, retries: 5, retryDelayMilliseconds: 0 }),
  );
  const exit = await Effect.runPromiseExit(
    checkEndpoint(probe, checkedTarget('primary-api', 'https://example.com'), policy),
  );

  expect(attempts).toBe(1);
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    const failure = Option.getOrThrow(Cause.failureOption(exit.cause));

    expect(failure._tag).toBe('EndpointRejected');
    if (failure._tag === 'EndpointRejected') {
      expect(failure.status).toBe(429);
      expect(failure.targetId).toBe('primary-api');
    }
  }
});

test('collects every expected endpoint outcome and preserves input order', async () => {
  const attempted: string[] = [];
  const probe = Layer.succeed(EndpointProbe, {
    head: (target) => {
      attempted.push(target.id);

      switch (target.id) {
        case 'temporary':
          return Effect.fail(new TransientProbeError({ targetId: target.id }));
        case 'rejected':
          return Effect.fail(new EndpointRejected({ status: 429, targetId: target.id }));
        default:
          return Effect.succeed(healthy(target));
      }
    },
  });
  const results = await Effect.runPromise(
    checkEndpoints(
      {
        endpoints: [
          { id: 'temporary', url: 'https://example.com/temporary' },
          { id: 'healthy', url: 'https://example.com/healthy' },
          { id: 'rejected', url: 'https://example.com/rejected' },
        ],
      },
      { ...defaultCheckPolicy, concurrency: 1, retries: 0 },
    ).pipe(Effect.provide(probe)),
  );

  expect(attempted).toEqual(['temporary', 'healthy', 'rejected']);
  expect(results).toEqual([
    { _tag: 'EndpointUnavailable', id: 'temporary', reason: 'service-unavailable' },
    { _tag: 'EndpointHealthy', id: 'healthy', status: 204 },
    { _tag: 'EndpointRejected', id: 'rejected', status: 429 },
  ]);
});

test('bounds endpoint probes to the configured concurrency', async () => {
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const twoStarted = yield* Deferred.make<undefined>();
      const release = yield* Deferred.make<undefined>();
      let active = 0;
      let maximum = 0;
      const probe = Layer.succeed(EndpointProbe, {
        head: (target) =>
          Effect.sync(() => {
            active += 1;
            maximum = Math.max(maximum, active);
          }).pipe(
            Effect.tap(() => (active === 2 ? Deferred.succeed(twoStarted, undefined) : Effect.void)),
            Effect.zipRight(Deferred.await(release)),
            Effect.as(healthy(target)),
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
            { id: 'endpoint-one', url: 'https://example.com/one' },
            { id: 'endpoint-two', url: 'https://example.com/two' },
            { id: 'endpoint-three', url: 'https://example.com/three' },
            { id: 'endpoint-four', url: 'https://example.com/four' },
          ],
        },
        { ...defaultCheckPolicy, concurrency: 2 },
      ).pipe(Effect.provide(probe), Effect.fork);

      yield* Deferred.await(twoStarted);
      const maximumBeforeRelease = maximum;
      yield* Deferred.succeed(release, undefined);

      return { maximum, maximumBeforeRelease, results: yield* Fiber.join(fiber) };
    }),
  );

  expect(result.maximumBeforeRelease).toBe(2);
  expect(result.maximum).toBe(2);
  expect(result.results.map(({ id }) => id)).toEqual([
    'endpoint-one',
    'endpoint-two',
    'endpoint-three',
    'endpoint-four',
  ]);
});

test('total deadline interrupts retry sleep and returns no partial batch', async () => {
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const firstAttempt = yield* Deferred.make<undefined>();
      let attempts = 0;
      const probe = Layer.succeed(EndpointProbe, {
        head: (target) =>
          Effect.sync(() => {
            attempts += 1;
          }).pipe(
            Effect.tap(() => Deferred.succeed(firstAttempt, undefined)),
            Effect.zipRight(Effect.fail(new TransientProbeError({ targetId: target.id }))),
          ),
      });
      const fiber = yield* checkEndpoints(oneTarget(), {
        ...defaultCheckPolicy,
        attemptTimeoutMilliseconds: 1_000,
        retries: 5,
        retryDelayMilliseconds: 1_000,
        totalDeadlineMilliseconds: 250,
      }).pipe(Effect.provide(probe), Effect.fork);

      yield* Deferred.await(firstAttempt);
      yield* waitForScheduledSleep(1_000);
      yield* TestClock.adjust('250 millis');

      return { attempts, exit: yield* Fiber.await(fiber) };
    }).pipe(Effect.provide(TestContext.TestContext)),
  );

  expect(result.attempts).toBe(1);
  expect(Exit.isFailure(result.exit)).toBe(true);
  if (Exit.isFailure(result.exit)) {
    const failure = Option.getOrThrow(Cause.failureOption(result.exit.cause));

    expect(failure._tag).toBe('WorkflowDeadlineExceeded');
    if (failure._tag === 'WorkflowDeadlineExceeded') {
      expect(failure.operation).toBe('endpoint-check');
    }
  }
});

test('total deadline interrupts active siblings instead of publishing partial results', async () => {
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const twoStarted = yield* Deferred.make<undefined>();
      const started = yield* Ref.make(0);
      const interrupted = yield* Ref.make(0);
      const probe = Layer.succeed(EndpointProbe, {
        head: () =>
          Ref.updateAndGet(started, (count) => count + 1).pipe(
            Effect.tap((count) => (count === 2 ? Deferred.succeed(twoStarted, undefined) : Effect.void)),
            Effect.zipRight(Effect.never),
            Effect.onInterrupt(() => Ref.update(interrupted, (count) => count + 1)),
          ),
      });
      const fiber = yield* checkEndpoints(
        {
          endpoints: [
            { id: 'endpoint-one', url: 'https://example.com/one' },
            { id: 'endpoint-two', url: 'https://example.com/two' },
          ],
        },
        { ...defaultCheckPolicy, concurrency: 2, totalDeadlineMilliseconds: 100 },
      ).pipe(Effect.provide(probe), Effect.fork);

      yield* Deferred.await(twoStarted);
      yield* waitForScheduledSleep(100);
      yield* TestClock.adjust('100 millis');

      return { exit: yield* Fiber.await(fiber), interrupted: yield* Ref.get(interrupted) };
    }).pipe(Effect.provide(TestContext.TestContext)),
  );

  expect(result.interrupted).toBe(2);
  expect(Exit.isFailure(result.exit)).toBe(true);
  if (Exit.isFailure(result.exit)) {
    expect(Option.getOrThrow(Cause.failureOption(result.exit.cause))._tag).toBe('WorkflowDeadlineExceeded');
  }
});

test('external interruption revokes normal result publication even when fetch ignores its signal', async () => {
  const underlying = Promise.withResolvers<Response>();
  const started = Promise.withResolvers<undefined>();
  const completed = Promise.withResolvers<undefined>();
  let publications = 0;
  const probe = Layer.succeed(
    EndpointProbe,
    makeEndpointProbe(() => {
      started.resolve(undefined);

      return underlying.promise.finally(() => completed.resolve(undefined));
    }),
  );
  const controller = new AbortController();
  const pending = Effect.runPromiseExit(
    checkEndpoints(oneTarget()).pipe(
      Effect.provide(probe),
      Effect.tap(() =>
        Effect.sync(() => {
          publications += 1;
        }),
      ),
    ),
    { signal: controller.signal },
  );

  await started.promise;
  controller.abort();
  const exit = await pending;

  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    expect(Cause.isInterruptedOnly(exit.cause)).toBe(true);
  }
  expect(publications).toBe(0);

  underlying.resolve(new Response(null, { status: 204 }));
  await completed.promise;
  await Promise.resolve();

  expect(publications).toBe(0);
});

test('public and telemetry projections are separate, allowlisted, and actionable', () => {
  const publicFailure = projectCheckFailure(new InvalidCheckPolicy({ reason: 'secret configuration detail' }));
  const telemetry = projectCheckDiagnostic(new TransientProbeError({ targetId: 'primary-api' }));

  expect(publicFailure).toEqual({
    code: 'internal_error',
    message: 'The endpoint checker is misconfigured.',
    retryDisposition: 'never',
  });
  expect(telemetry).toEqual({
    failureKind: 'endpoint-unavailable',
    operation: 'endpoint-check',
    resource: 'primary-api',
    statusClass: '5xx',
  });
  expect(JSON.stringify({ publicFailure, telemetry })).not.toContain('secret configuration detail');
  expect('retryable' in publicFailure).toBe(false);
});

test('safe telemetry classifies disallowed endpoints without losing their stable identity', () => {
  expect(projectCheckDiagnostic(new EndpointNotAllowed({ targetId: 'primary-api' }))).toEqual({
    failureKind: 'endpoint-not-allowed',
    operation: 'endpoint-check',
    resource: 'primary-api',
  });
});

test('safe telemetry drops unsafe internal detail instead of using it for classification', () => {
  const query = ['query', 'sentinel'].join('-');
  const header = ['header', 'sentinel'].join('-');
  const sql = ['sql', 'sentinel'].join('-');
  const body = ['body', 'sentinel'].join('-');
  const failure = new InvalidCheckPolicy({
    reason: `url=?${query} header=${header} sql=${sql} body=${body}`,
  });
  const telemetry = projectCheckDiagnostic(failure);
  const serialized = JSON.stringify(telemetry);

  expect(telemetry.failureKind).toBe('configuration-failure');
  expect(serialized).not.toContain(query);
  expect(serialized).not.toContain(header);
  expect(serialized).not.toContain(sql);
  expect(serialized).not.toContain(body);
  expect(serialized).not.toContain('constructor');
});

test('a defect diagnostic remains distinct from an expected endpoint failure', () => {
  expect(projectDefectDiagnostic()).toEqual({
    failureKind: 'internal-defect',
    operation: 'endpoint-check',
  });
  expect(projectCheckDiagnostic(new TransientProbeError({ targetId: 'primary-api' })).failureKind).toBe(
    'endpoint-unavailable',
  );
});

test('Schema-encodes the public outcome and rejects an impossible healthy status', async () => {
  const healthyOutcome = { _tag: 'EndpointHealthy' as const, id: 'primary-api', status: 204 };
  const encoded = await Effect.runPromise(encodeEndpointResults([healthyOutcome]));
  const invalidExit = await Effect.runPromiseExit(encodeEndpointResults([{ ...healthyOutcome, status: 503 }]));

  expect(encoded).toEqual([healthyOutcome]);
  expect(Exit.isFailure(invalidExit)).toBe(true);
  if (Exit.isFailure(invalidExit)) {
    expect(Option.getOrThrow(Cause.failureOption(invalidExit.cause))._tag).toBe('ParseError');
  }
});

test('Schema rejects success and overload statuses in the rejected-outcome branch', async () => {
  const successfulStatus = await Effect.runPromiseExit(
    encodeEndpointResults([{ _tag: 'EndpointRejected', id: 'primary-api', status: 204 }]),
  );
  const separatelyClassifiedStatus = await Effect.runPromiseExit(
    encodeEndpointResults([{ _tag: 'EndpointRejected', id: 'primary-api', status: 503 }]),
  );

  expect(Exit.isFailure(successfulStatus)).toBe(true);
  expect(Exit.isFailure(separatelyClassifiedStatus)).toBe(true);
});
