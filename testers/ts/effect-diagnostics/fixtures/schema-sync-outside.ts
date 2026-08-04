import * as Schema from 'effect/Schema';

const Input = Schema.Struct({ name: Schema.String });

export const decodeInput = Schema.decodeUnknownSync(Input);
