import { Context, Effect, Layer, Schedule } from 'effect';

import {
  AttemptTimedOut,
  type EndpointHealthy,
  type EndpointLocalFailure,
  EndpointNotAllowed,
  type EndpointOutcome,
  type EndpointProbeFailure,
  EndpointRedirectRejected,
  EndpointRejected,
  type EndpointTargetInput,
  ProbeTransportError,
  TransientProbeError,
  WorkflowDeadlineExceeded,
  decodeCheckRequest,
} from './endpoint-contracts.js';
import { type CheckedPolicy, decodeCheckPolicy, defaultCheckPolicy } from './endpoint-policy.js';

const serviceUnavailableStatus = 503;

export interface CheckedEndpointTarget {
  readonly id: string;
  readonly origin: string;
  readonly url: URL;
}

export interface EndpointProbeService {
  readonly head: (target: CheckedEndpointTarget) => Effect.Effect<EndpointHealthy, EndpointProbeFailure>;
}

export type FetchLike = (input: Request | string | URL, init?: RequestInit) => Promise<Response>;

function classifyResponse(
  target: CheckedEndpointTarget,
  response: Response,
): Effect.Effect<EndpointHealthy, EndpointProbeFailure> {
  if (response.status >= 300 && response.status <= 399) {
    return Effect.fail(new EndpointRedirectRejected({ status: response.status, targetId: target.id }));
  }

  // HEAD is duplicate-safe here. Only the explicitly selected overload
  // response retries; this is not a universal HTTP retry table.
  if (response.status === serviceUnavailableStatus) {
    return Effect.fail(new TransientProbeError({ targetId: target.id }));
  }
  if (!response.ok) {
    return Effect.fail(new EndpointRejected({ status: response.status, targetId: target.id }));
  }

  return Effect.succeed({ _tag: 'EndpointHealthy', id: target.id, status: response.status });
}

export function makeEndpointProbe(fetcher: FetchLike): EndpointProbeService {
  return {
    head: Effect.fn('project-name/EndpointProbe.head')((target: CheckedEndpointTarget) =>
      Effect.tryPromise({
        try: (signal) =>
          fetcher(target.url, {
            method: 'HEAD',
            redirect: 'manual',
            signal,
          }),
        // Never retain or project the native error. Bun redirect:error can
        // include the original query string, and provider errors are untrusted.
        catch: () => new ProbeTransportError({ targetId: target.id }),
      }).pipe(Effect.flatMap((response) => classifyResponse(target, response))),
    ),
  };
}

export class EndpointProbe extends Context.Service<EndpointProbe, EndpointProbeService>()(
  'project-name/EndpointProbe',
) {
  static readonly layer = Layer.succeed(
    EndpointProbe,
    makeEndpointProbe((input, init) => fetch(input, init)),
  );
}

function authorizeEndpoint(
  target: EndpointTargetInput,
  policy: CheckedPolicy,
): Effect.Effect<CheckedEndpointTarget, EndpointNotAllowed> {
  // Membership in the normalized policy proves HTTPS; URL.origin omits credentials.
  const authorized =
    target.url.username === '' && target.url.password === '' && policy.allowedOrigins.has(target.url.origin);

  return authorized
    ? Effect.succeed({ id: target.id, origin: target.url.origin, url: target.url })
    : Effect.fail(new EndpointNotAllowed({ targetId: target.id }));
}

// A timed-out attempt is not retried: interrupting the Effect attempt does not
// prove the underlying operation stopped, so another attempt could overlap
// signal-ignorant work and exceed the apparent concurrency bound.
function isRetryable(failure: EndpointProbeFailure | AttemptTimedOut): boolean {
  return failure._tag === 'TransientProbeError';
}

export function checkEndpoint(
  probe: EndpointProbeService,
  target: CheckedEndpointTarget,
  policy: CheckedPolicy,
): Effect.Effect<EndpointHealthy, EndpointProbeFailure | AttemptTimedOut> {
  const attempt = probe.head(target).pipe(
    Effect.timeoutOrElse({
      duration: policy.attemptTimeout,
      orElse: () => Effect.fail(new AttemptTimedOut({ targetId: target.id })),
    }),
  );

  return attempt.pipe(
    Effect.retry({
      schedule: Schedule.spaced(policy.retryDelay),
      times: policy.retries,
      while: isRetryable,
    }),
  );
}

function projectEndpointOutcome(failure: EndpointLocalFailure): EndpointOutcome {
  switch (failure._tag) {
    case 'AttemptTimedOut':
      return { _tag: 'EndpointTimedOut', id: failure.targetId };
    case 'EndpointNotAllowed':
      return { _tag: 'EndpointNotAllowed', id: failure.targetId };
    case 'EndpointRedirectRejected':
      return { _tag: 'EndpointRedirectRejected', id: failure.targetId, status: failure.status };
    case 'EndpointRejected':
      return { _tag: 'EndpointRejected', id: failure.targetId, status: failure.status };
    case 'ProbeTransportError':
      return { _tag: 'EndpointUnavailable', id: failure.targetId, reason: 'transport' };
    case 'TransientProbeError':
      return { _tag: 'EndpointUnavailable', id: failure.targetId, reason: 'service-unavailable' };
  }
}

export const checkEndpoints = Effect.fn('project-name/endpoint-checker.check')(function* (
  input: unknown,
  policyInput: unknown = defaultCheckPolicy,
) {
  const policy = yield* decodeCheckPolicy(policyInput);
  const probe = yield* EndpointProbe;
  const checkTarget = (target: EndpointTargetInput): Effect.Effect<EndpointOutcome> =>
    authorizeEndpoint(target, policy).pipe(
      Effect.flatMap((authorized) => checkEndpoint(probe, authorized, policy)),
      Effect.catch((failure) => Effect.succeed(projectEndpointOutcome(failure))),
    );

  return yield* decodeCheckRequest(input).pipe(
    Effect.flatMap((request) => Effect.forEach(request.endpoints, checkTarget, { concurrency: policy.concurrency })),
    Effect.timeoutOrElse({
      duration: policy.totalDeadline,
      orElse: () => Effect.fail(new WorkflowDeadlineExceeded({ operation: 'endpoint-check' })),
    }),
  );
});
