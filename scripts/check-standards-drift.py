#!/usr/bin/env python3
"""Check standards profile fixtures against the copyable templates."""

from __future__ import annotations

import filecmp
import os
import re
import shutil
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
    "js": ("package.json", "jsconfig.json"),
    "kotlin": ("build.gradle.kts",),
    "lua": (".luarc.json",),
    "md": (".markdownlint-cli2.jsonc",),
    "odin": ("src/project_name/project_name.odin",),
    "php": ("composer.json",),
    "py": ("pyproject.toml",),
    "roc": ("main.roc",),
    "rust": ("Cargo.toml",),
    "shell": (".shellcheckrc",),
    "spark": ("alire.toml", "src/project.ads"),
    "ts": ("package.json", "tsconfig.json"),
    "zig": ("build.zig",),
}
DAGGER_MIRROR = ("dagger/package.json", "dagger/tsconfig.json", "dagger/src/index.ts")
FULL_CONFIG_MIRROR = (".gitleaks.toml",)
ROOT_SHARED_MIRROR = (".gitleaks.toml",)
AUTOMATIC_PROFILE_IDS = frozenset({"csharp", "python", "rust", "ts"})
AUTOMATIC_PROFILE_PATHS = {
    "csharp": (
        ".github/CODEOWNERS",
        "src/Project/Service.cs",
        "tests/Project.Tests/ServiceTests.cs",
    ),
    "python": (
        ".github/CODEOWNERS",
        "src/project_name/service.py",
        "tests/test_service.py",
    ),
    "rust": (
        ".github/CODEOWNERS",
        "crates/member/src/lib.rs",
        "src/lib.rs",
        "tests/service.rs",
    ),
    "ts": (
        ".github/CODEOWNERS",
        "packages/app/src/index.ts",
        "src/index.ts",
        "tests/service.test.ts",
    ),
}
CHECKOUT_USE = re.compile(
    r"^(?P<indent> *)(?P<list>- )?uses: "
    r"actions/checkout@[^\s#]+(?:\s+#.*)?$"
)
PERSIST_CREDENTIALS_FALSE = re.compile(
    r'''^persist-credentials:\s*(?:false|'false'|"false")(?:\s+#.*)?$'''
)
ACTION_USE = re.compile(
    r"^(?P<indent> *)(?P<list>- )?uses:\s+(?P<target>\S+)(?:\s+#.*)?$"
)
BLOCK_SCALAR_INDICATOR = re.compile(
    r"^(?:(?:&[^\s#]+|![^\s#]+)\s+)*"
    r"[|>](?:[1-9][+-]?|[+-][1-9]?)?\s*(?:#.*)?$"
)
DOCKER_NAME_COMPONENT = re.compile(r"^[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*$")
DOCKER_TAG = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$")
IMMUTABLE_DOCKER_ACTION = re.compile(
    r"^docker://(?P<image>.+)@sha256:(?P<digest>[0-9a-f]{64})$"
)
FULL_COMMIT_SHA = re.compile(r"^[0-9a-f]{40}$")


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
    return (
        bool(path.parts)
        and value == path.as_posix()
        and not path.is_absolute()
        and ".." not in path.parts
        and "." not in path.parts
    )


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

    if data.get("min_version") != "2026.6.12":
        errors.append(f'{rel(config)} must set min_version = "2026.6.12"')

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
                "package-without-js-or-ts-config": ("package.json",),
                "spark-without-source": ("alire.toml",),
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
            {"task": "md:standards"},
            {"task": "shell:standards"},
            {"task": "testers:standards"},
        ]
        if not isinstance(standards, dict) or standards.get("run") != expected_standards_run:
            errors.append(
                f"{rel(config)} task standards must run {expected_standards_run!r} in order"
            )

        standards_check = tasks.get("standards:check")
        expected_standards_check_depends = [
            "secrets",
            "standards:biome:check",
            "standards:drift",
            "md:standards:check",
            "shell:standards:check",
            "testers:standards:check",
        ]
        if (
            not isinstance(standards_check, dict)
            or standards_check.get("depends") != expected_standards_check_depends
        ):
            errors.append(
                f"{rel(config)} task standards:check must depend on "
                f"{expected_standards_check_depends!r} in order"
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
            "Markdown task fragment",
            ROOT / "Mise" / "conf.d" / "20-markdown.toml",
            ROOT / ".config" / "mise" / "conf.d" / "20-markdown.toml",
        )
    )
    for file in ("check-mdx.mjs", "check-mdx.test.mjs"):
        errors.extend(
            compare_file(
                "root",
                "Markdown checker",
                ROOT / "Markdown" / "scripts" / file,
                ROOT / "scripts" / file,
            )
        )
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
                        f"could not exercise {rel(ignore_path)}: {result.stderr.strip()}"
                    )
                    continue
                ignored = set(result.stdout.splitlines())
                if ignored != expected:
                    errors.append(
                        f"{rel(ignore_path)} must ignore only the root mutation report path; "
                        f"got {sorted(ignored)!r}"
                    )
        except (OSError, subprocess.SubprocessError) as error:
            errors.append(f"could not exercise {rel(ignore_path)}: {error}")

    return errors


