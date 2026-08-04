import * as Effect from 'effect/Effect';

interface ServiceShape {
  readonly value: number;
}

export class InvalidContextTag extends Effect.Tag('ValidContextTag')<ValidContextTag, ServiceShape>() {}

declare class ValidContextTag {}
