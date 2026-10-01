import { Data, Effect, Schema } from 'effect';

export const maximumEndpoints = 16;
const maximumEndpointIdLength = 64;

export const EndpointId = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(maximumEndpointIdLength),
  Schema.isPattern(/^[a-z][a-z0-9-]*$/u),
);

const EndpointTargetInput = Schema.Struct({
  id: EndpointId,
  url: Schema.URLFromString,
});

const EndpointTargets = Schema.NonEmptyArray(EndpointTargetInput).check(
  Schema.isMaxLength(maximumEndpoints),
  Schema.makeFilter((targets) => {
    const ids = new Set(targets.map(({ id }) => id));

    return ids.size === targets.length || 'endpoint ids must be unique';
  }),
);

export const CheckRequest = Schema.Struct({ endpoints: EndpointTargets });

export type CheckRequest = typeof CheckRequest.Type;
export type EndpointTargetInput = typeof EndpointTargetInput.Type;

const decodeCheckRequestInput = Schema.decodeUnknownEffect(CheckRequest, { onExcessProperty: 'ignore' });

export const decodeCheckRequest = Effect.fn('project-name/endpoint-checker.decode-request')((input: unknown) =>
  decodeCheckRequestInput(input),
);

const RejectedHttpStatus = Schema.Int.check(
  Schema.makeFilter(
    (status) => (status >= 100 && status <= 199) || (status >= 400 && status <= 599 && status !== 503),
    { description: 'an informational or rejected HTTP status excluding the separately classified 503' },
  ),
);
const SuccessfulHttpStatus = Schema.Int.check(Schema.isBetween({ minimum: 200, maximum: 299 }));
const RedirectHttpStatus = Schema.Int.check(Schema.isBetween({ minimum: 300, maximum: 399 }));

export const EndpointHealthy = Schema.TaggedStruct('EndpointHealthy', {
  id: EndpointId,
  status: SuccessfulHttpStatus,
});

export const EndpointRejectedOutcome = Schema.TaggedStruct('EndpointRejected', {
  id: EndpointId,
  status: RejectedHttpStatus,
});

export const EndpointUnavailable = Schema.TaggedStruct('EndpointUnavailable', {
  id: EndpointId,
  reason: Schema.Literals(['service-unavailable', 'transport']),
});

export const EndpointTimedOut = Schema.TaggedStruct('EndpointTimedOut', {
  id: EndpointId,
});

export const EndpointNotAllowedOutcome = Schema.TaggedStruct('EndpointNotAllowed', {
  id: EndpointId,
});

export const EndpointRedirectRejectedOutcome = Schema.TaggedStruct('EndpointRedirectRejected', {
  id: EndpointId,
  status: RedirectHttpStatus,
});

export const EndpointOutcome = Schema.Union([
  EndpointHealthy,
  EndpointRejectedOutcome,
  EndpointUnavailable,
  EndpointTimedOut,
  EndpointNotAllowedOutcome,
  EndpointRedirectRejectedOutcome,
]);

export const EndpointResults = Schema.Array(EndpointOutcome);

export type EndpointHealthy = typeof EndpointHealthy.Type;
export type EndpointOutcome = typeof EndpointOutcome.Type;

const encodeEndpointResultsOutput = Schema.encodeEffect(EndpointResults);

export const encodeEndpointResults = Effect.fn('project-name/endpoint-checker.encode-results')(
  (results: readonly EndpointOutcome[]) => encodeEndpointResultsOutput(results),
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
  | TransientProbeError
  | EndpointRejected
  | EndpointRedirectRejected
  | ProbeTransportError;

export type EndpointLocalFailure = EndpointProbeFailure | EndpointNotAllowed | AttemptTimedOut;
export type CheckFailure = Schema.SchemaError | WorkflowDeadlineExceeded | InvalidCheckPolicy;

export type RetryDisposition = 'caller-may-retry' | 'never' | 'reconcile-first';

export interface PublicCheckFailure {
  readonly code: 'deadline_exceeded' | 'internal_error' | 'invalid_request';
  readonly message: string;
  readonly retryDisposition: RetryDisposition;
}

export function projectCheckFailure(failure: CheckFailure): PublicCheckFailure {
  switch (failure._tag) {
    case 'SchemaError':
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
  | 'endpoint-redirect-rejected'
  | 'endpoint-rejected'
  | 'endpoint-timeout'
  | 'endpoint-transport'
  | 'endpoint-unavailable'
  | 'internal-defect'
  | 'invalid-request'
  | 'protocol-failure'
  | 'workflow-deadline';

// This fixture has no automatic-retry owner producing attempt metadata, so it
// carries no attempt count and no retry-exhaustion classification. Both must
// originate from a real retry owner.
export interface SafeFailureDiagnostic {
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

export function projectCheckDiagnostic(failure: DiagnosticFailure): SafeFailureDiagnostic {
  switch (failure._tag) {
    case 'SchemaError':
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
      };
    case 'TransientProbeError':
      return {
        failureKind: 'endpoint-unavailable',
        operation: 'endpoint-check',
        resource: failure.targetId,
        statusClass: '5xx',
      };
    default:
      return failure satisfies never;
  }
}

export function projectDefectDiagnostic(): SafeFailureDiagnostic {
  return { failureKind: 'internal-defect', operation: 'endpoint-check' };
}

export function projectEncodingFailure(_failure: Schema.SchemaError): PublicCheckFailure {
  return {
    code: 'internal_error',
    message: 'The endpoint result could not be encoded.',
    retryDisposition: 'never',
  };
}