def mapping_child_keys(document: str, parent: str) -> list[str] | None:
    """Read keys exactly one indentation level below a top-level YAML map."""
    lines = document.splitlines()
    parent_pattern = re.compile(rf"^{re.escape(parent)}:\s*(?:#.*)?$")
    parent_lines = [index for index, line in enumerate(lines) if parent_pattern.fullmatch(line)]
    if len(parent_lines) != 1:
        return None

    keys: list[str] = []
    child_indent: int | None = None
    key_pattern = re.compile(r"^([A-Za-z_][A-Za-z0-9_-]*):(?:\s*(?:#.*)?)?$")
    for line in lines[parent_lines[0] + 1 :]:
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if not line.startswith(" "):
            break
        indent = len(line) - len(line.lstrip(" "))
        child_indent = indent if child_indent is None else child_indent
        if indent == child_indent and (match := key_pattern.fullmatch(line[indent:])):
            keys.append(match.group(1))
    return keys


def checkout_step_bounds(lines: list[str], use_index: int, key_indent: int) -> tuple[int, int] | None:
    """Find the list item containing a workflow step key."""
    step_start: int | None = None
    step_indent: int | None = None
    for index in range(use_index, -1, -1):
        line = lines[index]
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        indent = len(line) - len(line.lstrip(" "))
        if "\t" in line[: len(line) - len(line.lstrip())]:
            return None
        if line.lstrip().startswith("- ") and indent < key_indent:
            step_start = index
            step_indent = indent
            break

    if step_start is None or step_indent is None:
        return None

    step_end = len(lines)
    for index in range(step_start + 1, len(lines)):
        line = lines[index]
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        indent = len(line) - len(line.lstrip(" "))
        if indent < step_indent or (indent == step_indent and line.lstrip().startswith("- ")):
            step_end = index
            break
    return step_start, step_end


def checkout_hardening(document: str) -> tuple[int, int]:
    """Count checkout steps and those with an effective false credentials input."""
    lines = document.splitlines()
    checkout_count = 0
    hardened_count = 0

    for use_index, line in enumerate(lines):
        match = CHECKOUT_USE.fullmatch(line)
        if match is None:
            continue

        checkout_count += 1
        leading_indent = len(match.group("indent"))
        key_indent = leading_indent + (2 if match.group("list") else 0)
        if match.group("list"):
            step_bounds = (use_index, len(lines))
            for index in range(use_index + 1, len(lines)):
                candidate = lines[index]
                if not candidate.strip() or candidate.lstrip().startswith("#"):
                    continue
                indent = len(candidate) - len(candidate.lstrip(" "))
                if indent < leading_indent or (
                    indent == leading_indent and candidate.lstrip().startswith("- ")
                ):
                    step_bounds = (use_index, index)
                    break
        else:
            step_bounds = checkout_step_bounds(lines, use_index, key_indent)
        if step_bounds is None:
            continue

        step_start, step_end = step_bounds
        with_lines = [
            index
            for index in range(step_start, step_end)
            if lines[index].startswith(" " * key_indent)
            and not lines[index].startswith(" " * (key_indent + 1))
            and re.fullmatch(r"with:\s*(?:#.*)?", lines[index][key_indent:])
        ]
        if len(with_lines) != 1:
            continue

        with_index = with_lines[0]
        sibling_end = step_end
        for index in range(with_index + 1, step_end):
            candidate = lines[index]
            if not candidate.strip() or candidate.lstrip().startswith("#"):
                continue
            indent = len(candidate) - len(candidate.lstrip(" "))
            if indent <= key_indent:
                sibling_end = index
                break

        credential_lines = [
            candidate.strip()
            for candidate in lines[with_index + 1 : sibling_end]
            if len(candidate) - len(candidate.lstrip(" ")) == key_indent + 2
            and candidate.strip().startswith("persist-credentials:")
        ]
        if len(credential_lines) == 1 and PERSIST_CREDENTIALS_FALSE.fullmatch(credential_lines[0]):
            hardened_count += 1

    return checkout_count, hardened_count


