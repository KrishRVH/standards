#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# WSL/Ubuntu CLI bootstrap (minimal output, idempotent where practical).
# - apt base tools
# - rustup + cargo-installed CLI tools
# - Oh My Zsh + plugins + managed .zshrc
# - tmux + TPM + managed tmux config + helper scripts
# - optional LazyVim starter config (only if ~/.config/nvim is missing)
#
# Tunables:
#   BOOTSTRAP_APT_UPGRADE=0            skip apt upgrade
#   BOOTSTRAP_CARGO_UPGRADE=0          skip cargo package update checks
#   BOOTSTRAP_GIT_UPDATE=0             skip fast-forwarding managed git repos
#   BOOTSTRAP_INSTALL_LAZYVIM=0        skip LazyVim starter install
#   BOOTSTRAP_TMUX_PLUGIN_UPDATE=0     skip TPM plugin updates
#   BOOTSTRAP_APT_BUSY_TIMEOUT=120     seconds to wait for existing apt/dpkg work
#   BOOTSTRAP_APT_LOCK_TIMEOUT=120     seconds apt-get waits on dpkg locks
#   BOOTSTRAP_CURL_MAX_TIME=180        seconds before curl requests time out
#   BOOTSTRAP_GIT_TIMEOUT=300          seconds before git network operations time out

if [[ ${EUID:-$(id -u)} -eq 0 ]]; then
  echo "error: run as your normal user (not root)" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

: "${BOOTSTRAP_APT_UPGRADE:=1}"
: "${BOOTSTRAP_CARGO_UPGRADE:=1}"
: "${BOOTSTRAP_GIT_UPDATE:=1}"
: "${BOOTSTRAP_INSTALL_LAZYVIM:=1}"
: "${BOOTSTRAP_TMUX_PLUGIN_UPDATE:=1}"
: "${BOOTSTRAP_APT_BUSY_TIMEOUT:=120}"
: "${BOOTSTRAP_APT_LOCK_TIMEOUT:=120}"
: "${BOOTSTRAP_CURL_CONNECT_TIMEOUT:=10}"
: "${BOOTSTRAP_CURL_MAX_TIME:=180}"
: "${BOOTSTRAP_GIT_TIMEOUT:=300}"
: "${BOOTSTRAP_TMUX_PLUGIN_TIMEOUT:=180}"
: "${BOOTSTRAP_TLDR_TIMEOUT:=120}"

has() { command -v "$1" > /dev/null 2>&1; }
die() {
  echo "error: $*" >&2
  exit 1
}
msg() { printf '==> %s\n' "$*"; }
warn() { printf 'warn: %s\n' "$*" >&2; }

command_string() {
  printf '%q ' "$@"
}

run_with_timeout() {
  local duration="$1"
  shift

  if [[ "$duration" == "0" ]]; then
    "$@"
  else
    timeout --kill-after=15s "$duration" "$@"
  fi
}

# Basic retry with exponential backoff (good for apt locks / transient net hiccups).
retry() {
  local -r max_attempts="${RETRY_MAX_ATTEMPTS:-8}"
  local attempt=1
  local delay=2
  local status
  while true; do
    if "$@"; then return 0; fi
    status=$?
    if ((attempt >= max_attempts)); then
      warn "failed after $attempt attempt(s): $(command_string "$@")"
      return "$status"
    fi
    warn "attempt $attempt/$max_attempts failed; retrying in ${delay}s: $(command_string "$@")"
    sleep "$delay"
    attempt=$((attempt + 1))
    delay=$((delay * 2))
  done
}

# Like retry, but suppresses stdout/stderr unless the command ultimately fails.
retry_quiet() {
  local -r max_attempts="${RETRY_MAX_ATTEMPTS:-8}"
  local attempt=1
  local delay=2
  local tmp
  local status
  tmp="$(mktemp)"

  while true; do
    if "$@" > "$tmp" 2>&1; then
      rm -f "$tmp"
      return 0
    fi
    status=$?

    if ((attempt >= max_attempts)); then
      cat "$tmp" >&2
      rm -f "$tmp"
      warn "failed after $attempt attempt(s): $(command_string "$@")"
      return "$status"
    fi

    warn "attempt $attempt/$max_attempts failed; retrying in ${delay}s: $(command_string "$@")"
    : > "$tmp"
    sleep "$delay"
    attempt=$((attempt + 1))
    delay=$((delay * 2))
  done
}

curl_fetch() {
  retry curl -fsSL \
    --connect-timeout "$BOOTSTRAP_CURL_CONNECT_TIMEOUT" \
    --max-time "$BOOTSTRAP_CURL_MAX_TIME" \
    "$@"
}

