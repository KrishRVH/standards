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

`go:lint` checks module tidiness, verifies downloaded modules, runs `go vet`,
`golangci-lint`, and `govulncheck`. `go:standards:check` adds race tests and
coverage. Benchmarks stay a named task because they are not part of the CI gate.
`go:cover` emits a coverage report by default; set `GO_COVER_MIN` when a
project wants a hard local threshold.