def parse_mapping_key(text: str, start: int = 0) -> tuple[str, bool, int] | None:
    """Parse one simple YAML mapping key at start and return its colon offset."""
    index = start
    while index < len(text) and text[index].isspace():
        index += 1
    if index >= len(text):
        return None

    quote = text[index]
    if quote == '"':
        index += 1
        characters: list[str] = []
        escaped = False
        while index < len(text):
            character = text[index]
            if character == "\\":
                escaped = True
                if index + 1 >= len(text):
                    return None
                characters.extend((character, text[index + 1]))
                index += 2
                continue
            if character == '"':
                index += 1
                break
            characters.append(character)
            index += 1
        else:
            return None
        key = "".join(characters)
    elif quote == "'":
        index += 1
        characters = []
        escaped = False
        while index < len(text):
            character = text[index]
            if character != "'":
                characters.append(character)
                index += 1
                continue
            if index + 1 < len(text) and text[index + 1] == "'":
                characters.append("'")
                index += 2
                continue
            index += 1
            break
        else:
            return None
        key = "".join(characters)
    else:
        colon = text.find(":", index)
        if colon == -1:
            return None
        key = text[index:colon].strip()
        if not key or any(character in key for character in "{}[],#\"'"):
            return None
        return key, False, colon + 1

    while index < len(text) and text[index].isspace():
        index += 1
    if index >= len(text) or text[index] != ":":
        return None
    return key, escaped, index + 1


def flow_mapping_keys(text: str) -> list[tuple[str, bool]]:
    """Return mapping keys that occur at structural positions in a flow value."""
    keys: list[tuple[str, bool]] = []
    quote: str | None = None
    index = 0
    while index < len(text):
        character = text[index]
        if quote == '"':
            if character == "\\":
                index += 2
                continue
            if character == '"':
                quote = None
            index += 1
            continue
        if quote == "'":
            if character == "'" and index + 1 < len(text) and text[index + 1] == "'":
                index += 2
                continue
            if character == "'":
                quote = None
            index += 1
            continue
        if character in ('"', "'"):
            quote = character
            index += 1
            continue
        if character == "#" and (index == 0 or text[index - 1].isspace()):
            break
        if character in "{,":
            parsed = parse_mapping_key(text, index + 1)
            if parsed is not None:
                key, escaped, _ = parsed
                keys.append((key, escaped))
        index += 1
    return keys


def workflow_mapping_keys(line: str) -> list[tuple[str, bool]]:
    """Return actual block and flow mapping keys from one structural YAML line."""
    body = line.lstrip(" ")
    if body.startswith("- "):
        body = body[2:].lstrip()
    if body.startswith(("{", "[", ",")):
        return flow_mapping_keys(body)

    parsed = parse_mapping_key(body)
    if parsed is None:
        return []
    key, escaped, value_start = parsed
    keys = [(key, escaped)]
    value = body[value_start:].lstrip()
    if value.startswith(("{", "[")):
        keys.extend(flow_mapping_keys(value))
    return keys


