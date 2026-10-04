#!/bin/sh
# One-time, per-machine setup of the Kokoro voice for before/after demo videos (bin/demo-video.sh).
# Run by better-tasks when the "Before/after videos" setting is turned on; safe to run again.
# Installs into $BETTER_TASKS_KOKORO (default ~/.local/share/better-tasks/kokoro), never into a project.
# Prints "ready <dir>" on success, "failed: <why>" otherwise.
set -u
dir="${BETTER_TASKS_KOKORO:-${XDG_DATA_HOME:-$HOME/.local/share}/better-tasks/kokoro}"
log="$dir/setup.log"
mkdir -p "$dir"

fail() { echo "failed: $1 (log: $log)"; exit 1; }

if [ -f "$dir/.ready" ]; then echo "ready $dir"; exit 0; fi
command -v ffmpeg >/dev/null || fail "ffmpeg is missing: brew install ffmpeg"
command -v uv >/dev/null || fail "uv is missing: brew install uv"

{
  # Kokoro supports Python 3.10 to 3.13.
  uv venv --allow-existing --python 3.12 "$dir/venv" &&
  # The transformers floor stops the resolver falling back to a 2021 release that no longer builds.
  uv pip install --python "$dir/venv/bin/python" "kokoro>=0.9.4" "transformers>=4.40" soundfile pillow &&
  # espeak-ng only reads out words Kokoro's dictionary lacks; nice to have.
  { command -v espeak-ng >/dev/null || ! command -v brew >/dev/null || brew install espeak-ng || true; } &&
  # Fetches the model, the default voice and the spaCy English model once (spaCy installs it
  # with uv, which needs VIRTUAL_ENV), so the first video is fast.
  VIRTUAL_ENV="$dir/venv" "$dir/venv/bin/python" "$(dirname "$0")/demo_video.py" --check
} >"$log" 2>&1 || fail "the install did not finish"

touch "$dir/.ready"
echo "ready $dir"
