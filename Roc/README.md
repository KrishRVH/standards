# Roc Standards

[Roc](https://www.roc-lang.org/) describes itself as a fast, friendly,
functional language. It compiles to machine code or WebAssembly, keeps the
language small, and aims to make static types feel helpful rather than
ceremonial. The best starting points are the official
[current documentation](https://www.roc-lang.org/docs/main/) and
[new-compiler tutorial](https://www.roc-lang.org/tutorial).

Roc is not ready for a 0.1 release, so it does not yet have the settled project
conventions, tooling expectations, or compatibility promises that the other
standards in this repository can lean on. This profile is deliberately a
showcase rather than a claim that the ecosystem has converged. It captures a
small, reproducible baseline for exploring the language while accepting that
the compiler, syntax, standard library, and recommended project shape can all
change.

## Why Roc Is Here

Several of Roc's choices are unusually thoughtful:

- Decidable principal type inference lets the compiler infer the most general
  type for an expression without requiring annotations everywhere.
- Records and tag unions make domain states explicit. Roc prefers descriptive
  states such as `[Loading, Loaded(Artist), Errored(LoadingErr)]` over nulls or
  a universal optional type.
- Pure functions are the ordinary case, while effectful functions are visible
  through their `!` suffix. Lightweight top-level `expect` declarations and a
  non-configurable formatter are built into the language toolchain.
- The compiler targets low-level outputs instead of inheriting the runtime and
  data-model compromises of a higher-level virtual machine.

The most interesting part to me is Roc's
[application and platform architecture](https://www.roc-lang.org/platforms).
Every application chooses exactly one platform, and that platform supplies the
application's I/O primitives, memory-management strategy, and host integration.
The application author sees a Roc API; the platform's host can be implemented
in a systems language such as Zig, Rust, or C.

That boundary exists all the way down to the produced program. Roc compiles the
application into an object file, combines it with the platform's already-built
host binary, and links the two into one executable. The host starts the process
and decides when to call the Roc application. This makes the split between
domain logic and runtime capabilities architectural rather than conventional,
with interesting consequences for portability, security, embedding, and
domain-specific performance. That experiment is the main reason Roc belongs in
this standards catalog even before 0.1.

## Baseline

Copy `main.roc`, `Project.roc`, and `Mise/conf.d/20-roc.toml` into a Roc
project. Replace `Project` in the module name, filename, and package exposure
with the real package name. Keep `main.roc` as the package root, or update the
explicit task paths when the project chooses another root.

The generic fixture stops at a package boundary and does not choose a platform.
A real executable should deliberately select and review the platform that
defines its capabilities; there is no universal application platform hidden in
this template.

The standards workflow is:

```sh
mise run roc:standards
mise run roc:fmt:check
mise run roc:lint
mise run roc:test
mise run roc:standards:check
```

The mise profile pins an immutable new-compiler nightly so this repository can
reproduce its checks. The executable configuration and committed lockfile are
the source of truth for that operational detail. Formatting, static checks,
and top-level `expect` tests use the compiler directly, without adding a
package manager, test framework, or invented ecosystem policy.

Treat this profile as provisional. Prefer current official documentation over
compatibility with old Roc experiments, and revise the template as the language
earns stable conventions instead of preserving pre-0.1 history.
