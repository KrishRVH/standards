#!/usr/bin/env bats
# shellcheck disable=SC2154 # Bats supplies the fixture paths.

check_sessionizer() {
  local script="$1" fixture="${BATS_TEST_TMPDIR}/sessions"
  local selected first second
  mkdir -p "$fixture/bin" "$fixture/state" "$fixture/projects/one/api" "$fixture/projects/two/api"
  first="$fixture/projects/one/api"
  second="$fixture/projects/two/api"
  ln -s "$(command -v fdfind || command -v fd)" "$fixture/bin/fd"
  cat > "$fixture/bin/fzf" << 'FZF'
#!/usr/bin/env bash
sed 's:/$::' > "$SESSION_TEST_ROOT/candidates"
[[ -n "$SESSION_TEST_SELECTED" ]] || exit 130
grep -Fx -- "$SESSION_TEST_SELECTED" "$SESSION_TEST_ROOT/candidates"
FZF
  cat > "$fixture/bin/tmux" << 'TMUX'
#!/usr/bin/env bash
case "$1" in
  has-session) [[ -f "$SESSION_TEST_ROOT/state/${3#=}" ]] ;;
  new-session)
    touch "$SESSION_TEST_ROOT/state/$4"
    printf '%s\n' "$6" >> "$SESSION_TEST_ROOT/created"
    ;;
  attach|switch-client) [[ -f "$SESSION_TEST_ROOT/state/${3#=}" ]] ;;
  *) exit 2 ;;
esac
TMUX
  chmod +x "$fixture/bin/fzf" "$fixture/bin/tmux"
  awk '
    /<<[[:space:]]*'\''SESSIONIZER'\''/ { body = 1; next }
    body && /^SESSIONIZER$/ { exit }
    body { print }
  ' "$script" > "$fixture/sessionizer.sh"

  for selected in "$first" "$second" "$first" ""; do
    run env -i HOME="$fixture" PATH="$fixture/bin:/usr/bin:/bin" \
      TMUX_SESSIONIZER_ROOTS="$fixture/projects" SESSION_TEST_ROOT="$fixture" \
      SESSION_TEST_SELECTED="$selected" bash "$fixture/sessionizer.sh"
    [[ "$status" -eq 0 ]]
  done
  [[ "$(cat "$fixture/created")" == "$first"$'\n'"$second" ]]
}

@test "WSL session picker separates equal repository names and reuses the selected path" {
  check_sessionizer "$BATS_TEST_DIRNAME/../wsl-setup.sh"
}

@test "macOS session picker separates equal repository names and reuses the selected path" {
  check_sessionizer "$BATS_TEST_DIRNAME/../macbook-setup.sh"
}
