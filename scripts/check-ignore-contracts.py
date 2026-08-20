#!/usr/bin/env python3
"""Check repository ignore rules with Git's actual matcher."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def isolated_git_environment() -> dict[str, str]:
    """Keep user-level ignore configuration out of repository contracts."""
    environment = os.environ.copy()
    environment["GIT_CONFIG_GLOBAL"] = os.devnull
    environment["GIT_CONFIG_NOSYSTEM"] = "1"
    return environment


def check_mutation_ignore_scope() -> list[str]:
    """Prove mutmut output is ignored without hiding nested source trees."""
    errors: list[str] = []
    candidates = (
        "mutants/mutmut-cicd-stats.json",
        "src/project_name/mutants/model.py",
        "tests/mutants/case.py",
        "packages/api/src/mutants/index.ts",
    )
    expected = {candidates[0]}

    for ignore_path in (
        ROOT / ".gitignore",
        ROOT / "shared" / ".gitignore",
        ROOT / "testers" / "python" / ".gitignore",
    ):
        try:
            with tempfile.TemporaryDirectory(prefix="standards-ignore-") as temporary:
                temporary_root = Path(temporary)
                subprocess.run(
                    ["git", "init", "--quiet", str(temporary_root)],
                    check=True,
                    capture_output=True,
                    env=isolated_git_environment(),
                    text=True,
                )
                shutil.copyfile(ignore_path, temporary_root / ".gitignore")
                result = subprocess.run(
                    ["git", "check-ignore", "--no-index", "--stdin"],
                    cwd=temporary_root,
                    input="\n".join(candidates) + "\n",
                    capture_output=True,
                    check=False,
                    env=isolated_git_environment(),
                    text=True,
                )
                if result.returncode not in (0, 1):
                    errors.append(
                        f"could not exercise {ignore_path.relative_to(ROOT)}: "
                        f"{result.stderr.strip()}"
                    )
                    continue
                ignored = set(result.stdout.splitlines())
                if ignored != expected:
                    errors.append(
                        f"{ignore_path.relative_to(ROOT)} must ignore only the root "
                        f"mutation report path; got {sorted(ignored)!r}"
                    )
        except (OSError, subprocess.SubprocessError) as error:
            errors.append(
                f"could not exercise {ignore_path.relative_to(ROOT)}: {error}"
            )

    return errors


def main() -> int:
    errors = check_mutation_ignore_scope()
    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
