#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# WSL/Ubuntu developer bootstrap (minimal output, idempotent where practical).
# - apt base tools plus a curated modern CLI baseline
# - verified upstream GitHub-release binaries where Ubuntu packages are stale/wrong
# - rustup + cargo-binstall-backed Rust CLI tools
# - Oh My Zsh + plugins + managed .zshrc (Zsh remains the only interactive shell)
# - managed `toolhelp` command, completions, Git defaults, tmux helpers
# - optional LazyVim starter config (only if ~/.config/nvim is missing)
#
# Tunables:
#   BOOTSTRAP_APT_UPGRADE=0            skip apt upgrade
#   BOOTSTRAP_CARGO_UPGRADE=0          skip cargo package update checks
#   BOOTSTRAP_GITHUB_UPGRADE=0         skip GitHub-release updates when a binary exists
#   BOOTSTRAP_GITHUB_API_VERSION=...   override the GitHub REST API version header
#   BOOTSTRAP_GIT_UPDATE=0             skip fast-forwarding managed git repos
#   BOOTSTRAP_PRUNE_SUPERSEDED_TOOLS=1 remove old cargo installs no longer selected
#   BOOTSTRAP_INSTALL_LAZYVIM=0        skip LazyVim starter install
#   BOOTSTRAP_TMUX_PLUGIN_UPDATE=0     skip TPM plugin updates
#   BOOTSTRAP_APT_BUSY_TIMEOUT=120     seconds to wait for existing apt/dpkg work
#   BOOTSTRAP_APT_LOCK_TIMEOUT=120     seconds apt-get waits on dpkg locks
#   BOOTSTRAP_CURL_CONNECT_TIMEOUT=10  seconds to establish curl connections
#   BOOTSTRAP_CURL_MAX_TIME=180        seconds before curl requests time out
#   BOOTSTRAP_GIT_TIMEOUT=300          seconds before git network operations time out
#   BOOTSTRAP_TLDR_TIMEOUT=120         seconds before tldr cache updates time out
#   BOOTSTRAP_TMUX_PLUGIN_TIMEOUT=180  seconds before TPM operations time out
#   RETRY_MAX_ATTEMPTS=8               attempts for transient network operations

if [[ ${EUID:-$(id -u)} -eq 0 ]]; then
  echo "error: run as your normal user (not root)" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

: "${BOOTSTRAP_APT_UPGRADE:=1}"
: "${BOOTSTRAP_CARGO_UPGRADE:=1}"
: "${BOOTSTRAP_GITHUB_UPGRADE:=1}"
: "${BOOTSTRAP_GIT_UPDATE:=1}"
: "${BOOTSTRAP_PRUNE_SUPERSEDED_TOOLS:=0}"
: "${BOOTSTRAP_GITHUB_API_VERSION:=2026-03-10}"
: "${BOOTSTRAP_INSTALL_LAZYVIM:=1}"
: "${BOOTSTRAP_TMUX_PLUGIN_UPDATE:=1}"
: "${BOOTSTRAP_APT_BUSY_TIMEOUT:=120}"
: "${BOOTSTRAP_APT_LOCK_TIMEOUT:=120}"
: "${BOOTSTRAP_CURL_CONNECT_TIMEOUT:=10}"
: "${BOOTSTRAP_CURL_MAX_TIME:=180}"
: "${BOOTSTRAP_GIT_TIMEOUT:=300}"
: "${BOOTSTRAP_TLDR_TIMEOUT:=120}"
: "${BOOTSTRAP_TMUX_PLUGIN_TIMEOUT:=180}"

has() { command -v "$1" > /dev/null 2>&1; }
die() {
  echo "error: $*" >&2
  exit 1
}
msg() { printf '==> %s\n' "$*"; }
warn() { printf 'warn: %s\n' "$*" >&2; }

# Every download and unpack happens under one scratch root, so `die` and `set -e`
# cannot leak half-downloaded archives. One EXIT handler owns all teardown: a
# second `trap ... EXIT` would silently replace the first.
BOOTSTRAP_SCRATCH="$(mktemp -d)"
SUDO_KEEPALIVE_PID=""

cleanup() {
  [[ -z "$SUDO_KEEPALIVE_PID" ]] || kill "$SUDO_KEEPALIVE_PID" 2> /dev/null || true
  rm -rf -- "$BOOTSTRAP_SCRATCH" || true
}
trap cleanup EXIT

# Safe to call in a command substitution: the parent already owns the root, so
# nothing has to be recorded back in the caller's shell.
make_tmpdir() { mktemp -d -p "$BOOTSTRAP_SCRATCH"; }
make_tmpfile() { mktemp -p "$BOOTSTRAP_SCRATCH"; }

check_wsl_ubuntu() {
  local distro_id

  grep -qi microsoft /proc/sys/kernel/osrelease 2> /dev/null ||
    die "this bootstrap must run inside WSL"
  [[ -r /etc/os-release ]] || die "cannot identify the WSL distribution"
  distro_id="$(. /etc/os-release && printf '%s' "${ID:-}")"
  [[ "$distro_id" == ubuntu ]] ||
    die "this bootstrap requires Ubuntu under WSL; found ${distro_id:-unknown}"
}

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
    if "$@"; then
      return 0
    else
      status=$?
    fi
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
  tmp="$(make_tmpfile)"

  while true; do
    if "$@" > "$tmp" 2>&1; then
      rm -f "$tmp"
      return 0
    else
      status=$?
    fi

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
  retry curl --proto '=https' --tlsv1.2 -fsSL \
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
  tmp="$(make_tmpfile)"
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

github_api_fetch() {
  local url="$1"
  shift

  curl_fetch \
    -H 'Accept: application/vnd.github+json' \
    -H "X-GitHub-Api-Version: $BOOTSTRAP_GITHUB_API_VERSION" \
    -H 'User-Agent: wsl-setup.sh' \
    "$url" "$@"
}

verify_sha256_digest() {
  local path="$1"
  local digest="$2"
  local expected

  if [[ "$digest" =~ ^sha256:([[:xdigit:]]{64})$ ]]; then
    expected="${BASH_REMATCH[1],,}"
    printf '%s  %s\n' "$expected" "$path" | sha256sum --check --status - ||
      die "SHA-256 verification failed for $(basename "$path")"
  else
    warn "no GitHub SHA-256 digest was published for $(basename "$path"); continuing without digest verification"
  fi
}

archive_members_are_safe() {
  awk '
    {
      name = $0
      sub(/^\.\//, "", name)
      if (name ~ /^\// || name ~ /(^|\/)\.\.(\/|$)/) bad = 1
    }
    END { exit bad ? 1 : 0 }
  '
}

extract_release_asset() {
  local archive="$1"
  local asset_name="$2"
  local dest="$3"
  local raw_name="${4:-$asset_name}"

  mkdir -p "$dest"
  case "$asset_name" in
    *.tar.gz | *.tgz)
      tar -tzf "$archive" | archive_members_are_safe || die "unsafe paths in $asset_name"
      tar --extract --gzip --file="$archive" --directory="$dest" --no-same-owner --no-same-permissions
      ;;
    *.tar.xz | *.txz)
      tar -tJf "$archive" | archive_members_are_safe || die "unsafe paths in $asset_name"
      tar --extract --xz --file="$archive" --directory="$dest" --no-same-owner --no-same-permissions
      ;;
    *.zip)
      unzip -Z1 "$archive" | archive_members_are_safe || die "unsafe paths in $asset_name"
      unzip -q "$archive" -d "$dest"
      ;;
    *)
      cp -- "$archive" "$dest/$raw_name"
      ;;
  esac
}

