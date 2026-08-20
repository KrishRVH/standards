"""Contracts for cold and incremental Python mutation tasks."""

from __future__ import annotations

import tomllib
from pathlib import Path
from typing import cast

TASKS = Path(".config/mise/conf.d/20-python.toml")


def task(name: str) -> dict[str, object]:
    """Return one typed task table from the copied mise fragment."""
    parsed = cast(object, tomllib.loads(TASKS.read_text(encoding="utf-8")))
    assert isinstance(parsed, dict)
    tasks = cast(dict[str, object], parsed).get("tasks")
    assert isinstance(tasks, dict)
    selected = cast(dict[str, object], tasks).get(name)
    assert isinstance(selected, dict)
    return cast(dict[str, object], selected)


def task_run(name: str) -> str:
    """Return one task's shell body."""
    run = task(name).get("run")
    assert isinstance(run, str)
    return run


def test_mandatory_mutation_gate_uses_the_shared_full_transaction() -> None:
    run = task_run("py:mutants")

    assert run == "uv run python -I scripts/run-mutation-transaction.py full"
    assert "rm " not in run
    assert "mutmut run" not in run
    depends = task("py:standards:check").get("depends")
    assert isinstance(depends, list)
    assert "py:mutants" in depends
    assert "py:mutants:incremental" not in depends


def test_incremental_mutation_task_uses_the_same_transaction_boundary() -> None:
    run = task_run("py:mutants:incremental")

    assert run == "uv run python -I scripts/run-mutation-transaction.py incremental"
    assert "rm " not in run
    assert "mutmut run" not in run
