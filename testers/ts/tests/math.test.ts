import { expect, test } from 'bun:test';
import { Effect, Exit } from 'effect';

import { add, addValidated } from '../src/math.js';

test('adds integers', () => {
  expect(add(2, 3)).toBe(5);
});

test('adds validated operands at the Effect boundary', () =>
  Effect.runPromise(addValidated([2, 3])).then((result) => {
    expect(result).toBe(5);
  }));

test('rejects invalid operands at the Effect boundary', () =>
  Effect.runPromiseExit(addValidated([2, '3'])).then((result) => {
    expect(Exit.isFailure(result)).toBe(true);
  }));
