#!/usr/bin/env bash
# Runs mutant lists (tests/mutants/*.mutants) against the committed HEAD.
#
#   scripts/mutate.sh [--dry] [--timeout SECONDS] LIST...
#
# Each list is a shell fragment: variable settings, then one line per mutant,
#   m FILE PERL-SUBSTITUTION LABEL "TEST FILES"
# For each mutant this applies the substitution once to FILE in a disposable
# git worktree of HEAD, runs the named tests there through `nix develop`, and
# restores FILE from git. It prints one line per mutant:
#   killed    the tests failed;
#   SURVIVED  they passed, with no test canceled;
#   UNKNOWN   anything else, such as a hang past the timeout, which counts as
#             killed only once someone has checked why;
#   DID NOT APPLY  the substitution changed nothing.
# --dry checks against the working tree, without running tests, that every
# mutant applies exactly once (a substitution matching twice would mutate
# a different place than its label says).
set -u
root=$(git -C "$(dirname "$0")/.." rev-parse --show-toplevel) || exit 2
dry=0 limit=240 lists=()
while [ $# -gt 0 ]; do
  case $1 in
    --dry) dry=1 ;;
    --timeout) limit=$2; shift ;;
    -*) echo "unknown option $1" >&2; exit 2 ;;
    *) lists+=("$(realpath "$1")") ;;
  esac
  shift
done
[ ${#lists[@]} -gt 0 ] || { sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }

if [ $dry = 1 ]; then
  cd "$root" || exit 2
  m() {
    local before once all
    before=$(cat "$1") once=$(perl -0pe "$2" "$1") all=$(perl -0pe "${2}g" "$1")
    if [ "$before" = "$once" ]; then echo "$3: DOES NOT APPLY"
    elif [ "$once" != "$all" ]; then echo "$3: MATCHES MORE THAN ONCE"; fi
  }
  for list in "${lists[@]}"; do . "$list"; done
  exit 0
fi

work=$(mktemp -d "${TMPDIR:-/tmp}/quiet-depths-mutants.XXXXXX") || exit 2
tree="$work/tree"
git -C "$root" worktree add -q --detach "$tree" HEAD || exit 2
# The worktree is this run's own; it goes when the run ends.
trap 'cd "$root" && git worktree remove --force "$tree"; rmdir "$work"' EXIT
cd "$tree" || exit 2
m() {
  local file=$1 pattern=$2 label=$3 tests=$4 t0 out counts verdict
  perl -0pi -e "$pattern" "$file"
  if git diff --quiet -- "$file"; then echo "$label: DID NOT APPLY"; return; fi
  t0=$(date +%s)
  # shellcheck disable=SC2086 # the test list is several words
  out=$(timeout "$limit" nix develop -c node --experimental-transform-types --no-warnings --test $tests 2>&1 | sed 's/\x1b\[[0-9;]*m//g')
  counts=$(echo "$out" | grep -E "^ℹ (pass|fail|cancelled)" | tr '\n' ' ')
  if echo "$out" | grep -qE "^ℹ fail [1-9]"; then verdict=killed
  elif echo "$out" | grep -qE "^ℹ fail 0" && echo "$out" | grep -qE "^ℹ cancelled 0"; then verdict=SURVIVED
  else verdict=UNKNOWN; fi
  echo "$label: $verdict ($counts$(( $(date +%s) - t0 ))s)"
  git checkout -q -- "$file"
  git diff --quiet -- "$file" || { echo "could not restore $file" >&2; exit 1; }
}
for list in "${lists[@]}"; do . "$list"; done
