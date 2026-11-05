#!/usr/bin/env bats
# shellcheck disable=SC2154 # Bats supplies BATS_TEST_TMPDIR and BATS_TEST_DIRNAME.

# Exercise the generated shell code without running either machine installer.
check_cached_startup() {
  local script="$BATS_TEST_DIRNAME/../${2:-wsl-setup.sh}"
  local fixture="$BATS_TEST_TMPDIR/wsl" layout="$1" data_dir tool
  case "$layout" in
    default) data_dir="$fixture/.local/share/mise" ;;
    xdg) data_dir="$fixture/data/mise" ;;
    custom) data_dir="$fixture/custom mise" ;;
    *) return 2 ;;
  esac
  mkdir -p "$fixture/.local/bin" "$fixture/.config/shell" "$fixture/.cache/bash" \
    "$fixture/.local/state/bash" "$data_dir/shims" "$fixture/Project Tools"
  for tool in mise starship zoxide atuin tokei; do
    cat > "$fixture/.local/bin/$tool" << 'TOOL'
#!/bin/sh
tool=${0##*/}
printf '%s %s\n' "$tool" "$*" >> "$WORKSTATION_CALLS"
case "$tool $*" in
  'mise activate bash')
    cat <<'INIT'
export PATH=/generation-time-only
_fixture_mise_hook() { mise hook-env; }
PROMPT_COMMAND=(_fixture_mise_hook)
printf '%s\n' 'cached mise' >> "$WORKSTATION_CALLS"
INIT
    ;;
  'starship init bash --print-full-init'|'zoxide init bash'|'atuin init bash --disable-up-arrow --disable-ai')
    printf 'echo "cached %s" >> "$WORKSTATION_CALLS"\n' "$tool"
    ;;
esac
TOOL
    cat > "$data_dir/shims/$tool" << 'SHIM'
#!/bin/sh
printf 'unexpected shim: %s\n' "$0" >> "$WORKSTATION_CALLS"
exit 99
SHIM
    chmod +x "$fixture/.local/bin/$tool" "$data_dir/shims/$tool"
  done
  for tool in SHELLENV REFRESH BASHRC; do
    awk -v delimiter="$tool" '
      $0 ~ "<<[[:space:]]*." delimiter "." { body = 1; next }
      body && $0 == delimiter { exit }
      body { print }
    ' "$script" > "$fixture/$tool"
    [[ -s "$fixture/$tool" ]]
  done
  cp "$fixture/SHELLENV" "$fixture/.config/shell/env.sh"
  local -a extra_env=()
  case "$layout" in
    xdg) extra_env+=("XDG_DATA_HOME=$fixture/data") ;;
    custom) extra_env+=("MISE_DATA_DIR=$data_dir") ;;
    *) ;;
  esac
  # shellcheck disable=SC2016 # Parameters belong to the generated environment.
  run env -i HOME="$fixture" PATH="$fixture/.local/bin:/usr/bin:/bin" \
    WORKSTATION_CALLS="$fixture/calls" bash "$fixture/REFRESH"
  [[ "$status" -eq 0 ]]
  if [[ $script == */wsl-setup.sh ]]; then
    [[ "$(< "$fixture/calls")" == *"mise activate bash"* ]]
  else
    [[ "$(< "$fixture/calls")" != *"mise activate bash"* ]]
  fi
  : > "$fixture/calls"
  # shellcheck disable=SC2016 # The child bash expands its own parameters.
  run env -i HOME="$fixture" TERM=xterm-256color EDITOR=nvim \
    PATH="$data_dir/shims:$fixture/Project Tools:/usr/bin:/bin" \
    WORKSTATION_CALLS="$fixture/calls" "${extra_env[@]}" \
    bash --noprofile --norc -i -c '
      word_motion() {
        local key
        [[ $SHELLOPTS == *emacs* ]] || return 1
        for key in "\e[1;5D" "\e[1;3D"; do
          [[ "$(bind -p)" == *"\"$key\": backward-word"* ]] || return 1
        done
        for key in "\e[1;5C" "\e[1;3C"; do
          [[ "$(bind -p)" == *"\"$key\": forward-word"* ]] || return 1
        done
      }
      source "$HOME/.config/shell/env.sh"
      alias gco="git checkout" gcm="git commit"
      source "$HOME/BASHRC" || exit 4
      declare -F gco gcm >/dev/null || exit 5
      word_motion || exit 3
      source "$HOME/BASHRC"
      word_motion || exit 3
      [[ ":$PATH:" == *":$HOME/Project Tools:"* ]] || exit 1
      [[ ":$PATH:" != *":$1/shims:"* ]] || exit 2
      for hook in "${PROMPT_COMMAND[@]}"; do eval "$hook"; done
      tokei
      mise run build
    ' -- "$data_dir"
  [[ "$status" -eq 0 ]]
  if [[ $script == */wsl-setup.sh ]]; then
    [[ "$(< "$fixture/calls")" == $'cached mise\ncached zoxide\ncached starship\nmise hook-env\ntokei \nmise run build' ]]
  else
    [[ "$(< "$fixture/calls")" == $'cached zoxide\ncached starship\ntokei \nmise run build' ]]
  fi
}

