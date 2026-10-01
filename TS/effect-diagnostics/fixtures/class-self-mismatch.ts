import { Context } from 'effect';

interface ServiceShape {
  readonly value: number;
}

export class InvalidContextService extends Context.Service<ValidContextService, ServiceShape>()(
  'ValidContextService',
) {}

declare class ValidContextService {}
