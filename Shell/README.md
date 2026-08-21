# Shell Standards

This baseline treats Bash as the default language for project glue. zsh and
POSIX `sh` are also supported when a script declares its dialect with a
shebang.

Default checks:

- `shfmt` formats Bash, POSIX `sh`, and Bats files with two-space indentation.
- `shellcheck` runs with optional checks enabled for Bash, POSIX `sh`, and Bats
  files, with noisy style/info rules excluded.
- `bash -n`, `sh -n`, and `zsh -n` validate declared script syntax.
- Bats runs behavior tests.

`shfmt` and ShellCheck do not parse zsh. The workflow skips zsh files for
formatting and static analysis, then validates their syntax with `zsh -n`.

Project-owned shell files under `scripts/`, `bin/`, `ci/`, `tools/`, and `dev/`
must use a recognized shebang to declare their dialect, including executable
files without an extension. The same formatter, static-analysis, syntax, and
policy checks cover the copyable `scripts/shell-standards.sh` runner. Git
discovery rejects tracked or unignored shell source symlinks; non-Git discovery
ignores symlinks. Both modes keep checks on project-owned regular files. Error
handling and strict mode remain local design decisions.
