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
