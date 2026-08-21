"""Adversarial tests for the isolated mutmut report gate."""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

CHECKER = Path(__file__).parents[1] / "scripts" / "check-mutation-score.py"


def valid_report() -> dict[str, object]:
    """Return the exact report schema emitted by the pinned mutmut release."""
    return {
        "killed": 2,
        "survived": 1,
        "total": 3,
        "no_tests": 0,
        "skipped": 0,
        "suspicious": 0,
        "timeout": 0,
        "check_was_interrupted_by_user": 0,
        "segfault": 0,
    }


def run_checker(
    root: Path,
    report: str,
    *,
    floor: str = "0",
    checker: Path = CHECKER,
) -> subprocess.CompletedProcess[str]:
    """Run the score checker through Python's isolated mode."""
    mutants = root / "mutants"
    mutants.mkdir(parents=True, exist_ok=True)
    (mutants / "mutmut-cicd-stats.json").write_text(report, encoding="utf-8")
    (root / ".mutmut-floor").write_text(floor, encoding="utf-8")
    return subprocess.run(  # noqa: S603 -- the interpreter and checker are test-owned paths
        [sys.executable, "-I", str(checker)],
        cwd=root,
        check=False,
        capture_output=True,
        text=True,
    )


def test_floor_candidate_round_trips_without_float_rounding(tmp_path: Path) -> None:
    report = json.dumps(valid_report())

    first = run_checker(tmp_path, report)

    assert first.returncode == 0, first.stderr
    prefix = "Ratchet floor candidate: "
    candidate = next(
        line.removeprefix(prefix) for line in first.stdout.splitlines() if line.startswith(prefix)
    )

    second = run_checker(tmp_path, report, floor=candidate)

    assert second.returncode == 0, second.stderr
    assert f"Ratchet floor candidate: {candidate}" in second.stdout


def test_surviving_mutant_is_execution_evidence_but_scores_zero(tmp_path: Path) -> None:
    report = valid_report()
    report["killed"] = 0
    report["survived"] = 3

    bootstrap = run_checker(tmp_path / "bootstrap", json.dumps(report))
    ratcheted = run_checker(tmp_path / "ratcheted", json.dumps(report), floor="0.01")

    assert bootstrap.returncode == 0, bootstrap.stderr
    assert "Ratchet floor candidate: 0" in bootstrap.stdout
    assert ratcheted.returncode != 0
    assert "below the floor" in ratcheted.stderr


def test_isolated_mode_ignores_a_sibling_json_shadow(tmp_path: Path) -> None:
    checker = tmp_path / CHECKER.name
    shutil.copyfile(CHECKER, checker)
    (tmp_path / "json.py").write_text("raise RuntimeError('shadowed')\n", encoding="utf-8")

    result = run_checker(tmp_path, json.dumps(valid_report()), checker=checker)

    assert result.returncode == 0, result.stderr


def test_malformed_and_inconsistent_reports_fail_closed(tmp_path: Path) -> None:
    bad_boolean = valid_report()
    bad_boolean["killed"] = True
    bad_sum = valid_report()
    bad_sum["total"] = 4
    negative = valid_report()
    negative["timeout"] = -1
    zero_total = {name: 0 for name in valid_report()}
    all_skipped = valid_report()
    all_skipped["killed"] = 0
    all_skipped["survived"] = 0
    all_skipped["skipped"] = 3
    no_tests = valid_report()
    no_tests["killed"] = 0
    no_tests["survived"] = 0
    no_tests["no_tests"] = 3
    interrupted = valid_report()
    interrupted["check_was_interrupted_by_user"] = 1
    extra_field = valid_report()
    extra_field["future_status"] = 0
    missing_field = valid_report()
    del missing_field["segfault"]
    cases: tuple[tuple[str, str], ...] = (
        (json.dumps(bad_boolean), "must be an integer"),
        (json.dumps(bad_sum), "statuses sum to 3"),
        (json.dumps(negative), "must be non-negative"),
        (json.dumps(zero_total), "generated no mutants"),
        (json.dumps(all_skipped), "executed no mutants"),
        (json.dumps(no_tests), "executed no mutants"),
        (json.dumps(interrupted), "run was interrupted"),
        (json.dumps(extra_field), "schema mismatch"),
        (json.dumps(missing_field), "schema mismatch"),
        (json.dumps(valid_report()).replace('"killed": 2', '"killed": NaN'), "non-finite"),
        (
            json.dumps(valid_report()).replace('"killed": 2', '"killed": 2, "killed": 2'),
            "duplicate field",
        ),
        ("{", "Cannot read mutmut report"),
        ("[]", "root must be an object"),
    )

    for index, (report, expected) in enumerate(cases):
        root = tmp_path / str(index)

        result = run_checker(root, report)

        assert result.returncode != 0
        assert expected in result.stderr


def test_invalid_floors_fail_closed(tmp_path: Path) -> None:
    report = json.dumps(valid_report())
    for index, floor in enumerate(("NaN", "Infinity", "-1", "101", "")):
        result = run_checker(tmp_path / str(index), report, floor=floor)

        assert result.returncode != 0
        assert "Mutation floor must" in result.stderr
