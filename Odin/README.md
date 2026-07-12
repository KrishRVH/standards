# Odin Standards

Copy `.editorconfig`, `src/`, `tests/`, and `Mise/conf.d/20-odin.toml` into an
Odin project. Replace `project_name` in directory names, package declarations,
imports, and task paths with the real package name.

The template treats the version-matched Odin compiler as the parser, style,
static-analysis, and test authority. It uses Odin's own strict checker flags and
adds `-vet-using-param` as a house rule because `using` parameters obscure data
flow outside short-lived refactoring.

The standards workflow is:

```sh
mise run odin:standards
mise run odin:fmt:check
mise run odin:lint
mise run odin:test
mise run odin:test:optimized
mise run odin:standards:check
```

`odin:fmt` and `odin:fmt:check` are intentionally non-mutating. The compiler has
no formatter, and `odin strip-semicolon` can rewrite every file in the parsed
import graph. Keep formatting manual until a versioned formatter can safely
limit writes to project-owned files.

Tests keep Odin's default parallel execution and per-run random seed, which the
runner reports for reproduction. The required lanes disable animated output,
turn tracked bad memory into failures, exercise debug AddressSanitizer, and
repeat the tests with optimized code generation.

The committed fixture verifies the official Linux x64 release with pinned
Clang. macOS requires the Xcode command-line tools; Windows requires MSVC and
the Windows SDK. Those hosts and FreeBSD are not verified by this repository,
and the generic aggregate dispatcher in `Mise/config.toml` requires a POSIX
shell even though the prefixed Odin task fragment uses shell-neutral commands.

The flat `tests/` package is enough while all tests belong to one package. When
the project gains a second test package, follow Odin's documented root
`@require import` aggregator pattern and run the package graph with
`-all-packages`.
