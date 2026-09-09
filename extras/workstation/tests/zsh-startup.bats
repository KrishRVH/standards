#!/usr/bin/env bats
# shellcheck disable=SC2154 # Bats supplies BATS_TEST_TMPDIR and BATS_TEST_DIRNAME.

# Exercise the generated shell code without running either machine installer.
check_zsh_startup() {
  local script="$1" delimiter="$2" layout="$3"
  local fixture="${BATS_TEST_TMPDIR}/shell" data_dir tool
  mkdir -p "$fixture/.cargo/bin" "$fixture/.oh-my-zsh" "$fixture/Windows Tools"
  cat > "$fixture/.oh-my-zsh/oh-my-zsh.sh" << 'OMZ'
git --version >/dev/null
zstyle -s ':omz:update' mode update_mode
[[ "$update_mode" == disabled ]] || echo 'unexpected startup updater' >> "$WORKSTATION_CALLS"
OMZ
  : > "$fixture/calls"
  case "$layout" in
    default) data_dir="$fixture/.local/share/mise" ;;
    xdg) data_dir="$fixture/data/mise" ;;
    custom) data_dir="$fixture/custom mise" ;;
    *) return 2 ;;
  esac
  mkdir -p "$data_dir/shims"
  for tool in mise starship zoxide atuin tokei; do
    cat > "$data_dir/shims/$tool" << 'SHIM'
#!/bin/sh
echo "unexpected mise dispatch: $0 $*" >> "$WORKSTATION_CALLS"
exit 99
SHIM
    chmod +x "$data_dir/shims/$tool"
    cat > "$fixture/.cargo/bin/$tool" << 'TOOL'
#!/bin/sh
echo "${0##*/}" >> "$WORKSTATION_CALLS"
TOOL
    chmod +x "$fixture/.cargo/bin/$tool"
  done
  cp "$data_dir/shims/mise" "$data_dir/shims/git"

  awk -v delimiter="$delimiter" '
    $0 ~ "<< ." delimiter "." { body = 1; next }
    body && $0 == delimiter { exit }
    body { print }
  ' "$script" > "$fixture/startup.zsh"
  [[ -s "$fixture/startup.zsh" ]]
  mkdir -p "$fixture/.config/shell"
  awk '
    /<< .SHELLENV./ { body = 1; next }
    body && /^SHELLENV$/ { exit }
    body { print }
  ' "$script" > "$fixture/.config/shell/env.sh"

  local -a extra_env=()
  case "$layout" in
    xdg) extra_env+=("XDG_DATA_HOME=$fixture/data") ;;
    custom) extra_env+=("MISE_DATA_DIR=$data_dir") ;;
    *) ;;
  esac
  # shellcheck disable=SC2016 # The child zsh expands its own parameters.
  run env -i HOME="$fixture" CARGO_HOME="$fixture/.cargo" TERM=xterm-256color \
    PATH="$data_dir/shims:$fixture/Windows Tools:/usr/bin:/bin" \
    WORKSTATION_CALLS="$fixture/calls" "${extra_env[@]}" \
    zsh -f -i -c '
      source "$1"
      source "$1"
      [[ ":$PATH:" == *":$HOME/Windows Tools:"* ]] || exit 1
      [[ ":$PATH:" != *":$2/shims:"* ]] || exit 1
      for hook in $precmd_functions; do "$hook"; done
      tokei
      mise run build
    ' -- "$fixture/startup.zsh" "$data_dir"
  [[ "$status" -eq 0 ]]
  [[ "$(< "$fixture/calls")" = $'starship\nzoxide\natuin\nstarship\nzoxide\natuin\ntokei\nmise' ]]
}

@test "WSL shell invokes host tools directly with inherited mise shims" {
  local layout
  for layout in default xdg custom; do
    check_zsh_startup "$BATS_TEST_DIRNAME/../wsl-setup.sh" ZSHRC "$layout"
  done
}

