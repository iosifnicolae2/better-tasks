#!/bin/sh
# The project's own virtual display (macOS), one recording at a time: a second recording in the same project
# waits its turn; another project has its own display and records at the same time. Made once and kept
# (no screen redraws per recording), in a row below the lowest physical screen, so the real screens stay put.
# A crashed recording frees its turn: the lock dies with its process; a start ends by itself after --minutes.
#   record-display.sh run [--size WxH] [--label text] -- <command...>
#       waits its turn, runs the command with BT_DISPLAY_ID, BT_DISPLAY_BOUNDS ("x y w h") and
#       BT_DISPLAY_CAPTURE (for screencapture -D) set, then gives the turn back.
#   record-display.sh start [--size WxH] [--minutes n] [--label text]
#       the same over several commands: prints those values and the turn's pid; stop it when done.
#   record-display.sh stop <pid> | status | remove (the project's display) | arrange (every virtual display below the screens)
#   record-display.sh screens: the real screens, "<id><tab><name>" each; virtuals: the virtual displays' ids
#   record-display.sh dim|undim <file>: external screens' brightness to 0 over DDC/CI, or back; ddc: what each answers
#   record-display.sh off <file> <ids> <pid>: those screens off (no signal) while <pid> lives; on <file>: back on
# The project may test on a real screen instead: "testScreen" in .claude/tasks/config.json (a name from `screens`;
# "virtual", the default, is the project's own display); --screen <name> or BT_TEST_SCREEN wins over it.
# A chosen screen that is not connected: the virtual display, with one line on stderr saying so.
# Works in any git worktree of the project: they share its one display. Kept until `remove` or logout.
# Why not a Space (Mission Control desktop): only the Dock may move another app's windows between Spaces
# (tested on macOS 27: our move of a TextEdit window was ignored), and making a desktop takes clicks.
set -eu
here="$(cd "$(dirname "$0")" && pwd)"

project_root() {
  common="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null || pwd)"
  case "$common" in */.git) dirname "$common" ;; *) echo "$common" ;; esac
}

root="$(project_root)"
project="$(basename "$root")"
key="$(printf %s "$root" | cksum | cut -d' ' -f1)"
state="${XDG_STATE_HOME:-$HOME/.local/state}/better-tasks/displays"
base="$state/$project-$key"
mkdir -p "$state"

# Compiled once per version of the Swift source, then reused.
binary() {
  sum="$(cat "$here/record_display.swift" "$here/record_display.h" | cksum | cut -d' ' -f1)"
  path="${XDG_CACHE_HOME:-$HOME/.cache}/better-tasks/record_display-$sum"
  if [ ! -x "$path" ]; then
    mkdir -p "$(dirname "$path")"
    swiftc -O -import-objc-header "$here/record_display.h" "$here/record_display.swift" -o "$path.$$" >&2
    mv "$path.$$" "$path"
  fi
  echo "$path"
}

# Waits for a "ready" line in <file> from <pid>; relays its "waiting" line once.
await_ready() {
  out="$1" pid="$2" told=""
  while :; do
    if grep -q '^ready ' "$out" 2>/dev/null; then grep '^ready ' "$out"; return 0; fi
    if [ -z "$told" ] && grep -q '^waiting' "$out" 2>/dev/null; then grep '^waiting' "$out" >&2; told=1; fi
    if ! kill -0 "$pid" 2>/dev/null; then cat "$out" >&2; return 1; fi
    sleep 0.2
  done
}

field() { echo "$1" | tr ' ' '\n' | sed -n "s/^$2=//p"; }

# Starts a process detached, so it outlives this shell; prints its pid.
detached() { # <output file> <command...>
  out="$1"; shift
  ( trap '' HUP; exec "$@" ) </dev/null >"$out" 2>&1 &
  echo $!
}

# The project's display: the kept one, or a new one. Prints its id.
display_id() {
  if [ -s "$base.display" ] && kill -0 "$(field "$(cat "$base.display")" pid)" 2>/dev/null; then
    field "$(cat "$base.display")" id
    return
  fi
  pid="$(detached "$base.display" "$exe" display --lock "$base.keeper" \
    --name "better-tasks $project" --serial "$(slot)" --size "$size")"
  field "$(await_ready "$base.display" "$pid")" id
}

# The display's serial: a slot number reused across projects. macOS remembers each serial's place, so only
# a slot's very first display makes macOS lay out the screens anew (the helper then puts them back).
# A slot is free when the project that last had it keeps no display. Prints this project's slot.
slot() {
  until mkdir "$state/slots.lock" 2>/dev/null; do sleep 0.1; done
  touch "$state/slots"
  mine="$(awk -v b="$base" '$2 == b { print $1 }' "$state/slots")"
  if [ -z "$mine" ]; then
    mine="$(free_slot)"
    awk -v s="$mine" '$1 != s' "$state/slots" >"$state/slots.new"
    echo "$mine $base" >>"$state/slots.new"
    mv "$state/slots.new" "$state/slots"
  fi
  rmdir "$state/slots.lock"
  echo "$mine"
}

