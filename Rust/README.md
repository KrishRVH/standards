# Rust Standards

Copy these files into a Rust project and run the tasks through `mise`, using
the shared mise template:

```text
.config/mise/config.toml
.config/mise/conf.d/20-rust.toml
```

`rust-toolchain.toml` is the one compiler pin. The task fragment tells mise to
read it, so `mise install`, rustup, and editors select the same compiler and
components. `Cargo.toml`'s `rust-version` is the MSRV that Clippy reads; raise
it deliberately.

This baseline gives agents executable lint and verification contracts.
Lint exceptions require a per-site
`#[expect(lint, reason = "...")]` that self-expires when it goes stale, and a
mutation-testing gate audits whether the tests would notice wrong code.
`AGENTS.md` holds the rules machines cannot check — design doctrine, semantic
verification, and independent review. Relax or remove checks that do not fit
the project.

The shared-mutable-state wall encodes a specific architecture: single-owner
application state, pure `(state, event)` transitions, message passing over
shared memory. That is the right default for the applications this profile
targets and the wrong one for general-purpose libraries, runtimes,
concurrency primitives, drivers, and systems infrastructure — an `Rc` does
not imply mutation, and a metrics counter does not need an actor. Projects
of those shapes adapt `disallowed-types`, the matching ownership doctrine in
`AGENTS.md`, and the Mutex negative probe in `rust:policy` together;
individual sites inside an application use a reasoned `#[expect]`.

## Tooling

The mutation transaction runner uses `setsid` and process-group signals on
Linux. Adapt and test that boundary before using the complete gate on another
operating system.

```sh
mise install
mise run rust:lock
mise run rust:fmt
mise run rust:fmt:check
mise run rust:lint
mise run rust:policy
mise run rust:doc
mise run rust:test
mise run rust:package
mise run rust:mutants
mise run rust:mutants:diff
mise run rust:machete
mise run rust:deny
mise run rust:standards
mise run rust:standards:check
```

mise installs cargo-deny from aqua and cargo-machete, cargo-nextest, and
cargo-mutants from their GitHub release binaries. cargo-mutants publishes
x86_64 binaries only; on an arm64 host, pin `cargo:cargo-mutants` instead.
Cargo tasks share one build-directory lock, so the gate runs Clippy, the
documentation build, the tests, and the package check in a fixed order. The
policy self-tests, which mostly wait on shutdown timeouts, and cargo-mutants,
which builds in its own copy of the tree, run beside them with formatting,
cargo-deny, and cargo-machete.

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

The `tests/allow_policy.rs` integration test requires every Cargo workspace
member, including the root package, to declare `[lints] workspace = true`.
Excluded packages and external dependencies are outside that inheritance check.
`rust:lint` also forces Clippy's bare-attribute rules on the command line. The
same test parses every first-party Rust source with Rust token and attribute
parsers and rejects outer, crate-inner, multiline, and `cfg_attr`-nested
`#[allow]` attributes, including raw `r#allow` spellings and literal attributes
inside macro bodies. It also rejects direct, repeated, and `cfg_attr`-nested
attribute-metavariable emission. Fixed `#[doc = $description]` attributes remain
legal because only their documentation value is forwarded. Stable source
tokenization cannot reconstruct arbitrary declarative- or procedural-macro
output, so a macro that synthesizes an `allow` from split or generated tokens
remains a prohibited reviewer-owned wall bypass rather than a supported
exception. Comments and strings containing attribute-shaped text remain legal,
and vendored dependencies are outside this first-party policy.
Generated/dependency directories such as `target/` and `vendor/` are excluded at
each accepted workspace package root, so an ordinary nested source directory
with the same basename cannot hide compiler inputs.
Literal `include!` inputs are followed recursively regardless of extension;
cycles are harmless. In-project source-file and directory symlinks are
followed cycle-safely, and explicit Cargo lib/bin/test/example/bench and build
script paths are scanned even without an `.rs` extension. Every resolved
first-party target or included input must remain inside the canonical project
root. Non-literal `include!` expressions and custom `#[path]` modules fail
because the scanner cannot prove their compiler inputs.
`rust:policy` compiles a negative `std::sync::Mutex` probe and requires the
configured `clippy::disallowed_types` diagnostic, so the state wall cannot
silently disappear. It also self-tests the mutation-report verifier and the
mutation transaction lock.

