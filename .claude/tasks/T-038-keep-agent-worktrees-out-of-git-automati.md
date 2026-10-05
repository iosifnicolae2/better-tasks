---
id: T-038
title: Keep agent worktrees out of git automatically
sprint: 2026-10-05
urgent: false
status: done
owner: project-setup
rolled: 0
order: 0
created: 2026-10-05
---
## Goal
User's words: "also add worktrees also automatically to worktrees" (read as: add the worktrees folder automatically to .gitignore). Teammates' git worktrees live in .claude/worktrees/ and show up as untracked in `git status` of the project (seen in this repo).
So: when better-tasks runs in a project (setup / startup, next to the other per-project setup like excludeWorktreesFromIde), make sure `.claude/worktrees/` is in the project's .gitignore, added once, without duplicates, and committed like the other setup changes. Fix this repo too.
Done: in a fresh project, after better-tasks starts, `git status` no longer shows .claude/worktrees/.

## Notes
- 2026-10-05: User (their words): "so on first better-tasks run, make sure to also add the worktrees to gitignore and also intellij idea ignore..". So: on the first better-tasks run in a project, do both automatically: add .claude/worktrees/ to .gitignore AND exclude it in IntelliJ IDEA (the existing excludeWorktreesFromIde feature), without asking a question for either.
- 2026-10-05: project-setup done. No video (git/settings change). PR: https://github.com/iosifnicolae2/better-tasks/pull/20. Changed: at interactive startup (startQuestions → ignoreWorktrees in hooks/register.tsx, helpers in hooks/ignoreworktrees.ts), if `git check-ignore -n -v .claude/worktrees/` says not ignored, .claude/worktrees/ is appended to .gitignore once and committed alone (`--only -- .gitignore`). If .gitignore had the user's own uncommitted edits: written, not committed, with a log line. Skipped inside a worktree and outside git. IntelliJ: keepWorktreesFromIde now runs whatever the git flow (still the excludeWorktreesFromIde setting, default on, not asked). This repo's .gitignore has the line. Setting doc updated. Test: claude plugin test . (288 pass; new tests for add+commit+IntelliJ and already-ignored). Commits a8cbb39, e5e93ca on task/T-038 (from origin/main ebfa96f). Not verified: a live run in a fresh project (tests use a fake git; I checked the real check-ignore output by hand). The main checkout still lists .claude/worktrees/ until this PR is merged.
- 2026-10-05: First better-tasks run adds .claude/worktrees/ to .gitignore (own commit) and excludes it in IntelliJ, without a question.