install_github_release_binary() {
  local repo="$1"
  local bin="$2"
  local asset_regex="$3"
  local archive_bin="${4:-$2}"
  local target="$HOME/.local/bin/$bin"
  local state_dir="${XDG_STATE_HOME:-$HOME/.local/state}/wsl-bootstrap/github"
  local state_file="$state_dir/${repo//\//_}-$bin.state"
  local release_json release_tag match_count asset_name asset_url asset_digest
  local tmpdir archive extract_dir candidate current_hash installed_hash tmp_state
  local saved_tag="" saved_asset="" saved_digest="" saved_hash=""
  local -a candidates=()

  if has "$bin" && [[ "$BOOTSTRAP_GITHUB_UPGRADE" != "1" ]]; then
    return 0
  fi

  release_json="$(github_api_fetch "https://api.github.com/repos/$repo/releases/latest")"
  release_tag="$(printf '%s\n' "$release_json" | jq -r '.tag_name // empty')"
  [[ -n "$release_tag" ]] || die "could not resolve the latest release for $repo"

  match_count="$(printf '%s\n' "$release_json" | jq --arg re "$asset_regex" '[.assets[] | select(.name | test($re; "i"))] | length')"
  [[ "$match_count" == "1" ]] ||
    die "$repo $release_tag: expected one asset matching $asset_regex, found $match_count"

  asset_name="$(printf '%s\n' "$release_json" | jq -r --arg re "$asset_regex" '.assets[] | select(.name | test($re; "i")) | .name')"
  asset_url="$(printf '%s\n' "$release_json" | jq -r --arg re "$asset_regex" '.assets[] | select(.name | test($re; "i")) | .browser_download_url')"
  # Tab is an IFS whitespace character, so empty state fields would collapse and
  # shift the columns on read. Keep every field non-empty.
  asset_digest="$(printf '%s\n' "$release_json" | jq -r --arg re "$asset_regex" '.assets[] | select(.name | test($re; "i")) | (.digest // "none")')"
  [[ "$asset_url" == https://github.com/* ]] || die "$repo returned an unexpected asset URL"

  # The asset name pins the architecture and the digest pins the bytes, so a
  # re-uploaded asset or a home directory copied between architectures still
  # reinstalls instead of being accepted on the release tag alone.
  if [[ -f "$state_file" && -x "$target" ]]; then
    IFS=$'\t' read -r saved_tag saved_asset saved_digest saved_hash < "$state_file" || true
    current_hash="$(sha256sum "$target" | awk '{print $1}')"
    if [[ "$saved_tag" == "$release_tag" && "$saved_asset" == "$asset_name" &&
      "$saved_digest" == "$asset_digest" && "$saved_hash" == "$current_hash" ]]; then
      return 0
    fi
  fi

  msg "github: install/update $bin ($repo $release_tag)"
  tmpdir="$(make_tmpdir)"
  archive="$tmpdir/$asset_name"
  extract_dir="$tmpdir/extracted"

  curl_fetch "$asset_url" -o "$archive"
  verify_sha256_digest "$archive" "$asset_digest"
  extract_release_asset "$archive" "$asset_name" "$extract_dir" "$archive_bin"

  mapfile -t candidates < <(find "$extract_dir" -type f -name "$archive_bin" -print)
  [[ ${#candidates[@]} -eq 1 ]] || {
    rm -rf "$tmpdir" || true
    die "$asset_name: expected one extracted '$archive_bin' binary, found ${#candidates[@]}"
  }
  candidate="${candidates[0]}"

  atomic_install_file "$candidate" "$target" 0755
  hash -r 2> /dev/null || true
  has "$bin" || {
    rm -rf "$tmpdir" || true
    die "installed $repo but '$bin' is not on PATH"
  }

  mkdir -p "$state_dir"
  installed_hash="$(sha256sum "$target" | awk '{print $1}')"
  tmp_state="$(make_tmpfile)"
  printf '%s\t%s\t%s\t%s\n' "$release_tag" "$asset_name" "$asset_digest" "$installed_hash" > "$tmp_state"
  atomic_install_file "$tmp_state" "$state_file" 0600
  rm -f "$tmp_state"
  rm -rf "$tmpdir" || true
}

cargo_install_latest() {
  local crate="$1"
  local bin="$2"
  shift 2

  if has "$bin" && [[ "$BOOTSTRAP_CARGO_UPGRADE" != "1" ]]; then
    return 0
  fi

  msg "cargo: install/update $bin ($crate)"
  # We never pass a version requirement, so cargo-binstall installs a newer
  # release when one exists and no-ops otherwise. Passing --force here would
  # redownload and replace every crate on every run.
  if has cargo-binstall; then
    if retry_quiet env BINSTALL_DISABLE_TELEMETRY=true cargo binstall --no-confirm "$@" "$crate"; then
      has "$bin" || die "cargo-binstall installed $crate but '$bin' was not found in PATH"
      return 0
    fi
    warn "cargo-binstall failed for $crate; falling back to cargo install"
  fi

  if ! retry_quiet cargo install --quiet --locked "$@" "$crate"; then
    warn "locked cargo install failed for $crate; retrying with dependency resolution"
    retry_quiet cargo install --quiet "$@" "$crate"
  fi
  has "$bin" || die "installed $crate but '$bin' was not found in PATH"
}

install_or_update_mise() {
  local tmpdir installer

  mkdir -p "$HOME/.local/bin"
  tmpdir="$(make_tmpdir)"
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
  tmpdir="$(make_tmpdir)"
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

check_wsl_ubuntu
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
  unzip zip xz-utils zstd file less man-db rsync openssh-client
  build-essential pkg-config autoconf bison re2c
  libssl-dev libsqlite3-dev libncurses-dev libicu-dev
  libcurl4-openssl-dev libreadline-dev libxml2-dev libzip-dev libsodium-dev
  libpq-dev libonig-dev libgd-dev gettext zlib1g-dev
  tmux zsh fzf ripgrep jq bc tree fd-find bat wl-clipboard
  btop shellcheck lnav age trash-cli
)

msg "apt: install base packages"
apt_get install "${BASE_PKGS[@]}"

mkdir -p "$HOME/.local/bin"
export PATH="$HOME/.local/bin:$PATH"
if has fdfind && ! has fd; then
  if [[ -e "$HOME/.local/bin/fd" || -L "$HOME/.local/bin/fd" ]]; then
    warn "refusing to replace existing non-command path: $HOME/.local/bin/fd"
  else
    ln -s "$(command -v fdfind)" "$HOME/.local/bin/fd"
  fi
fi
if has batcat && ! has bat; then
  if [[ -e "$HOME/.local/bin/bat" || -L "$HOME/.local/bin/bat" ]]; then
    warn "refusing to replace existing non-command path: $HOME/.local/bin/bat"
  else
    ln -s "$(command -v batcat)" "$HOME/.local/bin/bat"
  fi
fi

# --- curated upstream release binaries -------------------------------------
# Ubuntu either ships old versions of these or, in yq's case, a different tool.
release_arch="$(dpkg --print-architecture)"
case "$release_arch" in
  amd64)
    release_go_arch="amd64"
    release_uname_arch="x86_64"
    release_herdr_arch="x86_64"
    ;;
  arm64)
    release_go_arch="arm64"
    release_uname_arch="arm64"
    release_herdr_arch="aarch64"
    ;;
  *)
    die "unsupported architecture for upstream CLI releases: $release_arch"
    ;;
esac

install_github_release_binary mikefarah/yq yq "^yq_linux_${release_go_arch}$"
install_github_release_binary mvdan/sh shfmt "^shfmt_v[^/]+_linux_${release_go_arch}$"
install_github_release_binary jesseduffield/lazygit lazygit "^lazygit_[^/]+_linux_${release_uname_arch}\\.tar\\.gz$"
install_github_release_binary muesli/duf duf "^duf_[^/]+_linux_${release_uname_arch}\\.tar\\.gz$"
install_github_release_binary johnkerl/miller mlr "^miller-[^/]+-linux-${release_go_arch}\\.tar\\.gz$" mlr
install_github_release_binary cli/cli gh "^gh_[^/]+_linux_${release_go_arch}\\.tar\\.gz$" gh
# Herdr publishes bare Linux binaries; use its official GitHub release assets.
install_github_release_binary herdrdev/herdr herdr "^herdr-linux-${release_herdr_arch}$"

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
  local latest_json latest_tag latest_version current arch asset_arch asset_dir
  local asset_name asset_count asset_url asset_digest tmpdir downloaded_version installed_version

  if has nvim && [[ "$BOOTSTRAP_GITHUB_UPGRADE" != "1" ]]; then
    return 0
  fi

  latest_json="$(github_api_fetch https://api.github.com/repos/neovim/neovim/releases/latest)"
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
  asset_name="$asset_dir.tar.gz"
  asset_count="$(printf '%s\n' "$latest_json" | jq --arg name "$asset_name" '[.assets[] | select(.name == $name)] | length')"
  [[ "$asset_count" == "1" ]] || die "Neovim $latest_tag: expected one $asset_name asset, found $asset_count"
  asset_url="$(printf '%s\n' "$latest_json" | jq -r --arg name "$asset_name" '.assets[] | select(.name == $name) | .browser_download_url')"
  asset_digest="$(printf '%s\n' "$latest_json" | jq -r --arg name "$asset_name" '.assets[] | select(.name == $name) | (.digest // "")')"

  tmpdir="$(make_tmpdir)"
  curl_fetch "$asset_url" -o "$tmpdir/$asset_name"
  verify_sha256_digest "$tmpdir/$asset_name" "$asset_digest"
  extract_release_asset "$tmpdir/$asset_name" "$asset_name" "$tmpdir"
  [[ -x "$tmpdir/$asset_dir/bin/nvim" ]] || die "downloaded Neovim archive did not contain $asset_dir/bin/nvim"
  downloaded_version="$(
    "$tmpdir/$asset_dir/bin/nvim" --version | awk 'NR==1 { gsub(/^v/, "", $2); print $2 }'
  )"
  [[ "$downloaded_version" == "$latest_version" ]] ||
    die "downloaded Neovim reports version $downloaded_version, expected $latest_version"

  sudo install -d -m 0755 /opt /usr/local/bin
  sudo rm -rf "/opt/${asset_dir}.new" "/opt/${asset_dir}.previous"
  sudo mv "$tmpdir/$asset_dir" "/opt/${asset_dir}.new"
  if [[ -e "/opt/$asset_dir" || -L "/opt/$asset_dir" ]]; then
    sudo mv -T "/opt/$asset_dir" "/opt/${asset_dir}.previous"
  fi
  sudo mv -T "/opt/${asset_dir}.new" "/opt/$asset_dir"
  sudo ln -sfn "/opt/$asset_dir/bin/nvim" /usr/local/bin/nvim
  hash -r 2> /dev/null || true
  installed_version="$(
    /usr/local/bin/nvim --version | awk 'NR==1 { gsub(/^v/, "", $2); print $2 }'
  )"
  [[ "$installed_version" == "$latest_version" ]] ||
    die "installed Neovim reports version $installed_version, expected $latest_version"

  # Remove Ubuntu's package only after its replacement is active and verified.
  if dpkg -s neovim-runtime > /dev/null 2>&1 || dpkg -s neovim > /dev/null 2>&1; then
    apt_get remove neovim neovim-runtime || true
    apt_get autoremove || true
    hash -r 2> /dev/null || true
  fi

  /usr/local/bin/nvim --version | head -n 2
  sudo rm -rf "/opt/${asset_dir}.previous"
  rm -rf "$tmpdir" || true
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
  tmpdir="$(make_tmpdir)"
  # rustup-init selects its behavior from argv[0].
  installer="$tmpdir/rustup-init"
  curl_fetch "$url" -o "$installer"
  chmod +x "$installer"
  "$installer" -y --profile minimal --default-toolchain stable --no-modify-path
  rm -rf "$tmpdir" || true
