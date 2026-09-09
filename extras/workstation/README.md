# Workstation setup

These scripts prepare WSL/Ubuntu and macOS for agent-driven development. The
workstation supplies responsive terminals and native inspection tools. Each
repository supplies its own discoverable tasks, tool versions, and acceptance
checks. The human owns product decisions and constraints; agents should be able
to work and verify results without repeated toolchain explanations.

Run `wsl-setup.sh` on WSL/Ubuntu or `macbook-setup.sh` on macOS after reviewing
the script's options. Use a new terminal or `exec zsh` after a shell update so
hooks from the previous configuration do not survive.

## Project workflows and host tools

Use `mise run tasks` to discover a repository's workflow. Tasks such as build,
test, and standards checks select the project's toolchain and environment.
Keep those tasks as the default project interface across languages.

Run ordinary tools directly: `git`, `gh`, `rg`, `fd`, `tokei`, and `ls`.
Prompt, history, navigation, and completion integrations also invoke their
installed binaries directly. The scripts install host tools with native
package managers or upstream installers. A small shared environment file
supplies native host paths to zsh scripts, interactive shells, and login
shells. It removes inherited mise shims, keeps caller-selected toolchains
ahead of host fallbacks, and places those fallbacks before system and Windows
directories. Windows paths remain available on WSL. It does not activate mise
or run it from prompt hooks.

Use `mise exec -- <command>` for a specific invocation that needs a project's
pinned tool or environment and has no suitable task. Automatic interactive
tool switching is a separate, deliberate choice with a measured latency cost.

## Keep the workstation responsive

Keep environment setup, completion paths, plugin loading, key bindings, and
prompt initialization in a clear order. Initialize completion once after its
paths are configured. Run installation, updates, network checks, and completion
generation during setup, never on every prompt or shell startup. Keep native
shell initialization commands only where the integration requires them.

Select tools for identifiable work: repository discovery, code search,
structural edits, diffs, verification, or session management. A new framework,
wrapper, or background service must remove more work than it creates. Agent
client selection and account authentication remain explicit user choices;
installing a terminal environment does not imply an authenticated agent client.

## Verification

Run `mise run shell:standards:check` from the catalog root. The workstation
tests execute both generated zsh configurations with fake host binaries and
inherited mise shims. They cover direct utility dispatch, initialization,
reload, retained paths with spaces, and default or customized mise data paths.
They also exercise the shared environment in POSIX sh, Bash, and zsh, including
project tool precedence, preserved Java settings, empty PATH entries, and
idempotent startup loaders. They check single completion initialization, disabled startup updates,
and distinct tmux sessions for repositories with the same basename. They do
not execute either machine installer.

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
