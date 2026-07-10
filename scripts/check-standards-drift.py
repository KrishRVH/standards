#!/usr/bin/env python3
"""Check standards profile fixtures against the copyable templates."""

from __future__ import annotations

import argparse
import filecmp
import os
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    import tomllib
except ModuleNotFoundError:
    print("Python 3.11+ is required for tomllib. Run this through mise.", file=sys.stderr)
    raise SystemExit(2) from None


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "standards.manifest.toml"
REQUIRED_PROFILE_KEYS = {"name", "template", "tester", "task_prefix", "task_fragment", "mirror"}
OPTIONAL_PROFILE_KEYS = {"dagger", "required_tester_files"}
PROFILE_KEYS = REQUIRED_PROFILE_KEYS | OPTIONAL_PROFILE_KEYS
REQUIRED_TASK_SUFFIXES = ("fmt", "fmt:check", "lint", "test", "standards", "standards:check")
AGGREGATE_MARKER_CASES = {
    "c": ("CMakeLists.txt", "src/main.c"),
    "cpp": ("CMakeLists.txt", "src/library.hpp"),
    "csharp": ("src/project.csproj",),
    "elixir": ("mix.exs",),
    "fortran": ("fpm.toml",),
    "go": ("go.mod",),
    "godot": ("project.godot", "src/features/player/state/machine/main.gd"),
    "haskell": ("project.cabal",),
    "kotlin": ("build.gradle.kts",),
    "lua": (".luarc.json",),
    "md": (".markdownlint-cli2.jsonc",),
    "php": ("composer.json",),
    "py": ("pyproject.toml",),
    "rust": ("Cargo.toml",),
    "shell": (".shellcheckrc",),
    "spark": ("alire.toml", "src/project.ads"),
    "ts": ("package.json", "tsconfig.json"),
    "zig": ("build.zig",),
}
DAGGER_MIRROR = ("dagger/package.json", "dagger/tsconfig.json", "dagger/src/index.ts")
FULL_CONFIG_MIRROR = (".gitleaks.toml",)
ROOT_SHARED_MIRROR = (".gitleaks.toml",)


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
        missing = REQUIRED_PROFILE_KEYS - set(profile)
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

        required_tester_files = profile.get("required_tester_files", [])
        if not isinstance(required_tester_files, list):
            errors.append(f"{profile_id}: required_tester_files must be a list")
        else:
            for item in required_tester_files:
                if not isinstance(item, str) or not is_relative_path(item):
                    errors.append(
                        f"{profile_id}: required_tester_files entries must be normalized relative paths: {item!r}"
                    )

        dagger = profile.get("dagger", False)
        if not isinstance(dagger, bool):
            errors.append(f"{profile_id}: dagger must be a boolean")

    return errors


def check_tester_inventory(profiles: dict[str, dict[str, object]]) -> list[str]:
    errors: list[str] = []
    declared: dict[Path, str] = {}

    for profile_id, profile in profiles.items():
        tester = ROOT / str(profile["tester"])
        declared[tester] = profile_id
        fixture_config = tester / ".config" / "mise" / "config.toml"
        if not fixture_config.is_file():
            errors.append(f"{profile_id}: missing fixture config {rel(fixture_config)}")

    actual = {
        config.parents[2]: config
        for config in (ROOT / "testers").glob("*/.config/mise/config.toml")
    }
    for tester, config in sorted(actual.items(), key=lambda item: rel(item[0])):
        if tester not in declared:
            errors.append(f"{rel(tester)}: tester fixture is not declared in standards.manifest.toml")
        elif config != tester / ".config" / "mise" / "config.toml":
            errors.append(f"{rel(config)}: unexpected tester config location")

    return errors


