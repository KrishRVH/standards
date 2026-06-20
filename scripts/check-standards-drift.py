#!/usr/bin/env python3
"""Check standards profile fixtures against the copyable templates."""

from __future__ import annotations

import argparse
import filecmp
import sys
from pathlib import Path

try:
    import tomllib
except ModuleNotFoundError:
    print("Python 3.11+ is required for tomllib. Run this through mise.", file=sys.stderr)
    raise SystemExit(2) from None


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "standards.manifest.toml"
PROFILE_KEYS = {"name", "template", "tester", "task_prefix", "task_fragment", "mirror"}
REQUIRED_TASK_SUFFIXES = ("fmt", "fmt:check", "lint", "test", "check", "ci")
AGGREGATE_TASKS = {
    "fmt": "fmt",
    "fmt:check": "fmt:check",
    "lint": "lint",
    "test": "test",
    "check": "check:local",
    "ci": "ci:local",
}


def load_profiles() -> dict[str, dict[str, object]]:
    try:
        with MANIFEST.open("rb") as manifest:
            data = tomllib.load(manifest)
    except tomllib.TOMLDecodeError as error:
        raise SystemExit(f"invalid TOML in {rel(MANIFEST)}: {error}") from None

    profiles = data.get("profiles", {})
    if not isinstance(profiles, dict):
        raise SystemExit("standards.manifest.toml must contain a [profiles] table")
    return profiles


def load_toml(path: Path) -> dict[str, object]:
    with path.open("rb") as file:
        return tomllib.load(file)


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT))


def same_file(left: Path, right: Path) -> bool:
    return left.is_file() and right.is_file() and filecmp.cmp(left, right, shallow=False)


def compare_file(profile_id: str, label: str, left: Path, right: Path) -> list[str]:
    if not left.is_file():
        return [f"{profile_id}: missing canonical {label}: {rel(left)}"]
    if not right.is_file():
        return [f"{profile_id}: missing fixture {label}: {rel(right)}"]
    if not filecmp.cmp(left, right, shallow=False):
        return [f"{profile_id}: {label} drift: {rel(left)} != {rel(right)}"]
    return []


def is_relative_path(value: str) -> bool:
    path = Path(value)
    return bool(value) and not path.is_absolute() and ".." not in path.parts and "." not in path.parts


def validate_profiles(profiles: dict[str, dict[str, object]]) -> list[str]:
    errors: list[str] = []
    if not profiles:
        return ["standards.manifest.toml must define at least one profile"]

    seen: dict[str, dict[str, str]] = {
        "tester": {},
        "template": {},
        "task_prefix": {},
        "task_fragment": {},
    }

    for profile_id, profile in profiles.items():
        if not isinstance(profile, dict):
            errors.append(f"{profile_id}: profile entry must be a table")
            continue

        unknown = set(profile) - PROFILE_KEYS
        missing = PROFILE_KEYS - set(profile)
        if unknown:
            errors.append(f"{profile_id}: unknown keys: {', '.join(sorted(unknown))}")
        if missing:
            errors.append(f"{profile_id}: missing keys: {', '.join(sorted(missing))}")
            continue

        for key in ("name", "template", "tester", "task_prefix", "task_fragment"):
            value = profile[key]
            if not isinstance(value, str) or not value:
                errors.append(f"{profile_id}: {key} must be a non-empty string")
                continue
            if key in {"template", "tester", "task_fragment"} and not is_relative_path(value):
                errors.append(f"{profile_id}: {key} must be a normalized relative path")
            if key in seen:
                previous = seen[key].get(value)
                if previous is not None:
                    errors.append(f"{profile_id}: {key} duplicates {previous}: {value}")
                seen[key][value] = profile_id

        mirror = profile["mirror"]
        if not isinstance(mirror, list):
            errors.append(f"{profile_id}: mirror must be a list")
            continue
        for item in mirror:
            if not isinstance(item, str) or not is_relative_path(item):
                errors.append(f"{profile_id}: mirror entries must be normalized relative paths: {item!r}")

    return errors


def check_task_surface(profile_id: str, task_fragment: Path, prefix: str) -> list[str]:
    errors: list[str] = []
    if not task_fragment.is_file():
        return [f"{profile_id}: missing task fragment {rel(task_fragment)}"]

    try:
        data = load_toml(task_fragment)
    except tomllib.TOMLDecodeError as error:
        return [f"{profile_id}: invalid TOML in {rel(task_fragment)}: {error}"]

    tasks = data.get("tasks", {})
    if not isinstance(tasks, dict):
        return [f"{profile_id}: {rel(task_fragment)} must contain a [tasks] table"]

    for suffix in REQUIRED_TASK_SUFFIXES:
        task_name = f"{prefix}:{suffix}"
        if task_name not in tasks:
            errors.append(f"{profile_id}: {rel(task_fragment)} missing task {task_name}")
    return errors


