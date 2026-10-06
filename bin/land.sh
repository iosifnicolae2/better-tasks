#!/bin/sh
# Commits only the given paths onto a branch, from a private index, in a checkout that several
# teammates share. Usage: land.sh [-b <branch>] -m <message> [-m <more>] -- <path>...
# The shared index is never written, so a peer's staged files can't enter this commit. The branch moves
# only if nobody moved it meanwhile (update-ref with its old value): then run it again. The branch
# defaults to the one checked out. Prints the new commit.
set -eu
case "${1:-}" in -h|--help) sed -n '2,/^[^#]/{/^#/s/^# \{0,1\}//p;}' "$0"; exit 0 ;; esac

branch=""
set -- "$@" --end--
messages=""
while [ "$1" != -- ] && [ "$1" != --end-- ]; do
  case "$1" in
    -b) branch="$2"; shift 2 ;;
    -m) messages="$messages$2
"; shift 2 ;;
    *) echo "land.sh: unknown argument $1 (usage: land.sh [-b branch] -m message -- paths)" >&2; exit 2 ;;
  esac
done
[ "$1" = -- ] && shift
paths_count=0
for arg in "$@"; do [ "$arg" = --end-- ] || paths_count=$((paths_count + 1)); done
[ -n "$messages" ] || { echo "land.sh: give a message with -m" >&2; exit 2; }
[ "$paths_count" -gt 0 ] || { echo "land.sh: name your paths after --" >&2; exit 2; }

current="$(git symbolic-ref -q --short HEAD || true)"
[ -n "$branch" ] || branch="$current"
[ -n "$branch" ] || { echo "land.sh: no branch checked out; pass -b <branch>" >&2; exit 2; }
base="$(git rev-parse --verify -q "refs/heads/$branch")" || { echo "land.sh: no branch $branch" >&2; exit 2; }

shared_index="$(git rev-parse --git-path index)"
private_dir="$(mktemp -d)"
trap 'rm -rf "$private_dir"' EXIT
export GIT_INDEX_FILE="$private_dir/index"
git read-tree "$base"

# Every path but the --end-- marker, staged into the private index only (a removed file is staged as removed).
for path in "$@"; do
  [ "$path" = --end-- ] && continue
  git add -A -- "$path"
done
if git diff --cached --quiet "$base"; then echo "land.sh: nothing to commit in those paths" >&2; exit 1; fi
git diff --cached --stat "$base" >&2

git hook run --ignore-missing pre-commit
tree="$(git write-tree)"
commit="$(printf '%s' "$messages" | git commit-tree "$tree" -p "$base")"
if ! git update-ref "refs/heads/$branch" "$commit" "$base"; then
  echo "land.sh: $branch moved while committing; nothing was written: run it again" >&2
  exit 1
fi

# The checked-out branch moved: the shared index takes the new blobs of these paths only, so git status
# doesn't show them as reverted (a later plain commit would undo this one). Paths a peer staged stay as they
# are. Another git command holding the index lock: wait for it, up to 10 s; still held, say what to run.
if [ "$branch" = "$current" ]; then
  unset GIT_INDEX_FILE
  for path in "$@"; do [ "$path" = --end-- ] || set -- "$@" "$path"; shift; done
  tries=0
  until git reset -q "$commit" -- "$@" 2>/dev/null; do
    tries=$((tries + 1))
    if [ "$tries" -ge 50 ]; then
      echo "land.sh: committed, but the shared index stayed locked ($shared_index.lock): run  git reset -q -- $*" >&2
      break
    fi
    sleep 0.2
  done
fi
echo "$commit"