ensure_sudo() {
  sudo -v
  # Keep sudo alive while we run (cargo builds can take a while).
  while true; do
    sudo -n true || exit 0
    sleep 60
  done 2> /dev/null &
  SUDO_KEEPALIVE_PID=$!
  trap 'kill "$SUDO_KEEPALIVE_PID" 2>/dev/null || true' EXIT
}

apt_lock_holders() {
  local lock_paths=(
    /var/lib/dpkg/lock-frontend
    /var/lib/dpkg/lock
    /var/cache/apt/archives/lock
  )
  local pids

  pids="$({ sudo -n fuser "${lock_paths[@]}" 2> /dev/null || true; } | tr ' ' '\n' | awk '/^[0-9]+$/ && !seen[$0]++')"
  [[ -n "$pids" ]] || return 0

  ps -o pid=,ppid=,stat=,comm=,args= -p "$(printf '%s\n' "$pids" | paste -sd, -)" 2> /dev/null || true
}

wait_for_apt_idle() {
  local deadline=$((SECONDS + BOOTSTRAP_APT_BUSY_TIMEOUT))
  local holders
  local reported=0

  while true; do
    holders="$(apt_lock_holders || true)"
    [[ -z "$holders" ]] && return 0

    if ((SECONDS >= deadline)); then
      warn "apt/dpkg is already running; refusing to wait forever"
      printf '%s\n' "$holders" >&2
      warn "if this is from a cancelled setup run, clear it with:"
      warn "  sudo kill <pid> ..."
      warn "  sudo dpkg --configure -a"
      return 1
    fi

    if ((reported == 0)); then
      warn "apt/dpkg is busy; waiting up to ${BOOTSTRAP_APT_BUSY_TIMEOUT}s"
      printf '%s\n' "$holders" >&2
      reported=1
    fi

    sleep 5
  done
}

apt_get() {
  wait_for_apt_idle
  retry_quiet sudo -n apt-get -y -qq \
    -o "DPkg::Lock::Timeout=${BOOTSTRAP_APT_LOCK_TIMEOUT}" \
    -o Dpkg::Use-Pty=false \
    -o APT::Color=0 \
    -o Dpkg::Options::=--force-confdef \
    -o Dpkg::Options::=--force-confold \
    "$@" < /dev/null
}

atomic_install_file() {
  local src="$1"
  local path="$2"
  local mode="${3:-0644}"
  local dir base tmp

  dir="$(dirname "$path")"
  base="$(basename "$path")"
  mkdir -p "$dir"

  if [[ -L "$path" ]]; then
    warn "refusing to replace symlink: $path"
    return 1
  fi

  if [[ -e "$path" && ! -f "$path" ]]; then
    warn "refusing to replace non-file path: $path"
    return 1
  fi

  tmp="$(mktemp "$dir/.${base}.tmp.XXXXXX")"
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
}

write_managed_file() {
  local path="$1"
  local marker="$2"
  local mode="${3:-0644}"

  local tmp
  tmp="$(mktemp)"
  cat > "$tmp"

  # Markers may start with '-' (e.g., Lua comments "-- ...").
  # Always terminate grep options so the marker is treated as a pattern.
  grep -qF -- "$marker" "$tmp" || {
    rm -f "$tmp"
    die "managed content for $path missing marker"
  }

  if [[ -L "$path" ]]; then
    rm -f "$tmp"
    warn "refusing to replace symlink: $path"
    return 1
  fi

  if [[ -e "$path" && ! -f "$path" ]]; then
    rm -f "$tmp"
    warn "refusing to replace non-file path: $path"
    return 1
  fi

  if [[ -f "$path" ]] && ! grep -qF -- "$marker" "$path"; then
    rm -f "$tmp"
    warn "refusing to overwrite unmanaged file: $path"
    return 1
  fi

  if ! atomic_install_file "$tmp" "$path" "$mode"; then
    rm -f "$tmp"
    return 1
  fi
  rm -f "$tmp"
}

normalize_git_url() {
  local url="$1"
  url="${url%/}"
  url="${url%.git}"
  url="${url%/}"
  printf '%s\n' "$url"
}

