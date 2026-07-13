# Go Standards

Copy `go.mod`, `.golangci.yml`, and `Mise/conf.d/20-go.toml` into a Go module.
Replace `example.com/project` with the real module path.

This is a strict, systems-level generic starting template. Keep the native Go
checks as the default, but relax or split slower/static/security gates when the
project's lifecycle calls for a smaller local loop.

The standards workflow keeps Go's native toolchain as the source of truth:

```sh
mise run go:standards
mise run go:fmt:check
mise run go:lint
mise run go:test
mise run go:standards:check
```

`go:lint` checks module tidiness, verifies downloaded modules, runs the standard
`go vet` analyzers and the restricted-dialect analyzer below, then runs
`golangci-lint` and `govulncheck`. `go:standards:check` adds race tests and
coverage. Benchmarks stay a named task because they are not part of the CI gate.
`go:cover` emits a coverage report by default; set `GO_COVER_MIN` when a project
wants a hard local threshold.

## Restricted Go dialect

These guards preserve the style of Go this template values: obvious,
self-documenting, easy to grok, self-contained, concise, and readily apparent.
Here, elegance means directness: local data and control flow stay visible
without unwarranted ceremony or extra language machinery.

Project code rejects two language directions after Go 1.22:

- Go 1.23 range-over-function iterators. `boringlint/noiterator` rejects direct
  `iter` imports, the language construct, and iterator-shaped project type and
  function declarations.
- Go 1.27 generic methods. The module's `go 1.26` language directive makes
  method-local type parameters a compile error today. `boringlint/nogenericmethod`
  rejects declarations and dependency method selections once the language
  version permits them.

Methods on generic types that only use their receiver's type parameters and
package-level generic functions remain allowed. Dependencies may still return
iterator values; materialize them immediately at the call boundary, for example
with `slices.Collect`. Iterator producer names are not cataloged because the
structural guards cover the project-owned policy without release-specific lists.

Mise installs `boringlint` from its canonical Go module at a pinned revision, so
its analysis dependencies do not enter the application module. The project runs
it separately from the standard `go vet` analyzer set.
