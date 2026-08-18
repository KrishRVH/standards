# Rust Standards

Copy these files into a Rust project and run the tasks through `mise`.

This baseline is optimized for agent-driven development: every rule a machine
can check is denied by a lint or a gate, exceptions require a per-site
`#[expect(lint, reason = "...")]` that self-expires when it goes stale, and a
mutation-testing gate audits whether the tests would notice wrong code.
`AGENTS.md` holds the rules machines cannot check — design doctrine, semantic
verification, and the adversarial self-review loop. Relax or remove checks
that do not fit the project.

The shared-mutable-state wall encodes a specific architecture: single-owner
application state, pure `(state, event)` transitions, message passing over
shared memory. That is the right default for the applications this profile
targets and the wrong one for general-purpose libraries, runtimes,
concurrency primitives, drivers, and systems infrastructure — an `Rc` does
not imply mutation, and a metrics counter does not need an actor. Projects
of those shapes strip the `disallowed-types` wall and keep the rest;
individual sites inside an application argue through a reasoned `#[expect]`.

## Tooling

```sh
mise run rust:components
mise run rust:deny:install
mise run rust:machete:install
mise run rust:mutants:install
mise run rust:lock:check
mise run rust:fmt:check
mise run rust:lint
mise run rust:test
mise run rust:test:doc
mise run rust:doc
mise run rust:package
mise run rust:mutants
mise run rust:mutants:diff
mise run rust:machete
mise run rust:deny
mise run rust:standards
mise run rust:standards:check
```

The baseline pins Rust, uses edition 2024, forbids local unsafe code, requires
documented public API, denies rustdoc warnings, checks doctests, and runs
Clippy for every workspace target and feature with warnings promoted to
failures. The lint wall lives in `[workspace.lints]` so member crates inherit
it via `[lints] workspace = true`. Panic-class lints (`unwrap_used`,
`indexing_slicing`, `arithmetic_side_effects`, and friends) and the
shared-mutable-state primitives (`Mutex`, `RwLock`, `Rc`, `RefCell`, atomics,
plus their `tokio`/`parking_lot`/`dashmap` equivalents) are denied
everywhere; tests are exempted from the unwrap/expect/panic/indexing lints
only — state primitives and arithmetic in tests take a reasoned `#[expect]`.
Release builds keep integer overflow checks.

Lock-sensitive gates run `rust:lock:check` first. That task generates
`Cargo.lock` locally when it is missing, fails in CI when it is missing, and
then lint/test/doc/package/mutants/deny tasks run with `--locked`.
`rust:package` validates publishable package contents with
`cargo package --workspace`. The `*:install` tasks put pinned `cargo-deny`,
`cargo-machete`, and `cargo-mutants` into local `.cargo-tools`. `rust:deny`
fails on advisories, yanked crates, disallowed licenses, wildcard dependency
requirements, and unknown registries, and surfaces duplicate-version and
unmaintained warnings without failing. `rust:machete` fails on declared
dependencies no code uses.

`rust:mutants` runs the full mutation sweep; a surviving mutant is a review
finding, not a statistic. `rust:mutants:diff` mutates only code changed
relative to `MUTANTS_BASE_REF` (default `main`) for the inner loop. Add
`mutants.out/` and `mutants.out.old/` to the project `.gitignore`; commit
`proptest-regressions/`. On large projects, keep `rust:mutants:diff` in the
PR gate and move the full sweep to a scheduled job.

`.github/` ships a hash-pinned `quality.yml` workflow that runs the gate on
pull requests, pushes, and merge-queue groups, and a PR template whose
second question — how did you verify? — is the handoff-report contract from
`AGENTS.md`. Wire whatever AI review bot the repo uses to read `AGENTS.md`
as its guidelines file so authors and reviewers argue from one document.
`CODEOWNERS` lists the enforcement surface: point its placeholder at a real
owner and require code-owner review on the protected branch, and every wall
edit mechanically needs a named human's approval — that host setting is
what turns "loosening requires human countersign" from an instruction into
a gate. Without it, countersign is a review duty the PR template reminds
humans to perform.

Noisy systems-code lints stay relaxed by default: int-to-float precision
casts, size/repetition style counts, the remainder of `clippy::restriction`
and `clippy::cargo`, and nightly formatting rules remain project-specific
choices, as do feature-matrix builds (`cargo-hack`) for cfg-gated fallback
paths and `cargo-semver-checks` for published libraries.
