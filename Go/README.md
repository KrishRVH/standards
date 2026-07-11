# Go Standards

Copy `go.mod`, `.golangci.yml`, `boringlint/`, and `Mise/conf.d/20-go.toml`
into a Go module. Replace `example.com/project` with the real module path.

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
`go vet` analyzers and the restricted-dialect vet tool below, then runs
`golangci-lint` and `govulncheck`. The gate also checks and tests the analyzer's
nested module. `go:standards:check` adds race tests and coverage. Benchmarks stay
a named task because they are not part of the CI gate. `go:cover` emits a
coverage report by default; set `GO_COVER_MIN` when a project wants a hard local
threshold.

## Restricted Go dialect

These guards preserve the Go this template values: obvious, self-documenting,
easy to grok, self-contained, concise, and readily apparent. Elegance here
means directness: local data and control flow stay visible, without unwarranted
ceremony or extra language machinery.

Project code rejects two language directions after Go 1.22:

- Go 1.23 range-over-function iterators. `boringlint/norangefunc` rejects the
  language construct, `depguard` rejects direct `iter` imports, and type-aware
  `forbidigo` rejects the common collection and text iterator producers.
- Go 1.27 generic methods. The module's `go 1.26` language directive makes
  method-local type parameters a compile error today. `boringlint` also carries
  a `nogenericmethod` analyzer so the policy survives a future language-version
  bump.

Methods on generic types that only use their receiver's type parameters and
package-level generic functions remain allowed. Dependencies may still return
iterator values; materialize them immediately at the call boundary, for example
with `slices.Collect`, instead of exposing them in project signatures or ranging
over them.

`boringlint` is a self-contained nested module, so its analysis dependencies do
not enter the application module. The mise tasks verify and test that module,
cache its vet binary under `.cache/`, and run it separately because `-vettool`
replaces the standard `go vet` analyzer set.
