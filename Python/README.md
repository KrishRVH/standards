# Python Standards

Copy `pyproject.toml` into a Python project and replace the placeholder package
names:

- `project-name`: the distribution name.
- `project_name`: the import package under `src/`.

Use this with the shared mise and Dagger templates:

```text
.config/mise/config.toml
.config/mise/conf.d/10-dagger.toml
.config/mise/conf.d/20-python.toml
dagger.json
dagger/
```

Day-to-day commands should go through mise:

```sh
mise run py:fmt:check
mise run py:lint
mise run py:test
mise run py:check
```

The baseline is intentionally strict: Ruff selects all rules, basedpyright and
mypy both run in strict modes, tests require branch coverage, and linting also
checks dependency hygiene, doc coverage, complexity, dataclass slots, security,
and high-confidence dead code.

That strictness is a starting point, not an obligation. Relax or remove checks
that do not fit the project's risk, lifecycle, typing surface, or migration
state.

The aggregate `mise run fmt`, `mise run lint`, `mise run test`, and
`mise run check` commands also dispatch to these Python tasks when
`pyproject.toml` is present.
