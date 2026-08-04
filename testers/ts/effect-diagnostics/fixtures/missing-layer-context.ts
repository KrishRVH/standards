import { Context, Layer } from 'effect';

class A extends Context.Tag('@effect-diagnostics/A')<A, { readonly value: number }>() {}

declare const layer: Layer.Layer<A, never, A>;

// @ts-expect-error -- this fixture deliberately drops A from R.
export const invalid: Layer.Layer<A> = layer;