def block_scalar_parent_indent(line: str) -> int | None:
    """Return the structural indent above a YAML block scalar's contents."""
    leading_indent = len(line) - len(line.lstrip(" "))
    body = line[leading_indent:]
    if body.startswith("- "):
        sequence_value = body[2:].lstrip()
        if BLOCK_SCALAR_INDICATOR.fullmatch(sequence_value):
            return leading_indent
        body = sequence_value
        leading_indent += 2

    parsed = parse_mapping_key(body)
    if parsed is None:
        return None
    _, _, value_start = parsed
    if BLOCK_SCALAR_INDICATOR.fullmatch(body[value_start:].lstrip()):
        return leading_indent
    return None


def workflow_structure_lines(document: str) -> list[str]:
    """Exclude YAML block-scalar payloads from workflow structure scans."""
    lines: list[str] = []
    scalar_parent_indent: int | None = None
    for line in document.splitlines():
        if scalar_parent_indent is not None:
            if not line.strip():
                continue
            indent = len(line) - len(line.lstrip(" "))
            if indent > scalar_parent_indent:
                continue
            scalar_parent_indent = None

        lines.append(line)
        scalar_parent_indent = block_scalar_parent_indent(line)
    return lines


def is_normalized_local_reference(target: str) -> bool:
    """Return whether target is a normalized workspace or running-commit path."""
    if target.startswith("$/") or target.startswith("./"):
        repository_path = target[2:]
    else:
        return False
    return (
        bool(repository_path)
        and "@" not in repository_path
        and "\\" not in repository_path
        and not any(character.isspace() for character in repository_path)
        and all(segment not in ("", ".", "..") for segment in repository_path.split("/"))
    )


def is_normalized_docker_image(image: str) -> bool:
    """Return whether image is a conservative normalized Docker repository name."""
    segments = image.split("/")
    if any(segment in ("", ".", "..") for segment in segments):
        return False

    last = segments[-1]
    if ":" in last:
        if last.count(":") != 1:
            return False
        repository, tag = last.split(":")
        if DOCKER_TAG.fullmatch(tag) is None:
            return False
        segments[-1] = repository

    first = segments[0]
    if ":" in first:
        if len(segments) == 1 or first.count(":") != 1:
            return False
        first, port = first.split(":")
        if not port.isascii() or not port.isdecimal():
            return False
        segments[0] = first
    return all(
        DOCKER_NAME_COMPONENT.fullmatch(segment) is not None for segment in segments
    )


def is_immutable_docker_action(target: str) -> bool:
    """Return whether target pins a normalized Docker image by SHA-256 digest."""
    match = IMMUTABLE_DOCKER_ACTION.fullmatch(target)
    return match is not None and is_normalized_docker_image(match.group("image"))


def external_action_pin_errors(document: str, description: str) -> list[str]:
    """Require immutable references for every non-local workflow action."""
    errors: list[str] = []
    for line in workflow_structure_lines(document):
        stripped = line.lstrip()
        if stripped.startswith("#"):
            continue
        mapping_keys = workflow_mapping_keys(line)
        if any(escaped for _, escaped in mapping_keys):
            errors.append(f"{description} contains an escaped workflow mapping key")
            continue
        if not any(key == "uses" for key, _ in mapping_keys):
            continue

        match = ACTION_USE.fullmatch(line)
        if match is None:
            errors.append(f"{description} contains a non-canonical uses entry")
            continue
        target = match.group("target")
        if target.startswith("docker://"):
            if is_immutable_docker_action(target):
                continue
            errors.append(
                f"every external action in {description} must use an immutable reference"
            )
            continue
        if target.startswith(("./", "$")):
            if is_normalized_local_reference(target):
                continue
            errors.append(f"{description} contains an invalid local action reference")
            continue
        _, separator, reference = target.rpartition("@")
        if not separator or FULL_COMMIT_SHA.fullmatch(reference) is None:
            errors.append(
                f"every external action in {description} must use an immutable reference"
            )
    return errors


def parse_codeowner_rules(document: str) -> list[tuple[str, tuple[str, ...]]]:
    """Parse the CODEOWNERS subset used by the copyable profiles."""
    rules: list[tuple[str, tuple[str, ...]]] = []
    for line in document.splitlines():
        fields = line.split("#", maxsplit=1)[0].split()
        if fields:
            rules.append((fields[0], tuple(fields[1:])))
    return rules


