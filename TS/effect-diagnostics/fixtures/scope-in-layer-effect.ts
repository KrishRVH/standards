import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

class Cache extends Context.Tag('Cache')<Cache, { readonly ok: true }>() {}

export const invalid = Layer.effect(
  Cache,
  Effect.gen(function* () {
    yield* Effect.addFinalizer(() => Effect.void);
    return { ok: true as const };
  }),
);
