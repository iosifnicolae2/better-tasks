#!/bin/sh
# Makes a narrated before/after demo video: demo-video.sh spec.json [--quality low|medium|high] (the spec is described in demo_video.py).
# Runs with the Kokoro install that kokoro-setup.sh made; prints the video's path.
dir="${BETTER_TASKS_KOKORO:-${XDG_DATA_HOME:-$HOME/.local/share}/better-tasks/kokoro}"
if [ ! -f "$dir/.ready" ]; then
  echo "Kokoro is not set up: run $(dirname "$0")/kokoro-setup.sh once" >&2
  exit 1
fi
exec "$dir/venv/bin/python" "$(dirname "$0")/demo_video.py" "$@"
