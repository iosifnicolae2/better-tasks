---
id: T-038
title: Keep agent worktrees out of git automatically
sprint: 2026-10-05
urgent: true
status: todo
owner:
rolled: 0
order: 0
created: 2026-10-05
---
## Goal
User's words: "also add worktrees also automatically to worktrees" (read as: add the worktrees folder automatically to .gitignore). Teammates' git worktrees live in .claude/worktrees/ and show up as untracked in `git status` of the project (seen in this repo).
So: when better-tasks runs in a project (setup / startup, next to the other per-project setup like excludeWorktreesFromIde), make sure `.claude/worktrees/` is in the project's .gitignore, added once, without duplicates, and committed like the other setup changes. Fix this repo too.
Done: in a fresh project, after better-tasks starts, `git status` no longer shows .claude/worktrees/.

## Notes
