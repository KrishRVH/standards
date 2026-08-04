# Framework UI overlay

Read this overlay before changing a UI runtime adapter, component-owned
operation, application background task, publication guard, or runtime lease.
The [enforcement map](../enforcement.md) owns mandatory wording.

## Three owners

Keep three lifetimes distinct:

- **Component-owned operation:** navigation, unmount, or replacement ends its
  publication permission and initiates interruption.
- **Application-owned task:** may survive navigation, is supervised by an
  application task service, and is interrupted and observed when the
  application runtime is disposed.
- **Durable work:** must survive process termination and therefore belongs to a
  durable external queue or service, not an in-memory fiber.

Construct one application `ManagedRuntime` outside render. Dispose it at the
application lifetime boundary. `ManagedRuntime.runFork` starts a fiber but does
not by itself provide task registration, failure observation, or shutdown
policy; transferred tasks use the scoped application supervisor.

## Operation controller semantics

Use APIs whose host-visible timing is explicit:

- `interrupt` revokes publication synchronously and initiates Effect
  interruption. It does not promise that finalizers have completed when it
  returns to the host.
- `interruptAndWait` revokes publication, interrupts the fiber, and waits for
  interruption and finalizers to settle. Use it when the next host action
  depends on complete release.
- `replaceWith` revokes the prior publication, interrupts and waits for the old
  operation, then starts the replacement after required mutual exclusion is
  restored.

Names may differ, but one method must not ambiguously promise all three
behaviors. Cancellation and result publication are separate controls. If a
Promise ignores the supplied signal, or completion races interruption, a
synchronously revoked generation/token guard prevents the old result from
publishing even though underlying work may finish.

## React and host integration

React Strict Mode can mount, release, and remount development effects. A shared
runtime lease therefore needs deterministic retain/release semantics: a
transient release must not dispose a runtime that a paired remount still owns,
and two mounts must not construct duplicate application roots. Test the actual
lease/controller rather than relying on production-only lifecycle assumptions.

Component code should call the framework adapter or controller, not raw
`runFork`; the default ESLint overlay rejects that property in component
JSX/TSX, while runtime adapters live in ordinary `.ts` modules. A transferred
application's non-interruption failure is observed by the task owner exactly
once. Navigation does not cancel application-owned work; runtime disposal does.

## Deterministic contract tests

Use `Deferred` and controlled finalizers to prove:

- unmount revokes publication even when underlying work ignores cancellation;
- a nearly complete old operation cannot publish after replacement;
- replacement waits for the previous finalizer when mutual exclusion matters;
- application work survives navigation and stops on runtime disposal;
- a failed transferred task reaches its sole observer; and
- Strict Mode retain/release does not duplicate or prematurely dispose the
  runtime.

These are framework adapter tests, not universal claims that interruption alone
eliminates stale-result guards.
