import { Context } from 'effect';

export class InvalidService<_A> extends Context.Service<InvalidService<any>, { readonly value: number }>()(
  'InvalidService',
) {}
