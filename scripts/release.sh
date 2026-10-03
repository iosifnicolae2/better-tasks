#!/bin/sh
# Cut a release: tag origin/main, push the tag, create the GitHub release.
# Usage: scripts/release.sh v0.3.0 [notes.md]
# Without notes.md, the notes are the commit subjects since the last tag.
set -eu

version=$1
notes_file=${2:-}
case $version in v*) ;; *) version=v$version ;; esac

fail() { echo "release: $*" >&2; exit 1; }

git fetch -q origin main --tags
[ "$(git branch --show-current)" = main ] || fail "check out main first"
[ -z "$(git status --porcelain --untracked-files=no)" ] || fail "commit or stash your changes first"
[ "$(git rev-parse main)" = "$(git rev-parse origin/main)" ] || fail "main and origin/main differ: pull or push first"
git rev-parse -q --verify "refs/tags/$version" >/dev/null && fail "$version already exists"

previous=$(git describe --tags --abbrev=0 main 2>/dev/null || true)
[ -z "$previous" ] || [ "$(git rev-parse "$previous^{commit}")" != "$(git rev-parse main)" ] || fail "nothing new since $previous"

commit_notes() {
  echo "## Changes"
  git log --reverse --format='- %s' "${previous:+$previous..}main" | grep -v '^- Task log:' || true
  cat <<'EOF'

## Install / update

```sh
claude plugin marketplace update better-tasks
claude plugin update better-tasks@better-tasks
```
Then restart Claude Code. First install: `claude plugin marketplace add iosifnicolae2/better-tasks` and `claude plugin install better-tasks@better-tasks`.
EOF
}

if [ -z "$notes_file" ]; then
  notes_file=$(mktemp)
  commit_notes >"$notes_file"
fi

git tag -a "$version" -m "$version" main
git push -q origin "$version"
gh release create "$version" --verify-tag --title "$version" --notes-file "$notes_file"