@test "WSL shell loads cached integrations and invokes host tools with inherited mise shims" {
  local layout
  for layout in default xdg custom; do
    check_cached_startup "$layout"
  done
}

@test "macOS shell invokes host tools directly with inherited mise shims" {
  local layout
  for layout in default xdg custom; do
    check_cached_startup "$layout" macbook-setup.sh
  done
}

@test "installer availability checks reject shim-only host tools" {
  local script fixture="${BATS_TEST_TMPDIR}/installer" tool
  mkdir -p "$fixture/data/mise/shims" "$fixture/host tools"
  for tool in fd bat starship; do
    printf '#!/bin/sh\nexit 99\n' > "$fixture/data/mise/shims/$tool"
    chmod +x "$fixture/data/mise/shims/$tool"
  done
  for script in wsl-setup.sh macbook-setup.sh; do
    awk '
      /^remove_mise_shims_from_path\(\) \{/ { body = 1 }
      body { print }
      body && /^\}/ { exit }
    ' "$BATS_TEST_DIRNAME/../$script" > "$fixture/path.sh"
    # shellcheck disable=SC2016 # The isolated Bash expands its own parameters.
    run env -i HOME="$fixture" XDG_DATA_HOME="$fixture/data" \
      PATH="$fixture/data/mise/shims:$fixture/host tools:/usr/bin:/bin:" \
      bash -c '
        source "$1"
        remove_mise_shims_from_path
        [[ "$PATH" == "$HOME/host tools:/usr/bin:/bin:" ]] || exit 1
        for tool in fd bat starship; do
          [[ "$(command -v "$tool")" != "$HOME/data/mise/shims/"* ]] || exit 1
        done
        command -v git >/dev/null
      ' -- "$fixture/path.sh"
    [[ "$status" -eq 0 ]]
  done
}

@test "WSL setup removes only its own ~/.tmux.conf shim" {
  local fixture="$BATS_TEST_TMPDIR/tmux-shim"
  mkdir -p "$fixture/managed" "$fixture/edited"
  awk '
    /^tmux_shim=/ { body = 1 }
    body { print }
    body && /^fi$/ { exit }
  ' "$BATS_TEST_DIRNAME/../wsl-setup.sh" > "$fixture/cleanup.sh"
  [[ -s "$fixture/cleanup.sh" ]]
  printf '%s\n' '# >>> wsl-bootstrap managed ~/.tmux.conf >>>' 'source-file ~/.config/tmux/tmux.conf' \
    '# <<< wsl-bootstrap managed ~/.tmux.conf <<<' > "$fixture/managed/.tmux.conf"
  {
    cat "$fixture/managed/.tmux.conf"
    printf '%s\n' 'set -g mouse on'
  } > "$fixture/edited/.tmux.conf"

  # shellcheck disable=SC2016 # The child Bash expands its own parameters.
  run bash -c 'warn() { printf "warn: %s\n" "$*"; }; for HOME in "$1/managed" "$1/edited"; do source "$1/cleanup.sh"; done' \
    -- "$fixture"

  [[ "$status" -eq 0 ]]
  [[ ! -e "$fixture/managed/.tmux.conf" ]]
  [[ -e "$fixture/edited/.tmux.conf" ]]
  [[ "$output" == *"remove the wsl-bootstrap block from ~/.tmux.conf"* ]]
}

@test "WSL setup syntax-checks every generated startup file and helper" {
  local fixture="$BATS_TEST_TMPDIR/syntax" broken file
  mkdir -p "$fixture/.local/bin" "$fixture/.config/shell" "$fixture/.config/bash"
  awk '
    /^# Syntax checks validate/ { body = 1 }
    body && /^echo / { exit }
    body { print }
  ' "$BATS_TEST_DIRNAME/../wsl-setup.sh" > "$fixture/check.sh"
  [[ -s "$fixture/check.sh" ]]
  for broken in none toolhelp wsl-shell-refresh tmux-sessionizer tmux-cht .config/bash/interactive.bash .config/shell/env.sh; do
    for file in .local/bin/toolhelp .local/bin/wsl-shell-refresh .local/bin/tmux-sessionizer \
      .local/bin/tmux-cht .config/bash/interactive.bash .config/shell/env.sh; do
      if [[ "$file" == "$broken" || "$file" == ".local/bin/$broken" ]]; then
        printf 'if then\n' > "$fixture/$file"
      else
        printf 'true\n' > "$fixture/$file"
      fi
    done
    run env -i HOME="$fixture" PATH=/usr/bin:/bin bash -e "$fixture/check.sh"
    if [[ "$broken" == none ]]; then
      [[ "$status" -eq 0 ]]
    else
      [[ "$status" -ne 0 ]]
    fi
  done
}