def effective_codeowners(
    rules: list[tuple[str, tuple[str, ...]]], candidates: tuple[str, ...]
) -> tuple[dict[str, tuple[str, ...]], str | None]:
    """Resolve representative paths with Git's last-match path semantics."""
    try:
        with tempfile.TemporaryDirectory(prefix="standards-codeowners-") as temporary:
            temporary_root = Path(temporary)
            subprocess.run(
                ["git", "init", "--quiet", str(temporary_root)],
                check=True,
                capture_output=True,
                env=isolated_git_environment(),
                text=True,
            )
            (temporary_root / ".gitignore").write_text(
                "".join(f"{pattern}\n" for pattern, _ in rules), encoding="utf-8"
            )
            result = subprocess.run(
                ["git", "check-ignore", "--no-index", "--verbose", "--stdin"],
                cwd=temporary_root,
                input="\n".join(candidates) + "\n",
                capture_output=True,
                check=False,
                env=isolated_git_environment(),
                text=True,
            )
            if result.returncode not in (0, 1):
                return {}, result.stderr.strip()

            owners_by_path: dict[str, tuple[str, ...]] = {}
            for output_line in result.stdout.splitlines():
                metadata, candidate = output_line.rsplit("\t", maxsplit=1)
                _, line_number, _ = metadata.split(":", maxsplit=2)
                owners_by_path[candidate] = rules[int(line_number) - 1][1]
            return owners_by_path, None
    except (OSError, subprocess.SubprocessError, ValueError) as error:
        return {}, str(error)


def codeowner_contract_errors(
    document: str, candidates: tuple[str, ...], description: str
) -> list[str]:
    """Check catch-all ownership after every later matching rule is applied."""
    errors: list[str] = []
    rules = parse_codeowner_rules(document)
    if not any(pattern == "*" and "@OWNER" in owners for pattern, owners in rules):
        errors.append(f"{description} must contain the catch-all '* @OWNER' rule")
    for pattern, owners in rules:
        if "@OWNER" not in owners:
            errors.append(
                f"{description} rule {pattern!r} overrides the catch-all without retaining @OWNER"
            )

    effective_owners, codeowners_error = effective_codeowners(rules, candidates)
    if codeowners_error is not None:
        errors.append(f"could not exercise {description}: {codeowners_error}")
    else:
        for candidate in candidates:
            if "@OWNER" not in effective_owners.get(candidate, ()):
                errors.append(f"{description} does not effectively assign {candidate} to @OWNER")
    return errors


def workflow_contract_errors(document: str, description: str) -> list[str]:
    """Check automatic triggers, the quality job, and checkout credentials."""
    errors: list[str] = []
    trigger_keys = mapping_child_keys(document, "on")
    if trigger_keys is None:
        errors.append(f"{description} must contain one top-level on mapping")
        trigger_keys = []
    elif len(trigger_keys) != len(set(trigger_keys)):
        errors.append(f"{description} contains duplicate top-level triggers")
    for trigger in ("pull_request", "push", "workflow_dispatch", "merge_group"):
        if trigger not in trigger_keys:
            errors.append(f"{description} missing {trigger} trigger")
    if "pull_request_target" in trigger_keys:
        errors.append(f"{description} must not use pull_request_target")

    job_keys = mapping_child_keys(document, "jobs")
    if job_keys is None or job_keys.count("quality") != 1:
        errors.append(f"{description} must contain exactly one quality job")

    checkout_count, hardened_checkout_count = checkout_hardening(document)
    if checkout_count == 0 or checkout_count != hardened_checkout_count:
        errors.append(f"every checkout in {description} must set persist-credentials: false")
    errors.extend(external_action_pin_errors(document, description))
    return errors


