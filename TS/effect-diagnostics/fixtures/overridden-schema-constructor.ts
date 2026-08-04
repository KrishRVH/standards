import * as Schema from 'effect/Schema';

export class InvalidUser extends Schema.Class<InvalidUser>('InvalidUser')({ name: Schema.String }) {
  constructor(readonly input: { name: string }) {
    super(input);
  }
}