def check_mise_lockfiles(profiles: dict[str, dict[str, object]]) -> list[str]:
    errors: list[str] = []
    root_lock = ROOT / ".config" / "mise" / "mise.lock"
    if not root_lock.is_file():
        errors.append(f"root: missing mise lockfile {rel(root_lock)}")
    for profile_id, profile in profiles.items():
        lockfile = ROOT / str(profile["tester"]) / ".config" / "mise" / "mise.lock"
        if not lockfile.is_file():
            errors.append(f"{profile_id}: missing fixture mise lockfile {rel(lockfile)}")
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

    if data.get("min_version") != "2026.3.11":
        errors.append(f'{rel(config)} must set min_version = "2026.3.11"')

    tasks = data.get("tasks", {})
    if not isinstance(tasks, dict):
        return [f"{rel(config)} must contain a [tasks] table"]

    dispatcher = tasks.get("_dispatch")
    if not isinstance(dispatcher, dict):
        return [f"{rel(config)} missing aggregate dispatcher task _dispatch"]
    script = dispatcher.get("run")
    if not isinstance(script, str):
        return [f"{rel(config)} aggregate dispatcher _dispatch must contain a run script"]
    if dispatcher.get("hide") is not True:
        errors.append(f"{rel(config)} aggregate dispatcher _dispatch must be hidden")
    if dispatcher.get("usage") != 'arg "task"':
        errors.append(f'{rel(config)} aggregate dispatcher _dispatch must declare usage \'arg "task"\'')

    for task_name in REQUIRED_TASK_SUFFIXES:
        task = tasks.get(task_name)
        if not isinstance(task, dict):
            errors.append(f"{rel(config)} missing aggregate task {task_name}")
            continue
        expected = [{"task": "_dispatch", "args": [task_name]}]
        if task.get("run") != expected:
            errors.append(f"{rel(config)} aggregate task {task_name} must run {expected!r}")
        expected_depends = ["secrets"] if task_name == "standards:check" else None
        if task.get("depends") != expected_depends:
            errors.append(
                f"{rel(config)} aggregate task {task_name} must set depends to {expected_depends!r}"
            )

    prefixes = {str(profile["task_prefix"]) for profile in profiles.values()}
    marker_prefixes = set(AGGREGATE_MARKER_CASES)
    if prefixes != marker_prefixes:
        missing = prefixes - marker_prefixes
        stale = marker_prefixes - prefixes
        if missing:
            errors.append(f"aggregate marker cases missing task prefixes: {', '.join(sorted(missing))}")
        if stale:
            errors.append(f"aggregate marker cases contain stale task prefixes: {', '.join(sorted(stale))}")

    try:
        with tempfile.TemporaryDirectory(prefix="standards-dispatch-") as temporary:
            temporary_root = Path(temporary)
            bin_dir = temporary_root / "bin"
            bin_dir.mkdir()
            fake_mise = bin_dir / "mise"
            fake_mise.write_text(
                "#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"$MISE_DISPATCH_LOG\"\n",
                encoding="utf-8",
            )
            fake_mise.chmod(0o755)

            def execute(case: str, task_name: str, markers: tuple[str, ...]) -> tuple[list[str], str, int]:
                workspace = temporary_root / case
                workspace.mkdir()
                for marker in markers:
                    path = workspace / marker
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.touch()
                log = workspace / "dispatch.log"
                environment = {
                    "LC_ALL": "C",
                    "MISE_DISPATCH_LOG": str(log),
                    "PATH": f"{bin_dir}{os.pathsep}{os.environ.get('PATH', os.defpath)}",
                    "usage_task": task_name,
                }
                result = subprocess.run(
                    ["sh", "-c", script],
                    cwd=workspace,
                    env=environment,
                    capture_output=True,
                    check=False,
                    text=True,
                    timeout=5,
                )
                commands = log.read_text(encoding="utf-8").splitlines() if log.is_file() else []
                return commands, result.stderr, result.returncode

            for prefix, markers in AGGREGATE_MARKER_CASES.items():
                commands, stderr, returncode = execute(prefix, "fmt", markers)
                expected = [f"run {prefix}:fmt"]
                if returncode != 0:
                    errors.append(f"aggregate marker case {prefix} failed: {stderr.strip()}")
                elif commands != expected:
                    errors.append(
                        f"aggregate marker case {prefix} dispatched {commands!r}; expected {expected!r}"
                    )

            for case, markers in {
                "cmake-without-source": ("CMakeLists.txt",),
                "godot-without-gdscript": ("project.godot",),
                "spark-without-source": ("alire.toml",),
                "typescript-without-config": ("package.json",),
            }.items():
                commands, stderr, returncode = execute(case, "fmt", markers)
                if returncode != 0:
                    errors.append(f"aggregate negative marker case {case} failed: {stderr.strip()}")
                elif commands:
                    errors.append(f"aggregate negative marker case {case} dispatched {commands!r}")

            commands, stderr, returncode = execute(
                "standards-check-secrets", "standards:check", ("composer.json",)
            )
            expected = ["run php:standards:check"]
            if returncode != 0:
                errors.append(f"aggregate standards:check case failed: {stderr.strip()}")
            elif commands != expected:
                errors.append(
                    f"aggregate standards:check dispatched {commands!r}; expected {expected!r}"
                )

            commands, _, returncode = execute("invalid-task", "invalid", ())
            if returncode != 2 or commands:
                errors.append("aggregate dispatcher must reject unsupported task names without dispatching")
    except (OSError, subprocess.SubprocessError) as error:
        errors.append(f"could not exercise aggregate marker routing: {error}")
    return errors


