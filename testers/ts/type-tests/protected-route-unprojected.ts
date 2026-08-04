/* global Response */

import { Data, Effect } from 'effect';

class RateLimited extends Data.TaggedError('RateLimited')<{
  readonly retryAfterSeconds: number;
}> {}

const executeProtectedRequest = <R>(handler: Effect.Effect<Response, never, R>): Effect.Effect<Response, never, R> =>
  handler;

const handlerWithResidualError: Effect.Effect<Response, RateLimited> = Effect.fail(
  new RateLimited({ retryAfterSeconds: 30 }),
);

executeProtectedRequest(handlerWithResidualError);
