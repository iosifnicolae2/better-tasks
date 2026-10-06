---
id: T-079
title: Reference tasks with their PR number, like "T-078 (#43)"
sprint: 2026-10-05
urgent: true
status: doing
owner: lead-rules-3
rolled: 0
order: -2
created: 2026-10-06
---
## Goal
User's words: "when referencing a task which has a pr add in parentheses also the pr number like (#XX)".

Change the rules so that whenever the lead (and teammates, in what the user reads) mentions a task that has a PR, the PR number follows in parentheses: "T-078 (#43)". That covers chat text, approval questions, status checks and done reports. Tasks without a PR stay as "T-078". Say it once, in the lead rules (and in the teammate/done rules if they write user-facing text); keep it short and lean. If the board, status lines or the "For the user" block print task ids where the PR is known, show "(#NN)" there too, if that's cheap and in your area. Update the tests that check the rules text.

This is the user's own repo (iosifnicolae2/better-tasks): work in it directly, committing to main, with a review-only draft PR and a video. No release until the user approves. Small bugs in your own area: fix them in this task. Bigger or other-area ones: report them to the lead.

## Notes
Video: [T-079.mp4](../tasks_videos/T-079.mp4)
- 2026-10-06: Lead rule (top bullets of lead.md): a task with a PR is named "T-078 (#43)" everywhere the user reads it; without one, "T-078". done.md's "For the user" block: `<id> (#<PR number>) <title>`. Status check and approval questions are covered by the lead rule, so not repeated there.
- 2026-10-06: Cheap display part: `taskRef` in hooks/tasks.ts (prIn moved there from board.tsx); task_list, team_status, the board row and its details show "(#NN)" when the task has a "PR:" note. The search row keeps the bare id (narrow column).
- 2026-10-06: Small fix on the way: board.tsx had filledCells' doc comment stranded above prIn; it sits on filledCells again.
- 2026-10-06: Commits 65c0d2f (rules, tests, docs/instructions.md), df3b89f (task_list, team_status, board). `claude plugin test .`: 324 pass. Checked as a user: task_list on this repo's tasks prints "T-078 (#43)", and the README board render with a PR note on T-007 shows "T-007 (#43)" in the row and details (before/after captures in the video). Not checked: a live lead session following the rule.
- PR: https://github.com/iosifnicolae2/better-tasks/pull/44

### For the user
PR: https://github.com/iosifnicolae2/better-tasks/pull/44
T-079 (#44) Reference tasks with their PR number, like "T-078 (#43)"
Tasks with a PR are now named with its number, "T-078 (#43)", in what the lead writes to you, in the teammates' notes, in the task list and on the board.
