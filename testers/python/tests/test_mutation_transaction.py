"""Process-boundary tests for the mutually exclusive mutation transaction."""

from __future__ import annotations

import json
import os
import signal
import subprocess
import sys
from pathlib import Path
from time import monotonic, sleep
from typing import Literal, cast

PROJECT_ROOT = Path(__file__).parents[1]
RUNNER = PROJECT_ROOT / "scripts" / "run-mutation-transaction.py"
FAKE_MUTMUT = Path(__file__).parent / "fixtures" / "fake_mutmut.py"


def command(mode: Literal["full", "incremental"]) -> list[str]:
    """Return a transaction command using the controllable fake mutmut CLI."""
    return [
        sys.executable,
        "-I",
        str(RUNNER),
        mode,
        "--mutmut-command",
        sys.executable,
        str(FAKE_MUTMUT),
    ]


def run_transaction(
    project: Path,
    mode: Literal["full", "incremental"],
) -> subprocess.CompletedProcess[str]:
    """Run one transaction synchronously at its public process seam."""
    return subprocess.run(  # noqa: S603 -- the executable and arguments are test-owned constants
        command(mode),
        cwd=project,
        check=False,
        capture_output=True,
        text=True,
    )


def start_transaction(
    project: Path,
    mode: Literal["full", "incremental"],
) -> subprocess.Popen[str]:
    """Start one transaction whose overlap window the test controls."""
    return subprocess.Popen(  # noqa: S603 -- the executable and arguments are test-owned constants
        command(mode),
        cwd=project,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )


def wait_for(path: Path) -> None:
    """Wait briefly for a child-process marker or fail deterministically."""
    deadline = monotonic() + 10
    while not path.exists():
        if monotonic() >= deadline:
            raise AssertionError(f"Timed out waiting for {path}")
        sleep(0.01)


