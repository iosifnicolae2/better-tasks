---
name: video
user-invocable: false
description: How a better-tasks teammate records the before/after video of its task (capture, spec, demo-video.sh, poster, the Video line). Load it before you change anything, to capture BEFORE, when your prompt says before/after videos are on.
---

# Before/after video
One short narrated video per finished task that shows on screen: the bug or missing feature (BEFORE), then your change (AFTER). Nothing to see (a refactor, a config)? Skip it and say so in your notes.
Not loaded `better-tasks:testing` yet? Load it now, before you capture: it says how to run and capture the app (your own environment, off-screen or not).

## Capture
- BEFORE first: before you change anything, capture the bug or the missing feature. Forgot? Capture it from the last commit before yours (`git worktree add <scratchpad>/before <commit>`).
- Capture with what the project has: Playwright for web (a screenshot per step, or recordVideo); the mobile MCP for iOS/Android (mobile_start_screen_recording / mobile_stop_screen_recording, or screenshots); else `screencapture -x shot.png` or `screencapture -v -V <seconds> clip.mov` on macOS. A screenshot per step is often clearest.
- Capture at the size "Settings" above names, or more (a Playwright viewport of that size; a device or Retina screen already is).
- AFTER: the same steps on your change.

## Make it
- Spec: a JSON file (format at the top of `${CLAUDE_PLUGIN_ROOT}/bin/demo_video.py`), its "name" the task id ("T-004.mp4"): a BEFORE clip and an AFTER clip, 1–4 steps each. Per step one short, plain sentence (shown and read aloud), a red box around what matters and an arrow pointing at it, in the pixels of the image or video.
- Run `${CLAUDE_PLUGIN_ROOT}/bin/demo-video.sh spec.json --quality <the quality "Settings" names>`. Inputs stay in your scratchpad; the video goes to the project's `.claude/tasks_videos/` (git ignores it), with its poster beside it (<task id>.png: an AFTER frame with a big play button, for a PR). The script prints the poster's file:// link, then the video's.
- Check a frame or two (`ffmpeg -ss <second> -i video.mp4 -frames:v 1 frame.png`): the boxes and arrows land on target.
- Online copy, when gh can't upload it (the `better-tasks:pull-request` skill says when): `${CLAUDE_PLUGIN_ROOT}/bin/video-branch.sh <video> <poster>` commits both to the branch better-tasks-videos (its own history, never merged: videos stay out of main and out of the task's branch), pushes it and prints their web links (video first), then the caption that fits them.

## Report it
- Your task file gets, as the first line under "## Notes", the line `Video: [T-004.mp4](../tasks_videos/T-004.mp4)` (the path relative to the task file). A newer video replaces the file, not the line. Can't edit the task file (it's outside your worktree)? Put the line first in your task_note.
- Its file:// link (the one the script printed) goes in your "For the user" block: the `better-tasks:done` skill.
