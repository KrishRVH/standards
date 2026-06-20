# Elixir Standards

Copy these files into a Mix project and replace `ProjectName`, `:project_name`,
and package metadata with the real application names.

Commit `mix.lock` for applications and CLI tools. Add Phoenix/Ecto formatter
imports and Sobelow tuning only when the project has that web surface. Add
Boundary or other architecture checks after real module boundaries exist.

The standard local gate is:

```sh
mise run elixir:fmt:check
mise run elixir:lint
mise run elixir:test
```

`elixir:ci` adds dependency audits, docs, coverage, and web-security checks.
