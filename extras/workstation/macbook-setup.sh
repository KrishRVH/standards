#!/usr/bin/env bash
set -uo pipefail
IFS=$'\n\t'

# macOS CLI workspace standardizer for Apple Silicon MacBook Pros using Ghostty.
#
# Design goals:
# - Idempotent: safe to run repeatedly; no duplicate shell/tmux blocks.
# - Clean: no timestamped backups; no overwrite of unmanaged managed-file targets.
# - macOS-native: Homebrew, pbcopy, BSD/macOS-compatible shell code.
# - Fleet-friendly: continue independent steps after failures, then summarize.
# - Convergent: managed tools update by default so reruns reach current stable releases.
#
# Tunables:
#   BOOTSTRAP_REQUIRE_APPLE_SILICON=0  allow non-arm64 Macs
#   BOOTSTRAP_INSTALL_HOMEBREW=0       refuse to install Homebrew if missing
#   BOOTSTRAP_ALLOW_NONSTANDARD_BREW=1 allow Homebrew outside the default prefix
#   BOOTSTRAP_INSTALL_RUSTUP=0         skip rustup/stable Rust toolchain
#   BOOTSTRAP_RUSTUP_UPDATE=0          skip stable Rust update when rustup already exists
#   BOOTSTRAP_INSTALL_LAZYVIM=0        skip LazyVim starter install
#   BOOTSTRAP_INSTALL_FRAWK=1          opt in to cargo-install frawk
#   BOOTSTRAP_CARGO_UPGRADE=0          skip cargo package update checks
#   BOOTSTRAP_BREW_UPGRADE=0           skip upgrading already-installed managed formulae
#   BOOTSTRAP_BREW_CLEANUP=0           skip brew cleanup
#   BOOTSTRAP_GIT_UPDATE=0             skip fast-forwarding managed git repos on reruns
#   BOOTSTRAP_TMUX_PLUGIN_UPDATE=0     skip TPM plugin updates
#   RETRY_MAX_ATTEMPTS=5               attempts for transient network operations
#   TMUX_SESSIONIZER_ROOTS=a:b:c       colon-separated roots for tmux-sessionizer

: "${BOOTSTRAP_REQUIRE_APPLE_SILICON:=1}"
: "${BOOTSTRAP_INSTALL_HOMEBREW:=1}"
: "${BOOTSTRAP_ALLOW_NONSTANDARD_BREW:=0}"
: "${BOOTSTRAP_INSTALL_RUSTUP:=1}"
: "${BOOTSTRAP_RUSTUP_UPDATE:=1}"
: "${BOOTSTRAP_INSTALL_LAZYVIM:=1}"
: "${BOOTSTRAP_INSTALL_FRAWK:=0}"
: "${BOOTSTRAP_CARGO_UPGRADE:=1}"
: "${BOOTSTRAP_BREW_UPGRADE:=1}"
: "${BOOTSTRAP_BREW_CLEANUP:=1}"
: "${BOOTSTRAP_GIT_UPDATE:=1}"
: "${BOOTSTRAP_TMUX_PLUGIN_UPDATE:=1}"
: "${RETRY_MAX_ATTEMPTS:=5}"

REQUIRED_FAILURES=()
OPTIONAL_FAILURES=()
TMP_PATHS=()
SUDO_KEEPALIVE_PID=""
HOMEBREW_PREFIX=""

has() { command -v "$1" > /dev/null 2>&1; }
msg() { printf '==> %s\n' "$*"; }
ok() { printf 'ok: %s\n' "$*"; }
warn() { printf 'warn: %s\n' "$*" >&2; }
fatal() {
  printf 'error: %s\n' "$*" >&2
  exit 2
}

