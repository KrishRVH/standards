import { add } from '../src/math.js';

const result = add(2, 3);

if (result !== 5) {
  throw new Error(`expected 5, got ${result}`);
}
