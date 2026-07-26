# Haskell Standards

Copy the Cabal files into a Haskell project and replace `project-name` plus
module names with the real package. The template uses Cabal, GHCup, Ormolu,
HLint, GHC2024, warnings-as-errors in the project gate, and named tasks for
Haddock and source distribution checks. `haskell:install` initializes a missing
Cabal package index and leaves an existing index untouched.

The template starts with a strict, high-signal gate. Relax warnings,
documentation, or distribution tasks when the package type and maturity call
for a narrower one.

Use `cabal.project.freeze` deliberately: commit it for applications and CLIs
that want locked CI, and usually omit it for reusable libraries.

Common tasks are:

```sh
mise run haskell:standards
mise run haskell:fmt:check
mise run haskell:lint
mise run haskell:test
mise run haskell:update
mise run haskell:docs
mise run haskell:package
mise run haskell:standards:check
```
