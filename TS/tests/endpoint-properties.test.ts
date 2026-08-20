/**
 * Property tests for the two trust boundaries of the fixture: diagnostic
 * projection (no unsafe detail may leak, status classes match their ranges)
 * and policy decoding (origins normalize safely, durations decode exactly).
 * A property that finds a counterexample gets pinned as a deterministic
 * example test; random search finds the case, the suite keeps it.
 */
import { expect, test } from 'bun:test';
import { Cause, Duration, Effect, Exit, Option } from 'effect';
import fc from 'fast-check';

import { EndpointRejected, projectCheckDiagnostic } from '../src/endpoint-contracts.js';
import { decodeCheckPolicy, defaultCheckPolicy } from '../src/endpoint-policy.js';

const rejectedStatus = fc.oneof(fc.integer({ min: 400, max: 502 }), fc.integer({ min: 504, max: 599 }));

test('rejected statuses always carry the endpoint resource and the status class of their range', () => {
  fc.assert(
    fc.property(rejectedStatus, (status) => {
      const diagnostic = projectCheckDiagnostic(new EndpointRejected({ status, targetId: 'primary-api' }));

      expect(diagnostic.failureKind).toBe('endpoint-rejected');
      expect(diagnostic.resource).toBe('primary-api');
      expect(diagnostic.statusClass).toBe(status <= 499 ? '4xx' : '5xx');
    }),
  );
});

test('status-class edges are exact at the 4xx/5xx boundary', () => {
  const classAt = (status: number): string | undefined =>
    projectCheckDiagnostic(new EndpointRejected({ status, targetId: 'primary-api' })).statusClass;

  expect(classAt(400)).toBe('4xx');
  expect(classAt(499)).toBe('4xx');
  expect(classAt(500)).toBe('5xx');
  expect(classAt(599)).toBe('5xx');
});

test('informational rejected statuses carry no status class', () => {
  fc.assert(
    fc.property(fc.integer({ min: 100, max: 199 }), (status) => {
      const diagnostic = projectCheckDiagnostic(new EndpointRejected({ status, targetId: 'primary-api' }));

      expect(diagnostic.failureKind).toBe('endpoint-rejected');
      expect(diagnostic.statusClass).toBeUndefined();
    }),
  );
});

test('valid bounded policies decode with exact durations and normalized unique origins', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.record({
        attemptTimeoutMilliseconds: fc.integer({ min: 1, max: 3_600_000 }),
        concurrency: fc.integer({ min: 1, max: 16 }),
        domains: fc.uniqueArray(fc.domain(), { minLength: 1, maxLength: 16 }),
        retries: fc.integer({ min: 0, max: 5 }),
        retryDelayMilliseconds: fc.integer({ min: 0, max: 3_600_000 }),
        totalDeadlineMilliseconds: fc.integer({ min: 1, max: 3_600_000 }),
        // Uppercase hosts prove URL normalization does real work: the policy
        // must store the canonical lowercase origin, not the raw input.
        uppercaseHosts: fc.boolean(),
      }),
      async (input) => {
        const policy = await Effect.runPromise(
          decodeCheckPolicy({
            allowedOrigins: input.domains.map(
              (domain) => `https://${input.uppercaseHosts ? domain.toUpperCase() : domain}`,
            ),
            attemptTimeoutMilliseconds: input.attemptTimeoutMilliseconds,
            concurrency: input.concurrency,
            retries: input.retries,
            retryDelayMilliseconds: input.retryDelayMilliseconds,
            totalDeadlineMilliseconds: input.totalDeadlineMilliseconds,
          }),
        );

        expect(Duration.toMillis(policy.attemptTimeout)).toBe(input.attemptTimeoutMilliseconds);
        expect(Duration.toMillis(policy.retryDelay)).toBe(input.retryDelayMilliseconds);
        expect(Duration.toMillis(policy.totalDeadline)).toBe(input.totalDeadlineMilliseconds);
        expect(policy.concurrency).toBe(input.concurrency);
        expect(policy.retries).toBe(input.retries);
        expect(policy.allowedOrigins.size).toBe(input.domains.length);
        for (const domain of input.domains) {
          expect(policy.allowedOrigins.has(`https://${domain}`)).toBe(true);
        }
      },
    ),
  );
});

test('origins with either credential half, paths, queries, or non-https schemes are rejected', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.domain(),
      fc.constantFrom('username', 'password', 'http', 'path', 'query'),
      async (domain, defect) => {
        const origin =
          defect === 'username'
            ? `https://user@${domain}`
            : defect === 'password'
              ? `https://:secret@${domain}`
              : defect === 'http'
                ? `http://${domain}`
                : defect === 'path'
                  ? `https://${domain}/health`
                  : `https://${domain}?probe=1`;
        const exit = await Effect.runPromiseExit(
          decodeCheckPolicy({ ...defaultCheckPolicy, allowedOrigins: [origin] }),
        );

        expect(Exit.isFailure(exit)).toBe(true);
        if (Exit.isFailure(exit)) {
          expect(Option.getOrThrow(Cause.failureOption(exit.cause))._tag).toBe('InvalidCheckPolicy');
        }
      },
    ),
  );
});
