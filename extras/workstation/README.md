# Workstation setup

These scripts prepare WSL/Ubuntu and macOS for agent-driven development. The
workstation supplies responsive terminals and native inspection tools. Each
repository supplies its own discoverable tasks, tool versions, and acceptance
checks. The human owns product decisions and constraints; agents should be able
to work and verify results without repeated toolchain explanations.

Run `wsl-setup.sh` on WSL/Ubuntu or `macbook-setup.sh` on macOS after reviewing
the script's options. After a shell update, open a new terminal or run
`exec bash -l` to clear existing hooks. On macOS, setup installs Homebrew Bash,
registers its absolute path in `/etc/shells`, and changes the account login shell
with `chsh` after validating the generated configuration. The installer itself
can start under the system Bash 3.2. Existing terminal or tmux sessions need to
be restarted to pick up the login shell; explicit terminal shell overrides remain
under your control.

## Project workflows and host tools

Use `mise tasks` to discover a repository's workflow. Tasks such as build,
test, and standards checks select the project's toolchain and environment.
Keep those tasks as the default project interface across languages.

Run ordinary tools directly: `git`, `gh`, `rg`, `fd`, `tokei`, and `ls`.
Prompt, history, navigation, and completion integrations also invoke their
installed binaries directly. The scripts install host tools with native
package managers or upstream installers. A shared environment file supplies
host paths to interactive shells, login shells, and agent commands. It removes
inherited mise shims, keeps caller-selected toolchains ahead of host fallbacks,
and places those fallbacks before system directories.

The WSL bootstrap installs Node LTS through mise and exposes its runtime
directory to noninteractive sessions. Interactive Bash sources cached mise
activation to switch runtime directories; `activate_shims` and
`not_found_auto_install` are disabled. The first available Bash login file
(`.bash_profile`, `.bash_login`, or `.profile`) and `.bashrc` load the shared
environment and `~/.config/bash/interactive.bash`. Existing startup files are
preserved; interactive initialization runs once per shell. Child Bash commands
inherit `BASH_ENV` for quiet environment setup, preserving a caller's override.
Independent agent launchers can source `~/.config/shell/env.sh` explicitly.
Personal shell additions belong in `~/.config/bash/local.bash`.
The macOS bootstrap uses Homebrew Bash and native runtime paths without mise
activation. It loads Homebrew Bash completions and the same Flyline editing,
Atuin history, fzf pickers, and Starship prompt as WSL. Setup removes its managed
Zsh loader and config only after the login shell change succeeds, preserving
personal Zsh settings and history.

WSL removes empty PATH entries and trims inherited Windows directories after
the Linux system paths. Explicitly prepended toolchains on mounted drives
retain their precedence. Direct launchers preserve detected common Windows
commands and Code/Cursor. Set `WSL_KEEP_WINDOWS_PATH=1` before shell startup to
retain the full inherited Windows PATH.

Use `mise exec -- <command>` for a specific invocation that needs a project's
pinned tool or environment and has no suitable task. Project tasks supply their
own environment regardless of interactive activation.

## Keep the workstation responsive

Keep environment setup, completion paths, plugin loading, key bindings, and
prompt initialization in a clear order. Initialize completion once after its
paths are configured. Run installation, updates, network checks, and tool
completion generation during setup, never on every prompt or shell startup.
Keep native shell initialization commands only where the integration requires
them.

Both hosts use Starship's standard Bash integration for its prompt, native Bash
completion loading, and Flyline for editing and syntax highlighting. Unknown
typed commands appear red and recognized commands green, independently of the
unaccepted suggestion. History suggestions appear in muted gray; Right accepts
the suggestion. Tab opens Flyline's completion menu using Bash's registered
completers. Automatic suggestions use history; external completers run on Tab.
Flyline settings live in `~/.config/bash/interactive.bash`. The cursor is a
steady thin bar, with animation and mouse capture disabled. fzf supplies its
packaged Ctrl-T and Alt-C pickers. Alt-C inserts the selected directory’s quoted
`cd` command; press Enter to change directories. Canceling preserves unfinished
input.
Starship initializes after the other
integrations. Setup generates cached initialization scripts for zoxide, Atuin,
and Starship, plus mise on WSL. Run `wsl-shell-refresh` on WSL or
`macos-shell-refresh` on macOS after manually upgrading an integrated tool, then
open a new terminal. The refresh command syntax-checks and replaces those scripts.

Atuin records command history and provides Ctrl-R search. Selection returns to
the command buffer for review; press Enter to execute.
Existing Atuin history remains available with `atuin search`. Setup
preserves history files; clearing history is a separate user action.

Select tools for identifiable work: repository discovery, code search,
structural edits, diffs, verification, or session management. A new framework,
wrapper, or background service must remove more work than it creates. Agent
client selection and account authentication remain explicit user choices;
installing a terminal environment does not imply an authenticated agent client.

## Verification

Run `mise run shell:standards:check` from the catalog root. The workstation
tests execute the generated Bash configurations with fake host binaries and
inherited mise shims. They cover direct utility dispatch, initialization,
reload, emacs keys under an inherited `EDITOR=nvim`, Ctrl/Alt+Left/Right word
motion, retained paths with spaces, and default or customized mise data paths.
They also exercise the shared environment in POSIX sh and Bash, including
project tool precedence, preserved Java settings, empty PATH entries, and
idempotent startup loaders. WSL cases cover Windows PATH trimming and opt-in
retention, cached integrations, idempotent Bash loaders, and syntax checks for
every generated script. They also check distinct tmux sessions for repositories
with the same basename. They do not execute either machine installer.

The session picker searches two directory levels under common development
roots. Set `TMUX_SESSIONIZER_ROOTS` to a colon-separated list of roots when
projects live elsewhere.

For a shell integration change, also measure a real terminal's first prompt
and repeated prompts, both at home and inside a representative repository.
Verify command resolution and project task execution from a fresh shell.
Parser checks and fake binaries cannot establish real startup performance or
prove a complete installation on the other operating system.

## Routine maintenance

Use each host tool's package manager or native updater. Keep project toolchain
pins and stateful application upgrades in their repositories. Back up data
before a tool upgrade that migrates a database, such as shell history.

Run Ubuntu package maintenance during a live WSL session. Schedule WSL platform
updates from Windows after saving work and stopping active agents: updating WSL
can interrupt the running distro. These setup scripts do not update or restart
WSL. Keep cache cleanup limited to package-manager caches and known disposable
build output; retain project data, model files, and rollback evidence.
