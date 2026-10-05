---
name: video
user-invocable: false
description: How a better-tasks teammate makes the before/after video of its task at the finish, from the captures it took (spec, demo-video.sh, poster, the Video line). Load it at the finish, after the user accepts, when your prompt says before/after videos are on.
---

# Before/after video
Made at the finish (the `better-tasks:done` skill), from the BEFORE and AFTER captures your prompt said to take. No BEFORE? Capture it from the commit before yours, as your prompt says.

## Make it
- Spec: a JSON file (format at the top of `${CLAUDE_PLUGIN_ROOT}/bin/demo_video.py`), "name" the task id ("T-004.mp4"): a BEFORE clip and an AFTER clip, 1–4 steps each. Per step: one short, plain sentence (shown and read aloud), a red box around what matters and an arrow at it, in the image's pixels.
- Poster: the first thing people see, in the PR, about 880 px wide. In each clip, the step where the change shows clearest, best the same spot in both: give it `"poster": true` and a `"focus": [x, y, w, h]` around that spot, a third to half of the frame wide. Left out: the last step with a box.
- Run `${CLAUDE_PLUGIN_ROOT}/bin/demo-video.sh spec.json --quality <the quality "Settings" names>`. The video goes to the project's `.claude/tasks_videos/` (git ignores it), with its poster beside it (<task id>.png: BEFORE and AFTER side by side with a big play button, for a PR). It prints the poster's file:// link, then the video's.
- Check one frame (`ffmpeg -ss <second> -i video.mp4 -frames:v 1 frame.png`) and the poster: boxes and arrows on target, text readable at half size.

## Report it
- First line under "## Notes" in the task file (task_note when it's outside your worktree): `Video: [T-004.mp4](../tasks_videos/T-004.mp4)`. A newer video replaces the file, not the line.
- With a PR, the video goes in it (the `better-tasks:pull-request` skill). gh can't upload it: `${CLAUDE_PLUGIN_ROOT}/bin/video-branch.sh <video> <poster>` commits both to the branch better-tasks-videos (never merged), pushes it and prints their web links (video first), then the caption.