def complete_process(
    process: subprocess.Popen[str], release: Path | None = None
) -> tuple[int, str, str]:
    """Release and collect a test-owned process, killing it only on timeout."""
    if release is not None:
        release.touch()
    try:
        stdout, stderr = process.communicate(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        stdout, stderr = process.communicate(timeout=10)
    return process.wait(), stdout, stderr


def contains_all(text: str, fragments: tuple[str, ...]) -> bool:
    """Return whether a diagnostic contains every required fragment."""
    return all(fragment in text for fragment in fragments)


def process_exists(pid: int) -> bool:
    """Return whether a test-owned process still exists."""
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    return True


def test_full_and_incremental_overlap_fail_before_touching_shared_state(tmp_path: Path) -> None:
    """One project lock covers both transaction modes and all shared state."""
    (tmp_path / ".mutmut-floor").write_text("100\n", encoding="utf-8")
    old_state = tmp_path / "mutants" / "old-state"
    old_state.parent.mkdir()
    old_state.write_text("stale\n", encoding="utf-8")
    (tmp_path / "block").touch()
    first = start_transaction(tmp_path, "full")
    first_status = -1
    stdout = stderr = ""
    try:
        wait_for(tmp_path / "started")
        old_state_removed = not old_state.exists()

        owner_value = cast(
            object,
            json.loads((tmp_path / ".mutmut-run.lock" / "owner.json").read_text(encoding="utf-8")),
        )
        assert isinstance(owner_value, dict)
        owner = cast(dict[str, object], owner_value)
        shared_state = tmp_path / "mutants" / "shared-state"
        prior_report = tmp_path / "mutants" / "mutmut-cicd-stats.json"
        shared_state.parent.mkdir()
        shared_state.write_text("owned by first run\n", encoding="utf-8")
        prior_report.write_text("owned by first run\n", encoding="utf-8")

        second_full = run_transaction(tmp_path, "full")
        full_state = (shared_state.is_file(), prior_report.is_file())
        second_incremental = run_transaction(tmp_path, "incremental")
        incremental_state = (shared_state.is_file(), prior_report.is_file())
        command_log_while_locked = (tmp_path / "command.log").read_text(encoding="utf-8")
    finally:
        first_status, stdout, stderr = complete_process(first, tmp_path / "release")

    assert {
        "command_log_after_release": (tmp_path / "command.log").read_text(encoding="utf-8"),
        "command_log_while_locked": command_log_while_locked,
        "first_status": first_status,
        "full_diagnostic": contains_all(
            second_full.stderr,
            ("pid=", "mode=full", "check for live mutmut"),
        ),
        "full_state": full_state,
        "full_status": second_full.returncode,
        "incremental_state": incremental_state,
        "incremental_status": second_incremental.returncode,
        "lock_released": not (tmp_path / ".mutmut-run.lock").exists(),
        "old_state_removed": old_state_removed,
        "owner_mode": owner["mode"],
        "owner_pid": owner["pid"],
    } == {
        "command_log_after_release": "run\nexport-cicd-stats\n",
        "command_log_while_locked": "run\n",
        "first_status": 0,
        "full_diagnostic": True,
        "full_state": (True, True),
        "full_status": 2,
        "incremental_state": (True, True),
        "incremental_status": 2,
        "lock_released": True,
        "old_state_removed": True,
        "owner_mode": "full",
        "owner_pid": first.pid,
    }, f"{stdout}\n{stderr}"


def test_term_stops_the_child_and_releases_the_lock(tmp_path: Path) -> None:
    """A soft termination owns child shutdown and normal lock cleanup."""
    (tmp_path / ".mutmut-floor").write_text("100\n", encoding="utf-8")
    (tmp_path / "block").touch()
    process = start_transaction(tmp_path, "full")
    status = -1
    stdout = stderr = ""
    try:
        wait_for(tmp_path / "started")
        process.terminate()
    finally:
        status, stdout, stderr = complete_process(process)

    assert status == 143, f"{stdout}\n{stderr}"
    assert not (tmp_path / ".mutmut-run.lock").exists()
    assert (tmp_path / "command.log").read_text(encoding="utf-8") == "run\n"


def test_term_never_releases_the_lock_while_a_descendant_survives(tmp_path: Path) -> None:
    """A dead group leader cannot hide a TERM-resistant descendant."""
    (tmp_path / ".mutmut-floor").write_text("100\n", encoding="utf-8")
    (tmp_path / "spawn-term-resistant-descendant").touch()
    process = start_transaction(tmp_path, "full")
    descendant_pid = -1
    status = -1
    stdout = stderr = ""
    try:
        wait_for(tmp_path / "descendant-ready")
        descendant_pid = int((tmp_path / "descendant.pid").read_text(encoding="utf-8"))
        process.terminate()
        status, stdout, stderr = complete_process(process)
        sleep(0.1)

        assert status == 143, f"{stdout}\n{stderr}"
        assert not (tmp_path / "lock-released-while-descendant-alive").exists()
        assert not process_exists(descendant_pid)
        assert not (tmp_path / ".mutmut-run.lock").exists()
    finally:
        if process.poll() is None:
            process.kill()
            _ = process.communicate(timeout=10)
        if descendant_pid > 0 and process_exists(descendant_pid):
            os.kill(descendant_pid, signal.SIGKILL)


def test_stale_lock_is_fail_closed_with_actionable_owner_diagnostics(tmp_path: Path) -> None:
    """A hard-kill remnant requires explicit, process-aware recovery."""
    lock = tmp_path / ".mutmut-run.lock"
    lock.mkdir()
    owner = {
        "hostname": "build-host",
        "mode": "incremental",
        "pid": 4242,
        "started_at": "2026-08-20T12:00:00+00:00",
        "token": "stale-token",
    }
    (lock / "owner.json").write_text(f"{json.dumps(owner)}\n", encoding="utf-8")
    shared_state = tmp_path / "mutants" / "shared-state"
    shared_state.parent.mkdir()
    shared_state.write_text("must remain\n", encoding="utf-8")

    result = run_transaction(tmp_path, "full")

    assert {
        "command_started": (tmp_path / "command.log").exists(),
        "diagnostic": contains_all(
            result.stderr,
            (
                "pid=4242",
                "mode=incremental",
                "host=build-host",
                "check for live mutmut",
                "Only when none remain",
                "remove .mutmut-run.lock/ and retry",
            ),
        ),
        "lock_retained": lock.is_dir(),
        "shared_state_retained": shared_state.is_file(),
        "status": result.returncode,
    } == {
        "command_started": False,
        "diagnostic": True,
        "lock_retained": True,
        "shared_state_retained": True,
        "status": 2,
    }


def test_mutmut_command_failures_propagate_and_release_the_lock(tmp_path: Path) -> None:
    """Each mutmut subprocess status stops the transaction unchanged."""
    for index, (failure_command, failure_code, expected_log) in enumerate(
        (
            ("run", 7, "run\n"),
            ("export-cicd-stats", 9, "run\nexport-cicd-stats\n"),
        )
    ):
        project = tmp_path / str(index)
        project.mkdir()
        (project / ".mutmut-floor").write_text("0\n", encoding="utf-8")
        (project / "failure-command").write_text(failure_command, encoding="utf-8")
        (project / "failure-code").write_text(str(failure_code), encoding="utf-8")
        cache = project / "mutants" / "cached-result"
        cache.parent.mkdir()
        cache.write_text("preserved\n", encoding="utf-8")
        (project / "mutants" / "mutmut-cicd-stats.json").write_text(
            "stale export\n", encoding="utf-8"
        )

        result = run_transaction(project, "incremental")

        assert result.returncode == failure_code
        assert cache.is_file()
        assert not (project / "mutants" / "mutmut-cicd-stats.json").exists()
        assert (project / "command.log").read_text(encoding="utf-8") == expected_log
        assert not (project / ".mutmut-run.lock").exists()


def test_checker_failure_propagates_after_export_and_releases_the_lock(tmp_path: Path) -> None:
    """The final isolated checker remains inside the locked transaction."""
    result = run_transaction(tmp_path, "incremental")

    assert result.returncode == 1
    assert "No mutation floor" in result.stderr
    assert (tmp_path / "command.log").read_text(encoding="utf-8") == ("run\nexport-cicd-stats\n")
    assert not (tmp_path / ".mutmut-run.lock").exists()
