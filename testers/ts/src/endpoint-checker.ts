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

export class EndpointProbe extends Context.Tag('project-name/EndpointProbe')<EndpointProbe, EndpointProbeService>() {}

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

export const EndpointProbeLive = Layer.succeed(
  EndpointProbe,
  makeEndpointProbe((input, init) => fetch(input, init)),
);

function authorizeEndpoint(
  target: EndpointTargetInput,
  policy: CheckedPolicy,
): Effect.Effect<CheckedEndpointTarget, EndpointNotAllowed> {
  const authorized =
    target.url.protocol === 'https:' &&
    target.url.username === '' &&
    target.url.password === '' &&
    policy.allowedOrigins.has(target.url.origin);

  return authorized
    ? Effect.succeed({ id: target.id, origin: target.url.origin, url: target.url })
    : Effect.fail(new EndpointNotAllowed({ targetId: target.id }));
}

function isRetryable(failure: EndpointProbeFailure | AttemptTimedOut): boolean {
  return failure._tag === 'TransientProbeError' || failure._tag === 'AttemptTimedOut';
}

export function checkEndpoint(
  probe: EndpointProbeService,
  target: CheckedEndpointTarget,
  policy: CheckedPolicy,
): Effect.Effect<EndpointHealthy, EndpointProbeFailure | AttemptTimedOut> {
  const attempt = probe.head(target).pipe(
    Effect.timeoutFail({
      duration: policy.attemptTimeout,
      onTimeout: () => new AttemptTimedOut({ targetId: target.id }),
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
    default:
      return failure satisfies never;
  }
}

export const checkEndpoints = Effect.fn('project-name/endpoint-checker.check')(
  (input: unknown, policyInput: unknown = defaultCheckPolicy) =>
    decodeCheckPolicy(policyInput).pipe(
      Effect.flatMap((policy) =>
        decodeCheckRequest(input).pipe(
          Effect.flatMap((request) =>
            Effect.gen(function* () {
              const probe = yield* EndpointProbe;

              return yield* Effect.forEach(
                request.endpoints,
                (target) =>
                  authorizeEndpoint(target, policy).pipe(
                    Effect.flatMap((authorized) => checkEndpoint(probe, authorized, policy)),
                    Effect.catchAll((failure) => Effect.succeed(projectEndpointOutcome(failure))),
                  ),
                { concurrency: policy.concurrency },
              );
            }),
          ),
          Effect.timeoutFail({
            duration: policy.totalDeadline,
            onTimeout: () => new WorkflowDeadlineExceeded({ operation: 'endpoint-check' }),
          }),
        ),
      ),
    ),
);
