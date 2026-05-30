#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# WSL/Ubuntu CLI bootstrap (minimal output, idempotent where practical).
# - apt base tools
# - rustup + cargo-installed CLI tools
# - Oh My Zsh + plugins + managed .zshrc
# - tmux + TPM + managed tmux config + helper scripts
# - optional LazyVim starter config (only if ~/.config/nvim is missing)

if [[ ${EUID:-$(id -u)} -eq 0 ]]; then
  echo "error: run as your normal user (not root)" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

has() { command -v "$1" >/dev/null 2>&1; }
die() { echo "error: $*" >&2; exit 1; }
msg() { printf '==> %s\n' "$*"; }

# Basic retry with exponential backoff (good for apt locks / transient net hiccups).
retry() {
  local -r max_attempts="${RETRY_MAX_ATTEMPTS:-8}"
  local attempt=1
  local delay=2
  while true; do
    if "$@"; then return 0; fi
    if (( attempt >= max_attempts )); then return 1; fi
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
  tmp="$(mktemp)"

  while true; do
    if "$@" >"$tmp" 2>&1; then
      rm -f "$tmp"
      return 0
    fi

    if (( attempt >= max_attempts )); then
      cat "$tmp" >&2
      rm -f "$tmp"
      return 1
    fi

    : >"$tmp"
    sleep "$delay"
    attempt=$((attempt + 1))
    delay=$((delay * 2))
  done
}

ensure_sudo() {
  sudo -v
  # Keep sudo alive while we run (cargo builds can take a while).
  while true; do
    sudo -n true || exit 0
    sleep 60
  done 2>/dev/null &
  SUDO_KEEPALIVE_PID=$!
  trap 'kill "$SUDO_KEEPALIVE_PID" 2>/dev/null || true' EXIT
}

apt_get() {
  retry_quiet sudo apt-get -y -qq \
    -o Dpkg::Use-Pty=0 \
    -o APT::Color=0 \
    -o Dpkg::Options::=--force-confdef \
    -o Dpkg::Options::=--force-confold \
    "$@"
}

write_managed_file() {
  local path="$1"
  local marker="$2"
  local mode="${3:-0644}"

  local tmp
  tmp="$(mktemp)"
  cat >"$tmp"

  # Markers may start with '-' (e.g., Lua comments "-- ...").
  # Always terminate grep options so the marker is treated as a pattern.
  grep -qF -- "$marker" "$tmp" || { rm -f "$tmp"; die "managed content for $path missing marker"; }

  if [[ -f "$path" ]] && ! grep -qF -- "$marker" "$path"; then
    cp -a "$path" "${path}.bak.$(date +%Y%m%d_%H%M%S)"
  fi

  install -D -m "$mode" "$tmp" "$path"
  rm -f "$tmp"
}

git_repo() {
  local url="$1"
  local dest="$2"

  if [[ -d "$dest/.git" ]]; then
    git -C "$dest" pull --ff-only --quiet >/dev/null 2>&1 || true
    return 0
  fi
  [[ -e "$dest" ]] && return 0

  retry git clone --depth=1 --quiet "$url" "$dest"
}

cargo_install_if_missing() {
  local crate="$1"
  local bin="$2"
  shift 2

  has "$bin" && return 0

  msg "cargo: install $bin ($crate)"
  retry_quiet cargo install --quiet "$@" "$crate"
  has "$bin" || die "installed $crate but '$bin' not found in PATH"
}

ensure_sudo

# --- apt base ---------------------------------------------------------------

msg "apt: update"
apt_get update

msg "apt: upgrade"
apt_get upgrade

BASE_PKGS=(
  ca-certificates curl wget git gnupg
  unzip zip xz-utils
  build-essential pkg-config libssl-dev libsqlite3-dev
  tmux zsh fzf ripgrep jq bc tree fd-find bat wl-clipboard
  btop
)

msg "apt: install base packages"
apt_get install "${BASE_PKGS[@]}"

