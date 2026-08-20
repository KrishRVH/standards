# C# Standards

Copy `.editorconfig`, `Directory.Build.props`, `Directory.Packages.props`,
`global.json`, `BannedSymbols.txt`, `stryker-config.json`,
`.config/dotnet-tools.json`, `scripts/`, and `.github/` into a .NET repository,
and use it with the shared mise template:

```text
.config/mise/config.toml
.config/mise/conf.d/20-csharp.toml
```

Merge `AGENTS.md` into the repository's agent guide. Applications should also
copy `APPLICATION.md`; libraries and specialized workloads should skip that
profile or adopt only the rules that fit their public contract.

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
exactly one rule, SA1404, which rejects a missing, blank, or `<Pending>`
`[SuppressMessage]` justification while review checks every other value;
ReferenceTrimmer fails on analyzable direct compile references reported unused
as RT0001-RT0003 (SDK, transitive, and build-asset references are conservatively
outside its scope);
CsCheck is the property-testing default; and Stryker.NET (pinned as a local
dotnet tool) runs the mutation gate on the Microsoft Testing Platform runner,
which is in preview. Coverage analysis is disabled because that integration is
not yet reliable; each run emits JSON and its complete log to a unique,
preserved output directory. A dependency-free verifier rejects malformed
Stryker directives, pending or unknown statuses, and ignored mutants without a
custom reason. It validates the mutated-source payload and permits only the
documented one-shot line-comment form; ranged `disable`/`restore` and block
directives fail. Directive-shaped string text is conservatively reserved for
the policy. The full gate also requires an actually executed `Killed`,
`Survived`, or `Timeout` mutant, so empty and all-`NoCoverage` runs fail.
`thresholds.break` in `stryker-config.json` is pinned
at the measured floor. The shipped 100 makes every survivor fail — a
deliberate per-mutant gate at fixture size; pin your own measured floor on
adoption and it becomes a coarse regression alarm, with survivors in changed
code dispositioned in review. Mutation testing requires sources and tests in
separate projects joined by a `ProjectReference`; a single mixed project
cannot be mutated. On large projects, swap `csharp:mutants` for
`csharp:mutants:diff` in the PR gate and move the full sweep to a scheduled
job; give the workflow's checkout step `fetch-depth: 0` first, because a
shallow clone cannot resolve `MUTANTS_BASE_REF` for `--since`.
Stale-suppression detection (IDE0079) works only inside the IDE — no CLI
build surfaces it — so dead suppressions are a review duty, not a gate.

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
mise run csharp:policy
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

`csharp:policy` self-tests the JSON/log verifier and compiles negative probes
that must trigger RS0030 for a banned API and SA1404 for a suppression without
a justification. `csharp:mutants:diff` resolves an explicit
`MUTANTS_BASE_REF` exactly as supplied; when unset, it prefers
`refs/remotes/origin/main` over local `main` and passes the exact 40-character
merge-base SHA to Stryker. Because Stryker tests branch and tag names before
its SHA lookup, the task fails closed if any local Git ref name contains that
SHA. It also rejects untracked files with `git add -N` guidance because Git
diff cannot review them. Fetch full history before using it in a shallow
clone.

`.github/CODEOWNERS` deliberately assigns every path to the placeholder owner
because source files can carry mutation classifications and analyzer
suppressions. Point the placeholder at a real human, require the `quality` job
and Code Owner review, dismiss stale approvals on every new commit, and
disallow protection bypass. The latest-push approval option is not a substitute
for stale dismissal: its approver need not be the code owner. These host
settings turn "loosening requires human countersign" from an instruction into
a gate.
