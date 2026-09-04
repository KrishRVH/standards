# Shell Standards

This baseline treats Bash as the default language for project glue. zsh and
POSIX `sh` are also supported when a script declares its dialect with a
shebang.

Copy `.editorconfig`, `.shellcheckrc`, `scripts/`, and `tests/` into the
project. Merge `AGENTS.md` into the project guide. Add the shared mise
`config.toml` and `conf.d/20-shell.toml` under `.config/mise/`; copy the
shared ignore rules so generated files stay outside discovery. Replace the
greeting script and tests with the project's glue.

```sh
mise run shell:standards
mise run shell:lint
mise run shell:test
mise run shell:standards:check
```

`shell:run -- <command>` exposes the runner's individual subcommands through
mise. Bash runs the standards runner; install zsh when checking zsh scripts.

Default checks:

- `shfmt` formats Bash, POSIX `sh`, and Bats files with two-space indentation.
- `shellcheck` runs with optional checks enabled for Bash, POSIX `sh`, and Bats
  files, with noisy style/info rules excluded.
- `bash -n`, `sh -n`, and `zsh -n` validate declared script syntax.
- Bats runs behavior tests.

ShellCheck does not parse zsh, and shfmt's zsh support is experimental and
incomplete. The workflow skips zsh formatting and static analysis, then
validates its syntax with `zsh -n`.

Project-owned shell files under `scripts/`, `bin/`, `ci/`, `tools/`, and `dev/`
must use a recognized shebang to declare their dialect, including executable
files without an extension. Discovery captures one NUL-delimited file list,
preserving Unicode, quotes, spaces, and newlines in filenames. A Git or find
failure stops the gate before checks run. The same formatter, static-analysis, syntax, and
policy checks cover the copyable `scripts/shell-standards.sh` runner. Git
discovery rejects tracked or unignored shell source symlinks; non-Git discovery
ignores symlinks. Both modes keep checks on project-owned regular files. Error
handling and strict mode remain local design decisions.