def check_fixture_config(profile_id: str, tester: Path, prefix: str) -> list[str]:
    errors: list[str] = []
    fixture_config = tester / ".config" / "mise" / "config.toml"
    canonical_config = ROOT / "Mise" / "config.toml"

    if not fixture_config.is_file():
        return [f"{profile_id}: missing fixture config {rel(fixture_config)}"]

    full_config = same_file(canonical_config, fixture_config)
    if full_config:
        for item in FULL_CONFIG_MIRROR:
            errors.extend(compare_file(profile_id, "full-config shared file", ROOT / "shared" / item, tester / item))
    else:
        try:
            data = load_toml(fixture_config)
        except tomllib.TOMLDecodeError as error:
            return [f"{profile_id}: invalid TOML in {rel(fixture_config)}: {error}"]

        tasks = data.get("tasks", {})
        if not isinstance(tasks, dict):
            return [f"{profile_id}: minimal fixture config must contain [tasks]"]

        settings = data.get("settings", {})
        if not isinstance(settings, dict) or settings.get("lockfile") is not True:
            errors.append(f"{profile_id}: minimal fixture config must set [settings] lockfile = true")

        expected_min_version = load_toml(canonical_config).get("min_version")
        if data.get("min_version") != expected_min_version:
            errors.append(
                f"{profile_id}: minimal fixture config min_version must match {rel(canonical_config)}"
            )

        if set(tasks) != {"standards", "standards:check"}:
            errors.append(
                f"{profile_id}: minimal fixture config must contain only standards and standards:check tasks"
            )

        standards = tasks.get("standards", {})
        standards_check = tasks.get("standards:check", {})
        if not isinstance(standards, dict) or standards.get("depends") != [f"{prefix}:standards"]:
            errors.append(f"{profile_id}: minimal fixture config standards must depend on {prefix}:standards")
        if not isinstance(standards_check, dict) or standards_check.get("depends") != [
            f"{prefix}:standards:check"
        ]:
            errors.append(
                f"{profile_id}: minimal fixture config standards:check must depend on {prefix}:standards:check"
            )

    dagger_fragment = tester / ".config" / "mise" / "conf.d" / "10-dagger.toml"
    canonical_dagger = ROOT / "Mise" / "conf.d" / "10-dagger.toml"
    if dagger_fragment.exists():
        errors.extend(compare_file(profile_id, "Dagger fragment", canonical_dagger, dagger_fragment))

    return errors


