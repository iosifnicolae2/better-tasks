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
- 2026-10-06: Changes requested. User: "also everywhere where the user is reading, display the task number, for example in the question..". Everywhere the user reads, show the task id, with "(#NN)" when it has a PR. In AskUserQuestion: the question text and the header chip, e.g. header "T-079 (#44)", which fits in the 12-character limit. Also option descriptions when they name a task, release-related questions (each task they ship), status lines, release notes, PR titles and video titles. Check every user-facing template and rule for places that name a task without its id.
- 2026-10-06: Changes made. lead.md: the bullet now lists where (text, questions, headers and options, status lines, release notes); the approval question gets header "<id> (#<PR number>)" and text "<id> (#<PR number>): ...". status-check.md: each task by its id and PR number. done.md: any task the "For the user" block names, the ones a release ships too, the same way. Code: the open tasks the lead gets with each message, task_note, task_search, the sprint review and docs/tasks.md rows use taskRef. Commits 75d1052 (rules, tests, docs), 42e71d8 (code). `claude plugin test .`: 324 pass. New video; PR #44 updated.
- 2026-10-06: Left for the lead to route (release area, asked): release notes (scripts/release.sh commit subjects) and the release video's task cards (bin/release_video.py). PR titles stay "T-079 <title>": GitHub shows the number beside it, and a PR can't name its own number before it exists.

### For the user
PR: https://github.com/iosifnicolae2/better-tasks/pull/44
T-079 (#44) Reference tasks with their PR number, like "T-078 (#43)"
Wherever you read a task, it now carries its PR number, "T-078 (#43)": approval questions (header and text), status updates, teammates' notes, the task list and the board. Release notes and the release video still show bare ids; those are with the lead to route.
