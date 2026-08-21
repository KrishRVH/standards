"""Run one mutually exclusive mutmut transaction for this project."""

from __future__ import annotations

import argparse
import json
import os
import shlex
import shutil
import signal
import socket
import subprocess
import sys
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from time import sleep
from types import FrameType
from typing import Literal, cast
from uuid import uuid4

Mode = Literal["full", "incremental"]
SignalHandler = int | Callable[[int, FrameType | None], object]
LOCK = Path(".mutmut-run.lock")
OWNER = LOCK / "owner.json"
MUTANTS = Path("mutants")
REPORT = MUTANTS / "mutmut-cicd-stats.json"
STOP_POLL_INTERVAL_SECONDS = 0.05
STOP_POLL_ATTEMPTS = 100


class _Arguments(argparse.Namespace):
    def __init__(self) -> None:
        super().__init__()
        self.mode: Mode = "full"
        self.mutmut_command: list[str] = ["mutmut"]


class _LockError(Exception):
    pass


def _owner_summary() -> str:
    try:
        parsed = cast(object, json.loads(OWNER.read_text(encoding="utf-8")))
    except OSError, UnicodeError, json.JSONDecodeError:
        return "owner metadata is unavailable"
    if not isinstance(parsed, dict):
        return "owner metadata is malformed"
    owner = cast(dict[str, object], parsed)

    def field(name: str) -> str:
        value = owner.get(name)
        return str(value) if isinstance(value, (int, str)) else "unknown"

    return (
        f"pid={field('pid')}, mode={field('mode')}, host={field('hostname')}, "
        f"started={field('started_at')}"
    )


class _ProjectLock:
    def __init__(self, mode: Mode) -> None:
        self.mode: Mode = mode
        self.token: str = uuid4().hex
        self.owned: bool = False

    def acquire(self) -> None:
        try:
            LOCK.mkdir(mode=0o700)
        except FileExistsError as error:
            raise _LockError(
                f"Another Python mutation transaction holds {LOCK}/ ({_owner_summary()}).\n"
                + "Before treating it as stale, check for live mutmut, mutation subprocess "
                + "descendants, or run-mutation-transaction.py processes. Only when none "
                + "remain, remove "
                + f"{LOCK}/ and retry. A hard-killed run deliberately leaves this "
                + "fail-closed lock."
            ) from error
        except OSError as error:
            raise _LockError(f"Cannot create mutation lock {LOCK}/: {error}") from error

        metadata = {
            "hostname": socket.gethostname(),
            "mode": self.mode,
            "pid": os.getpid(),
            "started_at": datetime.now(  # noqa: TID251 -- this CLI boundary records lock ownership
                UTC
            ).isoformat(),
            "token": self.token,
        }
        try:
            OWNER.write_text(f"{json.dumps(metadata, sort_keys=True)}\n", encoding="utf-8")
            OWNER.chmod(0o600)
        except (OSError, UnicodeError) as error:
            try:
                LOCK.rmdir()
            except OSError:
                pass
            raise _LockError(f"Cannot write mutation lock metadata {OWNER}: {error}") from error
        self.owned = True

    def release(self) -> None:
        if not self.owned:
            return
        try:
            parsed = cast(object, json.loads(OWNER.read_text(encoding="utf-8")))
            token = (
                cast(dict[str, object], parsed).get("token") if isinstance(parsed, dict) else None
            )
            if token != self.token:
                raise _LockError(
                    f"Refusing to remove mutation lock {LOCK}/ because its ownership changed."
                )
            OWNER.unlink()
            LOCK.rmdir()
        except (OSError, UnicodeError, json.JSONDecodeError) as error:
            raise _LockError(f"Cannot release mutation lock {LOCK}/ safely: {error}") from error
        finally:
            self.owned = False


