#!/bin/sh
# Opens a finished task's PR in the default browser once its video is uploaded, then waits for the page to load.
# The lead runs it right before asking the user to approve the task (setting openPrInBrowser).
# Usage: open-pr.sh <pr url>. Last line: "opened <url>", or "not ready: <why>" (exit 2: nothing opened).
set -u
PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"
url=${1:?usage: open-pr.sh <pr url>}
LOAD_SECONDS=${OPEN_PR_LOAD_SECONDS:-5}

body=$(gh pr view "$url" --json body -q .body) || { echo "not ready: gh can't read $url"; exit 2; }

# The video and its picture still point at this Mac: not uploaded yet.
if printf '%s' "$body" | grep -Eq '\]\((/|file:)'; then
  echo "not ready: the PR's video is not uploaded yet (its body links local files)"
  exit 2
fi

# The picture and the video it opens both load, as the user signed in to GitHub (an upload answers others only later).
token=$(gh auth token 2>/dev/null)
loads() {
  code=$(curl -s -o /dev/null -w '%{http_code}' -L -r 0-0 ${token:+-H "Authorization: token $token"} "$1")
  [ "$code" = 200 ] || [ "$code" = 206 ]
}
links=$(printf '%s' "$body" | sed -n 's/.*\[!\[[^]]*\](\([^)]*\))](\([^)]*\)).*/\1 \2/p' | head -1)
for link in $links; do
  tries=0
  until loads "$link"; do
    tries=$((tries + 1))
    [ "$tries" -ge 6 ] && { echo "not ready: the PR's video does not load yet ($link)"; exit 2; }
    sleep 5
  done
done

case "$(uname -s)" in
  Darwin) open "$url" ;;
  MINGW* | MSYS* | CYGWIN*) cmd.exe /c start "" "$url" ;;
  *) xdg-open "$url" >/dev/null 2>&1 ;;
esac
sleep "$LOAD_SECONDS"
echo "opened $url"
