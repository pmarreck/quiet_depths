#!/usr/bin/env bash
# Follows a pushed commit to the live site: waits for its push workflow run,
# reports the run's conclusion and test counts, then waits until GitHub Pages
# serves that exact commit, optionally counting a pattern in a changed asset.
#   scripts/verify-release.sh FULL_SHA [ASSET_PATH PATTERN]
# Needs gh (signed in), curl, jq and rg.
set -u
sha=$1 asset=${2:-} pattern=${3:-}
cd "$(dirname "$0")/.." || exit 1
site=https://pmarreck.github.io/quiet_depths
id=
for _ in $(seq 1 24); do
  id=$(gh run list --commit "$sha" --json databaseId,event --jq '.[] | select(.event=="push") | .databaseId' | head -1)
  [ -n "$id" ] && break; sleep 5
done
[ -n "$id" ] || { echo "no workflow run found for $sha"; exit 1; }
echo "run $id"
gh run watch "$id" --exit-status --interval 20 > /dev/null 2>&1; echo "watch exit $?"
gh run view "$id" --json conclusion,headSha --jq '{conclusion,headSha}'
gh run view "$id" --log 2>/dev/null | rg -o "ℹ (tests|pass|fail) [0-9]+" | head -3
rev=
for _ in $(seq 1 45); do
  rev=$(curl -fsS "$site/build-provenance.json?nocache=$(date +%s)" | jq -r '.revision + " " + .commit')
  case "$rev" in *"$sha"*) break;; esac; sleep 20
done
echo "pages: $rev"
[ -n "$asset" ] && echo "asset match count: $(curl -fsS "$site/$asset?nocache=$(date +%s)" | grep -c -- "$pattern")"
exit 0
