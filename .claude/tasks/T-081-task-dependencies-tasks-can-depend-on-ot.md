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
- 2026-10-06: BEFORE (live, tmux, Claude Code 2.1.291, `claude --plugin-dir` on a `git archive HEAD` copy, scratch project shop/ with T-001 doing, T-002 todo): "Add a task for the backlog … only once T-001 is done" → task_create puts "Depends on T-001" in the goal text; the lead says "That's only a written note: the board doesn't block the task on its own." task_list shows no dependency; the board's T-003 says "not started" with s: Start. Captures in the scratchpad (t081/cap/before-*.ansi).
