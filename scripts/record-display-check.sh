#!/bin/sh
# Checks bin/record-display.sh on this Mac: two projects record at once on their own displays, two recordings
# in one project take turns, a recording killed mid-way frees the turn, the display is kept between recordings.
# Adds two virtual displays below the screens and removes them at the end.
# Run: sh scripts/record-display-check.sh (the plugin test runner can't start a shell). Prints "ok" or what failed.
script="$(cd "$(dirname "$0")/.." && pwd)/bin/record-display.sh"
work="$(mktemp -d -t record-display-check)"
failed=0
fail() { echo "fail: $1"; failed=1; }

project() { mkdir -p "$work/$1" && git -C "$work/$1" init -q && echo "$work/$1"; }
alpha="$(project alpha)" beta="$(project beta)"
git -C "$alpha" commit -q --allow-empty -m first && git -C "$alpha" worktree add -q "$work/alpha-worktree" 2>/dev/null
in_dir() { (cd "$1" && shift && exec "$@"); }
in_dir "$alpha" "$script" status >/dev/null # compiles once, before the timing below

# Each recording logs "<name> start|end <epoch> <display id>" and holds the display 2 s.
record() { # <dir> <name>
  in_dir "$1" "$script" run --label "$2" -- sh -c "echo \"$2 start \$(date +%s) \$BT_DISPLAY_ID\"; sleep 2; echo \"$2 end \$(date +%s)\"" \
    >>"$work/log" 2>/dev/null
}
value() { grep "^$1 $2 " "$work/log" | cut -d' ' -f"$3"; }

record "$alpha" a0 # makes alpha's display, so the timing below is about turns only
record "$beta" b0
record "$alpha" a1 & sleep 1
record "$work/alpha-worktree" a2 &
record "$beta" b1 &
wait

[ "$(value a2 start 3)" -ge "$(value a1 end 3)" ] 2>/dev/null || fail "a2 started before a1 ended in the same project"
[ "$(value b1 start 3)" -lt "$(value a1 end 3)" ] 2>/dev/null || fail "beta waited for alpha"
[ "$(value b1 start 4)" != "$(value a1 start 4)" ] || fail "alpha and beta shared display $(value b1 start 4)"
[ "$(value a0 start 4)" = "$(value a2 start 4)" ] || fail "alpha's display was made again (worktree or second recording)"

# Killed hard mid-recording: the next one still gets its turn.
(cd "$alpha" && exec "$script" run --label doomed -- sleep 60) >/dev/null 2>&1 &
doomed=$!
sleep 2
kill -9 "$doomed"
in_dir "$alpha" "$script" run -- true >/dev/null 2>&1 &
next=$!
sleep 5
if kill -0 "$next" 2>/dev/null; then kill "$next"; fail "a killed recording kept the turn"; fi

# start/stop: the turn outlives its shell, stop frees it.
held="$(in_dir "$alpha" "$script" start --minutes 1 | sed -n 's/.*held by pid \([0-9]*\).*/\1/p')"
in_dir "$alpha" "$script" status | grep -q "^in use" || fail "start did not take the turn"
in_dir "$alpha" "$script" stop "$held"
sleep 1
in_dir "$alpha" "$script" status | grep -q "^free" || fail "stop did not free the turn"

in_dir "$alpha" "$script" remove >/dev/null
in_dir "$beta" "$script" remove >/dev/null
rm -rf "$work"
[ "$failed" = 0 ] && echo ok
exit "$failed"
