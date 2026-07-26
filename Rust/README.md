# Rust Standards

Copy these files into a Rust project and run the tasks through `mise`.

The copied baseline is deliberately stricter than many application defaults so
it begins with useful guardrails. Relax or remove checks that do not fit the
project.

## Tooling

```sh
mise run rust:components
mise run rust:deny:install
mise run rust:lock:check
mise run rust:fmt:check
mise run rust:lint
mise run rust:test
mise run rust:test:doc
mise run rust:doc
mise run rust:package
mise run rust:deny
mise run rust:standards
mise run rust:standards:check
```

The baseline pins Rust, uses edition 2024, forbids local unsafe code, requires
documented public API, denies rustdoc warnings, checks doctests, and runs Clippy
for every workspace target and feature with warnings promoted to failures.

Lock-sensitive gates run `rust:lock:check` first. That task generates
`Cargo.lock` locally when it is missing, fails in CI when it is missing, and
then lint/test/doc/package/deny tasks run with `--locked`. `rust:package`
validates publishable package contents with `cargo package --workspace`.
`rust:deny:install` installs pinned `cargo-deny` into local `.cargo-tools`;
`rust:deny` checks advisories, licenses, duplicate-version warnings, wildcard
dependency requirements, and dependency sources.

Noisy systems-code lints stay relaxed by default. Numeric casts, the complete
`clippy::restriction` and `clippy::cargo` groups, dependency unsafe scanning,
unused dependency scanning, and aggressive rustfmt or nightly formatting rules
remain project-specific choices. The selected Cargo and dependency policies
are still enforced.