append_required_failure() {
  REQUIRED_FAILURES[${#REQUIRED_FAILURES[@]}]="$1"
}

append_optional_failure() {
  OPTIONAL_FAILURES[${#OPTIONAL_FAILURES[@]}]="$1"
}

register_tmp() {
  [ -n "${1:-}" ] || return 0
  TMP_PATHS[${#TMP_PATHS[@]}]="$1"
}

cleanup() {
  local p
  if [ -n "${SUDO_KEEPALIVE_PID:-}" ]; then
    kill "$SUDO_KEEPALIVE_PID" 2> /dev/null || true
  fi
  for p in "${TMP_PATHS[@]}"; do
    if [ -n "$p" ]; then
      rm -rf "$p" 2> /dev/null || true
    fi
  done
}
install_traps() {
  trap cleanup EXIT
  trap 'trap - INT; cleanup; exit 130' INT
  trap 'trap - TERM; cleanup; exit 143' TERM
}

mktemp_file() {
  mktemp "${TMPDIR:-/tmp}/macbook-bootstrap.XXXXXX"
}

mktemp_dir() {
  mktemp -d "${TMPDIR:-/tmp}/macbook-bootstrap.XXXXXX"
}

retry() {
  local max_attempts attempt delay rc
  max_attempts="$RETRY_MAX_ATTEMPTS"
  attempt=1
  delay=2
  rc=0

  while :; do
    "$@"
    rc=$?
    [ "$rc" -eq 0 ] && return 0
    [ "$attempt" -ge "$max_attempts" ] && return "$rc"
    sleep "$delay"
    attempt=$((attempt + 1))
    delay=$((delay * 2))
  done
}

retry_quiet() {
  local max_attempts attempt delay tmp rc
  max_attempts="$RETRY_MAX_ATTEMPTS"
  attempt=1
  delay=2
  tmp="$(mktemp_file)" || return 1
  register_tmp "$tmp"
  rc=0

  while :; do
    "$@" > "$tmp" 2>&1
    rc=$?
    if [ "$rc" -eq 0 ]; then
      rm -f "$tmp"
      return 0
    fi

    if [ "$attempt" -ge "$max_attempts" ]; then
      cat "$tmp" >&2
      rm -f "$tmp"
      return "$rc"
    fi

    : > "$tmp"
    sleep "$delay"
    attempt=$((attempt + 1))
    delay=$((delay * 2))
  done
}

step_required() {
  local name rc
  name="$1"
  shift
  msg "$name"
  "$@"
  rc=$?
  if [ "$rc" -eq 0 ]; then
    ok "$name"
  else
    warn "$name failed with exit code $rc; continuing where safe"
    append_required_failure "$name"
  fi
  return 0
}

step_optional() {
  local name rc
  name="$1"
  shift
  msg "$name"
  "$@"
  rc=$?
  if [ "$rc" -eq 0 ]; then
    ok "$name"
  else
    warn "$name failed with exit code $rc; continuing"
    append_optional_failure "$name"
  fi
  return 0
}

require_macos() {
  [ "$(uname -s)" = "Darwin" ] || fatal "this script is for macOS only"
}

require_normal_user() {
  [ "${EUID:-$(id -u)}" -ne 0 ] || fatal "run as your normal user, not root"
}

require_expected_arch() {
  local arch
  arch="$(uname -m)"
  if [ "$BOOTSTRAP_REQUIRE_APPLE_SILICON" = "1" ] && [ "$arch" != "arm64" ]; then
    fatal "expected Apple Silicon arm64 for this onboarding script; got $arch"
  fi
  return 0
}

ensure_xcode_command_line_tools() {
  if xcode-select -p > /dev/null 2>&1 && xcrun --find git > /dev/null 2>&1; then
    return 0
  fi

  warn "Apple Command Line Tools are missing or incomplete"
  xcode-select --install > /dev/null 2>&1 || true
  warn "Install Command Line Tools from the Apple prompt, then run this script again"
  return 1
}

ensure_sudo() {
  sudo -v || return 1
  if [ -z "$SUDO_KEEPALIVE_PID" ]; then
    while :; do
      sudo -n true || exit 0
      sleep 60
    done 2> /dev/null &
    SUDO_KEEPALIVE_PID=$!
  fi
  return 0
}

expected_brew_path() {
  case "$(uname -m)" in
    arm64) printf '%s\n' /opt/homebrew/bin/brew ;;
    x86_64) printf '%s\n' /usr/local/bin/brew ;;
    *) return 1 ;;
  esac
}

detect_brew() {
  local expected brew_path
  expected="$(expected_brew_path)" || return 1

  if [ -x "$expected" ]; then
    printf '%s\n' "$expected"
    return 0
  fi

  if has brew; then
    brew_path="$(command -v brew)"
    if [ "$BOOTSTRAP_ALLOW_NONSTANDARD_BREW" = "1" ]; then
      printf '%s\n' "$brew_path"
      return 0
    fi
    warn "found Homebrew at $brew_path, but expected $expected; ignoring it for standardization"
  fi

  return 1
}

ensure_homebrew() {
  local brew_cmd tmpdir installer expected prefix shellenv

  ensure_xcode_command_line_tools || return 1

  brew_cmd="$(detect_brew || true)"
  if [ -z "$brew_cmd" ]; then
    [ "$BOOTSTRAP_INSTALL_HOMEBREW" = "1" ] || {
      warn "Homebrew is not installed and BOOTSTRAP_INSTALL_HOMEBREW=0"
      return 1
    }

    ensure_sudo || return 1
    tmpdir="$(mktemp_dir)" || return 1
    register_tmp "$tmpdir"
    installer="$tmpdir/install.sh"

    retry curl -fsSL "https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh" -o "$installer" || return 1
    chmod 0755 "$installer" || return 1
    NONINTERACTIVE=1 /bin/bash "$installer" || return 1

    brew_cmd="$(detect_brew || true)"
    [ -n "$brew_cmd" ] || {
      warn "Homebrew installer completed, but the expected brew executable was not found"
      return 1
    }
  fi

  shellenv="$("$brew_cmd" shellenv 2> /dev/null)" || return 1
  # shellcheck disable=SC1090
  eval "$shellenv" || return 1
  HOMEBREW_PREFIX="$("$brew_cmd" --prefix 2> /dev/null)" || return 1
  export HOMEBREW_PREFIX
  export HOMEBREW_NO_ENV_HINTS=1

  expected="$(dirname "$(dirname "$(expected_brew_path)")")" || return 1
  prefix="$(brew --prefix)" || return 1
  if [ "$BOOTSTRAP_ALLOW_NONSTANDARD_BREW" != "1" ] && [ "$prefix" != "$expected" ]; then
    warn "Homebrew prefix is $prefix, expected $expected"
    return 1
  fi

  return 0
}

brew_install_formulae() {
  local formula failed update_failed outdated_output
  has brew || {
    warn "brew is not available; skipping Homebrew formula installation"
    return 1
  }

  failed=""
  update_failed=0

  if ! retry_quiet brew update; then
    warn "brew update failed; attempting formula installation with existing metadata"
    update_failed=1
  fi

  for formula in "$@"; do
    if brew list --formula "$formula" > /dev/null 2>&1; then
      if [ "$BOOTSTRAP_BREW_UPGRADE" = "1" ]; then
        outdated_output="$(brew outdated --quiet --formula "$formula" 2> /dev/null || true)"
        if [ -n "$outdated_output" ]; then
          msg "homebrew: upgrade $formula"
          retry_quiet brew upgrade "$formula" || failed="$failed $formula"
        fi
      fi
    else
      msg "homebrew: install $formula"
      retry_quiet brew install "$formula" || failed="$failed $formula"
    fi
  done

  if [ "$BOOTSTRAP_BREW_CLEANUP" = "1" ]; then
    brew cleanup > /dev/null 2>&1 || warn "brew cleanup failed; continuing"
  fi

  if [ "$update_failed" -ne 0 ] || [ -n "$failed" ]; then
    [ -z "$failed" ] || warn "Homebrew formula failures:$failed"
    return 1
  fi

  return 0
}

atomic_install_file() {
  local src path mode dir base tmp
  src="$1"
  path="$2"
  mode="${3:-0644}"
  dir="$(dirname "$path")"
  base="$(basename "$path")"

  mkdir -p "$dir" || return 1

  if [ -L "$path" ]; then
    warn "refusing to replace symlink: $path"
    return 1
  fi

  if [ -e "$path" ] && [ ! -f "$path" ]; then
    warn "refusing to replace non-file path: $path"
    return 1
  fi

  tmp="$(mktemp "$dir/.${base}.tmp.XXXXXX")" || return 1
  register_tmp "$tmp"
  cat "$src" > "$tmp" || {
    rm -f "$tmp"
    return 1
  }
  chmod "$mode" "$tmp" || {
    rm -f "$tmp"
    return 1
  }

  mv -f "$tmp" "$path" || {
    rm -f "$tmp"
    return 1
  }
  return 0
}

write_managed_file() {
  local path marker mode src
  path="$1"
  marker="$2"
  mode="${3:-0644}"
  src="$(mktemp_file)" || return 1
  register_tmp "$src"

  cat > "$src" || {
    rm -f "$src"
    return 1
  }

  if ! grep -qF -- "$marker" "$src"; then
    warn "managed content for $path is missing marker"
    rm -f "$src"
    return 1
  fi

  if [ -e "$path" ]; then
    if [ -L "$path" ]; then
      warn "refusing to replace symlink: $path"
      rm -f "$src"
      return 1
    fi

    if [ ! -f "$path" ]; then
      warn "refusing to replace non-file path: $path"
      rm -f "$src"
      return 1
    fi

    if ! grep -qF -- "$marker" "$path"; then
      warn "refusing to overwrite unmanaged file: $path"
      rm -f "$src"
      return 1
    fi
  fi

  atomic_install_file "$src" "$path" "$mode"
  local rc=$?
  rm -f "$src"
  return "$rc"
}

put_managed_block() {
  local path begin end mode block out rc
  path="$1"
  begin="$2"
  end="$3"
  mode="${4:-0644}"
  block="$(mktemp_file)" || return 1
  register_tmp "$block"

  cat > "$block" || {
    rm -f "$block"
    return 1
  }

  if ! grep -qF -- "$begin" "$block"; then
    warn "managed block for $path is missing begin marker"
    rm -f "$block"
    return 1
  fi

  if ! grep -qF -- "$end" "$block"; then
    warn "managed block for $path is missing end marker"
    rm -f "$block"
    return 1
  fi

  if [ ! -e "$path" ]; then
    atomic_install_file "$block" "$path" "$mode"
    rc=$?
    rm -f "$block"
    return "$rc"
  fi

  if [ -L "$path" ]; then
    warn "refusing to edit symlink: $path"
    rm -f "$block"
    return 1
  fi

  if [ ! -f "$path" ]; then
    warn "refusing to edit non-file path: $path"
    rm -f "$block"
    return 1
  fi

  out="$(mktemp_file)" || {
    rm -f "$block"
    return 1
  }
  register_tmp "$out"

  if grep -qF -- "$begin" "$path"; then
    if ! grep -qF -- "$end" "$path"; then
      warn "$path contains begin marker but not end marker"
      rm -f "$block" "$out"
      return 1
    fi

    awk -v begin="$begin" -v end="$end" -v block_file="$block" '
      BEGIN {
        while ((getline line < block_file) > 0) {
          block = block line ORS
        }
        inside = 0
        replaced = 0
      }
      index($0, begin) {
        if (!replaced) {
          printf "%s", block
          replaced = 1
        }
        inside = 1
        next
      }
      inside && index($0, end) {
        inside = 0
        next
      }
      !inside {
        print
      }
      END {
        if (inside) {
          exit 2
        }
      }
    ' "$path" > "$out"
    rc=$?
    if [ "$rc" -ne 0 ]; then
      warn "failed to update managed block in $path"
      rm -f "$block" "$out"
      return "$rc"
    fi
  else
    cat "$path" > "$out" || {
      rm -f "$block" "$out"
      return 1
    }
    if [ -s "$path" ]; then
      printf '\n' >> "$out" || {
        rm -f "$block" "$out"
        return 1
      }
    fi
    cat "$block" >> "$out" || {
      rm -f "$block" "$out"
      return 1
    }
  fi

  atomic_install_file "$out" "$path" "$mode"
  rc=$?
  rm -f "$block" "$out"
  return "$rc"
}

normalize_git_url() {
  local url
  url="$1"
  url="${url%/}"
  url="${url%.git}"
  url="${url%/}"
  printf '%s\n' "$url"
}

git_repo() {
  local url dest remote normalized_url normalized_remote
  url="$1"
  dest="$2"

  has git || {
    warn "git is not available; cannot manage $dest"
    return 1
  }

  if [ -d "$dest/.git" ]; then
    remote="$(git -C "$dest" config --get remote.origin.url 2> /dev/null || true)"
    normalized_url="$(normalize_git_url "$url")"
    normalized_remote="$(normalize_git_url "$remote")"

    if [ "$normalized_remote" != "$normalized_url" ]; then
      warn "refusing to update $dest; origin is $remote, expected $url"
      return 1
    fi

    if [ "$BOOTSTRAP_GIT_UPDATE" = "1" ]; then
      retry_quiet git -C "$dest" pull --ff-only || return 1
    fi
    return 0
  fi

  if [ -e "$dest" ]; then
    warn "refusing to clone into existing unmanaged path: $dest"
    return 1
  fi

  mkdir -p "$(dirname "$dest")" || return 1
  retry git clone --depth=1 --quiet "$url" "$dest"
}

install_or_update_rustup() {
  local arch target tmpdir installer url
  [ "$BOOTSTRAP_INSTALL_RUSTUP" = "1" ] || return 0

  export CARGO_HOME="${CARGO_HOME:-$HOME/.cargo}"
  export RUSTUP_HOME="${RUSTUP_HOME:-$HOME/.rustup}"
  export PATH="$CARGO_HOME/bin:$PATH"

  if has rustup; then
    retry_quiet rustup toolchain install stable --profile minimal || return 1
    retry_quiet rustup default stable || return 1
    if [ "$BOOTSTRAP_RUSTUP_UPDATE" = "1" ]; then
      retry_quiet rustup update stable || return 1
    fi
  else
    arch="$(uname -m)"
    case "$arch" in
      arm64) target="aarch64-apple-darwin" ;;
      x86_64) target="x86_64-apple-darwin" ;;
      *)
        warn "unsupported macOS architecture for rustup: $arch"
        return 1
        ;;
    esac

    tmpdir="$(mktemp_dir)" || return 1
    register_tmp "$tmpdir"
    installer="$tmpdir/rustup-init"
    url="https://static.rust-lang.org/rustup/dist/${target}/rustup-init"
    retry curl -fsSL "$url" -o "$installer" || return 1
    chmod 0755 "$installer" || return 1
    "$installer" -y --profile minimal --default-toolchain stable --no-modify-path || return 1
  fi

  if [ -f "$CARGO_HOME/env" ]; then
    # shellcheck disable=SC1090,SC1091
    . "$CARGO_HOME/env" || return 1
  fi

  has cargo || return 1
  return 0
}