# Standard system installation paths are intentionally visible to these shell
# fixtures. Assertions check ordering and preservation, not an exact full PATH.
@test "generated environment preserves caller toolchains across agent shells" {
  local script shell fixture="$BATS_TEST_TMPDIR/environment"
  mkdir -p "$fixture/.config/shell" "$fixture/.cargo/bin" "$fixture/project tools" "$fixture/mise/shims" "$fixture/literal[*]"
  printf '#!/bin/sh\nprintf "project\\n"\n' > "$fixture/project tools/node"
  printf '#!/bin/sh\nprintf "host\\n"\n' > "$fixture/.cargo/bin/node"
  chmod +x "$fixture/project tools/node" "$fixture/.cargo/bin/node"
  for script in wsl-setup.sh macbook-setup.sh; do
    awk '
      /<<[[:space:]]*.SHELLENV./ { body = 1; next }
      body && /^SHELLENV$/ { exit }
      body { print }
    ' "$BATS_TEST_DIRNAME/../$script" > "$fixture/.config/shell/env.sh"
    for shell in /bin/sh /bin/bash; do
      # shellcheck disable=SC2016 # Parameters belong to the isolated shell.
      run env -i HOME="$fixture" MISE_DATA_DIR="$fixture/mise" JAVA_HOME="$fixture/project-java" \
        PATH=":$fixture/project tools::$fixture/mise/shims:/usr/bin:$fixture/literal[*]:$fixture/mise/shims:/bin:/mnt/c/Windows Tools:$fixture/.cargo/bin:" \
        "$shell" -c '
          . "$HOME/.config/shell/env.sh"
          first=$PATH
          . "$HOME/.config/shell/env.sh"
          [ "$PATH" = "$first" ] || exit 1
          if [ "$1" = wsl-setup.sh ]; then
            case "$PATH" in "$HOME/project tools:"*) ;; *) exit 2 ;; esac
            case "$PATH" in :*|*::*|*:) exit 3 ;; esac
            case "$PATH" in *"/mnt/c/Windows Tools"*) exit 3 ;; esac
          else
            case "$PATH" in ":$HOME/project tools::"*) ;; *) exit 2 ;; esac
            case "$PATH" in *"/mnt/c/Windows Tools:") ;; *) exit 3 ;; esac
          fi
          case "$PATH" in *"/mise/shims"*) exit 4 ;; esac
          case "$PATH" in *"$HOME/.cargo/bin:"*"/usr/bin:"*) ;; *) exit 5 ;; esac
          [ "$(node)" = project ] || exit 6
          [ "$JAVA_HOME" = "$HOME/project-java" ] || exit 7
          case "$PATH" in *":$HOME/literal[*]:"*) ;; *) exit 8 ;; esac
        ' -- "$script"
      [[ "$status" -eq 0 ]]
    done
  done
}

@test "environment loaders converge and preserve existing startup files" {
  local script fixture="$BATS_TEST_TMPDIR/loaders"
  for script in wsl-setup.sh macbook-setup.sh; do
    mkdir -p "$fixture"
    printf '%s\n' 'export USER_SETTING=preserved' > "$fixture/.bash_profile"
    chmod 0600 "$fixture/.bash_profile"
    awk '
      /^configure_shell_environment\(\) \{/ { body = 1 }
      body { print }
      body && /^\}/ { exit }
    ' "$BATS_TEST_DIRNAME/../$script" > "$fixture/configure.sh"
    # shellcheck disable=SC2016 # Parameters belong to the isolated shell.
    run env -i HOME="$fixture" PATH=/usr/bin:/bin bash -e -c '
      source "$HOME/configure.sh"
      write_managed_file() { mkdir -p "${1%/*}"; cat > "$1"; }
      die() { echo "$*" >&2; exit 1; }
      fatal() { die "$@"; }
      HOMEBREW_PREFIX="$HOME/brew"
      configure_shell_environment
      configure_shell_environment
      [[ ! -e "$HOME/.profile" ]] || exit 1
      for file in .bash_profile .bashrc; do
        [[ "$(grep -c "config/shell/env.sh" "$HOME/$file")" == 1 ]] || exit 2
      done
      source "$HOME/.bash_profile"
      [[ "$USER_SETTING" == preserved ]] || exit 3
      loader=.bashrc
      [[ ! -e "$HOME/.zshenv" ]] || exit 2
      [[ ! -e "$HOME/.zprofile" ]] || exit 2
      rm "$HOME/$loader"
      ln -s "$HOME/.bash_profile" "$HOME/$loader"
      if (configure_shell_environment); then exit 4; fi
      [[ -L "$HOME/$loader" ]] || exit 5
    ' -- "$script"
    [[ "$status" -eq 0 ]]
    [[ "$(stat -c '%a' "$fixture/.bash_profile" 2> /dev/null || stat -f '%Lp' "$fixture/.bash_profile")" == 600 ]]
    rm -f "$fixture/.zshenv" "$fixture/.zprofile" "$fixture/.bashrc"
  done
}

