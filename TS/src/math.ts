import { Effect, Schema } from 'effect';

const Operands = Schema.Tuple(Schema.Number, Schema.Number);

export function add(left: number, right: number): number {
  return left + right;
}

export const addValidated = Effect.fn('addValidated')((input: unknown) =>
  Schema.decodeUnknown(Operands)(input).pipe(Effect.map(([left, right]) => add(left, right))),
);
