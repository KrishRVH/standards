"""Greeting helpers for the Python standards fixture."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Greeting:
    """A greeting value object."""

    name: str

    def render(self) -> str:
        """Render the greeting text."""
        return f"Hello, {self.name}!"


def render_greeting(name: str) -> str:
    """Render a greeting for a name."""
    return Greeting(name=name).render()
