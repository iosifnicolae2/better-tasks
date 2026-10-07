---
id: T-099
title: "Rules from the session report: efficient tooling, event-driven waiting, teammates only when they pay"
sprint: 2026-10-05
urgent: false
status: done
owner: worktree-sandbox
rolled: 0
order: -5
created: 2026-10-07
---
## Goal
User's words, from the T-095 report: "i would add the following rules:
1. setup your environment to be efficient, instead of writing 10k inline python multiple times you can create a cli or your own modules/functions and use them as part of your tooling (only if needed).
2. wait for an event not a clock, run long jobs in the background and act on their notice, set proper timeouts, batch independent calls in one message,
3. it costs 50k tokens to start a teammate, so make sure to use them only when it pays the cost and route the tasks to common teammates;
make sure that the instructions are short, generic, easy to understand, high level guidelines".

Add them as short principle lines, per CLAUDE.md:
- Rules 1 and 2: teammate rules (and the lead's, where they apply to it). Merge with the existing "Keep the loop fast" line rather than repeating it.
- Rule 3: lead routing. It goes with T-092's "group similar tasks onto one teammate" line; merge, don't duplicate.
Update the rules tests. Data behind them: the doc "Session bottlenecks" (https://claude.ai/code/artifact/49b367b3-177a-4e90-bb21-392aeb1d2ec1) and .claude/tasks/T-095/tables.md.

Waits on T-096: same files (teammate.md, lead.md), so worktree-sandbox takes it after T-096. User's repo: commit to main, with a review-only draft PR (text-only, no video). No release until the user approves. Tests: `sh scripts/test.sh`.

## Notes
- 2026-10-07: Queued for worktree-sandbox after T-096: same files (teammate.md, lead.md).
- 2026-10-07: BEFORE: teammate.md had only "Keep the loop fast: incremental builds and the narrowest check first, the full suite at the finish. Delete captures…"; no rule on own tooling, background jobs, timeouts or batching. lead.md Routing: "Give an area's work to its owner… Spawn one… only for a new area or a worn-out owner", with no cost named; nothing on waiting. Copies: scratchpad/t099/before-*.txt.
- 2026-10-07: Changed (rule text only). teammate.md: the "Keep the loop fast" line gains "Doing something more than once? Make it a small script or CLI of your own and reuse it."; a new line "Wait for an event, not a clock: run long jobs in the background and act on their notice, give each command a fitting timeout, and send independent calls together in one message." lead.md: a top line "Wait for an event, not a clock: a teammate's message or a background job's notice wakes you. Send independent calls together in one message."; the Routing line merged with T-092's: "A new teammate costs about 50k tokens to start, so route work to the ones you have: … Spawn one … only when that pays: a new area, or a worn-out owner". (~50k matches T-095: 5.7M start-up cache writes over 140 subagents ≈ 41k, plus the first turn.) Rule 1 left out of the lead's rules: it never does the work. New rules test; `sh scripts/test.sh` 358 pass; skills-check ok. No video: text only.
- 2026-10-07: PR: https://github.com/iosifnicolae2/better-tasks/pull/57 (draft, review only; commit 315612f). Not checked: how a live lead or teammate follows the new lines (text only). No release yet.

### For the user
PR: https://github.com/iosifnicolae2/better-tasks/pull/57
T-099 (#57) Rules from the session report
Three short rules added. Teammates make their own small tools instead of repeating long scripts, and wait for a job's notice instead of a timer. The lead does the same, and reuses the teammates it has, starting a new one only when it's worth about 50k tokens.
- 2026-10-07: Accepted. Full tests: `sh scripts/test.sh` 358 pass, tsc clean, skills-check ok, settings-doc current. Review PR #57 closed. Not released yet.
- 2026-10-07: Teammate rules: make your own small script or CLI for repeated work; wait for an event, not a clock (background jobs, fitting timeouts, independent calls in one message). Lead rules: the same waiting line; routing opens with the ~50k start-up cost and spawns only when it pays. 358 tests pass; review PR #57 closed. Not released yet.
