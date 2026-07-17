# Roc Standards

Copy `main.roc`, `Project.roc`, and `Mise/conf.d/20-roc.toml` into a Roc
project. Replace `Project` in the module name, filename, and package exposure
with the real package name. Keep `main.roc` as the package root, or update the
explicit task paths when the project chooses another root.

Roc has not reached a stable release. This template pins the latest immutable
new-compiler release selected by Roc's official installers, including the
official SHA-256 metadata in the committed fixture lock. Do not replace it with
the mutable `alpha4-rolling` channel: that is the older Rust compiler and uses
different syntax and commands.

The standards workflow is:

```sh
mise run roc:standards
mise run roc:fmt:check
mise run roc:lint
mise run roc:test
mise run roc:standards:check
```

Roc's formatter is intentionally not configurable. The format tasks cover
Git-tracked and unignored regular `.roc` files when Git is available; the
fallback walks the current project. They reject symlinks, and the mutating task
stages compiler output beside each source before an atomic replacement.
`roc:lint` runs the compiler's non-building check without its cache, and the
pinned compiler fails that command on both errors and warnings. `roc:test` runs
every top-level `expect` reachable from `main.roc` through the native
development backend.

The package root, exposed type module, and inline `expect` follow current
new-compiler package examples. This keeps the generic fixture at a real module
boundary without inventing a package manager, external platform, or test
framework. It also avoids treating the tutorial-only built-in Echo platform as
a production application baseline. Add an app header and a reviewed,
content-addressed platform when the real project needs an executable.

The declared tool supports Linux x64/ARM64, macOS x64/Apple Silicon, and
Windows x64 using the exact official release assets. This repository verifies
Linux x64. Roc does not currently publish a Windows ARM64 asset, and its other
host guidance is to build from source. The project-owned formatter adapter and
the generic dispatcher in `Mise/config.toml` require a POSIX shell.
