# C# Standards

Copy `.editorconfig`, `Directory.Build.props`, `Directory.Packages.props`,
`global.json`, `BannedSymbols.txt`, `stryker-config.json`,
`.config/dotnet-tools.json`, and `Mise/conf.d/20-csharp.toml` into a .NET
repository. Merge `AGENTS.md` into the repository's agent guide. Applications
should also copy `APPLICATION.md`; libraries and specialized workloads should
skip that profile or adopt only the rules that fit their public contract.

The baseline pins .NET 10, C# 14, `MSTest.Sdk`, and Microsoft Testing Platform.
It enables nullable analysis and checked arithmetic, disables unsafe code,
implicit usings, and preview features, and promotes compiler, code-style, and
analyzer warnings to build failures. The SDK analyzer baseline is
`10.0-recommended`, with every security, reliability, usage, and performance
rule enabled. Meziantou and Roslynator use their package defaults instead of
forcing every diagnostic on.

The profile is optimized for agent-driven development; `AGENTS.md` holds the
doctrine. The mechanical walls: `BannedSymbols.txt` bans ambient and shared
state by symbol with remediation-shaped messages (RS0030); StyleCop ships for
exactly one rule, SA1404, which rejects `[SuppressMessage]` without a real
justification; ReferenceTrimmer fails the build on references no code uses;
CsCheck is the property-testing default; and Stryker.NET (pinned as a local
dotnet tool) runs the mutation gate on the Microsoft Testing Platform runner,
which is in preview. `thresholds.break` in `stryker-config.json` is a ratchet
pinned at the measured floor. Mutation testing requires sources and tests in
separate projects joined by a `ProjectReference`; a single mixed project
cannot be mutated. Stale-suppression detection (IDE0079) works only inside
the IDE — no CLI build surfaces it — so dead suppressions are a review duty,
not a gate.

Test projects use the centrally pinned SDK without a test package reference:

```xml
<Project Sdk="MSTest.Sdk">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
  </PropertyGroup>
</Project>
```

The profile requires at least one discovered test per test application. Keep
all test projects on Microsoft Testing Platform; .NET 10 does not support
mixing MTP and VSTest projects in one `dotnet test` invocation.

The standards workflow is:

```sh
mise run csharp:standards
mise run csharp:fmt:check
mise run csharp:lint
mise run csharp:test
mise run csharp:mutants
mise run csharp:mutants:diff
mise run csharp:standards:check
```

`csharp:restore` generates project lock files and CI restores them in locked
mode. NuGet audit covers direct and transitive dependencies at `low` severity;
audit warnings fail under warnings-as-errors. Commit `global.json`,
`Directory.Packages.props`, and every project lock file. Change SDK, language,
test SDK, target framework, and package versions together in a deliberate
platform update.
