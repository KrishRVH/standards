# C# Standards

Copy `.editorconfig`, `Directory.Build.props`, `Directory.Packages.props`,
`global.json`, and `Mise/conf.d/20-csharp.toml` into a .NET repository. Merge
`AGENTS.md` into the repository's agent guide. Applications should also copy
`APPLICATION.md`; libraries and specialized workloads should skip that profile
or adopt only the rules that fit their public contract.

The baseline pins .NET 10, C# 14, `MSTest.Sdk`, and Microsoft Testing Platform.
It enables nullable analysis and checked arithmetic, disables unsafe code,
implicit usings, and preview features, and promotes compiler, code-style, and
analyzer warnings to build failures. The SDK analyzer baseline is
`10.0-recommended`, with every security, reliability, usage, and performance
rule enabled. Meziantou and Roslynator use their package defaults instead of
forcing every diagnostic on.

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
mise run csharp:standards:check
```

`csharp:restore` generates project lock files and CI restores them in locked
mode. NuGet audit covers direct and transitive dependencies at `low` severity;
audit warnings fail under warnings-as-errors. Commit `global.json`,
`Directory.Packages.props`, and every project lock file. Change SDK, language,
test SDK, target framework, and package versions together in a deliberate
platform update.
