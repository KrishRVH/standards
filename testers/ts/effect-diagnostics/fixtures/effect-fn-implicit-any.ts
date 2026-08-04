import * as Effect from 'effect/Effect';

export const invalid = Effect.fn('invalid')((input) => Effect.succeed(input));
