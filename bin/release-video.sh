#!/bin/sh
# Makes a release's video from its tasks' before/after videos (the usage is at the top of release_video.py).
# Runs with the Kokoro install that kokoro-setup.sh made; prints the poster's path, then the video's.
# Exits 3 when no task of the release has a video.
dir="${BETTER_TASKS_KOKORO:-${XDG_DATA_HOME:-$HOME/.local/share}/better-tasks/kokoro}"
if [ ! -f "$dir/.ready" ]; then
  echo "Kokoro is not set up: run $(dirname "$0")/kokoro-setup.sh once" >&2
  exit 1
fi
exec "$dir/venv/bin/python" "$(dirname "$0")/release_video.py" "$@"