git_repo() {
  local url="$1"
  local dest="$2"
  local remote normalized_url normalized_remote

  has git || {
    warn "git is not available; cannot manage $dest"
    return 1
  }

  if [[ -d "$dest/.git" ]]; then
    remote="$(git -C "$dest" config --get remote.origin.url 2> /dev/null || true)"
    normalized_url="$(normalize_git_url "$url")"
    normalized_remote="$(normalize_git_url "$remote")"

    if [[ "$normalized_remote" != "$normalized_url" ]]; then
      warn "refusing to update $dest; origin is $remote, expected $url"
      return 1
    fi

    if [[ "$BOOTSTRAP_GIT_UPDATE" = "1" ]]; then
      retry_quiet run_with_timeout "$BOOTSTRAP_GIT_TIMEOUT" env GIT_TERMINAL_PROMPT=0 git -C "$dest" pull --ff-only
    fi
    return 0
  fi

  if [[ -e "$dest" ]]; then
    warn "refusing to clone into existing unmanaged path: $dest"
    return 1
  fi

  retry run_with_timeout "$BOOTSTRAP_GIT_TIMEOUT" env GIT_TERMINAL_PROMPT=0 git clone --depth=1 --quiet "$url" "$dest"
}

cargo_install_latest() {
  local crate="$1"
  local bin="$2"
  shift 2

  if has "$bin" && [[ "$BOOTSTRAP_CARGO_UPGRADE" != "1" ]]; then
    return 0
  fi

  msg "cargo: install/update $bin ($crate)"
  retry_quiet cargo install --quiet "$@" "$crate"
  has "$bin" || die "installed $crate but '$bin' not found in PATH"
}

install_or_update_mise() {
  local tmpdir installer

  mkdir -p "$HOME/.local/bin"
  tmpdir="$(mktemp -d)"
  installer="$tmpdir/mise-install.sh"

  curl_fetch https://mise.run -o "$installer"
  MISE_QUIET=1 sh "$installer"
  rm -rf "$tmpdir" || true
  hash -r 2> /dev/null || true

  has mise || die "mise installer completed, but mise is not on PATH"
  mise --version
}

install_or_update_dagger() {
  local tmpdir installer

  mkdir -p "$HOME/.local/bin"
  tmpdir="$(mktemp -d)"
  installer="$tmpdir/dagger-install.sh"

  curl_fetch https://dl.dagger.io/dagger/install.sh -o "$installer"
  retry_quiet env BIN_DIR="$HOME/.local/bin" sh "$installer"
  rm -rf "$tmpdir" || true
  hash -r 2> /dev/null || true

  has dagger || die "Dagger installer completed, but dagger is not on PATH"
  dagger version
}

check_dagger_container_runtime() {
  has dagger || die "dagger is not available"

  if has docker && docker info > /dev/null 2>&1; then
    return 0
  fi

  if has podman && podman info > /dev/null 2>&1; then
    return 0
  fi

  warn "dagger is installed, but no running Docker- or Podman-compatible container runtime was found"
  warn "install/start Docker Desktop with WSL integration, Podman, or another supported runtime before using dagger"
}

ensure_sudo

# --- apt base ---------------------------------------------------------------

msg "apt: update"
apt_get update

if [[ "$BOOTSTRAP_APT_UPGRADE" = "1" ]]; then
  msg "apt: upgrade"
  apt_get upgrade
fi

BASE_PKGS=(
  ca-certificates curl wget git gnupg
  unzip zip xz-utils
  build-essential pkg-config autoconf bison re2c
  libssl-dev libsqlite3-dev libncurses-dev libicu-dev
  libcurl4-openssl-dev libreadline-dev libxml2-dev libzip-dev libsodium-dev
  libpq-dev libonig-dev libgd-dev gettext zlib1g-dev
  tmux zsh fzf ripgrep jq bc tree fd-find bat wl-clipboard
  btop
)

msg "apt: install base packages"
apt_get install "${BASE_PKGS[@]}"

mkdir -p "$HOME/.local/bin"
export PATH="$HOME/.local/bin:$PATH"
if has fdfind && ! has fd; then ln -sf "$(command -v fdfind)" "$HOME/.local/bin/fd"; fi
if has batcat && ! has bat; then ln -sf "$(command -v batcat)" "$HOME/.local/bin/bat"; fi

# --- mise + dagger -----------------------------------------------------------

msg "mise: install/update"
install_or_update_mise

msg "dagger: install/update"
install_or_update_dagger
check_dagger_container_runtime

# --- neovim (latest stable) -------------------------------------------------
# Install upstream Neovim release tarballs so we are not stuck on Ubuntu's
# older neovim package and so arm64 works with the artifacts upstream ships.
version_ge() { # version_ge 0.11.0 0.9.5  => true if $2 >= $1
  [[ "$(printf '%s\n' "$1" "$2" | sort -V | head -n1)" == "$1" ]]
}

