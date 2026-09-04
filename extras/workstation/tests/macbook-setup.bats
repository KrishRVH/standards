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

@test "managed block updates preserve existing file permissions" {
  # shellcheck disable=SC2154 # Bats defines BATS_TEST_TMPDIR.
  local target="${BATS_TEST_TMPDIR}/zshrc"
  local expected="${BATS_TEST_TMPDIR}/expected-zshrc"

  printf '%s\n' 'export PRIVATE_SETTING=value' > "$target"
  chmod 0600 "$target"

  run bash -c '
    source "$1"
    put_managed_block "$2" "# >>> loader >>>" "# <<< loader <<<" 0644 <<"BLOCK"
# >>> loader >>>
source managed.zsh
# <<< loader <<<
BLOCK
  ' -- "$MACBOOK_SETUP_SCRIPT" "$target"

  [[ "$status" -eq 0 ]]
  [[ "$(file_mode "$target")" = "600" ]]

  printf '%s\n' \
    'export PRIVATE_SETTING=value' \
    '' \
    '# >>> loader >>>' \
    'source managed.zsh' \
    '# <<< loader <<<' > "$expected"
  cmp -s "$expected" "$target"
}

@test "managed block updates reject a lone end marker" {
  # shellcheck disable=SC2154 # Bats defines BATS_TEST_TMPDIR.
  local target="${BATS_TEST_TMPDIR}/zshrc"
  local marker="# <<< loader <<<"

  printf '%s\n' "$marker" > "$target"
  chmod 0600 "$target"

  run bash -c '
    source "$1"
    put_managed_block "$2" "# >>> loader >>>" "# <<< loader <<<" 0644 <<"BLOCK"
# >>> loader >>>
source managed.zsh
# <<< loader <<<
BLOCK
  ' -- "$MACBOOK_SETUP_SCRIPT" "$target"

  [[ "$status" -ne 0 ]]
  [[ "$output" = *"contains end marker but not begin marker"* ]]
  [[ "$(file_mode "$target")" = "600" ]]
  [[ "$(< "$target")" = "$marker" ]]
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
