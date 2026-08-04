import { Effect } from 'effect';

declare const program: Effect.Effect<string, 'boom', 'service'>;

export const invalid = program as Effect.Effect<string, never, never>;
