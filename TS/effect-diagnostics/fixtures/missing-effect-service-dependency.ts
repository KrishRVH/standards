import * as Effect from 'effect/Effect';

class Db extends Effect.Service<Db>()('Db', { succeed: { ok: true } }) {}

export class InvalidRepo extends Effect.Service<InvalidRepo>()('InvalidRepo', {
  effect: Effect.gen(function* () {
    yield* Db;
    return { all: Effect.succeed([] as Array<number>) };
  }),
}) {}