free_slot() {
  n=1
  while owner="$(awk -v s="$n" '$1 == s { print $2 }' "$state/slots")" && [ -n "$owner" ]; do
    holder_alive "$owner.keeper" || break
    n=$((n + 1))
  done
  echo "$n"
}

# The screen this project tests on: --screen, else BT_TEST_SCREEN, else config.json's testScreen, else "virtual".
chosen_screen() {
  if [ -n "$screen" ]; then echo "$screen"; return; fi
  if [ -n "${BT_TEST_SCREEN:-}" ]; then echo "$BT_TEST_SCREEN"; return; fi
  plutil -extract testScreen raw -o - "$root/.claude/tasks/config.json" 2>/dev/null || echo virtual
}

# Sets screen_id (empty: the virtual display) and turn (its lock: a real screen's is shared by every project).
resolve_screen() {
  name="$(chosen_screen)" screen_id=""
  if [ "$name" != virtual ]; then
    screen_id="$("$exe" screens | awk -F '\t' -v n="$name" '$2 == n { print $1; exit }')"
    [ -n "$screen_id" ] || echo "better-tasks: the test screen \"$name\" is not connected, so this uses the virtual display." >&2
  fi
  if [ -n "$screen_id" ]; then
    turn="$state/screen-$(printf %s "$name" | cksum | cut -d' ' -f1).turn"
  else
    turn="$base.turn"
  fi
}

# Sets BT_DISPLAY_ID, BT_DISPLAY_BOUNDS, BT_DISPLAY_CAPTURE.
display_values() {
  BT_DISPLAY_ID="${screen_id:-$(display_id)}"
  where="$("$exe" info "$BT_DISPLAY_ID")"
  BT_DISPLAY_BOUNDS="$(field "$where" x) $(field "$where" y) $(field "$where" w) $(field "$where" h)"
  BT_DISPLAY_CAPTURE="$(field "$where" capture)"
}

size=1920x1080 minutes=20 label="" screen=""
parse_options() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --size) size="$2"; shift 2 ;;
      --minutes) minutes="$2"; shift 2 ;;
      --label) label="$2"; shift 2 ;;
      --screen) screen="$2"; shift 2 ;;
      --) shift; break ;;
      *) break ;;
    esac
  done
  rest_count=$#
}

run() {
  parse_options "$@"; shift $(($# - rest_count))
  [ $# -gt 0 ] || { echo "run: no command after --" >&2; exit 2; }
  resolve_screen
  out="$(mktemp -t better-tasks-turn)"
  "$exe" turn --lock "$turn" --label "$label" --max-seconds 86400 --parent $$ >"$out" 2>&1 &
  pid=$!
  trap 'kill $pid 2>/dev/null; rm -f "$out"' EXIT INT TERM
  await_ready "$out" "$pid" >/dev/null || exit 1
  display_values
  export BT_DISPLAY_ID BT_DISPLAY_BOUNDS BT_DISPLAY_CAPTURE
  "$@"
}

start() {
  parse_options "$@"
  resolve_screen
  out="$(mktemp -t better-tasks-turn)"
  pid="$(detached "$out" "$exe" turn --lock "$turn" --label "$label" --max-seconds "$((minutes * 60))")"
  await_ready "$out" "$pid" >/dev/null || exit 1
  rm -f "$out"
  display_values
  echo "BT_DISPLAY_ID=$BT_DISPLAY_ID"
  echo "BT_DISPLAY_BOUNDS=\"$BT_DISPLAY_BOUNDS\""
  echo "BT_DISPLAY_CAPTURE=$BT_DISPLAY_CAPTURE"
  echo "Your turn, held by pid $pid for $minutes min at most: record-display.sh stop $pid when done."
}

stop() {
  pid="${1:?stop: which pid? start printed it}"
  grep -qs "^pid $pid " "$base.turn" "$state"/screen-*.turn || { echo "pid $pid does not hold $project's turn" >&2; exit 1; }
  kill "$pid"
}

holder_alive() { [ -s "$1" ] && kill -0 "$(cut -d' ' -f2 "$1")" 2>/dev/null; }

status() {
  if holder_alive "$base.keeper"; then echo "$project's display: $(cat "$base.keeper")"; else echo "$project has no display now"; fi
  if holder_alive "$base.turn"; then echo "in use: $(cat "$base.turn")"; else echo "free"; fi
}

remove() {
  if holder_alive "$base.keeper"; then kill "$(cut -d' ' -f2 "$base.keeper")"; echo "removed $project's display"; fi
}

exe="$(binary)" || exit 1
command="${1:-}"
[ $# -gt 0 ] && shift
case "$command" in
  run) run "$@" ;;
  start) start "$@" ;;
  stop) stop "$@" ;;
  status) status ;;
  remove) remove ;;
  arrange) "$exe" arrange ;;
  screens) "$exe" screens ;;
  virtuals) "$exe" virtuals ;;
  dim) "$exe" dim "$@" ;;
  undim) "$exe" undim "$@" ;;
  ddc) "$exe" ddc ;;
  off) exec "$exe" off "$@" ;;
  on) "$exe" on "$@" ;;
  *) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
