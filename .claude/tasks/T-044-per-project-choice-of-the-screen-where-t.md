---
id: T-044
title: Per-project choice of the screen where tests run (virtual display by default)
sprint: 2026-10-05
urgent: false
status: done
owner: test-display
rolled: 0
order: 0
created: 2026-10-05
---
## Goal
User's words: "for each project, allow the user to choose a screen where the tests will run, by default use a virtual display but allow choosing a display for each project".

- New per-project setting: which screen teammates test and record on. Default: the project's own virtual display (T-034's work). Choices: the virtual display, or one of the real displays connected to this computer (list them by name, e.g. "Built-in Retina", "DELL U2720Q").
- Saved per project, changeable in /better-tasks config (the settings page). Not asked at setup: the default just works.
- The testing and video flows use the chosen screen. If a chosen display is not connected, fall back to the virtual display and tell the user in one short line.
- Update skills/settings (settings-doc), the testing skill if it names the screen, and the tests.
- Flow: quick checks and a local build first, then report done (the user tries it with claude --plugin-dir on the worktree).

This repo is better-tasks upstream itself, so no fork is needed.

## Notes
- 2026-10-05: Video: [T-044.mp4](../tasks_videos/T-044.mp4)
PR: https://github.com/iosifnicolae2/better-tasks/pull/26

2026-10-05 test-display: done, commit cb6340c (branch task/T-044).
What changed:
- New project setting testScreen (config.json only): "virtual" (default) or a real screen's name.
- Settings page: "Test screen" row after "Test off-screen"; Enter cycles virtual display, then each connected screen by name; a saved screen that is unplugged shows "· not connected".
- bin/record-display.sh: `screens` (lists real screens via the Swift helper's new `screens` mode), `--screen <name>` / BT_TEST_SCREEN override; run/start use the chosen screen, else the virtual display with one stderr line "the test screen "X" is not connected...". A real screen's turn lock is shared across projects (state/screen-<sum>.turn).
- Testing skill names the screen (Settings line) and tells teammates to pass the not-connected line to the lead. Settings skill regenerated; README settings.svg regenerated; CONTRIBUTING check line.
- Small wiring outside my area (lead OK'd): hooks/pane.tsx (connectedScreens, cached 30 s, $ calls must stay in pane.tsx), hooks/register.tsx (testingSkillSettings gets testScreen).
Checks: claude plugin test . 299 pass; record-display-check.sh ok (now also checks real-screen choice and fallback); skills-check and settings-doc --check ok. Tried by hand on this Mac: `screens` lists LG ULTRAFINE, Built-in Retina Display, PHL 278E1; `run --screen "PHL 278E1"` gives its id; a missing name falls back with the line.
Not verified: the row inside a live Claude Code session (seen through the pane test renderer with fake screens); nothing was recorded on a real screen (only env values printed, the user's screens untouched).

### For the user
Links:
[PR #26](https://github.com/iosifnicolae2/better-tasks/pull/26)
Question:
T-044 Choose the screen where tests run, per project
What changed: the settings page has a new "Test screen" row. By default teammates test Mac apps on the project's own virtual display; you can pick one of your connected screens instead, saved for this project. If that screen is unplugged, they use the virtual display and tell you.
To test: start a session with claude --plugin-dir /Users/iosif/Documents/Projects/better-tasks/.claude/worktrees/agent-af1016279d424741d, run /better-tasks config, go to "Test screen" and press Enter to step through your screens.
https://github.com/iosifnicolae2/better-tasks/pull/26
Is everything OK?
- 2026-10-06: Per-project test screen: the project's virtual display by default, or a connected screen chosen in settings; falls back with one line if unplugged. Full tests 299 pass.
