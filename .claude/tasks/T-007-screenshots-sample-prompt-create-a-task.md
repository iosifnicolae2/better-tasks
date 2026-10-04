---
id: T-007
title: Screenshots: sample prompt "create a task for next sprint to do X"
sprint: 2026-09-28
urgent: false
status: done
owner: board-scroll
rolled: 0
order: -1
created: 2026-10-03
---
## Goal
The README screenshots show a sample message in the prompt box like "create a task for next sprint to do X", so readers see how tasks are filed in plain words.

## Notes
- 2026-10-03 board-scroll: board.svg (the only README picture) types "create a task for next sprint to speed up the search" (52 of 77 cells); actions.svg keeps /better-tasks (its picture is about the board, and its conversation runs /better-tasks). TYPED in scripts/screenshots.mjs changed to match. `claude plugin test` (which the script runs) is blocked here: "hooks modules are turned off in this process: the rollout switch was saved off ... Start `claude` once with network access", so board.svg was edited the way the script writes it (text run + cursor rect at 58 + 52×8.4); regenerate with `node scripts/screenshots.mjs` once tests run again. Not pushed.
- 2026-10-03: README screenshot's prompt box shows "create a task for next sprint to speed up the search".