else
  msg "rust: updating stable toolchain"
  retry_quiet rustup update stable
  retry_quiet rustup default stable
fi

if [[ -f "$CARGO_HOME/env" ]]; then
  # shellcheck disable=SC1090,SC1091
  source "$CARGO_HOME/env"
fi
export PATH="$CARGO_HOME/bin:$PATH"

cargo_binstall_arch="$(uname -m)"
case "$cargo_binstall_arch" in
  x86_64) cargo_binstall_target="x86_64" ;;
  aarch64 | arm64) cargo_binstall_target="aarch64" ;;
  *) die "unsupported architecture for cargo-binstall: $cargo_binstall_arch" ;;
esac
install_github_release_binary cargo-bins/cargo-binstall cargo-binstall \
  "^cargo-binstall-${cargo_binstall_target}-unknown-linux-musl\\.tgz$" cargo-binstall

cargo_install_latest zoxide zoxide
cargo_install_latest atuin atuin
cargo_install_latest eza eza
cargo_install_latest git-delta delta
cargo_install_latest difftastic difft
cargo_install_latest xh xh
cargo_install_latest du-dust dust
cargo_install_latest tealdeer tldr
cargo_install_latest starship starship
cargo_install_latest jj-cli jj
cargo_install_latest sd sd
cargo_install_latest ouch ouch
cargo_install_latest hyperfine hyperfine
cargo_install_latest just just
cargo_install_latest watchexec-cli watchexec
cargo_install_latest ast-grep ast-grep

if [[ "$BOOTSTRAP_PRUNE_SUPERSEDED_TOOLS" == "1" ]]; then
  installed_cargo_crates="$(cargo install --list 2> /dev/null || true)"
  for superseded_crate in procs bottom broot frawk; do
    if grep -qE "^${superseded_crate} v" <<< "$installed_cargo_crates"; then
      msg "cargo: uninstall superseded $superseded_crate"
      cargo uninstall "$superseded_crate" || warn "could not uninstall $superseded_crate"
    fi
  done
fi

if has tldr; then
  run_with_timeout "$BOOTSTRAP_TLDR_TIMEOUT" tldr -u > /dev/null 2>&1 || true
fi

# --- Git defaults, completions, and toolhelp --------------------------------

git_config_default() {
  local key="$1"
  local value="$2"
  git config --global --get "$key" > /dev/null 2>&1 || git config --global "$key" "$value"
}

git_config_default core.pager delta
git_config_default interactive.diffFilter 'delta --color-only'
git_config_default delta.navigate true
git_config_default delta.line-numbers true
git_config_default merge.conflictStyle zdiff3
git_config_default diff.algorithm histogram
git_config_default diff.colorMoved default
git_config_default alias.dft '-c diff.external=difft diff'
git_config_default alias.dshow '-c diff.external=difft show --ext-diff'
git_config_default alias.dlog '-c diff.external=difft log -p --ext-diff'

ZSH_COMPLETIONS_DIR="$HOME/.local/share/wsl-bootstrap/zsh/site-functions"
mkdir -p "$ZSH_COMPLETIONS_DIR"

generate_completion() {
  local path="$1"
  shift
  local tmp

  tmp="$(make_tmpfile)"
  if "$@" > "$tmp" 2> /dev/null && [[ -s "$tmp" ]]; then
    atomic_install_file "$tmp" "$path" 0644
  else
    warn "could not generate completion: $(command_string "$@")"
  fi
  rm -f "$tmp"
}

has delta && generate_completion "$ZSH_COMPLETIONS_DIR/_delta" delta --generate-completion zsh
has just && generate_completion "$ZSH_COMPLETIONS_DIR/_just" just --completions zsh
has watchexec && generate_completion "$ZSH_COMPLETIONS_DIR/_watchexec" watchexec --completions zsh
has ast-grep && generate_completion "$ZSH_COMPLETIONS_DIR/_ast-grep" ast-grep completions zsh
has mlr && generate_completion "$ZSH_COMPLETIONS_DIR/_mlr" mlr completion zsh
has jj && generate_completion "$ZSH_COMPLETIONS_DIR/_jj" jj util completion zsh
has gh && generate_completion "$ZSH_COMPLETIONS_DIR/_gh" gh completion -s zsh

TOOLHELP_MARKER="# >>> wsl-bootstrap managed toolhelp >>>"
write_managed_file "$HOME/.local/bin/toolhelp" "$TOOLHELP_MARKER" 0755 << 'TOOLHELP_SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'
# >>> wsl-bootstrap managed toolhelp >>>

readonly -a TOOLS=(
  rg fd fzf zoxide
  bat eza delta difftastic
  jq yq mlr sd ast-grep
  hyperfine just watchexec shellcheck shfmt
  zsh atuin tldr mise starship cargo-binstall
  jj gh lazygit
  btop dust duf lnav
  xh
  ouch zstd trash age
  tmux herdr nvim dagger
)

readonly -a CATEGORIES=(
  search viewing data workflow shell vcs system network files workspace
)

declare -Ar CATEGORY=(
  [rg]=search [fd]=search [fzf]=search [zoxide]=search
  [bat]=viewing [eza]=viewing [delta]=viewing [difftastic]=viewing
  [jq]=data [yq]=data [mlr]=data [sd]=data [ast-grep]=data
  [hyperfine]=workflow [just]=workflow [watchexec]=workflow [shellcheck]=workflow [shfmt]=workflow
  [zsh]=shell [atuin]=shell [tldr]=shell [mise]=shell [starship]=shell [cargo-binstall]=shell
  [jj]=vcs [gh]=vcs [lazygit]=vcs
  [btop]=system [dust]=system [duf]=system [lnav]=system
  [xh]=network
  [ouch]=files [zstd]=files [trash]=files [age]=files
  [tmux]=workspace [herdr]=workspace [nvim]=workspace [dagger]=workspace
)

