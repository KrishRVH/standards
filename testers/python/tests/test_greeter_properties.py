# mypy: disallow-any-decorated=False, disallow-any-expr=False
"""Property tests for the greeting boundary.

Hypothesis's ``@given`` decorator carries ``Any`` in its plumbing, so only this
module relaxes those two optional mypy checks. Explicit ``@example`` cases pin
the deterministic baseline and every triaged counterexample.
"""

from hypothesis import example, given
from hypothesis import strategies as st

from project_name import render_greeting


@given(name=st.text())
@example(name="")
def test_rendered_greeting_frames_the_name(name: str) -> None:
    rendered = render_greeting(name)

    assert rendered == f"Hello, {name}!"
