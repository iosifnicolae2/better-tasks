---
id: T-002
title: Coordinator goal: finish tasks, monitor, fast builds and tests
sprint: 2026-09-28
urgent: false
status: done
owner: coordinator-rules
rolled: 0
order: -1
created: 2026-10-03
---
## Goal
The coordinator rules better-tasks injects state the coordinator's goal: get each task finished, monitor teammates and ask questions, and optimize builds and tests so that, by the end, the work goes very fast and efficiently.

## Notes
- 2026-10-03: Goal line added under the title of the shipped COORDINATOR text (hooks/texts.ts); Status checks "Act first" now also asks the owner of a slow build/test to speed it up. No test pins rule text, none added. validate ok, 167/167 tests pass; tsc OOMs (heap limit) on the baseline too, unrelated.
- 2026-10-03: User: "the build and tests is useful to unlock bottlenecks to finish the tasks.." — optimizing builds/tests is a means to clear the bottlenecks that keep tasks from finishing.
- 2026-10-03: Reworded per user: builds/tests are bottlenecks to clear so tasks finish, not a goal of their own. validate ok, 167/167 pass.
- 2026-10-03: Goal line reworded per lead: speed is not its own goal; slow/broken build or test = bottleneck, owner fixes it. validate ok, 167/167 pass.
- 2026-10-03: Coordinator rules now state the goal: finish every task fast; monitor, ask questions, clear blockers such as slow/broken builds and tests (also in Status checks).
- 2026-10-03: A late commit 02ce8aa (arrived after accept) made the final wording: "Your goal: get every task finished. Monitor the teammates and ask questions. A slow or broken build or test holding a task back is a bottleneck: get its owner to fix it or speed it up (incremental, cached, only what changed)." Commits: 9fadfff, 7ea68e6, 02ce8aa.