declare -Ar SUMMARY=(
  [rg]='fast, repository-aware text search'
  [fd]='human-oriented file and directory search'
  [fzf]='interactive fuzzy selection for any line-oriented input'
  [zoxide]='frecent directory jumping that augments cd'
  [bat]='syntax-highlighted source and text viewer'
  [eza]='modern interactive directory listing'
  [delta]='readable syntax-aware pager for Git diffs'
  [difftastic]='structural syntax-tree diff for understanding code changes'
  [jq]='query and transform JSON'
  [yq]='query and edit YAML and related config formats'
  [mlr]='streaming named-field processing for CSV, TSV, and JSON'
  [sd]='simple, readable find-and-replace'
  [ast-grep]='AST-aware code search, linting, and rewriting'
  [hyperfine]='repeatable command benchmarking with statistics'
  [just]='project task runner without Make build semantics'
  [watchexec]='rerun commands when files change'
  [shellcheck]='static analysis for shell scripts'
  [shfmt]='parser-backed shell formatter'
  [zsh]='your interactive shell; Bash/POSIX sh remain script baselines'
  [atuin]='structured, searchable shell history'
  [tldr]='example-first command reminders that complement man pages'
  [mise]='polyglot tool-version, environment, and task manager'
  [starship]='consistent contextual prompt across environments'
  [cargo-binstall]='fast prebuilt-binary installer for Rust CLI crates'
  [jj]='safer version-control interface backed by Git repositories'
  [gh]='GitHub pull requests, issues, Actions, releases, and API access'
  [lazygit]='visual terminal interface for ordinary Git workflows'
  [btop]='interactive CPU, memory, process, disk, and network monitor'
  [dust]='quick visual answer to what is consuming disk space'
  [duf]='readable filesystem capacity and mount overview'
  [lnav]='format-aware interactive log viewer and analyzer'
  [xh]='ergonomic HTTP client for interactive API work'
  [ouch]='one consistent interface for common archive formats'
  [zstd]='fast modern compression for controlled environments'
  [trash]='recoverable interactive deletion via the desktop trash standard'
  [age]='small, composable modern file encryption'
  [tmux]='persistent terminal sessions and pane orchestration'
  [herdr]='agent-aware multiplexer for supervising several coding agents at once'
  [nvim]='programmable terminal editor with LazyVim bootstrap support'
  [dagger]='containerized programmable CI and development pipelines'
)

canonical_tool() {
  case "${1,,}" in
    ripgrep) printf 'rg\n' ;;
    miller) printf 'mlr\n' ;;
    difft | difftastic) printf 'difftastic\n' ;;
    git-delta) printf 'delta\n' ;;
    github-cli) printf 'gh\n' ;;
    sg | astgrep | ast-grep) printf 'ast-grep\n' ;;
    tealdeer) printf 'tldr\n' ;;
    trash-cli | trash-put) printf 'trash\n' ;;
    neovim | vim) printf 'nvim\n' ;;
    *) printf '%s\n' "${1,,}" ;;
  esac
}

tool_command() {
  case "$1" in
    difftastic) printf 'difft\n' ;;
    trash) printf 'trash-put\n' ;;
    *) printf '%s\n' "$1" ;;
  esac
}

show_status() {
  local tool="$1"
  local cmd path
  cmd="$(tool_command "$tool")"
  if path="$(command -v "$cmd" 2> /dev/null)"; then
    printf '\nInstalled: yes — %s\n' "$path"
  else
    printf '\nInstalled: no — rerun wsl-setup.sh\n'
  fi
}

show_overview() {
  cat <<'DOC'
MODERN CLI TOOLKIT
==================

Usage:
  toolhelp                     This overview and decision map
  toolhelp <tool> [...]        Detailed guidance for one or more tools
  toolhelp list [category]     Compact inventory, optionally filtered
  toolhelp categories          List categories
  toolhelp category <name>     Show one category
  toolhelp search <words>      Search names and summaries
  toolhelp all                 Full reference for every managed tool

Fast decision map:
  Search text in a repo                  rg
  Find files or directories              fd
  Choose interactively from a list       fzf
  Jump to a frequently used directory    zoxide
  Read a source file                      bat
  Inspect a directory                     eza
  Read ordinary Git patches              delta
  Understand structural code changes     difftastic / git dft
  Transform JSON / YAML                   jq / yq
  Process CSV by field name               mlr
  Perform a simple textual replacement   sd
  Search or rewrite code structurally     ast-grep
  Benchmark commands                      hyperfine
  Expose project commands                 just
  Rerun on file changes                   watchexec
  Validate and format shell               shellcheck + shfmt
  Manage language/tool versions           mise
  Recover a prior command                 atuin
  Work with GitHub PRs / Actions / API   gh
  Use Git visually                        lazygit
  Try safer Git-compatible workflows      jj
  Diagnose machine / disk / logs          btop / dust / duf / lnav
  Exercise an HTTP API                    xh
  Work with archives / compression        ouch / zstd
  Delete interactively with recovery      trash-put
  Encrypt a file                          age

Policy:
  These are interactive and development defaults, not portability mandates.
  Keep grep/find/awk/sed/curl/git/make/POSIX sh for portable scripts and remote
  machines. The setup deliberately does not alias cat, grep, find, sed, curl,
  git, or rm globally.

Start with:
  toolhelp rg fd fzf zoxide
  toolhelp delta difftastic
  toolhelp jq yq mlr
  toolhelp jj gh lazygit
DOC
}

show_list() {
  local filter="${1:-}"
  local tool
  printf '%-16s %-11s %s\n' TOOL CATEGORY PURPOSE
  printf '%-16s %-11s %s\n' '----------------' '-----------' '-------'
  for tool in "${TOOLS[@]}"; do
    [[ -z "$filter" || "${CATEGORY[$tool]}" == "$filter" ]] || continue
    printf '%-16s %-11s %s\n' "$tool" "${CATEGORY[$tool]}" "${SUMMARY[$tool]}"
  done
}

show_categories() {
  local category count tool noun
  for category in "${CATEGORIES[@]}"; do
    count=0
    for tool in "${TOOLS[@]}"; do
      [[ "${CATEGORY[$tool]}" == "$category" ]] && count=$((count + 1))
    done
    noun=tools
    ((count == 1)) && noun=tool
    printf '%-11s %2d %s\n' "$category" "$count" "$noun"
  done
}

valid_category() {
  local wanted="$1" category
  for category in "${CATEGORIES[@]}"; do
    [[ "$category" == "$wanted" ]] && return 0
  done
  return 1
}

show_search() {
  local query tool haystack word matched found=0
  query="$(printf '%s ' "$@")"
  query="${query% }"
  query="${query,,}"
  [[ -n "$query" ]] || { echo 'usage: toolhelp search <words>' >&2; return 2; }
  for tool in "${TOOLS[@]}"; do
    haystack="${tool} ${CATEGORY[$tool]} ${SUMMARY[$tool]}"
    haystack="${haystack,,}"
    matched=1
    for word in "$@"; do
      word="${word,,}"
      [[ "$haystack" == *"$word"* ]] || { matched=0; break; }
    done
    if ((matched == 1)); then
      printf '%-16s %-11s %s\n' "$tool" "${CATEGORY[$tool]}" "${SUMMARY[$tool]}"
      found=1
    fi
  done
  ((found == 1)) || { printf 'no tools matched: %s\n' "$query" >&2; return 1; }
}

show_detail() {
  local requested="$1"
  local tool
  tool="$(canonical_tool "$requested")"

  case "$tool" in
    rg)
      cat <<'DOC'
RG (RIPGREP) — repository-aware text search

Purpose:
  Search file contents recursively with fast regex matching and sensible code-
  repository defaults. It respects .gitignore, skips hidden and binary files,
  and prints useful filenames and line numbers automatically.

Use it when:
  You know text, a symbol, error fragment, or regex and need occurrences across
  a repository. It should be your default interactive recursive search.

Keep grep when:
  Reading stdin, writing portable scripts, relying on exact POSIX/GNU grep
  behavior, or working on a machine where rg is not installed.

Examples:
  rg -n 'TODO|FIXME'
  rg 'parse_config' src tests
  rg -g '*.ts' -g '!*.test.ts' 'deprecatedApi'
  rg --hidden -g '!.git' 'secret_name'
  rg -l 'pattern' | fzf

Related: fd finds by path; ast-grep searches parsed code structure.
DOC
      ;;
    fd)
      cat <<'DOC'
FD — human-oriented file and directory search

Purpose:
  Cover the common find use cases with readable arguments, parallel traversal,
  regex or glob matching, ignore-file support, and convenient command execution.

Use it when:
  Locating files by name, extension, type, or path inside a project; feeding a
  clean candidate set into fzf; or applying one command to matched files.

Keep find when:
  You need its full predicate/action language, strict portability, unusual
  metadata predicates, or carefully controlled traversal semantics.

Examples:
  fd config
  fd -e rs -e toml
  fd --type d --hidden --exclude .git cache
  fd -e sh -x shellcheck
  fd -e rs -X sd 'old_name' 'new_name'

Notes:
  -x runs once per result; -X batches results into fewer command invocations.
  Ubuntu names the package binary fdfind; this setup provides the normal fd name.
DOC
      ;;
    fzf)
      cat <<'DOC'
FZF — interactive fuzzy selection primitive

Purpose:
  Turn any newline-delimited candidate list into a fast searchable picker. It is
  not a search engine itself; its power comes from composing it with fd, rg,
  git, ps, history, or arbitrary command output.

