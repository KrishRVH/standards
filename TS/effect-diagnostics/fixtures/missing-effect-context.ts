import { Context, Effect } from 'effect';

class Db extends Context.Service<Db, { readonly query: () => void }>()('@effect-diagnostics/Db') {}

// @ts-expect-error -- this fixture deliberately drops Db from R.
export const invalid: Effect.Effect<void> = Db.pipe(Effect.asVoid);
