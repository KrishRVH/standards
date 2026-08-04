import { Context, Data, Duration, Effect, Layer, Option, type ParseResult, Schedule, Schema } from 'effect';

const maximumEndpoints = 16;
const maximumRetries = 5;
const serviceUnavailableStatus = 503;

export const CheckRequest = Schema.Struct({
  endpoints: Schema.NonEmptyArray(Schema.URL).pipe(Schema.maxItems(maximumEndpoints)),
});

export type CheckRequest = Schema.Schema.Type<typeof CheckRequest>;

export const decodeCheckRequest = Effect.fn('project-name/endpoint-checker.decode-request')((input: unknown) =>
  Schema.decodeUnknown(CheckRequest)(input),
);

export const EndpointResult = Schema.Struct({
  status: Schema.Int,
  target: Schema.String,
});

export const EndpointResults = Schema.Array(EndpointResult);

export type EndpointResult = Schema.Schema.Type<typeof EndpointResult>;

export const encodeEndpointResults = Effect.fn('project-name/endpoint-checker.encode-results')(
  (results: readonly EndpointResult[]) => Schema.encode(EndpointResults)(results),
);

export class TransientProbeError extends Data.TaggedError('TransientProbeError')<{
  readonly target: string;
}> {}

export class EndpointRejected extends Data.TaggedError('EndpointRejected')<{
  readonly status: number;
  readonly target: string;
}> {}

export class EndpointNotAllowed extends Data.TaggedError('EndpointNotAllowed')<{
  readonly target: string;
}> {}

export class ProbeTransportError extends Data.TaggedError('ProbeTransportError')<{
  readonly target: string;
}> {}

export class AttemptTimedOut extends Data.TaggedError('AttemptTimedOut')<{
  readonly target: string;
}> {}

export class WorkflowDeadlineExceeded extends Data.TaggedError('WorkflowDeadlineExceeded')<{
  readonly operation: 'endpoint-check';
}> {}

export class InvalidCheckPolicy extends Data.TaggedError('InvalidCheckPolicy')<{
  readonly reason: string;
}> {}

export type EndpointProbeFailure = TransientProbeError | EndpointRejected | ProbeTransportError;

export interface EndpointProbeService {
  readonly head: (endpoint: URL) => Effect.Effect<EndpointResult, EndpointProbeFailure>;
}

export class EndpointProbe extends Context.Tag('project-name/EndpointProbe')<EndpointProbe, EndpointProbeService>() {}

export type FetchLike = (input: Request | string | URL, init?: RequestInit) => Promise<Response>;

function targetOf(endpoint: URL): string {
  return endpoint.origin;
}

function classifyResponse(endpoint: URL, response: Response): Effect.Effect<EndpointResult, EndpointProbeFailure> {
  const target = targetOf(endpoint);

  // This example probes with duplicate-safe HEAD requests. Its retry
  // classification is local to that operation, not a universal HTTP table.
  // This adapter retries only the explicitly selected 503 overload response.
  // A 429 requires provider-specific Retry-After handling, so it is rejected
  // here rather than guessed at by a universal table.
  if (response.status === serviceUnavailableStatus) {
    return Effect.fail(new TransientProbeError({ target }));
  }
  if (!response.ok) {
    return Effect.fail(new EndpointRejected({ status: response.status, target }));
  }

  return Effect.succeed({ status: response.status, target });
}

export function makeEndpointProbe(fetcher: FetchLike): EndpointProbeService {
  return {
    head: Effect.fn('project-name/EndpointProbe.head')((endpoint: URL) =>
      Effect.tryPromise({
        try: (signal) =>
          fetcher(endpoint, {
            method: 'HEAD',
            redirect: 'error',
            signal,
          }),
        // Unknown transport failures are not automatically retryable. A
        // concrete adapter may map proven transient cases more narrowly.
        catch: () => new ProbeTransportError({ target: targetOf(endpoint) }),
      }).pipe(Effect.flatMap((response) => classifyResponse(endpoint, response))),
    ),
  };
}

export const EndpointProbeLive = Layer.succeed(
  EndpointProbe,
  makeEndpointProbe((input, init) => fetch(input, init)),
);

export interface CheckPolicy {
  readonly allowedOrigins: ReadonlySet<string>;
  readonly attemptTimeout: Duration.DurationInput;
  readonly concurrency: number;
  readonly retries: number;
  readonly retryDelay: Duration.DurationInput;
  readonly totalDeadline: Duration.DurationInput;
}

export const defaultCheckPolicy: CheckPolicy = {
  allowedOrigins: new Set(['https://example.com']),
  attemptTimeout: '2 seconds',
  concurrency: 4,
  retries: 2,
  retryDelay: '100 millis',
  totalDeadline: '7 seconds',
};

function isFiniteDuration(input: Duration.DurationInput, allowZero: boolean): boolean {
  const decoded = Duration.decodeUnknown(input);

  if (Option.isNone(decoded) || !Duration.isFinite(decoded.value)) {
    return false;
  }

  return allowZero || !Duration.isZero(decoded.value);
}

