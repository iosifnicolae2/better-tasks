---
id: T-041
title: Show each teammate's effort level and status (idle, working…) in its title
sprint: 2026-10-05
urgent: false
status: done
owner: team-pane
rolled: 0
order: -1
created: 2026-10-05
---
## Goal
User's words: "also, if possible in teammates title display also the effort level of the model, and also the status (idle, working, and so on)".

Where teammates are shown with a title (the better-tasks pane / board's teammate rows: hooks/pane.tsx, hooks/board.tsx, hooks/team.ts, and the teammate's name/title shown in Claude Code if better-tasks controls it), add:
- the model's effort level (low / medium / high, from the teammate type: teammate-easy / normal / hard, see hooks/models.ts);
- its status: idle, working, waiting, done, and so on, from what better-tasks already tracks (team_status shows "working").

Keep it short and readable, e.g. "login · medium · working". If a place can't show it (Claude Code's own agent title isn't ours to change), say so in the notes and do it where we can.
Done: visible in the real pane, with a before/after picture or video; tests pass; `bun scripts/skills-check.ts` passes.

This repo is better-tasks upstream itself, so no fork is needed.

## Notes
- 2026-10-05: Video: [T-041.mp4](../tasks_videos/T-041.mp4)
PR: https://github.com/iosifnicolae2/better-tasks/pull/23
Done in commit ef759c8 (branch task/T-041).
- Task row: the owner reads "shop · medium · working" (effort in grey, state in colour). Before, it was only "shop". Until the teammate is spawned, it is still just the name.
- Selected task's line: "shop · medium · working · editing cart.ts · 63% · cache …". The ⎿ no longer gets squeezed out when the line is long.
- team_status and the lead's team lines (mateLine): "login · medium · working · context …".
- Effort comes from the agent type (better-tasks:teammate-easy/normal/hard) plus the effort settings (team.ts effortOf). Other agent types show no effort.
- The state is one word, shared by the pane and team_status (team.ts stateOf): working, idle, waiting (for the user's answer), done, stopped, failed.
- Can't change: Claude Code's own teammate title and agent list. That is not ours to change from a plugin.
- Checks: claude plugin test passes (291 tests, including the new tests/team.test.ts), tsc reports no errors, skills-check passes. The README screenshots were redrawn.
- Not verified: the pane was checked through the screenshot harness (the real pane mounted on a demo project), not in a live session with a running teammate.

### For the user
Links:
[PR #23](https://github.com/iosifnicolae2/better-tasks/pull/23)
Question:
T-041 Show each teammate's effort level and status
What changed: in the board, a task's teammate now reads like "shop · medium · working". The same goes for the line under a selected task and for the team status.
To test: open the board while a teammate works on a task, and look at its row. Then select that task.
https://github.com/iosifnicolae2/better-tasks/pull/23
Is everything OK?
- 2026-10-05: Board rows, selected-task line and team_status show teammate effort and state, e.g. "shop · medium · working".