def check_root_mise_config(profiles: dict[str, dict[str, object]]) -> list[str]:
    errors: list[str] = []
    config = ROOT / ".config" / "mise" / "config.toml"
    try:
        data = load_toml(config)
    except tomllib.TOMLDecodeError as error:
        return [f"invalid TOML in {rel(config)}: {error}"]

    if data.get("min_version") != "2026.7.0":
        errors.append(f'{rel(config)} must set min_version = "2026.7.0"')
    if data.get("monorepo_root") is not True:
        errors.append(f"{rel(config)} must set monorepo_root = true")

    settings = data.get("settings", {})
    if not isinstance(settings, dict) or settings.get("jobs") != 2:
        errors.append(f"{rel(config)} [settings] jobs must be 2")
    if not isinstance(settings, dict) or settings.get("lockfile") is not True:
        errors.append(f"{rel(config)} [settings] lockfile must be true")

    monorepo = data.get("monorepo", {})
    if not isinstance(monorepo, dict):
        errors.append(f"{rel(config)} must contain a [monorepo] table")
    else:
        if monorepo.get("config_roots") != ["testers/*"]:
            errors.append(f'{rel(config)} [monorepo] config_roots must be ["testers/*"]')
        if monorepo.get("lockfile") is not False:
            errors.append(f"{rel(config)} [monorepo] lockfile must be false")

    tasks = data.get("tasks", {})
    if not isinstance(tasks, dict):
        errors.append(f"{rel(config)} must contain a [tasks] table")
    else:
        for task_name in ("testers:standards", "testers:standards:check"):
            task = tasks.get(task_name)
            run = task.get("run") if isinstance(task, dict) else None
            if not isinstance(run, str) or "env -u GOROOT -u GOTOOLDIR " not in run:
                errors.append(f"{rel(config)} task {task_name} must sanitize Go's toolchain environment")

        standards = tasks.get("standards")
        expected_standards_run = [
            {"task": "shell:standards"},
            {"task": "testers:standards"},
        ]
        if not isinstance(standards, dict) or standards.get("run") != expected_standards_run:
            errors.append(
                f"{rel(config)} task standards must run {expected_standards_run!r} in order"
            )

    for profile_id, profile in profiles.items():
        tester = Path(str(profile["tester"]))
        if len(tester.parts) != 2 or tester.parts[0] != "testers":
            errors.append(
                f'{profile_id}: tester {tester} is outside the root monorepo config_roots pattern "testers/*"'
            )

    return errors


def check_root_shared_files() -> list[str]:
    errors: list[str] = []
    for item in ROOT_SHARED_MIRROR:
        errors.extend(compare_file("root", "shared file", ROOT / "shared" / item, ROOT / item))
    errors.extend(
        compare_file(
            "root",
            "shell task fragment",
            ROOT / "Mise" / "conf.d" / "20-shell.toml",
            ROOT / ".config" / "mise" / "conf.d" / "20-shell.toml",
        )
    )
    errors.extend(
        compare_file(
            "root",
            "shell standards runner",
            ROOT / "Shell" / "scripts" / "shell-standards.sh",
            ROOT / "scripts" / "shell-standards.sh",
        )
    )
    return errors


def check_dagger_copy(profile_id: str, tester: Path) -> list[str]:
    errors: list[str] = []
    dagger_fragment = tester / ".config" / "mise" / "conf.d" / "10-dagger.toml"
    if not dagger_fragment.is_file():
        errors.append(f"{profile_id}: missing Dagger fragment {rel(dagger_fragment)}")

    errors.extend(compare_file(profile_id, "Dagger metadata", ROOT / "Dagger" / "dagger.json", tester / "dagger.json"))
    for item in DAGGER_MIRROR:
        errors.extend(compare_file(profile_id, "Dagger module", ROOT / "Dagger" / item, tester / item))
    return errors


def check_profiles(profiles: dict[str, dict[str, object]]) -> list[str]:
    errors = validate_profiles(profiles)
    if errors:
        return errors

    errors.extend(check_tester_inventory(profiles))
    errors.extend(check_mise_lockfiles(profiles))
    errors.extend(check_aggregate_dispatch(profiles))
    errors.extend(check_root_mise_config(profiles))
    errors.extend(check_root_shared_files())

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
            if profile.get("dagger", False):
                errors.extend(check_dagger_copy(profile_id, tester))

        mirror = profile.get("mirror", [])
        if has_template and has_tester:
            for item in mirror:
                left = template / str(item)
                right = tester / str(item)
                errors.extend(compare_file(profile_id, "mirror", left, right))
        if has_tester:
            for item in profile.get("required_tester_files", []):
                required = tester / str(item)
                if not required.is_file():
                    errors.append(f"{profile_id}: missing required tester file {rel(required)}")

    return errors


def validate_for_listing(profiles: dict[str, dict[str, object]]) -> list[str]:
    errors = validate_profiles(profiles)
    if errors:
        return errors
    errors.extend(check_tester_inventory(profiles))
    errors.extend(check_mise_lockfiles(profiles))
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--list-testers", action="store_true", help="print tester paths from the manifest")
    args = parser.parse_args()

    profiles = load_profiles()

    if args.list_testers:
        errors = validate_for_listing(profiles)
        if errors:
            for error in errors:
                print(error, file=sys.stderr)
            return 1
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
