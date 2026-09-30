#!/usr/bin/env bash
# Checks the SPARK manifest and source policy (manifest) or the committed Alire
# lockfile against the manifest (lock).
set -euo pipefail

readonly PROJECT_FILE="${SPARK_PROJECT_FILE:-project_name.gpr}"
readonly TEST_PROJECT_FILE="${SPARK_TEST_PROJECT_FILE:-project_name_tests.gpr}"

fail() {
  echo "$*" >&2
  exit 1
}

# Prints each direct dependency as name=constraint from alire.toml.
manifest_dependencies() {
  awk '
    /^\[\[depends-on\]\]/ { in_deps = 1; next }
    /^\[/ { in_deps = 0 }
    in_deps && /^[[:space:]]*[[:alnum:]_][[:alnum:]_-]*[[:space:]]*=/ {
      name = $0
      sub(/[[:space:]]*=.*/, "", name)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", name)
      value = substr($0, index($0, "=") + 1)
      gsub(/[[:space:]"]/, "", value)
      print name "=" value
    }
  ' alire.toml
}

check_manifest() {
  local missing_spark_mode

  [[ -f alire.toml ]] || fail "alire.toml is required for the SPARK standard."
  [[ -f "$PROJECT_FILE" ]] || fail "SPARK project file is missing: $PROJECT_FILE"
  [[ -f "$TEST_PROJECT_FILE" ]] || fail "SPARK test project file is missing: $TEST_PROJECT_FILE"

  awk '
    /^\[\[depends-on\]\]/ { in_deps = 1; next }
    /^\[/ { in_deps = 0 }
    in_deps && /^[[:space:]]*[[:alnum:]_][[:alnum:]_-]*[[:space:]]*=/ {
      value = substr($0, index($0, "=") + 1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      if (value !~ /^"=[0-9]+[.][0-9]+[.][0-9]+"$/) {
        print FILENAME ":" FNR ": dependency must use an exact =x.y.z constraint: " $0
        bad = 1
      }
    }
    END { exit bad }
  ' alire.toml >&2

  missing_spark_mode="$(
    find . -type d \( -path './.git' -o -path './alire' -o -path './build' -o -path './config' -o -path './obj' \) -prune \
      -o -type f \( -name '*.ads' -o -name '*.adb' \) \
      ! -exec awk '
        {
          line = $0
          sub(/[[:space:]]*--.*/, "", line)
          if (line ~ /SPARK_Mode/) {
            found = 1
          }
        }
        END { exit found ? 0 : 1 }
      ' {} \; -print
  )"
  if [[ -n "$missing_spark_mode" ]]; then
    printf '%s\n' "$missing_spark_mode" >&2
    fail "Ada sources must declare or inherit SPARK_Mode explicitly."
  fi
}

check_lock() {
  local lock=alire/alire.lock

  [[ -f "$lock" ]] || fail "$lock is required. Run mise run spark:lock:update and commit it."
  grep -q '^solved = true$' "$lock" ||
    fail "$lock does not contain a complete solution. Run mise run spark:lock:update."
  if grep '^fulfilment = ' "$lock" | grep -v '^fulfilment = "solved"$' >&2; then
    fail "$lock contains an unfulfilled dependency. Run mise run spark:lock:update."
  fi

  if ! diff -u <(manifest_dependencies | sort) <(
    awk '
      /^\[\[solution.state\]\]/ { crate = ""; direct = 0; next }
      /^crate = "/ {
        crate = $0
        sub(/^crate = "/, "", crate)
        sub(/"$/, "", crate)
      }
      /^transitivity = "direct"$/ { direct = 1 }
      direct && crate != "" && /^versions = "/ {
        version = $0
        sub(/^versions = "/, "", version)
        sub(/"$/, "", version)
        print crate "=" version
      }
    ' "$lock" | sort
  ) >&2; then
    fail "$lock is stale. Run mise run spark:lock:update and commit it."
  fi
}

case "${1:-}" in
  manifest) check_manifest ;;
  lock) check_lock ;;
  *)
    echo "Usage: $0 [manifest|lock]" >&2
    exit 2
    ;;
esac
