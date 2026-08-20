"""Enforce the reviewable Python suppression protocol on real comments."""

from __future__ import annotations

import argparse
import io
import re
import sys
import tokenize
from collections.abc import Iterable
from pathlib import Path

DEFAULT_PATHS = (Path("."),)
PRUNED_DIRECTORIES = frozenset(
    {
        ".basedpyright",
        ".git",
        ".hypothesis",
        ".mypy_cache",
        ".nox",
        ".pytest_cache",
        ".ruff_cache",
        ".tox",
        ".venv",
        "__pycache__",
        "node_modules",
    }
)
PRUNED_ROOT_DIRECTORIES = frozenset(
    {
        ".cache",
        ".gstack",
        "build",
        "coverage",
        "dist",
        "htmlcov",
        "mutants",
        "out",
        "sbom",
        "target",
        "vendor",
    }
)
FLAKE8_CONTROL = re.compile(r"^#\s*flake8\s*:\s*noqa\b", re.IGNORECASE)
FORMAT_CONTROL = re.compile(r"^#\s*(?:fmt|yapf|autopep8|isort)\s*:", re.IGNORECASE)
NO_MUTATE = re.compile(r"^#\s*pragma\s*:\s*no\s+mutate\b", re.IGNORECASE)
NO_MUTATE_VALID = re.compile(
    r"^#\s*pragma\s*:\s*no\s+mutate\s+--\s+(?P<reason>\S.*)$",
    re.IGNORECASE,
)
NOQA = re.compile(r"^#\s*noqa\b", re.IGNORECASE)
NOQA_VALID = re.compile(
    r"^#\s*noqa\s*:\s*(?P<rules>[A-Z]+\d+(?:\s*,\s*[A-Z]+\d+)*)" + r"\s+--\s+(?P<reason>\S.*)$",
    re.IGNORECASE,
)
NOSEC = re.compile(r"^#\s*nosec\b", re.IGNORECASE)
NOSEC_VALID = re.compile(
    r"^#\s*nosec\s+(?P<rules>B\d+(?:\s*,\s*B\d+)*)\s+--\s+(?P<reason>\S.*)$",
    re.IGNORECASE,
)
NO_COVER = re.compile(r"^#\s*pragma\s*:\s*no\s+(?:cover|branch)\b", re.IGNORECASE)
NO_COVER_VALID = re.compile(
    r"^#\s*pragma\s*:\s*no\s+(?:cover|branch)\s+--\s+(?P<reason>\S.*)$",
    re.IGNORECASE,
)
MYPY_CONTROL = re.compile(r"^#\s*mypy\s*:", re.IGNORECASE)
MYPY_HYPOTHESIS_EXCEPTION = re.compile(
    r"^#\s*mypy\s*:\s*disallow-any-decorated=False,\s*disallow-any-expr=False$"
)
PYRIGHT_IGNORE = re.compile(r"^#\s*pyright\s*:\s*ignore\b", re.IGNORECASE)
PYRIGHT_CONTROL = re.compile(r"^#\s*pyright\s*:", re.IGNORECASE)
PYRIGHT_IGNORE_VALID = re.compile(
    r"^#\s*pyright\s*:\s*ignore\["
    + r"(?P<rules>[A-Z][A-Z0-9]*(?:\s*,\s*[A-Z][A-Z0-9]*)*)"
    + r"\]\s+--\s+(?P<reason>\S.*)$",
    re.IGNORECASE,
)
RUFF_CONTROL = re.compile(r"^#\s*ruff\s*:", re.IGNORECASE)
TYPE_IGNORE = re.compile(r"^#\s*type\s*:\s*ignore\b", re.IGNORECASE)


class Arguments(argparse.Namespace):
    """Typed command-line arguments."""

    def __init__(self) -> None:
        super().__init__()
        self.paths: list[Path] | tuple[Path, ...] = DEFAULT_PATHS


class PolicyDiscoveryError(Exception):
    """A first-party source layout prevents complete policy discovery."""


def has_meaningful_reason(match: re.Match[str]) -> bool:
    """Return whether a matched reason contains an explanatory word or number."""
    reason = match.group(0).rpartition("--")[2]
    return any(character.isalnum() for character in reason)


def required_shape(
    comment: str,
    prefix: re.Pattern[str],
    valid: re.Pattern[str],
    message: str,
) -> str | None:
    """Validate one suppression family and return an error when it is malformed."""
    if prefix.match(comment) is None:
        return None
    match = valid.fullmatch(comment)
    if match is None or not has_meaningful_reason(match):
        return message
    return None


