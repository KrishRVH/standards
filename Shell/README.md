# Shell Standards

This baseline treats Bash as the default language for project glue. zsh and
POSIX `sh` are also supported when a script declares its dialect with a
shebang.

Default checks:

- `shfmt` formats Bash, POSIX `sh`, Bats, and zsh files with two-space
  indentation.
- `shellcheck` runs with optional checks enabled for Bash, POSIX `sh`, and Bats
  files, with noisy style/info rules excluded.
- `bash -n`, `sh -n`, and `zsh -n` validate declared script syntax.
- Bats runs behavior tests.

Project-owned shell files under `scripts/`, `bin/`, `ci/`, `tools/`, and `dev/`
must use a recognized shebang to declare their dialect, including executable
files without an extension. The same formatter, static-analysis, syntax, and
policy checks cover the copyable `scripts/shell-standards.sh` runner. Error
handling and strict mode remain local design decisions.
