<!-- The video skill: how a teammate makes the before/after video of its task. -->
# Before/after video
The video shows the user the fix or feature working: it is your functional test. Make it from the BEFORE and AFTER captures, at {{ videoSize }} or more. No BEFORE? Capture it from the commit before yours (`git worktree add <scratchpad>/before <commit>`). Nothing on screen (docs, rules)? Render the old and the new text as images, BEFORE and AFTER.

- A spec (format at the top of `{{ pluginRoot }}/bin/demo_video.py`), named for the task ("T-004.mp4"): a BEFORE clip and an AFTER clip, 1–4 steps each; per step one short sentence (read aloud), a red box and an arrow at what matters. Mark the clearest step of each clip `"poster": true` with a `"focus"` box.
- `{{ pluginRoot }}/bin/demo-video.sh spec.json --quality {{ videoQuality }}`: the video lands in the project's `.claude/tasks_videos/` with its poster beside it.
- Look at a frame and the poster: boxes on target, text readable.
- First line under "## Notes" in the task file: `Video: [T-004.mp4](../tasks_videos/T-004.mp4)`.
