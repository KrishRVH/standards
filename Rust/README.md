# Rust Standards

Copy these files into a Rust project and run the tasks through `mise`.

This is a strict, systems-level generic starting template. It is intentionally
stricter than many application defaults so the first copied baseline has useful
guardrails; relax or remove checks that do not fit the project.

## Tooling

```sh
mise run rust:lock:check
mise run rust:fmt:check
mise run rust:lint
mise run rust:test
mise run rust:test:doc
mise run rust:doc
mise run rust:deny
mise run rust:check
```

The baseline pins Rust, uses edition 2024, forbids local unsafe code, requires
documented public API, denies rustdoc warnings, checks doctests, and runs Clippy
for every workspace target and feature with warnings promoted to failures.

Lock-sensitive gates run `rust:lock:check` first. That task generates
`Cargo.lock` locally when it is missing, fails in CI when it is missing, and
then lint/test/doc/deny tasks run with `--locked`. `rust:deny` installs pinned
`cargo-deny` into local `.cargo-tools` and checks advisories, licenses,
duplicate-version warnings, wildcard dependency requirements, and dependency
sources.

The template keeps noisy systems-code lints relaxed by default: numeric casts,
entire `clippy::restriction` or `clippy::cargo` groups, dependency unsafe
scanning, unused dependency scanning, and aggressive rustfmt/nightly formatting
policy are project-specific choices. Selected cargo/dependency policies are
still enforced.
