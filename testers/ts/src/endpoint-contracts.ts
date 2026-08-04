import { Data, Effect, type ParseResult, Schema } from 'effect';

export const maximumEndpoints = 16;
const maximumEndpointIdLength = 64;

export const EndpointId = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(maximumEndpointIdLength),
  Schema.pattern(/^[a-z][a-z0-9-]*$/u),
);

const EndpointTargetInput = Schema.Struct({
  id: EndpointId,
  url: Schema.URL,
});

const EndpointTargets = Schema.NonEmptyArray(EndpointTargetInput).pipe(
  Schema.maxItems(maximumEndpoints),
  Schema.filter((targets) => {
    const ids = new Set(targets.map(({ id }) => id));

    return ids.size === targets.length || 'endpoint ids must be unique';
  }),
);

export const CheckRequest = Schema.Struct({ endpoints: EndpointTargets });

export type CheckRequest = Schema.Schema.Type<typeof CheckRequest>;
export type EndpointTargetInput = Schema.Schema.Type<typeof EndpointTargetInput>;

export const decodeCheckRequest = Effect.fn('project-name/endpoint-checker.decode-request')((input: unknown) =>
  Schema.decodeUnknown(CheckRequest)(input),
);

const RejectedHttpStatus = Schema.Number.pipe(
  Schema.int(),
  Schema.filter((status) => (status >= 100 && status <= 199) || (status >= 400 && status <= 599 && status !== 503), {
    description: 'an informational or rejected HTTP status excluding the separately classified 503',
  }),
);
const SuccessfulHttpStatus = Schema.Number.pipe(Schema.int(), Schema.between(200, 299));
const RedirectHttpStatus = Schema.Number.pipe(Schema.int(), Schema.between(300, 399));

export const EndpointHealthy = Schema.Struct({
  _tag: Schema.Literal('EndpointHealthy'),
  id: EndpointId,
  status: SuccessfulHttpStatus,
});

export const EndpointRejectedOutcome = Schema.Struct({
  _tag: Schema.Literal('EndpointRejected'),
  id: EndpointId,
  status: RejectedHttpStatus,
});

export const EndpointUnavailable = Schema.Struct({
  _tag: Schema.Literal('EndpointUnavailable'),
  id: EndpointId,
  reason: Schema.Literal('service-unavailable', 'transport'),
});

export const EndpointTimedOut = Schema.Struct({
  _tag: Schema.Literal('EndpointTimedOut'),
  id: EndpointId,
});

export const EndpointNotAllowedOutcome = Schema.Struct({
  _tag: Schema.Literal('EndpointNotAllowed'),
  id: EndpointId,
});

export const EndpointRedirectRejectedOutcome = Schema.Struct({
  _tag: Schema.Literal('EndpointRedirectRejected'),
  id: EndpointId,
  status: RedirectHttpStatus,
});

export const EndpointOutcome = Schema.Union(
  EndpointHealthy,
  EndpointRejectedOutcome,
  EndpointUnavailable,
  EndpointTimedOut,
  EndpointNotAllowedOutcome,
  EndpointRedirectRejectedOutcome,
);

export const EndpointResults = Schema.Array(EndpointOutcome);

export type EndpointHealthy = Schema.Schema.Type<typeof EndpointHealthy>;
export type EndpointOutcome = Schema.Schema.Type<typeof EndpointOutcome>;

export const encodeEndpointResults = Effect.fn('project-name/endpoint-checker.encode-results')(
  (results: readonly EndpointOutcome[]) => Schema.encode(EndpointResults)(results),
);

export class TransientProbeError extends Data.TaggedError('TransientProbeError')<{
  readonly targetId: string;
}> {}

export class EndpointRejected extends Data.TaggedError('EndpointRejected')<{
  readonly status: number;
  readonly targetId: string;
}> {}

export class EndpointNotAllowed extends Data.TaggedError('EndpointNotAllowed')<{
  readonly targetId: string;
}> {}

export class EndpointRedirectRejected extends Data.TaggedError('EndpointRedirectRejected')<{
  readonly status: number;
  readonly targetId: string;
}> {}

export class ProbeTransportError extends Data.TaggedError('ProbeTransportError')<{
  readonly targetId: string;
}> {}

export class AttemptTimedOut extends Data.TaggedError('AttemptTimedOut')<{
  readonly targetId: string;
}> {}

export class WorkflowDeadlineExceeded extends Data.TaggedError('WorkflowDeadlineExceeded')<{
  readonly operation: 'endpoint-check';
}> {}

export class InvalidCheckPolicy extends Data.TaggedError('InvalidCheckPolicy')<{
  readonly reason: string;
}> {}

