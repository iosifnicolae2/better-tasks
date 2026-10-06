---
id: T-072
title: Release v0.11.12 (plugin directory validation fixes)
sprint: 2026-10-05
urgent: true
status: doing
owner: release-2
rolled: 0
order: -4
created: 2026-10-06
---
## Goal
The user approved this plan: release v0.11.12 once the portal shows 0 blocking issues (it does now: task/T-071 @ c1cd830 passes), then submit it to the plugin directory.

1. Push local main to origin. T-071's commits are on local main and unpushed (ca0f027, 3a82263, 5c8d16c, ac35f28, b409494, plus task-note commits). First check that local main has the same plugin content as task/T-071 @ c1cd830, the commit the portal validated. If it differs, stop and report. Task-board files may be committed as "Tasks: notes" before pushing. Leave .claude/tasks/config.json alone: it's the user's own uncommitted change. Last time release.sh refused to run because of it, so T-069 ran it from a temporary clean worktree on main and then refreshed .claude-plugin/marketplace.json in the shared checkout. Do the same here.
2. Run `scripts/release.sh v0.11.12` (see CLAUDE.md), with notes you write yourself (notes file as the second argument) covering T-071:
   - Passes the Anthropic plugin directory's checks.
   - New listing icon (.claude-plugin/icon.png).
   - README discloses what it sets, runs, submits and sends.
   - In /config, 10 settings with a list of choices are now text fields. The choices are in each description, an unknown value falls back to the default, and the board's settings page (c) still cycles through them.
   - Teammate agent types are registered in "default" permission mode. A lead in bypass, accept-edits or auto mode still passes its mode on; a lead in plan or dontAsk mode now gets teammates that ask.
   The release video is on by default; keep it.
3. Report the tag and the release URL. directory-2 (T-070) then points the portal draft at the tag and submits.

## Notes
- 2026-10-06: v0.11.12 published: https://github.com/iosifnicolae2/better-tasks/releases/tag/v0.11.12. Local main matched c1cd830's plugin content; pushed. Run from a temporary clean clone (config.json left untouched). No video: no task since v0.11.11 had one.
