# Elixir Standards

Copy these files into a Mix project and replace `ProjectName`, `:project_name`,
and package metadata with the real application names.

The template starts strict. Narrow its checks once the application's shape,
release cadence, and operational risk justify a smaller gate.

Applications and CLI tools should commit `mix.lock`; `elixir:install` enforces
an existing lock while allowing reusable libraries to omit one. Add
Phoenix/Ecto formatter imports and Sobelow tuning only for projects with that
web surface. Boundary and other architecture checks should wait until real
module boundaries exist.

The standards workflow is:

```sh
mise run elixir:standards
mise run elixir:fmt:check
mise run elixir:lint
mise run elixir:test
mise run elixir:standards:check
```

`elixir:standards:check` includes Dialyzer, dependency audits, docs, and
coverage. Add Sobelow in a Phoenix/web overlay when the project has that
surface.
