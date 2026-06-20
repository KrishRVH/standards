# Haskell Standards

Copy the Cabal files into a Haskell project and replace `project-name` plus
module names with the real package. The template uses Cabal, GHCup, Ormolu,
HLint, GHC2024, warnings-as-errors in the project gate, Haddock, and source
distribution checks.

This is a strict, systems-level generic starting template. Keep the high-signal
checks, but relax warnings, docs, or distribution tasks when the real package
type and maturity make a narrower gate more appropriate.

Use `cabal.project.freeze` deliberately: commit it for applications and CLIs
that want locked CI, and usually omit it for reusable libraries.

The standard gate is:

```sh
mise run haskell:fmt:check
mise run haskell:lint
mise run haskell:test
```
