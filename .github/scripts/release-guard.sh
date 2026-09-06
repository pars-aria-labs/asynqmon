#!/usr/bin/env bash

set -euo pipefail

if [[ "$#" -ne 2 ]]; then
  echo "usage: release-guard.sh <tag> <expected-commit>" >&2
  exit 2
fi

release_tag=$1
expected_commit=$2

git fetch --force --no-tags origin \
  "+refs/tags/${release_tag}:refs/tags/${release_tag}" >/dev/null
actual_commit="$(git rev-parse --verify "${release_tag}^{commit}")"
if [[ "$actual_commit" != "$expected_commit" ]]; then
  echo "release tag ${release_tag} targets ${actual_commit}, expected ${expected_commit}" >&2
  exit 1
fi

response_file="$(mktemp)"
trap 'rm -f "$response_file"' EXIT

http_status="$(curl --silent --show-error --location \
  --output "$response_file" \
  --write-out '%{http_code}' \
  --header "Authorization: Bearer ${GH_TOKEN:?}" \
  --header 'Accept: application/vnd.github+json' \
  --header 'X-GitHub-Api-Version: 2022-11-28' \
  "${GITHUB_API_URL:?}/repos/${GITHUB_REPOSITORY:?}/releases/tags/${release_tag}")"

case "$http_status" in
  200)
    python3 -c '
import json
import sys

with open(sys.argv[1], encoding="utf-8") as response:
    draft = json.load(response).get("draft")
if not isinstance(draft, bool):
    raise SystemExit("GitHub release response has no boolean draft field")
print("draft" if draft else "published")
' "$response_file"
    ;;
  404)
    echo "absent"
    ;;
  *)
    echo "GitHub Releases API returned HTTP ${http_status}" >&2
    exit 1
    ;;
esac