@test "WSL Windows PATH trimming preserves prepended toolchains and honors the opt-in" {
  local fixture="$BATS_TEST_TMPDIR/windows-path" keep shell
  mkdir -p "$fixture"
  awk '
    /<<[[:space:]]*.SHELLENV./ { body = 1; next }
    body && /^SHELLENV$/ { exit }
    body { print }
  ' "$BATS_TEST_DIRNAME/../wsl-setup.sh" > "$fixture/env.sh"
  for keep in 0 1; do
    for shell in /bin/sh /bin/bash; do
      # shellcheck disable=SC2016 # Parameters belong to the isolated shell.
      run env -i HOME="$fixture" WSL_KEEP_WINDOWS_PATH="$keep" \
        PATH='/mnt/c/Project Tools:/usr/bin:/bin:/mnt/c/Windows Tools' \
        "$shell" -c '
          . "$HOME/env.sh"
          case "$PATH" in "/mnt/c/Project Tools:"*) ;; *) exit 1 ;; esac
          case ":$PATH:" in
            *":/mnt/c/Windows Tools:"*) [ "$WSL_KEEP_WINDOWS_PATH" = 1 ] || exit 2 ;;
            *) [ "$WSL_KEEP_WINDOWS_PATH" = 0 ] || exit 3 ;;
          esac
        '
      [[ "$status" -eq 0 ]]
    done
  done
}

@test "macOS environment retains Homebrew manual paths and caller prefixes" {
  local fixture="$BATS_TEST_TMPDIR/homebrew"
  mkdir -p "$fixture/brew/bin" "$fixture/brew/sbin"
  awk '
    /<<[[:space:]]*.SHELLENV./ { body = 1; next }
    body && /^SHELLENV$/ { exit }
    body { print }
  ' "$BATS_TEST_DIRNAME/../macbook-setup.sh" > "$fixture/env.sh"
  # shellcheck disable=SC2016 # The isolated shell expands the fixture variables.
  run env -i HOME="$fixture" PATH="$fixture/project:/usr/bin:/bin" \
    HOMEBREW_PREFIX="$fixture/brew" MANPATH=/custom/man: INFOPATH=/custom/info: \
    sh -c '
      . "$HOME/env.sh"
      first=$MANPATH
      . "$HOME/env.sh"
      [ "$MANPATH" = "$first" ] || exit 1
      # Native Homebrew wins on macOS; the fixture prefix is used on Linux.
      [ "$MANPATH" = "$HOMEBREW_PREFIX/share/man:/custom/man:" ] || exit 2
      [ "$INFOPATH" = "$HOMEBREW_PREFIX/share/info:/custom/info:" ] || exit 3
      case "$PATH" in "$HOME/project:"*"$HOMEBREW_PREFIX/bin:"*"/usr/bin:"*) ;; *) exit 4 ;; esac
    '
  [[ "$status" -eq 0 ]]
}

@test "native fallbacks precede Ubuntu and macOS system search paths" {
  local script layout fixture="$BATS_TEST_TMPDIR/system-path"
  mkdir -p "$fixture/.cargo/bin"
  for script in wsl-setup.sh macbook-setup.sh; do
    awk '
      /<<[[:space:]]*.SHELLENV./ { body = 1; next }
      body && /^SHELLENV$/ { exit }
      body { print }
    ' "$BATS_TEST_DIRNAME/../$script" > "$fixture/env.sh"
    for layout in \
      '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/bin:/mnt/c/Windows' \
      '/usr/local/bin:/System/Cryptexes/App/usr/bin:/usr/bin:/bin:/usr/sbin:/sbin'; do
      # shellcheck disable=SC2016 # The isolated shell expands the fixture variables.
      run env -i HOME="$fixture" PATH="$fixture/project:$layout:$fixture/.cargo/bin" \
        sh -c '
          . "$HOME/env.sh"
          case "$PATH" in "$HOME/project:"*"$HOME/.cargo/bin:"*"/usr/local/bin:"*) ;; *) exit 1 ;; esac
        '
      [[ "$status" -eq 0 ]]
    done
  done
}