install_optional_frawk() {
  [ "$BOOTSTRAP_INSTALL_FRAWK" = "1" ] || return 0
  has cargo || {
    warn "cargo is required for frawk"
    return 1
  }

  if has frawk && [ "$BOOTSTRAP_CARGO_UPGRADE" != "1" ]; then
    return 0
  fi

  retry_quiet cargo install frawk --no-default-features
}

update_tldr_cache() {
  has tldr || return 0
  tldr --update > /dev/null 2>&1 || tldr -u > /dev/null 2>&1 || true
  return 0
}

check_dagger_container_runtime() {
  has dagger || {
    warn "dagger is not available"
    return 1
  }

  if has docker && docker info > /dev/null 2>&1; then
    return 0
  fi

  if has podman && podman info > /dev/null 2>&1; then
    return 0
  fi

  warn "dagger is installed, but no running Docker- or Podman-compatible container runtime was found"
  warn "install/start Docker Desktop, Colima, Podman, or another supported runtime before using dagger"
  return 1
}

write_zsh_config() {
  local zsh_config_marker zsh_loader_begin zsh_loader_end
  zsh_config_marker="# >>> macbook-bootstrap managed zsh config >>>"
  zsh_loader_begin="# >>> macbook-bootstrap managed zsh loader >>>"
  zsh_loader_end="# <<< macbook-bootstrap managed zsh loader <<<"

  write_managed_file "$HOME/.config/macos-bootstrap/zshrc.zsh" "$zsh_config_marker" 0644 << 'ZSHCONFIG' || return 1
# >>> macbook-bootstrap managed zsh config >>>

# Homebrew first. Prefer native Apple Silicon Homebrew when both native and
# Intel/Rosetta installs exist.
if [[ -x /opt/homebrew/bin/brew ]]; then
  eval "$(/opt/homebrew/bin/brew shellenv)"
elif [[ -x /usr/local/bin/brew ]]; then
  eval "$(/usr/local/bin/brew shellenv)"
fi

export EDITOR="nvim"
export VISUAL="nvim"
export CLICOLOR=1

typeset -U path
path=("$HOME/.local/bin" "$HOME/.cargo/bin" $path)
export PATH

command -v mise >/dev/null 2>&1 && eval "$(mise activate zsh)"

_colon_prepend_once() {
  local var="$1"
  local entry="$2"
  [[ -d "$entry" ]] || return 0

  local current="${(P)var:-}"
  case ":$current:" in
    *":$entry:"*) ;;
    *) export "$var=$entry${current:+:$current}" ;;
  esac
}

