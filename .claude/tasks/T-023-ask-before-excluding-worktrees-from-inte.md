---
id: T-023
title: Ask before excluding worktrees from IntelliJ (at setup, when worktrees are on and IntelliJ is used)
sprint: 2026-10-05
urgent: false
status: done
owner: worktrees-2
rolled: 0
order: -5
created: 2026-10-05
---
## Goal
User's words: "make sure that on setup after the user is choicing to use worktrees to check if intellij is used and if yes, ask the user if it's ok to ignore them from intellij to not cause problems"

Builds on T-018 (done, 20a670a): today hooks/intellij.ts silently marks .claude/worktrees as Excluded in .idea at every session start.

Goal: during setup, right after the user turns on worktrees (worktree per teammate), check whether the project uses IntelliJ (a JetBrains .idea folder). If yes, the lead asks the user once whether it's OK to exclude the worktrees folder from IntelliJ, saying why in plain words (otherwise IntelliJ re-indexes every teammate copy). Save the answer as a project setting; the session-start exclusion runs only when the user said yes. No .idea or worktrees off: no question.

Coordination: the other session's "better-tasks-plugin" (T-024) is changing the first-start setup questions (startQuestions in register.tsx) and folds "worktree per teammate" into a git-workflow choice. Fit this question into that flow; agree with it through the lead.

Done: the question appears at the right moment, the answer is saved and respected; explain how the user can check it.

