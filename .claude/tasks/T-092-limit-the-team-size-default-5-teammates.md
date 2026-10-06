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
- 2026-10-07: Queued for batch-testing after T-091 (#51): same files (settings.ts, lead.md). Start once T-091 is closed.
- 2026-10-07: BEFORE (live, tmux socket t092, `claude --plugin-dir` on a `git archive HEAD` copy, scratch project scratchpad/t092/shop): six fixes asked, the lead spawned 4 teammates (cart took T-001..T-003 by dependsOn; checkout, login, footer), nothing caps the count; lead.md says only "A few teammates at once, not many" and "a busy owner: spawn login-2". The board shows the owner and its state on each of cart's three rows (fine). Captures: scratchpad/t092/cap/before-spawns.ansi, before-board.ansi.