if [[ -n "${HOMEBREW_PREFIX:-}" ]]; then
  _colon_prepend_once PKG_CONFIG_PATH "$HOMEBREW_PREFIX/opt/openssl@3/lib/pkgconfig"
  _colon_prepend_once PKG_CONFIG_PATH "$HOMEBREW_PREFIX/opt/sqlite/lib/pkgconfig"

  _zsh_cache_dir="${XDG_CACHE_HOME:-$HOME/.cache}/zsh"
  mkdir -p "$_zsh_cache_dir"
  autoload -Uz compinit
  compinit -i -d "$_zsh_cache_dir/.zcompdump"

  [[ -r "$HOMEBREW_PREFIX/share/zsh-autosuggestions/zsh-autosuggestions.zsh" ]] &&
    source "$HOMEBREW_PREFIX/share/zsh-autosuggestions/zsh-autosuggestions.zsh"

  [[ -r "$HOMEBREW_PREFIX/opt/fzf/shell/completion.zsh" ]] &&
    source "$HOMEBREW_PREFIX/opt/fzf/shell/completion.zsh"

  [[ -r "$HOMEBREW_PREFIX/opt/fzf/shell/key-bindings.zsh" ]] &&
    source "$HOMEBREW_PREFIX/opt/fzf/shell/key-bindings.zsh"
