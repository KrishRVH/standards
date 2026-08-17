import { type Duration, Effect, Schema } from 'effect';

import type { RetryDisposition } from '../../src/endpoint-contracts.js';

const ProfileResponseSchema = Schema.Struct({
  displayName: Schema.String,
  id: Schema.String,
});

const WireErrorSchema = Schema.Struct({
  code: Schema.Literal('forbidden', 'profile-incomplete', 'rate-limited', 'service-unavailable', 'session-expired'),
});

type WireError = Schema.Schema.Type<typeof WireErrorSchema>;

export type ProfileResponse = Schema.Schema.Type<typeof ProfileResponseSchema>;

export type ClientApiFailure =
  | {
      readonly _tag: 'DomainRejected';
      readonly action: 'complete-profile';
      readonly code: 'profile-incomplete';
      readonly retryDisposition: 'never';
    }
  | {
      readonly _tag: 'Forbidden';
      readonly retryDisposition: 'never';
    }
  | {
      readonly _tag: 'MalformedErrorResponse';
      readonly retryDisposition: 'never';
    }
  | {
      readonly _tag: 'MalformedSuccessResponse';
      readonly failureKind: 'protocol-failure';
      readonly retryDisposition: 'never';
    }
  | {
      readonly _tag: 'RateLimited';
      readonly retryAfterMillis?: number;
      readonly retryDisposition: 'caller-may-retry';
    }
  | {
      readonly _tag: 'RequestTimedOut';
      readonly retryDisposition: RetryDisposition;
    }
  | {
      readonly _tag: 'ServiceUnavailable';
      readonly failureKind: 'service-unavailable';
      readonly retryDisposition: 'caller-may-retry';
    }
  | {
      readonly _tag: 'SessionRequired';
      readonly action: 'reauthenticate';
      readonly retryDisposition: 'never';
    }
  | {
      readonly _tag: 'TransportFailure';
      readonly retryDisposition: RetryDisposition;
    };

export interface ClientRequestOptions {
  /** Caller guidance for an ambiguous timeout or transport failure; this does not configure automatic retry. */
  readonly callerRetryDisposition: RetryDisposition;
  readonly fetch: (signal: AbortSignal) => Promise<Response>;
  readonly timeout: Duration.Duration;
}

const decodeSuccess = (response: Response): Effect.Effect<ProfileResponse, ClientApiFailure> =>
  Effect.tryPromise(() => response.json()).pipe(
    Effect.flatMap(Schema.decodeUnknown(ProfileResponseSchema)),
    Effect.mapError(() => ({
      _tag: 'MalformedSuccessResponse' as const,
      failureKind: 'protocol-failure' as const,
      retryDisposition: 'never' as const,
    })),
  );

const malformedErrorResponse = (): ClientApiFailure => ({
  _tag: 'MalformedErrorResponse',
  retryDisposition: 'never',
});

const maximumRetryAfterMillis = 300_000;

const parseRetryAfterMillis = (header: string | null): number | undefined => {
  if (header === null || !/^(?:0|[1-9]\d*)$/.test(header)) {
    return undefined;
  }

  const seconds = Number(header);
  if (!Number.isSafeInteger(seconds)) {
    return maximumRetryAfterMillis;
  }

  return Math.min(seconds * 1_000, maximumRetryAfterMillis);
};

const projectWireError = (response: Response, error: WireError): ClientApiFailure => {
  switch (error.code) {
    case 'session-expired':
      return response.status === 401
        ? {
            _tag: 'SessionRequired',
            action: 'reauthenticate',
            retryDisposition: 'never',
          }
        : malformedErrorResponse();
    case 'forbidden':
      return response.status === 403
        ? {
            _tag: 'Forbidden',
            retryDisposition: 'never',
          }
        : malformedErrorResponse();
    case 'rate-limited': {
      if (response.status !== 429) {
        return malformedErrorResponse();
      }

      const retryAfterMillis = parseRetryAfterMillis(response.headers.get('retry-after'));
      return {
        _tag: 'RateLimited',
        ...(retryAfterMillis === undefined ? {} : { retryAfterMillis }),
        retryDisposition: 'caller-may-retry',
      };
    }
    case 'service-unavailable':
      return response.status === 503
        ? {
            _tag: 'ServiceUnavailable',
            failureKind: 'service-unavailable',
            retryDisposition: 'caller-may-retry',
          }
        : malformedErrorResponse();
    case 'profile-incomplete':
      return response.status === 422
        ? {
            _tag: 'DomainRejected',
            action: 'complete-profile',
            code: 'profile-incomplete',
            retryDisposition: 'never',
          }
        : malformedErrorResponse();
    default:
      return error.code satisfies never;
  }
};

const decodeError = (response: Response): Effect.Effect<never, ClientApiFailure> =>
  Effect.tryPromise(() => response.json()).pipe(
    Effect.flatMap(Schema.decodeUnknown(WireErrorSchema)),
    Effect.mapError(malformedErrorResponse),
    Effect.flatMap((error) => Effect.fail(projectWireError(response, error))),
  );

export const executeClientRequest = ({
  callerRetryDisposition,
  fetch,
  timeout,
}: ClientRequestOptions): Effect.Effect<ProfileResponse, ClientApiFailure> =>
  Effect.tryPromise({
    catch: () => ({
      _tag: 'TransportFailure' as const,
      retryDisposition: callerRetryDisposition,
    }),
    try: (signal) => fetch(signal),
  }).pipe(
    Effect.flatMap((response) => (response.ok ? decodeSuccess(response) : decodeError(response))),
    Effect.timeoutFail({
      duration: timeout,
      onTimeout: () => ({
        _tag: 'RequestTimedOut' as const,
        retryDisposition: callerRetryDisposition,
      }),
    }),
  );
