# Services, layers, and runtime ownership

The [enforcement map](enforcement.md) owns mandatory wording. This guide records
the profile's Effect 3.22.1 service and runtime model.

## Services represent capabilities

Create a service for a substitutable operational capability or an owned
resource, not every module. The profile prefers an explicit interface,
namespaced `Context.Tag`, and named layer because API, construction, and
dependencies stay visible. This is a project legibility preference, not a
universal Effect-style claim.

```ts
interface MailerService {
  readonly send: (message: Message) => Effect.Effect<void, SendError>;
}

class Mailer extends Context.Tag('@acme/orders/Mailer')<Mailer, MailerService>() {}
```

`Effect.Tag` is a stable v3 alternative when proxy accessors remove useful
boilerplate. `Effect.Service` is experimental in Effect 3.22.1 and combines
tag, construction, dependency, and accessor concerns; adopt that tradeoff
deliberately.

Context keys are runtime identities. Namespace them and keep distinct
capabilities unique. Erased generic parameters cannot distinguish runtime
tags; use a non-generic capability with generic methods or concrete tags.

## Layer topology and lifetime

Use `Layer.succeed` for an existing value, `Layer.effect` for effectful
construction without an owned release, and `Layer.scoped` when the layer owns
acquire/release. `Layer.effectDiscard` models startup work that exports no
service.

`Layer.mergeAll` combines siblings; one sibling does not supply another.
`Layer.provide` feeds dependencies and exposes only the outer output.
`Layer.provideMerge` also retains provider outputs.

Compose a feature layer near the feature and assemble application, framework,
request, and test roots deliberately. Layer memoization belongs to one build
memo map: reuse of the same layer identity inside a root can share acquisition;
`Layer.fresh`, separate builds, and separate runtimes reacquire. Prove critical
sharing with acquisition/finalization counts.

## Runtime edges

A runtime edge states:

1. the Runtime and application layer;
2. the running operation's owner;
3. the signal or Scope that interrupts it;
4. who observes the complete `Exit`;
5. how the result becomes a safe host value; and
6. when runtime resources are disposed.

Domain and service code returns Effects. It does not call a runner. A test is a
runtime edge; a helper, render, or click callback is not one until it answers
the same ownership questions.

`ManagedRuntime.make(AppLive)` is useful for a framework application. Construct
it once outside render and dispose it at application teardown. Disposal closes
the managed layer. It does not by itself supervise every fiber launched with
`ManagedRuntime.runFork`, which uses a global fiber scope unless supplied an
explicit Scope.

Application work that may outlive its initiating component/request transfers
to a scoped task service, for example one backed by `FiberSet`. That service
observes non-interruption failures, interrupts tasks at runtime shutdown, and
settles any host-facing handle. Work that must survive process termination
belongs in a durable queue/workflow, not an Effect fiber.
