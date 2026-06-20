# C# Standards

Copy `.editorconfig`, `Directory.Build.props`, `Directory.Packages.props`, and
`Mise/conf.d/20-csharp.toml` into a .NET project. Replace package versions and
target framework details when the project has a different runtime policy.

This is a strict, systems-level generic starting template. It enables nullable
reference types, treats warnings and analyzer diagnostics as build failures,
generates XML documentation, uses central package management, and adds
Meziantou, Microsoft, and Roslynator analyzers. Relax analyzer packages or
diagnostic severities when the copied baseline is broader than the real project
needs.

The standard gate is:

```sh
mise run csharp:fmt:check
mise run csharp:lint
mise run csharp:test
mise run csharp:check
```

`csharp:restore` uses `dotnet restore --locked-mode` once a
`packages.lock.json` exists and `dotnet restore --use-lock-file` before that.
NuGet audit is enabled for all transitive dependencies at `low` severity; audit
warnings fail under the template's warnings-as-errors policy. Commit
`Directory.Packages.props` and the generated lockfiles. The lint and test tasks
run Release builds so analyzer and build behavior match CI more closely.
