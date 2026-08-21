"""Validate mutmut's report and enforce the committed mutation floor."""

from __future__ import annotations

import json
import os
from decimal import Decimal, InvalidOperation, localcontext
from pathlib import Path
from typing import NoReturn, cast

REPORT = Path("mutants/mutmut-cicd-stats.json")
FLOOR = Path(".mutmut-floor")
MUTANT_STATUS_FIELDS = (
    "killed",
    "survived",
    "no_tests",
    "skipped",
    "suspicious",
    "timeout",
    "segfault",
)
COMPLETION_FIELD = "check_was_interrupted_by_user"
REPORT_FIELDS = frozenset((*MUTANT_STATUS_FIELDS, COMPLETION_FIELD, "total"))
EXECUTED_FIELDS = ("killed", "survived", "suspicious", "timeout", "segfault")


def fail(message: str) -> NoReturn:
    """Stop with one actionable gate error."""
    raise SystemExit(message)


def reject_json_constant(token: str) -> NoReturn:
    """Reject Python's non-standard NaN and infinity JSON extensions."""
    fail(f"mutmut report contains non-finite JSON value {token!r}.")


def unique_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    """Build one JSON object while rejecting duplicate field names."""
    result: dict[str, object] = {}
    for name, value in pairs:
        if name in result:
            fail(f"mutmut report contains duplicate field {name!r}.")
        result[name] = value
    return result


def integer_field(report: dict[str, object], name: str) -> int:
    """Read one non-negative integer report field without accepting bool."""
    value = report[name]
    if isinstance(value, bool) or not isinstance(value, int):
        fail(f"mutmut report field {name!r} must be an integer.")
    if value < 0:
        fail(f"mutmut report field {name!r} must be non-negative.")
    return value


def load_report() -> dict[str, object]:
    """Load the isolated report and require the exact pinned mutmut schema."""
    try:
        parsed = cast(
            object,
            json.loads(
                REPORT.read_text(encoding="utf-8"),
                object_pairs_hook=unique_object,
                parse_constant=reject_json_constant,
            ),
        )
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        fail(f"Cannot read mutmut report {REPORT}: {error}")
    if not isinstance(parsed, dict):
        fail("mutmut report root must be an object.")

    report = cast(dict[str, object], parsed)
    fields = frozenset(report)
    if fields != REPORT_FIELDS:
        missing = ", ".join(sorted(REPORT_FIELDS - fields)) or "none"
        unexpected = ", ".join(sorted(fields - REPORT_FIELDS)) or "none"
        fail(f"mutmut report schema mismatch; missing: {missing}; unexpected: {unexpected}.")
    return report


def mutation_score() -> Decimal:
    """Validate a completed report and return its deterministic score."""
    report = load_report()
    statuses = {name: integer_field(report, name) for name in MUTANT_STATUS_FIELDS}
    if integer_field(report, COMPLETION_FIELD) != 0:
        fail("mutmut report is incomplete because the run was interrupted.")
    total = integer_field(report, "total")
    status_total = sum(statuses.values())
    if total != status_total:
        fail(
            f"mutmut report is inconsistent: total is {total}, but statuses sum to {status_total}."
        )
    if total == 0:
        fail("mutmut generated no mutants; check [tool.mutmut] source_paths.")
    executed = sum(statuses[name] for name in EXECUTED_FIELDS)
    if executed == 0:
        fail("mutmut executed no mutants; no-tests and skipped results are not execution evidence.")

    with localcontext() as context:
        context.prec = 50
        return Decimal(100) * Decimal(statuses["killed"]) / Decimal(total)


def configured_floor() -> Decimal:
    """Load and validate the source-controlled floor or bootstrap override."""
    try:
        floor_text = FLOOR.read_text(encoding="utf-8").strip() if FLOOR.is_file() else None
    except (OSError, UnicodeError) as error:
        fail(f"Cannot read mutation floor {FLOOR}: {error}")
    if floor_text is None:
        floor_text = os.environ.get(  # noqa: TID251 -- this CLI boundary owns the bootstrap input
            "MUTMUT_FLOOR"
        )
    if floor_text is None:
        fail(
            "No mutation floor. Set MUTMUT_FLOOR=0 once, then commit the reported floor candidate."
        )
    try:
        floor = Decimal(floor_text)
    except InvalidOperation:
        fail("Mutation floor must be a decimal number from 0 through 100.")
    if not floor.is_finite() or not Decimal(0) <= floor <= Decimal(100):
        fail("Mutation floor must be finite and from 0 through 100.")
    return floor


def main() -> int:
    """Compare the measured score with the floor and print a reusable value."""
    score = mutation_score()
    floor = configured_floor()
    if score < floor:
        fail(f"Mutation score {score:.2f} ({score}) is below the floor {floor}.")
    candidate = format(score, "f")
    print(f"Mutation score {score:.2f} meets the floor {floor}.")
    print(f"Ratchet floor candidate: {candidate}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
