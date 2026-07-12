# Odin Standards

Copy `.editorconfig`, `odinfmt.json`, `src/`, `tests/`, and
`Mise/conf.d/20-odin.toml` into an Odin project. Replace `project_name` in
directory names, package declarations, imports, and task paths with the real
package name.

The template uses the OLS `odinfmt` nightly for developer formatting and treats
the version-matched Odin compiler as the parser, style, static-analysis, and
test authority. It uses Odin's own strict checker flags and adds
`-vet-using-param` as a house rule because `using` parameters obscure data flow
outside short-lived refactoring.

The standards workflow is:

```sh
mise run odin:standards
mise run odin:fmt:check
mise run odin:fmt:update
mise run odin:lint
mise run odin:test
mise run odin:test:optimized
mise run odin:standards:check
```

`odin:fmt` mutates only Git-tracked or unignored `.odin` files under
`src/project_name/` and `tests/`. Its adapter rejects symlinks, propagates parser
and write failures, preserves ordinary file modes, and atomically replaces
changed files instead of using `odinfmt -w`'s fallible backup path. The explicit
configuration keeps LF output on every host. `odin:fmt:check` remains strict
compiler style validation because `odinfmt` has no check-only mode.

The formatter channel is intentionally mutable. The committed fixture lock
records the reviewed nightly asset and GitHub-published checksum, so replacement
fails closed; it cannot preserve an asset after OLS rotates the nightly release.
After reviewing the replacement, run `mise run odin:fmt:update` to update its
checksum and force-reinstall it; relocking alone can leave a warm machine on the
old cached binary. The formatting adapter requires a POSIX shell, and native
Windows remains unverified.

Tests keep Odin's default parallel execution and per-run random seed, which the
runner reports for reproduction. The required lanes disable animated output,
turn tracked bad memory into failures, exercise debug AddressSanitizer, and
repeat the tests with optimized code generation.

The committed fixture verifies the official Linux x64 compiler release and OLS
formatter nightly with pinned Clang. macOS requires the Xcode command-line
tools; Windows requires MSVC and the Windows SDK. Those hosts and FreeBSD are
not verified by this repository, and both the formatter adapter and generic
aggregate dispatcher in `Mise/config.toml` require a POSIX shell.

The flat `tests/` package is enough while all tests belong to one package. When
the project gains a second test package, follow Odin's documented root
`@require import` aggregator pattern and run the package graph with
`-all-packages`.
