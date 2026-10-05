---
id: T-042
title: "Fast feedback loop: user tests a local build first, full tests and finishing after acceptance"
sprint: 2026-10-05
urgent: false
status: done
owner: finish-flow
rolled: 0
order: -2
created: 2026-10-05
---
## Goal
User's words: "also, make sure to let the user test a local build and after it's accepted run the full tests and finish everything, the goal is to have the feedback loop as fast as possible".

Change the finishing flow (lead rules in hooks/texts.ts and related hooks; teammate skills: skills/done, skills/pull-request, skills/testing, skills/video; scripts/skills-check.ts):
- Teammate: once the change works, run only quick checks (the tests near the change), make a local build the user can try right away (installed/running on the user's machine or device, or the linked plugin for better-tasks itself), then report done with the "For the user" block saying how to try that build.
- Lead: asks the user to test the local build (one task at a time, as today).
- "Mark as resolved": the lead tells the teammate to finish everything: full test suite, PR (or commit) final, video if on. Then the lead merges, closes the task, and stops the teammate. Tests fail → the teammate fixes and the lead tells the user.
- "Request changes": the teammate changes it, rebuilds locally, and asks again. Full tests are still deferred.
- Goal: the user sees the change as fast as possible; slow steps (full tests, CI, video upload, PR polish) happen after acceptance.
- Keep the rules short and easy to follow (keywords over paragraphs, say each thing once). Update tests and skills-check phrases; `claude plugin test .` and `bun scripts/skills-check.ts` pass.

This repo is better-tasks upstream itself, so no fork is needed.

## Notes
- 2026-10-05: PR: https://github.com/iosifnicolae2/better-tasks/pull/24
Video: none (rule text only, nothing on screen).

2026-10-05 finish-flow: done.
What changed:
- Lead Finishing (hooks/texts.ts): the user tries a local build first. "Mark as resolved" -> lead tells the teammate "T-004 accepted: finish it" -> teammate runs full tests, makes the video, opens the PR or finalizes commits -> sends "T-004 finished" -> lead merges, closes, stops the teammate. Full tests fail: teammate fixes, lead tells the user. "Request changes": change, rebuild locally, ask again; full tests still wait.
- Teammate Done line (texts.ts), PR_DONE_LINE (pullrequest.ts): no PR at done; the PR opens at the finish.
- PR lead rules (pullrequest.ts, gitflow.ts dev flow): merge on "finished"; open-pr.sh now runs right before the merge. The "Open PRs in the browser" setting text matches (configpage.tsx, settingsdocs.ts, skills/settings regenerated).
- Reminders: unclosedLine (coordinator.ts), status check (status.ts), close refusal (tools.ts).
- Skills: done (quick checks + local build; new "5. Finish"), testing ("Local build for the user", per kind of app incl. the plugin: /reload-plugins or claude --plugin-dir), video (made at the finish), pull-request (opens at the finish).
- skills-check phrases and tests updated. claude plugin test . = 291 pass; skills-check and settings-doc --check pass.
Commits: 8c3ac53, 6e8d6ca.
Not verified: a live run of the new flow with a real teammate (the running session still uses v0.9.0 rules). claude --plugin-dir is from memory of the Claude Code docs, not checked here.

### For the user
Links:
[PR #24](https://github.com/iosifnicolae2/better-tasks/pull/24)
Question:
T-042 Fast feedback loop: local build first
What changed: when a teammate is done, you try its change on a local build right away. The full tests, the video and the PR only happen after you say it's OK; then the lead merges and closes the task.
To test: open a new terminal and run: claude --plugin-dir /Users/iosif/Documents/Projects/better-tasks/.claude/worktrees/agent-ac1c46c13eea41c97
Ask for a small change. When it's done, the question tells you how to try it, with no PR yet. Answer "Mark as resolved": the teammate runs the full tests and opens the PR, then the lead merges.
https://github.com/iosifnicolae2/better-tasks/pull/24
Is everything OK?
- 2026-10-05: Finishing flow: user tries a local build first; full tests, video and PR after acceptance, then the lead merges and closes.
