# Services, layers, and runtime ownership

The [enforcement map](enforcement.md) owns mandatory wording. This guide records
the profile's Effect v4 service and runtime model.

## Services represent capabilities

Create a service for a substitutable operational capability or an owned
resource, not every module. Declare it as a `Context.Service` class over a
named shape interface and attach its primary layer as a static `layer`, so API,
construction, and dependencies stay visible in one place:

```ts
interface MailerService {
  readonly send: (message: Message) => Effect.Effect<void, SendError>;
}

class Mailer extends Context.Service<Mailer, MailerService>()('@acme/orders/Mailer') {
  static readonly layer = Layer.effect(
    Mailer,
    Effect.gen(function* () {
      const transport = yield* SmtpTransport;
      const send = Effect.fn('Mailer.send')(function* (message: Message) {
        yield* transport.deliver(message);
      });

      return Mailer.of({ send });
    }),
  );
}
```

Name the primary layer `layer` and variants by purpose, such as `layerTest` or
`layerConfig`. `Context.Service<Self>()(id, { make })` stores a constructor
Effect on the class but builds no layer; define
`static readonly layer = Layer.effect(this, this.make)` and wire its
dependencies with `Layer.provide`. `Context.Reference` declares a value with a
default, such as a feature flag or tuning parameter.

Read a service with `yield* Mailer` inside a generator. `Mailer.use(f)` also
works, but `yield*` keeps the dependency visible at the call site.

Service keys are runtime identities. Namespace them and keep distinct
capabilities unique. Erased generic parameters cannot distinguish runtime
keys; use a non-generic capability with generic methods or concrete keys.

## Layer topology and lifetime

Use `Layer.succeed` for an existing value and `Layer.effect` for effectful
construction. `Layer.effect` supplies the layer's `Scope`, so an
`Effect.acquireRelease` inside it releases when the layer is torn down.
`Layer.effectDiscard` models startup work, such as a scoped background fiber,
that exports no service.

`Layer.mergeAll` combines siblings; one sibling does not supply another.
`Layer.provide` feeds dependencies and exposes only the outer output.
`Layer.provideMerge` also retains provider outputs.

Compose a feature layer near the feature and assemble application, framework,
request, and test roots deliberately. Layer memoization belongs to one memo
map: within a built context, nested `Effect.provide` calls share it, so the same
layer value acquires once. Separate top-level runs, separate `ManagedRuntime`
instances, `Layer.fresh`, and `Effect.provide(layer, { local: true })` acquire
again. Prove critical sharing with acquisition/finalization counts, and compose
layers before one `provide` rather than relying on memoization across several.

## Runtime edges

A runtime edge states:

1. the runtime and application layer;
2. the running operation's owner;
3. the signal or Scope that interrupts it;
4. who observes the complete `Exit`;
5. how the result becomes a safe host value; and
6. when runtime resources are disposed.

Domain and service code returns Effects. It does not call a runner. A test is a
runtime edge; a helper, render, or click callback is not one until it answers
the same ownership questions.

`ManagedRuntime.make(AppLayer)` is useful for a framework application.
Construct it once outside render and dispose it at application teardown.
Fibers started by `runFork`, `runCallback`, `runPromise`, or `runPromiseExit`
run in the runtime's fiber scope: disposal closes the layer and interrupts
them. `runSync` registers no fiber there. Disposal observes none of their
failures and settles no host-facing handle. Pass a shared
`memoMap` from `Layer.makeMemoMapUnsafe()` only when several runtimes must
share layer instances deliberately.

Application work that may outlive its initiating component/request transfers
to a scoped task service, for example one backed by `FiberSet`. That service
observes non-interruption failures, interrupts tasks at runtime shutdown, and
settles any host-facing handle. Work that must survive process termination
belongs in a durable queue/workflow, not an Effect fiber.