def suppression_violation(comment: str) -> str | None:
    """Return the policy violation for one Python comment, if any."""
    if RUFF_CONTROL.match(comment) or FLAKE8_CONTROL.match(comment):
        return "Ruff and Flake8 file directives are forbidden; use a reasoned per-site noqa"
    if FORMAT_CONTROL.match(comment):
        return "formatter and import-order bypass directives are forbidden"
    if TYPE_IGNORE.match(comment):
        return "type: ignore is forbidden; use a rule-specific, reasoned pyright ignore"
    if MYPY_CONTROL.match(comment) and MYPY_HYPOTHESIS_EXCEPTION.fullmatch(comment) is None:
        return (
            "mypy file configuration is limited to the documented two-rule "
            "Hypothesis integration exception"
        )
    if PYRIGHT_CONTROL.match(comment) and PYRIGHT_IGNORE.match(comment) is None:
        return "Pyright file configuration is forbidden; keep strictness in pyproject.toml"

    checks = (
        (
            NOQA,
            NOQA_VALID,
            "noqa must be '# noqa: CODE[, CODE] -- reason'",
        ),
        (
            PYRIGHT_IGNORE,
            PYRIGHT_IGNORE_VALID,
            "pyright ignores must be '# pyright: ignore[rule[, rule]] -- reason'",
        ),
        (
            NOSEC,
            NOSEC_VALID,
            "nosec must be '# nosec B123[, B456] -- reason'",
        ),
        (
            NO_MUTATE,
            NO_MUTATE_VALID,
            "mutation exclusions must be '# pragma: no mutate -- reason'; ranges are forbidden",
        ),
        (
            NO_COVER,
            NO_COVER_VALID,
            "coverage exclusions must be '# pragma: no cover -- reason' or "
            + "'# pragma: no branch -- reason'",
        ),
    )
    for prefix, valid, message in checks:
        violation = required_shape(comment, prefix, valid, message)
        if violation is not None:
            return violation
    return None


def is_pruned_directory(path: Path, project_root: Path) -> bool:
    """Return whether a directory is ignored dependency or generated state."""
    if path.name in PRUNED_DIRECTORIES:
        return True
    return path.name in PRUNED_ROOT_DIRECTORIES and path.parent.absolute() == project_root


def directory_python_files(path: Path, project_root: Path) -> Iterable[Path]:
    """Yield Python files below one directory without entering ignored trees."""
    pending = [path]
    while pending:
        directory = pending.pop()
        children = sorted(directory.iterdir(), reverse=True)
        for child in children:
            if child.is_symlink():
                if child.is_dir():
                    if is_pruned_directory(child, project_root):
                        continue
                    raise PolicyDiscoveryError(
                        f"{child}: symlinked source directories are forbidden because "
                        + "Python tools disagree about whether to inspect and package them"
                    )
                if child.is_file() and child.suffix in {".py", ".pyi"}:
                    yield child
                continue
            if child.is_dir():
                if not is_pruned_directory(child, project_root):
                    pending.append(child)
            elif child.is_file() and child.suffix in {".py", ".pyi"}:
                yield child


def python_files(paths: Iterable[Path], project_root: Path) -> Iterable[Path]:
    """Yield unique first-party Python files in stable order."""
    candidates: set[Path] = set()
    for path in paths:
        if path.is_symlink() and path.is_dir():
            raise PolicyDiscoveryError(
                f"{path}: symlinked source directories are forbidden because "
                + "Python tools disagree about whether to inspect and package them"
            )
        if path.is_file() and path.suffix in {".py", ".pyi"}:
            candidates.add(path)
        elif path.is_dir() and not is_pruned_directory(path, project_root):
            candidates.update(directory_python_files(path, project_root))
    yield from sorted(candidates)


def file_violations(path: Path) -> list[str]:
    """Return suppression violations in one tokenizable Python file."""
    violations: list[str] = []
    try:
        source = path.read_bytes()
        tokens = tokenize.tokenize(io.BytesIO(source).readline)
        for token in tokens:
            if token.type != tokenize.COMMENT:
                continue
            violation = suppression_violation(token.string)
            if violation is not None:
                violations.append(f"{path}:{token.start[0]}:{token.start[1] + 1}: {violation}")
    except (OSError, SyntaxError, tokenize.TokenError) as error:
        violations.append(f"{path}: cannot inspect comments: {error}")
    return violations


def main() -> int:
    """Check configured paths and return a process status."""
    parser = argparse.ArgumentParser()
    parser.add_argument("paths", nargs="*", type=Path, default=DEFAULT_PATHS)
    arguments = parser.parse_args(namespace=Arguments())
    project_root = Path.cwd()
    try:
        violations = [
            violation
            for path in python_files(arguments.paths, project_root)
            for violation in file_violations(path)
        ]
    except (OSError, PolicyDiscoveryError) as error:
        print(error, file=sys.stderr)
        return 1
    if violations:
        print("\n".join(violations), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
