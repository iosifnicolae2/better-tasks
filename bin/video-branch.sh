#!/bin/sh
# Puts a task's before/after video and its poster on the repo's videos branch and pushes it, for when
# gh can't upload them (no gh 2.99+, not GitHub). Usage: video-branch.sh <video.mp4> [<poster.png>]
# The branch has its own history, never merged, so videos stay out of main. No checkout is touched.
# Prints one link per file, pinned to the new commit, then the caption line that fits those links.
set -eu
case "${1:-}" in -h|--help) sed -n '2,/^[^#]/{/^#/s/^# \{0,1\}//p;}' "$0"; exit 0 ;; esac

# The remote's web address, without any user or token in it (those would end up in the PR).
web_url() {
  url="$(printf '%s' "$1" | sed -E 's#^git@([^:]+):#https://\1/#; s#^ssh://([^@/]+@)?([^/:]+)(:[0-9]+)?/#https://\2/#; s#^(https?://)[^@/]+@#\1#; s#\.git$##')"
  case "$url" in *@*) echo "video-branch.sh: can't tell the remote's web address safely" >&2; return 1 ;; esac
  printf '%s\n' "$url"
}
if [ "${1:-}" = --web-url ]; then web_url "$2"; exit; fi

branch="${BETTER_TASKS_VIDEO_BRANCH:-better-tasks-videos}"
remote=origin
web="$(web_url "$(git remote get-url "$remote")")"

index_dir="$(mktemp -d)"
trap 'rm -rf "$index_dir"' EXIT
export GIT_INDEX_FILE="$index_dir/index"

git fetch -q "$remote" "$branch" 2>/dev/null || true
parent="$(git rev-parse -q --verify "refs/remotes/$remote/$branch" || true)"
[ -n "$parent" ] && git read-tree "$parent"

names=""
for file in "$@"; do
  name="$(basename "$file")"
  blob="$(git hash-object -w "$file")"
  git update-index --add --cacheinfo "100644,$blob,$name"
  names="$names $name"
done

tree="$(git write-tree)"
commit="$(git commit-tree "$tree" ${parent:+-p "$parent"} -m "Videos:$names")"
git push -q "$remote" "$commit:refs/heads/$branch"

is_public() { [ "$(curl -s -o /dev/null -w '%{http_code}' "$web")" = 200 ]; }
case "$web" in
  https://github.com/*)
    if is_public; then # jsDelivr serves a public repo's files with their type, so the browser plays the video
      base="https://cdn.jsdelivr.net/gh/${web#https://github.com/}@$commit"
      caption='Click the picture to play the video with sound (Cmd-click or Ctrl-click: in a new tab).'
    else # GitHub serves a repo's mp4 as a download
      base="$web/raw/$commit"
      caption="Click the picture to download the video (GitHub doesn't play videos stored in a private repo)."
    fi ;;
  *) base="$web/-/raw/$commit" # GitLab's form
     caption='Click the picture to open the video.' ;;
esac
for name in $names; do echo "$base/$name"; done
echo "$caption"
