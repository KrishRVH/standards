#!/usr/bin/env bats

setup() {
  # shellcheck disable=SC2154 # Bats defines BATS_TEST_DIRNAME.
  MACBOOK_SETUP_SCRIPT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)/extras/workstation/macbook-setup.sh"
}

file_mode() {
  local mode
  if mode="$(stat -f '%Lp' "$1" 2> /dev/null)"; then
    printf '%s\n' "$mode"
  else
    stat -c '%a' "$1"
  fi
}

@test "managed block removal keeps other content and deletes a file it emptied" {
  # shellcheck disable=SC2154 # Bats defines BATS_TEST_TMPDIR.
  local shared="${BATS_TEST_TMPDIR}/shared-tmux.conf" only="${BATS_TEST_TMPDIR}/only-tmux.conf"
  local block=$'# >>> loader >>>\nsource-file ~/.config/tmux/tmux.conf\n# <<< loader <<<'
  printf '%s\n\n%s\n' 'set -g mouse on' "$block" > "$shared"
  chmod 0600 "$shared"
  printf '%s\n' "$block" > "$only"

  run bash -c '
    source "$1"
    remove_managed_block "$2" "# >>> loader >>>" "# <<< loader <<<"
    remove_managed_block "$3" "# >>> loader >>>" "# <<< loader <<<"
    remove_managed_block "$3" "# >>> loader >>>" "# <<< loader <<<"
  ' -- "$MACBOOK_SETUP_SCRIPT" "$shared" "$only"

  [[ "$status" -eq 0 ]]
  [[ "$(< "$shared")" == 'set -g mouse on' ]]
  [[ "$(file_mode "$shared")" = "600" ]]
  [[ ! -e "$only" ]]
}

@test "Rust bootstrap installs stable and honors the update switch" {
  # shellcheck disable=SC2154 # Bats defines BATS_TEST_TMPDIR.
  local workspace="${BATS_TEST_TMPDIR}/rustup"
  local update installed
  for update in 0 1; do
    for installed in 0 1; do
      run bash -c '
        export CARGO_HOME="$4/cargo" RUSTUP_HOME="$4/rustup"
        source "$1"
        updates=0
        installed="$3"
        retry_quiet() { "$@"; }
        has() { [[ "$1" = rustup || "$1" = cargo ]]; }
        rustup() {
          case "$1" in
            toolchain)
              local argument no_update=0
              for argument; do
                [ "$argument" != --no-update ] || no_update=1
              done
              if [ "$installed" = 1 ] && [ "$no_update" = 0 ]; then
                updates=$((updates + 1))
              fi
              installed=1
              ;;
            update) updates=$((updates + 1)) ;;
            default) ;;
            *) return 1 ;;
          esac
        }
        BOOTSTRAP_INSTALL_RUSTUP=1 BOOTSTRAP_RUSTUP_UPDATE="$2" install_or_update_rustup
        printf "installed=%s updates=%s\n" "$installed" "$updates"
      ' -- "$MACBOOK_SETUP_SCRIPT" "$update" "$installed" "$workspace"

      [[ "$status" -eq 0 ]]
      [[ "$output" = "installed=1 updates=${update}" ]]
    done
  done
}

@test "Homebrew formula installation respects the nonstandard-prefix opt-in" {
  local fixture="${BATS_TEST_TMPDIR}/homebrew" allow
  mkdir -p "$fixture/bin"
  cat > "$fixture/bin/brew" << 'BREW'
#!/usr/bin/env bash
printf '%s\n' "$1" >> "$BREW_CALLS"
case "$1" in
  shellenv) printf '%s\n' 'export HOMEBREW_PREFIX="$BREW_FIXTURE_PREFIX"' ;;
  --prefix) printf '%s\n' "$BREW_FIXTURE_PREFIX" ;;
  list) exit 1 ;;
esac
BREW
  chmod +x "$fixture/bin/brew"

  for allow in 0 1; do
    # shellcheck disable=SC2016 # The isolated Bash expands the fixture variables.
    run env BREW_FIXTURE_PREFIX="$fixture" BREW_CALLS="$fixture/calls-$allow" bash -c '
      source "$1"
      export PATH="$BREW_FIXTURE_PREFIX/bin:$PATH"
      ensure_xcode_command_line_tools() { return 0; }
      expected_brew_path() { printf "%s\n" "$BREW_FIXTURE_PREFIX/missing/bin/brew"; }
      BOOTSTRAP_INSTALL_HOMEBREW=0
      BOOTSTRAP_ALLOW_NONSTANDARD_BREW="$2"
      BOOTSTRAP_BREW_CLEANUP=0
      step_required "Homebrew availability" ensure_homebrew
      brew_install_formulae example
    ' -- "$MACBOOK_SETUP_SCRIPT" "$allow"

    if [ "$allow" -eq 0 ]; then
      [[ "$status" -ne 0 ]]
      [[ "$output" = *"ignoring it for standardization"* ]]
      [[ ! -e "$fixture/calls-$allow" ]]
    else
      [[ "$status" -eq 0 ]]
      grep -qx update "$fixture/calls-$allow"
      grep -qx install "$fixture/calls-$allow"
    fi
  done
}

