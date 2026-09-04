"""Boundary tests for the executable Python suppression policy."""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).parents[1]
POLICY = PROJECT_ROOT / "scripts" / "check-suppressions.py"
RUFF_CONFIG = PROJECT_ROOT / "pyproject.toml"


def run_policy(path: Path) -> subprocess.CompletedProcess[str]:
    """Run the policy exactly as the mise task does for one fixture."""
    return subprocess.run(  # noqa: S603 -- the executable and arguments are test-owned constants
        [sys.executable, "-I", str(POLICY), str(path)],
        check=False,
        capture_output=True,
        text=True,
    )


def run_default_policy(project: Path) -> subprocess.CompletedProcess[str]:
    """Run the no-argument policy from a synthetic project root."""
    return subprocess.run(  # noqa: S603 -- the executable and arguments are test-owned constants
        [sys.executable, "-I", str(POLICY)],
        cwd=project,
        check=False,
        capture_output=True,
        text=True,
    )


def test_reasoned_per_site_suppressions_pass_and_strings_are_ignored(tmp_path: Path) -> None:
    fixture = tmp_path / "accepted.py"
    fixture.write_text(
        "\n".join(
            (
                'example = "# noqa and # pragma: no cover are text, not comments"',
                "# mypy: disallow-any-decorated=False, disallow-any-expr=False",
                "value = 1  # noqa: TID251 -- the composition root injects this value --",
                "typed = value  # pyright: ignore[reportUnknownVariableType] -- boundary is untyped",
                "assert typed  # nosec B101 -- this assertion verifies a test-owned invariant",
                "alias = typed  # pragma: no mutate -- both generated aliases are equivalent",
                "other = typed  # pragma:  no mutate -- both generated aliases are equivalent",
                "if typed:  # pragma: no branch -- both outcomes are platform-dependent",
                "    pass  # pragma: no cover -- this platform has no matching runtime",
                "import os  # rationale # noqa: F401 -- documents an optional dependency",
                "assert True  # noqa: S101 -- test invariant # nosec B101 -- test invariant",
            )
        ),
        encoding="utf-8",
    )

    result = run_policy(fixture)

    assert result.returncode == 0, result.stderr


def test_broad_reasonless_and_range_suppressions_fail(tmp_path: Path) -> None:
    cases = (
        ("# noqa", "noqa must"),
        ("# noqa: TID251", "noqa must"),
        ("# noqa: TID251 -- !!!", "noqa must"),
        ("# ruff: noqa", "Ruff and Flake8 file directives"),
        ("# flake8: noqa", "Ruff and Flake8 file directives"),
        ("# explanation # noqa: F401", "noqa must"),
        ("# explanation # ruff: noqa: F401", "Ruff and Flake8 file directives"),
        ("# type: ignore[attr-defined] -- boundary is dynamic", "type: ignore is forbidden"),
        ("# pyright: basic", "Pyright file configuration is forbidden"),
        ("# pyright: ignore -- boundary is dynamic", "pyright ignores must"),
        ("# mypy: ignore-errors", "mypy file configuration is limited"),
        ("# nosec -- reviewed", "nosec must"),
        ("# reviewed # nosec", "nosec must"),
        ("# noqa: S101 -- test invariant # nosec", "nosec must"),
        ("# pragma: no mutate start -- generated region", "mutation exclusions must"),
        ("# pragma: no cover -- reviewed no mutate start", "mutation exclusions must"),
        ("# pragma: no mutatestart", "mutation exclusions must"),
        ("# pragma: no mutateend", "mutation exclusions must"),
        ("# pragma: no mutateblock", "mutation exclusions must"),
        ("# pragma: no cover", "coverage exclusions must"),
        ("# pragma no cover", "coverage exclusions must"),
        ("# pragma: nocover", "coverage exclusions must"),
        ("# pragma: nobranch", "coverage exclusions must"),
        ("# explanation # fmt: skip", "formatter and import-order bypass"),
        ("# fmt: off", "formatter and import-order bypass"),
        ("# yapf: disable", "formatter and import-order bypass"),
        ("# yapf: enable", "formatter and import-order bypass"),
        ("# isort: split", "formatter and import-order bypass"),
        ("# isort: skip_file", "formatter and import-order bypass"),
    )

    for index, (comment, expected) in enumerate(cases):
        fixture = tmp_path / f"rejected_{index}.py"
        fixture.write_text(f"value = 1  {comment}\n", encoding="utf-8")

        result = run_policy(fixture)

        assert result.returncode == 1
        assert expected in result.stderr