install_latest_neovim() {
  local min_version="$1"
  local latest_json latest_tag latest_version current arch asset_arch asset_dir url tmpdir

  latest_json="$(curl_fetch https://api.github.com/repos/neovim/neovim/releases/latest)"
  latest_tag="$(printf '%s\n' "$latest_json" | jq -r '.tag_name // empty')"
  [[ "$latest_tag" == v* ]] || die "could not resolve latest Neovim release tag"
  latest_version="${latest_tag#v}"
  version_ge "$min_version" "$latest_version" || die "latest Neovim $latest_version is older than required $min_version"

  if has nvim; then
    current="$(nvim --version 2> /dev/null | awk 'NR==1 { gsub(/^v/, "", $2); print $2 }')"
    if [[ "$current" == "$latest_version" ]]; then
      return 0
    fi
  fi

  msg "neovim: installing/upgrading $latest_tag"

  arch="$(dpkg --print-architecture)"
  case "$arch" in
    amd64) asset_arch="x86_64" ;;
    arm64) asset_arch="arm64" ;;
    *) die "unsupported dpkg arch for nvim: $arch" ;;
  esac

  asset_dir="nvim-linux-$asset_arch"
  url="https://github.com/neovim/neovim/releases/download/${latest_tag}/${asset_dir}.tar.gz"

  # Remove Ubuntu's neovim runtime to avoid an older /usr/bin/nvim shadowing
  # the managed upstream install.
  if dpkg -s neovim-runtime > /dev/null 2>&1 || dpkg -s neovim > /dev/null 2>&1; then
    apt_get remove neovim neovim-runtime || true
    apt_get autoremove || true
  fi

  tmpdir="$(mktemp -d)"
  curl_fetch "$url" -o "$tmpdir/nvim.tar.gz"
  tar -C "$tmpdir" -xzf "$tmpdir/nvim.tar.gz"
  [[ -x "$tmpdir/$asset_dir/bin/nvim" ]] || die "downloaded Neovim archive did not contain $asset_dir/bin/nvim"

  sudo install -d -m 0755 /opt /usr/local/bin
  sudo rm -rf "/opt/${asset_dir}.new" "/opt/${asset_dir}.previous"
  sudo mv "$tmpdir/$asset_dir" "/opt/${asset_dir}.new"
  if [[ -e "/opt/$asset_dir" || -L "/opt/$asset_dir" ]]; then
    sudo mv -T "/opt/$asset_dir" "/opt/${asset_dir}.previous"
  fi
  sudo mv -T "/opt/${asset_dir}.new" "/opt/$asset_dir"
  sudo ln -sfn "/opt/$asset_dir/bin/nvim" /usr/local/bin/nvim
  sudo rm -rf "/opt/${asset_dir}.previous"
  rm -rf "$tmpdir" || true

  nvim --version | head -n 2
}

install_latest_neovim "0.11.0"

# --- rustup + cargo tools ---------------------------------------------------

export CARGO_HOME="${CARGO_HOME:-$HOME/.cargo}"
export RUSTUP_HOME="${RUSTUP_HOME:-$HOME/.rustup}"
export PATH="$HOME/.local/bin:$CARGO_HOME/bin:$PATH"

if ! has rustup; then
  msg "rust: installing rustup (stable toolchain)"

  arch="$(uname -m)"
  case "$arch" in
    x86_64) target="x86_64-unknown-linux-gnu" ;;
    aarch64 | arm64) target="aarch64-unknown-linux-gnu" ;;
    *) die "unsupported architecture: $arch" ;;
  esac

  url="https://static.rust-lang.org/rustup/dist/${target}/rustup-init"
  tmpdir="$(mktemp -d)"
  installer="$tmpdir/rustup-init" # IMPORTANT: rustup-init behavior depends on argv0
  curl_fetch "$url" -o "$installer"
  chmod +x "$installer"
  "$installer" -y --profile minimal --default-toolchain stable
  rm -rf "$tmpdir" || true
else
  msg "rust: updating stable toolchain"
  retry_quiet rustup update stable
  retry_quiet rustup default stable
fi

# Make cargo available in this shell too.
if [[ -f "$CARGO_HOME/env" ]]; then
  # shellcheck disable=SC1090,SC1091
  source "$CARGO_HOME/env"
fi
export PATH="$CARGO_HOME/bin:$PATH"

