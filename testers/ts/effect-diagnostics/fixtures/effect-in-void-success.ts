import * as Effect from 'effect/Effect';

export const invalid: Effect.Effect<void> = Effect.succeed(Effect.log('nested'));