@test "WSL prepares private history storage at default and custom state paths" {
  local layout fixture state_home history_dir
  for layout in default custom; do
    fixture="$BATS_TEST_TMPDIR/history-$layout"
    mkdir -p "$fixture"
    state_home=""
    history_dir="$fixture/.local/state/bash"
    if [[ "$layout" == custom ]]; then
      state_home="$fixture/state with spaces"
      history_dir="$state_home/bash"
    fi
    awk '
      /^BASHRC$/ { body = 1; next }
      body && /^configure_shell_environment$/ { exit }
      body { print }
    ' "$BATS_TEST_DIRNAME/../wsl-setup.sh" > "$fixture/prepare.sh"
    [[ -s "$fixture/prepare.sh" ]]

    run env -i HOME="$fixture" XDG_STATE_HOME="$state_home" PATH=/usr/bin:/bin \
      bash -e "$fixture/prepare.sh"
    [[ "$status" -eq 0 ]]
    [[ -f "$history_dir/history" ]]
    [[ "$(stat -c '%a' "$history_dir" 2> /dev/null || stat -f '%Lp' "$history_dir")" == 700 ]]
    [[ "$(stat -c '%a' "$history_dir/history" 2> /dev/null || stat -f '%Lp' "$history_dir/history")" == 600 ]]

    printf '%s\n' 'saved command' > "$history_dir/history"
    run env -i HOME="$fixture" XDG_STATE_HOME="$state_home" PATH=/usr/bin:/bin \
      bash -e "$fixture/prepare.sh"
    [[ "$status" -eq 0 ]]
    [[ "$(< "$history_dir/history")" == 'saved command' ]]
  done
}

@test "WSL Bash login loaders preserve profiles and quiet child environments" {
  local fixture="$BATS_TEST_TMPDIR/bash-login" profile
  mkdir -p "$fixture/.config/bash"
  awk '
    /^configure_shell_environment\(\) \{/ { body = 1 }
    body { print }
    body && /^\}/ { exit }
  ' "$BATS_TEST_DIRNAME/../wsl-setup.sh" > "$fixture/configure.sh"
  awk '
    /<<[[:space:]]*.BASHRC./ { body = 1; next }
    body && /^BASHRC$/ { exit }
    body { print }
  ' "$BATS_TEST_DIRNAME/../wsl-setup.sh" > "$fixture/.config/bash/interactive.bash"
  for profile in .profile .bash_login .bash_profile; do
    printf 'export USER_SETTING=preserved\n' > "$fixture/$profile"
    # shellcheck disable=SC2016 # Parameters belong to the isolated Bash.
    run env -i HOME="$fixture" PATH=/usr/bin:/bin bash -e -c '
      source "$HOME/configure.sh"
      write_managed_file() { mkdir -p "${1%/*}"; cat > "$1"; }
      die() { echo "$*" >&2; exit 1; }
      configure_shell_environment
      configure_shell_environment
      source "$HOME/$1"
      [[ $USER_SETTING == preserved ]]
      [[ $(grep -c config/bash/interactive.bash "$HOME/$1") == 1 ]]
      [[ ! -e "$HOME/.zshenv" ]]
      PATH=/stale/shims:/usr/bin:/bin bash -ec '\''
        [[ $PATH == *"$HOME/.local/bin"* ]]
        [[ ! ${_WSL_BASH_LOADED:-} ]]
      '\''
      BASH_ENV=/custom/env.sh
      source "$HOME/.config/shell/env.sh"
      [[ $BASH_ENV == /custom/env.sh ]]
    ' -- "$profile"
    [[ "$status" -eq 0 ]]
  done
}

@test "WSL toolhelp completion offers commands tools and categories" {
  local fixture="$BATS_TEST_TMPDIR/toolhelp"
  mkdir -p "$fixture"
  awk '
    /<<[[:space:]]*.TOOLHELP_COMPLETION./ { body = 1; next }
    body && /^TOOLHELP_COMPLETION$/ { exit }
    body { print }
  ' "$BATS_TEST_DIRNAME/../wsl-setup.sh" > "$fixture/completion.bash"
  # shellcheck disable=SC2016 # The isolated Bash supplies completion parameters.
  run bash -c '
    source "$1"
    COMP_WORDS=(toolhelp bas); COMP_CWORD=1; _toolhelp
    [[ ${COMPREPLY[*]} == bash ]] || exit 1
    COMP_WORDS=(toolhelp category wo); COMP_CWORD=2; _toolhelp
    [[ ${COMPREPLY[*]} == "workflow workspace" ]] || exit 2
    COMP_WORDS=(toolhelp ca); COMP_CWORD=1; _toolhelp
    [[ ${COMPREPLY[*]} == "categories category cargo-binstall" ]] || exit 3
  ' -- "$fixture/completion.bash"
  [[ "$status" -eq 0 ]]
}

