# Explicit .NET Application Profile

This profile favors direct, locally visible behavior and tests at real system
boundaries. It applies to ASP.NET Core, Razor Pages, workers, and data-backed
applications; it does not require a fixed number of projects or a ceremonial
layer for every name below.

## Application Flow

Prefer this call shape:

```text
endpoint or page handler -> named application operation -> domain behavior -> infrastructure adapter
```

Keep HTTP binding, authorization, identity, and rendering at the Web boundary.
Keep business decisions in domain or application code. Keep EF Core, external
clients, storage, and brokers in Infrastructure. Put long-running hosted work
in an explicitly owned worker and privileged migration or maintenance work in
an explicitly invoked tool.

Use the built-in container and constructor injection. Keep registrations in
`Program.cs` or a small `Composition/` area. Every Web and Worker host should
validate the graph on build and validate scopes. A `WebApplicationBuilder`
configures those checks through its host:

```csharp
builder.Host.UseDefaultServiceProvider(options =>
{
    options.ValidateOnBuild = true;
    options.ValidateScopes = true;
});
```

A worker built with `HostApplicationBuilder` passes the same
`ServiceProviderOptions` to `DefaultServiceProviderFactory` through
`ConfigureContainer`.

Avoid defaulting to runtime mapping, an in-process mediator, assembly-scanned
registration, third-party containers, service location, lazy loading, runtime
Razor compilation, or reflection discovery. These tools are not universally
wrong, but each hides control flow or dependencies and therefore needs a real
project-specific reason.

## EF Core

- Keep `DbContext`, `DbSet<T>`, and `IQueryable<T>` inside infrastructure,
  tests, or migration tools. Return named results rather than leaking queries
  or persistence entities.
- Project read models directly and use no-tracking queries unless mutation is
  intended. Configure important keys, relationships, delete behavior, indexes,
  lengths, precision, concurrency, and conversions explicitly.
- Do not add a generic repository over `DbContext`, lazy-loading proxies, or
  runtime migration from a Web or Worker process.
- Treat applied migrations as immutable. Review generated SQL and operational
  risks, and use the production database engine for persistence integration
  tests.

## ASP.NET Core and Razor Pages

- Bind dedicated transport input models. PageModels and endpoints authorize,
  call named application operations, and select responses; they do not own
  business decisions or query a `DbContext` directly.
- Keep `.cshtml` to semantic HTML, Tag Helpers, formatting, and simple
  presentation conditions. Do not inject services or access persistence from a
  view.
- Keep middleware, filters, model binders, Tag Helpers, base PageModels, and
  global conventions out of application control flow unless the framework seam
  is the actual requirement.
- Test critical routes, binding, antiforgery, authorization, validation,
  middleware order, rendering, and persistence through the real host. Use
  `WebApplicationFactory<Program>` for host-level tests and browser tests only
  for critical rendered workflows.

## System Boundaries

Static analysis cannot prove DI lifetimes, middleware order, EF translation,
authorization semantics, transactions, or external-system compatibility. Keep
unit tests for isolated decisions, then add a small number of integration tests
at those boundaries. A Web entry point intended for real-host tests should
expose a public `partial Program` type.