mkdir -p "$HOME/.local/bin"
if has fdfind && ! has fd; then ln -sf "$(command -v fdfind)" "$HOME/.local/bin/fd"; fi
if has batcat && ! has bat; then ln -sf "$(command -v batcat)" "$HOME/.local/bin/bat"; fi

# --- neovim (latest stable) -------------------------------------------------
# Install upstream Neovim (latest stable .deb) so we aren't stuck on Ubuntu's
# older neovim package.
version_ge() { # version_ge 0.11.0 0.9.5  => true if $2 >= $1
  [[ "$(printf '%s\n' "$1" "$2" | sort -V | head -n1)" == "$1" ]]
}

install_latest_neovim() {
  local min_version="$1"

  if has nvim; then
    local current
    current="$(nvim --version 2>/dev/null | awk 'NR==1 { gsub(/^v/, "", $2); print $2 }')"
    if [[ -n "$current" ]] && version_ge "$min_version" "$current"; then
      return 0
    fi
  fi

  msg "neovim: installing/upgrading (>= $min_version)"

  local arch
  arch="$(dpkg --print-architecture)"

  local url
  case "$arch" in
    amd64) url="https://github.com/neovim/neovim-releases/releases/latest/download/nvim-linux-x86_64.deb" ;;
    arm64) url="https://github.com/neovim/neovim-releases/releases/latest/download/nvim-linux-arm64.deb" ;;
    *) die "unsupported dpkg arch for nvim: $arch" ;;
  esac

  # Remove Ubuntu's neovim runtime (0.9.x) to avoid file conflicts.
  if dpkg -s neovim-runtime >/dev/null 2>&1 || dpkg -s neovim >/dev/null 2>&1; then
    apt_get remove neovim neovim-runtime || true
    apt_get autoremove || true
  fi

  local tmpdir
  tmpdir="$(mktemp -d)"
  chmod 755 "$tmpdir" # let _apt read the file if apt installs it
  retry curl -fsSL "$url" -o "$tmpdir/nvim.deb"
  chmod 644 "$tmpdir/nvim.deb"

  apt_get install "$tmpdir/nvim.deb"
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
    aarch64|arm64) target="aarch64-unknown-linux-gnu" ;;
    *) die "unsupported architecture: $arch" ;;
  esac

  url="https://static.rust-lang.org/rustup/dist/${target}/rustup-init"
  tmpdir="$(mktemp -d)"
  installer="$tmpdir/rustup-init" # IMPORTANT: rustup-init behavior depends on argv0
  retry curl -fsSL "$url" -o "$installer"
  chmod +x "$installer"
  "$installer" -y --profile minimal --default-toolchain stable
  rm -rf "$tmpdir" || true
else
  msg "rust: updating stable toolchain"
  rustup update stable >/dev/null 2>&1 || true
  rustup default stable >/dev/null 2>&1 || true
fi

# Make cargo available in this shell too.
if [[ -f "$CARGO_HOME/env" ]]; then
  # shellcheck disable=SC1090
  source "$CARGO_HOME/env"
fi
export PATH="$CARGO_HOME/bin:$PATH"

cargo_install_if_missing zoxide zoxide
cargo_install_if_missing atuin atuin
cargo_install_if_missing eza eza
cargo_install_if_missing xh xh
cargo_install_if_missing procs procs
cargo_install_if_missing bottom btm
cargo_install_if_missing du-dust dust
cargo_install_if_missing tealdeer tldr
cargo_install_if_missing starship starship

# Added Rust tools
cargo_install_if_missing jj-cli jj --bin jj
cargo_install_if_missing broot broot
# frawk defaults require nightly + LLVM; install a stable, no-LLVM build.
cargo_install_if_missing frawk frawk --no-default-features --features allow_avx2,use_jemalloc
cargo_install_if_missing sd sd

has tldr && tldr -u >/dev/null 2>&1 || true

# --- zsh (oh-my-zsh + plugins + zshrc) -------------------------------------