Use `rust:lock` to deliberately refresh `Cargo.lock` after dependency changes
without upgrading unrelated packages. Every Cargo task runs with `--locked`,
so a missing or stale `Cargo.lock` fails instead of being silently regenerated.
`rust:test` runs the suite with cargo-nextest, then the doctests, which
nextest cannot run. `rust:package` validates publishable package contents with
`cargo package --workspace`. `rust:deny`
fails on advisories (unmaintained crates included), yanked crates, disallowed
licenses, wildcard dependency requirements, and unknown registries across
normal and development dependency graphs, and surfaces duplicate-version
warnings without failing. `rust:machete` first proves all-feature Cargo
metadata against the committed lock, then uses metadata-aware, offline
analysis for renamed dependencies. It fails on unused `[dependencies]`
entries; dev- and build-dependencies remain outside cargo-machete's scope.

`rust:mutants` runs the full mutation sweep and runs all workspace tests against
each mutant. Both lanes force cargo-mutants to create `mutants.out/` under the
project root, so `.cargo/mutants.toml` cannot redirect the run while the
verifier reads stale local evidence. After cargo-mutants succeeds, each lane
validates its native JSON and outcome lists. The full lane requires at least one
mutant to have actually run; the diff lane accepts a complete zero-total report
when the diff selects no mutants. A nonempty all-unviable report fails in either
lane. A surviving mutant is a review finding, not a statistic. Both mutation
lanes hold the same project-local lock through cargo-mutants and post-run
verification, so a concurrent run fails before it can replace the report; a
stale-lock failure names the directory to remove after confirming no run is
active. `rust:mutants:diff` mutates only code changed relative to
`MUTANTS_BASE_REF` for the inner loop. An explicit value resolves exactly as
supplied; otherwise the task prefers `refs/remotes/origin/main` over the local
`main` branch. It hands cargo-mutants a diff from the full merge-base commit ID
(SHA-1 or SHA-256) and reports how to fetch full history when no merge base
exists. Untracked files fail the lane with `git add -N` guidance because Git
diff cannot review them. The catalog's copyable `shared/.gitignore` already
excludes `mutants.out/` and `mutants.out.old/`; commit `proptest-regressions/`.
On large projects, swap `rust:mutants` for `rust:mutants:diff` in the PR gate
and move the full sweep to a scheduled job; give the workflow's checkout step
`fetch-depth: 0` first, or the diff task cannot resolve `MUTANTS_BASE_REF` in a
shallow CI clone.

`.github/` ships a hash-pinned `quality.yml` workflow that runs the gate on
pull requests, pushes, and merge-queue groups, and a PR template whose
second question — how did you verify? — is the handoff-report contract from
`AGENTS.md`. Wire whatever AI review bot the repo uses to read `AGENTS.md`
as its guidelines file so authors and reviewers argue from one document.
`CODEOWNERS` deliberately assigns every path to the placeholder owner because
source files can carry mutation classifications and diagnostic escapes. Point
the placeholder at a real human, require the `quality` job and Code Owner
review, dismiss stale approvals on every new commit, and disallow protection
bypass. The latest-push approval option is not a substitute for stale
dismissal: its approver need not be the code owner. These host settings turn
"loosening requires human countersign" from an instruction into a gate.

Noisy systems-code lints stay relaxed by default: int-to-float precision
casts and size/repetition style counts. The remainder of `clippy::restriction`
and `clippy::cargo`, nightly formatting rules, feature-matrix builds
(`cargo-hack`) for cfg-gated fallback paths, and `cargo-semver-checks` for
published libraries remain project-specific choices.
