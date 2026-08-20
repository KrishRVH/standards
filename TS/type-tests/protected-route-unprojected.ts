import { Data, Effect } from 'effect';

type ProtectedResponse = Readonly<{ status: number }>;

class RateLimited extends Data.TaggedError('RateLimited')<{
  readonly retryAfterSeconds: number;
}> {}

const executeProtectedRequest = <R>(
  handler: Effect.Effect<ProtectedResponse, never, R>,
): Effect.Effect<ProtectedResponse, never, R> => handler;

const handlerWithResidualError: Effect.Effect<ProtectedResponse, RateLimited> = Effect.fail(
  new RateLimited({ retryAfterSeconds: 30 }),
);

executeProtectedRequest(handlerWithResidualError);
