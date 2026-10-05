---
id: T-020
title: Setting to choose the video recording quality, medium 1080p by default
sprint: 2026-10-05
urgent: false
status: done
owner: pr-videos
rolled: 0
order: -2
created: 2026-10-05
---
## Goal
User's words: "also, allow selecting recording video quality, make sure to use a medium 1080p kind of quality by default"

Goal: a project setting (on the better-tasks config page) to choose the quality of the before/after task videos. Default: 1080p at a medium quality (a sensible file size, not maximum bitrate). Offer a few clear choices (e.g. lower / medium 1080p / high) in plain words.

Done: recordings follow the setting; the default gives 1080p medium; explain what changed and how the user can check it (the setting on the config page, a video's resolution and size).

## Notes
Video: [T-020.mp4](../tasks_videos/T-020.mp4)
- 2026-10-05: Order agreed via the lead: T-020 before T-024 (better-tasks-plugin builds on it).
- 2026-10-05: What changed (commit d620b51 (rebased; was 7ad9128), branch task/T-020):
  - Setting `videoQuality` (low / medium / high, default medium): hooks/settings.ts, plugin.json userConfig, a "Video quality" row in the Team group of the settings page (shown: 720p small / 1080p medium / 1080p high).
  - Rules: teammateRules(root, quality) in hooks/demovideo.ts says `demo-video.sh spec.json --quality <q>` and "capture at 1920x1080 (or 1280x720) or more"; register.tsx passes settings.videoQuality (one line).
  - bin/demo_video.py: `--quality`; fits the video in 1280x720 or 1920x1080, up or down (portrait turned); x264 crf 28 / 23 / 18 (high also preset slow). Before: capped at 1280 wide, crf 20, never upscaled.
  - README settings screenshot (docs/screenshots/settings.svg) re-rendered with the row.
- Checked: tests 213 pass; this task's video made at all three: low 1280x694 533 KB, medium 1920x1042 748 KB, high 1920x1042 858 KB (23 s of static screenshots; screen recordings with motion differ more).
- How to check: `/better-tasks config` -> "Video quality: 1080p medium", Enter cycles it; make a video, `ffprobe -v error -show_entries stream=width,height:format=size -of compact <video>`.
- Not verified: the row in a live Claude Code session (checked via the pane tests and the screenshot render); no tsc typecheck run.
PR: https://github.com/iosifnicolae2/better-tasks/pull/3
- 2026-10-05: Overlap: the other session's "better-tasks-plugin" (T-024) will change hooks/settings.ts, hooks/configpage.tsx, hooks/register.tsx, hooks/pullrequest.ts, plugin.json userConfig. Its plan: /private/tmp/claude-501/-Users-iosif-Documents-Projects-best-remote-desktop/8873d79c-73ac-412a-929c-258757ce7261/scratchpad/T-024-plan.md. Agree the order with it before editing those files; keep the quality setting a small, separate addition.
- 2026-10-05: User: Mark as resolved. Lead merges PR #3 once pr-videos has rebased it on main (it conflicted after T-018 merged).
- 2026-10-05: Video quality setting (720p small / 1080p medium default / 1080p high) on the config page; demo_video.py encodes to match.
