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

# The picture that opens the video loads (the video itself answers only to a signed-in browser).
picture=$(printf '%s' "$body" | sed -n 's/.*\[!\[[^]]*\](\([^)]*\)).*/\1/p' | head -1)
if [ -n "$picture" ]; then
  tries=0
  until [ "$(curl -s -o /dev/null -w '%{http_code}' -L "$picture")" = 200 ]; do
    tries=$((tries + 1))
    [ "$tries" -ge 6 ] && { echo "not ready: the PR's picture does not load yet ($picture)"; exit 2; }
    sleep 5
  done
fi

case "$(uname -s)" in
  Darwin) open "$url" ;;
  MINGW* | MSYS* | CYGWIN*) cmd.exe /c start "" "$url" ;;
  *) xdg-open "$url" >/dev/null 2>&1 ;;
esac
sleep "$LOAD_SECONDS"
echo "opened $url"
