#!/bin/sh
# Cut a release: pin the marketplace entry to the new tag in a "Release" commit on main, tag the plugin package
# (that commit without the dev-only files, a child of it off main), push the tag and main, create the GitHub release.
# Installs, updates and the directory get only tagged packages.
# Usage: scripts/release.sh [--dry-run | --draft] v0.3.0 [notes.md]
# Without notes.md, the notes are the commit subjects since the last tag.
# With the project setting releaseVideos (on unless .claude/tasks/config.json says false), the notes open with
# a video of the release's tasks, each before and after (bin/release-video.sh), put on the videos branch.
# --dry-run: makes the notes and the video and prints them; commits, tags, pushes and publishes nothing.
# --draft: makes the notes and the video (uploaded) into a draft GitHub release of local main, so the release can be
# checked before it is cut; pins, tags and pushes nothing but the video, and works with main ahead of origin or a
# dirty tree. Run again, it updates the draft. Prints the draft's URL last. The release itself publishes the draft.
set -eu

dry_run=false draft=false
case "${1:-}" in
  --dry-run) dry_run=true; shift ;;
  --draft) draft=true; shift ;;
esac
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
if ! $draft; then
  [ "$(git branch --show-current)" = main ] || fail "check out main first"
  [ -z "$(git status --porcelain --untracked-files=no)" ] || fail "commit or stash your changes first"
  [ "$(git rev-parse main)" = "$(git rev-parse origin/main)" ] || fail "main and origin/main differ: pull or push first"
fi
git rev-parse -q --verify "refs/tags/$version" >/dev/null && fail "$version already exists"
bun scripts/settings-doc.ts --check || fail "the settings skill is stale: run bun scripts/settings-doc.ts and commit"
bun scripts/skills-check.ts || fail "a skill lacks what its readers rely on: see above"
[ "$(cat "$bin/record_display.swift" "$bin/record_display.h" | shasum -a 256 | cut -d' ' -f1)" = "$(cat "$bin/record_display.sha256")" ] ||
  fail "bin/record_display is older than its Swift source: run sh scripts/build-display-helper.sh and commit"

# The last release's tag: a package off main (its parent is that release's commit), or, before v0.11.15, on main.
previous=$(git tag -l 'v*' --sort=-v:refname | head -n 1)
[ -z "$previous" ] || [ -n "$(git log -1 --format=%H "$previous..main")" ] || fail "nothing new since $previous"

# Each task id with its PR's number, one "T-079 44" a line: the last "PR: .../pull/<n>" note in its task file.
pr_numbers() {
  find .claude/tasks -name '*.md' 2>/dev/null | while read -r file; do
    number=$(grep 'PR:' "$file" | grep -o '/pull/[0-9]*' | tail -n 1 | cut -d/ -f3)
    id=$(sed -n 's/^id: *//p' "$file" | head -n 1)
    [ -n "$number" ] && [ -n "$id" ] && echo "$id $number"
  done
}

# "T-079" becomes "T-079 (#44)" in each line, unless the line already names that PR.
with_pr_numbers() {
  NUMBERS=$(pr_numbers) perl -pe 'BEGIN { %pr = map { split / / } split /\n/, $ENV{NUMBERS} }
    s{\b([A-Za-z]+-\d+)\b(?! \(#)}{my ($id, $n) = ($1, $pr{$1}); $n && !m{\(#$n\)} ? "$id (#$n)" : $id}ge'
}

commit_notes() {
  echo "## Changes"
  git log --reverse --format='- %s' "${previous:+$previous..}main" | grep -v '^- Task log:' | with_pr_numbers || true
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

# The draft release of this version, if there is one: gh finds drafts by their tag name too.
has_draft() {
  [ "$(gh release view "$version" --json isDraft -q .isDraft 2>/dev/null)" = true ]
}

if $draft; then
  if has_draft; then
    gh release edit "$version" --title "$version" --target main --notes-file "$notes_file" >/dev/null
  else
    gh release create "$version" --draft --target main --title "$version" --notes-file "$notes_file" >/dev/null
  fi
  gh release view "$version" --json url -q .url
  exit 0
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

# Dev-only paths of this repo that installs and the directory don't get: the task board, its screenshots and videos.
DEV_ONLY=".claude/tasks .claude/tasks_videos"

# The plugin as installs get it: main's tree without DEV_ONLY, committed off main; prints the commit.
# A temporary index, so the shared checkout's index and files stay as they are.
package_commit() {
  index=$(mktemp)
  GIT_INDEX_FILE=$index git read-tree main
  # shellcheck disable=SC2086
  GIT_INDEX_FILE=$index git rm -r -q --cached --ignore-unmatch -- $DEV_ONLY
  tree=$(GIT_INDEX_FILE=$index git write-tree)
  rm -f "$index"
  git commit-tree "$tree" -p main -m "Release $version: the plugin, without the task board"
}

pin_marketplace
git tag -a "$version" -m "$version" "$(package_commit)"
git push -q origin "$version"
git push -q origin main
if has_draft; then
  gh release edit "$version" --draft=false --tag "$version" --title "$version" --notes-file "$notes_file"
else
  gh release create "$version" --verify-tag --title "$version" --notes-file "$notes_file"
fi
