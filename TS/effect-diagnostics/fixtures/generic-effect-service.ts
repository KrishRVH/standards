import { Effect } from 'effect';

export class InvalidService<_A> extends Effect.Service<InvalidService<any>>()('InvalidService', {
  succeed: {},
}) {}
