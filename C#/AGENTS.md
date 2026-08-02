## C# Changes

- Treat compiler, analyzer, formatting, lock-file, and test failures as defects
  in the proposed change. Do not suppress a diagnostic merely to make the gate
  pass.
- Keep dependencies explicit through constructors, parameters, and direct
  calls. Avoid service location, nested service providers, assembly scanning,
  and runtime discovery unless the workload genuinely requires them.
- Keep asynchronous work owned and cancellable. Avoid sync-over-async,
  `async void`, detached `Task.Run`, `Thread.Sleep`, and ambient time; use
  `TimeProvider` where behavior depends on the clock.
- Keep using directives file-local and avoid `dynamic` so dependencies and type
  contracts remain visible to the compiler and reader.
- Keep package versions in `Directory.Packages.props` and commit project lock
  files. Do not add project-local versions or warning overrides.
- Prefer built-in .NET facilities and direct mapping over framework layers,
  mediator pipelines, reflection mapping, or generic repositories.
- Do not add `#pragma warning`, suppression attributes, `NoWarn`,
  `WarningsNotAsErrors`, or global suppression files by reflex. Correct the
  design or document a narrow, owned exception through the repository's normal
  decision process.
- Run `mise run csharp:standards:check` before handoff.

## .NET Applications

Applications also follow `APPLICATION.md`. Public libraries, plugin hosts,
interop, source generators, Native AOT experiments, and other specialized
workloads should document why an application rule does not fit instead of
weakening the shared compiler and test contract.
