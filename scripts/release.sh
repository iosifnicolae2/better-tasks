#!/bin/sh
# Cut a release: pin the marketplace entry to the new tag in a "Release" commit, tag it,
# push the tag and main, create the GitHub release. Installs and updates get only tagged releases.
# Usage: scripts/release.sh [--dry-run] v0.3.0 [notes.md]
# Without notes.md, the notes are the commit subjects since the last tag.
# With the project setting releaseVideos (on unless .claude/tasks/config.json says false), the notes open with
# a video of the release's tasks, each before and after (bin/release-video.sh), put on the videos branch.
# --dry-run: makes the notes and the video and prints them; commits, tags, pushes and publishes nothing.
set -eu

dry_run=false
if [ "${1:-}" = --dry-run ]; then dry_run=true; shift; fi
version=$1
notes_file=${2:-}
case $version in v*) ;; *) version=v$version ;; esac

fail() { echo "release: $*" >&2; exit 1; }
bin=$(dirname "$0")/../bin

# A key of the project's config.json, else the default given.
setting() {
  jq -r --arg key "$1" --arg default "$2" 'if has($key) then .[$key] else $default end | tostring' .claude/tasks/config.json 2>/dev/null || echo "$2"
}

git fetch -q origin main --tags
[ "$(git branch --show-current)" = main ] || fail "check out main first"
[ -z "$(git status --porcelain --untracked-files=no)" ] || fail "commit or stash your changes first"
[ "$(git rev-parse main)" = "$(git rev-parse origin/main)" ] || fail "main and origin/main differ: pull or push first"
git rev-parse -q --verify "refs/tags/$version" >/dev/null && fail "$version already exists"
bun scripts/settings-doc.ts --check || fail "the settings skill is stale: run bun scripts/settings-doc.ts and commit"
bun scripts/skills-check.ts || fail "a skill lacks what its readers rely on: see above"

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

# Makes the release video; prints its poster's path, then the video's; nothing when there is none.
make_video() {
  [ "$(setting releaseVideos true)" = true ] || return 0
  git fetch -q origin better-tasks-videos 2>/dev/null || true
  status=0
  "$bin/release-video.sh" --version "$version" ${previous:+--since "$previous"} --until main \
    --quality "$(setting videoQuality medium)" || status=$?
  if [ "$status" = 3 ]; then
    echo "release: no task of $version has a video; it goes out without one" >&2
    return 0
  fi
  [ "$status" = 0 ] || fail "the release video failed (above). To release without it: \"releaseVideos\": false in .claude/tasks/config.json"
}

# The notes with the video's section on top: the poster, linking to the video.
notes_with_video() {
  video_url=$1 poster_url=$2 caption=$3
  printf '## Video\nEvery change in %s, before and after, in one narrated video.\n\n[![%s: before and after](%s)](%s)\n%s\n\n' \
    "$version" "$version" "$poster_url" "$video_url" "$caption"
  cat "$notes_file"
}

media=$(make_video) || exit 1
if [ -n "$media" ]; then
  poster=$(echo "$media" | tail -n 2 | head -n 1)
  video=$(echo "$media" | tail -n 1)
  if $dry_run; then
    links=$(printf '%s\n%s\n%s' "file://$video" "file://$poster" "(Dry run: not uploaded.)")
  else
    links=$("$bin/video-branch.sh" "$video" "$poster")
  fi
  with_video=$(mktemp)
  notes_with_video "$(echo "$links" | sed -n 1p)" "$(echo "$links" | sed -n 2p)" "$(echo "$links" | sed -n 3p)" >"$with_video"
  notes_file=$with_video
fi

if $dry_run; then
  echo "release: dry run of $version since ${previous:-the start}: nothing committed, tagged, pushed or published. The notes:"
  cat "$notes_file"
  exit 0
fi

pin_marketplace() {
  marketplace=.claude-plugin/marketplace.json
  jq --arg ref "$version" --arg number "${version#v}" \
    '.plugins[0].source.ref = $ref | .plugins[0].version = $number' "$marketplace" >"$marketplace.new"
  mv "$marketplace.new" "$marketplace"
  git add "$marketplace"
  git commit -q -m "Release $version"
}

pin_marketplace
git tag -a "$version" -m "$version" main
git push -q origin "$version"
git push -q origin main
gh release create "$version" --verify-tag --title "$version" --notes-file "$notes_file"
