# Python Standards Tester

Smoke-test fixture for the reusable Python standards. It intentionally stays
small: one typed package, two tests, and the copied mise/Dagger wiring expected
in consuming projects.

The fixture proves the strict starting baseline works; real Python projects
should still relax or remove checks that do not fit their risk or lifecycle.
