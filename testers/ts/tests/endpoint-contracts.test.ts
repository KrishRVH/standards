import { expect, test } from 'bun:test';
import { Cause, Effect, Exit, Option, Schema } from 'effect';

import {
  AttemptTimedOut,
  EndpointNotAllowed,
  type EndpointOutcome,
  EndpointRedirectRejected,
  EndpointRejected,
  EndpointResults,
  InvalidCheckPolicy,
  ProbeTransportError,
  TransientProbeError,
  WorkflowDeadlineExceeded,
  decodeCheckRequest,
  encodeEndpointResults,
  projectCheckDiagnostic,
  projectCheckFailure,
  projectEncodingFailure,
} from '../src/endpoint-contracts.js';

test('endpoint IDs reject invalid prefixes, suffixes, and lengths at the request boundary', async () => {
  for (const id of ['', '1primary', 'Primary', '!primary', 'primary!', 'primary\n', 'primary\r', 'a'.repeat(65)]) {
    const exit = await Effect.runPromiseExit(
      decodeCheckRequest({ endpoints: [{ id, url: 'https://example.com/health' }] }),
    );

    expect(Exit.isFailure(exit), JSON.stringify(id)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(Option.getOrThrow(Cause.findErrorOption(exit.cause))._tag).toBe('SchemaError');
      expect(Cause.hasDies(exit.cause)).toBe(false);
    }
  }

  for (const id of ['a', 'primary-api-2', 'a'.repeat(64)]) {
    const request = await Effect.runPromise(
      decodeCheckRequest({ endpoints: [{ id, url: 'https://example.com/health' }] }),
    );
    expect(request.endpoints[0].id).toBe(id);
  }
});

test('wire outcomes preserve every variant through decoding and encoding', async () => {
  const outcomes: readonly EndpointOutcome[] = [
    ...[200, 299].map((status): EndpointOutcome => ({ _tag: 'EndpointHealthy', id: 'healthy', status })),
    ...[100, 199, 400, 502, 504, 599].map((status): EndpointOutcome => ({
      _tag: 'EndpointRejected',
      id: 'rejected',
      status,
    })),
    ...[300, 399].map((status): EndpointOutcome => ({ _tag: 'EndpointRedirectRejected', id: 'redirect', status })),
    { _tag: 'EndpointUnavailable', id: 'unavailable', reason: 'transport' },
    { _tag: 'EndpointUnavailable', id: 'overloaded', reason: 'service-unavailable' },
    { _tag: 'EndpointTimedOut', id: 'timed-out' },
    { _tag: 'EndpointNotAllowed', id: 'not-allowed' },
  ];
  const decoded = await Effect.runPromise(Schema.decodeUnknownEffect(EndpointResults)(outcomes));
  const encoded = await Effect.runPromise(encodeEndpointResults(decoded));

  expect(encoded).toEqual(outcomes);
});

test('wire outcomes reject status values belonging to another classification', async () => {
  const cases = [
    { tag: 'EndpointHealthy', statuses: [199, 300] },
    { tag: 'EndpointRedirectRejected', statuses: [299, 400] },
    { tag: 'EndpointRejected', statuses: [99, 200, 299, 300, 399, 503, 600, 400.5] },
  ] as const;

  for (const { tag, statuses } of cases) {
    for (const status of statuses) {
      const outcome = { _tag: tag, id: 'primary-api', status };
      for (const operation of [
        Schema.decodeUnknownEffect(EndpointResults)([outcome]),
        encodeEndpointResults([outcome]),
      ]) {
        const exit = await Effect.runPromiseExit(operation);

        expect(Exit.isFailure(exit), `${tag}: ${String(status)}`).toBe(true);
        if (Exit.isFailure(exit)) {
          expect(Option.getOrThrow(Cause.findErrorOption(exit.cause))._tag).toBe('SchemaError');
          expect(Cause.hasDies(exit.cause)).toBe(false);
        }
      }
    }
  }
});

test('public failures preserve caller actions without exposing internal detail', async () => {
  const exit = await Effect.runPromiseExit(decodeCheckRequest({ endpoints: 'private-input' }));
  expect(Exit.isFailure(exit)).toBe(true);
  if (!Exit.isFailure(exit)) {
    return;
  }
  const schemaFailure = Option.getOrThrow(Cause.findErrorOption(exit.cause));

  expect(projectCheckFailure(schemaFailure)).toStrictEqual({
    code: 'invalid_request',
    message: 'The endpoint request is invalid.',
    retryDisposition: 'never',
  });
  expect(projectCheckFailure(new WorkflowDeadlineExceeded({ operation: 'endpoint-check' }))).toStrictEqual({
    code: 'deadline_exceeded',
    message: 'The endpoint check exceeded its total deadline.',
    retryDisposition: 'caller-may-retry',
  });
  expect(projectCheckFailure(new InvalidCheckPolicy({ reason: 'private-policy' }))).toStrictEqual({
    code: 'internal_error',
    message: 'The endpoint checker is misconfigured.',
    retryDisposition: 'never',
  });
  expect(projectEncodingFailure(schemaFailure)).toStrictEqual({
    code: 'internal_error',
    message: 'The endpoint result could not be encoded.',
    retryDisposition: 'never',
  });
});

test('diagnostics retain only the classification and fields owned by each failure', async () => {
  const exit = await Effect.runPromiseExit(decodeCheckRequest({ endpoints: 'private-input' }));
  expect(Exit.isFailure(exit)).toBe(true);
  if (!Exit.isFailure(exit)) {
    return;
  }
  const schemaFailure = Option.getOrThrow(Cause.findErrorOption(exit.cause));
  const cases = [
    { failure: schemaFailure, expected: { failureKind: 'invalid-request' } },
    {
      failure: new InvalidCheckPolicy({ reason: 'private-policy' }),
      expected: { failureKind: 'configuration-failure' },
    },
    {
      failure: new WorkflowDeadlineExceeded({ operation: 'endpoint-check' }),
      expected: { failureKind: 'workflow-deadline' },
    },
    {
      failure: new EndpointNotAllowed({ targetId: 'blocked' }),
      expected: { failureKind: 'endpoint-not-allowed', resource: 'blocked' },
    },
    {
      failure: new EndpointRedirectRejected({ targetId: 'redirected', status: 307 }),
      expected: { failureKind: 'endpoint-redirect-rejected', resource: 'redirected' },
    },
    {
      failure: new EndpointRejected({ targetId: 'rejected', status: 429 }),
      expected: { failureKind: 'endpoint-rejected', resource: 'rejected', statusClass: '4xx' },
    },
    {
      failure: new ProbeTransportError({ targetId: 'disconnected' }),
      expected: { failureKind: 'endpoint-transport', resource: 'disconnected' },
    },
    {
      failure: new AttemptTimedOut({ targetId: 'slow' }),
      expected: { failureKind: 'endpoint-timeout', resource: 'slow' },
    },
    {
      failure: new TransientProbeError({ targetId: 'overloaded' }),
      expected: { failureKind: 'endpoint-unavailable', resource: 'overloaded', statusClass: '5xx' },
    },
  ] as const;

  for (const { failure, expected } of cases) {
    expect(projectCheckDiagnostic(failure)).toStrictEqual({ ...expected, operation: 'endpoint-check' });
  }
});