Use it when:
  You can generate the candidate set but do not want to type an exact name.

Examples:
  fd -t f | fzf --preview 'bat --color=always --style=numbers {}'
  git branch --format='%(refname:short)' | fzf
  kill "$(ps -eo pid=,command= | fzf | awk '{print $1}')"
  fedit                  # managed helper: pick a file and open it
  fcd                    # managed helper: pick a directory and cd

Zsh bindings:
  Ctrl-T selects a file. Alt-C selects a directory. Atuin owns Ctrl-R so shell
  history remains contextual rather than using fzf's flat history picker.
DOC
      ;;
    zoxide)
      cat <<'DOC'
ZOXIDE — frecent directory navigation

Purpose:
  Learn directories you visit and rank them by frequency plus recency. It
  augments cd with intent-based jumps rather than replacing deterministic paths.

Use it when:
  Returning to known projects or deep directories whose full path is tedious.

Examples:
  z backend
  z standards C
  zi                    # interactively choose a known directory
  z -                   # jump back, where supported by the shell integration

Keep cd when:
  A script or human must navigate to one exact path regardless of history.
DOC
      ;;
    bat)
      cat <<'DOC'
BAT — source-aware file viewer

Purpose:
  Display text with syntax highlighting, line numbers, Git change markers,
  paging, and search while preserving a cat-like invocation.

Use it when:
  Reading source, configuration, logs, or command output interactively.

Examples:
  bat src/main.rs
  bat --diff src/main.rs
  bat -p README.md       # plain output without decorations
  rg -n 'unsafe' | bat --language=txt

Keep cat when:
  Concatenating files, piping exact bytes, processing binary data, or scripting.
  This setup intentionally does not alias cat to bat.
DOC
      ;;
    eza)
      cat <<'DOC'
EZA — richer interactive directory listings

Purpose:
  Add clear metadata, Git status, trees, icons when supported, hyperlinks, and
  better presentation to the ordinary directory-listing workflow.

Use it when:
  Inspecting a directory or getting a quick repository-aware tree.

Examples:
  eza -lah --git --group-directories-first
  eza --tree --level=2 --git-ignore
  ll                    # managed detailed alias
  lt                    # managed two-level tree alias

Keep ls when:
  Writing scripts, depending on exact GNU/POSIX flags, or operating remotely.
  The managed ls aliases are interactive Zsh conveniences only.
DOC
      ;;
    delta)
      cat <<'DOC'
DELTA — readable Git diff pager

Purpose:
  Render normal line-oriented patches with syntax highlighting, strong hunk
  navigation, line numbers, and clear intra-line changes. Git remains the source
  of truth; delta improves only presentation.

Use it when:
  Reviewing git diff, show, log -p, blame output, or merge conflict context.

Examples:
  git diff               # automatically paged through delta
  git show HEAD~1
  git log -p
  git -c delta.side-by-side=true diff

Notes:
  n/N navigate between diff sections in the pager. Difftastic is the opt-in
  structural alternative when a textual patch obscures the semantic change.
DOC
      ;;
    difftastic)
      cat <<'DOC'
DIFFTASTIC — syntax-aware structural diff

Purpose:
  Parse both versions of supported source files and compare their syntax trees,
  reducing noise from formatting and making moved or nested changes clearer.

Use it when:
  Understanding a code change is more important than seeing the canonical patch
  representation, especially after formatting or large structural edits.

Examples:
  difft old.ts new.ts
  git dft
  git dshow HEAD~1
  git dlog --oneline -5

Keep delta / git diff when:
  Reviewing the exact patch that will be committed, copied, or applied. The
  setup deliberately makes delta the default and difftastic explicit.
DOC
      ;;
    jq)
      cat <<'DOC'
JQ — JSON query and transformation language

Purpose:
  Parse JSON correctly, select nested data, filter records, aggregate values,
  and reshape output without brittle grep/sed pipelines.

Use it when:
  Consuming APIs, JSONL logs, package metadata, or structured command output.

Examples:
  jq . response.json
  jq -r '.items[] | select(.active) | .name' response.json
  jq '.items | group_by(.team) | map({team: .[0].team, count: length})' data.json
  xh GET api.example.test/items | jq '.items[] | {id, name}'

Notes:
  Use -r when the next command needs raw strings rather than JSON quoting.
DOC
      ;;
    yq)
      cat <<'DOC'
YQ — structured YAML and configuration editing

Purpose:
  Apply jq-like expressions to YAML while also supporting JSON, XML, INI,
  properties, CSV, and TSV. This is Mike Farah's Go implementation.

Use it when:
  Reading or changing Kubernetes, Compose, CI, or application configuration.

Examples:
  yq '.services.web.image' compose.yml
  yq '.spec.template.spec.containers[].name' deployment.yml
  yq -i '.services.web.replicas = 3' compose.yml
  yq -o=json '.' config.yml | jq '.features'

Keep a real parser in application code when:
  Comments, schema validation, merge semantics, or round-trip fidelity are part
  of the product rather than a one-off command-line edit.
DOC
      ;;
    mlr)
      cat <<'DOC'
MLR (MILLER) — named-field streaming data processing

Purpose:
  Bring an awk-like pipeline model to CSV, TSV, JSON, and JSON Lines while
  understanding headers, quoting, record structure, joins, and typed values.

Use it when:
  Tabular data fits in a stream and you want field-name-aware filtering,
  selection, sorting, aggregation, joins, or format conversion.

Examples:
  mlr --icsv --opprint cut -f name,total data.csv
  mlr --csv filter '$total > 100' then sort -nr total data.csv
  mlr --icsv --ojson cat data.csv
  mlr --csv stats1 -a count,sum,mean -f total -g team data.csv

Keep awk when:
  Processing arbitrary text, deploying to minimal systems, or writing a tiny
  portable record program. Use DuckDB later when the problem becomes relational.
DOC
      ;;
    sd)
      cat <<'DOC'
SD — straightforward textual replacement

Purpose:
  Make the common sed substitution case readable, with familiar regex syntax,
  literal-string support, and far less delimiter and escaping ceremony.

Use it when:
  Replacing text in one or many files without sed's address/action language.

Examples:
  sd 'old_name' 'new_name' src/main.rs
  sd --string-mode 'a.b[c]' 'literal replacement' file.txt
  fd -e rs -X sd 'OldType' 'NewType'
  printf '%s\n' 'hello world' | sd 'world' 'there'

Keep sed when:
  Portability, address ranges, multiple editing commands, hold space, or other
  stream-programming behavior matters.
DOC
      ;;
    ast-grep)
      cat <<'DOC'
AST-GREP — structural code search and rewrite

Purpose:
  Match parsed syntax rather than text. Patterns look like code and can contain
  metavariables, so comments, strings, formatting, and unrelated identifiers do
  not produce the same false positives as regex-based codemods.

Use it when:
  Searching call shapes, enforcing repository-specific patterns, or performing
  reviewable multi-language codemods—particularly in agent-driven changes.

Examples:
  ast-grep --pattern 'console.log($MSG)' --lang ts
  ast-grep --pattern 'var $A = $B' --rewrite 'let $A = $B' --lang js
  ast-grep scan
  ast-grep --pattern '$A == $A' --lang ts

Notes:
  Quote patterns so the shell does not expand $ metavariables. Start with a
  one-liner; move recurring policy into checked-in ast-grep rules and tests.
DOC
      ;;
    hyperfine)
      cat <<'DOC'
HYPERFINE — statistical command benchmarking

Purpose:
  Run commands repeatedly with warmups, report distributions, compare variants,
  parameterize inputs, and export results. It avoids conclusions from one noisy
  invocation of time.

Use it when:
  Comparing implementations, flags, compilers, search tools, or build changes.

Examples:
  hyperfine --warmup 3 'rg TODO' 'grep -R TODO .'
  hyperfine --prepare 'rm -rf target' 'cargo build'
  hyperfine -L threads 1,2,4,8 'mytool --threads {threads}'
  hyperfine --export-json benchmark.json 'command-a' 'command-b'

Notes:
  Control caches, setup, input, CPU contention, and correctness before trusting
  a result. Hyperfine improves measurement mechanics, not experimental design.
DOC
      ;;
    just)
      cat <<'DOC'
JUST — explicit project command interface

Purpose:
  Put common development commands in a discoverable justfile with arguments,
  dependencies, variables, recipes, and good errors—without pretending tasks
  are timestamp-based build artifacts.

Use it when:
  A repository has repeated test/lint/run/generate/release commands that should
  be identical for humans, CI, and agents.

Examples:
  just --list
  just test
  just lint --fix
  just --choose          # interactive recipe selection when supported

