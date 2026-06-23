# Elixir Standards

Copy these files into a Mix project and replace `ProjectName`, `:project_name`,
and package metadata with the real application names.

This is a strict, systems-level generic starting template. Relax or remove
checks once the real application shape, release cadence, and operational risk
make a narrower gate more sensible.

Commit `mix.lock` for applications and CLI tools. Add Phoenix/Ecto formatter
imports and Sobelow tuning only when the project has that web surface. Add
Boundary or other architecture checks after real module boundaries exist.

The standard local gate is:

```sh
mise run elixir:fmt:check
mise run elixir:lint
mise run elixir:test
mise run elixir:check
```

`elixir:ci` adds Dialyzer, dependency audits, docs, and coverage. Add Sobelow
in a Phoenix/web overlay when the project has that surface.
