---
id: T-105
title: DockPin keeps the main screen when a virtual display comes or goes
sprint: 2026-10-05
urgent: false
status: done
owner: dockpin
rolled: 0
order: -3
created: 2026-10-08
labels: [dockpin, virtual-display]
---
## Goal
Found during T-104 and approved by the user as a new task. The work is in the DockPin project at /Users/iosif/Documents/Projects/DockPin (its own repo, with its own git flow and rules), not in better-tasks.

Bug: while DockPin.app runs (~/Applications/DockPin.app, from DockPin's T-014/T-018 work), adding or removing a virtual display makes the Mac's main screen switch from the LG UltraFine to the built-in screen about 1 s later, and back on removal. DockPin seems to pick the "center"/main display again whenever the set of screens changes. Expected: a virtual display coming or going never changes the main screen or moves the real screens.

To see it again (the user approved no more virtual displays on this Mac until T-104 settles how to make them safely, so reproduce it with care or in code/tests): the T-104 teammate saw it with better-tasks' bin/record-display.sh while a CGMainDisplayID probe ran (main 4 = LG before, main 1 = built-in after, LG moved to (-249,-1080)). Probe: /private/tmp/claude-501/-Users-iosif-Documents-Projects-better-tasks/a9e2d92c-d882-4ae5-b6c4-becf507c4ecc/scratchpad/t104/probe.

## Notes
Video: [T-105.mp4](../tasks_videos/T-105.mp4)
- 2026-10-08 Cause: DockPin counts virtual displays. One beside the laptop gives the laptop the most neighbours, so it becomes "center" and DockPin makes it main (1 s debounce); the new display set also has no saved plan, so the pinned layout is taken as the real one. BEFORE (unit test on old code): scratchpad/t105/before.txt (Built-in picked instead of LG).
- 2026-10-08 Fix in DockPin worktree .claude/worktrees/T-105, branch task/T-105, commit 547a8a3: Displays.current() keeps only displays IOKit reports (HardwareScreen.isReal, same check as record_display.swift; unreadable hardware keeps all). 42 tests pass; on this Mac all 3 real screens still count.
- 2026-10-08 Asked lead: OK to quit the user's DockPin.app and add one virtual display for a live check? Waiting.
- 2026-10-08: The user approved one live check now, while they watch their screens. Quit ~/Applications/DockPin.app, run the fixed build, add one virtual display through record-display.sh, then remove it and restore the user's DockPin.app. Keep it short.
- 2026-10-08 Live check (user approved): quit user's DockPin, ran the fixed build, added one virtual display (id 54, below the laptop), removed it. Main stayed 5 (Odyssey) and the real screens did not move at every step; user's ~/Applications/DockPin.app restarted, no virtual display left. Log: scratchpad/t105/live.txt. Caveat: in today's arrangement (Odyssey center) the old code may tie and not switch either, so the before stays the unit test plus T-104's sighting.
- 2026-10-08 PR: https://github.com/iosifnicolae2/DockPin/pull/3 (draft, DockPin branch task/T-105). Build to try, not opened: DockPin/.claude/worktrees/T-105/build/DockPin.app (quit DockPin first, then open it; quitting it restores, then reopen ~/Applications/DockPin.app).
- 2026-10-08 Done. Changed: DockPin only counts displays the graphics hardware reports (Sources/DockPinCore/HardwareScreen.swift, Sources/DockPin/Displays.swift, tests). Commit 547a8a3 on DockPin task/T-105. Not checked: the exact T-104 setup (LG main, laptop below) live, and Sidecar/AirPlay screens, which may now be ignored.

### For the user
PR: https://github.com/iosifnicolae2/DockPin/pull/3
T-105 (#3) DockPin keeps the main screen when a virtual display comes or goes
DockPin now ignores virtual displays, so adding or removing one no longer changes the main screen or moves your monitors.
- 2026-10-08 Finished: full tests (42) and audit.sh pass; PR #3 squash-merged into DockPin main (61c1a52); fixed build installed and running as ~/Applications/DockPin.app (main screen unchanged); T-105 worktree and branches removed.
- 2026-10-08: DockPin now ignores virtual displays (displays without hardware) and never moves them. PR #3 is squash-merged into DockPin main as 61c1a52, and the fixed build is installed at ~/Applications/DockPin.app. Sidecar and AirPlay screens may now be ignored; untested.