cargo_install_latest zoxide zoxide
cargo_install_latest atuin atuin
cargo_install_latest eza eza
cargo_install_latest xh xh
cargo_install_latest procs procs
cargo_install_latest bottom btm
cargo_install_latest du-dust dust
cargo_install_latest tealdeer tldr
cargo_install_latest starship starship

# Added Rust tools
cargo_install_latest jj-cli jj --bin jj
cargo_install_latest broot broot
# frawk defaults require nightly + LLVM; install a stable, no-LLVM build.
cargo_install_latest frawk frawk --no-default-features --features allow_avx2,use_jemalloc
cargo_install_latest sd sd

if has tldr; then
  run_with_timeout "$BOOTSTRAP_TLDR_TIMEOUT" tldr -u > /dev/null 2>&1 || true
fi

# --- zsh (oh-my-zsh + plugins + zshrc) -------------------------------------

OH_MY_ZSH_DIR="$HOME/.oh-my-zsh"
ZSH_CUSTOM_DIR="${ZSH_CUSTOM:-$OH_MY_ZSH_DIR/custom}"
ZSH_CUSTOM_PLUGINS_DIR="$ZSH_CUSTOM_DIR/plugins"

git_repo https://github.com/ohmyzsh/ohmyzsh.git "$OH_MY_ZSH_DIR"
mkdir -p "$ZSH_CUSTOM_PLUGINS_DIR"
git_repo https://github.com/zsh-users/zsh-autosuggestions "$ZSH_CUSTOM_PLUGINS_DIR/zsh-autosuggestions"
git_repo https://github.com/zsh-users/zsh-syntax-highlighting "$ZSH_CUSTOM_PLUGINS_DIR/zsh-syntax-highlighting"

ZSHRC_MARKER="# >>> wsl-bootstrap managed zshrc >>>"
write_managed_file "$HOME/.zshrc" "$ZSHRC_MARKER" 0644 << 'ZSHRC'
# >>> wsl-bootstrap managed zshrc >>>

export ZSH="$HOME/.oh-my-zsh"
ZSH_THEME=""
plugins=(git zsh-autosuggestions zsh-syntax-highlighting)
source "$ZSH/oh-my-zsh.sh"

[[ -f "$HOME/.cargo/env" ]] && source "$HOME/.cargo/env"

export EDITOR="nvim"
export VISUAL="nvim"
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
unset GOROOT GOTOOLDIR

command -v mise >/dev/null 2>&1 && eval "$(mise activate zsh)"

command -v starship >/dev/null 2>&1 && eval "$(starship init zsh)"
command -v zoxide  >/dev/null 2>&1 && eval "$(zoxide init zsh)"
command -v atuin   >/dev/null 2>&1 && eval "$(atuin init zsh --disable-up-arrow)"

if [[ -t 0 ]]; then
  [[ -f /usr/share/doc/fzf/examples/key-bindings.zsh ]] && source /usr/share/doc/fzf/examples/key-bindings.zsh
  [[ -f /usr/share/doc/fzf/examples/completion.zsh   ]] && source /usr/share/doc/fzf/examples/completion.zsh
fi

setopt HIST_IGNORE_ALL_DUPS HIST_FIND_NO_DUPS INC_APPEND_HISTORY SHARE_HISTORY

alias cls=clear
alias sz='source ~/.zshrc'
alias ls='ls --color=auto'
alias ll='ls -alF'
alias vi=nvim
alias vim=nvim
alias ..='cd ..'
alias ...='cd ../..'
alias ....='cd ../../..'
alias .....='cd ../../../..'

