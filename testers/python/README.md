# Python Standards Tester

This fixture exercises the Python standards profile, including strict static
default static analysis, tests with coverage, and wheel/source distribution
builds.

Smoke-test fixture for the reusable Python standards. It intentionally stays
small: one typed package, two tests, and copied mise wiring. It also keeps a
Dagger copy so the optional wrapper stays drift-checked.

The fixture proves the strict starting baseline works; real Python projects can
run `mise run py:deep` when they want the heavier analyzer profile.
