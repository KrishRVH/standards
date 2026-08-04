import { expect, test } from 'bun:test';
import { Cause, Data, Effect, Exit, Option } from 'effect';

import {
  type OperationalFailure,
  type SafeFailureDiagnostic,
  observeFailureAtBoundary,
  projectOperationalFailure,
} from './support/failure-observation.js';

class ProviderTimeout extends Data.TaggedError('ProviderTimeout')<{
  readonly operation: string;
}> {}

class DomainRejected extends Data.TaggedError('DomainRejected')<{
  readonly reason: 'profile-incomplete';
}> {}

test('one handling boundary observes a propagated failure once while layered observation duplicates it', async () => {
  const failure = new ProviderTimeout({ operation: 'profile.load' });
  const observed: SafeFailureDiagnostic[] = [];
  const observe = (diagnostic: SafeFailureDiagnostic) =>
    Effect.sync(() => {
      observed.push(diagnostic);
    });
  const project = (error: ProviderTimeout): SafeFailureDiagnostic => ({
    failureKind: 'provider-timeout',
    operation: error.operation,
  });
  const failing = Effect.fail(failure);

  await Effect.runPromiseExit(
    observeFailureAtBoundary(observeFailureAtBoundary(failing, project, observe), project, observe),
  );
  expect(observed).toHaveLength(2);

  observed.length = 0;
  const exit = await Effect.runPromiseExit(observeFailureAtBoundary(failing, project, observe));

  expect(observed).toEqual([
    {
      failureKind: 'provider-timeout',
      operation: 'profile.load',
    },
  ]);
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    expect(Option.getOrThrow(Cause.failureOption(exit.cause))).toEqual(failure);
  }
});

test('the telemetry projector keeps allowlisted classification and drops unsafe provider detail', () => {
  const failure: OperationalFailure = {
    _tag: 'ProviderTimeout',
    attempts: 3,
    operation: 'profile.load',
    resource: 'profile-provider',
    unsafeDetail: {
      headers: { authorization: 'Bearer credential-value' },
      message: 'provider-text-value',
      requestBody: '{"private":"request-body-value"}',
      sql: 'SELECT secret-column FROM private-table',
      url: 'https://provider.example/path?token=query-value',
    },
  };

  const diagnostic = projectOperationalFailure(failure);
  const serialized = JSON.stringify(diagnostic);

  expect(diagnostic).toEqual({
    attempts: 3,
    failureKind: 'provider-timeout',
    operation: 'profile.load',
    resource: 'profile-provider',
  });
  for (const unsafeValue of [
    'credential-value',
    'provider-text-value',
    'request-body-value',
    'SELECT secret-column',
    'query-value',
    'authorization',
  ]) {
    expect(serialized).not.toContain(unsafeValue);
  }
});

test('a handled domain rejection is not automatically observed as a server failure', async () => {
  const observed: SafeFailureDiagnostic[] = [];
  const handled = Effect.fail(new DomainRejected({ reason: 'profile-incomplete' })).pipe(
    Effect.catchTag('DomainRejected', (failure) =>
      Effect.succeed({ _tag: 'Rejected' as const, reason: failure.reason }),
    ),
  );
  const result = await Effect.runPromise(
    observeFailureAtBoundary(
      handled,
      (_failure: never) => ({ failureKind: 'internal-defect', operation: 'unreachable' }),
      (diagnostic) =>
        Effect.sync(() => {
          observed.push(diagnostic);
        }),
    ),
  );

  expect(result).toEqual({ _tag: 'Rejected', reason: 'profile-incomplete' });
  expect(observed).toEqual([]);
});

test('interruption is not observed as provider failure and defects keep a separate safe class', async () => {
  const observed: SafeFailureDiagnostic[] = [];
  const observe = (diagnostic: SafeFailureDiagnostic) =>
    Effect.sync(() => {
      observed.push(diagnostic);
    });
  const impossibleExpectedFailure = (_failure: never): SafeFailureDiagnostic => {
    throw new Error('An expected failure projector was called for a Cause without a typed failure.');
  };

  await Effect.runPromiseExit(
    observeFailureAtBoundary(Effect.interrupt, impossibleExpectedFailure, observe, 'provider.request'),
  );
  expect(observed).toEqual([]);

  await Effect.runPromiseExit(
    observeFailureAtBoundary(Effect.die('raw-defect-detail'), impossibleExpectedFailure, observe, 'provider.request'),
  );
  expect(observed).toEqual([
    {
      failureKind: 'internal-defect',
      operation: 'provider.request',
    },
  ]);
  expect(JSON.stringify(observed)).not.toContain('raw-defect-detail');
});