fi

[[ -f "${CARGO_HOME:-$HOME/.cargo}/env" ]] && source "${CARGO_HOME:-$HOME/.cargo}/env"

command -v starship >/dev/null 2>&1 && eval "$(starship init zsh)"
command -v zoxide  >/dev/null 2>&1 && eval "$(zoxide init zsh)"
command -v atuin   >/dev/null 2>&1 && eval "$(atuin init zsh --disable-up-arrow)"

setopt HIST_IGNORE_ALL_DUPS HIST_FIND_NO_DUPS INC_APPEND_HISTORY SHARE_HISTORY

alias cls=clear
alias sz='source ~/.zshrc'
alias ls='ls -G'
alias ll='ls -alF'
alias vi=nvim
alias vim=nvim
alias ..='cd ..'
alias ...='cd ../..'
alias ....='cd ../../..'
alias .....='cd ../../../..'

command -v eza >/dev/null 2>&1 && alias lla='eza -la --git --group-directories-first'
command -v eza >/dev/null 2>&1 && alias llt='eza -la --git --tree --level=2 --group-directories-first'

gcob() {
  [[ $# -eq 1 ]] || { echo "usage: gcob <name>"; return 2; }
  git checkout -b "$1"
}

unalias gco 2>/dev/null || true
gco() {
  [[ $# -eq 1 ]] || { echo "usage: gco <ref>"; return 2; }
  [[ "$1" != -* ]] || { echo "gco: ref must not start with '-'"; return 2; }
  git checkout "$1"
}

alias amend="git commit --amend"

unalias gcm 2>/dev/null || true
gcm() {
  [[ $# -gt 0 ]] || { echo "usage: gcm <message>"; return 2; }

  local branch ticket
  branch="$(git symbolic-ref --short HEAD 2>/dev/null || true)"
  [[ -n "$branch" ]] || { echo "No current Git branch"; return 1; }

  ticket="$(printf '%s\n' "$branch" | grep -o -E '[[:alnum:]]+-[0-9]+' | head -n1 || true)"

  if [[ -n "$ticket" ]]; then
    git commit -m "${ticket} : $*"
  else
    git commit -m "$*"
  fi
}

alias gp="git push"

gpus() {
  local branch
  branch="$(git symbolic-ref --short HEAD 2>/dev/null || true)"
  [[ -n "$branch" ]] || { echo "No current Git branch"; return 1; }
  git push --set-upstream origin "$branch"
}

pullor() {
  local branch
  branch="$(git symbolic-ref --short HEAD 2>/dev/null || true)"
  [[ -n "$branch" ]] || { echo "No current Git branch"; return 1; }
  git pull origin "$branch"
}

alias gpom="git pull origin main"

alias dcb="docker compose build"
alias dcu="docker compose up"
alias dcd="docker compose down"
alias dnp="docker network prune -f"
alias dsp="docker system prune -a -f --volumes"
alias dre="dcd && dcb && dcu"
alias dres="dcd && dsp && dcb --no-cache && dcu"
alias dex="docker compose exec web sh"

alias ta='tmux attach -t'
alias tad='tmux attach -d -t'
alias ts='tmux new-session -s'
alias tl='tmux list-sessions'
alias tksv='tmux kill-server'
alias tkss='tmux kill-session -t'
alias tmuxconf='${EDITOR:-nvim} ~/.config/tmux/tmux.conf'

tn() {
  if [[ -n "${1:-}" ]]; then
    tmux new-session -s "$1"
  else
    tmux new-session
  fi
}

tm() {
  if [[ -n "${1:-}" ]]; then
    tmux attach -t "$1" 2>/dev/null || tmux new-session -s "$1"
  else
    tmux attach 2>/dev/null || tmux new-session
  fi
}

tmux_help() {
  cat <<'HELP'
TMUX + NEOVIM QUICK REFERENCE
=================================

Navigation (tmux <-> neovim):
  Ctrl+h/j/k/l     Navigate left/down/up/right

Tmux Prefix: Ctrl+Space (then release, then command)

Essential:
  tm [NAME]        Attach/create session
  tn [NAME]        New session
  Prefix + d       Detach
  Prefix + |       Split vertical
  Prefix + -       Split horizontal
  Prefix + z       Zoom pane
  Prefix + c       New window
  Prefix + r       Reload tmux config
  Prefix + f       Sessionizer popup
  Prefix + C       cht.sh helper popup
  Prefix + I       Install/refresh plugins (TPM)
  Shift+Alt + H/L  Prev/next window

Type 'man tmux' for full docs
HELP
}

# zsh-syntax-highlighting should be sourced after other zsh plugins/widgets.
if [[ -n "${HOMEBREW_PREFIX:-}" ]]; then
  [[ -r "$HOMEBREW_PREFIX/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh" ]] &&
    source "$HOMEBREW_PREFIX/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh"
fi

# <<< macbook-bootstrap managed zsh config <<<
ZSHCONFIG

  put_managed_block "$HOME/.zshrc" "$zsh_loader_begin" "$zsh_loader_end" 0644 << 'ZSHLOADER'
# >>> macbook-bootstrap managed zsh loader >>>
[[ -r "$HOME/.config/macos-bootstrap/zshrc.zsh" ]] && source "$HOME/.config/macos-bootstrap/zshrc.zsh"
# <<< macbook-bootstrap managed zsh loader <<<
ZSHLOADER
}

write_tmux_config() {
  local tmux_conf_marker tmux_loader_begin tmux_loader_end
  tmux_conf_marker="# >>> macbook-bootstrap managed tmux.conf >>>"
  tmux_loader_begin="# >>> macbook-bootstrap managed tmux loader >>>"
  tmux_loader_end="# <<< macbook-bootstrap managed tmux loader <<<"

  mkdir -p "$HOME/.config/tmux" || return 1

  write_managed_file "$HOME/.config/tmux/tmux.conf" "$tmux_conf_marker" 0644 << 'TMUXCONF' || return 1
# >>> macbook-bootstrap managed tmux.conf >>>

# Plugin Manager (TPM)
set -g @plugin 'tmux-plugins/tpm'
set -g @plugin 'tmux-plugins/tmux-sensible'
set -g @plugin 'christoomey/vim-tmux-navigator'
set -g @plugin 'janoamaral/tokyo-night-tmux'
set -g @plugin 'tmux-plugins/tmux-yank'

# Prefix
unbind C-b
set -g prefix C-Space
bind C-Space send-prefix

# Ghostty/macOS terminal behavior.
# Ghostty sets TERM=xterm-ghostty. Keep that outside tmux; inside tmux use
# tmux-256color when available and explicitly advertise RGB/truecolor support.
if-shell 'infocmp -x tmux-256color >/dev/null 2>&1' \
  'set -g default-terminal "tmux-256color"' \
  'set -g default-terminal "screen-256color"'
set -as terminal-features ',xterm-ghostty:RGB,xterm*:RGB,tmux-256color:RGB,screen-256color:RGB'

# Clipboard. pbcopy is native on macOS; OSC 52/set-clipboard helps in modern
# terminals such as Ghostty, while the explicit copy-pipe binding is reliable.
set -g set-clipboard on

# General
set -g mouse on
set -g base-index 1
set -g pane-base-index 1
set-option -g renumber-windows on
set-window-option -g mode-keys vi
set -g history-limit 50000
set -s escape-time 0
set -g focus-events on

# Window navigation with Shift+Alt+H/L
bind -n M-H previous-window
bind -n M-L next-window

# Split panes in the current directory.
unbind %
bind | split-window -h -c "#{pane_current_path}"
unbind '"'
bind - split-window -v -c "#{pane_current_path}"
bind % split-window -h -c "#{pane_current_path}"
bind '"' split-window -v -c "#{pane_current_path}"

# Reload config.
bind r source-file ~/.config/tmux/tmux.conf \; display-message "Config reloaded!"

# Pane resizing.
bind -r H resize-pane -L 5
bind -r J resize-pane -D 5
bind -r K resize-pane -U 5
bind -r L resize-pane -R 5

# Helpers in tmux popups. Homebrew tmux is new enough for display-popup.
bind-key f display-popup -E -w 80% -h 70% "~/.local/bin/tmux-sessionizer"
bind-key C display-popup -E -w 80% -h 70% "~/.local/bin/tmux-cht"

# Copy mode.
bind-key -T copy-mode-vi v send-keys -X begin-selection
bind-key -T copy-mode-vi C-v send-keys -X rectangle-toggle
bind-key -T copy-mode-vi y send-keys -X copy-pipe-and-cancel "pbcopy"

# Tokyo Night theme.
set -g @tokyo-night-tmux_theme 'storm'
set -g @tokyo-night-tmux_show_datetime 1
set -g @tokyo-night-tmux_date_format 'YMD'
set -g @tokyo-night-tmux_time_format '24H'
set -g @tokyo-night-tmux_show_netspeed 0
set -g @tokyo-night-tmux_show_git 0
set -g @tokyo-night-tmux_window_id_style 'digital'
set -g @tokyo-night-tmux_pane_id_style 'hsquare'
set -g @tokyo-night-tmux_zoom_id_style 'dsquare'

# tmux-yank settings.
set -g @yank_selection_mouse 'clipboard'
set -g @yank_action 'copy-pipe-and-cancel'

# Initialize TPM. Keep at the bottom.
run '~/.tmux/plugins/tpm/tpm'

# <<< macbook-bootstrap managed tmux.conf <<<
TMUXCONF

  put_managed_block "$HOME/.tmux.conf" "$tmux_loader_begin" "$tmux_loader_end" 0644 << 'TMUXLOADER'
# >>> macbook-bootstrap managed tmux loader >>>
source-file ~/.config/tmux/tmux.conf
# <<< macbook-bootstrap managed tmux loader <<<
TMUXLOADER
}

write_tmux_helpers() {
  local sessionizer_marker cht_marker
  sessionizer_marker="# >>> macbook-bootstrap managed tmux-sessionizer >>>"
  cht_marker="# >>> macbook-bootstrap managed tmux-cht >>>"

  mkdir -p "$HOME/.local/bin" || return 1

  write_managed_file "$HOME/.local/bin/tmux-sessionizer" "$sessionizer_marker" 0755 << 'SESSIONIZER' || return 1
#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'
# >>> macbook-bootstrap managed tmux-sessionizer >>>

has() { command -v "$1" >/dev/null 2>&1; }

roots_raw="${TMUX_SESSIONIZER_ROOTS:-$HOME/dev:$HOME/src:$HOME/projects:$HOME/Developer:$HOME/Code}"
IFS=':' read -r -a roots <<< "$roots_raw"

tmp="$(mktemp "${TMPDIR:-/tmp}/tmux-sessionizer.XXXXXX")"
trap 'rm -f "$tmp"' EXIT

for r in "${roots[@]}"; do
  [[ -d "$r" ]] || continue

  if has fd; then
    fd --type d --min-depth 1 --max-depth 2 --hidden \
      --exclude .git \
      --exclude Library \
      --exclude Applications \
      --exclude Movies \
      --exclude Music \
      --exclude Pictures \
      --exclude Public \
      --exclude .Trash \
      . "$r" >>"$tmp" 2>/dev/null || true
  else
    prefix="${r%/}/"
    find "$r" \( -name .git -o -name Library -o -name Applications -o -name Movies -o -name Music -o -name Pictures -o -name Public -o -name .Trash \) -prune -o -type d -print 2>/dev/null |
      awk -v prefix="$prefix" '
        $0 == substr(prefix, 1, length(prefix) - 1) { next }
        index($0, prefix) == 1 {
          rel = substr($0, length(prefix) + 1)
          slash_count = gsub("/", "/", rel)
          if (rel != "" && slash_count < 2) {
            print $0
          }
        }
      ' >>"$tmp" || true
  fi
done

selected="$(
  awk '!seen[$0]++' "$tmp" |
    fzf --height=40% --reverse --prompt='session> ' || true
)"

[[ -n "$selected" ]] || exit 0

name="$(basename "$selected" | tr -c '[:alnum:]_-' '_' | sed 's/^_*//; s/_*$//')"
[[ -n "$name" ]] || name="session"

tmux has-session -t "$name" 2>/dev/null || tmux new-session -d -s "$name" -c "$selected"
tmux switch-client -t "$name" 2>/dev/null || tmux attach -t "$name"

# <<< macbook-bootstrap managed tmux-sessionizer <<<
SESSIONIZER

  write_managed_file "$HOME/.local/bin/tmux-cht" "$cht_marker" 0755 << 'CHT'
#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'
# >>> macbook-bootstrap managed tmux-cht >>>

topics=(bash zsh tmux git docker kubectl terraform go rust python node typescript react sql)
selected="$(printf '%s\n' "${topics[@]}" | fzf --height=40% --reverse --prompt='cht> ' || true)"
[[ -n "$selected" ]] || exit 0

query="$(
  printf '' |
    fzf --print-query --height=1 --no-sort --prompt="${selected} query> " 2>/dev/null |
    head -n1 || true
)"

if [[ -z "$query" ]]; then
  curl -fsSL "https://cht.sh/${selected}" | less -R
else
  q="${query// /+}"
  curl -fsSL "https://cht.sh/${selected}/${q}" | less -R
fi

# <<< macbook-bootstrap managed tmux-cht <<<
CHT
}

install_tpm() {
  local tmux_plugin_dir tpm_dir plugin_rc update_rc
  tmux_plugin_dir="$HOME/.tmux/plugins"
  tpm_dir="$tmux_plugin_dir/tpm"

  mkdir -p "$tmux_plugin_dir" || return 1
  git_repo https://github.com/tmux-plugins/tpm "$tpm_dir" || return 1

  if [ -x "$tpm_dir/bin/install_plugins" ]; then
    TMUX_PLUGIN_MANAGER_PATH="$tmux_plugin_dir" bash "$tpm_dir/bin/install_plugins" > /dev/null 2>&1
    plugin_rc=$?
    if [ "$plugin_rc" -ne 0 ]; then
      warn "TPM plugin installation failed; open tmux and press Prefix + I after networking is available"
      return "$plugin_rc"
    fi
  fi

  if [ "$BOOTSTRAP_TMUX_PLUGIN_UPDATE" = "1" ] && [ -x "$tpm_dir/bin/update_plugins" ]; then
    TMUX_PLUGIN_MANAGER_PATH="$tmux_plugin_dir" bash "$tpm_dir/bin/update_plugins" all > /dev/null 2>&1
    update_rc=$?
    if [ "$update_rc" -ne 0 ]; then
      warn "TPM plugin update failed; open tmux and press Prefix + U after networking is available"
      return "$update_rc"
    fi
  fi

  return 0
}

install_lazyvim_if_missing() {
  local nvim_dir marker_file tmpdir clonedir
  [ "$BOOTSTRAP_INSTALL_LAZYVIM" = "1" ] || return 0

  nvim_dir="$HOME/.config/nvim"
  marker_file="$nvim_dir/.macbook-bootstrap-managed"

  if [ -d "$nvim_dir" ] && [ ! -f "$marker_file" ]; then
    msg "neovim: existing ~/.config/nvim found; leaving it unchanged"
    return 0
  fi

  if [ ! -d "$nvim_dir" ]; then
    has git || return 1
    tmpdir="$(mktemp_dir)" || return 1
    register_tmp "$tmpdir"
    clonedir="$tmpdir/nvim"

    retry git clone --depth=1 --quiet https://github.com/LazyVim/starter "$clonedir" || return 1
    rm -rf "$clonedir/.git" || return 1
    printf '%s\n' 'managed by macbook-setup.sh' > "$clonedir/.macbook-bootstrap-managed" || return 1
    mkdir -p "$(dirname "$nvim_dir")" || return 1
    mv "$clonedir" "$nvim_dir" || return 1
  fi

  if [ -f "$marker_file" ]; then
    write_lazyvim_tmux_navigator "$nvim_dir" || return 1
  fi

  return 0
}

write_lazyvim_tmux_navigator() {
  local nvim_dir marker
  nvim_dir="$1"
  marker="-- >>> macbook-bootstrap managed nvim tmux-navigator >>>"

  mkdir -p "$nvim_dir/lua/plugins" || return 1

  write_managed_file "$nvim_dir/lua/plugins/tmux-navigator.lua" "$marker" 0644 << 'NVIMTMUX'
-- >>> macbook-bootstrap managed nvim tmux-navigator >>>

return {
  {
    "christoomey/vim-tmux-navigator",
    lazy = false,
    init = function()
      -- Manage mappings here so they can override LazyVim defaults.
      vim.g.tmux_navigator_no_mappings = 1
    end,
    config = function()
      local function map()
        local opts = { silent = true, noremap = true }
        vim.keymap.set("n", "<C-h>", "<cmd>TmuxNavigateLeft<cr>", opts)
        vim.keymap.set("n", "<C-j>", "<cmd>TmuxNavigateDown<cr>", opts)
        vim.keymap.set("n", "<C-k>", "<cmd>TmuxNavigateUp<cr>", opts)
        vim.keymap.set("n", "<C-l>", "<cmd>TmuxNavigateRight<cr>", opts)
        vim.keymap.set("n", "<C-\\>", "<cmd>TmuxNavigatePrevious<cr>", opts)
      end

      map()

      vim.api.nvim_create_autocmd("User", {
        pattern = "VeryLazy",
        callback = map,
      })
    end,
  },
}

-- <<< macbook-bootstrap managed nvim tmux-navigator <<<
NVIMTMUX
}

validate_managed_files() {
  local rc
  rc=0

  bash -n "$HOME/.local/bin/tmux-sessionizer" 2> /dev/null || rc=1
  bash -n "$HOME/.local/bin/tmux-cht" 2> /dev/null || rc=1

  if has zsh && [ -f "$HOME/.config/macos-bootstrap/zshrc.zsh" ]; then
    zsh -n "$HOME/.config/macos-bootstrap/zshrc.zsh" > /dev/null 2>&1 || rc=1
  fi

  return "$rc"
}

print_summary() {
  local item
  printf '\nBootstrap summary\n'
  printf '=================\n'

  if [ "${#REQUIRED_FAILURES[@]}" -eq 0 ] && [ "${#OPTIONAL_FAILURES[@]}" -eq 0 ]; then
    printf 'All required and optional enabled steps completed.\n'
    printf '\nOpen a new Ghostty tab/window, or run: source ~/.zshrc\n'
    return 0
  fi

  if [ "${#REQUIRED_FAILURES[@]}" -gt 0 ]; then
    printf '\nRequired steps with issues:\n'
    for item in "${REQUIRED_FAILURES[@]}"; do
      printf '  - %s\n' "$item"
    done
  fi

  if [ "${#OPTIONAL_FAILURES[@]}" -gt 0 ]; then
    printf '\nOptional steps with issues:\n'
    for item in "${OPTIONAL_FAILURES[@]}"; do
      printf '  - %s\n' "$item"
    done
  fi

  printf '\nThe script continued past failures where it was safe to do so. Re-run it after fixing the listed issue(s).\n'

  if [ "${#REQUIRED_FAILURES[@]}" -gt 0 ]; then
    return 1
  fi
  return 0
}

main() {
  install_traps
  require_macos
  require_normal_user
  require_expected_arch

  step_required "Homebrew availability" ensure_homebrew

  BREW_FORMULAE=(
    ca-certificates
    curl
    wget
    git
    gnupg
    mise
    dagger/tap/dagger
    xz
    pkgconf
    openssl@3
    sqlite
    tmux
    fzf
    ripgrep
    jq
    tree
    fd
    bat
    btop
    neovim
    zsh-autosuggestions
    zsh-syntax-highlighting
    zoxide
    atuin
    eza
    xh
    procs
    bottom
    dust
    tealdeer
    starship
    jj
    broot
    sd
  )

  step_required "Homebrew formulae" brew_install_formulae "${BREW_FORMULAE[@]}"
  step_required "Rust stable toolchain" install_or_update_rustup
  step_optional "frawk" install_optional_frawk
  step_optional "tldr cache" update_tldr_cache
  step_optional "Dagger container runtime" check_dagger_container_runtime
  step_required "zsh configuration" write_zsh_config
  step_required "tmux configuration" write_tmux_config
  step_required "tmux helper scripts" write_tmux_helpers
  step_required "TPM and tmux plugins" install_tpm
  step_required "LazyVim starter" install_lazyvim_if_missing
  step_required "managed file validation" validate_managed_files

  print_summary
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi
