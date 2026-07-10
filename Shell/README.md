# Shell Standards

Bash-first standards for project glue code. zsh and POSIX `sh` are supported
when scripts declare those dialects with a shebang.

Default checks:

- `shfmt` formats Bash, POSIX `sh`, Bats, and zsh files with two-space
  indentation.
- `shellcheck` runs with optional checks enabled for Bash, POSIX `sh`, and Bats
  files, with noisy style/info rules excluded.
- `bash -n`, `sh -n`, and `zsh -n` validate declared script syntax.
- Bats runs behavior tests.

Project-owned shell glue under `scripts/`, `bin/`, `ci/`, `tools/`, and `dev/`
must declare its intended dialect with a recognized shebang. This includes
executable extensionless glue. The copyable `scripts/shell-standards.sh` runner
is itself covered by the same formatter, static-analysis, syntax, and policy
checks. Error handling and strict-mode choices remain local design decisions.
