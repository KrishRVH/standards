"""Require an exact, nonempty zero-missing TOTAL row from Interrogate."""

from __future__ import annotations

import argparse
import re
from decimal import Decimal
from pathlib import Path
from typing import NoReturn

TOTAL_PREFIX = re.compile(r"^\|\s*TOTAL\s*\|")
TOTAL_ROW = re.compile(
    r"\|\s*TOTAL\s*\|\s*[0-9]+\s*\|\s*[0-9]+\s*\|\s*[0-9]+\s*\|" + r"\s*[0-9]+(?:\.[0-9]+)?%\s*\|"
)


class Arguments(argparse.Namespace):
    """Typed command-line arguments."""

    def __init__(self) -> None:
        super().__init__()
        self.report: Path = Path()


def fail(message: str) -> NoReturn:
    """Stop with one actionable report error."""
    raise SystemExit(message)


def validate_report(path: Path) -> None:
    """Validate the report's exact object counts rather than its rounded percentage."""
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as error:
        fail(f"Cannot read Interrogate report {path}: {error}")

    rows = [line for line in text.splitlines() if TOTAL_PREFIX.match(line) is not None]
    if len(rows) != 1:
        fail(f"Interrogate report must contain exactly one TOTAL row; found {len(rows)}.")
    match = TOTAL_ROW.fullmatch(rows[0])
    if match is None:
        fail("Interrogate TOTAL row does not match the pinned summary columns.")

    cells = [cell.strip() for cell in match.group(0).split("|")]
    if len(cells) != 7:
        fail("Interrogate TOTAL row does not contain the pinned number of columns.")
    _, _, total_text, missing_text, covered_text, percentage_text, _ = cells
    total = int(total_text)
    missing = int(missing_text)
    covered = int(covered_text)
    percentage = Decimal(percentage_text.removesuffix("%"))
    if total == 0:
        fail("Interrogate report counted no Python objects.")
    if total != missing + covered:
        fail(
            f"Interrogate TOTAL row is inconsistent: {total} != {missing} missing + {covered} covered."
        )
    if not Decimal(0) <= percentage <= Decimal(100):
        fail("Interrogate TOTAL percentage must be from 0 through 100.")
    if missing != 0:
        fail(f"Interrogate reports {missing} undocumented object(s) out of {total} counted.")


def main() -> int:
    """Validate one report supplied by the documentation task."""
    parser = argparse.ArgumentParser()
    parser.add_argument("report", type=Path)
    arguments = parser.parse_args(namespace=Arguments())
    validate_report(arguments.report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
