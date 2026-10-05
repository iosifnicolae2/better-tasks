---
id: T-037
title: Short, simple setup questions (IntelliJ, video, the rest)
sprint: 2026-10-05
urgent: false
status: done
owner: intellij
rolled: 0
order: -4
created: 2026-10-05
---
## Goal
The user wants the IntelliJ question (in hooks/intellij.ts, tested in tests/intellij.test.ts) replaced. Current text:

"Teammates each keep a full copy of this project in .claude/worktrees/. IntelliJ indexes every copy, which slows it down.
Yes: better-tasks marks that folder as Excluded in this project's IntelliJ settings (.idea), so IntelliJ skips it. Nothing else changes. To undo it, right-click the folder in IntelliJ: Mark Directory as > Cancel Exclusion.
Should IntelliJ skip .claude/worktrees/?"

User's words: replace it "with something like: We recommend ignoring worktrees from intellij to speed it up".

Done: the question is short, along those lines; tests updated and passing. This repo is better-tasks upstream itself, so no fork / linked install needed.

## Notes
- 2026-10-05: Scope widened by the user to every question better-tasks asks the user (startup/setup questions), not only IntelliJ. User's words: "also, just ask if you want to record, don't explain all the things with the chrome browser and so on.. make sure that the questions are short, simple to understand and don't raise suspicion."
- Video question (hooks/demovideo.ts QUESTION, and wherever it mentions Chrome/browser details): just ask whether to record before/after videos; drop the technical explanation.
- Go through the other user-facing questions in hooks/ too: short, plain, nothing that sounds alarming. Update their tests.
- 2026-10-05 (intellij): Done. Every setup question is one short line: IntelliJ, videos, off-screen, team, task files (hooks/intellij.ts, demovideo.ts, testenv.ts, teaminstall.ts, projectsetup.ts; tests updated). Git flow question left as is (a choice between options). Answers and behavior unchanged. `claude plugin test .` 288 pass, tsc clean. Commits 19ea989, 2cd231e. No video: text-only change. Not checked live in a fresh project.
- PR: https://github.com/iosifnicolae2/better-tasks/pull/19

### For the user
Links:
[PR #19](https://github.com/iosifnicolae2/better-tasks/pull/19)
Question:
T-037 Shorter setup questions
What changed: each setup question is now one short line. IntelliJ: "We recommend IntelliJ skip teammate worktrees (.claude/worktrees/) to speed it up. Skip them?" Videos: "Record a short before/after video for each finished task?" Same for off-screen, team and task files.
To test: read the new wording in the PR.
https://github.com/iosifnicolae2/better-tasks/pull/19
Is everything OK?
- 2026-10-05: Request changes (user's words): "the off-screen shouldn't be asked.. , for intellij, should we add worktrees to intellij ignore list? for team.. ask like Should we setup better-task in this project for other team memebrs? for task files.. and remove the task files question, by default it will be yes (basically you don't do anything about it..-- cleanup the feature..)"
- Off-screen: stop asking; use the default (on, test in the background).
- IntelliJ wording: "Should we add worktrees to the IntelliJ ignore list?"
- Team wording: "Should we set up better-tasks in this project for other team members?"
- Task files question: remove it and clean up the whole feature. By default the task files stay in git, with no code to manage it.
Push to the same PR (#19).
- 2026-10-05: (intellij) Requested changes done, pushed to PR #19 (commit 11a8185). Off-screen: no longer asked, on by default (settings default, settings page, settings skill). Task files question and feature removed (tasksInGit, .gitignore code, its tests and docs); task files just stay in git. IntelliJ: "Should we add worktrees to the IntelliJ ignore list?" Team: "Should we set up better-tasks in this project for other team members?" Projects that saved offScreen false keep it. claude plugin test . 285 pass, tsc clean. No video: text and defaults only. Not checked live in a fresh project.

### For the user
Links:
[PR #19](https://github.com/iosifnicolae2/better-tasks/pull/19)
Question:
T-037 Shorter, fewer setup questions
What changed: the off-screen and task files questions are gone (off-screen is on, task files stay in git). IntelliJ now asks "Should we add worktrees to the IntelliJ ignore list?" and team asks "Should we set up better-tasks in this project for other team members?"
To test: open a new project with better-tasks and read the questions.
https://github.com/iosifnicolae2/better-tasks/pull/19
Is everything OK?
- 2026-10-05: Request changes (user's words): "don't ask intellij question, do it by default". Remove the IntelliJ question; exclude .claude/worktrees/ in IntelliJ automatically (when the project has .idea). Push to PR #19.
- 2026-10-05: (intellij) IntelliJ question removed, pushed to PR #19 (commit 853149b). With worktrees on and a .idea folder, .claude/worktrees/ is excluded automatically at session start and right after the git flow is chosen. Setting excludeWorktreesFromIde now defaults to true (false opts out); settings skill updated. claude plugin test . 284 pass, tsc clean. No video. Not checked live in IntelliJ.

### For the user
Links:
[PR #19](https://github.com/iosifnicolae2/better-tasks/pull/19)
Question:
T-037 Shorter, fewer setup questions
What changed: no more IntelliJ, off-screen or task files questions. IntelliJ now skips teammate worktrees on its own; off-screen is on; task files stay in git. The team question reads "Should we set up better-tasks in this project for other team members?"
To test: open a new IntelliJ project with better-tasks, pick a worktree flow, and see .claude/worktrees shown as excluded.
https://github.com/iosifnicolae2/better-tasks/pull/19
Is everything OK?
- 2026-10-05: Setup asks fewer, shorter questions: off-screen, task files and IntelliJ questions removed (IntelliJ skips worktrees by default, off-screen on, task files in git); video and team questions are one plain line.
