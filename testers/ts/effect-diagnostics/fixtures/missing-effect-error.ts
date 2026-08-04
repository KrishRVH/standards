import { Data } from 'effect';
import type * as Effect from 'effect/Effect';

class Boom extends Data.TaggedError('Boom')<{}> {}

declare const program: Effect.Effect<number, Boom>;

// @ts-expect-error -- this fixture deliberately drops Boom from E.
export const invalid: () => Effect.Effect<number> = () => program;
