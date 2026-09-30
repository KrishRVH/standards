# Odin Standards

Copy `.editorconfig`, `odinfmt.json`, `scripts/format.sh`, `src/`, `tests/`,
and `Mise/conf.d/20-odin.toml` into an Odin project. Replace `project_name` in
directory names, package declarations, imports, task paths, and the formatter
script's paths with the real package name.

The OLS `odinfmt` nightly handles developer formatting. The version-matched
Odin compiler remains authoritative for parsing, style, static analysis, and
tests. Alongside Odin's strict checker flags, the template adds
`-vet-using-param` as a house rule: outside short-lived refactoring, `using`
parameters obscure data flow.

The standards workflow is:

```sh
mise run odin:standards
mise run odin:fmt:check
mise run --skip-tools odin:fmt:update
mise run odin:lint
mise run odin:test
mise run odin:test:optimized
mise run odin:standards:check
```

`odin:fmt` mutates only Git-tracked or unignored `.odin` files under
`src/project_name/` and `tests/`. Its adapter, `scripts/format.sh`, rejects
symlinks, propagates parser and write failures, preserves ordinary file modes,
and atomically replaces changed files instead of using `odinfmt -w`'s fallible
backup path. The explicit
configuration keeps LF output on every host. `odin:fmt:check` remains strict
compiler style validation because `odinfmt` has no check-only mode.

The formatter channel is mutable by design. The committed fixture lock records
the reviewed nightly asset and GitHub-published checksum, so replacement fails
closed, but it cannot preserve an asset after OLS rotates the nightly release.
After reviewing a replacement, run `mise run --skip-tools odin:fmt:update` to
refresh its checksum before mise attempts installation, then force-reinstall
the formatter. Relocking alone can leave a warm machine on
the old cached binary. The formatting adapter requires a POSIX shell; native
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

## Not Included

These generic defaults stay out on purpose:

- A floating latest or nightly compiler: dated releases contain breaking
  changes, and exact releases with lock data exist.
- `odinfmt` as a CI or style authority: it has no check mode, can report
  success after some failures, and tracks a different parser snapshot.
- `strip-semicolon` in `fmt`: it can rewrite files outside the requested
  package.
- A fixed test thread count or seed: it removes parallel and randomized coverage
  that the reported seed already makes reproducible.
- MemorySanitizer or ThreadSanitizer: their host and instrumentation
  requirements are not generic.
- A coverage threshold: no native Odin coverage surface owns the result.
- A stack protector on test executables: it hardens a disposable runner, not a
  shipped artifact. Add it to real build tasks.
- A documentation smoke task: `odin doc` cannot deny missing documentation, and
  the template has no documentation consumer.
