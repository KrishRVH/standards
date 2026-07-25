## Shared mutable state

The model is a pure function of (state, event) on one thread. State lives in
one place; a handler that needs a value already holds it.

`Arc`, `Rc`, `Mutex`, `RwLock`, `Cell`, `RefCell`, `lazy_static`,
`thread_local!`, statics, and atomics are design smells here, not tools.
Before using one, you must be able to state in one sentence what value is
being shared and why it cannot live on the root struct or arrive as an event.
If you cannot write that sentence, the design is wrong — restructure instead
of reaching for the primitive.

- Cross-thread data moves over channels: sender `Send` and cloneable,
  receiver pinned to the thread that owns the state. Send the event to the
  owner; never reach into state through a lock. For any proposed
  `Arc<Mutex<_>>`, first answer: what channel carries this instead?
- Ambient state the program mints (counters, id sources, anything a dispatch
  reads or advances) is a field on the root model, threaded to its use sites.
  `static NEXT: AtomicU64` is the canonical wrong shape: ambient, impure,
  and `Sync` only to satisfy `static`.
- State the outside world owns is external truth mirrored into the model:
  seeded at construction, kept current by events. The test is who mints the
  value. Program mints it → root field. OS owns it → event.

Narrow exceptions, each requiring a comment at the use site saying why the
structural version doesn't work: `OnceLock` for compute-once immutable
constants independent of state and config (compiled regexes, lookup tables);
primitives an external API's signature forces on you.

## Panics and infallibility claims

`unwrap`, `expect`, `unreachable!`, `panic!`, `todo!`, `unimplemented!`, and
`Infallible` in production code assert an invariant the types failed to
express. Fix the types, not the assertion:

- An `Option` that is always `Some` at a call site is a non-optional field
  or a narrower type.
- A match arm that cannot run is a state the handler should never be handed —
  narrow the enum before the call, not inside it.
- A `Result<T, Infallible>` you control returns `T` directly. `Infallible`
  is only correct when a trait you don't own dictates the error slot.

Failures the outside world owns — OS callbacks, user paths, socket reads —
get a typed error, a skip, or a failure-reporting event. Never unwrap a
value the OS controls. Panics must not cross FFI boundaries.

Escape hatch: if an invariant genuinely cannot be expressed in the type
system, or the structural fix would be disproportionately invasive, use
`expect` with a message naming the invariant and why the types cannot carry
it. That message is the review artifact; `expect("failed")` is a bug.

Tests may `expect` invariants the test itself established. Production code
is not a test fixture.
