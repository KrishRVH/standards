# Standards

Reusable coding-standard and quality-tooling defaults.

Each language folder contains copyable baseline config. The files intentionally
use neutral project names, conventional `src` and `tests` directories, and
generic package namespaces. Replace those placeholders when a project uses a
different layout or architectural boundary.

These defaults optimize for strict local feedback: formatting, linting, static
analysis, dependency hygiene, tests, mutation testing where practical, and
repeatable CI gates.

Developer and CI entrypoints are expected to run through mise. Dagger is pinned
and invoked by mise for isolated CI execution.