OH_MY_ZSH_DIR="$HOME/.oh-my-zsh"
ZSH_CUSTOM_DIR="${ZSH_CUSTOM:-$OH_MY_ZSH_DIR/custom}"
ZSH_CUSTOM_PLUGINS_DIR="$ZSH_CUSTOM_DIR/plugins"

git_repo https://github.com/ohmyzsh/ohmyzsh.git "$OH_MY_ZSH_DIR"
mkdir -p "$ZSH_CUSTOM_PLUGINS_DIR"
git_repo https://github.com/zsh-users/zsh-autosuggestions "$ZSH_CUSTOM_PLUGINS_DIR/zsh-autosuggestions"
git_repo https://github.com/zsh-users/zsh-syntax-highlighting "$ZSH_CUSTOM_PLUGINS_DIR/zsh-syntax-highlighting"

ZSHRC_MARKER="# >>> wsl-bootstrap managed zshrc >>>"
write_managed_file "$HOME/.zshrc" "$ZSHRC_MARKER" 0644 <<'ZSHRC'
# >>> wsl-bootstrap managed zshrc >>>

export ZSH="$HOME/.oh-my-zsh"
ZSH_THEME=""
plugins=(git zsh-autosuggestions zsh-syntax-highlighting)
source "$ZSH/oh-my-zsh.sh"

[[ -f "$HOME/.cargo/env" ]] && source "$HOME/.cargo/env"

export EDITOR="nvim"
export VISUAL="nvim"
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"

command -v starship >/dev/null 2>&1 && eval "$(starship init zsh)"
command -v zoxide  >/dev/null 2>&1 && eval "$(zoxide init zsh)"
command -v atuin   >/dev/null 2>&1 && eval "$(atuin init zsh --disable-up-arrow)"

[[ -f /usr/share/doc/fzf/examples/key-bindings.zsh ]] && source /usr/share/doc/fzf/examples/key-bindings.zsh
[[ -f /usr/share/doc/fzf/examples/completion.zsh   ]] && source /usr/share/doc/fzf/examples/completion.zsh

setopt HIST_IGNORE_ALL_DUPS HIST_FIND_NO_DUPS INC_APPEND_HISTORY SHARE_HISTORY

#command -v eza >/dev/null 2>&1 && alias ls='eza --group-directories-first'
#command -v eza >/dev/null 2>&1 && alias ll='eza -la --git --group-directories-first'
#command -v bat >/dev/null 2>&1 && alias cat='bat'

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
  grep -qxF "$ZSH_PATH" /etc/shells || echo "$ZSH_PATH" | sudo tee -a /etc/shells >/dev/null
  current_shell="$(getent passwd "$USER" | cut -d: -f7 || true)"
  if [[ "$current_shell" != "$ZSH_PATH" ]]; then
    sudo chsh -s "$ZSH_PATH" "$USER" >/dev/null 2>&1 || true
  fi
fi

# --- tmux + TPM + config + helpers -----------------------------------------

TMUX_PLUGIN_DIR="$HOME/.tmux/plugins"
TPM_DIR="$TMUX_PLUGIN_DIR/tpm"
mkdir -p "$TMUX_PLUGIN_DIR"
git_repo https://github.com/tmux-plugins/tpm "$TPM_DIR"

TMUX_CONF_MARKER="# >>> wsl-bootstrap managed tmux.conf >>>"
mkdir -p "$HOME/.config/tmux"
write_managed_file "$HOME/.config/tmux/tmux.conf" "$TMUX_CONF_MARKER" 0644 <<'TMUXCONF'
# >>> wsl-bootstrap managed tmux.conf >>>

# ╔═══════════════════════════════════════════════════════════════╗
# ║                         TMUX CONFIG                           ║
# ║           Managed by cli-tools.sh (WSL bootstrap)              ║
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

# 'y' to yank is handled by tmux-yank (copies to system # ───────────────────────────────────────────────────────────────
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
set -g @yank_action 'copy-pipe' # or 'copy-pipe-and-cancel' for old behavior

# ───────────────────────────────────────────────────────────────
# Initialize TMUX plugin manager (keep this line at the very bottom)
# ───────────────────────────────────────────────────────────────
run '~/.tmux/plugins/tpm/tpm'

