"""Regression tests for root-generated versus nested source directory scopes."""

from __future__ import annotations

import shutil
import subprocess
import tomllib
from pathlib import Path
from typing import cast

CONFIG = Path("pyproject.toml")


def load_config() -> dict[str, object]:
    """Load the copied project configuration without leaking Any."""
    parsed = cast(object, tomllib.loads(CONFIG.read_text(encoding="utf-8")))
    assert isinstance(parsed, dict)
    return cast(dict[str, object], parsed)


def config_table(root: dict[str, object], *keys: str) -> dict[str, object]:
    """Return one nested TOML table with runtime shape validation."""
    current = root
    for key in keys:
        value = current.get(key)
        assert isinstance(value, dict)
        current = cast(dict[str, object], value)
    return current


def string_list(table: dict[str, object], key: str) -> list[str]:
    """Return one TOML string array with runtime item validation."""
    value = table.get(key)
    assert isinstance(value, list)
    items = cast(list[object], value)
    assert all(isinstance(item, str) for item in items)
    return cast(list[str], items)


def test_tool_exclusions_only_skip_the_generated_root() -> None:
    config = load_config()

    assert string_list(config_table(config, "tool", "ruff"), "extend-exclude") == ["mutants/**"]
    assert "mutants" not in string_list(config_table(config, "tool", "bandit"), "exclude_dirs")
    assert "mutants" not in string_list(config_table(config, "tool", "vulture"), "exclude")
    assert "mutants" in string_list(config_table(config, "tool", "deptry"), "extend_exclude")
    assert "mutants" in string_list(config_table(config, "tool", "interrogate"), "exclude")


def test_ruff_skips_root_mutants_but_checks_nested_source_mutants(tmp_path: Path) -> None:
    ruff = shutil.which("ruff")
    assert ruff is not None
    project_config = tmp_path / CONFIG.name
    project_config.write_text(CONFIG.read_text(encoding="utf-8"), encoding="utf-8")
    generated = tmp_path / "mutants" / "generated.py"
    nested = tmp_path / "src" / "project_name" / "mutants" / "real.py"
    generated.parent.mkdir(parents=True)
    nested.parent.mkdir(parents=True)
    generated.write_text("import os\n", encoding="utf-8")
    nested.write_text('import os\nvalue = eval("1 + 1")\n', encoding="utf-8")

    result = subprocess.run(  # noqa: S603 -- PATH resolves the mise-installed pinned Ruff binary
        [ruff, "check", "--config", str(project_config), "."],
        cwd=tmp_path,
        check=False,
        capture_output=True,
        text=True,
    )

    output = f"{result.stdout}\n{result.stderr}"
    assert result.returncode == 1
    assert "src/project_name/mutants/real.py" in output
    assert "mutants/generated.py" not in output


def test_bandit_checks_nested_source_mutants(tmp_path: Path) -> None:
    bandit = shutil.which("bandit")
    assert bandit is not None
    project_config = tmp_path / CONFIG.name
    project_config.write_text(CONFIG.read_text(encoding="utf-8"), encoding="utf-8")
    nested = tmp_path / "src" / "project_name" / "mutants" / "insecure.py"
    nested.parent.mkdir(parents=True)
    nested.write_text('value = eval("1 + 1")\n', encoding="utf-8")

    result = subprocess.run(  # noqa: S603 -- PATH resolves the mise-installed pinned Bandit binary
        [bandit, "-q", "-c", str(project_config), "-r", "src"],
        cwd=tmp_path,
        check=False,
        capture_output=True,
        text=True,
    )

    output = f"{result.stdout}\n{result.stderr}"
    assert result.returncode == 1
    assert "src/project_name/mutants/insecure.py" in output
    assert "B307" in output