@test "WSL loads managed completions on demand with a custom data directory" {
  [[ -r /usr/share/bash-completion/bash_completion ]] || skip "requires Ubuntu bash-completion"
  local fixture="$BATS_TEST_TMPDIR/lazy-completion"
  mkdir -p "$fixture/data/bash-completion/completions" "$fixture/data"
  awk '
    /<< .BASHRC./ { body = 1; next }
    body && /^BASHRC$/ { exit }
    body { print }
  ' "$BATS_TEST_DIRNAME/../wsl-setup.sh" > "$fixture/interactive.bash"
  cat > "$fixture/data/bash-completion/completions/workstation-probe" << 'COMPLETION'
_fixture_complete() { COMPREPLY=(working); }
complete -F _fixture_complete workstation-probe
COMPLETION
  # shellcheck disable=SC2016 # Expand only inside the fixture shell.
  run env -i HOME="$fixture" XDG_DATA_HOME="$fixture/data" PATH=/usr/bin:/bin \
    bash --noprofile --norc -ic '
      source "$HOME/interactive.bash"
      declare -F _fixture_complete && exit 1
      _completion_loader workstation-probe
      [[ $? == 124 ]] || exit 2
      [[ $(complete -p workstation-probe) == *"-F _fixture_complete"* ]] || exit 3
      _fixture_complete
      [[ ${COMPREPLY[*]} == working ]] || exit 4
    '
  [[ "$status" -eq 0 ]]
}

@test "WSL completion generation preserves personal files and refreshes managed files" {
  local script="$BATS_TEST_DIRNAME/../wsl-setup.sh" helper
  for helper in atomic_install_file write_managed_file generate_completion; do
    source /dev/stdin <<< "$(sed -n "/^$helper()/,/^}/p" "$script")"
  done
  make_tmpfile() { mktemp "$BATS_TEST_TMPDIR/completion.XXXXXX"; }
  warn() { printf '%s\n' "$*" >&2; }
  die() { return 1; }
  local personal="$BATS_TEST_TMPDIR/personal" managed="$BATS_TEST_TMPDIR/managed"
  printf '%s\n' '# personal completion' > "$personal"
  generate_completion "$personal" printf '%s\n' '# replacement'
  [[ "$(< "$personal")" == '# personal completion' ]]
  generate_completion "$managed" printf '%s\n' '# first version'
  generate_completion "$managed" printf '%s\n' '# refreshed version'
  [[ "$(< "$managed")" == *'# refreshed version' ]]
  [[ "$(< "$managed")" != *'# first version'* ]]
}

@test "Bash terminal startup enables Atuin before Starship without an opt-in" {
  [[ $OSTYPE == linux* ]] || skip "requires util-linux script"
  command -v script > /dev/null || skip "requires util-linux script"
  local fixture="$BATS_TEST_TMPDIR/terminal" script
  for script in wsl-setup.sh macbook-setup.sh; do
    mkdir -p "$fixture/brew/opt/fzf/shell"
    : > "$fixture/brew/opt/fzf/shell/key-bindings.bash"
    : > "$fixture/calls"
    mkdir -p "$fixture/.cache/bash" "$fixture/.local/bin" "$fixture/.config/bash"
    awk '
    /<< .BASHRC./ { body = 1; next }
    body && /^BASHRC$/ { exit }
    body { print }
  ' "$BATS_TEST_DIRNAME/../$script" > "$fixture/interactive.bash"
    # shellcheck disable=SC2016 # These scripts expand HOME in the fixture shell.
    {
      printf '%s\n' 'echo personal >> "$HOME/calls"' > "$fixture/.config/bash/local.bash"
      printf '%s\n' 'echo atuin >> "$HOME/calls"' > "$fixture/.cache/bash/atuin.bash"
      printf '%s\n' 'echo starship >> "$HOME/calls"' > "$fixture/.cache/bash/starship.bash"
    }
    printf '#!/bin/sh\nexit 0\n' > "$fixture/.local/bin/starship"
    chmod +x "$fixture/.local/bin/starship"
    cat > "$fixture/rc" << 'RC'
enable() { [[ $1 == -f && $3 == flyline ]] && echo editor >> "$HOME/calls"; }
flyline() {
  [[ $1 == set-cursor ]] || return 0
  local arg
  case " $* " in
    *' --backend terminal '* | *' --backend=terminal '*)
      for arg; do
        case "$arg" in
          --style | --style=* | --effect*)
            echo 'flyline set-cursor: --style, --effect, --effect-speed, and --effect-easing require --backend flyline' >&2
            return 2
            ;;
        esac
      done
      ;;
  esac
}
source "$HOME/interactive.bash"
source "$HOME/interactive.bash"
exit
RC
    # shellcheck disable=SC2016 # The terminal child expands its fixture HOME.
    run env -i HOME="$fixture" HOMEBREW_PREFIX="$fixture/brew" SHELL=/bin/bash TERM=xterm-256color \
      PATH="$fixture/.local/bin:/usr/bin:/bin" script -q -e -c 'bash --noprofile --rcfile "$HOME/rc" -i' /dev/null
    [[ "$status" -eq 0 ]]
    [[ "$output" != *'require --backend flyline'* ]]
    [[ "$(< "$fixture/calls")" == $'atuin\nstarship\neditor\npersonal' ]]
  done
}

