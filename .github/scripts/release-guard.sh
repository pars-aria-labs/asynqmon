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

# GitHub's release-by-tag endpoint can return 404 for a draft immediately after
# it is created. The releases collection includes drafts for a token with push
# access, so scan it page by page and distinguish an absent release from a draft
# that a failed workflow can safely resume.
page=1
while true; do
  http_status="$(curl --silent --show-error --location \
    --output "$response_file" \
    --write-out '%{http_code}' \
    --header "Authorization: Bearer ${GH_TOKEN:?}" \
    --header 'Accept: application/vnd.github+json' \
    --header 'X-GitHub-Api-Version: 2022-11-28' \
    "${GITHUB_API_URL:?}/repos/${GITHUB_REPOSITORY:?}/releases?per_page=100&page=${page}")"

  if [[ "$http_status" != "200" ]]; then
    echo "GitHub Releases API returned HTTP ${http_status}" >&2
    exit 1
  fi

  read -r release_state release_count < <(python3 -c '
import json
import sys

with open(sys.argv[1], encoding="utf-8") as response:
    releases = json.load(response)
if not isinstance(releases, list):
    raise SystemExit("GitHub releases response is not an array")

matches = [release for release in releases if release.get("tag_name") == sys.argv[2]]
if len(matches) > 1:
    raise SystemExit("GitHub returned multiple releases for one tag")
if matches:
    draft = matches[0].get("draft")
    if not isinstance(draft, bool):
        raise SystemExit("GitHub release response has no boolean draft field")
    state = "draft" if draft else "published"
else:
    state = "absent"
print(state, len(releases))
' "$response_file" "$release_tag")

  if [[ "$release_state" != "absent" ]]; then
    echo "$release_state"
    exit 0
  fi
  if [[ "$release_count" -lt 100 ]]; then
    echo "absent"
    exit 0
  fi
  page=$((page + 1))
done
