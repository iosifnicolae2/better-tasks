#!/bin/sh
# Starts the blackout of the physical screens detached, so a plugin reload can't cut it off,
# and prints its first status line ("black" or "failed: why"). Used by hooks/screen.ts for /away.
# Virtual displays (the projects' test and recording displays, other apps' too) stay on.
# A failure while virtual displays are on adds the line "virtual displays on": then no display sleep.
# Usage: away.sh [safetySeconds]
here="$(dirname "$0")"
script="$here/blackout.js"
status="$(mktemp -t better-tasks-blackout)"

# The real screens' ids, comma separated, as the graphics hardware sees them; empty when the
# helper can't tell (blackout.js then guesses by vendor id).
physical="$(sh "$here/record-display.sh" screens 2>/dev/null | cut -f1 | paste -sd, -)"

# caffeinate -d keeps the displays awake, so the Mac never locks; the restore
# step puts the brightness back however the blackout ended.
(
  trap '' HUP
  caffeinate -d -i -s osascript -l JavaScript "$script" "$status" "$physical" "$@"
  osascript -l JavaScript "$script" --restore "$status"
) </dev/null >/dev/null 2>&1 &

failed() {
  echo "$1"
  if [ -n "$(sh "$here/record-display.sh" virtuals 2>/dev/null)" ]; then echo "virtual displays on"; fi
  exit 0
}

for _ in $(seq 50); do
  if [ -s "$status" ]; then
    line="$(cat "$status")"; rm -f "$status"
    case "$line" in black*) echo "$line"; exit 0 ;; *) failed "$line" ;; esac
  fi
  sleep 0.1
done
failed "failed: no answer in 5 s"
