---
id: T-092
title: Limit the team size (default 5 teammates); group similar tasks onto one teammate
sprint: 2026-10-05
urgent: true
status: doing
owner: batch-testing
rolled: 0
order: -3
created: 2026-10-07
---
## Goal
User's words: "also implement a limit of the number of teammates, by default maximum 5 teammates and encourage the agent shortly in the instructions to group similar tasks and process them by the same teammate, (allow one teammate to process one or more tasks)".

Waits on T-091 (#51): it uses the same files (hooks/settings.ts, lead.md), so the same teammate takes this one after T-091 closes.

1. A setting `maxTeammates` (number, default 5), in the usual settings places: plugin.json userConfig or project config, the settings skill, the settings page and the docs. Enforce it where better-tasks sees spawns (team_status, the spawn hook or tools): at the limit, a new spawn is refused or warned, with the reason, and the lead is told to reuse an owner or wait.
2. Lead rules, short and principles only: group similar or related tasks and give them to the same teammate, one after another. A teammate may own one or more tasks. Spawn a new teammate only when no fitting owner is free and the team is under the limit. Replace "A few teammates at once, not many" with the limit.
3. Make sure the task tools, team_status and the board handle one teammate owning several tasks (owner shown on each; the teammate's current task first).
4. Tests: the default limit, enforcement at the limit, the rule text, and one owner with several tasks.

This is the user's own repo: commit to main, with a review-only draft PR and a video. No release until the user approves. Run the tests with `sh scripts/test.sh`.

## Notes
Video: [T-092.mp4](../tasks_videos/T-092.mp4)
- 2026-10-07: Queued for batch-testing after T-091 (#51): same files (settings.ts, lead.md). Start once T-091 is closed.
- 2026-10-07: BEFORE (live, tmux socket t092, `claude --plugin-dir` on a `git archive HEAD` copy, scratch project scratchpad/t092/shop): six fixes asked, the lead spawned 4 teammates (cart took T-001..T-003 by dependsOn; checkout, login, footer), nothing caps the count; lead.md says only "A few teammates at once, not many" and "a busy owner: spawn login-2". The board shows the owner and its state on each of cart's three rows (fine). Captures: scratchpad/t092/cap/before-spawns.ansi, before-board.ansi.
- 2026-10-07: Commit ef16427. Setting `maxTeammates` (number, default 5, 0 = no limit): /config "Team size (teammates)", settings page "Team size" (General), config.json, settings skill. Enforced in the Agent hook (register.tsx, team.ts overLimit): teammates alive (running or idle) at the limit and a new name → the spawn is denied, naming each teammate and its open tasks, and telling the lead to queue with an owner of similar work or wait; a respawn under a live name or a stopped teammate's place passes. lead.md Routing: group similar tasks onto one teammate, a teammate may own several, spawn only for a new area or a worn-out owner and only under the limit; "A few teammates at once" and "a busy owner: spawn" are gone. team_status lists a teammate's doing task first. The board already shows owner and state on each of a teammate's rows (no change; its order is the user's own). `sh scripts/test.sh` 350 pass (new: refusal at the limit and a freed place, team_status order, rule text and default, pane row); tsc clean; settings-doc current.
- 2026-10-07: AFTER (live, tmux, `claude --plugin-dir` on this checkout, scratch shop with `"maxTeammates": 2`): the same six fixes → the lead grouped them on two teammates (cart T-001..T-004, site T-005, T-006) and said "the team limit is two"; asked to spawn a third (docs), the spawn was refused with the reason and the lead offered to give it to idle site. Settings page "◆ Team size 2 teammates". (Auto mode's own classifier once blocked the site spawn; unrelated, retried.) Captures: scratchpad/t092/cap/after-*. Video 47 s, spec scratchpad/t092/spec.json.
- 2026-10-07: PR: https://github.com/iosifnicolae2/better-tasks/pull/52 (draft, review only). task_pr attached the video as github.com/user-attachments links, which give 404 signed out; replaced them with the public videos-branch links from video-branch.sh (jsDelivr, 200 signed out). Not checked: a real spawn refused at the default 5 (tested at 2; the same code path).

### For the user
PR: https://github.com/iosifnicolae2/better-tasks/pull/52
T-092 (#52) Limit the team size (default 5 teammates); group similar tasks onto one teammate
New setting "Team size", 5 by default. At the limit a new teammate isn't started: the lead gives the task to a teammate already doing similar work, who takes it after its current one, or waits. The lead's rules now say to group similar tasks onto one teammate.
