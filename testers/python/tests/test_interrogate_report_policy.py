"""Boundary tests for exact Interrogate documentation counts."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

CHECKER = Path(__file__).parents[1] / "scripts" / "check-interrogate-report.py"


def run_checker(tmp_path: Path, report: str) -> subprocess.CompletedProcess[str]:
    """Run the report checker through the same isolated process boundary as mise."""
    tmp_path.mkdir(parents=True, exist_ok=True)
    path = tmp_path / "interrogate.txt"
    path.write_text(report, encoding="utf-8")
    return subprocess.run(  # noqa: S603 -- the interpreter and checker are test-owned paths
        [sys.executable, "-I", str(CHECKER), str(path)],
        check=False,
        capture_output=True,
        text=True,
    )


def test_exactly_complete_nonempty_total_passes(tmp_path: Path) -> None:
    report = "| TOTAL | 2000 | 0 | 2000 | 100.0% |\n"

    result = run_checker(tmp_path, report)

    assert result.returncode == 0, result.stderr


def test_rounded_100_percent_with_one_missing_object_fails(tmp_path: Path) -> None:
    report = "| TOTAL | 2000 | 1 | 1999 | 100.0% |\n"

    result = run_checker(tmp_path, report)

    assert result.returncode != 0
    assert "1 undocumented object(s) out of 2000" in result.stderr


def test_malformed_multiple_and_empty_totals_fail(tmp_path: Path) -> None:
    cases = (
        ("| TOTAL | many | 0 | many | 100.0% |\n", "pinned summary columns"),
        ("| TOTAL | 2 | 0 | 2 | 100.0% | trailing\n", "pinned summary columns"),
        ("| TOTAL | 2 | 0 | 1 | 100.0% |\n", "TOTAL row is inconsistent"),
        ("| TOTAL | 2 | 0 | 2 | 100 percent |\n", "pinned summary columns"),
        ("| TOTAL | 2 | 0 | 2 | 101.0% |\n", "percentage must be from 0 through 100"),
        (
            "| TOTAL | 2 | 0 | 2 | 100.0% |\n| TOTAL | 2 | 0 | 2 | 100.0% |\n",
            "found 2",
        ),
        ("| TOTAL | 0 | 0 | 0 | 100.0% |\n", "counted no Python objects"),
        ("no summary here\n", "found 0"),
    )

    for index, (report, expected) in enumerate(cases):
        result = run_checker(tmp_path / str(index), report)

        assert result.returncode != 0
        assert expected in result.stderr
