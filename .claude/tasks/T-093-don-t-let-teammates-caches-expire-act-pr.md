---
id: T-093
title: "Don't let teammates' caches expire: act promptly, or send a short keep-warm note"
sprint: 2026-10-05
urgent: true
status: todo
owner: batch-testing
rolled: 0
order: -4
created: 2026-10-07
---
## Goal
User's words: "also, instruct the agents to not waste time as the teammate cache will expire, if that's not possible, send a short notification to keep the cache warm, keep the instructions short".

A teammate's prompt cache expires after a while idle (team_status shows "cache warm Nm"). Add one or two short lines, principles only:
- Lead: answer, route or unblock an idle teammate promptly, before its cache expires. If it must wait (e.g. on the user), send it a one-line note shortly before expiry to keep the cache warm, and don't do that for a teammate that is done (stop it instead).
- Teammate, only if it fits: don't sit idle mid-task; report promptly.
If the status check or team_status can cheaply flag a teammate whose cache is about to expire, add that. Update the rules tests.

Waits on T-091 (#51) and T-092: same files (lead.md, teammate.md). The same teammate, batch-testing, takes it after T-092. User's repo: commit to main, with a review-only draft PR (no video if text-only). No release until the user approves. Tests: `sh scripts/test.sh`.

## Notes
- 2026-10-07: Queued for batch-testing after T-092: same files (lead.md, teammate.md).
- 2026-10-07: BEFORE: no line on caches or idling in lead.md, teammate.md or status-check.md; team_status shows "cache warm Nm" with no flag. Capture: scratchpad/t093/before.txt.
- 2026-10-07: Commit 0528da9: lead.md Routing line (act promptly on an idle teammate; a one-line note before its cache runs out when it must wait; stop it once its task is closed), teammate.md line (don't sit idle mid-task, report promptly), status-check.md clause, team_status/context line "cache warm 9m · expires soon" for an idle or waiting teammate with 10 min or less (team.ts expiresSoon; inside one status check's gap). Tests 351 pass.
- 2026-10-07: Live check 1 (scratchpad/t093/after1.txt): the lead read "one that is finished is stopped" as "done reporting" and stopped a teammate still waiting on approval: a bug my wording made. Reworded: "One waiting on the user, for an approval say, gets a one-line note shortly before, to keep it warm; one whose task is closed is stopped instead." Live check 2 (after2.txt): the lead keeps the waiting teammate and plans the note before expiry, stops it only once the task is closed. Not checked live: the "expires soon" flag (needs ~45 idle minutes on the 1-hour cache; covered by the team_status test). No video: text-only change.
- 2026-10-07: PR: https://github.com/iosifnicolae2/better-tasks/pull/53 (draft, review only, no video).

### For the user
PR: https://github.com/iosifnicolae2/better-tasks/pull/53
T-093 (#53) Don't let teammates' caches expire: act promptly, or send a short keep-warm note
The lead now answers idle teammates promptly; one waiting on you for approval gets a short note before its cache runs out, and it's stopped only once its task is closed. Teammates don't sit idle mid-task, and the team list marks a cache that expires soon.
