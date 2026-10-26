# Rust Standards

Copy these files into a Rust project and run the tasks through `mise`, using
the shared mise template:

```text
.config/mise/config.toml
.config/mise/conf.d/20-rust.toml
.config/mise/tasks/hygiene
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
`AGENTS.md`, and the state-wall cases in `policy-fixtures/lint-wall.rs.in`
together; individual sites inside an application use a reasoned `#[expect]`.

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
documentation build, the tests, and the package check in a fixed order.
`rust:policy` and cargo-mutants run beside them with formatting, cargo-deny,
and cargo-machete. cargo-mutants builds in its own copy of the tree.
`rust:policy`'s `cargo test` builds take the shared lock, and the rest of its
time goes to the lock self-test's shutdown timeouts and to Clippy on the
lint-wall probe, which uses a separate target directory.

The baseline pins Rust, uses edition 2024, forbids local unsafe code, requires
documented public API with `Debug` implementations, denies rustdoc warnings,
checks doctests, and runs Clippy for every workspace target and feature with
warnings promoted to failures. The lint wall lives in `[workspace.lints]` so
member crates inherit it via `[lints] workspace = true`; its comments name the
invariant each group defends. Panic-class lints, the print macros, and the
shared-mutable-state primitives that `clippy.toml` disallows are denied. Test
code gets only the exemptions that the `allow-*-in-tests` knobs in
`clippy.toml` grant; `AGENTS.md` states their boundary. Clippy does not report
arithmetic inside `#[test]` bodies, though it does in helpers and `proptest!`
bodies (rust-clippy#13845); an unmarked control in the lint-wall probe fails
the proof when that changes. `clippy.toml` turns off Clippy's exported-API
exemption, so its API-shape lints cover `pub` items too.
Release builds keep integer overflow checks.

The `tests/allow_policy.rs` integration test requires every Cargo workspace
member, including the root package, to declare `[lints] workspace = true`.
Excluded packages and external dependencies are outside that inheritance check.
`rust:lint` also forces Clippy's bare-attribute rules on the command line. The
same test parses every first-party Rust source with Rust token and attribute
parsers and rejects outer, crate-inner, multiline, and `cfg_attr`-nested
`#[allow]` attributes, including raw `r#allow` spellings and literal attributes
inside macro bodies. It also rejects direct, repeated, and `cfg_attr`-nested
attribute-metavariable emission. Fixed `#[doc = $description]` attributes
remain legal because only their documentation value is forwarded. It rejects
`expect` attributes that name more than one lint, a lint group, or an
`allow_attributes` lint, and crate-level `#![expect]` attributes at the root of
every workspace target except tests, whose roots still may not expect
`clippy::arithmetic_side_effects`. Companion tests fail when the pinned
toolchain's lint groups no longer match the scanner's list, and when the lints
`[workspace.lints.clippy]` denies by name differ from the scanner's panic,
non-panic, and allow-attribute lists, so a newly denied lint must be classified.

To tell test code from production code, the test walks each target's module
tree from its root through `mod` declarations and literal `include!` inputs. A
`mod name;` fails when neither `name.rs` nor `name/mod.rs` exists, including
one a macro names through a metavariable. Test code is a Cargo test target, an
item under a `cfg` that requires `test`, such as `#[cfg(test)]`,
`#[cfg(all(test, unix))]`, or a module's leading `#![cfg(test)]`, and a
function with a `test` attribute such as `#[tokio::test]`. Outside test code,
the test rejects expectations of a panic lint that cover a module, `impl`, or
`trait` block, whether an inner `#![expect]` in its body or an outer
`#[expect]` on the item; in test
code, it rejects them for `clippy::arithmetic_side_effects`. Outside test
code, it also rejects calls to `assert!`, `assert_eq!`, and `assert_ne!`,
including calls in `macro_rules!` bodies and imports that rename them. An
assertion in a `const` or `static` initializer or an inline `const` block runs
at compile time and passes unless a closure, function, `async` block, or macro
definition there holds it.

Stable source tokenization cannot reconstruct arbitrary declarative- or
procedural-macro output, so a macro that synthesizes an `allow` from split or
generated tokens remains a prohibited reviewer-owned wall bypass rather than a
supported exception. Comments and strings containing attribute-shaped text
remain legal, and vendored dependencies are outside this first-party policy.
Generated/dependency directories such as `target/` and `vendor/` are excluded
at each accepted workspace package root, so an ordinary nested source directory
with the same basename cannot hide compiler inputs. Literal `include!` inputs
are followed recursively regardless of extension; cycles are harmless.
In-project source-file and directory symlinks are followed cycle-safely, and
explicit Cargo lib/bin/test/example/bench and build script paths are scanned
even without an `.rs` extension. Every resolved first-party target or included
input must remain inside the canonical project root. Non-literal `include!`
expressions and custom `#[path]` modules fail because the scanner cannot prove
their compiler inputs.

`rust:policy` proves that the configured lint wall fires. `tests/lint_wall.rs`
reads the `rust:lint` command line from `.config/mise/conf.d/20-rust.toml` and
runs it in the policy task's environment, adding only JSON output and
`--keep-going`, over `policy-fixtures/lint-wall.rs.in` in a dependency-free
package under `target/`. The test fails if `rust:lint` sets any key besides
`description` and `run`, or if `mise tasks info` shows that another
configuration file overrides or extends it, because the replay would miss
either change. It also fails if `rust:lint` passes Cargo any argument besides
the ones the test lists, because the one-package probe cannot show a narrower
package, target, or feature selection. It fails, too, if the gate's Clippy or
rustdoc run would take a flag that can lower lint levels: `-A`, `--allow`,
`--force-warn`, `--cap-lints`, an unstable `-Z` option, or an `@file` argument
file, whose contents the test cannot see. It checks the arguments `rust:lint`
passes Clippy, every variable Cargo reads flags from, such as `RUSTFLAGS` or
`CARGO_ENCODED_RUSTDOCFLAGS`, and the `rustflags` and `rustdocflags` values in
the Cargo configuration of the project root, its parent directories, and
`$CARGO_HOME`, with their includes. A Cargo `[env]` entry for `CLIPPY_ARGS`
fails too, because with `force = true` it replaces the gate's Clippy
arguments. So does a `CLIPPY_CONF_DIR`, inherited or set by a Cargo `[env]`
entry, that names a directory other than the project root, because Clippy
would read that directory's `clippy.toml` instead. `-W` passes because the
gate's `-D warnings` outranks it.

The probe package takes `[workspace.lints]`, `edition`, and `rust-version` from
`Cargo.toml`, resolving workspace-inherited fields, and Clippy reads the
gate's `clippy.toml`, so a deleted entry, or an MSRV at which Clippy disables
a lint, removes the expected diagnostic. A `//~ ERROR <code>` comment marks
each diagnostic that a probe line must report. The test requires at least one
mark inside the probe's `#[cfg(test)]` module, so the proof fails if the gate
stops linting test targets. A missing or unexpected diagnostic, including an
unrelated compile failure, fails the task. The probe samples the configured
restrictions, suppression attributes, and positive controls rather than every
lint, and the test lists the diagnostic codes the probe must keep marking;
change both together with the wall. The `.rs.in` extension keeps the probe's
deliberate violations out of the project's builds and the `allow` scan. A
non-ignored test in the same file fails if the proof command disappears from
`rust:policy`; it cannot show that the command runs. `rust:policy` also
self-tests the mutation-report verifier and the mutation transaction lock.

Use `rust:lock` to deliberately refresh `Cargo.lock` after dependency changes
without upgrading unrelated packages. Every other Cargo task that resolves
dependencies runs with `--locked`, so a missing or stale `Cargo.lock` fails
instead of being silently regenerated.
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
each mutant. Both lanes clear `mutants.out/` and force cargo-mutants to write
it under the project root, so neither a previous run nor `.cargo/mutants.toml`
can leave the verifier reading stale evidence. After cargo-mutants succeeds,
each lane validates its native JSON and outcome lists. The full lane requires
at least one mutant to have actually run; the diff lane passes without a report
when the diff selects no mutants. A nonempty all-unviable report fails in either
lane. A surviving mutant is a review finding, not a statistic. Both mutation
lanes hold the same project-local lock through cargo-mutants and post-run
verification, so a concurrent run fails before it can replace the report; a
stale-lock failure names the directory to remove after confirming no run is
active. `rust:mutants:diff` mutates only code changed relative to
`MUTANTS_BASE_REF` for the inner loop. An explicit value resolves exactly as
supplied; otherwise the task prefers `refs/remotes/origin/main` over the local
`main` branch. It hands cargo-mutants the diff from the merge base and reports
how to fetch full history when no merge base exists. Untracked files fail the lane with `git add -N` guidance because Git
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

Noisy lints stay relaxed by default; `Cargo.toml` gives the reason for each
`allow`. The remainder of `clippy::restriction` and `clippy::cargo`, nightly
formatting rules, feature-matrix builds (`cargo-hack`) for cfg-gated fallback
paths, and, for published libraries, `cargo-semver-checks` and Clippy's
exported-API exemption remain project-specific choices.
