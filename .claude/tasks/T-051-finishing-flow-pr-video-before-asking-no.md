---
id: T-051
title: "Finishing flow: PR + video before asking, no local-build step, no browser open at merge"
sprint: 2026-10-05
urgent: false
status: done
owner: finish-flow-2
rolled: 0
order: -2
created: 2026-10-06
---
## Goal
The user's feedback from the church-hub project, relayed by its lead session at the user's request. It partly reverses T-042.
1. Opening the PR at merge: the rule "right before merging, run bin/open-pr.sh <url>" is useless. The user asked: "why you open in the browser after i've already approved it?" Drop it. Open the PR in the browser when asking the user (as before T-042), never after approval.
2. Local build first: drop it. User: "don't tell me to install the build.. always follow better-tasks and create a pr with a video, if i want to install the build i will tell you and you will open it directly for me". So the teammate opens the PR with the before/after video BEFORE the user is asked. The question carries the PR (and the video path above it, per T-039). A local build only when the user asks, and then the lead opens or installs it directly for them.
   - Keep the fast part: the teammate may run quick checks first, but the PR + video come before the question. On "Mark as resolved" the lead merges and closes (full tests may still run before the merge if they're slow, but no extra round with the user).
3. Video on every PR, including docs, rules and tooling PRs ("where is the video?"). When nothing changes on screen, show the change itself: e.g. the diff or the new text rendered, with BEFORE/AFTER labels.
4. church-hub had to keep its own rules file (.claude/rules/better-tasks.md) and memories for this. After this ships, those custom instructions aren't needed. Mention in the notes that the user can delete them.
Files: hooks/texts.ts (lead finishing rules), hooks/pullrequest.ts, hooks/coordinator.ts, hooks/status.ts, skills/done, skills/pull-request, skills/video, skills/testing, scripts/skills-check.ts, tests.
Done: tests, skills-check and settings-doc pass; PR with a video (per point 3).

## Notes
- 2026-10-06: church-hub has already removed its custom versions of these rules (its T-106 reverts them, and its memory note is gone). better-tasks T-051 is now the only source for this behavior, so the sooner it ships the better.
- 2026-10-06: Video: [T-051.mp4](../tasks_videos/T-051.mp4)
PR: https://github.com/iosifnicolae2/better-tasks/pull/32

2026-10-06 finish-flow-2: done. Partly reverses T-042.
What changed:
- Lead Finishing (hooks/texts.ts): the user is asked once the work is ready to merge: quick checks, the PR and the video come first. No local build unless the user asks; then the lead opens or installs it for them. The question carries the video path and PR above it and the PR url inside it (as before T-042). "Mark as resolved" closes at once, no new round; a slow suite: notes say "Full tests: running", the lead waits for "T-004 full tests pass" before closing/merging. "accepted: finish it" and "T-004 finished" are gone.
- PR rules (pullrequest.ts, gitflow.ts dev flow): open-pr.sh runs right before the question, "Never open it again after the user's answer". "Mark as resolved" merges. PR_DONE_LINE: the PR opens at done, before the user is asked, with its video.
- Reminders reverted: unclosedLine (coordinator.ts), status check (status.ts), close refusal (tools.ts).
- Video for every task (demovideo.ts videoPointer, video skill): nothing on screen? the old and new text (or diff) rendered, labeled BEFORE and AFTER.
- Skills: done (checks, video and PR, then the block with Video + PR links; no "Finish" step), pull-request and video (at done), testing ("A local build, only when the user asks").
- Setting text: openPrInBrowser in configpage.tsx and settingsdocs.ts (skills/settings regenerated). These neighbor files (gitflow, tools, configpage, settingsdocs, demovideo) were changed by T-042 in this same area; their tasks (T-040, T-046, T-047) are done.
Checks: claude plugin test . = 320 pass; bun scripts/skills-check.ts and bun scripts/settings-doc.ts --check pass.
Commits: 0de03e8, a4cdfab (branch task/T-051).
Not verified: a live run with a real teammate on the new rules (this session runs the installed release).
Church-hub: once this is released, its own .claude/rules/better-tasks.md and the memories about this flow are no longer needed; the user can delete them.

### For the user
Links:
Video: [/Users/iosif/Documents/Projects/better-tasks/.claude/tasks_videos/T-051.mp4](file:///Users/iosif/Documents/Projects/better-tasks/.claude/tasks_videos/T-051.mp4)
PR: [#32](https://github.com/iosifnicolae2/better-tasks/pull/32)
Question:
T-051 Finishing flow: PR and video before asking
What changed: when a task is done, the teammate opens the PR with its video first, then you are asked. No more "install the local build" step; ask for a build and the lead opens it for you. The PR opens in the browser when you are asked, never after you approve. Every PR gets a video, rule and docs changes too (they show the old and new text).
After the next release, church-hub's own better-tasks rules file and memories about this can be deleted.
https://github.com/iosifnicolae2/better-tasks/pull/32
Is everything OK?
- 2026-10-06: Request changes (user's words): "no, also have a local dev build, you just open it when the user ask".
So the teammate also prepares a local dev build at done: built and ready, but not installed or opened. The For the user block notes in one line where it is and how to open it (a command or path for the lead, e.g. "Local build: claude --plugin-dir <worktree>" or the app path or dev-server command). The question doesn't tell the user to install it. When the user asks for the build, the lead opens it for them right away. Keep the rest: PR and video before asking, no browser open after approval, a video on every PR. Push to the same PR (#32).
- 2026-10-06: 2026-10-06 finish-flow-2: requested change done (commit 397d345, pushed to PR #32, new video attached).
- At done the teammate also leaves a local build ready, not installed, opened or left running (testing skill: "A local build, ready at done": web = the dev-server command and URL; iOS/Android = the built app and its install command; plugin = claude --plugin-dir <worktree>).
- The block gets one "Local build (opened when you ask): <command or path>" line under Links, for the lead. The question never asks the user to install it.
- Lead Finishing (texts.ts): the user asks for the build, the lead opens or installs it right away from that line.
- Unchanged: PR and video before asking, no browser open after approval, a video on every PR.
Checks: claude plugin test . = 320 pass; skills-check and settings-doc --check pass.

### For the user
Links:
Video: [/Users/iosif/Documents/Projects/better-tasks/.claude/tasks_videos/T-051.mp4](file:///Users/iosif/Documents/Projects/better-tasks/.claude/tasks_videos/T-051.mp4)
PR: [#32](https://github.com/iosifnicolae2/better-tasks/pull/32)
Local build (opened when you ask): claude --plugin-dir /Users/iosif/Documents/Projects/better-tasks/.claude/worktrees/agent-a63f7a84b499d7fa0
Question:
T-051 Finishing flow: PR and video before asking
What changed: when a task is done, the teammate opens the PR with its video first, then you are asked. A local build is also ready, but nothing is installed or opened unless you ask; then the lead opens it for you. The PR opens in the browser when you are asked, never after you approve. Every PR gets a video, rule and docs changes too.
After the next release, church-hub's own better-tasks rules file and memories about this can be deleted.
https://github.com/iosifnicolae2/better-tasks/pull/32
Is everything OK?
- 2026-10-06: Finishing flow: PR + video (every PR, text changes as BEFORE/AFTER) before asking; a local build ready but opened only on request; PR opens when asking, never after approval. 320 tests pass.