Keep make when:
  You genuinely need an incremental dependency graph and artifact rebuild logic.
DOC
      ;;
    watchexec)
      cat <<'DOC'
WATCHEXEC — generic file-change feedback loops

Purpose:
  Watch files, debounce/coalesce events, honor ignore files, and rerun or restart
  arbitrary commands without adopting a framework-specific watcher.

Use it when:
  Running tests, formatters, generators, servers, or previews continuously while
  editing.

Examples:
  watchexec -e rs -- cargo test
  watchexec -w src -e ts,tsx -- npm test
  watchexec --restart -- npm run dev
  watchexec --clear -- just check

Notes:
  Put the watched command after -- so its flags cannot be parsed as watchexec's.
DOC
      ;;
    shellcheck)
      cat <<'DOC'
SHELLCHECK — shell-script static analysis

Purpose:
  Detect quoting mistakes, unintended globbing and splitting, broken tests,
  portability errors, dead assignments, and many semantic traps before runtime.

Use it when:
  Writing or reviewing Bash/POSIX shell, especially generated automation and CI.

Examples:
  shellcheck script.sh
  fd -e sh -x shellcheck
  shellcheck --shell=bash script-without-shebang
  shellcheck -x script.sh   # follow sourced files where resolvable

Notes:
  Suppress a warning narrowly and document why; do not blanket-disable checks to
  make a lint suite green.
DOC
      ;;
    shfmt)
      cat <<'DOC'
SHFMT — parser-backed shell formatting

Purpose:
  Parse and deterministically format POSIX shell, Bash, mksh, and Bats. It
  complements ShellCheck: shfmt normalizes structure; ShellCheck finds likely
  bugs.

Use it when:
  Keeping repository shell readable and producing stable agent-generated output.

Examples:
  shfmt -d .
  shfmt -w -i 2 -ci script.sh
  fd -e sh -x shfmt -d
  shfmt --language-dialect bash -w script

Notes:
  Check the chosen style into CI rather than relying on each developer's memory.
  shfmt does not parse Zsh; use zsh -n for syntax checks and review Zsh
  formatting separately.
DOC
      ;;
    zsh)
      cat <<'DOC'
ZSH — interactive shell retained by this setup

Purpose:
  Provide a configurable interactive environment with completion, autosuggest,
  syntax highlighting, Atuin history, zoxide navigation, fzf bindings, mise,
  and Starship.

Use it when:
  Working interactively in WSL. This bootstrap intentionally installs no fish,
  Nushell, Oils/YSH, Xonsh, or PowerShell shell environment.

Examples:
  exec zsh
  source ~/.zshrc
  sz                    # managed reload alias
  bindkey               # inspect active key bindings

Script rule:
  Use #!/usr/bin/env bash for Bash scripts or /bin/sh for deliberately POSIX
  scripts. Do not assume interactive Zsh features in repositories or CI.
DOC
      ;;
    atuin)
      cat <<'DOC'
ATUIN — contextual shell history

Purpose:
  Store commands with directory, timestamp, duration, exit status, and host
  context in SQLite; provide powerful search and optional encrypted sync.

Use it when:
  Recovering the exact command you ran in a project days or months ago.

Examples:
  Ctrl-R                # contextual interactive search
  atuin search 'docker compose'
  atuin search --cwd . 'pytest'
  atuin stats
  atuin import auto     # import pre-existing history if needed

Privacy:
  History can contain secrets typed on command lines. Review Atuin settings and
  shell habits before enabling synchronization.
DOC
      ;;
    tldr)
      cat <<'DOC'
TLDR (TEALDEER) — example-first command reminders

Purpose:
  Show a small set of practical invocations for commands whose basic syntax you
  have forgotten. The installed implementation is tealdeer; the command is tldr.

Use it when:
  You need a familiar example faster than you can search a long manual page.

Examples:
  tldr tar
  tldr git-rebase
  tldr rg
  tldr --update

Keep man when:
  You need authoritative details, complete flags, semantics, environment
  variables, exit statuses, or documentation matching the local version.
DOC
      ;;
    mise)
      cat <<'DOC'
MISE — polyglot tool-version and environment manager

Purpose:
  Pin language/runtime/tool versions per project, activate them in Zsh, manage
  environment variables, and optionally expose tasks through one coherent layer.

Use it when:
  Repositories require different Node, Python, Go, Java, or other tool versions.

Examples:
  mise use node@lts
  mise use -g node@lts
  mise install
  mise ls
  mise exec -- node --version

Notes:
  Prefer checked-in mise configuration for reproducibility. Use just as the
  primary human-facing task menu unless mise-specific task features are needed.
DOC
      ;;
    starship)
      cat <<'DOC'
STARSHIP — cross-shell contextual prompt

Purpose:
  Display concise repository, language, environment, cloud, and command-status
  context using one fast prompt configuration.

Use it when:
  You want useful ambient state without maintaining a large Zsh theme framework.

Examples:
  starship explain
  starship timings
  starship print-config > ~/.config/starship.toml

Notes:
  Prompt information has a rendering cost. Keep only modules that change your
  decisions; do not turn the prompt into a dashboard for its own sake.
DOC
      ;;
    cargo-binstall)
      cat <<'DOC'
CARGO-BINSTALL — prebuilt Rust CLI installer

Purpose:
  Install compatible Rust CLI release binaries instead of compiling every crate
  locally, with fallback behavior for crates that lack suitable artifacts.

Use it when:
  Installing or updating Rust command-line tools. The bootstrap uses it
  automatically and disables telemetry for those unattended invocations.

Examples:
  cargo binstall --no-confirm ripgrep
  cargo binstall --no-confirm --force just
  cargo binstall --help

Notes:
  This is mostly setup infrastructure. Prefer distro or verified upstream
  artifacts when they are the project's canonical distribution channel.
DOC
      ;;
    jj)
      cat <<'DOC'
JJ (JUJUTSU) — safer Git-compatible version-control workflow

Purpose:
  Add automatic working-copy snapshots, mutable commits, an operation log,
  first-class undo, and automatic descendant rebasing while interoperating with
  colocated Git repositories.

Use it when:
  You want safer experimentation, frequent agent edits, or less staging-area and
  rebase choreography. Adopt it deliberately; it changes the working model.

Examples:
  jj git init --colocate
  jj status
  jj log
  jj new
  jj describe -m 'explain the current change'
  jj undo
  jj op log

Notes:
  Git remains the storage/interchange baseline. Start in a disposable or
  recoverable repository and learn revsets/bookmarks before replacing habits.
DOC
      ;;
    gh)
      cat <<'DOC'
GH — official GitHub command-line client

Purpose:
  Bring pull requests, issues, Actions runs, releases, repository operations,
  and GitHub's REST/GraphQL APIs into the terminal without replacing Git itself.

Use it when:
  A local Git workflow crosses into GitHub: checking out a pull request, watching
  CI, creating a release, inspecting repository metadata, or scripting an API.

Examples:
  gh auth login
  gh auth status
  gh pr status
  gh pr checkout 123
  gh run watch
  gh repo view --web
  gh api repos/{owner}/{repo}/releases/latest --jq .tag_name

Keep Git when:
  Working with commits, branches, diffs, remotes, or non-GitHub hosts. Authenticate
  deliberately: on systems without a credential store, gh may fall back to a
  plaintext token file, so inspect `gh auth status` and protect its config.
DOC
      ;;
    lazygit)
      cat <<'DOC'
LAZYGIT — visual terminal Git interface

Purpose:
  Make files, hunks, commits, branches, rebases, conflicts, stashes, and remotes
  visible in one keyboard-driven TUI while retaining ordinary Git underneath.

Use it when:
  The operation is easier to understand spatially than as a sequence of commands,
  particularly selective staging, history editing, and conflict resolution.

Examples:
  lazygit
  lg                    # managed alias
  lazygit -p /path/to/repo

Keep Git commands when:
  Automating, documenting reproducible procedures, or performing an operation
  whose exact flags and effects should be explicit.
DOC
      ;;
    btop)
      cat <<'DOC'
BTOP — broad interactive system monitor

Purpose:
  Show CPU, memory, processes, disks, and network activity in one navigable view.

Use it when:
  Establishing whether a machine is CPU-bound, memory-pressured, I/O-heavy, or
  occupied by an unexpected process.

Examples:
  btop
  Press f to filter processes; use the built-in help for active key bindings.

Keep top/ps when:
  Working on minimal remote systems, scripting, or requesting precise selected
  process fields. Btop is an investigation UI, not a machine-readable API.
DOC
      ;;
    dust)
      cat <<'DOC'
DUST — visual disk-consumption summary

Purpose:
  Rank the directories and files consuming space and display their relationship
  as a compact tree.

Use it when:
  The question is "what inside this path is large?"

