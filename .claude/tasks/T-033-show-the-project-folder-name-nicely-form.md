---
id: T-033
title: Show the project folder name, nicely formatted, at the top right
sprint: 2026-10-05
urgent: false
status: done
owner: folder-title
rolled: 0
order: -1
created: 2026-10-05
---
## Goal
User's words: "on the right side, at top, make sure to display the folder name nicely formatted".
Most likely the better-tasks screen (the board / pane the plugin shows): its top-right corner should show the project folder name, formatted for humans (e.g. "better-tasks" → "Better Tasks": split on - and _, capitalize words). Find which top-right area the user sees in better-tasks and put it there; if it's unclear which screen, check the plugin's UI surfaces and pick the one with a top-right header.
Done: the folder name shows at the top right, readable, on the real screen; a before/after video.

## Notes
Video: [T-033.mp4](../tasks_videos/T-033.mp4)
- 2026-10-05: Done on branch task/T-033, commit 7509b68.
  - Where: the better-tasks pane docked on the right. Its top row (with ✕) is Claude Code's own frame, so the name takes the first line under it, right-aligned, bold, orange. Board and settings page both.
  - Format: split on - _ . and spaces, capitalize lowercase words; words with capitals stay ("my-shop_app" → "My Shop App", "iOS-app" → "iOS App"). From the session's root folder (`$.session.root()`).
  - Board list gets one row less, so the box and key line stay at the bottom.
  - Files: hooks/board.tsx (projectTitle, ProjectHeader), hooks/pane.tsx, tests/pane.test.ts.
  - How to test: `claude plugin test .` (288 pass), tsc clean. Live: `claude --plugin-dir <repo>` in a folder, `/better-tasks`, then `c`.
  - Checked live: tmux, Claude Code 2.1.289, scratch folder my-shop_app; screens rendered from tmux capture (scratchpad t033/).
  - Not verified: the user's own terminal (iTerm) and a worktree session (there the root is the worktree folder, e.g. "Agent A4f…").
PR: https://github.com/iosifnicolae2/better-tasks/pull/16
- 2026-10-05: Project folder name, formatted for people ("my-shop_app" → "My Shop App"), shows bold at the top right of the better-tasks pane, on board and settings.
