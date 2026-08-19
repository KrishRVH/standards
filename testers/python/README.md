# Python Standards Tester

One typed package with example and Hypothesis property tests exercises the
Python standards profile, including its copied mise wiring and drift-checked
Dagger wrapper. The fixture covers the default strict static analysis, branch
coverage, wheel and source distribution builds, and the mutmut mutation sweep
gated by the committed `.mutmut-floor` ratchet.

Real Python projects can run `mise run py:deep` when they want the heavier
analyzer profile.