def test_default_scan_covers_root_files_and_prunes_only_ignored_trees(tmp_path: Path) -> None:
    """Root modules and nested first-party mutants packages stay in policy scope."""
    (tmp_path / "conftest.py").write_text("# fmt: off\n", encoding="utf-8")
    (tmp_path / "first_party.pyi").write_text("# isort: split\n", encoding="utf-8")
    nested_mutants = tmp_path / "src" / "project_name" / "mutants"
    nested_mutants.mkdir(parents=True)
    (nested_mutants / "real.py").write_text("# yapf: disable\n", encoding="utf-8")
    for ignored in (tmp_path / "mutants", tmp_path / ".venv", tmp_path / "build"):
        ignored.mkdir()
        (ignored / "generated.py").write_text("# fmt: off\n", encoding="utf-8")

    result = run_default_policy(tmp_path)

    assert result.returncode == 1
    assert "conftest.py" in result.stderr
    assert "first_party.pyi" in result.stderr
    assert "src/project_name/mutants/real.py" in result.stderr
    assert "mutants/generated.py" not in result.stderr
    assert ".venv/generated.py" not in result.stderr
    assert "build/generated.py" not in result.stderr


def test_default_scan_checks_symlinked_python_source(tmp_path: Path) -> None:
    """A Python-named symlink remains in scope because the toolchain consumes it."""
    target = tmp_path / "source.inc"
    target.write_text("# fmt: off\n", encoding="utf-8")
    (tmp_path / "linked.py").symlink_to(target.name)

    result = run_default_policy(tmp_path)

    assert result.returncode == 1
    assert "linked.py" in result.stderr


def test_default_scan_fails_on_broken_python_symlink(tmp_path: Path) -> None:
    """A missing symlink target cannot silently bypass comment inspection."""
    (tmp_path / "linked.py").symlink_to("missing.py")

    result = run_default_policy(tmp_path)

    assert result.returncode == 1
    assert "linked.py: cannot inspect comments" in result.stderr


def test_default_scan_rejects_internal_and_external_symlinked_directories(
    tmp_path: Path,
) -> None:
    """Reject source-directory links because the Python tools consume them inconsistently."""
    external_target = tmp_path / "external-target"
    external_target.mkdir()
    (external_target / "api.pyi").write_text("# pyright: basic\n", encoding="utf-8")

    for label, target_is_internal in (("internal", True), ("external", False)):
        project = tmp_path / f"{label}-project"
        project.mkdir()
        if target_is_internal:
            target = project / "dist"
            target.mkdir()
            (target / "api.pyi").write_text("# pyright: basic\n", encoding="utf-8")
        else:
            target = external_target
        link = project / "src" / "linked_types"
        link.parent.mkdir()
        link.symlink_to(target, target_is_directory=True)

        result = run_default_policy(project)

        assert result.returncode == 1
        assert "symlinked source directories are forbidden" in result.stderr
        assert "linked_types" in result.stderr

    nested_vendor_project = tmp_path / "nested-vendor-project"
    nested_vendor_project.mkdir()
    nested_vendor = nested_vendor_project / "src" / "package" / "vendor"
    nested_vendor.parent.mkdir(parents=True)
    nested_vendor.symlink_to(external_target, target_is_directory=True)

    result = run_default_policy(nested_vendor_project)

    assert result.returncode == 1
    assert "src/package/vendor" in result.stderr


def test_configured_ruff_walls_fire_with_their_expected_rule_ids(tmp_path: Path) -> None:
    """Prove the pinned project config activates each critical Ruff wall."""
    ruff = shutil.which("ruff")
    assert ruff is not None
    probes = (
        (
            "ambient.py",
            'import os\nvalue = os.environ["TOKEN"]\n',
            "TID251",
        ),
        (
            "global_state.py",
            "value = 0\ndef mutate() -> None:\n    global value\n    value = 1\n",
            "PLW0603",
        ),
        (
            "blanket_noqa.py",
            "value = 1  # noqa\n",
            "PGH004",
        ),
        (
            "stale_noqa.py",
            "value = 1  # noqa: F401 -- synthetic stale rule\n",
            "RUF100",
        ),
        (
            "unknown_noqa.py",
            "value = 1  # noqa: MADE999 -- synthetic invalid rule\n",
            "RUF102",
        ),
    )

    for name, source, expected_rule in probes:
        fixture = tmp_path / name
        fixture.write_text(source, encoding="utf-8")

        result = subprocess.run(  # noqa: S603 -- PATH resolves the mise-installed pinned Ruff binary
            [ruff, "check", "--config", str(RUFF_CONFIG), str(fixture)],
            check=False,
            capture_output=True,
            text=True,
        )

        assert result.returncode == 1
        assert expected_rule in f"{result.stdout}\n{result.stderr}"
