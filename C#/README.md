# C# Standards

Copy `.editorconfig`, `Directory.Build.props`, `Directory.Packages.props`, and
`Mise/conf.d/20-csharp.toml` into a .NET project. Replace package versions and
target framework details when the project has a different runtime policy.

The baseline enables nullable reference types, promotes warnings and analyzer
diagnostics to build failures, generates XML documentation, and uses central
package management. Meziantou and Roslynator run alongside the SDK's built-in
.NET analyzers. Remove analyzer packages or lower diagnostic severities when
that set is broader than the project needs.

The standards workflow is:

```sh
mise run csharp:standards
mise run csharp:fmt:check
mise run csharp:lint
mise run csharp:test
mise run csharp:standards:check
```

`csharp:restore` uses `dotnet restore`; the MSBuild properties opt into package
lock files and switch CI restores to locked mode. NuGet audit is enabled for all
transitive dependencies at `low` severity; audit warnings fail under the
template's warnings-as-errors policy. Commit `Directory.Packages.props` and the
generated project lockfiles. The lint and test tasks use Release builds so
analyzer and build behavior stay close to CI. Implicit usings are disabled,
project and global usings remain explicit, explicit local variable types are an
advisory style preference, and analyzer and nullable warnings remain build
failures.