# <<< wsl-bootstrap managed tmux.conf <<<

TMUXCONF

TMUX_SHIM_MARKER="# >>> wsl-bootstrap managed ~/.tmux.conf >>>"
write_managed_file "$HOME/.tmux.conf" "$TMUX_SHIM_MARKER" 0644 <<'TMUXSHIM'
# >>> wsl-bootstrap managed ~/.tmux.conf >>>
source-file ~/.config/tmux/tmux.conf
# <<< wsl-bootstrap managed ~/.tmux.conf <<<
TMUXSHIM

SESSIONIZER_MARKER="# >>> wsl-bootstrap managed tmux-sessionizer >>>"
write_managed_file "$HOME/.local/bin/tmux-sessionizer" "$SESSIONIZER_MARKER" 0755 <<'SESSIONIZER'
#!/usr/bin/env bash
set -euo pipefail
# >>> wsl-bootstrap managed tmux-sessionizer >>>

roots=("$HOME" "$HOME/dev" "$HOME/src" "$HOME/projects")

candidates=()
for r in "${roots[@]}"; do
  [[ -d "$r" ]] || continue
  while IFS= read -r d; do candidates+=("$d"); done < <(find "$r" -mindepth 1 -maxdepth 2 -type d 2>/dev/null)
done

mapfile -t candidates < <(printf '%s\n' "${candidates[@]}" | awk '!seen[$0]++')
selected="$(printf '%s\n' "${candidates[@]}" | fzf --height=40% --reverse --prompt='session> ' || true)"
[[ -n "$selected" ]] || exit 0

name="$(basename "$selected" | tr . _)"
tmux has-session -t "$name" 2>/dev/null || tmux new-session -d -s "$name" -c "$selected"
tmux switch-client -t "$name" 2>/dev/null || tmux attach -t "$name"

# <<< wsl-bootstrap managed tmux-sessionizer <<<
SESSIONIZER

CHT_MARKER="# >>> wsl-bootstrap managed tmux-cht >>>"
write_managed_file "$HOME/.local/bin/tmux-cht" "$CHT_MARKER" 0755 <<'CHT'
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

if [[ -x "$TPM_DIR/bin/install_plugins" ]]; then
  TMUX_PLUGIN_MANAGER_PATH="$TMUX_PLUGIN_DIR" bash "$TPM_DIR/bin/install_plugins" >/dev/null 2>&1 || true
fi

# --- neovim (optional lazyvim starter) -------------------------------------

NVIM_DIR="$HOME/.config/nvim"
NVIM_MARKER_FILE="$NVIM_DIR/.wsl-bootstrap-managed"

if [[ ! -d "$NVIM_DIR" ]]; then
  tmpdir="$(mktemp -d)"
  clonedir="$tmpdir/nvim"
  if git clone --depth=1 --quiet https://github.com/LazyVim/starter "$clonedir" 2>/dev/null; then
    mkdir -p "$(dirname "$NVIM_DIR")"
    mv "$clonedir" "$NVIM_DIR"
    rm -rf "$NVIM_DIR/.git" || true
    printf 'managed by cli-tools.sh\n' >"$NVIM_MARKER_FILE"
  fi
  rm -rf "$tmpdir" || true
fi


# --- neovim <-> tmux navigation (LazyVim only) ------------------------------
# If we installed the LazyVim starter config (managed), add vim-tmux-navigator
# so Ctrl+h/j/k/l works seamlessly across tmux panes and Neovim splits.
if [[ -f "$NVIM_MARKER_FILE" ]]; then
  NVIM_TMUX_NAV_MARKER="-- >>> wsl-bootstrap managed nvim tmux-navigator >>>"
  mkdir -p "$NVIM_DIR/lua/plugins"
  write_managed_file "$NVIM_DIR/lua/plugins/tmux-navigator.lua" "$NVIM_TMUX_NAV_MARKER" 0644 <<'NVIMTMUX'
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