def check_governance_parser_contracts() -> list[str]:
    """Exercise cases that naive workflow and CODEOWNERS scans misclassify."""
    errors: list[str] = []
    secure_workflow = """\
on:
  pull_request:
  push:
  workflow_dispatch:
  merge_group:
jobs:
  quality:
    steps:
      - uses: actions/checkout@0123456789abcdef0123456789abcdef01234567
        with:
          fetch-depth: 0
          persist-credentials: false
"""
    if workflow_contract_errors(secure_workflow, "secure fixture"):
        errors.append("governance parser rejected an order-independent secure workflow")
    wider_indentation = secure_workflow.replace("\n  ", "\n    ")
    if workflow_contract_errors(wider_indentation, "wider-indentation fixture"):
        errors.append("governance parser rejected a consistently indented secure workflow")

    disguised_manual_workflow = """\
on:
  workflow_dispatch:
jobs:
  pull_request:
  push:
  merge_group:
  quality:
"""
    disguised_errors = workflow_contract_errors(disguised_manual_workflow, "manual fixture")
    if not all(trigger in " ".join(disguised_errors) for trigger in ("pull_request", "push", "merge_group")):
        errors.append("governance parser confused job identifiers with automatic triggers")

    unsafe_workflow = secure_workflow.replace(
        "        with:\n          fetch-depth: 0\n          persist-credentials: false\n",
        "        env:\n          persist-credentials: false\n",
    )
    if not any(
        "persist-credentials" in error
        for error in workflow_contract_errors(unsafe_workflow, "unsafe fixture")
    ):
        errors.append("governance parser accepted credentials text outside checkout inputs")

    mutable_action = secure_workflow.replace(
        "actions/checkout@0123456789abcdef0123456789abcdef01234567",
        "actions/checkout@v7",
    )
    if not any(
        "immutable reference" in error
        for error in workflow_contract_errors(mutable_action, "mutable-action fixture")
    ):
        errors.append("governance parser accepted a mutable external action reference")

    for label, local_entry in {
        "running-commit action": "      - uses: $/.github/actions/contract",
        "workspace action": "      - uses: ./.github/actions/contract",
        "running-commit reusable workflow": "    uses: $/.github/workflows/contract.yml",
        "workspace reusable workflow": "    uses: ./.github/workflows/contract.yml",
    }.items():
        if external_action_pin_errors(local_entry, f"{label} fixture"):
            errors.append(f"governance parser rejected a {label} reference")

    commit = "0123456789abcdef0123456789abcdef01234567"
    image_digest = "0123456789abcdef" * 4
    for image in (
        "alpine",
        "alpine:3.20",
        "ghcr.io/owner/image",
        "registry.example.com:5000/owner/image:stable",
    ):
        docker_entry = f"      - uses: docker://{image}@sha256:{image_digest}"
        if external_action_pin_errors(docker_entry, "immutable Docker action fixture"):
            errors.append(
                f"governance parser rejected immutable Docker action image {image!r}"
            )

    invalid_docker_targets = (
        "docker://alpine",
        "docker://alpine:3.20",
        f"docker://@sha256:{image_digest}",
        "docker://alpine@sha256:",
        f"docker://alpine@sha256:{image_digest[1:]}",
        f"docker://alpine@sha256:{image_digest}0",
        f"docker://alpine@sha256:{image_digest.upper()}",
        f"docker://alpine@SHA256:{image_digest}",
        f"docker://alpine@sha256:{image_digest}@extra",
        f"docker://alpine//child@sha256:{image_digest}",
        f"docker://alpine/../child@sha256:{image_digest}",
        f"docker://alpine\\child@sha256:{image_digest}",
        f"docker://alpine child@sha256:{image_digest}",
        f"docker://${{{{ github.repository }}}}@sha256:{image_digest}",
    )
    for target in invalid_docker_targets:
        fixture = f"      - uses: {target}"
        if not external_action_pin_errors(fixture, "invalid Docker action fixture"):
            errors.append(
                f"governance parser accepted malformed Docker action reference {target!r}"
            )

    invalid_local_targets = (
        "$",
        f"$actions/contract@{commit}",
        f"$$/actions/contract@{commit}",
        "$/",
        "$//actions/contract",
        "$/actions//contract",
        "$/actions/../contract",
        "$/actions/./contract",
        "$/actions\\contract",
        "$/actions contract",
        "$/actions/contract/",
        "$/actions/contract@v1",
        f"$/actions/contract@{commit}",
        "./",
        ".//actions/contract",
        "./../outside",
        "./actions//contract",
        "./actions/../contract",
        "./actions/./contract",
        "./actions\\contract",
        "./actions contract",
        "./actions/contract/",
        "./actions/contract@v1",
        f"./actions/contract@{commit}",
    )
    for target in invalid_local_targets:
        for location, prefix in (
            ("action", "      - uses: "),
            ("reusable workflow", "    uses: "),
        ):
            fixture = f"{prefix}{target}"
            if not external_action_pin_errors(fixture, f"invalid {location} fixture"):
                errors.append(
                    f"governance parser accepted malformed {location} reference {target!r}"
                )

    escaped_uses_keys = {
        "hex": r"u\x73es",
        "short Unicode": r"u\u0073es",
        "long Unicode": r"u\U00000073es",
    }
    pinned_checkout = "actions/checkout@0123456789abcdef0123456789abcdef01234567"
    canonical_checkout_line = f"      - uses: {pinned_checkout}"
    for scalar_kind, scalar_step in {
        "block scalar": (
            "      - run: |\n"
            '          "u\\u0073es": actions/checkout@v7'
        ),
        "anchored block scalar": (
            "      - run: &shared-script |2-\n"
            '          "u\\u0073es": actions/checkout@v7'
        ),
        "tagged block scalar": (
            "      - run: !!str >+\n"
            '          "u\\u0073es": actions/checkout@v7'
        ),
        "inline quoted scalar": '      - run: \'echo "u\\u0073es": data\'',
        "inline flow-looking scalar": (
            '      - run: \'echo { "u\\u0073es": data }\''
        ),
    }.items():
        scalar_workflow = secure_workflow.replace(
            canonical_checkout_line,
            f"{scalar_step}\n{canonical_checkout_line}",
        )
        if workflow_contract_errors(
            scalar_workflow,
            f"escaped-key-{scalar_kind} fixture",
        ):
            errors.append(
                "governance parser confused an escaped-key lookalike in a "
                f"{scalar_kind} with a mapping key"
            )

    parallel_entries = {
        ("nested block", "mutable action"): (
            "      - parallel:\n"
            "          - parallel:\n"
            "              - uses: example/action@v1"
        ),
        ("nested block", "pinned but unhardened checkout"): (
            "      - parallel:\n"
            f"          - uses: {pinned_checkout}"
        ),
        ("nested flow", "mutable action"): (
            "      - { parallel: [ { parallel: [ { uses: example/action@v1 } ] } ] }"
        ),
        ("nested flow", "pinned but unhardened checkout"): (
            f"      - {{ parallel: [ {{ uses: {pinned_checkout} }} ] }}"
        ),
    }
    for (layout, reference_kind), parallel_entry in parallel_entries.items():
        parallel_workflow = secure_workflow.replace(
            canonical_checkout_line,
            f"{parallel_entry}\n{canonical_checkout_line}",
        )
        parallel_errors = workflow_contract_errors(
            parallel_workflow,
            f"parallel-{layout}-{reference_kind} fixture",
        )
        if not parallel_errors:
            errors.append(
                "governance parser accepted an unsafe parallel step "
                f"({layout}, {reference_kind})"
            )
        elif layout == "nested block":
            expected_fragment = (
                "immutable reference"
                if reference_kind == "mutable action"
                else "persist-credentials"
            )
            if not any(expected_fragment in error for error in parallel_errors):
                errors.append(
                    "governance parser misclassified an unsafe parallel step "
                    f"({layout}, {reference_kind})"
                )
        elif not any("non-canonical uses entry" in error for error in parallel_errors):
            errors.append(
                "governance parser did not fail closed for an unsafe flow parallel step "
                f"({layout}, {reference_kind})"
            )

    for escape_name, escaped_key in escaped_uses_keys.items():
        for layout, entry_pattern in (
            ("block", '      - "{key}": {target}'),
            ("flow", '      - {{ "{key}": {target} }}'),
            (
                "flow after plain hash",
                '      - {{ note: x#y, "{key}": {target} }}',
            ),
        ):
            for reference_kind, target in (
                ("mutable", "actions/checkout@v7"),
                ("pinned but unhardened", pinned_checkout),
            ):
                escaped_entry = entry_pattern.format(key=escaped_key, target=target)
                disguised_workflow = secure_workflow.replace(
                    canonical_checkout_line,
                    f"{escaped_entry}\n{canonical_checkout_line}",
                )
                if not workflow_contract_errors(
                    disguised_workflow,
                    f"escaped-{escape_name}-{layout}-{reference_kind} fixture",
                ):
                    errors.append(
                        "governance parser accepted an escaped uses key "
                        f"({escape_name}, {layout}, {reference_kind})"
                    )

    for label, invalid_entry in {
        "quoted": '      - "uses": actions/checkout@v7',
        "spaced": "      - uses : actions/checkout@v7",
        "flow": "      - { uses: actions/checkout@v7 }",
    }.items():
        disguised_action = secure_workflow.replace(
            "      - uses: actions/checkout@0123456789abcdef0123456789abcdef01234567",
            invalid_entry,
        )
        if not external_action_pin_errors(disguised_action, f"{label}-action fixture"):
            errors.append(f"governance parser accepted a {label} mutable action reference")

    codeowner_errors = codeowner_contract_errors(
        "* @OWNER\nsrc/ @OTHER\n",
        ("README.md", "src/project/main.py"),
        "override fixture",
    )
    if not any("src/project/main.py" in error for error in codeowner_errors):
        errors.append("CODEOWNERS contract ignored a later source ownership override")
    return errors


