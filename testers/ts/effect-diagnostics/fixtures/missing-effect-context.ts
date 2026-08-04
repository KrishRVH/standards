import { Context, Effect } from 'effect';

class Db extends Context.Tag('@effect-diagnostics/Db')<Db, { readonly query: () => void }>() {}

// @ts-expect-error -- this fixture deliberately drops Db from R.
export const invalid: Effect.Effect<void> = Db.pipe(Effect.asVoid);
