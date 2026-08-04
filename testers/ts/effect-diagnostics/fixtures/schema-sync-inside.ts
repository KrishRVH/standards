import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

const Input = Schema.Struct({ name: Schema.String });

export const invalid = Effect.gen(function* () {
  const input = yield* Effect.succeed({ name: 'Ada' });
  return Schema.decodeUnknownSync(Input)(input);
});