class _Transaction:
    def __init__(self) -> None:
        self.active: subprocess.Popen[bytes] | None = None
        self.active_group: int | None = None
        self.handlers: dict[signal.Signals, SignalHandler] = {}
        self.received_signal: int | None = None

    def install_signal_handlers(self) -> None:
        for signum in (signal.SIGINT, signal.SIGTERM):
            previous = signal.signal(signum, self._handle_signal)
            self.handlers[signum] = signal.SIG_DFL if previous is None else previous

    def restore_signal_handlers(self) -> None:
        for signum, handler in self.handlers.items():
            signal.signal(signum, handler)
        self.handlers.clear()

    def _handle_signal(self, signum: int, _frame: FrameType | None) -> None:
        if self.received_signal is None:
            self.received_signal = signum
        self._signal_active(signum)

    def was_signaled(self) -> bool:
        """Return whether the runner received a handled soft signal."""
        return self.received_signal is not None

    def _signal_active(self, signum: int) -> None:
        process_group = self.active_group
        if process_group is None:
            return
        try:
            os.killpg(process_group, signum)
        except ProcessLookupError:
            pass
        except OSError as error:
            raise _LockError(
                f"Cannot signal mutation process group {process_group}: {error}"
            ) from error

    @staticmethod
    def _group_exists(process_group: int) -> bool:
        """Return whether the owned process group still has a member."""
        try:
            os.killpg(process_group, 0)
        except ProcessLookupError:
            return False
        except PermissionError:
            return True
        except OSError as error:
            raise _LockError(
                f"Cannot inspect mutation process group {process_group}: {error}"
            ) from error
        return True

    def _clear_active(self) -> None:
        self.active = None
        self.active_group = None

    def _wait_for_group_exit(self, attempts: int) -> bool:
        """Reap the leader and wait a bounded interval for the whole group."""
        for attempt in range(attempts + 1):
            process = self.active
            if process is not None:
                _ = process.poll()
            process_group = self.active_group
            if process_group is None or not self._group_exists(process_group):
                self._clear_active()
                return True
            if attempt < attempts:
                sleep(STOP_POLL_INTERVAL_SECONDS)
        return False

    def run(self, command: list[str]) -> int:
        print(f"+ {shlex.join(command)}", flush=True)
        process = subprocess.Popen(  # noqa: S603 -- the transaction owns the configured tool command
            command,
            start_new_session=True,
        )
        self.active = process
        self.active_group = process.pid
        if self.received_signal is not None:
            self._signal_active(self.received_signal)
        group_exited = False
        try:
            while True:
                try:
                    result = process.wait(timeout=0.2)
                    break
                except subprocess.TimeoutExpired:
                    if self.received_signal is not None:
                        self.stop_active(self.received_signal)
                        return 128 + self.received_signal
        finally:
            group_exited = self._wait_for_group_exit(1)
        if not group_exited and self.received_signal is None:
            raise _LockError(
                f"Mutation command {shlex.join(command)} exited while descendants remained "
                + f"in process group {process.pid}."
            )
        return result if result >= 0 else 128 - result

    def stop_active(self, signum: int) -> None:
        process_group = self.active_group
        if process_group is None:
            self._clear_active()
            return
        self._signal_active(signum)
        if self._wait_for_group_exit(STOP_POLL_ATTEMPTS):
            return
        self._signal_active(signal.SIGKILL)
        if self._wait_for_group_exit(STOP_POLL_ATTEMPTS):
            return
        raise _LockError(
            f"Mutation process group {process_group} survived SIGKILL; retaining {LOCK}/ "
            + "because descendant shutdown could not be confirmed."
        )


def _prepare(mode: Mode) -> None:
    if MUTANTS.is_symlink():
        raise _LockError(f"Refusing to modify symlinked mutation state {MUTANTS}.")
    if mode == "full":
        if MUTANTS.exists():
            shutil.rmtree(MUTANTS)
        return
    REPORT.unlink(missing_ok=True)


def _commands(mutmut_command: list[str]) -> tuple[list[str], ...]:
    checker = Path(__file__).with_name("check-mutation-score.py")
    return (
        [*mutmut_command, "run"],
        [*mutmut_command, "export-cicd-stats"],
        [sys.executable, "-I", str(checker)],
    )


def main() -> int:
    """Run the selected mutation transaction and propagate its result."""
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("full", "incremental"))
    default_mutmut_command: list[str] = ["mutmut"]
    parser.add_argument("--mutmut-command", nargs="+", default=default_mutmut_command)
    arguments = parser.parse_args(namespace=_Arguments())

    transaction = _Transaction()
    lock = _ProjectLock(arguments.mode)
    transaction.install_signal_handlers()
    try:
        lock.acquire()
    except _LockError as error:
        print(error, file=sys.stderr)
        transaction.restore_signal_handlers()
        return 2

    exit_code = 1
    try:
        if not transaction.was_signaled():
            _prepare(arguments.mode)
            exit_code = 0
            for command in _commands(arguments.mutmut_command):
                if transaction.was_signaled():
                    break
                exit_code = transaction.run(command)
                if exit_code != 0:
                    break
    except (OSError, _LockError) as error:
        print(f"Mutation transaction failed: {error}", file=sys.stderr)
        exit_code = 1
    finally:
        try:
            transaction.stop_active(signal.SIGTERM)
        except _LockError as error:
            print(f"Mutation transaction failed: {error}", file=sys.stderr)
            exit_code = 1
        else:
            try:
                lock.release()
            except _LockError as error:
                print(error, file=sys.stderr)
                exit_code = 1
        transaction.restore_signal_handlers()
    if transaction.received_signal is not None:
        return 128 + transaction.received_signal
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