@test "WSL fuzzy directory selection runs directory-change hooks before returning" {
  local fixture="$BATS_TEST_TMPDIR/fcd"
  mkdir -p "$fixture/project with spaces"
  awk '/<< .BASHRC./ { body = 1; next } body && /^BASHRC$/ { exit } body { print }' \
    "$BATS_TEST_DIRNAME/../wsl-setup.sh" > "$fixture/interactive.bash"
  # shellcheck disable=SC2016 # The fixture shell expands its own HOME and PWD.
  run env -i HOME="$fixture" PATH=/usr/bin:/bin bash --noprofile --norc -ic '
    source "$HOME/interactive.bash"
    fd() { printf "%s\n" "$HOME/project with spaces"; }
    fzf() { cat; }
    cd() { builtin cd "$@" && export TOOLCHAIN_DIRECTORY="$PWD"; }
    fcd
    [[ $PWD == "$HOME/project with spaces" && $TOOLCHAIN_DIRECTORY == "$PWD" ]]
  '
  [[ "$status" -eq 0 ]]
}

@test "WSL Atuin defaults honor native config paths and preserve user configuration" {
  local fixture="$BATS_TEST_TMPDIR/atuin" layout config_dir
  mkdir -p "$fixture"
  awk '/^# Atuin stays local/ { body = 1 } body { print } body && /^fi$/ { exit }' \
    "$BATS_TEST_DIRNAME/../wsl-setup.sh" > "$fixture/configure.sh"
  for layout in default xdg override; do
    local -a extra_env=()
    case "$layout" in
      default) config_dir="$fixture/.config/atuin" ;;
      xdg)
        config_dir="$fixture/xdg config/atuin"
        extra_env+=("XDG_CONFIG_HOME=$fixture/xdg config")
        ;;
      override)
        config_dir="$fixture/atuin config"
        extra_env+=("ATUIN_CONFIG_DIR=$config_dir")
        ;;
      *) return 2 ;;
    esac
    run env -i HOME="$fixture" PATH=/usr/bin:/bin "${extra_env[@]}" bash -e "$fixture/configure.sh"
    [[ "$status" -eq 0 && -s "$config_dir/config.toml" ]]
    printf 'enter_accept = true\n' > "$config_dir/config.toml"
    run env -i HOME="$fixture" PATH=/usr/bin:/bin "${extra_env[@]}" bash -e "$fixture/configure.sh"
    [[ "$status" -eq 0 && "$(< "$config_dir/config.toml")" == 'enter_accept = true' ]]
    rm "$config_dir/config.toml"
    ln -s "$fixture/absent-target" "$config_dir/config.toml"
    run env -i HOME="$fixture" PATH=/usr/bin:/bin "${extra_env[@]}" bash -e "$fixture/configure.sh"
    [[ "$status" -eq 0 && -L "$config_dir/config.toml" && ! -e "$fixture/absent-target" ]]
  done
}

@test "shell refresh removes cached integrations for uninstalled tools" {
  local script fixture="$BATS_TEST_TMPDIR/refresh" tool
  mkdir -p "$fixture/.cache/bash" "$fixture/bin"
  for script in wsl-setup.sh macbook-setup.sh; do
    awk '/<< .REFRESH./ { body = 1; next } body && /^REFRESH$/ { exit } body { print }' \
      "$BATS_TEST_DIRNAME/../$script" > "$fixture/refresh.sh"
    for tool in starship zoxide atuin mise; do
      printf 'stale hook\n' > "$fixture/.cache/bash/$tool.bash"
    done
    run env -i HOME="$fixture" PATH=/usr/bin:/bin bash "$fixture/refresh.sh"
    [[ "$status" -eq 0 ]]
    for tool in starship zoxide atuin; do
      [[ ! -e "$fixture/.cache/bash/$tool.bash" ]]
    done
  done
}