function validatePolicy(policy: CheckPolicy): Effect.Effect<CheckPolicy, InvalidCheckPolicy> {
  if (!Number.isSafeInteger(policy.concurrency) || policy.concurrency < 1 || policy.concurrency > maximumEndpoints) {
    return Effect.fail(new InvalidCheckPolicy({ reason: 'concurrency must be an integer from 1 through 16' }));
  }
  if (!Number.isSafeInteger(policy.retries) || policy.retries < 0 || policy.retries > maximumRetries) {
    return Effect.fail(new InvalidCheckPolicy({ reason: 'retries must be an integer from 0 through 5' }));
  }
  if (policy.allowedOrigins.size === 0 || policy.allowedOrigins.size > maximumEndpoints) {
    return Effect.fail(new InvalidCheckPolicy({ reason: 'allowedOrigins must contain from 1 through 16 origins' }));
  }
  const durationsAreValid =
    isFiniteDuration(policy.attemptTimeout, false) &&
    isFiniteDuration(policy.retryDelay, true) &&
    isFiniteDuration(policy.totalDeadline, false);

  if (!durationsAreValid) {
    return Effect.fail(
      new InvalidCheckPolicy({ reason: 'timeouts must be finite and positive; retryDelay may be zero' }),
    );
  }

  return Effect.succeed(policy);
}

function authorizeEndpoint(endpoint: URL, policy: CheckPolicy): Effect.Effect<URL, EndpointNotAllowed> {
  const authorized =
    endpoint.protocol === 'https:' &&
    endpoint.username === '' &&
    endpoint.password === '' &&
    policy.allowedOrigins.has(endpoint.origin);

  if (authorized) {
    return Effect.succeed(endpoint);
  }

  return Effect.fail(new EndpointNotAllowed({ target: targetOf(endpoint) }));
}

function isRetryable(failure: EndpointProbeFailure | AttemptTimedOut): boolean {
  return failure._tag === 'TransientProbeError' || failure._tag === 'AttemptTimedOut';
}

function checkOne(
  probe: EndpointProbeService,
  endpoint: URL,
  policy: CheckPolicy,
): Effect.Effect<EndpointResult, EndpointProbeFailure | AttemptTimedOut> {
  const attempt = probe.head(endpoint).pipe(
    Effect.timeoutFail({
      duration: policy.attemptTimeout,
      onTimeout: () => new AttemptTimedOut({ target: targetOf(endpoint) }),
    }),
  );

  return attempt.pipe(
    Effect.retry({
      schedule: Schedule.exponential(policy.retryDelay).pipe(Schedule.jittered),
      times: policy.retries,
      while: isRetryable,
    }),
  );
}

export const checkEndpoints = Effect.fn('project-name/endpoint-checker.check')(
  (input: unknown, policy: CheckPolicy = defaultCheckPolicy) =>
    validatePolicy(policy).pipe(
      Effect.flatMap((checkedPolicy) =>
        Effect.gen(function* () {
          const request = yield* decodeCheckRequest(input);
          const probe = yield* EndpointProbe;

          return yield* Effect.forEach(
            request.endpoints,
            (endpoint) =>
              authorizeEndpoint(endpoint, checkedPolicy).pipe(
                Effect.flatMap((authorized) => checkOne(probe, authorized, checkedPolicy)),
              ),
            {
              concurrency: checkedPolicy.concurrency,
            },
          );
        }).pipe(
          Effect.timeoutFail({
            duration: checkedPolicy.totalDeadline,
            onTimeout: () => new WorkflowDeadlineExceeded({ operation: 'endpoint-check' }),
          }),
        ),
      ),
    ),
);

export type CheckFailure =
  | ParseResult.ParseError
  | EndpointProbeFailure
  | EndpointNotAllowed
  | AttemptTimedOut
  | WorkflowDeadlineExceeded
  | InvalidCheckPolicy;

export interface PublicCheckFailure {
  readonly code:
    | 'deadline_exceeded'
    | 'endpoint_not_allowed'
    | 'endpoint_rejected'
    | 'endpoint_unavailable'
    | 'internal_error'
    | 'invalid_request';
  readonly message: string;
  readonly retryable: boolean;
}

export function projectCheckFailure(failure: CheckFailure): PublicCheckFailure {
  switch (failure._tag) {
    case 'ParseError':
      return {
        code: 'invalid_request',
        message: 'The endpoint request is invalid.',
        retryable: false,
      };
    case 'EndpointRejected':
      return {
        code: 'endpoint_rejected',
        message: 'An endpoint rejected the probe.',
        retryable: false,
      };
    case 'EndpointNotAllowed':
      return {
        code: 'endpoint_not_allowed',
        message: 'An endpoint is not in the configured destination policy.',
        retryable: false,
      };
    case 'ProbeTransportError':
      return {
        code: 'endpoint_unavailable',
        message: 'An endpoint could not be reached.',
        retryable: false,
      };
    case 'TransientProbeError':
    case 'AttemptTimedOut':
      return {
        code: 'endpoint_unavailable',
        message: 'An endpoint is temporarily unavailable.',
        retryable: true,
      };
    case 'WorkflowDeadlineExceeded':
      return {
        code: 'deadline_exceeded',
        message: 'The endpoint check exceeded its total deadline.',
        retryable: true,
      };
    case 'InvalidCheckPolicy':
      return {
        code: 'internal_error',
        message: 'The endpoint checker is misconfigured.',
        retryable: false,
      };
    default:
      return failure satisfies never;
  }
}

export function projectEncodingFailure(_failure: ParseResult.ParseError): PublicCheckFailure {
  return {
    code: 'internal_error',
    message: 'The endpoint result could not be encoded.',
    retryable: false,
  };
}
