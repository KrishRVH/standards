# Python Standards

Copy `pyproject.toml` into a Python project and replace the placeholder package
names:

- `project-name`: the distribution name.
- `project_name`: the import package under `src/`.

Use this with the shared mise template:

```text
.config/mise/config.toml
.config/mise/conf.d/20-python.toml
```

Day-to-day commands should go through mise:

```sh
mise run py:fmt:check
mise run py:lint
mise run py:test
mise run py:build
mise run py:check
mise run py:deep
```

The default baseline is intentionally strict: Ruff selects all rules,
basedpyright runs in strict mode, Bandit checks source security, tests require
branch coverage, and `py:build` verifies wheel and source distributions.
`py:deep` adds mypy, dependency hygiene, doc coverage, complexity, dataclass
slots, and high-confidence dead-code checks for projects that want the heavier
analysis profile.

That strictness is a starting point, not an obligation. Relax or remove checks
that do not fit the project's risk, lifecycle, typing surface, or migration
state.

The aggregate `mise run fmt`, `mise run lint`, `mise run test`, and
`mise run check` commands also dispatch to these Python tasks when
`pyproject.toml` is present.
