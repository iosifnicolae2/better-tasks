#!/bin/sh
# Checks bin/release_video.py's choice of tasks and cards on a scratch repo, without making a video: tasks named by a
# bundle's PR ("T-4 T-5 Title (#7)"), the shared video each one's "Video:" note names, and one card for them, the video
# once. Runs with Kokoro's Python (Pillow), as release-video.sh does. Run: sh scripts/release-video-check.sh; prints "ok".
set -u
bin="$(cd "$(dirname "$0")/.." && pwd)/bin"
python="${BETTER_TASKS_KOKORO:-${XDG_DATA_HOME:-$HOME/.local/share}/better-tasks/kokoro}/venv/bin/python"
[ -x "$python" ] || { echo "skip: Kokoro is not set up (bin/kokoro-setup.sh)"; exit 0; }
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cd "$work" && git init -q && mkdir -p .claude/tasks .claude/tasks_videos
printf -- '---\ntitle: Round the cart total\n---\n## Notes\nVideo: [T-4.mp4](../tasks_videos/T-4.mp4)\n- PR: https://github.com/a/b/pull/7 (with T-5)\n' >.claude/tasks/T-4-cart.md
printf -- '---\ntitle: Round the checkout total\n---\n## Notes\nVideo: [T-4.mp4](../tasks_videos/T-4.mp4)\n- PR: https://github.com/a/b/pull/7 (with T-4)\n' >.claude/tasks/T-5-checkout.md
printf -- '---\ntitle: Fix the footer\n---\n## Notes\n- PR: https://github.com/a/b/pull/8\n' >.claude/tasks/T-6-footer.md
printf 'v' >.claude/tasks_videos/T-4.mp4
printf 'v' >.claude/tasks_videos/T-6.mp4
exec "$python" - "$bin" <<'PY'
import sys
from pathlib import Path
sys.path.insert(0, sys.argv[1])
import release_video as rv
failed = []
tasks = rv.tasks_named(['T-4 T-5 Round the totals (#7)', 'Fix the footer (T-6)', 'Tasks: T-6 done'], 'T-')
if [t['id'] for t in tasks] != ['T-4', 'T-5', 'T-6']:
    failed.append(f"a bundle's PR names {[t['id'] for t in tasks]}, not T-4, T-5, T-6")
for task in tasks:
    task['video'] = rv.task_video(task['id'], Path('.'))
if tasks[1]['video'] is None or tasks[1]['video'] != tasks[0]['video']:
    failed.append(f"T-5 doesn't find the video it shares with T-4: {tasks[1]['video']}")
cards = rv.bundled(tasks)
if [c['ref'] for c in cards] != ['T-4, T-5 (#7)', 'T-6 (#8)']:
    failed.append(f"the cards are {[c['ref'] for c in cards]}, not one for T-4 and T-5 and one for T-6")
if cards[0]['title'] != 'Round the cart total; Round the checkout total':
    failed.append(f"the bundle's card is titled {cards[0]['title']!r}")
print('\n'.join(f'fail: {f}' for f in failed) or 'ok')
sys.exit(1 if failed else 0)
PY
