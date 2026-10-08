---
id: T-103
title: No status-check wake-up when no task is running
sprint: 2026-10-05
urgent: false
status: done
owner: status-check
rolled: 0
order: -2
created: 2026-10-08
labels: [wakeups, status-check]
---
## Goal
User's words: "if there are no current running tasks, don't emit the event to wake up things..".

The periodic better-tasks status check (the "no activity for N min" prompt the plugin submits to the lead) must not fire when there is nothing running: no open task currently being worked on. When there is no running work, stay silent. Fire it again once there is.

Context: this came right after T-102 closed, when the board had no open tasks but a status check still woke the lead. This repo is better-tasks itself (the user maintains it): commit straight to main as usual, run `sh scripts/test.sh`, and follow CLAUDE.md.

## Notes
Video: [T-103.mp4](../tasks_videos/T-103.mp4)
- 2026-10-08 Cause: checkStatus (hooks/register.tsx) counted any open task this sprint (todo too) or any active teammate (idle ones too) as work, so a board with nothing running still woke the lead.
- 2026-10-08 Fix (c862b72): `isRunning(tasks)` in hooks/status.ts, true only when a task has status doing; checkStatus uses it. Teammates and todo tasks no longer count. Template comment, README and settings skill say so. Test in tests/status.test.ts; 378 tests pass.
- Checked with a probe of the real decision (before: fires with nothing running; after: silent with todo only, fires with a doing task). Not checked live in a session waiting 10 quiet minutes: the change ships with the next release.
- 2026-10-08: PR: https://github.com/iosifnicolae2/better-tasks/pull/62

### For the user
PR: https://github.com/iosifnicolae2/better-tasks/pull/62
T-103 (#62) No status-check wake-up when no task is running
The status check now wakes the lead only while a task is in progress. With nothing running it stays quiet, and it comes back once a task starts.
- 2026-10-08: The status check now wakes the lead only while a task has status doing (isRunning in hooks/status.ts). Queued tasks and idle teammates no longer set it off. Review PR #62 is closed; the commit is on main.