def check_automatic_profile_governance(
    profiles: dict[str, dict[str, object]],
) -> list[str]:
    """Check the host-enforced contracts shipped by automatic profiles."""
    errors: list[str] = []
    missing = AUTOMATIC_PROFILE_IDS - set(profiles)
    if missing:
        return [f"automatic profiles missing from manifest: {', '.join(sorted(missing))}"]

    errors.extend(check_governance_parser_contracts())
    for profile_id in sorted(AUTOMATIC_PROFILE_IDS):
        template = ROOT / str(profiles[profile_id]["template"])
        codeowners_path = template / ".github" / "CODEOWNERS"
        workflow_path = template / ".github" / "workflows" / "quality.yml"
        readme_path = template / "README.md"
        pull_request_template_path = template / ".github" / "pull_request_template.md"

        required_files = (
            codeowners_path,
            workflow_path,
            readme_path,
            pull_request_template_path,
        )
        if any(not path.is_file() for path in required_files):
            for path in required_files:
                if not path.is_file():
                    errors.append(f"{profile_id}: missing governance file {rel(path)}")
            continue

        errors.extend(
            f"{profile_id}: {error}"
            for error in codeowner_contract_errors(
                codeowners_path.read_text(encoding="utf-8"),
                AUTOMATIC_PROFILE_PATHS[profile_id],
                rel(codeowners_path),
            )
        )

        workflow = workflow_path.read_text(encoding="utf-8")
        errors.extend(
            f"{profile_id}: {error}"
            for error in workflow_contract_errors(workflow, rel(workflow_path))
        )

        readme = " ".join(readme_path.read_text(encoding="utf-8").lower().split())
        for phrase in (
            "require the `quality` job",
            "code owner review",
            "dismiss stale approvals",
            "disallow protection",
        ):
            if phrase not in readme:
                errors.append(f"{profile_id}: {rel(readme_path)} missing host-setting contract: {phrase}")

        pull_request_template = " ".join(
            pull_request_template_path.read_text(encoding="utf-8").lower().split()
        )
        if (
            "surviv" not in pull_request_template
            or "source reason" not in pull_request_template
            or not any(word in pull_request_template for word in ("classified", "ignored", "skipped"))
        ):
            errors.append(
                f"{profile_id}: {rel(pull_request_template_path)} must request both surviving "
                "and source-reasoned classified mutation results"
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
    errors.extend(check_mutation_ignore_scope())
    errors.extend(check_automatic_profile_governance(profiles))

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


def main() -> int:
    profiles = load_profiles()
    errors = check_profiles(profiles)
    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1

    print(f"Checked {len(profiles)} standards profiles.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
