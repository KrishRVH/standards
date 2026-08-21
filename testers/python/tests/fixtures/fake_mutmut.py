"""Controllable mutmut process boundary for transaction tests."""

from __future__ import annotations

import json
import os
import signal
import subprocess
import sys
from pathlib import Path
from time import sleep
from typing import Never

TERM_RESISTANT_DESCENDANT = "term-resistant-descendant"


def append_command(command: str) -> None:
    """Record one fake mutmut command durably enough for process tests."""
    with Path("command.log").open("a", encoding="utf-8") as log:
        _ = log.write(f"{command}\n")


def configured_failure(command: str) -> int | None:
    """Return the configured failure code for this command, if any."""
    failure_command = Path("failure-command")
    if not failure_command.is_file():
        return None
    if failure_command.read_text(encoding="utf-8").strip() != command:
        return None
    return int(Path("failure-code").read_text(encoding="utf-8").strip())


def wait_if_blocked() -> None:
    """Expose a deterministic overlap window until the test releases it."""
    if Path("spawn-term-resistant-descendant").is_file():
        descendant: subprocess.Popen[bytes] = subprocess.Popen(  # noqa: S603 -- the interpreter and fixture path are test-owned constants
            [sys.executable, "-I", str(Path(__file__).resolve()), TERM_RESISTANT_DESCENDANT],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        _ = descendant.wait()
        return
    if not Path("block").is_file():
        return
    Path("started").touch()
    while not Path("release").exists():
        sleep(0.01)


def export_report() -> None:
    """Write one complete, non-vacuous mutmut report."""
    report = {
        "check_was_interrupted_by_user": 0,
        "killed": 1,
        "no_tests": 0,
        "segfault": 0,
        "skipped": 0,
        "suspicious": 0,
        "survived": 0,
        "timeout": 0,
        "total": 1,
    }
    output = Path("mutants/mutmut-cicd-stats.json")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(f"{json.dumps(report, sort_keys=True)}\n", encoding="utf-8")


def main(arguments: list[str]) -> int:
    """Implement the two mutmut subcommands used by the transaction runner."""
    if arguments == [TERM_RESISTANT_DESCENDANT]:
        run_term_resistant_descendant()
    if len(arguments) != 1 or arguments[0] not in {"run", "export-cicd-stats"}:
        return 2
    command = arguments[0]
    append_command(command)
    failure = configured_failure(command)
    if failure is not None:
        return failure
    if command == "run":
        wait_if_blocked()
    else:
        export_report()
    return 0


def run_term_resistant_descendant() -> Never:
    """Remain in the command process group and detect premature lock release."""
    _ = signal.signal(signal.SIGTERM, signal.SIG_IGN)
    Path("descendant.pid").write_text(f"{os.getpid()}\n", encoding="utf-8")
    Path("descendant-ready").touch()
    lock = Path(".mutmut-run.lock")
    while lock.exists():
        sleep(0.01)
    Path("lock-released-while-descendant-alive").touch()
    while True:
        sleep(1)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
