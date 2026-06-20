# Go Standards

Copy `go.mod`, `.golangci.yml`, and `Mise/conf.d/20-go.toml` into a Go module.
Replace `example.com/project` with the real module path.

The standard gate keeps Go's native toolchain as the source of truth:

```sh
mise run go:fmt:check
mise run go:lint
mise run go:test
```

`go:lint` checks module tidiness, verifies downloaded modules, runs `go vet`,
`golangci-lint`, and `govulncheck`. Race tests, coverage, and benchmarks are
separate tasks because they are slower or platform-sensitive.