def check_aggregate_dispatch(profiles: dict[str, dict[str, object]]) -> list[str]:
    errors: list[str] = []
    config = ROOT / "Mise" / "config.toml"
    try:
        data = load_toml(config)
    except tomllib.TOMLDecodeError as error:
        return [f"invalid TOML in {rel(config)}: {error}"]

    tasks = data.get("tasks", {})
    if not isinstance(tasks, dict):
        return [f"{rel(config)} must contain a [tasks] table"]

    for profile_id, profile in profiles.items():
        prefix = str(profile["task_prefix"])
        for suffix, aggregate_task in AGGREGATE_TASKS.items():
            command = f"mise run {prefix}:{suffix}"
            task = tasks.get(aggregate_task)
            if not isinstance(task, dict):
                errors.append(f"{profile_id}: {rel(config)} missing aggregate task {aggregate_task}")
                continue
            run = task.get("run")
            if not isinstance(run, str) or command not in run:
                errors.append(f"{profile_id}: {rel(config)} task {aggregate_task} does not dispatch {command}")
    return errors


def check_fixture_config(profile_id: str, tester: Path, prefix: str) -> list[str]:
    errors: list[str] = []
    fixture_config = tester / ".config" / "mise" / "config.toml"
    canonical_config = ROOT / "Mise" / "config.toml"

    if not fixture_config.is_file():
        return [f"{profile_id}: missing fixture config {rel(fixture_config)}"]

    full_config = same_file(canonical_config, fixture_config)
    if not full_config:
        try:
            data = load_toml(fixture_config)
        except tomllib.TOMLDecodeError as error:
            return [f"{profile_id}: invalid TOML in {rel(fixture_config)}: {error}"]

        tasks = data.get("tasks", {})
        if not isinstance(tasks, dict):
            return [f"{profile_id}: minimal fixture config must contain [tasks]"]

        check = tasks.get("check", {})
        check_local = tasks.get("check:local", {})
        if not isinstance(check, dict) or check.get("depends") != ["check:local"]:
            errors.append(f"{profile_id}: minimal fixture config check must depend on check:local")
        if not isinstance(check_local, dict) or check_local.get("depends") != [f"{prefix}:check"]:
            errors.append(f"{profile_id}: minimal fixture config check:local must depend on {prefix}:check")

    dagger_fragment = tester / ".config" / "mise" / "conf.d" / "10-dagger.toml"
    canonical_dagger = ROOT / "Mise" / "conf.d" / "10-dagger.toml"
    if dagger_fragment.exists():
        errors.extend(compare_file(profile_id, "Dagger fragment", canonical_dagger, dagger_fragment))

    return errors


def check_profiles(profiles: dict[str, dict[str, object]]) -> list[str]:
    errors = validate_profiles(profiles)
    if errors:
        return errors

    errors.extend(check_aggregate_dispatch(profiles))

    for profile_id, profile in profiles.items():
        tester = ROOT / str(profile["tester"])
        template = ROOT / str(profile["template"])
        task_fragment = str(profile["task_fragment"])
        task_prefix = str(profile["task_prefix"])
        task_left = ROOT / "Mise" / "conf.d" / task_fragment
        task_right = tester / ".config" / "mise" / "conf.d" / task_fragment

        has_template = template.is_dir()
        has_tester = tester.is_dir()

        if not has_template:
            errors.append(f"{profile_id}: missing template directory {rel(template)}")
        if not has_tester:
            errors.append(f"{profile_id}: missing tester directory {rel(tester)}")

        errors.extend(compare_file(profile_id, "task fragment", task_left, task_right))
        if task_left.is_file():
            errors.extend(check_task_surface(profile_id, task_left, task_prefix))
        if has_tester:
            errors.extend(check_fixture_config(profile_id, tester, task_prefix))

        mirror = profile.get("mirror", [])
        if has_template and has_tester:
            for item in mirror:
                left = template / str(item)
                right = tester / str(item)
                errors.extend(compare_file(profile_id, "mirror", left, right))

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--list-testers", action="store_true", help="print tester paths from the manifest")
    args = parser.parse_args()

    profiles = load_profiles()

    if args.list_testers:
        for profile in profiles.values():
            print(profile["tester"])
        return 0

    errors = check_profiles(profiles)
    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1

    print(f"Checked {len(profiles)} standards profiles.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
