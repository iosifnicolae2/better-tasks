#!/bin/sh
# Live review (setting liveReview): Gemini watches a test as it runs and reports, at the second it saw it,
# what you asked it to watch and anything else that is not OK. Records only the test display (a turn of
# record-display.sh), looks at it once a second; every 3 s the frames that changed (masks blacked out, 1280 px
# wide) go to Google's Gemini Live API under the user's own AI Studio key, read from the macOS Keychain (never
# a file). Paid tier: about $0.02 a minute; Google may keep and use what free-tier keys send.
#   live-review.sh start --watch "<what to check>" [--mask x,y,w,h]... [--out <dir>]
#       inside a record-display.sh turn (BT_DISPLAY_CAPTURE set): records that display and streams it;
#       prints the review's folder and the pid to stop. Reports come one a line in <dir>/live.log.
#       --mask: a box in the display's pixels (as a screenshot of it) blacked out before a frame leaves.
#   live-review.sh stop <pid>: asks for the last reports, ends the recording, prints the reports; the folder
#       then holds recording.mov, review.json, review.md, review.srt and, with the Kokoro voice set up,
#       annotated.mp4 (the recording with each report on it for a few seconds).
#   live-review.sh key set [--project] | remove [--project] | status
#       the key in the Keychain (service "better-tasks gemini"): one for every project (account "global"),
#       or this project's own (account: its root), which wins. set asks for it hidden; status prints
#       project, global or none.
set -eu
here="$(cd "$(dirname "$0")" && pwd)"
service="better-tasks gemini"
sdk_version="2.27.0"

project_root() {
  common="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null || pwd)"
  case "$common" in */.git) dirname "$common" ;; *) echo "$common" ;; esac
}
root="$(project_root)"

# ---- The key ----

account() { if [ "${1:-}" = --project ]; then echo "$root"; else echo global; fi; }

has_key() { security find-generic-password -s "$service" -a "$1" >/dev/null 2>&1; }

# Asks for the key without showing it: on the terminal when there is one, else in a macOS dialog.
ask_key() {
  if [ -t 0 ]; then
    printf 'Gemini API key (from aistudio.google.com/apikey, hidden): ' >&2
    stty -echo; IFS= read -r key; stty echo; echo >&2
  else
    key="$(osascript -e 'text returned of (display dialog "Gemini API key for better-tasks live review (from aistudio.google.com/apikey):" default answer "" with hidden answer with title "better-tasks" with icon note)' 2>/dev/null)" || return 1
  fi
  printf %s "$key"
}

key() {
  what="${1:-status}"; [ $# -gt 0 ] && shift
  case "$what" in
    set)
      where="$(account "${1:-}")"
      value="$(ask_key)" || { echo "not set: cancelled" >&2; exit 1; }
      case "$value" in
        "" | *[!A-Za-z0-9_-]*) echo "not set: that doesn't look like an API key" >&2; exit 1 ;;
      esac
      # Through security's own prompt (-i), so the key is never in a process's arguments.
      printf 'add-generic-password -U -s "%s" -a "%s" -l "%s" -w "%s"\n' "$service" "$where" "$service" "$value" | security -i >/dev/null
      if [ "$where" = global ]; then echo "saved for every project"; else echo "saved for $(basename "$root") only"; fi ;;
    remove)
      where="$(account "${1:-}")"
      security delete-generic-password -s "$service" -a "$where" >/dev/null 2>&1 && echo removed || echo "none to remove" ;;
    status)
      if has_key "$root"; then echo project; elif has_key global; then echo global; else echo none; fi ;;
    *) usage ;;
  esac
}

# ---- The review ----

# The Gemini SDK, installed once per version outside any project.
sdk_home() {
  dir="${XDG_CACHE_HOME:-$HOME/.cache}/better-tasks/live-review-$sdk_version"
  if [ ! -d "$dir/node_modules/@google/genai" ]; then
    command -v npm >/dev/null || { echo "live review needs Node.js 22.18 or later: brew install node" >&2; exit 1; }
    mkdir -p "$dir"
    npm install --prefix "$dir" --no-audit --no-fund --silent "@google/genai@$sdk_version" >&2
  fi
  echo "$dir"
}

# Node strips hooks/livereview.ts's types itself from 22.18 (23.6 on the 23 line).
check_node() {
  node -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 23 || (a === 23 && b >= 6) || (a === 22 && b >= 18) ? 0 : 1)' 2>/dev/null ||
    { echo "live review needs Node.js 22.18 or later: brew install node" >&2; exit 1; }
}

start() {
  watch="" out="" masks=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --watch) watch="$2"; shift 2 ;;
      --out) out="$2"; shift 2 ;;
      --mask) masks="$masks --mask $2"; shift 2 ;;
      *) usage ;;
    esac
  done
  [ -n "${BT_DISPLAY_CAPTURE:-}" ] || { echo "start it inside a record-display.sh turn: only the test display is ever sent" >&2; exit 1; }
  [ "$(key status)" != none ] || { echo "no Gemini API key: /better-tasks config, \"Gemini API key\", or live-review.sh key set" >&2; exit 1; }
  check_node
  out="${out:-$root/.claude/tasks_videos/live-$(date +%Y%m%d-%H%M%S)}"
  mkdir -p "$out"
  genai="$(sdk_home)"
  # shellcheck disable=SC2086 # the masks are "--mask x,y,w,h" words
  ( trap '' HUP; BT_GENAI_HOME="$genai" exec node "$here/live_review.mjs" --out "$out" --capture "$BT_DISPLAY_CAPTURE" \
      --root "$root" --watch "$watch" $masks ) </dev/null >"$out/stdout.log" 2>&1 &
  pid=$!
  until grep -qs '^watching' "$out/live.log"; do
    kill -0 "$pid" 2>/dev/null || { cat "$out/stdout.log" >&2; exit 1; }
    sleep 0.2
  done
  echo "Gemini is watching; reports: $out/live.log"
  echo "stop when the test is done: live-review.sh stop $pid"
}

stop() {
  pid="${1:?stop: which pid? start printed it}"
  out="$(ps -o command= -p "$pid" 2>/dev/null | sed -n 's/.*live_review\.mjs --out \(.*\) --capture .*/\1/p')"
  [ -n "$out" ] || { echo "pid $pid is not a live review" >&2; exit 1; }
  kill -TERM "$pid"
  while kill -0 "$pid" 2>/dev/null; do sleep 0.3; done
  [ -s "$out/review.md" ] || { cat "$out/stdout.log" >&2; exit 1; }
  cat "$out/review.md"
  if "$here/demo-video.sh" --annotate "$out/review.json" >/dev/null 2>"$out/annotate.log"; then
    echo "Annotated: $out/annotated.mp4"
  else
    echo "No annotated video ($(tail -n 1 "$out/annotate.log")); the reports are in review.srt too."
  fi
  echo "Folder: $out"
}

usage() { sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }

command="${1:-}"
[ $# -gt 0 ] && shift
case "$command" in
  start) start "$@" ;;
  stop) stop "$@" ;;
  key) key "$@" ;;
  *) usage ;;
esac