Examples:
  dust
  dust .
  dust -d 2 .
  dust ~/Downloads

Related:
  duf answers filesystem capacity and mount questions. lnav helps inspect large
  logs after dust identifies them. Use du in portable scripts.
DOC
      ;;
    duf)
      cat <<'DOC'
DUF — readable filesystem and mount overview

Purpose:
  Present mounted filesystems, types, sizes, used/free capacity, and mount points
  in a grouped human-readable table.

Use it when:
  The question is "which filesystem is full, mounted, local, or available?"

Examples:
  duf
  duf /
  duf --json | jq

Related:
  Dust drills into the contents consuming space. Keep df for scripts and minimal
  hosts.
DOC
      ;;
    lnav)
      cat <<'DOC'
LNAV — format-aware interactive log analysis

Purpose:
  Detect common log formats, merge multiple files chronologically, follow live
  updates and rotations, pretty-print structured records, filter interactively,
  and query recognized fields.

Use it when:
  Correlating application, service, and rotated logs is becoming a tail/grep maze.

Examples:
  lnav app.log
  lnav app.log app.log.1.gz
  lnav /var/log/syslog
  /timeout              # search inside lnav
  :filter-in error      # retain matching lines

Keep tail/grep when:
  A tiny stream pipeline is sufficient or the environment lacks lnav.
DOC
      ;;
    xh)
      cat <<'DOC'
XH — ergonomic interactive HTTP client

Purpose:
  Provide HTTPie-style request syntax, native JSON values, readable responses,
  authentication helpers, downloads, and sessions in a fast single binary.

Use it when:
  Exploring or debugging JSON APIs manually.

Examples:
  xh GET https://api.example.test/users
  xh POST https://api.example.test/users name=Krish active:=true
  xh -v GET https://api.example.test/users Authorization:'Bearer TOKEN'
  xh --download GET https://example.test/archive.zip

Keep curl when:
  Scripting, relying on protocol breadth, copying documented commands, or running
  in deployment environments where curl is the standard dependency.
DOC
      ;;
    ouch)
      cat <<'DOC'
OUCH — consistent archive command interface

Purpose:
  Infer common archive/compression formats from filenames and expose one set of
  compress, decompress, and list commands instead of format-specific flag lore.

Use it when:
  Creating or unpacking ordinary local archives interactively.

Examples:
  ouch compress one.txt two.txt archive.zip
  ouch c project/ project.tar.zst
  ouch decompress archive.tar.zst
  ouch d archive.zip
  ouch list archive.zip --tree

Keep tar/unzip/7z when:
  Scripting against exact format behavior, using uncommon options, or working on
  systems without ouch.
DOC
      ;;
    zstd)
      cat <<'DOC'
ZSTD — fast modern compression

Purpose:
  Deliver high compression/decompression throughput with tunable ratios and a
  stable format well suited to logs, caches, artifacts, and backups.

Use it when:
  You control both ends and want a better speed/ratio tradeoff than gzip.

Examples:
  zstd large.log
  zstd -19 artifact.tar
  unzstd large.log.zst
  tar --zstd -cf project.tar.zst project/
  tar --zstd -xf project.tar.zst

Keep gzip when:
  Compatibility with old systems, browsers, or established interchange matters.
DOC
      ;;
    trash)
      cat <<'DOC'
TRASH-CLI — recoverable interactive deletion

Purpose:
  Move files to the FreeDesktop trash rather than unlinking them immediately,
  with commands to inspect, restore, and empty discarded items.

Use it when:
  Deleting interactively and recovery would be valuable.

Examples:
  trash-put file.txt
  trash-put directory/
  trash-list
  trash-restore
  trash-empty 30        # remove items older than 30 days

Safety rule:
  This setup does not alias rm. Scripts and explicit destructive operations must
  retain normal rm semantics rather than silently behaving differently.
DOC
      ;;
    age)
      cat <<'DOC'
AGE — small composable file encryption

Purpose:
  Encrypt files to simple public-key recipients or passphrases without GPG's
  broad key-management and configuration surface.

Use it when:
  Protecting local files, exchanging encrypted artifacts, or providing the age
  backend used by tools such as SOPS.

Examples:
  age-keygen -o ~/.config/age/keys.txt
  age-keygen -y ~/.config/age/keys.txt
  age -r age1RECIPIENT -o secrets.txt.age secrets.txt
  age -d -i ~/.config/age/keys.txt -o secrets.txt secrets.txt.age
  age -p -o notes.txt.age notes.txt

Safety:
  Protect private keys and backups. Encryption does not erase plaintext copies,
  shell history, editor swap files, or leaked command-line secrets.
DOC
      ;;
    tmux)
      cat <<'DOC'
TMUX — persistent terminal workspace

Purpose:
  Keep terminal sessions alive, split work into panes/windows, detach and resume,
  and host repeatable terminal workflows independent of the outer terminal.

Use it when:
  Running long-lived development sessions or organizing editor, tests, logs, and
  shells together.

Examples:
  tm [name]             # managed attach-or-create helper
  tn [name]             # create a session
  tmux_help             # managed key reference
  tmux list-sessions

Managed prefix: Ctrl-Space. Ctrl-h/j/k/l moves between tmux and Neovim panes.
DOC
      ;;
    herdr)
      cat <<'DOC'
HERDR — agent-aware terminal multiplexer

Purpose:
  Run several AI coding agents in one terminal as workspaces, tabs, and panes,
  and track whether each agent is working, blocked, done, or idle. Supports
  detach/reattach and mouse-driven splitting, like a tmux built around agents.

Use it when:
  Supervising more than one coding agent at a time. For ordinary editing and
  long-lived shell sessions, tmux remains the managed default.

Examples:
  herdr                 # launch or attach to the default session
  herdr --help          # authoritative command reference

Notes:
  The bootstrap installs the binary only. It does not configure herdr, does not
  change the tmux setup, and does not start herdr automatically. Existing tmux
  sessions remain unchanged.
DOC
      ;;
    nvim)
      cat <<'DOC'
NVIM (NEOVIM) — programmable terminal editor

Purpose:
  Provide a fast modal editor with Lua configuration, LSP/tree-sitter ecosystem,
  terminal integration, and an optional managed LazyVim starter configuration.

Use it when:
  Editing code and text inside WSL, especially within tmux.

Examples:
  nvim .
  nvim path/to/file
  nvim +42 path/to/file
  vi / vim              # managed aliases point to nvim

Notes:
  The bootstrap installs current upstream Neovim and only creates LazyVim config
  when ~/.config/nvim does not already exist.
DOC
      ;;
    dagger)
      cat <<'DOC'
DAGGER — programmable containerized pipelines

Purpose:
  Express CI and development workflows as reusable code executed through a
  container engine, reducing divergence between local and hosted automation.

Use it when:
  A pipeline needs reproducible containers, caching, typed functions, and the
  same execution model locally and in CI.

Examples:
  dagger develop
  dagger call --help
  dagger call test
  dagger version

Requirement:
  Docker Desktop WSL integration, Podman, or another supported running container
  runtime must be available. Dagger is substantial; use it only where its model
  simplifies a real pipeline.
DOC
      ;;
    *)
      printf 'unknown tool: %s\n' "$requested" >&2
      printf 'run `toolhelp list` to see valid names\n' >&2
      return 2
      ;;
  esac

  show_status "$tool"
}

render() {
  local command="${1:-}"
  local tool category first

  case "$command" in
    '') show_overview ;;
    -h | --help | help) show_overview ;;
    list)
      category="${2:-}"
      if [[ -n "$category" ]] && ! valid_category "$category"; then
        printf 'unknown category: %s\n' "$category" >&2
        return 2
      fi
      show_list "$category"
      ;;
    categories) show_categories ;;
    category)
      category="${2:-}"
      [[ -n "$category" ]] || { echo 'usage: toolhelp category <name>' >&2; return 2; }
      valid_category "$category" || { printf 'unknown category: %s\n' "$category" >&2; return 2; }
      show_list "$category"
      ;;
    search)
      shift
      show_search "$@"
      ;;
    all)
      for tool in "${TOOLS[@]}"; do
        show_detail "$tool"
        printf '\n%s\n\n' '--------------------------------------------------------------------------'
      done
      ;;
    *)
      first=1
      for tool in "$@"; do
        ((first == 1)) || printf '\n%s\n\n' '--------------------------------------------------------------------------'
        first=0
        show_detail "$tool" || return
      done
      ;;
  esac
}

TOOLHELP_TMP=""
cleanup() {
  [[ -z "${TOOLHELP_TMP:-}" ]] || rm -f -- "$TOOLHELP_TMP"
}
trap cleanup EXIT

