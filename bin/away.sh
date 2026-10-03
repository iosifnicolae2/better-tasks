#!/bin/sh
# Starts the blackout detached, so a plugin reload can't cut it off, and prints its
# first status line ("black" or "failed: why"). Used by hooks/screen.ts for /away.
# Usage: away.sh [safetySeconds]
script="$(dirname "$0")/blackout.js"
status="$(mktemp -t better-tasks-blackout)"

# caffeinate -d keeps the displays awake, so the Mac never locks; the restore
# step puts the brightness back however the blackout ended.
(
  trap '' HUP
  caffeinate -d -i -s osascript -l JavaScript "$script" "$status" "$@"
  osascript -l JavaScript "$script" --restore "$status"
) </dev/null >/dev/null 2>&1 &

for _ in $(seq 50); do
  if [ -s "$status" ]; then cat "$status"; rm -f "$status"; exit 0; fi
  sleep 0.1
done
echo "failed: no answer in 5 s"
