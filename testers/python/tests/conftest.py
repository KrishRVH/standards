"""Shared test configuration: the Hypothesis CI profile.

``print_blob=True`` makes a failing property emit a ready-to-paste
``@reproduce_failure`` line; a triaged counterexample is then pinned as a
durable ``@example`` on the test. ``derandomize`` stays off even in CI so
every run keeps searching for new counterexamples instead of replaying old
seeds. The local ``.hypothesis/`` cache stays out of version control.
"""

from hypothesis import settings

settings.register_profile("ci", derandomize=False, print_blob=True)
settings.load_profile("ci")
