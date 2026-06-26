import { expect, test } from 'bun:test';

import { add } from '../src/math.js';

test('adds integers', () => {
  expect(add(2, 3)).toBe(5);
});
