# C# Changes

## Workflow

- Use the `csharp:*` mise tasks. Run `csharp:standards` for formatting and
  `csharp:standards:check` before handoff.
- Keep package versions in `Directory.Packages.props` and commit project lock
  files. Do not add project-local versions or warning overrides.
- Read `Directory.Build.props`, `.editorconfig`, and `BannedSymbols.txt` for
  the compiler and analyzer contract. Treat their failures as defects in the
  change; fix the cause before suppressing a diagnostic.
- Applications also follow `APPLICATION.md`. Public libraries, plugin hosts,
  interop, source generators, and other specialized workloads should document
  where an application rule does not fit.

## Code and ownership

- Keep dependencies explicit through constructors, parameters, and direct
  calls. Prefer built-in .NET facilities and direct mapping over service
  location, assembly scanning, mediator pipelines, or generic repositories.
- Keep asynchronous work owned and cancellable. Avoid sync-over-async,
  `async void`, detached `Task.Run`, and blocking sleeps. Use `TimeProvider`
  when behavior depends on the clock.
- Keep using directives file-local and avoid `dynamic` so dependencies and
  type contracts remain visible.
- Avoid shared mutable and ambient state. Banned symbols carry remediation
  messages; using an equivalent unlisted API does not satisfy the rule.
- Test DI lifetimes, middleware order, query translation, authorization, and
  external-system behavior at their real boundaries. Static analysis cannot
  prove those contracts.

## Exceptions and enforcement

- The sanctioned analyzer exception is a per-site `[SuppressMessage]` with a
  real `Justification`: name the invariant, then explain why a structural fix
  would be worse. SA1404 rejects missing, blank, and `<Pending>` reasons;
  review must reject other placeholders.
- Bare warning pragmas, `NoWarn`, `WarningsNotAsErrors`, and global suppression
  files change the enforcement contract. Loosening that contract requires
  human approval.
- Remove stale suppressions when touching them. IDE0079 is an IDE diagnostic,
  so CI does not prove they are still needed.
- ReferenceTrimmer checks analyzable direct compile references. SDK,
  transitive, and build-asset references remain outside its scope.

## Tests and review

- A behavior fix should have a test that fails without it; report that evidence.
  Use CsCheck for trust-boundary properties and preserve found counterexamples
  as deterministic examples because CsCheck keeps no regression corpus.
- `csharp:mutants` runs a full Stryker.NET sweep. For each survivor in changed
  code, add a discriminating test, remove unreachable code, or justify an
  equivalent mutant with human approval. The only allowed directive is
  `// Stryker disable once <mutator|all>: <reason>`.
- Ranged, compact, and block-comment mutation directives fail. Directive-shaped
  text is reserved even inside strings. The verifier also rejects malformed
  parser output, unfinished statuses, and full runs with no executed mutant.
- Keep the measured mutation floor. Raising it is ordinary work; lowering it
  requires human approval. A floor below 100 is a regression alarm, so review
  survivors individually. The MTP mutation integration is preview; investigate
  surprising results rather than trusting the score alone.
- `csharp:mutants:diff` is the inner loop. Read `README.md` for base-ref and
  worktree requirements. Mutation testing requires separate source and test
  projects.
- Review test sensitivity, resource ownership, suppressions, and enforcement
  changes. Use an independent read-only reviewer for substantial changes,
  scaled to risk. Verify disputed findings with a failing test where possible;
  unresolved intent belongs to the human owner. Pin reviews to the revision
  examined and rerun affected checks after repairs.