export type EndpointProbeFailure =
  TransientProbeError | EndpointRejected | EndpointRedirectRejected | ProbeTransportError;

export type EndpointLocalFailure = EndpointProbeFailure | EndpointNotAllowed | AttemptTimedOut;
export type CheckFailure = ParseResult.ParseError | WorkflowDeadlineExceeded | InvalidCheckPolicy;

export type RetryDisposition = 'caller-may-retry' | 'never' | 'reconcile-first';

export interface PublicCheckFailure {
  readonly code: 'deadline_exceeded' | 'internal_error' | 'invalid_request';
  readonly message: string;
  readonly retryDisposition: RetryDisposition;
}

export function projectCheckFailure(failure: CheckFailure): PublicCheckFailure {
  switch (failure._tag) {
    case 'ParseError':
      return {
        code: 'invalid_request',
        message: 'The endpoint request is invalid.',
        retryDisposition: 'never',
      };
    case 'WorkflowDeadlineExceeded':
      return {
        code: 'deadline_exceeded',
        message: 'The endpoint check exceeded its total deadline.',
        retryDisposition: 'caller-may-retry',
      };
    case 'InvalidCheckPolicy':
      return {
        code: 'internal_error',
        message: 'The endpoint checker is misconfigured.',
        retryDisposition: 'never',
      };
    default:
      return failure satisfies never;
  }
}

export type SafeFailureKind =
  | 'configuration-failure'
  | 'endpoint-not-allowed'
  | 'endpoint-rejected'
  | 'endpoint-redirect-rejected'
  | 'endpoint-timeout'
  | 'endpoint-transport'
  | 'internal-defect'
  | 'invalid-request'
  | 'protocol-failure'
  | 'retry-exhausted'
  | 'workflow-deadline';

export interface SafeFailureDiagnostic {
  readonly attempts?: number;
  readonly failureKind: SafeFailureKind;
  readonly operation: 'endpoint-check';
  readonly resource?: string;
  readonly statusClass?: '4xx' | '5xx';
}

type DiagnosticFailure = CheckFailure | EndpointLocalFailure;

function statusClass(status: number): '4xx' | '5xx' | undefined {
  if (status >= 400 && status <= 499) {
    return '4xx';
  }
  if (status >= 500 && status <= 599) {
    return '5xx';
  }

  return undefined;
}

export function projectCheckDiagnostic(failure: DiagnosticFailure, attempts?: number): SafeFailureDiagnostic {
  switch (failure._tag) {
    case 'ParseError':
      return { failureKind: 'invalid-request', operation: 'endpoint-check' };
    case 'InvalidCheckPolicy':
      return { failureKind: 'configuration-failure', operation: 'endpoint-check' };
    case 'WorkflowDeadlineExceeded':
      return { failureKind: 'workflow-deadline', operation: 'endpoint-check' };
    case 'EndpointNotAllowed':
      return { failureKind: 'endpoint-not-allowed', operation: 'endpoint-check', resource: failure.targetId };
    case 'EndpointRedirectRejected':
      return {
        failureKind: 'endpoint-redirect-rejected',
        operation: 'endpoint-check',
        resource: failure.targetId,
      };
    case 'EndpointRejected': {
      const projectedStatusClass = statusClass(failure.status);

      return {
        failureKind: 'endpoint-rejected',
        operation: 'endpoint-check',
        resource: failure.targetId,
        ...(projectedStatusClass === undefined ? {} : { statusClass: projectedStatusClass }),
      };
    }
    case 'ProbeTransportError':
      return { failureKind: 'endpoint-transport', operation: 'endpoint-check', resource: failure.targetId };
    case 'AttemptTimedOut':
      return {
        failureKind: 'endpoint-timeout',
        operation: 'endpoint-check',
        resource: failure.targetId,
        ...(attempts === undefined ? {} : { attempts }),
      };
    case 'TransientProbeError':
      return {
        failureKind: 'retry-exhausted',
        operation: 'endpoint-check',
        resource: failure.targetId,
        ...(attempts === undefined ? {} : { attempts }),
        statusClass: '5xx',
      };
    default:
      return failure satisfies never;
  }
}

export function projectDefectDiagnostic(): SafeFailureDiagnostic {
  return { failureKind: 'internal-defect', operation: 'endpoint-check' };
}

export function projectEncodingFailure(_failure: ParseResult.ParseError): PublicCheckFailure {
  return {
    code: 'internal_error',
    message: 'The endpoint result could not be encoded.',
    retryDisposition: 'never',
  };
}

export function projectEncodingDiagnostic(_failure: ParseResult.ParseError): SafeFailureDiagnostic {
  return { failureKind: 'protocol-failure', operation: 'endpoint-check' };
}
