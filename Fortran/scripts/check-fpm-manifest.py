#!/usr/bin/env python3
"""Enforce reproducible fpm dependency declarations."""

from __future__ import annotations

import sys
import tomllib
from pathlib import Path


DEPENDENCY_TABLES = {"dependencies", "dev-dependencies"}


def check_dependencies(
    dependencies: object,
    path: tuple[str, ...],
    errors: list[str],
) -> None:
    if not isinstance(dependencies, dict):
        return

    for name, declaration in dependencies.items():
        location = ".".join((*path, name))

        if isinstance(declaration, str):
            if "*" in declaration:
                errors.append(f"{location}: wildcard dependency versions are not allowed")
            continue

        if not isinstance(declaration, dict):
            continue

        version = declaration.get("v")
        if isinstance(version, str) and "*" in version:
            errors.append(f"{location}: wildcard dependency versions are not allowed")

        if "branch" in declaration:
            errors.append(f"{location}: moving Git branches are not allowed; pin a tag or rev")
        elif "git" in declaration and not any(
            declaration.get(pin) for pin in ("tag", "rev")
        ):
            errors.append(f"{location}: Git dependencies must pin a tag or rev")


def walk(value: object, path: tuple[str, ...], errors: list[str]) -> None:
    if path[:1] == ("extra",):
        return

    if isinstance(value, dict):
        for name, child in value.items():
            child_path = (*path, name)
            if name in DEPENDENCY_TABLES:
                check_dependencies(child, child_path, errors)
            walk(child, child_path, errors)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            walk(child, (*path[:-1], f"{path[-1]}[{index}]"), errors)


def main() -> int:
    manifest = Path(sys.argv[1] if len(sys.argv) > 1 else "fpm.toml")
    try:
        with manifest.open("rb") as file:
            document = tomllib.load(file)
    except FileNotFoundError:
        print(f"{manifest} is required for the Fortran standard.", file=sys.stderr)
        return 1
    except tomllib.TOMLDecodeError as error:
        print(f"{manifest}: invalid TOML: {error}", file=sys.stderr)
        return 1

    errors: list[str] = []
    walk(document, (), errors)
    for error in errors:
        print(f"{manifest}: {error}", file=sys.stderr)
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
