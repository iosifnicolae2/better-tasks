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
