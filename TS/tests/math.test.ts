import { add } from '../src/math.js';

const left = 2;
const right = 3;
const expected = 5;
const result = add(left, right);

if (result !== expected) {
  throw new Error(`expected ${expected}, got ${result}`);
}
