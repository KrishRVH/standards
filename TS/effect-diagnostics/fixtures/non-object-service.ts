import * as Effect from 'effect/Effect';

export class InvalidService extends Effect.Service<InvalidService>()('InvalidService', {
  // @ts-expect-error -- this fixture deliberately uses a primitive service.
  succeed: 'hello' as const,
}) {}
