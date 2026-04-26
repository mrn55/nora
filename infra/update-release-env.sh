#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: update-release-env.sh <env-file> <version> <commit> [github-repo]

Updates or appends:
  NORA_CURRENT_VERSION
  NORA_CURRENT_COMMIT
  NORA_GITHUB_REPO (when provided)
EOF
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

if [ "$#" -lt 3 ] || [ "$#" -gt 4 ]; then
  usage >&2
  exit 1
fi

env_file="$1"
version="$2"
commit="$3"
github_repo="${4:-}"

if [ -z "$env_file" ] || [ -z "$version" ] || [ -z "$commit" ]; then
  echo "env file, version, and commit are required" >&2
  exit 1
fi

if [ ! -f "$env_file" ]; then
  echo "env file does not exist: $env_file" >&2
  echo "Run setup first or point DEPLOY_ENV_FILE at the existing production env file." >&2
  exit 1
fi

env_dir="$(dirname "$env_file")"

tmp_file="$(mktemp "$env_dir/.nora-release-env.XXXXXX")"
trap 'rm -f "$tmp_file"' EXIT

awk \
  -v version="$version" \
  -v commit="$commit" \
  -v github_repo="$github_repo" \
  '
  BEGIN {
    saw_version = 0
    saw_commit = 0
    saw_repo = 0
  }

  /^NORA_CURRENT_VERSION=/ {
    print "NORA_CURRENT_VERSION=" version
    saw_version = 1
    next
  }

  /^NORA_CURRENT_COMMIT=/ {
    print "NORA_CURRENT_COMMIT=" commit
    saw_commit = 1
    next
  }

  /^NORA_GITHUB_REPO=/ && github_repo != "" {
    print "NORA_GITHUB_REPO=" github_repo
    saw_repo = 1
    next
  }

  {
    print
  }

  END {
    if (!saw_version) {
      print "NORA_CURRENT_VERSION=" version
    }
    if (!saw_commit) {
      print "NORA_CURRENT_COMMIT=" commit
    }
    if (github_repo != "" && !saw_repo) {
      print "NORA_GITHUB_REPO=" github_repo
    }
  }
  ' "$env_file" > "$tmp_file"

mv "$tmp_file" "$env_file"