gcob() { [[ $# -eq 1 ]] || { echo "usage: gcob <name>"; return 2; }; git checkout -b -- "$1"; }
unalias gco 2>/dev/null || true
gco()  { [[ $# -eq 1 ]] || { echo "usage: gco <ref>"; return 2; }; git checkout -- "$1"; }
alias amend="git commit --amend"
unalias gcm 2>/dev/null || true
gcm() {
  local branch=$(git symbolic-ref --short HEAD 2>/dev/null || echo "")
  [ -z "$branch" ] && echo "Not in a git repository" && return 1

  local ticket=$(echo "$branch" | grep -o -E '[a-zA-Z0-9]+-[0-9]+' | head -1)

  if [ -n "$ticket" ]; then
      git commit -m "${ticket} : $*"
  else
      git commit -m "$*"
  fi
}
alias gp="git push"
gpus() {
   local branch=$(git symbolic-ref --short HEAD)
   git push --set-upstream origin "$branch"
}
pullor() {
   local branch=$(git symbolic-ref --short HEAD)
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
# --- tmux shortcuts -------------------------------------------------------

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
    echo "TMUX + NEOVIM QUICK REFERENCE"
    echo "================================="
    echo ""
    echo "Navigation (tmux <-> neovim):"
    echo "  Ctrl+h/j/k/l     Navigate left/down/up/right"
    echo ""
    echo "Tmux Prefix: Ctrl+Space (then release, then command)"
    echo ""
    echo "Essential:"
    echo "  tm [NAME]        Attach/create session"
    echo "  tn [NAME]        New session"
    echo "  Prefix + d       Detach"
    echo "  Prefix + |       Split vertical"
    echo "  Prefix + -       Split horizontal"
    echo "  Prefix + z       Zoom pane"
    echo "  Prefix + c       New window"
    echo "  Prefix + r       Reload tmux config"
    echo "  Prefix + f       Sessionizer (fzf)"
    echo "  Prefix + C       cht.sh helper (fzf)"
    echo "  Prefix + I       Install/refresh plugins (TPM)"
    echo "  Shift+Alt + H/L  Prev/next window"
    echo ""
    echo "Type 'man tmux' for full docs"
}
# <<< wsl-bootstrap managed zshrc <<<
ZSHRC

ZSH_PATH="$(command -v zsh || true)"
if [[ -n "$ZSH_PATH" ]]; then
  grep -qxF "$ZSH_PATH" /etc/shells || echo "$ZSH_PATH" | sudo tee -a /etc/shells > /dev/null
  current_shell="$(getent passwd "$USER" | cut -d: -f7 || true)"
  if [[ "$current_shell" != "$ZSH_PATH" ]]; then
    sudo chsh -s "$ZSH_PATH" "$USER" > /dev/null 2>&1 || true
  fi
fi

# --- tmux + TPM + config + helpers -----------------------------------------

TMUX_PLUGIN_DIR="$HOME/.tmux/plugins"
TPM_DIR="$TMUX_PLUGIN_DIR/tpm"
mkdir -p "$TMUX_PLUGIN_DIR"
git_repo https://github.com/tmux-plugins/tpm "$TPM_DIR"

TMUX_CONF_MARKER="# >>> wsl-bootstrap managed tmux.conf >>>"
mkdir -p "$HOME/.config/tmux"
write_managed_file "$HOME/.config/tmux/tmux.conf" "$TMUX_CONF_MARKER" 0644 << 'TMUXCONF'
# >>> wsl-bootstrap managed tmux.conf >>>

# ╔═══════════════════════════════════════════════════════════════╗
# ║                         TMUX CONFIG                           ║
# ║           Managed by wsl-setup.sh                              ║
# ╚═══════════════════════════════════════════════════════════════╝

# ───────────────────────────────────────────────────────────────
# Plugin Manager (TPM)
# ───────────────────────────────────────────────────────────────
set -g @plugin 'tmux-plugins/tpm'
set -g @plugin 'tmux-plugins/tmux-sensible'
set -g @plugin 'christoomey/vim-tmux-navigator'
set -g @plugin 'janoamaral/tokyo-night-tmux'
set -g @plugin 'tmux-plugins/tmux-yank'

# ───────────────────────────────────────────────────────────────
# General Settings
# ───────────────────────────────────────────────────────────────
# Change prefix from Ctrl-b to Ctrl-Space
unbind C-b
set -g prefix C-Space
bind C-Space send-prefix

# Truecolor / RGB support (tell tmux the *outer* terminal supports RGB)
# terminal-features is the modern way to enable this (preferred over older terminal-overrides).
set -as terminal-features ",xterm*:RGB"

# Prefer tmux-256color when available (falls back to screen-256color).
if-shell 'infocmp -x tmux-256color >/dev/null 2>&1' 'set -g default-terminal "tmux-256color"' 'set -g default-terminal "screen-256color"'

# Enable mouse support
set -g mouse on

# Start windows and panes at 1, not 0
set -g base-index 1
set -g pane-base-index 1
set-window-option -g pane-base-index 1
set-option -g renumber-windows on

# Set vi mode for copy mode
set-window-option -g mode-keys vi

# Increase history limit
set -g history-limit 50000

# Faster key repetition
set -s escape-time 0

# Focus events enabled for terminals that support them
set -g focus-events on

# ───────────────────────────────────────────────────────────────
# Key Bindings
# ───────────────────────────────────────────────────────────────
# Window navigation with Shift+Alt+H/L
bind -n M-H previous-window
bind -n M-L next-window

# Split panes with | and - (and open in current directory)
unbind %
bind | split-window -h -c "#{pane_current_path}"
unbind '"'
bind - split-window -v -c "#{pane_current_path}"

# Also keep the default % and " but with current directory
bind % split-window -h -c "#{pane_current_path}"
bind '"' split-window -v -c "#{pane_current_path}"

# Reload config with prefix + r
bind r source-file ~/.config/tmux/tmux.conf \; display-message "Config reloaded!"

# Easier pane resizing
bind -r H resize-pane -L 5
bind -r J resize-pane -D 5
bind -r K resize-pane -U 5
bind -r L resize-pane -R 5

# Helpers
bind-key f run-shell "tmux-sessionizer"
bind-key C run-shell "tmux-cht"

# ───────────────────────────────────────────────────────────────
# Copy Mode Settings
# ───────────────────────────────────────────────────────────────
# Setup 'v' to begin selection as in Vim
bind-key -T copy-mode-vi v send-keys -X begin-selection
bind-key -T copy-mode-vi C-v send-keys -X rectangle-toggle

# 'y' to yank is handled by tmux-yank, which copies to the system clipboard.

# ───────────────────────────────────────────────────────────────
# Tokyo Night Theme Configuration
# ───────────────────────────────────────────────────────────────
# Theme variants: night | storm | moon | day
set -g @tokyo-night-tmux_theme 'storm'

# Widgets (toggle as you like)
set -g @tokyo-night-tmux_show_datetime 1
set -g @tokyo-night-tmux_date_format 'YMD'   # YMD, MDY, DMY
set -g @tokyo-night-tmux_time_format '24H'   # 24H, 12H

# Disable heavier widgets by default (enable if you install extra deps like gh/glab, playerctl, etc.)
set -g @tokyo-night-tmux_show_netspeed 0
set -g @tokyo-night-tmux_show_git 0

# ID styles (optional)
set -g @tokyo-night-tmux_window_id_style 'digital'
set -g @tokyo-night-tmux_pane_id_style 'hsquare'
set -g @tokyo-night-tmux_zoom_id_style 'dsquare'

# ───────────────────────────────────────────────────────────────
# Plugin Settings
# ───────────────────────────────────────────────────────────────
# Tmux-yank settings
set -g @yank_selection_mouse 'clipboard' # or 'primary' or 'secondary'
set -g @yank_action 'copy-pipe'

# ───────────────────────────────────────────────────────────────
# Initialize TMUX plugin manager (keep this line at the very bottom)
# ───────────────────────────────────────────────────────────────
run '~/.tmux/plugins/tpm/tpm'

# <<< wsl-bootstrap managed tmux.conf <<<

TMUXCONF

TMUX_SHIM_MARKER="# >>> wsl-bootstrap managed ~/.tmux.conf >>>"
write_managed_file "$HOME/.tmux.conf" "$TMUX_SHIM_MARKER" 0644 << 'TMUXSHIM'
# >>> wsl-bootstrap managed ~/.tmux.conf >>>
source-file ~/.config/tmux/tmux.conf
# <<< wsl-bootstrap managed ~/.tmux.conf <<<
TMUXSHIM

SESSIONIZER_MARKER="# >>> wsl-bootstrap managed tmux-sessionizer >>>"
write_managed_file "$HOME/.local/bin/tmux-sessionizer" "$SESSIONIZER_MARKER" 0755 << 'SESSIONIZER'
#!/usr/bin/env bash
set -euo pipefail
# >>> wsl-bootstrap managed tmux-sessionizer >>>

roots_raw="${TMUX_SESSIONIZER_ROOTS:-$HOME/dev:$HOME/src:$HOME/projects:$HOME/Developer:$HOME/Code}"
IFS=':' read -r -a roots <<< "$roots_raw"

candidates=()
for r in "${roots[@]}"; do
  [[ -d "$r" ]] || continue
  while IFS= read -r d; do candidates+=("$d"); done < <(find "$r" -mindepth 1 -maxdepth 2 -type d 2>/dev/null)
done

mapfile -t candidates < <(printf '%s\n' "${candidates[@]}" | awk '!seen[$0]++')
selected="$(printf '%s\n' "${candidates[@]}" | fzf --height=40% --reverse --prompt='session> ' || true)"
[[ -n "$selected" ]] || exit 0

name="$(basename "$selected" | tr -c '[:alnum:]_-' '_' | sed 's/^_*//; s/_*$//')"
[[ -n "$name" ]] || name="session"
tmux has-session -t "$name" 2>/dev/null || tmux new-session -d -s "$name" -c "$selected"
tmux switch-client -t "$name" 2>/dev/null || tmux attach -t "$name"

# <<< wsl-bootstrap managed tmux-sessionizer <<<
SESSIONIZER

CHT_MARKER="# >>> wsl-bootstrap managed tmux-cht >>>"
write_managed_file "$HOME/.local/bin/tmux-cht" "$CHT_MARKER" 0755 << 'CHT'
#!/usr/bin/env bash
set -euo pipefail
# >>> wsl-bootstrap managed tmux-cht >>>

topics=(bash zsh tmux git docker kubectl terraform go rust python node typescript react sql)
selected="$(printf '%s\n' "${topics[@]}" | fzf --height=40% --reverse --prompt='cht> ' || true)"
[[ -n "$selected" ]] || exit 0

query="$(printf '' | fzf --print-query --height=1 --no-sort --prompt="${selected} query> " 2>/dev/null | head -n1 || true)"
if [[ -z "$query" ]]; then
  curl -fsSL "https://cht.sh/${selected}" | less -R
else
  q="${query// /+}"
  curl -fsSL "https://cht.sh/${selected}/${q}" | less -R
fi

# <<< wsl-bootstrap managed tmux-cht <<<
CHT

bash -n "$HOME/.local/bin/tmux-sessionizer"
bash -n "$HOME/.local/bin/tmux-cht"

if [[ -x "$TPM_DIR/bin/install_plugins" ]]; then
  run_with_timeout "$BOOTSTRAP_TMUX_PLUGIN_TIMEOUT" env TMUX_PLUGIN_MANAGER_PATH="$TMUX_PLUGIN_DIR" bash "$TPM_DIR/bin/install_plugins" > /dev/null 2>&1 ||
    warn "TPM plugin installation failed; open tmux and press Prefix + I after networking is available"
fi

if [[ "$BOOTSTRAP_TMUX_PLUGIN_UPDATE" = "1" && -x "$TPM_DIR/bin/update_plugins" ]]; then
  run_with_timeout "$BOOTSTRAP_TMUX_PLUGIN_TIMEOUT" env TMUX_PLUGIN_MANAGER_PATH="$TMUX_PLUGIN_DIR" bash "$TPM_DIR/bin/update_plugins" all > /dev/null 2>&1 ||
    warn "TPM plugin update failed; open tmux and press Prefix + U after networking is available"
fi

# --- neovim (optional lazyvim starter) -------------------------------------

NVIM_DIR="$HOME/.config/nvim"
NVIM_MARKER_FILE="$NVIM_DIR/.wsl-bootstrap-managed"

if [[ "$BOOTSTRAP_INSTALL_LAZYVIM" = "1" && ! -d "$NVIM_DIR" ]]; then
  tmpdir="$(mktemp -d)"
  clonedir="$tmpdir/nvim"
  retry run_with_timeout "$BOOTSTRAP_GIT_TIMEOUT" env GIT_TERMINAL_PROMPT=0 git clone --depth=1 --quiet https://github.com/LazyVim/starter "$clonedir"
  mkdir -p "$(dirname "$NVIM_DIR")"
  mv "$clonedir" "$NVIM_DIR"
  rm -rf "$NVIM_DIR/.git" || true
  printf 'managed by wsl-setup.sh\n' > "$NVIM_MARKER_FILE"
  rm -rf "$tmpdir" || true
fi

# --- neovim <-> tmux navigation (LazyVim only) ------------------------------
# If we installed the LazyVim starter config (managed), add vim-tmux-navigator
# so Ctrl+h/j/k/l works seamlessly across tmux panes and Neovim splits.
if [[ -f "$NVIM_MARKER_FILE" ]]; then
  NVIM_TMUX_NAV_MARKER="-- >>> wsl-bootstrap managed nvim tmux-navigator >>>"
  mkdir -p "$NVIM_DIR/lua/plugins"
  write_managed_file "$NVIM_DIR/lua/plugins/tmux-navigator.lua" "$NVIM_TMUX_NAV_MARKER" 0644 << 'NVIMTMUX'
-- >>> wsl-bootstrap managed nvim tmux-navigator >>>

return {
  {
    "christoomey/vim-tmux-navigator",
    lazy = false,
    init = function()
      -- We'll manage the mappings ourselves so they can override LazyVim defaults.
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

      -- Set immediately, and again once LazyVim finishes applying its own mappings.
      map()

      vim.api.nvim_create_autocmd("User", {
        pattern = "VeryLazy",
        callback = map,
      })
    end,
  },
}

-- <<< wsl-bootstrap managed nvim tmux-navigator <<<
NVIMTMUX
fi

echo "done"