## Notes
Video: [T-023.mp4](../tasks_videos/T-023.mp4)
- 2026-10-05: Coordination with T-024 (better-tasks-plugin, landing on main in about an hour): settings.ts gets gitFlow/devBranch/instructions and `pullRequests` leaves Settings; configpage "Worktree per teammate" + "PR per task" rows become one "Git flow" row; register.tsx startQuestions: the PR question becomes the git-flow question (saved in config.json). Build the IntelliJ question on its startQuestions after it lands; trigger is "worktree flow chosen" = gitflow.ts usesWorktree(flow, worktree), not the old worktree/pullRequests switches. Until then, only hooks/intellij.ts + its tests.
- 2026-10-05 (worktrees-2): Part 1 done, 8fcde70 in worktree agent-aca935e6bd82ad1c3 (not pushed): hooks/intellij.ts has the question (IDE_QUESTION, IDE_YES "Exclude it (recommended)", IDE_NO "Leave IntelliJ as it is"), the project setting name `excludeWorktreesFromIde` (config.json; unset = not asked) and `shouldAskIde(usesWorktree, ideaFiles, answer)`; tests in tests/intellij.test.ts (223 pass, tsc clean).
- 2026-10-05 (worktrees-2): Waiting for T-024 on main. Parked draft for the shared files (old switches, to redo on T-024's gitflow): scratchpad/T-023-shared-draft.patch. Plan: settings.ts gets the boolean|undefined field; session.start excludes only when it is true; startQuestions asks right after the git-flow question when usesWorktree(flow, worktree), and when worktrees get turned on in settings later; the answer saved in config.json with T-024's writer.
- 2026-10-05: User: "and also make sure that the setup is run on each project.." So the setup questions (this IntelliJ question, and the other first-start questions) are asked once per project, not once per user: answers are saved in that project's .claude/tasks/config.json, and a project with no saved answer gets asked at its first session start, even if another project already answered. Check how startQuestions decides "already asked" today and make it per project. The same applies to T-022's offScreen question; T-024's git-flow question is already per project (config.json).
- 2026-10-05 (worktrees-2): Per project, checked. The IntelliJ question is already per project: it asks while `excludeWorktreesFromIde` is missing from that project's .claude/tasks/config.json, so every project gets asked once. Today the others are not: the videos question (`demoVideosAsked`) and the PR question (`pullRequestsAsked`) mark "asked" in $.store, which is one JSON file for the user under the Claude Code config dir. So once you answer in one project, other projects never ask (see askToTurnOn in register.tsx). Fix: keep "asked" in config.json (a key is set = asked), the same way T-024's git-flow question does. This lives in startQuestions, which T-024 is rewriting, so it is for T-024 to do (or for me once T-024 lands, if the lead says so).
- 2026-10-05: Per-project setup: asked better-tasks-plugin (T-024) to make every startQuestions "asked" check per project while it rewrites startQuestions (demoVideosAsked/pullRequestsAsked in $.store are user-wide today). If it declines, worktrees-2 does it after T-024 lands.
- 2026-10-05: T-024 took the per-project check: askToTurnOn($, { field, question, header }) asks only when `field` is missing from the project's .claude/tasks/config.json; saves true (Enable) / false (Not now); a dismissed question is asked again next session; $.store flags removed; git flow = `gitFlow` in config.json. The IntelliJ question (and T-022's off-screen one) should each be one askToTurnOn line keyed on its own field. T-024 lands in about 30 minutes.
- 2026-10-05 (worktrees-2): Got it. Plan after T-024 lands: the IntelliJ question becomes one askToTurnOn line (field `excludeWorktreesFromIde`, header "IntelliJ", asked when usesWorktree and .idea exists), using its Enable/Not now answers (IDE_YES/IDE_NO go if they don't fit); session start excludes only when the field is true. Waiting for the lead's go.
- 2026-10-05: The other session's git-flow work is on main (6f03f8f..a51da80). Integration points, for T-021/T-022/T-023/T-024:
- settings.ts: gitFlow, devBranch, instructions; `pullRequests` gone from Settings. PROJECT_KEYS = keys the config page writes to config.json; saveProjectValue(files, key, value).
- register.tsx startQuestions: videos question, then askGitFlow, both per project. askToTurnOn($, { field, question, header }) checks `field` in config.json and saves true/false there. IntelliJ question: usesWorktree(settings.gitFlow, settings.worktree) from hooks/gitflow.ts, then one askToTurnOn line. offScreen: one askToTurnOn line.
- configpage.tsx: "Git flow" row where "Worktree per teammate" was; "PR per task" gone; "Project instructions" above "All Claude Code settings".
- pullrequest.ts: PR_SETTING_KEY, PR_ASKED_KEY, PR_QUESTION gone. dev-prs lead rules reuse PR_COORDINATOR_RULES's line starting "- A finished task": keep that line's start (T-021).
- demovideo.ts: only ASKED_KEY removed.
Tests: 244 pass.
- 2026-10-05 (worktrees-2): Done, rebased on a51da80 (T-024). Commits: 930d5e6 (question text, setting name), 537978c (wiring, tests, README).
  - What changed: at startup, after the videos and git-flow questions, an IntelliJ project (has .idea/) whose teammates use worktrees (usesWorktree(gitFlow, worktree)) gets one askToTurnOn question, header "IntelliJ": why (IntelliJ re-indexes every teammate copy) and where to change it. The answer is saved as `excludeWorktreesFromIde` (true/false) in that project's .claude/tasks/config.json, so each project is asked once. Session start marks .claude/worktrees Excluded only when it is true (was: always, silently). Also asked when the git flow or the old worktree switch is turned on in settings; a yes there excludes right away.
  - Existing projects where T-018 already wrote the exclude: the line stays in .idea (nothing removes it); they are asked once like any other.
  - How to check: open a project with a .idea folder whose config.json has "gitFlow": "worktree-prs" and no excludeWorktreesFromIde; start Claude Code: the IntelliJ question shows. Enable: config.json gets "excludeWorktreesFromIde": true, and the log says "IntelliJ now skips .claude/worktrees/"; .idea/<name>.iml has the excludeFolder line. Not now: false is saved, .idea is untouched, not asked again. Straight-to-main flow or no .idea: no question.
  - Checked live: a scratch project with Claude Code 2.1.289 and --plugin-dir (the video): question shown, Enable wrote the setting and the module file. Before (a51da80): the module file written silently.
  - Tests: 247 pass, tsc clean.
  - Not verified: the settings-page path (choosing the git flow on /better-tasks config, then the question) only in code, not live.
  - PR: https://github.com/iosifnicolae2/better-tasks/pull/7 (branch task/T-023)
- 2026-10-05: User (before testing): "make sure that the intellij question is clear and the user understand what will be done, simple". Rewrite the IntelliJ question in plain short words: what happens (IntelliJ will skip the .claude/worktrees folder, where teammates keep their copies of the project), why (otherwise IntelliJ re-indexes each copy and slows down), and what changes for the user (nothing else; can be undone in IntelliJ). Answer labels must say what they do, e.g. "Yes, skip that folder" / "No, leave IntelliJ as is", not "Enable / Not now". Rebase on main (f792b8a), push to PR #7, and show me the final question text.
- 2026-10-05 (worktrees-2): Question rewritten in plain words (6c16742, rebased on f792b8a, pushed to PR #7; video remade). askToTurnOn takes optional `answers: [yes, no]` labels; the IntelliJ question uses "Yes, skip that folder" / "No, leave IntelliJ as is". Checked live in a scratch project: renders as three short paragraphs. Tests: 253 pass, tsc clean. Final text:
  Teammates each keep a full copy of this project in .claude/worktrees/. IntelliJ indexes every copy, which slows it down.
  Yes: better-tasks marks that folder as Excluded in this project's IntelliJ settings (.idea), so IntelliJ skips it. Nothing else changes. To undo it, right-click the folder in IntelliJ: Mark Directory as > Cancel Exclusion.
  Should IntelliJ skip .claude/worktrees/?
- 2026-10-05: User: Mark as resolved. PR #7 now conflicts with main (T-022 merged as 44a834a: one askToTurnOn call line in startQuestions + testing rules in register.tsx). worktrees-2: update the branch from main, keep both, tests, push; lead then merges.
- 2026-10-05 (worktrees-2): PR #7 updated from main (T-022, 44a834a): merge 97acebe, conflicts in register.tsx startQuestions and core.test.tsx imports, kept both (IntelliJ question right after the git flow, then T-022's off-screen question). 258 tests pass, tsc clean; PR mergeable.
- 2026-10-05: IntelliJ exclusion of .claude/worktrees now asked once per project in plain words ("Yes, skip that folder" / "No, leave IntelliJ as is"); session start excludes only after a yes.