@test "Flyline directory selection inserts a command and cancellation preserves input" {
  [[ $OSTYPE == linux* ]] || skip "requires util-linux script"
  command -v script > /dev/null || skip "requires util-linux script"
  local script fixture="$BATS_TEST_TMPDIR/pickers"
  mkdir -p "$fixture/brew/opt/fzf/shell" "$fixture/dir with spaces"
  : > "$fixture/brew/opt/fzf/shell/key-bindings.bash"
  for script in wsl-setup.sh macbook-setup.sh; do
    awk '/<< .BASHRC./ { body = 1; next } body && /^BASHRC$/ { exit } body { print }' \
      "$BATS_TEST_DIRNAME/../$script" > "$fixture/interactive.bash"
    cat > "$fixture/rc" << 'RC'
enable() { return 0; }
flyline() { [[ $1 != key ]] || printf '%s\n' "$*" >> "$HOME/bindings"; }
source "$HOME/interactive.bash"
__fzf_cd__() { return 1; }
READLINE_LINE='echo unfinished' READLINE_POINT=15
before=$PWD
_flyline_fzf_cd
[[ $PWD == "$before" && $READLINE_LINE == 'echo unfinished' && $READLINE_POINT == 15 ]] || exit 1
__fzf_cd__() { printf 'builtin cd -- %q' "$HOME/dir with spaces"; }
_flyline_fzf_cd
[[ $PWD == "$before" && $READLINE_LINE == "$(__fzf_cd__)" && $READLINE_POINT == ${#READLINE_LINE} ]] || exit 2
if grep -E '(Ctrl\+r|Alt\+c).*submitOrNewline' "$HOME/bindings"; then exit 3; fi
eval "$READLINE_LINE"
[[ $PWD == "$HOME/dir with spaces" ]] || exit 4
exit 0
RC
    # shellcheck disable=SC2016 # The terminal child expands its fixture HOME.
    run env -i HOME="$fixture" HOMEBREW_PREFIX="$fixture/brew" SHELL=/bin/bash TERM=xterm-256color \
      PATH=/usr/bin:/bin script -q -e -c 'bash --noprofile --rcfile "$HOME/rc" -i' /dev/null
    [[ "$status" -eq 0 ]]
  done
}

@test "Flyline installation verifies release bytes before replacing the library" {
  local fixture="$BATS_TEST_TMPDIR/flyline" helper digest corrupt
  mkdir -p "$fixture/archive" "$fixture/.local/lib/bash"
  printf 'verified library\n' > "$fixture/archive/libflyline.so.1.10.0"
  tar -czf "$fixture/release.tar.gz" -C "$fixture/archive" libflyline.so.1.10.0
  digest="$(sha256sum "$fixture/release.tar.gz")"
  digest="sha256:${digest%% *}"
  for helper in install_flyline verify_sha256_digest extract_release_asset archive_members_are_safe atomic_install_file; do
    sed -n "/^$helper()/,/^}/p" "$BATS_TEST_DIRNAME/../wsl-setup.sh" >> "$fixture/helpers.sh"
  done
  for corrupt in 0 1; do
    printf 'existing library\n' > "$fixture/.local/lib/bash/flyline"
    # shellcheck disable=SC2016 # The fixture shell supplies download helpers.
    run env -i HOME="$fixture" PATH=/usr/bin:/bin bash -e -c '
      source "$HOME/helpers.sh"
      BOOTSTRAP_GITHUB_UPGRADE=1
      die() { echo "$*" >&2; exit 1; }
      warn() { echo "$*" >&2; }
      make_tmpdir() { mktemp -d "$HOME/download.XXXXXX"; }
      uname() { echo x86_64; }
      github_api_fetch() {
        jq -n --arg digest "$fixture_digest" '\''{assets: [{name: "libflyline-v1.10.0-x86_64-unknown-linux-gnu.tar.gz", browser_download_url: "https://github.com/HalFrgrd/flyline/releases/download/v1.10.0/library.tar.gz", digest: $digest}]}'\''
      }
      fixture_digest=$1
      curl_fetch() {
        cp "$HOME/release.tar.gz" "$3"
        if [[ $corrupt == 1 ]]; then
          printf "tampered library\n" > "$HOME/archive/libflyline.so.1.10.0"
          tar -czf "$3" -C "$HOME/archive" libflyline.so.1.10.0
        fi
      }
      corrupt=$2
      install_flyline
    ' -- "$digest" "$corrupt"
    if [[ $corrupt == 0 ]]; then
      [[ "$status" -eq 0 && $(< "$fixture/.local/lib/bash/flyline") == 'verified library' ]]
    else
      [[ "$status" -ne 0 && $(< "$fixture/.local/lib/bash/flyline") == 'existing library' ]]
      [[ "$output" == *'SHA-256 verification failed'* ]]
    fi
  done
}
