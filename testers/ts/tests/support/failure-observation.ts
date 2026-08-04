import { Cause, Effect, Option } from 'effect';

export type SafeFailureKind =
  | 'authentication-failure'
  | 'internal-defect'
  | 'protocol-failure'
  | 'provider-invalid-response'
  | 'provider-timeout'
  | 'rate-limited'
  | 'retry-exhausted';

export interface SafeFailureDiagnostic {
  readonly attempts?: number;
  readonly failureKind: SafeFailureKind;
  readonly operation: string;
  readonly resource?: string;
  readonly statusClass?: '4xx' | '5xx';
}

interface UnsafeOperationalFailureBase {
  readonly operation: string;
  readonly resource?: string;
  readonly unsafeDetail: unknown;
}

export type OperationalFailure =
  | (UnsafeOperationalFailureBase & {
      readonly _tag: 'AuthenticationDependencyFailure';
    })
  | (UnsafeOperationalFailureBase & {
      readonly _tag: 'ProtocolFailure';
    })
  | (UnsafeOperationalFailureBase & {
      readonly _tag: 'ProviderInvalidResponse';
      readonly status: number;
    })
  | (UnsafeOperationalFailureBase & {
      readonly _tag: 'ProviderTimeout';
      readonly attempts?: number;
    })
  | (UnsafeOperationalFailureBase & {
      readonly _tag: 'RateLimited';
    })
  | (UnsafeOperationalFailureBase & {
      readonly _tag: 'RetryExhausted';
      readonly attempts: number;
    });

const safeContext = (failure: OperationalFailure): Pick<SafeFailureDiagnostic, 'operation' | 'resource'> => ({
  operation: failure.operation,
  ...(failure.resource === undefined ? {} : { resource: failure.resource }),
});

export const projectOperationalFailure = (failure: OperationalFailure): SafeFailureDiagnostic => {
  switch (failure._tag) {
    case 'AuthenticationDependencyFailure':
      return {
        failureKind: 'authentication-failure',
        ...safeContext(failure),
      };
    case 'ProtocolFailure':
      return {
        failureKind: 'protocol-failure',
        ...safeContext(failure),
      };
    case 'ProviderInvalidResponse': {
      const statusClass =
        failure.status >= 400 && failure.status < 500
          ? '4xx'
          : failure.status >= 500 && failure.status < 600
            ? '5xx'
            : undefined;

      return {
        failureKind: 'provider-invalid-response',
        ...safeContext(failure),
        ...(statusClass === undefined ? {} : { statusClass }),
      };
    }
    case 'ProviderTimeout':
      return {
        failureKind: 'provider-timeout',
        ...safeContext(failure),
        ...(failure.attempts === undefined ? {} : { attempts: failure.attempts }),
      };
    case 'RateLimited':
      return {
        failureKind: 'rate-limited',
        ...safeContext(failure),
      };
    case 'RetryExhausted':
      return {
        attempts: failure.attempts,
        failureKind: 'retry-exhausted',
        ...safeContext(failure),
      };
  }
};

const projectCause = <E>(
  cause: Cause.Cause<E>,
  projectExpected: (error: E) => SafeFailureDiagnostic,
  defectOperation: string,
): Option.Option<SafeFailureDiagnostic> => {
  if (Cause.isInterruptedOnly(cause)) {
    return Option.none();
  }
  if (Array.from(Cause.defects(cause)).length > 0) {
    return Option.some({
      failureKind: 'internal-defect',
      operation: defectOperation,
    });
  }

  return Option.map(Cause.failureOption(cause), projectExpected);
};

export const observeFailureAtBoundary = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  projectExpected: (error: E) => SafeFailureDiagnostic,
  observe: (diagnostic: SafeFailureDiagnostic) => Effect.Effect<void>,
  defectOperation = 'unclassified-operation',
): Effect.Effect<A, E, R> =>
  Effect.tapErrorCause(effect, (cause) =>
    Option.match(projectCause(cause, projectExpected, defectOperation), {
      onNone: () => Effect.void,
      onSome: observe,
    }),
  );
