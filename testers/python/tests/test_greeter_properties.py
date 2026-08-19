"""Property tests for the greeting boundary.

The ``@example`` cases seed the deterministic baseline; a counterexample
found by a property run is pinned the same way.
"""

from hypothesis import example, given
from hypothesis import strategies as st

from project_name import Greeting, render_greeting


@given(name=st.text())
@example(name="")
@example(name="Ada")
def test_rendered_greeting_frames_the_name(name: str) -> None:
    rendered = render_greeting(name)

    assert rendered == f"Hello, {name}!"


@given(name=st.text())
def test_greeting_value_object_is_stable(name: str) -> None:
    greeting = Greeting(name=name)

    assert greeting == Greeting(name=name)
    assert greeting.render() == render_greeting(name)