@test "macOS shell invokes host tools directly with inherited mise shims" {
  local layout
  for layout in default xdg custom; do
    check_zsh_startup "$BATS_TEST_DIRNAME/../macbook-setup.sh" ZSHCONFIG "$layout"
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

@test "WSL environment leaves completion initialization to the interactive config" {
  local fixture="${BATS_TEST_TMPDIR}/completion"
  mkdir -p "$fixture"
  printf '%s\n' 'zmodload zsh/zprof' 'export USER_SETTING=preserved' > "$fixture/.zshenv"
  chmod 0600 "$fixture/.zshenv"
  awk '
    /^configure_zshenv\(\) \{/ { body = 1 }
    body { print }
    body && /^\}/ { exit }
  ' "$BATS_TEST_DIRNAME/../wsl-setup.sh" > "$fixture/configure.sh"
  # shellcheck disable=SC2016 # Parameters belong to the isolated shells.
  run env -i HOME="$fixture" ZDOTDIR="$fixture" PATH=/usr/bin:/bin \
    bash -c '
      source "$HOME/configure.sh"
      configure_zshenv
      configure_zshenv
      [[ "$(grep -cx skip_global_compinit=1 "$HOME/.zshenv")" == 1 ]] || exit 1
      zsh -ic '\''
        [[ "$USER_SETTING" == preserved ]] || exit 1
        autoload -Uz compinit
        compinit -D -i
        zprof
      '\''
    '
  [[ "$status" -eq 0 ]]
  [[ "$output" = *"compinit"* ]]
  [[ "$(awk '$NF == "compinit" && $1 ~ /^[0-9]+\)$/ {print $2; exit}' <<< "$output")" == 1 ]]
  [[ "$(stat -c '%a' "$fixture/.zshenv" 2> /dev/null || stat -f '%Lp' "$fixture/.zshenv")" == 600 ]]
}

@test "refusing an unmanaged WSL shell leaves its completion environment intact" {
  local fixture="${BATS_TEST_TMPDIR}/unmanaged"
  mkdir -p "$fixture"
  printf '%s\n' '# Personal shell using Ubuntu completion.' > "$fixture/.zshrc"
  cp "$fixture/.zshrc" "$fixture/expected"
  awk '
    /^(write_managed_file|configure_zshenv)\(\) \{/ { body = 1 }
    body { print }
    body && /^\}/ { body = 0 }
  ' "$BATS_TEST_DIRNAME/../wsl-setup.sh" > "$fixture/helpers.sh"
  awk '
    /^configure_zshenv$/ || /^ZSHRC_MARKER=/ { body = 1 }
    /^ZSH_PATH=/ { exit }
    body { print }
  ' "$BATS_TEST_DIRNAME/../wsl-setup.sh" > "$fixture/configure.sh"
  # shellcheck disable=SC2016 # The isolated shell expands its own HOME.
  run env -i HOME="$fixture" PATH=/usr/bin:/bin bash -e -c '
    source "$HOME/helpers.sh"
    make_tmpfile() { mktemp "$HOME/write.XXXXXX"; }
    warn() { printf "%s\n" "$*" >&2; }
    die() { warn "$@"; exit 1; }
    source "$HOME/configure.sh"
  '
  [[ "$status" -ne 0 ]]
  [[ "$output" == *"refusing to overwrite unmanaged file"* ]]
  cmp -s "$fixture/.zshrc" "$fixture/expected"
  [[ ! -e "$fixture/.zshenv" ]]
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
      /<< .SHELLENV./ { body = 1; next }
      body && /^SHELLENV$/ { exit }
      body { print }
    ' "$BATS_TEST_DIRNAME/../$script" > "$fixture/.config/shell/env.sh"
    # shellcheck disable=SC2016 # Expanded when the child reads .zshenv.
    printf '%s\n' '. "$HOME/.config/shell/env.sh"' > "$fixture/.zshenv"
    for shell in /bin/sh /bin/bash /bin/zsh; do
      # shellcheck disable=SC2016 # Parameters belong to the isolated shell.
      run env -i HOME="$fixture" MISE_DATA_DIR="$fixture/mise" JAVA_HOME="$fixture/project-java" \
        PATH=":$fixture/project tools::$fixture/mise/shims:/usr/bin:$fixture/literal[*]:$fixture/mise/shims:/bin:/mnt/c/Windows Tools:$fixture/.cargo/bin:" \
        "$shell" -c '
          . "$HOME/.config/shell/env.sh"
          first=$PATH
          . "$HOME/.config/shell/env.sh"
          [ "$PATH" = "$first" ] || exit 1
          case "$PATH" in ":$HOME/project tools::"*) ;; *) exit 2 ;; esac
          case "$PATH" in *"/mnt/c/Windows Tools:") ;; *) exit 3 ;; esac
          case "$PATH" in *"/mise/shims"*) exit 4 ;; esac
          case "$PATH" in *"$HOME/.cargo/bin:"*"/usr/bin:"*) ;; *) exit 5 ;; esac
          [ "$(node)" = project ] || exit 6
          [ "$JAVA_HOME" = "$HOME/project-java" ] || exit 7
          case "$PATH" in *":$HOME/literal[*]:"*) ;; *) exit 8 ;; esac
        '
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
      configure_shell_environment
      configure_shell_environment
      [[ ! -e "$HOME/.profile" ]] || exit 1
      for file in .zshenv .zprofile .bash_profile .bashrc; do
        [[ "$(grep -c "config/shell/env.sh" "$HOME/$file")" == 1 ]] || exit 2
      done
      source "$HOME/.bash_profile"
      [[ "$USER_SETTING" == preserved ]] || exit 3
      rm "$HOME/.zprofile"
      ln -s "$HOME/.bash_profile" "$HOME/.zprofile"
      if (configure_shell_environment); then exit 4; fi
      [[ -L "$HOME/.zprofile" ]] || exit 5
    '
    [[ "$status" -eq 0 ]]
    [[ "$(stat -c '%a' "$fixture/.bash_profile" 2> /dev/null || stat -f '%Lp' "$fixture/.bash_profile")" == 600 ]]
    rm "$fixture/.zprofile"
  done
}

@test "macOS environment retains Homebrew manual paths and caller prefixes" {
  local fixture="$BATS_TEST_TMPDIR/homebrew"
  mkdir -p "$fixture/brew/bin" "$fixture/brew/sbin"
  awk '
    /<< .SHELLENV./ { body = 1; next }
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
      /<< .SHELLENV./ { body = 1; next }
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
