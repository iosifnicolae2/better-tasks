---
id: T-083
title: Footer keeps the old "done" count after a task closes
sprint: 2026-10-05
urgent: false
status: done
owner: footer
rolled: 0
order: -3
created: 2026-10-06
---
## Goal
Bug found by "dependencies" during T-081 (#46); the user chose "New task".

What happens: after the lead closes a task (task_update status done), the footer status line (hooks/register.tsx, showStatus) keeps the old count until the next prompt. The board already shows "1/3" while the footer still says "Sprint 41 · 0/3 done". BEFORE screenshot: /private/tmp/claude-501/-Users-iosif-Documents-Projects-better-tasks/63e99a05-7e99-4146-b0a1-dd3ea0564d2f/scratchpad/t081/cap/after-5.png (bottom right).

Expected: the footer updates as soon as a task's status changes (done, cancelled, reopened, created), like the board.

This is a bug fix: work in your own worktree on a branch, with a PR into main and a before/after video. It merges after the user approves. T-081 (dependencies) is changing the task tools at the same time; keep your change to the footer refresh, and tell the lead about any conflict.

## Notes
Video: [T-083.mp4](../tasks_videos/T-083.mp4)
- 2026-10-06: BEFORE (live, tmux, Claude Code 2.1.291, `claude --plugin-dir` on a `git archive HEAD` copy, scratch project scratchpad/t083/shop, T-001 doing, T-002 todo): lead closes T-001 with task_update; footer stays "Sprint 41 · 0/2 done" after the reply. Cause: showStatus ran only on prompt.submit and the minute tick. Capture: scratchpad/t083/cap/before-1.ansi.
- 2026-10-06: Fix b543548 (branch t083-footer-refresh): a state.set hook on the tasks atom recounts the footer on every write. New test in tests/core.test.tsx fails without it; `claude plugin test .` 325 pass. AFTER (live, same setup, plugin-dir on this worktree): close T-001 → footer "1/2 done" at once; task_create T-003 → "1/3"; reopen T-001 → "0/3". Captures after-0..3.ansi.
- 2026-10-06: PR: https://github.com/iosifnicolae2/better-tasks/pull/47
- 2026-10-06: Not checked: a task closed by editing its file by hand or from the board (same tasks-state write, so it should follow; covered only by the code path). `tsc` can't run in the worktree (its .claude-plugin/types are missing), not from this change. No conflict with T-081: the change is one hook in register.tsx plus one test.

### For the user
PR: https://github.com/iosifnicolae2/better-tasks/pull/47
T-083 (#47) Footer keeps the old "done" count after a task closes
The footer's "done" count now changes the moment a task is closed, reopened or added, like the board, instead of waiting for your next message.
- 2026-10-06: Accepted. Full tests 325 pass; templates, skills-check, settings-doc current (instructions-doc stale only from the main checkout's uncommitted config.json, not this change). PR #47 squash-merged into main: 9b64dfa.
- 2026-10-06: The footer recounts on every write of the tasks state, so closing, reopening or creating a task shows at once. 325 tests pass. PR #47 squash-merged into main as 9b64dfa (on origin; local main has unpushed T-081 commits, so pull before the next push). The user skipped the related task_pr.py bug: an unchanged video keeps the old block, with no player.