@test "macOS login shell uses Homebrew Bash and changes only when needed" {
  # shellcheck disable=SC2154 # Bats defines BATS_TEST_TMPDIR.
  local fixture="$BATS_TEST_TMPDIR/login"
  mkdir -p "$fixture/brew/bin"
  ln -s "$(command -v bash)" "$fixture/brew/bin/bash"
  run bash -c '
    source "$1"
    HOMEBREW_PREFIX="$2/brew" USER=fixture
    current=/bin/zsh registered=0 changes=0
    dscl() { local IFS=" "; [[ "$*" == ". -read /Users/fixture UserShell" ]] || return 1; printf "UserShell: %s\n" "$current"; }
    grep() { local IFS=" "; [[ "$*" == "-qxF $HOMEBREW_PREFIX/bin/bash /etc/shells" && $registered == 1 ]]; }
    ensure_sudo() { return 0; }
    chsh() {
      local IFS=" "
      [[ "$*" == "-s $HOMEBREW_PREFIX/bin/bash fixture" ]] || return 1
      current="$HOMEBREW_PREFIX/bin/bash"
      changes=$((changes+1))
    }
    sudo() { local IFS=" "; [[ "$*" == "tee -a /etc/shells" ]] || return 1; cat > "$HOMEBREW_PREFIX/registered"; }
    set_bash_login_shell || exit 1
    [[ $(cat "$HOMEBREW_PREFIX/registered") == "$HOMEBREW_PREFIX/bin/bash" ]] || exit 2
    registered=1
    set_bash_login_shell || exit 3
    [[ $changes == 1 ]] || exit 4
    dscl() { return 1; }
    if set_bash_login_shell; then exit 5; fi
    [[ $changes == 1 ]] || exit 6
  ' -- "$MACBOOK_SETUP_SCRIPT" "$fixture"
  [[ "$status" -eq 0 ]]
}

@test "macOS shell migration keeps Zsh usable until Bash configuration and chsh succeed" {
  run bash -c '
    source "$1"
    write_bash_config() { return 1; }
    set_bash_login_shell() { echo chsh; }
    retire_zsh_config() { echo retire; }
    if configure_bash; then exit 1; fi
    write_bash_config() { return 0; }
    set_bash_login_shell() { return 1; }
    if configure_bash; then exit 2; fi
  ' -- "$MACBOOK_SETUP_SCRIPT"
  [[ "$status" -eq 0 ]]
  [[ -z "$output" ]]
}

@test "macOS Bash configuration preserves profiles and personal Zsh settings on rerun" {
  # shellcheck disable=SC2154 # Bats defines BATS_TEST_TMPDIR.
  local fixture="$BATS_TEST_TMPDIR/config"
  mkdir -p "$fixture/brew/bin" "$fixture/brew/opt/flyline/lib/bash"
  ln -s "$(command -v bash)" "$fixture/brew/bin/bash"
  touch "$fixture/brew/opt/flyline/lib/bash/flyline"
  printf '%s\n' 'export PERSONAL_SETTING=retained' > "$fixture/.bash_login"
  printf '%s\n' 'alias personal=true' \
    '# >>> macbook-bootstrap managed zsh loader >>>' \
    'source old-managed.zsh' \
    '# <<< macbook-bootstrap managed zsh loader <<<' > "$fixture/.zshrc"
  # shellcheck disable=SC2016 # Parameters belong to the isolated shell.
  run env -i HOME="$fixture" PATH=/usr/bin:/bin bash -c '
    source "$1"
    HOMEBREW_PREFIX="$HOME/brew"
    write_bash_config || exit 1
    write_bash_config || exit 2
    [[ ! -e "$HOME/.profile" && ! -e "$HOME/.bash_profile" ]] || exit 3
    [[ $(grep -c "config/bash/interactive.bash" "$HOME/.bash_login") == 1 ]] || exit 4
    [[ $(grep -c "config/shell/env.sh" "$HOME/.bash_login") == 1 ]] || exit 5
    source "$HOME/.bash_login"
    [[ $PERSONAL_SETTING == retained ]] || exit 6
    grep -q old-managed "$HOME/.zshrc" || exit 7
    retire_zsh_config || exit 8
    [[ $(cat "$HOME/.zshrc") == "alias personal=true" ]] || exit 9
    [[ -r "$HOME/.local/state/bash/history" ]] || exit 10
    [[ $BASH_ENV == "$HOME/.config/shell/env.sh" ]] || exit 11
  ' -- "$MACBOOK_SETUP_SCRIPT"
  [[ "$status" -eq 0 ]]
}

@test "macOS fresh shells retain the selected Homebrew prefix including spaces and quotes" {
  # shellcheck disable=SC2154 # Bats defines BATS_TEST_TMPDIR.
  local fixture="$BATS_TEST_TMPDIR/prefix" prefix="$BATS_TEST_TMPDIR/prefix/brew's tools"
  mkdir -p "$prefix/bin"
  # shellcheck disable=SC2016 # Parameters belong to the isolated shell.
  run env -i HOME="$fixture" PATH=/usr/bin:/bin bash -c '
    source "$1"
    HOMEBREW_PREFIX="$2"
    configure_shell_environment
  ' -- "$MACBOOK_SETUP_SCRIPT" "$prefix"
  [[ "$status" -eq 0 ]]
  # shellcheck disable=SC2016 # The fresh POSIX shell must recover the prefix from disk.
  run env -i HOME="$fixture" PATH=/usr/bin:/bin sh -c '
    . "$HOME/.config/shell/env.sh"
    [ "$HOMEBREW_PREFIX" = "$1" ] || exit 1
    case "$PATH" in "$1/bin:"*) ;; *) exit 2 ;; esac
  ' -- "$prefix"
  [[ "$status" -eq 0 ]]
}
