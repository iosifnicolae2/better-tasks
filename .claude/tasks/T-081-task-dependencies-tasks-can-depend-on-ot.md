---
id: T-081
title: "Task dependencies: tasks can depend on others, and the lead plans and starts work by them"
sprint: 2026-10-05
urgent: true
status: doing
owner: dependencies
rolled: 0
order: -2
created: 2026-10-06
---
## Goal
User's words: "extend the tasks to also have dependency and the coordinator should take them into consideration when starting the work and it should coordinate the implementation wisely.. add also in the instructions to evaluate the dependencies when creating the tasks.."

1. Data: a task can list the tasks it depends on (e.g. a `dependsOn` front-matter field with task ids). task_create and task_update accept it. task_list, team_status, the open-tasks context and the board show it briefly (e.g. "waits on T-071 (#39)"). A task whose dependencies aren't all done is "blocked" for starting purposes. Reject cycles and unknown ids.
2. Lead rules: when creating a task, evaluate its dependencies on open tasks (same files or area, needs another's result, must ship after) and set them. When starting work, start only tasks whose dependencies are done; run independent tasks in parallel, chain dependent ones, and avoid two teammates on the same files. When a dependency closes, start what it unblocked. The status check considers this too. Keep the rules short and lean, matching their style.
3. Releases and approvals keep working as today. Update the settings/docs only where they describe tasks; say it once and link elsewhere.
4. Tests for the field, cycle checks, the blocked state and the rules text.

This is the user's own repo (iosifnicolae2/better-tasks): work in it directly, committing to main, with a review-only draft PR and a video. No release until the user approves. Small bugs in your own area: fix them in this task. Bigger or other-area ones: report them to the lead.

## Notes
Video: [T-081.mp4](../tasks_videos/T-081.mp4)
- 2026-10-06: BEFORE (live, tmux, Claude Code 2.1.291, `claude --plugin-dir` on a `git archive HEAD` copy, scratch project shop/ with T-001 doing, T-002 todo): "Add a task for the backlog … only once T-001 is done" → task_create puts "Depends on T-001" in the goal text; the lead says "That's only a written note: the board doesn't block the task on its own." task_list shows no dependency; the board's T-003 says "not started" with s: Start. Captures in the scratchpad (t081/cap/before-*.ansi).
- 2026-10-06: Field `dependsOn: [T-001, T-002]` (written only when set). task_create and task_update take it (canonical ids, [] clears) and refuse unknown ids, the task itself and cycles ("T-001 → T-002 → T-001"). Blocked = a dependency still todo/doing; done, cancelled or deleted ones don't hold it. Shown as "waits on T-001 (#39)" in task_list, team_status, the open tasks in the lead's context, and on the board (row "⧗ T-001", details line). The context's "route each now" line skips blocked tasks ("Blocked, not started: …"); closing a task returns "Unblocked: … Start each now" for its now/this-sprint dependents; the board's Start on a blocked task names what it waits on. Status-check fingerprint includes dependsOn.
- 2026-10-06: Rules: lead.md "Every message is filed" sets dependsOn when filing; Routing bullet: start only once dependencies are done, parallel / chained, never two teammates on the same files, start what a close unblocked. status-check.md: "start what is next whose dependencies are done". README task bullet, docs/instructions.md regenerated. Releases and approvals untouched.
- 2026-10-06: Small guard on the way: tasks kept in plugin state from before the field (a plugin update mid-session) read as no dependencies (`dependenciesOf`), so the board can't crash on them.
- 2026-10-06: Commit 1b6700f. `claude plugin test .` 336 pass; tsc clean; instructions-doc and templates current; yaml-check same 7 old files as before the change. AFTER (live, tmux, `claude --plugin-dir` on this checkout, same scratch project): the lead passed dependsOn: ["T-001"], the file got `dependsOn: [T-001]`, task_list "· waits on T-001", the board "⧗ T-001" and "not started · waits on T-001"; moved to currently working on, the lead didn't start it ("two teammates on the same price code"); closing T-001 returned "Unblocked: T-003 …" and the lead named T-003 to start next. Not checked: a real spawn after the unblock (told the lead not to spawn in the test).
- 2026-10-06: PR: https://github.com/iosifnicolae2/better-tasks/pull/46 . No draft release: nothing about releases changed.

### For the user
PR: https://github.com/iosifnicolae2/better-tasks/pull/46
T-081 (#46) Task dependencies: tasks can depend on others, and the lead plans and starts work by them
A task can now wait on other tasks. The lead sets this when it files a task, and starts the task only once those are done: independent tasks run side by side, dependent ones one after another. The task list and the board show "waits on T-001", and when a task closes, the lead starts what it was holding up.
- 2026-10-06: Changes requested. User: "allow also to group tasks by labels, and also allow adding a label as a dependency or multiple tasks as dependency".
- Labels: a task can have labels (e.g. a `labels` front-matter list), set with task_create and task_update. The task list and the board can group tasks by label.
- A dependency can be a label: the task waits until every open task with that label is done. A task can also wait on several tasks; keep or confirm that.
- The lead's rules: when filing a task, consider labels and label dependencies too (short, principles only, per CLAUDE.md).
- Tests for labels, grouping and label dependencies, including cycles through labels.
- 2026-10-06: Changes made. Labels: `labels: [checkout, api]` (stored lower case, dashed, only letters, digits and . _ / -; one that reads as a task id, like "t-7", is refused). task_create and task_update take labels (replaces the list; [] clears). dependsOn takes task ids or labels, several of each: a label waits on every other open task with it, including ones labelled later. Checks: unknown id or label ("No task or label …"), the task itself, and cycles through ids and labels, including by taking a label others wait on. "waits on T-001 (#39), label checkout (T-003, T-004)". Grouping: task_list group: label (each label A to Z, a task under each of its labels, "no label" last); the board's g key groups each section by first label ("# checkout" headings; a move then goes by that order); lines, context and board details show the labels; search matches them. Lead rule: "Give it labels (its feature or area) and dependsOn: the tasks, or labels, it must wait for". README task and board bullets; board.svg regenerated (key line).
- 2026-10-06: Commit 913a59e. `claude plugin test .` 345 pass; tsc clean. Live, same scratch setup: BEFORE (git archive copy) the lead said "The task tool can't link one task to another" and "None of the tasks has a label"; AFTER the lead set labels ["checkout"] on two tasks and dependsOn ["checkout"] on the release notes; task_list group label; board g showed # checkout / # release-notes / # no label, "⧗ T-003, T-004", "waits on label checkout (T-003, T-004)"; closing T-003 alone unblocked nothing, closing T-004 returned "Unblocked: T-005 …". New video.

### For the user
PR: https://github.com/iosifnicolae2/better-tasks/pull/46
T-081 (#46) Task dependencies: tasks can depend on others, and the lead plans and starts work by them
Tasks can now have labels, and wait on other tasks: on one or several tasks, or on every task with a label. The lead sets both when it files a task, and starts a task only once what it waits on is done. The task list and the board (key g) group tasks by label and show "waits on T-001".