main() {
  local status line_count screen_lines
  if [[ -t 1 ]] && command -v less > /dev/null 2>&1; then
    TOOLHELP_TMP="$(mktemp)"
    set +e
    render "$@" > "$TOOLHELP_TMP"
    status=$?
    set -e
    line_count="$(wc -l < "$TOOLHELP_TMP")"
    screen_lines="${LINES:-40}"
    if ((line_count > screen_lines - 2)); then
      less -R "$TOOLHELP_TMP"
    else
      cat "$TOOLHELP_TMP"
    fi
    return "$status"
  fi
  render "$@"
}

main "$@"
# <<< wsl-bootstrap managed toolhelp <<<
TOOLHELP_SCRIPT

TOOLHELP_COMPLETION_MARKER="# >>> wsl-bootstrap managed _toolhelp >>>"
write_managed_file "$ZSH_COMPLETIONS_DIR/_toolhelp" "$TOOLHELP_COMPLETION_MARKER" 0644 << 'TOOLHELP_COMPLETION'
#compdef toolhelp
# >>> wsl-bootstrap managed _toolhelp >>>

_toolhelp() {
  local -a commands tools categories
  commands=(
    'list:list managed tools'
    'categories:list tool categories'
    'category:list tools in one category'
    'search:search tool names and summaries'
    'all:show the complete reference'
  )
  tools=(
    rg fd fzf zoxide bat eza delta difftastic jq yq mlr sd ast-grep
    hyperfine just watchexec shellcheck shfmt zsh atuin tldr mise starship
    cargo-binstall jj gh lazygit btop dust duf lnav xh ouch zstd trash age
    tmux herdr nvim dagger
  )
  categories=(search viewing data workflow shell vcs system network files workspace)

  if (( CURRENT == 2 )); then
    _describe -t commands 'command' commands
    _describe -t tools 'tool' tools
  elif [[ "${words[2]}" == category || "${words[2]}" == list ]]; then
    _describe -t categories 'category' categories
  else
    _describe -t tools 'tool' tools
  fi
}

_toolhelp "$@"
# <<< wsl-bootstrap managed _toolhelp <<<
TOOLHELP_COMPLETION

bash -n "$HOME/.local/bin/toolhelp"

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

export EDITOR="nvim"
export VISUAL="nvim"
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
export FZF_DEFAULT_COMMAND='fd --type f --hidden --follow --exclude .git'
export FZF_CTRL_T_COMMAND="$FZF_DEFAULT_COMMAND"
export FZF_ALT_C_COMMAND='fd --type d --hidden --follow --exclude .git'
export FZF_DEFAULT_OPTS="${FZF_DEFAULT_OPTS:---height=40% --layout=reverse --border}"
export FZF_CTRL_T_OPTS="${FZF_CTRL_T_OPTS:---preview 'bat --color=always --style=numbers --line-range=:500 {} 2>/dev/null'}"
export FZF_ALT_C_OPTS="${FZF_ALT_C_OPTS:---preview 'eza --tree --level=2 --color=always {} 2>/dev/null'}"
unset GOROOT GOTOOLDIR

ZSH_COMPLETIONS_DIR="$HOME/.local/share/wsl-bootstrap/zsh/site-functions"
[[ -d "$ZSH_COMPLETIONS_DIR" ]] && fpath=("$ZSH_COMPLETIONS_DIR" $fpath)

plugins=(git zsh-autosuggestions zsh-syntax-highlighting)
source "$ZSH/oh-my-zsh.sh"

[[ -f "$HOME/.cargo/env" ]] && source "$HOME/.cargo/env"

command -v mise >/dev/null 2>&1 && eval "$(mise activate zsh)"
command -v starship >/dev/null 2>&1 && eval "$(starship init zsh)"
command -v zoxide >/dev/null 2>&1 && eval "$(zoxide init zsh)"

if [[ -t 0 ]]; then
  [[ -f /usr/share/doc/fzf/examples/key-bindings.zsh ]] && source /usr/share/doc/fzf/examples/key-bindings.zsh
  [[ -f /usr/share/doc/fzf/examples/completion.zsh ]] && source /usr/share/doc/fzf/examples/completion.zsh
fi

# Initialize Atuin after fzf so Atuin deliberately owns Ctrl-R.
command -v atuin >/dev/null 2>&1 && eval "$(atuin init zsh --disable-up-arrow)"

setopt HIST_IGNORE_ALL_DUPS HIST_FIND_NO_DUPS INC_APPEND_HISTORY SHARE_HISTORY

alias cls=clear
alias sz='source ~/.zshrc'
alias vi=nvim
alias vim=nvim
alias ..='cd ..'
alias ...='cd ../..'
alias ....='cd ../../..'
alias .....='cd ../../../..'
alias th=toolhelp
alias lg=lazygit

if command -v eza >/dev/null 2>&1; then
  alias ls='eza --group-directories-first'
  alias ll='eza -lah --group-directories-first --git'
  alias la='eza -a --group-directories-first'
  alias lt='eza --tree --level=2 --group-directories-first --git-ignore'
else
  alias ls='ls --color=auto'
  alias ll='ls -alF'
fi

fedit() {
  local root="${1:-.}"
  local selected
  selected="$(fd --type f --hidden --follow --exclude .git . "$root" | \
    fzf --prompt='edit> ' --preview 'bat --color=always --style=numbers --line-range=:500 {} 2>/dev/null' || true)"
  [[ -n "$selected" ]] || return 0
  "${EDITOR:-nvim}" -- "$selected"
}

fcd() {
  local root="${1:-.}"
  local selected
  selected="$(fd --type d --hidden --follow --exclude .git . "$root" | \
    fzf --prompt='cd> ' --preview 'eza --tree --level=2 --color=always {} 2>/dev/null' || true)"
  [[ -n "$selected" ]] || return 0
  builtin cd -- "$selected"
}

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

  ticket="$(printf '%s\n' "$branch" | grep -o -E '[a-zA-Z0-9]+-[0-9]+' | head -n1 || true)"

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

CLI toolkit:
  toolhelp         Decision map and full managed-tool reference
  toolhelp tmux    Detailed tmux usage

Type 'man tmux' for authoritative documentation.
HELP
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

# Plugin Manager (TPM)
set -g @plugin 'tmux-plugins/tpm'
set -g @plugin 'tmux-plugins/tmux-sensible'
set -g @plugin 'christoomey/vim-tmux-navigator'
set -g @plugin 'janoamaral/tokyo-night-tmux'
set -g @plugin 'tmux-plugins/tmux-yank'

# Prefix.
unbind C-b
set -g prefix C-Space
bind C-Space send-prefix

# Advertise RGB support for the outer terminal and prefer tmux-256color when
# its terminfo entry is available.
set -as terminal-features ",xterm*:RGB"
if-shell 'infocmp -x tmux-256color >/dev/null 2>&1' 'set -g default-terminal "tmux-256color"' 'set -g default-terminal "screen-256color"'

# General.
set -g mouse on
set -g base-index 1
set -g pane-base-index 1
set-option -g renumber-windows on
set-window-option -g mode-keys vi
set -g history-limit 50000
set -s escape-time 0
set -g focus-events on

# Window navigation with Shift+Alt+H/L.
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

# Helpers.
bind-key f display-popup -E -w 80% -h 70% "~/.local/bin/tmux-sessionizer"
bind-key C display-popup -E -w 80% -h 70% "~/.local/bin/tmux-cht"

# Copy mode.
bind-key -T copy-mode-vi v send-keys -X begin-selection
bind-key -T copy-mode-vi C-v send-keys -X rectangle-toggle
# tmux-yank owns the y binding.

# Tokyo Night theme.
set -g @tokyo-night-tmux_theme 'storm'
set -g @tokyo-night-tmux_show_datetime 1
set -g @tokyo-night-tmux_date_format 'YMD'   # YMD, MDY, DMY
set -g @tokyo-night-tmux_time_format '24H'   # 24H, 12H
set -g @tokyo-night-tmux_show_netspeed 0
set -g @tokyo-night-tmux_show_git 0
set -g @tokyo-night-tmux_window_id_style 'digital'
set -g @tokyo-night-tmux_pane_id_style 'hsquare'
set -g @tokyo-night-tmux_zoom_id_style 'dsquare'

# tmux-yank settings.
set -g @yank_selection_mouse 'clipboard' # or 'primary' or 'secondary'
set -g @yank_action 'copy-pipe'

# Initialize TPM. Keep at the bottom.
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
  while IFS= read -r d; do candidates+=("$d"); done < <(
    find "$r" -mindepth 1 -maxdepth 2 -type d \( -name .git -prune -o -print \) 2>/dev/null
  )
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
  tmpdir="$(make_tmpdir)"
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

echo "done — run toolhelp for the managed CLI reference"
