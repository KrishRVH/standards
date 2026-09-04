# Shell agent guide

Use Bash for project glue unless a script needs POSIX sh or zsh. Declare the
dialect with a shebang, including executable files without extensions. Read
[setup and tool coverage](README.md) when adopting the profile or changing
discovery, dialect handling, or the runner.

## Work and verification

Use `mise run shell:...` for development. `shell:standards` formats;
`shell:lint` checks static analysis, syntax, and shebangs; `shell:test` runs
Bats. Before handoff, run `mise run shell:standards:check` and report skipped
checks. zsh receives syntax checking only, so test its behavior explicitly.

## Script contracts

- Keep shell focused on process composition. Move structured parsing or
  complex state into a language suited to it.
- Quote expansions and use Bash arrays for argument lists. Use NUL-delimited
  discovery for filenames; preserve arguments without re-parsing them as code.
- State inputs, outputs, exit statuses, and side effects near the entry point.
  Send diagnostics to stderr and machine-consumed results to stdout.
- Handle expected command failures explicitly. Choose strict mode locally;
  `set -e` does not replace error handling, especially inside conditionals
  and pipelines.
- Acquire temporary paths with `mktemp` and install cleanup traps promptly.
  Keep cleanup scoped to resources the script owns. Bootstrap and repair
  scripts must converge on repeat runs and preserve unmanaged files.
- Explain narrow ShellCheck suppressions at the site. Fix quoting or command
  structure when it removes the warning.

Test meaningful behavior through Bats: arguments containing spaces or option
prefixes, exit status, stderr, failure cleanup, and repeated execution when
applicable. A bug fix needs a regression that fails on the old behavior.
Review destructive commands and discovery changes independently.
